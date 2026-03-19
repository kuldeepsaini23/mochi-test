/**
 * ============================================================================
 * CREATE TABLE DIALOG - Modal for Creating New CMS Tables
 * ============================================================================
 *
 * Simple dialog for creating a new CMS table with:
 * - Table name input
 * - Optional description
 * - Auto-generated slug from name
 *
 * FEATURES:
 * - Optimistic create
 * - Slug validation
 * - Clean form reset on close
 * - Server-side feature gate error handling (toast on limit exceeded)
 *
 * ============================================================================
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Table2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'

interface CreateTableDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean
  /** Callback when dialog should close */
  onClose: () => void
  /** Callback when table is successfully created */
  onCreated: (tableId: string) => void
  /** Organization ID for the table */
  organizationId: string
}

/**
 * Generate a URL-friendly slug from a name.
 * Converts to lowercase, replaces spaces with hyphens, removes special chars.
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Dialog for creating a new CMS table.
 * Provides form for name and description with validation.
 */
export function CreateTableDialog({
  isOpen,
  onClose,
  onCreated,
  organizationId,
}: CreateTableDialogProps) {
  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [slug, setSlug] = useState('')
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false)

  // tRPC utils for cache invalidation
  const utils = trpc.useUtils()

  /**
   * Create table mutation.
   * Invalidates cache on success to refresh the table list.
   * Shows error toast if server-side validation fails.
   * NOTE: Client-side feature gating is handled by FeatureGate wrapping the
   * create button in parent components (CmsModal, CmsPageContent), so the
   * server-side FEATURE_LIMIT_EXCEEDED case is a fallback safety net.
   */
  const createTable = trpc.cms.createTable.useMutation({
    onSuccess: (data: { id: string }) => {
      // Invalidate the table list to refetch with new table
      void utils.cms.listTables.invalidate({ organizationId })
      onCreated(data.id)
    },
    onError: (error) => {
      // Show error toast for any failure (including feature limit errors)
      toast.error(error.message || 'Failed to create table')
    },
  })

  /**
   * Reset form when dialog opens.
   */
  useEffect(() => {
    if (isOpen) {
      setName('')
      setDescription('')
      setSlug('')
      setIsSlugManuallyEdited(false)
    }
  }, [isOpen])

  /**
   * Auto-generate slug from name unless manually edited.
   */
  useEffect(() => {
    if (!isSlugManuallyEdited && name) {
      setSlug(generateSlug(name))
    }
  }, [name, isSlugManuallyEdited])

  /**
   * Handle slug change - mark as manually edited.
   */
  const handleSlugChange = useCallback((value: string) => {
    setSlug(generateSlug(value))
    setIsSlugManuallyEdited(true)
  }, [])

  /**
   * Handle form submission.
   */
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()

      const trimmedName = name.trim()
      if (!trimmedName) return

      createTable.mutate({
        organizationId,
        name: trimmedName,
        slug: slug || generateSlug(trimmedName),
        description: description.trim() || undefined,
      })
    },
    [name, slug, description, organizationId, createTable]
  )

  const isValid = name.trim().length > 0

  return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Table2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <DialogTitle>Create Table</DialogTitle>
                <DialogDescription>
                  Create a new table to store your content data
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Table Name */}
            <div className="space-y-2">
              <Label htmlFor="table-name">
                Table Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="table-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Blog Posts, Team Members"
                autoFocus
                disabled={createTable.isPending}
              />
            </div>

            {/* Slug */}
            <div className="space-y-2">
              <Label htmlFor="table-slug">
                Slug
                <span className="text-muted-foreground font-normal ml-1">
                  (auto-generated)
                </span>
              </Label>
              <Input
                id="table-slug"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="blog-posts"
                disabled={createTable.isPending}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Used as a key when connecting data to components
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="table-description">
                Description
                <span className="text-muted-foreground font-normal ml-1">
                  (optional)
                </span>
              </Label>
              <Textarea
                id="table-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What kind of data will this table store?"
                rows={2}
                disabled={createTable.isPending}
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={createTable.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!isValid || createTable.isPending}
              >
                {createTable.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Table'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
  )
}
