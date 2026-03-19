/**
 * ============================================================================
 * RENDER MODE CONTEXT — Unified Rendering Mode Provider
 * ============================================================================
 *
 * SOURCE OF TRUTH: RenderMode, RenderModeContextValue
 * Keywords: render mode, canvas mode, preview mode, unified renderer, breakpoint
 *
 * This context is the backbone of the unified renderer architecture. Instead of
 * maintaining two separate rendering paths (one for the canvas editor and one
 * for published/preview pages), every element component reads its rendering
 * mode from this context and adjusts its behavior accordingly.
 *
 * WHY THIS EXISTS:
 * ----------------
 * Previously, elements had separate canvas renderers and preview renderers,
 * leading to duplicated logic, divergent behavior, and painful maintenance.
 * The unified approach means each element renders itself once and uses
 * RenderModeContext to decide:
 *   - Whether to show drag handles, selection outlines, etc. (canvas only)
 *   - Whether to resolve navigation links against basePath (preview only)
 *   - Whether to fetch live CMS data or use baked snapshots (preview only)
 *   - Which breakpoint styles to apply (both modes)
 *
 * HOW IT FITS:
 * ------------
 * Canvas wraps its tree with <RenderModeProvider mode="canvas" ...>
 * Published page renderer wraps with <RenderModeProvider mode="preview" ...>
 * Individual elements call useRenderMode() to get the current config.
 *
 * DEFAULTS:
 * ---------
 * If no provider is found (should not happen in practice), the fallback is
 * mode="preview" with breakpoint="desktop" — the safest read-only state.
 *
 * ============================================================================
 */

'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Breakpoint, LocalComponent } from './types'

// ============================================================================
// TYPES
// ============================================================================

/**
 * The two rendering modes an element can be in.
 *
 * - 'canvas': Inside the builder editor — elements are interactive (draggable,
 *   selectable, resizable). Editor chrome (selection outlines, toolbars) is visible.
 * - 'preview': Inside published pages or the builder's preview panel — elements
 *   render as the end user would see them. No editor chrome.
 */
export type RenderMode = 'canvas' | 'preview'

/**
 * The full set of values provided by RenderModeContext.
 *
 * Every field beyond `mode` and `breakpoint` is optional because canvas mode
 * doesn't need preview-specific data (organizationId, basePath, etc.), and
 * preview mode doesn't always have all fields populated.
 */
export interface RenderModeContextValue {
  /** Which rendering mode is active — controls editor chrome visibility and interactivity. */
  mode: RenderMode

  /**
   * Current responsive breakpoint.
   * SOURCE OF TRUTH: Breakpoint type from types.ts ('desktop' | 'mobile')
   */
  breakpoint: Breakpoint

  /**
   * The organization ID that owns this website.
   * Required in preview mode for CMS data fetching and other org-scoped queries.
   * Not needed in canvas mode (the builder already has this via BuilderContext).
   */
  organizationId?: string

  /**
   * Base path prefix for resolving navigation links in preview mode.
   * Example: "/mysite" so a page link "/about" becomes "/mysite/about".
   * Not needed in canvas mode where links are non-functional.
   */
  basePath?: string

  /**
   * Local component definitions for rendering ComponentInstance elements.
   * Keyed by component ID. In preview mode these come from the published page data.
   * In canvas mode these are managed by the builder's component store.
   * SOURCE OF TRUTH: LocalComponent from types.ts
   */
  components?: Record<string, LocalComponent>

  /**
   * Whether e-commerce features are enabled for this website.
   * Controls visibility of cart buttons in navbars and product elements.
   */
  enableEcommerce?: boolean

  /**
   * Baked CMS data snapshots from publish time, keyed by element ID.
   * SmartCMS list elements use these as initial data in preview mode
   * so they can render without making a client-side fetch.
   */
  cmsSnapshots?: Record<string, unknown>

  /**
   * Whether this is rendered inside a BreakpointMobileFrame (canvas mobile preview).
   * When true, elements should NOT use fixed positioning — the frame is a
   * reference-only preview, not a scrollable viewport.
   *
   * SOURCE OF TRUTH: BreakpointFrameFlag, NavbarFixedPositioning
   */
  isBreakpointFrame?: boolean

  /**
   * Map of page IDs to their CMS slug column slugs for dynamic URL resolution.
   * Used by SmartCMS List, Link, and Button elements to resolve the correct
   * slug column when building dynamic page URLs in published/preview mode.
   * In canvas mode, elements use Redux page infos instead.
   *
   * SOURCE OF TRUTH: PageSlugColumnsMap, DynamicUrlSlugResolution
   */
  pageSlugColumns?: Record<string, string>
}

// ============================================================================
// DEFAULT VALUE
// ============================================================================

/**
 * Safe fallback when no provider is present.
 * Uses preview mode (read-only, no editor chrome) at desktop breakpoint.
 * This should never be hit in practice — both canvas and preview paths
 * wrap their trees with RenderModeProvider.
 */
const DEFAULT_VALUE: RenderModeContextValue = {
  mode: 'preview',
  breakpoint: 'desktop',
}

// ============================================================================
// CONTEXT CREATION
// ============================================================================

const RenderModeContext = createContext<RenderModeContextValue>(DEFAULT_VALUE)

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

interface RenderModeProviderProps {
  /** Which rendering mode to activate for all descendant elements. */
  mode: RenderMode

  /** Current responsive breakpoint. Defaults to 'desktop'. */
  breakpoint?: Breakpoint

  /** Organization ID for org-scoped data fetching in preview mode. */
  organizationId?: string

  /** Base path for link resolution in preview mode. */
  basePath?: string

  /** Local component definitions for ComponentInstance rendering. */
  components?: Record<string, LocalComponent>

  /** Whether e-commerce is enabled for this website. */
  enableEcommerce?: boolean

  /** Baked CMS data keyed by element ID for preview-time rendering. */
  cmsSnapshots?: Record<string, unknown>

  /** Whether this is inside a BreakpointMobileFrame (canvas mobile reference view). */
  isBreakpointFrame?: boolean

  /** Map of page IDs to CMS slug column slugs for dynamic URL resolution in published mode. */
  pageSlugColumns?: Record<string, string>

  children: ReactNode
}

/**
 * Wraps a subtree to declare its rendering mode and provide mode-specific data.
 *
 * USAGE:
 * ```tsx
 * // In the canvas editor:
 * <RenderModeProvider mode="canvas" breakpoint={currentBreakpoint}>
 *   <UnifiedElementTree ... />
 * </RenderModeProvider>
 *
 * // In the published page renderer:
 * <RenderModeProvider
 *   mode="preview"
 *   breakpoint="desktop"
 *   organizationId={orgId}
 *   basePath={`/${domain}`}
 *   components={pageComponents}
 *   cmsSnapshots={snapshots}
 *   enableEcommerce={hasStripeConnect}
 * >
 *   <UnifiedElementTree ... />
 * </RenderModeProvider>
 * ```
 */
export function RenderModeProvider({
  mode,
  breakpoint = 'desktop',
  organizationId,
  basePath,
  components,
  enableEcommerce,
  cmsSnapshots,
  isBreakpointFrame,
  pageSlugColumns,
  children,
}: RenderModeProviderProps) {
  /**
   * Memoize the context value to prevent unnecessary re-renders.
   * Only recomputes when one of the provided values actually changes.
   */
  const value = useMemo<RenderModeContextValue>(
    () => ({
      mode,
      breakpoint,
      organizationId,
      basePath,
      components,
      enableEcommerce,
      cmsSnapshots,
      isBreakpointFrame,
      pageSlugColumns,
    }),
    [mode, breakpoint, organizationId, basePath, components, enableEcommerce, cmsSnapshots, isBreakpointFrame, pageSlugColumns]
  )

  return (
    <RenderModeContext.Provider value={value}>
      {children}
    </RenderModeContext.Provider>
  )
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Primary hook to access the full render mode context.
 *
 * Returns all rendering configuration — mode, breakpoint, and preview-specific
 * data like organizationId, basePath, components, etc.
 *
 * Unlike BuilderContext, this does NOT throw when used outside a provider.
 * It returns the safe DEFAULT_VALUE (preview + desktop) instead, because
 * element components may be rendered in isolation during testing or SSR.
 *
 * USAGE:
 * ```tsx
 * const { mode, breakpoint, organizationId } = useRenderMode()
 *
 * if (mode === 'canvas') {
 *   // Show drag handle overlay
 * }
 * ```
 */
export function useRenderMode(): RenderModeContextValue {
  return useContext(RenderModeContext)
}

/**
 * Convenience hook — returns true when rendering inside the canvas editor.
 *
 * Use this in elements that need a simple boolean guard for editor-only
 * behavior (e.g., showing selection outlines, enabling drag-and-drop).
 *
 * USAGE:
 * ```tsx
 * const isCanvas = useIsCanvasMode()
 * return (
 *   <div>
 *     {isCanvas && <DragHandle />}
 *     <ActualContent />
 *   </div>
 * )
 * ```
 */
export function useIsCanvasMode(): boolean {
  const { mode } = useContext(RenderModeContext)
  return mode === 'canvas'
}

/**
 * Convenience hook — returns true when rendering in preview/published mode.
 *
 * Use this in elements that need a simple boolean guard for preview-only
 * behavior (e.g., resolving navigation links, fetching live CMS data).
 *
 * USAGE:
 * ```tsx
 * const isPreview = useIsPreviewMode()
 * if (isPreview) {
 *   // Resolve href against basePath for real navigation
 * }
 * ```
 */
export function useIsPreviewMode(): boolean {
  const { mode } = useContext(RenderModeContext)
  return mode === 'preview'
}
