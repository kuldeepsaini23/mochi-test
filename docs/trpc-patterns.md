# tRPC Patterns

> **Note:** Auth operations (sign in/up/out) use Better Auth client directly (`authClient` from `@/lib/better-auth/auth-client`), not tRPC.

## Table of Contents

1. [Protection Layers](#protection-layers) - How to protect your API endpoints
2. [Server Components](#server-components) - How to use tRPC in server components
3. [Loading States](#loading-states) - How to add skeleton loading states
4. [Client Components](#client-components) - How to use tRPC in client components

---

## Protection Layers

**Use layered procedures to protect your API endpoints.** Each layer adds more checks.

### Quick Reference

| Procedure                         | Checks                                          | Use For                    |
| --------------------------------- | ----------------------------------------------- | -------------------------- |
| `baseProcedure`                   | None (public)                                   | Public data                |
| `protectedProcedure`              | ✅ Auth                                          | User data                  |
| `organizationProcedure()`         | ✅ Auth + ✅ Has org + ✅ Org member            | Organization data          |
| `organizationProcedure({ requireRole })` | All above + ✅ User has required role    | Admin/owner actions        |

### Layer 1: Public (No Auth)

```typescript
import { createTRPCRouter, baseProcedure } from '../init'

export const publicRouter = createTRPCRouter({
  getPricing: baseProcedure.query(() => {
    return { plans: PLANS }
  }),
})
```

**When to use:** Public data that anyone can see.

### Layer 2: Authenticated

```typescript
import { createTRPCRouter, protectedProcedure } from '../init'

export const userRouter = createTRPCRouter({
  getProfile: protectedProcedure.query(({ ctx }) => {
    // ctx.user is guaranteed to exist
    return { email: ctx.user.email }
  }),
})
```

**When to use:** User must be logged in.

### Layer 3: Organization Member

```typescript
import { createTRPCRouter, organizationProcedure } from '../init'
import { z } from 'zod'

export const orgRouter = createTRPCRouter({
  getDetails: organizationProcedure()
    .input(z.object({ organizationId: z.string() }))
    .query(({ ctx }) => {
      // ctx.organization - the org the user is member of
      // ctx.memberRole - user's role in the org
      // ctx.currentPlan - active plan for this org
      return {
        name: ctx.organization.name,
        role: ctx.memberRole,
        plan: ctx.currentPlan?.name,
      }
    }),
})
```

**When to use:** User must be a member of the organization.

**Important:** Input MUST include `organizationId` field.

**Automatic onboarding check:** If user has no organizations, throws `ONBOARDING_INCOMPLETE`.

### Layer 4: Role-Based

```typescript
import { createTRPCRouter, organizationProcedure } from '../init'
import { z } from 'zod'
import { prisma } from '@/lib/config'

export const adminRouter = createTRPCRouter({
  // Only studio-owner can delete
  deleteOrg: organizationProcedure({ requireRole: ['studio-owner'] })
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await prisma.organization.delete({
        where: { id: input.organizationId },
      })
      return { success: true }
    }),

  // studio-owner OR admin can invite
  inviteMember: organizationProcedure({ requireRole: ['studio-owner', 'admin'] })
    .input(z.object({
      organizationId: z.string(),
      email: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Invite logic
      return { success: true }
    }),
})
```

**When to use:** Only certain roles can perform the action.

**Available roles:** Check your Better Auth roles in `prisma/schema.prisma` (OrganizationRole enum).

---

## Server Components

### 1. Direct Query (Cached)

Use when rendering data directly in server component.

```tsx
import { trpc } from '@/trpc/server'

export default async function Page() {
  const data = await trpc.user.getProfile.query()
  return <div>{data.email}</div>
}
```

### 2. Prefetch for Client (Cached + Hydrated)

Use when client component needs the data. Prevents loading flash.

```tsx
// layout.tsx or page.tsx (Server Component)
import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getQueryClient, trpc } from '@/trpc/server'
import { UserList } from './user-list' // Client component

export default async function Page() {
  const queryClient = getQueryClient()

  // Prefetch data on server - MUST await for hydration to work
  await queryClient.prefetchQuery(trpc.user.list.queryOptions())

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <UserList /> {/* Gets data instantly */}
    </HydrationBoundary>
  )
}
```

```tsx
// user-list.tsx (Client Component)
'use client'
import { trpc } from '@/trpc/react-provider'

export function UserList() {
  // Gets prefetched data instantly - no loading state needed
  const { data: users, isLoading } = trpc.user.list.useQuery()

  if (isLoading || !users) return null

  return (
    <ul>
      {users.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  )
}
```

**Important:** Always `await` the prefetch and use `useQuery` with loading checks.

### 2a. Prefetch with Permission Check (Prevents Hydration Errors)

**CRITICAL:** When prefetching permission-protected queries, check permissions FIRST using `getActiveOrganization` to prevent hydration errors.

```tsx
// page.tsx (Server Component)
import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getQueryClient, trpc } from '@/trpc/server'
import { handleAuthError } from '@/lib/errors'
import { permissions } from '@/lib/better-auth/permissions'
import { MemberList } from './member-list'

export default async function TeamPage() {
  const queryClient = getQueryClient()

  // ✅ Get active organization (prefetched in layout, respects domain-first approach)
  const activeOrg = await queryClient
    .fetchQuery(trpc.organization.getActiveOrganization.queryOptions())
    .catch(handleAuthError)

  if (!activeOrg) {
    return <NoOrganizationError />
  }

  // ✅ Check permission using active org data BEFORE fetching
  // Owners have full access, check permissions array for others
  const hasAccess =
    activeOrg.role === 'owner' ||
    activeOrg.permissions.includes(permissions.MEMBER_READ)

  if (!hasAccess) {
    return <PermissionError permission="member:read" />
  }

  // Only fetch if user has permission
  await queryClient.fetchQuery(
    trpc.organization.getMembers.queryOptions({
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
- ✅ Zero DB calls for permission check (uses cached data)
- ✅ Prevents URL bypass attacks (server-side permission check)
- ✅ User-friendly error messages

**What NOT to Do:**

```tsx
// ❌ DON'T DO THIS - causes hydration errors
try {
  await queryClient.fetchQuery(trpc.organization.getMembers.queryOptions({ organizationId }))
} catch (error) {
  // Failed query is already in queryClient state
  // When dehydrated and sent to client, causes:
  // "A query that was dehydrated as pending ended up rejecting"
  if (error.cause?.errorCode === 'INSUFFICIENT_PERMISSIONS') {
    return <ErrorState />
  }
}
```

**The Problem:**
1. Query executes and fails with permission error
2. Failed query gets stored in queryClient state
3. `dehydrate(queryClient)` serializes the failed query
4. Client tries to hydrate → pending query rejects → error thrown

**The Solution:**
Check permissions using cached data BEFORE attempting to fetch. Query never executes if user lacks permission, so queryClient never contains a failed query.

### 3. Direct Caller (Not Cached)

Use for mutations or when you don't want caching.

```tsx
import { createCaller } from '@/trpc/server'

export default async function Page() {
  const api = await createCaller()
  await api.analytics.track({ event: 'page_view' })
  return <div>Tracked!</div>
}
```

---

## Loading States

### The Pattern: Client-Side Loading Only

**Goal:** Show skeleton on first load, instant content on subsequent navigations.

**How it works:**
1. Page renders immediately (no await in page.tsx)
2. Client component shows skeleton only when `isLoading && data.length === 0`
3. React Query caches data - subsequent navigations show cached data instantly

### Step-by-Step

**1. Create a skeleton component** that mirrors your page layout:

```tsx
// components/team-loading.tsx
import { Skeleton } from '@/components/ui/skeleton'
import { SectionHeader } from '../global/section-header'

export function TeamLoading() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-6">
        <SectionHeader title="Members" description="Manage team members" />
        <Skeleton className="h-10 w-full" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-4 border rounded-lg">
              <Skeleton className="size-10 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

**2. Update your client component** to use the skeleton:

```tsx
// components/team-manager.tsx
'use client'
import { trpc } from '@/trpc/react-provider'
import { TeamLoading } from './team-loading'

export function TeamManager({ organizationId }: { organizationId: string }) {
  const { data: members = [], isLoading } = trpc.organization.getMembers.useQuery({
    organizationId
  })

  // Only show skeleton on FIRST load (no cached data)
  if (isLoading && members.length === 0) {
    return <TeamLoading />
  }

  return (
    <div>
      {members.map(member => (
        <div key={member.id}>{member.name}</div>
      ))}
    </div>
  )
}
```

**3. Update your page** to render immediately:

```tsx
// app/(protected)/team/page.tsx
import { StudioContentLayout } from '@/components/global/studio-content-layout'
import { TeamManager } from '@/components/team-manager'
import { getQueryClient, trpc } from '@/trpc/server'
import { handleAuthError } from '@/lib/errors'

export default async function TeamPage() {
  const queryClient = getQueryClient()

  // ✅ Get active organization (prefetched in layout, respects domain-first approach)
  const activeOrg = await queryClient
    .fetchQuery(trpc.organization.getActiveOrganization.queryOptions())
    .catch(handleAuthError)

  if (!activeOrg) {
    return <div>No organization found</div>
  }

  // ✅ NO AWAIT - page renders immediately
  // Client component handles loading state
  return (
    <StudioContentLayout>
      <TeamManager organizationId={activeOrg.id} />
    </StudioContentLayout>
  )
}
```

### What NOT to Do

**❌ DON'T use loading.tsx**
```tsx
// app/(protected)/team/loading.tsx - DON'T DO THIS
export default function Loading() {
  return <TeamLoading />
}
```
**Why:** Shows on EVERY navigation because Next.js waits for entire page.tsx to finish.

**❌ DON'T use Suspense in page.tsx**
```tsx
// ❌ DON'T DO THIS
<Suspense fallback={<TeamLoading />}>
  <TeamContent organizationId={activeOrg.id} />
</Suspense>
```
**Why:** Breaks the prefetching. Suspense treats it as streaming, showing loading on every visit.

**❌ DON'T await data fetch in page.tsx**
```tsx
// ❌ DON'T DO THIS
await queryClient.fetchQuery(
  trpc.organization.getMembers.queryOptions({ organizationId: activeOrg.id })
)
```
**Why:** Makes the entire page wait, causing delay on every navigation even when data is cached.

**❌ DON'T show skeleton when cached data exists**
```tsx
// ❌ DON'T DO THIS
if (isLoading) {
  return <TeamLoading />
}
```
**Why:** Shows skeleton even when data is already in cache. Use `isLoading && data.length === 0` instead.

### Result

- **First visit:** Page structure appears instantly → skeleton shows → data loads
- **Subsequent visits:** Page structure + data appear instantly (from cache) → no skeleton

### Alternative Pattern: Suspense + useSuspenseQuery

**When to use:** For complex pages where you want server-side prefetching + proper Suspense boundaries.

**Step-by-Step:**

**1. Create skeleton component** in separate file:

```tsx
// _components/page-skeleton.tsx
import { Skeleton } from '@/components/ui/skeleton'

export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}
```

**2. Update page.tsx** - DON'T await the prefetch:

```tsx
// page.tsx (Server Component)
import { Suspense } from 'react'
import { getQueryClient, trpc } from '@/trpc/server'
import { HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { PageContent } from './_components/page-content'
import { PageSkeleton } from './_components/page-skeleton'

export default async function Page() {
  const queryClient = getQueryClient()

  // ✅ Prefetch but DON'T await - let Suspense handle loading
  void queryClient.prefetchQuery(
    trpc.data.list.queryOptions({ id: '123' })
  )

  return (
    <Suspense fallback={<PageSkeleton />}>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <PageContent id="123" />
      </HydrationBoundary>
    </Suspense>
  )
}
```

**3. Client component** uses `useSuspenseQuery`:

```tsx
// _components/page-content.tsx
'use client'
import { trpc } from '@/trpc/react-provider'

export function PageContent({ id }: { id: string }) {
  // ✅ Use useSuspenseQuery - component suspends until data ready
  const [data] = trpc.data.list.useSuspenseQuery({ id })

  return <div>{data.map(item => <div key={item.id}>{item.name}</div>)}</div>
}
```

**Key Points:**
- ✅ DON'T await `prefetchQuery` in page.tsx (use `void` to silence linter)
- ✅ Wrap in `<Suspense>` with skeleton fallback
- ✅ Client component uses `useSuspenseQuery` (not `useQuery`)
- ✅ Returns array: `[data]` not object `{ data }`
- ✅ Skeleton shows on first load, instant display on subsequent navigations

**Example:** See `src/app/(protected)/studio/saas-config/` for full implementation

---

## Client Components

### 1. Query

Fetches data. If prefetched from server, shows instantly.

```tsx
'use client'
import { trpc } from '@/trpc/react-provider'

export function UserList() {
  const { data, isLoading } = trpc.user.list.useQuery()

  if (isLoading) return <p>Loading...</p>

  return (
    <ul>
      {data?.map(user => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  )
}
```

### 2. Mutation

Updates data, then refetches related queries.

```tsx
'use client'
import { trpc } from '@/trpc/react-provider'

export function CreateUserForm() {
  const utils = trpc.useUtils()

  const create = trpc.user.create.useMutation({
    onSuccess: () => {
      utils.user.list.invalidate() // Refetch list
    },
  })

  return (
    <button onClick={() => create.mutate({ name: 'John' })}>
      Create
    </button>
  )
}
```

### 3. Optimistic Update

Updates UI instantly, syncs with server, rolls back if fails.

```tsx
'use client'
import { trpc } from '@/trpc/react-provider'

export function LikeButton({ userId }: { userId: string }) {
  const utils = trpc.useUtils()

  const like = trpc.user.like.useMutation({
    onMutate: async ({ userId }) => {
      // Cancel ongoing queries
      await utils.user.getById.cancel({ id: userId })

      // Save current data
      const prev = utils.user.getById.getData({ id: userId })

      // Update UI immediately
      utils.user.getById.setData(
        { id: userId },
        (old) => old ? { ...old, likes: old.likes + 1 } : old
      )

      return { prev }
    },
    onError: (_, vars, ctx) => {
      // Rollback on error
      utils.user.getById.setData({ id: vars.userId }, ctx?.prev)
    },
    onSettled: (_, __, vars) => {
      // Sync with server
      utils.user.getById.invalidate({ id: vars.userId })
    },
  })

  return <button onClick={() => like.mutate({ userId })}>Like</button>
}
```

### 4. Multi-Query Optimistic Update

When a mutation affects multiple queries (e.g., updating profile updates both `profile.getProfile` and `user.getProfile`), you must optimistically update ALL related queries to ensure all UI components update instantly.

**Key Pattern:**
1. Cancel all related queries
2. Snapshot all current data
3. Optimistically update all caches
4. Rollback all on error
5. Invalidate all on settled

```tsx
'use client'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'

export function UpdateProfileForm() {
  const utils = trpc.useUtils()

  const updateName = trpc.profile.updateName.useMutation({
    onMutate: async (variables) => {
      // 1. Cancel ALL related queries
      await utils.profile.getProfile.cancel()
      await utils.user.getProfile.cancel()

      // 2. Snapshot ALL current data for rollback
      const previousProfile = utils.profile.getProfile.getData()
      const previousUser = utils.user.getProfile.getData()

      // 3. Optimistically update ALL caches
      utils.profile.getProfile.setData(undefined, (old) => {
        if (!old) return old
        return { ...old, name: variables.name }
      })

      utils.user.getProfile.setData(undefined, (old) => {
        if (!old) return old
        return { ...old, name: variables.name }
      })

      return { previousProfile, previousUser }
    },
    onSuccess: () => {
      // 4. Invalidate ALL to refetch fresh data
      utils.profile.getProfile.invalidate()
      utils.user.getProfile.invalidate()
      toast.success('Name updated successfully')
    },
    onError: (error, variables, context) => {
      // 5. Rollback ALL on error
      if (context?.previousProfile) {
        utils.profile.getProfile.setData(undefined, context.previousProfile)
      }
      if (context?.previousUser) {
        utils.user.getProfile.setData(undefined, context.previousUser)
      }
      toast.error('Failed to update name')
    },
    onSettled: () => {
      // 6. Always refetch to ensure sync
      utils.profile.getProfile.invalidate()
      utils.user.getProfile.invalidate()
    },
  })

  return <button onClick={() => updateName.mutate({ name: 'New Name' })}>Update</button>
}
```

**Why This Matters:**

If you only update `profile.getProfile` but not `user.getProfile`, components using the user query (like sidebar) won't update until manual refresh.

**Common Scenarios:**
- Profile updates → affects `profile.*` and `user.*` queries
- Organization updates → affects `organization.*` and `getUserOrganizations` queries
- Role changes → affects member queries and permission caches

**CRITICAL: Ensure Backend Returns Fresh Data**

If your backend query returns data from `ctx` (session), optimistic updates won't persist after invalidation because refetch gets stale session data:

```tsx
// ❌ BAD: Returns stale session data
getProfile: protectedProcedure.query(({ ctx }) => {
  return ctx.user  // Session data - won't reflect DB updates!
})

// ✅ GOOD: Fetches fresh data from database
getProfile: protectedProcedure.query(async ({ ctx }) => {
  return await prisma.user.findUnique({
    where: { id: ctx.user.id },
    select: { id: true, name: true, email: true }
  })
})
```

**When to use session (`ctx`) vs database:**
- Session: When you just need auth check and current session data won't change
- Database: When the data can be mutated by other endpoints

---

## Error Handling

### Structured Errors

All errors include machine-readable codes:

```tsx
'use client'
import { trpc } from '@/trpc/react-provider'

export function CreateWebsite() {
  const create = trpc.website.create.useMutation({
    onError: (error) => {
      const cause = error.data?.cause as any

      if (cause?.errorCode === 'ONBOARDING_INCOMPLETE') {
        window.location.href = '/onboarding'
      } else if (cause?.errorCode === 'INSUFFICIENT_PERMISSIONS') {
        toast.error(`You need ${cause.required.join(' or ')} role`)
      } else {
        toast.error(error.message)
      }
    },
  })
}
```

**Available error codes:** See `src/lib/errors/error-codes.ts`

---

## Key Concepts

### Caching

- `trpc.procedure.query()` - ✅ Cached
- `queryClient.prefetchQuery()` - ✅ Cached + sent to client
- `createCaller()` - ❌ NOT cached

### Context & Middleware

All methods run the same procedures with same middlewares:

```typescript
// These ALL run the same middleware:
await trpc.premium.getData.query() // ✅
queryClient.prefetchQuery(trpc.premium.getData.queryOptions()) // ✅
const api = await createCaller(); await api.premium.getData() // ✅
```

**Only difference:** Cache storage.

---

## Examples

See real examples in:
- `src/trpc/routers/organization.ts` - All layers demonstrated
- `src/trpc/routers/user.ts` - Protected procedures with database fetching
- `src/trpc/routers/profile.ts` - Protected procedures for user mutations
- `src/trpc/routers/payment.ts` - Protected procedures
- `src/app/(protected)/studio/settings/_components/profile-tab.tsx` - Multi-query optimistic updates

---

## Quick Decisions

**"Should I use protectedProcedure or organizationProcedure?"**
- If endpoint requires organization membership → `organizationProcedure()`
- If it's okay for users without organizations → `protectedProcedure`

**"How do I restrict to certain roles?"**
- Use `organizationProcedure({ requireRole: ['studio-owner'] })`

**"How do I check if user completed onboarding?"**
- `organizationProcedure()` does this automatically - throws `ONBOARDING_INCOMPLETE` if user has no organizations

**"How do I protect a page from direct URL access?"**
1. Get active organization: `await queryClient.fetchQuery(trpc.organization.getActiveOrganization.queryOptions())`
2. Check permission: `activeOrg.role === 'owner' || activeOrg.permissions.includes(permission)`
3. Return error UI if no access
4. Only fetch data if user has permission

**"How do I get the active organization in client components?"**
- Use `useActiveOrganization` hook: `const { activeOrganization, hasPermission, isOwner } = useActiveOrganization()`
- DON'T manually detect from organizations list: `organizations?.[0]` is WRONG

**"Why should I use getActiveOrganization instead of getUserOrganizations?"**
- `getActiveOrganization` respects domain-first multi-tenancy approach
- On subdomain `acme.mochi.test`, returns the `acme` org
- Prevents security issues where wrong org's data could be displayed

**"I'm getting 'A query that was dehydrated as pending ended up rejecting' error. How do I fix it?"**
- Check permissions BEFORE fetching to prevent failed queries from entering queryClient
- See Pattern 2a in Server Components section above

**"Should I use hasPermission() service or cached permissions?"**
- **Use cached permissions** (via `getUserOrganizations()`) - zero DB calls
- **Only use hasPermission()** for server actions outside tRPC context or legacy code

**"When should I invalidate the getUserOrganizations cache?"**
- After role assignments change
- After role permissions are updated
- After user joins/leaves organization
- After accepting invitations

**"My optimistic update works but some UI components don't update. What's wrong?"**
- You're probably only invalidating one query when multiple queries share the same data
- Find ALL queries that display the mutated data and invalidate them all
- Example: Updating profile affects both `profile.getProfile` AND `user.getProfile`
- See "Multi-Query Optimistic Update" pattern above

**"Should my query fetch from ctx (session) or database?"**
- **Use ctx (session)**: When the data never changes (e.g., user ID, initial auth data)
- **Use database**: When the data can be mutated (e.g., user name, email, organization settings)
- **Why**: Session data is stale - optimistic updates won't persist if you refetch from ctx
- See "CRITICAL: Ensure Backend Returns Fresh Data" in Optimistic Updates section

**"How do I add loading states to my page?"**
1. Create skeleton component that mirrors your layout
2. Update client component to show skeleton only when `isLoading && data.length === 0`
3. DON'T use loading.tsx or Suspense in page.tsx
4. DON'T await data fetch in page.tsx
- See "Loading States" section above
