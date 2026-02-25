/**
 * @file task.service.ts
 * @description Core task lifecycle service for Jesta.
 *
 * Handles: create → offer → assign → in-progress → pending-approval → complete
 * Also handles: cancel, dispute, community task creation, karma award.
 *
 * @hebrew שירות מחזור החיים של משימות בפלטפורמת ג׳סטה
 * @compliance All money-related transitions create EscrowLedger entries.
 */

import { PrismaClient, TaskStatus, TaskCategory } from '@prisma/client';
import { LIMITS, FEES, KARMA } from '../config/constants';

const prisma = new PrismaClient();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateTaskInput {
  title: string;
  description: string;
  category: TaskCategory;
  budgetMin?: number;
  budgetMax: number;
  latitude: number;
  longitude: number;
  address: string;
  scheduledAt?: string;
  estimatedHours?: number;
  isCommunityTask?: boolean;
  requiresVehicle?: boolean;
  vehicleType?: string;
}

export interface CreateOfferInput {
  price: number;
  message?: string;
  eta?: string;
}

export class TaskError extends Error {
  constructor(
    public readonly code: string,
    public readonly messageHe: string,
    public readonly status: number = 400
  ) {
    super(code);
    this.name = 'TaskError';
  }
}

// ─── Create Task ──────────────────────────────────────────────────────────────

/**
 * @description Creates a new task posted by a Client.
 * Community tasks skip price validation. Driving tasks auto-set requiresVehicle.
 * @hebrew יוצר משימה חדשה בפלטפורמה
 */
export async function createTask(clientId: string, input: CreateTaskInput) {
  // Community tasks are always free
  if (input.isCommunityTask) {
    input.budgetMax = 0;
    input.budgetMin = undefined;
  } else {
    if (input.budgetMax < LIMITS.MIN_TASK_PRICE_NIS) {
      throw new TaskError(
        'PRICE_TOO_LOW',
        `המחיר המינימלי הוא ${LIMITS.MIN_TASK_PRICE_NIS} ₪`
      );
    }
  }

  // Auto-flag vehicle requirement for driving tasks
  if (input.category === 'DRIVING') {
    input.requiresVehicle = true;
  }

  const task = await prisma.task.create({
    data: {
      ...input,
      clientId,
      status: 'OPEN',
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      expiresAt: new Date(Date.now() + LIMITS.TASK_EXPIRY_DAYS * 86_400_000),
    },
    include: {
      client: {
        select: { id: true, displayName: true, trustScore: true, verificationLevel: true },
      },
    },
  });

  // For community tasks, auto-create CommunityTask metadata
  if (input.isCommunityTask) {
    await prisma.communityTask.create({
      data: {
        taskId: task.id,
        karmaAwarded: KARMA.COMMUNITY_TASK_POINTS,
        targetGroup: getCommunityTarget(input.category),
      },
    });
  }

  return task;
}

// ─── Get Task ─────────────────────────────────────────────────────────────────

/**
 * @description Fetches full task detail including client, jester, offers, and transaction.
 * @hebrew מביא פרטי משימה מלאים
 */
export async function getTaskById(taskId: string, requestingUserId?: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      client: {
        select: {
          id: true, displayName: true, avatarUrl: true,
          trustScore: true, verificationLevel: true,
          jesterRatingAvg: true, completedTasksCount: true,
        },
      },
      jester: {
        select: {
          id: true, displayName: true, avatarUrl: true,
          trustScore: true, verificationLevel: true,
          jesterRatingAvg: true, completedTasksCount: true,
        },
      },
      offers: {
        include: {
          jester: {
            select: {
              id: true, displayName: true, avatarUrl: true,
              trustScore: true, verificationLevel: true, jesterRatingAvg: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
      transaction: {
        select: { id: true, status: true, grossAmount: true, netToJester: true },
      },
      communityMeta: true,
      ratings: {
        select: { id: true, score: true, comment: true, raterId: true, createdAt: true },
      },
    },
  });

  if (!task) {
    throw new TaskError('TASK_NOT_FOUND', 'המשימה לא נמצאה', 404);
  }

  // Hide offer details from non-participants unless task is their own
  const isParticipant =
    requestingUserId &&
    (task.clientId === requestingUserId || task.jesterId === requestingUserId);

  if (!isParticipant) {
    // Public view: hide offer prices and messages
    return {
      ...task,
      offers: task.offers.map((o) => ({ ...o, price: null, message: null })),
    };
  }

  return task;
}

// ─── List My Tasks ────────────────────────────────────────────────────────────

/**
 * @description Returns tasks where the user is either Client or Jester.
 * @hebrew מביא את כל המשימות של המשתמש
 */
export async function getMyTasks(
  userId: string,
  role: 'client' | 'jester' | 'both' = 'both',
  status?: TaskStatus
) {
  const where: any = { AND: [] };

  if (role === 'client') where.AND.push({ clientId: userId });
  else if (role === 'jester') where.AND.push({ jesterId: userId });
  else where.AND.push({ OR: [{ clientId: userId }, { jesterId: userId }] });

  if (status) where.AND.push({ status });

  return prisma.task.findMany({
    where,
    include: {
      client: { select: { id: true, displayName: true, avatarUrl: true } },
      jester: { select: { id: true, displayName: true, avatarUrl: true } },
      _count: { select: { offers: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

// ─── Update Task ──────────────────────────────────────────────────────────────

/**
 * @description Allows the Client to update a task while it's still OPEN.
 * @hebrew עדכון פרטי משימה פתוחה
 */
export async function updateTask(
  taskId: string,
  clientId: string,
  updates: Partial<CreateTaskInput>
) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });

  if (task.clientId !== clientId) {
    throw new TaskError('FORBIDDEN', 'אין לך הרשאה לעדכן משימה זו', 403);
  }
  if (task.status !== 'OPEN') {
    throw new TaskError('TASK_NOT_EDITABLE', 'ניתן לעדכן רק משימות פתוחות');
  }

  return prisma.task.update({
    where: { id: taskId },
    data: {
      ...updates,
      scheduledAt: updates.scheduledAt ? new Date(updates.scheduledAt) : undefined,
    },
  });
}

// ─── Cancel Task ──────────────────────────────────────────────────────────────

/**
 * @description Cancels a task. Only allowed before a Jester is assigned.
 * @hebrew ביטול משימה לפני שהוקצה ג׳סטר
 */
export async function cancelTask(taskId: string, clientId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });

  if (task.clientId !== clientId) {
    throw new TaskError('FORBIDDEN', 'אין לך הרשאה לבטל משימה זו', 403);
  }
  if (!['OPEN', 'DRAFT'].includes(task.status)) {
    throw new TaskError(
      'CANNOT_CANCEL',
      'לא ניתן לבטל משימה לאחר שהוקצה ג׳סטר. יש לפתוח מחלוקת.'
    );
  }

  return prisma.task.update({
    where: { id: taskId },
    data: { status: 'CANCELLED' },
  });
}

// ─── Submit Offer ─────────────────────────────────────────────────────────────

/**
 * @description A Jester submits a price offer on an open task.
 * @hebrew הגשת הצעת מחיר על משימה פתוחה
 */
export async function submitOffer(
  taskId: string,
  jesterId: string,
  input: CreateOfferInput
) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });

  if (!task) throw new TaskError('TASK_NOT_FOUND', 'המשימה לא נמצאה', 404);
  if (task.status !== 'OPEN') {
    throw new TaskError('TASK_NOT_OPEN', 'המשימה אינה פתוחה להצעות');
  }
  if (task.clientId === jesterId) {
    throw new TaskError('CANNOT_BID_OWN_TASK', 'לא ניתן להגיש הצעה על משימה שפרסמת');
  }
  if (task.isCommunityTask) {
    throw new TaskError('COMMUNITY_NO_OFFERS', 'משימות קהילתיות אינן דורשות הצעת מחיר');
  }

  // Upsert: Jester can update their offer before acceptance
  return prisma.taskOffer.upsert({
    where: { taskId_jesterId: { taskId, jesterId } },
    create: {
      taskId,
      jesterId,
      price: input.price,
      message: input.message,
      eta: input.eta ? new Date(input.eta) : null,
    },
    update: {
      price: input.price,
      message: input.message,
      eta: input.eta ? new Date(input.eta) : null,
    },
    include: {
      jester: {
        select: { id: true, displayName: true, trustScore: true, jesterRatingAvg: true },
      },
    },
  });
}

// ─── Accept Offer ─────────────────────────────────────────────────────────────

/**
 * @description Client accepts a Jester's offer.
 * Atomically: marks offer accepted, assigns jester to task, creates Transaction shell.
 * Client must then fund the escrow via /transactions/:taskId/fund.
 *
 * @hebrew לקוח מקבל הצעה של ג׳סטר — פעולה אטומית
 * @compliance Creates Transaction record. EscrowLedger entry added when funded.
 */
export async function acceptOffer(taskId: string, offerId: string, clientId: string) {
  const [task, offer] = await Promise.all([
    prisma.task.findUnique({ where: { id: taskId } }),
    prisma.taskOffer.findUnique({
      where: { id: offerId },
      include: { jester: { select: { id: true, displayName: true } } },
    }),
  ]);

  if (!task) throw new TaskError('TASK_NOT_FOUND', 'המשימה לא נמצאה', 404);
  if (!offer) throw new TaskError('OFFER_NOT_FOUND', 'ההצעה לא נמצאה', 404);
  if (task.clientId !== clientId) throw new TaskError('FORBIDDEN', 'אין לך הרשאה', 403);
  if (task.status !== 'OPEN') throw new TaskError('TASK_NOT_OPEN', 'המשימה אינה פתוחה');
  if (offer.taskId !== taskId) throw new TaskError('OFFER_MISMATCH', 'ההצעה אינה שייכת למשימה זו');

  // Compute all fee amounts
  const agreedPrice = offer.price;
  const clientCommission = agreedPrice * FEES.CLIENT_COMMISSION;
  const jesterCommission = agreedPrice * FEES.JESTER_COMMISSION;
  const insuranceMarkup = task.requiresVehicle ? agreedPrice * FEES.MICRO_INSURANCE_MARKUP : 0;
  const grossAmount = agreedPrice + clientCommission + insuranceMarkup;
  const netToJester = agreedPrice - jesterCommission;

  // Atomic transaction: accept offer + assign task + create Transaction record
  const result = await prisma.$transaction([
    // 1. Mark this offer accepted
    prisma.taskOffer.update({
      where: { id: offerId },
      data: { isAccepted: true },
    }),
    // 2. Reject all other offers
    prisma.taskOffer.updateMany({
      where: { taskId, id: { not: offerId } },
      data: { isAccepted: false },
    }),
    // 3. Assign jester + update task status
    prisma.task.update({
      where: { id: taskId },
      data: {
        jesterId: offer.jesterId,
        status: 'ASSIGNED',
        agreedPrice,
      },
    }),
    // 4. Create Transaction shell (funded separately)
    prisma.transaction.create({
      data: {
        taskId,
        status: 'PENDING',
        grossAmount,
        clientCommission,
        jesterCommission,
        insuranceMarkup,
        netToJester,
        flaggedForCashLaw: grossAmount > LIMITS.CASH_LAW_MAX_NIS,
      },
    }),
  ]);

  return {
    task: result[2],
    transaction: result[3],
    jester: offer.jester,
    amounts: { grossAmount, netToJester, clientCommission, jesterCommission, insuranceMarkup },
  };
}

// ─── Mark Task In Progress ────────────────────────────────────────────────────

/**
 * @description Jester marks the task as in-progress (work has begun).
 * @hebrew ג׳סטר מסמן שהתחיל לעבוד על המשימה
 */
export async function markInProgress(taskId: string, jesterId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });

  if (task.jesterId !== jesterId) throw new TaskError('FORBIDDEN', 'אין לך הרשאה', 403);
  if (task.status !== 'ASSIGNED') {
    throw new TaskError('INVALID_STATUS', 'המשימה לא נמצאת בסטטוס מתאים');
  }

  return prisma.task.update({
    where: { id: taskId },
    data: { status: 'IN_PROGRESS' },
  });
}

// ─── Mark Task Complete (Jester) ──────────────────────────────────────────────

/**
 * @description Jester marks work as done, triggers client approval window.
 * @hebrew ג׳סטר מסמן שסיים את העבודה — ממתין לאישור הלקוח
 */
export async function markComplete(taskId: string, jesterId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });

  if (task.jesterId !== jesterId) throw new TaskError('FORBIDDEN', 'אין לך הרשאה', 403);
  if (!['ASSIGNED', 'IN_PROGRESS'].includes(task.status)) {
    throw new TaskError('INVALID_STATUS', 'לא ניתן לסמן השלמה בשלב זה');
  }

  return prisma.task.update({
    where: { id: taskId },
    data: { status: 'PENDING_APPROVAL' },
  });
}

// ─── Approve Completion (Client) ──────────────────────────────────────────────

/**
 * @description Client approves task completion.
 * Triggers escrow release (handled by EscrowService — imported from escrow.service.ts).
 * @hebrew לקוח מאשר את השלמת המשימה ומשחרר את התשלום
 * @compliance Triggers EscrowService.releaseToJester — see escrow.service.ts
 */
export async function approveCompletion(taskId: string, clientId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { transaction: true },
  });

  if (!task) throw new TaskError('TASK_NOT_FOUND', 'המשימה לא נמצאה', 404);
  if (task.clientId !== clientId) throw new TaskError('FORBIDDEN', 'אין לך הרשאה', 403);
  if (task.status !== 'PENDING_APPROVAL') {
    throw new TaskError('INVALID_STATUS', 'המשימה לא ממתינה לאישורך');
  }
  if (!task.transaction) {
    throw new TaskError('NO_TRANSACTION', 'לא נמצא תשלום עבור משימה זו');
  }

  // Note: EscrowService.releaseToJester() is called by the route handler
  // after this returns, to keep services decoupled.
  return { task, transactionId: task.transaction.id };
}

// ─── Open Dispute ─────────────────────────────────────────────────────────────

/**
 * @description Either party opens a dispute. Funds remain in escrow until resolved.
 * @hebrew פתיחת מחלוקת — הכספים נשארים בנאמנות עד לפתרון
 */
export async function openDispute(taskId: string, userId: string, reason: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { transaction: true },
  });

  if (!task) throw new TaskError('TASK_NOT_FOUND', 'המשימה לא נמצאה', 404);

  const isParticipant = task.clientId === userId || task.jesterId === userId;
  if (!isParticipant) throw new TaskError('FORBIDDEN', 'אין לך הרשאה', 403);

  const disputeAllowed: TaskStatus[] = ['IN_PROGRESS', 'PENDING_APPROVAL', 'ASSIGNED'];
  if (!disputeAllowed.includes(task.status as TaskStatus)) {
    throw new TaskError('CANNOT_DISPUTE', 'לא ניתן לפתוח מחלוקת בשלב זה');
  }

  const [updatedTask] = await prisma.$transaction([
    prisma.task.update({
      where: { id: taskId },
      data: { status: 'DISPUTED' },
    }),
    prisma.transaction.update({
      where: { taskId },
      data: { status: 'DISPUTED' },
    }),
  ]);

  return updatedTask;
}

// ─── Community Task: Volunteer Claim ─────────────────────────────────────────

/**
 * @description A volunteer claims a community task (no payment, no offers).
 * @hebrew מתנדב לוקח על עצמו משימה קהילתית
 */
export async function claimCommunityTask(taskId: string, volunteerId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { communityMeta: true },
  });

  if (!task) throw new TaskError('TASK_NOT_FOUND', 'המשימה לא נמצאה', 404);
  if (!task.isCommunityTask) {
    throw new TaskError('NOT_COMMUNITY_TASK', 'זוהי לא משימה קהילתית');
  }
  if (task.status !== 'OPEN') throw new TaskError('TASK_NOT_OPEN', 'המשימה כבר תפוסה');
  if (task.clientId === volunteerId) {
    throw new TaskError('OWN_TASK', 'לא ניתן להתנדב למשימה שפרסמת');
  }

  return prisma.task.update({
    where: { id: taskId },
    data: { jesterId: volunteerId, status: 'ASSIGNED' },
  });
}

/**
 * @description Awards karma points after a community task is completed.
 * @hebrew מעניק נקודות קארמה לאחר השלמת משימה קהילתית
 */
export async function awardCommunityKarma(taskId: string, volunteerId: string) {
  const communityMeta = await prisma.communityTask.findUnique({ where: { taskId } });
  const points = communityMeta?.karmaAwarded ?? KARMA.COMMUNITY_TASK_POINTS;

  return prisma.$transaction([
    prisma.karmaPoint.create({
      data: {
        userId: volunteerId,
        points,
        reason: 'community_task_completed',
        taskId,
      },
    }),
    prisma.communityTask.update({
      where: { taskId },
      data: { verifiedAt: new Date() },
    }),
  ]);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCommunityTarget(category: TaskCategory): string {
  const map: Partial<Record<TaskCategory, string>> = {
    ELDERLY_CARE: 'קשישים',
    MOVING: 'נזקקים',
    ERRANDS: 'קשישים',
    CLEANING: 'נזקקים',
  };
  return map[category] ?? 'קהילה';
}
