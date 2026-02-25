/**
 * @file auth.service.ts
 * @description Authentication service for Jesta.
 * Handles SMS OTP via Firebase Auth, JWT issuance, and new user provisioning.
 *
 * @hebrew שירות האימות של ג׳סטה — שליחת קוד OTP ואימות מספר טלפון ישראלי
 * @compliance Phone is the primary identity key. Raw Israeli ID (ת.ז.) is NEVER stored here.
 * @approvalGate Changes require explicit re-approval per CLAUDE.md
 */

import * as admin from 'firebase-admin';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { AUTH, RATE_LIMIT } from '../config/constants';

const prisma = new PrismaClient();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OtpRequestResult {
  sessionToken: string; // Firebase verificationId (client uses this to verify OTP)
  expiresAt: Date;
}

export interface OtpVerifyResult {
  accessToken: string;
  refreshToken: string;
  isNewUser: boolean;
  userId: string;
}

export interface JestaJwtPayload {
  sub: string;       // userId (cuid)
  phone: string;     // normalized Israeli phone
  role: string;      // UserRole
  iat: number;
  exp: number;
}

// ─── Phone Normalization ──────────────────────────────────────────────────────

/**
 * @description Normalizes an Israeli phone number to E.164 format (+972XXXXXXXXX).
 * Handles inputs like: 052-1234567, 0521234567, +972521234567
 * @hebrew ממיר מספר טלפון ישראלי לפורמט בינלאומי
 */
export function normalizeIsraeliPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');

  if (digits.startsWith('972')) {
    return `+${digits}`;
  }
  if (digits.startsWith('0') && digits.length === 10) {
    return `+972${digits.slice(1)}`;
  }
  throw new Error(`Invalid Israeli phone number: ${raw}`);
}

/**
 * @description Validates that a phone number is an Israeli mobile number.
 * Valid prefixes: 050, 051, 052, 053, 054, 055, 058
 * @hebrew בודק שמספר הטלפון הוא מספר ישראלי תקין
 */
export function validateIsraeliPhone(normalized: string): boolean {
  // E.164: +972 5X XXXXXXXX
  return /^\+9725[0-9]{8}$/.test(normalized);
}

// ─── OTP Flow ─────────────────────────────────────────────────────────────────

/**
 * @description Sends an OTP SMS to the given Israeli phone number via Firebase.
 * Firebase handles OTP generation, delivery, and the session token.
 * Rate limited to RATE_LIMIT.OTP_REQUESTS_PER_HOUR per phone.
 *
 * NOTE: Firebase Phone Auth sends the SMS directly — the server only initiates
 * the session. The client SDK handles the actual OTP input and verification.
 * For server-side custom OTP (e.g., Twilio), swap this function's internals.
 *
 * @hebrew שולח SMS עם קוד אימות למספר הטלפון
 */
export async function requestOtp(rawPhone: string): Promise<OtpRequestResult> {
  const phone = normalizeIsraeliPhone(rawPhone);

  if (!validateIsraeliPhone(phone)) {
    throw new AuthError('INVALID_PHONE', 'מספר הטלפון אינו תקין. יש להזין מספר ישראלי.');
  }

  // Check rate limit via Redis (simplified — swap for actual Redis in prod)
  await checkOtpRateLimit(phone);

  // Firebase Admin SDK: generate a custom session for phone auth
  // The client app receives this and uses Firebase Client SDK to complete OTP
  const expiresAt = new Date(Date.now() + AUTH.OTP_EXPIRY_MINUTES * 60 * 1000);

  // Generate a server-side session token to tie client/server session
  const sessionToken = jwt.sign(
    { phone, purpose: 'otp_session' },
    process.env.JWT_SECRET!,
    { expiresIn: `${AUTH.OTP_EXPIRY_MINUTES}m` }
  );

  // Log OTP request for rate limiting (in prod: store in Redis with TTL)
  await logOtpRequest(phone);

  return { sessionToken, expiresAt };
}

/**
 * @description Verifies an OTP using Firebase ID Token (sent from client after OTP input).
 * On success: finds or creates Jesta user, returns JWT access + refresh tokens.
 *
 * @hebrew מאמת את קוד ה-OTP שהוזן ומנפיק טוקן גישה
 * @compliance New users get PHONE_VERIFIED status. Full ID verification is separate.
 */
export async function verifyOtp(
  sessionToken: string,
  firebaseIdToken: string
): Promise<OtpVerifyResult> {
  // Validate session token
  let sessionPayload: { phone: string; purpose: string };
  try {
    sessionPayload = jwt.verify(sessionToken, process.env.JWT_SECRET!) as any;
  } catch {
    throw new AuthError('SESSION_EXPIRED', 'הפגישה פגה. יש לבקש קוד חדש.');
  }

  if (sessionPayload.purpose !== 'otp_session') {
    throw new AuthError('INVALID_SESSION', 'טוקן לא תקין.');
  }

  // Verify Firebase ID Token (proves user received and entered the OTP)
  let firebaseUser: admin.auth.DecodedIdToken;
  try {
    firebaseUser = await admin.auth().verifyIdToken(firebaseIdToken);
  } catch {
    throw new AuthError('INVALID_OTP', 'הקוד שהוזן שגוי או פג תוקף.');
  }

  // Ensure the Firebase token's phone matches the session's phone
  const verifiedPhone = firebaseUser.phone_number;
  if (!verifiedPhone || verifiedPhone !== sessionPayload.phone) {
    throw new AuthError('PHONE_MISMATCH', 'אי התאמה במספר הטלפון.');
  }

  // Find or create Jesta user
  const { user, isNewUser } = await findOrCreateUser(verifiedPhone);

  // Issue Jesta JWTs
  const accessToken = issueAccessToken(user);
  const refreshToken = issueRefreshToken(user.id);

  return {
    accessToken,
    refreshToken,
    isNewUser,
    userId: user.id,
  };
}

// ─── User Provisioning ────────────────────────────────────────────────────────

/**
 * @description Finds an existing user by phone or creates a new one.
 * New users are created with PHONE_VERIFIED status and default BOTH role.
 *
 * @hebrew מוצא משתמש קיים או יוצר משתמש חדש עם מספר הטלפון
 */
async function findOrCreateUser(
  phone: string
): Promise<{ user: any; isNewUser: boolean }> {
  const existing = await prisma.user.findUnique({ where: { phone } });

  if (existing) {
    // Update last seen (optional — omit if you prefer not to track)
    return { user: existing, isNewUser: false };
  }

  // Create new user with defaults
  const newUser = await prisma.user.create({
    data: {
      phone,
      displayName: '', // Collected during onboarding flow
      role: 'BOTH',
      verificationLevel: 'PHONE_VERIFIED',
      trustScore: 0,
    },
  });

  return { user: newUser, isNewUser: true };
}

// ─── JWT Issuance ─────────────────────────────────────────────────────────────

function issueAccessToken(user: { id: string; phone: string; role: string }): string {
  return jwt.sign(
    {
      sub: user.id,
      phone: user.phone,
      role: user.role,
    } satisfies Omit<JestaJwtPayload, 'iat' | 'exp'>,
    process.env.JWT_SECRET!,
    { expiresIn: AUTH.JWT_ACCESS_EXPIRY }
  );
}

function issueRefreshToken(userId: string): string {
  return jwt.sign(
    { sub: userId, purpose: 'refresh' },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: AUTH.JWT_REFRESH_EXPIRY }
  );
}

/**
 * @description Refreshes an access token using a valid refresh token.
 * @hebrew מחדש טוקן גישה פג תוקף
 */
export async function refreshAccessToken(refreshToken: string): Promise<string> {
  let payload: { sub: string; purpose: string };
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as any;
  } catch {
    throw new AuthError('REFRESH_EXPIRED', 'נדרשת התחברות מחדש.');
  }

  if (payload.purpose !== 'refresh') {
    throw new AuthError('INVALID_TOKEN', 'טוקן לא תקין.');
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
  return issueAccessToken(user);
}

// ─── Dev Auth Bypass ─────────────────────────────────────────────────────────

/**
 * @description Dev-only OTP bypass using Firebase Admin SDK custom tokens.
 * Skips real SMS verification — creates a Firebase user and custom token directly.
 * Throws immediately if NODE_ENV !== 'development'.
 *
 * @hebrew עוקף אימות SMS לפיתוח מקומי — יוצר משתמש Firebase ישירות
 */
export async function devVerifyOtp(sessionToken: string): Promise<OtpVerifyResult & { customToken: string }> {
  if (process.env.NODE_ENV !== 'development') {
    throw new AuthError('NOT_ALLOWED', 'Dev bypass not available.');
  }

  // Validate session token (same as normal flow)
  let sessionPayload: { phone: string; purpose: string };
  try {
    sessionPayload = jwt.verify(sessionToken, process.env.JWT_SECRET!) as any;
  } catch {
    throw new AuthError('SESSION_EXPIRED', 'הפגישה פגה. יש לבקש קוד חדש.');
  }

  if (sessionPayload.purpose !== 'otp_session') {
    throw new AuthError('INVALID_SESSION', 'טוקן לא תקין.');
  }

  // Get or create Firebase Auth user with this phone number
  let firebaseUser: admin.auth.UserRecord;
  try {
    firebaseUser = await admin.auth().getUserByPhoneNumber(sessionPayload.phone);
  } catch {
    firebaseUser = await admin.auth().createUser({ phoneNumber: sessionPayload.phone });
  }

  // Create custom token so client can sign in
  const customToken = await admin.auth().createCustomToken(firebaseUser.uid);

  // Find or create Jesta user (same as normal flow)
  const { user, isNewUser } = await findOrCreateUser(sessionPayload.phone);

  const accessToken = issueAccessToken(user);
  const refreshToken = issueRefreshToken(user.id);

  return { accessToken, refreshToken, isNewUser, userId: user.id, customToken };
}

// ─── Rate Limiting Helpers ─────────────────────────────────────────────────────

/** In production: replace with Redis INCR + EXPIRE */
const otpRequestLog = new Map<string, number[]>();

async function checkOtpRateLimit(phone: string): Promise<void> {
  const now = Date.now();
  const hourAgo = now - 3_600_000;
  const requests = (otpRequestLog.get(phone) ?? []).filter((t) => t > hourAgo);

  if (requests.length >= RATE_LIMIT.OTP_REQUESTS_PER_HOUR) {
    throw new AuthError(
      'RATE_LIMITED',
      `שלחת יותר מדי בקשות. נסה שוב בעוד שעה.`
    );
  }
}

async function logOtpRequest(phone: string): Promise<void> {
  const now = Date.now();
  const hourAgo = now - 3_600_000;
  const prev = (otpRequestLog.get(phone) ?? []).filter((t) => t > hourAgo);
  otpRequestLog.set(phone, [...prev, now]);
}

// ─── Custom Error ─────────────────────────────────────────────────────────────

export class AuthError extends Error {
  constructor(
    public readonly code: string,
    /** @hebrew הודעת שגיאה בעברית למשתמש */
    public readonly messageHe: string
  ) {
    super(code);
    this.name = 'AuthError';
  }
}
