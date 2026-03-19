# Feature Gates Complete Guide

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Components](#core-components)
4. [Implementation Patterns](#implementation-patterns)
5. [Client-Side Implementation](#client-side-implementation)
6. [Upgrade Modal System](#upgrade-modal-system)
7. [Feature Keys Reference](#feature-keys-reference)
8. [Caching Strategy](#caching-strategy)
9. [Error Handling](#error-handling)
10. [Configuration](#configuration)
11. [Examples in Codebase](#examples-in-codebase)
12. [Testing](#testing)
13. [FAQ](#faq)

## Overview

The feature gates system enforces organization tier limits and tracks resource consumption. It includes both server-side enforcement and client-side checks with a beautiful upgrade modal experience when users hit their tier limits.

### Key Features

- **Subscription validation security** - Validates active subscription and expiration on every request
- Server-side feature gate enforcement with tRPC integration
- Client-side preflight checks for instant feedback
- Automatic cache invalidation on mutations
- Reusable upgrade modal component with tier comparison
- Request-scoped caching for optimal performance
- TypeScript-enforced single source of truth for all features
- **No bypass possible** - All feature gates validate subscription status at service layer

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Feature Gate Flow                        │
└─────────────────────────────────────────────────────────────┘

1. Layout Prefetch (usage metrics cached)
   ↓
2. Permission Check (organizationProcedure)
   ↓
3. Client-Side Preflight Check (instant)
   ↓
4. Feature Gate Check (withFeatureGate)
   │  └─> Subscription Validation (getOrganizationTier)
   │       ├─> Check subscription exists
   │       ├─> Check periodEnd not expired
   │       ├─> Check valid status (active/trialing/past_due)
   │       └─> Check trial not expired
   ↓
5. Perform Action (createClient, etc.)
   ↓
6. Increment Usage (incrementUsageAndInvalidate)
   ↓
7. Auto-invalidate Caches (server + client)
```

## Core Components

### 1. Database Model

**UsageMetrics** - Tracks consumption per feature per organization

```prisma
model UsageMetrics {
  id             String   @id @default(cuid())
  organizationId String
  featureKey     String   // e.g., "clients.limit"
  currentUsage   Int      @default(0)
  lastResetAt    DateTime @default(now())
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  organization   Organization @relation(...)

  @@unique([organizationId, featureKey])
}
```

### 2. Service Layer

**src/services/feature-gate.service.ts** - Core logic

Key functions:
- `getOrganizationTier(organizationId)` - Get tier details with subscription validation (cached)
- `getAllUsageMetrics(organizationId)` - Get all usage data (cached)
- `checkFeatureGate(organizationId, featureKey, quantity)` - Check if action is allowed
- `incrementUsage(organizationId, featureKey, quantity)` - Increment usage counter
- `decrementUsage(organizationId, featureKey, quantity)` - Decrement usage counter
- `requireFeatureGate()` - Check and throw if fails
- `requireBooleanFeature()` - Check boolean feature

#### Subscription Validation (CRITICAL SECURITY)

`getOrganizationTier()` is the **single source of truth** for determining an organization's tier. It includes comprehensive subscription validation to prevent access to paid features with expired subscriptions.

**Validation Flow:**

```typescript
export const getOrganizationTier = cache(async (organizationId: string) => {
  // 1. Get active plan from studioPlan table
  const activePlan = await prisma.studioPlan.findFirst({
    where: { organizationId, active: true }
  })

  // 2. If no plan or plan is FREE → return FREE tier (no validation needed)
  if (!activePlan || activePlan.name.toLowerCase() === 'free') {
    return FREE_TIER
  }

  // 3. For PAID plans → VALIDATE SUBSCRIPTION
  const subscription = await prisma.subscription.findFirst({
    where: {
      referenceId: organizationId,
      stripeSubscriptionId: { not: null } // Must have Stripe subscription
    }
  })

  // SECURITY CHECKS (ANY FAILURE = DOWNGRADE TO FREE):

  // Check 1: Subscription exists?
  if (!subscription) return FREE_TIER

  const now = new Date()

  // Check 2: Subscription period expired?
  if (subscription.periodEnd && subscription.periodEnd < now) {
    return FREE_TIER
  }

  // Check 3: Subscription status valid?
  const validStatuses = ['active', 'trialing', 'past_due']
  if (!validStatuses.includes(subscription.status)) {
    return FREE_TIER
  }

  // Check 4: Trial period expired?
  if (subscription.status === 'trialing' &&
      (!subscription.trialEnd || subscription.trialEnd < now)) {
    return FREE_TIER
  }

  // All validations passed → Return paid tier
  return PAID_TIER_WITH_LIMITS
})
```

**Valid Subscription Statuses:**

| Status | Allowed? | Reason |
|--------|----------|--------|
| `active` | ✅ Yes | Fully paid and active |
| `trialing` | ✅ Yes | On trial (if not expired) |
| `past_due` | ✅ Yes | Grace period for failed payment |
| `canceled` | ❌ No | Subscription canceled → FREE tier |
| `incomplete` | ❌ No | Payment not complete → FREE tier |
| `incomplete_expired` | ❌ No | Payment failed → FREE tier |
| `unpaid` | ❌ No | Payment failed → FREE tier |

**What Gets Validated:**
- ✅ Subscription exists in database
- ✅ Subscription has Stripe subscription ID
- ✅ `periodEnd` has not passed (billing cycle not expired)
- ✅ Subscription status is valid (active/trialing/past_due)
- ✅ If trialing, `trialEnd` has not passed

**Automatic Enforcement:**
- Every feature gate check calls `getOrganizationTier`
- Expired/invalid subscriptions automatically return FREE tier
- Users immediately lose access to paid features when subscription expires
- Request-scoped cache ensures validation runs once per request
- No bypass possible - validation at service layer

**Enhanced Error Structure:**

The service throws structured errors that include all data needed for the upgrade modal:

```typescript
throw new TRPCError({
  code: 'FORBIDDEN',
  message: result.reason || 'Feature limit exceeded',
  cause: {
    type: 'FEATURE_LIMIT_EXCEEDED',  // Error type identifier
    featureKey,                      // Which feature was exceeded
    currentUsage: result.currentUsage,
    limit: result.limit,
    currentTier: tier.tier,          // Current plan tier
    organizationId,
    message: result.reason || 'Feature limit exceeded',
  },
})
```

### 3. tRPC Context

**src/trpc/init.ts** - Enhanced context with feature gate helpers

```typescript
const ctx = {
  prisma,
  session,
  user,
  getUserOrganizations: () => [...],
  getOrganizationTier: (orgId) => { tier, studioLimits, clientLimits, plan },
  getAllUsageMetrics: (orgId) => { featureKey: { currentUsage, limit, ... } }
}
```

All helpers are **request-scoped cached** via React's `cache()`.

### 4. Procedure Helpers

**src/trpc/procedures/feature-gates.ts** - tRPC integration helpers

- `withFeatureGate(ctx, orgId, featureKey, quantity)` - Check gate, throw on fail
- `withBooleanFeature(ctx, orgId, featureKey)` - Check boolean feature
- `incrementUsageAndInvalidate(ctx, orgId, featureKey)` - Increment + invalidate caches
- `decrementUsageAndInvalidate(ctx, orgId, featureKey)` - Decrement + invalidate caches
- `withFeatureGateAndIncrement(ctx, orgId, featureKey, actionFn)` - All-in-one wrapper

### 5. Usage Router

**src/trpc/routers/usage.ts** - Query endpoints for UI

- `usage.getTier({ organizationId })` - Get tier details
- `usage.getUsageMetrics({ organizationId })` - Get all usage data
- `usage.getFeatureUsage({ organizationId, featureKey })` - Get single feature usage
- `usage.canPerformAction({ organizationId, featureKey, quantity })` - Pre-flight check
- `usage.hasFeature({ organizationId, featureKey })` - Check boolean feature

### 6. Feature Gate Components

**src/components/feature-gate.tsx** - Client-side feature limit checking

**Components & Hooks**:
- `FeatureGate` - Wrapper component that intercepts clicks when at limit
- `useFeatureGate(feature)` - Hook for manual feature gate checks
- `useFeatureGates()` - Hook to get all feature gates data
- `FeatureGateUsage` - Display component for showing usage

**src/components/upgrade-modal.tsx** - Reusable upgrade prompt

**Features**:
- Shows current usage vs limit with progress bar
- Displays tier-specific upgrade messaging
- Shows comparison between current and next plan
- Links directly to billing settings
- Beautiful gradient design with proper accessibility

**Props**:
```typescript
interface UpgradeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
}
```

## Implementation Patterns

### Pattern 1: Check → Action → Increment (Recommended)

Use this pattern when you want explicit control over each step:

```typescript
createClient: organizationProcedure({ requirePermission: 'clients:create' })
  .input(z.object({ organizationId: z.string(), name: z.string() }))
  .mutation(async ({ ctx, input }) => {
    // STEP 1: Check permissions (done by organizationProcedure)

    // STEP 2: Check feature gate BEFORE action
    await withFeatureGate(ctx, input.organizationId, 'clients.limit')

    // STEP 3: Perform the action
    const client = await createClient({No
      organizationId: input.organizationId,
      name: input.name,
    })

    // STEP 4: Increment usage and invalidate caches
    await incrementUsageAndInvalidate(ctx, input.organizationId, 'clients.limit')

    return { success: true, client }
  })
```

### Pattern 2: All-in-One Wrapper

Use this for simpler procedures:

```typescript
createClient: organizationProcedure({ requirePermission: 'clients:create' })
  .input(z.object({ organizationId: z.string(), name: z.string() }))
  .mutation(async ({ ctx, input }) => {
    return withFeatureGateAndIncrement(
      ctx,
      input.organizationId,
      'clients.limit',
      async () => {
        // Perform action here
        return await createClient({
          organizationId: input.organizationId,
          name: input.name
        })
      }
    )
  })
```

### Pattern 3: Decrement on Delete

Always decrement usage when deleting resources:

```typescript
deleteClient: organizationProcedure({ requirePermission: 'clients:delete' })
  .input(z.object({ organizationId: z.string(), clientId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    // Delete the resource
    const result = await deleteClient(input.clientId, input.organizationId)

    // Decrement usage counter
    await decrementUsageAndInvalidate(ctx, input.organizationId, 'clients.limit')

    return result
  })
```

### Pattern 4: Boolean Features

For features like `white_label`, `custom_domain`, etc:

```typescript
enableWhiteLabel: organizationProcedure({ requirePermission: 'studio-settings:update' })
  .input(z.object({ organizationId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    // Check if organization has this feature on their tier
    await withBooleanFeature(ctx, input.organizationId, 'white_label')

    // Enable white label
    await updateOrganization(input.organizationId, { whitelabelEnabled: true })

    return { success: true }
  })
```

## Client-Side Implementation

### Layout Prefetching

**src/app/(protected)/layout.tsx** - Prefetch usage metrics for instant checks

```typescript
// Added to protected layout
activeOrg?.id ? queryClient.fetchQuery(
  trpc.usage.getUsageMetrics.queryOptions({ organizationId: activeOrg.id })
) : Promise.resolve(),
```

**Benefits**:
- Instant client-side feature gate checks
- No loading state for usage metrics
- Cached data available throughout the app

### Fetching Usage Data

```typescript
// Get all usage metrics
const { data: usage } = trpc.usage.getUsageMetrics.useQuery({
  organizationId: orgId
})

// usage = {
//   'clients.limit': {
//     featureKey: 'clients.limit',
//     currentUsage: 5,
//     limit: 10,
//     available: 5,
//     percentage: 50
//   },
//   'websites.limit': { ... }
// }
```

### Client-Side Feature Gate Patterns

There are two patterns for implementing client-side feature gates:

#### Pattern 1: FeatureGate Wrapper (Recommended for standalone buttons)

Use this when the button is standalone (not inside Tooltip, Sheet, etc.):

```typescript
import { FeatureGate } from '@/components/feature-gate'

// Simply wrap the button - FeatureGate handles everything
<FeatureGate feature="forms.limit">
  <Button onClick={() => setShowCreateModal(true)}>
    <Plus className="h-4 w-4" />
    Create Form
  </Button>
</FeatureGate>
```

The button works normally until the limit is reached. When at limit, clicking shows the upgrade modal instead of proceeding with the action.

#### Pattern 2: useFeatureGate Hook (For complex UI structures)

Use this when the button is inside Radix components like Tooltip, Sheet, etc. (which use `asChild`):

```typescript
import { useFeatureGate } from '@/components/feature-gate'
import { UpgradeModal } from '@/components/upgrade-modal'
import { useState } from 'react'

const [showUpgradeModal, setShowUpgradeModal] = useState(false)

// Get feature gate data
const gate = useFeatureGate('team_seats.limit')

// For Sheet - intercept in onOpenChange
<Sheet
  open={isOpen}
  onOpenChange={(open) => {
    if (open && gate?.atLimit) {
      setShowUpgradeModal(true)
      return
    }
    setIsOpen(open)
  }}
>
  <SheetTrigger asChild>
    <Button>Invite Member</Button>
  </SheetTrigger>
  ...
</Sheet>

// For functions - check before action
const handleCreate = () => {
  if (gate?.atLimit) {
    setShowUpgradeModal(true)
    return
  }
  // Proceed with creation
  createItem.mutate(...)
}

// Render upgrade modal
{organizationId && (
  <UpgradeModal
    open={showUpgradeModal}
    onOpenChange={setShowUpgradeModal}
    organizationId={organizationId}
  />
)}
```

### Checking Boolean Features

```typescript
// Check if white label is available
const { data: hasWhiteLabel } = trpc.usage.hasFeature.useQuery({
  organizationId: orgId,
  featureKey: 'white_label'
})

if (hasWhiteLabel?.enabled) {
  return <WhiteLabelSettings />
}
```

### Manual Cache Invalidation

The system automatically invalidates caches after mutations. If you need manual control:

```typescript
import { trpc } from '@/lib/trpc/client'

const utils = trpc.useUtils()

// After a mutation that affects usage
await utils.usage.getUsageMetrics.invalidate({ organizationId: orgId })
await utils.usage.getTier.invalidate({ organizationId: orgId })
```

## Upgrade Modal System

### Flow Diagrams

#### Happy Path (Within Limits)
```
User clicks "Create Client"
  ↓
Client-side preflight check (uses cached metrics)
  ↓
currentUsage < limit ✅
  ↓
Make API call
  ↓
Server validates again
  ↓
Success! Client created
  ↓
Increment usage metrics
  ↓
Invalidate cache
```

#### Limit Exceeded (Client-Side Detection)
```
User clicks "Create Client"
  ↓
FeatureGate/useFeatureGate checks cached data
  ↓
atLimit === true ❌
  ↓
Show UpgradeModal immediately
  ↓
No API call made (saves server resources)
  ↓
User clicks "Upgrade Now" → Redirects to billing
```

#### Limit Exceeded (Server-Side Detection)
```
User clicks "Create Client"
  ↓
Client-side check passes (edge case - stale cache)
  ↓
Make API call
  ↓
Server validates via withFeatureGate()
  ↓
currentUsage >= limit ❌
  ↓
Server throws TRPCError with structured cause
  ↓
Client parses error
  ↓
Show UpgradeModal with error data
  ↓
User clicks "Upgrade Now" → Redirects to billing
```

### Key Benefits

#### 1. Instant Feedback
- Client-side check shows upgrade modal immediately
- No waiting for server response
- Better UX, feels instant

#### 2. Server-Side Safety
- Server always validates as final authority
- Prevents race conditions
- Handles stale cache scenarios
- Security: client-side checks can be bypassed, server cannot

#### 3. Reusable Components
- FeatureGate wrapper and useFeatureGate hook can be used anywhere
- UpgradeModal just needs organizationId - it fetches everything else
- Consistent upgrade experience across all features

#### 4. Source of Truth
- All messaging comes from feature-gates.ts
- Change copy in one place, updates everywhere
- Tier-specific messaging (free vs paid tiers)

#### 5. Performance
- Prefetched metrics = zero loading state
- Client-side checks prevent unnecessary API calls
- Cached tier data throughout session

### Adding Feature Gates to Other Features

To add feature gate support to new features:

#### Option A: Standalone Button (Use FeatureGate wrapper)

```typescript
import { FeatureGate } from '@/components/feature-gate'

// Just wrap the button - that's it!
<FeatureGate feature="websites.limit">
  <Button onClick={handleCreate}>Create Website</Button>
</FeatureGate>
```

#### Option B: Button inside Radix component (Use hook)

For buttons inside Tooltip, Sheet, Dialog triggers, etc.:

```typescript
import { useFeatureGate } from '@/components/feature-gate'
import { UpgradeModal } from '@/components/upgrade-modal'
import { useState } from 'react'

// 1. Add state and hook
const [showUpgradeModal, setShowUpgradeModal] = useState(false)
const gate = useFeatureGate('websites.limit')

// 2. Check gate before action
const handleCreate = () => {
  if (gate?.atLimit) {
    setShowUpgradeModal(true)
    return
  }
  // Proceed with action
}

// 3. Render modal
{organizationId && (
  <UpgradeModal
    open={showUpgradeModal}
    onOpenChange={setShowUpgradeModal}
    organizationId={organizationId}
  />
)}
```

#### All Implemented Features

| Feature | Pattern | File |
|---------|---------|------|
| Forms | FeatureGate wrapper | forms page |
| Websites | FeatureGate wrapper | websites-page-content.tsx |
| Leads | FeatureGate wrapper | leads-page-content.tsx |
| Chat Widgets | FeatureGate wrapper | chat-widgets-page-content.tsx |
| Products | FeatureGate wrapper | products-tab.tsx |
| Email Templates | FeatureGate wrapper | templates-page-content.tsx |
| CMS Tables | useFeatureGate hook | cms-page-content.tsx |
| Email Domains | useFeatureGate hook | domains-page-content.tsx |
| Pipelines | useFeatureGate hook | pipeline-board.tsx |
| Tickets | useFeatureGate hook | pipeline-board.tsx |
| Team Members | useFeatureGate hook | invite-member-button.tsx |
| Pages | useFeatureGate hook | pages-panel.tsx |

## Feature Keys Reference

### Studio Features (Organization Level)

| Feature Key | Type | Description |
|------------|------|-------------|
| `clients.limit` | LIMIT | Max client accounts |
| `saas_mode` | BOOLEAN | Enable SaaS mode |
| `white_label` | BOOLEAN | White label branding |
| `custom_domain` | BOOLEAN | Custom domain support |

### Organization Features

| Feature Key | Type | Description |
|------------|------|-------------|
| `websites.limit` | LIMIT | Max websites |
| `pages_per_website.limit` | LIMIT | Max pages per website |
| `forms.limit` | LIMIT | Max forms |
| `products.limit` | LIMIT | Max products |
| `leads.limit` | LIMIT | Max leads in CRM |
| `cms_tables.limit` | LIMIT | Max CMS tables |
| `storage_mb.limit` | LIMIT | Storage in MB |
| `chat_widgets.limit` | LIMIT | Max chat widgets |
| `pipelines.limit` | LIMIT | Max pipelines |
| `tickets.limit` | LIMIT | Max pipeline tickets |
| `team_seats.limit` | LIMIT | Max team members |
| `email_templates.limit` | LIMIT | Max email templates |
| `email_domains.limit` | LIMIT | Max custom email domains |
| `custom_domain` | BOOLEAN | Custom domain support |
| `custom_branding` | BOOLEAN | Remove platform branding |
| `analytics` | BOOLEAN | Analytics access |
| `emails.payg` | PAYG | Email sending (pay-as-you-go, tier-aware pricing) |
| `phone_calls.payg` | PAYG | Phone calls (pay-as-you-go) |
| `ai_credits.payg` | PAYG | AI credits (pay-as-you-go, tier-aware pricing) |
| `ai_workflows.payg` | PAYG | AI workflows (pay-as-you-go) |
| `sms.payg` | PAYG | SMS sending (pay-as-you-go) |

*PAYG features available on all plans. Charged in **MILLICENTS** (1000 = $1.00) via the wallet system.

### PAYG Tier-Aware Pricing (Implemented)

PAYG features use tier-specific pricing defined in `TIER_SPECIFIC_PRICING` in `feature-gates.ts`. Higher tiers get lower per-unit costs.

**Email pricing by tier (MILLICENTS per email):**

| Tier | Cost | Dollar Amount |
|------|------|---------------|
| Free | 20 | $0.02 |
| Starter | 15 | $0.015 |
| Pro | 10 | $0.01 |
| Enterprise | 8 | $0.008 |
| Portal | 0 | $0.00 (free) |

**Usage flow:**
1. Service calls `getTierSpecificCostMillicents('emails.payg', tier)` from `feature-gates.ts`
2. Returns cost in MILLICENTS for the org's current tier
3. `chargeWallet()` deducts from wallet in MILLICENTS
4. Auto-top-up triggers if balance drops below threshold

**Key functions in `src/lib/config/usage-pricing.ts`:**
- `getEmailCostMillicentsByTier(tier)` — tier-aware email cost
- `getAICreditCostMillicentsByTier(tier)` — tier-aware AI credit cost
- `calculateAICost(model, tokens)` — AI cost by model and token count

## Caching Strategy

### Server-Side (Request-Scoped)

- Uses React's `cache()` function
- Caches cleared automatically on next request
- Zero database calls for repeated access in same request
- Helpers: `getOrganizationTier()`, `getAllUsageMetrics()`, `getActiveOrganization()`

### Client-Side (React Query)

- `organization.getActiveOrganization()`: `staleTime: 0` - Allows proper hydration on subdomain navigation
- `usage.getTier()`: `staleTime: 0` - Allows proper hydration on subdomain navigation
- `usage.getUsageMetrics()`: `staleTime: 60000` (1 min) - Invalidate after mutations
- Auto-invalidation: Every mutation helper returns `invalidateKeys` array

**Why staleTime: 0 (Not Infinity)?**

When navigating between subdomains (e.g., from `app.mochi.test` to `acme.mochi.test`):
- Server prefetches fresh data for the current domain context
- `staleTime: 0` allows React Query to hydrate this fresh server data
- `staleTime: Infinity` would use stale client cache, showing wrong org's tier/usage

## Error Handling

### Server-Side Errors

```typescript
try {
  await withFeatureGate(ctx, organizationId, 'clients.limit')
} catch (error) {
  if (error instanceof TRPCError && error.code === 'FORBIDDEN') {
    // Feature limit exceeded
    // error.message contains user-friendly message
    // error.cause contains structured data for upgrade modal
  }
}
```

### Client-Side Error Handling

```typescript
const mutation = trpc.clients.createClient.useMutation({
  onError: (error) => {
    if (error.data?.code === 'FORBIDDEN') {
      const cause = error.data.cause

      if (cause?.type === 'FEATURE_LIMIT_EXCEEDED') {
        // Show upgrade modal with structured data
        showUpgradeDialog({
          featureKey: cause.featureKey,
          currentTier: cause.currentTier,
          currentUsage: cause.currentUsage,
          limit: cause.limit,
          organizationId: cause.organizationId,
        })
      }
    }
  }
})
```

## Configuration

### Single Source of Truth

All features are defined in **src/lib/config/feature-gates.ts**:

```typescript
export const FEATURES = {
  studio: {
    'clients.limit': {
      name: 'Client Accounts',
      type: 'limit',
      description: 'Maximum number of client accounts you can manage',
      upgradeMessageTier1: 'Upgrade to {nextPlan} to get more client accounts',
      upgradeMessageTier2Plus: 'Upgrade to {nextPlan} for unlimited client accounts and SaaS mode'
    },
    // ...
  },
  client: {
    'websites.limit': {
      name: 'Websites',
      type: 'limit',
      description: 'Maximum number of websites per client',
      upgradeMessageTier1: 'Upgrade to {nextPlan} for more websites',
      upgradeMessageTier2Plus: 'Upgrade to {nextPlan} for unlimited websites'
    },
    // ...
  }
} as const

export const PLANS = {
  free: {
    studio: {
      'clients.limit': 3,  // TypeScript enforces all features defined
      saas_mode: false,
      // ...
    },
    client: { ... }
  },
  starter: {
    studio: {
      'clients.limit': 10,
      saas_mode: false,
      // ...
    },
    client: { ... }
  },
  pro: {
    studio: {
      'clients.limit': -1,  // -1 = unlimited
      saas_mode: true,
      // ...
    },
    client: { ... }
  },
  // enterprise...
}
```

### Upgrade Messaging

Features include tier-specific upgrade messages:
- `upgradeMessageTier1`: Shown to free tier users
- `upgradeMessageTier2Plus`: Shown to starter/pro tier users
- Uses `{nextPlan}` placeholder for dynamic plan names

TypeScript enforces that every feature in `FEATURES` must be defined in every plan. Missing a feature? TypeScript error!

## Examples in Codebase

### Server-Side Examples
See **src/trpc/routers/clients.ts** for complete working examples:

- `createClient` mutation - Full pattern with all steps
- `deleteClient` mutation - Decrement pattern

### Client-Side Examples

**FeatureGate wrapper pattern:**
- `src/app/(main)/(protected)/(dashboard-layout)/sites/websites/_components/websites-page-content.tsx`
- `src/app/(main)/(protected)/(dashboard-layout)/leads/_components/leads-page-content.tsx`

**useFeatureGate hook pattern:**
- `src/components/organization/invite-member-button.tsx` - Button in SheetTrigger
- `src/app/(main)/(protected)/(dashboard-layout)/sites/cms/_components/cms-page-content.tsx` - Button in Tooltip
- `src/components/pipelines/pipeline-board.tsx` - Multiple gates (pipelines + tickets)

## Testing

### Testing Checklist

#### Feature Gate Functionality
- [ ] Free tier user creates clients up to limit (3)
- [ ] Free tier user tries to create 4th client → sees upgrade modal
- [ ] Upgrade modal shows correct current vs next plan (Free → Starter)
- [ ] Upgrade modal shows correct limits (3 → 10)
- [ ] Upgrade modal "Upgrade Now" button links to billing settings
- [ ] Starter tier user creates clients up to limit (10)
- [ ] Starter tier user tries to create 11th client → sees upgrade modal
- [ ] Upgrade modal shows correct plan (Starter → Pro)
- [ ] Usage metrics are prefetched (no loading state)
- [ ] Client-side check shows modal instantly (no API call)
- [ ] Server-side check still works (modify cache to test)
- [ ] Error toast still works for other error types (validation, etc.)
- [ ] Delete operations properly decrement usage counters
- [ ] Boolean feature checks work correctly
- [ ] Cache invalidation occurs after mutations

#### Subscription Validation Security
- [ ] User with expired `periodEnd` is downgraded to FREE tier
- [ ] User with `status: 'canceled'` is downgraded to FREE tier
- [ ] User with `status: 'incomplete'` is downgraded to FREE tier
- [ ] User with `status: 'unpaid'` is downgraded to FREE tier
- [ ] User with `status: 'active'` has access to paid tier
- [ ] User with `status: 'trialing'` and valid `trialEnd` has access to paid tier
- [ ] User with `status: 'trialing'` and expired `trialEnd` is downgraded to FREE tier
- [ ] User with `status: 'past_due'` retains access (grace period)
- [ ] User with paid plan but no subscription record is downgraded to FREE tier
- [ ] User with paid plan but no Stripe subscription ID is downgraded to FREE tier
- [ ] Free tier users don't require subscription validation
- [ ] Subscription validation logs are generated for downgrades

## FAQ

### Q: What happens if a user reaches their limit mid-request?
A: The feature gate check happens BEFORE the action, so they'll get an error before any resources are created.

### Q: How do I reset usage for a billing cycle?
A: Use `resetUsage(organizationId, featureKey)` from the service. This should be called by a Stripe webhook or cron job.

### Q: Can I check multiple features at once?
A: Yes, call `withFeatureGate()` multiple times or create a custom helper that checks multiple features.

### Q: What if I want to consume multiple units at once?
A: Pass the `incrementBy` parameter: `withFeatureGate(ctx, orgId, 'clients.limit', 5)`

### Q: How do I handle client-level vs studio-level features?
A: Use the same helpers - the service automatically determines if a feature is studio or client based on the feature key.

### Q: Why both client-side and server-side checks?
A: Client-side checks provide instant feedback and better UX. Server-side checks ensure security and handle race conditions. Always implement both.

### Q: What if the cache is stale?
A: The server-side check is the final authority. If the cache is stale and the client-side check passes, the server will still catch the limit and return a structured error.

### Q: Can I customize the upgrade modal?
A: Yes, modify `src/components/upgrade-modal.tsx` or create a custom modal using the same props structure.

### Q: How do I add a new feature?
A:
1. Add to `FEATURES` in feature-gates.ts
2. Add limits to all plans in `PLANS`
3. TypeScript will enforce completeness
4. Implement server-side checks using patterns above
5. Add client-side preflight checks where needed

### Q: How does subscription validation protect against expired subscriptions?
A: The `getOrganizationTier` function validates subscription status on EVERY request before returning tier data. For paid plans, it checks:
1. Subscription record exists
2. Has valid Stripe subscription ID
3. `periodEnd` hasn't passed (billing cycle not expired)
4. Status is valid (`active`, `trialing`, or `past_due`)
5. If trialing, `trialEnd` hasn't passed

Any failure automatically returns FREE tier limits, immediately blocking access to paid features.

### Q: What happens when a user's subscription expires mid-session?
A: On their next request (any mutation or query), `getOrganizationTier` will detect the expired `periodEnd` and return FREE tier limits. The feature gate check will then enforce FREE tier restrictions, preventing the action if they've exceeded free limits.

### Q: Why is `past_due` status allowed?
A: `past_due` provides a grace period when payment fails. Stripe typically retries the payment, and we want to avoid immediately downgrading users for temporary payment issues. However, if Stripe eventually marks the subscription as `canceled` or `unpaid`, they'll be downgraded to FREE tier.

### Q: Can users bypass subscription validation?
A: No. Subscription validation happens at the service layer (`getOrganizationTier`), which is server-side only and uses React's `cache()` for request-scoped memoization. Every feature gate check flows through this function. Client-side code cannot bypass it.

### Q: How often is subscription status checked?
A: Once per request. The `getOrganizationTier` function is wrapped in React's `cache()`, so all feature gate checks within a single request use the same validated result. On the next request, validation runs again with fresh data.

### Q: What if the Subscription table and studioPlan table are out of sync?
A: Subscription validation is the source of truth. Even if `studioPlan.active = true` and `studioPlan.name = 'pro'`, if the subscription is expired or invalid, the user gets FREE tier limits. The system trusts the subscription data from Stripe over the local plan record.

## Next Steps

1. ~~Implement PAYG features (wallet system, payment waterfall)~~ **DONE** — Wallet system uses MILLICENTS with tier-aware PAYG pricing
2. Add usage reset logic for billing cycle resets
3. Create additional UI components for usage display
4. Add webhook handlers for Stripe subscription changes
5. Implement usage alerts/notifications
6. Add analytics for feature usage tracking
