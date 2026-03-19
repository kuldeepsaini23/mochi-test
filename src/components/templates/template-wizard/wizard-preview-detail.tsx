'use client'

/**
 * ============================================================================
 * WIZARD PREVIEW DETAIL — Live Detail Page Preview
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: WizardPreviewDetail, TemplateDetailPreview
 *
 * WHY: Shows users exactly what their template detail page will look like.
 * Updates in realtime as they fill in metadata.
 *
 * HOW: Mirrors the TemplateDetailView layout (wide thumbnail, name, creator,
 * tags, rich-text description) but scaled down to fit in the preview panel.
 * Uses LexicalStaticContent for instant description rendering — zero Lexical
 * runtime, just JSON.parse → native HTML elements.
 *
 * Includes the same parallax window effect on the thumbnail as the detail page.
 */

import { useRef, useEffect, useCallback } from 'react'
import { TEMPLATE_CATEGORY_META } from '@/lib/templates/constants'
import type { TemplateCategory } from '@/lib/templates/types'
import { LexicalStaticContent } from '@/components/editor/lexical-static-content'

// ============================================================================
// PROPS
// ============================================================================

export interface WizardPreviewDetailProps {
  /** Template name — shows "Untitled Template" when empty */
  name: string
  /** Rich-text description as Lexical JSON string */
  description?: string
  /** Thumbnail image URL — falls back to category icon placeholder */
  thumbnailUrl?: string
  /** Selected category — used for placeholder icon and category label */
  category: TemplateCategory | null
  /** Organization name shown in the subtitle line */
  organizationName: string
  /** Tags — displayed as rounded pills below the header */
  tags: string[]
  /** Template version number — defaults to 1 for new templates */
  version?: number
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Scaled-down preview of the full template detail page.
 * Mirrors the TemplateDetailView structure — 16/9 thumbnail, name, category +
 * org + version line, tags as rounded pills, and description rendered through
 * LexicalStaticContent for instant load — zero Lexical JS runtime.
 */
export function WizardPreviewDetail({
  name,
  description,
  thumbnailUrl,
  category,
  organizationName,
  tags,
  version = 1,
}: WizardPreviewDetailProps) {
  /** Resolve category metadata for icon and label display */
  const categoryMeta = category ? TEMPLATE_CATEGORY_META[category] : null
  const CategoryIcon = categoryMeta?.icon ?? null

  /** Display name with fallback for empty input */
  const displayName = name.trim() || 'Untitled Template'

  /** Category label for the subtitle line */
  const categoryLabel = categoryMeta?.label ?? 'Category'

  /**
   * Parallax window effect — same approach as TemplateDetailView.
   * Pure DOM translate3d on a ref, finds nearest scrollable ancestor.
   */
  const parallaxRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLDivElement>(null)

  const updateParallax = useCallback(() => {
    const el = parallaxRef.current
    const img = imgRef.current
    if (!el || !img) return

    const rect = el.getBoundingClientRect()
    const viewportH = window.innerHeight
    const ratio = (viewportH - rect.top) / (viewportH + rect.height)
    const clamped = Math.max(0, Math.min(1, ratio))
    /** Scaled down for the smaller wizard preview panel */
    const offset = (clamped - 0.5) * 150 + 30
    img.style.transform = `translate3d(0, ${offset}px, 0)`
  }, [])

  useEffect(() => {
    const el = parallaxRef.current
    if (!el) return

    let scrollParent: HTMLElement | null = el.parentElement
    while (scrollParent) {
      const { overflow, overflowY } = getComputedStyle(scrollParent)
      if (/(auto|scroll)/.test(overflow + overflowY)) break
      scrollParent = scrollParent.parentElement
    }
    const scroller = scrollParent || window

    let raf: number
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(updateParallax)
    }

    scroller.addEventListener('scroll', onScroll, { passive: true })
    updateParallax()

    return () => {
      scroller.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [updateParallax])

  return (
    <div className="space-y-4">
      {/* Thumbnail — parallax window effect matching TemplateDetailView */}
      <div
        ref={parallaxRef}
        className="aspect-[16/9] overflow-hidden rounded-lg bg-background dark:bg-muted/50 relative"
      >
        {thumbnailUrl ? (
          <div
            ref={imgRef}
            className="absolute inset-0 w-full"
            style={{ height: '140%', top: '-20%', willChange: 'transform' }}
          >
            <img
              src={thumbnailUrl}
              alt={displayName}
              className="h-full w-full object-cover object-top"
            />
          </div>
        ) : (
          /* Placeholder — category icon centered */
          <div className="flex h-full w-full items-center justify-center">
            {CategoryIcon ? (
              <CategoryIcon className="h-10 w-10 text-muted-foreground/15" />
            ) : (
              <div className="h-10 w-10 rounded bg-muted-foreground/10" />
            )}
          </div>
        )}
      </div>

      {/* Header — name, subtitle line, tags */}
      <div className="space-y-2">
        <h3 className="text-xl font-semibold tracking-tight">{displayName}</h3>

        <p className="text-xs text-muted-foreground">
          {categoryLabel} · by {organizationName} · v{version}
        </p>

        {/* Tags — rounded pills */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-background dark:bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Description — LexicalStaticContent for truly instant rendering (zero Lexical runtime) */}
      {description ? (
        <div>
          <h4 className="mb-2 text-sm font-medium">Description</h4>
          <LexicalStaticContent
            content={description}
            className="text-xs"
          />
        </div>
      ) : (
        <div>
          <h4 className="mb-2 text-sm font-medium">Description</h4>
          <p className="text-xs italic text-muted-foreground/60">
            No description yet
          </p>
        </div>
      )}
    </div>
  )
}
