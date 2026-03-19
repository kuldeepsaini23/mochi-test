/**
 * Lead Viewer Component - Self-Contained Lead Management
 *
 * WHY: Single reusable component for viewing AND editing lead details
 * HOW: Handles all mutations internally - no need to pass handlers from parent
 *
 * TABS:
 * - Details: Lead info, tags, and editable fields
 * - Custom Data: Custom fields and data
 * - Communications: Inbox/messages for this lead (reuses inbox components)
 * - Activity: Activity timeline (coming soon)
 * - Transactions: Transaction history for this lead
 * - Orders: Orders linked to this lead through transactions
 *
 * DATA FETCHING MODES:
 * 1. Pass full `lead` object (for leads page which already has the data)
 * 2. Pass `leadId` + `organizationId` only (for pipeline/inbox - fetches internally)
 *
 * SELF-CONTAINED:
 * - All update mutations are handled internally
 * - Tags mutations already self-contained in LeadTagsSelect
 * - Custom data mutations already self-contained in CustomDataSection
 * - Optional callbacks for external sync (e.g., leads page list cache)
 *
 * SOURCE OF TRUTH: LeadViewer, LeadSheet, SelfContainedLeadManagement
 */

'use client'

import { useState, useEffect } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  getLeadInitials,
  getLeadDisplayName,
  getLeadAvatarColor,
  formatStatus,
} from '@/lib/utils/lead-helpers'
import { getTextColorForBackground, getStatusColor } from '@/constants/colors'
import { LeadDetailsForm } from './lead-details-form'
import { LeadTagsSelect } from './lead-tags-select'
import { CustomDataSection } from './custom-data-section'
import { LeadConversation } from '@/components/inbox/lead-conversation'
import { LeadActivityTimeline } from './activity'
import { LeadTransactionsTab } from './lead-transactions-tab'
import { LeadOrdersTab } from './lead-orders-tab'
import { trpc } from '@/trpc/react-provider'
import type { LeadWithRelations } from './leads-table'

/**
 * Tab types available in LeadViewer
 * Exported for use in controlled mode (e.g., inbox persisting tab selection)
 */
export type LeadViewerTab = 'details' | 'custom-data' | 'communications' | 'activity' | 'transactions' | 'orders'

/**
 * Props for when full lead data is provided externally (e.g., leads page)
 */
interface LeadViewerWithDataProps {
  lead: LeadWithRelations
  leadId?: never
  organizationId?: never
  /**
   * Optional callback for external sync (e.g., update leads list cache)
   * WHY: Leads page may want to sync optimistic updates with its list
   */
  onUpdate?: (data: Record<string, unknown>) => void
  onTagsChange?: (tags: LeadWithRelations['tags']) => void
  isUpdating?: boolean
  defaultTab?: LeadViewerTab
  /**
   * Whether to hide the communications tab
   * WHY: Inbox already shows communications, no need to duplicate
   */
  hideCommunications?: boolean
  /**
   * Controlled tab state - when provided, parent controls the active tab
   * WHY: Allows parent to persist tab selection across lead changes (e.g., inbox)
   */
  activeTab?: LeadViewerTab
  onTabChange?: (tab: LeadViewerTab) => void
}

/**
 * Props for when only leadId is provided (e.g., pipeline, inbox)
 * Component will fetch lead data internally AND handle all mutations
 */
interface LeadViewerByIdProps {
  lead?: never
  leadId: string
  organizationId: string
  /**
   * Optional callback for external sync
   */
  onUpdate?: (data: Record<string, unknown>) => void
  onTagsChange?: (tags: LeadWithRelations['tags']) => void
  isUpdating?: boolean
  defaultTab?: LeadViewerTab
  hideCommunications?: boolean
  /**
   * Controlled tab state - when provided, parent controls the active tab
   */
  activeTab?: LeadViewerTab
  onTabChange?: (tab: LeadViewerTab) => void
}

type LeadViewerProps = LeadViewerWithDataProps | LeadViewerByIdProps

/**
 * Loading skeleton for lead header
 */
function HeaderSkeleton() {
  return (
    <div className="px-6 py-5">
      <div className="flex items-start gap-4">
        <div className="h-14 w-14 rounded-full bg-muted animate-pulse" />
        <div className="flex-1 min-w-0 pt-0.5 space-y-2">
          <div className="h-5 w-32 bg-muted rounded animate-pulse" />
          <div className="h-4 w-20 bg-muted rounded animate-pulse" />
        </div>
      </div>
    </div>
  )
}

export function LeadViewer(props: LeadViewerProps) {
  const {
    onUpdate,
    onTagsChange,
    isUpdating: externalIsUpdating,
    defaultTab = 'details',
    hideCommunications = false,
    activeTab: controlledActiveTab,
    onTabChange,
  } = props

  /**
   * Internal tab state - only used when component is uncontrolled
   * WHY: Supports both controlled (parent manages tab) and uncontrolled (internal) modes
   */
  const [internalActiveTab, setInternalActiveTab] = useState<LeadViewerTab>(defaultTab)

  /**
   * Determine if we're in controlled mode
   * WHY: When parent passes activeTab prop, they control the tab state
   */
  const isControlled = controlledActiveTab !== undefined

  /**
   * Current active tab - either from parent (controlled) or internal state
   */
  const activeTab = isControlled ? controlledActiveTab : internalActiveTab

  /**
   * Handle tab change - notifies parent if controlled, otherwise updates internal state
   */
  const handleTabChange = (tab: LeadViewerTab) => {
    if (isControlled && onTabChange) {
      onTabChange(tab)
    } else {
      setInternalActiveTab(tab)
    }
  }

  /**
   * Local lead state for optimistic updates
   * WHY: When we update a field, we want to show it immediately before server confirms
   */
  const [localLead, setLocalLead] = useState<LeadWithRelations | null>(null)

  const utils = trpc.useUtils()

  /**
   * Reset active tab when defaultTab changes (uncontrolled mode only)
   * WHY: When opening from pipeline chat button, we want communications tab selected
   * NOTE: In controlled mode, parent manages the tab state
   */
  useEffect(() => {
    if (!isControlled) {
      setInternalActiveTab(defaultTab)
    }
  }, [defaultTab, isControlled])

  /**
   * Determine if we need to fetch lead data internally
   * WHY: Pipeline/inbox passes leadId only, leads page passes full lead object
   */
  const shouldFetchLead = 'leadId' in props && !!props.leadId
  const providedLead = 'lead' in props ? props.lead : undefined

  /**
   * Get organizationId from either mode
   */
  const organizationId = providedLead?.organizationId ?? props.organizationId ?? ''

  /**
   * Fetch lead data when only leadId is provided
   * WHY: Pipeline/inbox doesn't have full lead data, so we fetch it here
   * This query is skipped if lead data is provided externally
   */
  const { data: fetchedLeadData, isLoading: isLoadingLead } = trpc.leads.getById.useQuery(
    {
      organizationId: props.organizationId ?? '',
      leadId: props.leadId ?? '',
    },
    {
      enabled: shouldFetchLead,
    }
  )

  /**
   * Internal update mutation - handles all lead updates
   * WHY: Makes component self-contained, usable anywhere without passing handlers
   */
  const updateMutation = trpc.leads.update.useMutation({
    onMutate: async (newData) => {
      // Optimistically update local state
      setLocalLead((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          ...newData,
          fullName: [newData.firstName ?? prev.firstName, newData.lastName ?? prev.lastName]
            .filter(Boolean)
            .join(' ') || prev.fullName,
          updatedAt: new Date().toISOString(),
        }
      })

      // Call external callback if provided (for leads page list sync)
      if (onUpdate) {
        onUpdate(newData)
      }
    },
    onError: (error) => {
      // Revert to fetched data on error
      if (fetchedLeadData) {
        setLocalLead(transformFetchedLead(fetchedLeadData))
      }
      toast.error(error.message || 'Failed to update lead')
    },
    onSuccess: () => {
      toast.success('Lead updated')
    },
    onSettled: () => {
      // Invalidate to sync with server
      utils.leads.getById.invalidate()
      utils.leads.list.invalidate()
    },
  })

  /**
   * Transform fetched data to LeadWithRelations type
   * WHY: API returns slightly different shape, need to normalize
   */
  function transformFetchedLead(data: NonNullable<typeof fetchedLeadData>): LeadWithRelations {
    return {
      id: data.id,
      organizationId: data.organizationId,
      firstName: data.firstName,
      lastName: data.lastName,
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      avatarUrl: data.avatarUrl,
      location: data.location ?? '',
      locationCode: data.locationCode ?? '',
      source: data.source,
      address: data.address,
      address2: data.address2,
      city: data.city,
      state: data.state,
      zipCode: data.zipCode,
      country: data.country,
      cltv: data.cltv,
      status: data.status,
      assignedToId: data.assignedToId,
      assignedTo: data.assignedTo ?? null,
      tags: data.tags ?? [],
      lastActivityAt: data.lastActivityAt,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    }
  }

  /**
   * Sync local state when fetched data changes
   * WHY: Need to update local state when server data refreshes
   */
  useEffect(() => {
    if (fetchedLeadData) {
      setLocalLead(transformFetchedLead(fetchedLeadData))
    }
  }, [fetchedLeadData])

  /**
   * Sync local state when provided lead changes (leads page mode)
   */
  useEffect(() => {
    if (providedLead) {
      setLocalLead(providedLead)
    }
  }, [providedLead])

  /**
   * Handle form submission - calls internal mutation
   * WHY: Self-contained - no external handler needed
   */
  const handleFormSubmit = (formData: Record<string, unknown>) => {
    if (!localLead) return

    updateMutation.mutate({
      organizationId: localLead.organizationId,
      leadId: localLead.id,
      ...formData,
    })
  }

  /**
   * Handle tags change - update local state and notify parent if callback provided
   * WHY: LeadTagsSelect handles its own mutations, we just need to sync local state
   */
  const handleTagsChange = (tags: LeadWithRelations['tags']) => {
    setLocalLead((prev) => prev ? { ...prev, tags } : null)
    if (onTagsChange) {
      onTagsChange(tags)
    }
  }

  // Show loading state when fetching lead data
  if (shouldFetchLead && isLoadingLead) {
    return (
      <div className="flex h-full flex-col">
        <HeaderSkeleton />
        <Separator />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  // Use local state (has optimistic updates) or fall back to provided/fetched data
  const lead = localLead

  // If no lead data, show not found message
  if (!lead) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">Lead not found</p>
        </div>
      </div>
    )
  }

  const isUpdating = updateMutation.isPending || externalIsUpdating
  const statusColor = getStatusColor(lead.status)
  const statusTextColor = getTextColorForBackground(statusColor)
  const avatarBg = getLeadAvatarColor(lead.id, lead.fullName)

  return (
    <div className="flex h-full flex-col">
      {/* Apple-like Header - Clean and Minimal */}
      <div className="px-6 py-5">
        <div className="flex items-start gap-4">
          <Avatar className="h-14 w-14 shrink-0">
            <AvatarImage
              src={lead.avatarUrl || undefined}
              alt={getLeadDisplayName(lead.fullName)}
            />
            <AvatarFallback
              className="text-base text-background/50 font-semibold"
              style={{
                backgroundColor: avatarBg,
              }}
            >
              {getLeadInitials(lead.fullName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 pt-0.5">
            <h2 className="text-lg font-semibold text-foreground mb-1">
              {getLeadDisplayName(lead.fullName)}
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="secondary"
                className="text-xs font-semibold border-0"
                style={{
                  backgroundColor: statusColor,
                  color: statusTextColor,
                }}
              >
                {formatStatus(lead.status)}
              </Badge>
              {lead.tags.map((tag) => {
                const tagTextColor = getTextColorForBackground(tag.color)
                return (
                  <Badge
                    key={tag.id}
                    variant="secondary"
                    className="text-xs font-medium border-0"
                    style={{ backgroundColor: tag.color, color: tagTextColor }}
                  >
                    {tag.name}
                  </Badge>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      <Separator />

      {/* Tabs - Apple Style */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => handleTabChange(value as LeadViewerTab)}
        className="flex-1 flex flex-col min-h-0"
      >
        {/* Scrollable tabs container */}
        <div className="px-6 pt-4 pb-2 overflow-x-auto scrollbar-none">
          <TabsList className="h-9 bg-muted/40 p-1 w-max">
            <TabsTrigger
              value="details"
              className="text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              Details
            </TabsTrigger>
            <TabsTrigger
              value="custom-data"
              className="text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              Custom Data
            </TabsTrigger>
            {/* Only show communications tab if not hidden */}
            {!hideCommunications && (
              <TabsTrigger
                value="communications"
                className="text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                Communications
              </TabsTrigger>
            )}
            <TabsTrigger
              value="activity"
              className="text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              Activity
            </TabsTrigger>
            <TabsTrigger
              value="transactions"
              className="text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              Transactions
            </TabsTrigger>
            <TabsTrigger
              value="orders"
              className="text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              Orders
            </TabsTrigger>
          </TabsList>
        </div>
        <div>
          <Separator />
        </div>
        <div className="flex-1 overflow-y-auto">
          <TabsContent value="details" className="mt-0 h-full">
            <div className="flex flex-col h-full">
              {/* Tags Section - Always editable, handles its own mutations */}
              <div className="px-6 py-4 border-b">
                <LeadTagsSelect
                  key={`tags-${lead.id}`}
                  organizationId={lead.organizationId}
                  leadId={lead.id}
                  selectedTagIds={lead.tags.map((t) => t.id)}
                  onTagsChange={handleTagsChange}
                />
              </div>

              {/* Lead Details Form - Self-contained with internal mutation */}
              <LeadDetailsForm
                key={`form-${lead.id}`}
                lead={lead}
                onSubmit={handleFormSubmit}
                isSubmitting={isUpdating}
                mode="edit"
              />
            </div>
          </TabsContent>

          <TabsContent value="custom-data" className="mt-0 h-full">
            <CustomDataSection
              key={`custom-${lead.id}`}
              organizationId={lead.organizationId}
              leadId={lead.id}
            />
          </TabsContent>

          {/* Communications Tab - Shows inbox/messages for this lead */}
          {!hideCommunications && (
            <TabsContent value="communications" className="mt-0 h-full">
              <LeadConversation
                organizationId={lead.organizationId}
                leadId={lead.id}
                leadName={getLeadDisplayName(lead.fullName)}
                leadEmail={lead.email}
                className="h-full flex flex-col"
              />
            </TabsContent>
          )}

          {/* Activity Tab - Chronological feed of all lead interactions */}
          <TabsContent value="activity" className="mt-0 h-full">
            <LeadActivityTimeline
              organizationId={lead.organizationId}
              leadId={lead.id}
            />
          </TabsContent>

          <TabsContent value="transactions" className="mt-0">
            <LeadTransactionsTab
              organizationId={lead.organizationId}
              leadId={lead.id}
            />
          </TabsContent>

          <TabsContent value="orders" className="mt-0">
            <LeadOrdersTab
              organizationId={lead.organizationId}
              leadId={lead.id}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
