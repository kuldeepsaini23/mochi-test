'use client'

/**
 * Invoices Page Content — Main Listing View
 *
 * Flat listing of invoices with status filter pills, search, grid/list view,
 * and a full-screen builder overlay controlled by ?invoice=xxx URL param.
 *
 * PATTERN: Mirrors contracts-page-content.tsx architecture
 *
 * LAYOUT:
 * - Page header with title + "Create Invoice" button
 * - Status filter pills (All, Draft, Sent, Paid, Overdue, Canceled)
 * - Search bar
 * - Invoice cards (grid) showing status badge, amount, recipient, date
 * - Full-screen invoice builder overlay (URL-driven)
 *
 * SOURCE OF TRUTH: Invoice, InvoiceStatus, ActiveOrganization
 * Keywords: INVOICES_PAGE_CONTENT, INVOICE_LISTING, INVOICE_MANAGEMENT
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
  Search,
  ShieldAlert,
  Building2,
  FileText,
  FilePlus2,
  Trash2,
  MoreHorizontal,
  Copy,
  ExternalLink,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { trpc } from '@/trpc/react-provider'
import { trackEvent, CLARITY_EVENTS } from '@/lib/clarity/events'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { cn } from '@/lib/utils'
import { getConsistentColor, getTextColorForBackground } from '@/constants/colors'
import type { InvoiceStatus } from '@/generated/prisma'
import {
  INVOICE_STATUS_CONFIG,
  formatInvoiceAmount,
  formatInvoiceDate,
  getInvoiceRecipientName,
} from './utils'
import { InvoiceBuilder } from './invoice-builder'
import { FeatureGate } from '@/components/feature-gate'

// ============================================================================
// TYPES
// ============================================================================

/** Status filter including an "ALL" option */
type StatusFilter = 'ALL' | InvoiceStatus

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Sent' },
  { value: 'PAID', label: 'Paid' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'CANCELED', label: 'Canceled' },
]

// ============================================================================
// LOADING SKELETON
// ============================================================================

/**
 * Full page loading skeleton matching the invoices page layout.
 * Shown during initial data fetch before organization/permissions are loaded.
 */
function InvoicesLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[160px] rounded-xl" />
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function InvoicesPageContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // ============================================================================
  // ORGANIZATION DATA
  // ============================================================================

  const { activeOrganization, isLoading: isLoadingOrg, hasPermission } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''
  const hasAccess = hasPermission(permissions.INVOICES_READ)
  const canCreate = hasPermission(permissions.INVOICES_CREATE)
  const canDelete = hasPermission(permissions.INVOICES_DELETE)

  /** URL-driven invoice builder overlay — ?invoice=xxx opens the builder */
  const editingInvoiceId = searchParams.get('invoice') || null

  // ============================================================================
  // LOCAL STATE
  // ============================================================================

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')

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

  // ============================================================================
  // URL HELPERS
  // ============================================================================

  const updateUrlParams = useCallback(
    (params: { invoice?: string | null }) => {
      const newParams = new URLSearchParams(searchParams.toString())

      if (params.invoice !== undefined) {
        if (params.invoice === null) {
          newParams.delete('invoice')
        } else {
          newParams.set('invoice', params.invoice)
        }
      }

      const queryString = newParams.toString()
      router.push(`${pathname}${queryString ? `?${queryString}` : ''}`, { scroll: false })
    },
    [router, pathname, searchParams]
  )

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const { data: invoicesData, isLoading } = trpc.invoices.list.useQuery(
    {
      organizationId,
      page: 1,
      limit: 100,
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      search: debouncedSearch || undefined,
    },
    { enabled: !!organizationId && hasAccess, staleTime: 30000 }
  )

  const utils = trpc.useUtils()

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  /** Create a new blank invoice and open it in the builder */
  const createMutation = trpc.invoices.create.useMutation({
    onSuccess: (data) => {
      trackEvent(CLARITY_EVENTS.INVOICE_CREATED)
      toast.success('Invoice created')
      utils.invoices.list.invalidate()
      updateUrlParams({ invoice: data.id })
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create invoice')
    },
  })

  const deleteMutation = trpc.invoices.delete.useMutation({
    onSuccess: () => {
      toast.success('Invoice deleted')
      utils.invoices.list.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete invoice')
    },
  })

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleCreateInvoice = () => {
    createMutation.mutate({
      organizationId,
      name: 'Untitled Invoice',
      /** Use the org's Stripe account currency so invoices default to the correct currency */
      currency: activeOrganization?.stripeAccountCurrency || 'usd',
    })
  }

  const handleOpenInvoice = (invoiceId: string) => {
    updateUrlParams({ invoice: invoiceId })
  }

  const handleBuilderClose = () => {
    updateUrlParams({ invoice: null })
    utils.invoices.list.invalidate()
  }

  const handleDeleteClick = (id: string, name: string) => {
    setDeleteDialog({ open: true, id, name })
  }

  const handleDeleteConfirm = () => {
    if (!deleteDialog) return
    deleteMutation.mutate({ organizationId, id: deleteDialog.id })
    setDeleteDialog(null)
  }

  /**
   * Copy the public invoice view link to clipboard.
   * Uses navigator.clipboard with textarea fallback for non-secure contexts (HTTP).
   */
  const handleCopyLink = async (accessToken: string) => {
    const url = `${window.location.origin}/invoice/${accessToken}`
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = url
        textArea.style.position = 'fixed'
        textArea.style.left = '-9999px'
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }
      toast.success('Invoice link copied to clipboard')
    } catch {
      toast.error('Failed to copy link')
    }
  }

  // ============================================================================
  // COMPUTED STATE
  // ============================================================================

  const invoices = invoicesData?.invoices || []
  const isEmpty = !isLoading && invoices.length === 0
  const isSearching = debouncedSearch.length > 0
  const showBuilder = !!editingInvoiceId

  // ============================================================================
  // EARLY RETURNS
  // ============================================================================

  if (isLoadingOrg && !activeOrganization) {
    return <InvoicesLoadingSkeleton />
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
            You need to be part of an organization to access invoices.
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
            You don&apos;t have permission to view invoices.
          </p>
          <p className="text-xs text-muted-foreground">
            Contact your organization owner to grant you the{' '}
            <code className="px-1 py-0.5 bg-muted rounded text-xs">
              invoices:read
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
            <h2 className="text-2xl font-semibold tracking-tight">Invoices</h2>
            <p className="text-sm text-muted-foreground">
              Create, manage, and send invoices for payment
            </p>
          </div>
          {canCreate && (
            <FeatureGate feature="invoices.limit">
              <Button onClick={handleCreateInvoice} disabled={createMutation.isPending}>
                <FilePlus2 className="mr-2 h-4 w-4" />
                {createMutation.isPending ? 'Creating...' : 'Create Invoice'}
              </Button>
            </FeatureGate>
          )}
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

        {/* Search bar */}
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search invoices..."
              value={localSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>

        {/* Search indicator */}
        {isSearching && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Showing results for</span>
            <span className="font-medium text-foreground">&quot;{debouncedSearch}&quot;</span>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-[160px] rounded-xl" />
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
                    ? `No ${statusFilter.toLowerCase()} invoices`
                    : 'No invoices yet'}
              </h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
                {isSearching
                  ? `No invoices match "${debouncedSearch}"`
                  : statusFilter !== 'ALL'
                    ? `You don't have any invoices with ${statusFilter.toLowerCase()} status`
                    : 'Create your first invoice to start billing your customers'}
              </p>
              {!isSearching && statusFilter === 'ALL' && canCreate && (
                <FeatureGate feature="invoices.limit">
                  <Button onClick={handleCreateInvoice} disabled={createMutation.isPending}>
                    <FilePlus2 className="mr-2 h-4 w-4" />
                    Create Invoice
                  </Button>
                </FeatureGate>
              )}
            </CardContent>
          </Card>
        )}

        {/* Invoice cards — Grid View */}
        {!isLoading && !isEmpty && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {invoices.map((invoice) => {
              const statusConfig = INVOICE_STATUS_CONFIG[invoice.status]
              const recipientName = getInvoiceRecipientName(invoice.lead)
              const leadColor = invoice.lead
                ? getConsistentColor(invoice.lead.id)
                : undefined
              const leadTextColor = leadColor
                ? getTextColorForBackground(leadColor)
                : undefined
              const initials = invoice.lead
                ? [invoice.lead.firstName?.[0], invoice.lead.lastName?.[0]]
                    .filter(Boolean)
                    .join('')
                    .toUpperCase() || '?'
                : '?'

              return (
                <div
                  key={invoice.id}
                  className="group relative rounded-xl border border-border bg-card p-4 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer"
                  onClick={() => handleOpenInvoice(invoice.id)}
                >
                  {/* Top row: invoice number + status + more menu */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono text-muted-foreground">
                      {invoice.invoiceNumber}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
                          statusConfig.bgClass,
                          statusConfig.colorClass
                        )}
                      >
                        <span className={cn('w-1.5 h-1.5 rounded-full', statusConfig.dotClass)} />
                        {statusConfig.label}
                      </span>
                      {/* More menu — stop propagation so card click doesn't fire */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          {invoice.accessToken && (
                            <>
                              <DropdownMenuItem
                                onClick={() => handleCopyLink(invoice.accessToken!)}
                              >
                                <Copy className="mr-2 h-3.5 w-3.5" />
                                Copy Link
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  window.open(
                                    `/invoice/${invoice.accessToken}`,
                                    '_blank'
                                  )
                                }
                              >
                                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                                Open Link
                              </DropdownMenuItem>
                            </>
                          )}
                          {canDelete && invoice.status === 'DRAFT' && (
                            <DropdownMenuItem
                              onClick={() => handleDeleteClick(invoice.id, invoice.name)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Invoice name */}
                  <h3 className="text-sm font-medium truncate mb-1">
                    {invoice.name}
                  </h3>

                  {/* Amount */}
                  <p className="text-lg font-semibold tracking-tight mb-3">
                    {formatInvoiceAmount(invoice.totalAmount, invoice.currency)}
                  </p>

                  {/* Bottom row: recipient + due date */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className="h-5 w-5 text-[10px]">
                        <AvatarFallback
                          style={{
                            backgroundColor: leadColor,
                            color: leadTextColor,
                          }}
                        >
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-muted-foreground truncate">
                        {recipientName}
                      </span>
                    </div>
                    {invoice.dueDate && (
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        Due {formatInvoiceDate(invoice.dueDate)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Invoice Builder Overlay — controlled by ?invoice=xxx URL param */}
      {showBuilder && editingInvoiceId && (
        <InvoiceBuilder
          invoiceId={editingInvoiceId}
          organizationId={organizationId}
          onClose={handleBuilderClose}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteDialog?.open ?? false}
        onOpenChange={(open) => {
          if (!open) setDeleteDialog(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invoice</AlertDialogTitle>
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
    </>
  )
}
