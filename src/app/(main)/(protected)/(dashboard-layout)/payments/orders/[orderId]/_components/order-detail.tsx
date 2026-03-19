/**
 * Order Detail Component
 *
 * WHY: Full page view for managing a single order
 * HOW: Sections for order items, customer, fulfillment, tracking, and notes
 *
 * ARCHITECTURE:
 * - Left column: Order summary, customer info, payment info
 * - Right column: Fulfillment status, tracking, notes timeline
 * - All editing inline on the page with optimistic updates
 *
 * IMPORTANT: Orders are NOT Transactions!
 * Orders are specifically for e-commerce products that require fulfillment.
 * A Transaction (payment record) gets attached to an Order.
 *
 * PERMISSIONS:
 * - canUpdate: Can update fulfillment, add tracking, manage notes
 *
 * SOURCE OF TRUTH: Order model (not Transaction)
 */

'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Package,
  PackageCheck,
  PackageX,
  Truck,
  MessageSquare,
  Loader2,
  ExternalLink,
  Send,
  Trash2,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { permissions } from '@/lib/better-auth/permissions'
import { getConsistentColor, getTextColorForBackground } from '@/constants/colors'
import type { FulfillmentStatus, OrderStatus } from '@/generated/prisma'
import type { TransformedOrder } from '../../_components/orders-table'
import { formatCurrency } from '@/lib/utils'

/**
 * SOURCE OF TRUTH: OrderDetailProps
 * Props for the order detail component
 */
interface OrderDetailProps {
  order: TransformedOrder
  organizationId: string
  userRole: string
  userPermissions: string[]
}

/**
 * Format order ID for display
 */
function formatOrderId(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Get customer display name from lead
 */
function getCustomerDisplayName(lead: NonNullable<TransformedOrder['transaction']>['lead']): string {
  if (!lead) return 'Unknown Customer'
  const firstName = lead.firstName || ''
  const lastName = lead.lastName || ''
  const fullName = `${firstName} ${lastName}`.trim()
  return fullName || lead.email || 'Unknown Customer'
}

/**
 * Get customer initials
 */
function getCustomerInitials(lead: NonNullable<TransformedOrder['transaction']>['lead']): string {
  if (!lead) return '?'
  const firstName = lead.firstName || ''
  const lastName = lead.lastName || ''
  if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase()
  if (firstName) return firstName.slice(0, 2).toUpperCase()
  if (lead.email) return lead.email.slice(0, 2).toUpperCase()
  return '?'
}

/**
 * Get order status display properties
 */
function getOrderStatusDisplay(status: OrderStatus) {
  const map: Record<OrderStatus, { label: string; badgeClass: string }> = {
    PENDING: { label: 'Pending', badgeClass: 'bg-amber-500/10 text-amber-600' },
    CONFIRMED: { label: 'Confirmed', badgeClass: 'bg-blue-500/10 text-blue-600' },
    PROCESSING: { label: 'Processing', badgeClass: 'bg-purple-500/10 text-purple-600' },
    SHIPPED: { label: 'Shipped', badgeClass: 'bg-cyan-500/10 text-cyan-600' },
    DELIVERED: { label: 'Delivered', badgeClass: 'bg-emerald-500/10 text-emerald-600' },
    CANCELED: { label: 'Canceled', badgeClass: 'bg-muted text-muted-foreground' },
    REFUNDED: { label: 'Refunded', badgeClass: 'bg-red-500/10 text-red-600' },
  }
  return map[status] || { label: status, badgeClass: 'bg-muted' }
}

/**
 * Get fulfillment status display properties
 */
function getFulfillmentDisplay(status: FulfillmentStatus) {
  const map: Record<FulfillmentStatus, { label: string; badgeClass: string; Icon: typeof Package }> = {
    UNFULFILLED: {
      label: 'Unfulfilled',
      badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      Icon: Package,
    },
    PARTIALLY_FULFILLED: {
      label: 'Partially Fulfilled',
      badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      Icon: Truck,
    },
    FULFILLED: {
      label: 'Fulfilled',
      badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      Icon: PackageCheck,
    },
    CANCELED: {
      label: 'Canceled',
      badgeClass: 'bg-muted text-muted-foreground',
      Icon: PackageX,
    },
  }
  return map[status] || map.UNFULFILLED
}


export function OrderDetail({
  order: initialOrder,
  organizationId,
  userRole,
  userPermissions,
}: OrderDetailProps) {
  const utils = trpc.useUtils()

  // Permissions
  const canUpdate = useMemo(
    () => userRole === 'owner' || userPermissions.includes(permissions.TRANSACTIONS_UPDATE),
    [userRole, userPermissions]
  )

  // Local state for order data (for optimistic updates)
  const [order, setOrder] = useState(initialOrder)

  // Fulfillment form state
  const [selectedFulfillmentStatus, setSelectedFulfillmentStatus] = useState<FulfillmentStatus>(
    order.fulfillmentStatus
  )
  const [trackingCarrier, setTrackingCarrier] = useState(order.shippingCarrier || '')
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber || '')
  const [trackingUrl, setTrackingUrl] = useState(order.trackingUrl || '')
  const [showTrackingForm, setShowTrackingForm] = useState(false)

  // Notes form state
  const [newNoteContent, setNewNoteContent] = useState('')
  const [noteIsInternal, setNoteIsInternal] = useState(true)

  // Query order notes
  const { data: notes, isLoading: isLoadingNotes } = trpc.orders.listNotes.useQuery({
    organizationId,
    orderId: order.id,
    includeInternal: true,
  })

  // Update fulfillment mutation
  const updateFulfillmentMutation = trpc.orders.updateFulfillment.useMutation({
    onMutate: async (input) => {
      setOrder((prev) => ({
        ...prev,
        fulfillmentStatus: input.fulfillmentStatus,
        shippingCarrier: input.shippingCarrier ?? prev.shippingCarrier,
        trackingNumber: input.trackingNumber ?? prev.trackingNumber,
        trackingUrl: input.trackingUrl ?? prev.trackingUrl,
        fulfilledAt: input.fulfillmentStatus === 'FULFILLED' ? new Date().toISOString() : prev.fulfilledAt,
      }))
    },
    onError: (err) => {
      setOrder(initialOrder)
      toast.error(err.message || 'Failed to update fulfillment')
    },
    onSuccess: () => {
      toast.success('Fulfillment updated')
      utils.orders.getById.invalidate({ organizationId, orderId: order.id })
    },
  })

  // Add tracking mutation
  const addTrackingMutation = trpc.orders.addTracking.useMutation({
    onMutate: async (input) => {
      setOrder((prev) => ({
        ...prev,
        shippingCarrier: input.shippingCarrier,
        trackingNumber: input.trackingNumber,
        trackingUrl: input.trackingUrl ?? prev.trackingUrl,
      }))
      setShowTrackingForm(false)
    },
    onError: (err) => {
      setOrder(initialOrder)
      toast.error(err.message || 'Failed to add tracking')
    },
    onSuccess: () => {
      toast.success('Tracking added')
      utils.orders.getById.invalidate({ organizationId, orderId: order.id })
    },
  })

  // Add note mutation
  const addNoteMutation = trpc.orders.addNote.useMutation({
    onSuccess: () => {
      setNewNoteContent('')
      toast.success('Note added')
      utils.orders.listNotes.invalidate({ organizationId, orderId: order.id })
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to add note')
    },
  })

  // Delete note mutation
  const deleteNoteMutation = trpc.orders.deleteNote.useMutation({
    onSuccess: () => {
      toast.success('Note deleted')
      utils.orders.listNotes.invalidate({ organizationId, orderId: order.id })
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to delete note')
    },
  })

  // Handlers
  const handleUpdateFulfillment = () => {
    updateFulfillmentMutation.mutate({
      organizationId,
      orderId: order.id,
      fulfillmentStatus: selectedFulfillmentStatus,
      shippingCarrier: trackingCarrier || null,
      trackingNumber: trackingNumber || null,
      trackingUrl: trackingUrl || null,
    })
  }

  const handleAddTracking = () => {
    if (!trackingCarrier || !trackingNumber) {
      toast.error('Carrier and tracking number are required')
      return
    }
    addTrackingMutation.mutate({
      organizationId,
      orderId: order.id,
      shippingCarrier: trackingCarrier,
      trackingNumber: trackingNumber,
      trackingUrl: trackingUrl || undefined,
    })
  }

  const handleAddNote = () => {
    if (!newNoteContent.trim()) {
      toast.error('Note content is required')
      return
    }
    addNoteMutation.mutate({
      organizationId,
      orderId: order.id,
      content: newNoteContent.trim(),
      isInternal: noteIsInternal,
    })
  }

  const handleDeleteNote = (noteId: string) => {
    deleteNoteMutation.mutate({
      organizationId,
      noteId,
    })
  }

  // Get display values
  const orderStatusDisplay = getOrderStatusDisplay(order.status)
  const fulfillmentDisplay = getFulfillmentDisplay(order.fulfillmentStatus)
  const FulfillmentIcon = fulfillmentDisplay.Icon

  const lead = order.transaction?.lead ?? null
  const customerName = getCustomerDisplayName(lead)
  const customerInitials = getCustomerInitials(lead)
  const avatarBg = lead ? getConsistentColor(customerName) : '#6b7280'
  const avatarText = getTextColorForBackground(avatarBg)

  /**
   * Use allItems for the order detail display.
   * allItems is a flat list of ALL items from the entire checkout session
   * (primary transaction + sibling transactions), each annotated with billing
   * context (isOnTrial, billingType, trialDays, paymentStatus, currency).
   *
   * This ensures trial items, subscription items from sibling transactions,
   * and one-time items all appear in the order detail view.
   *
   * SOURCE OF TRUTH: OrderAllItem
   */
  const allItems = order.allItems ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/payments/orders">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Order {formatOrderId(order.id)}</h1>
            <p className="text-sm text-muted-foreground">
              {formatDate(order.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className={cn('text-xs', orderStatusDisplay.badgeClass)}>
            {orderStatusDisplay.label}
          </Badge>
          <Badge variant="secondary" className={cn('text-xs', fulfillmentDisplay.badgeClass)}>
            <FulfillmentIcon className="mr-1 h-3 w-3" />
            {fulfillmentDisplay.label}
          </Badge>
        </div>
      </div>

      {/* Main Content */}
      <div className="border rounded-lg overflow-hidden">
        <div className="grid lg:grid-cols-[1fr_360px]">
          {/* Left Column - Order Details */}
          <div className="lg:border-r">
            {/* Order Summary — shows ALL items from the checkout session */}
            <div className="p-6">
              <p className="text-sm font-medium text-muted-foreground mb-4">Order Items</p>
              <div className="space-y-3">
                {allItems.length > 0 ? (
                  allItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-3">
                      <Avatar className="h-12 w-12 shrink-0 rounded-lg">
                        <AvatarImage
                          src={item.productImage || undefined}
                          alt={item.productName}
                          className="object-cover"
                        />
                        <AvatarFallback className="rounded-lg bg-muted">
                          <Package className="h-5 w-5 text-muted-foreground" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium truncate">{item.productName}</p>
                          {/**
                           * Billing context badge — shows what kind of line item this is.
                           * Trial items get a violet badge, recurring items get blue,
                           * one-time items get a subtle gray badge.
                           */}
                          {item.isOnTrial && item.billingType === 'RECURRING' ? (
                            <Badge
                              variant="secondary"
                              className="shrink-0 text-[10px] px-1.5 py-0 bg-violet-500/10 text-violet-600 dark:text-violet-400"
                            >
                              Trial{item.trialDays ? ` ${item.trialDays}d` : ''}
                            </Badge>
                          ) : item.billingType === 'RECURRING' ? (
                            <Badge
                              variant="secondary"
                              className="shrink-0 text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            >
                              Subscription
                            </Badge>
                          ) : item.billingType === 'SPLIT_PAYMENT' ? (
                            <Badge
                              variant="secondary"
                              className="shrink-0 text-[10px] px-1.5 py-0 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
                            >
                              Split Pay
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="shrink-0 text-[10px] px-1.5 py-0 bg-muted text-muted-foreground"
                            >
                              One-time
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {item.priceName} x {item.quantity}
                        </p>
                      </div>
                      {/**
                       * Line item price display with billing context.
                       * - Trial items show "Free Trial" with post-trial pricing
                       * - Recurring items show amount + interval suffix (/mo, /yr, etc.)
                       * - One-time items show flat amount
                       *
                       * SOURCE OF TRUTH: OrderLineItemPricing, OrderAllItem
                       */}
                      <div className="text-right shrink-0">
                        {(() => {
                          /** Trial items from a TRIALING transaction */
                          if (item.isOnTrial && item.billingType === 'RECURRING') {
                            return (
                              <>
                                <p className="font-medium text-sm">Free Trial</p>
                                <p className="text-xs text-muted-foreground">
                                  Then {formatCurrency(item.totalAmount, item.currency)}
                                  {item.interval === 'MONTH' && '/mo'}
                                  {item.interval === 'YEAR' && '/yr'}
                                  {item.interval === 'WEEK' && '/wk'}
                                </p>
                              </>
                            )
                          }

                          /** Recurring items: amount with interval suffix */
                          if (item.billingType === 'RECURRING') {
                            const suffix = item.interval === 'MONTH' ? '/mo'
                              : item.interval === 'YEAR' ? '/yr'
                                : item.interval === 'WEEK' ? '/wk'
                                  : item.interval === 'DAY' ? '/day'
                                    : ''
                            return (
                              <p className="font-medium">
                                {formatCurrency(item.totalAmount, item.currency)}{suffix}
                              </p>
                            )
                          }

                          /** ONE_TIME and SPLIT_PAYMENT items — flat amount */
                          return (
                            <p className="font-medium">
                              {formatCurrency(item.totalAmount, item.currency)}
                            </p>
                          )
                        })()}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No items</p>
                )}
              </div>
              {/* Transaction link — all payment details live on the transaction page */}
              {order.transaction && (
                <div className="mt-4 pt-4 border-t">
                  <Link
                    href={`/payments/transactions/${order.transaction.id}`}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    View Transaction <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
            </div>

            {/* Customer */}
            <div className="border-t p-6">
              <p className="text-sm font-medium text-muted-foreground mb-4">Customer</p>
              {lead ? (
                <>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={lead.avatarUrl || undefined} alt={customerName} />
                      <AvatarFallback style={{ backgroundColor: avatarBg, color: avatarText }}>
                        {customerInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{customerName}</p>
                      {lead.email && (
                        <p className="text-sm text-muted-foreground truncate">{lead.email}</p>
                      )}
                    </div>
                  </div>
                  {lead.phone && (
                    <p className="text-sm text-muted-foreground mt-2">{lead.phone}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No customer information</p>
              )}
            </div>

            {/* Shipping Address */}
            {order.shippingName && (
              <div className="border-t p-6">
                <p className="text-sm font-medium text-muted-foreground mb-4">Shipping Address</p>
                <div className="text-sm space-y-1">
                  <p className="font-medium">{order.shippingName}</p>
                  {order.shippingLine1 && <p>{order.shippingLine1}</p>}
                  {order.shippingLine2 && <p>{order.shippingLine2}</p>}
                  {(order.shippingCity || order.shippingState || order.shippingZip) && (
                    <p>
                      {[order.shippingCity, order.shippingState, order.shippingZip].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {order.shippingCountry && <p>{order.shippingCountry}</p>}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Fulfillment & Notes */}
          <div className="border-t lg:border-t-0">
            {/* Fulfillment Section */}
            <div className="p-6">
              <p className="text-sm font-medium text-muted-foreground mb-4">Fulfillment</p>
              {canUpdate ? (
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs">Status</Label>
                    <Select
                      value={selectedFulfillmentStatus}
                      onValueChange={(v) => setSelectedFulfillmentStatus(v as FulfillmentStatus)}
                      disabled={updateFulfillmentMutation.isPending}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UNFULFILLED">Unfulfilled</SelectItem>
                        <SelectItem value="PARTIALLY_FULFILLED">Partially Fulfilled</SelectItem>
                        <SelectItem value="FULFILLED">Fulfilled</SelectItem>
                        <SelectItem value="CANCELED">Canceled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedFulfillmentStatus !== order.fulfillmentStatus && (
                    <Button
                      size="sm"
                      onClick={handleUpdateFulfillment}
                      disabled={updateFulfillmentMutation.isPending}
                    >
                      {updateFulfillmentMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Update Status
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={cn('text-sm', fulfillmentDisplay.badgeClass)}>
                    <FulfillmentIcon className="mr-1 h-4 w-4" />
                    {fulfillmentDisplay.label}
                  </Badge>
                </div>
              )}
            </div>

            {/* Tracking Section */}
            <div className="border-t p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-medium text-muted-foreground">Tracking</p>
                {canUpdate && !order.trackingNumber && !showTrackingForm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowTrackingForm(true)}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add
                  </Button>
                )}
              </div>

              {order.trackingNumber ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Carrier</span>
                    <span>{order.shippingCarrier || '-'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Tracking #</span>
                    <span className="font-mono">{order.trackingNumber}</span>
                  </div>
                  {order.trackingUrl && (
                    <a
                      href={order.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary text-sm hover:underline"
                    >
                      Track Package <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ) : showTrackingForm ? (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Carrier</Label>
                    <Input
                      placeholder="UPS, FedEx, USPS..."
                      value={trackingCarrier}
                      onChange={(e) => setTrackingCarrier(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Tracking Number</Label>
                    <Input
                      placeholder="1Z999..."
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Tracking URL (optional)</Label>
                    <Input
                      placeholder="https://..."
                      value={trackingUrl}
                      onChange={(e) => setTrackingUrl(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleAddTracking}
                      disabled={addTrackingMutation.isPending}
                    >
                      {addTrackingMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowTrackingForm(false)
                        setTrackingCarrier('')
                        setTrackingNumber('')
                        setTrackingUrl('')
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No tracking information</p>
              )}
            </div>

            {/* Notes Section */}
            <div className="border-t p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-medium text-muted-foreground">
                  <MessageSquare className="inline-block mr-1 h-4 w-4" />
                  Notes
                </p>
              </div>

              {/* Add Note Form */}
              {canUpdate && (
                <div className="space-y-3 mb-4">
                  <Textarea
                    placeholder="Add a note..."
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    rows={2}
                    className="resize-none"
                  />
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={noteIsInternal}
                        onChange={(e) => setNoteIsInternal(e.target.checked)}
                        className="rounded"
                      />
                      Internal note (staff only)
                    </label>
                    <Button
                      size="sm"
                      onClick={handleAddNote}
                      disabled={!newNoteContent.trim() || addNoteMutation.isPending}
                    >
                      {addNoteMutation.isPending ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Send className="mr-1 h-3 w-3" />
                      )}
                      Add
                    </Button>
                  </div>
                </div>
              )}

              {/* Notes List */}
              <ScrollArea className="h-[200px]">
                {isLoadingNotes ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : notes && notes.length > 0 ? (
                  <div className="space-y-3">
                    {notes.map((note) => (
                      <div
                        key={note.id}
                        className={cn(
                          'p-3 rounded-lg border text-sm',
                          note.isInternal ? 'bg-amber-500/5 border-amber-500/20' : 'bg-muted/50'
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            {note.isInternal && (
                              <Badge
                                variant="secondary"
                                className="text-xs bg-amber-500/10 text-amber-600"
                              >
                                Internal
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {new Date(note.createdAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          {canUpdate && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteNote(note.id)}
                              disabled={deleteNoteMutation.isPending}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap">{note.content}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    No notes yet
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
