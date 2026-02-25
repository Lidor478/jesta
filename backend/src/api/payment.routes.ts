/**
 * @file payment.routes.ts
 * @description REST API for escrow funding, releases, refunds, and invoice access.
 *
 * Routes:
 *   POST   /v1/payments/fund                — Client funds escrow after offer accepted
 *   POST   /v1/payments/:txnId/release      — Client manually releases to Jester
 *   POST   /v1/payments/:txnId/refund       — Admin refunds to client
 *   POST   /v1/payments/:txnId/dispute      — Open escrow dispute
 *   POST   /v1/payments/:txnId/resolve      — Admin resolves dispute
 *   GET    /v1/payments/:txnId              — Transaction details + ledger
 *   GET    /v1/payments/mine                — Current user's transaction history
 *   GET    /v1/payments/:txnId/invoice      — Get invoice PDF URL
 *   GET    /v1/payments/admin/auto-release  — Trigger auto-release (admin + cron)
 *
 * @compliance Cash Law guard applied to /fund (blocks cash > 6,000 NIS)
 * @compliance All money actions require valid JWT + verified phone
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireIdVerification, requireAdmin, cashLawGuard } from '../middleware/auth.middleware';
import {
  fundEscrow,
  releaseToJester,
  refundToClient,
  openEscrowDispute,
  resolveDispute,
  runAutoRelease,
  getEscrowLedger,
  computeFees,
  EscrowError,
} from '../services/escrow.service';
import { PrismaClient, TransactionStatus } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// ─────────────────────────────────────────────
// Zod Validation Schemas
// ─────────────────────────────────────────────

const FundSchema = z.object({
  taskId: z.string().uuid('מזהה משימה לא תקין'),
  agreedPrice: z.number().positive('מחיר חייב להיות חיובי').max(50000, 'מחיר גבוה מהמותר'),
  paymentToken: z.string().min(8, 'טוקן תשלום לא תקין'),
  paymentMethod: z.enum(['CARD', 'BANK_TRANSFER', 'CASH']),
});

const DisputeSchema = z.object({
  reason: z.string().min(10, 'נא לפרט את הסיבה (לפחות 10 תווים)').max(500, 'הסבר ארוך מדי'),
});

const ResolveSchema = z.object({
  decision: z.enum(['RELEASE_TO_JESTER', 'REFUND_TO_CLIENT']),
  adminNote: z.string().min(5, 'נא להוסיף הערת מנהל').max(500),
});

const RefundSchema = z.object({
  reason: z.string().min(5, 'נא לציין סיבה').max(500),
});

// ─────────────────────────────────────────────
// Helper: format transaction for API response
// ─────────────────────────────────────────────

const STATUS_LABELS_HE: Record<TransactionStatus, string> = {
  PENDING: 'ממתין למימון',
  HELD: 'כספים מוחזקים',
  RELEASED: 'שולם לג׳סטר',
  REFUNDED: 'הוחזר ללקוח',
  DISPUTED: 'במחלוקת',
};

// ─────────────────────────────────────────────
// POST /v1/payments/fee-preview
// Public: preview fees before funding (no auth needed)
// ─────────────────────────────────────────────

router.post('/fee-preview', (req: Request, res: Response) => {
  try {
    const { agreedPrice, requiresVehicle } = req.body;

    if (!agreedPrice || typeof agreedPrice !== 'number' || agreedPrice <= 0) {
      return res.status(400).json({ error: 'מחיר לא תקין', messageHe: 'נא להזין מחיר חוקי' });
    }

    const fees = computeFees(agreedPrice, !!requiresVehicle);

    return res.json({
      ...fees,
      breakdown: {
        clientPays: `₪${fees.grossAmount.toLocaleString('he-IL')}`,
        jesterReceives: `₪${fees.netToJester.toLocaleString('he-IL')}`,
        jestaPlatformFee: `₪${fees.jestaRevenue.toLocaleString('he-IL')}`,
        vatNote: `כולל מע"מ ₪${fees.vatAmount} על עמלת הפלטפורמה`,
        cashLawWarning: fees.flaggedForCashLaw
          ? `⚠️ סכום מעל ₪6,000 — תשלום במזומן אסור על פי חוק`
          : null,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'SERVER_ERROR', messageHe: 'שגיאת שרת' });
  }
});

// ─────────────────────────────────────────────
// POST /v1/payments/fund
// Client funds escrow after accepting an offer
// ─────────────────────────────────────────────

router.post(
  '/fund',
  requireAuth,
  requireIdVerification,
  cashLawGuard,
  async (req: Request, res: Response) => {
    const parsed = FundSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        messageHe: 'נתונים לא תקינים',
        fields: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const result = await fundEscrow({
        taskId: parsed.data.taskId,
        clientId: req.user!.id,
        paymentToken: parsed.data.paymentToken,
        agreedPrice: parsed.data.agreedPrice,
      });

      return res.status(201).json({
        ...result,
        nextStep: 'TASK_IN_PROGRESS',
        message: 'Escrow funded successfully',
      });
    } catch (err) {
      return handleEscrowError(err, res);
    }
  },
);

// ─────────────────────────────────────────────
// POST /v1/payments/:txnId/release
// Client approves task completion → releases to Jester
// ─────────────────────────────────────────────

router.post('/:txnId/release', requireAuth, requireIdVerification, async (req: Request, res: Response) => {
  const { txnId } = req.params;

  try {
    // Verify the requester is the client on this transaction
    const txn = await prisma.transaction.findUnique({
      where: { id: txnId },
      select: { clientId: true, status: true },
    });

    if (!txn) return res.status(404).json({ error: 'TXN_NOT_FOUND', messageHe: 'עסקה לא נמצאה' });
    if (txn.clientId !== req.user!.id && req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'UNAUTHORIZED', messageHe: 'אין הרשאה לשחרר עסקה זו' });
    }

    const result = await releaseToJester(txnId, req.user!.id, false);

    return res.json({
      ...result,
      nextStep: 'RATE_JESTER',
      message: 'Funds released to Jester',
    });
  } catch (err) {
    return handleEscrowError(err, res);
  }
});

// ─────────────────────────────────────────────
// POST /v1/payments/:txnId/dispute
// Client or Jester opens a dispute — freezes escrow
// ─────────────────────────────────────────────

router.post('/:txnId/dispute', requireAuth, requireIdVerification, async (req: Request, res: Response) => {
  const { txnId } = req.params;

  const parsed = DisputeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      messageHe: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים',
    });
  }

  try {
    // Verify user is a party to this transaction
    const txn = await prisma.transaction.findUnique({
      where: { id: txnId },
      select: { clientId: true, jesterId: true },
    });

    if (!txn) return res.status(404).json({ error: 'TXN_NOT_FOUND', messageHe: 'עסקה לא נמצאה' });

    const isParty = txn.clientId === req.user!.id || txn.jesterId === req.user!.id;
    if (!isParty && req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'UNAUTHORIZED', messageHe: 'אין הרשאה לפתוח מחלוקת' });
    }

    const result = await openEscrowDispute(txnId, req.user!.id, parsed.data.reason);

    return res.json({ ...result, message: 'Dispute opened' });
  } catch (err) {
    return handleEscrowError(err, res);
  }
});

// ─────────────────────────────────────────────
// POST /v1/payments/:txnId/resolve  [ADMIN]
// Admin resolves a disputed transaction
// ─────────────────────────────────────────────

router.post('/:txnId/resolve', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const { txnId } = req.params;

  const parsed = ResolveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      messageHe: parsed.error.errors[0]?.message ?? 'נתונים לא תקינים',
    });
  }

  try {
    const result = await resolveDispute(
      txnId,
      req.user!.id,
      parsed.data.decision,
      parsed.data.adminNote,
    );

    return res.json({ ...result, message: 'Dispute resolved' });
  } catch (err) {
    return handleEscrowError(err, res);
  }
});

// ─────────────────────────────────────────────
// POST /v1/payments/:txnId/refund  [ADMIN]
// ─────────────────────────────────────────────

router.post('/:txnId/refund', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const { txnId } = req.params;

  const parsed = RefundSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', messageHe: 'נא לציין סיבה להחזר' });
  }

  try {
    const result = await refundToClient(txnId, req.user!.id, parsed.data.reason);
    return res.json({ ...result, message: 'Refund initiated' });
  } catch (err) {
    return handleEscrowError(err, res);
  }
});

// ─────────────────────────────────────────────
// GET /v1/payments/:txnId
// Transaction details with full escrow ledger
// ─────────────────────────────────────────────

router.get('/:txnId', requireAuth, async (req: Request, res: Response) => {
  const { txnId } = req.params;

  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: txnId },
      include: {
        task: {
          select: { id: true, title: true, category: true, status: true },
        },
        client: { select: { id: true, displayName: true, phone: true } },
        jester: { select: { id: true, displayName: true, phone: true } },
        invoice: true,
      },
    });

    if (!transaction) {
      return res.status(404).json({ error: 'TXN_NOT_FOUND', messageHe: 'עסקה לא נמצאה' });
    }

    // Only parties + admin can view
    const isParty =
      transaction.clientId === req.user!.id || transaction.jesterId === req.user!.id;
    if (!isParty && req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'UNAUTHORIZED', messageHe: 'אין הרשאה לצפות בעסקה זו' });
    }

    const ledger = await getEscrowLedger(txnId);

    // Build response — mask payment token
    const userView = req.user!.role === 'ADMIN'
      ? transaction
      : { ...transaction, paymentToken: `${(transaction.paymentToken ?? '').slice(0, 4)}***` };

    return res.json({
      transaction: {
        ...userView,
        statusHe: STATUS_LABELS_HE[transaction.status],
        fees: {
          agreedPrice: transaction.agreedPrice,
          clientCommission: transaction.clientCommission,
          jesterCommission: transaction.jesterCommission,
          insuranceMarkup: transaction.insuranceMarkup,
          grossAmount: transaction.grossAmount,
          netToJester: transaction.netToJester,
          jestaRevenue: transaction.jestaRevenue,
          vatAmount: transaction.vatAmount,
        },
      },
      ledger: ledger.map(entry => ({
        ...entry,
        // Format dates for Israeli locale
        createdAtHe: entry.createdAt.toLocaleDateString('he-IL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      })),
    });
  } catch (err) {
    console.error('[PAYMENTS] getTransaction error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', messageHe: 'שגיאת שרת' });
  }
});

// ─────────────────────────────────────────────
// GET /v1/payments/mine
// Current user's transaction history
// ─────────────────────────────────────────────

router.get('/mine', requireAuth, async (req: Request, res: Response) => {
  const { role = 'CLIENT', status, limit = '20', cursor } = req.query;

  const userId = req.user!.id;
  const take = Math.min(Number(limit), 50);

  try {
    const whereClause =
      role === 'JESTER'
        ? { jesterId: userId }
        : { clientId: userId };

    const transactions = await prisma.transaction.findMany({
      where: {
        ...whereClause,
        ...(status ? { status: status as TransactionStatus } : {}),
      },
      include: {
        task: { select: { id: true, title: true, category: true } },
        invoice: { select: { invoiceNumber: true, pdfUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor as string } } : {}),
    });

    const nextCursor = transactions.length === take ? transactions[transactions.length - 1].id : null;

    // Summary stats
    const stats = await prisma.transaction.aggregate({
      where: { ...whereClause, status: 'RELEASED' },
      _sum: { netToJester: true, grossAmount: true },
      _count: true,
    });

    return res.json({
      transactions: transactions.map(t => ({
        ...t,
        statusHe: STATUS_LABELS_HE[t.status],
      })),
      nextCursor,
      stats: {
        totalEarned: stats._sum?.netToJester ?? 0,
        totalSpent: stats._sum?.grossAmount ?? 0,
        completedCount: stats._count,
      },
    });
  } catch (err) {
    console.error('[PAYMENTS] getMyTransactions error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', messageHe: 'שגיאת שרת' });
  }
});

// ─────────────────────────────────────────────
// GET /v1/payments/:txnId/invoice
// Get invoice PDF URL (re-fetches from Morning if needed)
// ─────────────────────────────────────────────

router.get('/:txnId/invoice', requireAuth, async (req: Request, res: Response) => {
  const { txnId } = req.params;

  try {
    const invoice = await prisma.invoice.findUnique({
      where: { transactionId: txnId },
      include: { transaction: { select: { clientId: true, jesterId: true } } },
    });

    if (!invoice) {
      return res.status(404).json({
        error: 'INVOICE_NOT_FOUND',
        messageHe: 'החשבונית טרם נוצרה. נסה שוב לאחר השלמת העסקה.',
      });
    }

    // Access control
    const txn = invoice.transaction;
    const isParty = txn.clientId === req.user!.id || txn.jesterId === req.user!.id;
    if (!isParty && req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'UNAUTHORIZED', messageHe: 'אין הרשאה לצפות בחשבונית' });
    }

    return res.json({
      invoiceNumber: invoice.invoiceNumber,
      pdfUrl: invoice.pdfUrl,
      totalAmount: invoice.totalAmount,
      vatAmount: invoice.vatAmount,
      issuedAt: invoice.issuedAt,
      issuedAtHe: invoice.issuedAt?.toLocaleDateString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }),
      provider: invoice.provider,
    });
  } catch (err) {
    console.error('[PAYMENTS] getInvoice error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', messageHe: 'שגיאת שרת' });
  }
});

// ─────────────────────────────────────────────
// GET /v1/payments/admin/auto-release  [ADMIN]
// Trigger auto-release of stale held transactions (also called by Railway cron)
// ─────────────────────────────────────────────

router.post('/admin/auto-release', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await runAutoRelease();
    return res.json({
      message: `Auto-release complete`,
      messageHe: `שחרור אוטומטי הושלם`,
      ...result,
    });
  } catch (err) {
    console.error('[PAYMENTS] autoRelease error:', err);
    return res.status(500).json({ error: 'SERVER_ERROR', messageHe: 'שגיאת שרת' });
  }
});

// ─────────────────────────────────────────────
// Error handler helper
// ─────────────────────────────────────────────

function handleEscrowError(err: unknown, res: Response): Response {
  if (err instanceof EscrowError) {
    return res.status(err.status).json({
      error: err.code,
      messageHe: err.messageHe,
      message: err.message,
    });
  }

  console.error('[PAYMENTS] Unhandled error:', err);
  return res.status(500).json({
    error: 'SERVER_ERROR',
    messageHe: 'שגיאת שרת פנימית. נסה שוב.',
  });
}

export default router;
