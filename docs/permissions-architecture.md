# Permission System

## Overview

Role-based access control using Better Auth's permission system with dynamic role creation.

**Key Concepts:**
- Permissions stored in `OrganizationRole` table as JSON: `{ "resource": ["action1", "action2"] }`
- Owners have full access (Better Auth handles this internally)
- Regular members checked against their role's permissions
- Format: `"resource:action"` (e.g., `"member:read"`, `"clients:create"`)

**Performance Architecture:**
- Active organization + permissions prefetched once per request (server-side)
- Uses **domain-first approach** for multi-tenancy security
- Cached via React's `cache()` and shared across all server components
- Hydrated to client via React Query with `staleTime: 0` for proper cross-subdomain navigation
- Available in tRPC context: `ctx.getActiveOrganization()`

## Architecture

```
User → Member → Role → Permissions
                 ↓
         OrganizationRole table
         { member: ["read", "update"] }
```

### Domain-First Approach (Multi-Tenancy)

**CRITICAL:** The active organization is determined by domain first, not session:

```
1. On subdomain (acme.mochi.test) → that org IS the active org
2. On custom domain (mycompany.com) → that org IS the active org
3. On root domain (mochi.test) → use session.activeOrganizationId
4. Fallback → owned org or first org in list
```

**Why This Matters:**
- Prevents subdomain/session conflicts (user on `org-a.mochi.test` cannot access `org-b` data)
- Ensures proper tenant isolation in multi-tenant architecture
- Session `activeOrganizationId` is only used on root domain

### Caching Strategy

**Server-Side (Request-Scoped):**
```
Request → ctx.getActiveOrganization() [cached via React cache()]
          ↓
          Uses domain-first approach to determine active org
          ↓
          Fetches once, shared across all tRPC procedures
          ↓
          Auto-purged on next request
```

**Client-Side (Hydration-Friendly):**
```
Layout prefetches → HydrationBoundary → Client components
                                        ↓
                                 React Query cache (staleTime: 0)
                                        ↓
                                 Allows proper hydration on subdomain navigation
```

**Benefits:**
- ✅ Zero redundant fetches during SSR
- ✅ Instant permission checks on client (no loading states)
- ✅ Single source of truth across server + client
- ✅ Proper subdomain/cross-domain navigation support
- ✅ Available in all tRPC procedures via context

**Why staleTime: 0 (Not Infinity)?**
- When navigating between subdomains, server prefetches fresh data for that domain
- `staleTime: 0` allows React Query to hydrate this fresh server data
- `staleTime: Infinity` would use stale client cache, showing wrong org's data

## Usage

### 1. tRPC Procedures

**Option A: Automatic Permission Check (Recommended)**

Use `organizationProcedure` with `requirePermission` option:

```typescript
export const organizationRouter = router({
  getMembers: organizationProcedure({ requirePermission: 'member:read' })
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      // ✅ Permission already checked via cached ctx.getUserOrganizations()
      // ✅ Zero database calls for permission validation
      return await prisma.member.findMany(...)
    }),
})
```

**Performance:** Uses cached `ctx.getUserOrganizations()` - no database calls!

**Option B: Manual Check via Context**

Access cached organizations in any procedure:

```typescript
export const organizationRouter = router({
  customEndpoint: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      // ✅ Cached - no additional fetch
      const organizations = await ctx.getUserOrganizations()
      const org = organizations.find(o => o.id === input.organizationId)

      // Check permission manually
      if (org?.role !== 'studio-owner' && !org?.permissions.includes('member:read')) {
        throw new TRPCError({ code: 'FORBIDDEN' })
      }

      return await doSomething()
    }),
})
```

**Error Handling:**
- Throws `INSUFFICIENT_PERMISSIONS` error if user lacks permission
- Client receives structured error with `errorCode` and `required` permissions

### 2. Server Components (Page-Level Permission Checks)

**RECOMMENDED PATTERN** - Use `getActiveOrganization` for domain-aware active org detection:

```typescript
// src/app/(protected)/studio/team/page.tsx
import { getQueryClient, trpc } from '@/trpc/server'
import { handleAuthError } from '@/lib/errors'
import { permissions } from '@/lib/better-auth/permissions'

export default async function TeamPage() {
  const queryClient = getQueryClient()

  // ✅ Get active organization (prefetched in layout, respects domain-first approach)
  const activeOrg = await queryClient
    .fetchQuery(trpc.organization.getActiveOrganization.queryOptions())
    .catch(handleAuthError)

  if (!activeOrg) {
    return <NoOrganizationError />
  }

  // ✅ Check permission using active org data (zero DB calls)
  // Owners have full access, check permissions array for others
  const hasAccess =
    activeOrg.role === 'owner' ||
    activeOrg.permissions.includes(permissions.MEMBER_READ)

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="max-w-md text-center space-y-2">
          <p className="text-sm text-destructive font-medium">
            You don't have permission to view team members
          </p>
          <p className="text-xs text-muted-foreground">
            Contact your organization owner to grant you the{' '}
            <code className="px-1 py-0.5 bg-muted rounded text-xs">
              member:read
            </code>{' '}
            permission.
          </p>
        </div>
      </div>
    )
  }

  // Only prefetch if user has permission (prevents hydration errors)
  await queryClient.fetchQuery(
    trpc.organization.getOrganizationMembers.queryOptions({
      organizationId: activeOrg.id,
    })
  )

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MemberList organizationId={activeOrg.id} />
    </HydrationBoundary>
  )
}
```

**Why This Pattern?**
- ✅ Prevents hydration errors (no failed queries in queryClient)
- ✅ Zero DB calls (uses cached `getUserOrganizations`)
- ✅ Prevents URL bypass (permission check on server)
- ✅ Early return with user-friendly error message

**OLD PATTERN (Causes Hydration Errors):**

```typescript
// ❌ DON'T DO THIS - causes hydration errors
try {
  await queryClient.fetchQuery(
    trpc.organization.getMembers.queryOptions({ organizationId })
  )
} catch (error) {
  // Failed query is already in queryClient - will cause hydration error!
  const errorCode = error?.cause?.errorCode
  if (errorCode === 'INSUFFICIENT_PERMISSIONS') {
    return <ErrorState />
  }
}
```

### 3. Client Components (Instant Permission Checks)

**RECOMMENDED PATTERN** - Use `useActiveOrganization` hook for centralized active org + permissions:

```typescript
// src/app/(protected)/studio/settings/_components/billing-tab.tsx
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'

export function BillingTab() {
  // ✅ Single source of truth for active org + permissions
  const { activeOrganization: activeOrg, hasPermission, isOwner, isLoading } = useActiveOrganization()

  if (isLoading) return <Loading />

  // ✅ Use hasPermission helper (automatically handles owner = full access)
  if (!hasPermission(permissions.BILLING_READ)) {
    return <PermissionError permission="billing:read" />
  }

  // ✅ Only fetch if user has permission (skips API call if no access)
  const { data } = trpc.payment.getPaymentMethods.useQuery(
    { organizationId: activeOrg?.id || '' },
    { enabled: !!activeOrg && hasPermission(permissions.BILLING_READ) }
  )

  return <BillingContent />
}
```

**Benefits:**
- ✅ Instant permission errors (no API call)
- ✅ Centralized hook respects domain-first approach
- ✅ `hasPermission()` helper automatically grants owners full access
- ✅ Server-side checks still enforced by `organizationProcedure`

**DEPRECATED PATTERN** - Avoid manual active org detection:

```typescript
// ❌ DON'T DO THIS - doesn't respect domain-first approach
const { data: organizations } = trpc.organization.getUserOrganizations.useQuery()
const activeOrg = organizations?.[0] // WRONG!
// OR
const activeOrg = organizations?.find(org => org.role === 'owner') // WRONG!
```

**Why This Is Wrong:**
- On subdomain `acme.mochi.test`, this might return a different org than expected
- Doesn't respect the domain-first multi-tenancy architecture
- Can cause security issues with wrong org's data being displayed

## Permission Service API

Located in `src/services/permission.service.ts`:

### `hasPermission(resource, action, organizationId)`

Check single permission:

```typescript
const canRead = await hasPermission('member', 'read', orgId)
if (!canRead) {
  throw new Error('Unauthorized')
}
```

### `hasAllPermissions(permissions, organizationId)`

Check multiple permissions (AND logic):

```typescript
const hasAll = await hasAllPermissions(
  ['clients:read', 'clients:update', 'clients:delete'],
  orgId
)
```

### `hasAnyPermission(permissions, organizationId)`

Check multiple permissions (OR logic):

```typescript
const hasAny = await hasAnyPermission(
  ['clients:read', 'clients:update'],
  orgId
)
```

### `requirePermission(resource, action, organizationId)`

Throws error if permission missing:

```typescript
await requirePermission('member', 'delete', orgId)
// Continues if user has permission, throws error if not
```

## Available Resources

**Studio Resources:**
- `member` - Team members management
- `invitation` - Member invitations
- `billing` - Payment methods and billing management
- `clients` - Client management
- `integrations` - Integration management (Stripe Connect, etc.)
- `studio-settings` - Studio settings
- `studio-analytics` - Studio analytics access

**Client Resources:**
- `websites`, `products`, `orders`, `campaigns`, `forms`, `submissions`, `contracts`, `invoices`, `customers`, `contacts`, `custom-fields`, `client-settings`, `client-analytics`

## Role Management

### Creating Roles

Roles can be created in two ways:

**1. Pre-defined roles** (via UI):
```typescript
// User creates role "Project Manager" with permissions
await prisma.organizationRole.create({
  data: {
    organizationId,
    role: 'Project Manager',
    permission: {
      clients: ['read', 'update'],
      projects: ['read', 'create', 'update'],
    },
  },
})
```

**2. Auto-generated roles** (during invitation):
```typescript
// User selects custom permissions without naming a role
// System auto-generates role name and stores permissions
const role = JSON.stringify(['member:read', 'clients:update'])
```

### Assigning Roles

```typescript
// Invite member with existing role
await inviteMember({
  organizationId,
  email: 'user@example.com',
  role: 'Project Manager',  // ← Role name
})

// Invite with custom permissions
await inviteMember({
  organizationId,
  email: 'user@example.com',
  role: JSON.stringify(['member:read', 'clients:update']),  // ← Auto-generated
})
```

## How It Works

### Flow Diagram (Optimized - Zero DB Calls)

```
1. Request → organizationProcedure middleware
2. Check membership in organization
3. If requirePermission specified:
   a. Parse "resource:action"
   b. Read from cached ctx.getUserOrganizations() ✅
   c. Check if user has permission in cached data
   - Studio owners: Auto-granted (role === 'studio-owner')
   - Regular members: Check permissions array
4. Return success/failure (NO DATABASE CALLS!)
```

**Old Flow (Deprecated):**
- Called hasPermission() → DB query for member role → DB query for role permissions → Better Auth API
- 3+ database calls per permission check

**New Flow (Current):**
- Read from ctx.getUserOrganizations() → Already cached → Check permissions array
- Zero database calls per permission check ✅

### Better Auth Integration (Legacy - Not Used in organizationProcedure)

**Note:** The `hasPermission()` service is now only used for backward compatibility. All `organizationProcedure` permission checks use cached context data.

```typescript
// Legacy Better Auth API call (in permission.service.ts)
// ⚠️ NOT used by organizationProcedure anymore (uses cached context instead)
const result = await auth.api.hasPermission({
  headers: await headers(),
  body: {
    permission: { [resource]: [action] },  // ← SINGULAR "permission"
    organizationId,  // ← Required for organization context
  },
})

return result?.success === true
```

**Use Cases for hasPermission():**
- Server actions outside tRPC context
- Legacy code not yet migrated to cached approach
- One-off permission checks where context isn't available

## Cache Invalidation

**When to Invalidate:**

Invalidate `getUserOrganizations` cache when permissions change:

1. **Role assignment changes** - User assigned different role
2. **Role permissions updated** - Organization role permissions modified
3. **User joins/leaves organization** - Membership changes
4. **User accepts invitation** - Becomes new member

**How to Invalidate (Client-Side):**

```typescript
// After role update mutation
const updateRoleMutation = trpc.organization.updateMemberRole.useMutation({
  onSuccess: () => {
    // ✅ Invalidate cached organizations to refetch with new permissions
    utils.organization.getUserOrganizations.invalidate()
  },
})

// After accepting invitation
const acceptInvitationMutation = trpc.organization.acceptInvitation.useMutation({
  onSuccess: () => {
    // ✅ User now has new organization - refetch
    utils.organization.getUserOrganizations.invalidate()
  },
})
```

**Server-Side Cache:**
- Auto-purged on each new request (React's `cache()` is request-scoped)
- No manual invalidation needed

**Future (WebSockets):**
- Real-time permission updates via WebSocket events
- Automatically invalidate cache when permissions change in real-time
- Example: Admin changes user role → WebSocket event → Client invalidates cache

## Common Patterns

### Pattern 1: Protect tRPC Endpoint

```typescript
deleteClient: organizationProcedure({ requirePermission: 'clients:delete' })
  .input(z.object({ organizationId: z.string(), clientId: z.string() }))
  .mutation(async ({ input }) => {
    // Permission already verified
    await prisma.client.delete({ where: { id: input.clientId } })
  })
```

### Pattern 2: Page-Level Permission Check (Prevents Hydration Errors & URL Bypass)

**RECOMMENDED** - Use this pattern for all protected pages:

```typescript
// src/app/(protected)/studio/team/page.tsx
import { getQueryClient, trpc } from '@/trpc/server'
import { handleAuthError } from '@/lib/errors'
import { permissions } from '@/lib/better-auth/permissions'

export default async function TeamPage() {
  const queryClient = getQueryClient()

  // ✅ Get active organization (respects domain-first approach)
  const activeOrg = await queryClient
    .fetchQuery(trpc.organization.getActiveOrganization.queryOptions())
    .catch(handleAuthError)

  if (!activeOrg) {
    return <NoOrganizationError />
  }

  // ✅ Check permission using active org data (zero DB calls)
  const hasAccess =
    activeOrg.role === 'owner' ||
    activeOrg.permissions.includes(permissions.MEMBER_READ)

  if (!hasAccess) {
    return <PermissionError permission="member:read" />
  }

  // Only fetch if user has permission (prevents hydration errors)
  await queryClient.fetchQuery(
    trpc.organization.getMembers.queryOptions({
      organizationId: activeOrg.id,
    })
  )

  return <MemberList organizationId={activeOrg.id} />
}
```

**Why This Pattern?**
- ✅ Prevents URL bypass (server-side check)
- ✅ Prevents hydration errors (check before fetch)
- ✅ Respects domain-first multi-tenancy approach
- ✅ Zero DB calls (uses cached data)
- ✅ User-friendly error messages

### Pattern 3: Handle Permission Errors

```typescript
const handleDeleteClient = async (clientId: string) => {
  try {
    await deleteMutation.mutateAsync({ organizationId, clientId })
    toast.success('Client deleted')
  } catch (err) {
    const errorData = err?.data?.cause

    if (errorData?.errorCode === 'INSUFFICIENT_PERMISSIONS') {
      toast.error(`Missing permission: ${errorData.required.join(', ')}`, {
        description: 'Contact your organization owner for access',
      })
    } else {
      toast.error('Failed to delete client')
    }
  }
}
```

## Security Best Practices

1. **Always check server-side** - Never rely on client-side permission checks alone
2. **Use domain-first approach** - On subdomains, ONLY that org's data should be accessible
3. **Use `useActiveOrganization` hook** - Single source of truth for client components
4. **Use `getActiveOrganization.queryOptions()` for server** - Respects domain context
5. **Check permissions before fetching** - Prevents hydration errors and URL bypass attacks
6. **Use cached permissions** - Read from active org data to avoid unnecessary DB calls
7. **Use organizationProcedure** - Automatically validates membership and permissions for tRPC endpoints
8. **Protect pages with permission checks** - Add permission checks in page.tsx to prevent direct URL access
9. **Handle errors gracefully** - Show user-friendly messages for permission errors
10. **Owners = full access** - Better Auth automatically grants full permissions to owners
11. **Hide UI elements** - Use sidebar permissions to hide links users can't access

### Domain-First Security Rules

- **On subdomain** (`acme.mochi.test`): User can ONLY access `acme` org data
- **On custom domain** (`mycompany.com`): User can ONLY access that company's data
- **On root domain** (`mochi.test`): Uses `session.activeOrganizationId`
- **Cross-domain switching**: Use team-switcher to navigate to org's subdomain

## Error Codes

- `INSUFFICIENT_PERMISSIONS` - User lacks required permission
- `NOT_ORGANIZATION_MEMBER` - User not a member of the organization
- `ONBOARDING_INCOMPLETE` - User hasn't created an organization yet
- `PENDING_INVITATION` - User has pending invitation, not yet accepted

## Debugging

Enable debug logs in `permission.service.ts`:

```typescript
console.log('[hasPermission] Member role from DB:', { role: member?.role })
console.log('[hasPermission] Role permissions from DB:', { permissions: roleData?.permission })
console.log('[hasPermission] Better Auth API result:', { success: result?.success })
```

Check:
1. Is user in the Member table for this organization?
2. Does their role exist in OrganizationRole table?
3. Does the role have the required permission?
4. Is Better Auth returning the correct result?
