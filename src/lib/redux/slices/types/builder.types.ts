/**
 * Website Builder - Type Definitions (Frontend Only)
 *
 * WHY: Strict TypeScript types for the website builder Redux state
 * HOW: Discriminated unions for type-safe element handling
 *
 * ARCHITECTURE (REFACTORED - Single Source of Truth):
 * - Only `elements` Record exists - no more canvasFrames/canvasElements arrays
 * - Hierarchy defined by parentId and order fields
 * - Frames are auto-layout containers (flex/grid) - children stack naturally
 * - Root elements (parentId = null) use absolute positioning on canvas
 * - Nested elements use relative positioning within parent's flex/grid
 *
 * ELEMENT TYPES:
 * - frame: Container element (auto-layout flex/grid)
 * - page: Top-level page container (special frame)
 * - button: Interactive button
 * - text: Text content
 * - link: Hyperlink
 * - input: Form input
 * - image: Image
 */

import type { CSSProperties } from 'react'

// ========================================
// ELEMENT TYPE UNIONS
// ========================================

/**
 * All supported element types
 */
export type ElementType = 'frame' | 'page' | 'button' | 'text' | 'link' | 'input' | 'image'

/**
 * Container element types (can have children)
 */
export type ContainerType = 'frame' | 'page'

/**
 * Leaf element types (cannot have children)
 */
export type LeafType = 'button' | 'text' | 'link' | 'input' | 'image'

// ========================================
// BASE WEBSITE ELEMENT
// ========================================

/**
 * Base interface for all website builder elements
 *
 * POSITIONING RULES:
 * - Root elements (parentId = null): Use x, y for absolute canvas position
 * - Nested elements (parentId = frameId): Ignore x, y - positioned by parent's flex/grid
 *
 * INCLUDES:
 * - Position (x, y) - only meaningful for root elements
 * - Size (width, height) - can be 'auto' for nested elements
 * - Hierarchy (parentId, order)
 * - Styling (styles as CSSProperties)
 * - Class names (for Tailwind/custom CSS)
 */
export interface WebsiteElement {
  // IDENTITY
  id: string
  type: ElementType

  // POSITION & SIZE
  // For root elements: absolute canvas position
  // For nested elements: ignored (parent's flex/grid controls layout)
  x: number
  y: number
  width: number
  height: number

  // HIERARCHY
  parentId: string | null // Parent element ID (null for root/page)
  order: number // Stacking order within parent (0, 1, 2...)

  // STYLING
  styles: CSSProperties // React CSS properties (strict typed)
  classNames?: string[] // Tailwind/custom CSS classes

  // VISIBILITY & INTERACTION
  visible: boolean // Is element visible
  locked: boolean // Is element locked (prevent editing)
}

// ========================================
// SPECIFIC ELEMENT TYPES
// ========================================

/**
 * Frame Element (Auto-Layout Container)
 *
 * ARCHITECTURE:
 * - Frames are ALWAYS auto-layout containers (flex or grid)
 * - Children stack naturally based on flexDirection
 * - No absolute positioning inside frames
 *
 * Properties:
 * - tag: HTML tag to render as
 * - flexDirection: Stack direction (column = vertical, row = horizontal)
 * - gap: Space between children
 * - alignItems: Cross-axis alignment
 * - justifyContent: Main-axis alignment
 */
export interface FrameElement extends WebsiteElement {
  type: 'frame'
  properties: {
    tag: 'div' | 'section' | 'article' | 'header' | 'footer' | 'nav' | 'main' | 'aside'
    flexDirection: 'column' | 'row' // How children stack
    gap: number // Gap between children in pixels
    alignItems: 'flex-start' | 'center' | 'flex-end' | 'stretch'
    justifyContent: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around'
    padding: number // Inner padding in pixels
  }
}

/**
 * Page Element (Top-level container - special frame)
 *
 * Pages are like frames but represent entire pages.
 * They have the same auto-layout properties plus page-specific metadata.
 */
export interface PageElement extends WebsiteElement {
  type: 'page'
  properties: {
    name: string // e.g., "Home", "About"
    slug: string // e.g., "/", "/about"
    // Auto-layout properties (same as frame)
    flexDirection: 'column' | 'row'
    gap: number
    alignItems: 'flex-start' | 'center' | 'flex-end' | 'stretch'
    justifyContent: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around'
    padding: number
  }
}

/**
 * Button Element
 */
export interface ButtonElement extends WebsiteElement {
  type: 'button'
  properties: {
    text: string
    variant: 'primary' | 'secondary' | 'outline' | 'ghost'
    size: 'sm' | 'md' | 'lg'
    href?: string
    target?: '_self' | '_blank'
  }
}

/**
 * Text Element
 */
export interface TextElement extends WebsiteElement {
  type: 'text'
  properties: {
    content: string
    tag: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'span' | 'div'
  }
}

/**
 * Link Element
 */
export interface LinkElement extends WebsiteElement {
  type: 'link'
  properties: {
    text: string
    href: string
    target: '_self' | '_blank'
  }
}

/**
 * Input Element
 */
export interface InputElement extends WebsiteElement {
  type: 'input'
  properties: {
    inputType: 'text' | 'email' | 'password' | 'number'
    placeholder?: string
    name: string
  }
}

/**
 * Image Element
 */
export interface ImageElement extends WebsiteElement {
  type: 'image'
  properties: {
    src: string
    alt: string
    objectFit: 'contain' | 'cover' | 'fill'
  }
}

// ========================================
// DISCRIMINATED UNION
// ========================================

/**
 * All element types as discriminated union
 * Allows TypeScript to narrow types based on element.type
 */
export type AnyWebsiteElement =
  | FrameElement
  | PageElement
  | ButtonElement
  | TextElement
  | LinkElement
  | InputElement
  | ImageElement

// ========================================
// BUILDER STATE (REFACTORED - Single Source of Truth)
// ========================================

/**
 * Redux state shape for website builder
 *
 * ARCHITECTURE (REFACTORED - Single Source of Truth):
 * - Only `elements` Record exists - NO more canvasFrames/canvasElements arrays
 * - Hierarchy defined by parentId and order fields
 * - Root elements rendered with absolute positioning on canvas
 * - Nested elements rendered by parent's flex/grid layout
 *
 * BENEFITS:
 * - No sync issues between dual data structures
 * - Simpler code, fewer bugs
 * - Easier to extend with new element types
 */
export interface BuilderState {
  // ========================================
  // SINGLE SOURCE OF TRUTH
  // ========================================
  /**
   * All elements stored by ID for O(1) lookup
   * This is the ONLY place element data lives
   */
  elements: Record<string, AnyWebsiteElement>

  /**
   * IDs of root-level elements (parentId = null)
   * Used for quick iteration over canvas-level elements
   */
  rootElementIds: string[]

  // ========================================
  // SELECTION
  // ========================================
  selectedElementId: string | null

  // ========================================
  // CANVAS STATE (zoom, pan)
  // ========================================
  canvas: {
    zoom: number // 0.1 to 2.0 (10% to 200%)
    panX: number // Pan offset X
    panY: number // Pan offset Y
    isPanning: boolean // Is user currently panning
    panStart: { x: number; y: number } | null // Pan start coordinates
  }

  // ========================================
  // UI STATE
  // ========================================
  isPageCentered: boolean // Has page been centered on mount

  // ========================================
  // TOOL STATE
  // ========================================
  activeTool: 'pointer' | 'frame' | 'text' // Currently active tool in bottom toolbar
}

// ========================================
// LEGACY TYPES (kept for migration, will be removed)
// ========================================

/**
 * @deprecated Use elements Record instead. Kept for backwards compatibility during migration.
 */
export interface TreeItem {
  id: string | number
  children: TreeItem[]
  collapsed?: boolean
  isContainer: boolean
  isMainElement: boolean
}

/**
 * @deprecated Use elements Record instead. Kept for backwards compatibility during migration.
 */
export interface CanvasFrameData {
  id: string
  x: number
  y: number
  width?: number
  height?: number
  label: string
  frameTree: TreeItem
  isPage?: boolean
}

/**
 * @deprecated Use elements Record instead. Kept for backwards compatibility during migration.
 */
export interface CanvasElementData {
  id: string
  x: number
  y: number
  type: 'frame' | 'element'
  label: string
  customProperties?: {
    backgroundColor?: string
    textColor?: string
    fontSize?: string
    [key: string]: string | number | boolean | undefined
  }
}
