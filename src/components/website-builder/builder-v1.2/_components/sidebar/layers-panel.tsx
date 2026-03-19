/**
 * ============================================================================
 * LAYERS PANEL - Figma-style nested element tree for the sidebar
 * ============================================================================
 *
 * Displays a hierarchical view of all elements on the current page.
 * Elements can be expanded, collapsed, selected, and reordered via drag-drop.
 *
 * FEATURES:
 * - Nested tree structure mirroring element hierarchy
 * - Expand/collapse children (accordion-style)
 * - Element type icons (page, frame, text, image, button)
 * - Click to select element on canvas
 * - Drag and drop to reorder elements within parent
 * - Drag to move elements between parents
 * - Double-click to edit element name inline
 *
 * ============================================================================
 * INLINE NAME EDITING
 * ============================================================================
 *
 * Double-clicking on a layer name enables inline editing:
 * - Shows an input field with the current name
 * - Input is auto-focused and text is selected
 * - Enter or blur saves the new name (if changed)
 * - Escape cancels and reverts to original name
 * - Only dispatches Redux update if name actually changed (prevents double saves)
 * - Page elements CANNOT be renamed (managed at page level)
 *
 * ============================================================================
 * CLIENT-SIDE ONLY STATE UPDATES
 * ============================================================================
 *
 * When elements are reordered or renamed in the layers panel:
 * 1. We dispatch Redux actions (moveElement, reorderElement, updateElement)
 * 2. Redux state updates client-side immediately
 * 3. Auto-save (useAutoSave hook) detects the change and persists to DB
 *
 * This approach:
 * - Gives instant UI feedback
 * - Avoids duplicate saves (layers panel doesn't save directly)
 * - Maintains single source of truth (Redux)
 *
 * ============================================================================
 */

'use client'

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  DragMoveEvent,
  UniqueIdentifier,
  MeasuringStrategy,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ChevronDown,
  FileText,
  Type,
  Image,
  GripVertical,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Smartphone,
  Monitor,
  PenTool,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useAppDispatch,
  useAppSelector,
  selectLayersPanelData,
  selectSelectedIds,
  selectViewport,
  setSelection,
  setViewport,
  moveElement,
  reorderElement,
  updateElement,
  clearSingleResponsiveProperty,
  getVisibilityState,
  isSidebarInsetFrame,
} from '../../_lib'
import { store } from '../../_lib/store'
import type { CanvasElement, ElementType } from '../../_lib/types'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Flattened tree item for rendering in a flat list with DND Kit.
 * Each item knows its depth (for indentation) and whether it can expand.
 */
interface FlattenedItem {
  /** Element ID */
  id: string
  /** The actual element data */
  element: CanvasElement
  /** Nesting depth (0 = root, 1 = child of root, etc.) */
  depth: number
  /** Whether this item has children */
  hasChildren: boolean
  /** Whether this item is expanded (shows children) */
  isExpanded: boolean
  /** Parent element ID (for move operations) */
  parentId: string | null
  /** Index within parent (order) */
  index: number
}

// ============================================================================
// ELEMENT TYPE ICONS
// ============================================================================

/**
 * Hash icon for frame elements - matches the toolbar frame tool icon.
 * Renders a # symbol using four lines.
 */
function FrameHashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="9" y1="4" x2="9" y2="20" />
      <line x1="15" y1="4" x2="15" y2="20" />
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
    </svg>
  )
}

/**
 * Button icon - matches the toolbar button tool icon.
 * Renders a rounded rectangle with a horizontal line (representing text).
 */
function ButtonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <rect x="3" y="6" width="18" height="12" rx="4" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  )
}

/**
 * Get the appropriate icon for an element type.
 * Uses custom SVG icons that match the toolbar for consistency.
 */
function getElementIcon(type: ElementType): React.ReactNode {
  const iconClass = 'h-3.5 w-3.5'

  switch (type) {
    case 'page':
      return <FileText className={iconClass} />
    case 'frame':
      return <FrameHashIcon className={iconClass} />
    case 'text':
      return <Type className={iconClass} />
    case 'image':
      return <Image className={iconClass} />
    case 'button':
      return <ButtonIcon className={iconClass} />
    case 'pencil':
      return <PenTool className={iconClass} />
    default:
      return <FrameHashIcon className={iconClass} />
  }
}

// ============================================================================
// TREE UTILITIES
// ============================================================================

/**
 * Flatten the element tree into a list for rendering.
 * Respects expanded/collapsed state to hide nested children.
 *
 * @param elements - All elements in the canvas
 * @param childrenMap - Parent ID -> Child IDs mapping
 * @param rootIds - IDs of root-level elements
 * @param expandedIds - Set of currently expanded element IDs
 * @returns Flattened list of items with depth information
 */
function flattenTree(
  elements: Record<string, CanvasElement>,
  childrenMap: Record<string, string[]>,
  rootIds: string[],
  expandedIds: Set<string>
): FlattenedItem[] {
  const result: FlattenedItem[] = []

  /**
   * Recursively process an element and its children.
   * Children are only added if the parent is expanded.
   */
  function processElement(elementId: string, depth: number, parentId: string | null, index: number) {
    const element = elements[elementId]
    if (!element) return

    // Get children for this element
    const childIds = childrenMap[elementId] || []
    const hasChildren = childIds.length > 0
    const isExpanded = expandedIds.has(elementId)

    // Add this item to the flat list
    result.push({
      id: elementId,
      element,
      depth,
      hasChildren,
      isExpanded,
      parentId,
      index,
    })

    // If expanded, recursively add children
    if (isExpanded && hasChildren) {
      childIds.forEach((childId, childIndex) => {
        processElement(childId, depth + 1, elementId, childIndex)
      })
    }
  }

  // Process all root elements
  rootIds.forEach((rootId, index) => {
    processElement(rootId, 0, null, index)
  })

  return result
}

/**
 * Get all descendant IDs of an element (for collapsed drag preview).
 */
function getDescendantIds(
  elementId: string,
  childrenMap: Record<string, string[]>
): string[] {
  const descendants: string[] = []
  const childIds = childrenMap[elementId] || []

  childIds.forEach((childId) => {
    descendants.push(childId)
    descendants.push(...getDescendantIds(childId, childrenMap))
  })

  return descendants
}

// ============================================================================
// PROJECTION UTILITIES (from dnd-kit tree example)
// ============================================================================

/**
 * Indentation width in pixels per depth level.
 * Used for both visual indentation and drag depth calculation.
 */
const INDENTATION_WIDTH = 16

/**
 * Calculate depth change from horizontal drag offset.
 * Dragging right increases depth (nest deeper), left decreases (move up).
 */
function getDragDepth(offset: number, indentationWidth: number): number {
  return Math.round(offset / indentationWidth)
}

/**
 * Get max allowed depth based on the previous item.
 * Can only nest one level deeper than the previous item.
 */
function getMaxDepth(previousItem: FlattenedItem | undefined): number {
  if (previousItem) {
    // Can nest inside the previous item (depth + 1)
    return previousItem.depth + 1
  }
  return 0
}

/**
 * Get min allowed depth based on the next item.
 * Cannot be shallower than the next item's depth.
 */
function getMinDepth(nextItem: FlattenedItem | undefined): number {
  if (nextItem) {
    return nextItem.depth
  }
  return 0
}

/**
 * Project the new depth and parent based on drag position.
 * This is the core of the tree nesting logic from dnd-kit example.
 *
 * HOW IT WORKS:
 * 1. Calculate projected depth from horizontal drag offset
 * 2. Clamp to valid range (minDepth to maxDepth)
 * 3. Determine new parentId based on depth and surrounding items
 *
 * @param items - Flattened tree items
 * @param activeId - ID of the dragged item
 * @param overId - ID of the item we're hovering over
 * @param dragOffset - Horizontal drag distance (delta.x)
 * @param indentationWidth - Pixels per indent level
 */
function getProjection(
  items: FlattenedItem[],
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier,
  dragOffset: number,
  indentationWidth: number
): { depth: number; parentId: string | null } | null {
  const overItemIndex = items.findIndex(({ id }) => id === overId)
  const activeItemIndex = items.findIndex(({ id }) => id === activeId)

  if (overItemIndex === -1 || activeItemIndex === -1) return null

  const activeItem = items[activeItemIndex]

  // Simulate the array after the move
  const newItems = arrayMove(items, activeItemIndex, overItemIndex)
  const previousItem = newItems[overItemIndex - 1]
  const nextItem = newItems[overItemIndex + 1]

  // Calculate projected depth from drag offset
  const dragDepth = getDragDepth(dragOffset, indentationWidth)
  const projectedDepth = activeItem.depth + dragDepth

  // Clamp to valid range
  const maxDepth = getMaxDepth(previousItem)
  const minDepth = getMinDepth(nextItem)

  let depth = projectedDepth
  if (projectedDepth >= maxDepth) {
    depth = maxDepth
  } else if (projectedDepth < minDepth) {
    depth = minDepth
  }

  // Determine parent based on depth
  const parentId = getParentId()

  return { depth, parentId }

  /**
   * Calculate the parent ID based on the projected depth.
   * Walks backwards through items to find the appropriate parent.
   */
  function getParentId(): string | null {
    // Root level - no parent
    if (depth === 0 || !previousItem) {
      return null
    }

    // Same depth as previous - share the same parent
    if (depth === previousItem.depth) {
      return previousItem.parentId
    }

    // Deeper than previous - nest inside previous item
    if (depth > previousItem.depth) {
      return previousItem.id
    }

    // Shallower than previous - find ancestor at this depth
    const newParent = newItems
      .slice(0, overItemIndex)
      .reverse()
      .find((item) => item.depth === depth)?.parentId

    return newParent ?? null
  }
}

/**
 * Check if an element can accept children (only frames and pages).
 */
function canAcceptChildren(element: CanvasElement): boolean {
  return element.type === 'frame' || element.type === 'page'
}

/**
 * Get the absolute canvas position of an element by measuring its DOM node.
 *
 * WHY DOM MEASUREMENT:
 * Nested elements use CSS flexbox/flow layout, NOT x/y coordinates.
 * Only root elements (direct children of page) use absolute positioning.
 * So we can't calculate position from element data - we must measure the DOM.
 *
 * HOW IT WORKS:
 * 1. Find the element's DOM node using data-element-id
 * 2. Get its bounding rect in screen coordinates
 * 3. Convert to canvas coordinates using current viewport transform
 *
 * @param elementId - The element ID to find
 * @param zoom - Current viewport zoom level
 * @param panX - Current viewport pan X
 * @param panY - Current viewport pan Y
 */
function getElementCanvasPosition(
  elementId: string,
  zoom: number,
  panX: number,
  panY: number
): { x: number; y: number; width: number; height: number } | null {
  // Find the canvas element to get its position
  const canvasElement = document.querySelector('[data-canvas]')
  if (!canvasElement) return null

  // Find the actual element DOM node by its ID
  const elementNode = document.querySelector(`[data-element-id="${elementId}"]`)
  if (!elementNode) return null

  // Get bounding rects
  const canvasRect = canvasElement.getBoundingClientRect()
  const elementRect = elementNode.getBoundingClientRect()

  // Element position relative to canvas container (in screen pixels)
  const screenX = elementRect.left - canvasRect.left
  const screenY = elementRect.top - canvasRect.top

  // Convert screen coordinates to canvas coordinates
  // Screen position = canvas position * zoom + pan
  // So: canvas position = (screen position - pan) / zoom
  const canvasX = (screenX - panX) / zoom
  const canvasY = (screenY - panY) / zoom
  const canvasWidth = elementRect.width / zoom
  const canvasHeight = elementRect.height / zoom

  return {
    x: canvasX,
    y: canvasY,
    width: canvasWidth,
    height: canvasHeight,
  }
}

/**
 * Calculate viewport pan values to focus on an element.
 * Uses the same formula as page centering in canvas.tsx.
 *
 * BEHAVIOR (matching canvas.tsx lines 286-289):
 * - Horizontal: Element centered in viewport
 * - Vertical: Element's TOP positioned with padding from viewport top
 *
 * This matches how the page is shown on initial load - centered horizontally
 * with the top of the content visible at the top of the viewport.
 *
 * @param elementBounds - Absolute position and size of the element
 * @param zoom - Current zoom level
 * @param canvasWidth - Width of the visible canvas area
 * @param canvasHeight - Height of the visible canvas area
 */
function calculateCenterPan(
  elementBounds: { x: number; y: number; width: number; height: number },
  zoom: number,
  canvasWidth: number,
  canvasHeight: number
): { panX: number; panY: number } {
  // Scale element dimensions by zoom
  const scaledWidth = elementBounds.width * zoom
  const scaledHeight = elementBounds.height * zoom

  // Center the element in the viewport (both horizontally and vertically)
  // Formula: viewport center - element canvas position * zoom - half of scaled element size
  // Simplified: (viewportSize - scaledSize) / 2 - element.position * zoom
  const panX = (canvasWidth - scaledWidth) / 2 - elementBounds.x * zoom
  const panY = (canvasHeight - scaledHeight) / 2 - elementBounds.y * zoom

  return { panX, panY }
}

// ============================================================================
// TREE ITEM COMPONENT (VISUAL RENDERING)
// ============================================================================

/**
 * Props for the TreeItem component.
 * This follows the dnd-kit tree example pattern exactly.
 */
interface TreeItemProps {
  item: FlattenedItem
  isSelected: boolean
  /** Clone mode - used in DragOverlay to show a floating copy */
  clone?: boolean
  /** Ghost mode - item is being dragged, show faded state */
  ghost?: boolean
  /** Override depth for visual feedback during drag */
  depth?: number
  /** Style to apply (includes transform for sorting animation) */
  style?: React.CSSProperties
  /** Handle props - attributes and listeners for the drag handle */
  handleProps?: React.HTMLAttributes<HTMLDivElement>
  /** Ref for the wrapper element (droppable target) */
  wrapperRef?: (node: HTMLDivElement) => void
  onSelect: (id: string, multiSelect: boolean) => void
  onToggleVisibility: (id: string, visible: boolean) => void
  onToggleLock: (id: string, locked: boolean) => void
  /** Callback to toggle expand/collapse for items with children */
  onCollapse?: (id: string) => void
  /** Whether this item is currently being edited (inline name edit) */
  isEditing?: boolean
  /** Callback when user double-clicks to start editing the name */
  onStartEdit?: (id: string) => void
  /** Callback when user finishes editing (blur/Enter) with new name */
  onFinishEdit?: (id: string, newName: string) => void
  /** Callback when user cancels editing (Escape) */
  onCancelEdit?: () => void
}

/**
 * TreeItem - Visual rendering of a layer item.
 * Follows the dnd-kit tree example pattern with forwardRef for the draggable node.
 * The transform style is applied to THIS element (the content), not the wrapper.
 */
const TreeItem = React.forwardRef<HTMLDivElement, TreeItemProps>(
  (
    {
      item,
      isSelected,
      clone = false,
      ghost = false,
      depth: depthOverride,
      style,
      handleProps,
      wrapperRef,
      onSelect,
      onToggleVisibility,
      onToggleLock,
      onCollapse,
      isEditing = false,
      onStartEdit,
      onFinishEdit,
      onCancelEdit,
    },
    ref
  ) => {
    // Track hover state for visibility/lock icons
    const [isHovered, setIsHovered] = useState(false)

    // Local state for the edited name value (only used when isEditing is true)
    const [editValue, setEditValue] = useState(item.element.name)

    // Ref for the input to focus it when editing starts
    const inputRef = useRef<HTMLInputElement>(null)

    // Use depth override if provided (for visual feedback during drag)
    const effectiveDepth = depthOverride ?? item.depth

    // Indentation based on depth (16px per level)
    const indent = effectiveDepth * INDENTATION_WIDTH

    /**
     * When editing starts, reset the edit value to current name and focus input.
     * Using useEffect to handle the focus after React renders the input.
     */
    useEffect(() => {
      if (isEditing) {
        setEditValue(item.element.name)
        // Focus and select all text after render
        requestAnimationFrame(() => {
          inputRef.current?.focus()
          inputRef.current?.select()
        })
      }
    }, [isEditing, item.element.name])

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation()
      // Don't trigger selection if we're editing
      if (isEditing) return
      onSelect(item.id, e.shiftKey)
    }

    /**
     * Double-click handler to start inline editing.
     * Only triggers if not already editing and callback is provided.
     * Page elements cannot be renamed (they get their name from page data).
     */
    const handleDoubleClick = (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      // Don't allow editing page element names - they're managed at page level
      if (item.element.type === 'page') return
      if (!isEditing && onStartEdit) {
        onStartEdit(item.id)
      }
    }

    /**
     * Handle input blur - save the new name if changed.
     * Trims whitespace and falls back to original name if empty.
     */
    const handleInputBlur = () => {
      if (!onFinishEdit) return

      const trimmedValue = editValue.trim()
      // Use trimmed value, or fall back to original name if empty
      const finalName = trimmedValue || item.element.name
      onFinishEdit(item.id, finalName)
    }

    /**
     * Handle keyboard events in the input.
     * Enter = save, Escape = cancel
     */
    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation()

      if (e.key === 'Enter') {
        // Save on Enter
        e.preventDefault()
        const trimmedValue = editValue.trim()
        const finalName = trimmedValue || item.element.name
        onFinishEdit?.(item.id, finalName)
      } else if (e.key === 'Escape') {
        // Cancel on Escape - restore original name
        e.preventDefault()
        setEditValue(item.element.name)
        onCancelEdit?.()
      }
    }

    const handleToggleVisibility = (e: React.MouseEvent) => {
      e.stopPropagation()
      onToggleVisibility(item.id, !item.element.visible)
    }

    const handleToggleLock = (e: React.MouseEvent) => {
      e.stopPropagation()
      onToggleLock(item.id, !item.element.locked)
    }

    return (
      /**
       * Wrapper div - receives the droppable ref (wrapperRef).
       * This is the drop target for other items.
       */
      <div
        ref={wrapperRef}
        data-layer-item-id={item.id}
        className={cn(
          // Ghost state - the original item position when dragging
          ghost && 'opacity-30'
        )}
      >
        {/**
         * Content div - receives the draggable ref and transform style.
         * The transform is applied HERE to move the content during sorting.
         */}
        <div
          ref={ref}
          style={style}
          className={cn(
            // Base styling
            'flex items-center h-7 text-xs select-none',
            'rounded-sm transition-colors duration-75',
            // Hover and selection states
            isSelected
              ? 'bg-primary/20 text-foreground'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            // Clone styling - floating appearance for the drag overlay
            clone && 'shadow-lg bg-background/95 backdrop-blur-sm border border-border rounded-md'
          )}
          onClick={handleClick}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Indentation spacer */}
          <div style={{ width: indent }} className="flex-shrink-0" />

          {/* Drag handle - only for non-page elements */}
          {item.element.type !== 'page' ? (
            <div
              {...handleProps}
              className={cn(
                'flex-shrink-0 w-5 h-5 flex items-center justify-center cursor-grab',
                'text-muted-foreground/40 hover:text-muted-foreground',
                'transition-opacity',
                isHovered || isSelected || clone ? 'opacity-100' : 'opacity-0'
              )}
            >
              <GripVertical className="h-3 w-3" />
            </div>
          ) : (
            <div className="flex-shrink-0 w-5" />
          )}

          {/* Expand/collapse chevron - clickable when item has children */}
          {item.hasChildren && onCollapse ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCollapse(item.id)
              }}
              className={cn(
                'flex-shrink-0 w-5 h-5 flex items-center justify-center',
                'text-muted-foreground/60 hover:text-foreground',
                'transition-transform duration-150'
              )}
            >
              <ChevronDown
                className={cn(
                  'h-3 w-3 transition-transform duration-150',
                  !item.isExpanded && '-rotate-90'
                )}
              />
            </button>
          ) : (
            // Spacer when no children (keeps alignment)
            <div className="flex-shrink-0 w-5 h-5" />
          )}

          {/* Element type icon */}
          <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-muted-foreground/80">
            {getElementIcon(item.element.type)}
          </div>

          {/* Element name - inline editable on double-click */}
          {isEditing ? (
            /**
             * Inline input for editing the element name.
             * Shown when user double-clicks the name.
             * Saves on blur or Enter, cancels on Escape.
             */
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleInputBlur}
              onKeyDown={handleInputKeyDown}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'flex-1 min-w-0 px-1 py-0 h-5 text-xs font-medium',
                'bg-background border border-primary/50 rounded-sm',
                'outline-none focus:border-primary focus:ring-1 focus:ring-primary/30',
                'text-foreground'
              )}
            />
          ) : (
            /**
             * Display name - double-click to edit (except for page elements).
             * Shows the current element name with truncation for long names.
             * Page elements show default cursor since they can't be renamed.
             */
            <span
              className={cn(
                'flex-1 truncate px-1 font-medium',
                // Only show text cursor for editable elements (not pages)
                item.element.type !== 'page' && 'cursor-text'
              )}
              onDoubleClick={handleDoubleClick}
            >
              {item.element.name}
            </span>
          )}

          {/*
            Breakpoint visibility indicators.
            Shows which breakpoints the element is visible on:
            - Mobile icon: Element is visible ONLY on mobile (hidden on desktop)
            - Desktop icon: Element is visible ONLY on desktop (hidden on mobile)
            - No icon: Element is visible on both, or hidden on both

            This helps users quickly identify elements that have conditional visibility
            based on the viewport size, making responsive design easier to manage.

            Uses muted-foreground for theme compatibility (works in light and dark mode).
          */}
          {(() => {
            const visibility = getVisibilityState(item.element)

            // Only show icons if element has breakpoint-specific visibility
            // Don't show anything if element is visible on both or hidden on both
            if (visibility.mobileOnly) {
              return (
                <div
                  className="flex-shrink-0 w-4 h-4 flex items-center justify-center"
                  title="Visible on mobile only"
                >
                  <Smartphone className="h-3 w-3 text-muted-foreground" />
                </div>
              )
            }

            if (visibility.desktopOnly) {
              return (
                <div
                  className="flex-shrink-0 w-4 h-4 flex items-center justify-center"
                  title="Visible on desktop only"
                >
                  <Monitor className="h-3 w-3 text-muted-foreground" />
                </div>
              )
            }

            return null
          })()}

          {/* Visibility toggle */}
          <button
            onClick={handleToggleVisibility}
            className={cn(
              'flex-shrink-0 w-5 h-5 flex items-center justify-center',
              'text-muted-foreground/40 hover:text-foreground',
              'transition-opacity',
              item.element.visible ? (isHovered ? 'opacity-100' : 'opacity-0') : 'opacity-100'
            )}
            title={item.element.visible ? 'Hide element' : 'Show element'}
          >
            {item.element.visible ? (
              <Eye className="h-3 w-3" />
            ) : (
              <EyeOff className="h-3 w-3 text-muted-foreground/60" />
            )}
          </button>

          {/* Lock toggle */}
          <button
            onClick={handleToggleLock}
            className={cn(
              'flex-shrink-0 w-5 h-5 flex items-center justify-center mr-1',
              'text-muted-foreground/40 hover:text-foreground',
              'transition-opacity',
              !item.element.locked ? (isHovered ? 'opacity-100' : 'opacity-0') : 'opacity-100'
            )}
            title={item.element.locked ? 'Unlock element' : 'Lock element'}
          >
            {item.element.locked ? (
              <Lock className="h-3 w-3 text-amber-500/80" />
            ) : (
              <Unlock className="h-3 w-3" />
            )}
          </button>
        </div>
      </div>
    )
  }
)

TreeItem.displayName = 'TreeItem'

// ============================================================================
// SORTABLE TREE ITEM (WITH DND LOGIC)
// ============================================================================

interface SortableTreeItemProps {
  item: FlattenedItem
  isSelected: boolean
  /** Clone mode for DragOverlay */
  clone?: boolean
  /** Override depth for visual feedback during drag */
  depth?: number
  onSelect: (id: string, multiSelect: boolean) => void
  onToggleVisibility: (id: string, visible: boolean) => void
  onToggleLock: (id: string, locked: boolean) => void
  /** Callback to toggle expand/collapse */
  onCollapse?: (id: string) => void
  /** Whether this item is currently being edited */
  isEditing?: boolean
  /** Callback when user double-clicks to start editing */
  onStartEdit?: (id: string) => void
  /** Callback when user finishes editing */
  onFinishEdit?: (id: string, newName: string) => void
  /** Callback when user cancels editing */
  onCancelEdit?: () => void
}

/**
 * SortableTreeItem - Follows the dnd-kit tree example pattern exactly.
 *
 * Key points from dnd-kit example:
 * 1. Uses CSS.Translate.toString() NOT CSS.Transform.toString()
 * 2. Has separate refs: setDraggableNodeRef (content) and setDroppableNodeRef (wrapper)
 * 3. Transform style applied to the content element via ref, not wrapper
 * 4. Can be used in DragOverlay with clone prop
 */
function SortableTreeItem({
  item,
  isSelected,
  clone = false,
  depth,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onCollapse,
  isEditing,
  onStartEdit,
  onFinishEdit,
  onCancelEdit,
}: SortableTreeItemProps) {
  const {
    attributes,
    listeners,
    setDraggableNodeRef,
    setDroppableNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    // Disable sorting for page elements (they can't be moved) or while editing
    disabled: item.element.type === 'page' || isEditing,
  })

  /**
   * CRITICAL: Use CSS.Translate.toString() not CSS.Transform.toString()
   * CSS.Transform includes scale which causes positioning issues.
   * CSS.Translate only handles x/y translation.
   */
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  }

  return (
    <TreeItem
      ref={setDraggableNodeRef}
      wrapperRef={setDroppableNodeRef}
      item={item}
      isSelected={isSelected}
      clone={clone}
      ghost={isDragging}
      depth={depth}
      style={style}
      handleProps={{
        ...attributes,
        ...listeners,
      }}
      onSelect={onSelect}
      onToggleVisibility={onToggleVisibility}
      onToggleLock={onToggleLock}
      onCollapse={onCollapse}
      isEditing={isEditing}
      onStartEdit={onStartEdit}
      onFinishEdit={onFinishEdit}
      onCancelEdit={onCancelEdit}
    />
  )
}

// ============================================================================
// MAIN LAYERS PANEL COMPONENT
// ============================================================================

export function LayersPanel() {
  const dispatch = useAppDispatch()

  // Get canvas data using MEMOIZED selector to prevent re-renders on viewport changes
  // This selector only returns elements, childrenMap, rootIds - NOT viewport
  const canvasData = useAppSelector(selectLayersPanelData)
  const selectedIds = useAppSelector(selectSelectedIds)

  /**
   * Ref to the scrollable container - used for scrolling to selected items.
   */
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  /**
   * Track if the last selection was made from the layers panel.
   * This prevents scrolling when clicking in the layers panel itself (which would be jarring).
   */
  const selectionFromLayersRef = useRef(false)

  /**
   * Track which element is currently being edited (inline name edit).
   * Only one element can be edited at a time. Null means no editing in progress.
   */
  const [editingId, setEditingId] = useState<string | null>(null)

  /**
   * Track the page ID to detect page changes.
   * When page changes, we reset expanded IDs to show all.
   */
  const prevPageIdRef = useRef<string | null>(null)

  /**
   * Compute which elements should be expanded.
   * Returns all parent element IDs (elements that have children).
   */
  const getAllParentIds = useCallback((data: typeof canvasData) => {
    if (!data) return new Set<string>()
    const allParentIds = Object.keys(data.childrenMap).filter(
      (id) => data.childrenMap[id]?.length > 0
    )
    return new Set(allParentIds)
  }, [])

  /**
   * Track which elements are expanded (show their children).
   *
   * IMPORTANT: We compute expanded IDs synchronously based on current canvasData
   * to avoid flash/glitch where accordions appear closed then open.
   *
   * The logic:
   * 1. If page changed → expand all parent elements
   * 2. If same page → keep user's current expand/collapse choices
   */
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => getAllParentIds(canvasData))

  // Detect page changes and reset expanded state
  if (canvasData?.pageId && canvasData.pageId !== prevPageIdRef.current) {
    // Page changed - expand all parents
    const allParentIds = getAllParentIds(canvasData)
    // Only update if actually different (avoid infinite loop)
    if (allParentIds.size !== expandedIds.size ||
        ![...allParentIds].every(id => expandedIds.has(id))) {
      setExpandedIds(allParentIds)
    }
    prevPageIdRef.current = canvasData.pageId
  }

  /**
   * Store a ref to elements map for callbacks that need current data.
   * Now that we use a memoized selector, this is less critical but still
   * useful for scroll-to-selection logic.
   */
  const elementsRef = useRef<Record<string, CanvasElement>>({})

  // Keep the ref in sync with the latest elements
  useEffect(() => {
    if (canvasData) {
      elementsRef.current = canvasData.elements
    }
  }, [canvasData])

  /**
   * Scroll to the selected element in the layers panel when selection changes.
   * This handles the case when an element is selected on the canvas - the layers
   * panel will scroll to show the selected item and expand any collapsed parents.
   *
   * We use elementsRef to access elements data to avoid extra dependencies.
   */
  useEffect(() => {
    // Skip if no selection or selection came from clicking in layers panel
    if (selectedIds.length === 0 || selectionFromLayersRef.current) {
      selectionFromLayersRef.current = false
      return
    }

    // Get the first selected element
    const selectedId = selectedIds[0]
    if (!selectedId) return

    // Use the ref to access elements
    const elements = elementsRef.current
    const element = elements[selectedId]
    if (!element) return

    // Collect parent chain and expand any collapsed parents
    const parentsToExpand: string[] = []
    let currentId = element.parentId
    while (currentId) {
      const parent = elements[currentId]
      if (!parent) break
      parentsToExpand.push(currentId)
      currentId = parent.parentId
    }

    // Expand parents if any are collapsed
    if (parentsToExpand.length > 0) {
      setExpandedIds((prev) => {
        const next = new Set(prev)
        parentsToExpand.forEach((id) => next.add(id))
        return next
      })
    }

    // Scroll to the selected item after a small delay (to allow DOM to update after expanding)
    requestAnimationFrame(() => {
      const container = scrollContainerRef.current
      if (!container) return

      const layerItem = container.querySelector(`[data-layer-item-id="${selectedId}"]`)
      if (!layerItem) return

      // Scroll the item into view (instant, centered in container)
      layerItem.scrollIntoView({
        behavior: 'instant',
        block: 'center',
      })
    })
  }, [selectedIds])

  /**
   * Toggle expanded state for an element.
   */
  const handleToggleExpand = useCallback((elementId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(elementId)) {
        next.delete(elementId)
      } else {
        next.add(elementId)
      }
      return next
    })
  }, [])

  // ========================================
  // INLINE EDITING HANDLERS
  // ========================================

  /**
   * Start editing an element's name.
   * Sets the editing ID which triggers the input to render.
   */
  const handleStartEdit = useCallback((elementId: string) => {
    setEditingId(elementId)
  }, [])

  /**
   * Finish editing and save the new name.
   * Only dispatches update if the name actually changed (avoids unnecessary saves).
   * Clears the editing state after saving.
   */
  const handleFinishEdit = useCallback(
    (elementId: string, newName: string) => {
      if (!canvasData) {
        setEditingId(null)
        return
      }

      // Get the current element to check if name changed
      const element = canvasData.elements[elementId]
      if (!element) {
        setEditingId(null)
        return
      }

      // Only dispatch update if the name actually changed
      // This prevents unnecessary saves and Redux updates
      if (element.name !== newName) {
        dispatch(updateElement({ id: elementId, updates: { name: newName } }))
      }

      // Clear editing state
      setEditingId(null)
    },
    [dispatch, canvasData]
  )

  /**
   * Cancel editing without saving.
   * Simply clears the editing state - the input's local state will reset on next edit.
   */
  const handleCancelEdit = useCallback(() => {
    setEditingId(null)
  }, [])

  // ========================================
  // DRAG STATE - for tree projection (dnd-kit tree example pattern)
  // ========================================

  /** Currently dragged item ID */
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null)

  /** Item we're currently hovering over */
  const [overId, setOverId] = useState<UniqueIdentifier | null>(null)

  /** Horizontal drag offset - determines nesting depth */
  const [offsetLeft, setOffsetLeft] = useState(0)

  // Configure DND sensors (pointer and keyboard)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        // Require a small drag distance to avoid accidental drags
        distance: 4,
      },
    }),
    useSensor(KeyboardSensor)
  )

  // Flatten the tree for rendering
  const flattenedItems = useMemo(() => {
    if (!canvasData) return []
    return flattenTree(
      canvasData.elements,
      canvasData.childrenMap,
      canvasData.rootIds,
      expandedIds
    )
  }, [canvasData, expandedIds])

  // Get the active item for drag overlay
  const activeItem = useMemo(() => {
    if (!activeId) return null
    return flattenedItems.find((item) => item.id === activeId) || null
  }, [activeId, flattenedItems])

  /**
   * Calculate the projected depth and parent based on drag position.
   * This determines where the item will be placed when dropped.
   */
  const projected = useMemo(() => {
    if (!activeId || !overId) return null
    return getProjection(
      flattenedItems,
      activeId,
      overId,
      offsetLeft,
      INDENTATION_WIDTH
    )
  }, [activeId, overId, offsetLeft, flattenedItems])

  // ========================================
  // HANDLERS
  // ========================================

  /**
   * Handle selecting an element.
   * Updates Redux selection state AND instantly focuses the canvas on the element.
   * Uses DOM measurement to get actual element position (works for flex/flow layouts).
   *
   * PERFORMANCE NOTE: We read viewport directly from store instead of using
   * useAppSelector to avoid re-renders on every pan/zoom change.
   */
  const handleSelect = useCallback(
    (id: string, _multiSelect: boolean) => {
      if (!canvasData) return

      // Sidebar inset frames are not selectable — redirect to the parent sidebar.
      // This matches the canvas behavior where inset frames cannot be selected,
      // moved, or resized independently.
      let targetId = id
      if (isSidebarInsetFrame(id, canvasData.elements)) {
        const insetElement = canvasData.elements[id]
        if (insetElement?.parentId) {
          targetId = insetElement.parentId
        }
      }

      // Mark that this selection came from the layers panel
      // This prevents the scroll-to-selection effect from triggering
      selectionFromLayersRef.current = true

      // Select the element (or its parent sidebar if it was an inset frame)
      dispatch(setSelection(targetId))

      // Find the canvas element to get its dimensions
      const canvasElement = document.querySelector('[data-canvas]')
      if (!canvasElement) return

      const canvasRect = canvasElement.getBoundingClientRect()
      const canvasWidth = canvasRect.width
      const canvasHeight = canvasRect.height

      // Read viewport directly from store (avoids re-renders on pan/zoom)
      const currentViewport = selectViewport(store.getState())

      // Get the element's actual position from DOM measurement
      // This works correctly for nested elements using flexbox/flow layout
      const elementBounds = getElementCanvasPosition(
        targetId,
        currentViewport.zoom,
        currentViewport.panX,
        currentViewport.panY
      )

      // If element not found in DOM, skip focusing
      if (!elementBounds) return

      // Calculate pan to center the element (using same formula as canvas.tsx)
      const { panX, panY } = calculateCenterPan(
        elementBounds,
        currentViewport.zoom,
        canvasWidth,
        canvasHeight
      )

      // Instantly update viewport - no animation
      dispatch(setViewport({ panX, panY }))
    },
    [dispatch, canvasData]
  )

  /**
   * Handle toggling visibility for an element.
   *
   * IMPORTANT FIX FOR VISIBILITY BUG:
   * When toggling visibility from the layers panel (the global eye icon),
   * we need to unify visibility across ALL breakpoints. This means:
   *
   * 1. Set the base `visible` property to the new value
   * 2. Clear any mobile-specific visibility override
   *
   * WHY THIS MATTERS:
   * Without clearing the mobile override, the following bug occurs:
   * - Element is set to "mobile only" (visible=false, mobileOverride=true)
   * - User clicks eye icon to hide completely
   * - Only `visible` gets set to false, but mobileOverride stays true
   * - Element is still visible on mobile when it should be hidden!
   *
   * By clearing the mobile override, the element will inherit the base
   * visibility value on all breakpoints, which is what users expect when
   * using the global visibility toggle.
   */
  const handleToggleVisibility = useCallback(
    (id: string, visible: boolean) => {
      // Update the base visibility property
      dispatch(updateElement({ id, updates: { visible } }))

      // Clear any mobile-specific visibility override to unify visibility
      // across all breakpoints. This ensures the element respects the new
      // visibility setting on both desktop AND mobile.
      dispatch(
        clearSingleResponsiveProperty({
          id,
          breakpoint: 'mobile',
          propertyKey: 'visible',
        })
      )
    },
    [dispatch]
  )

  /**
   * Handle toggling lock state for an element.
   * Updates Redux which triggers auto-save.
   */
  const handleToggleLock = useCallback(
    (id: string, locked: boolean) => {
      dispatch(updateElement({ id, updates: { locked } }))
    },
    [dispatch]
  )

  /**
   * Handle drag start - initialize drag state and cancel any editing.
   * Dragging and editing are mutually exclusive actions.
   */
  const handleDragStart = useCallback((event: DragStartEvent) => {
    // Cancel any inline editing when starting a drag
    setEditingId(null)

    const { active } = event
    setActiveId(active.id)
    setOverId(active.id)
    setOffsetLeft(0)

    document.body.style.setProperty('cursor', 'grabbing')
  }, [])

  /**
   * Handle drag move - track horizontal offset for depth projection.
   * This is the key to enabling nesting: drag right to nest deeper,
   * drag left to move up in the hierarchy.
   */
  const handleDragMove = useCallback((event: DragMoveEvent) => {
    setOffsetLeft(event.delta.x)
  }, [])

  /**
   * Handle drag over - track which item we're hovering over.
   */
  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverId(event.over?.id ?? null)
  }, [])

  /**
   * Reset all drag state to initial values.
   */
  const resetDragState = useCallback(() => {
    setActiveId(null)
    setOverId(null)
    setOffsetLeft(0)
    document.body.style.setProperty('cursor', '')
  }, [])

  /**
   * Handle drag end - finalize the move/reorder using projection.
   *
   * This is where the magic happens:
   * 1. Uses projected depth/parentId from horizontal drag position
   * 2. Moves element to new parent if needed
   * 3. Reorders within parent based on drop position
   */
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event

      // Reset state first
      resetDragState()

      if (!over || !canvasData || !projected) return

      const activeItemData = flattenedItems.find((item) => item.id === active.id)
      if (!activeItemData) return

      // Don't allow moving page elements
      if (activeItemData.element.type === 'page') return

      const { parentId: newParentId } = projected

      // Validate: Can't drop into non-container elements
      if (newParentId) {
        const targetElement = canvasData.elements[newParentId]
        if (targetElement && !canAcceptChildren(targetElement)) {
          return // Invalid drop target
        }
      }

      // Validate: Can't drop element into itself or its descendants
      if (newParentId) {
        const descendants = getDescendantIds(
          activeItemData.id,
          canvasData.childrenMap
        )
        if (newParentId === activeItemData.id || descendants.includes(newParentId)) {
          return // Would create circular reference
        }
      }

      // Calculate new order within the target parent
      const overIndex = flattenedItems.findIndex((item) => item.id === over.id)
      const activeIndex = flattenedItems.findIndex((item) => item.id === active.id)

      // Simulate the move to calculate proper order
      const reorderedItems = arrayMove(flattenedItems, activeIndex, overIndex)

      // Find position among siblings
      let newOrder = 0
      const activeInReordered = reorderedItems.findIndex((item) => item.id === active.id)
      for (let i = 0; i < activeInReordered; i++) {
        const item = reorderedItems[i]
        if (item.parentId === newParentId) {
          newOrder++
        }
      }

      // Same parent - just reorder
      if (activeItemData.parentId === newParentId) {
        if (newOrder !== activeItemData.index) {
          dispatch(
            reorderElement({
              id: activeItemData.id,
              newOrder,
            })
          )
        }
      } else {
        // Different parent - move to new parent
        dispatch(
          moveElement({
            id: activeItemData.id,
            newParentId,
            newOrder,
          })
        )

        // Auto-expand the new parent so user can see the moved item
        if (newParentId && !expandedIds.has(newParentId)) {
          setExpandedIds((prev) => new Set([...prev, newParentId]))
        }
      }
    },
    [dispatch, flattenedItems, canvasData, projected, resetDragState, expandedIds]
  )

  /**
   * Handle drag cancel - reset state without making changes.
   */
  const handleDragCancel = useCallback(() => {
    resetDragState()
  }, [resetDragState])

  // ========================================
  // RENDER
  // ========================================

  // Show placeholder if no canvas data is available
  if (!canvasData) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-sm font-medium text-muted-foreground">Layers</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs text-muted-foreground">No page selected</span>
        </div>
      </div>
    )
  }

  // Get all item IDs for SortableContext
  const itemIds = flattenedItems.map((item) => item.id)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-sm font-medium text-muted-foreground">Layers</span>
        <span className="text-xs text-muted-foreground/60">
          {flattenedItems.length} items
        </span>
      </div>

      {/* Layer tree - scrollable container with ref for scroll-to-selection (hidden scrollbar for cleaner look) */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-1 py-1 scrollbar-hide">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
          measuring={{
            droppable: {
              strategy: MeasuringStrategy.Always,
            },
          }}
        >
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            {flattenedItems.map((item) => (
              <SortableTreeItem
                key={item.id}
                item={item}
                isSelected={selectedIds.includes(item.id)}
                // Show projected depth during drag for visual feedback
                depth={item.id === activeId && projected ? projected.depth : item.depth}
                onSelect={handleSelect}
                onToggleVisibility={handleToggleVisibility}
                onToggleLock={handleToggleLock}
                onCollapse={handleToggleExpand}
                // Inline name editing props
                isEditing={editingId === item.id}
                onStartEdit={handleStartEdit}
                onFinishEdit={handleFinishEdit}
                onCancelEdit={handleCancelEdit}
              />
            ))}
          </SortableContext>

          {/*
           * Drag overlay - shows the dragged item following the cursor.
           * Uses createPortal to render at document.body level (prevents
           * positioning issues from scrollable containers or transforms).
           * This matches the dnd-kit tree example pattern exactly.
           */}
          {typeof document !== 'undefined' &&
            createPortal(
              <DragOverlay dropAnimation={null}>
                {activeId && activeItem ? (
                  <SortableTreeItem
                    item={activeItem}
                    isSelected={true}
                    clone
                    onSelect={() => {}}
                    onToggleVisibility={() => {}}
                    onToggleLock={() => {}}
                  />
                ) : null}
              </DragOverlay>,
              document.body
            )}
        </DndContext>
      </div>
    </div>
  )
}
