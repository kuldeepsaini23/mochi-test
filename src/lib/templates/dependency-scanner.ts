/**
 * ============================================================================
 * TEMPLATE SYSTEM — DEPENDENCY SCANNER
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: DependencyScanner, DetectDependencies,
 * TemplateDependency, FeatureDependencyTree, CanvasElementScanner,
 * AutomationDependencyScanner, WebsiteDependencyScanner
 *
 * WHY: Features can reference other features (e.g., a website page may contain
 * a form element, a payment element referencing a product, an add-to-cart button
 * referencing a product, a SmartCMS list referencing a CMS table, or a component
 * instance with CMS bindings). Automations can trigger on form submissions,
 * payment completions, pipeline ticket moves, or appointment schedules, and their
 * action nodes can send emails, create pipeline tickets, or wait for calendar events.
 *
 * When bundling a feature into a template, we detect ALL cross-feature references
 * so the user can choose which dependencies to include. NO feature can ever float
 * without its referenced features being detected.
 *
 * COMPREHENSIVE DEPENDENCY MAP:
 * | Feature      | Can Reference                                                          |
 * |-------------|------------------------------------------------------------------------|
 * | Website     | Forms, Products, CMS tables, Booking calendars (via canvas elements)   |
 * |             | + LocalComponent sourceTrees are recursively scanned for the same       |
 * | Automation  | Forms, Products, Emails, Pipelines, Booking calendars                  |
 * |             | (via trigger config + action node config)                              |
 * | Others      | None (leaf nodes — no outgoing dependencies)                           |
 *
 * CANVAS ELEMENT → DEPENDENCY MAPPING (type strings from types.ts):
 * | Element Type (type string)  | Property Path              | Dependency Type |
 * |----------------------------|---------------------------|-----------------|
 * | 'form'                     | formId                    | FORM            |
 * | 'payment'                  | productId                 | PRODUCT         |
 * | 'add-to-cart-button'       | standaloneProductId       | PRODUCT         |
 * | 'smartcms-list'            | cmsTableId                | CMS_SCHEMA      |
 * | 'component'                | cmsBindings.*.tableId     | CMS_SCHEMA      |
 *
 * WEBSITE-LEVEL DEPENDENCIES (on the Website model itself, NOT canvas elements):
 * | Property             | Dependency Type |
 * |---------------------|-----------------|
 * | chatWidgetId         | CHAT_WIDGET     |
 *
 * AUTOMATION → DEPENDENCY MAPPING:
 * | Source              | Property Path               | Dependency Type |
 * |--------------------|-----------------------------|-----------------|
 * | Trigger config     | config.formId               | FORM            |
 * | Trigger config     | config.productId            | PRODUCT         |
 * | Trigger config     | config.priceId (→ product)  | PRODUCT         |
 * | Trigger config     | config.pipelineId           | PIPELINE        |
 * | Trigger config     | config.calendarId           | BOOKING         |
 * | Action node config | config.emailTemplateId      | EMAIL           |
 * | Action node config | config.formId               | FORM            |
 * | Action node config | config.pipelineId           | PIPELINE        |
 * | Action node config | config.calendarId           | BOOKING         |
 *
 * CIRCULAR REFERENCE PROTECTION: A `visited` set tracks `featureType:featureId`
 * strings to prevent infinite recursion in case of circular dependencies.
 */

import { prisma } from '@/lib/config'
import type {
  TemplateCategory,
  DetectedDependency,
  DependencyTree,
} from './types'
import { TEMPLATE_CATEGORY_META } from './constants'

// ============================================================================
// SHARED TYPE for extracted references
// ============================================================================

/** A single cross-feature reference found during scanning */
interface ExtractedRef {
  featureType: TemplateCategory
  featureId: string
  reason: string
}

// ============================================================================
// MAIN DETECTION ENTRY POINT
// ============================================================================

/**
 * Detects all cross-feature dependencies for a given feature.
 * Recursively scans referenced features for their own dependencies.
 *
 * @param orgId - Organization ID for scoped queries
 * @param featureType - The category of the root feature
 * @param featureId - The database ID of the root feature
 * @param visited - Set of already-visited keys to prevent cycles (internal)
 * @returns Complete dependency tree with nested children
 */
export async function detectDependencies(
  orgId: string,
  featureType: TemplateCategory,
  featureId: string,
  visited: Set<string> = new Set()
): Promise<DependencyTree> {
  /** Build the root node info */
  const rootName = await getFeatureName(orgId, featureType, featureId)

  const root = {
    featureType,
    featureId,
    featureName: rootName ?? 'Unknown',
  }

  /** Mark root as visited to prevent self-referencing cycles */
  const visitKey = `${featureType}:${featureId}`
  visited.add(visitKey)

  /** Run the per-type scanner to find direct dependencies */
  const directDeps = await scanFeatureDependencies(
    orgId,
    featureType,
    featureId
  )

  /** Recursively scan each dependency for its own dependencies */
  const dependencies: DetectedDependency[] = []

  for (const dep of directDeps) {
    const depKey = `${dep.featureType}:${dep.featureId}`

    /** Skip already-visited to prevent circular reference loops */
    if (visited.has(depKey)) continue
    visited.add(depKey)

    /** Recurse into this dependency to find nested deps */
    const childTree = await detectDependencies(
      orgId,
      dep.featureType,
      dep.featureId,
      visited
    )

    dependencies.push({
      ...dep,
      children: childTree.dependencies,
    })
  }

  /** Count total dependencies (flatten the tree) */
  const totalCount = countDependencies(dependencies)

  return { root, dependencies, totalCount }
}

// ============================================================================
// PER-TYPE SCANNERS
// ============================================================================

/**
 * Routes to the correct scanner based on feature type.
 * Only WEBSITE and AUTOMATION have outgoing dependencies — all others return [].
 */
async function scanFeatureDependencies(
  orgId: string,
  featureType: TemplateCategory,
  featureId: string
): Promise<Omit<DetectedDependency, 'children'>[]> {
  switch (featureType) {
    case 'WEBSITE':
      return detectWebsiteDependencies(orgId, featureId)
    case 'AUTOMATION':
      return detectAutomationDependencies(orgId, featureId)
    default:
      /** All other feature types are leaf nodes — no outgoing references */
      return []
  }
}

// ============================================================================
// WEBSITE DEPENDENCY SCANNER
// ============================================================================

/**
 * Scans a website's pages (canvasData) AND its LocalComponent sourceTrees
 * for cross-feature references.
 *
 * Detects:
 * - Website.chatWidgetId → CHAT_WIDGET dependency (website-level property)
 * - page.cmsTableId → CMS_SCHEMA dependency (dynamic pages)
 * - 'form' elements → FORM dependency (element.formId)
 * - 'payment' elements → PRODUCT dependency (element.productId)
 * - 'add-to-cart-button' elements → PRODUCT dependency (element.standaloneProductId)
 * - 'smartcms-list' elements → CMS_SCHEMA dependency (element.cmsTableId)
 * - 'component' elements → CMS_SCHEMA dependency (element.cmsBindings.*.tableId)
 * - LocalComponent sourceTrees → recursively scanned for ALL of the above
 *
 * NOTE: LocalComponents and internal page references (link targetPageId,
 * button action.pageId) are NOT separate dependencies — they are bundled
 * with the website snapshot itself.
 */
async function detectWebsiteDependencies(
  orgId: string,
  websiteId: string
): Promise<Omit<DetectedDependency, 'children'>[]> {
  const deps: Omit<DetectedDependency, 'children'>[] = []
  const seen = new Set<string>()

  /**
   * Helper: deduplicate and push a reference to the deps array.
   * Returns true if the ref was new, false if already seen.
   */
  const addRef = async (ref: ExtractedRef): Promise<boolean> => {
    const key = `${ref.featureType}:${ref.featureId}`
    if (seen.has(key)) return false
    seen.add(key)

    const name = await getFeatureName(orgId, ref.featureType, ref.featureId)
    deps.push({
      featureType: ref.featureType,
      featureId: ref.featureId,
      featureName: name ?? TEMPLATE_CATEGORY_META[ref.featureType].label,
      reason: ref.reason,
    })
    return true
  }

  /**
   * Check website-level properties for external feature references.
   * chatWidgetId is stored on the Website model itself, NOT as a canvas element.
   */
  const website = await prisma.website.findFirst({
    where: { id: websiteId, organizationId: orgId },
    select: { chatWidgetId: true },
  })

  if (website?.chatWidgetId) {
    await addRef({
      featureType: 'CHAT_WIDGET',
      featureId: website.chatWidgetId,
      reason: 'Website has a linked chat widget',
    })
  }

  /** Fetch all pages for this website with their canvas data */
  const pages = await prisma.page.findMany({
    where: { websiteId, organizationId: orgId, deletedAt: null },
    select: { canvasData: true, cmsTableId: true, name: true },
  })

  for (const page of pages) {
    /** Check if page references a CMS table directly (dynamic page) */
    if (page.cmsTableId) {
      await addRef({
        featureType: 'CMS_SCHEMA',
        featureId: page.cmsTableId,
        reason: `Dynamic page "${page.name}" uses this CMS table`,
      })
    }

    /** Scan canvas data elements for cross-feature references */
    if (page.canvasData && typeof page.canvasData === 'object') {
      const canvasRefs = extractElementReferences(
        page.canvasData as Record<string, unknown>,
        'canvas'
      )

      for (const ref of canvasRefs) {
        await addRef(ref)
      }
    }
  }

  /**
   * Fetch all LocalComponents for this website and scan their sourceTrees.
   * Components can contain forms, payment buttons, add-to-cart buttons,
   * SmartCMS lists, and even nested component instances — all of which
   * may reference external features.
   */
  const localComponents = await prisma.localComponent.findMany({
    where: { websiteId },
    select: { sourceTree: true, name: true },
  })

  for (const comp of localComponents) {
    if (comp.sourceTree && typeof comp.sourceTree === 'object') {
      const sourceTree = comp.sourceTree as Record<string, unknown>
      const componentRefs = extractSourceTreeReferences(
        sourceTree,
        comp.name
      )

      for (const ref of componentRefs) {
        await addRef(ref)
      }
    }
  }

  return deps
}

// ============================================================================
// CANVAS / SOURCE TREE ELEMENT REFERENCE EXTRACTORS
// ============================================================================

/**
 * Extracts cross-feature references from canvas data JSON.
 *
 * Canvas data structure: { elements: { [id]: element }, rootIds: [...] }
 * Elements have a `type` field and props that may contain feature references.
 *
 * Scans for (type strings match CanvasElement discriminated union in types.ts):
 * - 'form' → formId (FORM)
 * - 'payment' → productId (PRODUCT)
 * - 'add-to-cart-button' → standaloneProductId (PRODUCT)
 * - 'smartcms-list' → cmsTableId (CMS_SCHEMA)
 * - 'component' → cmsBindings.*.tableId (CMS_SCHEMA)
 */
function extractElementReferences(
  canvasData: Record<string, unknown>,
  source: string
): ExtractedRef[] {
  const refs: ExtractedRef[] = []

  /** Walk through all elements in the canvas data */
  const elements =
    (canvasData.elements as Record<string, Record<string, unknown>>) ?? {}

  for (const element of Object.values(elements)) {
    if (!element || typeof element !== 'object') continue

    const elType = element.type as string | undefined
    const props = (element.props ?? element) as Record<string, unknown>

    extractRefsFromElement(elType, props, source, refs)
  }

  return refs
}

/**
 * Extracts cross-feature references from a LocalComponent's sourceTree.
 *
 * SourceTree structure: {
 *   rootElement: CanvasElement,
 *   childElements: CanvasElement[],
 *   childrenMap: Record<string, string[]>
 * }
 *
 * The childElements array is FLAT — all descendant elements are listed
 * directly, so we just iterate through rootElement + childElements.
 */
function extractSourceTreeReferences(
  sourceTree: Record<string, unknown>,
  componentName: string
): ExtractedRef[] {
  const refs: ExtractedRef[] = []
  const source = `component "${componentName}"`

  /** Collect all elements: root + children */
  const elementsToScan: Record<string, unknown>[] = []

  /** Add root element */
  if (sourceTree.rootElement && typeof sourceTree.rootElement === 'object') {
    elementsToScan.push(sourceTree.rootElement as Record<string, unknown>)
  }

  /** Add all child elements from the flat array */
  if (Array.isArray(sourceTree.childElements)) {
    for (const child of sourceTree.childElements) {
      if (child && typeof child === 'object') {
        elementsToScan.push(child as Record<string, unknown>)
      }
    }
  }

  /** Scan each element for cross-feature references */
  for (const element of elementsToScan) {
    const elType = element.type as string | undefined
    const props = (element.props ?? element) as Record<string, unknown>

    extractRefsFromElement(elType, props, source, refs)
  }

  return refs
}

/**
 * Core extraction logic shared between canvas elements and sourceTree elements.
 * Checks a single element's type and props for cross-feature references.
 *
 * This is the SINGLE SOURCE OF TRUTH for which element properties map to
 * which dependency types. Any new element type that references an external
 * feature must be added here.
 */
function extractRefsFromElement(
  elType: string | undefined,
  props: Record<string, unknown>,
  source: string,
  refs: ExtractedRef[]
): void {
  /** Form elements reference a form by ID */
  if (elType === 'form' && typeof props.formId === 'string' && props.formId) {
    refs.push({
      featureType: 'FORM',
      featureId: props.formId,
      reason: `Form element in ${source}`,
    })
  }

  /**
   * Payment elements reference a product by productId.
   * priceId also exists but belongs to the product — the product is the dependency.
   */
  if (
    elType === 'payment' &&
    typeof props.productId === 'string' &&
    props.productId
  ) {
    refs.push({
      featureType: 'PRODUCT',
      featureId: props.productId,
      reason: `Payment element in ${source}`,
    })
  }

  /**
   * Add-to-cart button elements (type: 'add-to-cart-button') use standaloneProductId.
   * CRITICAL: The type string is 'add-to-cart-button' NOT 'add-to-cart'.
   * The standaloneProductId stores the database Product ID for standalone mode
   * (when the button is NOT inside a SmartCMS list context).
   */
  if (
    elType === 'add-to-cart-button' &&
    typeof props.standaloneProductId === 'string' &&
    props.standaloneProductId
  ) {
    refs.push({
      featureType: 'PRODUCT',
      featureId: props.standaloneProductId,
      reason: `Add-to-cart button in ${source}`,
    })
  }

  /** SmartCMS List elements reference a CMS table */
  if (
    elType === 'smartcms-list' &&
    typeof props.cmsTableId === 'string' &&
    props.cmsTableId
  ) {
    refs.push({
      featureType: 'CMS_SCHEMA',
      featureId: props.cmsTableId,
      reason: `SmartCMS List in ${source}`,
    })
  }

  /**
   * Component Instance elements (type: 'component') can have CMS bindings
   * that reference CMS tables. cmsBindings is Record<string, { tableId, fieldId }>.
   * CRITICAL: The type string is 'component' NOT 'component-instance'.
   */
  if (elType === 'component' && props.cmsBindings) {
    const bindings = props.cmsBindings as Record<string, unknown>
    const seenTableIds = new Set<string>()

    for (const binding of Object.values(bindings)) {
      if (!binding || typeof binding !== 'object') continue
      const tableId = (binding as Record<string, unknown>).tableId
      if (typeof tableId === 'string' && tableId && !seenTableIds.has(tableId)) {
        seenTableIds.add(tableId)
        refs.push({
          featureType: 'CMS_SCHEMA',
          featureId: tableId,
          reason: `Component instance CMS binding in ${source}`,
        })
      }
    }
  }
}

// ============================================================================
// AUTOMATION DEPENDENCY SCANNER
// ============================================================================

/**
 * Scans an automation's trigger config and schema (React Flow) action nodes
 * for cross-feature references.
 *
 * TRIGGER CONFIG references:
 * - formId → FORM (FORM_SUBMITTED trigger)
 * - productId → PRODUCT (PAYMENT_COMPLETED trigger)
 * - priceId → PRODUCT (PAYMENT_COMPLETED trigger — looks up parent product)
 * - pipelineId → PIPELINE (PIPELINE_TICKET_MOVED trigger)
 * - calendarId → BOOKING (APPOINTMENT_SCHEDULED / APPOINTMENT_STARTED triggers)
 *
 * ACTION NODE references (in node.data.config):
 * - emailTemplateId → EMAIL (send_email action)
 * - formId → FORM (form-related action nodes)
 * - pipelineId → PIPELINE (create_pipeline_ticket, update_pipeline_ticket actions)
 * - calendarId → BOOKING (wait_for_event action with eventType=appointment_started)
 */
async function detectAutomationDependencies(
  orgId: string,
  automationId: string
): Promise<Omit<DetectedDependency, 'children'>[]> {
  const deps: Omit<DetectedDependency, 'children'>[] = []
  const seen = new Set<string>()

  /**
   * Helper: deduplicate and push a dependency.
   * Returns true if the dep was new, false if already seen.
   */
  const addDep = async (
    featureType: TemplateCategory,
    featureId: string,
    reason: string
  ): Promise<boolean> => {
    const key = `${featureType}:${featureId}`
    if (seen.has(key)) return false
    seen.add(key)

    const name = await getFeatureName(orgId, featureType, featureId)
    deps.push({
      featureType,
      featureId,
      featureName: name ?? featureType,
      reason,
    })
    return true
  }

  const automation = await prisma.automation.findFirst({
    where: { id: automationId, organizationId: orgId },
    select: { triggerConfig: true, schema: true },
  })

  if (!automation) return deps

  // --------------------------------------------------------------------------
  // SCAN TRIGGER CONFIG
  // --------------------------------------------------------------------------

  if (automation.triggerConfig && typeof automation.triggerConfig === 'object') {
    const config = automation.triggerConfig as Record<string, unknown>

    /** FORM_SUBMITTED trigger → formId */
    if (typeof config.formId === 'string' && config.formId) {
      await addDep('FORM', config.formId, 'Automation trigger references this form')
    }

    /** PAYMENT_COMPLETED trigger → productId */
    if (typeof config.productId === 'string' && config.productId) {
      await addDep('PRODUCT', config.productId, 'Automation trigger references this product')
    }

    /**
     * PAYMENT_COMPLETED trigger → priceId.
     * priceId is more specific than productId — it belongs to a product.
     * We look up the parent product and add THAT as the dependency,
     * since the entire product (with all prices) gets bundled.
     */
    if (typeof config.priceId === 'string' && config.priceId) {
      const price = await prisma.productPrice.findFirst({
        where: { id: config.priceId },
        select: { productId: true },
      })
      if (price?.productId) {
        await addDep('PRODUCT', price.productId, 'Automation trigger references a price from this product')
      }
    }

    /** PIPELINE_TICKET_MOVED trigger → pipelineId */
    if (typeof config.pipelineId === 'string' && config.pipelineId) {
      await addDep('PIPELINE', config.pipelineId, 'Automation trigger references this pipeline')
    }

    /** APPOINTMENT_SCHEDULED / APPOINTMENT_STARTED trigger → calendarId */
    if (typeof config.calendarId === 'string' && config.calendarId) {
      await addDep('BOOKING', config.calendarId, 'Automation trigger references this booking calendar')
    }
  }

  // --------------------------------------------------------------------------
  // SCAN ACTION NODES (React Flow schema)
  // --------------------------------------------------------------------------

  if (automation.schema && typeof automation.schema === 'object') {
    const schema = automation.schema as Record<string, unknown>
    const nodes = (schema.nodes ?? []) as Array<Record<string, unknown>>

    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue

      const data = (node.data ?? {}) as Record<string, unknown>
      /**
       * Action configs are stored in node.data.config for action nodes.
       * The trigger node stores its config directly in node.data (already scanned above).
       * We check both data-level and config-level properties to be thorough.
       */
      const config = (data.config ?? {}) as Record<string, unknown>

      /** send_email action → emailTemplateId */
      if (typeof config.emailTemplateId === 'string' && config.emailTemplateId) {
        await addDep('EMAIL', config.emailTemplateId, 'Automation action sends this email template')
      }
      /** Also check data-level for backward compatibility */
      if (typeof data.emailTemplateId === 'string' && data.emailTemplateId) {
        await addDep('EMAIL', data.emailTemplateId, 'Automation action sends this email template')
      }

      /** Form-related action nodes → formId */
      if (typeof config.formId === 'string' && config.formId) {
        await addDep('FORM', config.formId, 'Automation action references this form')
      }
      if (typeof data.formId === 'string' && data.formId) {
        await addDep('FORM', data.formId, 'Automation action references this form')
      }

      /**
       * create_pipeline_ticket / update_pipeline_ticket actions → pipelineId.
       * Lanes (stageId, toStageId) are part of the pipeline — the pipeline itself
       * is the dependency. Lanes are included in the pipeline snapshot.
       */
      if (typeof config.pipelineId === 'string' && config.pipelineId) {
        await addDep('PIPELINE', config.pipelineId, 'Automation action references this pipeline')
      }
      if (typeof data.pipelineId === 'string' && data.pipelineId) {
        await addDep('PIPELINE', data.pipelineId, 'Automation action references this pipeline')
      }

      /**
       * wait_for_event action → calendarId (when eventType is appointment_started).
       * The booking calendar is the dependency.
       */
      if (typeof config.calendarId === 'string' && config.calendarId) {
        await addDep('BOOKING', config.calendarId, 'Automation action waits for this booking calendar event')
      }
      if (typeof data.calendarId === 'string' && data.calendarId) {
        await addDep('BOOKING', data.calendarId, 'Automation action waits for this booking calendar event')
      }

      /**
       * Action nodes that reference products (future-proofing).
       * Currently no action directly references a product, but we check anyway
       * in case new action types are added.
       */
      if (typeof config.productId === 'string' && config.productId) {
        await addDep('PRODUCT', config.productId, 'Automation action references this product')
      }
      if (typeof data.productId === 'string' && data.productId) {
        await addDep('PRODUCT', data.productId, 'Automation action references this product')
      }
    }
  }

  return deps
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Fetches the display name for a feature by its type and ID.
 * Returns null if the feature is not found.
 */
async function getFeatureName(
  orgId: string,
  featureType: TemplateCategory,
  featureId: string
): Promise<string | null> {
  switch (featureType) {
    case 'WEBSITE': {
      const w = await prisma.website.findFirst({
        where: { id: featureId, organizationId: orgId },
        select: { name: true },
      })
      return w?.name ?? null
    }
    case 'EMAIL': {
      const e = await prisma.emailTemplate.findFirst({
        where: { id: featureId, organizationId: orgId },
        select: { name: true },
      })
      return e?.name ?? null
    }
    case 'AUTOMATION': {
      const a = await prisma.automation.findFirst({
        where: { id: featureId, organizationId: orgId },
        select: { name: true },
      })
      return a?.name ?? null
    }
    case 'FORM': {
      const f = await prisma.form.findFirst({
        where: { id: featureId, organizationId: orgId },
        select: { name: true },
      })
      return f?.name ?? null
    }
    case 'CONTRACT': {
      const c = await prisma.contract.findFirst({
        where: { id: featureId, organizationId: orgId },
        select: { name: true },
      })
      return c?.name ?? null
    }
    case 'PIPELINE': {
      const p = await prisma.pipeline.findFirst({
        where: { id: featureId, organizationId: orgId },
        select: { name: true },
      })
      return p?.name ?? null
    }
    case 'BOOKING': {
      const b = await prisma.bookingCalendar.findFirst({
        where: { id: featureId, organizationId: orgId },
        select: { name: true },
      })
      return b?.name ?? null
    }
    case 'CHAT_WIDGET': {
      const cw = await prisma.chatWidget.findFirst({
        where: { id: featureId, organizationId: orgId },
        select: { name: true },
      })
      return cw?.name ?? null
    }
    case 'CMS_SCHEMA': {
      const t = await prisma.cmsTable.findFirst({
        where: { id: featureId, organizationId: orgId },
        select: { name: true },
      })
      return t?.name ?? null
    }
    case 'PRODUCT': {
      const pr = await prisma.product.findFirst({
        where: { id: featureId, organizationId: orgId },
        select: { name: true },
      })
      return pr?.name ?? null
    }
    default:
      return null
  }
}

/**
 * Recursively counts all dependencies in a tree.
 */
function countDependencies(deps: DetectedDependency[]): number {
  let count = deps.length
  for (const dep of deps) {
    count += countDependencies(dep.children)
  }
  return count
}
