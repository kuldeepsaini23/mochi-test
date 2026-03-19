/**
 * ============================================================================
 * INTERNAL TEMPLATE SYSTEM — TYPE DEFINITIONS
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: InternalTemplate, InternalTemplateItem,
 * InternalTemplateInstallOptions, InternalTemplateInstallResult
 *
 * WHY: Internal templates are code-defined (not DB-stored) template definitions
 * used for seeding organizations with starter content like e-commerce pages,
 * booking flows, etc. They reuse the same snapshot/install infrastructure as
 * the marketplace template system but skip the DB Template/TemplateItem records.
 *
 * ARCHITECTURE:
 * - InternalTemplateItem mirrors TemplateItem but lives in code, not Prisma.
 * - InternalTemplate groups items into a named, installable bundle.
 * - Installation reuses the exported installTemplateItem() and
 *   remapInstalledFeatureData() primitives from template.service.ts.
 */

import type {
  TemplateCategory,
  FeatureSnapshotMap,
  IdRemapTable,
  InstallItemResult,
} from '../types'

/**
 * A single item within an internal template — maps to one feature to install.
 * Generic parameter T constrains the snapshot type to match the featureType.
 */
export interface InternalTemplateItem<T extends TemplateCategory = TemplateCategory> {
  /** Unique ID within this template (used for dependency ordering) */
  id: string
  /** Feature type determines which install function runs */
  featureType: T
  /** Display name for logging/results */
  sourceName: string
  /** Original source ID — used as the key in the ID remap table */
  sourceId: string
  /** The feature snapshot data matching the featureType */
  snapshot: FeatureSnapshotMap[T]
  /** IDs of other InternalTemplateItems this depends on (installed first) */
  dependsOn: string[]
  /** Installation order (lower = earlier, used for topo sort tiebreaking) */
  order: number
}

/**
 * Complete internal template definition — stored as code, not in DB.
 * Each internal template bundles all items needed to seed a particular
 * feature set (e.g., e-commerce starter with website + products + CMS).
 */
export interface InternalTemplate {
  /** Unique identifier (e.g., 'ecommerce-starter') */
  id: string
  /** Human-readable name */
  name: string
  /** Description of what this template installs */
  description: string
  /** Primary category for UI grouping */
  category: TemplateCategory
  /** All items to install */
  items: InternalTemplateItem[]
}

/**
 * Options for installing an internal template into a target organization.
 * Supports both fresh website creation and merging into an existing website.
 */
export interface InternalTemplateInstallOptions {
  /** Target organization ID */
  organizationId: string
  /** If set, merge website pages/components into this existing website instead of creating new */
  targetWebsiteId?: string
  /** Domain ID to assign to created pages (used when installing into existing website) */
  targetDomainId?: string | null
}

/**
 * Result of installing an internal template — tracks per-item outcomes
 * and the complete ID remap table for post-install reference fixups.
 */
export interface InternalTemplateInstallResult {
  /** Template that was installed */
  templateId: string
  templateName: string
  /** Per-item results */
  items: InstallItemResult[]
  /** Complete old→new ID mapping */
  idMapping: IdRemapTable
  /** Overall success */
  success: boolean
  installedCount: number
  failedCount: number
}
