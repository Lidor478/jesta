/**
 * @file escrow.service.ts
 * @description Core money pipeline for Jesta.
 *
 * Money flow:
 *   CLIENT pays → FUND → HELD (7 days) → CLIENT approves → RELEASE → Jester paid + Invoice
 *                                                         ↘ DISPUTE → Admin resolves → RELEASE or REFUND
 *
 * @compliance Israeli Payment Services Law 2024 — every fund movement appends to EscrowLedger.
 * @compliance Cash Law 6,000 NIS — amounts above limit require digital payment only.
 * @compliance VAT 17% included in חשבונית ירוקה via Morning API.
 *
 * APPROVAL GATE: Any change to fee math, ledger structure, or payout logic
 * requires explicit re-approval per CLAUDE.md before deployment.
 */

import { PrismaClient, TransactionStatus } from '@prisma/client';
import { FEES, LIMITS } from '../config/constants';
import { MorningClient, InvoiceData } from './morning.client';

const prisma = new PrismaClient();
const morning = new MorningClient();

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface FundEscrowInput {
  taskId: string;
  clientId: string;
  /** Payment token from Cardcom/Tranzila after card charge */
  paymentToken: string;
  /** The price the client and jester agreed to */
  agreedPrice: number;
}

export interface EscrowResult {
  success: boolean;
  transactionId: string;
  messageHe: string;
  ledgerEntryId?: string;
  invoiceId?: string;
  netToJester?: number;
}

export interface FeeBreakdown {
  agreedPrice: number;
  clientCommission: number;
  jesterCommission: number;
  insuranceMarkup: number;
  grossAmount: number;       // what client pays total
  netToJester: number;       // what jester receives
  jestaRevenue: number;      // platform take
  vatAmount: number;         // VAT on Jesta's revenue only
  flaggedForCashLaw: boolean;
}

export class EscrowError extends Error {
  constructor(
    public code: string,
    public messageHe: string,
    public status: number = 400,
  ) {
    super(code);
  }
}

// ─────────────────────────────────────────────
// Fee Calculation (pure function, tested independently)
// ─────────────────────────────────────────────

/**
 * @description Pre-compute all fees for a transaction.
 * Client pays: agreedPrice + clientCommission + insuranceMarkup
 * Jester receives: agreedPrice - jesterCommission
 *
 * @hebrew כל החישובים מבוססים על קבועים ב-constants.ts — לא ניתן לשנות ללא אישור.
 * @compliance APPROVAL GATE — fee constants are immutable per CLAUDE.md.
 */
export function computeFees(agreedPrice: number, requiresVehicle: boolean): FeeBreakdown {
  const r = (n: number) => Math.round(n * 100) / 100;

  const clientCommission = r(agreedPrice * FEES.CLIENT_COMMISSION_RATE);
  const jesterCommission = r(agreedPrice * FEES.JESTER_COMMISSION_RATE);
  const insuranceMarkup = requiresVehicle ? r(agreedPrice * FEES.INSURANCE_MARKUP_RATE) : 0;
  const grossAmount = r(agreedPrice + clientCommission + insuranceMarkup);
  const netToJester = r(agreedPrice - jesterCommission);
  const jestaRevenue = r(clientCommission + jesterCommission);
  const vatAmount = r(jestaRevenue * FEES.VAT_RATE);

  return {
    agreedPrice,
    clientCommission,
    jesterCommission,
    insuranceMarkup,
    grossAmount,
    netToJester,
    jestaRevenue,
    vatAmount,
    flaggedForCashLaw: grossAmount > LIMITS.CASH_LAW_MAX_NIS,
  };
}

// ─────────────────────────────────────────────
// STEP 1: FUND — Client pays into escrow
// ─────────────────────────────────────────────

/**
 * @description Called after payment gateway confirms charge.
 * Creates/updates Transaction + appends first EscrowLedger entry (FUND).
 *
 * @compliance EscrowLedger entry is append-only — never updated, never deleted.
 * @compliance Cash Law check: paymentToken='CASH' rejected above 6,000 NIS.
 */
export async function fundEscrow(input: FundEscrowInput): Promise<EscrowResult> {
  const { taskId, clientId, paymentToken, agreedPrice } = input;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { client: true, jester: true },
  });

  if (!task) throw new EscrowError('TASK_NOT_FOUND', 'המשימה לא נמצאה', 404);
  if (task.clientId !== clientId) throw new EscrowError('UNAUTHORIZED', 'אין הרשאה', 403);
  if (task.status !== 'ASSIGNED')
    throw new EscrowError('INVALID_STATUS', 'ניתן לממן רק משימה שהוקצתה לג׳סטר', 400);
  if (!task.jesterId)
    throw new EscrowError('NO_JESTER', 'לא נבחר ג׳סטר עדיין', 400);

  const fees = computeFees(agreedPrice, task.requiresVehicle ?? false);

  // Cash Law enforcement
  if (fees.flaggedForCashLaw && paymentToken === 'CASH') {
    throw new EscrowError(
      'CASH_LAW_VIOLATION',
      `תשלום במזומן אסור לסכומים מעל ₪${LIMITS.CASH_LAW_MAX_NIS.toLocaleString('he-IL')}. נא לשלם בכרטיס אשראי.`,
      400,
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    // Upsert: task.routes may have created a shell transaction in acceptOffer()
    const transaction = await tx.transaction.upsert({
      where: { taskId },
      update: {
        agreedPrice: fees.agreedPrice,
        grossAmount: fees.grossAmount,
        clientCommission: fees.clientCommission,
        jesterCommission: fees.jesterCommission,
        insuranceMarkup: fees.insuranceMarkup,
        netToJester: fees.netToJester,
        jestaRevenue: fees.jestaRevenue,
        vatAmount: fees.vatAmount,
        flaggedForCashLaw: fees.flaggedForCashLaw,
        paymentToken,
        status: 'HELD',
        heldAt: new Date(),
      },
      create: {
        taskId,
        clientId,
        jesterId: task.jesterId,
        agreedPrice: fees.agreedPrice,
        grossAmount: fees.grossAmount,
        clientCommission: fees.clientCommission,
        jesterCommission: fees.jesterCommission,
        insuranceMarkup: fees.insuranceMarkup,
        netToJester: fees.netToJester,
        jestaRevenue: fees.jestaRevenue,
        vatAmount: fees.vatAmount,
        flaggedForCashLaw: fees.flaggedForCashLaw,
        paymentToken,
        status: 'HELD',
        heldAt: new Date(),
      },
    });

    // Append immutable ledger entry — FUND
    const ledgerEntry = await tx.escrowLedger.create({
      data: {
        transactionId: transaction.id,
        action: 'FUND',
        amount: fees.grossAmount,
        balanceAfter: fees.grossAmount,
        actorId: clientId,
        note: `לקוח מימן ₪${fees.grossAmount} | עמלת לקוח ₪${fees.clientCommission}${fees.insuranceMarkup > 0 ? ` | ביטוח ₪${fees.insuranceMarkup}` : ''}`,
        metadata: JSON.stringify({
          fees,
          paymentToken: `${paymentToken.slice(0, 6)}***`,
          flaggedForCashLaw: fees.flaggedForCashLaw,
        }),
      },
    });

    return { transaction, ledgerEntry };
  });

  return {
    success: true,
    transactionId: result.transaction.id,
    ledgerEntryId: result.ledgerEntry.id,
    netToJester: fees.netToJester,
    messageHe: `✅ הכסף מוחזק בנאמנות. הג׳סטר מקבל ₪${fees.netToJester} עם השלמת המשימה.`,
  };
}

// ─────────────────────────────────────────────
// STEP 2: RELEASE — Client approves → pay Jester
// ─────────────────────────────────────────────

/**
 * @description Release held funds to Jester after client approval.
 * Triggers Morning API invoice generation for both parties.
 * Also called by auto-release cron after LIMITS.ESCROW_HOLD_DAYS.
 *
 * @hebrew שחרור כספים לג׳סטר + יצירת חשבונית ירוקה
 * @compliance Appends RELEASE entry to EscrowLedger.
 * @compliance Generates חשבונית ירוקה with 17% VAT via Morning API.
 */
export async function releaseToJester(
  transactionId: string,
  approvedById: string,
  isAutoRelease = false,
): Promise<EscrowResult> {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      task: { include: { client: true, jester: true } },
    },
  });

  if (!transaction) throw new EscrowError('TXN_NOT_FOUND', 'העסקה לא נמצאה', 404);
  if (transaction.status !== 'HELD')
    throw new EscrowError('INVALID_STATUS', 'לא ניתן לשחרר — הכסף אינו מוחזק', 400);

  // Auto-release: validate hold period has elapsed
  if (isAutoRelease && transaction.heldAt) {
    const daysSinceHeld = (Date.now() - transaction.heldAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceHeld < LIMITS.ESCROW_HOLD_DAYS) {
      throw new EscrowError(
        'HOLD_PERIOD_ACTIVE',
        `שחרור אוטומטי יתאפשר רק לאחר ${LIMITS.ESCROW_HOLD_DAYS} ימים`,
        400,
      );
    }
  }

  const { task } = transaction;
  const jester = task.jester;
  const client = task.client;

  if (!jester) throw new EscrowError('JESTER_NOT_FOUND', 'ג׳סטר לא נמצא בעסקה', 500);

  // Generate חשבונית ירוקה — non-blocking (log error, continue)
  let invoiceId: string | undefined;
  try {
    const invoiceData: InvoiceData = {
      clientName: client.displayName ?? 'לקוח',
      clientPhone: client.phone,
      jesterName: jester.displayName ?? 'ג׳סטר',
      taskDescription: task.title,
      agreedPrice: transaction.agreedPrice,
      jestaCommission: transaction.jestaRevenue,
      vatAmount: transaction.vatAmount,
      grossAmount: transaction.grossAmount,
      issuedAt: new Date(),
    };

    const invoice = await morning.createInvoice(invoiceData);
    invoiceId = invoice.id;

    await prisma.invoice.create({
      data: {
        transactionId,
        externalId: invoice.externalId,
        provider: 'MORNING',
        invoiceNumber: invoice.number,
        totalAmount: transaction.grossAmount,
        vatAmount: transaction.vatAmount,
        pdfUrl: invoice.pdfUrl,
        issuedAt: new Date(),
      },
    });
  } catch (err) {
    console.error('[ESCROW] Morning invoice generation failed, continuing release:', err);
  }

  // Atomic: update transaction + task + append ledger
  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'RELEASED',
        releasedAt: new Date(),
        isAutoRelease,
      },
    });

    await tx.task.update({
      where: { id: task.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    await tx.escrowLedger.create({
      data: {
        transactionId,
        action: 'RELEASE',
        amount: transaction.netToJester,
        balanceAfter: 0,
        actorId: approvedById,
        note: isAutoRelease
          ? `שחרור אוטומטי (${LIMITS.ESCROW_HOLD_DAYS} ימים) | ₪${transaction.netToJester} לג׳סטר`
          : `אושר על ידי לקוח | ₪${transaction.netToJester} לג׳סטר`,
        metadata: JSON.stringify({ isAutoRelease, invoiceId }),
      },
    });
  });

  return {
    success: true,
    transactionId,
    invoiceId,
    netToJester: transaction.netToJester,
    messageHe: isAutoRelease
      ? `✅ שחרור אוטומטי — ₪${transaction.netToJester} הועברו לג׳סטר`
      : `✅ אישרת את ביצוע המשימה! ₪${transaction.netToJester} ישולמו לג׳סטר תוך 1-3 ימי עסקים`,
  };
}

// ─────────────────────────────────────────────
// STEP 3a: REFUND — Return funds to client
// ─────────────────────────────────────────────

/**
 * @description Admin-only. Refund full gross amount to client's original payment method.
 * Used after dispute resolution in client's favor, or task cancellation before start.
 *
 * @compliance Appends REFUND entry to EscrowLedger.
 */
export async function refundToClient(
  transactionId: string,
  adminId: string,
  reason: string,
): Promise<EscrowResult> {
  const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });

  if (!transaction) throw new EscrowError('TXN_NOT_FOUND', 'העסקה לא נמצאה', 404);

  const refundable: TransactionStatus[] = ['HELD', 'DISPUTED'];
  if (!refundable.includes(transaction.status)) {
    throw new EscrowError('INVALID_STATUS', 'לא ניתן להחזיר כסף במצב הנוכחי', 400);
  }

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: transactionId },
      data: { status: 'REFUNDED', refundedAt: new Date(), refundReason: reason },
    });

    await tx.task.update({
      where: { id: transaction.taskId },
      data: { status: 'CANCELLED' },
    });

    await tx.escrowLedger.create({
      data: {
        transactionId,
        action: 'REFUND',
        amount: transaction.grossAmount,
        balanceAfter: 0,
        actorId: adminId,
        note: `החזר כספי ₪${transaction.grossAmount} ללקוח | ${reason}`,
        metadata: JSON.stringify({ adminId, reason }),
      },
    });
  });

  return {
    success: true,
    transactionId,
    messageHe: `✅ הוחזרו ₪${transaction.grossAmount} ללקוח תוך 3-5 ימי עסקים`,
  };
}

// ─────────────────────────────────────────────
// STEP 3b: DISPUTE OPEN — Freeze escrow
// ─────────────────────────────────────────────

/**
 * @description Freeze funds in dispute. Funds remain held until admin resolves.
 * @compliance Appends DISPUTE_OPENED entry to EscrowLedger.
 */
export async function openEscrowDispute(
  transactionId: string,
  openedById: string,
  reason: string,
): Promise<EscrowResult> {
  const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });

  if (!transaction) throw new EscrowError('TXN_NOT_FOUND', 'העסקה לא נמצאה', 404);
  if (transaction.status !== 'HELD')
    throw new EscrowError('INVALID_STATUS', 'ניתן לפתוח מחלוקת רק על כספים מוחזקים', 400);

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'DISPUTED',
        disputeReason: reason,
        disputeOpenedAt: new Date(),
      },
    });

    await tx.escrowLedger.create({
      data: {
        transactionId,
        action: 'DISPUTE_OPENED',
        amount: transaction.grossAmount,
        balanceAfter: transaction.grossAmount, // still held
        actorId: openedById,
        note: `מחלוקת נפתחה | ₪${transaction.grossAmount} קפוא | ${reason}`,
        metadata: JSON.stringify({ openedById, reason }),
      },
    });
  });

  return {
    success: true,
    transactionId,
    messageHe: `⚠️ המחלוקת נפתחה. הצוות שלנו יחזור אליך תוך 24 שעות. הכסף קפוא בינתיים.`,
  };
}

// ─────────────────────────────────────────────
// STEP 4: RESOLVE DISPUTE — Admin decides
// ─────────────────────────────────────────────

/**
 * @description Admin resolves a dispute. Routes to releaseToJester or refundToClient.
 * @compliance Appends DISPUTE_RESOLVED entry + subsequent action entry.
 */
export async function resolveDispute(
  transactionId: string,
  adminId: string,
  decision: 'RELEASE_TO_JESTER' | 'REFUND_TO_CLIENT',
  adminNote: string,
): Promise<EscrowResult> {
  const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });

  if (!transaction) throw new EscrowError('TXN_NOT_FOUND', 'העסקה לא נמצאה', 404);
  if (transaction.status !== 'DISPUTED')
    throw new EscrowError('NOT_DISPUTED', 'העסקה אינה במצב מחלוקת', 400);

  // Log decision first
  await prisma.escrowLedger.create({
    data: {
      transactionId,
      action: 'DISPUTE_RESOLVED',
      amount: transaction.grossAmount,
      balanceAfter: transaction.grossAmount,
      actorId: adminId,
      note: `מנהל החליט: ${decision === 'RELEASE_TO_JESTER' ? 'שחרור לג׳סטר' : 'החזר ללקוח'} | ${adminNote}`,
      metadata: JSON.stringify({ adminId, decision, adminNote }),
    },
  });

  if (decision === 'RELEASE_TO_JESTER') {
    // Temporarily restore HELD so releaseToJester can proceed
    await prisma.transaction.update({ where: { id: transactionId }, data: { status: 'HELD' } });
    return releaseToJester(transactionId, adminId, false);
  } else {
    return refundToClient(transactionId, adminId, `החלטת מנהל: ${adminNote}`);
  }
}

// ─────────────────────────────────────────────
// Auto-release cron helper
// ─────────────────────────────────────────────

/**
 * @description Find all HELD transactions older than ESCROW_HOLD_DAYS and auto-release.
 * Should be triggered by a daily Railway cron job.
 */
export async function runAutoRelease(): Promise<{ released: number; errors: string[] }> {
  const cutoff = new Date(Date.now() - LIMITS.ESCROW_HOLD_DAYS * 24 * 60 * 60 * 1000);

  const stale = await prisma.transaction.findMany({
    where: { status: 'HELD', heldAt: { lt: cutoff } },
    select: { id: true },
  });

  let released = 0;
  const errors: string[] = [];

  for (const { id } of stale) {
    try {
      await releaseToJester(id, 'SYSTEM_AUTO_RELEASE', true);
      released++;
    } catch (err) {
      errors.push(`${id}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  console.log(`[AUTO_RELEASE] Released ${released}/${stale.length} | Errors: ${errors.length}`);
  return { released, errors };
}

// ─────────────────────────────────────────────
// Audit trail reader
// ─────────────────────────────────────────────

/**
 * @description Returns full immutable audit trail for a transaction.
 * Used by admin dashboard + compliance exports.
 */
export async function getEscrowLedger(transactionId: string) {
  return prisma.escrowLedger.findMany({
    where: { transactionId },
    orderBy: { createdAt: 'asc' },
    include: {
      actor: { select: { displayName: true, phone: true, role: true } },
    },
  });
}
