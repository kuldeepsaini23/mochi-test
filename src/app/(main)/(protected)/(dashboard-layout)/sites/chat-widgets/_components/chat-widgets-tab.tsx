'use client'

/**
 * Chat Widgets Tab Component
 *
 * WHY: Main container for chat widget list with search, pagination, and mutations
 * HOW: Uses tRPC with optimistic updates for snappy UX
 *
 * Features:
 * - Search with debounce
 * - Pagination
 * - Optimistic updates for create/update/delete
 * - Loading inactive state during data fetch
 *
 * SOURCE OF TRUTH: ChatWidget, Organization
 */

import { useState, useEffect, useCallback } from 'react'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { ChatWidgetsGrid } from './chat-widgets-grid'
import { ChatWidgetDialog } from './chat-widget-dialog'

// ============================================================================
// TYPES
// ============================================================================

interface ChatWidgetsTabProps {
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

export function ChatWidgetsTab({
  organizationId,
  onRegisterOpenDialog,
  canCreate,
  canUpdate,
  canDelete,
}: ChatWidgetsTabProps) {
  const utils = trpc.useUtils()

  // Search state with debounce
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounce(searchInput, 300)

  // Pagination state
  const [page, setPage] = useState(1)
  const [pageSize] = useState(8)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingWidget, setEditingWidget] = useState<{
    id: string
    name: string
    description?: string | null
  } | null>(null)
  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  // Register the open dialog function with parent
  useEffect(() => {
    onRegisterOpenDialog?.(() => {
      setEditingWidget(null)
      setDialogOpen(true)
    })
  }, [onRegisterOpenDialog])

  // ==========================================================================
  // DATA FETCHING
  // ==========================================================================

  const { data, isLoading, isError } = trpc.chatWidgets.list.useQuery({
    organizationId,
    search: debouncedSearch || undefined,
    page,
    pageSize,
  })

  // ==========================================================================
  // MUTATIONS
  // ==========================================================================

  /**
   * Create chat widget mutation with optimistic updates
   */
  const createMutation = trpc.chatWidgets.create.useMutation({
    onMutate: async (newWidget) => {
      // Cancel outgoing refetches
      await utils.chatWidgets.list.cancel()

      // Snapshot previous values
      const previousData = utils.chatWidgets.list.getData({
        organizationId,
        search: debouncedSearch || undefined,
        page,
        pageSize,
      })

      // Optimistically add to list
      // Use ISO strings to match tRPC response format
      // Include all fields from tRPC response type for type compatibility
      const now = new Date().toISOString()
      const optimisticWidget = {
        id: `temp-${Date.now()}`,
        organizationId,
        name: newWidget.name,
        description: newWidget.description || null,
        createdAt: now,
        updatedAt: now,
        config: null,
        allowedDomains: null,
      }

      utils.chatWidgets.list.setData(
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
            chatWidgets: [optimisticWidget, ...old.chatWidgets].slice(
              0,
              pageSize
            ),
            total: old.total + 1,
          }
        }
      )

      return { previousData }
    },
    onError: (err, _newWidget, context) => {
      // Rollback on error
      if (context?.previousData) {
        utils.chatWidgets.list.setData(
          {
            organizationId,
            search: debouncedSearch || undefined,
            page,
            pageSize,
          },
          context.previousData
        )
      }

      /**
       * Server-side feature limit errors are caught here as a fallback.
       * The parent already wraps the create button with <FeatureGate> for
       * client-side pre-checks, so this only fires if the gate was bypassed.
       */
      toast.error('Failed to create chat widget')
    },
    onSuccess: () => {
      toast.success('Chat widget created')
      setDialogOpen(false)
    },
    onSettled: () => {
      utils.chatWidgets.list.invalidate()
    },
  })

  /**
   * Update chat widget mutation with optimistic updates
   */
  const updateMutation = trpc.chatWidgets.update.useMutation({
    onMutate: async (updatedWidget) => {
      await utils.chatWidgets.list.cancel()

      const previousData = utils.chatWidgets.list.getData({
        organizationId,
        search: debouncedSearch || undefined,
        page,
        pageSize,
      })

      utils.chatWidgets.list.setData(
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
            chatWidgets: old.chatWidgets.map((widget) =>
              widget.id === updatedWidget.chatWidgetId
                ? {
                    ...widget,
                    name: updatedWidget.name ?? widget.name,
                    description: updatedWidget.description ?? widget.description,
                    updatedAt: new Date().toISOString(),
                  }
                : widget
            ),
          }
        }
      )

      return { previousData }
    },
    onError: (_err, _updatedWidget, context) => {
      if (context?.previousData) {
        utils.chatWidgets.list.setData(
          {
            organizationId,
            search: debouncedSearch || undefined,
            page,
            pageSize,
          },
          context.previousData
        )
      }
      toast.error('Failed to update chat widget')
    },
    onSuccess: () => {
      toast.success('Chat widget updated')
      setDialogOpen(false)
      setEditingWidget(null)
    },
    onSettled: () => {
      utils.chatWidgets.list.invalidate()
    },
  })

  /**
   * Delete chat widget mutation with optimistic updates
   */
  const deleteMutation = trpc.chatWidgets.delete.useMutation({
    onMutate: async ({ chatWidgetId }) => {
      await utils.chatWidgets.list.cancel()

      const previousData = utils.chatWidgets.list.getData({
        organizationId,
        search: debouncedSearch || undefined,
        page,
        pageSize,
      })

      utils.chatWidgets.list.setData(
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
            chatWidgets: old.chatWidgets.filter(
              (widget) => widget.id !== chatWidgetId
            ),
            total: old.total - 1,
          }
        }
      )

      return { previousData }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousData) {
        utils.chatWidgets.list.setData(
          {
            organizationId,
            search: debouncedSearch || undefined,
            page,
            pageSize,
          },
          context.previousData
        )
      }
      toast.error('Failed to delete chat widget')
    },
    onSuccess: () => {
      toast.success('Chat widget deleted')
    },
    onSettled: () => {
      utils.chatWidgets.list.invalidate()
    },
  })

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleEdit = useCallback(
    (widget: { id: string; name: string; description?: string | null }) => {
      setEditingWidget(widget)
      setDialogOpen(true)
    },
    []
  )

  const handleDelete = useCallback(
    (id: string) => {
      deleteMutation.mutate({
        organizationId,
        chatWidgetId: id,
      })
    },
    [deleteMutation, organizationId]
  )

  const handleSubmit = useCallback(
    (data: { name: string; description?: string | null }) => {
      if (editingWidget) {
        updateMutation.mutate({
          organizationId,
          chatWidgetId: editingWidget.id,
          ...data,
        })
      } else {
        createMutation.mutate({
          organizationId,
          ...data,
        })
      }
    },
    [editingWidget, createMutation, updateMutation, organizationId]
  )

  // ==========================================================================
  // RENDER
  // ==========================================================================

  // Error state
  if (isError) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="text-sm text-destructive">
          Failed to load chat widgets. Please try again.
        </div>
      </div>
    )
  }

  return (
    <>
      <ChatWidgetsGrid
        widgets={data?.chatWidgets || []}
        totalWidgets={data?.total || 0}
        searchQuery={searchInput}
        onSearchChange={setSearchInput}
        currentPage={page}
        totalPages={data?.totalPages || 1}
        onPageChange={setPage}
        onEdit={canUpdate ? handleEdit : undefined}
        onDelete={canDelete ? handleDelete : undefined}
        isLoading={isLoading}
      />

      <ChatWidgetDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditingWidget(null)
        }}
        widget={editingWidget}
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />
    </>
  )
}
