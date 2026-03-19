# Transaction Architecture Migration Plan

## Overview

This migration transforms the transaction system from a status-based approach to a clean financial tracking system with separate refund event tracking.

## ⚠️ BREAKING CHANGES

### Database Schema Changes

#### Transaction Table

**Renamed Fields:**
- `status` → `paymentStatus` (with new enum `TransactionPaymentStatus`)
- `amount` → `originalAmount`
- `completedPayments` → `successfulPayments`

**New Fields:**
- `paidAmount` (Int, default 0)
- `billingType` (BillingType enum)
- `firstPaidAt` (DateTime?)
- `lastPaidAt` (DateTime?)
- `fullyPaidAt` (DateTime?)

**Removed Fields:**
- `completedAt` → replaced by `fullyPaidAt`
- `refundedAt` → kept but repurposed
- `nextPaymentDate` → removed (not needed)

#### TransactionPayment Table

**New Fields:**
- `stripeChargeId` (String?, unique)

**Removed Status Values:**
- `REFUNDED` and `PARTIALLY_REFUNDED` removed from PaymentStatus enum
- Refund state now tracked via `refundedAmount` and `PaymentRefund` relation

#### New Table: PaymentRefund

Tracks individual refund events for complete refund history.

```prisma
model PaymentRefund {
  id              String   @id @default(cuid())
  paymentId       String
  amount          Int
  currency        String   @default("usd")
  reason          String?
  stripeRefundId  String   @unique
  createdAt       DateTime @default(now())
  processedAt     DateTime?
  payment         TransactionPayment @relation(...)
}
```

---

## 📋 Migration Steps

### Step 1: Database Backup

```bash
# Create full database backup
pg_dump $DATABASE_URL > backup_before_transaction_migration_$(date +%Y%m%d_%H%M%S).sql
```

### Step 2: Create Prisma Migration

```bash
# Generate migration SQL
npx prisma migrate dev --name transaction_architecture_redesign --create-only

# Review the generated SQL in prisma/migrations/
# DO NOT apply yet - we need to add data migration
```

### Step 3: Data Migration Script

The auto-generated migration will create new columns but won't populate them. We need to add SQL to migrate existing data:

```sql
-- After the auto-generated ALTER statements, add:

-- Step 1: Populate new Transaction fields from existing data
UPDATE "transaction" SET
  -- Set originalAmount from existing amount
  "originalAmount" = "amount",

  -- Set billingType from items (assume first item's billingType)
  "billingType" = (
    SELECT "billingType"
    FROM "transactionItem"
    WHERE "transactionItem"."transactionId" = "transaction"."id"
    LIMIT 1
  ),

  -- Calculate paidAmount from successful payments
  "paidAmount" = COALESCE((
    SELECT SUM("amount")
    FROM "transactionPayment"
    WHERE "transactionPayment"."transactionId" = "transaction"."id"
      AND "transactionPayment"."status" = 'SUCCEEDED'
  ), 0),

  -- Calculate successfulPayments count
  "successfulPayments" = COALESCE((
    SELECT COUNT(*)
    FROM "transactionPayment"
    WHERE "transactionPayment"."transactionId" = "transaction"."id"
      AND "transactionPayment"."status" = 'SUCCEEDED'
  ), 0),

  -- Set timestamp fields
  "firstPaidAt" = (
    SELECT MIN("paidAt")
    FROM "transactionPayment"
    WHERE "transactionPayment"."transactionId" = "transaction"."id"
      AND "transactionPayment"."status" = 'SUCCEEDED'
  ),

  "lastPaidAt" = (
    SELECT MAX("paidAt")
    FROM "transactionPayment"
    WHERE "transactionPayment"."transactionId" = "transaction"."id"
      AND "transactionPayment"."status" = 'SUCCEEDED'
  ),

  "fullyPaidAt" = CASE
    WHEN "completedAt" IS NOT NULL THEN "completedAt"
    ELSE NULL
  END;

-- Step 2: Map old TransactionStatus to new TransactionPaymentStatus
UPDATE "transaction" SET
  "paymentStatus" = CASE "status"
    WHEN 'AWAITING_PAYMENT' THEN 'AWAITING_PAYMENT'::\"TransactionPaymentStatus\"
    WHEN 'PENDING' THEN 'AWAITING_PAYMENT'::\"TransactionPaymentStatus\"
    WHEN 'PARTIALLY_PAID' THEN 'PARTIALLY_PAID'::\"TransactionPaymentStatus\"
    WHEN 'COMPLETED' THEN 'PAID'::\"TransactionPaymentStatus\"
    WHEN 'SUBSCRIPTION' THEN 'ACTIVE'::\"TransactionPaymentStatus\"
    WHEN 'FAILED' THEN 'FAILED'::\"TransactionPaymentStatus\"
    WHEN 'CANCELED' THEN 'CANCELED'::\"TransactionPaymentStatus\"
    WHEN 'CHARGEBACK' THEN 'DISPUTED'::\"TransactionPaymentStatus\"
    -- For refunded transactions, check if fully paid first
    WHEN 'REFUNDED' THEN
      CASE
        WHEN "paidAmount" > 0 THEN 'PAID'::\"TransactionPaymentStatus\"
        ELSE 'CANCELED'::\"TransactionPaymentStatus\"
      END
    WHEN 'PARTIALLY_REFUNDED' THEN
      CASE
        WHEN "successfulPayments" >= "totalPayments" AND "totalPayments" > 0
          THEN 'PAID'::\"TransactionPaymentStatus\"
        WHEN "successfulPayments" > 0
          THEN 'PARTIALLY_PAID'::\"TransactionPaymentStatus\"
        ELSE 'AWAITING_PAYMENT'::\"TransactionPaymentStatus\"
      END
    ELSE 'AWAITING_PAYMENT'::\"TransactionPaymentStatus\"
  END;

-- Step 3: Handle transactions with missing billingType
-- Default to ONE_TIME if no items exist
UPDATE "transaction"
SET "billingType" = 'ONE_TIME'::\"BillingType\"
WHERE "billingType" IS NULL;

-- Step 4: Remove old PaymentStatus enum values from TransactionPayment
-- Update any REFUNDED or PARTIALLY_REFUNDED statuses to SUCCEEDED
-- (refund state is now tracked separately)
UPDATE "transactionPayment"
SET "status" = 'SUCCEEDED'::\"PaymentStatus\"
WHERE "status" IN ('REFUNDED', 'PARTIALLY_REFUNDED');
```

### Step 4: Apply Migration

```bash
# Apply the migration
npx prisma migrate deploy

# Or in development:
npx prisma migrate dev
```

### Step 5: Update Generated Prisma Client

```bash
# Regenerate Prisma client with new types
npx prisma generate
```

### Step 6: Verify Data Migration

```sql
-- Check all transactions have required fields
SELECT
  COUNT(*) as total_transactions,
  COUNT("originalAmount") as has_original_amount,
  COUNT("billingType") as has_billing_type,
  COUNT("paidAmount") as has_paid_amount
FROM "transaction";

-- Check for any NULL billingType (should be 0)
SELECT COUNT(*)
FROM "transaction"
WHERE "billingType" IS NULL;

-- Verify payment status mapping
SELECT
  "paymentStatus",
  COUNT(*) as count
FROM "transaction"
GROUP BY "paymentStatus"
ORDER BY count DESC;

-- Check paidAmount calculations
SELECT
  t.id,
  t."originalAmount",
  t."paidAmount",
  t."refundedAmount",
  (t."paidAmount" - t."refundedAmount") as "netAmount"
FROM "transaction" t
LIMIT 10;
```

---

## 🔧 Code Updates Required

### 1. Update All Imports

**Before:**
```typescript
import { TransactionStatus, PaymentStatus } from '@/generated/prisma'
```

**After:**
```typescript
import { TransactionPaymentStatus, PaymentStatus } from '@/generated/prisma'
```

### 2. Update Type References

**Search and replace:**
- `transaction.status` → `transaction.paymentStatus`
- `transaction.amount` → `transaction.originalAmount`
- `transaction.completedPayments` → `transaction.successfulPayments`
- `TransactionStatus` type → `TransactionPaymentStatus` (in TypeScript)

### 3. Update Status Checks

**Before:**
```typescript
if (transaction.status === 'COMPLETED') { ... }
if (transaction.status === 'REFUNDED') { ... }
if (transaction.status === 'PARTIALLY_REFUNDED') { ... }
```

**After:**
```typescript
// Payment state
if (transaction.paymentStatus === 'PAID') { ... }

// Refund state (computed from amounts)
const isFullyRefunded = transaction.refundedAmount >= transaction.paidAmount
const hasRefunds = transaction.refundedAmount > 0

if (isFullyRefunded) { ... }
if (hasRefunds && !isFullyRefunded) { ... }
```

### 4. Update UI Components

**Amount displays need to show:**
- Original amount: `transaction.originalAmount`
- Total paid: `transaction.paidAmount`
- Total refunded: `transaction.refundedAmount`
- Net amount: `transaction.paidAmount - transaction.refundedAmount`

---

## 🧪 Testing Checklist

### Before Migration

- [ ] Create full database backup
- [ ] Test migration on development database copy
- [ ] Verify all existing transactions migrate correctly
- [ ] Check status mappings are correct
- [ ] Verify amount calculations

### After Migration

- [ ] Verify UI displays transactions correctly
- [ ] Test ONE_TIME payment creation
- [ ] Test RECURRING payment creation
- [ ] Test SPLIT_PAYMENT creation
- [ ] Test full refund (ONE_TIME)
- [ ] Test partial refund (ONE_TIME)
- [ ] Test refund on SPLIT_PAYMENT payment
- [ ] Test multiple partial refunds
- [ ] Test cancellation flows
- [ ] Test webhook handlers with new schema
- [ ] Verify metrics and reporting

---

## 🚨 Rollback Plan

If migration fails:

```bash
# 1. Stop application
pm2 stop all  # or your process manager

# 2. Restore database from backup
psql $DATABASE_URL < backup_before_transaction_migration_YYYYMMDD_HHMMSS.sql

# 3. Revert Prisma schema
git checkout HEAD~1 prisma/schema.prisma

# 4. Regenerate client
npx prisma generate

# 5. Restart application
pm2 start all
```

---

## 📊 Expected Impact

### Performance

✅ **Improved:**
- Faster metrics queries (no need to check refund status in enum)
- Better indexes on `paymentStatus` and `billingType`
- Cleaner queries (no OR conditions for refund states)

### Data Integrity

✅ **Improved:**
- Refunds tracked as events (complete history)
- Idempotent webhook handling (via `stripeRefundId` unique constraint)
- Clear separation of payment state and refund state

### Developer Experience

✅ **Improved:**
- Clearer field names (`originalAmount`, `paidAmount`, `refundedAmount`)
- Easier to reason about state
- Better documentation in schema comments

---

## 🎯 Success Criteria

- [ ] All existing transactions migrated successfully
- [ ] No data loss (all amounts, dates, references preserved)
- [ ] UI displays all transaction states correctly
- [ ] Webhooks work with new schema
- [ ] Refunds create `PaymentRefund` records
- [ ] Amounts calculate correctly (paid - refunded = net)
- [ ] Performance is same or better
- [ ] All tests pass

---

## 📅 Migration Timeline

**Estimated Duration:** 2-4 hours

1. **Preparation** (30 min)
   - Backup database
   - Review migration SQL
   - Test on development copy

2. **Migration** (30 min)
   - Apply schema changes
   - Run data migration
   - Verify data integrity

3. **Code Updates** (1-2 hours)
   - Update service layer
   - Update webhook handlers
   - Update UI components
   - Update types

4. **Testing** (1 hour)
   - Test all payment flows
   - Test refund scenarios
   - Test webhooks
   - Verify metrics

---

## 👥 Team Communication

**Before migration:**
- [ ] Notify team of maintenance window
- [ ] Document any API changes
- [ ] Update any external integrations

**During migration:**
- [ ] Put application in maintenance mode (optional)
- [ ] Monitor for errors
- [ ] Keep rollback plan ready

**After migration:**
- [ ] Verify production data
- [ ] Monitor webhooks for 24 hours
- [ ] Document any issues
- [ ] Update team on completion
