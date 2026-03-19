/**
 * Add Product Dialog
 *
 * WHY: Two-step dialog to add a product to a store
 * HOW: Step 1 - Select product, Step 2 - Select price
 *
 * FLOW:
 * 1. User sees list of available products (not already in store)
 * 2. User selects a product
 * 3. User selects which price to use for this product in the store
 * 4. Product is added with the selected price
 *
 * SOURCE OF TRUTH: Store, StoreProduct, Product, ProductPrice
 */

'use client'

import { useState, useEffect } from 'react'
import { Search, Package, ArrowLeft, Loader2, Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'

// ============================================================================
// TYPES - SOURCE OF TRUTH: Product, ProductPrice
// ============================================================================

interface ProductPrice {
  id: string
  name: string
  amount: number
  currency: string
  billingType: string
  interval: string | null
  intervalCount: number | null
}

interface AvailableProduct {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  prices: ProductPrice[]
}

interface StoreProduct {
  id: string
  storeId: string
  productId: string
  priceId: string
  order: number
  product: {
    id: string
    name: string
    description: string | null
    imageUrl: string | null
    prices: ProductPrice[]
  }
  price: ProductPrice
}

interface AddProductDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  storeId: string
  onProductAdded: (product: StoreProduct) => void
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Supported billing types for store products.
 * SOURCE OF TRUTH: StoreSupportedBillingTypes (Frontend)
 *
 * Only ONE_TIME and RECURRING prices can be added to stores.
 * SPLIT_PAYMENT is NOT supported because cart checkout doesn't handle it.
 */
const STORE_SUPPORTED_BILLING_TYPES = ['ONE_TIME', 'RECURRING'] as const

/**
 * Check if a price is supported for store checkout.
 * Only ONE_TIME and RECURRING prices are allowed.
 */
function isStoreSupportedPrice(price: ProductPrice): boolean {
  return STORE_SUPPORTED_BILLING_TYPES.includes(
    price.billingType as typeof STORE_SUPPORTED_BILLING_TYPES[number]
  )
}

/**
 * Filter prices to only include store-supported billing types.
 * Removes SPLIT_PAYMENT prices from the list.
 */
function getStoreSupportedPrices(prices: ProductPrice[]): ProductPrice[] {
  return prices.filter(isStoreSupportedPrice)
}

/**
 * Format billing type for display
 */
function formatBillingType(price: ProductPrice): string {
  if (price.billingType === 'ONE_TIME') return 'one-time'
  if (price.billingType === 'RECURRING' && price.interval) {
    const count = price.intervalCount || 1
    const interval = price.interval.toLowerCase()
    return count === 1 ? `/${interval}` : `every ${count} ${interval}s`
  }
  return ''
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AddProductDialog({
  open,
  onOpenChange,
  organizationId,
  storeId,
  onProductAdded,
}: AddProductDialogProps) {
  // State
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<AvailableProduct | null>(null)
  const [selectedPriceId, setSelectedPriceId] = useState<string | null>(null)

  const utils = trpc.useUtils()

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchQuery('')
      setSelectedProduct(null)
      setSelectedPriceId(null)
    }
  }, [open])

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  /**
   * Fetch available products (products not already in this store)
   */
  const { data: availableProducts, isLoading: isLoadingProducts } =
    trpc.stores.getAvailableProducts.useQuery(
      {
        organizationId,
        storeId,
        search: searchQuery || undefined,
      },
      {
        enabled: open && !selectedProduct,
      }
    )

  // ==========================================================================
  // MUTATIONS
  // ==========================================================================

  /**
   * Add product to store mutation
   */
  const addProductMutation = trpc.stores.addProduct.useMutation({
    onSuccess: (data) => {
      toast.success('Product added to store')
      onProductAdded(data as unknown as StoreProduct)
      onOpenChange(false)
      utils.stores.getById.invalidate({ organizationId, storeId })
      utils.stores.getAvailableProducts.invalidate({ organizationId, storeId })
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to add product')
    },
  })

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleSelectProduct = (product: AvailableProduct) => {
    setSelectedProduct(product)
    // Filter to only store-supported prices (ONE_TIME, RECURRING)
    const supportedPrices = getStoreSupportedPrices(product.prices)
    // If product has only one supported price, auto-select it
    if (supportedPrices.length === 1) {
      setSelectedPriceId(supportedPrices[0].id)
    }
  }

  const handleBack = () => {
    setSelectedProduct(null)
    setSelectedPriceId(null)
  }

  const handleConfirm = () => {
    if (!selectedProduct || !selectedPriceId) return

    addProductMutation.mutate({
      organizationId,
      storeId,
      productId: selectedProduct.id,
      priceId: selectedPriceId,
    })
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {selectedProduct ? (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleBack}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                Select Price
              </div>
            ) : (
              'Add Product'
            )}
          </DialogTitle>
          <DialogDescription>
            {selectedProduct
              ? `Choose a price for "${selectedProduct.name}" in this store`
              : 'Select a product to add to this store'}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Select Product */}
        {!selectedProduct && (
          <div className="space-y-4">
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Products list */}
            <ScrollArea className="h-[300px]">
              {isLoadingProducts ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !availableProducts || availableProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Package className="h-10 w-10 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {searchQuery
                      ? 'No products found matching your search'
                      : 'All products are already in this store'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableProducts.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => handleSelectProduct(product)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                    >
                      {/* Product image */}
                      <div className="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="size-full object-cover"
                          />
                        ) : (
                          <Package className="size-5 text-muted-foreground" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {/* Only count store-supported prices (ONE_TIME, RECURRING) */}
                          {getStoreSupportedPrices(product.prices).length} price
                          {getStoreSupportedPrices(product.prices).length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}

        {/* Step 2: Select Price */}
        {selectedProduct && (
          <div className="space-y-4 overflow-hidden">
            {/* Selected product info */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 overflow-hidden">
              <div className="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                {selectedProduct.imageUrl ? (
                  <img
                    src={selectedProduct.imageUrl}
                    alt={selectedProduct.name}
                    className="size-full object-cover"
                  />
                ) : (
                  <Package className="size-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{selectedProduct.name}</p>
                {selectedProduct.description && (
                  <p className="text-xs text-muted-foreground truncate">
                    {selectedProduct.description}
                  </p>
                )}
              </div>
            </div>

            {/* Price options - scrollable container for many prices */}
            {/* Only show store-supported prices (ONE_TIME, RECURRING) */}
            <div className="max-h-[250px] overflow-y-auto space-y-2">
              {getStoreSupportedPrices(selectedProduct.prices).map((price) => (
                <button
                  key={price.id}
                  onClick={() => setSelectedPriceId(price.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left ${
                    selectedPriceId === price.id
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{price.name}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">
                        {formatCurrency(price.amount, price.currency)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatBillingType(price)}
                      </span>
                    </div>
                  </div>
                  {selectedPriceId === price.id && (
                    <Check className="h-5 w-5 text-primary shrink-0" />
                  )}
                </button>
              ))}
            </div>

            {/* Confirm button */}
            <Button
              className="w-full"
              onClick={handleConfirm}
              disabled={!selectedPriceId || addProductMutation.isPending}
            >
              {addProductMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Add to Store
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
