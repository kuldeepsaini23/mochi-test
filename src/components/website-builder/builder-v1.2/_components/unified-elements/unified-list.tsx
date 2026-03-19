/**
 * ============================================================================
 * UNIFIED LIST ELEMENT - Single Component for Canvas + Preview Rendering
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedList, unified-list, list-element-unified
 *
 * Renders a bulleted list element in BOTH canvas (editor) and preview
 * (published) modes. Each list item displays an icon bullet (from the
 * shared icon library — same as buttons) followed by text content.
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * CONTENT-ONLY in canvas mode — the parent `ElementWrapper` handles all
 * editor chrome (selection ring, hover ring, resize handles, labels).
 *
 * In preview mode, this component wraps content in a positioned container
 * with its own size/position styles for published page layout.
 *
 * ============================================================================
 * KEY BEHAVIORS
 * ============================================================================
 *
 * BOTH MODES:
 *   - Icon bullets rendered via IconRenderer (same library as button icons)
 *   - Google Font loading for list text
 *   - Configurable gap between items
 *   - Responsive style support (font, color, size, padding, margin)
 *
 * CANVAS MODE (mode='canvas'):
 *   - Items are editable via contentEditable spans
 *   - Enter key on the last item creates a new list item
 *   - Backspace on an empty item removes it
 *   - Content rendered as a plain list
 *
 * PREVIEW MODE (mode='preview'):
 *   - Static display, no editing
 *   - Self-positioned wrapper for page layout
 *
 * ============================================================================
 */

'use client'

import React, { useEffect, useCallback, useRef } from 'react'
import type { ListElement, ListItem, Breakpoint, BorderConfig } from '../../_lib/types'
import { getStyleValue, useRenderMode } from '../../_lib'
import {
  computeElementPositionStyles,
  useElementSizeStyles,
} from '../../_lib/shared-element-styles'
import { GoogleFontsService } from '../../_lib/google-fonts-service'
import { IconRenderer } from '@/lib/icons'
import { GradientBorderOverlay, useGradientBorder } from '../overlay'
import { useAppDispatch, updateElement } from '../../_lib'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the UnifiedList component.
 *
 * SOURCE OF TRUTH: UnifiedListProps
 */
export interface UnifiedListProps {
  /** The list element data — SOURCE OF TRUTH: ListElement from types.ts */
  element: ListElement
}

// ============================================================================
// SIZE META HOOK — Bridge for canvas wrapper sizing
// ============================================================================

/**
 * Computes list-specific size styles for the canvas wrapper.
 *
 * SOURCE OF TRUTH: useUnifiedListMeta, list-meta-hook
 *
 * List elements default to autoWidth=true (fill parent) and
 * autoHeight=true (grow with content) since content length varies.
 */
export function useUnifiedListMeta(element: ListElement) {
  const baseSizeStyles = useElementSizeStyles(element, 'desktop', {
    autoWidthDefault: true,
    autoHeightDefault: true,
  })

  /**
   * Merge base size styles with list-specific constraints:
   * - minWidth: 200px prevents collapse on narrow parents
   * - maxWidth: When autoWidth, use element.width as the max
   */
  const hasAutoWidth = element.autoWidth ?? true
  const sizeStyles = {
    ...baseSizeStyles,
    minWidth: baseSizeStyles.minWidth ?? 200,
    maxWidth: hasAutoWidth ? element.width : undefined,
  }

  return { sizeStyles }
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Unified list element that renders in both canvas and preview modes.
 *
 * CONTENT-ONLY in canvas mode — ElementWrapper handles chrome.
 * SELF-WRAPPING in preview mode — includes positioned container.
 *
 * Uses the same icon library as buttons (IconRenderer) for bullet icons.
 * The icon set in settings applies uniformly to all list item bullets.
 */
export function UnifiedList({ element }: UnifiedListProps) {
  const { mode, breakpoint } = useRenderMode()
  const isPreview = mode === 'preview'
  const activeBreakpoint: Breakpoint = isPreview ? breakpoint : 'desktop'

  // ==========================================================================
  // GOOGLE FONT LOADING
  // ==========================================================================

  const fontFamily = getStyleValue<string>(
    element,
    'fontFamily',
    activeBreakpoint,
    'Inter'
  )

  useEffect(() => {
    if (fontFamily) {
      GoogleFontsService.loadFont(fontFamily)
    }
  }, [fontFamily])

  // ==========================================================================
  // GRADIENT BORDER SUPPORT
  // ==========================================================================

  const borderConfig = (element.styles as Record<string, unknown>)?.__borderConfig as BorderConfig | undefined
  const gradientBorder = useGradientBorder(element.id, borderConfig)

  // ==========================================================================
  // STYLE COMPUTATION
  // ==========================================================================

  /** Resolve responsive style values for the list container */
  const backgroundColor = getStyleValue<string>(element, 'backgroundColor', activeBreakpoint, 'transparent')
  const borderRadius = getStyleValue<string>(element, 'borderRadius', activeBreakpoint, '0')
  const padding = getStyleValue<string>(element, 'padding', activeBreakpoint, '0')
  const margin = getStyleValue<string>(element, 'margin', activeBreakpoint, '0')

  /** Resolve text styling */
  const color = getStyleValue<string>(element, 'color', activeBreakpoint, '#111111')
  const fontSize = getStyleValue<string | number>(element, 'fontSize', activeBreakpoint, 16)
  const fontWeight = getStyleValue<string | number>(element, 'fontWeight', activeBreakpoint, 400)
  const lineHeight = getStyleValue<string | number>(element, 'lineHeight', activeBreakpoint, 1.6)

  /** List-specific values */
  const iconSize = element.iconSize ?? 16
  const iconColor = element.iconColor ?? color ?? '#111111'
  const itemGap = element.itemGap ?? 8
  const iconName = element.icon || 'Check'

  // ==========================================================================
  // CONTAINER STYLES
  // ==========================================================================

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: `${itemGap}px`,
    backgroundColor,
    borderRadius,
    padding,
    margin,
    fontFamily,
    fontSize: typeof fontSize === 'number' ? `${fontSize}px` : fontSize,
    fontWeight: Number(fontWeight),
    color,
    lineHeight,
    width: '100%',
    boxSizing: 'border-box',
    ...(!isPreview ? { transition: 'none' } : {}),
  }

  // ==========================================================================
  // CONTENT RENDERER (shared between all modes)
  // ==========================================================================

  const renderListContent = () => (
    <div
      data-element-content={element.id}
      className={gradientBorder.className || undefined}
      style={containerStyle}
    >
      {/* Gradient border overlay */}
      {gradientBorder.isActive && (
        <GradientBorderOverlay
          elementId={element.id}
          borderConfig={borderConfig}
          borderRadius={containerStyle.borderRadius}
        />
      )}

      {element.items.map((item, index) => (
        <ListItemRow
          key={item.id}
          item={item}
          index={index}
          element={element}
          iconName={iconName}
          iconSize={iconSize}
          iconColor={iconColor}
          isPreview={isPreview}
        />
      ))}

      {/* Show placeholder when list is empty */}
      {element.items.length === 0 && (
        <div style={{ opacity: 0.4, fontStyle: 'italic' }}>
          Empty list — add items in settings
        </div>
      )}
    </div>
  )

  // ==========================================================================
  // CANVAS MODE — Return content only (ElementWrapper handles chrome)
  // ==========================================================================

  if (!isPreview) {
    return renderListContent()
  }

  // ==========================================================================
  // PREVIEW MODE — Positioned wrapper for published page layout
  // ==========================================================================

  const isRoot = element.parentId === null
  const positionStyles = computeElementPositionStyles(element, isRoot, activeBreakpoint)
  const sizeStyles = useElementSizeStyles(element, activeBreakpoint, {
    autoWidthDefault: true,
    autoHeightDefault: true,
  })

  return (
    <div
      data-list-renderer
      data-element-id={element.id}
      style={{
        ...positionStyles,
        ...sizeStyles,
      }}
    >
      {renderListContent()}
    </div>
  )
}

// ============================================================================
// LIST ITEM ROW — Individual list item with icon bullet and text
// ============================================================================

interface ListItemRowProps {
  /** The list item data */
  item: ListItem
  /** Index of this item in the list */
  index: number
  /** Parent list element (for dispatching updates) */
  element: ListElement
  /** Icon name from settings */
  iconName: string
  /** Icon size in pixels */
  iconSize: number
  /** Icon color */
  iconColor: string
  /** Whether we're in preview (non-editable) mode */
  isPreview: boolean
}

/**
 * Renders a single list item: icon bullet + text content.
 *
 * Delegates to either CanvasListItemRow (editable, uses Redux dispatch)
 * or PreviewListItemRow (static, no Redux dependency) based on isPreview.
 * This split avoids calling useAppDispatch on published pages where
 * no Redux Provider exists.
 */
function ListItemRow(props: ListItemRowProps) {
  if (props.isPreview) {
    return <PreviewListItemRow {...props} />
  }
  return <CanvasListItemRow {...props} />
}

/**
 * Preview-mode list item — static icon + text, no Redux dependency.
 * Safe to render on published pages without a Redux Provider.
 */
function PreviewListItemRow({
  item,
  iconName,
  iconSize,
  iconColor,
}: ListItemRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
      }}
    >
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          marginTop: '0.2em',
        }}
      >
        <IconRenderer
          name={iconName}
          style={{
            width: iconSize,
            height: iconSize,
            color: iconColor,
          }}
        />
      </div>
      <span style={{ flex: 1 }}>{item.text}</span>
    </div>
  )
}

/**
 * Canvas-mode list item — editable text with Redux dispatch.
 * Enter key creates a new item below; Backspace on empty removes the item.
 */
function CanvasListItemRow({
  item,
  index,
  element,
  iconName,
  iconSize,
  iconColor,
}: ListItemRowProps) {
  const dispatch = useAppDispatch()
  const textRef = useRef<HTMLSpanElement>(null)

  /**
   * Handle keydown events for list item editing:
   * - Enter: Create a new list item after this one
   * - Backspace on empty: Remove this item (if not the only one)
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLSpanElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        const newItem: ListItem = {
          id: `li_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          text: '',
        }
        const updatedItems = [...element.items]
        updatedItems.splice(index + 1, 0, newItem)
        dispatch(
          updateElement({
            id: element.id,
            updates: { items: updatedItems },
          })
        )
      }

      if (e.key === 'Backspace' && item.text === '' && element.items.length > 1) {
        e.preventDefault()
        const updatedItems = element.items.filter((_, i) => i !== index)
        dispatch(
          updateElement({
            id: element.id,
            updates: { items: updatedItems },
          })
        )
      }
    },
    [dispatch, element.id, element.items, index, item.text]
  )

  /**
   * Handle text content changes via contentEditable blur.
   * Commits the text to Redux state when the user clicks away.
   */
  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLSpanElement>) => {
      const newText = e.currentTarget.textContent ?? ''
      if (newText !== item.text) {
        const updatedItems = element.items.map((it, i) =>
          i === index ? { ...it, text: newText } : it
        )
        dispatch(
          updateElement({
            id: element.id,
            updates: { items: updatedItems },
          })
        )
      }
    },
    [dispatch, element.id, element.items, index, item.text]
  )

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
      }}
    >
      {/* Icon bullet — from shared icon library (same as buttons) */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          marginTop: '0.2em',
        }}
      >
        <IconRenderer
          name={iconName}
          style={{
            width: iconSize,
            height: iconSize,
            color: iconColor,
          }}
        />
      </div>

      {/* Editable text content on canvas */}
      <span
        ref={textRef}
        contentEditable
        suppressContentEditableWarning
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        style={{
          flex: 1,
          outline: 'none',
          cursor: 'text',
          minHeight: '1em',
        }}
      >
        {item.text}
      </span>
    </div>
  )
}
