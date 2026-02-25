/**
 * @file constants.ts
 * @description Jesta immutable business rule constants.
 * ⚠️  APPROVAL GATE: Changes to this file require explicit re-approval.
 * @compliance Israeli Cash Law, 2024 Payment Services Law, VAT 17%
 */

// ─── Platform Fees ───────────────────────────────────────────────────────────

export const FEES = {
  /** Commission charged to Jester (deducted from payout) */
  JESTER_COMMISSION: 0.15,
  /** Commission charged to Client (added on top of agreed price) */
  CLIENT_COMMISSION: 0.05,
  /** One-time Pro Jester vetting fee in NIS */
  PRO_JESTER_VETTING_FEE_NIS: 350,
  /** Markup for driving/vehicle tasks (micro-insurance cost) */
  MICRO_INSURANCE_MARKUP: 0.03,
  /** Israeli VAT rate */
  VAT_RATE: 0.17,
} as const;

// ─── Transaction Limits ───────────────────────────────────────────────────────

export const LIMITS = {
  /** Israeli Cash Law (חוק הגבלת השימוש במזומן) — flag above this amount */
  CASH_LAW_MAX_NIS: 6_000,
  /** Minimum task price */
  MIN_TASK_PRICE_NIS: 50,
  /** Maximum task price */
  MAX_TASK_PRICE_NIS: 10_000,
  /** Days before escrow auto-releases to Jester */
  ESCROW_HOLD_DAYS: 7,
  /** Days before an open task auto-expires */
  TASK_EXPIRY_DAYS: 30,
} as const;

// ─── Karma / Community ────────────────────────────────────────────────────────

export const KARMA = {
  /** Points awarded per completed community task */
  COMMUNITY_TASK_POINTS: 50,
  /** Fee discount per 100 karma points (1%) */
  DISCOUNT_PER_100_POINTS: 0.01,
  /** Maximum karma-derived fee discount (5%) */
  MAX_KARMA_DISCOUNT: 0.05,
} as const;

// ─── Authentication ───────────────────────────────────────────────────────────

export const AUTH = {
  /** OTP code length */
  OTP_LENGTH: 6,
  /** OTP validity window in minutes */
  OTP_EXPIRY_MINUTES: 10,
  /** Max OTP attempts before lockout */
  OTP_MAX_ATTEMPTS: 5,
  /** Lockout duration in minutes after too many OTP failures */
  OTP_LOCKOUT_MINUTES: 30,
  /** JWT access token expiry */
  JWT_ACCESS_EXPIRY: '15m',
  /** JWT refresh token expiry */
  JWT_REFRESH_EXPIRY: '30d',
  /** Israeli phone regex: 05X-XXXXXXX or +9725XXXXXXXX */
  ISRAELI_PHONE_REGEX: /^(\+9725|\+972-05|05)[0-9]{8}$|^05[0-9]-[0-9]{7}$/,
} as const;

// ─── Geo / Matching ───────────────────────────────────────────────────────────

export const GEO = {
  /** Default task search radius in km */
  DEFAULT_RADIUS_KM: 10,
  /** Maximum allowed search radius */
  MAX_RADIUS_KM: 50,
  /** Earth radius constant for Haversine formula */
  EARTH_RADIUS_KM: 6_371,
  /** Max results per geo query */
  MAX_NEARBY_RESULTS: 50,
} as const;

// ─── Trust Score Weights ──────────────────────────────────────────────────────

export const TRUST = {
  WEIGHT_RATING: 0.40,
  WEIGHT_COMPLETION_RATE: 0.25,
  WEIGHT_VERIFICATION: 0.20,
  WEIGHT_TENURE: 0.15,
  /** Verification level multipliers */
  VERIFICATION_MULTIPLIER: {
    UNVERIFIED: 0,
    PHONE_VERIFIED: 0.33,
    ID_VERIFIED: 0.67,
    PRO_JESTER: 1.0,
  },
} as const;

// ─── Rate Limiting ────────────────────────────────────────────────────────────

export const RATE_LIMIT = {
  /** OTP requests per phone per hour */
  OTP_REQUESTS_PER_HOUR: 5,
  /** General API requests per IP per minute */
  GENERAL_REQUESTS_PER_MINUTE: 100,
} as const;
