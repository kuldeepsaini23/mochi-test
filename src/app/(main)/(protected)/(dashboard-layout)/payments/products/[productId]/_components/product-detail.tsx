/**
 * Product Detail Component
 *
 * WHY: Full page view for managing a single product
 * HOW: Inline editing for everything, no sheets/dialogs
 *
 * ARCHITECTURE:
 * - Section header → separator → split layout
 * - All editing inline on the page
 * - Compact, minimal design
 *
 * PERMISSIONS:
 * - canUpdate: Can edit product details, toggle active, edit prices/features
 * - canDelete: Can delete product and prices
 * - canCreatePrice: Can add new prices
 */

'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Package,
  ImageIcon,
  Loader2,
  Plus,
  Trash2,
  CheckCircle,
  X,
  GripVertical,
  Link2,
  Check,
  Store,
  FlaskConical,
  Boxes,
  Minus,
  AlertTriangle,
  FolderOpen,
  Images,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { SectionHeader } from '@/components/global/section-header'
import { PriceInput } from '@/components/global/price-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { formatBillingType, BILLING_INTERVALS } from '../../_components/utils'
import type { ProductPrice } from '../../_components/products-table'
import { permissions } from '@/lib/better-auth/permissions'
import { useCurrency } from '@/components/providers/currency-provider'
import { formatCurrency } from '@/lib/utils'
import { StorageBrowserModal } from '@/components/storage-browser/storage-browser-modal'

interface Product {
  id: string
  organizationId: string
  name: string
  description: string | null
  imageUrl: string | null
  /** SOURCE OF TRUTH: ProductGalleryImages — array of gallery image URLs (max 8) */
  images: string[]
  stripeProductId: string | null
  active: boolean
  /**
   * SOURCE OF TRUTH: ProductTestMode
   * When true, all payment links for this product use test Stripe API keys.
   */
  testMode: boolean
  /**
   * SOURCE OF TRUTH: ProductInventory
   * Inventory management fields for tracking stock levels.
   */
  trackInventory: boolean
  inventoryQuantity: number
  allowBackorder: boolean
  lowStockThreshold: number | null
  prices: ProductPrice[]
  createdAt: string
  updatedAt: string
}

interface ProductDetailProps {
  product: Product
  organizationId: string
  userRole: string
  userPermissions: string[]
}

type BillingType = 'ONE_TIME' | 'RECURRING' | 'SPLIT_PAYMENT'

interface NewPriceForm {
  name: string
  amount: number
  currency: string
  billingType: BillingType
  interval: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'
  intervalCount: number
  installments: number
  installmentInterval: 'WEEK' | 'MONTH' | 'YEAR'
  /** Free trial duration in days — 0 means no trial */
  trialDays: number
}

interface FeatureInput {
  id: string
  name: string
}

export function ProductDetail({ product: initialProduct, organizationId, userRole, userPermissions }: ProductDetailProps) {
  const router = useRouter()
  const utils = trpc.useUtils()

  // Compute permissions
  const canUpdate = useMemo(
    () => userRole === 'owner' || userPermissions.includes(permissions.PRODUCTS_UPDATE),
    [userRole, userPermissions]
  )
  const canDelete = useMemo(
    () => userRole === 'owner' || userPermissions.includes(permissions.PRODUCTS_DELETE),
    [userRole, userPermissions]
  )
  const canCreatePrice = useMemo(
    () => userRole === 'owner' || userPermissions.includes(permissions.PRODUCTS_CREATE),
    [userRole, userPermissions]
  )

  // Get organization currency from context (SOURCE OF TRUTH)
  // Currency is determined by the connected Stripe account
  const { currency: orgCurrency, symbol: currencySymbol, formatCurrency, hasStripeConnected } = useCurrency()

  const [product, setProduct] = useState(initialProduct)

  // Delete dialogs
  const [deleteProductDialogOpen, setDeleteProductDialogOpen] = useState(false)
  const [deletePriceId, setDeletePriceId] = useState<string | null>(null)

  // Payment links
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null)

  // Product edit states
  const [editName, setEditName] = useState(product.name)
  const [editDescription, setEditDescription] = useState(product.description || '')
  const [editImageUrl, setEditImageUrl] = useState(product.imageUrl || '')
  /** Gallery images state — syncs with product.images */
  const [editImages, setEditImages] = useState<string[]>(product.images || [])
  const [hasChanges, setHasChanges] = useState(false)
  // Storage browser modal states for featured image and gallery
  const [featuredImageStorageOpen, setFeaturedImageStorageOpen] = useState(false)
  const [galleryStorageOpen, setGalleryStorageOpen] = useState(false)

  // New price form - currency comes from organization's Stripe account
  const [showNewPriceForm, setShowNewPriceForm] = useState(false)
  const [newPrice, setNewPrice] = useState<NewPriceForm>({
    name: '',
    amount: 0,
    currency: orgCurrency, // Use organization's Stripe currency
    billingType: 'ONE_TIME',
    interval: 'MONTH',
    intervalCount: 1,
    installments: 3,
    installmentInterval: 'MONTH',
    trialDays: 0,
  })

  // Features editing state (priceId -> features array)
  const [editingFeaturesFor, setEditingFeaturesFor] = useState<string | null>(null)
  const [features, setFeatures] = useState<FeatureInput[]>([])

  // Add to store dialog state
  const [addToStoreDialogOpen, setAddToStoreDialogOpen] = useState(false)
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null)
  const [selectedStorePriceId, setSelectedStorePriceId] = useState<string | null>(null)

  // Inventory management state
  const [editLowStockThreshold, setEditLowStockThreshold] = useState(
    product.lowStockThreshold ?? 10
  )
  const [setStockValue, setSetStockValue] = useState(product.inventoryQuantity)

  // Sync edit states with product changes (including gallery images)
  useEffect(() => {
    setEditName(product.name)
    setEditDescription(product.description || '')
    setEditImageUrl(product.imageUrl || '')
    setEditImages(product.images || [])
    setSetStockValue(product.inventoryQuantity)
    setHasChanges(false)
  }, [product])

  // Track changes — includes gallery images comparison via JSON serialization
  useEffect(() => {
    const imagesChanged = JSON.stringify(editImages) !== JSON.stringify(product.images || [])
    const changed =
      editName !== product.name ||
      editDescription !== (product.description || '') ||
      editImageUrl !== (product.imageUrl || '') ||
      imagesChanged
    setHasChanges(changed)
  }, [editName, editDescription, editImageUrl, editImages, product])

  // Update product mutation
  const updateMutation = trpc.products.update.useMutation({
    onMutate: async (input) => {
      setProduct((prev) => ({
        ...prev,
        name: input.name ?? prev.name,
        description: input.description ?? prev.description,
        imageUrl: input.imageUrl ?? prev.imageUrl,
        images: input.images ?? prev.images,
        active: input.active ?? prev.active,
        testMode: input.testMode ?? prev.testMode,
      }))
    },
    onError: (err) => {
      setProduct(initialProduct)
      toast.error(err.message || 'Failed to update product')
    },
    onSuccess: () => {
      toast.success('Product updated')
      utils.products.list.invalidate()
      utils.products.getById.invalidate({ organizationId, productId: product.id })
    },
  })

  // Delete product mutation
  const deleteProductMutation = trpc.products.delete.useMutation({
    onSuccess: () => {
      toast.success('Product deleted')
      router.push('/payments/products')
      utils.products.list.invalidate()
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to delete product')
    },
  })

  // Create price mutation
  const createPriceMutation = trpc.products.createPrice.useMutation({
    onMutate: async (input) => {
      // Optimistically add the new price
      const optimisticPrice: ProductPrice = {
        id: `temp-${Date.now()}`,
        productId: product.id,
        name: input.name,
        amount: input.amount,
        currency: orgCurrency,
        billingType: input.billingType,
        interval: input.interval || null,
        intervalCount: input.intervalCount || null,
        installments: input.installments || null,
        installmentInterval: input.installmentInterval || null,
        installmentIntervalCount: input.installmentIntervalCount || null,
        trialDays: input.trialDays || null,
        stripePriceId: null,
        active: true,
        features: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      setProduct((prev) => ({
        ...prev,
        prices: [...prev.prices, optimisticPrice],
      }))

      // Reset form immediately for better UX
      setShowNewPriceForm(false)
      setNewPrice({
        name: '',
        amount: 0,
        currency: orgCurrency, // Use organization's Stripe currency
        billingType: 'ONE_TIME',
        interval: 'MONTH',
        intervalCount: 1,
        installments: 3,
        installmentInterval: 'MONTH',
        trialDays: 0,
      })
    },
    onError: (err) => {
      setProduct(initialProduct)
      toast.error(err.message || 'Failed to create price')
    },
    onSuccess: () => {
      toast.success('Price created')
      utils.products.list.invalidate()
      utils.products.getById.invalidate({ organizationId, productId: product.id })
      // Invalidate store available products so newly created prices show up
      // when attaching products to a store (prevents "price not found" error)
      utils.stores.getAvailableProducts.invalidate()
    },
  })

  // Delete price mutation
  const deletePriceMutation = trpc.products.deletePrice.useMutation({
    onMutate: async ({ priceId }) => {
      setProduct((prev) => ({
        ...prev,
        prices: prev.prices.filter((p) => p.id !== priceId),
      }))
    },
    onError: (err) => {
      setProduct(initialProduct)
      toast.error(err.message || 'Failed to delete price')
    },
    onSuccess: () => {
      toast.success('Price deleted')
      setDeletePriceId(null)
      utils.products.list.invalidate()
      utils.products.getById.invalidate({ organizationId, productId: product.id })
      // Keep store available products in sync when prices change
      utils.stores.getAvailableProducts.invalidate()
    },
  })

  // Payment links query
  const { data: paymentLinks } = trpc.products.getPaymentLinks.useQuery(
    { organizationId, productId: product.id },
    { enabled: !!product.id }
  )

  // Stores queries - get stores containing this product and available stores
  const { data: productStores, isLoading: isLoadingProductStores } =
    trpc.stores.getStoresForProduct.useQuery(
      { organizationId, productId: product.id },
      { enabled: !!product.id }
    )

  const { data: availableStores } = trpc.stores.getAvailableStores.useQuery(
    { organizationId, productId: product.id },
    { enabled: addToStoreDialogOpen }
  )

  // Create payment link mutation
  const createLinkMutation = trpc.products.createPaymentLink.useMutation({
    onSuccess: () => {
      utils.products.getPaymentLinks.invalidate({ organizationId, productId: product.id })
    },
  })

  // Set features mutation
  const setFeaturesMutation = trpc.products.setFeatures.useMutation({
    onMutate: async ({ priceId, features: newFeatures }) => {
      // Optimistically update features
      setProduct((prev) => ({
        ...prev,
        prices: prev.prices.map((p) => {
          if (p.id !== priceId) return p
          return {
            ...p,
            features: newFeatures.map((f, index) => ({
              id: `temp-${index}-${Date.now()}`,
              priceId,
              name: f.name,
              description: f.description || null,
              order: index,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })),
          }
        }),
      }))

      // Close edit mode immediately
      setEditingFeaturesFor(null)
    },
    onError: (err) => {
      setProduct(initialProduct)
      toast.error(err.message || 'Failed to save features')
    },
    onSuccess: () => {
      toast.success('Features saved')
      utils.products.list.invalidate()
      utils.products.getById.invalidate({ organizationId, productId: product.id })
    },
  })

  // Add product to store mutation
  const addToStoreMutation = trpc.stores.addProduct.useMutation({
    onSuccess: () => {
      toast.success('Product added to store')
      setAddToStoreDialogOpen(false)
      setSelectedStoreId(null)
      setSelectedStorePriceId(null)
      utils.stores.getStoresForProduct.invalidate({ organizationId, productId: product.id })
      utils.stores.getAvailableStores.invalidate({ organizationId, productId: product.id })
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to add product to store')
    },
  })

  // Remove product from store mutation
  const removeFromStoreMutation = trpc.stores.removeProduct.useMutation({
    onSuccess: () => {
      toast.success('Product removed from store')
      utils.stores.getStoresForProduct.invalidate({ organizationId, productId: product.id })
      utils.stores.getAvailableStores.invalidate({ organizationId, productId: product.id })
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to remove product from store')
    },
  })

  // ============================================================================
  // INVENTORY MANAGEMENT
  // ============================================================================

  /**
   * Update inventory settings mutation - toggle tracking, backorder, threshold
   */
  const updateInventorySettingsMutation = trpc.products.updateInventorySettings.useMutation({
    onMutate: async (input) => {
      setProduct((prev) => ({
        ...prev,
        trackInventory: input.trackInventory ?? prev.trackInventory,
        allowBackorder: input.allowBackorder ?? prev.allowBackorder,
        lowStockThreshold: input.lowStockThreshold ?? prev.lowStockThreshold,
      }))
    },
    onError: (err) => {
      setProduct(initialProduct)
      toast.error(err.message || 'Failed to update inventory settings')
    },
    onSuccess: () => {
      toast.success('Inventory settings updated')
      utils.products.getById.invalidate({ organizationId, productId: product.id })
    },
  })

  /**
   * Set inventory mutation - sets absolute quantity
   */
  const setInventoryMutation = trpc.products.setInventory.useMutation({
    onMutate: async (input) => {
      setProduct((prev) => ({
        ...prev,
        inventoryQuantity: input.quantity,
      }))
    },
    onError: (err) => {
      setProduct(initialProduct)
      toast.error(err.message || 'Failed to set inventory')
    },
    onSuccess: () => {
      utils.products.getById.invalidate({ organizationId, productId: product.id })
    },
  })

  const handleSaveDetails = () => {
    if (!editName.trim()) {
      toast.error('Name is required')
      return
    }
    updateMutation.mutate({
      organizationId,
      productId: product.id,
      name: editName,
      description: editDescription || null,
      imageUrl: editImageUrl || null,
      images: editImages,
    })
  }

  const handleToggleActive = () => {
    updateMutation.mutate({
      organizationId,
      productId: product.id,
      active: !product.active,
    })
  }

  /**
   * Toggle test mode for the product.
   * When enabled, all payment links use Stripe TEST API keys.
   */
  const handleToggleTestMode = () => {
    updateMutation.mutate({
      organizationId,
      productId: product.id,
      testMode: !product.testMode,
    })
  }

  const handleCreatePrice = () => {
    if (!newPrice.name.trim()) {
      toast.error('Price name is required')
      return
    }
    if (newPrice.amount <= 0) {
      toast.error('Amount must be greater than 0')
      return
    }

    createPriceMutation.mutate({
      organizationId,
      productId: product.id,
      name: newPrice.name,
      amount: newPrice.amount,
      currency: newPrice.currency,
      billingType: newPrice.billingType,
      ...(newPrice.billingType === 'RECURRING' && {
        interval: newPrice.interval,
        intervalCount: newPrice.intervalCount,
      }),
      ...(newPrice.billingType === 'SPLIT_PAYMENT' && {
        installments: newPrice.installments,
        installmentInterval: newPrice.installmentInterval,
        installmentIntervalCount: 1,
      }),
      /** Only include trialDays for RECURRING billing — Stripe has no trial for ONE_TIME/SPLIT. SOURCE OF TRUTH: RecurringOnlyTrialGuard */
      ...(newPrice.trialDays > 0 && newPrice.billingType === 'RECURRING' && {
        trialDays: newPrice.trialDays,
      }),
    })
  }

  const handleStartEditFeatures = (price: ProductPrice) => {
    setEditingFeaturesFor(price.id)
    setFeatures(price.features.map((f) => ({ id: f.id, name: f.name })))
  }

  const handleSaveFeatures = (priceId: string) => {
    const validFeatures = features.filter((f) => f.name.trim() !== '')
    setFeaturesMutation.mutate({
      organizationId,
      priceId,
      features: validFeatures.map((f) => ({ name: f.name.trim(), description: null })),
    })
  }

  const handleAddFeature = () => {
    setFeatures([...features, { id: `new-${Date.now()}`, name: '' }])
  }

  const handleRemoveFeature = (id: string) => {
    setFeatures(features.filter((f) => f.id !== id))
  }

  const confirmDeleteProduct = () => {
    deleteProductMutation.mutate({
      organizationId,
      productId: product.id,
    })
  }

  const confirmDeletePrice = () => {
    if (deletePriceId) {
      deletePriceMutation.mutate({
        organizationId,
        priceId: deletePriceId,
      })
    }
  }

  // Handle adding product to store
  const handleAddToStore = () => {
    if (!selectedStoreId || !selectedStorePriceId) return
    addToStoreMutation.mutate({
      organizationId,
      storeId: selectedStoreId,
      productId: product.id,
      priceId: selectedStorePriceId,
    })
  }

  // Handle removing product from store
  const handleRemoveFromStore = (storeId: string) => {
    removeFromStoreMutation.mutate({
      organizationId,
      storeId,
      productId: product.id,
    })
  }

  // Reset add to store dialog when closed
  const handleAddToStoreDialogChange = (open: boolean) => {
    setAddToStoreDialogOpen(open)
    if (!open) {
      setSelectedStoreId(null)
      setSelectedStorePriceId(null)
    }
  }

  // ============================================================================
  // INVENTORY HANDLERS
  // ============================================================================

  /**
   * Toggle inventory tracking on/off
   */
  const handleToggleInventoryTracking = () => {
    updateInventorySettingsMutation.mutate({
      organizationId,
      productId: product.id,
      trackInventory: !product.trackInventory,
    })
  }

  /**
   * Toggle allow backorder on/off
   */
  const handleToggleBackorder = () => {
    updateInventorySettingsMutation.mutate({
      organizationId,
      productId: product.id,
      allowBackorder: !product.allowBackorder,
    })
  }

  /**
   * Save low stock threshold
   */
  const handleSaveLowStockThreshold = () => {
    updateInventorySettingsMutation.mutate({
      organizationId,
      productId: product.id,
      lowStockThreshold: editLowStockThreshold,
    })
  }

  /**
   * Check if inventory is low (below threshold)
   */
  const isLowStock =
    product.trackInventory &&
    product.lowStockThreshold !== null &&
    product.inventoryQuantity <= product.lowStockThreshold

  // Calculate installment preview using organization currency
  const getInstallmentPreview = () => {
    if (newPrice.billingType !== 'SPLIT_PAYMENT' || newPrice.amount <= 0) return null
    const installmentAmount = Math.ceil(newPrice.amount / newPrice.installments)
    return formatCurrency(installmentAmount) // Uses org currency from context
  }

  // Payment link helpers
  const getPaymentUrl = (code: string) => {
    if (typeof window === 'undefined') return `/pay/${code}`
    return `${window.location.origin}/pay/${code}`
  }

  const copyToClipboard = async (url: string, linkId: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = url
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
      }
      setCopiedLinkId(linkId)
      toast.success('Link copied!')
      setTimeout(() => setCopiedLinkId(null), 2000)
    } catch {
      toast.error('Failed to copy link')
    }
  }

  // Get or create link and copy
  const handleProductLink = async () => {
    const existingLink = paymentLinks?.find((l) => l.type === 'PRODUCT')
    if (existingLink) {
      await copyToClipboard(getPaymentUrl(existingLink.code), 'product')
    } else {
      createLinkMutation.mutate(
        { organizationId, type: 'PRODUCT', productId: product.id },
        {
          onSuccess: (link) => {
            copyToClipboard(getPaymentUrl(link.code), 'product')
          },
        }
      )
    }
  }

  const handlePriceLink = async (priceId: string) => {
    const existingLink = paymentLinks?.find((l) => l.type === 'PRICE' && l.priceId === priceId)
    if (existingLink) {
      await copyToClipboard(getPaymentUrl(existingLink.code), priceId)
    } else {
      createLinkMutation.mutate(
        { organizationId, type: 'PRICE', priceId },
        {
          onSuccess: (link) => {
            copyToClipboard(getPaymentUrl(link.code), priceId)
          },
        }
      )
    }
  }

  return (
    <>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/payments/products">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12 rounded-lg">
                {product.imageUrl ? (
                  <AvatarImage src={product.imageUrl} alt={product.name} className="object-cover" />
                ) : null}
                <AvatarFallback className="rounded-lg bg-muted">
                  {product.imageUrl ? (
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <Package className="h-5 w-5 text-muted-foreground" />
                  )}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold">{product.name}</h1>
                  <Badge
                    variant={product.active ? 'default' : 'secondary'}
                    className={cn(
                      'text-xs',
                      product.active
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {product.active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {product.prices.length} price{product.prices.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleProductLink}
              disabled={createLinkMutation.isPending || product.prices.length === 0}
            >
              {copiedLinkId === 'product' ? (
                <Check className="mr-2 h-4 w-4 text-emerald-500" />
              ) : (
                <Link2 className="mr-2 h-4 w-4" />
              )}
              {copiedLinkId === 'product' ? 'Copied!' : 'Copy Link'}
            </Button>
            {canDelete && (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteProductDialogOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            )}
          </div>
        </div>

        {/* Product Details Section */}
        <div className="space-y-6">
          <SectionHeader title="Product Details" description="Manage your product information" />
          <Separator />

          <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
            <div className="space-y-1">
              <h4 className="text-sm font-medium">Basic Information</h4>
              <p className="text-sm text-muted-foreground">Name, description, and image</p>
            </div>

            <div className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Product name"
                  disabled={!canUpdate}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Optional description"
                  rows={2}
                  disabled={!canUpdate}
                />
              </div>

              {/* Featured Image — select from storage or paste URL */}
              <div className="space-y-2">
                <Label htmlFor="imageUrl">Featured Image</Label>
                {/* Preview thumbnail when an image is set */}
                {editImageUrl && (
                  <div className="relative group w-20 h-20 rounded-lg overflow-hidden bg-muted border border-border/30">
                    <img
                      src={editImageUrl}
                      alt="Featured product image"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                    {/* Remove button on hover */}
                    {canUpdate && (
                      <button
                        type="button"
                        onClick={() => setEditImageUrl('')}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
                {/* Select from Storage button */}
                {canUpdate && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFeaturedImageStorageOpen(true)}
                    className="gap-2"
                  >
                    <FolderOpen className="w-4 h-4" />
                    Select from Storage
                  </Button>
                )}
                {/* Fallback URL input */}
                <Input
                  id="imageUrl"
                  value={editImageUrl}
                  onChange={(e) => setEditImageUrl(e.target.value)}
                  placeholder="or paste image URL..."
                  disabled={!canUpdate}
                />
              </div>

              {/* Featured Image Storage Browser Modal — single select */}
              <StorageBrowserModal
                open={featuredImageStorageOpen}
                onOpenChange={setFeaturedImageStorageOpen}
                organizationId={organizationId}
                mode="select"
                fileFilter="image"
                title="Select Featured Image"
                subtitle="Choose an image for your product"
                onSelect={(file) => {
                  /* Narrow to single file — this is a single-select picker */
                  const selected = Array.isArray(file) ? file[0] : file
                  if (selected) {
                    setEditImageUrl(selected.accessUrl || selected.publicUrl || '')
                  }
                  setFeaturedImageStorageOpen(false)
                }}
              />

              {/* Gallery Images — grid of up to 8 images with add/remove */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Images className="w-4 h-4" />
                  Gallery Images
                </Label>

                {/* Thumbnail grid of gallery images */}
                {editImages.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {editImages.map((url, index) => (
                      <div
                        key={`${url}-${index}`}
                        className="relative group aspect-square rounded-lg overflow-hidden bg-muted border border-border/30"
                      >
                        <img
                          src={url}
                          alt={`Gallery image ${index + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            ;(e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                        {/* Remove button — visible on hover */}
                        {canUpdate && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditImages((prev) => prev.filter((_, i) => i !== index))
                            }}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Images button — opens storage browser in multi-select mode */}
                {canUpdate && (
                  <button
                    type="button"
                    onClick={() => setGalleryStorageOpen(true)}
                    disabled={editImages.length >= 8}
                    className={cn(
                      'w-full py-2.5 px-4 rounded-lg',
                      'border-2 border-dashed border-border',
                      'hover:border-primary/50 hover:bg-primary/5',
                      'transition-all duration-200',
                      'flex items-center justify-center gap-2',
                      'text-sm text-muted-foreground hover:text-foreground',
                      editImages.length >= 8 &&
                        'opacity-50 cursor-not-allowed hover:border-border hover:bg-transparent'
                    )}
                  >
                    <Plus className="w-4 h-4" />
                    <span>
                      {editImages.length > 0 ? 'Add More Images' : 'Add Images'}
                    </span>
                  </button>
                )}

                {/* Image count */}
                <p className="text-xs text-muted-foreground/60">
                  {editImages.length}/8 images
                </p>
              </div>

              {/* Gallery Storage Browser Modal — multi-select mode, capped at 8 total */}
              <StorageBrowserModal
                open={galleryStorageOpen}
                onOpenChange={setGalleryStorageOpen}
                organizationId={organizationId}
                mode="multi-select"
                fileFilter="image"
                title="Select Gallery Images"
                subtitle="Choose images for the product gallery"
                onConfirm={(files) => {
                  const newUrls = (Array.isArray(files) ? files : [files])
                    .map((file) => file.accessUrl || file.publicUrl || '')
                    .filter((url) => url.length > 0)
                  // Cap at 8 total images
                  setEditImages((prev) => [...prev, ...newUrls].slice(0, 8))
                  setGalleryStorageOpen(false)
                }}
              />

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={product.active}
                    onCheckedChange={handleToggleActive}
                    disabled={updateMutation.isPending || !canUpdate}
                  />
                  <Label className="text-sm">{product.active ? 'Active' : 'Inactive'}</Label>
                </div>
                {canUpdate && (
                  <Button
                    size="sm"
                    onClick={handleSaveDetails}
                    disabled={!hasChanges || updateMutation.isPending}
                  >
                    {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Test Mode Section */}
        <div className="space-y-6">
          <SectionHeader title="Test Mode" description="Test payments without real money" />
          <Separator />

          <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
            <div className="space-y-1">
              <h4 className="text-sm font-medium">Payment Testing</h4>
              <p className="text-sm text-muted-foreground">Enable test mode for all payment links</p>
            </div>

            <div className="space-y-4 max-w-md">
              <div className="p-4 rounded-lg border bg-muted/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FlaskConical className={cn(
                      'h-5 w-5',
                      product.testMode ? 'text-amber-500' : 'text-muted-foreground'
                    )} />
                    <div>
                      <Label className="text-sm font-medium">Test Mode</Label>
                      <p className="text-xs text-muted-foreground">
                        {product.testMode
                          ? 'Test mode enabled - payments use test API keys'
                          : 'Test mode disabled - payments are live'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {product.testMode && (
                      <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20">
                        TEST
                      </Badge>
                    )}
                    <Switch
                      checked={product.testMode}
                      onCheckedChange={handleToggleTestMode}
                      disabled={updateMutation.isPending || !canUpdate}
                    />
                  </div>
                </div>

                {product.testMode && (
                  <div className="text-xs text-muted-foreground bg-amber-500/10 rounded p-2 space-y-1">
                    <p className="font-medium text-amber-600 dark:text-amber-400">Test Card Numbers:</p>
                    <p>Success: 4242 4242 4242 4242</p>
                    <p>Decline: 4000 0000 0000 0002</p>
                    <p>Use any future date, any 3-digit CVC, and any ZIP code</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Inventory Section */}
        <div className="space-y-6">
          <SectionHeader title="Inventory" description="Manage stock levels and availability" />
          <Separator />

          <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
            <div className="space-y-1">
              <h4 className="text-sm font-medium">Stock Management</h4>
              <p className="text-sm text-muted-foreground">
                Track inventory and control availability
              </p>
            </div>

            <div className="space-y-6 max-w-md">
              {/* Track Inventory Toggle */}
              <div className="p-4 rounded-lg border bg-muted/20 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Boxes
                      className={cn(
                        'h-5 w-5',
                        product.trackInventory ? 'text-primary' : 'text-muted-foreground'
                      )}
                    />
                    <div>
                      <Label className="text-sm font-medium">Track Inventory</Label>
                      <p className="text-xs text-muted-foreground">
                        {product.trackInventory
                          ? 'Inventory tracking enabled'
                          : 'Inventory tracking disabled'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={product.trackInventory}
                    onCheckedChange={handleToggleInventoryTracking}
                    disabled={updateInventorySettingsMutation.isPending || !canUpdate}
                  />
                </div>

                {/* Inventory Controls - Only show when tracking is enabled */}
                {product.trackInventory && (
                  <>
                    {/* Current Stock Display */}
                    <div className="pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Current Stock</span>
                        <div className="flex items-center gap-2">
                          {isLowStock && (
                            <Badge
                              variant="secondary"
                              className="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            >
                              <AlertTriangle className="mr-1 h-3 w-3" />
                              Low Stock
                            </Badge>
                          )}
                          <span
                            className={cn(
                              'text-2xl font-bold tabular-nums',
                              isLowStock && 'text-amber-600 dark:text-amber-400',
                              product.inventoryQuantity === 0 && 'text-destructive'
                            )}
                          >
                            {product.inventoryQuantity}
                          </span>
                        </div>
                      </div>

                      {/* Stock Controls - Direct input allows any value including 0 */}
                      {canUpdate && (
                        <div className="mt-3 flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              const newValue = Math.max(0, setStockValue - 1)
                              setSetStockValue(newValue)
                              setInventoryMutation.mutate({
                                organizationId,
                                productId: product.id,
                                quantity: newValue,
                              })
                            }}
                            disabled={setInventoryMutation.isPending || setStockValue <= 0}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <Input
                            type="number"
                            min="0"
                            value={setStockValue}
                            onChange={(e) => {
                              const val = parseInt(e.target.value)
                              setSetStockValue(isNaN(val) ? 0 : Math.max(0, val))
                            }}
                            onBlur={() => {
                              if (setStockValue !== product.inventoryQuantity) {
                                setInventoryMutation.mutate({
                                  organizationId,
                                  productId: product.id,
                                  quantity: setStockValue,
                                })
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && setStockValue !== product.inventoryQuantity) {
                                setInventoryMutation.mutate({
                                  organizationId,
                                  productId: product.id,
                                  quantity: setStockValue,
                                })
                              }
                            }}
                            className="h-8 w-24 text-center"
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              const newValue = setStockValue + 1
                              setSetStockValue(newValue)
                              setInventoryMutation.mutate({
                                organizationId,
                                productId: product.id,
                                quantity: newValue,
                              })
                            }}
                            disabled={setInventoryMutation.isPending}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                          {setInventoryMutation.isPending && (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Allow Backorder Toggle */}
                    <div className="pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium">Allow Backorder</Label>
                          <p className="text-xs text-muted-foreground">
                            {product.allowBackorder
                              ? 'Customers can purchase when out of stock'
                              : 'Purchases blocked when out of stock'}
                          </p>
                        </div>
                        <Switch
                          checked={product.allowBackorder}
                          onCheckedChange={handleToggleBackorder}
                          disabled={updateInventorySettingsMutation.isPending || !canUpdate}
                        />
                      </div>
                    </div>

                    {/* Low Stock Threshold */}
                    <div className="pt-2 border-t">
                      <Label className="text-sm font-medium">Low Stock Threshold</Label>
                      <p className="text-xs text-muted-foreground mb-2">
                        Get alerted when stock falls below this level
                      </p>
                      {canUpdate ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            value={editLowStockThreshold}
                            onChange={(e) =>
                              setEditLowStockThreshold(Math.max(0, parseInt(e.target.value) || 0))
                            }
                            className="h-8 w-24"
                          />
                          {editLowStockThreshold !== (product.lowStockThreshold ?? 10) && (
                            <Button
                              size="sm"
                              onClick={handleSaveLowStockThreshold}
                              disabled={updateInventorySettingsMutation.isPending}
                            >
                              {updateInventorySettingsMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                'Save'
                              )}
                            </Button>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm">{product.lowStockThreshold ?? 10}</p>
                      )}
                    </div>

                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Pricing Section */}
        <div className="space-y-6">
          <SectionHeader title="Pricing" description="Configure pricing tiers" />
          <Separator />

          <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
            <div className="space-y-1">
              <h4 className="text-sm font-medium">Price Tiers</h4>
              <p className="text-sm text-muted-foreground">Different pricing options</p>
            </div>

            <div className="space-y-4">
              {/* Existing Prices */}
              {product.prices.map((price) => (
                <div key={price.id} className="p-4 rounded-lg border bg-muted/20">
                  {editingFeaturesFor === price.id ? (
                    // Features editing mode
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{price.name} - Features</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingFeaturesFor(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="space-y-2">
                        {features.map((feature, index) => (
                          <div key={feature.id} className="flex items-center gap-2">
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                            <Input
                              value={feature.name}
                              onChange={(e) =>
                                setFeatures(
                                  features.map((f) =>
                                    f.id === feature.id ? { ...f, name: e.target.value } : f
                                  )
                                )
                              }
                              placeholder={`Feature ${index + 1}`}
                              className="h-8"
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => handleRemoveFeature(feature.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={handleAddFeature}>
                          <Plus className="mr-1 h-3 w-3" />
                          Add
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSaveFeatures(price.id)}
                          disabled={setFeaturesMutation.isPending}
                        >
                          {setFeaturesMutation.isPending && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          Save Features
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // Normal display mode
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{price.name}</span>
                          {!price.active && (
                            <Badge variant="secondary" className="text-xs">
                              Inactive
                            </Badge>
                          )}
                          {/* Trial badge — ONLY for RECURRING prices. SOURCE OF TRUTH: RecurringOnlyTrialGuard */}
                          {price.billingType === 'RECURRING' && price.trialDays && price.trialDays > 0 && (
                            <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
                              {price.trialDays}-day trial
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-lg font-semibold">
                            {formatCurrency(price.amount, price.currency)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {formatBillingType(price)}
                          </span>
                        </div>
                        {price.features.length > 0 && (
                          <div className="pt-2 flex flex-wrap gap-x-4 gap-y-1">
                            {price.features.slice(0, 4).map((feature) => (
                              <span
                                key={feature.id}
                                className="text-sm flex items-center gap-1.5 text-muted-foreground"
                              >
                                <CheckCircle className="h-3 w-3 text-emerald-500" />
                                {feature.name}
                              </span>
                            ))}
                            {price.features.length > 4 && (
                              <span className="text-xs text-muted-foreground">
                                +{price.features.length - 4} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => handlePriceLink(price.id)}
                          disabled={createLinkMutation.isPending}
                        >
                          {copiedLinkId === price.id ? (
                            <Check className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <Link2 className="h-4 w-4" />
                          )}
                        </Button>
                        {canUpdate && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs"
                            onClick={() => handleStartEditFeatures(price)}
                          >
                            Features
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeletePriceId(price.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* New Price Form - Only show if canCreatePrice */}
              {canCreatePrice && showNewPriceForm ? (
                <div className="p-4 rounded-lg border border-dashed space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">New Price</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowNewPriceForm(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Name</Label>
                      <Input
                        value={newPrice.name}
                        onChange={(e) => setNewPrice({ ...newPrice, name: e.target.value })}
                        placeholder="Monthly"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Type</Label>
                      <Select
                        value={newPrice.billingType}
                        onValueChange={(v) =>
                          setNewPrice({ ...newPrice, billingType: v as BillingType })
                        }
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ONE_TIME">One-time</SelectItem>
                          <SelectItem value="RECURRING">Recurring</SelectItem>
                          <SelectItem value="SPLIT_PAYMENT">Split</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        {newPrice.billingType === 'SPLIT_PAYMENT' ? 'Total Amount' : 'Amount'}
                      </Label>
                      <PriceInput
                        value={newPrice.amount}
                        onChange={(cents) => setNewPrice({ ...newPrice, amount: cents })}
                        currency={orgCurrency}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Currency</Label>
                      {/* Currency is determined by connected Stripe account - read only */}
                      <div className="flex h-9 items-center rounded-md border border-input bg-muted/50 px-3 text-sm">
                        <span className="font-medium">{orgCurrency.toUpperCase()}</span>
                        {!hasStripeConnected && (
                          <span className="ml-2 text-xs text-muted-foreground">(default)</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Recurring options */}
                  {newPrice.billingType === 'RECURRING' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Every</Label>
                        <Input
                          type="number"
                          min="1"
                          value={newPrice.intervalCount}
                          onChange={(e) =>
                            setNewPrice({ ...newPrice, intervalCount: parseInt(e.target.value) || 1 })
                          }
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Interval</Label>
                        <Select
                          value={newPrice.interval}
                          onValueChange={(v) =>
                            setNewPrice({
                              ...newPrice,
                              interval: v as 'DAY' | 'WEEK' | 'MONTH' | 'YEAR',
                            })
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {BILLING_INTERVALS.map((i) => (
                              <SelectItem key={i.value} value={i.value}>
                                {i.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {/* Split payment options */}
                  {newPrice.billingType === 'SPLIT_PAYMENT' && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Payments</Label>
                          <Input
                            type="number"
                            min="2"
                            max="24"
                            value={newPrice.installments}
                            onChange={(e) =>
                              setNewPrice({
                                ...newPrice,
                                installments: parseInt(e.target.value) || 3,
                              })
                            }
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Frequency</Label>
                          <Select
                            value={newPrice.installmentInterval}
                            onValueChange={(v) =>
                              setNewPrice({
                                ...newPrice,
                                installmentInterval: v as 'WEEK' | 'MONTH' | 'YEAR',
                              })
                            }
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="WEEK">Weekly</SelectItem>
                              <SelectItem value="MONTH">Monthly</SelectItem>
                              <SelectItem value="YEAR">Yearly</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {getInstallmentPreview() && (
                        <p className="text-xs text-muted-foreground">
                          {getInstallmentPreview()} × {newPrice.installments} payments
                        </p>
                      )}
                    </>
                  )}

                  {/**
                    * Free trial option — ONLY available for RECURRING billing.
                    * Stripe does not natively support trials on ONE_TIME or SPLIT_PAYMENT.
                    * SOURCE OF TRUTH: RecurringOnlyTrialGuard
                    */}
                  {newPrice.billingType === 'RECURRING' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Free Trial (days)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="365"
                        value={newPrice.trialDays || ''}
                        onChange={(e) =>
                          setNewPrice({ ...newPrice, trialDays: parseInt(e.target.value) || 0 })
                        }
                        placeholder="0 (no trial)"
                        className="h-9"
                      />
                      {newPrice.trialDays > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Customers get {newPrice.trialDays} days free before being charged
                        </p>
                      )}
                    </div>
                  )}

                  <Button
                    size="sm"
                    onClick={handleCreatePrice}
                    disabled={createPriceMutation.isPending}
                    className="w-full"
                  >
                    {createPriceMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Create Price
                  </Button>
                </div>
              ) : canCreatePrice ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowNewPriceForm(true)}
                  className="w-fit"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Price
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Stores Section */}
        <div className="space-y-6">
          <SectionHeader title="Stores" description="Manage which stores contain this product" />
          <Separator />

          <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
            <div className="space-y-1">
              <h4 className="text-sm font-medium">Store Catalog</h4>
              <p className="text-sm text-muted-foreground">
                Add this product to stores with specific pricing
              </p>
            </div>

            <div className="space-y-4">
              {/* Existing stores */}
              {isLoadingProductStores ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading stores...
                </div>
              ) : productStores && productStores.length > 0 ? (
                <div className="space-y-2">
                  {productStores.map((storeProduct) => (
                    <div
                      key={storeProduct.store.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-muted/20"
                    >
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-lg bg-muted flex items-center justify-center">
                          <Store className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{storeProduct.store.name}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {formatCurrency(storeProduct.price.amount, storeProduct.price.currency)}
                            </span>
                            <Badge variant="secondary" className="text-xs">
                              {storeProduct.price.name}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      {canUpdate && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleRemoveFromStore(storeProduct.store.id)}
                          disabled={removeFromStoreMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This product is not in any stores yet.
                </p>
              )}

              {/* Add to store button */}
              {canUpdate && product.prices.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAddToStoreDialogOpen(true)}
                  className="w-fit"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add to Store
                </Button>
              )}

              {product.prices.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Add at least one price to add this product to a store.
                </p>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Add to Store Dialog */}
      <Dialog open={addToStoreDialogOpen} onOpenChange={handleAddToStoreDialogChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add to Store</DialogTitle>
            <DialogDescription>
              {selectedStoreId
                ? 'Select a price for this product in the store'
                : 'Choose a store to add this product to'}
            </DialogDescription>
          </DialogHeader>

          {!selectedStoreId ? (
            // Step 1: Select store
            <ScrollArea className="h-[300px]">
              {!availableStores || availableStores.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Store className="h-10 w-10 text-muted-foreground/50 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {availableStores?.length === 0
                      ? 'This product is already in all available stores'
                      : 'No stores available. Create a store first.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableStores.map((store) => (
                    <button
                      key={store.id}
                      onClick={() => setSelectedStoreId(store.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="size-10 rounded-lg bg-muted flex items-center justify-center">
                        <Store className="size-5 text-muted-foreground" />
                      </div>
                      <p className="font-medium">{store.name}</p>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          ) : (
            // Step 2: Select price
            <div className="space-y-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedStoreId(null)
                  setSelectedStorePriceId(null)
                }}
                className="mb-2"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to stores
              </Button>

              <div className="space-y-2">
                {/**
                 * Filter to only ONE_TIME and RECURRING prices.
                 * SPLIT_PAYMENT is NOT supported for store checkout.
                 * Same validation as the e-commerce page's add-product-dialog (source of truth).
                 */}
                {product.prices
                  .filter((p) => p.billingType === 'ONE_TIME' || p.billingType === 'RECURRING')
                  .map((price) => (
                  <button
                    key={price.id}
                    onClick={() => setSelectedStorePriceId(price.id)}
                    className={cn(
                      'w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left',
                      selectedStorePriceId === price.id
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    )}
                  >
                    <div>
                      <p className="font-medium">{price.name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">
                          {formatCurrency(price.amount, price.currency)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatBillingType(price)}
                        </span>
                      </div>
                    </div>
                    {selectedStorePriceId === price.id && (
                      <Check className="h-5 w-5 text-primary" />
                    )}
                  </button>
                ))}
              </div>

              <Button
                className="w-full"
                onClick={handleAddToStore}
                disabled={!selectedStorePriceId || addToStoreMutation.isPending}
              >
                {addToStoreMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Add to Store
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Product Dialog */}
      <AlertDialog open={deleteProductDialogOpen} onOpenChange={setDeleteProductDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{product.name}"? This will also delete all prices.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteProduct}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteProductMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Price Dialog */}
      <AlertDialog open={!!deletePriceId} onOpenChange={() => setDeletePriceId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Price</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this price tier?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeletePrice}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePriceMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  )
}

