/**
 * Lead Activity Timeline Component
 *
 * WHY: Renders a chronological feed of all activities related to a lead,
 * displayed in the Activity tab of the Lead Viewer. Aggregates data from
 * 10+ related models (forms, payments, appointments, messages, contracts,
 * invoices, pipelines, tags, sessions) into a single timeline.
 *
 * HOW: Uses tRPC's leads.getActivity endpoint with useInfiniteQuery for
 * cursor-based pagination. The LoadMoreTrigger component (IntersectionObserver)
 * automatically fetches the next page as the user scrolls near the bottom,
 * providing a seamless infinite-scroll experience.
 *
 * FEATURES:
 * - Vertical timeline with color-coded icons per activity type
 * - Relative timestamps (reuses formatRelativeTime from lead-helpers)
 * - Rich context per activity (amounts, names, statuses, previews)
 * - Tag badges with actual tag colors
 * - Loading skeleton for initial load
 * - Empty state when no activity exists
 * - Infinite scroll pagination via IntersectionObserver
 *
 * SOURCE OF TRUTH KEYWORDS: LeadActivityTimeline, ActivityFeed, ActivityTab
 */

'use client'

import { useMemo } from 'react'
import { trpc } from '@/trpc/react-provider'
import { formatRelativeTime, formatChannel, stripHtml, truncateText } from '@/lib/utils/lead-helpers'
import { formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { LoadMoreTrigger } from '@/components/pipelines/_components/load-more-trigger'
import {
  UserPlus,
  FileText,
  CreditCard,
  Calendar,
  Send,
  MessageSquare,
  FileSignature,
  CheckCircle2,
  Receipt,
  CircleDollarSign,
  Kanban,
  Tag,
  Globe,
  Eye,
  ClockIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { LeadActivityItem, LeadActivityType } from './types'

// ============================================================================
// PROPS
// ============================================================================

interface LeadActivityTimelineProps {
  organizationId: string
  leadId: string
}

// ============================================================================
// ICON & COLOR MAPPING
// ============================================================================

interface ActivityIconConfig {
  icon: LucideIcon
}

/**
 * Maps each activity type to its corresponding icon.
 * All icons use the same neutral muted-foreground color — no color coding.
 */
function getActivityIconConfig(type: LeadActivityType): ActivityIconConfig {
  switch (type) {
    case 'LEAD_CREATED':
      return { icon: UserPlus }
    case 'FORM_SUBMITTED':
      return { icon: FileText }
    case 'PAYMENT_MADE':
      return { icon: CreditCard }
    case 'APPOINTMENT_BOOKED':
      return { icon: Calendar }
    case 'MESSAGE_SENT':
      return { icon: Send }
    case 'MESSAGE_RECEIVED':
      return { icon: MessageSquare }
    case 'CONTRACT_SENT':
      return { icon: FileSignature }
    case 'CONTRACT_SIGNED':
      return { icon: CheckCircle2 }
    case 'INVOICE_SENT':
      return { icon: Receipt }
    case 'INVOICE_PAID':
      return { icon: CircleDollarSign }
    case 'PIPELINE_TICKET_CREATED':
      return { icon: Kanban }
    case 'TAG_ADDED':
      return { icon: Tag }
    case 'SESSION_STARTED':
      return { icon: Globe }
    case 'PAGE_VISITED':
      return { icon: Eye }
  }
}

// ============================================================================
// TITLE & DESCRIPTION GENERATORS
// ============================================================================

/**
 * Generate the primary title for an activity item.
 * Uses exhaustive switch on the discriminated union for type safety.
 */
function getActivityTitle(item: LeadActivityItem): string {
  switch (item.type) {
    case 'LEAD_CREATED':
      return 'Lead created'
    case 'FORM_SUBMITTED':
      return `Submitted "${item.formName}"`
    case 'PAYMENT_MADE':
      return `Payment of ${formatCurrency(item.amount, item.currency)}`
    case 'APPOINTMENT_BOOKED':
      return item.title
    case 'MESSAGE_SENT':
      return `Sent via ${formatChannel(item.channel)}`
    case 'MESSAGE_RECEIVED':
      return `Received via ${formatChannel(item.channel)}`
    case 'CONTRACT_SENT':
      return `Contract sent: ${item.contractName}`
    case 'CONTRACT_SIGNED':
      return `Contract signed: ${item.contractName}`
    case 'INVOICE_SENT':
      return `Invoice sent: ${item.invoiceName}`
    case 'INVOICE_PAID':
      return `Invoice paid: ${item.invoiceName}`
    case 'PIPELINE_TICKET_CREATED':
      return `Added to ${item.pipelineName}`
    case 'TAG_ADDED':
      return 'Tag added'
    case 'SESSION_STARTED':
      return 'Session started'
    case 'PAGE_VISITED':
      return `Visited ${item.pathname}`
  }
}

/**
 * Generate a secondary description line for activity items that have extra context.
 * Returns null for items that don't need a description line.
 */
function getActivityDescription(item: LeadActivityItem): string | null {
  switch (item.type) {
    case 'LEAD_CREATED':
      return 'This lead was added to the system'
    case 'FORM_SUBMITTED':
      return null
    case 'PAYMENT_MADE':
      return item.productSummary
    case 'APPOINTMENT_BOOKED':
      return `${new Date(item.startDate).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })}${item.location ? ` · ${item.location}` : ''}`
    case 'MESSAGE_SENT':
    case 'MESSAGE_RECEIVED':
      return item.subject || item.bodyPreview || null
    case 'CONTRACT_SENT':
      return null
    case 'CONTRACT_SIGNED':
      return null
    case 'INVOICE_SENT':
      return `${item.invoiceNumber} · ${formatCurrency(item.totalAmount, item.currency)}`
    case 'INVOICE_PAID':
      return `${item.invoiceNumber} · ${formatCurrency(item.totalAmount, item.currency)}`
    case 'PIPELINE_TICKET_CREATED':
      return `${item.ticketTitle} → ${item.laneName}${item.value ? ` · $${item.value.toLocaleString()}` : ''}`
    case 'TAG_ADDED':
      return null // Tag badge renders inline instead
    case 'SESSION_STARTED':
      return item.source ? `Source: ${item.source}` : null
    case 'PAGE_VISITED':
      return item.pageName + (item.utmSource ? ` · via ${item.utmSource}` : '')
  }
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Single activity item in the timeline */
function ActivityItem({ item, isLast }: { item: LeadActivityItem; isLast: boolean }) {
  const config = getActivityIconConfig(item.type)
  const Icon = config.icon
  const title = getActivityTitle(item)
  const description = getActivityDescription(item)

  return (
    <div className="relative flex gap-3 pb-6 last:pb-0">
      {/* Vertical connector line (hidden for last item) */}
      {!isLast && (
        <div className="absolute left-[15px] top-8 bottom-0 w-px bg-border" />
      )}

      {/* Icon circle — neutral styling, no color coding */}
      <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-foreground leading-tight">
            {title}
          </p>
          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0 pt-0.5">
            {formatRelativeTime(item.timestamp)}
          </span>
        </div>

        {/* Description line */}
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {description}
          </p>
        )}

        {/* Tag badge — rendered inline with actual tag color */}
        {item.type === 'TAG_ADDED' && (
          <Badge
            variant="secondary"
            className="mt-1 text-xs"
            style={{
              backgroundColor: `${item.tagColor}20`,
              color: item.tagColor,
              borderColor: `${item.tagColor}40`,
            }}
          >
            {item.tagName}
          </Badge>
        )}
      </div>
    </div>
  )
}

/** Loading skeleton for the initial fetch */
function ActivitySkeleton() {
  return (
    <div className="space-y-6 px-6 py-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-2 pt-0.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Empty state when lead has no activity */
function EmptyActivity() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <ClockIcon className="h-10 w-10 mb-3 text-muted-foreground/20" />
      <p className="text-sm font-medium text-muted-foreground">No activity yet</p>
      <p className="text-xs text-muted-foreground mt-1">
        Activity will appear here as this lead interacts with your business
      </p>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function LeadActivityTimeline({ organizationId, leadId }: LeadActivityTimelineProps) {
  /**
   * Infinite query for the activity timeline.
   * WHY: useInfiniteQuery handles cursor-based pagination automatically —
   * no manual page state, no useEffect to accumulate items, no deduplication needed.
   * The query key includes leadId, so switching leads resets everything automatically.
   */
  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = trpc.leads.getActivity.useInfiniteQuery(
    { organizationId, leadId, limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      enabled: !!organizationId && !!leadId,
    },
  )

  /**
   * Flatten all pages into a single flat list of activity items.
   * WHY: useInfiniteQuery stores data as pages array — we need a flat list for rendering.
   * useMemo ensures we only re-compute when pages actually change.
   */
  const allItems = useMemo(() => {
    if (!data?.pages) return []
    return data.pages.flatMap((page) => page.items)
  }, [data?.pages])

  /** Grab the total estimate from the last fetched page for the count indicator */
  const totalEstimate = data?.pages?.[data.pages.length - 1]?.totalEstimate ?? 0

  // Initial loading state
  if (isLoading && allItems.length === 0) {
    return <ActivitySkeleton />
  }

  // Empty state
  if (!isLoading && allItems.length === 0) {
    return <EmptyActivity />
  }

  return (
    <ScrollArea className="h-full">
      <div className="px-6 py-4">
        {/* Timeline items */}
        {allItems.map((item, index) => (
          <ActivityItem
            key={item.id}
            item={item}
            isLast={index === allItems.length - 1 && !hasNextPage}
          />
        ))}

        {/* Infinite scroll trigger — fires fetchNextPage when scrolled into view */}
        <LoadMoreTrigger
          onLoadMore={() => fetchNextPage()}
          hasMore={hasNextPage ?? false}
          isLoading={isFetchingNextPage}
          rootMargin="200px"
        />

        {/* Total count indicator */}
        {totalEstimate > 0 && (
          <p className="text-center text-xs text-muted-foreground/60 pb-4">
            {allItems.length} of {totalEstimate} activities
          </p>
        )}
      </div>
    </ScrollArea>
  )
}
