/**
 * Custom Data Tab Component - Active Organization Pattern
 *
 * WHY: Main container for custom data management with file explorer layout
 * HOW: Split view - data sets sidebar (1/4) + fields table (3/4)
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based access control via hasPermission helper
 * - Left sidebar shows data sets as folders
 * - Right content shows fields table for selected data set
 * - Uses tRPC for data fetching
 * - Uses URL params for all state (shareable links)
 * - Search synced to URL with debounce to avoid performance issues
 *
 * PERMISSIONS:
 * - custom-fields:read - Required to view this page
 *
 * Search Keywords: SOURCE OF TRUTH, CUSTOM DATA TAB, ActiveOrganization
 */

'use client'

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CategoriesSidebar } from './categories-sidebar'
import { FieldsTable } from './fields-table'
import type { CustomField } from './fields-table'
import { CategoryDialog } from './category-dialog'
import { FieldDialog } from './field-dialog'
import { trpc } from '@/trpc/react-provider'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
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

/**
 * Category interface for data sets
 * Represents a grouping of custom fields
 */
interface Category {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  order: number
  fieldsCount: number
}

/**
 * Loading skeleton for the Custom Data page
 * Matches the layout structure for smooth loading experience
 */
function CustomDataSkeleton() {
  return (
    <>
      {/* Page Header Skeleton */}
      <div className="mb-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96 mt-2" />
      </div>

      <div className="flex h-[calc(100vh-16rem)] gap-4">
        {/* Sidebar Skeleton - 1/4 width */}
        <div className="w-1/4 min-w-[240px] space-y-2">
          <Skeleton className="h-10 w-full" />
          <div className="space-y-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>

        {/* Table Skeleton - 3/4 width */}
        <div className="flex-1 space-y-4">
          <div className="flex justify-between">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-10 w-32" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

export function CustomDataTab() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  /**
   * Get active organization from the hook
   * This respects domain-first approach and session activeOrganizationId
   */
  const { activeOrganization, isLoading: isLoadingOrg, hasPermission } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''

  /**
   * Check permission using hook's hasPermission helper
   * Owners have full access, members need explicit permission
   */
  const hasAccess = hasPermission(permissions.CUSTOM_FIELDS_READ)

  // Get search from URL, use local state for immediate UI updates
  const urlSearch = searchParams.get('search') || ''
  const [searchQuery, setSearchQuery] = useState(urlSearch)

  // Sync local state when URL changes (e.g., back/forward navigation)
  useEffect(() => {
    setSearchQuery(urlSearch)
  }, [urlSearch])

  // Get selection state from URL params
  const selectedDataSetId = searchParams.get('dataSetId')
  const editFieldId = searchParams.get('fieldId')

  // Data set dialog state
  const dataSetDialogOpen = searchParams.get('dataSetDialog') === 'true'
  const editingDataSetId = searchParams.get('editDataSetId')


  // Field dialog state
  const fieldDialogOpen = searchParams.get('fieldDialog') === 'true'

  // Delete field dialog state
  const deleteFieldDialogOpen =
    searchParams.get('deleteFieldDialog') === 'true'
  const deleteFieldId = searchParams.get('deleteFieldId')

  const utils = trpc.useUtils()

  /**
   * Helper to update URL params (non-debounced, for immediate updates)
   * Updates search params and replaces URL without scrolling
   */
  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === '') {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      })
      router.replace(`/custom-data?${params.toString()}`, { scroll: false })
    },
    [searchParams, router]
  )

  /**
   * Debounced search URL update
   * Updates local state immediately for responsive UI
   * Debounces URL update to prevent excessive history entries
   */
  const handleSearchChange = useCallback(
    (query: string) => {
      // Update local state immediately for responsive UI
      setSearchQuery(query)

      // Clear existing debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }

      // Debounce URL update
      debounceRef.current = setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString())
        if (query) {
          params.set('search', query)
        } else {
          params.delete('search')
        }
        router.replace(`/custom-data?${params.toString()}`, { scroll: false })
      }, 300)
    },
    [searchParams, router]
  )

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  /**
   * Fetch categories (data sets) - using type assertion to avoid deep type instantiation
   * Only fetches when organizationId is available
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: categories, isLoading: categoriesLoading } = (
    trpc.customData.listCategories as any
  ).useQuery({ organizationId }, { enabled: !!organizationId }) as {
    data: Category[] | undefined
    isLoading: boolean
  }

  /**
   * Fetch fields for selected data set - using type assertion to avoid deep type instantiation
   * Only fetches when both organizationId and selectedDataSetId are available
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: fields, isLoading: fieldsLoading } = (
    trpc.customData.listFields as any
  ).useQuery(
    {
      organizationId,
      categoryId: selectedDataSetId!,
    },
    {
      enabled: !!organizationId && !!selectedDataSetId,
    }
  ) as { data: CustomField[] | undefined; isLoading: boolean }

  /**
   * Client-side filtering based on search query
   * Filters by label, slug, or field type
   */
  const filteredFields = useMemo(() => {
    if (!fields) return []
    if (!searchQuery.trim()) return fields

    const query = searchQuery.toLowerCase()
    return fields.filter(
      (field) =>
        field.label.toLowerCase().includes(query) ||
        field.slug.toLowerCase().includes(query) ||
        field.fieldType.toLowerCase().includes(query)
    )
  }, [fields, searchQuery])

  // Get editing data set from categories
  const editingDataSet = editingDataSetId
    ? categories?.find((c) => c.id === editingDataSetId) || null
    : null

  // Get editing field from fields
  const editingField = editFieldId
    ? fields?.find((f) => f.id === editFieldId) || null
    : null

  // Get field to delete
  const fieldToDelete = deleteFieldId
    ? fields?.find((f) => f.id === deleteFieldId) || null
    : null

  /**
   * Delete field mutation
   * Invalidates queries to refresh data after successful deletion
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deleteFieldMutation = (trpc.customData.deleteField as any).useMutation({
    onSuccess: () => {
      toast.success('Field deleted')
      updateParams({ deleteFieldDialog: null, deleteFieldId: null })
      // Invalidate queries to refresh data
      if (selectedDataSetId) {
        utils.customData.listFields.invalidate({
          organizationId,
          categoryId: selectedDataSetId,
        })
      }
      utils.customData.listCategories.invalidate({ organizationId })
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete field')
    },
  })

  // ============================================================================
  // Data Set Handlers
  // ============================================================================

  const handleSelectDataSet = (id: string) => {
    // Clear search and debounce when switching data sets
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    setSearchQuery('')
    updateParams({ dataSetId: id, fieldId: null, search: null })
  }

  const handleAddDataSet = () => {
    updateParams({ dataSetDialog: 'true', editDataSetId: null })
  }

  const handleEditDataSet = (dataSet: Category) => {
    updateParams({ dataSetDialog: 'true', editDataSetId: dataSet.id })
  }

  const handleCloseDataSetDialog = (open: boolean) => {
    if (!open) {
      updateParams({ dataSetDialog: null, editDataSetId: null })
    }
  }

  // ============================================================================
  // Field Handlers
  // ============================================================================

  const handleAddField = () => {
    updateParams({ fieldDialog: 'true', fieldId: null })
  }

  const handleEditField = (field: CustomField) => {
    updateParams({ fieldDialog: 'true', fieldId: field.id })
  }

  const handleCloseFieldDialog = (open: boolean) => {
    if (!open) {
      updateParams({ fieldDialog: null, fieldId: null })
    }
  }

  const handleDeleteField = (field: CustomField) => {
    updateParams({ deleteFieldDialog: 'true', deleteFieldId: field.id })
  }

  const handleCloseDeleteDialog = (open: boolean) => {
    if (!open) {
      updateParams({ deleteFieldDialog: null, deleteFieldId: null })
    }
  }

  const confirmDeleteField = () => {
    if (deleteFieldId) {
      deleteFieldMutation.mutate({
        organizationId,
        fieldId: deleteFieldId,
      })
    }
  }

  const handleBulkDelete = (ids: string[]) => {
    // TODO: Implement bulk delete mutation
  }

  // ============================================================================
  // Early Returns for Loading, No Org, and No Access States
  // ============================================================================

  /**
   * Show skeleton only on initial load when there's no cached data
   * Re-navigation will have cached data and skip this
   */
  if (isLoadingOrg && !activeOrganization) {
    return <CustomDataSkeleton />
  }

  /**
   * Show error state if no organization is found
   * This shouldn't happen in normal flow but handles edge cases
   */
  if (!activeOrganization) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">
          No organization found. Please contact your administrator.
        </p>
      </div>
    )
  }

  /**
   * Show permission denied if user doesn't have access
   * Owners always have access, members need custom-fields:read permission
   */
  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="max-w-md text-center space-y-2">
          <p className="text-sm text-destructive font-medium">
            You don&apos;t have permission to view this page
          </p>
          <p className="text-xs text-muted-foreground">
            Contact your organization owner to grant you the required
            permission.
          </p>
        </div>
      </div>
    )
  }

  // ============================================================================
  // Main Render
  // ============================================================================

  return (
    <>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Custom Data</h1>
        <p className="text-muted-foreground mt-1">
          Create custom data sets with fields to capture additional information
          about your leads. Custom data will be visibile on the lead details
          menu.
        </p>
      </div>

      <div className="flex h-[calc(100vh-16rem)] gap-4">
        {/* Data Sets Sidebar - 1/4 width */}
        <div className="w-1/4 min-w-[240px]">
          <CategoriesSidebar
            dataSets={categories || []}
            selectedDataSetId={selectedDataSetId}
            onSelectDataSet={handleSelectDataSet}
            isLoading={categoriesLoading}
            organizationId={organizationId}
            onAddDataSet={handleAddDataSet}
            onEditDataSet={handleEditDataSet}
          />
        </div>

        {/* Fields Table - 3/4 width */}
        <div className="flex-1">
          <FieldsTable
            fields={filteredFields}
            totalFields={filteredFields.length}
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            currentPage={1}
            totalPages={1}
            onPageChange={() => {}}
            pageSize={20}
            onPageSizeChange={() => {}}
            onBulkDelete={handleBulkDelete}
            isLoading={fieldsLoading}
            selectedDataSetId={selectedDataSetId}
            onAddField={handleAddField}
            onEditField={handleEditField}
            onDeleteField={handleDeleteField}
          />
        </div>
      </div>

      {/* Data Set Dialog */}
      <CategoryDialog
        open={dataSetDialogOpen}
        onOpenChange={handleCloseDataSetDialog}
        organizationId={organizationId}
        dataSet={editingDataSet}
      />

      {/* Field Dialog */}
      {selectedDataSetId && (
        <FieldDialog
          open={fieldDialogOpen}
          onOpenChange={handleCloseFieldDialog}
          organizationId={organizationId}
          categoryId={selectedDataSetId}
          field={editingField}
        />
      )}

      {/* Delete Field Confirmation Dialog */}
      <AlertDialog
        open={deleteFieldDialogOpen}
        onOpenChange={handleCloseDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Field</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{fieldToDelete?.label}
              &quot;? Any data collected using this field will be preserved, but
              the field will no longer be visible. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteField}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteFieldMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  )
}
