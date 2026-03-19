/**
 * ============================================================================
 * INTERNAL TEMPLATE INSTALL ORCHESTRATOR
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: installInternalTemplate, installWebsitePagesIntoExisting,
 * InternalTemplateInstallOrchestrator
 *
 * WHY: Internal templates are code-defined bundles (not DB-stored) that seed
 * organizations with starter content (e.g., e-commerce pages, booking flows).
 * This orchestrator handles the full install lifecycle:
 *   1. Topologically sort items by dependency order
 *   2. Install each item using the shared installTemplateItem() primitive
 *   3. Special-case WEBSITE items when merging into an existing website
 *   4. Second pass: remap cross-feature ID references
 *
 * The key differentiator from marketplace template installation is the
 * installWebsitePagesIntoExisting() function, which merges pages and
 * components into an existing website rather than creating a new one.
 */

import { prisma } from '@/lib/config'
import { topologicalSort } from '../id-remapper'
import {
  installTemplateItem,
  remapInstalledFeatureData,
  toJsonValue,
  toJsonValueRequired,
} from '@/services/template.service'
import type { IdRemapTable, InstallItemResult } from '../types'
import type { WebsiteSnapshot } from '../types'
import type {
  InternalTemplate,
  InternalTemplateInstallOptions,
  InternalTemplateInstallResult,
  InternalTemplateItem,
} from './types'

/**
 * Installs an internal template into a target organization.
 *
 * Handles both fresh creation and merging into an existing website.
 * Uses topological sorting to ensure dependencies are installed before
 * the items that reference them (e.g., CMS tables before website pages
 * that contain SmartCMS list elements pointing to those tables).
 *
 * @param template - The internal template definition (code-defined, not from DB)
 * @param options  - Installation target: org ID, optional existing website/domain
 * @returns Result with per-item outcomes, ID mappings, and overall success status
 */
export async function installInternalTemplate(
  template: InternalTemplate,
  options: InternalTemplateInstallOptions
): Promise<InternalTemplateInstallResult> {
  const { organizationId, targetWebsiteId, targetDomainId } = options
  const remapTable: IdRemapTable = {}
  const itemResults: InstallItemResult[] = []

  /**
   * Step 1: Topologically sort items so dependencies are installed first.
   * Items at the same depth are tie-broken by their `order` field.
   */
  const sortedItems = topologicalSort(template.items)

  /**
   * Step 2: Install each item sequentially (order matters for ID remapping).
   * WEBSITE items with a targetWebsiteId get the merge-into-existing path;
   * all other items use the standard installTemplateItem() primitive.
   */
  for (const item of sortedItems) {
    try {
      let newId: string

      const shouldMergeIntoExistingWebsite =
        item.featureType === 'WEBSITE' && targetWebsiteId

      if (shouldMergeIntoExistingWebsite) {
        /**
         * Merge pages and components into the existing website instead
         * of creating a brand-new website record. This is the key path
         * for enableEcommerce — we add e-commerce pages to the user's
         * current website rather than spinning up a separate one.
         */
        newId = await installWebsitePagesIntoExisting(
          item.snapshot as WebsiteSnapshot,
          targetWebsiteId,
          organizationId,
          targetDomainId ?? null,
          remapTable
        )
      } else {
        /**
         * Standard install path — delegates to the shared primitive
         * which handles all feature types (WEBSITE, EMAIL, FORM, etc.)
         */
        newId = await installTemplateItem(
          item.featureType,
          item.snapshot as Record<string, unknown>,
          organizationId,
          remapTable
        )
      }

      /** Record the old→new ID mapping for cross-reference remapping */
      remapTable[item.sourceId] = newId

      itemResults.push({
        templateItemId: item.id,
        featureType: item.featureType,
        sourceId: item.sourceId,
        newId,
        featureName: item.sourceName,
        action: 'created',
        success: true,
      })
    } catch (error) {
      /**
       * Log the failure but continue installing remaining items.
       * Downstream items that depend on a failed item will still attempt
       * to install — they may fail too if they reference the missing ID,
       * but that's acceptable for partial installs.
       */
      console.error(
        `[installInternalTemplate] Failed to install item "${item.sourceName}" (${item.featureType}):`,
        error
      )

      itemResults.push({
        templateItemId: item.id,
        featureType: item.featureType,
        sourceId: item.sourceId,
        newId: '',
        featureName: item.sourceName,
        action: 'created',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Step 3: Second pass — remap cross-feature ID references.
   * After all items are installed, canvas data may still contain old IDs
   * (e.g., a page referencing a form by its source org ID). This pass
   * walks each installed feature's data and swaps old IDs for new ones.
   */
  for (const result of itemResults) {
    if (!result.success) continue

    try {
      await remapInstalledFeatureData(
        result.featureType,
        result.newId,
        remapTable
      )
    } catch (error) {
      /**
       * Remap failure is non-fatal — the item was installed successfully,
       * it just may have stale cross-references that need manual fixup.
       */
      console.error(
        `[installInternalTemplate] Failed to remap data for "${result.featureName}" (${result.featureType}):`,
        error
      )
    }
  }

  /** Compute success/failure counts for the result summary */
  const installedCount = itemResults.filter((r) => r.success).length
  const failedCount = itemResults.filter((r) => !r.success).length

  return {
    templateId: template.id,
    templateName: template.name,
    items: itemResults,
    idMapping: remapTable,
    success: failedCount === 0,
    installedCount,
    failedCount,
  }
}

/**
 * Merges a website snapshot's pages and components into an existing website.
 *
 * This is the KEY function for the enableEcommerce flow — instead of creating
 * a brand-new website, it adds e-commerce pages and components to the user's
 * current website. It handles:
 *   - Enabling e-commerce on the website if the snapshot requires it
 *   - Creating local components (needed before pages for canvas references)
 *   - Slug collision avoidance (appends timestamp if slug already exists)
 *   - Page ordering (appends after existing pages)
 *   - Saved color palette upserts (skip existing, add missing)
 *
 * @param snapshot       - Website snapshot containing pages, components, and colors
 * @param websiteId      - Existing website ID to merge into
 * @param organizationId - Target organization ID
 * @param domainId       - Domain ID for page creation (may be null)
 * @param remapTable     - Shared ID remap table (mutated with new component/page IDs)
 * @returns The existing websiteId (not a new one)
 */
async function installWebsitePagesIntoExisting(
  snapshot: WebsiteSnapshot,
  websiteId: string,
  organizationId: string,
  domainId: string | null | undefined,
  remapTable: IdRemapTable
): Promise<string> {
  /**
   * Enable e-commerce on the target website if the snapshot requires it.
   * Only flips the flag to true — never disables it if already enabled.
   */
  if (snapshot.enableEcommerce) {
    await prisma.website.update({
      where: { id: websiteId },
      data: { enableEcommerce: true },
    })
  }

  /**
   * Create local components first — pages may contain ComponentInstance
   * elements that reference these components by ID, so they must exist
   * before we create the pages (or at least have their IDs in remapTable
   * for the second-pass remapping).
   */
  for (const comp of snapshot.localComponents) {
    const newComp = await prisma.localComponent.create({
      data: {
        websiteId,
        name: comp.name,
        description: comp.description,
        sourceTree: toJsonValueRequired(comp.sourceTree),
        exposedProps: toJsonValueRequired(comp.exposedProps),
        tags: comp.tags,
        skeletonStyles: toJsonValue(comp.skeletonStyles),
      },
    })

    /** Map old component ID → new component ID for canvas data remapping */
    remapTable[comp.sourceId] = newComp.id
  }

  /**
   * Find the maximum page order in the existing website so new pages
   * are appended after all existing ones instead of colliding.
   */
  const maxOrderResult = await prisma.page.aggregate({
    where: { websiteId },
    _max: { order: true },
  })
  const startOrder = (maxOrderResult._max.order ?? 0) + 1

  /**
   * Create pages with ALWAYS-UNIQUE slugs.
   * WHY: Multiple installs (e.g., 2 e-commerce stores on the same domain) would
   * break if they share the same slug. A short timestamp suffix guarantees uniqueness
   * while keeping URLs readable (e.g., "shop-k7x2m", "checkout-k7x2m").
   *
   * After creating pages, slug mappings are added to the remap table so that
   * remapIds() updates all href/pageSlug references in canvas data and components.
   */
  const slugSuffix = Date.now().toString(36).slice(-5)
  for (let i = 0; i < snapshot.pages.length; i++) {
    const page = snapshot.pages[i]

    /**
     * Always append a unique suffix to avoid collisions across installs.
     * Each install batch shares the same suffix so sibling pages have
     * matching style (e.g., shop-k7x2m, checkout-k7x2m).
     */
    const finalSlug = `${page.slug}-${slugSuffix}`

    /** Remap CMS table references if a CMS table was installed as a dependency */
    const cmsTableId = page.cmsTableId
      ? remapTable[page.cmsTableId] ?? page.cmsTableId
      : null

    const newPage = await prisma.page.create({
      data: {
        organizationId,
        domainId: domainId ?? undefined,
        websiteId,
        slug: finalSlug,
        name: page.name,
        canvasData: toJsonValue(page.canvasData),
        cmsTableId,
        cmsSlugColumnSlug: page.cmsSlugColumnSlug,
        order: startOrder + i,
        isEcommercePage: page.isEcommercePage,
        status: 'DRAFT',
      },
    })

    /** Map old page ID → new page ID for SmartCmsListElement.targetPageId remapping */
    if (page.sourceId) {
      remapTable[page.sourceId] = newPage.id
    }

    /**
     * Add slug remappings so remapIds() updates all href/pageSlug references
     * in canvas data. Both /-prefixed and bare forms are added:
     *   - With leading slash: href="/shop" → href="/shop-k7x2m"
     *   - Without leading slash: targetPageSlug="shop" → "shop-k7x2m"
     *
     * The bare slug won't corrupt element.type because remapIds() skips
     * remapping on the "type" key (PROTECTED_KEYS in id-remapper.ts).
     */
    if (page.slug !== finalSlug) {
      remapTable[`/${page.slug}`] = `/${finalSlug}`
      remapTable[page.slug] = finalSlug
    }
  }

  /**
   * Upsert saved colors from the template's palette.
   * Skips colors that already exist by name in the org (update is a no-op).
   * These colors are referenced by elements in canvas data — without them,
   * installed templates would have broken color references.
   */
  if (snapshot.savedColors?.length) {
    for (const color of snapshot.savedColors) {
      await prisma.savedColor.upsert({
        where: {
          organizationId_name: { organizationId, name: color.name },
        },
        create: {
          organizationId,
          name: color.name,
          color: color.color,
          sortOrder: color.sortOrder,
        },
        /** If a color with this name already exists, keep the existing one */
        update: {},
      })
    }
  }

  /** Return the existing website ID — not a new one */
  return websiteId
}
