/**
 * ============================================================================
 * TEMPLATE SYSTEM — TYPE DEFINITIONS
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: TemplateTypes, FeatureSnapshotMap, TemplateCategory,
 * TemplateStatus, DetectedDependency, DependencyTree, IdRemapTable, InstallResult,
 * TemplateListItem, TemplateDetail, TemplateLibraryFilters
 *
 * WHY: Centralized type definitions for the entire template system.
 * These types are used by the service layer, tRPC router, and all UI components.
 *
 * IMPORTANT: Once the Prisma schema is migrated and generated, TemplateCategory
 * and TemplateStatus should be replaced with imports from @/generated/prisma.
 * For now we define them here as string literal unions to unblock development.
 */

import type { LucideIcon } from 'lucide-react'

// ============================================================================
// CORE ENUMS — Mirrors Prisma schema (replace with Prisma imports after migration)
// ============================================================================

/**
 * All feature types that can be templated.
 * Maps 1:1 to the Prisma TemplateCategory enum.
 */
export type TemplateCategory =
  | 'WEBSITE'
  | 'EMAIL'
  | 'AUTOMATION'
  | 'FORM'
  | 'CONTRACT'
  | 'PIPELINE'
  | 'BOOKING'
  | 'CHAT_WIDGET'
  | 'CMS_SCHEMA'
  | 'PRODUCT'
  | 'BLUEPRINT'

/**
 * Lifecycle status of a template.
 * Maps 1:1 to the Prisma TemplateStatus enum.
 */
export type TemplateStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'PENDING_APPROVAL'

// ============================================================================
// SNAPSHOT INTERFACES — One per feature type
// ============================================================================
// Each snapshot captures the sanitized, org-agnostic shape of a feature.
// These are stored in TemplateItem.snapshot (JSON column) and used during
// installation to recreate the feature in the target organization.
//
// RULES:
// - NO organization IDs, domain IDs, folder IDs
// - NO Stripe IDs (regenerated on install)
// - NO lead data, messages, team assignments
// - NO submission data, ticket data, CMS row data
// ============================================================================

/**
 * Website snapshot — includes pages, local components, and e-commerce flag.
 * Fields sourced from Prisma: Website, Page, LocalComponent models.
 */
export interface WebsiteSnapshot {
  /** Website display name */
  name: string
  /** Optional description */
  description: string | null
  /** Whether e-commerce is enabled on the original website */
  enableEcommerce: boolean
  /** Chat widget ID linked to this website (remapped on install, null if none) */
  chatWidgetId: string | null
  /** Pages within the website, with canvas data but no published data or domain refs */
  pages: Array<{
    /**
     * Original page ID from the source org.
     * Used to build old→new ID mappings in remapTable so that
     * SmartCmsListElement.targetPageId can be remapped correctly.
     */
    sourceId: string
    /** Page display name */
    name: string
    /** URL-safe slug (e.g., "home", "about", "contact") */
    slug: string
    /** Working canvas data — the elements on the page (JSON) */
    canvasData: Record<string, unknown> | null
    /** CMS table ID this dynamic page references (remapped on install) */
    cmsTableId: string | null
    /** CMS slug column slug for dynamic pages */
    cmsSlugColumnSlug: string | null
    /** Ordering within the website */
    order: number
    /** Whether this is an auto-created e-commerce page */
    isEcommercePage: boolean
  }>
  /** Saved color palette entries from the organization (reusable brand colors) */
  savedColors: Array<{
    /** Color display name (e.g., "Brand Blue") */
    name: string
    /** Color value: hex (#ff0000), rgba(), 'transparent', or JSON gradient string */
    color: string
    /** Display order in the palette */
    sortOrder: number
  }>
  /** Reusable local components scoped to this website */
  localComponents: Array<{
    /**
     * Original component ID from the source org.
     * Used to build old→new ID mappings in remapTable so that
     * component instances in canvasData can be remapped correctly.
     */
    sourceId: string
    /** Component name */
    name: string
    /** Optional description */
    description: string | null
    /** Complete element tree (root + children with styles) — JSON */
    sourceTree: Record<string, unknown>
    /** Exposed properties for instance customization — JSON array */
    exposedProps: Record<string, unknown>
    /** Organizational tags */
    tags: string[]
    /** Skeleton styles for SmartCMS List rendering */
    skeletonStyles: Record<string, unknown> | null
  }>
}

/**
 * Email template snapshot — content blocks and subject line.
 * Fields sourced from Prisma: EmailTemplate model.
 */
export interface EmailSnapshot {
  /** Template name */
  name: string
  /** Optional description */
  description: string | null
  /** Default email subject line */
  subject: string
  /** Email content — JSON array of blocks (includes emailSettings) */
  content: Record<string, unknown>
}

/**
 * Automation snapshot — trigger configuration and workflow schema.
 * Fields sourced from Prisma: Automation model.
 * NOTE: triggerConfig may contain formId, productId, pipelineId references
 * that need ID remapping on install.
 */
export interface AutomationSnapshot {
  /** Automation name */
  name: string
  /** Optional description */
  description: string | null
  /** Trigger type (maps to AutomationTriggerType enum) */
  triggerType: string
  /** Trigger-specific configuration — JSON (contains cross-feature refs) */
  triggerConfig: Record<string, unknown> | null
  /** React Flow schema — { nodes: Node[], edges: Edge[] } */
  schema: Record<string, unknown>
}

/**
 * Form snapshot — complete field configuration and settings.
 * Fields sourced from Prisma: Form model.
 */
export interface FormSnapshot {
  /** Form display name */
  name: string
  /** Optional description */
  description: string | null
  /** Form configuration JSON — fields, logicGates, styling, settings */
  config: Record<string, unknown> | null
  /** Submit button text */
  submitButtonText: string
  /** Success message shown after submission */
  successMessage: string
  /** Optional redirect URL after submission */
  redirectUrl: string | null
  /** Whether CAPTCHA is enabled */
  enableCaptcha: boolean
  /** Max submissions (null = unlimited) */
  submissionLimit: number | null
}

/**
 * Contract snapshot — Lexical editor content and local variables.
 * Fields sourced from Prisma: Contract model.
 */
export interface ContractSnapshot {
  /** Contract name */
  name: string
  /** Optional description */
  description: string | null
  /** Lexical editor JSON state — SerializedEditorState */
  content: Record<string, unknown> | null
  /** Local contract variables — Array of { id, name, value } */
  variables: Record<string, unknown> | null
}

/**
 * Pipeline snapshot — lanes structure only (no tickets, no assignees).
 * Fields sourced from Prisma: Pipeline, PipelineLane models.
 */
export interface PipelineSnapshot {
  /** Pipeline name */
  name: string
  /** Optional description */
  description: string | null
  /** Ordered lane definitions */
  lanes: Array<{
    /** Lane display name */
    name: string
    /** Optional hex color for visual distinction */
    color: string | null
    /** Position within pipeline (lower = further left) */
    order: number
  }>
}

/**
 * Booking calendar snapshot — availability schedule and meeting settings.
 * Fields sourced from Prisma: BookingCalendar, BookingAvailability models.
 * NOTE: No team assignments (defaultAssigneeId, assignees) — those are org-specific.
 */
export interface BookingSnapshot {
  /** Calendar display name */
  name: string
  /** Optional description */
  description: string | null
  /** Meeting duration in minutes */
  duration: number
  /** Buffer time before meeting in minutes */
  bufferBefore: number
  /** Buffer time after meeting in minutes */
  bufferAfter: number
  /** Display color */
  color: string
  /** Location type: "virtual", "in_person", "phone" */
  locationType: string
  /** Location details (physical address or instructions) */
  locationDetails: string | null
  /** Weekly availability schedule — one entry per day of week */
  availability: Array<{
    /** Day of week (0 = Sunday, 6 = Saturday) */
    dayOfWeek: number
    /** Start time as HH:mm string */
    startTime: string
    /** End time as HH:mm string */
    endTime: string
    /** Whether bookings are accepted on this day */
    isEnabled: boolean
  }>
}

/**
 * Chat widget snapshot — configuration, FAQs, and updates.
 * Fields sourced from Prisma: ChatWidget, ChatWidgetFAQ, ChatWidgetUpdate models.
 * NOTE: No conversations, guest sessions, or website linkages.
 */
export interface ChatWidgetSnapshot {
  /** Widget name */
  name: string
  /** Optional description */
  description: string | null
  /** Widget configuration JSON — theme, behavior, welcome page */
  config: Record<string, unknown> | null
  /** FAQ items for help page */
  faqs: Array<{
    /** FAQ question */
    question: string
    /** FAQ answer (may contain rich text) */
    answer: string
    /** Display order */
    sortOrder: number
  }>
}

/**
 * CMS schema snapshot — table structure with column definitions and optional row data.
 * Fields sourced from Prisma: CmsTable, CmsColumn, CmsRow models.
 * Row data is optional — the user chooses whether to bundle it during template creation.
 */
export interface CmsSchemaSnapshot {
  /** Table display name */
  name: string
  /** Optional description */
  description: string | null
  /** Optional emoji or icon identifier */
  icon: string | null
  /** Whether table data is publicly readable (for published websites) */
  isPublic: boolean
  /** Column definitions (ordered) */
  columns: Array<{
    /** Column display name */
    name: string
    /** URL-safe slug used as key in row values */
    slug: string
    /** Column data type (maps to CmsColumnType enum) */
    columnType: string
    /** Whether this column is required */
    required: boolean
    /** Default value for new rows */
    defaultValue: string | null
    /** Type-specific options (e.g., MULTISELECT choices, NUMBER constraints) */
    options: Record<string, unknown> | null
    /** Display order */
    order: number
  }>
  /**
   * Optional row data — only included when the user opts in during template creation.
   * Each row stores its column values as a JSON object keyed by column slug.
   * Image URLs are included as-is (they reference external storage, not local files).
   */
  rows?: Array<{
    /** Row values keyed by column slug (e.g., { "title": "Blog Post", "views": 42 }) */
    values: Record<string, unknown>
    /** Display order for manual sorting */
    order: number
  }>
}

/**
 * Product snapshot — product details, prices, and features (NO Stripe IDs).
 * Fields sourced from Prisma: Product, ProductPrice, PriceFeature models.
 * Stripe IDs are stripped — they are regenerated when the installer syncs to Stripe.
 */
export interface ProductSnapshot {
  /** Product name */
  name: string
  /** Optional description */
  description: string | null
  /** Product image URL (may be null or external) */
  imageUrl: string | null
  /**
   * SOURCE OF TRUTH: ProductImages
   * Additional gallery images for carousel/product detail display.
   */
  images?: string[]
  /** Whether inventory tracking is enabled */
  trackInventory: boolean
  /** Allow backorders when out of stock */
  allowBackorder: boolean
  /** Low stock alert threshold */
  lowStockThreshold: number | null
  /** Price definitions (Stripe IDs stripped) */
  prices: Array<{
    /** Price display name */
    name: string
    /** Amount in cents */
    amount: number
    /** Currency code (e.g., "usd") */
    currency: string
    /** Billing type: ONE_TIME, RECURRING, SPLIT_PAYMENT */
    billingType: string
    /** Recurring interval: WEEK, MONTH, YEAR (null for ONE_TIME) */
    interval: string | null
    /** Interval count (e.g., 2 for "every 2 months") */
    intervalCount: number | null
    /** Number of installments (for SPLIT_PAYMENT) */
    installments: number | null
    /** Installment interval (for SPLIT_PAYMENT) */
    installmentInterval: string | null
    /** Installment interval count (for SPLIT_PAYMENT) */
    installmentIntervalCount: number | null
    /**
     * SOURCE OF TRUTH: PriceSourceId
     * Optional stable source ID for this price, used in the remap table
     * so checkout elements referencing this price get their IDs updated.
     * Only needed when canvas data contains hardcoded price references
     * (e.g., orderBumpPriceId on checkout elements).
     */
    sourceId?: string
    /** Whether this price is active */
    active: boolean
    /** Features included with this price */
    features: Array<{
      /** Feature display name */
      name: string
      /** Optional description */
      description: string | null
      /** Display order */
      order: number
    }>
  }>
}

// ============================================================================
// FEATURE SNAPSHOT MAP — Discriminated union mapping category to snapshot type
// ============================================================================

/**
 * Maps each TemplateCategory to its corresponding snapshot interface.
 * Used by the service layer to ensure type-safe snapshot creation/installation.
 */
export interface FeatureSnapshotMap {
  WEBSITE: WebsiteSnapshot
  EMAIL: EmailSnapshot
  AUTOMATION: AutomationSnapshot
  FORM: FormSnapshot
  CONTRACT: ContractSnapshot
  PIPELINE: PipelineSnapshot
  BOOKING: BookingSnapshot
  CHAT_WIDGET: ChatWidgetSnapshot
  CMS_SCHEMA: CmsSchemaSnapshot
  PRODUCT: ProductSnapshot
  /** Blueprints are multi-item templates — the snapshot is the parent template's metadata */
  BLUEPRINT: Record<string, unknown>
}

/** Union of all possible snapshot types — useful for generic handlers */
export type AnyFeatureSnapshot = FeatureSnapshotMap[keyof FeatureSnapshotMap]

// ============================================================================
// DEPENDENCY TYPES — For dependency detection and resolution
// ============================================================================

/** A single detected dependency of a feature */
export interface DetectedDependency {
  featureType: TemplateCategory
  featureId: string
  featureName: string
  /** Why this dependency exists (e.g., "Referenced in page canvas element") */
  reason: string
  /** Nested dependencies of this dependency */
  children: DetectedDependency[]
}

/** Full dependency tree for a feature */
export interface DependencyTree {
  root: {
    featureType: TemplateCategory
    featureId: string
    featureName: string
  }
  dependencies: DetectedDependency[]
  /** Total count of all dependencies (flattened) */
  totalCount: number
}

/** User's choice for how to handle dependencies */
export type DependencyChoice = 'bundle_all' | 'skip_all' | 'choose'

/** Selected dependencies when user picks "choose" */
export interface DependencySelection {
  choice: DependencyChoice
  /** Only populated when choice === 'choose' */
  selectedIds: string[]
}

// ============================================================================
// INSTALL TYPES — For template installation
// ============================================================================

/** Maps old IDs (from snapshot) to new IDs (created during install) */
export type IdRemapTable = Record<string, string>

/** Result of installing a single template item */
export interface InstallItemResult {
  /** The TemplateItem ID that was installed */
  templateItemId: string
  featureType: TemplateCategory
  sourceId: string
  /** Newly created feature ID in the target org (empty string if failed) */
  newId: string
  featureName: string
  /** Whether this was a new creation or reuse of existing */
  action: 'created' | 'reused'
  success: boolean
  error?: string
}

/** Result of the full template installation */
export interface InstallResult {
  /** The TemplateInstall record ID created during installation */
  installId: string
  templateId: string
  templateName: string
  items: InstallItemResult[]
  idMapping: IdRemapTable
  success: boolean
  /** Number of items successfully installed */
  installedCount: number
  /** Number of items that failed */
  failedCount: number
}

// ============================================================================
// LIBRARY UI TYPES — For browsing and displaying templates
// ============================================================================

/**
 * Compact template representation for grid/list views.
 * Date fields accept both Date and string since tRPC serializes
 * Date objects to ISO strings when sending over the wire.
 */
export interface TemplateListItem {
  id: string
  name: string
  description: string | null
  category: TemplateCategory
  status: TemplateStatus
  thumbnailUrl: string | null
  tags: string[]
  installCount: number
  organizationId: string
  organizationName: string
  createdAt: Date | string
  updatedAt: Date | string
  /** Number of items in this template */
  itemCount: number
  /** Price in cents — null or 0 means free */
  price: number | null
  /** Rejection reason — set by portal admin on reject, cleared on re-publish */
  rejectionReason: string | null
}

/** Full template detail with items for preview */
export interface TemplateDetail extends TemplateListItem {
  version: number
  items: TemplateDetailItem[]
}

/** Individual item within a template detail view */
export interface TemplateDetailItem {
  id: string
  featureType: TemplateCategory
  sourceName: string
  dependsOn: string[]
  order: number
}

/** Filters for browsing the template library */
export interface TemplateLibraryFilters {
  category: TemplateCategory | 'all'
  search: string
  sortBy: 'newest' | 'popular' | 'name'
  page: number
  pageSize: number
}

/** Sort options for the library grid */
export type TemplateSortOption = TemplateLibraryFilters['sortBy']

// ============================================================================
// CATEGORY METADATA TYPE — For displaying categories in UI
// ============================================================================

/** Display metadata for a template category */
export interface TemplateCategoryMeta {
  label: string
  description: string
  icon: LucideIcon
}

// ============================================================================
// ORIGIN CHECK TYPES — For anti-plagiarism system
// ============================================================================

/**
 * Result of checking if a feature was installed from a template.
 * Used to show "Installed from [Template Name]" badges in the UI
 * and to prevent duplicate installations.
 *
 * SOURCE OF TRUTH: OriginCheckResult, TemplateOriginCheck
 */
export interface OriginCheckResult {
  /** Whether this feature was installed from a template */
  isFromTemplate: boolean
  /** Template ID if installed from a template */
  templateId?: string
  /** Template name for display */
  templateName?: string
  /** Install record ID for tracing back to the install event */
  installId?: string
  /** Origin hash for lineage verification */
  originHash?: string
}
