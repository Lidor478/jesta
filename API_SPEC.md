# 🔌 Jesta API Architecture & Task Matching
> Node.js / TypeScript | Express | Versioned REST API

---

## Architecture Overview

```
Mobile App (React Native)
        │
        │ HTTPS / JWT
        ▼
┌─────────────────────────────────────────┐
│           API Gateway (:3000)           │
│         /v1/* — Versioned Routes        │
├─────────────────────────────────────────┤
│  Middleware Stack (in order):           │
│  1. Rate Limiter (express-rate-limit)   │
│  2. JWT Verifier (Firebase Auth)        │
│  3. RTL Header Injector                 │
│  4. Cash Law Guard (amount checks)      │
│  5. Request Logger                      │
└──────────┬──────────────────────────────┘
           │
    ┌──────┴───────┐
    │              │
    ▼              ▼
 Route          Route
 Handlers       Handlers
    │              │
    └──────┬───────┘
           │ calls
    ┌──────▼───────────────────────────────┐
    │           Service Layer              │
    │  MatchingService  EscrowService      │
    │  KarmaService     InvoiceService     │
    │  InsuranceService                    │
    └──────┬───────────────────────────────┘
           │
    ┌──────▼──────────────────────────────┐
    │     Prisma ORM → PostgreSQL         │
    └─────────────────────────────────────┘
```

---

## API Routes

### Auth (`/v1/auth`)
```
POST /v1/auth/otp/request     → Send SMS OTP to phone number
POST /v1/auth/otp/verify      → Verify OTP, return JWT
POST /v1/auth/refresh         → Refresh JWT
DELETE /v1/auth/logout        → Invalidate token
```

### Users (`/v1/users`)
```
GET  /v1/users/me             → Get own profile
PUT  /v1/users/me             → Update profile
POST /v1/users/me/location    → Update geo-location
POST /v1/users/me/verify-id   → Submit ID verification
GET  /v1/users/:id            → Public profile (limited fields)
GET  /v1/users/:id/reviews    → Public ratings
```

### Tasks (`/v1/tasks`)
```
POST   /v1/tasks              → Create task (Client)
GET    /v1/tasks              → Browse/search tasks (Jester view)
GET    /v1/tasks/nearby       → ★ GEO MATCHING endpoint (see below)
GET    /v1/tasks/:id          → Task detail
PUT    /v1/tasks/:id          → Update task (owner only, OPEN status)
DELETE /v1/tasks/:id          → Cancel task
POST   /v1/tasks/:id/offers   → Submit offer (Jester)
PUT    /v1/tasks/:id/offers/:offerId/accept  → Accept offer (Client)
POST   /v1/tasks/:id/complete → Mark done (Jester)
POST   /v1/tasks/:id/approve  → Approve + trigger escrow release (Client)
POST   /v1/tasks/:id/dispute  → Open dispute
```

### Community (`/v1/community`)
```
GET  /v1/community/tasks      → Browse pro-bono tasks
POST /v1/community/tasks      → Post community task
GET  /v1/users/me/karma       → Karma balance & history
```

### Transactions (`/v1/transactions`)
```
POST /v1/transactions/:taskId/fund    → Client funds escrow
GET  /v1/transactions/:taskId         → Transaction status
```

---

## ★ GPS-Based Task Matching Algorithm

### Endpoint
```
GET /v1/tasks/nearby
```

### Query Parameters
```typescript
interface NearbyTasksQuery {
  lat: number;          // Jester's current latitude
  lng: number;          // Jester's current longitude
  radiusKm?: number;    // Default: 10km
  category?: TaskCategory;
  minPrice?: number;    // NIS
  maxPrice?: number;    // NIS
  sortBy?: 'distance' | 'price' | 'relevance';  // Default: relevance
  page?: number;
  limit?: number;       // Max 50
}
```

### Matching Algorithm (Multi-Factor Scoring)

```typescript
/**
 * @description Scores tasks for a given Jester using multi-factor ranking.
 * Higher score = shown first in feed.
 * @compliance No PII used in scoring — only anonymized geo data.
 */
async function scoreTaskForJester(
  task: Task,
  jester: User,
  distanceKm: number
): Promise<number> {
  let score = 100; // Base score

  // 1. DISTANCE SCORE (40% weight) — closer = better
  //    Score decays exponentially beyond 5km
  const distancePenalty = Math.min(40, distanceKm * 4);
  score -= distancePenalty;

  // 2. PRICE ATTRACTIVENESS (25% weight)
  //    Higher price within reasonable range scores better
  const priceScore = Math.min(25, (task.agreedPrice ?? task.budgetMax) / 100);
  score += priceScore;

  // 3. JESTER CATEGORY MATCH (20% weight)
  //    If jester has history completing this category
  const categoryAffinity = await getCategoryAffinity(jester.id, task.category);
  score += categoryAffinity * 20;

  // 4. TASK URGENCY (10% weight)
  //    Tasks scheduled within 24h get priority
  if (task.scheduledAt) {
    const hoursUntil = (task.scheduledAt.getTime() - Date.now()) / 3600000;
    if (hoursUntil < 24) score += 10;
  }

  // 5. TRUST COMPATIBILITY (5% weight)
  //    High-trust clients slightly prefer high-trust jesters
  score += (jester.trustScore / 100) * 5;

  return Math.max(0, Math.min(100, score));
}
```

### PostgreSQL Geo Query (Phase 1 — Haversine)
```sql
-- Fast Haversine distance filter (no PostGIS needed for MVP)
SELECT 
  t.*,
  (
    6371 * acos(
      cos(radians($jesterLat)) * cos(radians(t.latitude))
      * cos(radians(t.longitude) - radians($jesterLng))
      + sin(radians($jesterLat)) * sin(radians(t.latitude))
    )
  ) AS distance_km
FROM "Task" t
WHERE 
  t.status = 'OPEN'
  AND t."isCommunityTask" = false
  AND (
    6371 * acos(
      cos(radians($jesterLat)) * cos(radians(t.latitude))
      * cos(radians(t.longitude) - radians($jesterLng))
      + sin(radians($jesterLat)) * sin(radians(t.latitude))
    )
  ) <= $radiusKm
ORDER BY distance_km ASC
LIMIT 50;
```

> **Phase 2 Upgrade Path:** Replace Haversine with `PostGIS ST_DWithin()` for production scale. Schema already stores lat/lng columns — no migration needed, just add a PostGIS index.

---

## Trust Score Calculation

```typescript
/**
 * @description Computes Trust Score (0-100) for display and matching.
 * Recalculated on each rating event via background job.
 */
function computeTrustScore(user: User): number {
  const weights = {
    ratingScore: 0.40,        // Avg of client + jester ratings (normalized)
    completionRate: 0.25,     // % tasks completed vs accepted
    verificationLevel: 0.20,  // Unverified=0, Phone=0.33, ID=0.67, Pro=1.0
    tenureScore: 0.15,        // Log scale of account age in days
  };

  const ratingNorm = ((user.clientRatingAvg + user.jesterRatingAvg) / 2) / 5;
  const verMap = { UNVERIFIED: 0, PHONE_VERIFIED: 0.33, ID_VERIFIED: 0.67, PRO_JESTER: 1.0 };
  const verNorm = verMap[user.verificationLevel];
  const tenureNorm = Math.min(1, Math.log10(daysSince(user.createdAt) + 1) / 3);

  return Math.round(
    (ratingNorm * weights.ratingScore +
    verNorm * weights.verificationLevel +
    tenureNorm * weights.tenureScore) * 100
  );
}
```

---

## Error Response Format (Hebrew-aware)

```typescript
interface ApiError {
  code: string;         // e.g. "TASK_NOT_FOUND"
  message: string;      // English (developer-facing)
  messageHe: string;    // Hebrew (user-facing)
  statusCode: number;
  meta?: Record<string, unknown>;
}

// Example:
{
  "code": "CASH_LAW_EXCEEDED",
  "message": "Transaction exceeds Israeli Cash Law limit of 6,000 NIS",
  "messageHe": "העסקה חורגת ממגבלת חוק הגבלת השימוש במזומן (6,000 ₪)",
  "statusCode": 422,
  "meta": { "limitNis": 6000, "requestedNis": 7500 }
}
```
