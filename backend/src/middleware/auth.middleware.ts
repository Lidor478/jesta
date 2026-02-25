/**
 * @file auth.middleware.ts
 * @description JWT verification middleware for Jesta API.
 * Attaches decoded user context to every authenticated request.
 *
 * @approvalGate Changes to this file require explicit re-approval per CLAUDE.md
 * @compliance Does not log or expose PII. Phone number is masked in logs.
 */

import { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Extend Express Request with Jesta auth context
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export interface AuthenticatedUser {
  id: string;
  phone: string;       // Masked in logs: 05X****567
  role: string;
  verificationLevel: string;
  trustScore: number;
}

// ─── Main Auth Middleware ─────────────────────────────────────────────────────

/**
 * @description Verifies Firebase ID token and attaches user context to req.user.
 * Resolves Firebase UID → Postgres user via phone number lookup.
 * Returns 401 with Hebrew error message on failure.
 * @hebrew מאמת את טוקן Firebase ומחבר את פרטי המשתמש לבקשה
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json(makeAuthError('MISSING_TOKEN', 'נדרשת התחברות.'));
    return;
  }

  const token = authHeader.slice(7);

  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch (err: any) {
    const isExpired = err?.code === 'auth/id-token-expired';
    res.status(401).json(
      makeAuthError(
        isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
        isExpired ? 'פג תוקף הפגישה. יש להתחבר מחדש.' : 'טוקן לא תקין.'
      )
    );
    return;
  }

  // Resolve Firebase user → Postgres user by phone number
  const phone = decoded.phone_number;
  if (!phone) {
    res.status(401).json(makeAuthError('MISSING_PHONE', 'מספר טלפון חסר בטוקן.'));
    return;
  }

  const user = await prisma.user.findUnique({
    where: { phone },
    select: {
      id: true,
      phone: true,
      role: true,
      verificationLevel: true,
      trustScore: true,
      deletedAt: true,
    },
  });

  if (!user || user.deletedAt) {
    res.status(401).json(makeAuthError('USER_NOT_FOUND', 'המשתמש לא רשום. יש להשלים את תהליך ההרשמה.'));
    return;
  }

  req.user = {
    id: user.id,
    phone: maskPhone(user.phone),
    role: user.role,
    verificationLevel: user.verificationLevel,
    trustScore: user.trustScore,
  };

  next();
}

// ─── Optional Auth (doesn't block unauthenticated requests) ──────────────────

/**
 * @description Attaches user context if token is present and valid, but doesn't block
 * unauthenticated requests. Useful for public browsing with personalization.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();

  try {
    const decoded = await admin.auth().verifyIdToken(authHeader.slice(7));
    const phone = decoded.phone_number;
    if (!phone) return next();

    const user = await prisma.user.findUnique({
      where: { phone },
      select: { id: true, phone: true, role: true, verificationLevel: true, trustScore: true, deletedAt: true },
    });

    if (user && !user.deletedAt) {
      req.user = { ...user, phone: maskPhone(user.phone) };
    }
  } catch {
    // Silent fail — optional auth
  }

  next();
}

// ─── Role Guards ──────────────────────────────────────────────────────────────

/**
 * @description Guards a route to verified users only (ID_VERIFIED or PRO_JESTER).
 * Used for sensitive actions like high-value task creation.
 * @hebrew דורש מהמשתמש לאמת את תעודת הזהות שלו לפני ביצוע הפעולה
 */
export function requireIdVerification(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json(makeAuthError('NOT_AUTHENTICATED', 'נדרשת התחברות.'));
    return;
  }

  const allowed = ['ID_VERIFIED', 'PRO_JESTER', 'ADMIN'];
  if (!allowed.includes(req.user.verificationLevel)) {
    res.status(403).json(
      makeAuthError(
        'ID_VERIFICATION_REQUIRED',
        'נדרש אימות תעודת זהות לביצוע פעולה זו. יש לאמת את הפרטים שלך.'
      )
    );
    return;
  }

  next();
}

/**
 * @description Guards a route to ADMIN role only.
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json(
      makeAuthError('FORBIDDEN', 'אין לך הרשאה לבצע פעולה זו.')
    );
    return;
  }
  next();
}

// ─── Cash Law Guard ───────────────────────────────────────────────────────────

/**
 * @description Middleware that extracts and validates transaction amounts
 * against the Israeli Cash Law (6,000 NIS limit for cash payments).
 * @compliance חוק הגבלת השימוש במזומן — Cash Law 5778-2018
 */
export function cashLawGuard(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const amount = req.body?.amountNis ?? req.body?.agreedPrice;
  const paymentMethod = req.body?.paymentMethod;

  // Cash Law applies only to cash/check payments, not card
  if (paymentMethod === 'cash' && amount > 6_000) {
    res.status(422).json({
      code: 'CASH_LAW_EXCEEDED',
      message: 'Transaction exceeds Israeli Cash Law limit',
      messageHe: 'הסכום חורג ממגבלת חוק הגבלת השימוש במזומן (6,000 ₪). יש לשלם באמצעי תשלום אחר.',
      statusCode: 422,
      meta: { limitNis: 6_000, requestedNis: amount },
    });
    return;
  }

  next();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Masks phone for safe logging: 0521234567 → 052***4567 */
function maskPhone(phone: string): string {
  return phone.replace(/(\+?972|0)(\d{2})(\d+)(\d{3})$/, '$1$2***$4');
}

function makeAuthError(code: string, messageHe: string) {
  return { code, message: code, messageHe, statusCode: 401 };
}
