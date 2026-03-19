/**
 * CREATE FOLDER DIALOG COMPONENT
 *
 * Modal dialog for creating new folders with:
 * - Name input
 * - Color selection (optional)
 * - Preview of folder appearance
 */

'use client'

import { useState } from 'react'
import { Folder } from 'lucide-react'
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
import { cn } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

interface CreateFolderDialogProps {
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
 * Predefined color options for folders
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

export function CreateFolderDialog({
  open,
  onClose,
  onCreate,
  isLoading = false,
}: CreateFolderDialogProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(FOLDER_COLORS[0].value)
  const [error, setError] = useState<string | null>(null)

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate
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
        color: color !== FOLDER_COLORS[0].value ? color : undefined,
      })
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder')
    }
  }

  // Reset and close
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
            <DialogDescription>
              Create a folder to organize your files.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Folder preview */}
            <div className="flex justify-center py-4">
              <div className="relative w-20">
                <svg
                  viewBox="0 0 120 90"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-full h-auto drop-shadow-lg"
                >
                  <path
                    d="M8 20C8 15.5817 11.5817 12 16 12H42C44.6522 12 47.1957 13.0536 49.0711 14.9289L54 20H104C108.418 20 112 23.5817 112 28V78C112 82.4183 108.418 86 104 86H16C11.5817 86 8 82.4183 8 78V20Z"
                    fill={color}
                    fillOpacity="0.9"
                  />
                  <path
                    d="M8 20C8 15.5817 11.5817 12 16 12H38C40.1217 12 42.1566 12.8429 43.6569 14.3431L48 18.6863C49.5003 20.1866 51.5352 21.0294 53.6569 21.0294H104C108.418 21.0294 112 24.6111 112 29.0294V78C112 82.4183 108.418 86 104 86H16C11.5817 86 8 82.4183 8 78V20Z"
                    fill={color}
                  />
                  <path
                    d="M16 12H38C40.1217 12 42.1566 12.8429 43.6569 14.3431L48 18.6863C49.5003 20.1866 51.5352 21.0294 53.6569 21.0294H104C106.209 21.0294 108.209 22.0723 109.536 23.6863"
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M12 28H108V78C108 80.2091 106.209 82 104 82H16C13.7909 82 12 80.2091 12 78V28Z"
                    fill="rgba(0,0,0,0.15)"
                  />
                </svg>
              </div>
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
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
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
