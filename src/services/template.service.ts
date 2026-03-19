/**
 * ============================================================================
 * TEMPLATE SERVICE — Core business logic for the template system
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: TemplateService, TemplateInstallation, TemplateBundling,
 * TemplateLibrary, TemplateCRUD, InstallTemplate, BundleFeature
 *
 * WHY: Centralizes all template operations — CRUD, snapshot bundling, dependency
 * resolution, cross-org library browsing, and the installation engine.
 *
 * ARCHITECTURE:
 * - CRUD functions manage Template records (create, update, delete, publish, list).
 * - bundleFeatureIntoTemplate creates TemplateItem records from feature snapshots.
 * - installTemplate orchestrates the full installation pipeline:
 *   1. Topological sort items by dependency order
 *   2. Per-item install functions (one per feature type)
 *   3. ID remapping for cross-feature references
 *   4. Origin marker stamping for anti-plagiarism
 *
 * SECURITY:
 * - Snapshots NEVER contain PII, Stripe IDs, or user data (sanitizer enforces this).
 * - browseTemplateLibrary ONLY returns PUBLISHED templates.
 * - All installed features start in DRAFT status.
 * - Origin markers prevent re-publishing installed content.
 */

import { prisma } from '@/lib/config'
import type { Prisma } from '@/generated/prisma'
import { nanoid } from 'nanoid'

/**
 * Helper to cast Record<string, unknown> snapshots to Prisma-compatible JSON input.
 * Prisma's InputJsonValue type is strict; this safely bridges the gap.
 */
export function toJsonValue(data: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | undefined {
  if (data === null || data === undefined) return undefined
  return data as unknown as Prisma.InputJsonValue
}

/** Same as toJsonValue but returns Prisma.JsonNull for null instead of undefined */
export function toJsonValueRequired(data: Record<string, unknown> | null): Prisma.InputJsonValue {
  if (data === null) return null as unknown as Prisma.InputJsonValue
  return data as unknown as Prisma.InputJsonValue
}
import type {
  TemplateCategory,
  TemplateStatus,
  DependencySelection,
  IdRemapTable,
  InstallItemResult,
  InstallResult,
  TemplateListItem,
  TemplateDetail,
  WebsiteSnapshot,
  EmailSnapshot,
  AutomationSnapshot,
  FormSnapshot,
  ContractSnapshot,
  PipelineSnapshot,
  BookingSnapshot,
  ChatWidgetSnapshot,
  CmsSchemaSnapshot,
  ProductSnapshot,
} from '@/lib/templates/types'
import { generateOriginHash, createOriginMarkers } from '@/lib/templates/origin-hash'
import { remapIds, topologicalSort } from '@/lib/templates/id-remapper'
import { detectDependencies } from '@/lib/templates/dependency-scanner'
import { createFeatureSnapshot } from '@/lib/templates/snapshot-sanitizer'
/** Default currency fallback when org has no Stripe account connected */
const DEFAULT_CURRENCY = 'usd'

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Creates a new DRAFT template for an organization.
 * Generates an origin hash from the org, template ID, and creation time.
 *
 * @returns The created Template record
 */
export async function createTemplate(input: {
  organizationId: string
  name: string
  description?: string | null
  category: TemplateCategory
  thumbnailUrl?: string | null
  tags?: string[]
  /** Price in cents — null or 0 means free template */
  price?: number | null
}) {
  /** Create the template first to get its ID for origin hash generation */
  const template = await prisma.template.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      description: input.description ?? null,
      category: input.category,
      thumbnailUrl: input.thumbnailUrl ?? null,
      tags: input.tags ?? [],
      status: 'DRAFT',
      price: input.price ?? null,
      /** Temporary origin hash — updated immediately below */
      originHash: '',
    },
  })

  /** Generate the origin hash using the template's actual ID and creation time */
  const originHash = generateOriginHash(
    input.organizationId,
    template.id,
    template.createdAt
  )

  /** Update the template with the real origin hash */
  return prisma.template.update({
    where: { id: template.id },
    data: { originHash },
  })
}

/**
 * Updates template metadata (name, description, thumbnail, tags, price).
 * Does NOT modify items or status — use publishTemplate for that.
 */
export async function updateTemplate(input: {
  organizationId: string
  templateId: string
  name?: string
  description?: string | null
  thumbnailUrl?: string | null
  tags?: string[]
  /** Price in cents — null or 0 means free template */
  price?: number | null
}) {
  /**
   * If the price is being changed, check whether a PUBLISHED free template
   * is being switched to paid. Paid templates go through the portal approval gate,
   * UNLESS auto-approve is enabled — in that case, keep it PUBLISHED.
   */
  let statusReset: { status: TemplateStatus } | Record<string, never> = {}

  if (input.price !== undefined) {
    const existing = await prisma.template.findUnique({
      where: { id: input.templateId, organizationId: input.organizationId },
      select: { status: true, price: true },
    })

    if (existing) {
      const wasFree = existing.price === null || existing.price === 0
      const isNowPaid = input.price !== null && input.price > 0
      const isPublished = existing.status === 'PUBLISHED'

      /**
       * Free → paid on a published template: check auto-approve setting.
       * If auto-approve is ON, the template stays PUBLISHED (no review needed).
       * If auto-approve is OFF, reset to PENDING_APPROVAL for portal review.
       */
      if (wasFree && isNowPaid && isPublished) {
        const autoApprove = await getPortalSetting('templates.autoApprove')
        if (autoApprove?.trim() !== 'true') {
          statusReset = { status: 'PENDING_APPROVAL' as TemplateStatus }
        }
      }
    }
  }

  return prisma.template.update({
    where: {
      id: input.templateId,
      organizationId: input.organizationId,
    },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.thumbnailUrl !== undefined && {
        thumbnailUrl: input.thumbnailUrl,
      }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.price !== undefined && { price: input.price }),
      ...statusReset,
    },
  })
}

/**
 * Hard deletes a template and all its items/installs (cascade handles cleanup).
 */
export async function deleteTemplate(
  organizationId: string,
  templateId: string
): Promise<void> {
  await prisma.template.delete({
    where: {
      id: templateId,
      organizationId,
    },
  })
}

/**
 * Publishes a template — for free templates, sets status to PUBLISHED directly.
 * For paid templates (price > 0), routes through the portal approval gate:
 * - If portal has 'templates.autoApprove' = 'true', publishes immediately.
 * - Otherwise, sets status to PENDING_APPROVAL and sends an approval email
 *   to the portal owner.
 *
 * Returns the updated template with its final status so the UI can distinguish
 * between PUBLISHED and PENDING_APPROVAL outcomes.
 *
 * NOTE: The `price` column must be added to the Template model in Prisma
 * by the developer. This code assumes it exists as `Int?`.
 */
export async function publishTemplate(
  organizationId: string,
  templateId: string
) {
  /** Fetch the template to check if it has a price set */
  const template = await prisma.template.findUnique({
    where: { id: templateId, organizationId },
    select: { id: true, price: true, name: true, category: true, organizationId: true },
  })

  if (!template) {
    throw new Error('Template not found or does not belong to this organization')
  }

  /**
   * Free templates (price is null or 0) — publish immediately as before.
   * Paid templates — check portal auto-approve setting first.
   */
  const isPaid = template.price !== null && template.price > 0

  if (!isPaid) {
    /** Free template — publish directly, no approval needed. Clear any prior rejection reason. */
    return prisma.template.update({
      where: { id: templateId, organizationId },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        version: { increment: 1 },
        rejectionReason: null,
      },
    })
  }

  /** Check if portal has auto-approve enabled for templates */
  const autoApprove = await getPortalSetting('templates.autoApprove')

  if (autoApprove?.trim() === 'true') {
    /** Auto-approve is enabled — publish paid template directly. Clear any prior rejection reason. */
    return prisma.template.update({
      where: { id: templateId, organizationId },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        version: { increment: 1 },
        rejectionReason: null,
      },
    })
  }

  /** Paid template without auto-approve — set to PENDING_APPROVAL. Clear any prior rejection reason. */
  const updated = await prisma.template.update({
    where: { id: templateId, organizationId },
    data: {
      status: 'PENDING_APPROVAL',
      rejectionReason: null,
    },
  })

  /** Fire-and-forget: send approval notification email to portal owner */
  sendTemplateApprovalEmail(template).catch((err) => {
    console.error('[TemplateService] Failed to send approval email:', err)
  })

  return updated
}

// ============================================================================
// PORTAL APPROVAL OPERATIONS
// ============================================================================

/**
 * Approves a PENDING_APPROVAL template — sets status to PUBLISHED,
 * records publishedAt, bumps the version, and clears any rejection reason.
 * Called by portal admins with 'templates:update' permission.
 */
export async function approveTemplate(templateId: string) {
  return prisma.template.update({
    where: { id: templateId },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
      version: { increment: 1 },
      rejectionReason: null,
    },
  })
}

/**
 * Rejects a PENDING_APPROVAL template — resets status back to DRAFT
 * and stores the rejection reason so the creator can see why it was rejected.
 * Called by portal admins with 'templates:update' permission.
 */
export async function rejectTemplate(templateId: string, reason?: string) {
  return prisma.template.update({
    where: { id: templateId },
    data: {
      status: 'DRAFT',
      rejectionReason: reason ?? null,
    },
  })
}

/**
 * Lists all templates in PENDING_APPROVAL status with pagination.
 * Includes the owning organization's name for the portal review UI.
 * Called by portal admins with 'templates:view' permission.
 */
export async function listPendingApprovalTemplates(input: {
  page: number
  pageSize: number
}) {
  const where = { status: 'PENDING_APPROVAL' as const }

  const [templates, total] = await Promise.all([
    prisma.template.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: {
        organization: { select: { name: true, logo: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.template.count({ where }),
  ])

  const items: TemplateListItem[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category as TemplateCategory,
    status: t.status as TemplateStatus,
    thumbnailUrl: t.thumbnailUrl,
    tags: t.tags,
    installCount: t.installCount,
    organizationId: t.organizationId,
    organizationName: t.organization.name,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    itemCount: t._count.items,
    price: t.price ?? null,
    rejectionReason: null,
  }))

  return { items, total, page: input.page, pageSize: input.pageSize }
}

// ============================================================================
// PORTAL SETTINGS HELPERS
// ============================================================================

/**
 * Reads a single setting from the PortalSettings table.
 * Returns the value string or null if not found.
 *
 * NOTE: The PortalSettings model must be added to the Prisma schema:
 *   model PortalSettings {
 *     id        String   @id @default(cuid())
 *     key       String   @unique
 *     value     String
 *     category  String   @default("general")
 *     createdAt DateTime @default(now())
 *     updatedAt DateTime @updatedAt
 *   }
 */
export async function getPortalSetting(key: string): Promise<string | null> {
  const setting = await prisma.portalSettings.findUnique({
    where: { key },
    select: { value: true },
  })
  return setting?.value ?? null
}

/**
 * Upserts a setting in the PortalSettings table.
 * Creates the record if it doesn't exist, updates it otherwise.
 */
export async function setPortalSetting(
  key: string,
  value: string,
  category: string = 'general'
): Promise<void> {
  await prisma.portalSettings.upsert({
    where: { key },
    create: { key, value, category },
    update: { value },
  })
}

// ============================================================================
// TEMPLATE APPROVAL EMAIL
// ============================================================================

/**
 * Sends a transactional email to the portal owner notifying them
 * that a paid template is awaiting approval.
 * Uses the sendTransactionalEmail function from email.service.ts.
 *
 * WHY: Portal owners need to know when paid templates need review
 * so they can approve/reject from the portal dashboard.
 */
async function sendTemplateApprovalEmail(template: {
  id: string
  name: string
  category: string
  organizationId: string
  price: number | null
}) {
  /** Import inline to avoid circular dependencies */
  const { sendTransactionalEmail } = await import('@/services/email.service')
  const { portalConfig } = await import('@/lib/portal/config')

  /** If no portal owner email is configured, skip sending */
  if (!portalConfig.initialOwnerEmail) {
    console.warn('[TemplateService] No PORTAL_INITIAL_OWNER_EMAIL — skipping approval email')
    return
  }

  /** Get the creator org name for the email body */
  const org = await prisma.organization.findUnique({
    where: { id: template.organizationId },
    select: { name: true },
  })

  const portalUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const reviewLink = `${portalUrl}/portal/templates`

  /** Format price for display (cents to dollars) */
  const priceDisplay = template.price
    ? `$${(template.price / 100).toFixed(2)}`
    : 'Free'

  await sendTransactionalEmail({
    template: 'template-approval-request',
    to: portalConfig.initialOwnerEmail,
    subject: `New template awaiting approval: ${template.name}`,
    data: {
      templateName: template.name,
      creatorOrgName: org?.name ?? 'Unknown',
      price: priceDisplay,
      category: template.category,
      reviewLink,
    },
  })
}

/**
 * Lists templates owned by the organization with pagination and filters.
 */
export async function listOrgTemplates(input: {
  organizationId: string
  category?: TemplateCategory
  status?: TemplateStatus
  search?: string
  page: number
  pageSize: number
}) {
  const where = {
    organizationId: input.organizationId,
    ...(input.category && { category: input.category }),
    ...(input.status && { status: input.status }),
    ...(input.search && {
      name: { contains: input.search, mode: 'insensitive' as const },
    }),
  }

  const [templates, total] = await Promise.all([
    prisma.template.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: {
        organization: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.template.count({ where }),
  ])

  const items: TemplateListItem[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category as TemplateCategory,
    status: t.status as TemplateStatus,
    thumbnailUrl: t.thumbnailUrl,
    tags: t.tags,
    installCount: t.installCount,
    organizationId: t.organizationId,
    organizationName: t.organization.name,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    itemCount: t._count.items,
    price: t.price ?? null,
    rejectionReason: t.rejectionReason ?? null,
  }))

  return { items, total, page: input.page, pageSize: input.pageSize }
}

/**
 * Browses the cross-org template library — ONLY returns PUBLISHED templates.
 * Includes organization name for attribution. Supports category filter,
 * search, and sorting by newest/popular/name.
 */
export async function browseTemplateLibrary(input: {
  category?: TemplateCategory
  search?: string
  sortBy?: 'newest' | 'popular' | 'name'
  page: number
  pageSize: number
}) {
  const where = {
    status: 'PUBLISHED' as const,
    ...(input.category && { category: input.category }),
    ...(input.search && {
      OR: [
        { name: { contains: input.search, mode: 'insensitive' as const } },
        {
          description: {
            contains: input.search,
            mode: 'insensitive' as const,
          },
        },
        { tags: { hasSome: [input.search] } },
      ],
    }),
  }

  /** Determine sort order based on user preference */
  const orderBy =
    input.sortBy === 'popular'
      ? { installCount: 'desc' as const }
      : input.sortBy === 'name'
        ? { name: 'asc' as const }
        : { publishedAt: 'desc' as const }

  const [templates, total] = await Promise.all([
    prisma.template.findMany({
      where,
      orderBy,
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: {
        organization: { select: { name: true, logo: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.template.count({ where }),
  ])

  const items: TemplateListItem[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category as TemplateCategory,
    status: t.status as TemplateStatus,
    thumbnailUrl: t.thumbnailUrl,
    tags: t.tags,
    installCount: t.installCount,
    organizationId: t.organizationId,
    organizationName: t.organization.name,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    itemCount: t._count.items,
    price: t.price ?? null,
    rejectionReason: null,
  }))

  return { items, total, page: input.page, pageSize: input.pageSize }
}

/**
 * Gets full template details with items list.
 * Only returns data if the template is PUBLISHED or belongs to the requesting org.
 */
export async function getTemplateDetail(
  templateId: string,
  requestingOrgId?: string
): Promise<TemplateDetail | null> {
  const template = await prisma.template.findUnique({
    where: { id: templateId },
    include: {
      organization: { select: { name: true } },
      items: {
        orderBy: { order: 'asc' },
        select: {
          id: true,
          featureType: true,
          sourceName: true,
          dependsOn: true,
          order: true,
        },
      },
    },
  })

  if (!template) return null

  /** Only allow access if template is PUBLISHED or owned by requesting org */
  if (
    template.status !== 'PUBLISHED' &&
    template.organizationId !== requestingOrgId
  ) {
    return null
  }

  return {
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category as TemplateCategory,
    status: template.status as TemplateStatus,
    thumbnailUrl: template.thumbnailUrl,
    tags: template.tags,
    installCount: template.installCount,
    organizationId: template.organizationId,
    organizationName: template.organization.name,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    itemCount: template.items.length,
    price: template.price ?? null,
    rejectionReason: template.rejectionReason ?? null,
    version: template.version,
    items: template.items.map((item) => ({
      id: item.id,
      featureType: item.featureType as TemplateCategory,
      sourceName: item.sourceName,
      dependsOn: item.dependsOn,
      order: item.order,
    })),
  }
}

// ============================================================================
// BUNDLING — Creates TemplateItem records from feature snapshots
// ============================================================================

/**
 * Bundles a feature (and optionally its dependencies) into a template as TemplateItem records.
 *
 * Handles 3 dependency modes:
 * - 'bundle_all': Include root + ALL detected dependencies
 * - 'skip_all': Include root feature only (no dependencies)
 * - 'choose': Include root + only selected dependency IDs
 *
 * @param input - Template ID, feature type/ID, and dependency selection
 * @returns Array of created TemplateItem records
 */
export async function bundleFeatureIntoTemplate(input: {
  organizationId: string
  templateId: string
  featureType: TemplateCategory
  featureId: string
  dependencySelection: DependencySelection
  /** When true, CMS table snapshots will include row data */
  includeCmsRows?: boolean
}) {
  const { organizationId, templateId, featureType, featureId, dependencySelection, includeCmsRows } = input

  /** Verify the template exists and belongs to this org */
  const template = await prisma.template.findFirst({
    where: { id: templateId, organizationId },
  })
  if (!template) throw new Error('Template not found')

  /** Create the root feature snapshot (pass includeCmsRows for CMS_SCHEMA type) */
  const rootSnapshot = await createFeatureSnapshot(organizationId, featureType, featureId, { includeCmsRows })
  const rootName = await getFeatureDisplayName(organizationId, featureType, featureId)

  /** Build the list of items to bundle */
  const itemsToBundle: Array<{
    featureType: TemplateCategory
    featureId: string
    featureName: string
    snapshot: Record<string, unknown>
    dependsOn: string[]
  }> = [
    {
      featureType,
      featureId,
      featureName: rootName,
      snapshot: rootSnapshot as Record<string, unknown>,
      dependsOn: [],
    },
  ]

  /**
   * Collect dependency items to create BEFORE the root item.
   *
   * WHY dependencies first:
   * The dependsOn array must store TemplateItem IDs (not featureIds) so that
   * topologicalSort can correctly order items during installation. Since
   * TemplateItem IDs are generated by the database on create, we must create
   * dependency items first to obtain their IDs, then reference those IDs in
   * the root item's dependsOn array.
   *
   * This also ensures the `order` field reflects the correct installation
   * sequence: dependencies get lower order numbers (0, 1, 2, ...) and the
   * root item gets the highest order number. Even if topologicalSort falls
   * back to order-based sorting, dependencies will still install before the
   * root — preventing cross-tenant FK references and ensuring remapTable
   * has CMS table / form / product IDs before the website is created.
   */
  const depItems: Array<{
    featureType: TemplateCategory
    featureId: string
    featureName: string
    snapshot: Record<string, unknown>
  }> = []

  if (dependencySelection.choice !== 'skip_all') {
    const tree = await detectDependencies(organizationId, featureType, featureId)

    /** Flatten the dependency tree for processing */
    const flatDeps = flattenDependencies(tree.dependencies)

    /** Filter based on user selection */
    const selectedDeps =
      dependencySelection.choice === 'bundle_all'
        ? flatDeps
        : flatDeps.filter((d) =>
            dependencySelection.selectedIds.includes(d.featureId)
          )

    /** Snapshot each selected dependency (pass includeCmsRows for CMS deps) */
    for (const dep of selectedDeps) {
      const depSnapshot = await createFeatureSnapshot(
        organizationId,
        dep.featureType,
        dep.featureId,
        { includeCmsRows }
      )

      depItems.push({
        featureType: dep.featureType,
        featureId: dep.featureId,
        featureName: dep.featureName,
        snapshot: depSnapshot as Record<string, unknown>,
      })
    }
  }

  /** Create TemplateItem records in the database.
   *  Dependencies are created FIRST so we can reference their TemplateItem IDs
   *  in the root item's dependsOn array. */
  const createdItems = []

  /**
   * Maps featureId → TemplateItem.id for dependency items.
   * Used to translate the root item's dependsOn from featureIds to
   * actual TemplateItem IDs that topologicalSort can resolve.
   */
  const featureIdToItemId: Record<string, string> = {}

  /** Step 1: Create dependency items (order 0, 1, 2, ...) with dependsOn: [] */
  for (let i = 0; i < depItems.length; i++) {
    const dep = depItems[i]
    const itemOriginHash = generateOriginHash(
      organizationId,
      `${templateId}:${dep.featureId}`,
      new Date()
    )

    const created = await prisma.templateItem.create({
      data: {
        templateId,
        featureType: dep.featureType,
        sourceId: dep.featureId,
        sourceName: dep.featureName,
        snapshot: toJsonValueRequired(dep.snapshot),
        dependsOn: [],
        originHash: itemOriginHash,
        order: i,
      },
    })

    featureIdToItemId[dep.featureId] = created.id
    createdItems.push(created)
  }

  /** Step 2: Create root item LAST (highest order) with dependsOn referencing
   *  the actual TemplateItem IDs of its dependency items. This allows
   *  topologicalSort to correctly resolve the dependency graph and install
   *  CMS tables, forms, products, etc. BEFORE the website that references them. */
  const rootItem = itemsToBundle[0]
  const rootDependsOn = depItems
    .map((dep) => featureIdToItemId[dep.featureId])
    .filter(Boolean)

  const rootOriginHash = generateOriginHash(
    organizationId,
    `${templateId}:${rootItem.featureId}`,
    new Date()
  )

  const createdRoot = await prisma.templateItem.create({
    data: {
      templateId,
      featureType: rootItem.featureType,
      sourceId: rootItem.featureId,
      sourceName: rootItem.featureName,
      snapshot: toJsonValueRequired(rootItem.snapshot as Record<string, unknown>),
      dependsOn: rootDependsOn,
      originHash: rootOriginHash,
      order: depItems.length,
    },
  })

  createdItems.push(createdRoot)

  return createdItems
}

// ============================================================================
// INSTALLATION ENGINE
// ============================================================================

/**
 * Installs a template into a target organization.
 * This is the main orchestrator that:
 * 1. Fetches the template and its items
 * 2. Optionally excludes specific items
 * 3. Topologically sorts items by dependency order
 * 4. Installs each item (creates the feature in the target org)
 * 5. Remaps cross-feature IDs in all installed data
 * 6. Creates origin markers for anti-plagiarism tracking
 * 7. Records the install and increments the template's install count
 *
 * @returns InstallResult with success/failure details for each item
 */
export async function installTemplate(input: {
  organizationId: string
  templateId: string
  installedById: string
  excludeItemIds?: string[]
}): Promise<InstallResult> {
  const { organizationId, templateId, installedById, excludeItemIds = [] } =
    input

  /** Fetch the template with all items */
  const template = await prisma.template.findUnique({
    where: { id: templateId },
    include: {
      items: { orderBy: { order: 'asc' } },
    },
  })

  if (!template) throw new Error('Template not found')

  /**
   * SECURITY: Only PUBLISHED templates can be installed.
   * Prevents hackers from installing DRAFT, PENDING_APPROVAL, or ARCHIVED templates
   * by directly calling the install endpoint with a known template ID.
   */
  if (template.status !== 'PUBLISHED') {
    throw new Error('Template is not available for installation. Only published templates can be installed.')
  }

  /** Filter out excluded items */
  const excludeSet = new Set(excludeItemIds)
  const itemsToInstall = template.items.filter((i) => !excludeSet.has(i.id))

  /**
   * BACKWARD COMPATIBILITY: Normalize dependsOn values.
   *
   * Old templates stored featureIds (sourceId) in dependsOn instead of
   * TemplateItem IDs. The topologicalSort maps items by their TemplateItem
   * ID, so featureId-based references silently fail (all items get inDegree=0
   * and the sort falls back to the order field).
   *
   * Fix: build a sourceId → TemplateItem.id lookup and translate any
   * dependsOn value that matches a sourceId but not a TemplateItem ID.
   */
  const itemIdSet = new Set(itemsToInstall.map((i) => i.id))
  const sourceIdToItemId = new Map(
    itemsToInstall.map((i) => [i.sourceId, i.id])
  )

  const normalizedItems = itemsToInstall.map((item) => ({
    id: item.id,
    dependsOn: (item.dependsOn as string[]).map((depId) => {
      /** Already a valid TemplateItem ID — no translation needed */
      if (itemIdSet.has(depId)) return depId
      /** Old format: depId is a featureId (sourceId) — translate to TemplateItem ID */
      return sourceIdToItemId.get(depId) ?? depId
    }),
    order: item.order,
  }))

  /** Topologically sort by dependency order */
  const sorted = topologicalSort(normalizedItems)

  /** Map sorted IDs back to full item data */
  const itemMap = new Map(itemsToInstall.map((i) => [i.id, i]))
  const orderedItems = sorted
    .map((s) => itemMap.get(s.id))
    .filter(
      (i): i is NonNullable<typeof i> => i !== undefined
    )

  /** Install each item in dependency order, building the ID remap table */
  const remapTable: IdRemapTable = {}
  const installResults: InstallItemResult[] = []

  for (const item of orderedItems) {
    try {
      const snapshot = item.snapshot as Record<string, unknown>
      const featureType = item.featureType as TemplateCategory
      const newId = await installTemplateItem(
        featureType,
        snapshot,
        organizationId,
        remapTable
      )

      /** Record the mapping from source ID to new ID */
      remapTable[item.sourceId] = newId

      installResults.push({
        templateItemId: item.id,
        featureType,
        sourceId: item.sourceId,
        newId,
        featureName: item.sourceName,
        action: 'created',
        success: true,
      })
    } catch (err) {
      installResults.push({
        templateItemId: item.id,
        featureType: item.featureType as TemplateCategory,
        sourceId: item.sourceId,
        newId: '',
        featureName: item.sourceName,
        action: 'created',
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  /** Second pass: remap cross-feature IDs in all installed features' data.
   *  This updates references like formId, cmsTableId, productId in canvas
   *  data and automation schemas to point to the newly created features. */
  for (const result of installResults) {
    if (!result.success) continue

    await remapInstalledFeatureData(
      result.featureType,
      result.newId,
      remapTable
    )
  }

  /** Create origin markers for all successfully installed features */
  const successfulItems = installResults
    .filter((r) => r.success)
    .map((r) => {
      const originalItem = orderedItems.find(
        (i) => i.sourceId === r.sourceId
      )
      return {
        featureType: r.featureType,
        featureId: r.newId,
        originHash: originalItem?.originHash ?? template.originHash,
      }
    })

  /** Create the TemplateInstall record */
  const install = await prisma.templateInstall.create({
    data: {
      templateId,
      organizationId,
      installedById,
      templateVersion: template.version,
      idMapping: remapTable,
      originHash: template.originHash,
    },
  })

  /** Stamp origin markers for anti-plagiarism */
  await createOriginMarkers(
    successfulItems,
    organizationId,
    templateId,
    install.id
  )

  /** Increment the template's install count */
  await prisma.template.update({
    where: { id: templateId },
    data: { installCount: { increment: 1 } },
  })

  const installedCount = installResults.filter((r) => r.success).length
  const failedCount = installResults.filter((r) => !r.success).length

  return {
    installId: install.id,
    templateId,
    templateName: template.name,
    items: installResults,
    idMapping: remapTable,
    success: failedCount === 0,
    installedCount,
    failedCount,
  }
}

// ============================================================================
// PER-FEATURE INSTALL FUNCTIONS
// ============================================================================

/**
 * Routes to the correct install function based on feature type.
 * Each function creates the feature in the target org and returns its new ID.
 */
export async function installTemplateItem(
  featureType: TemplateCategory,
  snapshot: Record<string, unknown>,
  orgId: string,
  remapTable: IdRemapTable
): Promise<string> {
  switch (featureType) {
    case 'WEBSITE':
      return installWebsite(snapshot as unknown as WebsiteSnapshot, orgId, remapTable)
    case 'EMAIL':
      return installEmailTemplate(snapshot as unknown as EmailSnapshot, orgId)
    case 'AUTOMATION':
      return installAutomation(snapshot as unknown as AutomationSnapshot, orgId, remapTable)
    case 'FORM':
      return installForm(snapshot as unknown as FormSnapshot, orgId)
    case 'CONTRACT':
      return installContract(snapshot as unknown as ContractSnapshot, orgId)
    case 'PIPELINE':
      return installPipeline(snapshot as unknown as PipelineSnapshot, orgId)
    case 'BOOKING':
      return installBooking(snapshot as unknown as BookingSnapshot, orgId)
    case 'CHAT_WIDGET':
      return installChatWidget(snapshot as unknown as ChatWidgetSnapshot, orgId)
    case 'CMS_SCHEMA':
      return installCmsSchema(snapshot as unknown as CmsSchemaSnapshot, orgId)
    case 'PRODUCT':
      return installProduct(snapshot as unknown as ProductSnapshot, orgId, remapTable)
    default:
      throw new Error(`Unsupported feature type for installation: ${featureType}`)
  }
}

/**
 * Installs a website with pages and local components.
 * All pages start as DRAFT. Domain is NOT assigned (user picks after install).
 * Local components are created first so page canvas data can reference them.
 */
async function installWebsite(
  snapshot: WebsiteSnapshot,
  orgId: string,
  remapTable: IdRemapTable
): Promise<string> {
  /**
   * Remap chatWidgetId if the original website had one and it was
   * installed as a dependency (its new ID will be in the remapTable).
   */
  const chatWidgetId = snapshot.chatWidgetId
    ? remapTable[snapshot.chatWidgetId] ?? null
    : null

  /** Create the website shell (no domain, remapped chat widget if available) */
  const website = await prisma.website.create({
    data: {
      organizationId: orgId,
      name: `${snapshot.name} (Installed)`,
      description: snapshot.description,
      enableEcommerce: snapshot.enableEcommerce,
      chatWidgetId,
      previewId: nanoid(8),
    },
  })

  /** Create local components first so pages can reference them.
   *  Track old→new ID mappings so component instances in canvasData
   *  can be remapped to the new component IDs in the second pass. */
  for (const comp of snapshot.localComponents) {
    const newComp = await prisma.localComponent.create({
      data: {
        websiteId: website.id,
        name: comp.name,
        description: comp.description,
        sourceTree: toJsonValueRequired(comp.sourceTree),
        exposedProps: toJsonValueRequired(comp.exposedProps),
        tags: comp.tags,
        skeletonStyles: toJsonValue(comp.skeletonStyles),
      },
    })

    /** Map old component ID → new component ID for canvasData remapping */
    remapTable[comp.sourceId] = newComp.id
  }

  /** Create saved colors from the template's color palette.
   *  Uses upsert to skip colors that already exist by name in the target org.
   *  Without these, installed templates would have broken color references. */
  if (snapshot.savedColors?.length) {
    for (const color of snapshot.savedColors) {
      await prisma.savedColor.upsert({
        where: {
          organizationId_name: { organizationId: orgId, name: color.name },
        },
        create: {
          organizationId: orgId,
          name: color.name,
          color: color.color,
          sortOrder: color.sortOrder,
        },
        /** If a color with this name already exists, don't overwrite it */
        update: {},
      })
    }
  }

  /** Create pages — all start as DRAFT, no domain assignment.
   *  Track old→new page ID mappings so SmartCmsListElement.targetPageId
   *  can be remapped to point to the correct new page in the second pass. */
  for (const page of snapshot.pages) {
    /** Remap CMS table references if they were included in the template */
    const cmsTableId = page.cmsTableId
      ? remapTable[page.cmsTableId] ?? page.cmsTableId
      : null

    const newPage = await prisma.page.create({
      data: {
        organizationId: orgId,
        websiteId: website.id,
        slug: page.slug,
        name: page.name,
        canvasData: toJsonValue(page.canvasData),
        cmsTableId,
        cmsSlugColumnSlug: page.cmsSlugColumnSlug,
        order: page.order,
        isEcommercePage: page.isEcommercePage,
        status: 'DRAFT',
      },
    })

    /** Map old page ID → new page ID for targetPageId remapping on SmartCmsListElement */
    if (page.sourceId) {
      remapTable[page.sourceId] = newPage.id
    }
  }

  return website.id
}

/**
 * Installs an email template.
 */
async function installEmailTemplate(
  snapshot: EmailSnapshot,
  orgId: string
): Promise<string> {
  const template = await prisma.emailTemplate.create({
    data: {
      organizationId: orgId,
      name: `${snapshot.name} (Installed)`,
      description: snapshot.description,
      subject: snapshot.subject,
      content: toJsonValueRequired(snapshot.content),
    },
  })

  return template.id
}

/**
 * Installs an automation. Starts as DRAFT status — user must activate manually.
 * Cross-feature references in triggerConfig and schema are remapped later in the second pass.
 */
async function installAutomation(
  snapshot: AutomationSnapshot,
  orgId: string,
  remapTable: IdRemapTable
): Promise<string> {
  /** Generate a unique slug for the installed automation */
  const baseSlug = snapshot.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const slug = `${baseSlug}-${nanoid(6)}`

  const automation = await prisma.automation.create({
    data: {
      organizationId: orgId,
      name: `${snapshot.name} (Installed)`,
      description: snapshot.description,
      slug,
      /** Cast string to Prisma enum — snapshot stores the enum value as string */
      triggerType: snapshot.triggerType as Parameters<typeof prisma.automation.create>[0]['data']['triggerType'],
      triggerConfig: toJsonValue(snapshot.triggerConfig),
      schema: toJsonValueRequired(snapshot.schema),
      status: 'DRAFT',
    },
  })

  return automation.id
}

/**
 * Installs a form. Generates a unique slug. Starts as DRAFT.
 */
async function installForm(
  snapshot: FormSnapshot,
  orgId: string
): Promise<string> {
  /** Generate a unique slug for the installed form */
  const baseSlug = snapshot.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const slug = `${baseSlug}-${nanoid(6)}`

  const form = await prisma.form.create({
    data: {
      organizationId: orgId,
      name: `${snapshot.name} (Installed)`,
      description: snapshot.description,
      slug,
      config: toJsonValue(snapshot.config),
      submitButtonText: snapshot.submitButtonText,
      successMessage: snapshot.successMessage,
      redirectUrl: snapshot.redirectUrl,
      enableCaptcha: snapshot.enableCaptcha,
      submissionLimit: snapshot.submissionLimit,
      status: 'DRAFT',
    },
  })

  return form.id
}

/**
 * Installs a contract. Starts as DRAFT — no recipient, no signing data.
 */
async function installContract(
  snapshot: ContractSnapshot,
  orgId: string
): Promise<string> {
  const contract = await prisma.contract.create({
    data: {
      organizationId: orgId,
      name: `${snapshot.name} (Installed)`,
      description: snapshot.description,
      content: toJsonValue(snapshot.content),
      variables: toJsonValue(snapshot.variables),
      status: 'DRAFT',
    },
  })

  return contract.id
}

/**
 * Installs a pipeline with its lanes. No tickets are created.
 */
async function installPipeline(
  snapshot: PipelineSnapshot,
  orgId: string
): Promise<string> {
  const pipeline = await prisma.pipeline.create({
    data: {
      organizationId: orgId,
      name: `${snapshot.name} (Installed)`,
      description: snapshot.description,
      lanes: {
        create: snapshot.lanes.map((lane) => ({
          name: lane.name,
          color: lane.color,
          order: lane.order,
        })),
      },
    },
  })

  return pipeline.id
}

/**
 * Installs a booking calendar with availability schedule.
 * No team assignments — user configures assignees after install.
 */
async function installBooking(
  snapshot: BookingSnapshot,
  orgId: string
): Promise<string> {
  /** Generate a unique slug */
  const baseSlug = snapshot.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const slug = `${baseSlug}-${nanoid(6)}`

  const calendar = await prisma.bookingCalendar.create({
    data: {
      organizationId: orgId,
      name: `${snapshot.name} (Installed)`,
      slug,
      description: snapshot.description,
      duration: snapshot.duration,
      bufferBefore: snapshot.bufferBefore,
      bufferAfter: snapshot.bufferAfter,
      color: snapshot.color,
      locationType: snapshot.locationType,
      locationDetails: snapshot.locationDetails,
      availability: {
        create: snapshot.availability.map((slot) => ({
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          isEnabled: slot.isEnabled,
        })),
      },
    },
  })

  return calendar.id
}

/**
 * Installs a chat widget with config and FAQs.
 */
async function installChatWidget(
  snapshot: ChatWidgetSnapshot,
  orgId: string
): Promise<string> {
  const widget = await prisma.chatWidget.create({
    data: {
      organizationId: orgId,
      name: `${snapshot.name} (Installed)`,
      description: snapshot.description,
      config: toJsonValue(snapshot.config),
      faqItems: {
        create: snapshot.faqs.map((faq) => ({
          question: faq.question,
          answer: faq.answer,
          sortOrder: faq.sortOrder,
        })),
      },
    },
  })

  return widget.id
}

/**
 * Installs a CMS table with column definitions and optional row data.
 * Row data is only present when the template creator opted in during bundling.
 */
async function installCmsSchema(
  snapshot: CmsSchemaSnapshot,
  orgId: string
): Promise<string> {
  /** Generate a unique slug */
  const baseSlug = snapshot.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const slug = `${baseSlug}-${nanoid(6)}`

  const table = await prisma.cmsTable.create({
    data: {
      organizationId: orgId,
      name: `${snapshot.name} (Installed)`,
      slug,
      description: snapshot.description,
      icon: snapshot.icon,
      isPublic: snapshot.isPublic,
      columns: {
        create: snapshot.columns.map((col) => ({
          name: col.name,
          slug: col.slug,
          /** Cast string to Prisma enum — snapshot stores enum value as string */
          columnType: col.columnType as Parameters<typeof prisma.cmsColumn.create>[0]['data']['columnType'],
          required: col.required,
          defaultValue: col.defaultValue,
          options: toJsonValue(col.options),
          order: col.order,
        })),
      },
    },
  })

  /** Create row data if the snapshot includes it (user opted in during bundling).
   *  Each row's values are a JSON object keyed by column slug. */
  if (snapshot.rows?.length) {
    for (const row of snapshot.rows) {
      await prisma.cmsRow.create({
        data: {
          tableId: table.id,
          values: toJsonValueRequired(row.values),
          order: row.order,
        },
      })
    }
  }

  return table.id
}

/**
 * Installs a product with prices and features.
 * NO Stripe sync — Stripe IDs are regenerated when the user syncs to Stripe.
 *
 * CURRENCY ENFORCEMENT: Uses the target org's Stripe account currency instead of
 * the snapshot's currency. Templates can be installed across orgs with different
 * currencies (e.g., USD template installed on AED org), so we MUST override.
 * This matches the behavior of the normal product creation flow in the tRPC router.
 */
async function installProduct(
  snapshot: ProductSnapshot,
  orgId: string,
  remapTable: IdRemapTable
): Promise<string> {
  /**
   * Fetch the target org's Stripe currency — this is the single source of truth.
   * Falls back to 'usd' if no Stripe account is connected.
   * Queried directly to avoid importing the 'server-only' currency.service.
   */
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { stripeAccountCurrency: true },
  })
  const orgCurrency = org?.stripeAccountCurrency || DEFAULT_CURRENCY

  const product = await prisma.product.create({
    data: {
      organizationId: orgId,
      name: `${snapshot.name} (Installed)`,
      description: snapshot.description,
      imageUrl: snapshot.imageUrl,
      images: snapshot.images ?? [],
      trackInventory: snapshot.trackInventory,
      allowBackorder: snapshot.allowBackorder,
      lowStockThreshold: snapshot.lowStockThreshold,
      /** No stripeProductId — user must sync to Stripe separately */
    },
  })

  /**
   * Create prices with features — uses orgCurrency, NOT snapshot currency.
   * If a price has a sourceId, add the old→new mapping to remapTable so
   * checkout elements referencing this price (e.g., orderBumpPriceId) get
   * remapped in the second pass.
   */
  for (const price of snapshot.prices) {
    const newPrice = await prisma.productPrice.create({
      data: {
        productId: product.id,
        name: price.name,
        amount: price.amount,
        currency: orgCurrency,
        billingType: price.billingType as Parameters<typeof prisma.productPrice.create>[0]['data']['billingType'],
        interval: price.interval as Parameters<typeof prisma.productPrice.create>[0]['data']['interval'],
        intervalCount: price.intervalCount,
        installments: price.installments,
        installmentInterval: price.installmentInterval as Parameters<typeof prisma.productPrice.create>[0]['data']['installmentInterval'],
        installmentIntervalCount: price.installmentIntervalCount,
        active: price.active,
        features: {
          create: price.features.map((feat) => ({
            name: feat.name,
            description: feat.description,
            order: feat.order,
          })),
        },
      },
    })

    /** Map old price source ID → new price ID for checkout element remapping */
    if (price.sourceId) {
      remapTable[price.sourceId] = newPrice.id
    }
  }

  return product.id
}

// ============================================================================
// ID REMAPPING (second pass after installation)
// ============================================================================

/**
 * Remaps cross-feature ID references in an installed feature's JSON data.
 * Called after ALL items are installed so the remap table is complete.
 *
 * For example: A page's canvas data might reference a form ID that was
 * also installed from the template. This function replaces the old form ID
 * with the newly created one.
 */
export async function remapInstalledFeatureData(
  featureType: TemplateCategory,
  featureId: string,
  remapTable: IdRemapTable
): Promise<void> {
  /** No remapping needed if the table is empty */
  if (Object.keys(remapTable).length === 0) return

  switch (featureType) {
    case 'WEBSITE': {
      /** Remap all page canvas data and CMS table references */
      const pages = await prisma.page.findMany({
        where: { websiteId: featureId },
        select: { id: true, canvasData: true, cmsTableId: true },
      })

      for (const page of pages) {
        const updates: Record<string, unknown> = {}

        if (page.canvasData) {
          const remapped = remapIds(page.canvasData, remapTable)
          updates.canvasData = remapped
        }
        if (page.cmsTableId && remapTable[page.cmsTableId]) {
          updates.cmsTableId = remapTable[page.cmsTableId]
        }

        if (Object.keys(updates).length > 0) {
          await prisma.page.update({
            where: { id: page.id },
            data: updates,
          })
        }
      }

      /** Remap local component source trees and exposed props — component instances
       *  within sourceTrees may reference other components, forms, products, CMS
       *  tables, etc. that also need their IDs updated. ExposedProps may contain
       *  default values that reference feature IDs (e.g., a default CMS table ID). */
      const localComponents = await prisma.localComponent.findMany({
        where: { websiteId: featureId },
        select: { id: true, sourceTree: true, exposedProps: true },
      })

      for (const comp of localComponents) {
        const updates: Record<string, Prisma.InputJsonValue> = {}

        if (comp.sourceTree) {
          updates.sourceTree = remapIds(comp.sourceTree, remapTable) as Prisma.InputJsonValue
        }
        if (comp.exposedProps) {
          updates.exposedProps = remapIds(comp.exposedProps, remapTable) as Prisma.InputJsonValue
        }

        if (Object.keys(updates).length > 0) {
          await prisma.localComponent.update({
            where: { id: comp.id },
            data: updates,
          })
        }
      }
      break
    }

    case 'AUTOMATION': {
      /** Remap trigger config and schema node references */
      const automation = await prisma.automation.findUnique({
        where: { id: featureId },
        select: { triggerConfig: true, schema: true },
      })

      if (!automation) break

      const updates: Record<string, unknown> = {}

      if (automation.triggerConfig) {
        updates.triggerConfig = remapIds(automation.triggerConfig, remapTable)
      }
      if (automation.schema) {
        updates.schema = remapIds(automation.schema, remapTable)
      }

      if (Object.keys(updates).length > 0) {
        await prisma.automation.update({
          where: { id: featureId },
          data: updates,
        })
      }
      break
    }

    /** Other feature types don't have cross-feature ID references in their data */
    default:
      break
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Gets the display name for a feature by querying the database.
 * Used for populating TemplateItem.sourceName during bundling.
 */
async function getFeatureDisplayName(
  orgId: string,
  featureType: TemplateCategory,
  featureId: string
): Promise<string> {
  switch (featureType) {
    case 'WEBSITE': {
      const w = await prisma.website.findFirst({
        where: { id: featureId, organizationId: orgId },
        select: { name: true },
      })
      return w?.name ?? 'Website'
    }
    case 'EMAIL': {
      const e = await prisma.emailTemplate.findFirst({
        where: { id: featureId, organizationId: orgId },
        select: { name: true },
      })
      return e?.name ?? 'Email Template'
    }
    case 'AUTOMATION': {
      const a = await prisma.automation.findFirst({
        where: { id: featureId, organizationId: orgId },
        select: { name: true },
      })
      return a?.name ?? 'Automation'
    }
    case 'FORM': {
      const f = await prisma.form.findFirst({
        where: { id: featureId, organizationId: orgId },
        select: { name: true },
      })
      return f?.name ?? 'Form'
    }
    case 'CONTRACT': {
      const c = await prisma.contract.findFirst({
        where: { id: featureId, organizationId: orgId },
        select: { name: true },
      })
      return c?.name ?? 'Contract'
    }
    case 'PIPELINE': {
      const p = await prisma.pipeline.findFirst({
        where: { id: featureId, organizationId: orgId },
        select: { name: true },
      })
      return p?.name ?? 'Pipeline'
    }
    case 'BOOKING': {
      const b = await prisma.bookingCalendar.findFirst({
        where: { id: featureId, organizationId: orgId },
        select: { name: true },
      })
      return b?.name ?? 'Booking Calendar'
    }
    case 'CHAT_WIDGET': {
      const cw = await prisma.chatWidget.findFirst({
        where: { id: featureId, organizationId: orgId },
        select: { name: true },
      })
      return cw?.name ?? 'Chat Widget'
    }
    case 'CMS_SCHEMA': {
      const t = await prisma.cmsTable.findFirst({
        where: { id: featureId, organizationId: orgId },
        select: { name: true },
      })
      return t?.name ?? 'CMS Table'
    }
    case 'PRODUCT': {
      const pr = await prisma.product.findFirst({
        where: { id: featureId, organizationId: orgId },
        select: { name: true },
      })
      return pr?.name ?? 'Product'
    }
    default:
      return 'Unknown Feature'
  }
}

/**
 * Flattens a nested dependency tree into a flat array.
 * Used during bundling to get all dependencies regardless of nesting depth.
 */
function flattenDependencies(
  deps: Array<{ featureType: TemplateCategory; featureId: string; featureName: string; children: typeof deps }>
): Array<{ featureType: TemplateCategory; featureId: string; featureName: string }> {
  const result: Array<{ featureType: TemplateCategory; featureId: string; featureName: string }> = []

  for (const dep of deps) {
    result.push({
      featureType: dep.featureType,
      featureId: dep.featureId,
      featureName: dep.featureName,
    })

    if (dep.children.length > 0) {
      result.push(...flattenDependencies(dep.children))
    }
  }

  return result
}

// ============================================================================
// INSTALLED TEMPLATES — List templates installed by the organization
// ============================================================================

/**
 * Lists templates that have been installed into this organization.
 * Returns install records with template metadata for the "Installed" tab.
 *
 * SOURCE OF TRUTH KEYWORDS: ListInstalledTemplates, InstalledTemplateItem
 */
export async function listInstalledTemplates(input: {
  organizationId: string
  page: number
  pageSize: number
}) {
  const where = { organizationId: input.organizationId }

  const [installs, total] = await Promise.all([
    prisma.templateInstall.findMany({
      where,
      orderBy: { installedAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      include: {
        template: {
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            thumbnailUrl: true,
            tags: true,
            version: true,
            organizationId: true,
            organization: { select: { name: true } },
            _count: { select: { items: true } },
            /** Include actual items so the UI can show what was installed */
            items: {
              select: {
                id: true,
                featureType: true,
                sourceName: true,
                order: true,
              },
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    }),
    prisma.templateInstall.count({ where }),
  ])

  /** Look up installer names in batch — installedById is a plain string, not a relation */
  const installerIds = [...new Set(installs.map((i) => i.installedById))]
  const users = await prisma.user.findMany({
    where: { id: { in: installerIds } },
    select: { id: true, name: true },
  })
  const userNameMap = new Map(users.map((u) => [u.id, u.name]))

  const items = installs.map((install) => ({
    installId: install.id,
    templateId: install.templateId,
    templateName: install.template.name,
    templateDescription: install.template.description,
    templateCategory: install.template.category as TemplateCategory,
    templateThumbnail: install.template.thumbnailUrl,
    templateTags: install.template.tags,
    creatorOrgName: install.template.organization.name,
    installedByName: userNameMap.get(install.installedById) ?? 'Unknown',
    installedAt: install.installedAt,
    /** Version installed vs current version — used for sync detection */
    installedVersion: install.templateVersion,
    currentVersion: install.template.version,
    /** True when the template has been republished since installation */
    hasUpdate: install.templateVersion < install.template.version,
    itemCount: install.template._count.items,
    /** Individual items with feature type + name — lets the UI show what was installed */
    items: install.template.items.map((ti) => ({
      id: ti.id,
      featureType: ti.featureType as TemplateCategory,
      sourceName: ti.sourceName,
      order: ti.order,
    })),
  }))

  return { items, total, page: input.page, pageSize: input.pageSize }
}

// ============================================================================
// REPUBLISH — Re-snapshot all features and bump the version
// ============================================================================

/**
 * Republishes a template by re-snapshotting all bundled features.
 * This captures any changes the creator made since the original publish.
 *
 * Steps:
 * 1. Fetch all existing template items
 * 2. Re-snapshot each feature from the source org
 * 3. Update each TemplateItem with the new snapshot
 * 4. Bump the template version and set new publishedAt
 *
 * SOURCE OF TRUTH KEYWORDS: RepublishTemplate, TemplateRepublish
 */
export async function republishTemplate(
  organizationId: string,
  templateId: string
) {
  /** Fetch the template with all items */
  const template = await prisma.template.findFirst({
    where: { id: templateId, organizationId },
    include: { items: { orderBy: { order: 'asc' } } },
  })

  if (!template) throw new Error('Template not found')
  if (template.status !== 'PUBLISHED') {
    throw new Error('Only published templates can be republished')
  }

  /** Re-snapshot each item from the source features */
  for (const item of template.items) {
    try {
      const freshSnapshot = await createFeatureSnapshot(
        organizationId,
        item.featureType as TemplateCategory,
        item.sourceId,
        { includeCmsRows: true }
      )

      await prisma.templateItem.update({
        where: { id: item.id },
        data: {
          snapshot: toJsonValueRequired(freshSnapshot as Record<string, unknown>),
          /** Update the source name in case it was renamed */
          sourceName: await getFeatureDisplayName(
            organizationId,
            item.featureType as TemplateCategory,
            item.sourceId
          ),
        },
      })
    } catch {
      /** If a source feature was deleted, skip it — the item remains with stale data.
       *  This prevents the republish from failing completely due to one missing feature. */
    }
  }

  /** Bump version and update publishedAt */
  return prisma.template.update({
    where: { id: templateId },
    data: {
      version: { increment: 1 },
      publishedAt: new Date(),
    },
  })
}

// ============================================================================
// SYNC CHANGES — Re-install a template using the updated version
// ============================================================================

/**
 * Result of syncing a single template item — used to build aggregate sync feedback.
 *
 * SOURCE OF TRUTH: SyncItemResult
 */
type SyncItemResult = {
  /** Whether the sync succeeded for this item */
  status: 'updated' | 'restored' | 'missing' | 'error'
  /** Human-readable name of the feature for UI display */
  featureName: string
  /** Feature type for icon rendering in the UI */
  featureType: TemplateCategory
  /** Error message when status is 'error' */
  errorMessage?: string
}

/**
 * Syncs an installed template to its latest version.
 * This effectively re-runs the install process using the existing ID mapping
 * from the original install to update the installed features in-place.
 *
 * Strategy: For each template item, check feature status before updating:
 * - If the feature exists and is active → update it normally.
 * - If the feature was SOFT-DELETED (has deletedAt) → restore it (clear deletedAt)
 *   and then update it so the user gets the latest version back.
 * - If the feature was HARD-DELETED (record gone) → report it as missing so the
 *   user knows that item couldn't be synced.
 *
 * SOURCE OF TRUTH KEYWORDS: SyncTemplateChanges, TemplateSync, SyncItemResult
 */
export async function syncTemplateChanges(input: {
  organizationId: string
  installId: string
}): Promise<{
  success: boolean
  updatedCount: number
  restoredCount: number
  missingItems: { name: string; featureType: string }[]
  errors: string[]
  itemResults: SyncItemResult[]
}> {
  const { organizationId, installId } = input

  /** Fetch the install record with its ID mapping */
  const install = await prisma.templateInstall.findFirst({
    where: { id: installId, organizationId },
    include: {
      template: {
        include: { items: { orderBy: { order: 'asc' } } },
      },
    },
  })

  if (!install) throw new Error('Install record not found')

  const idMapping = (install.idMapping as Record<string, string>) ?? {}
  const errors: string[] = []
  const itemResults: SyncItemResult[] = []
  let updatedCount = 0
  let restoredCount = 0
  const missingItems: { name: string; featureType: string }[] = []

  /** For each template item, update the installed feature with fresh snapshot data */
  for (const item of install.template.items) {
    const snapshot = item.snapshot as Record<string, unknown>
    const featureType = item.featureType as TemplateCategory
    /** Look up the new ID that was created during original install */
    const installedId = idMapping[item.sourceId]

    if (!installedId) {
      errors.push(`No installed ID found for ${item.sourceName} (${featureType})`)
      itemResults.push({
        status: 'missing',
        featureName: item.sourceName,
        featureType,
      })
      missingItems.push({ name: item.sourceName, featureType })
      continue
    }

    try {
      /**
       * Check if the feature still exists. If it was soft-deleted, restore it.
       * If it was hard-deleted (gone entirely), mark as missing.
       */
      const existenceCheck = await checkAndRestoreFeature(featureType, installedId)

      if (existenceCheck === 'missing') {
        /** Feature was permanently deleted — can't sync */
        missingItems.push({ name: item.sourceName, featureType })
        itemResults.push({
          status: 'missing',
          featureName: item.sourceName,
          featureType,
        })
        continue
      }

      const wasRestored = existenceCheck === 'restored'

      /** Now perform the actual data sync */
      await syncItem(featureType, snapshot, installedId, organizationId, idMapping)

      if (wasRestored) {
        restoredCount++
        itemResults.push({
          status: 'restored',
          featureName: item.sourceName,
          featureType,
        })
      } else {
        updatedCount++
        itemResults.push({
          status: 'updated',
          featureName: item.sourceName,
          featureType,
        })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      errors.push(`Failed to sync ${item.sourceName}: ${errorMessage}`)
      itemResults.push({
        status: 'error',
        featureName: item.sourceName,
        featureType,
        errorMessage,
      })
    }
  }

  /** Update the install record to reflect the new version */
  await prisma.templateInstall.update({
    where: { id: installId },
    data: { templateVersion: install.template.version },
  })

  return {
    success: errors.length === 0 && missingItems.length === 0,
    updatedCount,
    restoredCount,
    missingItems,
    errors,
    itemResults,
  }
}

// ============================================================================
// CHECK & RESTORE — Detects soft-deleted features and restores them before sync
// ============================================================================

/**
 * Checks whether a feature record still exists in the database, and if it was
 * soft-deleted (has deletedAt set), restores it by clearing deletedAt.
 *
 * Soft-delete models:  Website, Page, EmailTemplate, Pipeline, CmsTable, Product
 * Hard-delete models:  Form, Contract, Automation, BookingCalendar, ChatWidget
 *
 * @returns 'active' if feature exists and is not deleted,
 *          'restored' if feature was soft-deleted and has been restored,
 *          'missing' if feature no longer exists in the database.
 *
 * SOURCE OF TRUTH KEYWORDS: CheckAndRestoreFeature, FeatureExistenceCheck
 */
async function checkAndRestoreFeature(
  featureType: TemplateCategory,
  installedId: string
): Promise<'active' | 'restored' | 'missing'> {
  switch (featureType) {
    // ------------------------------------------------------------------
    // SOFT-DELETE MODELS — check deletedAt and restore if needed
    // ------------------------------------------------------------------

    case 'WEBSITE': {
      const record = await prisma.website.findUnique({
        where: { id: installedId },
        select: { id: true, deletedAt: true },
      })
      if (!record) return 'missing'
      if (record.deletedAt) {
        /** Restore website and all its soft-deleted pages */
        await prisma.website.update({
          where: { id: installedId },
          data: { deletedAt: null },
        })
        await prisma.page.updateMany({
          where: { websiteId: installedId, deletedAt: { not: null } },
          data: { deletedAt: null },
        })
        return 'restored'
      }
      return 'active'
    }

    case 'EMAIL': {
      const record = await prisma.emailTemplate.findUnique({
        where: { id: installedId },
        select: { id: true, deletedAt: true },
      })
      if (!record) return 'missing'
      if (record.deletedAt) {
        await prisma.emailTemplate.update({
          where: { id: installedId },
          data: { deletedAt: null },
        })
        return 'restored'
      }
      return 'active'
    }

    case 'PIPELINE': {
      const record = await prisma.pipeline.findUnique({
        where: { id: installedId },
        select: { id: true, deletedAt: true },
      })
      if (!record) return 'missing'
      if (record.deletedAt) {
        /** Restore pipeline and its soft-deleted lanes */
        await prisma.pipeline.update({
          where: { id: installedId },
          data: { deletedAt: null },
        })
        await prisma.pipelineLane.updateMany({
          where: { pipelineId: installedId, deletedAt: { not: null } },
          data: { deletedAt: null },
        })
        return 'restored'
      }
      return 'active'
    }

    case 'CMS_SCHEMA': {
      const record = await prisma.cmsTable.findUnique({
        where: { id: installedId },
        select: { id: true, deletedAt: true },
      })
      if (!record) return 'missing'
      if (record.deletedAt) {
        /** Restore table, its soft-deleted columns, and its soft-deleted rows */
        await prisma.cmsTable.update({
          where: { id: installedId },
          data: { deletedAt: null },
        })
        await prisma.cmsColumn.updateMany({
          where: { tableId: installedId, deletedAt: { not: null } },
          data: { deletedAt: null },
        })
        await prisma.cmsRow.updateMany({
          where: { tableId: installedId, deletedAt: { not: null } },
          data: { deletedAt: null },
        })
        return 'restored'
      }
      return 'active'
    }

    case 'PRODUCT': {
      const record = await prisma.product.findUnique({
        where: { id: installedId },
        select: { id: true, deletedAt: true },
      })
      if (!record) return 'missing'
      if (record.deletedAt) {
        /** Restore product and its soft-deleted prices */
        await prisma.product.update({
          where: { id: installedId },
          data: { deletedAt: null },
        })
        await prisma.productPrice.updateMany({
          where: { productId: installedId, deletedAt: { not: null } },
          data: { deletedAt: null },
        })
        return 'restored'
      }
      return 'active'
    }

    // ------------------------------------------------------------------
    // HARD-DELETE MODELS — only check existence, no restore possible
    // ------------------------------------------------------------------

    case 'FORM': {
      const record = await prisma.form.findUnique({
        where: { id: installedId },
        select: { id: true },
      })
      return record ? 'active' : 'missing'
    }

    case 'CONTRACT': {
      const record = await prisma.contract.findUnique({
        where: { id: installedId },
        select: { id: true },
      })
      return record ? 'active' : 'missing'
    }

    case 'AUTOMATION': {
      const record = await prisma.automation.findUnique({
        where: { id: installedId },
        select: { id: true },
      })
      return record ? 'active' : 'missing'
    }

    case 'BOOKING': {
      const record = await prisma.bookingCalendar.findUnique({
        where: { id: installedId },
        select: { id: true },
      })
      return record ? 'active' : 'missing'
    }

    case 'CHAT_WIDGET': {
      const record = await prisma.chatWidget.findUnique({
        where: { id: installedId },
        select: { id: true },
      })
      return record ? 'active' : 'missing'
    }

    default:
      return 'active'
  }
}

/**
 * Updates an already-installed feature with fresh snapshot data.
 * Unlike install (which creates new records), sync updates existing ones.
 */
async function syncItem(
  featureType: TemplateCategory,
  snapshot: Record<string, unknown>,
  installedId: string,
  orgId: string,
  idMapping: Record<string, string>
): Promise<void> {
  switch (featureType) {
    case 'WEBSITE': {
      const ws = snapshot as unknown as WebsiteSnapshot
      /** Update website metadata */
      await prisma.website.update({
        where: { id: installedId },
        data: {
          enableEcommerce: ws.enableEcommerce,
          chatWidgetId: ws.chatWidgetId ? idMapping[ws.chatWidgetId] ?? null : null,
        },
      })

      /** Update page canvas data for each existing page (matched by slug) */
      const existingPages = await prisma.page.findMany({
        where: { websiteId: installedId },
        select: { id: true, slug: true },
      })
      const pageMap = new Map(existingPages.map((p) => [p.slug, p.id]))

      for (const page of ws.pages) {
        const existingPageId = pageMap.get(page.slug)
        if (existingPageId) {
          /** Remap canvas data IDs before updating */
          const remappedCanvas = page.canvasData
            ? remapIds(page.canvasData, idMapping)
            : null
          await prisma.page.update({
            where: { id: existingPageId },
            data: {
              canvasData: toJsonValue(remappedCanvas as Record<string, unknown>),
              cmsTableId: page.cmsTableId ? idMapping[page.cmsTableId] ?? page.cmsTableId : null,
            },
          })
        }
      }

      /** Update local component source trees */
      const existingComps = await prisma.localComponent.findMany({
        where: { websiteId: installedId },
        select: { id: true, name: true, sourceTree: true },
      })
      const compNameMap = new Map(existingComps.map((c) => [c.name, c.id]))

      for (const comp of ws.localComponents) {
        const existingCompId = compNameMap.get(comp.name)
        if (existingCompId) {
          const remappedTree = remapIds(comp.sourceTree, idMapping)
          await prisma.localComponent.update({
            where: { id: existingCompId },
            data: {
              sourceTree: remappedTree as Prisma.InputJsonValue,
              exposedProps: toJsonValueRequired(comp.exposedProps),
              tags: comp.tags,
              skeletonStyles: toJsonValue(comp.skeletonStyles),
            },
          })
        }
      }

      /** Sync saved colors */
      if (ws.savedColors?.length) {
        for (const color of ws.savedColors) {
          await prisma.savedColor.upsert({
            where: {
              organizationId_name: { organizationId: orgId, name: color.name },
            },
            create: {
              organizationId: orgId,
              name: color.name,
              color: color.color,
              sortOrder: color.sortOrder,
            },
            update: { color: color.color, sortOrder: color.sortOrder },
          })
        }
      }
      break
    }

    case 'EMAIL': {
      const es = snapshot as unknown as EmailSnapshot
      await prisma.emailTemplate.update({
        where: { id: installedId },
        data: {
          subject: es.subject,
          content: toJsonValueRequired(es.content),
        },
      })
      break
    }

    case 'AUTOMATION': {
      const as_ = snapshot as unknown as AutomationSnapshot
      const remappedTrigger = as_.triggerConfig
        ? remapIds(as_.triggerConfig, idMapping)
        : null
      const remappedSchema = remapIds(as_.schema, idMapping)

      await prisma.automation.update({
        where: { id: installedId },
        data: {
          triggerConfig: toJsonValue(remappedTrigger as Record<string, unknown>),
          schema: toJsonValueRequired(remappedSchema as Record<string, unknown>),
        },
      })
      break
    }

    case 'FORM': {
      const fs = snapshot as unknown as FormSnapshot
      await prisma.form.update({
        where: { id: installedId },
        data: {
          config: toJsonValue(fs.config),
          submitButtonText: fs.submitButtonText,
          successMessage: fs.successMessage,
          redirectUrl: fs.redirectUrl,
          enableCaptcha: fs.enableCaptcha,
        },
      })
      break
    }

    case 'CMS_SCHEMA': {
      const cs = snapshot as unknown as CmsSchemaSnapshot
      /** Sync row data if present — clear old rows and re-create */
      if (cs.rows?.length) {
        await prisma.cmsRow.deleteMany({ where: { tableId: installedId } })
        for (const row of cs.rows) {
          await prisma.cmsRow.create({
            data: {
              tableId: installedId,
              values: toJsonValueRequired(row.values),
              order: row.order,
            },
          })
        }
      }
      break
    }

    /** Other feature types — update basic fields only */
    case 'CONTRACT': {
      const ct = snapshot as unknown as ContractSnapshot
      await prisma.contract.update({
        where: { id: installedId },
        data: {
          content: toJsonValue(ct.content),
          variables: toJsonValue(ct.variables),
        },
      })
      break
    }

    case 'CHAT_WIDGET': {
      const cw = snapshot as unknown as ChatWidgetSnapshot
      await prisma.chatWidget.update({
        where: { id: installedId },
        data: {
          config: toJsonValue(cw.config),
        },
      })
      break
    }

    case 'PRODUCT': {
      const ps = snapshot as unknown as ProductSnapshot
      await prisma.product.update({
        where: { id: installedId },
        data: {
          description: ps.description,
          imageUrl: ps.imageUrl,
        },
      })
      break
    }

    default:
      break
  }
}

// ============================================================================
// CHECK IF TEMPLATE IS ALREADY INSTALLED
// ============================================================================

/**
 * Checks whether a template has already been installed in the given organization.
 * Used by the detail panel to disable the "Install" button and show "Installed" instead.
 *
 * SOURCE OF TRUTH: IsTemplateInstalled
 *
 * @returns true if a TemplateInstall record exists for this org + template pair.
 */
export async function isTemplateInstalled(
  organizationId: string,
  templateId: string
): Promise<boolean> {
  const existing = await prisma.templateInstall.findFirst({
    where: { organizationId, templateId },
    select: { id: true },
  })
  return !!existing
}
