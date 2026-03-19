# Cached Calls Reference

## Overview

This application uses a multi-layered caching strategy to optimize performance and reduce redundant API calls:

1. **Server-Side Request-Scoped Caches**: React `cache()` functions that deduplicate data fetches within a single server request
2. **Layout-Level Prefetching**: Critical data prefetched in the protected layout for instant client-side hydration
3. **Client-Side Query Caching**: TanStack Query (React Query) with `staleTime: 0` for proper hydration
4. **Service-Layer Caches**: Per-request caching in service functions for frequently accessed data

## Client-Side Cached Queries

### Default Cache Configuration

**Location**: `/src/trpc/tanstack-config.ts`

```typescript
staleTime: 30 * 1000 (30 seconds default)
retry: false (fail fast)
```

### Layout-Level Prefetched Data

**Location**: `/src/app/(protected)/layout.tsx`

The following data is prefetched at the layout level and available to all protected pages:

| Query | Cache Strategy | Access From Components | Invalidate On |
|-------|----------------|----------------------|---------------|
| `organization.getActiveOrganization` | `staleTime: 0` | `useActiveOrganization()` hook | Org switch, role changes |
| `organization.getUserOrganizations` | `staleTime: 0` | `trpc.organization.getUserOrganizations.useQuery()` | Role changes, permission updates |
| `user.getProfile` | Default (30s) | `trpc.user.getProfile.useQuery()` | Profile updates |
| `user.getAccounts` | Default (30s) | `trpc.user.getAccounts.useQuery()` | Organization membership changes |
| `usage.getTier` | `staleTime: 0` | `trpc.usage.getTier.useQuery({ organizationId })` | Plan changes, subscription updates |
| `usage.getUsageMetrics` | Default (30s) | `trpc.usage.getUsageMetrics.useQuery({ organizationId })` | After any mutation that affects usage |

**Why staleTime: 0 (Not Infinity)?**

When navigating between subdomains (e.g., from `app.mochi.test` to `acme.mochi.test`), the server prefetches fresh data for the new domain context. `staleTime: 0` allows React Query to hydrate this fresh server data instead of using stale client cache from the previous subdomain.

**CRITICAL**: Using `staleTime: Infinity` would cause security issues where the wrong organization's data could be displayed after switching subdomains.

**How to Access Prefetched Data**:

```typescript
// ✅ RECOMMENDED: Use the centralized hook for active organization
import { useActiveOrganization } from '@/hooks/use-active-organization'

const { activeOrganization, hasPermission, isOwner, isLoading } = useActiveOrganization()

// For tier data (still use staleTime: 0 for proper hydration)
const { data: tierData } = trpc.usage.getTier.useQuery(
  { organizationId: activeOrganization?.id || '' },
  {
    enabled: !!activeOrganization?.id,
    staleTime: 0, // Allow hydration from server
    gcTime: 1000 * 60 * 30, // 30 minutes
  }
)
```

### Feature-Specific Cached Queries

#### Organization & Team Management

| Query | Recommended Cache | Invalidate After |
|-------|------------------|------------------|
| `organization.getActiveOrganization` | `staleTime: 0` | Org switch, role updates, permission changes |
| `organization.getUserOrganizations` | `staleTime: 0` | Member role updates, new memberships |
| `organization.getOrganizationMembers` | Default (30s) | Member invite, role update, member removal |
| `organization.getOrganizationRoles` | Default (30s) | Role creation, role update, role deletion |
| `organization.getPendingInvitations` | Default (30s) | Invite sent, invite cancelled |

**Why staleTime: 0 for organization queries?**

These queries are critical for multi-tenancy security. When navigating between subdomains:
- Server prefetches fresh data for the current domain context
- `staleTime: 0` ensures this fresh data is used instead of stale cache
- `staleTime: Infinity` would cause wrong org data to appear after subdomain switch

#### Usage & Feature Gates

| Query | Recommended Cache | Invalidate After |
|-------|------------------|------------------|
| `usage.getTier` | `staleTime: 0` | Plan changes, subscription updates |
| `usage.getUsageMetrics` | `staleTime: 60000 (1 min)` | Resource creation/deletion (clients, etc.) |
| `usage.getFeatureUsage` | `staleTime: 60000 (1 min)` | Specific feature consumption |
| `usage.canPerformAction` | No cache (use for pre-flight checks) | N/A |
| `usage.hasFeature` | `staleTime: 0` | Plan changes |

#### Clients

| Query | Recommended Cache | Invalidate After |
|-------|------------------|------------------|
| `clients.getClients` | Default (30s) | Client create, update, delete |
| `clients.getClient` | Default (30s) | Client update |

#### User & Profile

| Query | Recommended Cache | Invalidate After |
|-------|------------------|------------------|
| `user.getProfile` | Default (30s) | Profile update |
| `user.getAccounts` | Default (30s) | Organization membership changes |

## Server-Side Caches

### Request-Scoped Caches (React cache())

**Location**: `/src/trpc/init.ts` (tRPC context)

These caches are automatically cleared after each request. Multiple calls to the same function within a single request return the same cached data.

| Cache Function | Purpose | Available In | Returns |
|---------------|---------|--------------|---------|
| `createTRPCContext()` | Main context creation | All tRPC procedures | Session, user, helper functions |
| `getActiveOrganizationLazy()` | **Active org using domain-first approach** | `ctx.getActiveOrganization()` | Single active organization |
| `getUserOrganizationsLazy()` | User's organizations with permissions | `ctx.getUserOrganizations()` | Array of enriched memberships |
| `getOrganizationTierLazy()` | Organization's plan tier | `ctx.getOrganizationTier(orgId)` | Tier config, limits, plan details |
| `getAllUsageMetricsLazy()` | All usage metrics for org | `ctx.getAllUsageMetrics(orgId)` | Usage data for all features |

**Domain-First Approach for Active Organization**:

The `getActiveOrganizationLazy()` function determines the active organization using this priority:
1. **Subdomain** (`acme.mochi.test`) → Returns `acme` org
2. **Custom domain** (`mycompany.com`) → Returns that company's org
3. **Root domain** (`mochi.test`) → Uses `session.activeOrganizationId`
4. **Fallback** → Owned org or first available org

**Location**: `/src/trpc/server.tsx`

| Cache Function | Purpose | Returns |
|---------------|---------|---------|
| `getQueryClient()` | Per-request TanStack query client | QueryClient instance |
| `getUserOrganizationsWithPermissions()` | Cached org fetch for server components | User organizations array |

**Location**: `/src/services/feature-gate.service.ts`

| Cache Function | Purpose | Returns |
|---------------|---------|---------|
| `getOrganizationTier(orgId)` | **Get active plan tier with subscription validation** | Tier config with limits |
| `getUsageMetrics(orgId, featureKey)` | Get usage for specific feature | Usage metrics or null |
| `getAllUsageMetrics(orgId)` | Get all usage metrics | Record of all feature usage |

**⚠️ CRITICAL: Subscription Validation**

`getOrganizationTier(orgId)` includes comprehensive subscription validation for security:

For paid plans (not FREE), it validates:
1. ✅ Subscription exists in database
2. ✅ Has valid Stripe subscription ID
3. ✅ `periodEnd` hasn't passed (billing cycle not expired)
4. ✅ Status is valid (`active`, `trialing`, or `past_due`)
5. ✅ If trialing, `trialEnd` hasn't passed

**Any validation failure automatically returns FREE tier limits**, preventing access to paid features with expired subscriptions.

### How to Use Server-Side Caches

**In tRPC Procedures**:

```typescript
// ✅ Get active organization (respects domain-first approach)
const activeOrg = await ctx.getActiveOrganization()

// Access all organizations for user
const organizations = await ctx.getUserOrganizations()

// Access cached tier data
const tierData = await ctx.getOrganizationTier(organizationId)

// Access cached usage metrics
const metrics = await ctx.getAllUsageMetrics(organizationId)
```

**In Server Components**:

```typescript
import { trpc } from '@/trpc/server'
import { getQueryClient } from '@/trpc/server'

// Prefetch for hydration
const queryClient = getQueryClient()
await queryClient.fetchQuery(trpc.user.getProfile.queryOptions())

// Direct call (bypasses cache)
import { createCaller } from '@/trpc/server'
const api = await createCaller()
const data = await api.user.getProfile()
```

## Cache Invalidation

### Automatic Invalidation

Some mutations automatically invalidate related caches using the `incrementUsageAndInvalidate` and `decrementUsageAndInvalidate` helpers:

**Location**: `/src/trpc/procedures/feature-gates.ts`

| Mutation | Invalidates |
|----------|-------------|
| `clients.createClient` | `usage.getUsageMetrics`, `clients.getClients` |
| `clients.deleteClient` | `usage.getUsageMetrics`, `clients.getClients` |

### Manual Invalidation

When performing mutations that affect cached data, invalidate the cache on the client:

```typescript
// In mutation callbacks
const utils = trpc.useUtils()

// After updating profile
utils.user.getProfile.invalidate()

// After updating organization membership/roles
utils.organization.getUserOrganizations.invalidate()

// After plan changes or subscription updates
utils.usage.getTier.invalidate()
utils.usage.getUsageMetrics.invalidate()

// IMPORTANT: Invalidate tier cache after subscription status changes
// (e.g., from Stripe webhooks for subscription.updated, subscription.deleted, etc.)
utils.usage.getTier.invalidate({ organizationId })

// After creating/updating/deleting clients
utils.clients.getClients.invalidate()
utils.usage.getUsageMetrics.invalidate()
```

## Best Practices

1. **Use `staleTime: 0` for Org Data**: Allows proper hydration from server when navigating between subdomains
2. **Use `useActiveOrganization` Hook**: Single source of truth for client components, respects domain-first approach
3. **Invalidate After Mutations**: Always invalidate related queries after successful mutations
4. **Feature Gate Checks**: For pre-flight checks (showing/hiding UI), use `usage.canPerformAction` without caching
5. **Usage Metrics**: Cache usage metrics for 1 minute, invalidate after resource creation/deletion
6. **Server-Side**: Trust the request-scoped caches - they're automatically cleared per request
7. **Domain-First Security**: On subdomains, only that org's data should be accessible

**Why NOT staleTime: Infinity?**

Using `staleTime: Infinity` for organization data causes security issues:
- When navigating from `org-a.mochi.test` to `org-b.mochi.test`, stale cache would show `org-a` data
- Server prefetches correct data for the current domain, but client ignores it with Infinity stale time
- This creates a multi-tenancy security breach where wrong org's data is displayed

## Common Patterns

### Check Permission Before Showing UI

```typescript
// ✅ RECOMMENDED: Use the centralized hook
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'

const { activeOrganization, hasPermission, isOwner } = useActiveOrganization()

// Check permission using the helper
const canCreateClients = hasPermission(permissions.CLIENTS_CREATE)

// Or check manually
const hasAccess = isOwner || activeOrganization?.permissions?.includes('clients:create')
```

**DEPRECATED PATTERN** - Do NOT use this:

```typescript
// ❌ WRONG - doesn't respect domain-first approach
const { data: organizations } = trpc.organization.getUserOrganizations.useQuery()
const activeOrg = organizations?.find(org => org.role === 'owner') || organizations?.[0]
```

### Check Feature Gate Before Action

```typescript
import { useActiveOrganization } from '@/hooks/use-active-organization'

const { activeOrganization } = useActiveOrganization()

// Pre-flight check (no cache)
const { data: canCreate } = trpc.usage.canPerformAction.useQuery({
  organizationId: activeOrganization?.id || '',
  featureKey: 'clients.limit',
  quantity: 1,
}, {
  enabled: !!activeOrganization?.id,
})

if (!canCreate?.allowed) {
  // Show upgrade modal
}
```

### Display Usage Stats

```typescript
import { useActiveOrganization } from '@/hooks/use-active-organization'

const { activeOrganization } = useActiveOrganization()

// Cached for 1 minute
const { data: usageMetrics } = trpc.usage.getUsageMetrics.useQuery(
  { organizationId: activeOrganization?.id || '' },
  {
    staleTime: 60000,
    enabled: !!activeOrganization?.id,
  }
)

const clientUsage = usageMetrics?.['clients.limit']
// Shows: currentUsage, limit, available, percentage
```
