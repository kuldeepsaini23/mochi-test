/**
 * ============================================================================
 * TEMPLATE CARD — LINK-BASED UNIFIED DESIGN
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: TemplateCard, TemplateCardProps, TemplateCardUnified,
 * TemplateCardPriceBadge
 *
 * WHY: Clean, minimal card for all template categories. Portrait-oriented
 * thumbnail with template name + creator below. Uses Next.js Link for
 * proper anchor semantics — enables right-click "open in new tab",
 * prefetching, and shareable URLs.
 *
 * HOW: Portrait aspect-[3/4] thumbnail (image or muted placeholder),
 * followed by template name and organization name below. Wrapped in a
 * Next.js Link that navigates to the template detail page.
 *
 * PRICING: When a template has a price > 0, a small price badge is shown
 * in the top-right corner of the thumbnail. Uses usePlatformCurrency()
 * for formatting — never hardcodes $ or USD.
 */

'use client'

import Link from 'next/link'

import { TEMPLATE_CATEGORY_META } from '@/lib/templates/constants'
import type { TemplateListItem } from '@/lib/templates/types'
import { usePlatformCurrency } from '@/components/providers/platform-currency-provider'

// ============================================================================
// PROPS
// ============================================================================

interface TemplateCardProps {
  /** The template data to display */
  template: TemplateListItem
  /** URL to the template detail page (e.g., /marketplace/abc or /templates/abc) */
  href: string
  /** Template price in cents — null or 0 means free (no badge shown) */
  price?: number | null
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Uniform template card for all categories.
 * Portrait thumbnail, name + creator text below, wrapped in a Link.
 * Shows a price badge on the thumbnail when price > 0.
 */
export function TemplateCard({ template, href, price }: TemplateCardProps) {
  const categoryMeta = TEMPLATE_CATEGORY_META[template.category]
  const CategoryIcon = categoryMeta.icon
  const { formatCurrency } = usePlatformCurrency()

  /** Only show price badge for paid templates */
  const isPaid = price != null && price > 0

  return (
    <Link href={href} className="group outline-none">
      {/* Thumbnail — portrait aspect ratio with rounded corners */}
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-muted transition-shadow duration-200 group-hover:shadow-md">
        {template.thumbnailUrl ? (
          <img
            src={template.thumbnailUrl}
            alt={template.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <CategoryIcon className="h-8 w-8 text-muted-foreground/15" />
          </div>
        )}

        {/* Price badge — top-right corner, only for paid templates */}
        {isPaid && (
          <span className="absolute right-2 top-2 rounded-full bg-foreground/80 px-2 py-0.5 text-[10px] font-medium text-background">
            {formatCurrency(price)}
          </span>
        )}
      </div>

      {/* Template info below the thumbnail */}
      <div className="mt-2.5">
        <p className="truncate text-sm font-medium">{template.name}</p>
        <p className="text-xs text-muted-foreground">
          {template.organizationName}
        </p>
      </div>
    </Link>
  )
}
