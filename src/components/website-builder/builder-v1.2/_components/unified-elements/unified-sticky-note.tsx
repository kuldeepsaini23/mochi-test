/**
 * ============================================================================
 * UNIFIED STICKY NOTE ELEMENT - Single Component for Canvas + Preview Modes
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedStickyNote, unified-sticky-note, sticky-note-rendering
 *
 * Minimal, modern flat sticky note — a solid-color square with clean text
 * and a subtle bottom shadow. No clip-paths, no curls, no gradients.
 * Matches the flat post-it note aesthetic from the design reference.
 *
 * ============================================================================
 * ARCHITECTURE (Editor/Preview)
 * ============================================================================
 *
 * Same unified pattern as UnifiedText:
 *   CANVAS MODE  — contentEditable, ElementWrapper handles chrome
 *   PREVIEW MODE — read-only, self-positioned wrapper
 *
 * ============================================================================
 */

'use client'

import React, {
  memo,
  useState,
  useRef,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { ReactReduxContext } from 'react-redux'
import type {
  StickyNoteElement,
  ResizeHandle,
} from '../../_lib/types'
import {
  useRenderMode,
  updateElement,
  getStyleValue,
  computeElementPositionStyles,
  useElementSizeStyles,
} from '../../_lib'
import type { AppDispatch } from '../../_lib'
import { GoogleFontsService } from '../../_lib/google-fonts-service'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the UnifiedStickyNote component.
 *
 * SOURCE OF TRUTH: UnifiedStickyNoteProps
 *
 * Canvas-specific props (isSelected, isEditing, setIsEditing) are optional
 * because they are only used in canvas mode. In preview mode these are ignored.
 */
export interface UnifiedStickyNoteProps {
  /** The sticky note element data — from Redux in canvas, from page data in preview */
  element: StickyNoteElement

  /** Whether this element is currently selected (canvas only) */
  isSelected?: boolean

  /** Whether this element is currently hovered (canvas only) */
  isHovered?: boolean

  /** Whether this element is inside a master component (canvas only) */
  isInsideMaster?: boolean

  /** Current viewport zoom level for UI scaling (canvas only) */
  zoom?: number

  /** Handler for drag start from useDrag hook (canvas only) */
  onDragStart?: (
    e: React.PointerEvent,
    elementId: string,
    isModifierHeld?: boolean
  ) => void

  /** Handler for resize start from useResize hook (canvas only) */
  onResizeStart?: (
    e: React.PointerEvent,
    elementId: string,
    handle: ResizeHandle
  ) => void

  /** Handler for mouse enter hover state (canvas only) */
  onHoverStart?: (elementId: string, isModifierHeld: boolean) => void

  /** Handler for mouse leave hover state (canvas only) */
  onHoverEnd?: (elementId: string) => void

  /**
   * External editing state — controlled by parent via useUnifiedStickyNoteMeta.
   * Shared with ElementWrapper so it can prevent drag and change cursor.
   */
  isEditing?: boolean

  /** Setter for the external editing state */
  setIsEditing?: Dispatch<SetStateAction<boolean>>
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Unified sticky note element — minimal flat post-it note with a subtle
 * bottom shadow. Clean, modern look with solid background color.
 *
 * CANVAS MODE: Double-click to edit text, Escape to cancel, blur to save.
 * PREVIEW MODE: Static read-only rendering.
 */
export const UnifiedStickyNote = memo(function UnifiedStickyNote({
  element,
  isSelected = false,
  isEditing: externalIsEditing,
  setIsEditing: externalSetIsEditing,
}: UnifiedStickyNoteProps) {
  const { mode, breakpoint } = useRenderMode()
  const isCanvas = mode === 'canvas'

  // ========================================================================
  // INLINE EDITING STATE (canvas only)
  // ========================================================================

  const [internalIsEditing, internalSetIsEditing] = useState(false)
  const isEditing = externalIsEditing ?? internalIsEditing
  const setIsEditing = externalSetIsEditing ?? internalSetIsEditing

  const editableRef = useRef<HTMLDivElement>(null)

  /**
   * Redux dispatch — safe via ReactReduxContext (null in preview mode).
   * No-op fallback is safe because dispatch is only called in canvas paths.
   */
  const reduxCtx = useContext(ReactReduxContext)
  const dispatch = (reduxCtx?.store?.dispatch ?? (() => ({}))) as AppDispatch

  // ========================================================================
  // GOOGLE FONT LOADING (both modes)
  // ========================================================================

  const fontFamily = getStyleValue<string>(
    element,
    'fontFamily',
    breakpoint,
    'Inter'
  )

  useEffect(() => {
    if (fontFamily) {
      GoogleFontsService.loadFont(fontFamily)
    }
  }, [fontFamily])

  // ========================================================================
  // CANVAS-ONLY: FOCUS + SELECT ALL ON EDIT
  // ========================================================================

  useEffect(() => {
    if (!isCanvas || !isEditing || !editableRef.current) return

    editableRef.current.focus()

    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(editableRef.current)
    selection?.removeAllRanges()
    selection?.addRange(range)
  }, [isCanvas, isEditing])

  // ========================================================================
  // CANVAS-ONLY: BLUR HANDLER — Save content to Redux
  // ========================================================================

  const handleBlur = useCallback(() => {
    if (!isCanvas || !editableRef.current) return

    const newContent = editableRef.current.innerText || ''

    if (newContent !== element.content) {
      dispatch(
        updateElement({
          id: element.id,
          updates: { content: newContent },
        })
      )
    }

    window.getSelection()?.removeAllRanges()
    setIsEditing(false)
  }, [isCanvas, dispatch, element.id, element.content, setIsEditing])

  // ========================================================================
  // CANVAS-ONLY: KEYBOARD HANDLER — Escape to cancel
  // ========================================================================

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isCanvas) return

      if (e.key === 'Escape') {
        e.preventDefault()
        window.getSelection()?.removeAllRanges()
        setIsEditing(false)
        if (editableRef.current) {
          editableRef.current.innerText = element.content
        }
      }
    },
    [isCanvas, element.content, setIsEditing]
  )

  // ========================================================================
  // CANVAS-ONLY: EXIT EDIT ON DESELECT
  // ========================================================================

  useEffect(() => {
    if (isCanvas && !isSelected && isEditing) {
      handleBlur()
    }
  }, [isCanvas, isSelected, isEditing, handleBlur])

  // ========================================================================
  // CANVAS-ONLY: DOUBLE-CLICK TO ENTER EDIT MODE
  // ========================================================================

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isCanvas) return
      e.stopPropagation()
      e.preventDefault()
      setIsEditing(true)
    },
    [isCanvas, setIsEditing]
  )

  // ========================================================================
  // VISUAL PROPERTIES — Colors and typography from element data
  // ========================================================================

  const noteColor = element.noteColor ?? '#fef08a'
  const textColor = element.textColor ?? '#1a1a1a'

  const fontSize = getStyleValue<number>(element, 'fontSize', breakpoint, 22)
  const fontWeight = getStyleValue<number | string>(
    element,
    'fontWeight',
    breakpoint,
    500
  )
  const lineHeight = getStyleValue<number | string>(
    element,
    'lineHeight',
    breakpoint,
    1.4
  )
  const padding = getStyleValue<string>(
    element,
    'padding',
    breakpoint,
    '28px'
  )
  const opacity = getStyleValue<number>(element, 'opacity', breakpoint, 1)

  // ========================================================================
  // STICKY NOTE STYLES — Flat, minimal, modern
  // ========================================================================

  const styles = useMemo(() => {
    /**
     * NOTE SURFACE — Flat solid color with a soft bottom shadow.
     * No gradients, no clip-paths, just a clean rectangle.
     */
    const noteSurface: React.CSSProperties = {
      position: 'relative',
      width: '100%',
      height: '100%',
      backgroundColor: noteColor,
      // Subtle shadow along the bottom edge for depth
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.06)',
      borderRadius: '2px',
      opacity,
      // Typography
      fontFamily,
      fontSize,
      fontWeight: typeof fontWeight === 'string' ? parseInt(fontWeight, 10) : fontWeight,
      lineHeight,
      color: textColor,
      padding,
      display: 'flex',
      alignItems: 'flex-start',
      overflow: 'hidden',
    }

    /**
     * TEXT AREA — The editable text content inside the note.
     */
    const textArea: React.CSSProperties = {
      width: '100%',
      height: '100%',
      outline: 'none',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      overflow: 'hidden',
    }

    return { noteSurface, textArea }
  }, [
    noteColor,
    textColor,
    fontFamily,
    fontSize,
    fontWeight,
    lineHeight,
    padding,
    opacity,
  ])

  // ========================================================================
  // CONTENT RENDERING
  // ========================================================================

  const stickyContent = (
    <div
      style={{
        ...styles.noteSurface,
        ...(isCanvas ? { transition: 'none' } : {}),
      }}
      data-sticky-note-body
    >
      {/* Editable text area — double-click to edit in canvas mode */}
      <div
        ref={isCanvas ? editableRef : undefined}
        contentEditable={isCanvas && isEditing}
        suppressContentEditableWarning
        style={{
          ...styles.textArea,
          cursor: isCanvas && isEditing ? 'text' : 'inherit',
        }}
        onBlur={isCanvas ? handleBlur : undefined}
        onKeyDown={isCanvas && isEditing ? handleKeyDown : undefined}
        onDoubleClick={isCanvas ? handleDoubleClick : undefined}
      >
        {element.content}
      </div>
    </div>
  )

  // ========================================================================
  // PREVIEW MODE: Self-contained wrapper with position + size styles
  // ========================================================================

  if (!isCanvas) {
    const isRoot = element.parentId === null
    const positionStyles = computeElementPositionStyles(
      element,
      isRoot,
      breakpoint
    )
    const sizeStyles = useElementSizeStyles(element, breakpoint, {
      autoWidthDefault: false,
      autoHeightDefault: false,
    })

    return (
      <div
        data-sticky-note-renderer
        data-element-id={element.id}
        style={{
          ...positionStyles,
          ...sizeStyles,
        }}
      >
        {stickyContent}
      </div>
    )
  }

  // ========================================================================
  // CANVAS MODE: Content only — ElementWrapper handles the chrome
  // ========================================================================

  return stickyContent
})

// ============================================================================
// CANVAS HELPER — Provides sizeStyleOverrides + isEditing for ElementWrapper
// ============================================================================

/**
 * Hook to compute the size style overrides and editing state that
 * ElementWrapper needs when wrapping a UnifiedStickyNote component.
 *
 * Separated from the component because ElementWrapper needs these values
 * as PROPS. The parent canvas wrapper calls this hook and passes results
 * to both ElementWrapper (sizeStyles, isEditing) and UnifiedStickyNote
 * (isEditing, setIsEditing).
 *
 * USAGE:
 * ```tsx
 * const meta = useUnifiedStickyNoteMeta(element)
 *
 * <ElementWrapper sizeStyleOverrides={meta.sizeStyles} isEditing={meta.isEditing} ...>
 *   <UnifiedStickyNote element={element} isEditing={meta.isEditing} setIsEditing={meta.setIsEditing} />
 * </ElementWrapper>
 * ```
 */
export function useUnifiedStickyNoteMeta(element: StickyNoteElement) {
  /**
   * Inline editing state — shared between UnifiedStickyNote and ElementWrapper.
   * ElementWrapper uses it to prevent drag and switch cursor.
   * UnifiedStickyNote uses it to toggle contentEditable.
   */
  const [isEditing, setIsEditing] = useState(false)

  /**
   * Size styles for the sticky note — fixed dimensions by default.
   * Sticky notes are NOT naturally responsive (unlike FAQ or payment),
   * so autoWidth and autoHeight default to false.
   */
  const sizeStyles = useElementSizeStyles(element, 'desktop', {
    autoWidthDefault: false,
    autoHeightDefault: false,
  })

  return { sizeStyles, isEditing, setIsEditing }
}
