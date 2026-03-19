/**
 * ============================================================================
 * TEMPLATES ROUTER — Template System API
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: TemplatesRouter, TemplateAPI, TemplateLibraryAPI,
 * TemplateProcedures
 *
 * WHY: tRPC router for all template operations — CRUD, browsing, dependency
 * detection, bundling, and installation.
 *
 * PERMISSIONS:
 * - TEMPLATES_READ: List own templates, browse library, view details
 * - TEMPLATES_CREATE: Create templates, detect dependencies, check origin, bundle features
 * - TEMPLATES_UPDATE: Update template metadata
 * - TEMPLATES_PUBLISH: Publish templates to the library
 * - TEMPLATES_DELETE: Delete templates
 * - TEMPLATES_INSTALL: Install templates into the organization
 */

import { z } from 'zod'
import {
  createTRPCRouter,
  organizationProcedure,
  baseProcedure,
  createStructuredError,
} from '../init'
import { ERROR_CODES } from '@/lib/errors'
import { permissions } from '@/lib/better-auth/permissions'
import * as templateService from '@/services/template.service'
import { createTemplatePurchaseAndInstall } from '@/services/template-purchase.service'
import { detectDependencies } from '@/lib/templates/dependency-scanner'
import { checkOriginMarker } from '@/lib/templates/origin-hash'
import { prisma } from '@/lib/config'
import type { TemplateCategory, TemplateStatus, DependencyChoice } from '@/lib/templates/types'
import type { FeatureKey } from '@/lib/config/feature-gates'
import { TEMPLATE_CATEGORY_GATE_KEY } from '@/lib/templates/constants'
import {
  withFeatureGate,
  incrementUsageAndInvalidate,
} from '@/trpc/procedures/feature-gates'

// ============================================================================
// ZOD ENUM VALUES — Mirror the TypeScript types for runtime validation
// ============================================================================

/** Valid TemplateCategory values for Zod schemas */
const templateCategoryValues = [
  'WEBSITE',
  'EMAIL',
  'AUTOMATION',
  'FORM',
  'CONTRACT',
  'PIPELINE',
  'BOOKING',
  'CHAT_WIDGET',
  'CMS_SCHEMA',
  'PRODUCT',
  'BLUEPRINT',
] as const

/** Valid TemplateStatus values for Zod schemas */
const templateStatusValues = ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'PENDING_APPROVAL'] as const

/** Valid DependencyChoice values for Zod schemas */
const dependencyChoiceValues = ['bundle_all', 'skip_all', 'choose'] as const

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/** Schema for creating a new template */
const createTemplateSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1, 'Template name is required').max(100),
  /** Lexical JSON string — rich text editor state, not plain text */
  description: z.string(),
  category: z.enum(templateCategoryValues),
  thumbnailUrl: z.string().url().optional().nullable(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  /** Price in cents — null or 0 means free template */
  price: z.number().int().min(0).optional().nullable(),
})

/** Schema for updating template metadata */
const updateTemplateSchema = z.object({
  organizationId: z.string(),
  templateId: z.string(),
  name: z.string().min(1).max(100).optional(),
  /** Lexical JSON string — rich text editor state, not plain text */
  description: z.string(),
  thumbnailUrl: z.string().url().optional().nullable(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  /** Price in cents — null or 0 means free template */
  price: z.number().int().min(0).optional().nullable(),
})

/** Schema for purchasing a paid template (creates PaymentIntent + installs) */
const purchaseTemplateSchema = z.object({
  organizationId: z.string(),
  templateId: z.string(),
  /** Stripe PaymentMethod ID from the buyer's card */
  paymentMethodId: z.string(),
})

/** Schema for listing org's own templates */
const listTemplatesSchema = z.object({
  organizationId: z.string(),
  category: z.enum(templateCategoryValues).optional(),
  status: z.enum(templateStatusValues).optional(),
  search: z.string().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(50).default(12),
})

/** Schema for browsing the cross-org template library (public — no org required) */
const browseLibrarySchema = z.object({
  category: z.enum(templateCategoryValues).optional(),
  search: z.string().optional(),
  sortBy: z.enum(['newest', 'popular', 'name']).default('newest'),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(50).default(12),
})

/** Schema for getting a single template's full details (org-scoped) */
const getTemplateDetailSchema = z.object({
  organizationId: z.string(),
  templateId: z.string(),
})

/** Schema for getting a template's details from the public library (no org required) */
const getLibraryDetailPublicSchema = z.object({
  templateId: z.string(),
})

/** Schema for listing org features by type (used in create wizard) */
const listOrgFeaturesSchema = z.object({
  organizationId: z.string(),
  featureType: z.enum(templateCategoryValues),
  search: z.string().optional(),
})

/** Schema for detecting dependencies of a feature */
const detectDependenciesSchema = z.object({
  organizationId: z.string(),
  featureType: z.enum(templateCategoryValues),
  featureId: z.string(),
})

/** Schema for checking origin (anti-plagiarism) on a feature */
const checkOriginSchema = z.object({
  organizationId: z.string(),
  featureType: z.enum(templateCategoryValues),
  featureId: z.string(),
})

/** Schema for bundling a feature into a template */
const bundleFeatureSchema = z.object({
  organizationId: z.string(),
  templateId: z.string(),
  featureType: z.enum(templateCategoryValues),
  featureId: z.string(),
  dependencySelection: z.object({
    choice: z.enum(dependencyChoiceValues),
    selectedIds: z.array(z.string()).default([]),
  }),
  /** When true, CMS table snapshots will include row data */
  includeCmsRows: z.boolean().optional().default(false),
})

/** Schema for publishing a template */
const publishTemplateSchema = z.object({
  organizationId: z.string(),
  templateId: z.string(),
})

/** Schema for deleting a template */
const deleteTemplateSchema = z.object({
  organizationId: z.string(),
  templateId: z.string(),
})

/** Schema for installing a template into an organization */
const installTemplateSchema = z.object({
  organizationId: z.string(),
  templateId: z.string(),
  excludeItemIds: z.array(z.string()).optional(),
})

/** Schema for listing installed templates */
const listInstalledSchema = z.object({
  organizationId: z.string(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(50).default(12),
})

/** Schema for republishing a template (re-snapshot + version bump) */
const republishTemplateSchema = z.object({
  organizationId: z.string(),
  templateId: z.string(),
})

/** Schema for syncing an installed template to the latest version */
const syncTemplateSchema = z.object({
  organizationId: z.string(),
  installId: z.string(),
})

/** Schema for checking if a template is already installed in the org */
const checkInstalledSchema = z.object({
  organizationId: z.string(),
  templateId: z.string(),
})

// ============================================================================
// ROUTER
// ============================================================================

export const templatesRouter = createTRPCRouter({
  // ==========================================================================
  // READ OPERATIONS
  // ==========================================================================

  /**
   * List the organization's own templates with pagination and filters.
   */
  list: organizationProcedure({
    requirePermission: permissions.TEMPLATES_READ,
  })
    .input(listTemplatesSchema)
    .query(async ({ input }) => {
      return templateService.listOrgTemplates({
        organizationId: input.organizationId,
        category: input.category as TemplateCategory | undefined,
        status: input.status as TemplateStatus | undefined,
        search: input.search,
        page: input.page,
        pageSize: input.pageSize,
      })
    }),

  /**
   * Get full details of a single template (own org or published).
   */
  getById: organizationProcedure({
    requirePermission: permissions.TEMPLATES_READ,
  })
    .input(getTemplateDetailSchema)
    .query(async ({ input }) => {
      const detail = await templateService.getTemplateDetail(
        input.templateId,
        input.organizationId
      )

      if (!detail) {
        throw createStructuredError('NOT_FOUND', 'Template not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Template not found or not accessible',
        })
      }

      return detail
    }),

  /**
   * Browse the cross-org template library (only PUBLISHED templates).
   * PUBLIC — no authentication required so the /templates page works
   * without sign-in.
   */
  browseLibrary: baseProcedure
    .input(browseLibrarySchema)
    .query(async ({ input }) => {
      return templateService.browseTemplateLibrary({
        category: input.category as TemplateCategory | undefined,
        search: input.search,
        sortBy: input.sortBy,
        page: input.page,
        pageSize: input.pageSize,
      })
    }),

  /**
   * Get full template detail for preview in the public library.
   * PUBLIC — no authentication required. Only returns PUBLISHED templates
   * since no organizationId is provided to the service.
   */
  getLibraryDetail: baseProcedure
    .input(getLibraryDetailPublicSchema)
    .query(async ({ input }) => {
      const detail = await templateService.getTemplateDetail(input.templateId)

      if (!detail) {
        throw createStructuredError('NOT_FOUND', 'Template not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Template not found in the library',
        })
      }

      return detail
    }),

  // ==========================================================================
  // CREATE / BUNDLE OPERATIONS
  // ==========================================================================

  /**
   * Create a new DRAFT template.
   */
  create: organizationProcedure({
    requirePermission: permissions.TEMPLATES_CREATE,
  })
    .input(createTemplateSchema)
    .mutation(async ({ input }) => {
      return templateService.createTemplate({
        organizationId: input.organizationId,
        name: input.name,
        description: input.description,
        category: input.category as TemplateCategory,
        thumbnailUrl: input.thumbnailUrl,
        tags: input.tags,
        price: input.price,
      })
    }),

  /**
   * List an org's features by type — used in the create wizard (Step 1)
   * to populate the feature picker. Returns a lightweight {id, name} array.
   *
   * WHY: Each feature type lives in a different table. This procedure
   * dispatches to the correct table based on featureType and returns
   * a uniform list for the UI.
   */
  listOrgFeatures: organizationProcedure({
    requirePermission: permissions.TEMPLATES_CREATE,
  })
    .input(listOrgFeaturesSchema)
    .query(async ({ input }) => {
      const { organizationId, featureType, search } = input

      /** Build a case-insensitive search filter when search is provided */
      const nameFilter = search
        ? { contains: search, mode: 'insensitive' as const }
        : undefined

      switch (featureType) {
        case 'WEBSITE': {
          const items = await prisma.website.findMany({
            where: { organizationId, deletedAt: null, name: nameFilter ? { contains: search, mode: 'insensitive' } : undefined },
            select: { id: true, name: true },
            orderBy: { createdAt: 'desc' },
            take: 50,
          })
          return items.map((i) => ({ id: i.id, name: i.name }))
        }

        case 'EMAIL': {
          const items = await prisma.emailTemplate.findMany({
            where: { organizationId, deletedAt: null, name: nameFilter ? { contains: search, mode: 'insensitive' } : undefined },
            select: { id: true, name: true },
            orderBy: { createdAt: 'desc' },
            take: 50,
          })
          return items.map((i) => ({ id: i.id, name: i.name }))
        }

        case 'AUTOMATION': {
          const items = await prisma.automation.findMany({
            where: { organizationId, name: nameFilter ? { contains: search, mode: 'insensitive' } : undefined },
            select: { id: true, name: true },
            orderBy: { createdAt: 'desc' },
            take: 50,
          })
          return items.map((i) => ({ id: i.id, name: i.name }))
        }

        case 'FORM': {
          const items = await prisma.form.findMany({
            where: { organizationId, name: nameFilter ? { contains: search, mode: 'insensitive' } : undefined },
            select: { id: true, name: true },
            orderBy: { createdAt: 'desc' },
            take: 50,
          })
          return items.map((i) => ({ id: i.id, name: i.name }))
        }

        case 'CONTRACT': {
          const items = await prisma.contract.findMany({
            where: { organizationId, isTemplate: true, name: nameFilter ? { contains: search, mode: 'insensitive' } : undefined },
            select: { id: true, name: true },
            orderBy: { createdAt: 'desc' },
            take: 50,
          })
          return items.map((i) => ({ id: i.id, name: i.name }))
        }

        case 'PIPELINE': {
          const items = await prisma.pipeline.findMany({
            where: { organizationId, deletedAt: null, name: nameFilter ? { contains: search, mode: 'insensitive' } : undefined },
            select: { id: true, name: true },
            orderBy: { createdAt: 'desc' },
            take: 50,
          })
          return items.map((i) => ({ id: i.id, name: i.name }))
        }

        case 'BOOKING': {
          const items = await prisma.bookingCalendar.findMany({
            where: { organizationId, name: nameFilter ? { contains: search, mode: 'insensitive' } : undefined },
            select: { id: true, name: true },
            orderBy: { createdAt: 'desc' },
            take: 50,
          })
          return items.map((i) => ({ id: i.id, name: i.name }))
        }

        case 'CHAT_WIDGET': {
          const items = await prisma.chatWidget.findMany({
            where: { organizationId, name: nameFilter ? { contains: search, mode: 'insensitive' } : undefined },
            select: { id: true, name: true },
            orderBy: { createdAt: 'desc' },
            take: 50,
          })
          return items.map((i) => ({ id: i.id, name: i.name }))
        }

        case 'CMS_SCHEMA': {
          const items = await prisma.cmsTable.findMany({
            where: { organizationId, deletedAt: null, name: nameFilter ? { contains: search, mode: 'insensitive' } : undefined },
            select: { id: true, name: true },
            orderBy: { createdAt: 'desc' },
            take: 50,
          })
          return items.map((i) => ({ id: i.id, name: i.name }))
        }

        case 'PRODUCT': {
          const items = await prisma.product.findMany({
            where: { organizationId, name: nameFilter ? { contains: search, mode: 'insensitive' } : undefined },
            select: { id: true, name: true },
            orderBy: { createdAt: 'desc' },
            take: 50,
          })
          return items.map((i) => ({ id: i.id, name: i.name }))
        }

        default:
          return []
      }
    }),

  /**
   * List ALL features across every type for the blueprint wizard step.
   * Runs all 10 table queries in parallel via Promise.all and returns
   * grouped results so the UI can render a multi-select checklist.
   *
   * SOURCE OF TRUTH KEYWORDS: listAllOrgFeatures, BlueprintFeatureList
   */
  listAllOrgFeatures: organizationProcedure({
    requirePermission: permissions.TEMPLATES_CREATE,
  })
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const { organizationId } = input

      /** Run all 10 queries in parallel for speed */
      const [
        websites,
        emails,
        automations,
        forms,
        contracts,
        pipelines,
        bookings,
        chatWidgets,
        cmsSchemas,
        products,
      ] = await Promise.all([
        prisma.website.findMany({
          where: { organizationId, deletedAt: null },
          select: { id: true, name: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        prisma.emailTemplate.findMany({
          where: { organizationId, deletedAt: null },
          select: { id: true, name: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        prisma.automation.findMany({
          where: { organizationId },
          select: { id: true, name: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        prisma.form.findMany({
          where: { organizationId },
          select: { id: true, name: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        prisma.contract.findMany({
          where: { organizationId, isTemplate: true },
          select: { id: true, name: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        prisma.pipeline.findMany({
          where: { organizationId, deletedAt: null },
          select: { id: true, name: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        prisma.bookingCalendar.findMany({
          where: { organizationId },
          select: { id: true, name: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        prisma.chatWidget.findMany({
          where: { organizationId },
          select: { id: true, name: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        prisma.cmsTable.findMany({
          where: { organizationId, deletedAt: null },
          select: { id: true, name: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        prisma.product.findMany({
          where: { organizationId },
          select: { id: true, name: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
      ])

      /**
       * Bulk-fetch all origin markers for this org in a single query.
       * Reuses the existing TemplateOriginMarker model (SOURCE OF TRUTH: origin-hash.ts)
       * to identify which features were installed from templates — those must be
       * blocked from blueprint bundling (same anti-plagiarism rule as single-feature mode).
       */
      const originMarkers = await prisma.templateOriginMarker.findMany({
        where: { organizationId },
        select: { featureType: true, featureId: true, templateId: true },
      })

      /** Build a Set of "featureType:featureId" keys for O(1) lookup on the client */
      const originMarkerSet = new Set(
        originMarkers.map((m) => `${m.featureType}:${m.featureId}`)
      )

      /**
       * Build a map of "featureType:featureId" → templateId for showing
       * which template a feature was installed from (UI badge).
       */
      const originTemplateMap: Record<string, string> = {}
      for (const m of originMarkers) {
        originTemplateMap[`${m.featureType}:${m.featureId}`] = m.templateId
      }

      /** Map helper: adds `isFromTemplate` flag per feature using the origin marker set */
      const mapWithOrigin = (featureType: string, items: { id: string; name: string }[]) =>
        items.map((i) => ({
          id: i.id,
          name: i.name,
          isFromTemplate: originMarkerSet.has(`${featureType}:${i.id}`),
        }))

      /** Return grouped by feature type with origin info for anti-plagiarism filtering */
      return {
        WEBSITE: mapWithOrigin('WEBSITE', websites),
        EMAIL: mapWithOrigin('EMAIL', emails),
        AUTOMATION: mapWithOrigin('AUTOMATION', automations),
        FORM: mapWithOrigin('FORM', forms),
        CONTRACT: mapWithOrigin('CONTRACT', contracts),
        PIPELINE: mapWithOrigin('PIPELINE', pipelines),
        BOOKING: mapWithOrigin('BOOKING', bookings),
        CHAT_WIDGET: mapWithOrigin('CHAT_WIDGET', chatWidgets),
        CMS_SCHEMA: mapWithOrigin('CMS_SCHEMA', cmsSchemas),
        PRODUCT: mapWithOrigin('PRODUCT', products),
      }
    }),

  /**
   * Detect dependencies for a feature (used in the create wizard step 2).
   */
  detectDependencies: organizationProcedure({
    requirePermission: permissions.TEMPLATES_CREATE,
  })
    .input(detectDependenciesSchema)
    .query(async ({ input }) => {
      return detectDependencies(
        input.organizationId,
        input.featureType as TemplateCategory,
        input.featureId
      )
    }),

  /**
   * Check if a feature was installed from a template (anti-plagiarism check).
   * If true, the user should be blocked from re-publishing it.
   */
  checkOrigin: organizationProcedure({
    requirePermission: permissions.TEMPLATES_CREATE,
  })
    .input(checkOriginSchema)
    .query(async ({ input }) => {
      return checkOriginMarker(
        input.featureType as TemplateCategory,
        input.featureId
      )
    }),

  /**
   * Bundle a feature (and optionally its dependencies) into a template.
   * Creates TemplateItem records with sanitized snapshots.
   */
  bundleFeature: organizationProcedure({
    requirePermission: permissions.TEMPLATES_CREATE,
  })
    .input(bundleFeatureSchema)
    .mutation(async ({ input }) => {
      return templateService.bundleFeatureIntoTemplate({
        organizationId: input.organizationId,
        templateId: input.templateId,
        featureType: input.featureType as TemplateCategory,
        featureId: input.featureId,
        dependencySelection: {
          choice: input.dependencySelection.choice as DependencyChoice,
          selectedIds: input.dependencySelection.selectedIds,
        },
        includeCmsRows: input.includeCmsRows,
      })
    }),

  // ==========================================================================
  // UPDATE OPERATIONS
  // ==========================================================================

  /**
   * Update template metadata (name, description, thumbnail, tags, price).
   */
  update: organizationProcedure({
    requirePermission: permissions.TEMPLATES_UPDATE,
  })
    .input(updateTemplateSchema)
    .mutation(async ({ input }) => {
      return templateService.updateTemplate({
        organizationId: input.organizationId,
        templateId: input.templateId,
        name: input.name,
        description: input.description,
        thumbnailUrl: input.thumbnailUrl,
        tags: input.tags,
        price: input.price,
      })
    }),

  // ==========================================================================
  // PUBLISH OPERATIONS
  // ==========================================================================

  /**
   * Publish a template to the library (makes it installable by other orgs).
   *
   * For free templates: sets status to PUBLISHED immediately.
   * For paid templates: may set status to PENDING_APPROVAL if portal
   * auto-approve is disabled. Returns { status } so the UI can distinguish.
   */
  publish: organizationProcedure({
    requirePermission: permissions.TEMPLATES_PUBLISH,
  })
    .input(publishTemplateSchema)
    .mutation(async ({ input }) => {
      const result = await templateService.publishTemplate(
        input.organizationId,
        input.templateId
      )
      /** Return the status so the UI knows if it went to PUBLISHED or PENDING_APPROVAL */
      return { status: result.status as TemplateStatus }
    }),

  // ==========================================================================
  // DELETE OPERATIONS
  // ==========================================================================

  /**
   * Hard delete a template and all its items/installs.
   */
  delete: organizationProcedure({
    requirePermission: permissions.TEMPLATES_DELETE,
  })
    .input(deleteTemplateSchema)
    .mutation(async ({ input }) => {
      await templateService.deleteTemplate(
        input.organizationId,
        input.templateId
      )
      return { success: true }
    }),

  // ==========================================================================
  // INSTALL OPERATIONS
  // ==========================================================================

  /**
   * Install a template into the organization.
   * Creates all features in DRAFT status with cross-feature ID remapping.
   * Optionally exclude specific items from installation.
   *
   * FEATURE GATE ENFORCEMENT:
   * Before installing, counts items per category and validates against the
   * org's plan limits using the existing feature gate system (checkFeatureGate).
   * After successful install, increments usage for each gated category.
   * Uses TEMPLATE_CATEGORY_GATE_KEY mapping — fully dynamic, no hardcoded limits.
   */
  install: organizationProcedure({
    requirePermission: permissions.TEMPLATES_INSTALL,
  })
    .input(installTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      /** Get the current user's ID for the install record */
      const userId = ctx.user?.id
      if (!userId) {
        throw createStructuredError('UNAUTHORIZED', 'User not authenticated', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'You must be logged in to install templates',
        })
      }

      /**
       * Feature gate checked at handler level: multi-category dynamic checking.
       * Each template can install items across different feature categories (websites,
       * forms, pipelines, etc.) with variable counts per category. Procedure-level
       * requireFeature only supports a single feature key with increment=1, so this
       * must remain at handler level to iterate categories and pass per-category counts.
       */
      const template = await prisma.template.findUnique({
        where: { id: input.templateId },
        include: { items: { select: { id: true, featureType: true } } },
      })

      if (template) {
        /** Filter to only items that will actually be installed (respect excludeItemIds) */
        const excludeSet = new Set(input.excludeItemIds ?? [])
        const itemsToInstall = template.items.filter((i) => !excludeSet.has(i.id))

        /** Count items per feature type */
        const countsByType = new Map<string, number>()
        for (const item of itemsToInstall) {
          const count = countsByType.get(item.featureType) ?? 0
          countsByType.set(item.featureType, count + 1)
        }

        /** Validate each gated category — uses existing withFeatureGate (throws on limit exceeded) */
        for (const [featureType, count] of countsByType) {
          const gateKey = TEMPLATE_CATEGORY_GATE_KEY[featureType as TemplateCategory]
          if (gateKey) {
            await withFeatureGate(ctx, input.organizationId, gateKey as FeatureKey, count)
          }
        }
      }

      /** Run the actual installation */
      const result = await templateService.installTemplate({
        organizationId: input.organizationId,
        templateId: input.templateId,
        installedById: userId,
        excludeItemIds: input.excludeItemIds,
      })

      /**
       * Post-install: increment usage for each gated category based on what was
       * actually installed (using result.items, not the pre-flight count — respects
       * items that were reused or failed).
       */
      const installedCountsByType = new Map<string, number>()
      for (const item of result.items) {
        if (item.success && item.action === 'created') {
          const count = installedCountsByType.get(item.featureType) ?? 0
          installedCountsByType.set(item.featureType, count + 1)
        }
      }

      for (const [featureType, count] of installedCountsByType) {
        const gateKey = TEMPLATE_CATEGORY_GATE_KEY[featureType as TemplateCategory]
        if (gateKey) {
          await incrementUsageAndInvalidate(ctx, input.organizationId, gateKey as FeatureKey, count)
        }
      }

      return result
    }),

  /**
   * Check if a template is already installed in the current organization.
   * Returns { installed: boolean } — used by the detail panel to disable
   * the install button and show "Installed" instead.
   */
  checkInstalled: organizationProcedure({
    requirePermission: permissions.TEMPLATES_READ,
  })
    .input(checkInstalledSchema)
    .query(async ({ input }) => {
      const installed = await templateService.isTemplateInstalled(
        input.organizationId,
        input.templateId
      )
      return { installed }
    }),

  // ==========================================================================
  // INSTALLED TEMPLATES
  // ==========================================================================

  /**
   * List templates installed into this organization.
   * Shows install date, version info, and whether updates are available.
   */
  listInstalled: organizationProcedure({
    requirePermission: permissions.TEMPLATES_READ,
  })
    .input(listInstalledSchema)
    .query(async ({ input }) => {
      return templateService.listInstalledTemplates({
        organizationId: input.organizationId,
        page: input.page,
        pageSize: input.pageSize,
      })
    }),

  // ==========================================================================
  // REPUBLISH & SYNC OPERATIONS
  // ==========================================================================

  /**
   * Republish a template — re-snapshots all features and bumps the version.
   * Only the template creator's org can republish.
   */
  republish: organizationProcedure({
    requirePermission: permissions.TEMPLATES_PUBLISH,
  })
    .input(republishTemplateSchema)
    .mutation(async ({ input }) => {
      return templateService.republishTemplate(
        input.organizationId,
        input.templateId
      )
    }),

  /**
   * Sync an installed template to the latest version.
   * Updates installed features with fresh snapshot data.
   */
  syncChanges: organizationProcedure({
    requirePermission: permissions.TEMPLATES_INSTALL,
  })
    .input(syncTemplateSchema)
    .mutation(async ({ input }) => {
      return templateService.syncTemplateChanges({
        organizationId: input.organizationId,
        installId: input.installId,
      })
    }),

  // ==========================================================================
  // PURCHASE OPERATIONS — Paid template purchase flow
  // ==========================================================================

  /**
   * Purchase a paid template — creates a Stripe PaymentIntent on the seller's
   * connected account with platform fee, records the transaction, and installs
   * the template into the buyer's organization.
   *
   * SECURITY:
   * - Buyer must be on a paid plan (free tier cannot purchase)
   * - Seller must have a connected Stripe account
   * - Template must be PUBLISHED with price > 0
   * - Self-purchase is blocked
   */
  purchaseAndInstall: organizationProcedure({
    requirePermission: permissions.TEMPLATES_INSTALL,
  })
    .input(purchaseTemplateSchema)
    .mutation(async ({ ctx, input }) => {
      /** Get the current user's ID for the install record */
      const userId = ctx.user?.id
      if (!userId) {
        throw createStructuredError('UNAUTHORIZED', 'User not authenticated', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'You must be logged in to purchase templates',
        })
      }

      return createTemplatePurchaseAndInstall({
        templateId: input.templateId,
        paymentMethodId: input.paymentMethodId,
        buyerOrganizationId: input.organizationId,
        buyerUserId: userId,
      })
    }),
})
