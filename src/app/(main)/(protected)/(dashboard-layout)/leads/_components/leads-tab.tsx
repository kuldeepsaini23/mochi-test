/**
 * Leads Tab Component
 * Main leads table view with filters, search, and pagination
 * Uses tRPC with optimistic updates
 */

'use client'

import { useState, useEffect } from 'react'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { LeadsTable, type LeadWithRelations } from './leads-table'
import { LeadSheet } from './lead-sheet'
import { CreateLeadDialog } from './create-lead-dialog'
import { trackEvent, CLARITY_EVENTS } from '@/lib/clarity/events'
import type { LeadStatus } from '@/generated/prisma'

// Custom hook for debounced value
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debouncedValue
}

interface LeadsTabProps {
  organizationId: string
  onRegisterOpenDialog?: (openFn: () => void) => void
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}

interface LeadFormData {
  firstName: string
  lastName: string
  email: string
  phone?: string
  source?: string
  address?: string
  address2?: string
  city?: string
  state?: string
  zipCode?: string
  country?: string
  status: LeadStatus
}

export function LeadsTab({
  organizationId,
  onRegisterOpenDialog,
  canCreate,
  canUpdate,
  canDelete,
}: LeadsTabProps) {
  const utils = trpc.useUtils()

  // Separate input value from debounced query value
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounce(searchInput, 300)

  const [statusFilter, setStatusFilter] = useState<LeadStatus[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selectedLead, setSelectedLead] = useState<LeadWithRelations | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  // Register the open dialog function with parent
  useEffect(() => {
    onRegisterOpenDialog?.(() => setCreateDialogOpen(true))
  }, [onRegisterOpenDialog])

  // Fetch leads from API with filters (uses debounced search)
  const { data, isLoading, isError } = trpc.leads.list.useQuery({
    organizationId,
    search: debouncedSearch || undefined,
    status: statusFilter.length > 0 ? statusFilter : undefined,
    page,
    pageSize,
  })

  // Fetch status counts
  const { data: statusCounts } = trpc.leads.getStatusCounts.useQuery({
    organizationId,
  })

  // Create lead mutation with optimistic updates
  const createLeadMutation = trpc.leads.create.useMutation({
    onMutate: async (newLead) => {
      // Cancel outgoing refetches
      await utils.leads.list.cancel()
      await utils.leads.getStatusCounts.cancel()

      // Snapshot previous values
      const previousListData = utils.leads.list.getData({
        organizationId,
        search: debouncedSearch || undefined,
        status: statusFilter.length > 0 ? statusFilter : undefined,
        page,
        pageSize,
      })
      const previousStatusCounts = utils.leads.getStatusCounts.getData({
        organizationId,
      })

      // Create optimistic lead with temp ID
      const optimisticLead: LeadWithRelations = {
        id: `temp-${Date.now()}`,
        organizationId,
        firstName: newLead.firstName,
        lastName: newLead.lastName,
        fullName: [newLead.firstName, newLead.lastName].filter(Boolean).join(' ') || 'Unknown',
        email: newLead.email,
        phone: newLead.phone || null,
        avatarUrl: null,
        location: newLead.location || 'Unknown',
        locationCode: newLead.locationCode || 'XX',
        source: newLead.source || null,
        address: newLead.address || null,
        address2: newLead.address2 || null,
        city: newLead.city || null,
        state: newLead.state || null,
        zipCode: newLead.zipCode || null,
        country: newLead.country || null,
        cltv: 0,
        status: newLead.status || 'LEAD',
        assignedToId: newLead.assignedToId || null,
        assignedTo: null,
        tags: [],
        lastActivityAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      // Optimistically add to list (at the beginning since sorted by createdAt desc)
      utils.leads.list.setData(
        {
          organizationId,
          search: debouncedSearch || undefined,
          status: statusFilter.length > 0 ? statusFilter : undefined,
          page,
          pageSize,
        },
        (old) => {
          if (!old) return old
          return {
            ...old,
            leads: [optimisticLead, ...old.leads].slice(0, pageSize),
            total: old.total + 1,
          }
        }
      )

      // Optimistically update status counts
      utils.leads.getStatusCounts.setData(
        { organizationId },
        (old) => {
          if (!old) return old
          const status = newLead.status || 'LEAD'
          return {
            ...old,
            All: (old.All || 0) + 1,
            [status]: (old[status] || 0) + 1,
          }
        }
      )

      return { previousListData, previousStatusCounts }
    },
    onError: (err, _newLead, context) => {
      // Rollback on error
      if (context?.previousListData) {
        utils.leads.list.setData(
          {
            organizationId,
            search: debouncedSearch || undefined,
            status: statusFilter.length > 0 ? statusFilter : undefined,
            page,
            pageSize,
          },
          context.previousListData
        )
      }
      if (context?.previousStatusCounts) {
        utils.leads.getStatusCounts.setData(
          { organizationId },
          context.previousStatusCounts
        )
      }

      // Server-side feature limit errors are rare since FeatureGate in
      // leads-page-content.tsx catches them client-side first. If one does
      // slip through, show a descriptive toast and close the dialog.
      const errorData = err.data as { cause?: { type?: string } } | undefined
      const cause = errorData?.cause

      if (cause?.type === 'FEATURE_LIMIT_EXCEEDED') {
        setCreateDialogOpen(false)
        toast.error('You have reached your lead limit. Please upgrade your plan.')
      } else {
        toast.error('Failed to create lead')
      }
    },
    onSuccess: () => {
      trackEvent(CLARITY_EVENTS.LEAD_CREATED)
      toast.success('Lead created successfully')
      setCreateDialogOpen(false)
    },
    onSettled: () => {
      // Always refetch to sync with server
      utils.leads.list.invalidate()
      utils.leads.getStatusCounts.invalidate()
    },
  })

  // Update lead mutation with optimistic updates
  const updateLeadMutation = trpc.leads.update.useMutation({
    onMutate: async (newData) => {
      // Cancel outgoing refetches
      await utils.leads.list.cancel()

      // Snapshot previous values
      const previousData = utils.leads.list.getData({
        organizationId,
        search: debouncedSearch || undefined,
        status: statusFilter.length > 0 ? statusFilter : undefined,
        page,
        pageSize,
      })
      const previousSelectedLead = selectedLead

      // Build optimistic update with proper fullName calculation
      const optimisticUpdate = {
        ...newData,
        fullName: [newData.firstName, newData.lastName].filter(Boolean).join(' ') || selectedLead?.fullName || 'Unknown',
        updatedAt: new Date().toISOString(),
      }

      // Optimistically update the list
      utils.leads.list.setData(
        {
          organizationId,
          search: debouncedSearch || undefined,
          status: statusFilter.length > 0 ? statusFilter : undefined,
          page,
          pageSize,
        },
        (old) => {
          if (!old) return old
          return {
            ...old,
            leads: old.leads.map((lead) =>
              lead.id === newData.leadId
                ? { ...lead, ...optimisticUpdate }
                : lead
            ),
          }
        }
      )

      // Optimistically update the selected lead (detail view)
      if (selectedLead && selectedLead.id === newData.leadId) {
        setSelectedLead((prev) => prev ? { ...prev, ...optimisticUpdate } : null)
      }

      return { previousData, previousSelectedLead }
    },
    onError: (_err, _newData, context) => {
      // Rollback on error
      if (context?.previousData) {
        utils.leads.list.setData(
          {
            organizationId,
            search: debouncedSearch || undefined,
            status: statusFilter.length > 0 ? statusFilter : undefined,
            page,
            pageSize,
          },
          context.previousData
        )
      }
      // Rollback selected lead
      if (context?.previousSelectedLead) {
        setSelectedLead(context.previousSelectedLead)
      }
      toast.error('Failed to update lead')
    },
    onSuccess: () => {
      toast.success('Lead updated successfully')
    },
    onSettled: () => {
      // Always refetch after error or success
      utils.leads.list.invalidate()
      utils.leads.getStatusCounts.invalidate()
    },
  })

  // Bulk delete mutation with optimistic updates
  const bulkDeleteMutation = trpc.leads.bulkDelete.useMutation({
    onMutate: async ({ leadIds }) => {
      await utils.leads.list.cancel()

      const previousData = utils.leads.list.getData({
        organizationId,
        search: debouncedSearch || undefined,
        status: statusFilter.length > 0 ? statusFilter : undefined,
        page,
        pageSize,
      })

      // Optimistically remove
      utils.leads.list.setData(
        {
          organizationId,
          search: debouncedSearch || undefined,
          status: statusFilter.length > 0 ? statusFilter : undefined,
          page,
          pageSize,
        },
        (old) => {
          if (!old) return old
          return {
            ...old,
            leads: old.leads.filter((lead) => !leadIds.includes(lead.id)),
            total: old.total - leadIds.length,
          }
        }
      )

      return { previousData }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousData) {
        utils.leads.list.setData(
          {
            organizationId,
            search: debouncedSearch || undefined,
            status: statusFilter.length > 0 ? statusFilter : undefined,
            page,
            pageSize,
          },
          context.previousData
        )
      }
      toast.error('Failed to delete leads')
    },
    onSuccess: (result) => {
      toast.success(`${result.count} leads deleted`)
    },
    onSettled: () => {
      utils.leads.list.invalidate()
      utils.leads.getStatusCounts.invalidate()
    },
  })

  const handleLeadClick = (lead: LeadWithRelations) => {
    setSelectedLead(lead)
  }

  const handleCloseSheet = () => {
    setSelectedLead(null)
  }

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    setPage(1) // Reset to first page when page size changes
  }

  const handleUpdateLead = (formData: Record<string, unknown>) => {
    if (!selectedLead) return

    updateLeadMutation.mutate({
      organizationId,
      leadId: selectedLead.id,
      ...formData,
    })
  }

  const handleBulkDelete = (ids: string[]) => {
    bulkDeleteMutation.mutate({
      organizationId,
      leadIds: ids,
    })
  }

  const handleCreateLead = (data: LeadFormData) => {
    createLeadMutation.mutate({
      organizationId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone || null,
      source: data.source || null,
      address: data.address || null,
      address2: data.address2 || null,
      city: data.city || null,
      state: data.state || null,
      zipCode: data.zipCode || null,
      country: data.country || null,
      status: data.status,
    })
  }

  // Handler for optimistic tag updates in the detail view
  const handleTagsChange = (tags: LeadWithRelations['tags']) => {
    if (selectedLead) {
      // Update selectedLead optimistically
      setSelectedLead((prev) => prev ? { ...prev, tags } : null)

      // Also update the list cache
      utils.leads.list.setData(
        {
          organizationId,
          search: debouncedSearch || undefined,
          status: statusFilter.length > 0 ? statusFilter : undefined,
          page,
          pageSize,
        },
        (old) => {
          if (!old) return old
          return {
            ...old,
            leads: old.leads.map((lead) =>
              lead.id === selectedLead.id
                ? { ...lead, tags }
                : lead
            ),
          }
        }
      )
    }
  }

  // Error state - show error with filters still visible
  if (isError) {
    return (
      <div className="space-y-4">
        <LeadsTable
          leads={[]}
          totalLeads={0}
          searchQuery={searchInput}
          onSearchChange={setSearchInput}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          statusCounts={statusCounts || { All: 0, LEAD: 0, PROSPECT: 0, ACTIVE: 0, INACTIVE: 0 }}
          currentPage={page}
          totalPages={1}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={handlePageSizeChange}
          onLeadClick={handleLeadClick}
          onBulkDelete={handleBulkDelete}
          isDeleting={false}
          isLoading={false}
        />
        <div className="flex h-32 items-center justify-center">
          <div className="text-sm text-destructive">
            Failed to load leads. Please try again.
          </div>
        </div>
      </div>
    )
  }

  // Check if we're in initial loading (no data yet)
  const isInitialLoading = isLoading && !data

  return (
    <>
      <LeadsTable
        leads={data?.leads || []}
        totalLeads={data?.total || 0}
        searchQuery={searchInput}
        onSearchChange={setSearchInput}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusCounts={statusCounts || { All: 0, LEAD: 0, PROSPECT: 0, ACTIVE: 0, INACTIVE: 0 }}
        currentPage={page}
        totalPages={data?.totalPages || 1}
        onPageChange={setPage}
        pageSize={pageSize}
        onPageSizeChange={handlePageSizeChange}
        onLeadClick={handleLeadClick}
        onBulkDelete={canDelete ? handleBulkDelete : undefined}
        isDeleting={bulkDeleteMutation.isPending}
        isLoading={isInitialLoading}
        canDelete={canDelete}
      />

      {/* Create Lead Dialog - Only render if canCreate */}
      {canCreate && (
        <CreateLeadDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSubmit={handleCreateLead}
          isSubmitting={createLeadMutation.isPending}
        />
      )}

      {/* Lead Sheet - Opens when clicking a lead
          NOTE: LeadViewer is self-contained, handles mutations internally
          Optional callbacks sync updates with leads list cache */}
      <LeadSheet
        lead={selectedLead}
        open={!!selectedLead}
        onOpenChange={(open) => {
          if (!open) handleCloseSheet()
        }}
        onUpdate={canUpdate ? handleUpdateLead : undefined}
        onTagsChange={canUpdate ? handleTagsChange : undefined}
        isUpdating={updateLeadMutation.isPending}
      />

    </>
  )
}
