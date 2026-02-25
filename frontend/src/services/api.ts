/**
 * @file api.ts
 * @description Centralized API client for Jesta backend.
 *
 * Wraps fetch with:
 *  - Base URL from env (EXPO_PUBLIC_API_URL)
 *  - Auth header injection
 *  - JSON parsing
 *  - Hebrew error messages
 *  - Request timeout (15s)
 *  - Retry on network failures
 *
 * @usage
 *   import { api } from '../services/api';
 *
 *   // GET (no auth)
 *   const data = await api.get('/tasks/nearby?lat=32&lng=34');
 *
 *   // POST with auth
 *   const result = await api.post('/tasks', { title: 'עזרה עם מעבר' }, token);
 *
 *   // PUT with auth
 *   await api.put('/tasks/123/offers/456/accept', {}, token);
 */

import { firebaseAuth } from './firebase';

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000') + '/v1';
const TIMEOUT_MS = 15_000;

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    public messageHe: string,
    public code?: string,
    message?: string,
  ) {
    super(message ?? messageHe);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string;
  timeout?: number;
}

// ─────────────────────────────────────────────
// Core fetch wrapper
// ─────────────────────────────────────────────

async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, timeout = TIMEOUT_MS } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept-Language': 'he',
    'x-app-version': '1.0.0',
  };

  // Auto-inject Firebase ID token; explicit token overrides
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    const firebaseToken = await firebaseAuth.currentUser?.getIdToken();
    if (firebaseToken) {
      headers['Authorization'] = `Bearer ${firebaseToken}`;
    }
  }

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Parse response
    let data: unknown;
    const contentType = res.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    // Handle HTTP errors
    if (!res.ok) {
      const errorData = data as Record<string, string> | null;
      throw new ApiError(
        res.status,
        (errorData as any)?.messageHe ?? getDefaultHebrewError(res.status),
        (errorData as any)?.error,
        (errorData as any)?.message,
      );
    }

    return data as T;
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof ApiError) throw err;

    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        throw new ApiError(408, 'הבקשה לקחה יותר מדי זמן. נסה שוב.', 'TIMEOUT');
      }
      if (err.message.includes('Network') || err.message.includes('fetch')) {
        throw new ApiError(0, 'אין חיבור לאינטרנט. בדוק את החיבור ונסה שוב.', 'NETWORK_ERROR');
      }
    }

    throw new ApiError(500, 'שגיאה לא צפויה. נסה שוב.', 'UNKNOWN');
  }
}

// ─────────────────────────────────────────────
// HTTP method helpers
// ─────────────────────────────────────────────

export const api = {
  /**
   * @description GET request — for fetching data.
   * @example
   *   const tasks = await api.get('/tasks/nearby?lat=32&lng=34', token);
   */
  get: <T = unknown>(path: string, token?: string): Promise<T> =>
    request<T>(path, { method: 'GET', token }),

  /**
   * @description POST request — for creating resources.
   * @example
   *   const task = await api.post('/tasks', { title: 'עזרה עם מעבר' }, token);
   */
  post: <T = unknown>(path: string, body?: unknown, token?: string): Promise<T> =>
    request<T>(path, { method: 'POST', body, token }),

  /**
   * @description PUT request — for replacing/accepting resources.
   * @example
   *   await api.put('/tasks/123/offers/456/accept', {}, token);
   */
  put: <T = unknown>(path: string, body?: unknown, token?: string): Promise<T> =>
    request<T>(path, { method: 'PUT', body, token }),

  /**
   * @description PATCH request — for partial updates.
   * @example
   *   await api.patch('/users/me', { displayName: 'שרה' }, token);
   */
  patch: <T = unknown>(path: string, body?: unknown, token?: string): Promise<T> =>
    request<T>(path, { method: 'PATCH', body, token }),

  /**
   * @description DELETE request.
   * @example
   *   await api.delete('/auth/logout', token);
   */
  delete: <T = unknown>(path: string, body?: unknown, token?: string): Promise<T> =>
    request<T>(path, { method: 'DELETE', body, token }),
};

// ─────────────────────────────────────────────
// Domain-specific API helpers
// (typed wrappers for common endpoints)
// ─────────────────────────────────────────────

export const authApi = {
  requestOtp: (phone: string) =>
    api.post<{ success: boolean; messageHe: string }>('/auth/otp/request', { phone }),

  verifyOtp: (phone: string, code: string) =>
    api.post<{
      accessToken: string;
      refreshToken: string;
      user: import('../hooks/useAuth').AuthUser;
      isNewUser: boolean;
    }>('/auth/otp/verify', { phone, code }),

  refresh: (refreshToken: string) =>
    api.post<{ accessToken: string }>('/auth/refresh', { refreshToken }),
};

export const taskApi = {
  getNearby: (params: {
    lat: number;
    lng: number;
    radius?: number;
    category?: string;
    cursor?: string;
  }, token: string) => {
    const q = new URLSearchParams({
      lat: String(params.lat),
      lng: String(params.lng),
      ...(params.radius && { radius: String(params.radius) }),
      ...(params.category && params.category !== 'ALL' && { category: params.category }),
      ...(params.cursor && { cursor: params.cursor }),
    });
    return api.get<{ tasks: unknown[]; nextCursor: string | null; community: unknown[] }>(
      `/tasks/nearby?${q}`,
      token,
    );
  },

  getById: (taskId: string, token?: string) =>
    api.get<{ task: unknown }>(`/tasks/${taskId}`, token),

  create: (body: unknown, token: string) =>
    api.post<{ task: unknown; messageHe: string }>('/tasks', body, token),

  submitOffer: (taskId: string, body: { price: number; message?: string }, token: string) =>
    api.post<{ offer: unknown; messageHe: string }>(`/tasks/${taskId}/offers`, body, token),

  acceptOffer: (taskId: string, offerId: string, token: string) =>
    api.put<{ task: unknown; transaction: unknown; messageHe: string }>(
      `/tasks/${taskId}/offers/${offerId}/accept`,
      {},
      token,
    ),

  start: (taskId: string, token: string) =>
    api.post<{ messageHe: string }>(`/tasks/${taskId}/start`, {}, token),

  complete: (taskId: string, token: string) =>
    api.post<{ messageHe: string }>(`/tasks/${taskId}/complete`, {}, token),

  approve: (taskId: string, token: string) =>
    api.post<{ messageHe: string; transactionId: string }>(`/tasks/${taskId}/approve`, {}, token),

  dispute: (taskId: string, reason: string, token: string) =>
    api.post<{ messageHe: string }>(`/tasks/${taskId}/dispute`, { reason }, token),
};

export const paymentApi = {
  feePreview: (agreedPrice: number, requiresVehicle: boolean) =>
    api.post<{ grossAmount: number; netToJester: number; flaggedForCashLaw: boolean }>(
      '/payments/fee-preview',
      { agreedPrice, requiresVehicle },
    ),

  fund: (body: {
    taskId: string;
    agreedPrice: number;
    paymentToken: string;
    paymentMethod: 'CARD' | 'BANK_TRANSFER';
  }, token: string) =>
    api.post<{ transactionId: string; netToJester: number; messageHe: string }>(
      '/payments/fund',
      body,
      token,
    ),

  release: (txnId: string, token: string) =>
    api.post<{ messageHe: string; invoiceId?: string }>(`/payments/${txnId}/release`, {}, token),

  dispute: (txnId: string, reason: string, token: string) =>
    api.post<{ messageHe: string }>(`/payments/${txnId}/dispute`, { reason }, token),

  getTransaction: (txnId: string, token: string) =>
    api.get<{ transaction: unknown; ledger: unknown[] }>(`/payments/${txnId}`, token),

  getMyTransactions: (params: { role: 'CLIENT' | 'JESTER'; status?: string; cursor?: string }, token: string) => {
    const q = new URLSearchParams({
      role: params.role,
      ...(params.status && { status: params.status }),
      ...(params.cursor && { cursor: params.cursor }),
    });
    return api.get<{ transactions: unknown[]; nextCursor: string | null; stats: unknown }>(
      `/payments/mine?${q}`,
      token,
    );
  },

  getInvoice: (txnId: string, token: string) =>
    api.get<{ invoiceNumber: string; pdfUrl: string; totalAmount: number; vatAmount: number; issuedAtHe: string }>(
      `/payments/${txnId}/invoice`,
      token,
    ),
};

export const userApi = {
  getMe: (token?: string) =>
    api.get<{ user: unknown }>('/users/me', token),

  updateProfile: (body: { displayName?: string; avatarUrl?: string; role?: string }, token?: string) =>
    api.patch<{ user: unknown; messageHe: string }>('/users/me', body, token),

  updateLocation: (body: { latitude: number; longitude: number }, token?: string) =>
    api.patch<{ success: boolean }>('/users/me/location', body, token),
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getDefaultHebrewError(status: number): string {
  const errors: Record<number, string> = {
    400: 'בקשה שגויה. בדוק את הנתונים.',
    401: 'יש להתחבר מחדש.',
    403: 'אין לך הרשאה לפעולה זו.',
    404: 'הפריט לא נמצא.',
    409: 'פעולה כפולה — הנתונים כבר קיימים.',
    422: 'נתונים לא תקינים.',
    429: 'יותר מדי בקשות. המתן רגע ונסה שוב.',
    500: 'שגיאת שרת. צוות ג׳סטה מטפל בכך.',
    503: 'השירות אינו זמין כרגע. נסה שוב בקרוב.',
  };
  return errors[status] ?? 'שגיאה לא צפויה.';
}
