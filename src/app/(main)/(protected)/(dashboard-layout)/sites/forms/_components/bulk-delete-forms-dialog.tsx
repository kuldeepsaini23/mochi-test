/**
 * Bulk Delete Forms Dialog Component
 *
 * WHY: Confirm bulk deletion of multiple forms
 * HOW: Shows count and list of forms to be deleted
 */

'use client'

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
import { ScrollArea } from '@/components/ui/scroll-area'
import type { FormWithMetadata } from './forms-table'

interface BulkDeleteFormsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  forms: FormWithMetadata[]
  onConfirm: (ids: string[]) => void
  isDeleting: boolean
}

export function BulkDeleteFormsDialog({
  open,
  onOpenChange,
  forms,
  onConfirm,
  isDeleting,
}: BulkDeleteFormsDialogProps) {
  const handleConfirm = () => {
    onConfirm(forms.map((f) => f.id))
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {forms.length} Forms</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. The following forms and all their
            submissions will be permanently deleted:
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* List of forms to delete */}
        <ScrollArea className="max-h-[200px] rounded-md border p-3">
          <ul className="space-y-1">
            {forms.map((form) => (
              <li key={form.id} className="text-sm">
                <span className="font-medium">{form.name}</span>
                <span className="text-muted-foreground ml-2">
                  ({form._count.submissions} submissions)
                </span>
              </li>
            ))}
          </ul>
        </ScrollArea>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? 'Deleting...' : `Delete ${forms.length} Forms`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
