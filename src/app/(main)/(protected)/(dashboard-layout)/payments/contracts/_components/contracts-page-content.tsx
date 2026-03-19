'use client'

/**
 * Contracts Page Content — Flat Contract Instances List
 *
 * Simple, clean listing page for contract INSTANCES (isTemplate: false).
 * No tabs, no nested layouts. Template browsing happens inside the TemplatePickerModal.
 *
 * LAYOUT:
 * - Page header with title + "Create Contract" button
 * - Status filter pills (All, Draft, Sent, Completed, Archived)
 * - Search bar + Grid/List view toggle
 * - Contract instance cards
 * - Full-screen contract builder overlay (controlled by ?contract=xxx URL param)
 *
 * FLOW:
 * - "Create Contract" → opens TemplatePickerModal (blank or from template)
 * - Click any contract card → opens the builder overlay
 *
 * SOURCE OF TRUTH: Contract, ContractStatus, ActiveOrganization
 * Keywords: CONTRACTS_PAGE_CONTENT, CONTRACT_LISTING, CONTRACT_MANAGEMENT
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
  Search,
  Grid3X3,
  List,
  ShieldAlert,
  Building2,
  FileText,
  FilePlus2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { trpc } from '@/trpc/react-provider'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { cn } from '@/lib/utils'
import { ContractPreviewCard, type ContractPreviewCardProps } from './contract-preview-card'
import { ContractBuilder } from './contract-builder'
import { TemplatePickerModal } from './template-picker-modal'
import { FeatureGate } from '@/components/feature-gate'
import { LeadSheet } from '@/app/(main)/(protected)/(dashboard-layout)/leads/_components/lead-sheet'
import type { ContractStatus } from '@/generated/prisma'

// ============================================================================
// TYPES
// ============================================================================

/** View mode for contracts display */
type ViewMode = 'grid' | 'list'

/**
 * Status filter options for the filter pills.
 * 'ALL' means no filter, the rest correspond to ContractStatus enum values.
 */
type StatusFilter = 'ALL' | ContractStatus

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Sent' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ARCHIVED', label: 'Archived' },
]

// ============================================================================
// LOADING SKELETON
// ============================================================================

/**
 * Full page loading skeleton that matches the contracts page layout.
 * Shown during initial data fetch before organization/permissions are loaded.
 */
function ContractsLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col">
            <Skeleton className="h-[240px] rounded-xl" />
            <div className="mt-3 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ContractsPageContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // ============================================================================
  // ORGANIZATION DATA
  // ============================================================================

  const { activeOrganization, isLoading: isLoadingOrg, hasPermission } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''
  const hasAccess = hasPermission(permissions.CONTRACTS_READ)

  /** URL-driven contract builder overlay — ?contract=xxx opens the builder */
  const editingContractId = searchParams.get('contract') || null


  // ============================================================================
  // LOCAL STATE
  // ============================================================================

  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)

  /** Search with 400ms debounce */
  const [localSearch, setLocalSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const handleSearchChange = useCallback((value: string) => {
    setLocalSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), 400)
  }, [])

  /** Delete confirmation dialog state */
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    id: string
    name: string
  } | null>(null)

  /** Lead sheet state — opens when user clicks recipient on a contract card */
  const [openLeadId, setOpenLeadId] = useState<string | null>(null)

  // ============================================================================
  // URL HELPERS
  // ============================================================================

  const updateUrlParams = useCallback(
    (params: { contract?: string | null }) => {
      const newParams = new URLSearchParams(searchParams.toString())

      if (params.contract !== undefined) {
        if (params.contract === null) {
          newParams.delete('contract')
        } else {
          newParams.set('contract', params.contract)
        }
      }

      const queryString = newParams.toString()
      router.push(`${pathname}${queryString ? `?${queryString}` : ''}`, { scroll: false })
    },
    [router, pathname, searchParams]
  )

  // ============================================================================
  // DATA FETCHING — contract instances only (isTemplate: false)
  // ============================================================================

  const utils = trpc.useUtils()

  /**
   * Invalidate the contracts list on mount so the user always sees fresh data
   * when navigating to /payments/contracts. Without this, React Query's 30s
   * staleTime means returning within 30s shows cached (possibly stale) data —
   * e.g., a contract created in background mode won't appear until the cache expires.
   */
  useEffect(() => {
    if (organizationId) {
      utils.contracts.list.invalidate()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data: contractsData, isLoading } = trpc.contracts.list.useQuery(
    {
      organizationId,
      page: 1,
      limit: 100,
      isTemplate: false,
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      search: debouncedSearch || undefined,
    },
    { enabled: !!organizationId, staleTime: 30000 }
  )

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  const duplicateMutation = trpc.contracts.duplicate.useMutation({
    onSuccess: () => {
      toast.success('Contract duplicated')
      utils.contracts.list.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to duplicate contract')
    },
  })

  const deleteMutation = trpc.contracts.delete.useMutation({
    onSuccess: () => {
      toast.success('Contract deleted')
      utils.contracts.list.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete contract')
    },
  })

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleOpenContract = (contractId: string) => {
    updateUrlParams({ contract: contractId })
  }

  const handleBuilderClose = () => {
    updateUrlParams({ contract: null })
    utils.contracts.list.invalidate()
  }

  const handleDuplicate = (contractId: string) => {
    duplicateMutation.mutate({ organizationId, id: contractId })
  }

  const handleDeleteClick = (id: string, name: string) => {
    setDeleteDialog({ open: true, id, name })
  }

  const handleDeleteConfirm = () => {
    if (!deleteDialog) return
    deleteMutation.mutate({ organizationId, id: deleteDialog.id })
    setDeleteDialog(null)
  }

  // ============================================================================
  // COMPUTED STATE
  // ============================================================================

  const contracts = contractsData?.contracts || []
  const isEmpty = !isLoading && contracts.length === 0
  const isSearching = debouncedSearch.length > 0
  const showBuilder = !!editingContractId

  // ============================================================================
  // EARLY RETURNS
  // ============================================================================

  if (isLoadingOrg && !activeOrganization) {
    return <ContractsLoadingSkeleton />
  }

  if (!activeOrganization) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Building2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">No Organization Found</h3>
          <p className="text-sm text-muted-foreground">
            You need to be part of an organization to access contracts.
            Please contact your administrator.
          </p>
        </div>
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-6 w-6 text-destructive" />
          </div>
          <h3 className="text-lg font-semibold">Access Denied</h3>
          <p className="text-sm text-muted-foreground">
            You don&apos;t have permission to view contracts.
          </p>
          <p className="text-xs text-muted-foreground">
            Contact your organization owner to grant you the{' '}
            <code className="px-1 py-0.5 bg-muted rounded text-xs">
              contracts:read
            </code>{' '}
            permission.
          </p>
        </div>
      </div>
    )
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <>
      <div className="space-y-6">
        {/* Page header — title + action buttons */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">Contracts</h2>
            <p className="text-sm text-muted-foreground">
              Create, manage, and send contracts for signing
            </p>
          </div>
          <FeatureGate feature="contracts.limit">
            <Button onClick={() => setTemplatePickerOpen(true)}>
              <FilePlus2 className="mr-2 h-4 w-4" />
              Create Contract
            </Button>
          </FeatureGate>
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setStatusFilter(option.value)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-full transition-colors border',
                statusFilter === option.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Search + View toggle row */}
        <div className="flex items-center justify-between gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search contracts..."
              value={localSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => value && setViewMode(value as ViewMode)}
            className="bg-muted rounded-md p-1"
          >
            <ToggleGroupItem
              value="grid"
              aria-label="Grid view"
              className="h-7 w-7 p-0 data-[state=on]:bg-background"
            >
              <Grid3X3 className="w-4 h-4" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="list"
              aria-label="List view"
              className="h-7 w-7 p-0 data-[state=on]:bg-background"
            >
              <List className="w-4 h-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Search indicator */}
        {isSearching && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Showing results for</span>
            <span className="font-medium text-foreground">&quot;{debouncedSearch}&quot;</span>
          </div>
        )}

        {/* Loading skeleton — Grid */}
        {isLoading && viewMode === 'grid' && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col">
                <Skeleton className="h-[240px] rounded-xl" />
                <div className="mt-3 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Loading skeleton — List */}
        {isLoading && viewMode === 'list' && (
          <div className="space-y-1">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-lg">
                <Skeleton className="w-10 h-10 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {isEmpty && !isLoading && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="rounded-full bg-muted p-4 mb-4">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                {isSearching
                  ? 'No results found'
                  : statusFilter !== 'ALL'
                    ? `No ${statusFilter.toLowerCase()} contracts`
                    : 'No contracts yet'}
              </h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
                {isSearching
                  ? `No contracts match "${debouncedSearch}"`
                  : statusFilter !== 'ALL'
                    ? `You don't have any contracts with ${statusFilter.toLowerCase()} status`
                    : 'Create your first contract from a template or start from scratch'}
              </p>
              {!isSearching && statusFilter === 'ALL' && (
                <FeatureGate feature="contracts.limit">
                  <Button onClick={() => setTemplatePickerOpen(true)}>
                    <FilePlus2 className="mr-2 h-4 w-4" />
                    Create Contract
                  </Button>
                </FeatureGate>
              )}
            </CardContent>
          </Card>
        )}

        {/* Contract cards — Grid View */}
        {!isLoading && !isEmpty && viewMode === 'grid' && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {contracts.map((contract) => (
              <ContractPreviewCard
                key={contract.id}
                id={contract.id}
                name={contract.name}
                status={contract.status}
                content={
                  typeof contract.content === 'string'
                    ? contract.content
                    : contract.content
                      ? JSON.stringify(contract.content)
                      : null
                }
                updatedAt={String(contract.updatedAt)}
                viewMode="grid"
                accessToken={(contract as unknown as Record<string, unknown>).accessToken as string | null | undefined}
                recipient={(contract as unknown as Record<string, unknown>).recipient as ContractPreviewCardProps['recipient']}
                onRecipientClick={(leadId) => setOpenLeadId(leadId)}
                onClick={() => handleOpenContract(contract.id)}
                onDuplicate={() => handleDuplicate(contract.id)}
                onMove={() => {
                  /* Contract instances don't use folders */
                }}
                onDelete={() => handleDeleteClick(contract.id, contract.name)}
              />
            ))}
          </div>
        )}

        {/* Contract cards — List View */}
        {!isLoading && !isEmpty && viewMode === 'list' && (
          <div className="space-y-1">
            {contracts.map((contract) => (
              <ContractPreviewCard
                key={contract.id}
                id={contract.id}
                name={contract.name}
                status={contract.status}
                content={
                  typeof contract.content === 'string'
                    ? contract.content
                    : contract.content
                      ? JSON.stringify(contract.content)
                      : null
                }
                updatedAt={String(contract.updatedAt)}
                viewMode="list"
                accessToken={(contract as unknown as Record<string, unknown>).accessToken as string | null | undefined}
                recipient={(contract as unknown as Record<string, unknown>).recipient as ContractPreviewCardProps['recipient']}
                onRecipientClick={(leadId) => setOpenLeadId(leadId)}
                onClick={() => handleOpenContract(contract.id)}
                onDuplicate={() => handleDuplicate(contract.id)}
                onMove={() => {
                  /* Contract instances don't use folders */
                }}
                onDelete={() => handleDeleteClick(contract.id, contract.name)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Contract Builder Overlay — controlled by ?contract=xxx URL param */}
      {showBuilder && editingContractId && (
        <ContractBuilder
          contractId={editingContractId}
          organizationId={organizationId}
          onClose={handleBuilderClose}
          onSwitchToContract={(newContractId) => {
            /** When "Use Template" in the builder creates a new contract, switch the URL to it */
            updateUrlParams({ contract: newContractId })
          }}
        />
      )}

      {/* Template Picker Modal — "Create Contract" flow */}
      <TemplatePickerModal
        open={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
        organizationId={organizationId}
        onContractCreated={(contractId) => {
          updateUrlParams({ contract: contractId })
        }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteDialog?.open ?? false}
        onOpenChange={(open) => {
          if (!open) setDeleteDialog(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contract</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteDialog?.name}&quot;?
              <span className="block mt-2">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lead Sheet — opens when clicking recipient avatar on a contract card */}
      {openLeadId && (
        <LeadSheet
          leadId={openLeadId}
          organizationId={organizationId}
          open={!!openLeadId}
          onOpenChange={(open) => !open && setOpenLeadId(null)}
        />
      )}
    </>
  )
}
