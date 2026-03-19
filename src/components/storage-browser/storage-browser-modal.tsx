/**
 * STORAGE BROWSER MODAL COMPONENT
 *
 * A dialog wrapper for the StorageBrowser component.
 * Use this when you need to embed the storage browser in a modal,
 * such as for file selection in forms or builders.
 *
 * FEATURES:
 * - Full StorageBrowser functionality in a modal
 * - Controlled open state
 * - Responsive sizing
 * - Proper focus management
 *
 * USAGE:
 * ```tsx
 * // Single file selection
 * <StorageBrowserModal
 *   open={open}
 *   onOpenChange={setOpen}
 *   organizationId="org_123"
 *   mode="select"
 *   fileFilter="image"
 *   onSelect={(file) => {
 *     console.log('Selected:', file)
 *     setOpen(false)
 *   }}
 * />
 *
 * // Multi-select with confirmation
 * <StorageBrowserModal
 *   open={open}
 *   onOpenChange={setOpen}
 *   organizationId="org_123"
 *   mode="multi-select"
 *   maxSelection={5}
 *   onConfirm={(files) => {
 *     console.log('Selected:', files)
 *     setOpen(false)
 *   }}
 * />
 * ```
 */

'use client'

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { StorageBrowser } from './storage-browser'
import { cn } from '@/lib/utils'
import type { StorageBrowserModalProps } from './types'

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StorageBrowserModal({
  open,
  onOpenChange,
  organizationId,
  fileFilter = 'all',
  mode = 'select',
  onSelect,
  onConfirm,
  showTrash = false, // Default to false in modal for cleaner UX
  showUpload = true,
  showCreateFolder = true,
  initialFolderId,
  title,
  subtitle,
  className,
  maxSelection,
  confirmButtonText,
  cancelButtonText,
}: StorageBrowserModalProps) {
  /**
   * Handle modal close - called when user clicks outside or presses escape
   */
  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen)
  }

  /**
   * Handle close button or cancel - explicit close action
   */
  const handleClose = () => {
    onOpenChange(false)
  }

  /**
   * Handle file selection in single-select mode
   * Automatically closes the modal after selection
   */
  const handleSelect = (file: Parameters<NonNullable<typeof onSelect>>[0]) => {
    onSelect?.(file)
    // Auto-close on single select
    if (mode === 'select') {
      onOpenChange(false)
    }
  }

  /**
   * Handle confirm in multi-select mode
   * Closes the modal after confirmation
   */
  const handleConfirm = (files: Parameters<NonNullable<typeof onConfirm>>[0]) => {
    onConfirm?.(files)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          // Large modal for storage browser experience
          // Responsive sizing across breakpoints
          'w-[96vw] h-[85vh]',
          'sm:w-[92vw] sm:h-[80vh]',
          'lg:w-[70vw] lg:h-[75vh]',
          'xl:w-[70vw] xl:max-w-[1400px]',
          'max-h-[850px]',
          'flex flex-col p-0 gap-0',
          className
        )}
        showCloseButton={false}
      >
        {/* Accessible title - visually hidden but available to screen readers */}
        <VisuallyHidden>
          <DialogTitle>
            {title || (mode === 'select' ? 'Select File' : mode === 'multi-select' ? 'Select Files' : 'Storage Browser')}
          </DialogTitle>
        </VisuallyHidden>

        {/* Storage browser fills the modal */}
        <div className="flex-1 overflow-hidden p-4 sm:p-6">
          <StorageBrowser
            organizationId={organizationId}
            fileFilter={fileFilter}
            mode={mode}
            onSelect={handleSelect}
            onConfirm={handleConfirm}
            onClose={handleClose}
            showTrash={showTrash}
            showUpload={showUpload}
            showCreateFolder={showCreateFolder}
            initialFolderId={initialFolderId}
            title={title}
            subtitle={subtitle}
            isModal={true}
            maxSelection={maxSelection}
            confirmButtonText={confirmButtonText}
            cancelButtonText={cancelButtonText}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
