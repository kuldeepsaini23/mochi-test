'use client'

/**
 * Edit Folder Dialog for Contracts
 *
 * Modal for editing contract folder properties (name and color).
 * Pre-filled with existing folder data.
 *
 * Cloned from email templates edit-folder-dialog pattern.
 *
 * Features:
 * - Edit folder name
 * - Color picker with preset colors
 * - Custom color input
 * - Live preview of folder with selected color
 * - Loading states during save
 *
 * SOURCE OF TRUTH KEYWORDS: EditContractFolderDialog
 */

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
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
import { Loader2, Palette, Check } from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

interface EditFolderDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback when dialog closes */
  onClose: () => void
  /** Folder ID being edited */
  folderId: string
  /** Current folder name */
  folderName: string
  /** Current folder color */
  folderColor?: string | null
  /** Callback when save is confirmed */
  onSave: (data: { name: string; color: string | null }) => void
  /** Whether save is in progress */
  isSaving?: boolean
}

// ============================================================================
// PRESET COLORS
// ============================================================================

/**
 * Curated color palette for folders — same as email templates
 */
const PRESET_COLORS = [
  { name: 'Default', value: '#3f3f46' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Lime', value: '#84cc16' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Sky', value: '#0ea5e9' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Fuchsia', value: '#d946ef' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Rose', value: '#f43f5e' },
]

// ============================================================================
// FOLDER PREVIEW
// ============================================================================

/**
 * Small folder preview showing how it will look with the selected color
 */
function FolderPreview({ color, name }: { color: string; name: string }) {
  return (
    <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-muted/30">
      <svg
        viewBox="0 0 120 90"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-16 h-auto drop-shadow-lg"
      >
        <path
          d="M8 20C8 15.5817 11.5817 12 16 12H38C40.1217 12 42.1566 12.8429 43.6569 14.3431L48 18.6863C49.5003 20.1866 51.5352 21.0294 53.6569 21.0294H104C108.418 21.0294 112 24.6111 112 29.0294V78C112 82.4183 108.418 86 104 86H16C11.5817 86 8 82.4183 8 78V20Z"
          fill={color}
        />
        <path
          d="M12 28H108V78C108 80.2091 106.209 82 104 82H16C13.7909 82 12 80.2091 12 78V28Z"
          fill="rgba(0,0,0,0.15)"
        />
      </svg>
      <span className="text-sm font-medium truncate max-w-[100px]">{name || 'Folder'}</span>
    </div>
  )
}

// ============================================================================
// COMPONENT
// ============================================================================

export function EditFolderDialog({
  open,
  onClose,
  folderId,
  folderName,
  folderColor,
  onSave,
  isSaving = false,
}: EditFolderDialogProps) {
  const [name, setName] = useState(folderName)
  const [color, setColor] = useState(folderColor || '#3f3f46')

  /**
   * Reset form when dialog opens with new folder data
   */
  useEffect(() => {
    if (open) {
      setName(folderName)
      setColor(folderColor || '#3f3f46')
    }
  }, [open, folderName, folderColor])

  /**
   * Handle save — validate and call parent callback
   */
  const handleSave = () => {
    const trimmedName = name.trim()
    if (!trimmedName) return

    onSave({
      name: trimmedName,
      color: color === '#3f3f46' ? null : color,
    })
  }

  /** Check if form has changes compared to original values */
  const hasChanges =
    name.trim() !== folderName || (color || '#3f3f46') !== (folderColor || '#3f3f46')

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" />
            Edit Folder
          </DialogTitle>
          <DialogDescription>Change the folder name and color</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Preview */}
          <div className="flex justify-center">
            <FolderPreview color={color} name={name} />
          </div>

          {/* Name input */}
          <div className="space-y-2">
            <Label htmlFor="edit-contract-folder-name">Folder Name</Label>
            <Input
              id="edit-contract-folder-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter folder name"
              disabled={isSaving}
            />
          </div>

          {/* Color picker */}
          <div className="space-y-2">
            <Label>Folder Color</Label>
            <div className="grid grid-cols-6 gap-2">
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setColor(preset.value)}
                  className={cn(
                    'w-8 h-8 rounded-lg border-2 transition-all duration-150',
                    'hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary',
                    color === preset.value
                      ? 'border-primary ring-2 ring-primary/30'
                      : 'border-transparent'
                  )}
                  style={{ backgroundColor: preset.value }}
                  title={preset.name}
                  disabled={isSaving}
                >
                  {color === preset.value && (
                    <Check
                      className={cn(
                        'w-4 h-4 mx-auto',
                        ['#f59e0b', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4'].includes(
                          preset.value
                        )
                          ? 'text-black'
                          : 'text-white'
                      )}
                    />
                  )}
                </button>
              ))}
            </div>

            {/* Custom color input */}
            <div className="flex items-center gap-2 mt-3">
              <Label
                htmlFor="custom-contract-folder-color"
                className="text-xs text-muted-foreground whitespace-nowrap"
              >
                Custom:
              </Label>
              <input
                type="color"
                id="custom-contract-folder-color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border border-border"
                disabled={isSaving}
              />
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#000000"
                className="flex-1 h-8 text-xs font-mono"
                disabled={isSaving}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || isSaving || !hasChanges}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
