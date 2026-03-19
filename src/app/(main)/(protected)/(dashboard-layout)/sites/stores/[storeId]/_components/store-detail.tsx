/**
 * ============================================================================
 * Store Detail Component
 * ============================================================================
 *
 * WHY: Full page view for managing a single store and its products
 * HOW: Uses ContentLayout for consistent layout, StoreProductsTable for
 *      product listing with search, sorting, and pagination.
 *
 * ARCHITECTURE:
 * - Uses ContentLayout with header actions for consistent UX
 * - StoreProductsTable handles product display, search, and pagination
 * - Optimistic updates for all mutations
 *
 * PERMISSIONS:
 * - canUpdate: Can edit store details, add/remove products, change prices
 * - canDelete: Can delete the store itself
 *
 * SOURCE OF TRUTH: Store, StoreProduct, Ecommerce
 * ============================================================================
 */

'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Trash2,
  Loader2,
  Pencil,
  MoreHorizontal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ContentLayout } from '@/components/global/content-layout'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { permissions } from '@/lib/better-auth/permissions'
import { AddProductDialog } from './add-product-dialog'
import { StoreProductsTable } from './store-products-table'

// ============================================================================
// TYPES — SOURCE OF TRUTH: Store, StoreProduct
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

interface Store {
  id: string
  organizationId: string
  name: string
  description: string | null
  imageUrl: string | null
  products: StoreProduct[]
  createdAt: string
  updatedAt: string
}

interface StoreDetailProps {
  store: Store
  organizationId: string
  userRole: string
  userPermissions: string[]
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StoreDetail({
  store: initialStore,
  organizationId,
  userRole,
  userPermissions,
}: StoreDetailProps) {
  const router = useRouter()
  const utils = trpc.useUtils()

  // Compute permissions
  const canUpdate = useMemo(
    () => userRole === 'owner' || userPermissions.includes(permissions.STORES_UPDATE),
    [userRole, userPermissions]
  )
  const canDelete = useMemo(
    () => userRole === 'owner' || userPermissions.includes(permissions.STORES_DELETE),
    [userRole, userPermissions]
  )

  // Local store state for optimistic updates
  const [store, setStore] = useState(initialStore)

  // Dialog states
  const [deleteStoreDialogOpen, setDeleteStoreDialogOpen] = useState(false)
  const [removeProductId, setRemoveProductId] = useState<string | null>(null)
  const [addProductDialogOpen, setAddProductDialogOpen] = useState(false)
  const [changePriceProductId, setChangePriceProductId] = useState<string | null>(null)

  // Edit mode states
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(store.name)
  const [editDescription, setEditDescription] = useState(store.description || '')
  const [editImageUrl, setEditImageUrl] = useState(store.imageUrl || '')

  // Sync edit states with store changes
  useEffect(() => {
    setEditName(store.name)
    setEditDescription(store.description || '')
    setEditImageUrl(store.imageUrl || '')
  }, [store])

  // ==========================================================================
  // MUTATIONS
  // ==========================================================================

  /** Update store mutation with optimistic updates */
  const updateMutation = trpc.stores.update.useMutation({
    onMutate: async (input) => {
      setStore((prev) => ({
        ...prev,
        name: input.name ?? prev.name,
        description: input.description ?? prev.description,
        imageUrl: input.imageUrl ?? prev.imageUrl,
      }))
      setIsEditing(false)
    },
    onError: (err) => {
      setStore(initialStore)
      toast.error(err.message || 'Failed to update store')
    },
    onSuccess: () => {
      toast.success('Store updated')
      utils.stores.list.invalidate()
      utils.stores.getById.invalidate({ organizationId, storeId: store.id })
    },
  })

  /** Delete store mutation */
  const deleteStoreMutation = trpc.stores.delete.useMutation({
    onSuccess: () => {
      toast.success('Store deleted')
      router.push('/sites/stores')
      utils.stores.list.invalidate()
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to delete store')
    },
  })

  /** Remove single product from store with optimistic update */
  const removeProductMutation = trpc.stores.removeProduct.useMutation({
    onMutate: async ({ productId }) => {
      setStore((prev) => ({
        ...prev,
        products: prev.products.filter((p) => p.productId !== productId),
      }))
      setRemoveProductId(null)
    },
    onError: (err) => {
      setStore(initialStore)
      toast.error(err.message || 'Failed to remove product')
    },
    onSuccess: () => {
      toast.success('Product removed from store')
      utils.stores.getById.invalidate({ organizationId, storeId: store.id })
    },
  })

  /** Update product price with optimistic update */
  const updatePriceMutation = trpc.stores.updateProductPrice.useMutation({
    onMutate: async ({ productId, priceId }) => {
      setStore((prev) => ({
        ...prev,
        products: prev.products.map((p) => {
          if (p.productId !== productId) return p
          const newPrice = p.product.prices.find((pr) => pr.id === priceId)
          if (!newPrice) return p
          return { ...p, priceId, price: newPrice }
        }),
      }))
      setChangePriceProductId(null)
    },
    onError: (err) => {
      setStore(initialStore)
      toast.error(err.message || 'Failed to update price')
    },
    onSuccess: () => {
      toast.success('Price updated')
      utils.stores.getById.invalidate({ organizationId, storeId: store.id })
    },
  })

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleSaveDetails = () => {
    if (!editName.trim()) {
      toast.error('Store name is required')
      return
    }
    updateMutation.mutate({
      organizationId,
      storeId: store.id,
      name: editName,
      description: editDescription || null,
      imageUrl: editImageUrl || null,
    })
  }

  const handleCancelEdit = () => {
    setEditName(store.name)
    setEditDescription(store.description || '')
    setEditImageUrl(store.imageUrl || '')
    setIsEditing(false)
  }

  const confirmDeleteStore = () => {
    deleteStoreMutation.mutate({
      organizationId,
      storeId: store.id,
    })
  }

  /** Single product remove — triggered from the table's per-row action */
  const handleRemoveProduct = useCallback(
    (productId: string) => {
      setRemoveProductId(productId)
    },
    []
  )

  /** Confirm single product removal */
  const confirmRemoveProduct = () => {
    if (removeProductId) {
      removeProductMutation.mutate({
        organizationId,
        storeId: store.id,
        productId: removeProductId,
      })
    }
  }

  /** Bulk remove — removes multiple products from the store */
  const handleBulkRemoveProducts = useCallback(
    (productIds: string[]) => {
      /* Remove one-by-one (no bulk endpoint exists for store products) */
      for (const productId of productIds) {
        removeProductMutation.mutate({
          organizationId,
          storeId: store.id,
          productId,
        })
      }
    },
    [removeProductMutation, organizationId, store.id]
  )

  /** Price change — triggered from the table's per-row inline selector */
  const handleChangePriceConfirm = useCallback(
    (productId: string, priceId: string) => {
      updatePriceMutation.mutate({
        organizationId,
        storeId: store.id,
        productId,
        priceId,
      })
    },
    [updatePriceMutation, organizationId, store.id]
  )

  const handleChangePriceStart = useCallback((productId: string) => {
    setChangePriceProductId(productId)
  }, [])

  const handleChangePriceCancel = useCallback(() => {
    setChangePriceProductId(null)
  }, [])

  /**
   * Called when a product is added from the dialog.
   * Optimistically updates local state before the server confirms.
   */
  const handleProductAdded = (newProduct: StoreProduct) => {
    setStore((prev) => ({
      ...prev,
      products: [...prev.products, newProduct],
    }))
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  /** Header actions for ContentLayout */
  const headerActions = (
    <div className="flex items-center gap-2">
      {canUpdate && (
        <Button size="sm" onClick={() => setAddProductDialogOpen(true)}>
          <Plus className="size-4 mr-2" />
          Add Product
        </Button>
      )}
      {(canUpdate || canDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canUpdate && (
              <DropdownMenuItem onClick={() => setIsEditing(true)}>
                <Pencil className="size-4 mr-2" />
                Edit Store
              </DropdownMenuItem>
            )}
            {canDelete && (
              <DropdownMenuItem
                onClick={() => setDeleteStoreDialogOpen(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="size-4 mr-2" />
                Delete Store
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )

  return (
    <ContentLayout headerActions={headerActions}>
      <div className="space-y-6">
        {/* ================================================================
         * INLINE EDIT FORM — visible when editing store details
         * ================================================================ */}
        {isEditing && (
          <div className="p-4 border rounded-lg bg-muted/20 space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Store name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="A short description..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="imageUrl">Image URL (optional)</Label>
              <Input
                id="imageUrl"
                value={editImageUrl}
                onChange={(e) => setEditImageUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button size="sm" onClick={handleSaveDetails} disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Store description (if exists and not editing) */}
        {store.description && !isEditing && (
          <p className="text-sm text-muted-foreground max-w-2xl">{store.description}</p>
        )}

        {/* ================================================================
         * PRODUCTS TABLE — TanStack React Table with search & pagination
         * ================================================================ */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium">
            Products ({store.products.length})
          </h2>

          <StoreProductsTable
            products={store.products}
            canUpdate={canUpdate}
            onRemoveProduct={handleRemoveProduct}
            onChangePriceStart={handleChangePriceStart}
            changePriceProductId={changePriceProductId}
            onChangePriceConfirm={handleChangePriceConfirm}
            onChangePriceCancel={handleChangePriceCancel}
            onBulkRemove={canUpdate ? handleBulkRemoveProducts : undefined}
          />
        </div>
      </div>

      {/* Add Product Dialog */}
      <AddProductDialog
        open={addProductDialogOpen}
        onOpenChange={setAddProductDialogOpen}
        organizationId={organizationId}
        storeId={store.id}
        onProductAdded={handleProductAdded}
      />

      {/* Delete Store Dialog */}
      <AlertDialog open={deleteStoreDialogOpen} onOpenChange={setDeleteStoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Store</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{store.name}&rdquo;? This will remove all
              product associations. Products themselves will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteStore}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteStoreMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Product Dialog — single product confirmation */}
      <AlertDialog open={!!removeProductId} onOpenChange={() => setRemoveProductId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Product</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this product from the store? The product itself will
              not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemoveProduct}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeProductMutation.isPending ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentLayout>
  )
}
