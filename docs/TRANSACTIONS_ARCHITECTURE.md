# Transaction Architecture - Complete Redesign

## 🎯 Core Principles

1. **DB is the complete source of truth** - All transaction data lives in our database
2. **Stripe webhook amounts are authoritative** - We trust Stripe's numbers for updates
3. **Refunds are events, not status** - Track each refund as a separate record
4. **Payment state is independent from refund state** - A transaction can be PAID and have refunds
5. **No computed fields** - Store real values, compute derived values in queries/UI

---

## 📊 Data Model

### Transaction (The Purchase)

Represents a single purchase, regardless of payment type.

```typescript
{
  // Identity
  id: string
  organizationId: string
  leadId: string | null

  // Financial Tracking (Source of Truth)
  originalAmount: number    // Original purchase price - NEVER changes
  paidAmount: number        // Total successfully paid (sum from payments)
  refundedAmount: number    // Total refunded (sum from payments)
  currency: string

  // Payment Lifecycle
  paymentStatus: TransactionPaymentStatus  // Current payment state
  billingType: BillingType                 // ONE_TIME, RECURRING, SPLIT_PAYMENT

  // Payment Tracking
  totalPayments: number       // Expected payments (1, N, or ∞)
  successfulPayments: number  // Count of successful payments

  // Stripe References
  stripePaymentIntentId: string | null  // ONE_TIME only
  stripeSubscriptionId: string | null   // RECURRING/SPLIT_PAYMENT only
  stripeCustomerId: string | null
  paymentLinkId: string | null

  // Timestamps
  createdAt: DateTime
  updatedAt: DateTime
  firstPaidAt: DateTime | null      // When first payment succeeded
  lastPaidAt: DateTime | null       // Most recent successful payment
  fullyPaidAt: DateTime | null      // When all payments completed (SPLIT_PAYMENT)
  canceledAt: DateTime | null

  // Relations
  payments: TransactionPayment[]
  items: TransactionItem[]
  lead: Lead | null
  paymentLink: PaymentLink | null
}
```

### TransactionPayment (Individual Payment)

Each successful payment creates one record. For subscriptions, multiple records over time.

```typescript
{
  // Identity
  id: string
  transactionId: string

  // Payment Details (Authoritative from Stripe)
  amount: number          // Payment amount from Stripe (source of truth)
  refundedAmount: number  // Refunded amount from Stripe (source of truth)
  currency: string

  // Payment State
  status: PaymentStatus   // PENDING, PROCESSING, SUCCEEDED, FAILED
  paymentNumber: number   // Sequence: 1, 2, 3...

  // Stripe References
  stripePaymentIntentId: string | null  // From invoice or direct payment
  stripeInvoiceId: string | null        // For RECURRING/SPLIT_PAYMENT
  stripeChargeId: string | null         // For refund tracking

  // Timestamps
  createdAt: DateTime
  updatedAt: DateTime
  paidAt: DateTime | null
  failedAt: DateTime | null
  refundedAt: DateTime | null  // When first refund occurred

  // Failure Info
  failureReason: string | null

  // Relations
  refunds: PaymentRefund[]
  transaction: Transaction
}
```

### PaymentRefund (Refund Event) - NEW TABLE

Each refund operation creates a separate record. Allows multiple partial refunds.

```typescript
{
  // Identity
  id: string
  paymentId: string

  // Refund Details (From Stripe)
  amount: number       // Refund amount from Stripe webhook
  currency: string
  reason: string | null  // duplicate, fraudulent, requested_by_customer

  // Stripe Reference
  stripeRefundId: string  // Unique - ensures idempotency

  // Timestamps
  createdAt: DateTime
  processedAt: DateTime | null  // When Stripe processed it

  // Relations
  payment: TransactionPayment
}
```

---

## 🔄 Payment Flow States

### TransactionPaymentStatus

Represents the payment lifecycle (independent of refunds).

```typescript
enum TransactionPaymentStatus {
  AWAITING_PAYMENT  // Waiting for first payment
  PARTIALLY_PAID    // Some payments made (SPLIT_PAYMENT only)
  PAID              // All payments completed
  ACTIVE            // Active subscription (RECURRING only)
  FAILED            // Payment failed
  CANCELED          // Canceled by user/admin
  DISPUTED          // Chargeback
}
```

### PaymentStatus (Individual Payment)

```typescript
enum PaymentStatus {
  PENDING      // Payment initiated
  PROCESSING   // Payment processing
  SUCCEEDED    // Payment succeeded
  FAILED       // Payment failed
}
```

**Note**: We removed `REFUNDED` and `PARTIALLY_REFUNDED` from PaymentStatus.
Refund state is determined by checking `payment.refundedAmount` and the `refunds` relation.

---

## 💰 Amount Calculations

### Transaction Level

```typescript
// Stored in DB
originalAmount: 100000    // $1000.00 - Original purchase price
paidAmount: 100000        // $1000.00 - Sum of successful payments
refundedAmount: 30000     // $300.00  - Sum of all refunds

// Computed in queries/UI (NOT stored)
netAmount = paidAmount - refundedAmount           // $700.00 - What merchant received
remainingToPay = originalAmount - paidAmount      // $0.00   - What customer still owes
```

### Payment Level

```typescript
// Stored in DB
amount: 20000             // $200.00 - Payment amount from Stripe
refundedAmount: 5000      // $50.00  - Sum of refunds for this payment

// Computed in UI (NOT stored)
netAmount = amount - refundedAmount               // $150.00 - Net for this payment
isFullyRefunded = refundedAmount >= amount        // false
canRefund = status === 'SUCCEEDED' && netAmount > 0  // true
```

---

## 🎯 Webhook Event Handlers

### 1. invoice.paid (RECURRING / SPLIT_PAYMENT)

When a subscription invoice is paid:

```typescript
1. Extract amount_paid from Stripe invoice (source of truth)
2. Create TransactionPayment record:
   - amount = invoice.amount_paid
   - status = SUCCEEDED
   - paymentNumber = transaction.successfulPayments + 1
   - stripeInvoiceId = invoice.id
   - stripeChargeId = invoice.charge
   - paidAt = now()

3. Update Transaction:
   - paidAmount += invoice.amount_paid
   - successfulPayments += 1
   - lastPaidAt = now()
   - firstPaidAt = now() (if first payment)

4. Update paymentStatus based on billing type:
   - SPLIT_PAYMENT:
     - If successfulPayments >= totalPayments: PAID
     - Else: PARTIALLY_PAID
   - RECURRING: ACTIVE

5. Update Lead CLTV:
   - cltv += invoice.amount_paid / 100
   - status = ACTIVE
```

### 2. payment_intent.succeeded (ONE_TIME)

When a one-time payment succeeds:

```typescript
1. Extract amount_received from Stripe (source of truth)
2. Create TransactionPayment record:
   - amount = paymentIntent.amount_received
   - status = SUCCEEDED
   - paymentNumber = 1
   - stripePaymentIntentId = paymentIntent.id
   - paidAt = now()

3. Update Transaction:
   - paidAmount = paymentIntent.amount_received
   - successfulPayments = 1
   - paymentStatus = PAID
   - firstPaidAt = now()
   - lastPaidAt = now()
   - fullyPaidAt = now()

4. Update Lead CLTV:
   - cltv += paymentIntent.amount_received / 100
   - status = ACTIVE
```

### 3. charge.refunded (ALL PAYMENT TYPES)

When a refund is processed:

```typescript
1. Extract refund details from charge.refunds.data[0]
2. Check if refund already exists (idempotency):
   - Look up PaymentRefund by stripeRefundId
   - If exists, return early (already processed)

3. Find the payment:
   - If charge.invoice exists: Find by stripeInvoiceId
   - Else: Find by stripeChargeId

4. Create PaymentRefund record:
   - paymentId = payment.id
   - amount = refund.amount (from Stripe)
   - stripeRefundId = refund.id
   - reason = refund.reason
   - processedAt = refund.created

5. Recalculate payment.refundedAmount:
   - Sum ALL PaymentRefund records for this payment
   - SET payment.refundedAmount = sum
   - SET payment.refundedAt = now() (if first refund)

6. Recalculate transaction.refundedAmount:
   - Sum refundedAmount from ALL TransactionPayment records
   - SET transaction.refundedAmount = sum

7. Update Lead CLTV:
   - cltv -= refund.amount / 100 (only this refund, not total)
```

**Key Points:**
- Each refund creates a new `PaymentRefund` record
- We always SET (not increment) refundedAmount by summing from child records
- This ensures idempotency - duplicate webhooks just skip step 4
- Lead CLTV only decrements by the new refund amount

### 4. customer.subscription.deleted (RECURRING / SPLIT_PAYMENT)

When a subscription is canceled:

```typescript
1. Find Transaction by stripeSubscriptionId
2. Update Transaction:
   - paymentStatus = CANCELED
   - canceledAt = now()
```

### 5. charge.dispute.created (ALL PAYMENT TYPES)

When a chargeback occurs:

```typescript
1. Find Transaction by stripePaymentIntentId or via TransactionPayment
2. Update Transaction:
   - paymentStatus = DISPUTED
3. Update metadata with dispute info:
   - chargebackReason = dispute.reason
   - chargebackAmount = dispute.amount
   - chargebackAt = now()
4. Update Lead CLTV:
   - cltv -= dispute.amount / 100
```

---

## 🎨 UI Display Patterns

### Transaction Detail Page

```typescript
function TransactionDetail({ transactionId }) {
  const transaction = await getTransactionById(transactionId)

  // Compute derived values (fast - just subtraction)
  const netAmount = transaction.paidAmount - transaction.refundedAmount
  const remainingToPay = transaction.originalAmount - transaction.paidAmount
  const hasRefunds = transaction.refundedAmount > 0

  return (
    <div>
      {/* Payment Summary */}
      <Card>
        <Row label="Original Amount">
          {formatCurrency(transaction.originalAmount)}
        </Row>

        <Row label="Total Paid" className="text-green-600">
          {formatCurrency(transaction.paidAmount)}
        </Row>

        {remainingToPay > 0 && (
          <Row label="Remaining" className="text-orange-600">
            {formatCurrency(remainingToPay)}
          </Row>
        )}

        {/* Refund Section (only if has refunds) */}
        {hasRefunds && (
          <div className="border-t mt-4 pt-4">
            <Row label="Total Refunded" className="text-red-600">
              -{formatCurrency(transaction.refundedAmount)}
            </Row>

            <Row label="Net Received" className="font-bold text-lg">
              {formatCurrency(netAmount)}
            </Row>
          </div>
        )}
      </Card>

      {/* Payment History (for multi-payment) */}
      {transaction.billingType !== 'ONE_TIME' && (
        <Card>
          <h3>Payment History</h3>
          {transaction.payments.map(payment => (
            <PaymentRow
              key={payment.id}
              payment={payment}
              canRefund={canRefund}
              onRefund={handleRefund}
            />
          ))}
        </Card>
      )}

      {/* Refund History (if has refunds) */}
      {hasRefunds && (
        <Card>
          <h3>Refund History</h3>
          {getAllRefunds(transaction).map(refund => (
            <RefundRow key={refund.id} refund={refund} />
          ))}
        </Card>
      )}
    </div>
  )
}
```

### Payment Row Component

```typescript
function PaymentRow({ payment, canRefund, onRefund }) {
  const paymentNet = payment.amount - payment.refundedAmount
  const hasRefund = payment.refundedAmount > 0
  const isFullyRefunded = payment.refundedAmount >= payment.amount

  return (
    <div className="flex items-center justify-between">
      {/* Payment info */}
      <div>
        <div>Payment {payment.paymentNumber}</div>
        <div className="text-sm text-gray-500">
          {formatDate(payment.paidAt)}
        </div>
      </div>

      {/* Amounts */}
      <div className="text-right">
        {/* Original amount (strike through if refunded) */}
        <div className={cn(hasRefund && "line-through text-gray-400")}>
          {formatCurrency(payment.amount)}
        </div>

        {/* Refund info */}
        {hasRefund && (
          <div className="text-sm space-y-1">
            <div className="text-red-600">
              -{formatCurrency(payment.refundedAmount)} refunded
            </div>
            {!isFullyRefunded && (
              <div className="text-green-600 font-medium">
                {formatCurrency(paymentNet)} net
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {canRefund && payment.status === 'SUCCEEDED' && paymentNet > 0 && (
        <Button onClick={() => onRefund(payment.id)}>
          Refund
        </Button>
      )}
    </div>
  )
}
```

---

## 📈 Metrics & Reporting

All metrics can be calculated directly from the database without Stripe API calls:

```typescript
// Revenue metrics
const metrics = await prisma.transaction.aggregate({
  where: { organizationId },
  _sum: {
    paidAmount: true,      // Total gross revenue
    refundedAmount: true,  // Total refunds
  },
})

const grossRevenue = metrics._sum.paidAmount || 0
const totalRefunds = metrics._sum.refundedAmount || 0
const netRevenue = grossRevenue - totalRefunds
const refundRate = grossRevenue > 0 ? (totalRefunds / grossRevenue) * 100 : 0

return {
  grossRevenue: grossRevenue / 100,
  totalRefunds: totalRefunds / 100,
  netRevenue: netRevenue / 100,
  refundRate,
}
```

---

## ✅ Migration Checklist

### Schema Changes

- [ ] Add `TransactionPaymentStatus` enum
- [ ] Add `PaymentRefund` table
- [ ] Update `Transaction` fields:
  - [ ] Rename `status` to `paymentStatus` with new enum
  - [ ] Rename `amount` to `originalAmount`
  - [ ] Add `paidAmount` (default 0)
  - [ ] Update `refundedAmount` (keep existing)
  - [ ] Add `billingType` field
  - [ ] Rename `completedPayments` to `successfulPayments`
  - [ ] Remove `completedAt`, add `firstPaidAt`, `lastPaidAt`, `fullyPaidAt`
- [ ] Update `TransactionPayment` fields:
  - [ ] Add `stripeChargeId`
  - [ ] Remove `REFUNDED`/`PARTIALLY_REFUNDED` from status enum
- [ ] Add indexes for new fields

### Code Changes

- [ ] Update `payment-link.service.ts` webhook handlers
- [ ] Update `transaction.service.ts` CRUD operations
- [ ] Update `connect-webhook/route.ts` event routing
- [ ] Update tRPC transaction router
- [ ] Update transaction types
- [ ] Rebuild transaction detail UI
- [ ] Update transaction table UI
- [ ] Update refund dialogs

### Testing

- [ ] Test ONE_TIME payment flow
- [ ] Test RECURRING payment flow
- [ ] Test SPLIT_PAYMENT flow
- [ ] Test full refund (ONE_TIME)
- [ ] Test partial refund (ONE_TIME)
- [ ] Test full refund (single payment in SPLIT_PAYMENT)
- [ ] Test partial refund (single payment in SPLIT_PAYMENT)
- [ ] Test multiple partial refunds on same payment
- [ ] Test refund on RECURRING payment
- [ ] Test duplicate webhook handling
- [ ] Test cancellation flows
- [ ] Test chargeback flows

---

## 🚀 Deployment Plan

1. **Backup Database** - Full backup before migration
2. **Run Schema Migration** - Apply Prisma migration
3. **Data Migration Script** - Migrate existing transactions:
   - Set `originalAmount` = existing `amount`
   - Set `paidAmount` from payment records
   - Map old `status` to new `paymentStatus`
   - Extract `billingType` from metadata
4. **Deploy Code** - Deploy updated application
5. **Monitor Webhooks** - Watch for any webhook errors
6. **Validate Data** - Spot check transaction amounts

---

## 🔍 Example Scenarios

### Scenario 1: Split Payment with Partial Refund

**Initial State:**
```
Transaction:
  originalAmount: 100000 ($1000)
  paidAmount: 100000 ($1000)
  refundedAmount: 0
  paymentStatus: PAID
  billingType: SPLIT_PAYMENT
  totalPayments: 5
  successfulPayments: 5

Payments:
  1. amount: 20000, refundedAmount: 0, status: SUCCEEDED
  2. amount: 20000, refundedAmount: 0, status: SUCCEEDED
  3. amount: 20000, refundedAmount: 0, status: SUCCEEDED
  4. amount: 20000, refundedAmount: 0, status: SUCCEEDED
  5. amount: 20000, refundedAmount: 0, status: SUCCEEDED
```

**User refunds payment #2 for $100 (partial):**

```
Webhook: charge.refunded (refund.amount = 10000)

1. Create PaymentRefund:
   paymentId: payment_2_id
   amount: 10000
   stripeRefundId: re_xxxxx

2. Update Payment #2:
   refundedAmount: 10000
   refundedAt: now()

3. Update Transaction:
   refundedAmount: 10000

4. Update Lead CLTV: -100
```

**Final State:**
```
Transaction:
  originalAmount: 100000 ($1000) - unchanged
  paidAmount: 100000 ($1000) - unchanged
  refundedAmount: 10000 ($100)
  paymentStatus: PAID - unchanged (still fully paid)
  netAmount: 90000 ($900) - computed in UI

Payments:
  1. amount: 20000, refundedAmount: 0
  2. amount: 20000, refundedAmount: 10000 ← refunded
  3. amount: 20000, refundedAmount: 0
  4. amount: 20000, refundedAmount: 0
  5. amount: 20000, refundedAmount: 0

PaymentRefunds:
  1. paymentId: payment_2_id, amount: 10000

UI Shows:
  "Original: $1000"
  "Paid: $1000"
  "Refunded: -$100"
  "Net: $900"

  Payment 2: "$200 → -$100 refunded → $100 net"
```

### Scenario 2: Multiple Partial Refunds

**User refunds payment #2 again for another $50:**

```
Webhook: charge.refunded (charge.amount_refunded = 15000 total)

1. Create PaymentRefund:
   paymentId: payment_2_id
   amount: 5000
   stripeRefundId: re_yyyyy

2. Recalculate Payment #2 refundedAmount:
   Sum all PaymentRefunds = 10000 + 5000 = 15000
   SET refundedAmount: 15000

3. Recalculate Transaction refundedAmount:
   Sum all payment.refundedAmount = 15000
   SET refundedAmount: 15000

4. Update Lead CLTV: -50 (only the new refund)
```

**Final State:**
```
Transaction:
  refundedAmount: 15000 ($150)
  netAmount: 85000 ($850)

Payment 2:
  amount: 20000
  refundedAmount: 15000

PaymentRefunds:
  1. paymentId: payment_2_id, amount: 10000
  2. paymentId: payment_2_id, amount: 5000

UI Shows:
  "Refunded: -$150"
  "Net: $850"

  Payment 2: "$200 → -$150 refunded → $50 net"

  Refund History:
  - $100.00 refunded on [date]
  - $50.00 refunded on [date]
```

---

## 🎯 Success Criteria

- ✅ All transaction amounts accurate
- ✅ Refund tracking works for all payment types
- ✅ Multiple partial refunds supported
- ✅ Webhook handlers are idempotent
- ✅ UI clearly shows payment vs refund state
- ✅ Metrics dashboard shows correct revenue
- ✅ No data loss during migration
- ✅ Performance is fast (no Stripe API calls for display)
