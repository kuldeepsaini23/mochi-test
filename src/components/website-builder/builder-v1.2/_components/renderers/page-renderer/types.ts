/**
 * ============================================================================
 * PAGE RENDERER - Types & Interfaces
 * ============================================================================
 *
 * SOURCE OF TRUTH: Page Renderer Types
 *
 * Type definitions for the PageRenderer component and its child renderers.
 * These types are used throughout the page-renderer module for consistent
 * type-safe rendering of elements in preview/published mode.
 *
 * ============================================================================
 */

import type {
  Breakpoint,
  CanvasElement,
  LocalComponent,
} from '../../../_lib/types'

/**
 * Props for the main PageRenderer component.
 * This is the top-level component that renders a complete page from element data.
 */
export interface PageRendererProps {
  /**
   * Array of elements to render (page element + all its descendants).
   * This is the ONLY required data - everything else is derived internally.
   */
  elements: CanvasElement[]
  /** Optional className for the container */
  className?: string
  /** Optional style overrides for the container */
  style?: React.CSSProperties
  /**
   * Optional breakpoint for responsive style computation.
   * When set to 'mobile', elements use their responsive style overrides.
   * @default 'desktop'
   */
  breakpoint?: Breakpoint
  /**
   * Optional map of LocalComponents for rendering component instances.
   * Required for published pages where components aren't loaded via Redux.
   * Each component is keyed by its ID.
   */
  components?: Record<string, LocalComponent>
  /**
   * Optional organizationId for CMS data fetching.
   * Required for published pages with SmartCMS List elements.
   * In builder mode, this is obtained from BuilderContext instead.
   */
  organizationId?: string
  /**
   * Optional base path for navigation links.
   * Used for smart routing in sidebar/navbar links.
   *
   * CONTEXT-AWARE ROUTING:
   * - Public sites: Pass the domain path (e.g., "/webprodigies")
   * - Preview mode: Pass the preview base path
   * - Builder mode: Not needed (links are not clickable in editor)
   *
   * When set, internal page links (e.g., "/about") will be prefixed
   * with this basePath (e.g., "/webprodigies/about").
   * External links (starting with http:// or https://) are unaffected.
   */
  basePath?: string
  /**
   * Baked CMS data for SmartCMS List elements, keyed by element ID.
   * When present, SmartCMS List elements render instantly without client-side fetch.
   * Populated at publish time by publishPage(). Optional for backward compatibility.
   */
  cmsSnapshots?: Record<string, unknown>
  /**
   * Whether e-commerce is enabled for this website.
   * Gates cart button visibility in PreBuilt navbar elements.
   * SOURCE OF TRUTH: Website.enableEcommerce in Prisma schema.
   */
  enableEcommerce?: boolean
  /**
   * Whether this is rendered inside a BreakpointMobileFrame (canvas mobile reference view).
   * When true, navbar does NOT use fixed positioning — the frame is not a real viewport.
   * SOURCE OF TRUTH: BreakpointFrameFlag, NavbarFixedPositioning
   */
  isBreakpointFrame?: boolean
  /**
   * Map of page IDs to their CMS slug column slugs for dynamic URL resolution.
   * Used by SmartCMS List, Link, and Button elements to build SEO-friendly URLs
   * in published mode where Redux page infos are unavailable.
   *
   * SOURCE OF TRUTH: PageSlugColumnsMap, DynamicUrlSlugResolution
   */
  pageSlugColumns?: Record<string, string>
}

/**
 * Props for the ElementRenderer component.
 * This component recursively renders elements based on their type.
 */
export interface ElementRendererProps {
  /** The element to render */
  element: CanvasElement
  /** All elements indexed by ID (for looking up children) */
  elementsMap: Record<string, CanvasElement>
  /** Children map for O(1) child lookup (derived from parentId) */
  childrenMap: Record<string, string[]>
  /** Breakpoint for responsive style computation */
  breakpoint: Breakpoint
  /** Optional map of LocalComponents for rendering component instances */
  components?: Record<string, LocalComponent>
  /** Optional organizationId for CMS data fetching */
  organizationId?: string
  /** Optional base path for navigation links (context-aware routing) */
  basePath?: string
  /** Baked CMS data for SmartCMS List elements, keyed by element ID */
  cmsSnapshots?: Record<string, unknown>
  /** Whether e-commerce is enabled for this website — gates navbar cart button */
  enableEcommerce?: boolean
}

/**
 * Result of building lookup structures from elements array.
 * Used internally by PageRenderer to efficiently traverse the element tree.
 */
export interface LookupStructures {
  /** Map of element ID to element for O(1) lookup */
  elementsMap: Record<string, CanvasElement>
  /** Array of root element IDs (elements with no parent) */
  rootIds: string[]
  /** Map of parent ID to array of child IDs */
  childrenMap: Record<string, string[]>
}
