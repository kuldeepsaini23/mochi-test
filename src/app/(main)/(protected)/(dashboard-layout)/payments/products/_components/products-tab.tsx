/**
 * Products Tab Component - Active Organization Pattern
 *
 * WHY: Main container for product management with table layout
 * HOW: Uses ProductsTable for listing, navigates to product page for details
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based access control via hasPermission helper
 * - Server-side pagination with search and filters
 * - Table-based design with bulk operations
 * - Navigates to /payments/products/[id] for product details
 * - Full CRUD with optimistic updates
 *
 * PERMISSIONS:
 * - canCreate: Show "Add Product" button (via hasPermission)
 * - canUpdate: Navigate to detail page for editing
 * - canDelete: Show delete buttons and bulk delete
 *
 * SOURCE OF TRUTH: Product, ActiveOrganization
 */

'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useDebounce } from '@/hooks/use-debounce'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { ProductsTable, type ProductWithPrices } from './products-table'
import { ProductDialog } from './product-dialog'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { FeatureGate } from '@/components/feature-gate'
import ProductsLoading from '../loading'

/**
 * ProductsTab component with integrated organization caching
 * No props required - fetches organization data internally with aggressive caching
 */
export function ProductsTab() {
  const router = useRouter()
  const utils = trpc.useUtils()

  /**
   * Get active organization from the hook
   * This respects domain-first approach and session activeOrganizationId
   */
  const { activeOrganization, isLoading: isLoadingOrg, hasPermission } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''

  /**
   * Check permissions using hook's hasPermission helper
   * Owners have full access, members need explicit permission
   */
  const hasAccess = hasPermission(permissions.PRODUCTS_READ)
  const canCreate = hasPermission(permissions.PRODUCTS_CREATE)
  const canUpdate = hasPermission(permissions.PRODUCTS_UPDATE)
  const canDelete = hasPermission(permissions.PRODUCTS_DELETE)

  // Search and filter state
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState<boolean | undefined>(undefined)
  const debouncedSearch = useDebounce(search, 300)

  // Pagination state
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Dialog state
  const [productDialogOpen, setProductDialogOpen] = useState(false)

  // Reset page when search/filter changes
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, activeOnly])

  // Query products with pagination (only when we have an organization)
  const { data, isLoading, isFetching } = trpc.products.list.useQuery(
    {
      organizationId,
      search: debouncedSearch || undefined,
      page,
      pageSize,
      activeOnly,
    },
    {
      enabled: !!organizationId && hasAccess,
      placeholderData: (previousData) => previousData,
    }
  )

  // Memoize products data for stable reference
  const products = useMemo(() => data?.products ?? [], [data?.products])
  const totalPages = data?.totalPages ?? 1
  const total = data?.total ?? 0

  // Bulk delete mutation
  const bulkDeleteMutation = trpc.products.bulkDelete.useMutation({
    onMutate: async ({ productIds }) => {
      await utils.products.list.cancel()
      const queryKey = {
        organizationId,
        search: debouncedSearch || undefined,
        page,
        pageSize,
        activeOnly,
      }
      const previousData = utils.products.list.getData(queryKey)

      utils.products.list.setData(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          products: old.products.filter((p) => !productIds.includes(p.id)),
          total: old.total - productIds.length,
        }
      })

      return { previousData }
    },
    onError: (err, _input, context) => {
      if (context?.previousData) {
        utils.products.list.setData(
          {
            organizationId,
            search: debouncedSearch || undefined,
            page,
            pageSize,
            activeOnly,
          },
          context.previousData
        )
      }
      toast.error(err.message || 'Failed to delete products')
    },
    onSuccess: (result) => {
      toast.success(
        `${result.count} product${result.count > 1 ? 's' : ''} deleted`
      )
      setSelectedIds([])
    },
    onSettled: () => {
      utils.products.list.invalidate()
    },
  })

  // Delete single product mutation
  const deleteMutation = trpc.products.delete.useMutation({
    onMutate: async ({ productId }) => {
      await utils.products.list.cancel()
      const queryKey = {
        organizationId,
        search: debouncedSearch || undefined,
        page,
        pageSize,
        activeOnly,
      }
      const previousData = utils.products.list.getData(queryKey)

      utils.products.list.setData(queryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          products: old.products.filter((p) => p.id !== productId),
          total: old.total - 1,
        }
      })

      return { previousData }
    },
    onError: (err, _input, context) => {
      if (context?.previousData) {
        utils.products.list.setData(
          {
            organizationId,
            search: debouncedSearch || undefined,
            page,
            pageSize,
            activeOnly,
          },
          context.previousData
        )
      }
      toast.error(err.message || 'Failed to delete product')
    },
    onSuccess: () => {
      toast.success('Product deleted')
    },
    onSettled: () => {
      utils.products.list.invalidate()
    },
  })

  // Handlers
  const handleSearch = useCallback((value: string) => {
    setSearch(value)
  }, [])

  const handleActiveFilterChange = useCallback((value: boolean | undefined) => {
    setActiveOnly(value)
  }, [])

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage)
  }, [])

  const handlePageSizeChange = useCallback((newPageSize: number) => {
    setPageSize(newPageSize)
    setPage(1)
  }, [])

  const handleSelectionChange = useCallback((ids: string[]) => {
    setSelectedIds(ids)
  }, [])

  // Navigate to product detail page
  const handleProductClick = useCallback(
    (product: ProductWithPrices) => {
      router.push(`/payments/products/${product.id}`)
    },
    [router]
  )

  const handleBulkDelete = useCallback(
    (ids: string[]) => {
      bulkDeleteMutation.mutate({
        organizationId,
        productIds: ids,
      })
    },
    [bulkDeleteMutation, organizationId]
  )

  const handleDelete = useCallback(
    (id: string) => {
      deleteMutation.mutate({
        organizationId,
        productId: id,
      })
    },
    [deleteMutation, organizationId]
  )

  const handleAddProduct = useCallback(() => {
    setProductDialogOpen(true)
  }, [])

  // Show loading skeleton while fetching organization data (only on initial load)
  if (isLoadingOrg && !activeOrganization) {
    return <ProductsLoading />
  }

  // Handle no organization found
  if (!activeOrganization) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">
          No organization found. Please contact your administrator.
        </p>
      </div>
    )
  }

  // Handle no access permission
  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">
          You do not have permission to view products.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* Header with Add Button */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Products</h2>
          <p className="text-sm text-muted-foreground">
            Create and manage products with multiple pricing options
          </p>
        </div>
        {canCreate && (
          <FeatureGate feature="products.limit">
            <Button onClick={handleAddProduct}>
              <Plus className="mr-2 h-4 w-4" />
              Add Product
            </Button>
          </FeatureGate>
        )}
      </div>

      {/* Products Table */}
      <ProductsTable
        products={products}
        isLoading={isLoading}
        isFetching={isFetching}
        search={search}
        onSearchChange={handleSearch}
        activeOnly={activeOnly}
        onActiveFilterChange={handleActiveFilterChange}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        total={total}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        selectedIds={selectedIds}
        onSelectionChange={handleSelectionChange}
        onProductClick={handleProductClick}
        onBulkDelete={canDelete ? handleBulkDelete : undefined}
        onDelete={canDelete ? handleDelete : undefined}
        isBulkDeleting={bulkDeleteMutation.isPending}
        canDelete={canDelete}
      />

      {/* Add Product Dialog - Only render if canCreate */}
      {canCreate && (
        <ProductDialog
          open={productDialogOpen}
          onOpenChange={setProductDialogOpen}
          organizationId={organizationId}
          product={null}
        />
      )}
    </>
  )
}
