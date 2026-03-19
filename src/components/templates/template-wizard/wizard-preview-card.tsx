'use client'

/**
 * ============================================================================
 * WIZARD PREVIEW CARD — Live Marketplace Card Preview
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: WizardPreviewCard, TemplateCardPreview
 *
 * WHY: Shows users exactly what their template will look like as a card in the
 * marketplace grid. Updates in realtime as they fill in the metadata form.
 *
 * HOW: Mirrors the TemplateCard design (portrait aspect-[3/4] thumbnail, name,
 * org name below) but without the Link wrapper — pure visual preview.
 */

import { TEMPLATE_CATEGORY_META } from '@/lib/templates/constants'
import type { TemplateCategory } from '@/lib/templates/types'
import { usePlatformCurrency } from '@/components/providers/platform-currency-provider'

// ============================================================================
// PROPS — Subset of metadata fields needed for the card preview
// ============================================================================

export interface WizardPreviewCardProps {
  /** Template name — shows "Untitled Template" when empty */
  name: string
  /** Thumbnail image URL — falls back to category icon placeholder */
  thumbnailUrl?: string
  /** Selected category — used for the placeholder icon when no thumbnail */
  category: TemplateCategory | null
  /** Organization name shown below the template name */
  organizationName: string
  /** Tags — displayed as subtle pills below the org name */
  tags: string[]
  /** Price in cents — null or 0 means free (no badge shown) */
  price?: number | null
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Visual-only preview of how the template will appear as a card in the
 * marketplace grid. Mirrors the TemplateCard layout exactly — portrait
 * aspect-[3/4] thumbnail, name, and org name — but without navigation.
 */
export function WizardPreviewCard({
  name,
  thumbnailUrl,
  category,
  organizationName,
  tags,
  price,
}: WizardPreviewCardProps) {
  /**
   * Resolve category icon for the placeholder.
   * Falls back to a generic div if no category is selected yet.
   */
  const CategoryIcon = category
    ? TEMPLATE_CATEGORY_META[category].icon
    : null

  /** Display name with fallback for empty input */
  const displayName = name.trim() || 'Untitled Template'

  /** Format price using platform currency when price > 0 */
  const { formatCurrency } = usePlatformCurrency()

  return (
    <div className="group">
      {/* Thumbnail — portrait aspect ratio matching TemplateCard exactly */}
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-background dark:bg-muted/50 transition-shadow duration-200 group-hover:shadow-md">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={displayName}
            className="h-full w-full object-cover"
          />
        ) : (
          /* Placeholder — category icon centered in muted background */
          <div className="flex h-full w-full items-center justify-center">
            {CategoryIcon ? (
              <CategoryIcon className="h-8 w-8 text-muted-foreground/15" />
            ) : (
              /* No category selected yet — show a subtle rectangle placeholder */
              <div className="h-8 w-8 rounded bg-muted-foreground/10" />
            )}
          </div>
        )}

        {/* Price badge — top right corner, only shown for paid templates */}
        {price != null && price > 0 && (
          <div className="absolute right-2 top-2">
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
              {formatCurrency(price)}
            </span>
          </div>
        )}
      </div>

      {/* Template info below the thumbnail — matches TemplateCard spacing */}
      <div className="mt-2.5">
        <p className="truncate text-sm font-medium">{displayName}</p>
        <p className="text-xs text-muted-foreground">{organizationName}</p>

        {/* Tags — compact row of pills (only shown when tags exist) */}
        {tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-background dark:bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
