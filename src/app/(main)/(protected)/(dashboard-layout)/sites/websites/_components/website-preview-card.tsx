'use client'

/**
 * WEBSITE PREVIEW CARD COMPONENT
 *
 * Renders a visual preview of a website as a card for the grid view.
 * Uses a portrait/vertical layout for a cleaner, less cluttered appearance.
 *
 * DESIGN:
 * - Portrait aspect ratio (3:4) matching email templates pattern
 * - Minimal data display: just name and page count
 * - Clean hover effects with action menu
 *
 * SOURCE OF TRUTH KEYWORDS: WebsitePreviewCard, WebsiteThumbnail, WebsiteGridCard
 */

import { useMemo } from 'react'
import { MoreHorizontal, Trash2 } from 'lucide-react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { WebsiteWithStatus } from './websites-table'

// ============================================================================
// PLACEHOLDER ILLUSTRATION
// ============================================================================

/**
 * Minimal website wireframe placeholder.
 * Portrait-oriented to match the card aspect ratio.
 */
function WebsitePlaceholderIllustration() {
  return (
    <div className="w-full h-full bg-gradient-to-b from-muted/30 to-muted/60 flex items-center justify-center">
      <svg
        viewBox="0 0 120 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-3/4 h-auto opacity-30"
      >
        {/* Browser frame */}
        <rect x="8" y="8" width="104" height="144" rx="4" stroke="currentColor" strokeWidth="1" strokeOpacity="0.3" fill="currentColor" fillOpacity="0.05" />

        {/* Browser dots */}
        <circle cx="18" cy="16" r="2" fill="currentColor" fillOpacity="0.3" />
        <circle cx="26" cy="16" r="2" fill="currentColor" fillOpacity="0.3" />
        <circle cx="34" cy="16" r="2" fill="currentColor" fillOpacity="0.3" />

        {/* URL bar */}
        <rect x="44" y="13" width="60" height="6" rx="2" fill="currentColor" fillOpacity="0.1" />

        {/* Header */}
        <rect x="14" y="28" width="92" height="8" rx="1" fill="currentColor" fillOpacity="0.12" />

        {/* Hero */}
        <rect x="14" y="42" width="92" height="36" rx="2" fill="currentColor" fillOpacity="0.08" />
        <rect x="22" y="52" width="50" height="4" rx="1" fill="currentColor" fillOpacity="0.15" />
        <rect x="22" y="60" width="36" height="3" rx="1" fill="currentColor" fillOpacity="0.1" />
        <rect x="22" y="68" width="28" height="6" rx="2" fill="currentColor" fillOpacity="0.2" />

        {/* Content blocks */}
        <rect x="14" y="86" width="44" height="28" rx="2" fill="currentColor" fillOpacity="0.08" />
        <rect x="62" y="86" width="44" height="28" rx="2" fill="currentColor" fillOpacity="0.08" />

        {/* More content */}
        <rect x="14" y="120" width="92" height="24" rx="2" fill="currentColor" fillOpacity="0.06" />
      </svg>
    </div>
  )
}

// ============================================================================
// TYPES
// ============================================================================

interface WebsitePreviewCardProps {
  website: WebsiteWithStatus
  onClick: () => void
  onHover?: () => void
  onDelete?: () => void
  canDelete?: boolean
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function WebsitePreviewCard({
  website,
  onClick,
  onHover,
  onDelete,
  canDelete = true,
}: WebsitePreviewCardProps) {
  const previewImageUrl = useMemo(() => {
    const firstPage = website.pages?.[0]
    return firstPage?.previewImage?.publicUrl || null
  }, [website.pages])

  const pageCount = website._count?.pages ?? 0

  return (
    <div
      className="group relative flex flex-col cursor-pointer"
      onClick={onClick}
      onMouseEnter={onHover}
    >
      {/* Preview container - portrait aspect ratio */}
      <div className="relative overflow-hidden rounded-xl border border-border/50 bg-card transition-all duration-200 group-hover:border-primary/30 group-hover:shadow-md">
        {/* Preview area - 3:4 portrait, image captured at desktop width and cropped from top */}
        <div className="relative aspect-[3/4] overflow-hidden bg-muted/30">
          {previewImageUrl ? (
            <Image
              src={previewImageUrl}
              alt={`Preview of ${website.name}`}
              fill
              className="object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
          ) : (
            <WebsitePlaceholderIllustration />
          )}

          {/* Subtle gradient overlay at bottom for text readability */}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors pointer-events-none" />
        </div>

        {/* Dropdown menu - top right, only on hover */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="secondary"
                size="icon"
                className="h-7 w-7 bg-background/80 backdrop-blur-sm shadow-sm hover:bg-background"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClick(); }}>
                Edit
              </DropdownMenuItem>
              {canDelete && onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete()
                    }}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Minimal info below preview */}
      <div className="mt-2.5 px-0.5">
        <h3 className="font-medium text-sm truncate group-hover:text-primary transition-colors">
          {website.name}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {pageCount} {pageCount === 1 ? 'page' : 'pages'}
        </p>
      </div>
    </div>
  )
}
