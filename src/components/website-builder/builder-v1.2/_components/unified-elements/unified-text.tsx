/**
 * ============================================================================
 * UNIFIED TEXT ELEMENT - Single Component for Canvas + Preview Modes
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedText, unified-text-element, text-rendering
 *
 * This component replaces the old split pattern of:
 *   - elements/text-element.tsx (canvas-only, 681 lines)
 *   - renderers/element-renderers/text-element-renderer.tsx (preview-only, 213 lines)
 *
 * It renders text content in BOTH modes using `useRenderMode()` to determine
 * which behaviors to activate:
 *
 *   CANVAS MODE:
 *   - Inline editing (contentEditable, formatting shortcuts, auto-edit on creation)
 *   - Editor chrome is handled externally by ElementWrapper (selection ring,
 *     hover ring, resize handles, labels, dimensions pill)
 *   - Size styles are computed here and passed UP to ElementWrapper via sizeStyleOverrides
 *
 *   PREVIEW MODE:
 *   - Read-only rendering — no editing, no editor chrome, no Redux dispatch
 *   - Position + size styles computed and applied directly to the wrapper div
 *   - Responsive breakpoint-aware property resolution
 *
 *   SHARED (both modes):
 *   - Google Fonts loading via GoogleFontsService
 *   - Text content styles via computeTextContentStyles (single source of truth)
 *   - Gradient border support via useGradientBorder hook
 *   - Rich text rendering via innerHTML
 *
 * ============================================================================
 * ARCHITECTURE NOTE
 * ============================================================================
 *
 * In canvas mode, this component is wrapped by ElementWrapper which handles
 * ALL visual chrome (selection ring, hover ring, resize handles, labels,
 * dimensions pill, drag/hover event handlers). This component only renders
 * the text CONTENT — the div with typography styles and the editable text.
 *
 * In preview mode, this component renders a self-contained wrapper with
 * position and size styles applied directly, since there is no ElementWrapper.
 *
 * ============================================================================
 */

'use client'

import React, { createElement, memo, useState, useRef, useEffect, useCallback, useContext, type Dispatch, type SetStateAction } from 'react'
import { ReactReduxContext } from 'react-redux'
import type { TextElement as TextElementType, BorderConfig, ResizeHandle } from '../../_lib/types'
import {
  useRenderMode,
  updateElement,
  computeTextContentStyles,
  getPropertyValue,
  getStyleValue,
  computeElementPositionStyles,
  /** useElementSizeStyles replaces computeElementSizeStyles — reads ParentFlexDirectionContext automatically */
  useElementSizeStyles,
} from '../../_lib'
import type { AppDispatch } from '../../_lib'
import { GoogleFontsService } from '../../_lib/google-fonts-service'
import { GradientBorderOverlay, useGradientBorder } from '../overlay'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the UnifiedText component.
 *
 * SOURCE OF TRUTH: UnifiedTextProps
 *
 * Canvas-specific props (isSelected, isHovered, onDragStart, etc.) are optional
 * because they are only used in canvas mode. In preview mode these are ignored.
 * The component uses useRenderMode() internally to decide which props matter.
 */
export interface UnifiedTextProps {
  /** The text element data — from Redux in canvas mode, from page data in preview mode */
  element: TextElementType

  /** Whether this element is currently selected (canvas only) */
  isSelected?: boolean

  /** Whether this element is currently hovered (canvas only) */
  isHovered?: boolean

  /**
   * Whether this element is inside a master component (canvas only).
   * When true, ElementWrapper uses purple styling instead of blue.
   */
  isInsideMaster?: boolean

  /** Current viewport zoom level for UI scaling (canvas only) */
  zoom?: number

  /** Handler for drag start from useDrag hook (canvas only) */
  onDragStart?: (e: React.PointerEvent, elementId: string, isModifierHeld?: boolean) => void

  /** Handler for resize start from useResize hook (canvas only) */
  onResizeStart?: (e: React.PointerEvent, elementId: string, handle: ResizeHandle) => void

  /** Handler for mouse enter hover state (canvas only) */
  onHoverStart?: (elementId: string, isModifierHeld: boolean) => void

  /** Handler for mouse leave hover state (canvas only) */
  onHoverEnd?: (elementId: string) => void

  /**
   * Ref containing the ID of an element that should auto-enter edit mode.
   * Set by useTextCreation when creating text via the text tool (T shortcut).
   * If this element's ID matches, it will immediately enter edit mode on mount.
   */
  autoEditElementId?: React.RefObject<string | null>

  /**
   * External editing state — controlled by the parent via useUnifiedTextMeta hook.
   * This allows the parent (canvas rendering layer) to share isEditing with both
   * this component AND the ElementWrapper, so ElementWrapper can:
   *   - Prevent drag during text editing
   *   - Switch cursor from 'grab' to 'text'
   *   - Hide the dimensions pill
   *
   * When not provided (preview mode), editing is always disabled.
   */
  isEditing?: boolean

  /**
   * Setter for the external editing state — passed down from useUnifiedTextMeta.
   * Called when the component enters or exits inline editing mode.
   */
  setIsEditing?: Dispatch<SetStateAction<boolean>>
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Unified text element that renders in both canvas and preview modes.
 *
 * CANVAS MODE renders:
 * - An editable text div with contentEditable support
 * - Formatting keyboard shortcuts (Cmd+B/I/U)
 * - Auto-edit on creation for text tool workflow
 * - Size styles passed to ElementWrapper via return value
 *
 * PREVIEW MODE renders:
 * - A self-contained positioned wrapper with the text content inside
 * - Responsive property resolution via breakpoint
 * - No editing, no interaction handlers
 *
 * USAGE (canvas mode — inside ElementWrapper):
 * ```tsx
 * <ElementWrapper element={element} sizeStyleOverrides={sizeStyles} ...>
 *   <UnifiedText element={element} isSelected={isSelected} autoEditElementId={autoEditRef} />
 * </ElementWrapper>
 * ```
 *
 * USAGE (preview mode — standalone):
 * ```tsx
 * <UnifiedText element={element} />
 * ```
 */
export const UnifiedText = memo(function UnifiedText({
  element,
  isSelected = false,
  autoEditElementId,
  isEditing: externalIsEditing,
  setIsEditing: externalSetIsEditing,
}: UnifiedTextProps) {
  const { mode, breakpoint } = useRenderMode()
  const isCanvas = mode === 'canvas'

  // ========================================================================
  // INLINE EDITING STATE (canvas only)
  // ========================================================================

  /**
   * Whether the text is currently being edited inline.
   *
   * Supports two patterns:
   * 1. CONTROLLED (canvas mode): Parent provides isEditing + setIsEditing via
   *    useUnifiedTextMeta hook, sharing the state with ElementWrapper.
   * 2. UNCONTROLLED (fallback): Component manages its own state. This should
   *    only happen in preview mode where editing is always disabled.
   */
  const [internalIsEditing, internalSetIsEditing] = useState(false)
  const isEditing = externalIsEditing ?? internalIsEditing
  const setIsEditing = externalSetIsEditing ?? internalSetIsEditing

  /** Reference to the content-editable div for focus management */
  const editableRef = useRef<HTMLDivElement>(null)

  /**
   * Redux dispatch — only used in canvas mode for saving edits and
   * toggling formatting. In preview mode this is never called.
   *
   * NOTE: We read dispatch directly from ReactReduxContext instead of using
   * useAppDispatch() because preview/published pages have NO Redux Provider.
   * useAppDispatch() would crash with "could not find react-redux context value".
   * useContext(ReactReduxContext) safely returns null when no Provider exists.
   * The no-op fallback is safe because dispatch is only called in canvas-mode
   * code paths (guarded by isCanvas checks).
   */
  const reduxCtx = useContext(ReactReduxContext)
  const dispatch = (reduxCtx?.store?.dispatch ?? (() => ({}))) as AppDispatch

  // ========================================================================
  // AUTO-EDIT ON MOUNT (canvas only)
  // ========================================================================

  /**
   * Check if this element should auto-enter edit mode on mount.
   * This happens when the element was just created via the text tool (T shortcut).
   *
   * The autoEditElementId ref is set by useTextCreation. We match our ID,
   * clear the ref to prevent re-triggering, and enter edit mode after the
   * element is fully mounted.
   */
  useEffect(() => {
    if (!isCanvas) return
    if (autoEditElementId?.current === element.id) {
      autoEditElementId.current = null
      requestAnimationFrame(() => {
        setIsEditing(true)
      })
    }
  }, [isCanvas, autoEditElementId, element.id])

  // ========================================================================
  // GOOGLE FONT LOADING (both modes)
  // ========================================================================

  /**
   * Load the font when the element mounts or font changes.
   *
   * MIGRATION NOTE: Typography has moved from element properties to styles.
   * We check both for backwards compatibility with existing data:
   * - New location: element.styles.fontFamily
   * - Legacy location: element.fontFamily (deprecated)
   */
  const fontFamily = getStyleValue<string>(element, 'fontFamily', breakpoint, element.fontFamily ?? 'Inter')
  useEffect(() => {
    if (fontFamily) {
      GoogleFontsService.loadFont(fontFamily)
    }
  }, [fontFamily])

  // ========================================================================
  // CONTENT STYLE COMPUTATION (both modes — single source of truth)
  // ========================================================================

  /**
   * Compute text content styles using the shared utility.
   * This ensures canvas and preview render text IDENTICALLY.
   * In canvas mode, isEditing controls cursor and selection styles.
   * In preview mode, isEditing is always false.
   */
  const contentStyle = computeTextContentStyles(
    element,
    isCanvas ? isEditing : false,
    { breakpoint }
  )

  // ========================================================================
  // GRADIENT BORDER SUPPORT (both modes)
  // ========================================================================

  /**
   * Extract border config from styles for gradient border rendering.
   * Uses the useGradientBorder hook to get className and active state.
   */
  const borderConfig = (element.styles as Record<string, unknown>)?.__borderConfig as BorderConfig | undefined
  const gradientBorder = useGradientBorder(element.id, borderConfig)

  // ========================================================================
  // CANVAS-ONLY: INLINE EDITING HANDLERS
  // ========================================================================

  /**
   * Focus the editable element and select all text when entering edit mode.
   * This provides a smooth UX — users can immediately start typing to replace.
   */
  useEffect(() => {
    if (!isCanvas || !isEditing || !editableRef.current) return

    editableRef.current.focus()

    // Select all text for easy replacement
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(editableRef.current)
    selection?.removeAllRanges()
    selection?.addRange(range)
  }, [isCanvas, isEditing])

  /**
   * Handle blur — exit edit mode and persist content changes to Redux.
   * Only updates if content actually changed to avoid unnecessary dispatches.
   * Clears browser text selection to prevent visual artifacts after blur.
   */
  const handleBlur = useCallback(() => {
    if (!isCanvas || !editableRef.current) return

    const newContent = editableRef.current.innerText || ''

    // Only dispatch update if content actually changed
    if (newContent !== element.content) {
      dispatch(
        updateElement({
          id: element.id,
          updates: { content: newContent },
        })
      )
    }

    // Clear browser text selection to prevent visual artifacts
    window.getSelection()?.removeAllRanges()
    setIsEditing(false)
  }, [isCanvas, dispatch, element.id, element.content])

  /**
   * Handle key down — formatting shortcuts and Escape to exit edit mode.
   *
   * FORMATTING SHORTCUTS (Cmd/Ctrl + key):
   * - B: Toggle bold (fontWeight 400 <-> 700)
   * - I: Toggle italic (fontStyle normal <-> italic)
   * - U: Toggle underline (textDecoration none <-> underline)
   *
   * These dispatch Redux actions to update element.styles so formatting
   * persists after exiting edit mode. Browser's default contentEditable
   * formatting is prevented since it only modifies the DOM without syncing
   * to Redux state.
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isCanvas) return

    // Escape: exit edit mode and restore original content
    if (e.key === 'Escape') {
      e.preventDefault()
      window.getSelection()?.removeAllRanges()
      setIsEditing(false)
      if (editableRef.current) {
        editableRef.current.innerText = element.content
      }
      return
    }

    // Only process formatting shortcuts with modifier key held
    const isModifierHeld = e.metaKey || e.ctrlKey
    if (!isModifierHeld) return

    const key = e.key.toLowerCase()

    // Cmd+B: Toggle bold
    if (key === 'b') {
      e.preventDefault()
      const rawWeight = getStyleValue<number | string>(element, 'fontWeight', 'desktop', element.fontWeight ?? 400)
      const currentWeight = typeof rawWeight === 'string' ? parseInt(rawWeight, 10) : (rawWeight ?? 400)
      const newWeight = currentWeight >= 700 ? 400 : 700
      const existingStyles = element.styles ?? {}
      dispatch(
        updateElement({
          id: element.id,
          updates: { styles: { ...existingStyles, fontWeight: newWeight } },
        })
      )
      return
    }

    // Cmd+I: Toggle italic
    if (key === 'i') {
      e.preventDefault()
      const currentStyle = getStyleValue<string>(element, 'fontStyle', 'desktop', 'normal')
      const newStyle = currentStyle === 'italic' ? 'normal' : 'italic'
      const existingStyles = element.styles ?? {}
      dispatch(
        updateElement({
          id: element.id,
          updates: { styles: { ...existingStyles, fontStyle: newStyle } },
        })
      )
      return
    }

    // Cmd+U: Toggle underline
    if (key === 'u') {
      e.preventDefault()
      const currentDecoration = getStyleValue<string>(element, 'textDecoration', 'desktop', 'none')
      const newDecoration = currentDecoration === 'underline' ? 'none' : 'underline'
      const existingStyles = element.styles ?? {}
      dispatch(
        updateElement({
          id: element.id,
          updates: { styles: { ...existingStyles, textDecoration: newDecoration } },
        })
      )
      return
    }
  }, [isCanvas, element, dispatch])

  /**
   * Exit edit mode when element is deselected in canvas mode.
   * Triggers handleBlur to save any pending content changes.
   */
  useEffect(() => {
    if (isCanvas && !isSelected && isEditing) {
      handleBlur()
    }
  }, [isCanvas, isSelected, isEditing, handleBlur])

  // ========================================================================
  // CANVAS-ONLY: DOUBLE-CLICK HANDLER
  // ========================================================================

  /**
   * Handle double-click to enter inline edit mode.
   * This is passed to ElementWrapper's onDoubleClick prop so it fires
   * when the wrapper receives a double-click event.
   */
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!isCanvas) return
    e.stopPropagation()
    e.preventDefault()
    setIsEditing(true)
  }, [isCanvas])

  // ========================================================================
  // TEXT CONTENT RENDERING (shared between both modes)
  // ========================================================================

  /**
   * The inner text content div — shared between canvas and preview modes.
   * Uses computeTextContentStyles for identical rendering in both contexts.
   *
   * In canvas mode, contentEditable is enabled when editing.
   * In preview mode, contentEditable is always disabled.
   */
  const textContent = (
    <div
      ref={isCanvas ? editableRef : undefined}
      className={gradientBorder.className || undefined}
      contentEditable={isCanvas && isEditing}
      suppressContentEditableWarning
      style={{
        ...contentStyle,
        /* Kill transition in canvas — prevents content lagging behind
           handles/selection ring during drag and resize at any zoom level. */
        ...(isCanvas ? { transition: 'none' } : {}),
      }}
      onBlur={isCanvas ? handleBlur : undefined}
      onKeyDown={isCanvas && isEditing ? handleKeyDown : undefined}
      onDoubleClick={isCanvas ? handleDoubleClick : undefined}
    >
      {/* Gradient border CSS overlay — renders ::before pseudo-element styles */}
      {gradientBorder.isActive && (
        <GradientBorderOverlay
          elementId={element.id}
          borderConfig={borderConfig}
          borderRadius={contentStyle.borderRadius}
        />
      )}
      {element.content}
    </div>
  )

  // ========================================================================
  // PREVIEW MODE: Self-contained wrapper with position + size styles
  // ========================================================================

  if (!isCanvas) {
    /** Whether this is a root element (directly on canvas, no parent) */
    const isRoot = element.parentId === null

    /**
     * Compute position and size styles for the preview wrapper.
     * These are the same shared utilities used by ElementWrapper in canvas mode,
     * ensuring consistent positioning across both rendering paths.
     */
    const positionStyles = computeElementPositionStyles(element, isRoot, breakpoint)
    const sizeStyles = useElementSizeStyles(element, breakpoint, {
      autoWidthDefault: true,
      autoHeightDefault: true,
    })

    /**
     * Use the semantic HTML tag for SEO in published/preview mode.
     * Search engines weight h1/h2 differently from p/span — this lets
     * users control their page's heading hierarchy from the builder.
     *
     * IMPORTANT: We render the semantic tag as the SINGLE wrapper element,
     * merging position/size styles with content styles into one tag.
     * Previously we nested <div> inside <Tag> (e.g., <p><div>...</div></p>)
     * which is INVALID HTML — browsers auto-close <p> before <div>, causing
     * hydration mismatches and visual flashing.
     *
     * SOURCE OF TRUTH: TextHtmlTag, SemanticTextTag
     */
    const Tag = element.htmlTag || 'div'

    /**
     * Strip layout-conflicting properties from contentStyle before merging.
     * contentStyle was designed for an INNER div inside a positioned wrapper,
     * so it includes width:'100%', position:'relative', top/right/bottom/left
     * that would override the actual sizing from sizeStyles and positioning
     * from positionStyles if spread last.
     */
    const {
      width: _w, position: _pos,
      top: _t, right: _r, bottom: _b, left: _l,
      overflowX: _ox, overflowY: _oy, zIndex: _z,
      ...contentVisualStyles
    } = contentStyle

    return createElement(
      Tag,
      {
        'data-text-renderer': true,
        'data-element-id': element.id,
        className: gradientBorder.className || undefined,
        style: {
          ...positionStyles,
          ...sizeStyles,
          ...contentVisualStyles,
          /** Reset browser default margins on heading/paragraph tags */
          margin: 0,
        },
      },
      <>
        {gradientBorder.isActive && (
          <GradientBorderOverlay
            elementId={element.id}
            borderConfig={borderConfig}
            borderRadius={contentStyle.borderRadius}
          />
        )}
        {element.content}
      </>
    )
  }

  // ========================================================================
  // CANVAS MODE: Just the content — ElementWrapper handles the chrome
  // ========================================================================

  /**
   * In canvas mode, this component returns ONLY the text content div.
   * The parent ElementWrapper provides:
   * - Position styles (absolute/relative, left/top, transform, zIndex)
   * - Canvas interaction overrides (opacity, cursor, isolation, transition)
   * - Selection/hover ring overlay
   * - Resize handles
   * - Element name label
   * - Dimensions pill
   * - Drag/hover event handlers
   */
  return textContent
})

// ============================================================================
// CANVAS HELPER — Provides sizeStyleOverrides + isEditing for ElementWrapper
// ============================================================================

/**
 * Hook to compute the size style overrides and editing state that
 * ElementWrapper needs when wrapping a UnifiedText component.
 *
 * This is separated from the component because ElementWrapper needs these
 * values as PROPS, not as children. The parent rendering layer calls this
 * hook and passes the result to ElementWrapper's sizeStyleOverrides and
 * isEditing props.
 *
 * USAGE:
 * ```tsx
 * const textMeta = useUnifiedTextMeta(element)
 *
 * <ElementWrapper
 *   element={element}
 *   sizeStyleOverrides={textMeta.sizeStyles}
 *   isEditing={textMeta.isEditing}
 *   onDoubleClick={textMeta.onDoubleClick}
 *   ...
 * >
 *   <UnifiedText element={element} isSelected={isSelected} />
 * </ElementWrapper>
 * ```
 */
export function useUnifiedTextMeta(element: TextElementType) {
  /**
   * Inline editing state — shared between UnifiedText and ElementWrapper.
   *
   * This state MUST live here (in the parent scope) so both the content component
   * (UnifiedText) and the chrome wrapper (ElementWrapper) have access to it:
   *   - ElementWrapper uses isEditing to prevent drag, change cursor, hide dimensions pill
   *   - UnifiedText uses isEditing/setIsEditing to control contentEditable and formatting
   */
  const [isEditing, setIsEditing] = useState(false)

  /**
   * Compute size styles for the text element.
   * Text defaults to autoWidth=true and autoHeight=true for responsive behavior.
   * These are passed to ElementWrapper as sizeStyleOverrides.
   */
  const sizeStyles = useElementSizeStyles(element, 'desktop', {
    autoWidthDefault: true,
    autoHeightDefault: true,
  })

  return { sizeStyles, isEditing, setIsEditing }
}
