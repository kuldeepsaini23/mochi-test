# tRPC Architecture

## Clean & Simple Structure

```
src/trpc/
├── procedures/          ← Building blocks (auth checks)
│   ├── base.ts         ← Core tRPC instance
│   ├── auth.ts         ← protectedProcedure
│   ├── organization.ts ← organizationProcedure
│   └── index.ts        ← Re-exports all
│
├── routers/            ← Thin controllers
│   ├── user.ts         ← Call services only
│   ├── organization.ts ← Call services only
│   └── _app.ts         ← Combine all routers
│
├── context.ts          ← Shared context (auth, prisma)
├── errors.ts           ← Error helpers
└── init.ts             ← Re-exports for backwards compatibility
```

## How It Works

### 1. Procedures (Guards) - Run FIRST

```typescript
import { protectedProcedure, organizationProcedure } from '@/trpc/procedures'

// Just auth check
protectedProcedure

// Auth + membership check
organizationProcedure()

// Auth + membership + role check
organizationProcedure({ requireRole: ['studio-owner'] })
```

### 2. Routers (Controllers) - Run AFTER procedures pass

```typescript
// ✅ GOOD: Thin controller, just calls service
getUserOrganizations: protectedProcedure.query(async ({ ctx }) => {
  return await getUserMemberships(ctx.user.id) // Service call
})

// ❌ BAD: Don't do this
getUserOrganizations: protectedProcedure.query(async ({ ctx }) => {
  return await prisma.member.findMany({ ... }) // Direct Prisma!
})
```

### 3. Services (DAL) - Reusable data access

```typescript
// src/services/membership.service.ts

// ✅ Pure database query
export async function getUserMemberships(userId: string) {
  return await prisma.member.findMany({
    where: { userId },
    include: { organization: true },
  })
}
```

## Adding New Features

### Adding a new auth check:

1. Create new procedure in `src/trpc/procedures/`
2. Export it from `src/trpc/procedures/index.ts`
3. Use it in routers

### Adding a new endpoint:

1. Call service from router
2. If service doesn't exist, create it in `src/services/`
3. Procedure handles ALL auth/permission checks

## Benefits

✅ **Easy to read** - Each file has ONE job
✅ **Easy to add** - Create procedure → use in router
✅ **No duplication** - Services reused everywhere
✅ **Type-safe** - Full TypeScript support
✅ **Secure** - Procedures guard ALL routes
