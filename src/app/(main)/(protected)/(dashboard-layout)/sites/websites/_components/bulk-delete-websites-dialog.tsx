/**
 * Bulk Delete Websites Confirmation Dialog
 *
 * WHY: Prevents accidental bulk deletion of websites by requiring explicit confirmation
 * HOW: User must check a confirmation checkbox acknowledging permanent deletion
 *
 * This is a DESTRUCTIVE action - all selected websites and their data will be
 * permanently deleted and cannot be recovered.
 *
 * REQUIREMENTS:
 * 1. Check the "I understand" checkbox to enable delete button
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface BulkDeleteWebsitesDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void
  /** The websites being deleted */
  websites: Array<{
    id: string
    name: string
  }>
  /** Callback when user confirms deletion */
  onConfirm: (websiteIds: string[]) => void
  /** Whether deletion is in progress */
  isDeleting?: boolean
}

export function BulkDeleteWebsitesDialog({
  open,
  onOpenChange,
  websites,
  onConfirm,
  isDeleting = false,
}: BulkDeleteWebsitesDialogProps) {
  // State for the confirmation checkbox
  const [understood, setUnderstood] = useState(false)

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setUnderstood(false)
    }
  }, [open])

  // Check if delete should be enabled
  const canDelete = understood && !isDeleting && websites.length > 0

  // Handle confirm click
  const handleConfirm = useCallback(() => {
    if (canDelete) {
      onConfirm(websites.map((w) => w.id))
    }
  }, [canDelete, websites, onConfirm])

  const count = websites.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          {/* Warning icon and title */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle className="text-xl">
              Delete {count} Website{count !== 1 ? 's' : ''}
            </DialogTitle>
          </div>
          <DialogDescription className="pt-2 text-left">
            This action <span className="font-semibold text-destructive">cannot be undone</span>.
            This will permanently delete the following websites and all their content:
          </DialogDescription>
        </DialogHeader>

        {/* List of websites to delete */}
        <div className="my-2 max-h-32 overflow-y-auto rounded-md border bg-muted/50 p-3">
          <ul className="space-y-1 text-sm">
            {websites.map((website) => (
              <li key={website.id} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                <span className="font-medium">{website.name}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* What will be deleted */}
        <p className="text-sm text-muted-foreground">
          For each website, the following will be permanently deleted:
        </p>
        <ul className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">
          <li>All pages and their content</li>
          <li>All design elements and layouts</li>
          <li>All media files and assets</li>
          <li>Publishing history and settings</li>
        </ul>

        {/* Confirmation checkbox */}
        <div className="flex items-start gap-3 rounded-md border border-destructive/20 bg-destructive/5 p-3">
          <Checkbox
            id="bulk-understood-checkbox"
            checked={understood}
            onCheckedChange={(checked) => setUnderstood(checked === true)}
            className="mt-0.5"
          />
          <Label
            htmlFor="bulk-understood-checkbox"
            className="text-sm font-normal leading-relaxed cursor-pointer"
          >
            I understand these {count} website{count !== 1 ? 's' : ''} will be{' '}
            <span className="font-semibold">permanently deleted</span> and{' '}
            <span className="font-semibold">cannot be recovered</span>.
          </Label>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={!canDelete}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete {count} Website{count !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
