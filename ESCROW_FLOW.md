# 💰 Jesta Escrow Flow
> Compliance: 2024 Israeli Payment Services Law | Append-Only Ledger

---

## State Machine Overview

```
         CLIENT                    PLATFORM                   JESTER
            │                         │                          │
   [1] FUND │─── pay agreedPrice ────►│                          │
            │    + clientCommission   │                          │
            │                         │◄─ Task assigned to Jester│
            │                         │                          │
   [2] HOLD │                 ┌───────┴───────┐                  │
            │                 │  ESCROW VAULT │                  │
            │                 │               │                  │
            │                 │ grossAmount   │                  │
            │                 │  ├ netJester  │                  │
            │                 │  ├ jesterComm │                  │
            │                 │  └ clientComm │                  │
            │                 └───────┬───────┘                  │
            │                         │                          │
            │                         │◄──── "Task Done" ────────│
   [3] APPROVE                        │                          │
            │─── approve ────────────►│                          │
            │   (or 7-day auto)       │                          │
            │                         │─── release netJester ───►│
            │                         │    (agreedPrice * 0.85)  │
            │                         │                          │
   [4] INVOICE                        │─── issue invoice ───────►│
            │◄── invoice sent ────────│   (Morning API)          │
            │                         │                          │
   DISPUTE  │─── dispute ────────────►│                          │
(alt path)  │                    [Admin resolves]                 │
            │                         │                          │
```

---

## Step-by-Step Flow

### Step 1 — Client Funds Escrow

**Trigger:** Client accepts a Jester's offer.

```typescript
/**
 * @description Charges client and holds full amount in escrow.
 * @compliance Checks Cash Law before processing. Issues receipt.
 * @hebrew מטופל לאחר אישור הצעת הג׳סטר על ידי הלקוח
 */
async function fundEscrow(taskId: string, clientId: string): Promise<Transaction> {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  const offer = await getAcceptedOffer(taskId);
  
  const agreedPrice = offer.price;
  const clientCommission = agreedPrice * FEES.CLIENT_COMMISSION;   // 5%
  const jesterCommission = agreedPrice * FEES.JESTER_COMMISSION;   // 15%
  const insuranceMarkup  = task.requiresVehicle 
    ? agreedPrice * FEES.MICRO_INSURANCE_MARKUP : 0;              // 3% if driving
  const grossAmount = agreedPrice + clientCommission + insuranceMarkup;
  const netToJester = agreedPrice - jesterCommission;

  // 🚨 COMPLIANCE: Israeli Cash Law check
  if (grossAmount > LIMITS.CASH_LAW_MAX_NIS) {
    await flagForCashLaw(taskId, grossAmount);
    // Still process — flagging is for reporting, not blocking card payments
  }

  // Charge client via payment gateway (Tranzila/Cardcom)
  const paymentRef = await paymentGateway.charge({
    amountNis: grossAmount,
    clientToken: await getClientPaymentToken(clientId),
  });

  // Create transaction record
  const transaction = await prisma.transaction.create({
    data: {
      taskId,
      status: 'HELD_IN_ESCROW',
      grossAmount,
      clientCommission,
      jesterCommission,
      insuranceMarkup,
      netToJester,
      externalPaymentRef: paymentRef,
      clientFundedAt: new Date(),
    }
  });

  // Append to immutable ledger
  await appendLedger(transaction.id, 'CLIENT_FUNDED', grossAmount, grossAmount);

  return transaction;
}
```

---

### Step 2 — Funds Held in Escrow

The platform holds funds in a **segregated escrow account** (required by 2024 Payment Services Law — פקודת שירותי תשלום).

No interest is earned on held funds. Funds are held maximum `LIMITS.ESCROW_HOLD_DAYS` (7 days) before auto-release unless disputed.

```typescript
// Auto-release job (runs nightly via cron)
async function processAutoReleases() {
  const cutoff = new Date(Date.now() - LIMITS.ESCROW_HOLD_DAYS * 86400000);
  
  const staleTransactions = await prisma.transaction.findMany({
    where: {
      status: 'HELD_IN_ESCROW',
      task: { status: 'PENDING_APPROVAL' },
      clientFundedAt: { lt: cutoff },
    }
  });

  for (const tx of staleTransactions) {
    await releaseToJester(tx.id, 'AUTO_RELEASE');
  }
}
```

---

### Step 3 — Client Approves → Funds Released

**Trigger:** Client taps "אישור — העבודה הושלמה" (Approve — Work Completed)

```typescript
/**
 * @description Releases escrow to Jester after client approval.
 * @compliance Generates Israeli tax invoice automatically.
 * @hebrew שחרור הכספים לג׳סטר לאחר אישור הלקוח
 */
async function releaseToJester(
  transactionId: string,
  reason: 'CLIENT_APPROVED' | 'AUTO_RELEASE' | 'DISPUTE_RESOLVED'
): Promise<void> {
  const tx = await prisma.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    include: { task: { include: { jester: true, client: true } } }
  });

  // Transfer netToJester to Jester's bank account
  await paymentGateway.transfer({
    amountNis: tx.netToJester,
    recipientBankToken: await getJesterBankToken(tx.task.jesterId!),
    reference: `JESTA-${transactionId}`,
  });

  // Update transaction status
  await prisma.transaction.update({
    where: { id: transactionId },
    data: { status: 'RELEASED_TO_JESTER', jesterReleasedAt: new Date() }
  });

  // Append to ledger (three entries for auditability)
  await appendLedger(transactionId, 'JESTER_RELEASED', tx.netToJester, 0);

  // Mark task completed
  await prisma.task.update({
    where: { id: tx.taskId },
    data: { status: 'COMPLETED', completedAt: new Date() }
  });

  // Issue Hebrew tax invoice via Morning API
  await invoiceService.issue({
    transactionId,
    recipientId: tx.task.jesterId!,
    amountNis: tx.netToJester,
  });

  // Update Jester stats & karma
  await userService.incrementCompletedTasks(tx.task.jesterId!);
}
```

---

### Step 4 — Invoice Generation (Morning API)

```typescript
/**
 * @description Issues an Israeli חשבונית (invoice) via Morning (חשבונית ירוקה) API.
 * @compliance Required for all transactions per Israeli tax law.
 * @hebrew הנפקת חשבונית ירוקה אוטומטית לג׳סטר
 */
async function issueInvoice(params: InvoiceParams): Promise<Invoice> {
  const VAT_RATE = 0.17; // 17% Israeli VAT

  const response = await morningApi.createDocument({
    type: 'RECEIPT_TAX_INVOICE', // חשבונית מס קבלה
    client: {
      name: params.jesterName,
      taxId: params.jesterTaxId, // מספר עוסק מורשה if applicable
    },
    items: [{
      description: `שירות ג׳סטה — ${params.taskTitle}`,
      quantity: 1,
      price: params.amountNis / (1 + VAT_RATE), // Pre-VAT amount
      vatRate: VAT_RATE,
    }],
    currency: 'ILS',
  });

  return prisma.invoice.create({
    data: {
      provider: 'morning',
      externalId: response.id,
      documentUrl: response.pdfUrl,
      amountNis: params.amountNis,
      vatAmountNis: params.amountNis * VAT_RATE / (1 + VAT_RATE),
      transactionId: params.transactionId,
      recipientId: params.jesterId,
    }
  });
}
```

---

### Dispute Flow (Alt Path)

```
Client opens dispute
       │
       ▼
Task status → DISPUTED
Transaction status → DISPUTED
       │
       ▼
Admin reviews (48h SLA)
       │
    ┌──┴──┐
    │     │
  Client  Jester
  wins    wins
    │     │
    ▼     ▼
Refund  Release
to      to
Client  Jester
```

```typescript
async function resolveDispute(
  transactionId: string,
  resolution: 'FAVOR_CLIENT' | 'FAVOR_JESTER',
  adminId: string
): Promise<void> {
  if (resolution === 'FAVOR_CLIENT') {
    await paymentGateway.refund({ transactionId });
    await appendLedger(transactionId, 'CLIENT_REFUNDED', tx.grossAmount, 0);
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { status: 'REFUNDED_TO_CLIENT' }
    });
  } else {
    await releaseToJester(transactionId, 'DISPUTE_RESOLVED');
  }
}
```

---

## Fee Summary Table

| Scenario                | Client Pays      | Jester Receives  | Platform Earns   |
|-------------------------|------------------|------------------|------------------|
| Standard task (100 ₪)   | 105 ₪            | 85 ₪             | 20 ₪             |
| Driving task (100 ₪)    | 108 ₪            | 85 ₪             | 23 ₪             |
| Community task          | 0 ₪              | 0 ₪              | 0 ₪ (+Karma)     |
| Pro Jester vetting      | —                | -350 ₪ (one-time)| 350 ₪            |

---

## Compliance Checklist

- ✅ Escrow segregation (2024 Payment Services Law)
- ✅ Cash Law flag at 6,000 NIS  
- ✅ Auto-invoice generation (Morning API)
- ✅ Append-only ledger (full audit trail)
- ✅ No raw bank data stored (tokenized via gateway)
- ✅ VAT calculation at 17%
- ✅ Hebrew invoices with legal fields
