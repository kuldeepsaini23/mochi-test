/**
 * ============================================================================
 * PORTAL — TEMPLATES APPROVAL PAGE
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: PortalTemplatesPage, PortalTemplateApproval,
 * PortalPendingTemplates, TemplateModeration
 *
 * WHY: When templates have pricing enabled, creators submit paid templates
 * for portal review before they go live. This page lets portal admins review,
 * approve, or reject pending templates. An auto-approve toggle lets admins
 * skip manual review when they trust their creators.
 *
 * HOW: Uses the portal tRPC endpoints for listing pending templates and
 * performing approve/reject actions. The auto-approve toggle reads/writes
 * a portal-level setting. Layout follows the same pattern as the portal
 * organizations page (header + controls + card grid + pagination).
 */

'use client'

import { useState } from 'react'
import { Package, Loader2 } from 'lucide-react'

import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

import {
  PortalTemplateReviewCard,
  type PendingTemplateItem,
} from '@/components/portal/portal-template-review'
import { PortalPagination } from '@/components/portal/portal-pagination'
import { trpc } from '@/trpc/react-provider'

// ============================================================================
// PAGE COMPONENT
// ============================================================================

/**
 * Portal templates page — lists all pending templates for admin review.
 * Provides approve/reject actions and an auto-approve toggle.
 */
export default function PortalTemplatesPage() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const utils = trpc.useUtils()

  // --------------------------------------------------------------------------
  // AUTO-APPROVE SETTING — Toggle to skip manual review
  // --------------------------------------------------------------------------

  /**
   * Fetch the current auto-approve setting from the portal config.
   * When enabled, new templates are automatically approved without admin review.
   */
  const { data: autoApproveSetting, isLoading: isLoadingAutoApprove } =
    trpc.portal.getAutoApproveSetting.useQuery(undefined, {
      staleTime: 5 * 60 * 1000,
    })

  /** Mutation to toggle the auto-approve setting */
  const setAutoApproveMutation = trpc.portal.setAutoApproveSetting.useMutation({
    onSuccess: () => {
      utils.portal.getAutoApproveSetting.invalidate()
    },
  })

  /** Handle auto-approve toggle change */
  const handleAutoApproveChange = (checked: boolean) => {
    setAutoApproveMutation.mutate({ autoApprove: checked })
  }

  // --------------------------------------------------------------------------
  // PENDING TEMPLATES LIST — Paginated query
  // --------------------------------------------------------------------------

  /**
   * Fetch pending templates with pagination.
   * Only shows templates with PENDING_APPROVAL status.
   */
  const { data, isLoading, isFetching } = trpc.portal.listPendingTemplates.useQuery(
    { page, pageSize },
    {
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
    }
  )

  // --------------------------------------------------------------------------
  // APPROVE MUTATION — Approves a template and publishes it
  // --------------------------------------------------------------------------

  /** Track which template IDs are currently being approved */
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set())

  const approveMutation = trpc.portal.approveTemplate.useMutation({
    onMutate: ({ templateId }) => {
      setApprovingIds((prev) => new Set(prev).add(templateId))
    },
    onSuccess: () => {
      /* Refresh the pending templates list after approval */
      utils.portal.listPendingTemplates.invalidate()
    },
    onSettled: (_data, _error, { templateId }) => {
      setApprovingIds((prev) => {
        const next = new Set(prev)
        next.delete(templateId)
        return next
      })
    },
  })

  // --------------------------------------------------------------------------
  // REJECT MUTATION — Rejects a template with optional reason
  // --------------------------------------------------------------------------

  /** Track which template IDs are currently being rejected */
  const [rejectingIds, setRejectingIds] = useState<Set<string>>(new Set())

  const rejectMutation = trpc.portal.rejectTemplate.useMutation({
    onMutate: ({ templateId }) => {
      setRejectingIds((prev) => new Set(prev).add(templateId))
    },
    onSuccess: () => {
      /* Refresh the pending templates list after rejection */
      utils.portal.listPendingTemplates.invalidate()
    },
    onSettled: (_data, _error, { templateId }) => {
      setRejectingIds((prev) => {
        const next = new Set(prev)
        next.delete(templateId)
        return next
      })
    },
  })

  /** Handle approve action from the review card */
  const handleApprove = (templateId: string) => {
    approveMutation.mutate({ templateId })
  }

  /** Handle reject action from the review card */
  const handleReject = (templateId: string, reason?: string) => {
    rejectMutation.mutate({ templateId, reason })
  }

  /** Handle page size change — reset to first page */
  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    setPage(1)
  }

  const templates = (data?.items ?? []) as PendingTemplateItem[]
  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1
  const total = data?.total ?? 0

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold">Templates</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review and approve templates submitted by organizations
        </p>
      </div>

      {/* Auto-Approve Toggle + Stats */}
      <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <Switch
            id="auto-approve"
            checked={autoApproveSetting?.autoApprove ?? false}
            onCheckedChange={handleAutoApproveChange}
            disabled={isLoadingAutoApprove || setAutoApproveMutation.isPending}
          />
          <Label htmlFor="auto-approve" className="text-sm cursor-pointer">
            Auto-approve new templates
          </Label>
          {setAutoApproveMutation.isPending && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {isFetching && !isLoading && (
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          )}
          {data && <span>{total} pending</span>}
        </div>
      </div>

      {/* Pending Templates Grid — same layout as marketplace TemplateGridView */}
      {isLoading ? (
        /* Loading skeletons — portrait card shape matching TemplateCard */
        <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-[3/4] rounded-lg bg-muted animate-pulse" />
              <div className="mt-2.5 space-y-1">
                <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
              </div>
              <div className="mt-3 flex gap-2">
                <div className="h-8 flex-1 rounded bg-muted animate-pulse" />
                <div className="h-8 flex-1 rounded bg-muted animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : templates.length === 0 ? (
        /* Empty state — no pending templates */
        <div className="rounded-lg border bg-card p-12 text-center">
          <Package className="mx-auto h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">
            No templates pending review
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Templates submitted for publishing will appear here
          </p>
        </div>
      ) : (
        /* Template review cards — same responsive grid as marketplace */
        <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {templates.map((template) => (
            <PortalTemplateReviewCard
              key={template.id}
              template={template}
              onApprove={handleApprove}
              onReject={handleReject}
              isApproving={approvingIds.has(template.id)}
              isRejecting={rejectingIds.has(template.id)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && total > pageSize && (
        <PortalPagination
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          total={total}
          currentCount={templates.length}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
          itemLabel="templates"
        />
      )}
    </div>
  )
}
