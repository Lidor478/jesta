/**
 * @file user.routes.ts
 * @description User profile REST API routes for Jesta.
 *
 * @hebrew נקודות קצה REST לניהול פרופיל משתמש
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { validate, Schemas } from '../middleware/validation.middleware';
import * as UserService from '../services/user.service';

export const userRouter = Router();

// ─── GET /v1/users/me ─────────────────────────────────────────────────────────

/**
 * @description Returns the authenticated user's full profile.
 * @hebrew מחזיר את פרופיל המשתמש המחובר
 */
userRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await UserService.getProfile(req.user!.id);
    return res.status(200).json({ user });
  } catch (err) {
    return handleError(err, res);
  }
});

// ─── PATCH /v1/users/me ───────────────────────────────────────────────────────

/**
 * @description Updates the authenticated user's profile.
 * @hebrew עדכון פרופיל המשתמש המחובר
 */
userRouter.patch(
  '/me',
  requireAuth,
  validate(Schemas.updateProfile),
  async (req: Request, res: Response) => {
    try {
      const user = await UserService.updateProfile(req.user!.id, req.body);
      return res.status(200).json({ user, messageHe: 'הפרופיל עודכן בהצלחה.' });
    } catch (err) {
      return handleError(err, res);
    }
  }
);

// ─── PATCH /v1/users/me/location ──────────────────────────────────────────────

/**
 * @description Updates the authenticated user's last known location.
 * @hebrew עדכון מיקום אחרון של המשתמש
 */
userRouter.patch(
  '/me/location',
  requireAuth,
  validate(Schemas.updateLocation),
  async (req: Request, res: Response) => {
    try {
      const result = await UserService.updateLocation(req.user!.id, req.body);
      return res.status(200).json(result);
    } catch (err) {
      return handleError(err, res);
    }
  }
);

// ─── Error Handler ────────────────────────────────────────────────────────────

function handleError(err: unknown, res: Response) {
  if (err instanceof UserService.UserError) {
    return res.status(err.status).json({
      code: err.code,
      messageHe: err.messageHe,
      statusCode: err.status,
    });
  }
  if ((err as any)?.code === 'P2025') {
    return res.status(404).json({
      code: 'NOT_FOUND',
      messageHe: 'הרשומה לא נמצאה.',
      statusCode: 404,
    });
  }
  console.error('[UserRoute]', err);
  return res.status(500).json({
    code: 'INTERNAL_ERROR',
    messageHe: 'אירעה שגיאה. אנא נסה שנית.',
    statusCode: 500,
  });
}
