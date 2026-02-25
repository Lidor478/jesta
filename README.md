# Jesta (G'esta)

> Peer-to-peer task marketplace for Israel — Hebrew-first, RTL, built with React Native + Node.js + PostgreSQL

## What is Jesta?

Jesta is a community-driven marketplace where people can post everyday tasks (moving help, deliveries, handyman work, errands) and others in their area can offer to help — for a fair price. Think of it as a local, peer-to-peer TaskRabbit built specifically for the Israeli market, with Hebrew UI, NIS currency, and compliance with Israeli financial regulations.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React Native (Expo 50), TypeScript |
| **Backend** | Node.js, Express, TypeScript |
| **Database** | PostgreSQL + Prisma ORM |
| **Auth** | Firebase Phone Auth (OTP via SMS) |
| **Payments** | Escrow-based with Israeli Cash Law compliance |

## Key Features

- **Phone-based auth** — Firebase OTP verification with Israeli phone number validation
- **Geo-matching** — Find tasks and helpers nearby using location-based search
- **Escrow payments** — Funds are held securely until task completion and approval
- **Trust scores** — Rating system combining completion rate, reviews, and verification level
- **Karma system** — Earn points for community (pro-bono) tasks, get fee discounts
- **Hebrew-first** — Full RTL layout, all UI strings in Hebrew, dates in DD/MM/YYYY, NIS currency
- **Israeli compliance** — Cash Law enforcement (6,000 NIS cap), VAT 17%, invoice integration

## Project Structure

```
jesta/
├── CLAUDE.md                 # AI architect protocol & project bible
├── README.md                 # You are here
│
├── # Frontend (React Native / Expo)
├── useAuth.ts                # Firebase auth state hook + context provider
├── PhoneInputScreen.tsx      # Phone number input with Israeli validation
├── OtpVerifyScreen.tsx       # 6-digit OTP verification
├── SplashScreen.tsx          # Onboarding intro slides
├── TaskFeedScreen.tsx        # Nearby task listing
├── TaskDetailScreen.tsx      # Task detail view
├── PostTaskScreen.tsx        # Task creation form
├── FundEscrowScreen.tsx      # Payment / escrow funding
├── TransactionHistoryScreen.tsx  # Payment history
├── InvoiceViewerScreen.tsx   # Invoice display
├── api.ts                    # API client with auto Firebase token injection
├── rtl.ts                    # RTL theme, colors, typography
├── he.json                   # Hebrew i18n strings
├── frontend-package.json     # Frontend dependencies
│
├── # Backend (Node.js / Express)
├── auth.service.ts           # OTP flow, Firebase verification, JWT issuance
├── auth.routes.ts            # Auth API endpoints
├── auth.middleware.ts         # Firebase ID token verification middleware
├── task.service.ts           # Task CRUD + geo-matching logic
├── task.routes.ts            # Task API endpoints
├── escrow.service.ts         # Escrow hold/release/dispute logic
├── payment.routes.ts         # Payment API endpoints
├── matching.service.ts       # Jester-task matching algorithm
├── morning.client.ts         # Morning API invoice integration
├── validation.middleware.ts  # Request validation
├── constants.ts              # Business rules (fees, limits, karma)
├── backend-package.json      # Backend dependencies
│
├── # Documentation
├── SCHEMA.md                 # Full Prisma schema documentation
├── API_SPEC.md               # API endpoint specification
└── ESCROW_FLOW.md            # Escrow payment flow documentation
```

## Business Rules

| Rule | Value |
|------|-------|
| Jester commission | 15% |
| Client commission | 5% |
| Cash Law limit | 6,000 NIS |
| Task price range | 50–10,000 NIS |
| Escrow hold period | 7 days |
| Karma per community task | 50 points |
| Max karma fee discount | 5% |

## MVP Roadmap

| Phase | Deliverable | Status |
|-------|------------|--------|
| 1 | DB Schema + Prisma models | Done |
| 2 | Auth (OTP) + Hebrew onboarding | In Progress |
| 3 | Task CRUD + Geo-matching API | Next |
| 4 | Escrow flow (pay, hold, release) | Next |
| 5 | Rating system + Trust Score | Later |
| 6 | Community tasks + Karma | Later |
| 7 | Morning API invoice integration | Later |
| 8 | Pro Jester vetting + micro-insurance | Future |

## License

All rights reserved.
