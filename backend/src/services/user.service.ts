/**
 * @file user.service.ts
 * @description User profile management service for Jesta.
 *
 * Handles: getProfile, updateProfile, updateLocation
 *
 * @hebrew שירות ניהול פרופיל משתמש בפלטפורמת ג׳סטה
 */

import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Types ────────────────────────────────────────────────────────────────────

export class UserError extends Error {
  constructor(
    public readonly code: string,
    public readonly messageHe: string,
    public readonly status: number = 400
  ) {
    super(code);
    this.name = 'UserError';
  }
}

// ─── Get Profile ──────────────────────────────────────────────────────────────

/**
 * @description Fetches the user's full profile including karma points count.
 * @hebrew מביא את פרופיל המשתמש המלא כולל ספירת נקודות קארמה
 */
export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      phone: true,
      displayName: true,
      avatarUrl: true,
      role: true,
      verificationLevel: true,
      trustScore: true,
      clientRatingAvg: true,
      jesterRatingAvg: true,
      completedTasksCount: true,
      isIdVerified: true,
      lastLatitude: true,
      lastLongitude: true,
      createdAt: true,
      _count: { select: { karmaPoints: true } },
    },
  });

  if (!user) {
    throw new UserError('USER_NOT_FOUND', 'המשתמש לא נמצא.', 404);
  }

  return user;
}

// ─── Update Profile ───────────────────────────────────────────────────────────

/**
 * @description Updates user profile fields (displayName, avatarUrl, role).
 * @hebrew עדכון פרטי פרופיל המשתמש
 */
export async function updateProfile(
  userId: string,
  updates: { displayName?: string; avatarUrl?: string; role?: UserRole }
) {
  if (updates.displayName !== undefined) {
    const name = updates.displayName.trim();
    if (name.length < 2 || name.length > 60) {
      throw new UserError('INVALID_NAME', 'השם חייב להכיל בין 2 ל-60 תווים.');
    }
    updates.displayName = name;
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: updates,
    select: {
      id: true,
      phone: true,
      displayName: true,
      avatarUrl: true,
      role: true,
      verificationLevel: true,
      trustScore: true,
      completedTasksCount: true,
      isIdVerified: true,
      _count: { select: { karmaPoints: true } },
    },
  });

  return user;
}

// ─── Update Location ──────────────────────────────────────────────────────────

/**
 * @description Updates the user's last known location for geo-matching.
 * @hebrew עדכון מיקום אחרון של המשתמש
 */
export async function updateLocation(
  userId: string,
  coords: { latitude: number; longitude: number }
) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      lastLatitude: coords.latitude,
      lastLongitude: coords.longitude,
      lastLocationAt: new Date(),
    },
  });

  return { success: true };
}
