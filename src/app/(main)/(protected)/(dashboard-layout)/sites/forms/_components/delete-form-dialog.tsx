/**
 * Delete Form Dialog Component
 *
 * WHY: Confirm form deletion with name verification
 * HOW: User must type form name to confirm deletion
 */

'use client'

import { useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { FormWithMetadata } from './forms-table'

interface DeleteFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: FormWithMetadata | null
  onConfirm: (id: string) => void
  isDeleting: boolean
}

export function DeleteFormDialog({
  open,
  onOpenChange,
  form,
  onConfirm,
  isDeleting,
}: DeleteFormDialogProps) {
  const [confirmName, setConfirmName] = useState('')

  // Check if typed name matches
  const isConfirmed = form && confirmName === form.name

  const handleConfirm = () => {
    if (form && isConfirmed) {
      onConfirm(form.id)
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setConfirmName('')
    }
    onOpenChange(open)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Form</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <span className="block">
              This action cannot be undone. This will permanently delete the form
              <strong className="text-foreground"> {form?.name}</strong> and all
              its submissions.
            </span>
            <span className="block text-sm">
              Type <strong className="text-foreground">{form?.name}</strong> to
              confirm.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-2">
          <Label htmlFor="confirm-name" className="sr-only">
            Form name
          </Label>
          <Input
            id="confirm-name"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder="Type form name to confirm"
            className="w-full"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!isConfirmed || isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? 'Deleting...' : 'Delete Form'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
