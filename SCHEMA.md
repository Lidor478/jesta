# 🗄️ Jesta Database Schema
> PostgreSQL via Prisma ORM | Version 1.0

---

## Entity Relationship Overview

```
User ──< Task (as Client)
User ──< TaskOffer (as Jester)
Task ──< TaskOffer
Task ──1 Transaction
Transaction ──< EscrowLedger (append-only)
Task ──< Rating (mutual, one per side)
User ──< KarmaPoints
Task ──< CommunityTask (extends Task)
Transaction ──1 Invoice
```

---

## Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────

enum UserRole {
  CLIENT
  JESTER
  BOTH
  ADMIN
}

enum VerificationLevel {
  UNVERIFIED
  PHONE_VERIFIED    // SMS OTP passed
  ID_VERIFIED       // Israeli ID (תעודת זהות) uploaded
  PRO_JESTER        // Paid 350 NIS vetting fee + ID verified
}

enum TaskStatus {
  DRAFT
  OPEN              // Accepting offers
  ASSIGNED          // Jester selected
  IN_PROGRESS       // Jester working
  PENDING_APPROVAL  // Jester marked done, waiting client
  COMPLETED
  DISPUTED
  CANCELLED
}

enum TaskCategory {
  DRIVING           // Car test, delivery — triggers micro-insurance
  CLEANING          // Car wash, house cleaning
  MOVING            // Furniture, boxes
  ERRANDS           // Shopping, pickup
  TECH_HELP         // Computer, phone help
  ELDERLY_CARE      // Community only
  OTHER
}

enum TransactionStatus {
  PENDING
  HELD_IN_ESCROW
  RELEASED_TO_JESTER
  REFUNDED_TO_CLIENT
  DISPUTED
}

enum EscrowEventType {
  CLIENT_FUNDED
  COMMISSION_HELD
  JESTER_RELEASED
  CLIENT_REFUNDED
  DISPUTE_OPENED
  DISPUTE_RESOLVED
}

// ─────────────────────────────────────────
// USERS
// ─────────────────────────────────────────

model User {
  id                  String            @id @default(cuid())
  phone               String            @unique  // Primary identifier (Israeli format: 05X-XXXXXXX)
  displayName         String
  avatarUrl           String?
  role                UserRole          @default(BOTH)
  verificationLevel   VerificationLevel @default(PHONE_VERIFIED)
  
  // Trust & Reputation
  trustScore          Float             @default(0.0)  // 0–100, computed field
  clientRatingAvg     Float             @default(0.0)
  jesterRatingAvg     Float             @default(0.0)
  completedTasksCount Int               @default(0)
  
  // Israeli Compliance
  isIdVerified        Boolean           @default(false)
  idVerifiedAt        DateTime?
  // NEVER store raw ID number — only verification token from provider
  idVerificationToken String?           
  
  // Geo (last known, for matching)
  lastLatitude        Float?
  lastLongitude       Float?
  lastLocationAt      DateTime?
  
  // Timestamps
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt
  deletedAt           DateTime?         // Soft delete

  // Relations
  tasksAsClient       Task[]            @relation("ClientTasks")
  offers              TaskOffer[]
  ratingsGiven        Rating[]          @relation("RaterUser")
  ratingsReceived     Rating[]          @relation("RatedUser")
  karmaPoints         KarmaPoint[]
  invoices            Invoice[]

  @@index([phone])
  @@index([lastLatitude, lastLongitude])
}

// ─────────────────────────────────────────
// TASKS
// ─────────────────────────────────────────

model Task {
  id              String          @id @default(cuid())
  title           String          // Hebrew text
  description     String          // Hebrew text
  category        TaskCategory
  status          TaskStatus      @default(OPEN)
  isCommunityTask Boolean         @default(false)  // Free / pro-bono
  
  // Pricing (NIS)
  budgetMin       Float?          // Client's range min
  budgetMax       Float           // Client's range max
  agreedPrice     Float?          // Set when offer accepted
  
  // Location (PostGIS-ready)
  latitude        Float
  longitude       Float
  address         String          // Hebrew address string
  radiusKm        Float           @default(5.0)   // Search radius
  
  // Scheduling
  scheduledAt     DateTime?
  estimatedHours  Float?
  
  // Driving-specific (micro-insurance trigger)
  requiresVehicle Boolean         @default(false)
  vehicleType     String?         // "אוטו", "אופנוע", etc.
  
  // Timestamps
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  expiresAt       DateTime?
  completedAt     DateTime?

  // Relations
  clientId        String
  client          User            @relation("ClientTasks", fields: [clientId], references: [id])
  jesterId        String?
  jester          User?           @relation(fields: [jesterId], references: [id])
  offers          TaskOffer[]
  transaction     Transaction?
  ratings         Rating[]
  communityMeta   CommunityTask?

  @@index([status, category])
  @@index([latitude, longitude])
  @@index([isCommunityTask])
}

// ─────────────────────────────────────────
// TASK OFFERS (Jester bidding)
// ─────────────────────────────────────────

model TaskOffer {
  id          String    @id @default(cuid())
  price       Float     // Jester's proposed price (NIS)
  message     String?   // Hebrew pitch message
  eta         DateTime? // When jester can do it
  isAccepted  Boolean   @default(false)
  createdAt   DateTime  @default(now())

  taskId      String
  task        Task      @relation(fields: [taskId], references: [id])
  jesterId    String
  jester      User      @relation(fields: [jesterId], references: [id])

  @@unique([taskId, jesterId])  // One offer per jester per task
  @@index([taskId, isAccepted])
}

// ─────────────────────────────────────────
// TRANSACTIONS & ESCROW
// ─────────────────────────────────────────

model Transaction {
  id                    String            @id @default(cuid())
  status                TransactionStatus @default(PENDING)
  
  // Amounts (NIS) — all stored as precise Floats
  grossAmount           Float   // Full amount client pays
  clientCommission      Float   // 5% of agreed price
  jesterCommission      Float   // 15% of agreed price
  insuranceMarkup       Float   @default(0.0)
  netToJester           Float   // agreed_price * 0.85
  
  // Compliance
  isCashLawCompliant    Boolean @default(true)
  paymentMethod         String  // "card", "bit", "paypal"
  externalPaymentRef    String? // Payment gateway token
  
  // Israeli law: amount limit check
  flaggedForCashLaw     Boolean @default(false)
  
  // Timestamps
  createdAt             DateTime @default(now())
  clientFundedAt        DateTime?
  jesterReleasedAt      DateTime?
  
  // Relations
  taskId                String   @unique
  task                  Task     @relation(fields: [taskId], references: [id])
  ledgerEntries         EscrowLedger[]
  invoice               Invoice?

  @@index([status])
}

// Append-only ledger — NEVER UPDATE, ONLY INSERT
model EscrowLedger {
  id              String          @id @default(cuid())
  eventType       EscrowEventType
  amountNis       Float
  balanceAfter    Float           // Running balance
  note            String?
  createdAt       DateTime        @default(now())
  actorId         String?         // Which user triggered this event
  
  transactionId   String
  transaction     Transaction     @relation(fields: [transactionId], references: [id])

  @@index([transactionId, createdAt])
}

// ─────────────────────────────────────────
// RATINGS
// ─────────────────────────────────────────

model Rating {
  id          String   @id @default(cuid())
  score       Int      // 1–5 stars
  comment     String?  // Hebrew text
  isPublic    Boolean  @default(true)
  createdAt   DateTime @default(now())

  taskId      String
  task        Task     @relation(fields: [taskId], references: [id])
  raterId     String
  rater       User     @relation("RaterUser", fields: [raterId], references: [id])
  ratedId     String
  rated       User     @relation("RatedUser", fields: [ratedId], references: [id])

  @@unique([taskId, raterId])   // One rating per person per task
  @@index([ratedId, score])
}

// ─────────────────────────────────────────
// KARMA POINTS (Community layer)
// ─────────────────────────────────────────

model KarmaPoint {
  id          String   @id @default(cuid())
  points      Int      // Positive = earned, Negative = spent
  reason      String   // "community_task_completed", "fee_discount_applied"
  taskId      String?  // Reference if earned from a task
  createdAt   DateTime @default(now())

  userId      String
  user        User     @relation(fields: [userId], references: [id])

  @@index([userId, createdAt])
}

// ─────────────────────────────────────────
// COMMUNITY TASKS (Meta for pro-bono tasks)
// ─────────────────────────────────────────

model CommunityTask {
  id              String   @id @default(cuid())
  targetGroup     String   // "קשישים", "נזקקים", etc.
  organizationRef String?  // Partnered NGO if any
  karmaAwarded    Int      @default(50)
  verifiedAt      DateTime?  // Admin verifies completion

  taskId          String   @unique
  task            Task     @relation(fields: [taskId], references: [id])
}

// ─────────────────────────────────────────
// INVOICES (Morning / iCount API)
// ─────────────────────────────────────────

model Invoice {
  id              String   @id @default(cuid())
  provider        String   // "morning" | "icount"
  externalId      String   // ID from invoice provider
  documentUrl     String?  // PDF URL
  amountNis       Float
  vatAmountNis    Float    // 17% VAT
  issuedAt        DateTime @default(now())
  
  transactionId   String   @unique
  transaction     Transaction @relation(fields: [transactionId], references: [id])
  recipientId     String
  recipient       User     @relation(fields: [recipientId], references: [id])
}
```

---

## Key Design Decisions

**1. Append-Only EscrowLedger** — Money events are never updated or deleted. Each state change appends a new row. This enables full audit trails required by the 2024 Payment Services Law.

**2. Phone as Primary Identifier** — Israeli users authenticate via SMS OTP. Phone is the unique key, not email.

**3. Soft Deletes on Users** — `deletedAt` nullable field. GDPR-adjacent compliance allows data erasure without breaking transaction history.

**4. PostGIS-Ready Coordinates** — `latitude`/`longitude` on both `User` and `Task` allow easy upgrade to PostGIS `ST_DWithin()` for radius queries without a schema migration.

**5. Trust Score is Computed** — Not stored directly; derived from `clientRatingAvg`, `jesterRatingAvg`, `completedTasksCount`, and `verificationLevel` at query time (or via a nightly materialized view).
