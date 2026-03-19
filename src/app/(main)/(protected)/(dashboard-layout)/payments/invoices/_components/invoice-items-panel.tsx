'use client'

/**
 * Invoice Items Panel — Floating Sidebar
 *
 * Redesigned from a full-height left sidebar to a floating rounded-3xl card
 * that matches the automation/contract builder floating sidebar pattern.
 *
 * LAYOUT:
 * - Self-positioning: absolute top-16 left-4 z-20 (not relying on parent container)
 * - Floating card: w-[280px] rounded-3xl with shadow
 * - Framer Motion spring animation on mount
 * - Two tabs (Items / Details) using shadcn Tabs
 *
 * SECTIONS:
 * Items tab:
 *   - Line items list with quantity editing
 *   - Add Product / Custom Item buttons
 *   - Running total at bottom
 *
 * Details tab:
 *   - Recipient — lead picker with avatar
 *   - Due Date — calendar popover
 *
 * SOURCE OF TRUTH: InvoiceItemLocal from builder-types
 * Keywords: INVOICE_ITEMS_PANEL, INVOICE_LINE_ITEMS, INVOICE_SIDEBAR
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { nanoid } from 'nanoid'
import { motion } from 'framer-motion'
import {
  Plus,
  Trash2,
  UserCircle2,
  Calendar as CalendarIcon,
  X,
  Package,
  PenLine,
  ChevronRight,
  Minus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { MarqueeFade } from '@/components/global/marquee-fade'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/react-provider'
import { getConsistentColor, getTextColorForBackground } from '@/constants/colors'
import { formatInvoiceAmount } from './utils'
import { computeInvoiceTotal } from './builder-types'
import type { InvoiceItemLocal } from './builder-types'
import type { LeadOption } from '@/components/leads/lead-search-command'

// ============================================================================
// TYPES
// ============================================================================

interface InvoiceItemsPanelProps {
  /** Organization ID for product queries */
  organizationId: string
  /** Current invoice items */
  items: InvoiceItemLocal[]
  /** Callback when items change */
  onItemsChange: (items: InvoiceItemLocal[]) => void
  /** Current recipient lead */
  recipientLead: LeadOption | null
  /** Callback to open lead search dialog */
  onSelectRecipient: () => void
  /** Callback to remove the recipient */
  onRemoveRecipient: () => void
  /** Current due date */
  dueDate: Date | null
  /** Callback when due date changes */
  onDueDateChange: (date: Date | null) => void
  /** Currency code for price display */
  currency: string
  /** Whether the panel is read-only (PAID/CANCELED) */
  isReadOnly: boolean
  /** Lexical JSON notes content */
  notes: object | null
  /** Callback when notes change */
  onNotesChange: (notes: object) => void
}

// ============================================================================
// MAIN COMPONENT — Floating sidebar matching contract/automation builder
// ============================================================================

export function InvoiceItemsPanel({
  organizationId,
  items,
  onItemsChange,
  recipientLead,
  onSelectRecipient,
  onRemoveRecipient,
  dueDate,
  onDueDateChange,
  currency,
  isReadOnly,
}: InvoiceItemsPanelProps) {
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [showAdHocForm, setShowAdHocForm] = useState(false)

  /** Running total computed from items */
  const total = useMemo(() => computeInvoiceTotal(items), [items])

  /** Scroll state for MarqueeFade inside the items tab */
  const itemsScrollRef = useRef<HTMLDivElement>(null)
  const [showItemsTopFade, setShowItemsTopFade] = useState(false)
  const [showItemsBottomFade, setShowItemsBottomFade] = useState(false)

  /** Recalculate scroll overflow for items list MarqueeFade */
  const handleItemsScroll = useCallback(() => {
    const el = itemsScrollRef.current
    if (!el) return
    setShowItemsTopFade(el.scrollTop > 4)
    setShowItemsBottomFade(el.scrollTop + el.clientHeight < el.scrollHeight - 4)
  }, [])

  // ============================================================================
  // ITEM CRUD — all business logic preserved from original
  // ============================================================================

  /** Remove an item by tempId */
  const handleRemoveItem = useCallback(
    (tempId: string) => {
      onItemsChange(items.filter((item) => item.tempId !== tempId))
    },
    [items, onItemsChange]
  )

  /** Update quantity for an item */
  const handleQuantityChange = useCallback(
    (tempId: string, delta: number) => {
      onItemsChange(
        items.map((item) => {
          if (item.tempId !== tempId) return item
          const newQty = Math.max(1, item.quantity + delta)
          return { ...item, quantity: newQty }
        })
      )
    },
    [items, onItemsChange]
  )

  /**
   * Add a product item from the product picker.
   * Converts product/price data to an InvoiceItemLocal.
   */
  const handleAddProduct = useCallback(
    (product: { id: string; name: string; imageUrl: string | null }, price: {
      id: string
      name: string
      amount: number
      billingType: string
      interval: string | null
      intervalCount: number | null
    }) => {
      const newItem: InvoiceItemLocal = {
        tempId: nanoid(10),
        productId: product.id,
        priceId: price.id,
        name: `${product.name} — ${price.name}`,
        description: null,
        quantity: 1,
        unitAmount: price.amount,
        billingType: price.billingType as InvoiceItemLocal['billingType'],
        interval: price.interval as InvoiceItemLocal['interval'],
        intervalCount: price.intervalCount,
        isAdHoc: false,
        imageUrl: product.imageUrl,
      }
      onItemsChange([...items, newItem])
      setShowProductPicker(false)
    },
    [items, onItemsChange]
  )

  /** Add a custom ad-hoc item */
  const handleAddAdHoc = useCallback(
    (name: string, amount: number, description: string | null) => {
      const newItem: InvoiceItemLocal = {
        tempId: nanoid(10),
        productId: null,
        priceId: null,
        name,
        description,
        quantity: 1,
        unitAmount: amount,
        billingType: 'ONE_TIME',
        interval: null,
        intervalCount: null,
        isAdHoc: true,
      }
      onItemsChange([...items, newItem])
      setShowAdHocForm(false)
    },
    [items, onItemsChange]
  )

  // ============================================================================
  // RENDER — Floating rounded-3xl card with spring animation
  // Matches contract-variables-sidebar.tsx and automation builder NodeSidebar
  // ============================================================================

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={cn(
          'absolute top-16 left-4 z-20',
          'w-[280px] rounded-3xl',
          'bg-white dark:bg-muted',
          'overflow-hidden',
          'flex flex-col',
        )}
        style={{ maxHeight: 'calc(100vh - 6rem)' }}
      >
        {/* Sidebar title — matches contract sidebar "Settings" pattern */}
        <div className="px-5 pt-4 pb-1">
          <h3 className="text-xs font-semibold text-foreground tracking-wide uppercase">
            Invoice
          </h3>
        </div>

        {/* Tabs — Items and Details, matching contract sidebar pattern */}
        <Tabs defaultValue="items" className="flex flex-col flex-1 min-h-0">
          <div className="px-4 pb-1">
            <TabsList className="h-8 w-full">
              <TabsTrigger value="items" className="text-xs px-3 h-6 flex-1">
                Items
              </TabsTrigger>
              <TabsTrigger value="details" className="text-xs px-3 h-6 flex-1">
                Details
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ============================================================ */}
          {/* ITEMS TAB — line items list, add buttons, running total */}
          {/* ============================================================ */}
          <TabsContent value="items" className="flex-1 min-h-0 mt-0 flex flex-col">
            {/* Scrollable items list with fade indicators */}
            <MarqueeFade
              showTopFade={showItemsTopFade}
              showBottomFade={showItemsBottomFade}
              fadeHeight={40}
              className="flex-1 min-h-0"
            >
              <div
                ref={itemsScrollRef}
                onScroll={handleItemsScroll}
                className="overflow-y-auto max-h-[40vh] px-4 py-2"
              >
                <div className="space-y-3">
                  {/* Item count label */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                      Line Items
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {items.length} item{items.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Items list or empty state */}
                  {items.length === 0 ? (
                    <div className="py-6 text-center">
                      <Package className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-[10px] text-muted-foreground">
                        No items yet. Add a product or custom item.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {items.map((item) => (
                        <div
                          key={item.tempId}
                          className="rounded-xl bg-muted/30 dark:bg-background/20 p-2.5"
                        >
                          {/* Item icon + name + description */}
                          <div className="flex items-start gap-2">
                            {/* Product image / cube icon (clickable → opens picker) or pencil for custom */}
                            {item.isAdHoc ? (
                              <div className="shrink-0 h-7 w-7 rounded-lg bg-muted/60 dark:bg-background/30 flex items-center justify-center">
                                <PenLine className="h-3.5 w-3.5 text-muted-foreground" />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => !isReadOnly && setShowProductPicker(true)}
                                disabled={isReadOnly}
                                className="shrink-0 h-7 w-7 rounded-lg bg-muted/60 dark:bg-background/30 flex items-center justify-center overflow-hidden hover:ring-1 hover:ring-border transition-all disabled:hover:ring-0"
                                title="Change product"
                              >
                                {item.imageUrl ? (
                                  <img
                                    src={item.imageUrl}
                                    alt={item.name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <Package className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                              </button>
                            )}

                            <div className="flex-1 min-w-0 flex items-start justify-between gap-1.5">
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-medium truncate">{item.name}</p>
                                {item.description && (
                                  <p className="text-[10px] text-muted-foreground truncate">
                                    {item.description}
                                  </p>
                                )}
                              </div>
                              {/* Remove button */}
                              {!isReadOnly && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveItem(item.tempId)}
                                  className="h-5 w-5 shrink-0 text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="h-2.5 w-2.5" />
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Price + quantity controls row */}
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {formatInvoiceAmount(item.unitAmount, currency)} each
                            </span>

                            <div className="flex items-center gap-1">
                              {/* Quantity controls */}
                              {!isReadOnly && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleQuantityChange(item.tempId, -1)}
                                  disabled={item.quantity <= 1}
                                  className="h-5 w-5"
                                >
                                  <Minus className="h-2.5 w-2.5" />
                                </Button>
                              )}
                              <span className="text-[11px] tabular-nums w-5 text-center font-medium">
                                {item.quantity}
                              </span>
                              {!isReadOnly && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleQuantityChange(item.tempId, 1)}
                                  className="h-5 w-5"
                                >
                                  <Plus className="h-2.5 w-2.5" />
                                </Button>
                              )}

                              {/* Line total */}
                              <span className="text-[11px] font-semibold tabular-nums whitespace-nowrap ml-1">
                                {formatInvoiceAmount(item.quantity * item.unitAmount, currency)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </MarqueeFade>

            {/* Bottom section — add buttons + total (always visible, not scrollable) */}
            <div className="px-4 pb-4 pt-2 space-y-3 border-t border-border/50">
              {/* Add buttons — only shown when editable */}
              {!isReadOnly && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowProductPicker(true)}
                    className="flex-1 text-[10px] gap-1 h-7 rounded-xl"
                  >
                    <Package className="h-3 w-3" />
                    Add Product
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAdHocForm(true)}
                    className="flex-1 text-[10px] gap-1 h-7 rounded-xl"
                  >
                    <PenLine className="h-3 w-3" />
                    Custom Item
                  </Button>
                </div>
              )}

              {/* Running total */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Total
                </span>
                <span className="text-sm font-bold tabular-nums">
                  {formatInvoiceAmount(total, currency)}
                </span>
              </div>
            </div>
          </TabsContent>

          {/* ============================================================ */}
          {/* DETAILS TAB — recipient and due date */}
          {/* ============================================================ */}
          <TabsContent value="details" className="flex-1 min-h-0 mt-0">
            <div className="p-4 space-y-4">
              {/* Recipient section */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  Recipient
                </span>
                {recipientLead ? (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/30 dark:bg-background/20">
                    <RecipientAvatar lead={recipientLead} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium truncate">
                        {[recipientLead.firstName, recipientLead.lastName]
                          .filter(Boolean)
                          .join(' ') || recipientLead.email}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {recipientLead.email}
                      </p>
                    </div>
                    {!isReadOnly && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={onRemoveRecipient}
                        className="h-6 w-6 shrink-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onSelectRecipient}
                    disabled={isReadOnly}
                    className="w-full justify-start text-[10px] gap-2 h-9 rounded-xl bg-accent dark:bg-background/20 border-0"
                  >
                    <UserCircle2 className="h-3.5 w-3.5" />
                    Select Recipient
                  </Button>
                )}
              </div>

              {/* Due Date section */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  Due Date
                </span>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isReadOnly}
                        className={cn(
                          'flex-1 justify-start text-[10px] gap-2 h-9 rounded-xl bg-accent dark:bg-background/20 border-0',
                          !dueDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="h-3.5 w-3.5" />
                        {dueDate
                          ? dueDate.toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : 'No due date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dueDate ?? undefined}
                        onSelect={(date) => onDueDateChange(date ?? null)}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      />
                    </PopoverContent>
                  </Popover>
                  {dueDate && !isReadOnly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDueDateChange(null)}
                      className="h-7 w-7 shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Product Picker Dialog */}
      <ProductPickerDialog
        open={showProductPicker}
        onOpenChange={setShowProductPicker}
        organizationId={organizationId}
        onSelect={handleAddProduct}
        currency={currency}
      />

      {/* Ad-Hoc Item Dialog */}
      <AdHocItemDialog
        open={showAdHocForm}
        onOpenChange={setShowAdHocForm}
        onAdd={handleAddAdHoc}
        currency={currency}
      />
    </>
  )
}

// ============================================================================
// RECIPIENT AVATAR — colored initials fallback
// ============================================================================

function RecipientAvatar({ lead }: { lead: LeadOption }) {
  const color = getConsistentColor(lead.id)
  const textColor = getTextColorForBackground(color)
  const initials = [lead.firstName?.[0], lead.lastName?.[0]]
    .filter(Boolean)
    .join('')
    .toUpperCase() || '?'

  return (
    <Avatar className="h-7 w-7 text-[10px]">
      <AvatarFallback style={{ backgroundColor: color, color: textColor }}>
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}

// ============================================================================
// PRODUCT PICKER DIALOG — two-step: product → price
// ============================================================================

interface ProductPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  /** Currency code for displaying prices (e.g., 'usd', 'eur') */
  currency: string
  onSelect: (
    product: { id: string; name: string; imageUrl: string | null },
    price: {
      id: string
      name: string
      amount: number
      billingType: string
      interval: string | null
      intervalCount: number | null
    }
  ) => void
}

/**
 * Two-step product picker: first select a product, then select a price.
 * Fetches products from the products tRPC router.
 */
function ProductPickerDialog({
  open,
  onOpenChange,
  organizationId,
  currency,
  onSelect,
}: ProductPickerDialogProps) {
  const [selectedProduct, setSelectedProduct] = useState<{
    id: string
    name: string
    imageUrl: string | null
  } | null>(null)

  /** Fetch products for the organization */
  const { data: productsData, isLoading } = trpc.products.list.useQuery(
    { organizationId, page: 1, pageSize: 100, activeOnly: true },
    { enabled: open }
  )

  /** Fetch prices when a product is selected */
  const { data: productDetail, isLoading: isLoadingDetail } =
    trpc.products.getById.useQuery(
      { organizationId, productId: selectedProduct?.id ?? '' },
      { enabled: !!selectedProduct?.id }
    )

  /** Reset selection when dialog closes */
  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) setSelectedProduct(null)
      onOpenChange(newOpen)
    },
    [onOpenChange]
  )

  const products = productsData?.products ?? []

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {selectedProduct ? 'Select Price' : 'Add Product'}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[300px] overflow-y-auto">
          {!selectedProduct ? (
            /* Step 1: Product list */
            <>
              {isLoading ? (
                <div className="space-y-2 p-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-10 rounded-lg" />
                  ))}
                </div>
              ) : products.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-xs text-muted-foreground">
                    No active products found
                  </p>
                </div>
              ) : (
                <div className="space-y-1 p-1">
                  {products.map((product) => (
                    <button
                      key={product.id}
                      onClick={() =>
                        setSelectedProduct({ id: product.id, name: product.name, imageUrl: product.imageUrl ?? null })
                      }
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors text-left"
                    >
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="h-8 w-8 rounded object-cover"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{product.name}</p>
                        {product.description && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            {product.description}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Step 2: Price list for selected product */
            <>
              <button
                onClick={() => setSelectedProduct(null)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
              >
                <ChevronRight className="h-3 w-3 rotate-180" />
                Back to products
              </button>

              {isLoadingDetail ? (
                <div className="space-y-2 p-2">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-10 rounded-lg" />
                  ))}
                </div>
              ) : !productDetail?.prices || productDetail.prices.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-xs text-muted-foreground">
                    No active prices for this product
                  </p>
                </div>
              ) : (() => {
                /**
                 * INVOICE BILLING TYPE FILTER
                 * Invoices currently only support ONE_TIME items to avoid
                 * subscription complexity. Only active one-time prices are shown.
                 * FUTURE: Remove this filter to enable RECURRING and SPLIT_PAYMENT
                 * invoice items when subscription invoicing is implemented.
                 * SOURCE OF TRUTH: InvoiceBillingTypeFilter
                 */
                const availablePrices = productDetail.prices.filter(
                  (price) => price.active && price.billingType === 'ONE_TIME'
                )

                if (availablePrices.length === 0) {
                  return (
                    <div className="py-8 text-center">
                      <p className="text-xs text-muted-foreground">
                        No one-time prices available for this product
                      </p>
                    </div>
                  )
                }

                return (
                <div className="space-y-1 p-1">
                  {availablePrices
                    .map((price) => (
                      <button
                        key={price.id}
                        onClick={() =>
                          onSelect(selectedProduct, {
                            id: price.id,
                            name: price.name,
                            amount: price.amount,
                            billingType: price.billingType,
                            interval: price.interval,
                            intervalCount: price.intervalCount,
                          })
                        }
                        className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted transition-colors text-left"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{price.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {price.billingType === 'ONE_TIME'
                              ? 'One-time'
                              : price.billingType === 'RECURRING'
                                ? `Recurring / ${price.interval?.toLowerCase() ?? 'month'}`
                                : 'Split Payment'}
                          </p>
                        </div>
                        <span className="text-sm font-semibold tabular-nums">
                          {formatInvoiceAmount(price.amount, currency)}
                        </span>
                      </button>
                    ))}
                </div>
                )
              })()}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// AD-HOC ITEM DIALOG — simple form for custom line items
// ============================================================================

interface AdHocItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (name: string, amount: number, description: string | null) => void
  currency: string
}

/**
 * Simple form for adding a custom ad-hoc line item.
 * Requires name and amount. Description is optional.
 */
function AdHocItemDialog({ open, onOpenChange, onAdd, currency }: AdHocItemDialogProps) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  /** Reset form when dialog opens */
  useEffect(() => {
    if (open) {
      setName('')
      setAmount('')
      setDescription('')
      setTimeout(() => nameRef.current?.focus(), 100)
    }
  }, [open])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const trimmedName = name.trim()
      const amountCents = Math.round(parseFloat(amount) * 100)

      if (!trimmedName || isNaN(amountCents) || amountCents <= 0) return

      onAdd(trimmedName, amountCents, description.trim() || null)
    },
    [name, amount, description, onAdd]
  )

  const isValid =
    name.trim().length > 0 &&
    !isNaN(parseFloat(amount)) &&
    parseFloat(amount) > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-sm">Add Custom Item</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="adhoc-name" className="text-xs">
              Name
            </Label>
            <Input
              ref={nameRef}
              id="adhoc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Consultation Fee"
              className="h-8 text-sm"
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adhoc-amount" className="text-xs">
              Amount ({currency.toUpperCase()})
            </Label>
            <Input
              id="adhoc-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adhoc-desc" className="text-xs">
              Description <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="adhoc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="h-8 text-sm"
              maxLength={500}
            />
          </div>

          <Button
            type="submit"
            size="sm"
            disabled={!isValid}
            className="w-full h-8 text-xs"
          >
            Add Item
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
