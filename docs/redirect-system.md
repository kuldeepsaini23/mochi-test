# Redirect System

**Error-based server-side redirects.** tRPC procedures throw structured errors, layouts catch them and redirect.

## How It Works

### 1. tRPC Throws Structured Errors

```typescript
// src/trpc/routers/organization.ts
getUserOrganizations: protectedProcedure.query(async ({ ctx }) => {
  const memberships = await getUserMemberships(ctx.user.id)

  if (!memberships.length) {
    // User has no organizations - needs onboarding
    throw createStructuredError(
      'PRECONDITION_FAILED',
      'Please complete onboarding to access this feature',
      {
        errorCode: ERROR_CODES.ONBOARDING_INCOMPLETE,
        requiredStep: 'onboarding',
      }
    )
  }

  return memberships
})
```

### 2. Layouts Catch & Redirect

```tsx
// app/(protected)/layout.tsx
import { getQueryClient, trpc } from '@/trpc/server'
import { handleAuthError } from '@/lib/errors'

export default async function ProtectedLayout({ children }) {
  const queryClient = getQueryClient()

  // Check onboarding - if error, handleAuthError redirects
  await queryClient
    .fetchQuery(trpc.organization.getUserOrganizations.queryOptions())
    .catch(handleAuthError)

  // If we reach here, user has completed onboarding
  return <>{children}</>
}
```

### 3. Error Handler Maps to Redirects

```typescript
// src/lib/errors/redirects.ts
export function handleAuthError(error: unknown): never {
  if (error instanceof TRPCError) {
    const cause = error.cause as StructuredErrorCause

    if (cause?.errorCode === ERROR_CODES.ONBOARDING_INCOMPLETE) {
      redirect('/onboarding')
    }

    if (cause?.errorCode === ERROR_CODES.STUDIO_ONBOARDING_COMPLETED) {
      redirect('/studio')
    }

    if (error.code === 'UNAUTHORIZED') {
      redirect('/sign-in')
    }
  }

  redirect('/sign-in')
}
```

## Error Codes

| Error Code                     | Redirect To   | When                           |
| ------------------------------ | ------------- | ------------------------------ |
| `ONBOARDING_INCOMPLETE`        | `/onboarding` | User has no organizations      |
| `STUDIO_ONBOARDING_COMPLETED`  | `/studio`     | User already owns a studio     |
| `UNAUTHORIZED`                 | `/sign-in`    | User not authenticated         |

## Common Patterns

### Protected Layout (Requires Organization)

```tsx
// app/(protected)/layout.tsx
export default async function ProtectedLayout({ children }) {
  const queryClient = getQueryClient()

  // Check user has organization
  await queryClient
    .fetchQuery(trpc.organization.getUserOrganizations.queryOptions())
    .catch(handleAuthError)

  return <>{children}</>
}
```

**What happens:**
- Not logged in? → Redirects to `/sign-in`
- No organizations? → Redirects to `/onboarding`
- Has organization? → Shows the page

### Onboarding Layout (Prevents Duplicates)

```tsx
// app/onboarding/layout.tsx
export default async function OnboardingLayout({ children }) {
  const queryClient = getQueryClient()

  // Check user is allowed to access onboarding
  await queryClient
    .fetchQuery(trpc.organization.checkOnboardingAccess.queryOptions())
    .catch(handleAuthError)

  return <>{children}</>
}
```

**What happens:**
- Not logged in? → Redirects to `/sign-in`
- Already owns a studio? → Redirects to `/studio` (prevents duplicates!)
- Authenticated + no studio? → Shows onboarding form

### Auth Pages (No Checks)

```tsx
// app/(auth)/sign-in/page.tsx
export default function SignInPage() {
  // Don't check auth - users need to access this to sign in!
  return <SignInForm />
}
```

## Navigation Best Practices

### ❌ Soft Navigation (router.push) Across Auth Boundaries

```tsx
// After sign-in, user might not be onboarded
await authClient.signIn.email({ email, password })
router.push('/studio') // ❌ Causes flash, page renders then redirects
```

### ✅ Hard Navigation (window.location.href)

```tsx
// After sign-in, check where to go
await authClient.signIn.email({ email, password })

try {
  await utils.organization.getUserOrganizations.fetch()
  window.location.href = '/studio' // Has org
} catch {
  window.location.href = '/onboarding' // No org
}
```

### ✅ Soft Navigation Within App

```tsx
// Inside protected routes, user already verified
router.push('/studio/clients') // ✅ Instant, no flash
router.push('/studio/settings') // ✅ Instant, no flash
```

**Rule:** Use `window.location.href` when crossing auth boundaries, `router.push()` within the app.

## Important Notes

⚠️ **Always use `.catch()` not `try-catch`**

```tsx
// ❌ BAD: try-catch swallows redirect throw
try {
  await queryClient.fetchQuery(...)
} catch (error) {
  handleAuthError(error) // Throws redirect, but catch completes
}
// Page still renders! 🐛

// ✅ GOOD: .catch() lets redirect throw propagate
await queryClient
  .fetchQuery(...)
  .catch(handleAuthError) // Throws redirect, stops execution
// Page never renders ✅
```

## Adding New Error Codes

1. Define in `src/lib/errors/error-codes.ts`:

```typescript
export const ERROR_CODES = {
  // ... existing
  CUSTOM_CHECK_FAILED: 'CUSTOM_CHECK_FAILED',
} as const
```

2. Throw in tRPC procedure:

```typescript
throw createStructuredError(
  'PRECONDITION_FAILED',
  'Custom check failed',
  { errorCode: ERROR_CODES.CUSTOM_CHECK_FAILED }
)
```

3. Handle in `src/lib/errors/redirects.ts`:

```typescript
if (cause?.errorCode === ERROR_CODES.CUSTOM_CHECK_FAILED) {
  redirect('/custom-page')
}
```
