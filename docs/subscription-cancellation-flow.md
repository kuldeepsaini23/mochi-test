# Subscription Cancellation Flow

This document explains how subscription cancellations work in the Mochi platform, covering both trial and paid subscriptions.

## Overview

There are **two stages** to subscription cancellation:

1. **Stage 1: Cancel at Period End** (`cancel_at_period_end: true`)
   - User retains full access to their tier limits
   - Cancellation banner is shown in the UI
   - Access continues until `periodEnd` date

2. **Stage 2: Subscription Deleted** (`customer.subscription.deleted` webhook)
   - Subscription period has ended
   - All organization data is permanently deleted
   - Users are preserved (not deleted)

---

## Cancellation Scenarios

### Scenario 1: Trial Subscription Canceled at Period End

**User Action:**
- User cancels their free trial in Stripe Dashboard
- Selects "Cancel at end of billing period"

**What Happens:**

1. **Stripe sends `customer.subscription.updated` webhook**
   ```json
   {
     "status": "trialing",
     "cancel_at_period_end": true,
     "trial_end": 1764809728,  // Dec 4, 2025
     "cancel_at": 1764809728
   }
   ```

2. **Database Updated:**
   - `cancelAtPeriodEnd` → `true`
   - `periodEnd` → `trial_end` date (from Stripe)
   - `status` → `trialing` (unchanged)

3. **UI Shows:**
   - Red cancellation banner at top of studio pages
   - "Your subscription has been canceled and will end in X days on [date]"
   - Reactivate button to undo cancellation

4. **Feature Gate Behavior:**
   - ✅ User **retains full access** to their tier limits
   - ✅ Can create clients, use features up to tier limits
   - ✅ Access continues until `trial_end` date

5. **When `trial_end` is Reached:**
   - Stripe sends `customer.subscription.deleted` webhook
   - Organization is **permanently deleted** with cascade
   - User account is **preserved**

---

### Scenario 2: Paid Subscription Canceled at Period End

**User Action:**
- User with active paid subscription cancels
- Selects "Cancel at end of billing period"

**What Happens:**

1. **Stripe sends `customer.subscription.updated` webhook**
   ```json
   {
     "status": "active",
     "cancel_at_period_end": true,
     "current_period_end": 1767398400,  // Jan 2, 2026
     "cancel_at": 1767398400
   }
   ```

2. **Database Updated:**
   - `cancelAtPeriodEnd` → `true`
   - `periodEnd` → `current_period_end` date
   - `status` → `active` (unchanged)

3. **UI Shows:**
   - Red cancellation banner
   - Shows days remaining in paid period
   - User has already paid for this period, so gets full access

4. **Feature Gate Behavior:**
   - ✅ User **retains full access** to paid tier limits
   - ✅ All paid features remain available
   - ✅ Access continues until `current_period_end` date

5. **When `current_period_end` is Reached:**
   - Stripe sends `customer.subscription.deleted` webhook
   - Organization is **permanently deleted** with cascade
   - User account is **preserved**

---

### Scenario 3: Immediate Cancellation

**User Action:**
- User cancels subscription immediately (no period end)

**What Happens:**

1. **Stripe sends `customer.subscription.deleted` webhook immediately**
   - No `cancel_at_period_end` stage
   - Goes directly to deletion

2. **Database Action:**
   - Organization is **immediately deleted** with cascade
   - All related data removed:
     - Teams (Clients)
     - TeamMembers
     - Members
     - Invitations
     - OrganizationRoles
     - StudioPlans
     - StudioStripeAccounts
     - Subscriptions
     - UsageMetrics

3. **User Account:**
   - ✅ User is **preserved** (not deleted)
   - User can create a new organization/subscription

---

## Feature Gate Validation Logic

Located in: `src/services/feature-gate.service.ts`

### Key Validation Checks

```typescript
// 1. Check if subscription exists
if (!subscription) {
  return FREE_TIER
}

// 2. Check if period has ended (handles cancelAtPeriodEnd correctly)
// Even if cancelAtPeriodEnd=true, user keeps access until periodEnd
if (subscription.periodEnd && subscription.periodEnd < now) {
  return FREE_TIER  // Period ended, revoke access
}

// 3. Check subscription status
if (!['active', 'trialing', 'past_due'].includes(subscription.status)) {
  return FREE_TIER
}

// 4. Check trial expiration (for trialing status)
if (subscription.status === 'trialing' && trialEnd < now) {
  return FREE_TIER
}

// ✅ All checks passed - return paid tier with full access
// User may have cancelAtPeriodEnd=true, but still gets access until periodEnd
```

### Cancellation Handling

**The key insight:**
- `cancelAtPeriodEnd` does NOT restrict access
- It's only used for UI display (showing the banner)
- Access is controlled by `periodEnd` date only
- When `periodEnd` expires OR `subscription.deleted` fires, access is revoked

---

## Webhook Events and Database Flow

### Event: `customer.subscription.updated`

**Triggered when:**
- Subscription details change
- User cancels at period end (`cancel_at_period_end: true`)
- Plan upgrades/downgrades
- Status changes

**Handler:** `handleSubscriptionUpdated()`

**Actions:**
1. Update subscription in database via `upsertSubscription()`
2. Map Stripe data to database format:
   - `cancel_at_period_end` → `cancelAtPeriodEnd`
   - `trial_end` or `current_period_end` → `periodEnd`
   - `status` → `status`
3. Sync organization plan if needed
4. Log cancellation detection

**File:** `src/services/stripe-webhook.service.ts:173-283`

---

### Event: `customer.subscription.deleted`

**Triggered when:**
- Subscription period ends after cancellation
- Immediate cancellation is processed
- Subscription is deleted in Stripe Dashboard

**Handler:** `handleSubscriptionDeleted()`

**Actions:**
1. Find subscription in database
2. Get organization details
3. **DELETE organization** (cascade deletes everything)
4. Log deletion details

**Cascade Deletes:**
- ✅ Teams (Clients)
- ✅ TeamMembers
- ✅ Members
- ✅ Invitations
- ✅ OrganizationRoles
- ✅ StudioPlans
- ✅ StudioStripeAccounts
- ✅ Subscriptions
- ✅ UsageMetrics
- ❌ Users (preserved)

**File:** `src/services/stripe-webhook.service.ts:318-374`

---

## UI Components

### Cancellation Banner

**File:** `src/components/studio/subscription-canceled-banner.tsx`

**Shows:**
- Destructive alert (red)
- Days remaining until cancellation
- Exact cancellation date
- Reactivate button (links to billing settings)

**When Displayed:**
- `cancelAtPeriodEnd === true`
- `periodEnd` exists (must have valid date from Stripe)
- User is studio owner
- On any `/studio/*` page

**File:** `src/app/(protected)/studio/layout.tsx:53-77`

---

## Stripe API Version Compatibility

### Important: `current_period_end` Location

**Stripe API 2025-03-31 Changes:**
- **Old location:** `subscription.current_period_end`
- **New location:** `subscription.items.data[0].current_period_end`

**Our Solution:**
```typescript
const periodEnd = subscription.current_period_end ||
                 subscription.items.data[0]?.current_period_end
```

**File:** `src/services/stripe.service.ts:50-51`

This ensures compatibility with both old and new Stripe API versions.

---

## Testing Checklist

### Test 1: Trial Canceled at Period End
- [ ] Cancel trial in Stripe Dashboard
- [ ] Verify `cancelAtPeriodEnd: true` in database
- [ ] Verify banner shows with correct days remaining
- [ ] Verify user can still create clients up to tier limit
- [ ] Verify feature gates still work normally
- [ ] Wait for trial_end (or manually trigger webhook)
- [ ] Verify organization is deleted
- [ ] Verify user account remains

### Test 2: Paid Subscription Canceled at Period End
- [ ] Start paid subscription
- [ ] Cancel subscription in Stripe Dashboard
- [ ] Verify `cancelAtPeriodEnd: true` in database
- [ ] Verify banner shows with correct billing period end
- [ ] Verify paid features remain accessible
- [ ] Wait for period_end (or manually trigger webhook)
- [ ] Verify organization is deleted
- [ ] Verify user account remains

### Test 3: Immediate Cancellation
- [ ] Cancel subscription immediately in Stripe
- [ ] Verify `customer.subscription.deleted` webhook fires
- [ ] Verify organization is immediately deleted
- [ ] Verify user account remains

### Test 4: Reactivation
- [ ] Cancel subscription at period end
- [ ] Verify banner shows
- [ ] Reactivate subscription in Stripe Dashboard
- [ ] Verify `cancelAtPeriodEnd: false` in database
- [ ] Verify banner disappears
- [ ] Verify continued access

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/services/feature-gate.service.ts` | Feature gate validation, subscription checks |
| `src/services/stripe-webhook.service.ts` | Webhook event handlers |
| `src/services/stripe.service.ts` | Stripe data mapping, subscription CRUD |
| `src/app/api/stripe/webhook/route.ts` | Webhook HTTP endpoint |
| `src/components/studio/subscription-canceled-banner.tsx` | Cancellation banner UI |
| `src/app/(protected)/studio/layout.tsx` | Banner display logic |
| `prisma/schema.prisma` | Database schema with cascade rules |

---

## Important Notes

1. **Users are NEVER deleted** - Only organizations and related data
2. **Access is granted until `periodEnd`** - Even with `cancelAtPeriodEnd: true`
3. **Cancellation banner requires valid `periodEnd`** - Never hardcode dates
4. **Stripe API version compatibility** - Check both locations for `current_period_end`
5. **Cascade deletes are automatic** - Prisma handles via schema
6. **Feature gates check `periodEnd` only** - Not `cancelAtPeriodEnd` flag

---

## Related Documentation

- [Feature Gates Usage](./feature-gates-usage.md)
- [Stripe Webhook Implementation](../src/services/stripe-webhook.service.ts)
- [Subscription Schema](../prisma/schema.prisma)
