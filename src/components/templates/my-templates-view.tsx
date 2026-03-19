/**
 * ============================================================================
 * TEMPLATE LIBRARY — MY TEMPLATES VIEW
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: MyTemplatesView, MyTemplateCard, OrgTemplateManagement
 *
 * WHY: Shows templates that THIS organization has created. Gives org owners
 * the ability to view details, republish (re-snapshot) published templates,
 * and delete templates they no longer need.
 *
 * HOW: Uses `templates.list` tRPC query to fetch the org's own templates,
 * renders them in a responsive card grid matching the browse theme. Clean
 * portrait cards with status badges, no heavy borders.
 *
 * REPUBLISH: Re-snapshots the source feature and updates the published
 * template so installers get the latest version.
 *
 * DELETE: Hard-deletes the template (no soft delete per project rules).
 */

'use client'

import { useState } from 'react'
import {
  Search,
  PackageOpen,
  Download,
  Loader2,
  Trash2,
  Pencil,
  RefreshCw,
  Layers,
  Clock,
  AlertTriangle,
  Globe,
} from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

import {
  TEMPLATE_CATEGORY_META,
  TEMPLATE_PAGE_SIZE,
} from '@/lib/templates/constants'
import type { TemplateListItem, TemplateDetail, TemplateStatus } from '@/lib/templates/types'
import { useTemplateLibrary } from './template-library-context'
import { TemplateWizardLayout } from './template-wizard'
import { usePlatformCurrency } from '@/components/providers/platform-currency-provider'
import { trpc } from '@/trpc/react-provider'
import { cn } from '@/lib/utils'

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * My Templates view — shows all templates created by the current organization.
 * Matches the browse theme: clean portrait card grid, no heavy borders,
 * ghost-style buttons, muted backgrounds for sections.
 */
export function MyTemplatesView() {
  const { organizationId } = useTemplateLibrary()

  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)

  /** tRPC query utils for cache invalidation after mutations */
  const utils = trpc.useUtils()

  /** Fetch the org's own templates */
  const { data, isLoading } = trpc.templates.list.useQuery(
    {
      organizationId,
      page,
      pageSize: TEMPLATE_PAGE_SIZE,
    },
    {
      enabled: !!organizationId,
      placeholderData: (prev) => prev,
    }
  )

  /** Publish mutation — publishes a DRAFT template (respects auto-approve for paid) */
  const publishMutation = trpc.templates.publish.useMutation({
    onSuccess: () => {
      utils.templates.list.invalidate()
      utils.templates.browseLibrary.invalidate()
    },
  })

  /** Republish mutation — re-snapshots the source feature and bumps version */
  const republishMutation = trpc.templates.republish.useMutation({
    onSuccess: () => {
      utils.templates.list.invalidate()
    },
  })

  /** Delete mutation — permanently removes the template */
  const deleteMutation = trpc.templates.delete.useMutation({
    onSuccess: () => {
      utils.templates.list.invalidate()
    },
  })

  /** Filter templates client-side by search query for instant feedback */
  const allTemplates: TemplateListItem[] = data?.items ?? []
  const templates = searchQuery
    ? allTemplates.filter((t) =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allTemplates
  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1

  /** Publish a DRAFT or PENDING_APPROVAL template */
  const handlePublish = (templateId: string) => {
    publishMutation.mutate({ organizationId, templateId })
  }

  const handleRepublish = (templateId: string) => {
    republishMutation.mutate({ organizationId, templateId })
  }

  const handleDelete = (templateId: string, templateName: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${templateName}"? This action cannot be undone.`
    )
    if (confirmed) {
      deleteMutation.mutate({ organizationId, templateId })
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Search bar */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
        <Input
          placeholder="Search your templates..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setPage(1)
          }}
          className="h-8 pl-8 text-sm bg-transparent"
        />
      </div>

      {/* Content area */}
      {isLoading ? (
        /* Loading Skeletons */
        <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : templates.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <PackageOpen className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">
            {searchQuery
              ? 'No templates match your search'
              : 'You haven\'t created any templates yet'}
          </p>
        </div>
      ) : (
        /* Template Card Grid — matches browse grid layout */
        <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {templates.map((template) => (
            <MyTemplateCard
              key={template.id}
              template={template}
              organizationId={organizationId}
              onPublish={() => handlePublish(template.id)}
              onRepublish={() => handleRepublish(template.id)}
              onDelete={() => handleDelete(template.id, template.name)}
              isPublishing={
                publishMutation.isPending &&
                publishMutation.variables?.templateId === template.id
              }
              isRepublishing={
                republishMutation.isPending &&
                republishMutation.variables?.templateId === template.id
              }
              isDeleting={
                deleteMutation.isPending &&
                deleteMutation.variables?.templateId === template.id
              }
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && !isLoading && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MY TEMPLATE CARD — Portrait card matching the browse theme
// ============================================================================

interface MyTemplateCardProps {
  template: TemplateListItem
  organizationId: string
  onPublish: () => void
  onRepublish: () => void
  onDelete: () => void
  isPublishing: boolean
  isRepublishing: boolean
  isDeleting: boolean
}

/**
 * Portrait card for org-owned templates. Matches the browse card aesthetic:
 * 3:4 thumbnail, name + meta below, with status indicator and action buttons.
 * Shows price badge for paid templates and PENDING_APPROVAL status.
 * Edit button opens the TemplateWizardLayout in edit mode for metadata + pricing changes.
 */
function MyTemplateCard({
  template,
  organizationId,
  onPublish,
  onRepublish,
  onDelete,
  isPublishing,
  isRepublishing,
  isDeleting,
}: MyTemplateCardProps) {
  const categoryMeta = TEMPLATE_CATEGORY_META[template.category]
  const CategoryIcon = categoryMeta.icon
  const utils = trpc.useUtils()

  /** Platform currency for formatting the price display */
  const { formatCurrency } = usePlatformCurrency()

  /** Controls the edit wizard overlay */
  const [showEditWizard, setShowEditWizard] = useState(false)

  /**
   * Build a TemplateDetail from TemplateListItem for the edit wizard.
   * The edit panel only uses metadata + price fields, so items can be empty.
   */
  const editTemplateDetail: TemplateDetail = {
    ...template,
    version: 1,
    items: [],
  }

  return (
    <div className="group">
      {/* Thumbnail — portrait aspect ratio */}
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-muted">
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

        {/* Status indicator — top right */}
        <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
          <StatusPill status={template.status} />
          {/* Price badge — shown for paid templates */}
          {template.price != null && template.price > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
              {formatCurrency(template.price)}
            </span>
          )}
        </div>

        {/* Action overlay — appears on hover with Edit, Republish, Delete */}
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/60 to-transparent px-2.5 pb-2.5 pt-8 opacity-0 transition-opacity group-hover:opacity-100">
          {/* Edit button — opens the wizard in edit mode */}
          <Button
            variant="secondary"
            size="sm"
            className="h-7 flex-1 gap-1 text-xs"
            onClick={(e) => {
              e.stopPropagation()
              setShowEditWizard(true)
            }}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </Button>

          {/* Publish button — for DRAFT and PENDING_APPROVAL templates */}
          {(template.status === 'DRAFT' || template.status === 'PENDING_APPROVAL') && (
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={(e) => {
                e.stopPropagation()
                onPublish()
              }}
              disabled={isPublishing}
            >
              {isPublishing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Globe className="h-3 w-3" />
              )}
            </Button>
          )}

          {/* Republish button — for PUBLISHED templates to re-snapshot */}
          {template.status === 'PUBLISHED' && (
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={(e) => {
                e.stopPropagation()
                onRepublish()
              }}
              disabled={isRepublishing}
            >
              {isRepublishing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="h-7 gap-1 text-xs text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>

      {/* Template info below the thumbnail */}
      <div className="mt-2.5 space-y-0.5">
        <p className="truncate text-sm font-medium">{template.name}</p>
        <p className="text-xs text-muted-foreground">
          {categoryMeta.label}
        </p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground/70">
          <span className="flex items-center gap-1">
            <Download className="h-3 w-3" />
            {template.installCount}
          </span>
          <span className="flex items-center gap-1">
            <Layers className="h-3 w-3" />
            {template.itemCount}
          </span>
        </div>
      </div>

      {/* Rejection reason — shown when portal admin rejected the template */}
      {template.rejectionReason && (
        <div className="mt-2 flex items-start gap-1.5 rounded-md bg-destructive/5 border border-destructive/10 px-2.5 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive/80 line-clamp-3">
            {template.rejectionReason}
          </p>
        </div>
      )}

      {/* Edit Wizard — full-screen overlay, visibility controlled by open prop */}
      <TemplateWizardLayout
        open={showEditWizard}
        mode="edit"
        editTemplate={editTemplateDetail}
        organizationId={organizationId}
        onClose={() => {
          setShowEditWizard(false)
          utils.templates.list.invalidate()
        }}
      />
    </div>
  )
}

// ============================================================================
// STATUS PILL — Minimal status indicator matching the clean theme
// ============================================================================

/**
 * StatusPill — Renders a color-coded status badge for template cards.
 * Supports DRAFT, PUBLISHED, ARCHIVED, and PENDING_APPROVAL statuses.
 * PENDING_APPROVAL uses amber/yellow with a Clock icon to indicate
 * the template is awaiting portal admin review before marketplace listing.
 */
function StatusPill({ status }: { status: TemplateStatus }) {
  /** Map status to display label */
  const label =
    status === 'PUBLISHED' ? 'Published'
    : status === 'DRAFT' ? 'Draft'
    : status === 'PENDING_APPROVAL' ? 'Pending Approval'
    : 'Archived'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
        status === 'PUBLISHED' && 'bg-green-500/15 text-green-600',
        status === 'DRAFT' && 'bg-muted text-muted-foreground',
        status === 'ARCHIVED' && 'bg-muted text-muted-foreground/60',
        status === 'PENDING_APPROVAL' && 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
      )}
      title={
        status === 'PENDING_APPROVAL'
          ? 'This template is awaiting portal admin review'
          : undefined
      }
    >
      {status === 'PENDING_APPROVAL' && <Clock className="h-2.5 w-2.5" />}
      {label}
    </span>
  )
}

// ============================================================================
// SKELETON — Loading placeholder matching portrait card layout
// ============================================================================

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
