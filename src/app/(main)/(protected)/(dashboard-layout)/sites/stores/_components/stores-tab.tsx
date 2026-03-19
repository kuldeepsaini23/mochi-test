'use client'

/**
 * Stores Tab Component
 *
 * WHY: Main container for store list with search, pagination, and mutations
 * HOW: Uses tRPC with optimistic updates for snappy UX
 *
 * Features:
 * - Search with debounce
 * - Pagination
 * - Optimistic updates for create/delete
 * - Bulk delete with selection
 *
 * SOURCE OF TRUTH: Store, StoreProduct, Ecommerce
 */

import { useState, useEffect, useCallback } from 'react'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { StoresTable } from './stores-table'
import { StoreDialog } from './store-dialog'

// ============================================================================
// TYPES
// ============================================================================

interface StoresTabProps {
  organizationId: string
  onRegisterOpenDialog?: (openFn: () => void) => void
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}

// ============================================================================
// CUSTOM HOOK - DEBOUNCE
// ============================================================================

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

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StoresTab({
  organizationId,
  onRegisterOpenDialog,
  canCreate,
  canUpdate,
  canDelete,
}: StoresTabProps) {
  const utils = trpc.useUtils()

  // Search state with debounce
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounce(searchInput, 300)

  // Pagination state
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(8)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingStore, setEditingStore] = useState<{
    id: string
    name: string
    description?: string | null
    imageUrl?: string | null
  } | null>(null)

  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  // Register the open dialog function with parent
  useEffect(() => {
    onRegisterOpenDialog?.(() => {
      setEditingStore(null)
      setDialogOpen(true)
    })
  }, [onRegisterOpenDialog])

  // ==========================================================================
  // DATA FETCHING
  // ==========================================================================

  const { data, isLoading, isError } = trpc.stores.list.useQuery({
    organizationId,
    search: debouncedSearch || undefined,
    page,
    pageSize,
  })

  // ==========================================================================
  // MUTATIONS
  // ==========================================================================

  /**
   * Create store mutation with optimistic updates
   */
  const createStoreMutation = trpc.stores.create.useMutation({
    onMutate: async (newStore) => {
      // Cancel outgoing refetches
      await utils.stores.list.cancel()

      // Snapshot previous values
      const previousData = utils.stores.list.getData({
        organizationId,
        search: debouncedSearch || undefined,
        page,
        pageSize,
      })

      // Optimistically add to list
      const optimisticStore = {
        id: `temp-${Date.now()}`,
        organizationId,
        name: newStore.name,
        description: newStore.description || null,
        imageUrl: newStore.imageUrl || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        _count: { products: 0 },
      }

      utils.stores.list.setData(
        {
          organizationId,
          search: debouncedSearch || undefined,
          page,
          pageSize,
        },
        (old) => {
          if (!old) return old
          return {
            ...old,
            stores: [optimisticStore, ...old.stores].slice(0, pageSize),
            total: old.total + 1,
          }
        }
      )

      return { previousData }
    },
    onError: (_err, _newStore, context) => {
      // Rollback on error
      if (context?.previousData) {
        utils.stores.list.setData(
          {
            organizationId,
            search: debouncedSearch || undefined,
            page,
            pageSize,
          },
          context.previousData
        )
      }
      toast.error('Failed to create store')
    },
    onSuccess: () => {
      toast.success('Store created successfully')
      setDialogOpen(false)
    },
    onSettled: () => {
      utils.stores.list.invalidate()
    },
  })

  /**
   * Update store mutation with optimistic updates
   */
  const updateStoreMutation = trpc.stores.update.useMutation({
    onMutate: async (updatedStore) => {
      await utils.stores.list.cancel()

      const previousData = utils.stores.list.getData({
        organizationId,
        search: debouncedSearch || undefined,
        page,
        pageSize,
      })

      utils.stores.list.setData(
        {
          organizationId,
          search: debouncedSearch || undefined,
          page,
          pageSize,
        },
        (old) => {
          if (!old) return old
          return {
            ...old,
            stores: old.stores.map((store) =>
              store.id === updatedStore.storeId
                ? { ...store, ...updatedStore, updatedAt: new Date().toISOString() }
                : store
            ),
          }
        }
      )

      return { previousData }
    },
    onError: (_err, _updatedStore, context) => {
      if (context?.previousData) {
        utils.stores.list.setData(
          {
            organizationId,
            search: debouncedSearch || undefined,
            page,
            pageSize,
          },
          context.previousData
        )
      }
      toast.error('Failed to update store')
    },
    onSuccess: () => {
      toast.success('Store updated successfully')
      setDialogOpen(false)
      setEditingStore(null)
    },
    onSettled: () => {
      utils.stores.list.invalidate()
    },
  })

  /**
   * Bulk delete mutation with optimistic updates
   */
  const bulkDeleteMutation = trpc.stores.bulkDelete.useMutation({
    onMutate: async ({ storeIds }) => {
      await utils.stores.list.cancel()

      const previousData = utils.stores.list.getData({
        organizationId,
        search: debouncedSearch || undefined,
        page,
        pageSize,
      })

      utils.stores.list.setData(
        {
          organizationId,
          search: debouncedSearch || undefined,
          page,
          pageSize,
        },
        (old) => {
          if (!old) return old
          return {
            ...old,
            stores: old.stores.filter((store) => !storeIds.includes(store.id)),
            total: old.total - storeIds.length,
          }
        }
      )

      return { previousData }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousData) {
        utils.stores.list.setData(
          {
            organizationId,
            search: debouncedSearch || undefined,
            page,
            pageSize,
          },
          context.previousData
        )
      }
      toast.error('Failed to delete stores')
    },
    onSuccess: (result) => {
      toast.success(`${result.count} store(s) deleted`)
    },
    onSettled: () => {
      utils.stores.list.invalidate()
    },
  })

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleEdit = useCallback((store: {
    id: string
    name: string
    description?: string | null
    imageUrl?: string | null
  }) => {
    setEditingStore(store)
    setDialogOpen(true)
  }, [])

  const handleBulkDelete = useCallback((ids: string[]) => {
    bulkDeleteMutation.mutate({
      organizationId,
      storeIds: ids,
    })
  }, [bulkDeleteMutation, organizationId])

  const handlePageSizeChange = useCallback((newSize: number) => {
    setPageSize(newSize)
    setPage(1)
  }, [])

  const handleSubmit = useCallback((data: {
    name: string
    description?: string | null
    imageUrl?: string | null
  }) => {
    if (editingStore) {
      updateStoreMutation.mutate({
        organizationId,
        storeId: editingStore.id,
        ...data,
      })
    } else {
      createStoreMutation.mutate({
        organizationId,
        ...data,
      })
    }
  }, [editingStore, createStoreMutation, updateStoreMutation, organizationId])

  // ==========================================================================
  // RENDER
  // ==========================================================================

  // Error state
  if (isError) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="text-sm text-destructive">
          Failed to load stores. Please try again.
        </div>
      </div>
    )
  }

  return (
    <>
      <StoresTable
        stores={data?.stores || []}
        totalStores={data?.total || 0}
        searchQuery={searchInput}
        onSearchChange={setSearchInput}
        currentPage={page}
        totalPages={data?.totalPages || 1}
        onPageChange={setPage}
        pageSize={pageSize}
        onPageSizeChange={handlePageSizeChange}
        onEdit={canUpdate ? handleEdit : undefined}
        onBulkDelete={canDelete ? handleBulkDelete : undefined}
        isDeleting={bulkDeleteMutation.isPending}
        isLoading={isLoading}
        canDelete={canDelete}
      />

      {/* Create/Edit Dialog */}
      <StoreDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditingStore(null)
        }}
        store={editingStore}
        onSubmit={handleSubmit}
        isSubmitting={createStoreMutation.isPending || updateStoreMutation.isPending}
      />
    </>
  )
}
