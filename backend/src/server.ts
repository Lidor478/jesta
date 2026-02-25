import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import * as admin from 'firebase-admin';

import { authRouter } from './api/auth.routes';
import { taskRouter } from './api/task.routes';
import paymentRouter from './api/payment.routes';
import { RATE_LIMIT } from './config/constants';

// ── Firebase Admin ──────────────────────────────────────────────────
if (!admin.apps.length) {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  } else {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
  }
}

// ── Express app ─────────────────────────────────────────────────────
const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: RATE_LIMIT.GENERAL_REQUESTS_PER_MINUTE,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// ── Routes ──────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.use('/v1/auth', authRouter);
app.use('/v1/tasks', taskRouter);
app.use('/v1/payments', paymentRouter);

// ── Static frontend (Expo Web build) ────────────────────────────────
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
app.use(express.static(frontendDist));

// SPA fallback — all non-API routes serve index.html
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

// ── Global error handler ────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'שגיאה פנימית בשרת' });
});

// ── Start ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Jesta API running on port ${PORT}`);
});

export default app;
