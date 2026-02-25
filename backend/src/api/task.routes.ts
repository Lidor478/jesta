/**
 * @file task.routes.ts
 * @description Task and Offer REST API routes for Jesta.
 *
 * All routes are RTL/Hebrew-aware: errors return messageHe for the UI.
 * All money routes are guarded by cashLawGuard middleware.
 *
 * @hebrew נקודות קצה REST לניהול משימות והצעות
 */

import { Router, Request, Response } from 'express';
import { requireAuth, optionalAuth, cashLawGuard } from '../middleware/auth.middleware';
import { validate, validateQuery, Schemas } from '../middleware/validation.middleware';
import * as TaskService from '../services/task.service';
import * as MatchingService from '../services/matching.service';

export const taskRouter = Router();

// ─── TASK FEED — GET /v1/tasks/nearby ────────────────────────────────────────

/**
 * @description GPS-matched task feed for Jesters.
 * Returns ranked, paginated list of tasks near the Jester's location.
 * @hebrew פיד משימות ממוין לפי מיקום ורלוונטיות לג׳סטר
 *
 * Query: lat, lng, radiusKm, category, minPrice, maxPrice, sortBy, cursor, limit
 */
taskRouter.get(
  '/nearby',
  optionalAuth,
  validateQuery(Schemas.nearbyQuery),
  async (req: Request, res: Response) => {
    try {
      const q = req.query as any;
      const result = await MatchingService.getNearbyTasks({
        jesterLat: parseFloat(q.lat),
        jesterLng: parseFloat(q.lng),
        radiusKm: q.radiusKm,
        category: q.category,
        minPrice: q.minPrice,
        maxPrice: q.maxPrice,
        sortBy: q.sortBy,
        cursor: q.cursor,
        limit: q.limit,
        jesterId: req.user?.id,
      });

      return res.status(200).json({
        tasks: result.tasks,
        nextCursor: result.nextCursor,
        total: result.tasks.length,
      });
    } catch (err) {
      return handleError(err, res);
    }
  }
);

// ─── COMMUNITY FEED — GET /v1/tasks/community ─────────────────────────────────

/**
 * @description Community (pro-bono) task feed sorted by distance.
 * @hebrew פיד משימות קהילתיות התנדבותיות
 */
taskRouter.get('/community', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { lat, lng, radius } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        code: 'MISSING_LOCATION',
        messageHe: 'יש לשלוח מיקום (lat, lng) לחיפוש משימות קהילתיות.',
      });
    }

    const tasks = await MatchingService.getNearbyCommunityTasks(
      parseFloat(lat as string),
      parseFloat(lng as string),
      radius ? parseFloat(radius as string) : 15
    );

    return res.status(200).json({ tasks, total: tasks.length });
  } catch (err) {
    return handleError(err, res);
  }
});

// ─── MY TASKS — GET /v1/tasks/mine ────────────────────────────────────────────

/**
 * @description Returns all tasks for the authenticated user (as Client or Jester).
 * @hebrew המשימות שלי — כלקוח וכג׳סטר
 */
taskRouter.get('/mine', requireAuth, async (req: Request, res: Response) => {
  try {
    const { role, status } = req.query as { role?: string; status?: any };
    const tasks = await TaskService.getMyTasks(req.user!.id, role as any, status);
    return res.status(200).json({ tasks });
  } catch (err) {
    return handleError(err, res);
  }
});

// ─── CREATE TASK — POST /v1/tasks ─────────────────────────────────────────────

/**
 * @description Creates a new task (paid or community).
 * @hebrew פרסום משימה חדשה על ידי לקוח
 */
taskRouter.post(
  '/',
  requireAuth,
  validate(Schemas.createTask),
  async (req: Request, res: Response) => {
    try {
      const task = await TaskService.createTask(req.user!.id, req.body);
      return res.status(201).json({
        task,
        messageHe: task.isCommunityTask
          ? 'המשימה הקהילתית פורסמה בהצלחה! תודה על תרומתך לקהילה.'
          : 'המשימה פורסמה בהצלחה! נשלח לך עדכון כשיגיעו הצעות.',
      });
    } catch (err) {
      return handleError(err, res);
    }
  }
);

// ─── GET TASK — GET /v1/tasks/:id ─────────────────────────────────────────────

taskRouter.get('/:id', optionalAuth, async (req: Request, res: Response) => {
  try {
    const task = await TaskService.getTaskById(req.params.id, req.user?.id);
    return res.status(200).json({ task });
  } catch (err) {
    return handleError(err, res);
  }
});

// ─── UPDATE TASK — PUT /v1/tasks/:id ──────────────────────────────────────────

taskRouter.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const task = await TaskService.updateTask(req.params.id, req.user!.id, req.body);
    return res.status(200).json({ task, messageHe: 'המשימה עודכנה בהצלחה.' });
  } catch (err) {
    return handleError(err, res);
  }
});

// ─── CANCEL TASK — DELETE /v1/tasks/:id ───────────────────────────────────────

taskRouter.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    await TaskService.cancelTask(req.params.id, req.user!.id);
    return res.status(200).json({ messageHe: 'המשימה בוטלה.' });
  } catch (err) {
    return handleError(err, res);
  }
});

// ─── SUBMIT OFFER — POST /v1/tasks/:id/offers ────────────────────────────────

/**
 * @description Jester submits a price offer on an open task.
 * @hebrew הגשת הצעת מחיר על משימה
 */
taskRouter.post(
  '/:id/offers',
  requireAuth,
  validate(Schemas.createOffer),
  cashLawGuard,
  async (req: Request, res: Response) => {
    try {
      const offer = await TaskService.submitOffer(req.params.id, req.user!.id, req.body);
      return res.status(201).json({
        offer,
        messageHe: 'הצעתך נשלחה ללקוח! נעדכן אותך כשיגיב.',
      });
    } catch (err) {
      return handleError(err, res);
    }
  }
);

// ─── ACCEPT OFFER — PUT /v1/tasks/:id/offers/:offerId/accept ─────────────────

/**
 * @description Client accepts a Jester's offer. Assigns Jester to task.
 * Next step for client: fund escrow via POST /v1/transactions/:taskId/fund
 * @hebrew לקוח מקבל הצעה ומקצה ג׳סטר למשימה
 */
taskRouter.put(
  '/:id/offers/:offerId/accept',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const result = await TaskService.acceptOffer(
        req.params.id,
        req.params.offerId,
        req.user!.id
      );

      return res.status(200).json({
        ...result,
        messageHe: `קיבלת את הצעתו של ${result.jester.displayName}! יש לשלם כדי להתחיל.`,
        nextStep: 'fund_escrow',
        fundUrl: `/v1/transactions/${req.params.id}/fund`,
      });
    } catch (err) {
      return handleError(err, res);
    }
  }
);

// ─── MARK IN PROGRESS — POST /v1/tasks/:id/start ────────────────────────────

taskRouter.post('/:id/start', requireAuth, async (req: Request, res: Response) => {
  try {
    const task = await TaskService.markInProgress(req.params.id, req.user!.id);
    return res.status(200).json({ task, messageHe: 'סימנת שהתחלת לעבוד. בהצלחה!' });
  } catch (err) {
    return handleError(err, res);
  }
});

// ─── MARK COMPLETE (Jester) — POST /v1/tasks/:id/complete ────────────────────

taskRouter.post('/:id/complete', requireAuth, async (req: Request, res: Response) => {
  try {
    const task = await TaskService.markComplete(req.params.id, req.user!.id);
    return res.status(200).json({
      task,
      messageHe: 'סימנת את המשימה כהושלמה! ממתינים לאישור הלקוח.',
    });
  } catch (err) {
    return handleError(err, res);
  }
});

// ─── APPROVE COMPLETION (Client) — POST /v1/tasks/:id/approve ────────────────

/**
 * @description Client approves task completion → triggers escrow release.
 * @hebrew לקוח מאשר השלמה ומשחרר תשלום לג׳סטר
 * @compliance Triggers EscrowService.releaseToJester internally.
 */
taskRouter.post('/:id/approve', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await TaskService.approveCompletion(req.params.id, req.user!.id);

    // Dynamically import EscrowService to avoid circular deps
    const { releaseToJester } = await import('../../services/escrow.service');
    await releaseToJester(result.transactionId, 'CLIENT_APPROVED');

    return res.status(200).json({
      messageHe: 'אישרת את השלמת המשימה! התשלום שוחרר לג׳סטר.',
    });
  } catch (err) {
    return handleError(err, res);
  }
});

// ─── OPEN DISPUTE — POST /v1/tasks/:id/dispute ───────────────────────────────

taskRouter.post('/:id/dispute', requireAuth, async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    if (!reason || reason.length < 10) {
      return res.status(400).json({
        code: 'DISPUTE_REASON_REQUIRED',
        messageHe: 'יש לציין את סיבת המחלוקת (לפחות 10 תווים).',
      });
    }

    const task = await TaskService.openDispute(req.params.id, req.user!.id, reason);
    return res.status(200).json({
      task,
      messageHe: 'פתחת מחלוקת. צוות ג׳סטה יחזור אליך תוך 48 שעות.',
    });
  } catch (err) {
    return handleError(err, res);
  }
});

// ─── CLAIM COMMUNITY TASK — POST /v1/tasks/:id/volunteer ─────────────────────

taskRouter.post('/:id/volunteer', requireAuth, async (req: Request, res: Response) => {
  try {
    const task = await TaskService.claimCommunityTask(req.params.id, req.user!.id);
    return res.status(200).json({
      task,
      messageHe: 'תודה! לקחת על עצמך את המשימה הקהילתית. יצרנו קשר עם המפרסם.',
    });
  } catch (err) {
    return handleError(err, res);
  }
});

// ─── Error Handler ────────────────────────────────────────────────────────────

function handleError(err: unknown, res: Response) {
  if (err instanceof TaskService.TaskError) {
    return res.status(err.status).json({
      code: err.code,
      messageHe: err.messageHe,
      statusCode: err.status,
    });
  }
  if ((err as any)?.code === 'P2025') {
    // Prisma: record not found
    return res.status(404).json({
      code: 'NOT_FOUND',
      messageHe: 'הרשומה לא נמצאה.',
      statusCode: 404,
    });
  }
  console.error('[TaskRoute]', err);
  return res.status(500).json({
    code: 'INTERNAL_ERROR',
    messageHe: 'אירעה שגיאה. אנא נסה שנית.',
    statusCode: 500,
  });
}
