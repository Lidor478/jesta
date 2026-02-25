/**
 * @file validation.middleware.ts
 * @description Zod schema validation middleware with Hebrew error messages.
 * Wrap any route handler with `validate(schema)` to get typed, safe request bodies.
 *
 * @hebrew middleware לוולידציה של בקשות עם הודעות שגיאה בעברית
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';
import { AUTH, LIMITS } from '../config/constants';

// ─── Validate Middleware Factory ──────────────────────────────────────────────

/**
 * @description Returns a middleware that validates req.body against the given Zod schema.
 * On failure: returns 400 with Hebrew field-level errors.
 */
export function validate<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = formatZodErrors(result.error);
      res.status(400).json({
        code: 'VALIDATION_ERROR',
        messageHe: 'יש שגיאות בנתונים שהוזנו. אנא בדוק את השדות.',
        fields: errors,
        statusCode: 400,
      });
      return;
    }

    // Attach parsed (typed + coerced) data to req.body
    req.body = result.data;
    next();
  };
}

/** Same as validate() but for query params */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        code: 'INVALID_QUERY',
        messageHe: 'פרמטרים לא תקינים בבקשה.',
        fields: formatZodErrors(result.error),
        statusCode: 400,
      });
      return;
    }
    req.query = result.data as any;
    next();
  };
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

/** Hebrew error messages per field type */
const hebrewMessages = {
  required: 'שדה חובה',
  string: 'חייב להיות טקסט',
  number: 'חייב להיות מספר',
  email: 'כתובת אימייל לא תקינה',
  min: (n: number) => `מינימום ${n} תווים`,
  max: (n: number) => `מקסימום ${n} תווים`,
  positive: 'חייב להיות מספר חיובי',
} as const;

export const Schemas = {

  // ─── Task Creation ─────────────────────────────────────────────────────────

  createTask: z.object({
    title: z
      .string({ required_error: hebrewMessages.required })
      .min(5, { message: hebrewMessages.min(5) })
      .max(100, { message: hebrewMessages.max(100) }),

    description: z
      .string({ required_error: hebrewMessages.required })
      .min(10, { message: hebrewMessages.min(10) })
      .max(2000, { message: hebrewMessages.max(2000) }),

    category: z.enum(
      ['DRIVING', 'CLEANING', 'MOVING', 'ERRANDS', 'TECH_HELP', 'ELDERLY_CARE', 'OTHER'],
      { required_error: hebrewMessages.required }
    ),

    budgetMin: z.number().positive({ message: hebrewMessages.positive }).optional(),

    budgetMax: z
      .number({ required_error: hebrewMessages.required })
      .positive({ message: hebrewMessages.positive })
      .max(LIMITS.MAX_TASK_PRICE_NIS, { message: `מקסימום ${LIMITS.MAX_TASK_PRICE_NIS} ₪` }),

    latitude: z
      .number({ required_error: hebrewMessages.required })
      .min(29.5, { message: 'קואורדינטות מחוץ לגבולות ישראל' })
      .max(33.5, { message: 'קואורדינטות מחוץ לגבולות ישראל' }),

    longitude: z
      .number({ required_error: hebrewMessages.required })
      .min(34.0, { message: 'קואורדינטות מחוץ לגבולות ישראל' })
      .max(36.0, { message: 'קואורדינטות מחוץ לגבולות ישראל' }),

    address: z
      .string({ required_error: hebrewMessages.required })
      .min(5, { message: hebrewMessages.min(5) })
      .max(200),

    scheduledAt: z.string().datetime().optional(),
    estimatedHours: z.number().positive().max(48).optional(),
    isCommunityTask: z.boolean().default(false),
    requiresVehicle: z.boolean().default(false),
    vehicleType: z.string().max(50).optional(),
  }).refine(
    (data) => !data.budgetMin || data.budgetMin < data.budgetMax,
    { message: 'התקציב המינימלי חייב להיות קטן מהמקסימלי', path: ['budgetMin'] }
  ).refine(
    (data) => data.budgetMax >= LIMITS.MIN_TASK_PRICE_NIS,
    { message: `מחיר מינימלי הוא ${LIMITS.MIN_TASK_PRICE_NIS} ₪`, path: ['budgetMax'] }
  ),

  // ─── Task Offer ────────────────────────────────────────────────────────────

  createOffer: z.object({
    price: z
      .number({ required_error: hebrewMessages.required })
      .positive({ message: hebrewMessages.positive })
      .max(LIMITS.MAX_TASK_PRICE_NIS),

    message: z.string().max(500).optional(),
    eta: z.string().datetime().optional(),
  }),

  // ─── Nearby Tasks Query ────────────────────────────────────────────────────

  nearbyQuery: z.object({
    lat: z.coerce.number().min(29.5).max(33.5),
    lng: z.coerce.number().min(34.0).max(36.0),
    radiusKm: z.coerce.number().positive().max(50).default(10),
    category: z
      .enum(['DRIVING', 'CLEANING', 'MOVING', 'ERRANDS', 'TECH_HELP', 'ELDERLY_CARE', 'OTHER'])
      .optional(),
    minPrice: z.coerce.number().positive().optional(),
    maxPrice: z.coerce.number().positive().optional(),
    sortBy: z.enum(['distance', 'price', 'relevance']).default('relevance'),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().positive().max(50).default(20),
  }),

  // ─── User Location Update ──────────────────────────────────────────────────

  updateLocation: z.object({
    latitude: z.number().min(29.5).max(33.5),
    longitude: z.number().min(34.0).max(36.0),
  }),
};

// ─── Error Formatter ──────────────────────────────────────────────────────────

function formatZodErrors(error: ZodError): Record<string, string> {
  return error.errors.reduce((acc, err) => {
    const field = err.path.join('.');
    acc[field] = err.message;
    return acc;
  }, {} as Record<string, string>);
}
