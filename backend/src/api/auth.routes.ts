/**
 * @file auth.routes.ts
 * @description Auth API routes for Jesta.
 * Thin handlers — all logic delegated to auth.service.ts.
 *
 * Routes:
 *   POST /v1/auth/otp/request     — Send OTP SMS
 *   POST /v1/auth/otp/verify      — Verify OTP, receive JWT
 *   POST /v1/auth/otp/dev-verify  — Dev-only: bypass SMS, return custom token
 *   POST /v1/auth/refresh         — Refresh access token
 *   DELETE /v1/auth/logout        — Invalidate session (client-side + server log)
 *
 * @hebrew נקודות הקצה לאימות משתמשים באפליקציית ג׳סטה
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  requestOtp,
  verifyOtp,
  devVerifyOtp,
  refreshAccessToken,
  normalizeIsraeliPhone,
  AuthError,
} from '../services/auth.service';
import { requireAuth } from '../middleware/auth.middleware';
import { RATE_LIMIT } from '../config/constants';

export const authRouter = Router();

// ─── Rate Limiters ────────────────────────────────────────────────────────────

const otpRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: RATE_LIMIT.OTP_REQUESTS_PER_HOUR,
  keyGenerator: (req) => {
    try {
      return normalizeIsraeliPhone(req.body?.phone ?? '');
    } catch {
      return req.ip ?? 'unknown';
    }
  },
  handler: (_req, res) => {
    res.status(429).json({
      code: 'RATE_LIMITED',
      messageHe: 'שלחת יותר מדי בקשות. נסה שוב בעוד שעה.',
      statusCode: 429,
    });
  },
});

// ─── POST /v1/auth/otp/request ────────────────────────────────────────────────

/**
 * @description Initiates OTP SMS flow for an Israeli phone number.
 * @hebrew שולח קוד SMS למספר הטלפון הנתון
 *
 * Body: { phone: string }  e.g. "0521234567" or "+972521234567"
 * Returns: { sessionToken: string, expiresAt: string }
 */
authRouter.post('/otp/request', otpRateLimiter, async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;

    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({
        code: 'MISSING_PHONE',
        messageHe: 'יש להזין מספר טלפון.',
        statusCode: 400,
      });
    }

    const result = await requestOtp(phone);

    return res.status(200).json({
      sessionToken: result.sessionToken,
      expiresAt: result.expiresAt.toISOString(),
      messageHe: 'קוד אימות נשלח למספר הטלפון שלך.',
    });
  } catch (err) {
    return handleAuthError(err, res);
  }
});

// ─── POST /v1/auth/otp/verify ────────────────────────────────────────────────

/**
 * @description Verifies Firebase OTP token and returns Jesta JWTs.
 * @hebrew מאמת את קוד ה-OTP ומחזיר טוקן גישה לאפליקציה
 *
 * Body: { sessionToken: string, firebaseIdToken: string }
 * Returns: { accessToken, refreshToken, isNewUser, userId }
 */
authRouter.post('/otp/verify', async (req: Request, res: Response) => {
  try {
    const { sessionToken, firebaseIdToken } = req.body;

    if (!sessionToken || !firebaseIdToken) {
      return res.status(400).json({
        code: 'MISSING_FIELDS',
        messageHe: 'חסרים שדות חובה.',
        statusCode: 400,
      });
    }

    const result = await verifyOtp(sessionToken, firebaseIdToken);

    return res.status(200).json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      isNewUser: result.isNewUser,
      userId: result.userId,
      messageHe: result.isNewUser
        ? 'ברוך הבא לג׳סטה! בוא נגדיר את הפרופיל שלך.'
        : 'ברוך שובך לג׳סטה!',
    });
  } catch (err) {
    return handleAuthError(err, res);
  }
});

// ─── POST /v1/auth/otp/dev-verify (dev only) ────────────────────────────────

/**
 * @description Dev-only endpoint that bypasses real SMS OTP verification.
 * Uses Firebase Admin SDK to create a custom token for local development.
 * Returns 404 in non-development environments.
 *
 * @hebrew נקודת קצה לפיתוח — עוקפת אימות SMS אמיתי
 *
 * Body: { sessionToken: string }
 * Returns: { accessToken, refreshToken, isNewUser, userId, customToken }
 */
authRouter.post('/otp/dev-verify', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ messageHe: 'Not found' });
  }

  try {
    const { sessionToken } = req.body;
    if (!sessionToken) {
      return res.status(400).json({ code: 'MISSING_FIELDS', messageHe: 'חסרים שדות חובה.' });
    }

    const result = await devVerifyOtp(sessionToken);
    return res.status(200).json(result);
  } catch (err) {
    return handleAuthError(err, res);
  }
});

// ─── POST /v1/auth/refresh ───────────────────────────────────────────────────

/**
 * @description Issues a new access token from a valid refresh token.
 * @hebrew מחדש את טוקן הגישה
 *
 * Body: { refreshToken: string }
 * Returns: { accessToken: string }
 */
authRouter.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        code: 'MISSING_TOKEN',
        messageHe: 'חסר טוקן רענון.',
        statusCode: 400,
      });
    }

    const accessToken = await refreshAccessToken(refreshToken);
    return res.status(200).json({ accessToken });
  } catch (err) {
    return handleAuthError(err, res);
  }
});

// ─── DELETE /v1/auth/logout ──────────────────────────────────────────────────

/**
 * @description Logs out the current user.
 * In MVP: client discards tokens. In v2: add token blocklist (Redis).
 * @hebrew מתנתק מהאפליקציה
 */
authRouter.delete('/logout', requireAuth, (_req: Request, res: Response) => {
  // TODO v2: Add accessToken to Redis blocklist with TTL = remaining token lifetime
  return res.status(200).json({
    messageHe: 'התנתקת בהצלחה.',
  });
});

// ─── Error Handler ────────────────────────────────────────────────────────────

function handleAuthError(err: unknown, res: Response) {
  if (err instanceof AuthError) {
    return res.status(401).json({
      code: err.code,
      message: err.message,
      messageHe: err.messageHe,
      statusCode: 401,
    });
  }

  console.error('[AuthRoute] Unexpected error:', err);
  return res.status(500).json({
    code: 'INTERNAL_ERROR',
    messageHe: 'אירעה שגיאה. אנא נסה שנית.',
    statusCode: 500,
  });
}
