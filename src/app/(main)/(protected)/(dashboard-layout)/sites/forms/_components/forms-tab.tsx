/**
 * Forms Tab Component
 *
 * WHY: Main container for form management with table layout and folder navigation
 * HOW: Uses FormsTable for listing, navigates to builder for editing
 *
 * ARCHITECTURE:
 * - Server-side pagination with search
 * - Table-based design with bulk operations
 * - Folder navigation with breadcrumb support
 * - Full CRUD with optimistic updates
 * - Header buttons are controlled by parent via callback registration
 *
 * PERMISSIONS:
 * - canCreate: Enable "Add Form" functionality (button rendered by parent)
 * - canUpdate: Navigate to builder for editing
 * - canDelete: Show delete buttons and bulk delete
 */

'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useDebounce } from '@/hooks/use-debounce'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { FormsTable, type FormWithMetadata } from './forms-table'
import type { FormStatus } from '@/generated/prisma'
import { FormDialog } from './form-dialog'
import { DeleteFormDialog } from './delete-form-dialog'
import { BulkDeleteFormsDialog } from './bulk-delete-forms-dialog'
import { FolderDialog } from './folder-dialog'
import { FolderBreadcrumb } from './folder-breadcrumb'
import { FolderGrid } from './folder-grid'
import { permissions } from '@/lib/better-auth/permissions'

interface FormsTabProps {
  organizationId: string
  userRole: string
  userPermissions: string[]
  /** Callback to register form dialog opener with parent */
  onRegisterOpenFormDialog?: (fn: () => void) => void
  /** Callback to register folder dialog opener with parent */
  onRegisterOpenFolderDialog?: (fn: () => void) => void
}

export function FormsTab({
  organizationId,
  userRole,
  userPermissions,
  onRegisterOpenFormDialog,
  onRegisterOpenFolderDialog,
}: FormsTabProps) {
  const router = useRouter()
  const utils = trpc.useUtils()

  // Compute permissions
  const canCreate = useMemo(
    () =>
      userRole === 'owner' ||
      userPermissions.includes(permissions.FORMS_CREATE),
    [userRole, userPermissions]
  )
  const canUpdate = useMemo(
    () =>
      userRole === 'owner' ||
      userPermissions.includes(permissions.FORMS_UPDATE),
    [userRole, userPermissions]
  )
  const canDelete = useMemo(
    () =>
      userRole === 'owner' ||
      userPermissions.includes(permissions.FORMS_DELETE),
    [userRole, userPermissions]
  )

  // Current folder state (null = root level)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)

  // Search state
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  // Pagination state
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Dialog states
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [formToDelete, setFormToDelete] = useState<FormWithMetadata | null>(null)
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false)
  const [formsToBulkDelete, setFormsToBulkDelete] = useState<FormWithMetadata[]>([])

  // Reset page when search changes
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  // Query forms with pagination
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading, isFetching } = (trpc.forms.list as any).useQuery(
    {
      organizationId,
      folderId: currentFolderId,
      search: debouncedSearch || undefined,
      page,
      pageSize,
    },
    {
      enabled: !!organizationId,
      placeholderData: (previousData: unknown) => previousData,
    }
  )

  // Query folders for current level
  const { data: folders } = trpc.forms.listFolders.useQuery(
    {
      organizationId,
      parentId: currentFolderId,
    },
    {
      enabled: !!organizationId,
    }
  )

  // Query breadcrumb when in a folder
  const { data: breadcrumb } = trpc.forms.getFolderBreadcrumb.useQuery(
    {
      organizationId,
      folderId: currentFolderId!,
    },
    {
      enabled: !!currentFolderId,
    }
  )

  // Memoize forms data with explicit type to avoid implicit any
  const forms = useMemo(
    () => (data?.forms ?? []) as FormWithMetadata[],
    [data?.forms]
  )
  const totalPages = data?.totalPages ?? 1
  const total = data?.total ?? 0

  // Bulk delete mutation with optimistic update
  // NOTE: Feature gates cache is auto-invalidated by global mutation observer
  // Note: Using type assertion on utils.forms.list to avoid Prisma's deep type recursion
  const bulkDeleteMutation = trpc.forms.bulkDelete.useMutation({
    onMutate: async ({ formIds }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formsListUtils = utils.forms.list as any
      await formsListUtils.cancel()

      const queryKey = {
        organizationId,
        folderId: currentFolderId,
        search: debouncedSearch || undefined,
        page,
        pageSize,
      }
      const previousData = formsListUtils.getData(queryKey)

      formsListUtils.setData(queryKey, (old: { forms: FormWithMetadata[]; total: number } | undefined) => {
        if (!old) return old
        return {
          ...old,
          forms: old.forms.filter((f: FormWithMetadata) => !formIds.includes(f.id)),
          total: old.total - formIds.length,
        }
      })

      return { previousData }
    },
    onError: (err, _input, context) => {
      if (context?.previousData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(utils.forms.list as any).setData(
          {
            organizationId,
            folderId: currentFolderId,
            search: debouncedSearch || undefined,
            page,
            pageSize,
          },
          context.previousData
        )
      }
      toast.error(err.message || 'Failed to delete forms')
    },
    onSuccess: (result) => {
      toast.success(
        `${result.count} form${result.count > 1 ? 's' : ''} deleted`
      )
      setSelectedIds([])
    },
    onSettled: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(utils.forms.list as any).invalidate()
      // NOTE: Feature gates cache is auto-invalidated by global mutation observer
    },
  })

  // Delete single form mutation with optimistic update
  // NOTE: Feature gates cache is auto-invalidated by global mutation observer
  // Note: Using type assertion on utils.forms.list to avoid Prisma's deep type recursion
  const deleteMutation = trpc.forms.delete.useMutation({
    onMutate: async ({ formId }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formsListUtils = utils.forms.list as any
      await formsListUtils.cancel()

      const queryKey = {
        organizationId,
        folderId: currentFolderId,
        search: debouncedSearch || undefined,
        page,
        pageSize,
      }
      const previousData = formsListUtils.getData(queryKey)

      formsListUtils.setData(queryKey, (old: { forms: FormWithMetadata[]; total: number } | undefined) => {
        if (!old) return old
        return {
          ...old,
          forms: old.forms.filter((f: FormWithMetadata) => f.id !== formId),
          total: old.total - 1,
        }
      })

      return { previousData }
    },
    onError: (err, _input, context) => {
      if (context?.previousData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(utils.forms.list as any).setData(
          {
            organizationId,
            folderId: currentFolderId,
            search: debouncedSearch || undefined,
            page,
            pageSize,
          },
          context.previousData
        )
      }
      toast.error(err.message || 'Failed to delete form')
    },
    onSuccess: () => {
      toast.success('Form deleted')
    },
    onSettled: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(utils.forms.list as any).invalidate()
    },
  })

  // Delete folder mutation
  const deleteFolderMutation = trpc.forms.deleteFolder.useMutation({
    onSuccess: () => {
      toast.success('Folder deleted')
      utils.forms.listFolders.invalidate()
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to delete folder')
    },
  })

  // Publish/unpublish form mutation with optimistic update
  // Note: Using type assertion to avoid Prisma's deep type recursion
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const publishMutation = (trpc.forms.update as any).useMutation({
    onMutate: async ({ formId, status }: { formId: string; status: FormStatus }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formsListUtils = utils.forms.list as any
      await formsListUtils.cancel()

      const queryKey = {
        organizationId,
        folderId: currentFolderId,
        search: debouncedSearch || undefined,
        page,
        pageSize,
      }
      const previousData = formsListUtils.getData(queryKey)

      // Optimistically update the form status
      formsListUtils.setData(queryKey, (old: { forms: FormWithMetadata[]; total: number } | undefined) => {
        if (!old) return old
        return {
          ...old,
          forms: old.forms.map((f: FormWithMetadata) =>
            f.id === formId ? { ...f, status: status as FormStatus } : f
          ),
        }
      })

      return { previousData }
    },
    onError: (
      err: { message?: string },
      _input: unknown,
      context: { previousData?: unknown } | undefined
    ) => {
      if (context?.previousData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(utils.forms.list as any).setData(
          {
            organizationId,
            folderId: currentFolderId,
            search: debouncedSearch || undefined,
            page,
            pageSize,
          },
          context.previousData
        )
      }
      toast.error(err.message || 'Failed to update form status')
    },
    onSuccess: (_: unknown, variables: { status?: FormStatus }) => {
      const isPublishing = variables.status === 'PUBLISHED'
      toast.success(isPublishing ? 'Form published' : 'Form unpublished', {
        description: isPublishing
          ? 'Your form is now live and accepting submissions.'
          : 'Your form is now private.',
      })
    },
    onSettled: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(utils.forms.list as any).invalidate()
    },
  })

  // Handlers
  const handleSearch = useCallback((value: string) => {
    setSearch(value)
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

  /**
   * Navigate to form builder using form slug
   */
  const handleFormClick = useCallback(
    (form: FormWithMetadata) => {
      router.push(`/forms/${form.slug}/edit`)
    },
    [router]
  )

  /**
   * Navigate to the submissions page for a specific form.
   * Uses slug-based URL under /sites/forms/ to stay in the dashboard layout.
   */
  const handleViewSubmissions = useCallback(
    (slug: string) => {
      router.push(`/sites/forms/${slug}/submissions`)
    },
    [router]
  )

  // Folder navigation
  const handleFolderClick = useCallback((folderId: string) => {
    setCurrentFolderId(folderId)
    setPage(1)
    setSelectedIds([])
  }, [])

  const handleNavigateToRoot = useCallback(() => {
    setCurrentFolderId(null)
    setPage(1)
    setSelectedIds([])
  }, [])

  const handleBreadcrumbClick = useCallback((folderId: string | null) => {
    setCurrentFolderId(folderId)
    setPage(1)
    setSelectedIds([])
  }, [])

  // Open bulk delete confirmation dialog
  const handleRequestBulkDelete = useCallback(
    (ids: string[]) => {
      const selectedForms = forms.filter((f) => ids.includes(f.id))
      setFormsToBulkDelete(selectedForms)
      setBulkDeleteDialogOpen(true)
    },
    [forms]
  )

  // Confirm bulk delete
  const handleConfirmBulkDelete = useCallback(
    (ids: string[]) => {
      bulkDeleteMutation.mutate(
        {
          organizationId,
          formIds: ids,
        },
        {
          onSuccess: () => {
            setBulkDeleteDialogOpen(false)
            setFormsToBulkDelete([])
            setSelectedIds([])
          },
        }
      )
    },
    [bulkDeleteMutation, organizationId]
  )

  // Open single delete confirmation dialog
  const handleRequestDelete = useCallback(
    (id: string) => {
      const form = forms.find((f) => f.id === id)
      if (form) {
        setFormToDelete(form)
        setDeleteDialogOpen(true)
      }
    },
    [forms]
  )

  // Confirm single delete
  const handleConfirmDelete = useCallback(
    (id: string) => {
      deleteMutation.mutate(
        {
          organizationId,
          formId: id,
        },
        {
          onSuccess: () => {
            setDeleteDialogOpen(false)
            setFormToDelete(null)
          },
        }
      )
    },
    [deleteMutation, organizationId]
  )

  // Delete folder
  const handleDeleteFolder = useCallback(
    (folderId: string) => {
      deleteFolderMutation.mutate({
        organizationId,
        folderId,
      })
    },
    [deleteFolderMutation, organizationId]
  )

  // Publish/unpublish form
  const handlePublish = useCallback(
    (formId: string, status: FormStatus) => {
      publishMutation.mutate({
        organizationId,
        formId,
        status,
      })
    },
    [publishMutation, organizationId]
  )

  const handleAddForm = useCallback(() => {
    setFormDialogOpen(true)
  }, [])

  const handleAddFolder = useCallback(() => {
    setFolderDialogOpen(true)
  }, [])

  // Register dialog openers with parent component
  useEffect(() => {
    if (onRegisterOpenFormDialog && canCreate) {
      onRegisterOpenFormDialog(handleAddForm)
    }
  }, [onRegisterOpenFormDialog, canCreate, handleAddForm])

  useEffect(() => {
    if (onRegisterOpenFolderDialog && canCreate) {
      onRegisterOpenFolderDialog(handleAddFolder)
    }
  }, [onRegisterOpenFolderDialog, canCreate, handleAddFolder])

  return (
    <>
      {/* Folder Breadcrumb Navigation */}
      <FolderBreadcrumb
        breadcrumb={breadcrumb ?? []}
        onNavigateToRoot={handleNavigateToRoot}
        onBreadcrumbClick={handleBreadcrumbClick}
        currentFolderId={currentFolderId}
      />

      {/* Folder Grid (only show when in a folder or at root with folders) */}
      {(folders && folders.length > 0) && (
        <FolderGrid
          folders={folders}
          onFolderClick={handleFolderClick}
          onDeleteFolder={canDelete ? handleDeleteFolder : undefined}
        />
      )}

      {/* Forms Table */}
      <FormsTable
        forms={forms}
        isLoading={isLoading}
        isFetching={isFetching}
        search={search}
        onSearchChange={handleSearch}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        total={total}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        selectedIds={selectedIds}
        onSelectionChange={handleSelectionChange}
        onFormClick={handleFormClick}
        onBulkDelete={canDelete ? handleRequestBulkDelete : undefined}
        onDelete={canDelete ? handleRequestDelete : undefined}
        onPublish={canUpdate ? handlePublish : undefined}
        onViewSubmissions={handleViewSubmissions}
        isBulkDeleting={bulkDeleteMutation.isPending}
        canDelete={canDelete}
        canPublish={canUpdate}
      />

      {/* Add Form Dialog */}
      {canCreate && (
        <FormDialog
          open={formDialogOpen}
          onOpenChange={setFormDialogOpen}
          organizationId={organizationId}
          folderId={currentFolderId}
        />
      )}

      {/* Add Folder Dialog */}
      {canCreate && (
        <FolderDialog
          open={folderDialogOpen}
          onOpenChange={setFolderDialogOpen}
          organizationId={organizationId}
          parentId={currentFolderId}
        />
      )}

      {/* Single Delete Confirmation Dialog */}
      <DeleteFormDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) setFormToDelete(null)
        }}
        form={formToDelete}
        onConfirm={handleConfirmDelete}
        isDeleting={deleteMutation.isPending}
      />

      {/* Bulk Delete Confirmation Dialog */}
      <BulkDeleteFormsDialog
        open={bulkDeleteDialogOpen}
        onOpenChange={(open) => {
          setBulkDeleteDialogOpen(open)
          if (!open) setFormsToBulkDelete([])
        }}
        forms={formsToBulkDelete}
        onConfirm={handleConfirmBulkDelete}
        isDeleting={bulkDeleteMutation.isPending}
      />
    </>
  )
}
