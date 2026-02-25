/**
 * @file rtl.ts
 * @description RTL theme configuration and Hebrew-aware formatting utilities.
 * All UI components should import from here — never hardcode directions/colors.
 *
 * @hebrew הגדרת ממשק ימין-לשמאל (RTL) ועיצוב ישראלי
 */

import { I18nManager, Platform, TextStyle, ViewStyle } from 'react-native';

// ─── Force RTL ────────────────────────────────────────────────────────────────

/**
 * @description Must be called once at app startup (before any render).
 * Forces RTL layout for Hebrew. Requires app restart after first call.
 */
export function initializeRTL(): void {
  if (!I18nManager.isRTL) {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(true);
  }
}

// ─── Color Palette ────────────────────────────────────────────────────────────

export const Colors = {
  // Brand
  primary: '#1A73E8',        // Jesta blue
  primaryDark: '#1557B0',
  primaryLight: '#E8F0FE',
  secondary: '#34A853',      // Community green
  accent: '#FBBC04',         // Karma yellow

  // Neutrals
  background: '#FFFFFF',
  surface: '#F8F9FA',
  border: '#E0E0E0',
  divider: '#F0F0F0',

  // Text
  textPrimary: '#202124',
  textSecondary: '#5F6368',
  textDisabled: '#9AA0A6',
  textInverse: '#FFFFFF',

  // Semantic
  success: '#34A853',
  warning: '#FBBC04',
  error: '#EA4335',
  info: '#1A73E8',

  // Trust score gradient
  trustLow: '#EA4335',
  trustMid: '#FBBC04',
  trustHigh: '#34A853',

  // Community
  communityBackground: '#E8F5E9',
  communityBorder: '#4CAF50',
  karmaGold: '#F9A825',
} as const;

// ─── Typography ───────────────────────────────────────────────────────────────

/** Hebrew font stack — uses system fonts with RTL-aware fallbacks */
export const Fonts = {
  regular: Platform.select({
    ios: 'System',
    android: 'Rubik-Regular',  // Rubik has excellent Hebrew support
    default: 'System',
  }),
  medium: Platform.select({
    ios: 'System',
    android: 'Rubik-Medium',
    default: 'System',
  }),
  bold: Platform.select({
    ios: 'System',
    android: 'Rubik-Bold',
    default: 'System',
  }),
} as const;

export const Typography: Record<string, TextStyle> = {
  h1: { fontSize: 28, fontWeight: '700', color: Colors.textPrimary, textAlign: 'right', writingDirection: 'rtl' },
  h2: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, textAlign: 'right', writingDirection: 'rtl' },
  h3: { fontSize: 18, fontWeight: '600', color: Colors.textPrimary, textAlign: 'right', writingDirection: 'rtl' },
  body: { fontSize: 16, fontWeight: '400', color: Colors.textPrimary, textAlign: 'right', writingDirection: 'rtl' },
  bodySmall: { fontSize: 14, fontWeight: '400', color: Colors.textSecondary, textAlign: 'right', writingDirection: 'rtl' },
  caption: { fontSize: 12, fontWeight: '400', color: Colors.textSecondary, textAlign: 'right', writingDirection: 'rtl' },
  label: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, textAlign: 'right', writingDirection: 'rtl' },
  button: { fontSize: 16, fontWeight: '600', textAlign: 'center', writingDirection: 'rtl' },
};

// ─── Spacing & Layout ─────────────────────────────────────────────────────────

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 100,
} as const;

/** RTL-aware row: reverses flex direction to flow right→left */
export const RTLRow: ViewStyle = {
  flexDirection: 'row-reverse',
  alignItems: 'center',
};

/** RTL-aware padding (start = right in RTL) */
export function rtlPadding(start: number, end: number = start): ViewStyle {
  return {
    paddingRight: start,  // In RTL, "start" is right
    paddingLeft: end,
  };
}

// ─── Shadows ──────────────────────────────────────────────────────────────────

export const Shadows = {
  sm: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
    android: { elevation: 2 },
  }),
  md: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8 },
    android: { elevation: 4 },
  }),
  lg: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 16 },
    android: { elevation: 8 },
  }),
} as const;

// ─── Hebrew Formatting Utilities ──────────────────────────────────────────────

/**
 * @description Formats a NIS amount in Hebrew locale with ₪ symbol.
 * @hebrew מעצב סכום כסף בשקלים בפורמט ישראלי
 * @example formatNIS(1234.5) → "₪1,234.50"
 */
export function formatNIS(amount: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * @description Formats a date in Israeli format (DD/MM/YYYY).
 * @hebrew מעצב תאריך בפורמט ישראלי
 * @example formatDate(new Date()) → "15/06/2025"
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/**
 * @description Formats a relative time string in Hebrew.
 * @hebrew מחזיר זמן יחסי בעברית
 */
export function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'עכשיו';
  if (minutes < 60) return `לפני ${minutes} דקות`;
  if (hours < 24) return `לפני ${hours} שעות`;
  if (days === 1) return 'אתמול';
  if (days < 7) return `לפני ${days} ימים`;
  return formatDate(date);
}

/**
 * @description Formats a distance in Israeli style (km with decimal or meters).
 * @hebrew מעצב מרחק בק״מ בפורמט ישראלי
 */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} מ׳`;
  if (km < 10) return `${km.toFixed(1)} ק״מ`;
  return `${Math.round(km)} ק״מ`;
}

/**
 * @description Normalizes an Israeli phone for display: +972521234567 → 052-123-4567
 * @hebrew מעצב מספר טלפון ישראלי לתצוגה
 */
export function formatIsraeliPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('972')) {
    const local = '0' + digits.slice(3);
    return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
  }
  if (digits.length === 10 && digits.startsWith('0')) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

/**
 * @description Returns Hebrew greeting based on time of day.
 * @hebrew מחזיר ברכה מתאימה לשעה ביום
 */
export function getHebrewGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'בוקר טוב';
  if (hour >= 12 && hour < 17) return 'צהריים טובים';
  if (hour >= 17 && hour < 21) return 'ערב טוב';
  return 'לילה טוב';
}

/**
 * @description Computes color for trust score visualization.
 * @hebrew צבע לציון האמינות
 */
export function trustScoreColor(score: number): string {
  if (score >= 70) return Colors.trustHigh;
  if (score >= 40) return Colors.trustMid;
  return Colors.trustLow;
}

// ─── i18n Interpolation ───────────────────────────────────────────────────────

/**
 * @description Simple template interpolation for Hebrew strings with variables.
 * @example interpolate("שלום {{name}}", { name: "ישראל" }) → "שלום ישראל"
 */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (str, [key, value]) => str.replace(new RegExp(`{{${key}}}`, 'g'), String(value)),
    template
  );
}
