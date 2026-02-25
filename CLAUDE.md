# 🟢 CLAUDE.md — Jesta Project Bible
> **Lead AI Architect Protocol Document** | Version 1.0 | Hebrew P2P Task Marketplace

---

## 📌 Project Identity

| Field        | Value                                              |
|--------------|----------------------------------------------------|
| **Name**     | ג׳סטה (Jesta)                                      |
| **Type**     | Peer-to-Peer Task Marketplace + Community Platform |
| **Market**   | 🇮🇱 Israel (Hebrew-first, RTL, NIS currency)       |
| **Stage**    | MVP                                                |
| **Stack**    | Node.js/TypeScript + React Native + PostgreSQL     |

---

## 🏗️ Repository Structure

```
jesta/
├── CLAUDE.md                    ← YOU ARE HERE
├── backend/
│   ├── src/
│   │   ├── api/                 ← Route handlers (versioned: /v1/...)
│   │   │   ├── tasks/
│   │   │   ├── users/
│   │   │   ├── transactions/
│   │   │   ├── ratings/
│   │   │   └── community/
│   │   ├── services/            ← Business logic layer
│   │   │   ├── escrow.service.ts
│   │   │   ├── matching.service.ts
│   │   │   ├── karma.service.ts
│   │   │   ├── invoice.service.ts
│   │   │   └── insurance.service.ts
│   │   ├── models/
│   │   ├── middleware/
│   │   └── config/
│   │       └── constants.ts     ← ALL business rule constants here
│   ├── prisma/schema.prisma
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── screens/
│   │   ├── components/
│   │   ├── i18n/he.json         ← Hebrew strings ONLY
│   │   └── theme/rtl.ts         ← RTL theme
│   └── package.json
└── docs/
    ├── SCHEMA.md
    ├── API_SPEC.md
    └── ESCROW_FLOW.md
```

---

## 🤖 AI Working Protocol (Plan → Act → Reflect)

### RULE 1 — Always Plan Before Coding
Before writing any code or schema changes, I will:
1. **Propose** the architectural change with rationale
2. **List** affected files and data models
3. **Wait** for explicit approval before proceeding

### RULE 2 — Modularity is Non-Negotiable
- Every service must be independently testable
- No business logic in route handlers — services only
- All magic numbers live in `config/constants.ts` only

### RULE 3 — Hebrew/RTL is a First-Class Citizen
- All user-facing strings → `i18n/he.json` (never hardcoded)
- All layouts default to `direction: rtl`
- Dates: `DD/MM/YYYY` format
- Currency: NIS (₪), formatted with `Intl.NumberFormat('he-IL')`

### RULE 4 — Security & Compliance First
- Israeli Cash Law: block/flag transactions > 6,000 NIS cash
- 2024 Payment Services Law: escrow mandatory
- Identity: store only hashed/tokenized IDs, never raw

### RULE 5 — Code Documentation
Every function must have JSDoc with:
- `@description` in English
- `@hebrew` if the function has Hebrew UX impact
- `@compliance` if the function touches money or identity

---

## 💰 Business Rules (Immutable Constants)

```typescript
// config/constants.ts
export const FEES = {
  JESTER_COMMISSION: 0.15,        // 15% from Jester
  CLIENT_COMMISSION: 0.05,        // 5% from Client
  PRO_JESTER_VETTING_FEE: 350,    // NIS one-time
  MICRO_INSURANCE_MARKUP: 0.03,   // 3% for driving tasks
} as const;

export const LIMITS = {
  CASH_LAW_MAX_NIS: 6000,         // Israeli Cash Law cap
  MIN_TASK_PRICE_NIS: 50,
  MAX_TASK_PRICE_NIS: 10000,
  ESCROW_HOLD_DAYS: 7,            // Auto-release after dispute window
} as const;

export const KARMA = {
  COMMUNITY_TASK_POINTS: 50,
  DISCOUNT_PER_100_POINTS: 0.01,  // 1% fee discount per 100 karma
  MAX_KARMA_DISCOUNT: 0.05,       // 5% cap
} as const;
```

---

## 🚦 Approval Gates (Require Explicit Re-Approval)

- `prisma/schema.prisma` — Any schema migration
- `services/escrow.service.ts` — Money flow changes
- `config/constants.ts` — Any business rule changes
- `middleware/auth.ts` — Security logic

---

## 📅 MVP Phase Plan

| Phase | Deliverable                                    | Status   |
|-------|------------------------------------------------|----------|
| 1     | DB Schema + Prisma models                      | ✅ Done  |
| 2     | Auth (OTP) + Hebrew onboarding                 | 📋 Next  |
| 3     | Task CRUD + Geo-matching API                   | 📋 Next  |
| 4     | Escrow flow (pay→hold→release)                 | 📋 Next  |
| 5     | Rating system + Trust Score                    | 🟡 Later |
| 6     | Community tasks + Karma                        | 🟡 Later |
| 7     | Morning API invoice integration                | 🟡 Later |
| 8     | Pro Jester vetting + micro-insurance           | 🟢 Future|
