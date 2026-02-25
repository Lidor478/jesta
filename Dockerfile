# ── Stage 1: Build frontend ──────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npx expo export --platform web

# ── Stage 2: Build backend ──────────────────────────────────────────
FROM node:20-alpine AS backend-build

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/ ./
RUN npx prisma generate && npm run build

# ── Stage 3: Production ────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Copy backend build + production deps
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY --from=backend-build /app/backend/dist ./backend/dist
COPY --from=backend-build /app/backend/node_modules/.prisma ./backend/node_modules/.prisma
COPY --from=backend-build /app/backend/node_modules/@prisma ./backend/node_modules/@prisma
COPY backend/prisma ./backend/prisma

# Copy frontend static files
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "backend/dist/server.js"]
