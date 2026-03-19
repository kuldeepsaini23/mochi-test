'use client'

/**
 * TEMPLATE PREVIEW CARD COMPONENT
 *
 * Renders a visual preview of an email template as a card.
 * Uses CSS transform to scale the email content to fit in a thumbnail.
 *
 * IMPORTANT: Uses BlockPreview from _lib/block-preview.tsx as the single source
 * of truth for block rendering. This ensures consistency between the builder,
 * preview mode, and template list thumbnails.
 *
 * FEATURES:
 * - Scaled preview using shared BlockPreview component
 * - Responsive scaling based on container width
 * - Hover effects with gradient overlay
 * - Name and subject shown below preview
 * - Actions dropdown menu
 *
 * SOURCE OF TRUTH KEYWORDS: TemplatePreviewCard, EmailThumbnail
 */

import { useMemo, useRef, useState, useEffect } from 'react'
import { MoreHorizontal, Copy, Trash2, FolderInput, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatDistanceToNow } from 'date-fns'
import { BlockPreview, getBackgroundStyle } from '@/components/email-builder/_lib/block-preview'
import type { EmailBlock, EmailSettings } from '@/types/email-templates'
import { DEFAULT_EMAIL_SETTINGS } from '@/types/email-templates'

// ============================================================================
// TYPES
// ============================================================================

interface TemplatePreviewCardProps {
  /** Template ID */
  id: string
  /** Template name */
  name: string
  /** Email subject line */
  subject: string
  /** Email blocks content */
  content: EmailBlock[]
  /** Email settings (background colors, padding, etc.) - uses defaults if not provided */
  emailSettings?: EmailSettings
  /** Usage count */
  usageCount: number
  /** Last used date (ISO string) */
  lastUsedAt: string | null
  /** Click handler */
  onClick: () => void
  /** Duplicate handler */
  onDuplicate: () => void
  /** Move handler */
  onMove: () => void
  /** Delete handler */
  onDelete: () => void
}

// Style utilities and BlockPreview are imported from _lib/block-preview.tsx
// This ensures all template previews render exactly like the builder preview

// ============================================================================
// MAIN COMPONENT
// ============================================================================

// Email template width for scaling calculation
const EMAIL_WIDTH = 600

export function TemplatePreviewCard({
  id,
  name,
  subject,
  content,
  emailSettings,
  usageCount,
  lastUsedAt,
  onClick,
  onDuplicate,
  onMove,
  onDelete,
}: TemplatePreviewCardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.35)

  /**
   * Merge provided emailSettings with defaults.
   * This ensures the preview always has valid styling even for legacy templates.
   */
  const settings = useMemo(() => ({
    ...DEFAULT_EMAIL_SETTINGS,
    ...emailSettings,
  }), [emailSettings])

  /**
   * Calculate scale based on container width.
   * Uses a smaller max scale (0.35) to keep previews compact and match builder proportions.
   */
  useEffect(() => {
    const updateScale = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth
        // Calculate scale to fit email width within container
        // Max scale of 0.35 keeps the preview compact like a thumbnail
        const newScale = Math.min((containerWidth - 8) / EMAIL_WIDTH, 0.35)
        setScale(Math.max(newScale, 0.2)) // Minimum scale of 0.2
      }
    }

    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  /**
   * Memoize the preview content to avoid re-rendering on every parent update.
   * Only re-renders when the content array changes.
   * Note: Padding is now applied to the container via emailSettings.containerPadding
   */
  const previewContent = useMemo(() => {
    if (!content || content.length === 0) {
      return (
        <div className="flex items-center justify-center h-full min-h-[200px]">
          <span className="text-xs text-muted-foreground">Empty template</span>
        </div>
      )
    }

    return (
      <div className="space-y-3">
        {content.map((block) => (
          <BlockPreview key={block.id} block={block} />
        ))}
      </div>
    )
  }, [content])

  return (
    <div
      className="group relative flex flex-col cursor-pointer"
      onClick={onClick}
    >
      {/* Preview container - scaled email content */}
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-xl border border-border/60 bg-card transition-all duration-200 group-hover:border-primary/40 group-hover:shadow-lg"
      >
        {/* Scaled preview area - portrait aspect ratio to match email layout */}
        <div
          className="relative aspect-[3/4] overflow-hidden"
          style={getBackgroundStyle(settings.bodyBackgroundColor, settings.bodyBackgroundGradient)}
        >
          {/* Scaling wrapper - centers and scales the email content */}
          <div
            className="absolute left-1/2 top-0"
            style={{
              width: `${EMAIL_WIDTH}px`,
              transform: `translateX(-50%) scale(${scale})`,
              transformOrigin: 'top center',
            }}
          >
            {/* Email container - uses getBackgroundStyle for gradient support */}
            <div
              className="shadow-sm"
              style={{
                width: `${EMAIL_WIDTH}px`,
                minHeight: '500px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                ...getBackgroundStyle(settings.containerBackgroundColor, settings.containerBackgroundGradient),
                borderRadius: `${settings.containerBorderRadius}px`,
                padding: `${settings.containerPadding}px`,
              }}
            >
              {previewContent}
            </div>
          </div>

          {/* Fade gradient at bottom - matches body background (uses solid color for fade) */}
          <div
            className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none"
            style={{
              background: `linear-gradient(to top, ${settings.bodyBackgroundColor}, transparent)`,
            }}
          />
        </div>

        {/* Hover overlay with actions */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors pointer-events-none" />

        {/* Dropdown menu - top right */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 bg-background/90 backdrop-blur-sm shadow-sm hover:bg-background"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onDuplicate()
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onMove()
                }}
              >
                <FolderInput className="mr-2 h-4 w-4" />
                Move to...
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Template info below preview */}
      <div className="mt-3 px-1">
        <h3 className="font-medium text-sm truncate group-hover:text-primary transition-colors">
          {name}
        </h3>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{subject}</p>

        {/* Usage info */}
        <div className="flex items-center gap-2 mt-2">
          {usageCount > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              Used {usageCount}×
            </Badge>
          )}
          {lastUsedAt && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(lastUsedAt))} ago
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
