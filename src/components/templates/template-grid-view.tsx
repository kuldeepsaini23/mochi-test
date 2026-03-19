/**
 * ============================================================================
 * TEMPLATE BROWSE — GRID VIEW
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: TemplateGridView, TemplateBrowseGrid
 *
 * WHY: Renders the responsive grid of template cards. Reads filter state from
 * useTemplateBrowse() and fetches results from the public tRPC endpoint.
 * Handles loading skeletons, empty states, and pagination.
 *
 * HOW: Uses trpc.templates.browseLibrary.useQuery() with params from the
 * browse context. Renders TemplateCard in a 4-column grid (responsive down
 * to 1 column on mobile). Each card is a Link to the template detail page
 * at ${basePath}/${templateId}.
 */

'use client'

import { PackageOpen } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { TEMPLATE_PAGE_SIZE } from '@/lib/templates/constants'
import type { TemplateListItem } from '@/lib/templates/types'
import { useTemplateBrowse } from './template-browse-context'
import { TemplateCard } from './template-card'
import { trpc } from '@/trpc/react-provider'

// ============================================================================
// PROPS
// ============================================================================

interface TemplateGridViewProps {
  /** Base path for card links — '/marketplace' in dashboard, '/templates' in public */
  basePath: string
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Responsive grid of template cards with pagination.
 * Fetches data from the public browseLibrary endpoint.
 * Each card links to ${basePath}/${templateId} for URL-based navigation.
 */
export function TemplateGridView({ basePath }: TemplateGridViewProps) {
  const { category, search, sortBy, page, setPage } = useTemplateBrowse()

  /**
   * Fetch templates from the public browse endpoint.
   * category is omitted when 'all' to fetch everything.
   * placeholderData keeps previous data visible during page transitions.
   */
  const { data, isLoading } = trpc.templates.browseLibrary.useQuery(
    {
      category: category === 'all' ? undefined : category,
      search: search || undefined,
      sortBy,
      page,
      pageSize: TEMPLATE_PAGE_SIZE,
    },
    { placeholderData: (prev) => prev }
  )

  const templates: TemplateListItem[] = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / TEMPLATE_PAGE_SIZE)

  // --------------------------------------------------------------------------
  // Loading State — skeleton cards matching the grid layout
  // --------------------------------------------------------------------------
  if (isLoading && templates.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // Empty State — no templates match the current filters
  // --------------------------------------------------------------------------
  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <PackageOpen className="h-10 w-10 text-muted-foreground/20 mb-3" />
        <p className="text-sm text-muted-foreground">
          No templates found
        </p>
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // Grid + Pagination
  // --------------------------------------------------------------------------
  return (
    <div className="space-y-8">
      {/* Card grid — 4 columns at xl, 3 at lg, 2 at sm, 1 on mobile */}
      <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            href={`${basePath}/${template.id}`}
            price={template.price}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// SKELETON CARD — Loading placeholder matching the card shape
// ============================================================================

/** Skeleton that mirrors the TemplateCard layout during loading */
function SkeletonCard() {
  return (
    <div>
      <div className="aspect-[3/4] rounded-lg bg-muted animate-pulse" />
      <div className="mt-2.5 space-y-1">
        <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
        <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
      </div>
    </div>
  )
}
