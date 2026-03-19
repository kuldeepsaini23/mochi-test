/**
 * ============================================================================
 * PROPERTY REGISTRY - Single Source of Truth for Element Properties
 * ============================================================================
 *
 * This file defines ALL properties available for each element type.
 * It serves as the foundation for:
 *
 * 1. PROPERTIES PANEL - Dynamically render the correct controls for any element
 * 2. LOCAL COMPONENTS - Know which properties can be exposed as component props
 * 3. CMS INTEGRATION - Map CMS fields to element properties
 * 4. VALIDATION - Ensure property values match expected types
 * 5. AI AGENTS - Provide context about available properties for each element
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * Each property has:
 * - `id`: Unique identifier matching the property path (e.g., 'styles.padding')
 * - `label`: Human-readable name for UI
 * - `type`: Input control type (string, number, boolean, select, color, etc.)
 * - `tab`: Which panel tab (design vs settings)
 * - `category`: Grouping within the tab (layout, spacing, background, etc.)
 * - `path`: Dot-notation path to the value on the element
 * - `exposable`: Whether this can be exposed as a component prop
 * - `showWhen`: Conditional visibility based on other property values
 * - `options`: For select types, the available choices
 * - `defaultValue`: Default value when creating new elements
 *
 * ============================================================================
 * PROPERTY TYPES (PropertyValueType)
 * ============================================================================
 *
 * - 'string': Text input
 * - 'number': Numeric input (optional min/max)
 * - 'boolean': Toggle switch
 * - 'select': Dropdown with options
 * - 'color': GradientControl - supports BOTH solid colors AND gradients (single source of truth)
 * - 'spacing': 4-value spacing control (padding/margin)
 * - 'corners': 4-value border radius control
 * - 'image': Image URL with upload capability
 * - 'group': Container for related properties (nested structure)
 *
 * ============================================================================
 * WHY THIS REGISTRY EXISTS
 * ============================================================================
 *
 * Without this registry:
 * - Properties panel has hardcoded knowledge of each element type
 * - Adding new element types requires updating multiple files
 * - Component props system would need separate property definitions
 * - CMS integration would duplicate property definitions
 * - No single source of truth for property metadata
 *
 * With this registry:
 * - Properties panel can render controls dynamically from registry
 * - New element types just add entries to the registry
 * - Component system references registry for exposable properties
 * - CMS system uses registry for type-safe field mapping
 * - Single source of truth for all property metadata
 *
 * ============================================================================
 */

import type { ElementType } from './types'

// ============================================================================
// PROPERTY VALUE TYPES - All possible input control types
// ============================================================================

/**
 * The type of input control used to edit a property.
 *
 * Each type maps to a specific UI control in the properties panel:
 * - string: TextInput
 * - number: NumberInput with optional stepper
 * - boolean: Toggle/Switch
 * - select: Dropdown/Combobox
 * - color: ColorPicker with alpha support
 * - spacing: SpacingControl (4-value linked/unlinked)
 * - corners: CornersControl (4-value linked/unlinked)
 * - image: ImagePicker with URL input and upload
 * - group: Collapsible section containing child properties
 */
export type PropertyValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'color'  // Uses GradientControl - supports both solid colors AND gradients
  | 'spacing'
  | 'corners'
  | 'image'
  | 'video'  // Uses VideoSourceControl - supports storage (HLS) and Loom embed
  | 'group'

/**
 * Which panel tab this property appears in.
 *
 * - design: Visual/CSS properties (appearance, layout, spacing)
 * - settings: Behavioral/content properties (content, actions, options)
 */
export type PropertyTab = 'design' | 'settings'

// ============================================================================
// PROPERTY SCHEMA - Definition of a single property
// ============================================================================

/**
 * Condition for when a property should be visible.
 *
 * Used to create dynamic UIs where some properties only appear
 * when other properties have specific values.
 *
 * Example: Action URL only shows when action type is 'link'
 */
export interface PropertyShowCondition {
  /** The property ID to check */
  property: string

  /** The comparison operator */
  operator: 'equals' | 'notEquals' | 'exists' | 'notExists' | 'in'

  /** The value to compare against (not needed for exists/notExists, array for 'in') */
  value?: unknown
}

/**
 * Option for select-type properties.
 */
export interface PropertyOption {
  /** The actual value stored in the element */
  value: string

  /** Human-readable label shown in UI */
  label: string

  /** Optional icon to show next to the label */
  icon?: string
}

/**
 * Complete definition of a single property.
 *
 * This schema contains everything needed to:
 * 1. Render the correct input control
 * 2. Validate property values
 * 3. Map the value to/from the element
 * 4. Determine if it can be exposed as a component prop
 * 5. Show/hide based on other property values
 */
export interface PropertySchema {
  /**
   * Unique identifier for this property.
   *
   * Convention: Use the property path (e.g., 'styles.padding')
   * For nested group properties: Use dot notation (e.g., 'action.type')
   */
  id: string

  /**
   * Human-readable label shown in the properties panel.
   */
  label: string

  /**
   * The type of input control to render.
   */
  type: PropertyValueType

  /**
   * Which panel tab this property appears in.
   */
  tab: PropertyTab

  /**
   * Category/section grouping within the tab.
   *
   * Common categories:
   * - content: Text, images, labels
   * - layout: Direction, alignment, gap
   * - spacing: Padding, margin
   * - background: Colors, images
   * - border: Radius, stroke
   * - typography: Font, size, weight
   * - options: Visibility, locking
   * - interaction: Actions, links
   */
  category: string

  /**
   * Dot-notation path to where this value is stored on the element.
   *
   * Examples:
   * - 'visible' -> element.visible
   * - 'styles.padding' -> element.styles.padding
   * - 'content' -> element.content (for text elements)
   * - 'action.type' -> element.action.type
   */
  path: string

  /**
   * Whether this property can be exposed as a component prop.
   *
   * TRUE: Users can expose this property when creating components
   *       CMS fields can be mapped to this property
   *
   * FALSE: Property is not exposable (e.g., internal state, IDs)
   *
   * Some properties shouldn't be exposed:
   * - popupId: References page-specific data
   * - locked: Editor-only state
   * - order: Internal positioning
   */
  exposable: boolean

  /**
   * Default value for new elements.
   * Type should match the property's value type.
   */
  defaultValue?: unknown

  /**
   * For 'select' type: Available options to choose from.
   */
  options?: PropertyOption[]

  /**
   * Conditional visibility based on another property's value.
   *
   * Example: Show 'href' only when 'action.type' equals 'link'
   */
  showWhen?: PropertyShowCondition

  /**
   * For 'group' type: Child properties nested within this group.
   */
  children?: PropertySchema[]

  /**
   * For 'number' type: Minimum allowed value.
   */
  min?: number

  /**
   * For 'number' type: Maximum allowed value.
   */
  max?: number

  /**
   * For 'number' type: Step increment for stepper controls.
   */
  step?: number

  /**
   * For 'string' type: Placeholder text shown when empty.
   */
  placeholder?: string

  /**
   * Optional help text shown as a tooltip or description.
   */
  description?: string

  /**
   * Whether this property supports responsive overrides.
   *
   * TRUE: Property can have different values for desktop/mobile
   * FALSE: Property is the same on all breakpoints
   */
  responsive?: boolean

  /**
   * Whether this property is hidden from the PropertyRenderer UI.
   *
   * TRUE: Property exists in the registry but is NOT rendered as a control.
   *       Used for properties that are managed programmatically by custom
   *       settings sections (e.g., standalone product fields set via a
   *       product picker UI, not individual input fields).
   *
   * FALSE/undefined: Property is rendered normally in the properties panel.
   */
  hidden?: boolean

  /**
   * Whether the AI (Mochi AI chat) can set this property via style props
   * in ```ui-spec output. When TRUE, three things happen automatically:
   *
   * 1. The AI PROMPT documents this property so the AI knows it exists
   * 2. The spec-to-canvas CONVERTER extracts this prop from AI output
   * 3. The value gets applied to the element's styles on the canvas
   *
   * Set this to true for visual properties the AI should control
   * (colors, spacing, typography, layout). Leave false/undefined for
   * properties that are internal, require user interaction (image upload),
   * or reference external entities (formId, productId).
   *
   * SOURCE OF TRUTH KEYWORDS: AIControllable, AIControllableProperty
   */
  aiControllable?: boolean

  /**
   * Short AI-facing description of this property's purpose and expected format.
   * Used to generate the AI prompt documentation. Should be concise and include
   * example values so the AI outputs correct formats.
   *
   * Examples:
   * - "hex color e.g. '#1a1a2e', '#ffffff', or 'transparent'"
   * - "inner spacing in px, e.g. 48 for hero, 32 for standard, 24 for cards"
   * - "'left' | 'center' | 'right'"
   *
   * Only meaningful when aiControllable is true.
   *
   * SOURCE OF TRUTH KEYWORDS: AIHint, AIPropertyHint
   */
  aiHint?: string
}

// ============================================================================
// ELEMENT SCHEMA - All properties for an element type
// ============================================================================

/**
 * Complete property schema for an element type.
 *
 * Contains all properties that can be configured for this element type,
 * organized for efficient lookup and iteration.
 */
export interface ElementSchema {
  /** The element type this schema applies to */
  type: ElementType

  /** All properties available for this element type */
  properties: PropertySchema[]
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all properties for an element type.
 */
export function getPropertiesForType(type: ElementType): PropertySchema[] {
  const schema = PROPERTY_REGISTRY[type]
  return schema?.properties ?? []
}

/**
 * Get properties filtered by tab.
 */
export function getPropertiesByTab(
  type: ElementType,
  tab: PropertyTab
): PropertySchema[] {
  return getPropertiesForType(type).filter((p) => p.tab === tab)
}

/**
 * Get properties filtered by category.
 */
export function getPropertiesByCategory(
  type: ElementType,
  category: string
): PropertySchema[] {
  return getPropertiesForType(type).filter((p) => p.category === category)
}

/**
 * Get all unique categories for an element type and tab.
 */
export function getCategoriesForTab(
  type: ElementType,
  tab: PropertyTab
): string[] {
  const properties = getPropertiesByTab(type, tab)
  const categories = new Set(properties.map((p) => p.category))
  return Array.from(categories)
}

/**
 * Get only exposable properties (for component props).
 */
export function getExposableProperties(type: ElementType): PropertySchema[] {
  return getPropertiesForType(type).filter((p) => p.exposable)
}

/**
 * Find a specific property by ID.
 */
export function getPropertyById(
  type: ElementType,
  propertyId: string
): PropertySchema | undefined {
  const properties = getPropertiesForType(type)

  // Check top-level properties
  const direct = properties.find((p) => p.id === propertyId)
  if (direct) return direct

  // Check nested properties in groups
  for (const prop of properties) {
    if (prop.type === 'group' && prop.children) {
      const nested = prop.children.find((c) => c.id === propertyId)
      if (nested) return nested
    }
  }

  return undefined
}

/**
 * Check if a property should be visible based on showWhen condition.
 */
export function isPropertyVisible(
  property: PropertySchema,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  element: Record<string, any>
): boolean {
  if (!property.showWhen) return true

  const { property: targetProp, operator, value } = property.showWhen

  // Get the target property value from the element
  const targetValue = getValueByPath(element, targetProp)

  switch (operator) {
    case 'equals':
      return targetValue === value
    case 'notEquals':
      return targetValue !== value
    case 'exists':
      return targetValue !== undefined && targetValue !== null
    case 'notExists':
      return targetValue === undefined || targetValue === null
    case 'in':
      // Check if targetValue is in the array of allowed values
      return Array.isArray(value) && value.includes(targetValue)
    default:
      return true
  }
}

/**
 * Get a value from an object by dot-notation path.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getValueByPath(obj: Record<string, any>, path: string): any {
  const parts = path.split('.')
  let current = obj

  for (const part of parts) {
    if (current === undefined || current === null) return undefined
    current = current[part]
  }

  return current
}

/**
 * Set a value on an object by dot-notation path.
 * Returns a new object with the value set (immutable).
 */
export function setValueByPath<T extends Record<string, unknown>>(
  obj: T,
  path: string,
  value: unknown
): T {
  const parts = path.split('.')
  const result = { ...obj }

  if (parts.length === 1) {
    // Direct property
    ;(result as Record<string, unknown>)[parts[0]] = value
    return result
  }

  // Nested property - need to clone intermediate objects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = result
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    current[part] = { ...current[part] }
    current = current[part]
  }

  current[parts[parts.length - 1]] = value
  return result
}

// ============================================================================
// PROPERTY REGISTRY - Source of truth for all element properties
// ============================================================================

/**
 * The complete property registry for all element types.
 *
 * ============================================================================
 * STRUCTURE
 * ============================================================================
 *
 * Each element type has an array of PropertySchema entries.
 * Properties are organized by tab (design/settings) and category.
 *
 * ============================================================================
 * EXTENDING
 * ============================================================================
 *
 * To add properties for a new element type:
 * 1. Add the type to ElementType in types.ts
 * 2. Add a new entry here with all applicable properties
 * 3. The properties panel will automatically pick them up
 *
 * ============================================================================
 */
export const PROPERTY_REGISTRY: Partial<Record<ElementType, ElementSchema>> = {
  // ============================================================================
  // FRAME PROPERTIES
  // ============================================================================
  frame: {
    type: 'frame',
    properties: [
      // ----------------------
      // SETTINGS TAB
      // ----------------------

      // Options Category
      {
        id: 'visible',
        label: 'Visible',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'visible',
        defaultValue: true,
        exposable: true,
        responsive: true,
        description: 'Whether the element is visible on the page',
      },
      {
        id: 'locked',
        label: 'Locked',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'locked',
        defaultValue: false,
        exposable: false, // Editor-only state
        description: 'Prevent editing and selection',
      },

      // Layout Category
      {
        id: 'container',
        label: 'Container',
        type: 'boolean',
        tab: 'settings',
        category: 'layout',
        path: 'container',
        defaultValue: false,
        exposable: true,
        description: 'Constrain children in a centered max-width container',
      },
      {
        id: 'autoWidth',
        label: 'Auto Width',
        type: 'boolean',
        tab: 'settings',
        category: 'layout',
        path: 'autoWidth',
        defaultValue: false,
        exposable: true,
        responsive: true,
        description: 'Use 100% width instead of fixed pixel width',
      },
      {
        id: 'responsive',
        label: 'Responsive',
        type: 'boolean',
        tab: 'settings',
        category: 'layout',
        path: 'responsive',
        defaultValue: false,
        exposable: false, // Layout behavior, not content
        description:
          'Stack children vertically on mobile (container query based)',
      },
      {
        id: 'sticky',
        label: 'Sticky',
        type: 'boolean',
        tab: 'settings',
        category: 'layout',
        path: 'sticky',
        defaultValue: false,
        exposable: false, // Behavior, not content
        description: 'Stick to viewport edge when scrolling',
      },
      {
        id: 'stickyPosition',
        label: 'Sticky Position',
        type: 'select',
        tab: 'settings',
        category: 'layout',
        path: 'stickyPosition',
        defaultValue: 'top',
        exposable: false,
        options: [
          { value: 'top', label: 'Top' },
          { value: 'bottom', label: 'Bottom' },
          { value: 'left', label: 'Left' },
          { value: 'right', label: 'Right' },
        ],
        showWhen: { property: 'sticky', operator: 'equals', value: true },
        description: 'Which edge to stick to',
      },

      // ----------------------
      // DESIGN TAB
      // ----------------------

      // Dimensions Category
      {
        id: 'width',
        label: 'Width',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'width',
        defaultValue: 300,
        min: 1,
        exposable: true,
        responsive: true,
        showWhen: { property: 'autoWidth', operator: 'notEquals', value: true },
      },
      {
        id: 'height',
        label: 'Height',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'height',
        defaultValue: 200,
        min: 1,
        exposable: true,
        responsive: true,
      },

      // Layout Category
      {
        id: 'styles.flexDirection',
        label: 'Direction',
        type: 'select',
        tab: 'design',
        category: 'layout',
        path: 'styles.flexDirection',
        defaultValue: 'column',
        exposable: true,
        responsive: true,
        options: [
          { value: 'column', label: 'Vertical' },
          { value: 'row', label: 'Horizontal' },
        ],
        aiControllable: true,
        aiHint: "'column' (vertical) or 'row' (horizontal)",
      },
      {
        id: 'styles.justifyContent',
        label: 'Justify',
        type: 'select',
        tab: 'design',
        category: 'layout',
        path: 'styles.justifyContent',
        defaultValue: 'flex-start',
        exposable: true,
        responsive: true,
        options: [
          { value: 'flex-start', label: 'Start' },
          { value: 'center', label: 'Center' },
          { value: 'flex-end', label: 'End' },
          { value: 'space-between', label: 'Space Between' },
          { value: 'space-around', label: 'Space Around' },
          { value: 'space-evenly', label: 'Space Evenly' },
        ],
        aiControllable: true,
        aiHint: "'flex-start' | 'center' | 'flex-end' | 'space-between'",
      },
      {
        id: 'styles.alignItems',
        label: 'Align',
        type: 'select',
        tab: 'design',
        category: 'layout',
        path: 'styles.alignItems',
        defaultValue: 'stretch',
        exposable: true,
        responsive: true,
        options: [
          { value: 'stretch', label: 'Stretch' },
          { value: 'flex-start', label: 'Start' },
          { value: 'center', label: 'Center' },
          { value: 'flex-end', label: 'End' },
        ],
        aiControllable: true,
        aiHint: "'center' | 'flex-start' | 'flex-end' | 'stretch'",
      },
      {
        id: 'styles.gap',
        label: 'Gap',
        type: 'number',
        tab: 'design',
        category: 'layout',
        path: 'styles.gap',
        defaultValue: 0,
        min: 0,
        step: 4,
        exposable: true,
        responsive: true,
        description: 'Space between child elements',
        aiControllable: true,
        aiHint: 'space between children in px, e.g. 16, 24, 32',
      },
      {
        id: 'styles.flexWrap',
        label: 'Wrap',
        type: 'select',
        tab: 'design',
        category: 'layout',
        path: 'styles.flexWrap',
        defaultValue: 'nowrap',
        exposable: true,
        responsive: true,
        options: [
          { value: 'nowrap', label: 'No Wrap' },
          { value: 'wrap', label: 'Wrap' },
        ],
      },

      // Spacing Category
      {
        id: 'styles.padding',
        label: 'Padding',
        type: 'spacing',
        tab: 'design',
        category: 'spacing',
        path: 'styles.padding',
        defaultValue: '0',
        exposable: true,
        responsive: true,
        description: 'Inner spacing',
        aiControllable: true,
        aiHint: 'inner spacing in px, e.g. 48 for hero, 32 for standard, 24 for cards',
      },
      {
        id: 'styles.margin',
        label: 'Margin',
        type: 'spacing',
        tab: 'design',
        category: 'spacing',
        path: 'styles.margin',
        defaultValue: '0',
        exposable: true,
        responsive: true,
        description: 'Outer spacing',
      },

      // Background Category
      {
        id: 'styles.backgroundColor',
        label: 'Background',
        type: 'color',
        tab: 'design',
        category: 'background',
        path: 'styles.backgroundColor',
        defaultValue: 'white',
        exposable: true,
        responsive: true,
        aiControllable: true,
        aiHint: "hex color e.g. '#1a1a2e', '#ffffff', or 'transparent'",
      },
      {
        id: 'styles.backgroundImage',
        label: 'Background Image',
        type: 'image',
        tab: 'design',
        category: 'background',
        path: 'styles.backgroundImage',
        exposable: true,
      },
      {
        id: 'styles.__backgroundFit',
        label: 'Image Fit',
        type: 'select',
        tab: 'design',
        category: 'background',
        path: 'styles.__backgroundFit',
        defaultValue: 'cover',
        exposable: true,
        responsive: true,
        options: [
          { value: 'cover', label: 'Cover' },
          { value: 'contain', label: 'Contain' },
          { value: 'fill', label: 'Fill' },
        ],
        description: 'How the background image fills the frame',
        showWhen: { property: 'styles.__backgroundMode', operator: 'notEquals', value: 'video' },
      },
      {
        id: 'styles.__backgroundVideo',
        label: 'Background Video',
        type: 'video',
        tab: 'design',
        category: 'background',
        path: 'styles.__backgroundVideo',
        exposable: false,
        responsive: false,
        description: 'HLS video that plays behind frame content',
      },
      {
        id: 'styles.__backgroundVideoFit',
        label: 'Video Fit',
        type: 'select',
        tab: 'design',
        category: 'background',
        path: 'styles.__backgroundVideoFit',
        defaultValue: 'cover',
        exposable: false,
        responsive: false,
        options: [
          { value: 'cover', label: 'Cover' },
          { value: 'contain', label: 'Contain' },
        ],
        description: 'How the background video fills the frame',
        showWhen: { property: 'styles.__backgroundMode', operator: 'equals', value: 'video' },
      },
      {
        id: 'styles.__backgroundMode',
        label: 'Background Media Mode',
        type: 'select',
        tab: 'design',
        category: 'background',
        path: 'styles.__backgroundMode',
        exposable: false,
        responsive: false,
        description: 'Active background media type: image or video',
      },

      // Border Category
      {
        id: 'styles.borderRadius',
        label: 'Corners',
        type: 'corners',
        tab: 'design',
        category: 'border',
        path: 'styles.borderRadius',
        defaultValue: '0',
        exposable: true,
        responsive: true,
        aiControllable: true,
        aiHint: 'corner rounding in px, e.g. 12 for cards, 24 for pill-like, 0 for sharp',
      },
      {
        id: 'styles.borderWidth',
        label: 'Border Width',
        type: 'number',
        tab: 'design',
        category: 'border',
        path: 'styles.borderWidth',
        defaultValue: 0,
        min: 0,
        exposable: true,
        responsive: true,
      },
      {
        id: 'styles.borderColor',
        label: 'Border Color',
        type: 'color',
        tab: 'design',
        category: 'border',
        path: 'styles.borderColor',
        defaultValue: '#000000',
        exposable: true,
        responsive: true,
        showWhen: { property: 'styles.borderWidth', operator: 'exists' },
      },
      {
        id: 'styles.borderStyle',
        label: 'Border Style',
        type: 'select',
        tab: 'design',
        category: 'border',
        path: 'styles.borderStyle',
        defaultValue: 'solid',
        exposable: true,
        responsive: true,
        options: [
          { value: 'solid', label: 'Solid' },
          { value: 'dashed', label: 'Dashed' },
          { value: 'dotted', label: 'Dotted' },
        ],
        showWhen: { property: 'styles.borderWidth', operator: 'exists' },
      },

      // Effects Category
      {
        id: 'styles.opacity',
        label: 'Opacity',
        type: 'number',
        tab: 'design',
        category: 'effects',
        path: 'styles.opacity',
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.1,
        exposable: true,
        responsive: true,
      },
      {
        id: 'styles.boxShadow',
        label: 'Shadow',
        type: 'string',
        tab: 'design',
        category: 'effects',
        path: 'styles.boxShadow',
        placeholder: '0 4px 6px rgba(0,0,0,0.1)',
        exposable: true,
        responsive: true,
      },
    ],
  },

  // ============================================================================
  // PAGE PROPERTIES
  // ============================================================================
  page: {
    type: 'page',
    properties: [
      // ----------------------
      // SETTINGS TAB
      // ----------------------
      {
        id: 'container',
        label: 'Container',
        type: 'boolean',
        tab: 'settings',
        category: 'layout',
        path: 'container',
        defaultValue: true,
        exposable: false, // Pages aren't components
        description: 'Constrain content in a centered max-width container',
      },

      // ----------------------
      // DESIGN TAB
      // ----------------------
      {
        id: 'height',
        label: 'Height',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'height',
        defaultValue: 900,
        min: 100,
        exposable: false,
      },
      {
        id: 'styles.backgroundColor',
        label: 'Background',
        type: 'color',
        tab: 'design',
        category: 'background',
        path: 'styles.backgroundColor',
        defaultValue: '#ffffff',
        exposable: false,
      },
      {
        id: 'styles.flexDirection',
        label: 'Direction',
        type: 'select',
        tab: 'design',
        category: 'layout',
        path: 'styles.flexDirection',
        defaultValue: 'column',
        exposable: false,
        options: [
          { value: 'column', label: 'Vertical' },
          { value: 'row', label: 'Horizontal' },
        ],
      },
      {
        id: 'styles.gap',
        label: 'Gap',
        type: 'number',
        tab: 'design',
        category: 'layout',
        path: 'styles.gap',
        defaultValue: 0,
        min: 0,
        exposable: false,
      },
      {
        id: 'styles.padding',
        label: 'Padding',
        type: 'spacing',
        tab: 'design',
        category: 'spacing',
        path: 'styles.padding',
        defaultValue: '0',
        exposable: false,
      },
    ],
  },

  // ============================================================================
  // TEXT PROPERTIES
  // ============================================================================
  text: {
    type: 'text',
    properties: [
      // ----------------------
      // SETTINGS TAB
      // ----------------------
      {
        id: 'content',
        label: 'Text Content',
        type: 'string',
        tab: 'settings',
        category: 'content',
        path: 'content',
        defaultValue: 'Text',
        exposable: true, // CMS can inject text!
        placeholder: 'Enter text...',
        description: 'The text to display',
      },
      {
        id: 'autoWidth',
        label: 'Auto Width',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'autoWidth',
        defaultValue: false,
        exposable: true,
        responsive: true,
        description: 'Fill container width',
      },
      {
        id: 'autoHeight',
        label: 'Auto Height',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'autoHeight',
        defaultValue: true,
        exposable: true,
        responsive: true,
        description: 'Grow to fit content',
      },
      {
        id: 'visible',
        label: 'Visible',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'visible',
        defaultValue: true,
        exposable: true,
        responsive: true,
      },

      // ----------------------
      // DESIGN TAB
      // ----------------------

      // Dimensions Category
      {
        id: 'width',
        label: 'Width',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'width',
        min: 1,
        exposable: true,
        responsive: true,
        showWhen: { property: 'autoWidth', operator: 'notEquals', value: true },
      },
      {
        id: 'height',
        label: 'Height',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'height',
        min: 1,
        exposable: true,
        responsive: true,
        showWhen: {
          property: 'autoHeight',
          operator: 'notEquals',
          value: true,
        },
      },

      // Typography Category
      {
        id: 'styles.fontFamily',
        label: 'Font',
        type: 'string',
        tab: 'design',
        category: 'typography',
        path: 'styles.fontFamily',
        defaultValue: 'Inter',
        exposable: true,
        responsive: true,
      },
      {
        id: 'styles.fontSize',
        label: 'Size',
        type: 'number',
        tab: 'design',
        category: 'typography',
        path: 'styles.fontSize',
        defaultValue: 16,
        min: 1,
        max: 200,
        exposable: true,
        responsive: true,
        aiControllable: true,
        aiHint: 'size in px, e.g. 48 for jumbo hero, 32 for section titles, 16 for body',
      },
      {
        id: 'styles.fontWeight',
        label: 'Weight',
        type: 'select',
        tab: 'design',
        category: 'typography',
        path: 'styles.fontWeight',
        defaultValue: 400,
        exposable: true,
        responsive: true,
        options: [
          { value: '100', label: 'Thin' },
          { value: '200', label: 'Extra Light' },
          { value: '300', label: 'Light' },
          { value: '400', label: 'Regular' },
          { value: '500', label: 'Medium' },
          { value: '600', label: 'Semibold' },
          { value: '700', label: 'Bold' },
          { value: '800', label: 'Extra Bold' },
          { value: '900', label: 'Black' },
        ],
        aiControllable: true,
        aiHint: '400 regular, 500 medium, 600 semibold, 700 bold, 800 extra-bold',
      },
      {
        id: 'styles.lineHeight',
        label: 'Line Height',
        type: 'number',
        tab: 'design',
        category: 'typography',
        path: 'styles.lineHeight',
        defaultValue: 1.5,
        min: 0.5,
        max: 3,
        step: 0.1,
        exposable: true,
        responsive: true,
        aiControllable: true,
        aiHint: 'unitless ratio, e.g. 1.2 for headings, 1.6 for body text',
      },
      {
        id: 'styles.letterSpacing',
        label: 'Letter Spacing',
        type: 'number',
        tab: 'design',
        category: 'typography',
        path: 'styles.letterSpacing',
        defaultValue: 0,
        step: 0.5,
        exposable: true,
        responsive: true,
      },
      {
        id: 'styles.textAlign',
        label: 'Align',
        type: 'select',
        tab: 'design',
        category: 'typography',
        path: 'styles.textAlign',
        defaultValue: 'left',
        exposable: true,
        responsive: true,
        options: [
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Center' },
          { value: 'right', label: 'Right' },
          { value: 'justify', label: 'Justify' },
        ],
        aiControllable: true,
        aiHint: "'left' | 'center' | 'right'",
      },
      {
        id: 'styles.color',
        label: 'Color',
        type: 'color',
        tab: 'design',
        category: 'typography',
        path: 'styles.color',
        defaultValue: 'white',
        exposable: true,
        responsive: true,
        aiControllable: true,
        aiHint: "text color as hex, e.g. '#ffffff' for light on dark, '#111827' for dark",
      },

      // Background Category
      {
        id: 'styles.backgroundColor',
        label: 'Background',
        type: 'color',
        tab: 'design',
        category: 'background',
        path: 'styles.backgroundColor',
        defaultValue: 'transparent',
        exposable: true,
        responsive: true,
      },

      // Spacing Category
      {
        id: 'styles.padding',
        label: 'Padding',
        type: 'spacing',
        tab: 'design',
        category: 'spacing',
        path: 'styles.padding',
        defaultValue: '0',
        exposable: true,
        responsive: true,
      },

      // Border Category
      {
        id: 'styles.borderRadius',
        label: 'Corners',
        type: 'corners',
        tab: 'design',
        category: 'border',
        path: 'styles.borderRadius',
        defaultValue: '0',
        exposable: true,
        responsive: true,
      },
    ],
  },

  // ============================================================================
  // IMAGE PROPERTIES
  // ============================================================================
  image: {
    type: 'image',
    properties: [
      // ----------------------
      // SETTINGS TAB
      // ----------------------
      {
        id: 'src',
        label: 'Image Source',
        type: 'image',
        tab: 'settings',
        category: 'content',
        path: 'src',
        defaultValue: '',
        exposable: true, // CMS can inject images!
        description: 'URL of the image',
      },
      {
        id: 'alt',
        label: 'Alt Text',
        type: 'string',
        tab: 'settings',
        category: 'content',
        path: 'alt',
        defaultValue: '',
        exposable: true, // CMS can inject alt text!
        placeholder: 'Describe the image...',
        description: 'Alternative text for accessibility',
      },
      {
        id: 'objectFit',
        label: 'Fit',
        type: 'select',
        tab: 'settings',
        category: 'display',
        path: 'objectFit',
        defaultValue: 'cover',
        exposable: true,
        responsive: true,
        options: [
          { value: 'cover', label: 'Cover' },
          { value: 'contain', label: 'Contain' },
          { value: 'fill', label: 'Fill' },
        ],
        aiControllable: true,
        aiHint: "'cover' (fill+crop), 'contain' (fit inside), 'fill' (stretch)",
      },
      {
        id: 'autoWidth',
        label: 'Auto Width',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'autoWidth',
        defaultValue: false,
        exposable: true,
        responsive: true,
        description: 'Fill container width',
      },
      {
        id: 'visible',
        label: 'Visible',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'visible',
        defaultValue: true,
        exposable: true,
        responsive: true,
      },

      // ----------------------
      // DESIGN TAB
      // ----------------------

      // Dimensions Category
      {
        id: 'width',
        label: 'Width',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'width',
        defaultValue: 300,
        min: 1,
        exposable: true,
        responsive: true,
        showWhen: { property: 'autoWidth', operator: 'notEquals', value: true },
      },
      {
        id: 'height',
        label: 'Height',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'height',
        defaultValue: 200,
        min: 1,
        exposable: true,
        responsive: true,
      },

      // Border Category
      {
        id: 'styles.borderRadius',
        label: 'Corners',
        type: 'corners',
        tab: 'design',
        category: 'border',
        path: 'styles.borderRadius',
        defaultValue: '8',
        exposable: true,
        responsive: true,
        aiControllable: true,
        aiHint: 'corner rounding in px, e.g. 999 for circular, 12 for rounded, 0 for sharp',
      },

      // Effects Category
      {
        id: 'styles.opacity',
        label: 'Opacity',
        type: 'number',
        tab: 'design',
        category: 'effects',
        path: 'styles.opacity',
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.1,
        exposable: true,
        responsive: true,
      },
      {
        id: 'styles.boxShadow',
        label: 'Shadow',
        type: 'string',
        tab: 'design',
        category: 'effects',
        path: 'styles.boxShadow',
        placeholder: '0 4px 6px rgba(0,0,0,0.1)',
        exposable: true,
        responsive: true,
      },
    ],
  },

  // ============================================================================
  // VIDEO PROPERTIES
  // ============================================================================
  video: {
    type: 'video',
    properties: [
      // ----------------------
      // SETTINGS TAB
      // ----------------------

      // Video Category - Source configuration
      {
        id: 'sourceType',
        label: 'Source Type',
        type: 'select',
        tab: 'settings',
        category: 'video',
        path: 'sourceType',
        defaultValue: 'storage',
        exposable: true,
        options: [
          { value: 'storage', label: 'From Storage' },
          { value: 'loom', label: 'Loom Video' },
        ],
        description: 'Choose video source type',
      },
      {
        id: 'src',
        label: 'Video Source',
        type: 'video', // Uses VideoSourceControl which opens storage browser with video filter
        tab: 'settings',
        category: 'video',
        path: 'src',
        defaultValue: '',
        exposable: true,
        description: 'Select video from storage',
        showWhen: {
          property: 'sourceType',
          operator: 'equals',
          value: 'storage',
        },
      },
      {
        id: 'poster',
        label: 'Thumbnail',
        type: 'image',
        tab: 'settings',
        category: 'video',
        path: 'poster',
        defaultValue: '',
        exposable: true,
        description: 'Custom video thumbnail image',
        showWhen: {
          property: 'sourceType',
          operator: 'equals',
          value: 'storage',
        },
      },
      {
        id: 'loomUrl',
        label: 'Loom URL',
        type: 'string',
        tab: 'settings',
        category: 'video',
        path: 'loomUrl',
        defaultValue: '',
        exposable: true,
        placeholder: 'https://www.loom.com/share/...',
        description: 'Paste your Loom share link',
        showWhen: {
          property: 'sourceType',
          operator: 'equals',
          value: 'loom',
        },
      },
      {
        id: 'alt',
        label: 'Alt Text',
        type: 'string',
        tab: 'settings',
        category: 'video',
        path: 'alt',
        defaultValue: 'Video',
        exposable: true,
        placeholder: 'Describe the video...',
        description: 'Alternative text for accessibility',
      },
      {
        id: 'objectFit',
        label: 'Fit',
        type: 'select',
        tab: 'settings',
        category: 'display',
        path: 'objectFit',
        defaultValue: 'cover',
        exposable: true,
        responsive: true,
        options: [
          { value: 'cover', label: 'Cover' },
          { value: 'contain', label: 'Contain' },
          { value: 'fill', label: 'Fill' },
        ],
      },

      // Playback Category
      {
        id: 'controls',
        label: 'Show Controls',
        type: 'boolean',
        tab: 'settings',
        category: 'playback',
        path: 'controls',
        defaultValue: true,
        exposable: true,
        description: 'Show video player controls',
      },
      {
        id: 'autoplay',
        label: 'Autoplay',
        type: 'boolean',
        tab: 'settings',
        category: 'playback',
        path: 'autoplay',
        defaultValue: false,
        exposable: true,
        description: 'Auto-play video on load (requires muted)',
      },
      {
        id: 'loop',
        label: 'Loop',
        type: 'boolean',
        tab: 'settings',
        category: 'playback',
        path: 'loop',
        defaultValue: false,
        exposable: true,
        description: 'Loop video playback',
      },
      {
        id: 'muted',
        label: 'Muted',
        type: 'boolean',
        tab: 'settings',
        category: 'playback',
        path: 'muted',
        defaultValue: false,
        exposable: true,
        description: 'Start video muted',
      },

      // Options Category
      {
        id: 'autoWidth',
        label: 'Auto Width',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'autoWidth',
        defaultValue: false,
        exposable: true,
        responsive: true,
        description: 'Fill container width',
      },
      {
        id: 'visible',
        label: 'Visible',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'visible',
        defaultValue: true,
        exposable: true,
        responsive: true,
      },

      // ----------------------
      // DESIGN TAB
      // ----------------------

      // Dimensions Category
      {
        id: 'width',
        label: 'Width',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'width',
        defaultValue: 480,
        min: 1,
        exposable: true,
        responsive: true,
        showWhen: { property: 'autoWidth', operator: 'notEquals', value: true },
      },
      {
        id: 'height',
        label: 'Height',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'height',
        defaultValue: 270,
        min: 1,
        exposable: true,
        responsive: true,
      },

      // Border Category
      {
        id: 'styles.borderRadius',
        label: 'Corners',
        type: 'corners',
        tab: 'design',
        category: 'border',
        path: 'styles.borderRadius',
        defaultValue: '8',
        exposable: true,
        responsive: true,
      },

      // Background Category
      {
        id: 'styles.backgroundColor',
        label: 'Background',
        type: 'color',
        tab: 'design',
        category: 'background',
        path: 'styles.backgroundColor',
        defaultValue: '#0a0a0a',
        exposable: true,
        responsive: true,
      },

      // Effects Category
      {
        id: 'styles.opacity',
        label: 'Opacity',
        type: 'number',
        tab: 'design',
        category: 'effects',
        path: 'styles.opacity',
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.1,
        exposable: true,
        responsive: true,
      },
      {
        id: 'styles.boxShadow',
        label: 'Shadow',
        type: 'string',
        tab: 'design',
        category: 'effects',
        path: 'styles.boxShadow',
        placeholder: '0 4px 6px rgba(0,0,0,0.1)',
        exposable: true,
        responsive: true,
      },
    ],
  },

  // ============================================================================
  // BUTTON PROPERTIES
  // ============================================================================
  button: {
    type: 'button',
    properties: [
      // ----------------------
      // SETTINGS TAB
      // ----------------------
      {
        id: 'label',
        label: 'Button Text',
        type: 'string',
        tab: 'settings',
        category: 'content',
        path: 'label',
        defaultValue: 'Button',
        exposable: true, // CMS can inject button text!
        placeholder: 'Button text...',
      },
      {
        id: 'variant',
        label: 'Style',
        type: 'select',
        tab: 'settings',
        category: 'style',
        path: 'variant',
        defaultValue: 'primary',
        exposable: true,
        options: [
          { value: 'primary', label: 'Primary' },
          { value: 'secondary', label: 'Secondary' },
          { value: 'outline', label: 'Outline' },
          { value: 'ghost', label: 'Ghost' },
        ],
      },

      // Action Group - Future expansion for button actions
      {
        id: 'action',
        label: 'Action',
        type: 'group',
        tab: 'settings',
        category: 'interaction',
        path: 'action',
        exposable: true,
        children: [
          {
            id: 'action.type',
            label: 'Action Type',
            type: 'select',
            tab: 'settings',
            category: 'interaction',
            path: 'action.type',
            defaultValue: 'none',
            exposable: true,
            options: [
              { value: 'none', label: 'None' },
              { value: 'link', label: 'Open Link' },
              { value: 'dynamic-link', label: 'Dynamic Page Link' },
              { value: 'popup', label: 'Show Popup' },
              { value: 'scroll', label: 'Scroll To' },
            ],
          },
          {
            id: 'action.href',
            label: 'Link URL',
            type: 'string',
            tab: 'settings',
            category: 'interaction',
            path: 'action.href',
            exposable: true, // CMS can inject links!
            placeholder: 'https://...',
            showWhen: {
              property: 'action.type',
              operator: 'equals',
              value: 'link',
            },
          },
          /**
           * Target page slug for dynamic links.
           * Used with action.type='dynamic-link' to navigate to a CMS row's detail page.
           * The URL is built as: basePath/{targetPageSlug}/{rowId}
           */
          {
            id: 'action.targetPageSlug',
            label: 'Target Page Slug',
            type: 'string',
            tab: 'settings',
            category: 'interaction',
            path: 'action.targetPageSlug',
            exposable: false, // Page-specific
            placeholder: 'page-slug',
            description: 'Slug of the dynamic page template',
            showWhen: {
              property: 'action.type',
              operator: 'equals',
              value: 'dynamic-link',
            },
          },
          {
            id: 'action.openInNewTab',
            label: 'Open in New Tab',
            type: 'boolean',
            tab: 'settings',
            category: 'interaction',
            path: 'action.openInNewTab',
            defaultValue: false,
            exposable: true,
            showWhen: {
              property: 'action.type',
              operator: 'in',
              value: ['link', 'dynamic-link'],
            },
          },
          {
            id: 'action.scrollTarget',
            label: 'Scroll Target',
            type: 'string',
            tab: 'settings',
            category: 'interaction',
            path: 'action.scrollTarget',
            exposable: false, // Page-specific
            placeholder: '#section-id',
            showWhen: {
              property: 'action.type',
              operator: 'equals',
              value: 'scroll',
            },
          },
        ],
      },

      // Options Category
      {
        id: 'autoWidth',
        label: 'Auto Width',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'autoWidth',
        defaultValue: true,
        exposable: true,
        responsive: true,
        description: 'Size based on content',
      },
      {
        id: 'autoHeight',
        label: 'Auto Height',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'autoHeight',
        defaultValue: true,
        exposable: true,
        responsive: true,
      },
      {
        id: 'visible',
        label: 'Visible',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'visible',
        defaultValue: true,
        exposable: true,
        responsive: true,
      },

      // ----------------------
      // DESIGN TAB
      // ----------------------

      // Dimensions Category
      {
        id: 'width',
        label: 'Width',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'width',
        defaultValue: 120,
        min: 1,
        exposable: true,
        responsive: true,
        showWhen: { property: 'autoWidth', operator: 'notEquals', value: true },
      },
      {
        id: 'height',
        label: 'Height',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'height',
        defaultValue: 44,
        min: 1,
        exposable: true,
        responsive: true,
        showWhen: {
          property: 'autoHeight',
          operator: 'notEquals',
          value: true,
        },
      },

      // Typography Category
      {
        id: 'styles.fontFamily',
        label: 'Font',
        type: 'string',
        tab: 'design',
        category: 'typography',
        path: 'styles.fontFamily',
        defaultValue: 'Inter',
        exposable: true,
        responsive: true,
      },
      {
        id: 'styles.fontSize',
        label: 'Size',
        type: 'number',
        tab: 'design',
        category: 'typography',
        path: 'styles.fontSize',
        defaultValue: 14,
        min: 1,
        exposable: true,
        responsive: true,
        aiControllable: true,
        aiHint: 'button text size in px, e.g. 14 for standard, 16 for large',
      },
      {
        id: 'styles.fontWeight',
        label: 'Weight',
        type: 'select',
        tab: 'design',
        category: 'typography',
        path: 'styles.fontWeight',
        defaultValue: 500,
        exposable: true,
        responsive: true,
        options: [
          { value: '400', label: 'Regular' },
          { value: '500', label: 'Medium' },
          { value: '600', label: 'Semibold' },
          { value: '700', label: 'Bold' },
        ],
      },

      // Colors Category
      {
        id: 'styles.backgroundColor',
        label: 'Background',
        type: 'color',
        tab: 'design',
        category: 'colors',
        path: 'styles.backgroundColor',
        defaultValue: '#3b82f6',
        exposable: true,
        responsive: true,
        aiControllable: true,
        aiHint: "button fill color as hex, e.g. '#6366f1' for indigo, '#000000' for black",
      },
      {
        id: 'styles.color',
        label: 'Text Color',
        type: 'color',
        tab: 'design',
        category: 'colors',
        path: 'styles.color',
        defaultValue: '#ffffff',
        exposable: true,
        responsive: true,
        aiControllable: true,
        aiHint: "button text color as hex, e.g. '#ffffff' for white",
      },

      // Spacing Category
      {
        id: 'styles.padding',
        label: 'Padding',
        type: 'spacing',
        tab: 'design',
        category: 'spacing',
        path: 'styles.padding',
        defaultValue: '12px 24px',
        exposable: true,
        responsive: true,
      },

      // Border Category
      {
        id: 'styles.borderRadius',
        label: 'Corners',
        type: 'corners',
        tab: 'design',
        category: 'border',
        path: 'styles.borderRadius',
        defaultValue: '8',
        exposable: true,
        responsive: true,
        aiControllable: true,
        aiHint: 'corner rounding in px, e.g. 999 for pill buttons, 8 for standard',
      },
      // NOTE: Border width/color/style are NOT listed here as individual properties.
      // Buttons use __borderConfig via BorderControl (same as frames) which is
      // handled in the properties panel's Border section and applied by
      // computeButtonContentStyles → borderConfigToInlineStyles.
    ],
  },

  // ============================================================================
  // LIST ELEMENT PROPERTIES
  // ============================================================================
  /**
   * List element — a bulleted list with configurable icon bullets.
   *
   * SOURCE OF TRUTH: ListPropertyRegistry, list-element-properties
   *
   * Uses the SAME icon library as buttons (shared IconPicker component).
   * Icon applies uniformly to all list item bullets.
   *
   * SETTINGS TAB: Icon configuration, item gap, auto sizing, visibility
   * DESIGN TAB: Typography, colors, spacing, dimensions
   */
  list: {
    type: 'list',
    properties: [
      // ----------------------
      // SETTINGS TAB
      // ----------------------

      // Icon Configuration
      {
        id: 'icon',
        label: 'Bullet Icon',
        type: 'string',
        tab: 'settings',
        category: 'icon',
        path: 'icon',
        defaultValue: 'Check',
        exposable: true,
        placeholder: 'e.g. Check, Circle, Star',
        description: 'Icon from the icon library used as bullet for all items',
      },
      {
        id: 'iconSize',
        label: 'Icon Size',
        type: 'number',
        tab: 'settings',
        category: 'icon',
        path: 'iconSize',
        defaultValue: 16,
        min: 8,
        max: 48,
        exposable: true,
      },
      {
        id: 'iconColor',
        label: 'Icon Color',
        type: 'color',
        tab: 'settings',
        category: 'icon',
        path: 'iconColor',
        exposable: true,
        description: 'Color of the bullet icon (defaults to text color)',
      },
      {
        id: 'itemGap',
        label: 'Item Gap',
        type: 'number',
        tab: 'settings',
        category: 'layout',
        path: 'itemGap',
        defaultValue: 8,
        min: 0,
        max: 48,
        exposable: true,
        responsive: true,
        description: 'Vertical gap between list items in pixels',
      },

      // Options Category
      {
        id: 'autoWidth',
        label: 'Auto Width',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'autoWidth',
        defaultValue: true,
        exposable: true,
        responsive: true,
        description: 'Fill parent container width',
      },
      {
        id: 'autoHeight',
        label: 'Auto Height',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'autoHeight',
        defaultValue: true,
        exposable: true,
        responsive: true,
      },
      {
        id: 'visible',
        label: 'Visible',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'visible',
        defaultValue: true,
        exposable: true,
        responsive: true,
      },

      // ----------------------
      // DESIGN TAB
      // ----------------------

      // Dimensions Category
      {
        id: 'width',
        label: 'Width',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'width',
        defaultValue: 400,
        min: 1,
        exposable: true,
        responsive: true,
        showWhen: { property: 'autoWidth', operator: 'notEquals', value: true },
      },
      {
        id: 'height',
        label: 'Height',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'height',
        defaultValue: 200,
        min: 1,
        exposable: true,
        responsive: true,
        showWhen: { property: 'autoHeight', operator: 'notEquals', value: true },
      },

      // Typography Category
      {
        id: 'styles.fontFamily',
        label: 'Font',
        type: 'string',
        tab: 'design',
        category: 'typography',
        path: 'styles.fontFamily',
        defaultValue: 'Inter',
        exposable: true,
        responsive: true,
      },
      {
        id: 'styles.fontSize',
        label: 'Size',
        type: 'number',
        tab: 'design',
        category: 'typography',
        path: 'styles.fontSize',
        defaultValue: 16,
        min: 1,
        exposable: true,
        responsive: true,
      },
      {
        id: 'styles.fontWeight',
        label: 'Weight',
        type: 'select',
        tab: 'design',
        category: 'typography',
        path: 'styles.fontWeight',
        defaultValue: 400,
        exposable: true,
        responsive: true,
        options: [
          { value: '300', label: 'Light' },
          { value: '400', label: 'Regular' },
          { value: '500', label: 'Medium' },
          { value: '600', label: 'Semibold' },
          { value: '700', label: 'Bold' },
        ],
      },
      {
        id: 'styles.lineHeight',
        label: 'Line Height',
        type: 'number',
        tab: 'design',
        category: 'typography',
        path: 'styles.lineHeight',
        defaultValue: 1.6,
        min: 0.5,
        max: 4,
        step: 0.1,
        exposable: true,
        responsive: true,
      },

      // Colors Category
      {
        id: 'styles.color',
        label: 'Text Color',
        type: 'color',
        tab: 'design',
        category: 'colors',
        path: 'styles.color',
        defaultValue: '#111111',
        exposable: true,
        responsive: true,
      },
      {
        id: 'styles.backgroundColor',
        label: 'Background',
        type: 'color',
        tab: 'design',
        category: 'colors',
        path: 'styles.backgroundColor',
        defaultValue: 'transparent',
        exposable: true,
        responsive: true,
      },

      // Spacing Category
      {
        id: 'styles.padding',
        label: 'Padding',
        type: 'spacing',
        tab: 'design',
        category: 'spacing',
        path: 'styles.padding',
        defaultValue: '0',
        exposable: true,
        responsive: true,
      },
      {
        id: 'styles.margin',
        label: 'Margin',
        type: 'spacing',
        tab: 'design',
        category: 'spacing',
        path: 'styles.margin',
        defaultValue: '0',
        exposable: true,
        responsive: true,
      },
    ],
  },

  // ============================================================================
  // SMARTCMS LIST PROPERTIES
  // ============================================================================
  /**
   * SmartCMS List - A dynamic list that renders CMS data using a component template.
   *
   * The list uses a "slot" system where users drop a component instance as a template.
   * For each row in the connected CMS table, the template is rendered with CMS data
   * injected into the component's exposed properties.
   *
   * LAYOUT PROPERTIES: Similar to frames for controlling list appearance
   * CMS PROPERTIES: For connecting to CMS tables and mapping data
   * PAGINATION: For handling large datasets (future expansion)
   */
  'smartcms-list': {
    type: 'smartcms-list',
    properties: [
      // ----------------------
      // SETTINGS TAB
      // ----------------------

      // CMS Configuration Category
      {
        id: 'cmsTableId',
        label: 'CMS Table',
        type: 'string', // Will be rendered as a dropdown in custom UI
        tab: 'settings',
        category: 'cms',
        path: 'cmsTableId',
        exposable: false, // CMS config is not exposable
        description: 'Select the CMS table to pull data from',
      },
      {
        id: 'sourceInstanceId',
        label: 'Source Component',
        type: 'string', // Will show component slot UI
        tab: 'settings',
        category: 'cms',
        path: 'sourceInstanceId',
        exposable: false,
        description: 'Drop a component instance here to use as the list item template',
      },

      // Pagination Category
      {
        id: 'pageSize',
        label: 'Items Per Page',
        type: 'number',
        tab: 'settings',
        category: 'pagination',
        path: 'pageSize',
        defaultValue: 10,
        min: 1,
        max: 100,
        exposable: true,
        description: 'Number of items to display per page',
      },
      {
        id: 'showPagination',
        label: 'Show Pagination',
        type: 'boolean',
        tab: 'settings',
        category: 'pagination',
        path: 'showPagination',
        defaultValue: true,
        exposable: true,
        description: 'Show pagination controls when items exceed page size',
      },

      // Options Category
      {
        id: 'visible',
        label: 'Visible',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'visible',
        defaultValue: true,
        exposable: true,
        responsive: true,
        description: 'Whether the list is visible on the page',
      },
      {
        id: 'locked',
        label: 'Locked',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'locked',
        defaultValue: false,
        exposable: false,
        description: 'Prevent editing and selection',
      },

      // Layout Settings Category
      {
        id: 'autoWidth',
        label: 'Auto Width',
        type: 'boolean',
        tab: 'settings',
        category: 'layout',
        path: 'autoWidth',
        defaultValue: true,
        exposable: true,
        responsive: true,
        description: 'Fill container width',
      },
      {
        id: 'autoHeight',
        label: 'Auto Height',
        type: 'boolean',
        tab: 'settings',
        category: 'layout',
        path: 'autoHeight',
        defaultValue: true,
        exposable: true,
        responsive: true,
        description: 'Grow to fit content',
      },

      // Empty State Category
      {
        id: 'emptyStateMessage',
        label: 'Empty Message',
        type: 'string',
        tab: 'settings',
        category: 'empty',
        path: 'emptyStateMessage',
        defaultValue: 'No items to display. Connect a CMS table to get started.',
        exposable: true,
        placeholder: 'Message when list is empty...',
        description: 'Message shown when there are no items to display',
      },

      // Click Action Category — Navigate to dynamic page or custom URL
      {
        id: 'linkToDynamicPage',
        label: 'Enable Click Action',
        type: 'boolean',
        tab: 'settings',
        category: 'clickAction',
        path: 'linkToDynamicPage',
        defaultValue: false,
        exposable: false,
        description: 'Make list items clickable to navigate to a dynamic page',
      },
      {
        id: 'targetPageId',
        label: 'Target Page',
        type: 'string',
        tab: 'settings',
        category: 'clickAction',
        path: 'targetPageId',
        exposable: false,
        description: 'The dynamic page to navigate to when an item is clicked',
      },
      {
        id: 'targetPageSlug',
        label: 'Target Page Slug',
        type: 'string',
        tab: 'settings',
        category: 'clickAction',
        path: 'targetPageSlug',
        exposable: false,
        description: 'The URL slug of the target page (auto-set from page selection)',
      },
      {
        id: 'openInNewTab',
        label: 'Open in New Tab',
        type: 'boolean',
        tab: 'settings',
        category: 'clickAction',
        path: 'openInNewTab',
        defaultValue: false,
        exposable: false,
        description: 'Open the link in a new browser tab',
      },

      // ----------------------
      // DESIGN TAB
      // ----------------------

      // Dimensions Category
      {
        id: 'width',
        label: 'Width',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'width',
        defaultValue: 400,
        min: 1,
        exposable: true,
        responsive: true,
        showWhen: { property: 'autoWidth', operator: 'notEquals', value: true },
      },
      {
        id: 'height',
        label: 'Height',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'height',
        defaultValue: 300,
        min: 1,
        exposable: true,
        responsive: true,
        showWhen: { property: 'autoHeight', operator: 'notEquals', value: true },
      },

      // Layout Category - Frame-like layout controls for the list container
      {
        id: 'styles.flexDirection',
        label: 'Direction',
        type: 'select',
        tab: 'design',
        category: 'layout',
        path: 'styles.flexDirection',
        defaultValue: 'column',
        exposable: true,
        responsive: true,
        options: [
          { value: 'column', label: 'Vertical' },
          { value: 'row', label: 'Horizontal' },
        ],
        description: 'How items are arranged in the list',
      },
      {
        id: 'styles.justifyContent',
        label: 'Justify',
        type: 'select',
        tab: 'design',
        category: 'layout',
        path: 'styles.justifyContent',
        defaultValue: 'flex-start',
        exposable: true,
        responsive: true,
        options: [
          { value: 'flex-start', label: 'Start' },
          { value: 'center', label: 'Center' },
          { value: 'flex-end', label: 'End' },
          { value: 'space-between', label: 'Space Between' },
          { value: 'space-around', label: 'Space Around' },
          { value: 'space-evenly', label: 'Space Evenly' },
        ],
      },
      {
        id: 'styles.alignItems',
        label: 'Align',
        type: 'select',
        tab: 'design',
        category: 'layout',
        path: 'styles.alignItems',
        defaultValue: 'stretch',
        exposable: true,
        responsive: true,
        options: [
          { value: 'stretch', label: 'Stretch' },
          { value: 'flex-start', label: 'Start' },
          { value: 'center', label: 'Center' },
          { value: 'flex-end', label: 'End' },
        ],
      },
      {
        id: 'styles.gap',
        label: 'Gap',
        type: 'number',
        tab: 'design',
        category: 'layout',
        path: 'styles.gap',
        defaultValue: 16,
        min: 0,
        step: 4,
        exposable: true,
        responsive: true,
        description: 'Space between list items',
      },
      {
        id: 'styles.flexWrap',
        label: 'Wrap',
        type: 'select',
        tab: 'design',
        category: 'layout',
        path: 'styles.flexWrap',
        defaultValue: 'wrap',
        exposable: true,
        responsive: true,
        options: [
          { value: 'nowrap', label: 'No Wrap' },
          { value: 'wrap', label: 'Wrap' },
        ],
        description: 'Allow items to wrap to next line',
      },

      // Animation Category — Auto-scroll marquee animation
      {
        id: 'autoScroll',
        label: 'Auto Scroll',
        type: 'boolean',
        tab: 'settings',
        category: 'animation',
        path: 'autoScroll',
        defaultValue: false,
        exposable: true,
        description: 'Enable infinite auto-scroll animation (works best with fixed height)',
      },
      {
        id: 'autoScrollSpeed',
        label: 'Scroll Speed',
        type: 'number',
        tab: 'settings',
        category: 'animation',
        path: 'autoScrollSpeed',
        defaultValue: 50,
        min: 10,
        max: 200,
        step: 10,
        exposable: true,
        description: 'Speed in pixels per second',
        showWhen: { property: 'autoScroll', operator: 'equals', value: true },
      },
      {
        id: 'autoScrollDirection',
        label: 'Direction',
        type: 'select',
        tab: 'settings',
        category: 'animation',
        path: 'autoScrollDirection',
        defaultValue: 'left',
        exposable: true,
        options: [
          { value: 'left', label: 'Left' },
          { value: 'right', label: 'Right' },
          { value: 'up', label: 'Up' },
          { value: 'down', label: 'Down' },
        ],
        showWhen: { property: 'autoScroll', operator: 'equals', value: true },
      },

      // Spacing Category
      {
        id: 'styles.padding',
        label: 'Padding',
        type: 'spacing',
        tab: 'design',
        category: 'spacing',
        path: 'styles.padding',
        defaultValue: '0',
        exposable: true,
        responsive: true,
        description: 'Inner spacing of the list container',
      },

      // Background Category
      {
        id: 'styles.backgroundColor',
        label: 'Background',
        type: 'color',
        tab: 'design',
        category: 'background',
        path: 'styles.backgroundColor',
        defaultValue: 'transparent',
        exposable: true,
        responsive: true,
      },

      // Border Category
      {
        id: 'styles.borderRadius',
        label: 'Corners',
        type: 'corners',
        tab: 'design',
        category: 'border',
        path: 'styles.borderRadius',
        defaultValue: '0',
        exposable: true,
        responsive: true,
      },
      {
        id: 'styles.borderWidth',
        label: 'Border Width',
        type: 'number',
        tab: 'design',
        category: 'border',
        path: 'styles.borderWidth',
        defaultValue: 0,
        min: 0,
        exposable: true,
        responsive: true,
      },
      {
        id: 'styles.borderColor',
        label: 'Border Color',
        type: 'color',
        tab: 'design',
        category: 'border',
        path: 'styles.borderColor',
        defaultValue: '#e5e7eb',
        exposable: true,
        responsive: true,
        showWhen: { property: 'styles.borderWidth', operator: 'exists' },
      },
    ],
  },

  // ============================================================================
  // LINK ELEMENT PROPERTIES
  // ============================================================================
  /**
   * Link Element - A frame-like container with navigation capability.
   *
   * SOURCE OF TRUTH: Link Element Properties for Dynamic Page Navigation
   *
   * Links can contain any content (text, images, frames) and navigate to:
   * - Static URLs (external or internal)
   * - Dynamic page routes (using CMS row context for /domain/page/[rowId])
   *
   * BEHAVIOR:
   * - Acts like a frame (contains children, has layout properties)
   * - Renders as <a> or Next.js <Link> for proper SEO
   * - In dynamic mode, resolves URLs using CmsRowContext from SmartCMS List
   *
   * VISUAL DISTINCTION:
   * - Uses cyan selection color (#06b6d4) instead of blue
   * - Link icon indicator in layers panel
   */
  link: {
    type: 'link',
    properties: [
      // ----------------------
      // SETTINGS TAB
      // ----------------------

      // Link Configuration Category
      {
        id: 'linkType',
        label: 'Link Type',
        type: 'select',
        tab: 'settings',
        category: 'link',
        path: 'linkType',
        defaultValue: 'static',
        exposable: true,
        options: [
          { value: 'static', label: 'Static URL' },
          { value: 'dynamic', label: 'Dynamic Page' },
        ],
        description: 'Static links go to a fixed URL. Dynamic links navigate to CMS row pages.',
      },
      {
        id: 'href',
        label: 'URL',
        type: 'string',
        tab: 'settings',
        category: 'link',
        path: 'href',
        defaultValue: '',
        exposable: true,
        placeholder: 'https://... or /page-slug',
        description: 'The URL to navigate to when clicked',
        showWhen: {
          property: 'linkType',
          operator: 'equals',
          value: 'static',
        },
      },
      {
        id: 'targetPageId',
        label: 'Target Page',
        type: 'string', // Will use custom UI to show page selector
        tab: 'settings',
        category: 'link',
        path: 'targetPageId',
        defaultValue: '',
        exposable: false, // Page IDs are site-specific
        description: 'The dynamic page template to navigate to',
        showWhen: {
          property: 'linkType',
          operator: 'equals',
          value: 'dynamic',
        },
      },
      {
        id: 'openInNewTab',
        label: 'Open in New Tab',
        type: 'boolean',
        tab: 'settings',
        category: 'link',
        path: 'openInNewTab',
        defaultValue: false,
        exposable: true,
        description: 'Open the link in a new browser tab',
      },

      // Options Category
      {
        id: 'visible',
        label: 'Visible',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'visible',
        defaultValue: true,
        exposable: true,
        responsive: true,
        description: 'Whether the link is visible on the page',
      },
      {
        id: 'locked',
        label: 'Locked',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'locked',
        defaultValue: false,
        exposable: false,
        description: 'Prevent editing and selection',
      },

      // Layout Settings Category
      {
        id: 'autoWidth',
        label: 'Auto Width',
        type: 'boolean',
        tab: 'settings',
        category: 'layout',
        path: 'autoWidth',
        defaultValue: false,
        exposable: true,
        responsive: true,
        description: 'Fill container width',
      },
      {
        id: 'autoHeight',
        label: 'Auto Height',
        type: 'boolean',
        tab: 'settings',
        category: 'layout',
        path: 'autoHeight',
        defaultValue: true,
        exposable: true,
        responsive: true,
        description: 'Grow to fit content',
      },

      // ----------------------
      // DESIGN TAB
      // ----------------------

      // Dimensions Category
      {
        id: 'width',
        label: 'Width',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'width',
        defaultValue: 200,
        min: 1,
        exposable: true,
        responsive: true,
        showWhen: { property: 'autoWidth', operator: 'notEquals', value: true },
      },
      {
        id: 'height',
        label: 'Height',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'height',
        defaultValue: 48,
        min: 1,
        exposable: true,
        responsive: true,
        showWhen: { property: 'autoHeight', operator: 'notEquals', value: true },
      },

      // Layout Category (Frame-like layout controls)
      {
        id: 'styles.flexDirection',
        label: 'Direction',
        type: 'select',
        tab: 'design',
        category: 'layout',
        path: 'styles.flexDirection',
        defaultValue: 'column',
        exposable: true,
        responsive: true,
        options: [
          { value: 'column', label: 'Vertical' },
          { value: 'row', label: 'Horizontal' },
        ],
        description: 'How children are arranged inside the link',
      },
      {
        id: 'styles.justifyContent',
        label: 'Justify',
        type: 'select',
        tab: 'design',
        category: 'layout',
        path: 'styles.justifyContent',
        defaultValue: 'flex-start',
        exposable: true,
        responsive: true,
        options: [
          { value: 'flex-start', label: 'Start' },
          { value: 'center', label: 'Center' },
          { value: 'flex-end', label: 'End' },
          { value: 'space-between', label: 'Space Between' },
          { value: 'space-around', label: 'Space Around' },
          { value: 'space-evenly', label: 'Space Evenly' },
        ],
      },
      {
        id: 'styles.alignItems',
        label: 'Align',
        type: 'select',
        tab: 'design',
        category: 'layout',
        path: 'styles.alignItems',
        defaultValue: 'stretch',
        exposable: true,
        responsive: true,
        options: [
          { value: 'stretch', label: 'Stretch' },
          { value: 'flex-start', label: 'Start' },
          { value: 'center', label: 'Center' },
          { value: 'flex-end', label: 'End' },
        ],
      },
      {
        id: 'styles.gap',
        label: 'Gap',
        type: 'number',
        tab: 'design',
        category: 'layout',
        path: 'styles.gap',
        defaultValue: 0,
        min: 0,
        step: 4,
        exposable: true,
        responsive: true,
        description: 'Space between child elements',
      },

      // Spacing Category
      {
        id: 'styles.padding',
        label: 'Padding',
        type: 'spacing',
        tab: 'design',
        category: 'spacing',
        path: 'styles.padding',
        defaultValue: '0',
        exposable: true,
        responsive: true,
        description: 'Inner spacing',
      },

      // Background Category
      {
        id: 'styles.backgroundColor',
        label: 'Background',
        type: 'color',
        tab: 'design',
        category: 'background',
        path: 'styles.backgroundColor',
        defaultValue: 'transparent',
        exposable: true,
        responsive: true,
      },

      // Border Category
      {
        id: 'styles.borderRadius',
        label: 'Corners',
        type: 'corners',
        tab: 'design',
        category: 'border',
        path: 'styles.borderRadius',
        defaultValue: '0',
        exposable: true,
        responsive: true,
      },
      {
        id: 'styles.borderWidth',
        label: 'Border Width',
        type: 'number',
        tab: 'design',
        category: 'border',
        path: 'styles.borderWidth',
        defaultValue: 0,
        min: 0,
        exposable: true,
        responsive: true,
      },
      {
        id: 'styles.borderColor',
        label: 'Border Color',
        type: 'color',
        tab: 'design',
        category: 'border',
        path: 'styles.borderColor',
        defaultValue: '#e5e7eb',
        exposable: true,
        responsive: true,
        showWhen: { property: 'styles.borderWidth', operator: 'exists' },
      },

      // Effects Category
      {
        id: 'styles.opacity',
        label: 'Opacity',
        type: 'number',
        tab: 'design',
        category: 'effects',
        path: 'styles.opacity',
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.1,
        exposable: true,
        responsive: true,
      },
    ],
  },

  // ============================================================================
  // ECOMMERCE CAROUSEL PROPERTIES
  // ============================================================================
  /**
   * Property registry for the ecommerce-carousel element.
   *
   * SOURCE OF TRUTH: EcommerceCarouselElement in types.ts
   *
   * The ecommerce carousel displays product images with multiple navigation
   * styles (thumbnails, dots, arrows). Properties are organized to allow
   * CMS injection of images and visual customization per breakpoint.
   *
   * Thumbnail-specific properties (gap, size, showMore) are conditionally
   * visible only when navigationStyle is set to 'thumbnails'.
   */
  'ecommerce-carousel': {
    type: 'ecommerce-carousel',
    properties: [
      // ----------------------
      // SETTINGS TAB
      // ----------------------

      // Content Category — Primary image data (CMS-injectable)
      {
        id: 'images',
        label: 'Images',
        type: 'image',
        tab: 'settings',
        category: 'content',
        path: 'images',
        defaultValue: [],
        exposable: true, // CMS can inject product images!
        description: 'Array of product images for the carousel',
      },

      // Display Category — Controls how images are shown and navigated
      {
        id: 'navigationStyle',
        label: 'Navigation Style',
        type: 'select',
        tab: 'settings',
        category: 'display',
        path: 'navigationStyle',
        defaultValue: 'thumbnails',
        exposable: true,
        options: [
          { value: 'thumbnails', label: 'Thumbnails' },
          { value: 'dots', label: 'Dots' },
          { value: 'arrows', label: 'Arrows' },
        ],
        description: 'How users navigate between carousel images',
      },
      {
        id: 'objectFit',
        label: 'Fit',
        type: 'select',
        tab: 'settings',
        category: 'display',
        path: 'objectFit',
        defaultValue: 'cover',
        exposable: true,
        responsive: true,
        options: [
          { value: 'cover', label: 'Cover' },
          { value: 'contain', label: 'Contain' },
          { value: 'fill', label: 'Fill' },
        ],
        description: 'How images fit within the carousel frame',
      },
      {
        id: 'showMore',
        label: 'Show More Indicator',
        type: 'boolean',
        tab: 'settings',
        category: 'display',
        path: 'showMore',
        defaultValue: false,
        exposable: false, // Display behavior, not content
        showWhen: {
          property: 'navigationStyle',
          operator: 'equals',
          value: 'thumbnails',
        },
        description:
          'Show a "+N more" indicator when there are more thumbnails than visible',
      },

      // Spacing Category — Thumbnail layout spacing (only visible for thumbnail nav)
      {
        id: 'thumbnailGap',
        label: 'Thumbnail Gap',
        type: 'number',
        tab: 'settings',
        category: 'spacing',
        path: 'thumbnailGap',
        defaultValue: 8,
        min: 0,
        step: 2,
        exposable: true,
        showWhen: {
          property: 'navigationStyle',
          operator: 'equals',
          value: 'thumbnails',
        },
        description: 'Space between thumbnail images in pixels',
      },

      // Dimensions Category — Thumbnail sizing (only visible for thumbnail nav)
      {
        id: 'thumbnailSize',
        label: 'Thumbnail Size',
        type: 'number',
        tab: 'settings',
        category: 'dimensions',
        path: 'thumbnailSize',
        defaultValue: 64,
        min: 32,
        max: 200,
        step: 4,
        exposable: true,
        showWhen: {
          property: 'navigationStyle',
          operator: 'equals',
          value: 'thumbnails',
        },
        description: 'Width and height of each thumbnail in pixels',
      },

      // Border Category — Image corner rounding
      {
        id: 'imageBorderRadius',
        label: 'Image Border Radius',
        type: 'number',
        tab: 'settings',
        category: 'border',
        path: 'imageBorderRadius',
        defaultValue: 8,
        min: 0,
        step: 2,
        exposable: true,
        description: 'Corner rounding applied to carousel images',
      },

      // Options Category — Layout and visibility toggles
      {
        id: 'autoWidth',
        label: 'Auto Width',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'autoWidth',
        defaultValue: false,
        exposable: true,
        responsive: true,
        description: 'Fill container width instead of fixed pixel width',
      },
      {
        id: 'visible',
        label: 'Visible',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'visible',
        defaultValue: true,
        exposable: true,
        responsive: true,
        description: 'Whether the carousel is visible on the page',
      },

      // ----------------------
      // DESIGN TAB
      // ----------------------

      // Dimensions Category
      {
        id: 'width',
        label: 'Width',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'width',
        defaultValue: 500,
        min: 1,
        exposable: true,
        responsive: true,
        showWhen: { property: 'autoWidth', operator: 'notEquals', value: true },
      },
      {
        id: 'height',
        label: 'Height',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'height',
        defaultValue: 500,
        min: 1,
        exposable: true,
        responsive: true,
      },

      // Border Category
      {
        id: 'styles.borderRadius',
        label: 'Corners',
        type: 'corners',
        tab: 'design',
        category: 'border',
        path: 'styles.borderRadius',
        defaultValue: '8',
        exposable: true,
        responsive: true,
      },

      // Background Category
      {
        id: 'styles.backgroundColor',
        label: 'Background',
        type: 'color',
        tab: 'design',
        category: 'background',
        path: 'styles.backgroundColor',
        defaultValue: 'transparent',
        exposable: true,
        responsive: true,
      },

      // Effects Category
      {
        id: 'styles.opacity',
        label: 'Opacity',
        type: 'number',
        tab: 'design',
        category: 'effects',
        path: 'styles.opacity',
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.1,
        exposable: true,
        responsive: true,
      },
      {
        id: 'styles.boxShadow',
        label: 'Shadow',
        type: 'string',
        tab: 'design',
        category: 'effects',
        path: 'styles.boxShadow',
        placeholder: '0 4px 6px rgba(0,0,0,0.1)',
        exposable: true,
        responsive: true,
      },
    ],
  },

  // ============================================================================
  // FORM PROPERTIES
  // ============================================================================
  /**
   * Property registry for the form element.
   *
   * SOURCE OF TRUTH: FormElement in types.ts
   *
   * Forms embed a Mochi form by ID. The formId, formSlug, and formName are
   * the primary content properties (CMS-injectable). Auto-width/height control
   * whether the form fills its container or uses fixed dimensions.
   *
   * Redirect properties (successRedirectEnabled, successRedirectType, etc.)
   * are editor-only behavior settings and are NOT exposable.
   */
  form: {
    type: 'form',
    properties: [
      // ----------------------
      // SETTINGS TAB
      // ----------------------

      // Content Category — Form identification (CMS-injectable)
      {
        id: 'formId',
        label: 'Form ID',
        type: 'string',
        tab: 'settings',
        category: 'content',
        path: 'formId',
        defaultValue: '',
        exposable: true, // CMS can inject form references!
        description: 'The ID of the Mochi form to embed',
      },
      {
        id: 'formSlug',
        label: 'Form Slug',
        type: 'string',
        tab: 'settings',
        category: 'content',
        path: 'formSlug',
        defaultValue: '',
        exposable: true, // CMS can inject form slugs!
        description: 'URL-friendly slug for the form',
      },
      {
        id: 'formName',
        label: 'Form Name',
        type: 'string',
        tab: 'settings',
        category: 'content',
        path: 'formName',
        defaultValue: '',
        exposable: true, // CMS can inject form names!
        description: 'Display name of the selected form',
      },

      // Options Category — Layout and visibility toggles
      {
        id: 'autoWidth',
        label: 'Auto Width',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'autoWidth',
        defaultValue: false,
        exposable: true,
        responsive: true,
        description: 'Fill container width instead of fixed pixel width',
      },
      {
        id: 'autoHeight',
        label: 'Auto Height',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'autoHeight',
        defaultValue: false,
        exposable: true,
        description: 'Grow to fit form content height',
      },
      {
        id: 'visible',
        label: 'Visible',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'visible',
        defaultValue: true,
        exposable: true,
        responsive: true,
        description: 'Whether the form is visible on the page',
      },

      // Redirect Category — Editor-only behavior (NOT exposable)
      {
        id: 'successRedirectEnabled',
        label: 'Redirect on Submit',
        type: 'boolean',
        tab: 'settings',
        category: 'redirect',
        path: 'successRedirectEnabled',
        defaultValue: false,
        exposable: false, // Editor behavior, not content
        description: 'Redirect to a page or URL after successful submission',
      },
      {
        id: 'successRedirectType',
        label: 'Redirect Type',
        type: 'select',
        tab: 'settings',
        category: 'redirect',
        path: 'successRedirectType',
        defaultValue: 'page',
        exposable: false, // Editor behavior, not content
        options: [
          { value: 'page', label: 'Page' },
          { value: 'url', label: 'External URL' },
        ],
        showWhen: {
          property: 'successRedirectEnabled',
          operator: 'equals',
          value: true,
        },
        description: 'Whether to redirect to an internal page or external URL',
      },
      {
        id: 'successRedirectPageSlug',
        label: 'Redirect Page',
        type: 'string',
        tab: 'settings',
        category: 'redirect',
        path: 'successRedirectPageSlug',
        defaultValue: '',
        exposable: false, // Page-specific behavior
        placeholder: 'thank-you',
        showWhen: {
          property: 'successRedirectType',
          operator: 'equals',
          value: 'page',
        },
        description: 'Slug of the page to redirect to on success',
      },
      {
        id: 'successRedirectUrl',
        label: 'Redirect URL',
        type: 'string',
        tab: 'settings',
        category: 'redirect',
        path: 'successRedirectUrl',
        defaultValue: '',
        exposable: false, // Editor behavior, not content
        placeholder: 'https://...',
        showWhen: {
          property: 'successRedirectType',
          operator: 'equals',
          value: 'url',
        },
        description: 'External URL to redirect to on success',
      },
      {
        id: 'successRedirectNewTab',
        label: 'Open in New Tab',
        type: 'boolean',
        tab: 'settings',
        category: 'redirect',
        path: 'successRedirectNewTab',
        defaultValue: false,
        exposable: false, // Editor behavior, not content
        showWhen: {
          property: 'successRedirectEnabled',
          operator: 'equals',
          value: true,
        },
        description: 'Open the redirect URL in a new browser tab',
      },

      // ----------------------
      // DESIGN TAB
      // ----------------------

      // Dimensions Category
      {
        id: 'width',
        label: 'Width',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'width',
        defaultValue: 400,
        min: 1,
        exposable: true,
        responsive: true,
        showWhen: { property: 'autoWidth', operator: 'notEquals', value: true },
      },
      {
        id: 'height',
        label: 'Height',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'height',
        defaultValue: 500,
        min: 1,
        exposable: true,
        responsive: true,
      },

      // Border Category
      {
        id: 'styles.borderRadius',
        label: 'Corners',
        type: 'corners',
        tab: 'design',
        category: 'border',
        path: 'styles.borderRadius',
        defaultValue: '8',
        exposable: true,
      },

      // Background Category
      {
        id: 'styles.backgroundColor',
        label: 'Background',
        type: 'color',
        tab: 'design',
        category: 'background',
        path: 'styles.backgroundColor',
        defaultValue: 'transparent',
        exposable: true,
      },

      // Effects Category
      {
        id: 'styles.opacity',
        label: 'Opacity',
        type: 'number',
        tab: 'design',
        category: 'effects',
        path: 'styles.opacity',
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.1,
        exposable: true,
      },
      {
        id: 'styles.boxShadow',
        label: 'Shadow',
        type: 'string',
        tab: 'design',
        category: 'effects',
        path: 'styles.boxShadow',
        placeholder: '0 4px 6px rgba(0,0,0,0.1)',
        exposable: true,
      },
    ],
  },

  // ============================================================================
  // PAYMENT PROPERTIES
  // ============================================================================
  /**
   * Property registry for the payment element.
   *
   * SOURCE OF TRUTH: PaymentElement in types.ts
   *
   * Payment elements embed a Stripe checkout for a specific product/price.
   * The productId and priceId identify the item being purchased. Theme controls
   * the light/dark appearance of the Stripe embed.
   *
   * testMode is NOT exposable — exposing it would allow end users to toggle
   * between live and test payment flows, which is dangerous.
   *
   * priceAmount and priceCurrency are display-only metadata and NOT exposable
   * since they must stay synchronized with the actual Stripe price.
   */
  payment: {
    type: 'payment',
    properties: [
      // ----------------------
      // SETTINGS TAB
      // ----------------------

      // Content Category — Product/price identification (CMS-injectable)
      {
        id: 'productId',
        label: 'Product ID',
        type: 'string',
        tab: 'settings',
        category: 'content',
        path: 'productId',
        defaultValue: '',
        exposable: true, // CMS can inject product references!
        description: 'Stripe product ID for the payment',
      },
      {
        id: 'priceId',
        label: 'Price ID',
        type: 'string',
        tab: 'settings',
        category: 'content',
        path: 'priceId',
        defaultValue: '',
        exposable: true, // CMS can inject price references!
        description: 'Stripe price ID for the payment',
      },
      {
        id: 'productName',
        label: 'Product Name',
        type: 'string',
        tab: 'settings',
        category: 'content',
        path: 'productName',
        defaultValue: '',
        exposable: true, // CMS can inject product names!
        description: 'Display name of the product',
      },
      {
        id: 'priceName',
        label: 'Price Name',
        type: 'string',
        tab: 'settings',
        category: 'content',
        path: 'priceName',
        defaultValue: '',
        exposable: true, // CMS can inject price names!
        description: 'Display name of the price tier',
      },

      // Display Category — Theme and appearance
      {
        id: 'theme',
        label: 'Theme',
        type: 'select',
        tab: 'settings',
        category: 'display',
        path: 'theme',
        defaultValue: 'light',
        exposable: true,
        options: [
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ],
        description: 'Visual theme for the payment embed',
      },

      // Options Category — Layout, visibility, and mode toggles
      {
        id: 'autoWidth',
        label: 'Auto Width',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'autoWidth',
        defaultValue: false,
        exposable: true,
        responsive: true,
        description: 'Fill container width instead of fixed pixel width',
      },
      {
        id: 'autoHeight',
        label: 'Auto Height',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'autoHeight',
        defaultValue: false,
        exposable: true,
        description: 'Grow to fit payment form content height',
      },
      {
        id: 'visible',
        label: 'Visible',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'visible',
        defaultValue: true,
        exposable: true,
        responsive: true,
        description: 'Whether the payment element is visible on the page',
      },
      {
        id: 'testMode',
        label: 'Test Mode',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'testMode',
        defaultValue: false,
        exposable: false, // DANGEROUS: Never expose test/live toggle to end users
        description: 'Use Stripe test mode for this payment element',
      },

      // Redirect Category — Post-payment redirect behavior (NOT exposable)
      {
        id: 'successRedirectEnabled',
        label: 'Redirect on Payment',
        type: 'boolean',
        tab: 'settings',
        category: 'redirect',
        path: 'successRedirectEnabled',
        defaultValue: false,
        exposable: false,
        description: 'Redirect to a page or URL after successful payment',
      },
      {
        id: 'successRedirectType',
        label: 'Redirect Type',
        type: 'select',
        tab: 'settings',
        category: 'redirect',
        path: 'successRedirectType',
        defaultValue: 'page',
        exposable: false,
        options: [
          { value: 'page', label: 'Website Page' },
          { value: 'url', label: 'External URL' },
        ],
        showWhen: {
          property: 'successRedirectEnabled',
          operator: 'equals',
          value: true,
        },
        description: 'Whether to redirect to an internal page or external URL',
      },
      {
        id: 'successRedirectPageSlug',
        label: 'Redirect Page',
        type: 'string',
        tab: 'settings',
        category: 'redirect',
        path: 'successRedirectPageSlug',
        defaultValue: '',
        exposable: false,
        placeholder: 'thank-you',
        showWhen: {
          property: 'successRedirectType',
          operator: 'equals',
          value: 'page',
        },
        description: 'Slug of the page to redirect to on success',
      },
      {
        id: 'successRedirectUrl',
        label: 'Redirect URL',
        type: 'string',
        tab: 'settings',
        category: 'redirect',
        path: 'successRedirectUrl',
        defaultValue: '',
        exposable: false,
        placeholder: 'https://...',
        showWhen: {
          property: 'successRedirectType',
          operator: 'equals',
          value: 'url',
        },
        description: 'External URL to redirect to on success',
      },
      {
        id: 'successRedirectNewTab',
        label: 'Open in New Tab',
        type: 'boolean',
        tab: 'settings',
        category: 'redirect',
        path: 'successRedirectNewTab',
        defaultValue: false,
        exposable: false,
        showWhen: {
          property: 'successRedirectEnabled',
          operator: 'equals',
          value: true,
        },
        description: 'Open the redirect URL in a new browser tab',
      },

      // ----------------------
      // DESIGN TAB
      // ----------------------

      // Dimensions Category
      {
        id: 'width',
        label: 'Width',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'width',
        defaultValue: 400,
        min: 1,
        exposable: true,
        responsive: true,
        showWhen: { property: 'autoWidth', operator: 'notEquals', value: true },
      },
      {
        id: 'height',
        label: 'Height',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'height',
        defaultValue: 500,
        min: 1,
        exposable: true,
        responsive: true,
      },

      // Border Category
      {
        id: 'styles.borderRadius',
        label: 'Corners',
        type: 'corners',
        tab: 'design',
        category: 'border',
        path: 'styles.borderRadius',
        defaultValue: '8',
        exposable: true,
      },

      // Background Category
      {
        id: 'styles.backgroundColor',
        label: 'Background',
        type: 'color',
        tab: 'design',
        category: 'background',
        path: 'styles.backgroundColor',
        defaultValue: 'transparent',
        exposable: true,
      },

      // Effects Category
      {
        id: 'styles.opacity',
        label: 'Opacity',
        type: 'number',
        tab: 'design',
        category: 'effects',
        path: 'styles.opacity',
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.1,
        exposable: true,
      },
      {
        id: 'styles.boxShadow',
        label: 'Shadow',
        type: 'string',
        tab: 'design',
        category: 'effects',
        path: 'styles.boxShadow',
        placeholder: '0 4px 6px rgba(0,0,0,0.1)',
        exposable: true,
      },
    ],
  },

  // ============================================================================
  // ADD TO CART BUTTON PROPERTIES
  // ============================================================================
  /**
   * Property registry for the add-to-cart-button element.
   *
   * SOURCE OF TRUTH: AddToCartButtonElement in types.ts
   *
   * The add-to-cart button lets users add products to their shopping cart.
   * It supports label customization, multiple visual variants, an optional
   * icon with configurable position and size, and auto-sizing toggles.
   */
  'add-to-cart-button': {
    type: 'add-to-cart-button',
    properties: [
      // ----------------------
      // SETTINGS TAB
      // ----------------------

      // Content Category — Button label and icon configuration
      {
        id: 'label',
        label: 'Label',
        type: 'string',
        tab: 'settings',
        category: 'content',
        path: 'label',
        defaultValue: 'Add to Cart',
        exposable: true,
        description: 'Text displayed on the add-to-cart button',
      },
      {
        id: 'variant',
        label: 'Variant',
        type: 'select',
        tab: 'settings',
        category: 'content',
        path: 'variant',
        defaultValue: 'primary',
        exposable: true,
        options: [
          { value: 'primary', label: 'Primary' },
          { value: 'secondary', label: 'Secondary' },
          { value: 'outline', label: 'Outline' },
          { value: 'ghost', label: 'Ghost' },
        ],
        description: 'Visual style variant of the button',
      },
      {
        id: 'icon',
        label: 'Icon',
        type: 'string',
        tab: 'settings',
        category: 'content',
        path: 'icon',
        exposable: true,
        placeholder: 'e.g. ShoppingCart',
        description: 'Optional icon name to display alongside the label',
      },
      {
        id: 'iconPosition',
        label: 'Icon Position',
        type: 'select',
        tab: 'settings',
        category: 'content',
        path: 'iconPosition',
        defaultValue: 'before',
        exposable: true,
        options: [
          { value: 'before', label: 'Before' },
          { value: 'after', label: 'After' },
        ],
        description: 'Whether the icon appears before or after the label text',
      },
      {
        id: 'iconSize',
        label: 'Icon Size',
        type: 'number',
        tab: 'settings',
        category: 'content',
        path: 'iconSize',
        defaultValue: 16,
        min: 8,
        max: 48,
        exposable: true,
        description: 'Size of the icon in pixels',
      },

      // Options Category — Layout and visibility toggles
      {
        id: 'autoWidth',
        label: 'Auto Width',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'autoWidth',
        defaultValue: false,
        exposable: true,
        responsive: true,
        description: 'Fill container width instead of fixed pixel width',
      },
      {
        id: 'visible',
        label: 'Visible',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'visible',
        defaultValue: true,
        exposable: true,
        responsive: true,
        description: 'Whether the button is visible on the page',
      },

      // Standalone Product Category — Product picker for use outside CMS context
      // These are hidden from PropertyRenderer — the settings section renders
      // a custom product picker UI that writes to these fields.
      {
        id: 'standaloneStripePriceId',
        label: 'Standalone Price',
        type: 'string',
        tab: 'settings',
        category: 'product',
        path: 'standaloneStripePriceId',
        exposable: false,
        hidden: true,
        description: 'Stripe price ID for standalone mode — set via product picker in settings',
      },
      {
        id: 'standaloneProductId',
        label: 'Standalone Product ID',
        type: 'string',
        tab: 'settings',
        category: 'product',
        path: 'standaloneProductId',
        exposable: false,
        hidden: true,
        description: 'Product ID for standalone mode — used for refetching in settings',
      },
      {
        id: 'standaloneProductName',
        label: 'Standalone Product Name',
        type: 'string',
        tab: 'settings',
        category: 'product',
        path: 'standaloneProductName',
        exposable: false,
        hidden: true,
        description: 'Product name for standalone mode — auto-populated by picker',
      },
      {
        id: 'standaloneProductImage',
        label: 'Standalone Product Image',
        type: 'string',
        tab: 'settings',
        category: 'product',
        path: 'standaloneProductImage',
        exposable: false,
        hidden: true,
        description: 'Product image URL for standalone mode',
      },
      {
        id: 'standalonePriceInCents',
        label: 'Standalone Price (cents)',
        type: 'number',
        tab: 'settings',
        category: 'product',
        path: 'standalonePriceInCents',
        exposable: false,
        hidden: true,
        description: 'Price in cents for standalone mode',
      },
      {
        id: 'standaloneCurrency',
        label: 'Standalone Currency',
        type: 'string',
        tab: 'settings',
        category: 'product',
        path: 'standaloneCurrency',
        exposable: false,
        hidden: true,
        description: 'Currency code for standalone mode',
      },
      {
        id: 'standaloneBillingType',
        label: 'Standalone Billing Type',
        type: 'string',
        tab: 'settings',
        category: 'product',
        path: 'standaloneBillingType',
        exposable: false,
        hidden: true,
        description: 'Billing type for standalone mode',
      },
      {
        id: 'standaloneBillingInterval',
        label: 'Standalone Billing Interval',
        type: 'string',
        tab: 'settings',
        category: 'product',
        path: 'standaloneBillingInterval',
        exposable: false,
        hidden: true,
        description: 'Billing interval for standalone recurring products',
      },
      {
        id: 'standaloneIntervalCount',
        label: 'Standalone Interval Count',
        type: 'number',
        tab: 'settings',
        category: 'product',
        path: 'standaloneIntervalCount',
        exposable: false,
        hidden: true,
        description: 'Interval count for standalone recurring products',
      },

      // ----------------------
      // DESIGN TAB
      // ----------------------

      // Dimensions Category
      {
        id: 'width',
        label: 'Width',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'width',
        defaultValue: 200,
        min: 1,
        exposable: true,
        responsive: true,
        showWhen: { property: 'autoWidth', operator: 'notEquals', value: true },
      },
      {
        id: 'height',
        label: 'Height',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'height',
        defaultValue: 48,
        min: 1,
        exposable: true,
        responsive: true,
      },

      // Background Category
      {
        id: 'styles.backgroundColor',
        label: 'Background',
        type: 'color',
        tab: 'design',
        category: 'background',
        path: 'styles.backgroundColor',
        exposable: true,
      },

      // Colors Category
      {
        id: 'styles.color',
        label: 'Text Color',
        type: 'color',
        tab: 'design',
        category: 'colors',
        path: 'styles.color',
        exposable: true,
      },

      // Spacing Category
      {
        id: 'styles.padding',
        label: 'Padding',
        type: 'spacing',
        tab: 'design',
        category: 'spacing',
        path: 'styles.padding',
        exposable: true,
      },

      // Border Category
      {
        id: 'styles.borderRadius',
        label: 'Corners',
        type: 'corners',
        tab: 'design',
        category: 'border',
        path: 'styles.borderRadius',
        defaultValue: '8',
        exposable: true,
      },
      // NOTE: Border width/color/style are NOT listed here as individual properties.
      // Buttons use __borderConfig via BorderControl (same as frames) which is
      // handled in the properties panel's Border section and applied by
      // computeButtonContentStyles → borderConfigToInlineStyles.
    ],
  },

  // ============================================================================
  // CART PROPERTIES
  // ============================================================================
  /**
   * Property registry for the cart element.
   *
   * SOURCE OF TRUTH: CartElement in types.ts
   *
   * The cart element displays a shopping cart button/icon that shows the
   * current cart contents. It shares the same button-like visual structure
   * as add-to-cart-button (label, variant, icon, sizing).
   */
  cart: {
    type: 'cart',
    properties: [
      // ----------------------
      // SETTINGS TAB
      // ----------------------

      // Content Category — Button label and icon configuration
      {
        id: 'label',
        label: 'Label',
        type: 'string',
        tab: 'settings',
        category: 'content',
        path: 'label',
        defaultValue: 'Cart',
        exposable: true,
        description: 'Text displayed on the cart button',
      },
      {
        id: 'variant',
        label: 'Variant',
        type: 'select',
        tab: 'settings',
        category: 'content',
        path: 'variant',
        defaultValue: 'primary',
        exposable: true,
        options: [
          { value: 'primary', label: 'Primary' },
          { value: 'secondary', label: 'Secondary' },
          { value: 'outline', label: 'Outline' },
          { value: 'ghost', label: 'Ghost' },
        ],
        description: 'Visual style variant of the cart button',
      },
      {
        id: 'icon',
        label: 'Icon',
        type: 'string',
        tab: 'settings',
        category: 'content',
        path: 'icon',
        exposable: true,
        placeholder: 'e.g. ShoppingBag',
        description: 'Optional icon name to display alongside the label',
      },
      {
        id: 'iconPosition',
        label: 'Icon Position',
        type: 'select',
        tab: 'settings',
        category: 'content',
        path: 'iconPosition',
        defaultValue: 'before',
        exposable: true,
        options: [
          { value: 'before', label: 'Before' },
          { value: 'after', label: 'After' },
        ],
        description: 'Whether the icon appears before or after the label text',
      },
      {
        id: 'iconSize',
        label: 'Icon Size',
        type: 'number',
        tab: 'settings',
        category: 'content',
        path: 'iconSize',
        defaultValue: 16,
        min: 8,
        max: 48,
        exposable: true,
        description: 'Size of the icon in pixels',
      },

      // Options Category — Layout and visibility toggles
      {
        id: 'autoWidth',
        label: 'Auto Width',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'autoWidth',
        defaultValue: false,
        exposable: true,
        responsive: true,
        description: 'Fill container width instead of fixed pixel width',
      },
      {
        id: 'visible',
        label: 'Visible',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'visible',
        defaultValue: true,
        exposable: true,
        responsive: true,
        description: 'Whether the cart button is visible on the page',
      },

      // ----------------------
      // DESIGN TAB
      // ----------------------

      // Dimensions Category
      {
        id: 'width',
        label: 'Width',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'width',
        defaultValue: 200,
        min: 1,
        exposable: true,
        responsive: true,
        showWhen: { property: 'autoWidth', operator: 'notEquals', value: true },
      },
      {
        id: 'height',
        label: 'Height',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'height',
        defaultValue: 48,
        min: 1,
        exposable: true,
        responsive: true,
      },

      // Background Category
      {
        id: 'styles.backgroundColor',
        label: 'Background',
        type: 'color',
        tab: 'design',
        category: 'background',
        path: 'styles.backgroundColor',
        exposable: true,
      },

      // Colors Category
      {
        id: 'styles.color',
        label: 'Text Color',
        type: 'color',
        tab: 'design',
        category: 'colors',
        path: 'styles.color',
        exposable: true,
      },

      // Border Category
      {
        id: 'styles.borderRadius',
        label: 'Corners',
        type: 'corners',
        tab: 'design',
        category: 'border',
        path: 'styles.borderRadius',
        defaultValue: '8',
        exposable: true,
      },
      // NOTE: Border width/color/style are NOT listed here as individual properties.
      // Cart uses __borderConfig via BorderControl (same as frames/buttons) which is
      // handled in the properties panel's Border section and applied by
      // computeButtonContentStyles → borderConfigToInlineStyles.

      // Spacing Category
      {
        id: 'styles.padding',
        label: 'Padding',
        type: 'spacing',
        tab: 'design',
        category: 'spacing',
        path: 'styles.padding',
        exposable: true,
      },

      // Effects Category
      {
        id: 'styles.opacity',
        label: 'Opacity',
        type: 'number',
        tab: 'design',
        category: 'effects',
        path: 'styles.opacity',
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.1,
        exposable: true,
      },
      {
        id: 'styles.boxShadow',
        label: 'Shadow',
        type: 'string',
        tab: 'design',
        category: 'effects',
        path: 'styles.boxShadow',
        placeholder: '0 4px 6px rgba(0,0,0,0.1)',
        exposable: true,
      },
    ],
  },

  // ============================================================================
  // CHECKOUT PROPERTIES
  // ============================================================================
  /**
   * Property registry for the checkout element.
   *
   * SOURCE OF TRUTH: CheckoutElement in types.ts
   *
   * The checkout element renders the full checkout flow including a cart
   * summary panel and Stripe payment form. It supports light/dark themes,
   * customizable headings, and toggles for cart summary visibility and
   * quantity editing. The testMode property is internal-only (not exposable).
   */
  checkout: {
    type: 'checkout',
    properties: [
      // ----------------------
      // SETTINGS TAB
      // ----------------------

      // Content Category — User-facing text labels
      {
        id: 'cartHeading',
        label: 'Cart Heading',
        type: 'string',
        tab: 'settings',
        category: 'content',
        path: 'cartHeading',
        defaultValue: 'Your Cart',
        exposable: true,
        description: 'Heading displayed above the cart summary section',
      },
      {
        id: 'emptyCartMessage',
        label: 'Empty Cart Message',
        type: 'string',
        tab: 'settings',
        category: 'content',
        path: 'emptyCartMessage',
        defaultValue: 'Your cart is empty',
        exposable: true,
        description: 'Message shown when the cart has no items',
      },
      {
        id: 'paymentHeading',
        label: 'Payment Heading',
        type: 'string',
        tab: 'settings',
        category: 'content',
        path: 'paymentHeading',
        defaultValue: 'Payment',
        exposable: true,
        description: 'Heading displayed above the payment form section',
      },
      {
        id: 'payButtonText',
        label: 'Pay Button Text',
        type: 'string',
        tab: 'settings',
        category: 'content',
        path: 'payButtonText',
        defaultValue: 'Pay Now',
        exposable: true,
        description: 'Text displayed on the submit payment button',
      },

      // Display Category — Cart display toggles
      {
        id: 'showCartSummary',
        label: 'Show Cart Summary',
        type: 'boolean',
        tab: 'settings',
        category: 'display',
        path: 'showCartSummary',
        defaultValue: true,
        exposable: true,
        description: 'Whether the cart summary panel is visible alongside the payment form',
      },
      {
        id: 'allowQuantityChange',
        label: 'Allow Quantity Change',
        type: 'boolean',
        tab: 'settings',
        category: 'display',
        path: 'allowQuantityChange',
        defaultValue: true,
        exposable: true,
        description: 'Whether users can adjust item quantities in the cart summary',
      },

      // Style Category — Theme and appearance
      {
        id: 'theme',
        label: 'Theme',
        type: 'select',
        tab: 'settings',
        category: 'style',
        path: 'theme',
        defaultValue: 'light',
        exposable: true,
        options: [
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ],
        description: 'Color theme for the checkout form',
      },

      // Options Category — Layout and visibility toggles
      {
        id: 'autoWidth',
        label: 'Auto Width',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'autoWidth',
        defaultValue: false,
        exposable: true,
        responsive: true,
        description: 'Fill container width instead of fixed pixel width',
      },
      {
        id: 'visible',
        label: 'Visible',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'visible',
        defaultValue: true,
        exposable: true,
        responsive: true,
        description: 'Whether the checkout element is visible on the page',
      },

      // Redirect Category — Post-payment redirect behavior (NOT exposable)
      {
        id: 'successRedirectEnabled',
        label: 'Redirect on Payment',
        type: 'boolean',
        tab: 'settings',
        category: 'redirect',
        path: 'successRedirectEnabled',
        defaultValue: false,
        exposable: false,
        description: 'Redirect to a page or URL after successful checkout',
      },
      {
        id: 'successRedirectType',
        label: 'Redirect Type',
        type: 'select',
        tab: 'settings',
        category: 'redirect',
        path: 'successRedirectType',
        defaultValue: 'page',
        exposable: false,
        options: [
          { value: 'page', label: 'Website Page' },
          { value: 'url', label: 'External URL' },
        ],
        showWhen: {
          property: 'successRedirectEnabled',
          operator: 'equals',
          value: true,
        },
        description: 'Whether to redirect to an internal page or external URL',
      },
      {
        id: 'successRedirectPageSlug',
        label: 'Redirect Page',
        type: 'string',
        tab: 'settings',
        category: 'redirect',
        path: 'successRedirectPageSlug',
        defaultValue: '',
        exposable: false,
        placeholder: 'thank-you',
        showWhen: {
          property: 'successRedirectType',
          operator: 'equals',
          value: 'page',
        },
        description: 'Slug of the page to redirect to on success',
      },
      {
        id: 'successRedirectUrl',
        label: 'Redirect URL',
        type: 'string',
        tab: 'settings',
        category: 'redirect',
        path: 'successRedirectUrl',
        defaultValue: '',
        exposable: false,
        placeholder: 'https://...',
        showWhen: {
          property: 'successRedirectType',
          operator: 'equals',
          value: 'url',
        },
        description: 'External URL to redirect to on success',
      },
      {
        id: 'successRedirectNewTab',
        label: 'Open in New Tab',
        type: 'boolean',
        tab: 'settings',
        category: 'redirect',
        path: 'successRedirectNewTab',
        defaultValue: false,
        exposable: false,
        showWhen: {
          property: 'successRedirectEnabled',
          operator: 'equals',
          value: true,
        },
        description: 'Open the redirect URL in a new browser tab',
      },

      // ----------------------
      // DESIGN TAB
      // ----------------------

      // Dimensions Category
      {
        id: 'width',
        label: 'Width',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'width',
        defaultValue: 600,
        min: 1,
        exposable: true,
        responsive: true,
        showWhen: { property: 'autoWidth', operator: 'notEquals', value: true },
      },
      {
        id: 'height',
        label: 'Height',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'height',
        defaultValue: 500,
        min: 1,
        exposable: true,
        responsive: true,
      },

      // Border Category
      {
        id: 'styles.borderRadius',
        label: 'Corners',
        type: 'corners',
        tab: 'design',
        category: 'border',
        path: 'styles.borderRadius',
        defaultValue: '8',
        exposable: true,
      },

      // Background Category
      {
        id: 'styles.backgroundColor',
        label: 'Background',
        type: 'color',
        tab: 'design',
        category: 'background',
        path: 'styles.backgroundColor',
        defaultValue: 'transparent',
        exposable: true,
      },

      // Effects Category
      {
        id: 'styles.opacity',
        label: 'Opacity',
        type: 'number',
        tab: 'design',
        category: 'effects',
        path: 'styles.opacity',
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.1,
        exposable: true,
      },
      {
        id: 'styles.boxShadow',
        label: 'Shadow',
        type: 'string',
        tab: 'design',
        category: 'effects',
        path: 'styles.boxShadow',
        placeholder: '0 4px 6px rgba(0,0,0,0.1)',
        exposable: true,
      },
    ],
  },

  // ============================================================================
  // RECEIPT PROPERTIES
  // ============================================================================
  /**
   * Property registry for the receipt element.
   *
   * SOURCE OF TRUTH: ReceiptElement in types.ts, receipt-element-properties
   *
   * The receipt element displays payment receipt data after a successful checkout.
   * Only configurable property is the visual theme (light/dark).
   * All receipt data comes from the transaction service at runtime.
   */
  receipt: {
    type: 'receipt',
    properties: [
      // ----------------------
      // SETTINGS TAB
      // ----------------------

      {
        id: 'theme',
        label: 'Theme',
        type: 'select',
        tab: 'settings',
        category: 'display',
        path: 'theme',
        defaultValue: 'dark',
        exposable: true,
        options: [
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ],
        description: 'Visual theme for the receipt card',
      },
      {
        id: 'visible',
        label: 'Visible',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'visible',
        defaultValue: true,
        exposable: true,
        responsive: true,
        description: 'Whether the receipt element is visible on the page',
      },

      // ----------------------
      // DESIGN TAB
      // ----------------------

      // Dimensions Category
      {
        id: 'width',
        label: 'Width',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'width',
        defaultValue: 560,
        min: 1,
        exposable: true,
        responsive: true,
        showWhen: { property: 'autoWidth', operator: 'notEquals', value: true },
      },
      {
        id: 'height',
        label: 'Height',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'height',
        defaultValue: 400,
        min: 1,
        exposable: true,
        responsive: true,
      },

      // Border Category
      {
        id: 'styles.borderRadius',
        label: 'Corners',
        type: 'corners',
        tab: 'design',
        category: 'border',
        path: 'styles.borderRadius',
        defaultValue: '8',
        exposable: true,
      },

      // Background Category
      {
        id: 'styles.backgroundColor',
        label: 'Background',
        type: 'color',
        tab: 'design',
        category: 'background',
        path: 'styles.backgroundColor',
        defaultValue: 'transparent',
        exposable: true,
      },

      // Effects Category
      {
        id: 'styles.opacity',
        label: 'Opacity',
        type: 'number',
        tab: 'design',
        category: 'effects',
        path: 'styles.opacity',
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.1,
        exposable: true,
      },
      {
        id: 'styles.boxShadow',
        label: 'Shadow',
        type: 'string',
        tab: 'design',
        category: 'effects',
        path: 'styles.boxShadow',
        placeholder: '0 4px 6px rgba(0,0,0,0.1)',
        exposable: true,
      },
    ],
  },

  // ============================================================================
  // FAQ PROPERTIES
  // ============================================================================
  /**
   * Property registry for the faq element.
   *
   * SOURCE OF TRUTH: FaqElement in types.ts, faq-element-properties
   *
   * The FAQ accordion displays collapsible question/answer pairs with an
   * Apple-like minimal design. Properties cover content (items), behavior
   * (multi-open, separator style, icon style), and visual styling.
   *
   * CMS CONNECTIVITY:
   * - `items` is exposable so CMS collections can inject Q&A data
   * - Separator and icon styles are exposable for component customization
   */
  faq: {
    type: 'faq',
    properties: [
      // ----------------------
      // SETTINGS TAB
      // ----------------------

      // Content Category — The FAQ items data (CMS-injectable)
      {
        id: 'items',
        label: 'FAQ Items',
        type: 'string',
        tab: 'settings',
        category: 'content',
        path: 'items',
        defaultValue: [],
        exposable: true,
        description: 'Array of question/answer pairs for the FAQ accordion',
      },

      // Display Category — Controls accordion behavior and appearance
      {
        id: 'allowMultipleOpen',
        label: 'Allow Multiple Open',
        type: 'boolean',
        tab: 'settings',
        category: 'display',
        path: 'allowMultipleOpen',
        defaultValue: false,
        exposable: true,
        description: 'Allow multiple FAQ items to be expanded at the same time',
      },
      {
        id: 'separatorStyle',
        label: 'Separator',
        type: 'select',
        tab: 'settings',
        category: 'display',
        path: 'separatorStyle',
        defaultValue: 'line',
        exposable: true,
        options: [
          { value: 'line', label: 'Line' },
          { value: 'card', label: 'Card' },
          { value: 'none', label: 'None' },
        ],
        description: 'Visual separator style between FAQ items',
      },
      {
        id: 'iconStyle',
        label: 'Icon',
        type: 'select',
        tab: 'settings',
        category: 'display',
        path: 'iconStyle',
        defaultValue: 'chevron',
        exposable: true,
        options: [
          { value: 'chevron', label: 'Chevron' },
          { value: 'plus', label: 'Plus/Minus' },
          { value: 'none', label: 'None' },
        ],
        description: 'Expand/collapse indicator icon style',
      },

      // Options Category — Layout and visibility
      {
        id: 'autoWidth',
        label: 'Auto Width',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'autoWidth',
        defaultValue: true,
        exposable: true,
        responsive: true,
        description: 'Fill container width instead of fixed pixel width',
      },
      {
        id: 'autoHeight',
        label: 'Auto Height',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'autoHeight',
        defaultValue: true,
        exposable: true,
        responsive: true,
        description: 'Grow height to fit content instead of fixed pixel height',
      },
      {
        id: 'visible',
        label: 'Visible',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'visible',
        defaultValue: true,
        exposable: true,
        responsive: true,
        description: 'Whether the FAQ element is visible on the page',
      },

      // ----------------------
      // DESIGN TAB
      // ----------------------

      // Dimensions Category
      {
        id: 'width',
        label: 'Width',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'width',
        defaultValue: 600,
        min: 1,
        exposable: true,
        responsive: true,
        showWhen: { property: 'autoWidth', operator: 'notEquals', value: true },
      },
      {
        id: 'height',
        label: 'Height',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'height',
        defaultValue: 400,
        min: 1,
        exposable: true,
        responsive: true,
        showWhen: { property: 'autoHeight', operator: 'notEquals', value: true },
      },

      // Typography Category — Question text styling
      {
        id: 'styles.fontFamily',
        label: 'Font',
        type: 'string',
        tab: 'design',
        category: 'typography',
        path: 'styles.fontFamily',
        defaultValue: 'Inter',
        exposable: true,
        responsive: true,
      },
      {
        id: 'styles.fontSize',
        label: 'Question Size',
        type: 'string',
        tab: 'design',
        category: 'typography',
        path: 'styles.fontSize',
        defaultValue: '18px',
        exposable: true,
        responsive: true,
        description: 'Font size for question headers',
      },
      {
        id: 'styles.fontWeight',
        label: 'Question Weight',
        type: 'select',
        tab: 'design',
        category: 'typography',
        path: 'styles.fontWeight',
        defaultValue: '600',
        exposable: true,
        responsive: true,
        options: [
          { value: '400', label: 'Regular' },
          { value: '500', label: 'Medium' },
          { value: '600', label: 'Semibold' },
          { value: '700', label: 'Bold' },
        ],
      },
      {
        id: 'styles.__answerFontSize',
        label: 'Answer Size',
        type: 'string',
        tab: 'design',
        category: 'typography',
        path: 'styles.__answerFontSize',
        defaultValue: '16px',
        exposable: true,
        responsive: true,
        description: 'Font size for answer text',
      },

      // Colors Category — Text and divider colors
      {
        id: 'styles.color',
        label: 'Question Color',
        type: 'color',
        tab: 'design',
        category: 'colors',
        path: 'styles.color',
        defaultValue: '#111111',
        exposable: true,
        responsive: true,
        description: 'Color for question header text',
      },
      {
        id: 'styles.__answerColor',
        label: 'Answer Color',
        type: 'color',
        tab: 'design',
        category: 'colors',
        path: 'styles.__answerColor',
        defaultValue: '#6b7280',
        exposable: true,
        responsive: true,
        description: 'Color for answer body text',
      },
      {
        id: 'styles.borderColor',
        label: 'Divider Color',
        type: 'color',
        tab: 'design',
        category: 'colors',
        path: 'styles.borderColor',
        defaultValue: '#e5e7eb',
        exposable: true,
        responsive: true,
        description: 'Color for separator lines between items',
      },

      // Item Background — per-accordion item background color
      {
        id: 'styles.__itemBackgroundColor',
        label: 'Item Background',
        type: 'color',
        tab: 'design',
        category: 'colors',
        path: 'styles.__itemBackgroundColor',
        defaultValue: 'transparent',
        exposable: true,
        responsive: true,
        description: 'Background color for each individual accordion item',
      },

      // Spacing Category
      {
        id: 'styles.padding',
        label: 'Padding',
        type: 'spacing',
        tab: 'design',
        category: 'spacing',
        path: 'styles.padding',
        defaultValue: '0',
        exposable: true,
        responsive: true,
        description: 'Inner spacing around the entire FAQ container',
      },
      {
        id: 'styles.margin',
        label: 'Margin',
        type: 'spacing',
        tab: 'design',
        category: 'spacing',
        path: 'styles.margin',
        defaultValue: '0',
        exposable: true,
        responsive: true,
        description: 'Outer spacing around the FAQ container',
      },
      {
        id: 'styles.gap',
        label: 'Item Gap',
        type: 'number',
        tab: 'design',
        category: 'spacing',
        path: 'styles.gap',
        defaultValue: 0,
        min: 0,
        step: 4,
        exposable: true,
        responsive: true,
        description: 'Space between FAQ items',
      },

      // Background Category — Container-level background
      {
        id: 'styles.backgroundColor',
        label: 'Container BG',
        type: 'color',
        tab: 'design',
        category: 'background',
        path: 'styles.backgroundColor',
        defaultValue: 'transparent',
        exposable: true,
        responsive: true,
        description: 'Background color for the outer FAQ container wrapper',
      },

      // Border Category
      {
        id: 'styles.borderRadius',
        label: 'Corners',
        type: 'corners',
        tab: 'design',
        category: 'border',
        path: 'styles.borderRadius',
        defaultValue: '12px',
        exposable: true,
        responsive: true,
      },

      // Effects Category
      {
        id: 'styles.opacity',
        label: 'Opacity',
        type: 'number',
        tab: 'design',
        category: 'effects',
        path: 'styles.opacity',
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.1,
        exposable: true,
        responsive: true,
      },
    ],
  },

  // ============================================================================
  // STICKY NOTE PROPERTIES
  // ============================================================================
  /**
   * Property registry for the sticky-note element.
   *
   * SOURCE OF TRUTH: StickyNoteElement in types.ts, sticky-note-properties
   *
   * The sticky note is a realistic post-it element with editable text,
   * customizable note color, and CSS-only paper/curl visual effects.
   * Properties cover content (text), appearance (note color, text color),
   * and typography styling.
   */
  'sticky-note': {
    type: 'sticky-note',
    properties: [
      // ----------------------
      // SETTINGS TAB
      // ----------------------

      // Content Category — The editable text on the note
      {
        id: 'content',
        label: 'Text',
        type: 'string',
        tab: 'settings',
        category: 'content',
        path: 'content',
        defaultValue: 'Click to edit...',
        exposable: true,
        description: 'Text content displayed on the sticky note',
      },

      // Display Category — Note and text colors
      {
        id: 'noteColor',
        label: 'Note Color',
        type: 'color',
        tab: 'settings',
        category: 'display',
        path: 'noteColor',
        defaultValue: '#fef08a',
        exposable: true,
        description: 'Background color of the sticky note',
      },
      {
        id: 'textColor',
        label: 'Text Color',
        type: 'color',
        tab: 'settings',
        category: 'display',
        path: 'textColor',
        defaultValue: '#1a1a1a',
        exposable: true,
        description: 'Color of the text on the sticky note',
      },

      // Options Category — Layout and visibility toggles
      {
        id: 'autoWidth',
        label: 'Auto Width',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'autoWidth',
        defaultValue: false,
        exposable: true,
        responsive: true,
        description: 'Fill container width instead of fixed pixel width',
      },
      {
        id: 'visible',
        label: 'Visible',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'visible',
        defaultValue: true,
        exposable: true,
        responsive: true,
        description: 'Whether the sticky note is visible on the page',
      },

      // ----------------------
      // DESIGN TAB
      // ----------------------

      // Dimensions Category
      {
        id: 'width',
        label: 'Width',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'width',
        defaultValue: 240,
        min: 80,
        exposable: true,
        responsive: true,
        showWhen: { property: 'autoWidth', operator: 'notEquals', value: true },
      },
      {
        id: 'height',
        label: 'Height',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'height',
        defaultValue: 240,
        min: 80,
        exposable: true,
        responsive: true,
      },

      // Typography Category
      {
        id: 'styles.fontFamily',
        label: 'Font',
        type: 'string',
        tab: 'design',
        category: 'typography',
        path: 'styles.fontFamily',
        defaultValue: 'Inter',
        exposable: true,
        responsive: true,
      },
      {
        id: 'styles.fontSize',
        label: 'Font Size',
        type: 'number',
        tab: 'design',
        category: 'typography',
        path: 'styles.fontSize',
        defaultValue: 22,
        min: 8,
        max: 72,
        exposable: true,
        responsive: true,
      },
      {
        id: 'styles.fontWeight',
        label: 'Font Weight',
        type: 'select',
        tab: 'design',
        category: 'typography',
        path: 'styles.fontWeight',
        defaultValue: '500',
        exposable: true,
        responsive: true,
        options: [
          { value: '400', label: 'Regular' },
          { value: '500', label: 'Medium' },
          { value: '600', label: 'Semibold' },
          { value: '700', label: 'Bold' },
        ],
      },

      // Spacing Category
      {
        id: 'styles.padding',
        label: 'Padding',
        type: 'spacing',
        tab: 'design',
        category: 'spacing',
        path: 'styles.padding',
        defaultValue: '28px',
        exposable: true,
        responsive: true,
        description: 'Inner spacing around the text content',
      },

      // Effects Category
      {
        id: 'styles.opacity',
        label: 'Opacity',
        type: 'number',
        tab: 'design',
        category: 'effects',
        path: 'styles.opacity',
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.1,
        exposable: true,
        responsive: true,
      },
    ],
  },

  // ============================================================================
  // TIMER / COUNTDOWN PROPERTIES
  // ============================================================================
  /**
   * Property registry for the timer element.
   *
   * SOURCE OF TRUTH: TimerElement in types.ts, timer-element-properties
   *
   * A countdown timer that counts to a target date or for a fixed duration.
   * Features step-counter digit animation and element hide/reveal on expiry.
   *
   * Properties cover:
   * - Settings: timer mode, target date, duration, segments, labels, separator, expiry
   * - Design: typography (font, size, weight, color), label styling, separator color,
   *   background, spacing, border, effects
   */
  timer: {
    type: 'timer',
    properties: [
      // ----------------------
      // SETTINGS TAB
      // ----------------------

      // Content Category — Timer mode and target configuration
      {
        id: 'timerMode',
        label: 'Timer Mode',
        type: 'select',
        tab: 'settings',
        category: 'content',
        path: 'timerMode',
        defaultValue: 'date',
        exposable: true,
        options: [
          { value: 'date', label: 'Date' },
          { value: 'duration', label: 'Duration' },
        ],
        description: 'Count down to a specific date or for a set duration',
      },
      {
        id: 'targetDate',
        label: 'Target Date',
        type: 'string',
        tab: 'settings',
        category: 'content',
        path: 'targetDate',
        defaultValue: '',
        exposable: true,
        description: 'ISO date string to count down to (date mode)',
      },
      {
        id: 'durationSeconds',
        label: 'Duration (seconds)',
        type: 'number',
        tab: 'settings',
        category: 'content',
        path: 'durationSeconds',
        defaultValue: 300,
        min: 1,
        exposable: true,
        description: 'Total seconds for the countdown (duration mode)',
      },

      // Display Category — Segment visibility, labels, separator
      {
        id: 'segments.showDays',
        label: 'Show Days',
        type: 'boolean',
        tab: 'settings',
        category: 'display',
        path: 'segments.showDays',
        defaultValue: true,
        exposable: true,
        description: 'Whether to show the days segment',
      },
      {
        id: 'segments.showHours',
        label: 'Show Hours',
        type: 'boolean',
        tab: 'settings',
        category: 'display',
        path: 'segments.showHours',
        defaultValue: true,
        exposable: true,
        description: 'Whether to show the hours segment',
      },
      {
        id: 'segments.showMinutes',
        label: 'Show Minutes',
        type: 'boolean',
        tab: 'settings',
        category: 'display',
        path: 'segments.showMinutes',
        defaultValue: true,
        exposable: true,
        description: 'Whether to show the minutes segment',
      },
      {
        id: 'segments.showSeconds',
        label: 'Show Seconds',
        type: 'boolean',
        tab: 'settings',
        category: 'display',
        path: 'segments.showSeconds',
        defaultValue: true,
        exposable: true,
        description: 'Whether to show the seconds segment',
      },
      {
        id: 'showLabels',
        label: 'Show Labels',
        type: 'boolean',
        tab: 'settings',
        category: 'display',
        path: 'showLabels',
        defaultValue: true,
        exposable: true,
        description: 'Show text labels below each segment (Days, Hours, etc.)',
      },
      {
        id: 'labelStyle',
        label: 'Label Style',
        type: 'select',
        tab: 'settings',
        category: 'display',
        path: 'labelStyle',
        defaultValue: 'full',
        exposable: true,
        options: [
          { value: 'full', label: 'Full (Days)' },
          { value: 'short', label: 'Short (D)' },
        ],
        description: 'Text format for segment labels',
      },
      {
        id: 'separatorStyle',
        label: 'Separator',
        type: 'select',
        tab: 'settings',
        category: 'display',
        path: 'separatorStyle',
        defaultValue: 'colon',
        exposable: true,
        options: [
          { value: 'colon', label: 'Colon (:)' },
          { value: 'none', label: 'None' },
        ],
        description: 'Separator between time segments',
      },

      // Interaction Category — Expiry actions
      {
        id: 'expiry.hideTimerOnExpiry',
        label: 'Hide Timer on Expiry',
        type: 'boolean',
        tab: 'settings',
        category: 'interaction',
        path: 'expiry.hideTimerOnExpiry',
        defaultValue: false,
        exposable: false,
        description: 'Auto-hide the timer element itself when countdown reaches zero',
      },
      {
        id: 'expiry.hideElementIds',
        label: 'Hide Elements on Expiry',
        type: 'string',
        tab: 'settings',
        category: 'interaction',
        path: 'expiry.hideElementIds',
        defaultValue: [],
        exposable: false,
        description: 'Element IDs to hide when timer expires',
      },
      {
        id: 'expiry.revealElementIds',
        label: 'Reveal Elements on Expiry',
        type: 'string',
        tab: 'settings',
        category: 'interaction',
        path: 'expiry.revealElementIds',
        defaultValue: [],
        exposable: false,
        description: 'Element IDs to reveal when timer expires (start hidden)',
      },

      // Options Category — Layout and visibility
      {
        id: 'autoWidth',
        label: 'Auto Width',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'autoWidth',
        defaultValue: true,
        exposable: true,
        responsive: true,
        description: 'Fill container width instead of fixed pixel width',
      },
      {
        id: 'autoHeight',
        label: 'Auto Height',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'autoHeight',
        defaultValue: true,
        exposable: true,
        responsive: true,
        description: 'Grow height to fit content instead of fixed pixel height',
      },
      {
        id: 'visible',
        label: 'Visible',
        type: 'boolean',
        tab: 'settings',
        category: 'options',
        path: 'visible',
        defaultValue: true,
        exposable: true,
        responsive: true,
        description: 'Whether the timer element is visible on the page',
      },

      // ----------------------
      // DESIGN TAB
      // ----------------------

      // Dimensions Category
      {
        id: 'width',
        label: 'Width',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'width',
        defaultValue: 500,
        min: 1,
        exposable: true,
        responsive: true,
        showWhen: { property: 'autoWidth', operator: 'notEquals', value: true },
      },
      {
        id: 'height',
        label: 'Height',
        type: 'number',
        tab: 'design',
        category: 'dimensions',
        path: 'height',
        defaultValue: 120,
        min: 1,
        exposable: true,
        responsive: true,
        showWhen: { property: 'autoHeight', operator: 'notEquals', value: true },
      },

      // Typography Category — Digit text styling
      {
        id: 'styles.fontFamily',
        label: 'Font',
        type: 'string',
        tab: 'design',
        category: 'typography',
        path: 'styles.fontFamily',
        defaultValue: 'Inter',
        exposable: true,
        responsive: true,
      },
      {
        id: 'styles.fontSize',
        label: 'Digit Size',
        type: 'string',
        tab: 'design',
        category: 'typography',
        path: 'styles.fontSize',
        defaultValue: '48px',
        exposable: true,
        responsive: true,
        description: 'Font size for the countdown digits',
      },
      {
        id: 'styles.fontWeight',
        label: 'Digit Weight',
        type: 'select',
        tab: 'design',
        category: 'typography',
        path: 'styles.fontWeight',
        defaultValue: '700',
        exposable: true,
        responsive: true,
        options: [
          { value: '400', label: 'Regular' },
          { value: '500', label: 'Medium' },
          { value: '600', label: 'Semibold' },
          { value: '700', label: 'Bold' },
          { value: '800', label: 'Extra Bold' },
        ],
      },

      // Colors Category — Digit, label, separator colors
      {
        id: 'styles.color',
        label: 'Digit Color',
        type: 'color',
        tab: 'design',
        category: 'colors',
        path: 'styles.color',
        defaultValue: '#111111',
        exposable: true,
        responsive: true,
        description: 'Color for the countdown digit numbers',
      },
      {
        id: 'styles.__labelColor',
        label: 'Label Color',
        type: 'color',
        tab: 'design',
        category: 'colors',
        path: 'styles.__labelColor',
        defaultValue: '#6b7280',
        exposable: true,
        responsive: true,
        description: 'Color for the segment labels (Days, Hours, etc.)',
      },
      {
        id: 'styles.__labelFontSize',
        label: 'Label Size',
        type: 'string',
        tab: 'design',
        category: 'colors',
        path: 'styles.__labelFontSize',
        defaultValue: '14px',
        exposable: true,
        responsive: true,
        description: 'Font size for the segment labels',
      },
      {
        id: 'styles.__separatorColor',
        label: 'Separator Color',
        type: 'color',
        tab: 'design',
        category: 'colors',
        path: 'styles.__separatorColor',
        defaultValue: '#d1d5db',
        exposable: true,
        responsive: true,
        description: 'Color for the colon separator between segments',
      },

      // Spacing Category
      {
        id: 'styles.padding',
        label: 'Padding',
        type: 'spacing',
        tab: 'design',
        category: 'spacing',
        path: 'styles.padding',
        defaultValue: '24px',
        exposable: true,
        responsive: true,
        description: 'Inner spacing around the timer content',
      },
      {
        id: 'styles.gap',
        label: 'Segment Gap',
        type: 'number',
        tab: 'design',
        category: 'spacing',
        path: 'styles.gap',
        defaultValue: 24,
        min: 0,
        step: 4,
        exposable: true,
        responsive: true,
        description: 'Space between time segments',
      },

      // Background Category
      {
        id: 'styles.backgroundColor',
        label: 'Background',
        type: 'color',
        tab: 'design',
        category: 'background',
        path: 'styles.backgroundColor',
        defaultValue: 'transparent',
        exposable: true,
        responsive: true,
      },

      // Border Category
      {
        id: 'styles.borderRadius',
        label: 'Corners',
        type: 'corners',
        tab: 'design',
        category: 'border',
        path: 'styles.borderRadius',
        defaultValue: '12px',
        exposable: true,
        responsive: true,
      },

      // Effects Category
      {
        id: 'styles.opacity',
        label: 'Opacity',
        type: 'number',
        tab: 'design',
        category: 'effects',
        path: 'styles.opacity',
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.1,
        exposable: true,
        responsive: true,
      },
    ],
  },
}

// ============================================================================
// CATEGORY DISPLAY ORDER - Controls how categories are rendered
// ============================================================================

/**
 * The order in which categories should be displayed in the properties panel.
 * Categories not in this list will appear at the end.
 */
export const CATEGORY_ORDER: Record<PropertyTab, string[]> = {
  settings: ['content', 'link', 'cms', 'display', 'spacing', 'dimensions', 'border', 'options', 'layout', 'animation', 'pagination', 'empty', 'interaction', 'style', 'redirect', 'playback'],
  design: [
    'dimensions',
    'layout',
    'typography',
    'colors',
    'spacing',
    'background',
    'border',
    'effects',
  ],
}

/**
 * Human-readable labels for categories.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  content: 'Content',
  link: 'Link Configuration',
  cms: 'CMS Configuration',
  display: 'Display',
  options: 'Options',
  layout: 'Layout',
  pagination: 'Pagination',
  empty: 'Empty State',
  interaction: 'Interaction',
  style: 'Style',
  dimensions: 'Dimensions',
  typography: 'Typography',
  colors: 'Colors',
  spacing: 'Spacing',
  background: 'Background',
  border: 'Border',
  effects: 'Effects',
  redirect: 'Redirect',
  playback: 'Playback',
  video: 'Video',
  animation: 'Animation',
}
