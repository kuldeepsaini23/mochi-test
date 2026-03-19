'use client'

/**
 * Drag Overlay
 *
 * Visual feedback component displayed while dragging blocks.
 * Shows a preview of the block being dragged with subtle styling.
 *
 * SOURCE OF TRUTH KEYWORDS: DragOverlay, DragPreview
 */

import {
  Heading1,
  Type,
  MousePointerClick,
  Image,
  Minus,
  MoveVertical,
  Columns2,
  LayoutGrid,
  Quote,
  Mail,
  Users,
  Star,
  List,
  CreditCard,
  Sparkles,
  BarChart3,
  Bell,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEmailBuilder } from '../_lib/email-builder-context'
import type { EmailBlockType, EmailBlock } from '@/types/email-templates'

/**
 * Prebuilt block definitions for overlay display
 */
const PREBUILT_BLOCKS: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; description: string }
> = {
  'two-columns': { label: 'Two Columns', icon: Columns2, description: 'Side by side content' },
  hero: { label: 'Hero Section', icon: LayoutGrid, description: 'Image with heading' },
  testimonial: { label: 'Testimonial', icon: Quote, description: 'Customer quote' },
  footer: { label: 'Footer', icon: Mail, description: 'Email footer' },
  social: { label: 'Social Links', icon: Users, description: 'Social media icons' },
  cta: { label: 'Call to Action', icon: Star, description: 'Action section' },
}

/**
 * Get icon for block type.
 * Returns a Lucide icon component for the given block type.
 */
function getBlockIcon(type: EmailBlockType): LucideIcon {
  switch (type) {
    case 'heading':
      return Heading1
    case 'text':
      return Type
    case 'button':
      return MousePointerClick
    case 'image':
      return Image
    case 'divider':
      return Minus
    case 'spacer':
      return MoveVertical
    case 'columns':
      return Columns2
    case 'list':
      return List
    case 'pricing-card':
      return CreditCard
    case 'testimonial-card':
      return Quote
    case 'feature-card':
      return Sparkles
    case 'stats-card':
      return BarChart3
    case 'alert-card':
      return Bell
    case 'countdown-timer':
      return Timer
    default:
      // Exhaustive check - TypeScript will error if a case is missing
      return Type
  }
}

/**
 * Get label for block type.
 * Returns a human-readable label for display.
 */
function getBlockLabel(type: EmailBlockType): string {
  switch (type) {
    case 'heading':
      return 'Heading'
    case 'text':
      return 'Text'
    case 'button':
      return 'Button'
    case 'image':
      return 'Image'
    case 'divider':
      return 'Divider'
    case 'spacer':
      return 'Spacer'
    case 'columns':
      return 'Columns'
    case 'list':
      return 'List'
    case 'pricing-card':
      return 'Pricing'
    case 'testimonial-card':
      return 'Testimonial'
    case 'feature-card':
      return 'Feature'
    case 'stats-card':
      return 'Stats'
    case 'alert-card':
      return 'Alert'
    case 'countdown-timer':
      return 'Timer'
    default:
      // Exhaustive check - TypeScript will error if a case is missing
      return 'Block'
  }
}

/**
 * Overlay content for dragging new block from sidebar
 */
function NewBlockOverlay({ type }: { type: EmailBlockType }) {
  const Icon = getBlockIcon(type)
  const label = getBlockLabel(type)

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-lg',
        'bg-background border-2 border-violet-500 shadow-lg',
        'min-w-[200px]'
      )}
    >
      <div className="w-10 h-10 rounded-md bg-violet-500/10 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-violet-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">Drop to add</p>
      </div>
    </div>
  )
}

/**
 * Overlay content for dragging prebuilt block from sidebar
 */
function PrebuiltBlockOverlay({ prebuiltId }: { prebuiltId: string }) {
  const prebuilt = PREBUILT_BLOCKS[prebuiltId]
  if (!prebuilt) return null

  const { label, icon: Icon, description } = prebuilt

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-lg',
        'bg-background border-2 border-violet-500 shadow-lg',
        'min-w-[220px]'
      )}
    >
      <div className="w-10 h-10 rounded-md bg-violet-500/10 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-violet-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

/**
 * Overlay content for dragging existing block on canvas
 */
function ExistingBlockOverlay({ blockId }: { blockId: string }) {
  const { state } = useEmailBuilder()
  const block = state.blocks.find((b) => b.id === blockId)

  if (!block) return null

  const Icon = getBlockIcon(block.type)
  const label = getBlockLabel(block.type)

  // Get preview content based on block type
  let previewText = ''
  if (block.type === 'heading' || block.type === 'text' || block.type === 'button') {
    previewText = block.props.text.slice(0, 30)
    if (block.props.text.length > 30) previewText += '...'
  }

  return (
    <div
      className={cn(
        'rounded-lg border-2 border-violet-500 bg-background shadow-lg',
        'p-4 min-w-[280px] max-w-[400px]'
      )}
    >
      {/* Block type badge */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-violet-500/10 text-xs text-violet-500">
          <Icon className="h-3 w-3" />
          <span>{label}</span>
        </div>
      </div>

      {/* Preview content */}
      <div className="text-sm text-muted-foreground">
        {block.type === 'heading' && (
          <p className={cn(
            'font-semibold truncate',
            block.props.level === 'h1' && 'text-lg',
            block.props.level === 'h2' && 'text-base',
            block.props.level === 'h3' && 'text-sm'
          )}>
            {block.props.text || 'Heading'}
          </p>
        )}

        {block.type === 'text' && (
          <p className="truncate">{block.props.text || 'Text content...'}</p>
        )}

        {block.type === 'button' && (
          <div className="inline-flex items-center px-3 py-1.5 bg-violet-500 text-white rounded text-xs font-medium">
            {block.props.text || 'Button'}
          </div>
        )}

        {block.type === 'image' && (
          <div className="flex items-center gap-2 text-xs">
            <Image className="h-4 w-4" />
            <span className="truncate">{block.props.alt || 'Image'}</span>
          </div>
        )}

        {block.type === 'divider' && (
          <hr className="border-t border-border" />
        )}

        {block.type === 'spacer' && (
          <div className="flex items-center justify-center h-8 text-xs text-muted-foreground/50">
            {block.props.height}px spacer
          </div>
        )}

        {block.type === 'columns' && (
          <div className="flex gap-2 text-xs">
            <div className="flex-1 p-2 bg-muted/50 rounded text-center">Left</div>
            <div className="flex-1 p-2 bg-muted/50 rounded text-center">Right</div>
          </div>
        )}

        {/* Composite block types */}
        {block.type === 'list' && (
          <div className="text-xs text-muted-foreground">
            {block.props.items.length} items
          </div>
        )}

        {block.type === 'pricing-card' && (
          <div className="text-xs">
            <span className="font-semibold">{block.props.planName}</span>
            <span className="text-muted-foreground"> - {block.props.price}</span>
          </div>
        )}

        {block.type === 'testimonial-card' && (
          <p className="text-xs truncate italic">"{block.props.quote.slice(0, 40)}..."</p>
        )}

        {block.type === 'feature-card' && (
          <div className="text-xs">
            <span>{block.props.icon} </span>
            <span className="font-medium">{block.props.title}</span>
          </div>
        )}

        {block.type === 'stats-card' && (
          <div className="text-xs">
            <span className="font-bold">{block.props.value}</span>
            <span className="text-muted-foreground"> {block.props.label}</span>
          </div>
        )}

        {block.type === 'alert-card' && (
          <div className="text-xs capitalize">
            {block.props.alertType}: {block.props.title ?? block.props.message.slice(0, 30)}
          </div>
        )}

        {block.type === 'countdown-timer' && (
          <div className="text-xs">
            <Timer className="inline h-3 w-3 mr-1" />
            <span className="text-muted-foreground">Countdown to target date</span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Overlay content for dragging a block from within a column.
 * Similar to ExistingBlockOverlay but uses the block data directly
 * instead of looking it up from state (since nested blocks aren't
 * in the top-level blocks array).
 */
function ColumnBlockOverlay({ block }: { block: EmailBlock }) {
  const Icon = getBlockIcon(block.type)
  const label = getBlockLabel(block.type)

  return (
    <div
      className={cn(
        'rounded-lg border-2 border-violet-500 bg-background shadow-lg',
        'p-4 min-w-[240px] max-w-[360px]'
      )}
    >
      {/* Block type badge */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-violet-500/10 text-xs text-violet-500">
          <Icon className="h-3 w-3" />
          <span>{label}</span>
        </div>
        <span className="text-[10px] text-muted-foreground/60">from column</span>
      </div>

      {/* Preview content based on block type */}
      <div className="text-sm text-muted-foreground">
        {block.type === 'heading' && (
          <p
            className={cn(
              'font-semibold truncate',
              block.props.level === 'h1' && 'text-lg',
              block.props.level === 'h2' && 'text-base',
              block.props.level === 'h3' && 'text-sm'
            )}
          >
            {block.props.text || 'Heading'}
          </p>
        )}

        {block.type === 'text' && (
          <p className="truncate">{block.props.text || 'Text content...'}</p>
        )}

        {block.type === 'button' && (
          <div className="inline-flex items-center px-3 py-1.5 bg-violet-500 text-white rounded text-xs font-medium">
            {block.props.text || 'Button'}
          </div>
        )}

        {block.type === 'image' && (
          <div className="flex items-center gap-2 text-xs">
            <Image className="h-4 w-4" />
            <span className="truncate">{block.props.alt || 'Image'}</span>
          </div>
        )}

        {block.type === 'divider' && <hr className="border-t border-border" />}

        {block.type === 'spacer' && (
          <div className="flex items-center justify-center h-8 text-xs text-muted-foreground/50">
            {block.props.height}px spacer
          </div>
        )}

        {/* Composite block types */}
        {block.type === 'list' && (
          <div className="text-xs text-muted-foreground">
            {block.props.items.length} items
          </div>
        )}

        {block.type === 'pricing-card' && (
          <div className="text-xs">
            <span className="font-semibold">{block.props.planName}</span>
            <span className="text-muted-foreground"> - {block.props.price}</span>
          </div>
        )}

        {block.type === 'testimonial-card' && (
          <p className="text-xs truncate italic">&ldquo;{block.props.quote.slice(0, 40)}...&rdquo;</p>
        )}

        {block.type === 'feature-card' && (
          <div className="text-xs">
            <span>{block.props.icon} </span>
            <span className="font-medium">{block.props.title}</span>
          </div>
        )}

        {block.type === 'stats-card' && (
          <div className="text-xs">
            <span className="font-bold">{block.props.value}</span>
            <span className="text-muted-foreground"> {block.props.label}</span>
          </div>
        )}

        {block.type === 'alert-card' && (
          <div className="text-xs capitalize">
            {block.props.alertType}: {block.props.title ?? block.props.message.slice(0, 30)}
          </div>
        )}

        {block.type === 'countdown-timer' && (
          <div className="text-xs">
            <Timer className="inline h-3 w-3 mr-1" />
            <span className="text-muted-foreground">Countdown timer</span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Drag Overlay Content Component
 *
 * Renders the appropriate overlay based on what's being dragged:
 * - New block from sidebar: Shows block type with "Drop to add"
 * - Prebuilt block from sidebar: Shows template name with description
 * - Existing block on canvas: Shows block preview
 * - Block from column: Shows block preview with "from column" indicator
 */
export function DragOverlayContent({
  blockType,
  blockId,
  prebuiltId,
  columnBlock,
}: {
  blockType: EmailBlockType | null
  blockId: string | null
  prebuiltId?: string | null
  columnBlock?: EmailBlock | null
}) {
  // Dragging block from within a column
  if (columnBlock) {
    return <ColumnBlockOverlay block={columnBlock} />
  }

  // Dragging prebuilt block from sidebar
  if (prebuiltId) {
    return <PrebuiltBlockOverlay prebuiltId={prebuiltId} />
  }

  // Dragging new block from sidebar
  if (blockType) {
    return <NewBlockOverlay type={blockType} />
  }

  // Dragging existing block on canvas
  if (blockId) {
    return <ExistingBlockOverlay blockId={blockId} />
  }

  return null
}
