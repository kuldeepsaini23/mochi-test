/**
 * Bulk Delete Automations Dialog
 *
 * WHY: Confirmation dialog for deleting multiple automations at once
 * HOW: Shows list of automations to be deleted with warning message
 *
 * Pattern matches bulk-delete-forms-dialog.tsx for consistency.
 *
 * SOURCE OF TRUTH: BulkDeleteAutomationsDialog
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
import type { AutomationListItem } from './automations-table'

interface BulkDeleteAutomationsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  automations: AutomationListItem[]
  onConfirm: (ids: string[]) => void
  isDeleting: boolean
}

export function BulkDeleteAutomationsDialog({
  open,
  onOpenChange,
  automations,
  onConfirm,
  isDeleting,
}: BulkDeleteAutomationsDialogProps) {
  /**
   * Handle confirm button click.
   * Extracts IDs from automations and calls onConfirm.
   */
  const handleConfirm = () => {
    onConfirm(automations.map((a) => a.id))
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {automations.length} Automations</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. The following automations and all their
            run history will be permanently deleted:
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* List of automations to delete */}
        <ScrollArea className="max-h-[200px] rounded-md border p-3">
          <ul className="space-y-1">
            {automations.map((automation) => (
              <li key={automation.id} className="text-sm">
                <span className="font-medium">{automation.name}</span>
                <span className="text-muted-foreground ml-2">
                  ({automation.totalRuns} runs)
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
            {isDeleting ? 'Deleting...' : `Delete ${automations.length} Automations`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
