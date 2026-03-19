/**
 * Delete Website Confirmation Dialog
 *
 * WHY: Prevents accidental deletion of websites by requiring explicit confirmation
 * HOW: User must type the website name AND check a confirmation checkbox
 *
 * This is a DESTRUCTIVE action - all website data, pages, and content will be
 * permanently deleted and cannot be recovered. We require multiple confirmations
 * to ensure the user truly intends to delete.
 *
 * REQUIREMENTS:
 * 1. Type the exact website name to enable delete button
 * 2. Check the "I understand" checkbox
 * 3. Both must be satisfied before delete is allowed
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

interface DeleteWebsiteDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void
  /** The website being deleted */
  website: {
    id: string
    name: string
  } | null
  /** Callback when user confirms deletion */
  onConfirm: (websiteId: string) => void
  /** Whether deletion is in progress */
  isDeleting?: boolean
}

export function DeleteWebsiteDialog({
  open,
  onOpenChange,
  website,
  onConfirm,
  isDeleting = false,
}: DeleteWebsiteDialogProps) {
  // State for the confirmation inputs
  const [nameInput, setNameInput] = useState('')
  const [understood, setUnderstood] = useState(false)

  // Reset state when dialog opens/closes or website changes
  useEffect(() => {
    if (open) {
      setNameInput('')
      setUnderstood(false)
    }
  }, [open, website?.id])

  // Check if delete should be enabled
  // Name must match exactly (case-sensitive) and checkbox must be checked
  const nameMatches = website ? nameInput === website.name : false
  const canDelete = nameMatches && understood && !isDeleting

  // Handle confirm click
  const handleConfirm = useCallback(() => {
    if (canDelete && website) {
      onConfirm(website.id)
    }
  }, [canDelete, website, onConfirm])

  // Handle keyboard submit
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && canDelete) {
        handleConfirm()
      }
    },
    [canDelete, handleConfirm]
  )

  if (!website) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          {/* Warning icon and title */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle className="text-xl">Delete Website</DialogTitle>
          </div>
          <DialogDescription className="pt-2 text-left">
            This action <span className="font-semibold text-destructive">cannot be undone</span>.
            This will permanently delete the website{' '}
            <span className="font-semibold text-foreground">&quot;{website.name}&quot;</span>{' '}
            and all of its content, including:
          </DialogDescription>
        </DialogHeader>

        {/* List of what will be deleted */}
        <ul className="my-2 ml-4 list-disc space-y-1 text-sm text-muted-foreground">
          <li>All pages and their content</li>
          <li>All design elements and layouts</li>
          <li>All media files and assets</li>
          <li>Publishing history and settings</li>
        </ul>

        {/* Confirmation inputs */}
        <div className="space-y-4 py-2">
          {/* Name input */}
          <div className="space-y-2">
            <Label htmlFor="website-name-confirm" className="text-sm">
              Type <span className="font-semibold text-foreground">{website.name}</span> to confirm:
            </Label>
            <Input
              id="website-name-confirm"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter website name"
              className={nameInput && !nameMatches ? 'border-destructive' : ''}
              autoComplete="off"
              autoFocus
            />
            {nameInput && !nameMatches && (
              <p className="text-xs text-destructive">Name does not match</p>
            )}
          </div>

          {/* Confirmation checkbox */}
          <div className="flex items-start gap-3 rounded-md border border-destructive/20 bg-destructive/5 p-3">
            <Checkbox
              id="understood-checkbox"
              checked={understood}
              onCheckedChange={(checked) => setUnderstood(checked === true)}
              className="mt-0.5"
            />
            <Label
              htmlFor="understood-checkbox"
              className="text-sm font-normal leading-relaxed cursor-pointer"
            >
              I understand this website will be{' '}
              <span className="font-semibold">permanently deleted</span> and{' '}
              <span className="font-semibold">cannot be recovered</span>.
            </Label>
          </div>
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
                Delete Website
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
