'use client'

/**
 * CREATE AUTOMATION FOLDER DIALOG COMPONENT
 *
 * Modal dialog for creating new automation folders with:
 * - Name input
 * - Color selection (optional)
 * - Preview of folder appearance
 *
 * SOURCE OF TRUTH KEYWORDS: CreateAutomationFolderDialog
 */

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FolderShapeLarge } from '@/components/ui/folder-shape'
import { cn } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

interface CreateAutomationFolderDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Close handler */
  onClose: () => void
  /** Create handler with folder data */
  onCreate: (data: { name: string; color?: string }) => Promise<void>
  /** Loading state */
  isLoading?: boolean
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Predefined color options for folders.
 * Curated palette matching modern design systems.
 */
const FOLDER_COLORS = [
  { name: 'Default', value: '#3f3f46' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
]

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CreateAutomationFolderDialog({
  open,
  onClose,
  onCreate,
  isLoading = false,
}: CreateAutomationFolderDialogProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(FOLDER_COLORS[0].value)
  const [error, setError] = useState<string | null>(null)

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate name
    if (!name.trim()) {
      setError('Folder name is required')
      return
    }

    if (name.length > 100) {
      setError('Folder name must be less than 100 characters')
      return
    }

    setError(null)

    try {
      await onCreate({
        name: name.trim(),
        // Only pass color if not default
        color: color !== FOLDER_COLORS[0].value ? color : undefined,
      })
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder')
    }
  }

  /**
   * Reset form and close dialog
   */
  const handleClose = () => {
    if (!isLoading) {
      setName('')
      setColor(FOLDER_COLORS[0].value)
      setError(null)
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>Create a folder to organize your automations.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Folder preview */}
            <div className="flex justify-center py-4">
              <FolderShapeLarge color={color} />
            </div>

            {/* Name input */}
            <div className="space-y-2">
              <Label htmlFor="folder-name">Folder Name</Label>
              <Input
                id="folder-name"
                placeholder="Enter folder name..."
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setError(null)
                }}
                maxLength={100}
                autoFocus
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            {/* Color selection */}
            <div className="space-y-2">
              <Label>Folder Color</Label>
              <div className="flex flex-wrap gap-2">
                {FOLDER_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    className={cn(
                      'w-8 h-8 rounded-full transition-all',
                      'hover:scale-110',
                      color === c.value && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                    )}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading ? 'Creating...' : 'Create Folder'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
