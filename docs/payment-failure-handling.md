# Payment Failure Handling System

## Overview

This document describes how the application handles payment failures, grace periods, and subscription lifecycle using Stripe's built-in mechanisms.

**KEY PRINCIPLE**: We DO NOT store redundant data. Stripe manages the entire grace period and retry process. We only mirror Stripe's subscription status in our database.

---

## Architecture

### Stripe's Built-in Grace Period

When a payment fails, Stripe automatically:

1. **Sets subscription to `past_due` status**
2. **Triggers Smart Retries**: Automatically retries payment 3 times over ~2 weeks
3. **Tracks retry attempts**: Stripe maintains attempt count and next retry date
4. **Sends webhooks**: `invoice.payment_failed` and `customer.subscription.updated`

After all retries fail (configured in Stripe Dashboard):
- Subscription becomes `unpaid` (if configured) or `canceled`
- Eventually `subscription.deleted` webhook fires
- We delete all organization data (cascading delete)

### No Redundant Data Storage

We DO NOT create these fields (Stripe already provides them):
- ❌ `gracePeriodEndDate` - Stripe tracks this via retry schedule
- ❌ `retryAttemptCount` - Stripe tracks via `invoice.attempt_count`
- ❌ `isInGracePeriod` - Determined by `status === 'past_due'`
- ❌ `paymentFailedDate` - Stripe tracks via invoice timestamps

We ONLY use:
- ✅ `subscription.status` (mirrors Stripe's status)
- ✅ `subscription.periodEnd` (already exists, from Stripe)
- ✅ `subscription.cancelAtPeriodEnd` (already exists, from Stripe)

---

## Subscription Status Flow

```
NORMAL FLOW:
active → subscription renews → active (continues)

PAYMENT FAILURE FLOW:
active → past_due (payment failed, grace period begins)
       → Stripe auto-retries for ~2 weeks
       → active (payment succeeds) OR
       → unpaid/canceled (all retries failed)
       → subscription.deleted webhook
       → we delete all data

MANUAL CANCELLATION FLOW:
active → active (with cancel_at_period_end=true)
       → subscription.deleted (at period end)
       → we delete all data
```

---

## Implementation Details

### 1. Webhook Event: `invoice.payment_failed`

**Location**: `src/services/stripe-webhook.service.ts:505-591`

**Triggers**: When any payment attempt fails

**Actions**:
1. ✅ Send email notification to organization owner
2. ✅ Log failure with attempt count and next retry date
3. ✅ Stripe automatically handles retries (no action needed)

**Email Contains**:
- Organization name
- Attempt count (1, 2, 3...)
- Next retry date (from Stripe)
- Link to update payment method

```typescript
await sendPaymentFailedEmail({
  to: owner.email,
  subject: `Payment Failed - Action Required for ${orgName}`,
  organizationName: orgName,
  attemptCount: 1, // From Stripe invoice
  nextRetryDate: new Date(...), // From Stripe
  updatePaymentLink: '/studio/settings/billing',
})
```

### 2. Webhook Event: `customer.subscription.updated`

**Location**: `src/services/stripe-webhook.service.ts:173-328`

**Triggers**: When subscription status changes

**Handles**:
- `active → past_due`: Payment failed, entering grace period
- `past_due → active`: Payment succeeded during retry
- `trialing → active`: Trial ended, payment succeeded
- `active → canceled`: User canceled or retries exhausted

**No Extra Logic Needed**: Status is automatically synced to database via `upsertSubscription()`

### 3. Frontend Banner: Payment Failed (Orange)

**Location**: `src/components/studio/payment-failed-banner.tsx`

**Displays When**: `subscription.status === 'past_due'`

**Shows**:
- ⚠️ Orange warning background
- "Payment Failed - Immediate Action Required"
- Attempt count
- "Update Payment Method" button → `/studio/settings/billing`

**Banner Priority**:
1. Payment Failed (orange) - HIGHEST PRIORITY
2. Subscription Canceled (red) - shown if not payment failed

### 4. Frontend Banner: Subscription Canceled (Red)

**Location**: `src/components/studio/subscription-canceled-banner.tsx`

**Displays When**: `subscription.cancelAtPeriodEnd === true`

**Shows**:
- 🚨 Red destructive background
- "Subscription Canceled"
- Days remaining
- Period end date
- "Reactivate" button

### 5. Feature Access During Grace Period

**Location**: `src/services/feature-gate.service.ts:153`

```typescript
const validStatuses = ['active', 'trialing', 'past_due']
```

**Result**: Users in `past_due` status maintain FULL ACCESS to paid features during the grace period (~2 weeks while Stripe retries).

---

## Email Notifications

### Payment Failed Email

**Triggers**: Every time `invoice.payment_failed` webhook fires

**Recipient**: Organization owner (studio-owner role)

**Content**:
- Subject: "Payment Failed - Action Required for [Org Name]"
- Attempt count
- Next retry date
- Reason for failure (from Stripe)
- "Update Payment Method" link

**Implementation**: `src/services/email.service.ts:132-149`

### Subscription Canceled Email

**Triggers**: When user manually cancels subscription

**Recipient**: Organization owner

**Content**:
- Subject: "Subscription Canceled - [Org Name]"
- Plan name
- Period end date
- Data deletion warning

### Subscription Reactivated Email

**Triggers**: When user reactivates a canceled subscription

**Recipient**: Organization owner

**Content**:
- Subject: "Subscription Reactivated - [Org Name]"
- Plan name
- Reactivation confirmation

---

## Testing Payment Failures

### Stripe Test Cards

Use these test cards to simulate payment failures:

```
DECLINE (Generic):
4000 0000 0000 0002

INSUFFICIENT FUNDS:
4000 0000 0000 9995

CARD EXPIRED:
4000 0000 0000 0069

PROCESSING ERROR:
4000 0000 0000 0119
```

### Testing Flow

1. **Create subscription** with test card that works
2. **Wait for renewal** or trigger invoice manually
3. **Update payment method** to failing test card
4. **Stripe will attempt payment** and fail
5. **Check**:
   - Email sent to owner ✅
   - Subscription status becomes `past_due` ✅
   - Orange banner appears ✅
   - User still has access ✅
6. **Update payment method** to working card
7. **Stripe retries** and succeeds
8. **Check**:
   - Status returns to `active` ✅
   - Banner disappears ✅

### Stripe Dashboard Configuration

**Revenue Recovery → Settings**:
- Enable Smart Retries (recommended)
- Configure retry schedule: 3-7 days, 5-9 days, 7-11 days (default)
- Final action: "Mark subscription as unpaid" or "Cancel subscription"

---

## Data Deletion on Subscription End

**Trigger**: `subscription.deleted` webhook

**Location**: `src/services/stripe-webhook.service.ts:318-374`

**What Gets Deleted**: EVERYTHING via cascading delete
- Organization
- All members
- All clients (teams)
- All subscriptions
- All usage metrics
- All invitations
- All studio plans
- All related data

**Implementation**:
```typescript
await prisma.organization.delete({
  where: { id: organizationId }
})
// Prisma schema handles cascading deletes automatically
```

---

## Summary

### What Stripe Handles (DO NOT DUPLICATE)
- ✅ Payment retry schedule
- ✅ Attempt counting
- ✅ Grace period timeline
- ✅ Next retry date calculation
- ✅ Subscription status transitions

### What We Handle
- ✅ Email notifications (payment failed, canceled, reactivated)
- ✅ Frontend banners (orange for payment failed, red for canceled)
- ✅ Feature access control (past_due users keep access)
- ✅ Data deletion (when subscription.deleted fires)

### Key Files

| File | Purpose |
|------|---------|
| `src/services/stripe-webhook.service.ts` | Webhook handlers for all subscription events |
| `src/services/email.service.ts` | Email notification functions |
| `src/components/studio/payment-failed-banner.tsx` | Orange banner for payment failures |
| `src/components/studio/subscription-canceled-banner.tsx` | Red banner for cancellations |
| `src/app/(protected)/layout.tsx` | Banner display logic |
| `src/services/feature-gate.service.ts` | Access control with grace period |

---

## Configuration Required

### Environment Variables

```env
NEXT_PUBLIC_APP_URL=https://yourdomain.com  # For payment update links in emails
STRIPE_SECRET_KEY=sk_test_...               # Stripe API key
```

### Stripe Dashboard Settings

1. **Enable Webhooks** for these events:
   - `invoice.payment_failed`
   - `invoice.payment_succeeded`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

2. **Configure Smart Retries**:
   - Revenue Recovery → Settings
   - Enable Smart Retries
   - Choose retry schedule (default is good)
   - Set final action (recommend "Mark as unpaid")

3. **Email Settings**:
   - Configure sender email for platform notifications
   - Set up email provider (Resend, SendGrid, etc.)
   - Update email templates with branding

---

## Future Enhancements

- [ ] Add retry history log in billing page
- [ ] Show retry schedule in UI
- [ ] Add dunning management (automated emails)
- [ ] Implement grace period countdown timer
- [ ] Add payment method expiration warnings
- [ ] Track churn metrics from payment failures
