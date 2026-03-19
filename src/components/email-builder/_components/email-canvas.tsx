
'use client'

/**
 * Email Canvas
 *
 * The main canvas where email blocks are displayed and edited.
 * Uses @dnd-kit/sortable for reordering blocks.
 * Clean design that matches the actual email preview.
 *
 * NOTE: Block rendering is delegated to BlockPreview (single source of truth).
 *
 * SOURCE OF TRUTH KEYWORDS: EmailCanvas, BuilderCanvas
 */

import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Heading1,
  Type,
  MousePointerClick,
  Image,
  Minus,
  MoveVertical,
  GripVertical,
  Trash2,
  Copy,
  Mail,
  Columns2,
  List,
  CreditCard,
  Quote,
  Sparkles,
  BarChart3,
  Bell,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEmailBuilder } from '../_lib/email-builder-context'
import {
  BlockPreview,
  getBackgroundStyle,
  getBorderStyle,
} from '../_lib/block-preview'
import type {
  EmailBlock,
  EmailBlockType,
  ColumnContainer,
} from '@/types/email-templates'

// Style utilities are now imported from block-preview.tsx (single source of truth)

/**
 * Block type icon component
 * Renders the appropriate icon for a given block type
 */
function BlockTypeIcon({
  type,
  className,
}: {
  type: EmailBlockType
  className?: string
}) {
  switch (type) {
    case 'heading':
      return <Heading1 className={className} />
    case 'text':
      return <Type className={className} />
    case 'button':
      return <MousePointerClick className={className} />
    case 'image':
      return <Image className={className} />
    case 'divider':
      return <Minus className={className} />
    case 'spacer':
      return <MoveVertical className={className} />
    case 'columns':
      return <Columns2 className={className} />
    case 'list':
      return <List className={className} />
    case 'pricing-card':
      return <CreditCard className={className} />
    case 'testimonial-card':
      return <Quote className={className} />
    case 'feature-card':
      return <Sparkles className={className} />
    case 'stats-card':
      return <BarChart3 className={className} />
    case 'alert-card':
      return <Bell className={className} />
  }
}

// ============================================================================
// COLUMN DROP ZONE COMPONENTS
// ============================================================================

/**
 * Droppable column container.
 * Allows blocks to be dropped into a column of a ColumnsBlock.
 * Each column acts as a mini-canvas with its own blocks.
 */
interface DroppableColumnContainerProps {
  /** Parent columns block ID */
  columnsBlockId: string
  /** Which column this is */
  columnSide: 'left' | 'right'
  /** Column container data */
  column: ColumnContainer
  /** Whether the column has custom styling */
  hasCustomStyle: boolean
}

function DroppableColumnContainer({
  columnsBlockId,
  columnSide,
  column,
  hasCustomStyle,
}: DroppableColumnContainerProps) {
  // Create a unique droppable ID for this column
  const droppableId = `${columnsBlockId}-${columnSide}`

  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: {
      type: 'column-drop-zone',
      columnsBlockId,
      columnSide,
    },
  })

  /**
   * Build column container style with background, background image, and border
   */
  const containerStyle: React.CSSProperties = {
    ...getBackgroundStyle(
      column.backgroundColor,
      column.backgroundGradient,
      column.backgroundImage
    ),
    ...getBorderStyle(column.border),
    padding: column.padding ? `${column.padding}px` : '12px',
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'space-y-3 rounded-md min-h-20 transition-colors',
        !hasCustomStyle && 'bg-muted/30 border border-dashed border-border/50',
        isOver && 'bg-violet-500/10 border-violet-500/50 border-solid'
      )}
      style={containerStyle}
    >
      <SortableContext
        items={column.blocks.map(
          (b) => `${columnsBlockId}-${columnSide}-${b.id}`
        )}
        strategy={verticalListSortingStrategy}
      >
        {column.blocks.length === 0 ? (
          <div className="flex items-center justify-center h-full py-4">
            <p className="text-xs text-muted-foreground/50">
              {isOver ? 'Drop here' : 'Drag blocks here'}
            </p>
          </div>
        ) : (
          column.blocks.map((nestedBlock) => (
            <SortableColumnBlock
              key={nestedBlock.id}
              block={nestedBlock}
              columnsBlockId={columnsBlockId}
              columnSide={columnSide}
            />
          ))
        )}
      </SortableContext>
    </div>
  )
}

/**
 * Sortable block inside a column.
 * Allows blocks within columns to be reordered and deleted.
 */
interface SortableColumnBlockProps {
  block: EmailBlock
  columnsBlockId: string
  columnSide: 'left' | 'right'
}

function SortableColumnBlock({
  block,
  columnsBlockId,
  columnSide,
}: SortableColumnBlockProps) {
  const { state, actions } = useEmailBuilder()

  // Create unique sortable ID that includes column info
  const sortableId = `${columnsBlockId}-${columnSide}-${block.id}`

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortableId,
    data: {
      type: 'column-block',
      block,
      columnsBlockId,
      columnSide,
    },
  })

  // Remove transition during drag to prevent flash
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
    // Hide the original element while dragging (overlay shows instead)
    opacity: isDragging ? 0.4 : 1,
  }

  // Check if this block is selected (need to match the actual block ID)
  const isSelected = state.selectedBlockId === block.id

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('group relative', isDragging && 'z-50')}
    >
      <div
        className={cn(
          'relative rounded transition-colors duration-100',
          isSelected
            ? 'outline outline-2 outline-violet-500 outline-offset-1 bg-violet-500/5'
            : 'hover:outline hover:outline-1 hover:outline-border hover:outline-offset-1'
        )}
        onClick={(e) => {
          e.stopPropagation()
          actions.selectBlock(block.id)
        }}
      >
        {/* Drag handle */}
        <div
          className={cn(
            'absolute -left-6 top-1/2 -translate-y-1/2',
            'opacity-0 group-hover:opacity-100 transition-opacity',
            isSelected && 'opacity-100'
          )}
        >
          <button
            {...attributes}
            {...listeners}
            className="p-1 rounded hover:bg-accent cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>

        {/* Delete button */}
        <div
          className={cn(
            'absolute -right-6 top-1/2 -translate-y-1/2',
            'opacity-0 group-hover:opacity-100 transition-opacity',
            isSelected && 'opacity-100'
          )}
        >
          <button
            className="p-1 rounded hover:bg-destructive/10"
            onClick={(e) => {
              e.stopPropagation()
              actions.saveHistory('Delete block from column')
              // Remove block from column
              const columnsBlock = state.blocks.find(
                (b) => b.id === columnsBlockId
              )
              if (columnsBlock && columnsBlock.type === 'columns') {
                const newBlocks = columnsBlock.props[
                  columnSide === 'left' ? 'leftColumn' : 'rightColumn'
                ].blocks.filter((b) => b.id !== block.id)
                actions.updateBlock(columnsBlockId, {
                  props: {
                    ...columnsBlock.props,
                    [columnSide === 'left' ? 'leftColumn' : 'rightColumn']: {
                      ...columnsBlock.props[
                        columnSide === 'left' ? 'leftColumn' : 'rightColumn'
                      ],
                      blocks: newBlocks,
                    },
                  },
                })
              }
            }}
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </button>
        </div>

        {/* Block content */}
        <BlockPreview block={block} />
      </div>
    </div>
  )
}

// BlockPreview is now imported from block-preview.tsx (single source of truth)

/**
 * Interactive Block Preview for Builder Mode
 *
 * Wraps the shared BlockPreview but handles columns specially
 * to enable drag-and-drop within column containers.
 *
 * For non-columns blocks: delegates to BlockPreview
 * For columns blocks: uses DroppableColumnContainer for interactive editing
 */
function InteractiveBlockPreview({ block }: { block: EmailBlock }) {
  // Handle columns specially for interactive drag-drop in builder
  if (block.type === 'columns') {
    const { leftColumn, rightColumn, gap = 24, leftWidth = 50 } = block.props
    const rightWidth = 100 - leftWidth

    // Check if columns have custom styling
    const hasLeftStyle = !!(
      leftColumn.backgroundColor ||
      leftColumn.backgroundGradient ||
      leftColumn.backgroundImage ||
      leftColumn.border
    )
    const hasRightStyle = !!(
      rightColumn.backgroundColor ||
      rightColumn.backgroundGradient ||
      rightColumn.backgroundImage ||
      rightColumn.border
    )

    return (
      <div
        className="grid"
        style={{ gap, gridTemplateColumns: `${leftWidth}fr ${rightWidth}fr` }}
      >
        <DroppableColumnContainer
          columnsBlockId={block.id}
          columnSide="left"
          column={leftColumn}
          hasCustomStyle={hasLeftStyle}
        />
        <DroppableColumnContainer
          columnsBlockId={block.id}
          columnSide="right"
          column={rightColumn}
          hasCustomStyle={hasRightStyle}
        />
      </div>
    )
  }

  // For all other block types, use the shared BlockPreview
  return <BlockPreview block={block} />
}

/**
 * Drop position indicator line.
 * Shows a violet horizontal bar with a small circle on the left edge
 * to indicate where a dragged block will be inserted.
 */
function DropIndicatorLine() {
  return (
    <div className="relative -mt-[5px] -mb-[5px] py-[3px] z-20 pointer-events-none">
      <div className="flex items-center">
        {/* Left circle marker */}
        <div className="w-2 h-2 rounded-full bg-violet-500 shrink-0" />
        {/* Horizontal line */}
        <div className="h-0.5 w-full bg-violet-500 rounded-full" />
      </div>
    </div>
  )
}

/**
 * Sortable block wrapper with minimal UI
 *
 * IMPORTANT: This wrapper should NOT add any padding or spacing that affects
 * the block content layout. The BlockPreview should render identically in
 * both builder and preview modes. Only the selection border and interactive
 * elements (drag handle, action buttons) are added here.
 *
 * When `isOver` is true (another block is being dragged over this one),
 * a violet drop indicator line is shown at the top to indicate the insertion point.
 */
function SortableBlock({ block }: { block: EmailBlock }) {
  const { state, actions } = useEmailBuilder()
  const isSelected = state.selectedBlockId === block.id

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: block.id,
    data: {
      type: 'canvas-block',
      block,
    },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('group relative', isDragging && 'opacity-50 z-50')}
    >
      {/* Selection outline - uses outline instead of border to avoid layout shifts */}
      <div
        className={cn(
          'relative rounded-md transition-all duration-100',
          isSelected
            ? 'outline outline-2 outline-violet-500 outline-offset-2 bg-violet-500/5'
            : 'hover:outline hover:outline-1 hover:outline-border hover:outline-offset-1'
        )}
        onClick={() => actions.selectBlock(block.id)}
      >
        {/* Drag handle - visible on hover, positioned outside container */}
        <div
          className={cn(
            'absolute -left-10 top-1/2 -translate-y-1/2',
            'opacity-0 group-hover:opacity-100 transition-opacity',
            isSelected && 'opacity-100'
          )}
        >
          <button
            {...attributes}
            {...listeners}
            className="p-1.5 rounded-md hover:bg-accent cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Block type badge - top right on hover */}
        <div
          className={cn(
            'absolute -top-3 -right-2 z-10',
            'opacity-0 group-hover:opacity-100 transition-opacity',
            isSelected && 'opacity-100'
          )}
        >
          <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-background border text-[10px] text-muted-foreground shadow-sm">
            <BlockTypeIcon
              type={block.type}
              className="h-3 w-3"
            />
          </div>
        </div>

        {/* Actions - right side on hover */}
        <div
          className={cn(
            'absolute -right-10 top-1/2 -translate-y-1/2',
            'flex flex-col gap-0.5',
            'opacity-0 group-hover:opacity-100 transition-opacity',
            isSelected && 'opacity-100'
          )}
        >
          <button
            className="p-1.5 rounded-md hover:bg-accent"
            onClick={(e) => {
              e.stopPropagation()
              actions.saveHistory('Duplicate block')
              actions.duplicateBlock(block.id)
            }}
          >
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            className="p-1.5 rounded-md hover:bg-destructive/10"
            onClick={(e) => {
              e.stopPropagation()
              actions.saveHistory('Delete block')
              actions.deleteBlock(block.id)
            }}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </button>
        </div>

        {/* Block content - uses InteractiveBlockPreview for columns drag-drop support */}
        <InteractiveBlockPreview block={block} />
      </div>

      {/* Drop indicator — shown BELOW the hovered block because the insertion
          logic uses targetIndex + 1 (insert after). Placing it at the bottom
          ensures the line matches where the block will actually land. */}
      {isOver && !isDragging && <DropIndicatorLine />}
    </div>
  )
}

/**
 * Empty state
 * Simple and clean design. When `isOver` is true, highlights as a valid drop target.
 */
function EmptyState({ isOver }: { isOver: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center h-full text-center py-16 px-8 rounded-lg transition-colors',
        isOver && 'bg-violet-500/10 border-2 border-dashed border-violet-500/50'
      )}
    >
      <div
        className={cn(
          'w-12 h-12 rounded-xl flex items-center justify-center mb-4',
          isOver ? 'bg-violet-500/20' : 'bg-muted/50'
        )}
      >
        <Mail
          className={cn(
            'h-6 w-6',
            isOver ? 'text-violet-500' : 'text-muted-foreground/60'
          )}
        />
      </div>
      <h3 className="text-sm font-medium text-foreground mb-1">
        {isOver ? 'Drop here' : 'No elements'}
      </h3>
      <p className="text-xs text-muted-foreground">
        {isOver ? 'Release to add the block' : 'Drag elements from the sidebar'}
      </p>
    </div>
  )
}

/**
 * Email Canvas Component
 *
 * Renders blocks in both builder and preview modes with consistent styling.
 * Uses email settings for container styling (background, padding, etc.).
 * Click on canvas background to select and edit email settings.
 *
 * SOURCE OF TRUTH KEYWORDS: EmailCanvas, CanvasContainer
 */
export function EmailCanvas() {
  const { state, actions, isCanvasSelected } = useEmailBuilder()
  const { emailSettings } = state

  const { setNodeRef, isOver: isCanvasOver } = useDroppable({
    id: 'canvas-drop-zone',
    data: { type: 'canvas-drop-zone' },
  })

  // Click on background to select canvas for editing email settings
  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      actions.selectCanvas()
    }
  }

  // Click on container to select canvas (when clicking container but not blocks)
  const handleContainerClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      actions.selectCanvas()
    }
  }

  // Dynamic styles based on email settings
  // Uses getBackgroundStyle for gradient support (single source of truth)
  const bodyStyle: React.CSSProperties = {
    ...getBackgroundStyle(
      emailSettings.bodyBackgroundColor,
      emailSettings.bodyBackgroundGradient
    ),
  }

  const containerStyle: React.CSSProperties = {
    maxWidth: `${emailSettings.containerMaxWidth}px`,
    ...getBackgroundStyle(
      emailSettings.containerBackgroundColor,
      emailSettings.containerBackgroundGradient
    ),
    borderRadius: `${emailSettings.containerBorderRadius}px`,
  }

  /**
   * Content padding styles.
   * Use individual padding properties to avoid React warnings about
   * mixing shorthand (padding) and non-shorthand (paddingLeft) properties.
   */
  const previewContentStyle: React.CSSProperties = {
    paddingTop: `${emailSettings.containerPadding}px`,
    paddingBottom: `${emailSettings.containerPadding}px`,
    paddingLeft: `${emailSettings.containerPadding}px`,
    paddingRight: `${emailSettings.containerPadding}px`,
  }

  // Builder mode needs extra horizontal padding for drag handles
  const builderContentStyle: React.CSSProperties = {
    paddingTop: `${emailSettings.containerPadding}px`,
    paddingBottom: `${emailSettings.containerPadding}px`,
    paddingLeft: '48px',
    paddingRight: '48px',
  }

  /**
   * Preview mode - same layout as builder but without interactive elements.
   *
   * Uses testVariableContext for REAL data interpolation when a test lead
   * is selected. Falls back to sample data if no test lead is selected.
   *
   * SOURCE OF TRUTH KEYWORDS: PreviewModeRendering, RealDataPreview
   */
  if (state.isPreviewMode) {
    return (
      <div
        className="h-full overflow-y-auto p-6 md:p-8"
        style={bodyStyle}
      >
        <div
          className="mx-auto"
          style={containerStyle}
        >
          {state.blocks.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm text-muted-foreground">
                No content to preview
              </p>
            </div>
          ) : (
            <div
              className="space-y-4"
              style={previewContentStyle}
            >
              {state.blocks.map((block) => (
                <BlockPreview
                  key={block.id}
                  block={block}
                  isPreviewMode
                  variableContext={state.testVariableContext ?? undefined}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Builder mode
  return (
    <div
      ref={setNodeRef}
      className="h-full overflow-y-auto p-6 md:p-8"
      style={bodyStyle}
      onClick={handleBackgroundClick}
    >
      {/* Email container - clickable to select canvas settings */}
      <div
        className={cn(
          'mx-auto transition-all cursor-pointer',
          isCanvasSelected
            ? 'outline outline-2 outline-violet-500 outline-offset-2'
            : 'hover:outline hover:outline-1 hover:outline-border/50 hover:outline-offset-1'
        )}
        style={containerStyle}
        onClick={handleContainerClick}
      >
        {state.blocks.length === 0 ? (
          <div className="min-h-[450px] flex items-center justify-center">
            <EmptyState isOver={isCanvasOver} />
          </div>
        ) : (
          <div
            className="space-y-4"
            style={builderContentStyle}
          >
            {/* Extra horizontal padding for drag handles */}
            {state.blocks.map((block) => (
              <SortableBlock
                key={block.id}
                block={block}
              />
            ))}
            {/* Bottom drop indicator — shown when dragging over the canvas area below the last block */}
            {isCanvasOver && state.drag.isDragging && <DropIndicatorLine />}
          </div>
        )}
      </div>
    </div>
  )
}
