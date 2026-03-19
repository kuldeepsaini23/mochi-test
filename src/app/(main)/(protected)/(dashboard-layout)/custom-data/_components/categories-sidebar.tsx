/**
 * Data Sets Sidebar Component
 *
 * WHY: Shows list of data sets as folder items for navigation
 * HOW: Clickable folder items with selection state, edit/delete on hover
 *
 * ARCHITECTURE:
 * - Each data set shows: icon, name, fields count
 * - Selected data set highlighted
 * - Edit/delete buttons appear on hover
 * - "Add Data Set" button at bottom opens dialog
 */

'use client'

import { useState } from 'react'
import { FolderIcon, PlusIcon, PencilIcon, Trash2Icon, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'

interface Category {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  order: number
  fieldsCount: number
}

// Separate component to manage dropdown open state
function DataSetItem({
  dataSet,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
}: {
  dataSet: Category
  isSelected: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: (e: React.MouseEvent) => void
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false)

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 px-3 h-10 rounded-md text-sm transition-colors cursor-pointer overflow-hidden',
        'hover:bg-accent hover:text-accent-foreground',
        isSelected && 'bg-accent text-accent-foreground font-medium'
      )}
      onClick={onSelect}
    >
      <FolderIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 min-w-0 text-left truncate">{dataSet.name}</span>

      {/* Fields count - hidden when dropdown is open or on hover */}
      <span
        className={cn(
          'text-xs text-muted-foreground shrink-0 transition-opacity',
          (dropdownOpen) && 'opacity-0',
          'group-hover:opacity-0'
        )}
      >
        {dataSet.fieldsCount}
      </span>

      {/* Action menu - visible on hover OR when dropdown is open */}
      <div
        className={cn(
          'absolute right-2 flex items-center',
          !dropdownOpen && 'opacity-0 group-hover:opacity-100',
          dropdownOpen && 'opacity-100'
        )}
      >
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={5}>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
            >
              <PencilIcon className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(e)
              }}
            >
              <Trash2Icon className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

interface DataSetsSidebarProps {
  dataSets: Category[]
  selectedDataSetId: string | null
  onSelectDataSet: (id: string) => void
  isLoading?: boolean
  organizationId: string
  onAddDataSet: () => void
  onEditDataSet: (dataSet: Category) => void
}

export function CategoriesSidebar({
  dataSets,
  selectedDataSetId,
  onSelectDataSet,
  isLoading,
  organizationId,
  onAddDataSet,
  onEditDataSet,
}: DataSetsSidebarProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [dataSetToDelete, setDataSetToDelete] = useState<Category | null>(null)

  const utils = trpc.useUtils()

  // Delete mutation
  const deleteMutation = trpc.customData.deleteCategory.useMutation({
    onMutate: async ({ categoryId }) => {
      await utils.customData.listCategories.cancel({ organizationId })

      const previousCategories = utils.customData.listCategories.getData({
        organizationId,
      })

      utils.customData.listCategories.setData({ organizationId }, (old) => {
        if (!old) return old
        return old.filter((cat) => cat.id !== categoryId)
      })

      return { previousCategories }
    },
    onError: (err, _, context) => {
      if (context?.previousCategories) {
        utils.customData.listCategories.setData(
          { organizationId },
          context.previousCategories
        )
      }
      toast.error(err.message || 'Failed to delete data set')
    },
    onSuccess: () => {
      toast.success('Data set deleted')
      setDeleteDialogOpen(false)
      setDataSetToDelete(null)
    },
    onSettled: () => {
      utils.customData.listCategories.invalidate({ organizationId })
      /* Invalidate usage cache so feature gate reflects the freed quota */
      utils.usage.getFeatureGates.invalidate()
    },
  })

  const handleDeleteClick = (dataSet: Category, e: React.MouseEvent) => {
    e.stopPropagation()
    setDataSetToDelete(dataSet)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    if (dataSetToDelete) {
      deleteMutation.mutate({
        organizationId,
        categoryId: dataSetToDelete.id,
      })
    }
  }

  if (isLoading) {
    return (
      <div className="h-full rounded-md border bg-background">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-sm">Data Sets</h2>
        </div>
        <div className="p-2 space-y-1">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 bg-muted animate-pulse rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="h-full flex flex-col rounded-md border bg-background">
        {/* Header */}
        <div className="p-4 border-b shrink-0">
          <h2 className="font-semibold text-sm">Data Sets</h2>
        </div>

        {/* Data Sets List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {dataSets.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-sm text-muted-foreground">No data sets yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Create your first data set to get started
                </p>
              </div>
            ) : (
              dataSets.map((dataSet) => (
                <DataSetItem
                  key={dataSet.id}
                  dataSet={dataSet}
                  isSelected={selectedDataSetId === dataSet.id}
                  onSelect={() => onSelectDataSet(dataSet.id)}
                  onEdit={() => onEditDataSet(dataSet)}
                  onDelete={(e) => handleDeleteClick(dataSet, e)}
                />
              ))
            )}
          </div>
        </ScrollArea>

        {/* Add Data Set Button */}
        <div className="p-2 border-t shrink-0">
          <Button variant="outline" size="sm" className="w-full" onClick={onAddDataSet}>
            <PlusIcon className="mr-2 h-4 w-4" />
            Add Data Set
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Data Set</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{dataSetToDelete?.name}&quot;? This will also
              delete all fields within this data set. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
