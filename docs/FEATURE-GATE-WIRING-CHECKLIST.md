# Feature Gate Wiring Checklist

This document tracks the progress of wiring up feature gates across the application.

## How Feature Gates Work

```typescript
// In a tRPC mutation:
import { withFeatureGate, incrementUsageAndInvalidate, decrementUsageAndInvalidate } from '@/trpc/procedures/feature-gates'

// CREATE: Check gate → Create → Increment usage
createSomething: organizationProcedure()
  .mutation(async ({ ctx, input }) => {
    await withFeatureGate(ctx, ctx.organizationId, 'feature.limit')
    const result = await createSomething(input)
    await incrementUsageAndInvalidate(ctx, ctx.organizationId, 'feature.limit')
    return result
  })

// DELETE: Delete → Decrement usage
deleteSomething: organizationProcedure()
  .mutation(async ({ ctx, input }) => {
    await deleteSomething(input.id)
    await decrementUsageAndInvalidate(ctx, ctx.organizationId, 'feature.limit')
    return { success: true }
  })
```

---

## LIMIT Features (Create/Delete tracking)

### Easy (Simple create/delete patterns)

| # | Feature Key | Router File | Create Mutation | Delete Mutation | Status |
|---|-------------|-------------|-----------------|-----------------|--------|
| 1 | `forms.limit` | `forms.ts` | `create` | `delete`, `bulkDelete` | ✅ DONE |
| 2 | `email_templates.limit` | `email-templates.ts` | `create`, `duplicate` | `delete` | ✅ DONE |
| 3 | `email_domains.limit` | `email-domains.ts` | `create` | `delete` | ✅ DONE |
| 4 | `chat_widgets.limit` | `chat-widgets.ts` | `create` | `delete`, `bulkDelete` | ✅ DONE |
| 5 | `pipelines.limit` | `pipeline.ts` | `create` | `delete` | ✅ DONE |

### Medium (May have nested resources or special logic)

| # | Feature Key | Router File | Create Mutation | Delete Mutation | Status |
|---|-------------|-------------|-----------------|-----------------|--------|
| 6 | `websites.limit` | `websites.ts` | `create`, `duplicate` | `delete`, `bulkDelete` | ✅ DONE |
| 7 | `pages_per_website.limit` | `pages.ts` | `create`, `duplicate` | N/A (per-website count) | ✅ DONE |
| 8 | `products.limit` | `products.ts` | `create` | `delete`, `bulkDelete` | ✅ DONE |
| 9 | `leads.limit` | `leads.ts` | `create` | `delete`, `bulkDelete` | ✅ DONE |
| 10 | `tickets.limit` | `pipeline.ts` | `createTicket` | `deleteTicket` | ✅ DONE |

### Complex (Special handling required)

| # | Feature Key | Router File | Create Mutation | Delete Mutation | Notes | Status |
|---|-------------|-------------|-----------------|-----------------|-------|--------|
| 11 | `cms_tables.limit` | `cms.ts` | `createTable` | `deleteTable` | CMS system | ✅ DONE |
| 12 | `storage_mb.limit` | `storage.ts` | `getUploadUrl` | `delete` | Track MB not count; UI gate in storage-client.tsx | ✅ DONE |
| 13 | `team_seats.limit` | `organization.ts` | `inviteMember` | `cancelInvitation`, `removeMember` | Member management | ✅ DONE |

---

## BOOLEAN Features (Access control)

| # | Feature Key | Router/Component | Check Point | Notes | Status |
|---|-------------|------------------|-------------|-------|--------|
| 1 | `custom_domain` | `domains.ts` | `create` mutation | Paid feature; UI gate in domains-page-content.tsx | ✅ DONE |
| 2 | `custom_branding` | Published website page | Server-side check in page.tsx | PoweredByBadge when disabled | ✅ DONE |
| 3 | `analytics` | N/A | N/A | Enabled on ALL tiers (true everywhere) — no gate needed | ✅ N/A |
| 4 | `dynamic_pages` | `pages.ts` | `updateDynamicSettings` mutation | UI gate in builder-settings-dialog.tsx | ✅ DONE |

---

## Progress Summary

- **Total Features**: 17
- **Completed**: 17
- **In Progress**: 0
- **Remaining**: 0

---

## Implementation Notes

### Per-Website Page Limit (`pages_per_website.limit`)

This feature uses a different pattern than other limits because it tracks pages PER WEBSITE, not per organization. Instead of using the UsageMetrics tracking system, it counts pages directly from the database:

```typescript
// In pages.ts:
async function checkPagesPerWebsiteLimit(organizationId, websiteId, incrementBy = 1) {
  const tier = await getOrganizationTier(organizationId)
  const limit = tier.features['pages_per_website.limit'] as number

  if (limit === -1) return // Unlimited

  const currentPageCount = await prisma.page.count({
    where: { websiteId, organizationId, deletedAt: null }
  })

  if (currentPageCount + incrementBy > limit) {
    throw new TRPCError({ code: 'FORBIDDEN', ... })
  }
}
```

### Team Seats (`team_seats.limit`)

Uses `requireFeature` at the procedure level for cleaner syntax:

```typescript
inviteMember: organizationProcedure({
  requirePermission: 'invitation:create',
  requireFeature: 'team_seats.limit',
})
```

---

## Implementation Log

### 2026-01-18 - Batch Feature Gate Wiring

**Completed:**
1. `forms.limit` - forms.ts (create, delete, bulkDelete)
2. `email_templates.limit` - email-templates.ts (create, duplicate, delete)
3. `email_domains.limit` - email-domains.ts (create, delete)
4. `chat_widgets.limit` - chat-widgets.ts (create, delete, bulkDelete)
5. `pipelines.limit` - pipeline.ts (create, delete)
6. `tickets.limit` - pipeline.ts (createTicket, deleteTicket)
7. `websites.limit` - websites.ts (create, duplicate, delete, bulkDelete)
8. `pages_per_website.limit` - pages.ts (create, duplicate - uses per-website count)
9. `products.limit` - products.ts (create, delete, bulkDelete)
10. `leads.limit` - leads.ts (create, delete, bulkDelete)
11. `cms_tables.limit` - cms.ts (createTable, deleteTable)
12. `team_seats.limit` - organization.ts (inviteMember, cancelInvitation, removeMember) - Already wired up

**Pattern Used:**
- Import feature gate helpers from `@/trpc/procedures/feature-gates`
- Call `withFeatureGate()` before create operations
- Call `incrementUsageAndInvalidate()` after successful creation
- Call `decrementUsageAndInvalidate()` after deletion

### 2026-02-17 - Boolean Feature Gates + Storage + UI Audit

**Completed:**
1. `custom_domain` - Router: `withBooleanFeature` in domains.ts `create` mutation; UI: `useFeatureGate('custom_domain')` in domains-page-content.tsx with upgrade modal
2. `custom_branding` - Server-side: `checkBooleanFeature(organizationId, 'custom_branding')` in published page.tsx; Created `PoweredByBadge` component (desktop: bottom-left, mobile: right-side handlebar)
3. `analytics` - Confirmed enabled on ALL tiers (true for free through portal). No gate needed.
4. `dynamic_pages` - Already wired: router `withBooleanFeature` in pages.ts:639, UI `useFeatureGate('dynamic_pages')` in builder-settings-dialog.tsx:1030
5. `storage_mb.limit` - Router: `withFeatureGate` in storage.ts `getUploadUrl` mutation; UI: `useFeatureGate('storage_mb.limit')` in storage-client.tsx with upgrade modal

**UI Audit Results:**
All 12 page content files audited — every create/add button has proper `<FeatureGate>` wrapper or `useFeatureGate()` hook:
- websites-page-content.tsx, forms-page-content.tsx, chat-widgets-page-content.tsx (wrapper pattern)
- cms-page-content.tsx, cms-modal.tsx, pages-panel.tsx, storage-client.tsx, invite-member-button.tsx, pipeline-board.tsx, domains-page-content.tsx (hook pattern)
- leads-page-content.tsx, products-tab.tsx, templates-page-content.tsx (wrapper pattern)
