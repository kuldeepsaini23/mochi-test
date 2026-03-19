/**
 * ============================================================================
 * COMPONENT UTILITIES - Operations for Local Components
 * ============================================================================
 *
 * This file contains all utility functions for working with Local Components:
 *
 * 1. CREATION: Converting a frame to a component
 * 2. INSTANTIATION: Creating instances from component definitions
 * 3. RENDERING: Applying prop values to component elements
 * 4. PROP MANAGEMENT: Exposing and managing component props
 * 5. UPDATES: Propagating component changes to instances
 *
 * ============================================================================
 * KEY CONCEPTS
 * ============================================================================
 *
 * - LocalComponent: The definition/template (stored in website's component library)
 * - ComponentInstanceElement: An instance on the canvas (references a LocalComponent)
 * - ExposedProp: A property that can be customized per instance
 * - PropValues: The actual values set on an instance for exposed props
 *
 * ============================================================================
 * NON-EDITABLE CHILDREN
 * ============================================================================
 *
 * Component instances have NON-EDITABLE children. This is enforced by:
 * 1. Not storing children in the instance's canvas state
 * 2. Rendering children from the component definition (sourceTree)
 * 3. Blocking selection/editing of child elements within instances
 *
 * To edit a component's structure, users must enter "Edit Component" mode
 * which modifies the LocalComponent definition itself.
 *
 * ============================================================================
 */

import type {
  CanvasElement,
  LocalComponent,
  ComponentInstanceElement,
  ExposedProp,
  FrameElement,
  GradientConfig,
} from './types'
import { setValueByPath, getValueByPath } from './property-registry'
import { generateElementId } from './canvas-slice'

// ============================================================================
// DEEP CLONING UTILITY
// ============================================================================

/**
 * Deep clone an element to ensure all nested objects (styles, etc.) are copied.
 * This is CRITICAL for component creation - we must preserve ALL styles and properties.
 *
 * Uses JSON parse/stringify which is safe for our serializable element structures.
 * This ensures styles, responsiveStyles, responsiveSettings, and all nested
 * properties are fully independent copies.
 */
function deepCloneElement<T extends CanvasElement>(element: T): T {
  return JSON.parse(JSON.stringify(element)) as T
}

// ============================================================================
// ID GENERATION
// ============================================================================

/**
 * Generate a unique component ID.
 * Format: 'comp_[timestamp]_[random]'
 */
export function generateComponentId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 10)
  return `comp_${timestamp}_${random}`
}

/**
 * Generate a unique exposed prop ID.
 * Format: 'prop_[timestamp]_[random]'
 */
export function generatePropId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 10)
  return `prop_${timestamp}_${random}`
}

// NOTE: generateElementId is imported from canvas-slice.ts (SOURCE OF TRUTH)
// to ensure consistent ID generation across the codebase.

// ============================================================================
// COMPONENT CREATION
// ============================================================================

/**
 * Options for converting a frame to a component.
 */
export interface ConvertToComponentOptions {
  /** The frame element to convert */
  frameElement: FrameElement

  /** All elements in the canvas (for finding children) */
  elements: Record<string, CanvasElement>

  /** Children map for O(1) children lookup */
  childrenMap: Record<string, string[]>

  /** Name for the new component */
  name: string

  /** Description for the component */
  description?: string

  /** Tags for categorization */
  tags?: string[]

  /** Website ID the component belongs to */
  websiteId: string
}

/**
 * Result of converting a frame to a component.
 *
 * IMPORTANT: The master frame is NOT converted to a ComponentInstanceElement.
 * It stays as a regular FrameElement with `masterOfComponentId` set.
 * This allows the master to remain fully editable on the canvas.
 *
 * Children are NOT absorbed - they stay on the canvas as real elements.
 * Changes to the master frame and its children sync to the component's sourceTree.
 */
export interface ConvertToComponentResult {
  /** The newly created LocalComponent definition */
  component: LocalComponent

  /**
   * Updates to apply to the original frame element.
   * This adds the `masterOfComponentId` property to link the frame to the component.
   * The frame stays as type: 'frame' - it's NOT converted to a component instance.
   */
  frameUpdates: {
    masterOfComponentId: string
    name: string
  }
}

/**
 * Convert a frame element and its children into a LocalComponent.
 *
 * ============================================================================
 * MASTER COMPONENT APPROACH
 * ============================================================================
 *
 * The master frame is NOT converted to a ComponentInstanceElement.
 * Instead, it remains a regular FrameElement with these key differences:
 *
 * 1. The frame gets a `masterOfComponentId` property linking it to the component
 * 2. All children STAY on the canvas as real, editable elements
 * 3. The sourceTree is a snapshot that instances will reference
 * 4. Changes to the master frame/children sync to sourceTree via auto-save
 *
 * This approach allows the master to be fully editable like any other frame,
 * while instances (dragged from sidebar) render from sourceTree.
 *
 * ============================================================================
 * WHAT THIS FUNCTION RETURNS
 * ============================================================================
 *
 * - component: The LocalComponent definition to save to Redux/database
 * - frameUpdates: Properties to add to the original frame (masterOfComponentId)
 *
 * The caller is responsible for:
 * 1. Creating the component in database/Redux
 * 2. Updating the frame with frameUpdates
 */
export function convertFrameToComponent(
  options: ConvertToComponentOptions
): ConvertToComponentResult {
  const {
    frameElement,
    elements,
    childrenMap,
    name,
    description = '',
    tags = [],
    websiteId,
  } = options

  const now = Date.now()
  const componentId = generateComponentId()

  // Collect all descendant elements recursively for the sourceTree snapshot
  const descendantIds = collectDescendantIds(frameElement.id, childrenMap)
  const childElements = descendantIds
    .map((id) => elements[id])
    .filter((el): el is CanvasElement => el !== undefined)

  // Build the children map for the component's source tree
  const sourceChildrenMap: Record<string, string[]> = {}
  for (const element of [frameElement, ...childElements]) {
    const children = childrenMap[element.id] || []
    if (children.length > 0) {
      sourceChildrenMap[element.id] = [...children]
    }
  }

  // Create the LocalComponent definition
  // CRITICAL: Use deepCloneElement to preserve ALL styles and nested properties
  // This creates a snapshot of the current state - the master remains editable
  const component: LocalComponent = {
    id: componentId,
    name,
    description,
    tags,
    websiteId,
    createdAt: now,
    updatedAt: now,
    sourceTree: {
      rootElement: deepCloneElement(frameElement),
      childElements: childElements.map((el) => deepCloneElement(el)),
      childrenMap: sourceChildrenMap,
    },
    exposedProps: [],
    instanceIds: [], // No instances yet - master is NOT an instance
    /**
     * PRIMARY INSTANCE ID - Points to the master frame on the canvas.
     *
     * This is the ID of the FrameElement that serves as the master source.
     * Unlike before, this frame stays as type: 'frame' (not 'component').
     *
     * The master frame:
     * - Is fully editable (select, drag, resize, style changes)
     * - Has real canvas children (not rendered from sourceTree)
     * - Changes sync to sourceTree via the master component auto-save
     */
    primaryInstanceId: frameElement.id,
  }

  return {
    component,
    // These updates are applied to the original frame to mark it as a master
    frameUpdates: {
      masterOfComponentId: componentId,
      name: name,
    },
  }
}

/**
 * Recursively collect all descendant element IDs.
 */
export function collectDescendantIds(
  parentId: string,
  childrenMap: Record<string, string[]>
): string[] {
  const result: string[] = []
  const directChildren = childrenMap[parentId] || []

  for (const childId of directChildren) {
    result.push(childId)
    result.push(...collectDescendantIds(childId, childrenMap))
  }

  return result
}

// ============================================================================
// COMPONENT INSTANTIATION
// ============================================================================

/**
 * Options for creating a component instance.
 */
export interface CreateInstanceOptions {
  /** The component to instantiate */
  component: LocalComponent

  /** Position for the new instance */
  x: number
  y: number

  /** Parent element ID (null = root) */
  parentId: string | null

  /** Order among siblings */
  order: number

  /** Initial prop values (optional) */
  propValues?: Record<string, unknown>
}

/**
 * Create a new ComponentInstanceElement from a LocalComponent.
 *
 * This creates a fresh instance that can be placed on the canvas.
 * The instance will render using the component's sourceTree.
 */
export function createComponentInstance(
  options: CreateInstanceOptions
): ComponentInstanceElement {
  const { component, x, y, parentId, order, propValues = {} } = options

  const { rootElement } = component.sourceTree

  // Get container value safely (not all element types have container property)
  const containerValue =
    'container' in rootElement ? rootElement.container : false

  const instance: ComponentInstanceElement = {
    id: generateElementId(),
    type: 'component',
    name: component.name,
    x,
    y,
    width: rootElement.width,
    height: rootElement.height,
    parentId,
    order,
    visible: true,
    locked: false,
    container: containerValue,
    styles: { ...rootElement.styles },
    componentId: component.id,
    propValues: { ...propValues },
  }

  return instance
}

// ============================================================================
// RENDERING WITH PROP VALUES
// ============================================================================

/**
 * Apply prop values to component elements for rendering.
 *
 * This takes the component's sourceTree elements and applies the instance's
 * propValues to create the final elements for rendering.
 *
 * Returns cloned elements with prop values applied - does NOT modify originals.
 */
export function applyPropValuesToElements(
  component: LocalComponent,
  propValues: Record<string, unknown>
): {
  rootElement: CanvasElement
  childElements: CanvasElement[]
} {
  const { exposedProps, sourceTree } = component

  // Create a map of exposed props by element ID for quick lookup
  const propsByElement: Record<string, ExposedProp[]> = {}
  for (const prop of exposedProps) {
    if (!propsByElement[prop.elementId]) {
      propsByElement[prop.elementId] = []
    }
    propsByElement[prop.elementId].push(prop)
  }

  // Clone and apply props to root element
  const rootElement = cloneAndApplyProps(
    sourceTree.rootElement,
    propsByElement[sourceTree.rootElement.id] || [],
    propValues
  )

  // Clone and apply props to all child elements
  const childElements = sourceTree.childElements.map((element) =>
    cloneAndApplyProps(
      element,
      propsByElement[element.id] || [],
      propValues
    )
  )

  return { rootElement, childElements }
}

/**
 * Clone an element and apply exposed prop values.
 *
 * ============================================================================
 * SPECIAL HANDLING: backgroundColor with Gradient Support
 * ============================================================================
 *
 * When a backgroundColor prop has a combined format { color, gradient }, we
 * need to split it into two separate properties:
 * - styles.backgroundColor: the solid color string
 * - styles.__backgroundGradient: the gradient config
 *
 * This is the reverse of what expose-as-prop-section.tsx does when capturing
 * the default value. The combined format is what GradientControl expects,
 * but the element stores these as separate properties.
 */
function cloneAndApplyProps(
  element: CanvasElement,
  props: ExposedProp[],
  propValues: Record<string, unknown>
): CanvasElement {
  // Deep clone the element - JSON parse/stringify is safe here as elements are serializable
  let cloned = JSON.parse(JSON.stringify(element)) as CanvasElement

  // Apply each exposed prop's value
  for (const prop of props) {
    // Get the value (from propValues or default)
    const value =
      propValues[prop.id] !== undefined ? propValues[prop.id] : prop.defaultValue

    // ========================================================================
    // BACKGROUND COLOR: Split combined { color, gradient } format
    // ========================================================================
    // If this is a backgroundColor property and the value is an object with
    // color/gradient keys, split it into the two separate style properties.
    if (prop.propertyPath === 'styles.backgroundColor') {
      const isColorGradientObject = (
        typeof value === 'object' &&
        value !== null &&
        'color' in value
      )

      if (isColorGradientObject) {
        const colorValue = value as { color: string; gradient?: GradientConfig }

        // Apply the solid color to backgroundColor
        cloned = setValueByPath(
          cloned as unknown as Record<string, unknown>,
          'styles.backgroundColor',
          colorValue.color
        ) as unknown as CanvasElement

        // Apply the gradient config to __backgroundGradient
        cloned = setValueByPath(
          cloned as unknown as Record<string, unknown>,
          'styles.__backgroundGradient',
          colorValue.gradient
        ) as unknown as CanvasElement

        // Skip the normal setValueByPath below since we handled it specially
        continue
      }
    }

    /**
     * Coerce the CMS value to match the element property's expected type.
     * This handles mismatches between CMS column types (e.g. GALLERY stores string[])
     * and element properties (e.g. image src expects string, carousel expects {id,src,alt}[]).
     */
    const coercedValue = coerceCmsValueForProperty(cloned, prop.propertyPath, value)

    // Apply the coerced value to the element using type assertion
    cloned = setValueByPath(
      cloned as unknown as Record<string, unknown>,
      prop.propertyPath,
      coercedValue
    ) as unknown as CanvasElement
  }

  return cloned
}

// ============================================================================
// CMS VALUE COERCION - Smart type conversion for CMS → element property mapping
// ============================================================================

/**
 * Coerces a CMS column value to match the element property's expected type.
 *
 * This handles type mismatches that arise when CMS columns are bound to element
 * properties with different shapes. Key cases:
 *
 * 1. GALLERY (string[]) → single image prop (string): Uses first image as fallback
 * 2. GALLERY (string[]) → carousel images (Array<{id,src,alt}>): Converts URLs to objects
 * 3. IMAGE_URL (string) → carousel images (Array<{id,src,alt}>): Wraps as single-item array
 * 4. Any value → boolean prop: Empty string/0/null/falsy → false, non-empty/truthy → true
 *    This enables binding visibility to text fields like "trial_days" or "billing" —
 *    blank values hide the element, non-empty values show it.
 *
 * SOURCE OF TRUTH KEYWORDS: coerceCmsValueForProperty, gallery-to-image-fallback, CmsBooleanCoercion
 */
function coerceCmsValueForProperty(
  element: CanvasElement,
  propertyPath: string,
  value: unknown
): unknown {
  if (value === null || value === undefined) return value

  // Read the existing property value to determine what type the element expects
  const existingValue = getValueByPath(
    element as unknown as Record<string, unknown>,
    propertyPath
  )

  // ----- Case 1: Incoming value is a string array (GALLERY column) -----
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
    const urls = value as string[]

    // Target expects a single string (e.g. image element's "src" property)
    // → Use the first image from the gallery as a smart fallback
    if (typeof existingValue === 'string' || existingValue === '' || existingValue === undefined) {
      // Only fallback if the property path looks like a content/src property, not an array property
      if (!Array.isArray(existingValue)) {
        return urls[0]
      }
    }

    // Target expects an array of image objects (e.g. carousel "images" property)
    // → Convert each URL string to the { id, src, alt } format the carousel needs
    if (Array.isArray(existingValue)) {
      const firstItem = existingValue[0]
      const isImageObjectArray = (
        firstItem &&
        typeof firstItem === 'object' &&
        firstItem !== null &&
        'src' in firstItem
      )
      // If existing is an empty array or has {src} objects, convert the string URLs
      if (existingValue.length === 0 || isImageObjectArray) {
        return urls.map((url, i) => ({
          id: `cms_gallery_${i}`,
          src: url,
          alt: '',
        }))
      }
    }

    return value
  }

  // ----- Case 2: Incoming value is a single string (IMAGE_URL column) -----
  if (typeof value === 'string' && Array.isArray(existingValue)) {
    const firstItem = existingValue[0]
    const isImageObjectArray = (
      firstItem &&
      typeof firstItem === 'object' &&
      firstItem !== null &&
      'src' in firstItem
    )
    // Target expects an image object array → wrap the single URL as a one-item array
    if (existingValue.length === 0 || isImageObjectArray) {
      return [{ id: 'cms_single_0', src: value, alt: '' }]
    }
  }

  // ----- Case 3: Target expects a boolean (visibility, toggle props, etc.) -----
  // Coerce any CMS value to boolean so text fields can control element visibility.
  // Example: binding "visible" to "trial_days" — blank ("") hides, "7 days" shows.
  //
  // SOURCE OF TRUTH: CmsBooleanCoercion, TextToBooleanBinding
  if (typeof existingValue === 'boolean') {
    if (typeof value === 'string') {
      /** Empty string → false (hide), any non-empty text → true (show) */
      return value.length > 0
    }
    if (typeof value === 'number') {
      /** 0 → false, any non-zero number → true */
      return value !== 0
    }
    /** Fall through for already-boolean values or other types */
    return Boolean(value)
  }

  return value
}

// ============================================================================
// PROP MANAGEMENT
// ============================================================================

/**
 * Options for exposing a property as a component prop.
 */
export interface ExposePropertyOptions {
  /** The component to add the prop to */
  component: LocalComponent

  /** Human-readable name for the prop */
  name: string

  /** Description/help text */
  description?: string

  /** The element ID within the component */
  elementId: string

  /** The property ID from PROPERTY_REGISTRY */
  propertyId: string

  /** The property path (e.g., 'content', 'styles.backgroundColor') */
  propertyPath: string
}

/**
 * Expose a property of a child element as a component prop.
 *
 * This allows the property to be customized per instance.
 * Returns the updated component with the new exposed prop.
 */
export function exposeProperty(
  options: ExposePropertyOptions
): LocalComponent {
  const {
    component,
    name,
    description = '',
    elementId,
    propertyId,
    propertyPath,
  } = options

  // Find the element in the source tree to get the default value
  const element =
    component.sourceTree.rootElement.id === elementId
      ? component.sourceTree.rootElement
      : component.sourceTree.childElements.find((e) => e.id === elementId)

  if (!element) {
    throw new Error(`Element ${elementId} not found in component ${component.id}`)
  }

  // Get the current value as the default - cast to unknown first then to Record
  const defaultValue = getValueByPath(
    element as unknown as Record<string, unknown>,
    propertyPath
  )

  // Create the exposed prop
  const exposedProp: ExposedProp = {
    id: generatePropId(),
    name,
    description,
    elementId,
    propertyId,
    propertyPath,
    defaultValue,
  }

  // Return updated component with new prop
  return {
    ...component,
    exposedProps: [...component.exposedProps, exposedProp],
    updatedAt: Date.now(),
  }
}

/**
 * Remove an exposed property from a component.
 */
export function unexposeProperty(
  component: LocalComponent,
  propId: string
): LocalComponent {
  return {
    ...component,
    exposedProps: component.exposedProps.filter((p) => p.id !== propId),
    updatedAt: Date.now(),
  }
}

/**
 * Update an exposed property's configuration.
 */
export function updateExposedProp(
  component: LocalComponent,
  propId: string,
  updates: Partial<Omit<ExposedProp, 'id'>>
): LocalComponent {
  return {
    ...component,
    exposedProps: component.exposedProps.map((p) =>
      p.id === propId ? { ...p, ...updates } : p
    ),
    updatedAt: Date.now(),
  }
}

// ============================================================================
// COMPONENT UPDATES
// ============================================================================

/**
 * Update a component's source tree element.
 *
 * This is called when editing a component in "Edit Component" mode.
 * The changes should propagate to all instances (they'll re-render automatically).
 */
export function updateComponentElement(
  component: LocalComponent,
  elementId: string,
  updates: Partial<CanvasElement>
): LocalComponent {
  const { sourceTree } = component

  // Check if updating root element
  if (sourceTree.rootElement.id === elementId) {
    return {
      ...component,
      sourceTree: {
        ...sourceTree,
        rootElement: { ...sourceTree.rootElement, ...updates } as CanvasElement,
      },
      updatedAt: Date.now(),
    }
  }

  // Update child element
  return {
    ...component,
    sourceTree: {
      ...sourceTree,
      childElements: sourceTree.childElements.map((el) =>
        el.id === elementId ? ({ ...el, ...updates } as CanvasElement) : el
      ),
    },
    updatedAt: Date.now(),
  }
}

/**
 * Add a new element to a component's source tree.
 */
export function addElementToComponent(
  component: LocalComponent,
  element: CanvasElement,
  parentId: string
): LocalComponent {
  const { sourceTree } = component

  // Update children map
  const newChildrenMap = { ...sourceTree.childrenMap }
  if (!newChildrenMap[parentId]) {
    newChildrenMap[parentId] = []
  }
  newChildrenMap[parentId] = [...newChildrenMap[parentId], element.id]

  return {
    ...component,
    sourceTree: {
      ...sourceTree,
      childElements: [...sourceTree.childElements, element],
      childrenMap: newChildrenMap,
    },
    updatedAt: Date.now(),
  }
}

/**
 * Remove an element from a component's source tree.
 */
export function removeElementFromComponent(
  component: LocalComponent,
  elementId: string
): LocalComponent {
  const { sourceTree } = component

  // Can't remove root element
  if (sourceTree.rootElement.id === elementId) {
    throw new Error('Cannot remove root element from component')
  }

  // Find the element to get its parent
  const element = sourceTree.childElements.find((e) => e.id === elementId)
  if (!element) {
    throw new Error(`Element ${elementId} not found in component`)
  }

  // Collect all descendant IDs to remove
  const descendantIds = collectDescendantIds(elementId, sourceTree.childrenMap)
  const idsToRemove = new Set([elementId, ...descendantIds])

  // Remove from children map
  const newChildrenMap: Record<string, string[]> = {}
  for (const [parentId, childIds] of Object.entries(sourceTree.childrenMap)) {
    if (idsToRemove.has(parentId)) continue // Skip removed parents
    const filteredChildren = childIds.filter((id) => !idsToRemove.has(id))
    if (filteredChildren.length > 0) {
      newChildrenMap[parentId] = filteredChildren
    }
  }

  return {
    ...component,
    sourceTree: {
      ...sourceTree,
      childElements: sourceTree.childElements.filter((e) => !idsToRemove.has(e.id)),
      childrenMap: newChildrenMap,
    },
    updatedAt: Date.now(),
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Check if an element can be converted to a component.
 *
 * Rules:
 * 1. Must be a frame element (not page, text, image, button, prebuilt, etc.)
 * 2. Must not already be a component instance
 * 3. Must not be inside a component instance (parent chain check)
 */
export function canConvertToComponent(
  element: CanvasElement,
  elements: Record<string, CanvasElement>
): { canConvert: boolean; reason?: string } {
  // Must not be a page (check first since page is a root element)
  if (element.type === 'page') {
    return {
      canConvert: false,
      reason: 'Pages cannot be converted to components',
    }
  }

  // Must be a frame - only frames can be converted
  if (element.type !== 'frame') {
    return {
      canConvert: false,
      reason: 'Only frames can be converted to components',
    }
  }

  // Check parent chain for component instances
  let currentId = element.parentId
  while (currentId) {
    const parent = elements[currentId]
    if (!parent) break

    if (parent.type === 'component') {
      return {
        canConvert: false,
        reason: 'Cannot convert an element inside a component to a new component',
      }
    }

    currentId = parent.parentId
  }

  return { canConvert: true }
}

/**
 * Check if a component instance can be "detached" (converted back to a frame).
 */
export function canDetachComponent(
  _instance: ComponentInstanceElement
): { canDetach: boolean; reason?: string } {
  // Component instances can always be detached
  // The detached frame becomes editable again
  return { canDetach: true }
}

// ============================================================================
// DETACHMENT
// ============================================================================

/**
 * Result of detaching a component instance.
 */
export interface DetachComponentResult {
  /** The frame element to replace the instance */
  frameElement: FrameElement

  /** All child elements to add to the canvas */
  childElements: CanvasElement[]

  /** The component ID that was detached from */
  componentId: string
}

/**
 * Detach a component instance back to a regular frame with editable children.
 *
 * This creates copies of the component's sourceTree elements as regular
 * canvas elements. The resulting frame and children are fully editable.
 *
 * ============================================================================
 * CRITICAL: RECURSIVE DETACHMENT OF NESTED COMPONENT INSTANCES
 * ============================================================================
 *
 * When a composed component contains nested component instances (e.g., a carousel
 * containing card instances), we must RECURSIVELY detach those nested instances.
 *
 * Why? Because simply removing `componentId` and `propValues` from a nested
 * component instance leaves it with `type: 'component'` but no valid component
 * reference, causing "Component not found" errors.
 *
 * The solution: When we encounter a child with `type: 'component'`, we recursively
 * call `detachComponentInstance` to fully convert it to a frame with its children.
 *
 * ============================================================================
 * PROPERTIES TO REMOVE
 * ============================================================================
 *
 * - masterOfComponentId: Makes an element appear as a "master component" (purple state)
 * - componentId: Links to a component definition
 * - propValues: Component instance prop values
 * - nestedPropValues: Nested instance prop values (for composed components)
 *
 * Note: The component definition is NOT deleted - other instances may use it.
 *
 * @param instance - The component instance to detach
 * @param component - The component definition
 * @param localComponents - Map of all local components (for recursive detachment)
 */
export function detachComponentInstance(
  instance: ComponentInstanceElement,
  component: LocalComponent,
  localComponents?: Record<string, LocalComponent>
): DetachComponentResult {
  // Apply prop values to get the final elements (with instance overrides applied)
  const { rootElement, childElements } = applyPropValuesToElements(
    component,
    instance.propValues
  )

  // ============================================================================
  // ID MAPPING - Generate new IDs for all elements
  // ============================================================================
  // Create ID mapping (old ID -> new ID) for updating parent references
  const idMap: Record<string, string> = {}
  idMap[rootElement.id] = instance.id // Keep instance ID for the root

  for (const child of childElements) {
    idMap[child.id] = generateElementId()
  }

  // ============================================================================
  // ROOT ELEMENT - Convert to frame, remove component properties
  // ============================================================================
  // Destructure to remove component-related properties from root element
  // These properties would make it still appear as a component/master
  const {
    masterOfComponentId: _masterOfComponentId,
    componentId: _componentId,
    propValues: _propValues,
    nestedPropValues: _nestedPropValues,
    ...cleanRootElement
  } = rootElement as FrameElement & {
    masterOfComponentId?: string
    componentId?: string
    propValues?: Record<string, unknown>
    nestedPropValues?: Record<string, Record<string, unknown>>
  }

  // Create the frame element (replacing the component instance)
  // Use the cleaned root element without component-related properties
  const frameElement: FrameElement = {
    ...cleanRootElement,
    id: instance.id,
    type: 'frame',
    name: instance.name,
    x: instance.x,
    y: instance.y,
    parentId: instance.parentId,
    order: instance.order,
    visible: instance.visible,
    locked: instance.locked,
  }

  // ============================================================================
  // CHILD ELEMENTS - Handle regular elements AND nested component instances
  // ============================================================================
  // Process each child, recursively detaching nested component instances
  const newChildElements: CanvasElement[] = []

  for (const child of childElements) {
    // ========================================================================
    // NESTED COMPONENT INSTANCE - Recursively detach
    // ========================================================================
    // If the child is a component instance, we need to recursively detach it
    // to avoid "Component not found" errors. This converts nested instances
    // to regular frames with their own children.
    if (child.type === 'component' && localComponents) {
      const nestedInstance = child as ComponentInstanceElement
      const nestedComponent = localComponents[nestedInstance.componentId]

      if (nestedComponent) {
        // Get prop values for this nested instance from the parent's nestedPropValues
        // This ensures we detach with the correct customized values
        const nestedPropValues = instance.nestedPropValues?.[child.id] ?? {}
        const mergedPropValues = {
          ...(nestedInstance.propValues ?? {}),
          ...nestedPropValues,
        }

        // Create a temporary instance with merged prop values for detachment
        const tempInstance: ComponentInstanceElement = {
          ...nestedInstance,
          propValues: mergedPropValues,
        }

        // Recursively detach the nested component
        const nestedResult = detachComponentInstance(
          tempInstance,
          nestedComponent,
          localComponents
        )

        // Add the detached frame with updated IDs and parent reference
        const detachedFrame: FrameElement = {
          ...nestedResult.frameElement,
          id: idMap[child.id],
          parentId: child.parentId ? idMap[child.parentId] : null,
        }
        newChildElements.push(detachedFrame)

        // Add all nested children with updated parent references
        // The nested children need their parentIds remapped to point to the new detached frame
        for (const nestedChild of nestedResult.childElements) {
          // If the nested child's parent was the nested root, point to our new detached frame
          const updatedParentId =
            nestedChild.parentId === nestedResult.frameElement.id
              ? idMap[child.id]
              : nestedChild.parentId

          newChildElements.push({
            ...nestedChild,
            parentId: updatedParentId,
          })
        }

        continue // Skip normal child processing
      }
    }

    // ========================================================================
    // REGULAR ELEMENT - Clean and add with updated IDs
    // ========================================================================
    // Remove any component-related properties from regular children
    const {
      masterOfComponentId: _childMaster,
      componentId: _childComponentId,
      propValues: _childPropValues,
      nestedPropValues: _childNestedPropValues,
      ...cleanChild
    } = child as CanvasElement & {
      masterOfComponentId?: string
      componentId?: string
      propValues?: Record<string, unknown>
      nestedPropValues?: Record<string, Record<string, unknown>>
    }

    newChildElements.push({
      ...cleanChild,
      id: idMap[child.id],
      parentId: child.parentId ? idMap[child.parentId] : null,
    } as CanvasElement)
  }

  return {
    frameElement,
    childElements: newChildElements,
    componentId: component.id,
  }
}

// ============================================================================
// INSTANCE TRACKING
// ============================================================================

/**
 * Register an instance with a component.
 */
export function registerInstance(
  component: LocalComponent,
  instanceId: string
): LocalComponent {
  if (component.instanceIds.includes(instanceId)) {
    return component // Already registered
  }

  return {
    ...component,
    instanceIds: [...component.instanceIds, instanceId],
    updatedAt: Date.now(),
  }
}

/**
 * Unregister an instance from a component.
 */
export function unregisterInstance(
  component: LocalComponent,
  instanceId: string
): LocalComponent {
  return {
    ...component,
    instanceIds: component.instanceIds.filter((id) => id !== instanceId),
    updatedAt: Date.now(),
  }
}

/**
 * Get all instances of a component from the canvas.
 */
export function getComponentInstances(
  component: LocalComponent,
  elements: Record<string, CanvasElement>
): ComponentInstanceElement[] {
  return component.instanceIds
    .map((id) => elements[id])
    .filter(
      (el): el is ComponentInstanceElement =>
        el !== undefined && el.type === 'component'
    )
}
