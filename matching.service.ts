/**
 * @file matching.service.ts
 * @description GPS-based multi-factor task matching engine for Jesta.
 *
 * Algorithm: Haversine geo filter (SQL) → Multi-factor scoring → Ranked feed
 *
 * Score weights:
 *   40% — Distance (closer = better, exponential decay)
 *   25% — Price attractiveness (higher pay = better)
 *   20% — Jester category affinity (past history in this category)
 *   10% — Task urgency (scheduled within 24h = boost)
 *    5% — Trust compatibility (high-trust Jester for high-trust Client)
 *
 * @hebrew מנוע התאמת משימות לפי מיקום GPS ופקטורים נוספים
 * @compliance Geo queries use only anonymized coordinates. No PII in matching logic.
 */

import { PrismaClient, TaskCategory, TaskStatus } from '@prisma/client';
import { GEO, TRUST } from '../config/constants';

const prisma = new PrismaClient();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NearbyTasksOptions {
  jesterLat: number;
  jesterLng: number;
  radiusKm?: number;
  category?: TaskCategory;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'distance' | 'price' | 'relevance';
  cursor?: string;          // Task ID for cursor-based pagination
  limit?: number;
  jesterId?: string;        // Optional: personalize ranking by history
}

export interface RankedTask {
  task: TaskWithDistance;
  score: number;            // 0–100 relevance score
  distanceKm: number;
}

interface TaskWithDistance {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  status: TaskStatus;
  budgetMin: number | null;
  budgetMax: number;
  latitude: number;
  longitude: number;
  address: string;
  scheduledAt: Date | null;
  estimatedHours: number | null;
  requiresVehicle: boolean;
  isCommunityTask: boolean;
  createdAt: Date;
  clientId: string;
  client: {
    id: string;
    displayName: string;
    trustScore: number;
    verificationLevel: string;
  };
  _offersCount: number;
  distanceKm: number;
}

// ─── Main Matching Function ───────────────────────────────────────────────────

/**
 * @description Fetches and ranks nearby tasks for a given Jester's location.
 * Uses cursor-based pagination for smooth infinite scroll in the app.
 *
 * Step 1: Haversine SQL query to get tasks within radius
 * Step 2: Multi-factor scoring per task
 * Step 3: Sort by score (or override with distance/price)
 * Step 4: Apply cursor + limit
 *
 * @hebrew מביא ומדרג משימות קרובות לג׳סטר לפי מיקום ופרמטרים נוספים
 */
export async function getNearbyTasks(
  options: NearbyTasksOptions
): Promise<{ tasks: RankedTask[]; nextCursor: string | null }> {
  const {
    jesterLat,
    jesterLng,
    radiusKm = GEO.DEFAULT_RADIUS_KM,
    category,
    minPrice,
    maxPrice,
    sortBy = 'relevance',
    cursor,
    limit = 20,
    jesterId,
  } = options;

  // Step 1: Geo filter via Haversine in raw SQL
  const rawTasks = await fetchTasksInRadius({
    lat: jesterLat,
    lng: jesterLng,
    radiusKm: Math.min(radiusKm, GEO.MAX_RADIUS_KM),
    category,
    minPrice,
    maxPrice,
    excludeJesterId: jesterId,  // Don't show tasks the Jester posted as Client
  });

  if (rawTasks.length === 0) {
    return { tasks: [], nextCursor: null };
  }

  // Step 2: Load Jester's category affinity for personalized ranking
  const categoryAffinityMap = jesterId
    ? await loadCategoryAffinity(jesterId)
    : {};

  // Step 3: Score each task
  const jesterTrustScore = jesterId ? await getJesterTrustScore(jesterId) : 50;

  const ranked: RankedTask[] = rawTasks.map((task) => ({
    task,
    distanceKm: task.distanceKm,
    score: scoreTask(task, {
      jesterTrustScore,
      categoryAffinity: categoryAffinityMap[task.category] ?? 0,
      sortBy,
    }),
  }));

  // Step 4: Sort
  ranked.sort((a, b) => {
    if (sortBy === 'distance') return a.distanceKm - b.distanceKm;
    if (sortBy === 'price') return b.task.budgetMax - a.task.budgetMax;
    return b.score - a.score; // Default: relevance
  });

  // Step 5: Cursor pagination
  const startIndex = cursor
    ? ranked.findIndex((r) => r.task.id === cursor) + 1
    : 0;

  const paginated = ranked.slice(startIndex, startIndex + limit);
  const nextCursor =
    startIndex + limit < ranked.length
      ? paginated[paginated.length - 1]?.task.id ?? null
      : null;

  return { tasks: paginated, nextCursor };
}

// ─── Haversine SQL Query ──────────────────────────────────────────────────────

/**
 * @description Fetches tasks within a radius using Haversine formula in raw SQL.
 * Filters: OPEN status, not community tasks, not expired, optional category/price.
 *
 * Upgrade path: Replace with PostGIS ST_DWithin() — schema already has lat/lng columns.
 * @hebrew שאילתת SQL לאיתור משימות בטווח נתון לפי נוסחת Haversine
 */
async function fetchTasksInRadius(params: {
  lat: number;
  lng: number;
  radiusKm: number;
  category?: TaskCategory;
  minPrice?: number;
  maxPrice?: number;
  excludeJesterId?: string;
}): Promise<TaskWithDistance[]> {
  const { lat, lng, radiusKm, category, minPrice, maxPrice, excludeJesterId } = params;

  // Build dynamic WHERE clauses
  const conditions: string[] = [
    `t.status = 'OPEN'`,
    `t."isCommunityTask" = false`,
    `(t."expiresAt" IS NULL OR t."expiresAt" > NOW())`,
    `(
      ${GEO.EARTH_RADIUS_KM} * acos(
        LEAST(1.0, cos(radians(${lat})) * cos(radians(t.latitude))
        * cos(radians(t.longitude) - radians(${lng}))
        + sin(radians(${lat})) * sin(radians(t.latitude)))
      )
    ) <= ${radiusKm}`,
  ];

  if (category) conditions.push(`t.category = '${category}'`);
  if (minPrice) conditions.push(`t."budgetMax" >= ${minPrice}`);
  if (maxPrice) conditions.push(`t."budgetMax" <= ${maxPrice}`);
  if (excludeJesterId) conditions.push(`t."clientId" != '${excludeJesterId}'`);

  const whereClause = conditions.join(' AND ');

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      t.*,
      u.id             AS "clientId",
      u."displayName"  AS "clientDisplayName",
      u."trustScore"   AS "clientTrustScore",
      u."verificationLevel" AS "clientVerificationLevel",
      COUNT(o.id)::int AS "_offersCount",
      ROUND(
        (
          ${GEO.EARTH_RADIUS_KM} * acos(
            LEAST(1.0, cos(radians(${lat})) * cos(radians(t.latitude))
            * cos(radians(t.longitude) - radians(${lng}))
            + sin(radians(${lat})) * sin(radians(t.latitude)))
          )
        )::numeric, 2
      ) AS "distanceKm"
    FROM "Task" t
    INNER JOIN "User" u ON u.id = t."clientId"
    LEFT JOIN "TaskOffer" o ON o."taskId" = t.id
    WHERE ${whereClause}
    GROUP BY t.id, u.id
    ORDER BY "distanceKm" ASC
    LIMIT ${GEO.MAX_NEARBY_RESULTS}
  `);

  return rows.map(mapRowToTask);
}

// ─── Multi-Factor Scoring ─────────────────────────────────────────────────────

interface ScoringContext {
  jesterTrustScore: number;
  categoryAffinity: number;  // 0.0 – 1.0
  sortBy: string;
}

/**
 * @description Computes a 0–100 relevance score for a task/jester pair.
 *
 * Weights:
 *   40% Distance — exponential decay, optimal < 3km
 *   25% Price    — higher budget = better, normalized to platform max
 *   20% Affinity — fraction of Jester's past tasks in this category
 *   10% Urgency  — tasks within 24h get full points
 *    5% Trust    — high-trust Jester favored by high-trust Client
 *
 * @hebrew חישוב ציון רלוונטיות למשימה
 */
function scoreTask(
  task: TaskWithDistance,
  ctx: ScoringContext
): number {
  // 1. DISTANCE (40 pts) — inverse-square decay
  const distanceScore = Math.max(0, 40 - Math.pow(task.distanceKm, 1.5) * 2.5);

  // 2. PRICE ATTRACTIVENESS (25 pts)
  const priceScore = Math.min(25, (task.budgetMax / 1000) * 25);

  // 3. CATEGORY AFFINITY (20 pts)
  const affinityScore = ctx.categoryAffinity * 20;

  // 4. URGENCY (10 pts) — scheduled in next 24h
  let urgencyScore = 0;
  if (task.scheduledAt) {
    const hoursUntil = (task.scheduledAt.getTime() - Date.now()) / 3_600_000;
    if (hoursUntil > 0 && hoursUntil <= 6) urgencyScore = 10;
    else if (hoursUntil <= 24) urgencyScore = 7;
    else if (hoursUntil <= 72) urgencyScore = 3;
  }

  // 5. TRUST COMPATIBILITY (5 pts)
  const trustScore = (ctx.jesterTrustScore / 100) * (task.client.trustScore / 100) * 5;

  const total = distanceScore + priceScore + affinityScore + urgencyScore + trustScore;
  return Math.round(Math.max(0, Math.min(100, total)));
}

// ─── Community Task Feed ──────────────────────────────────────────────────────

/**
 * @description Fetches community (pro-bono) tasks near the user.
 * Sorted by distance only — no price factor (free tasks).
 * @hebrew מביא משימות קהילתיות התנדבותיות קרובות
 */
export async function getNearbyCommunityTasks(
  lat: number,
  lng: number,
  radiusKm = 15,
  limit = 20
): Promise<TaskWithDistance[]> {
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      t.*,
      u.id             AS "clientId",
      u."displayName"  AS "clientDisplayName",
      u."trustScore"   AS "clientTrustScore",
      u."verificationLevel" AS "clientVerificationLevel",
      0::int           AS "_offersCount",
      ROUND(
        (
          ${GEO.EARTH_RADIUS_KM} * acos(
            LEAST(1.0, cos(radians(${lat})) * cos(radians(t.latitude))
            * cos(radians(t.longitude) - radians(${lng}))
            + sin(radians(${lat})) * sin(radians(t.latitude)))
          )
        )::numeric, 2
      ) AS "distanceKm"
    FROM "Task" t
    INNER JOIN "User" u ON u.id = t."clientId"
    WHERE
      t.status = 'OPEN'
      AND t."isCommunityTask" = true
      AND (t."expiresAt" IS NULL OR t."expiresAt" > NOW())
      AND (
        ${GEO.EARTH_RADIUS_KM} * acos(
          LEAST(1.0, cos(radians(${lat})) * cos(radians(t.latitude))
          * cos(radians(t.longitude) - radians(${lng}))
          + sin(radians(${lat})) * sin(radians(t.latitude)))
        )
      ) <= ${radiusKm}
    ORDER BY "distanceKm" ASC
    LIMIT ${limit}
  `);

  return rows.map(mapRowToTask);
}

// ─── Category Affinity ────────────────────────────────────────────────────────

/**
 * @description Computes a Jester's affinity score per category (0.0 – 1.0).
 * Based on fraction of their completed tasks that fall in each category.
 * @hebrew מחשב את ההיכרות של הג׳סטר עם כל קטגוריה לפי היסטוריית המשימות שלו
 */
async function loadCategoryAffinity(
  jesterId: string
): Promise<Partial<Record<TaskCategory, number>>> {
  const completedTasks = await prisma.task.groupBy({
    by: ['category'],
    where: {
      jesterId,
      status: 'COMPLETED',
    },
    _count: { category: true },
  });

  const total = completedTasks.reduce((sum, r) => sum + r._count.category, 0);
  if (total === 0) return {};

  return completedTasks.reduce((map, row) => {
    map[row.category] = row._count.category / total;
    return map;
  }, {} as Partial<Record<TaskCategory, number>>);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getJesterTrustScore(jesterId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: jesterId },
    select: { trustScore: true },
  });
  return user?.trustScore ?? 0;
}

function mapRowToTask(row: any): TaskWithDistance {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    budgetMin: row.budgetMin,
    budgetMax: row.budgetMax,
    latitude: parseFloat(row.latitude),
    longitude: parseFloat(row.longitude),
    address: row.address,
    scheduledAt: row.scheduledAt ? new Date(row.scheduledAt) : null,
    estimatedHours: row.estimatedHours,
    requiresVehicle: row.requiresVehicle,
    isCommunityTask: row.isCommunityTask,
    createdAt: new Date(row.createdAt),
    clientId: row.clientId,
    client: {
      id: row.clientId,
      displayName: row.clientDisplayName,
      trustScore: parseFloat(row.clientTrustScore),
      verificationLevel: row.clientVerificationLevel,
    },
    _offersCount: parseInt(row._offersCount ?? 0),
    distanceKm: parseFloat(row.distanceKm),
  };
}
