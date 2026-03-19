/**
 * ============================================================================
 * PORTAL — TEMPLATE REVIEW CARD
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: PortalTemplateReviewCard, PortalTemplateApproval,
 * PortalTemplatePendingCard
 *
 * WHY: Portal admins need to approve or reject templates that creators submit
 * for publishing. This card reuses the SAME visual design as the marketplace
 * TemplateCard (portrait thumbnail, name, org name) with approve/reject
 * actions added below.
 *
 * HOW: Renders the identical portrait aspect-[3/4] thumbnail card from the
 * marketplace grid, then adds approve/reject buttons underneath. Reject
 * opens a small inline textarea for an optional reason before confirming.
 */

'use client'

import { useState } from 'react'
import {
  Check,
  X,
  Loader2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

import { TEMPLATE_CATEGORY_META } from '@/lib/templates/constants'
import type { TemplateCategory } from '@/lib/templates/types'
import { usePlatformCurrency } from '@/components/providers/platform-currency-provider'

// ============================================================================
// PENDING TEMPLATE SHAPE — Matches portal.listPendingTemplates output
// ============================================================================

/**
 * Shape of a pending template returned by the portal listPendingTemplates query.
 * Matches TemplateListItem from the backend with the fields needed for review.
 *
 * SOURCE OF TRUTH: PendingTemplateItem, TemplateListItem
 */
export interface PendingTemplateItem {
  id: string
  name: string
  description: string | null
  category: TemplateCategory
  thumbnailUrl: string | null
  price: number | null
  tags: string[]
  organizationId: string
  /** Organization that created the template — displayed as "Creator" */
  organizationName: string
  /** When the template was last updated (used as submission date for display) */
  updatedAt: Date | string
  /** Number of items bundled in the template */
  itemCount: number
}

// ============================================================================
// PROPS
// ============================================================================

interface PortalTemplateReviewCardProps {
  /** The pending template to display */
  template: PendingTemplateItem
  /** Called when the admin clicks Approve */
  onApprove: (templateId: string) => void
  /** Called when the admin clicks Reject with optional reason */
  onReject: (templateId: string, reason?: string) => void
  /** Whether the approve mutation is currently in-flight for this template */
  isApproving: boolean
  /** Whether the reject mutation is currently in-flight for this template */
  isRejecting: boolean
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Review card for a single pending template in the portal.
 * Uses the SAME portrait card design as TemplateCard from the marketplace,
 * with approve/reject action buttons added below.
 *
 * Reject flow: clicking "Reject" reveals a textarea for an optional reason,
 * then a "Confirm Reject" button to submit.
 */
export function PortalTemplateReviewCard({
  template,
  onApprove,
  onReject,
  isApproving,
  isRejecting,
}: PortalTemplateReviewCardProps) {
  const { formatCurrency } = usePlatformCurrency()
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const categoryMeta = TEMPLATE_CATEGORY_META[template.category]
  const CategoryIcon = categoryMeta.icon

  /** Only show price badge for paid templates */
  const isPaid = template.price != null && template.price > 0

  /** Handle reject confirmation — sends reason if provided, then resets form */
  const handleRejectConfirm = () => {
    onReject(template.id, rejectReason.trim() || undefined)
    setShowRejectForm(false)
    setRejectReason('')
  }

  /** Cancel the reject form and reset state */
  const handleRejectCancel = () => {
    setShowRejectForm(false)
    setRejectReason('')
  }

  const isBusy = isApproving || isRejecting

  return (
    <div className="group">
      {/*
       * Thumbnail — portrait aspect ratio matching TemplateCard exactly.
       * Same rounded-lg, bg-muted, hover:shadow-md pattern.
       */}
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

        {/* Price badge — top-right corner, same style as TemplateCard */}
        {isPaid && (
          <span className="absolute right-2 top-2 rounded-full bg-foreground/80 px-2 py-0.5 text-[10px] font-medium text-background">
            {formatCurrency(template.price!)}
          </span>
        )}
      </div>

      {/* Template info below the thumbnail — matches TemplateCard spacing */}
      <div className="mt-2.5">
        <p className="truncate text-sm font-medium">{template.name}</p>
        <p className="text-xs text-muted-foreground">
          {template.organizationName}
        </p>
      </div>

      {/* Approve / Reject actions — minimal design, sits below card info */}
      <div className="mt-3">
        {!showRejectForm ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 gap-1.5"
              onClick={() => onApprove(template.id)}
              disabled={isBusy}
            >
              {isApproving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 gap-1.5"
              onClick={() => setShowRejectForm(true)}
              disabled={isBusy}
            >
              <X className="h-3.5 w-3.5" />
              Reject
            </Button>
          </div>
        ) : (
          /* Reject form — reason textarea (required for accountability) + confirm/cancel */
          <div className="space-y-2">
            <Textarea
              placeholder="Rejection reason..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={2}
              className="text-sm resize-none"
              disabled={isRejecting}
            />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 gap-1.5"
                onClick={handleRejectConfirm}
                disabled={isRejecting || !rejectReason.trim()}
              >
                {isRejecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
                Confirm
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="flex-1"
                onClick={handleRejectCancel}
                disabled={isRejecting}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
