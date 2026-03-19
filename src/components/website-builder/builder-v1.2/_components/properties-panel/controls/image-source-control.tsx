/**
 * ========================================
 * IMAGE SOURCE CONTROL - Properties Panel
 * ========================================
 *
 * Provides two ways for users to set an image source:
 * 1. From Storage - Opens the StorageBrowserModal to select from uploaded images
 * 2. From URL - Allows pasting an external URL (like Unsplash)
 *
 * Features:
 * - Dropdown to toggle between source types
 * - "From Storage": Shows "Open Media Bucket" button that opens the storage browser
 * - "From URL": Shows a text input for external URLs
 * - Image preview when a source is set
 * - Mobile override indicator support
 */

'use client'

import { useState } from 'react'
import { ImageIcon, FolderOpen, Link, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MobileOverrideIndicator } from './mobile-override-indicator'
import { StorageBrowserModal } from '@/components/storage-browser/storage-browser-modal'
import { useBuilderContext } from '../../../_lib/builder-context'
import type { SelectedFile } from '@/components/storage-browser/types'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Source type determines how the user can provide an image
 * - storage: Select from the organization's media storage
 * - url: Paste an external URL
 */
type ImageSourceType = 'storage' | 'url'

interface ImageSourceControlProps {
  /** Label text displayed above the control */
  label: string
  /** Current image URL (empty string if no image) */
  value: string
  /** Change handler - called with new image URL */
  onChange: (value: string) => void
  /** Shows a blue dot indicator when this property has a mobile override */
  hasMobileOverride?: boolean
  /** Called to reset/clear the mobile override for this property */
  onResetMobileOverride?: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ImageSourceControl({
  label,
  value,
  onChange,
  hasMobileOverride,
  onResetMobileOverride,
}: ImageSourceControlProps) {
  // Access organization ID from builder context for storage browser
  const { organizationId } = useBuilderContext()

  // Track which source type is currently selected
  const [sourceType, setSourceType] = useState<ImageSourceType>('storage')

  // Track whether the storage browser modal is open
  const [isStorageOpen, setIsStorageOpen] = useState(false)

  // Track the URL input value (separate from the actual value for better UX)
  const [urlInput, setUrlInput] = useState(value)

  /**
   * Handle file selection from storage browser.
   * Uses the accessUrl which works for both public and private files.
   */
  const handleStorageSelect = (file: SelectedFile) => {
    // Prefer accessUrl as it handles both public and private files
    const imageUrl = file.accessUrl || file.publicUrl || ''
    onChange(imageUrl)
    setIsStorageOpen(false)
  }

  /**
   * Handle URL input change - just update local state.
   * The actual change is triggered on blur or enter key.
   */
  const handleUrlInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrlInput(e.target.value)
  }

  /**
   * Apply the URL input value to the actual image source.
   * Called on blur or when user presses Enter.
   */
  const handleUrlApply = () => {
    onChange(urlInput)
  }

  /**
   * Handle Enter key to apply URL input.
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleUrlApply()
    }
  }

  /**
   * Clear the current image source.
   */
  const handleClear = () => {
    onChange('')
    setUrlInput('')
  }

  return (
    <div className="space-y-2">
      {/* Label with optional mobile override indicator */}
      <div className="flex items-center gap-1.5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <MobileOverrideIndicator
          hasOverride={hasMobileOverride ?? false}
          onReset={onResetMobileOverride}
        />
      </div>

      {/* Source type dropdown */}
      <div className="relative">
        <select
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value as ImageSourceType)}
          className={cn(
            'w-full h-8 px-3 pr-8 text-sm rounded-md',
            'bg-muted/50 border border-border',
            'focus:outline-none focus:ring-1 focus:ring-primary',
            'appearance-none cursor-pointer'
          )}
        >
          <option value="storage">From Storage</option>
          <option value="url">From URL</option>
        </select>
        {/* Dropdown arrow icon */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg
            className="w-4 h-4 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>

      {/* Source type specific UI */}
      {sourceType === 'storage' ? (
        // FROM STORAGE: Open Media Bucket button
        <button
          type="button"
          onClick={() => setIsStorageOpen(true)}
          className={cn(
            'w-full py-2.5 px-4 rounded-lg',
            'border-2 border-dashed border-border',
            'hover:border-primary/50 hover:bg-primary/5',
            'transition-all duration-200',
            'flex items-center justify-center gap-2',
            'text-sm text-muted-foreground hover:text-foreground'
          )}
        >
          <FolderOpen className="w-4 h-4" />
          <span>Open Media Bucket</span>
        </button>
      ) : (
        // FROM URL: Text input for external URLs
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            <Link className="w-4 h-4 text-muted-foreground" />
          </div>
          <input
            type="url"
            value={urlInput}
            onChange={handleUrlInputChange}
            onBlur={handleUrlApply}
            onKeyDown={handleKeyDown}
            placeholder="https://example.com/image.jpg"
            className={cn(
              'w-full h-9 pl-9 pr-3 text-sm rounded-md',
              'bg-muted/50 border border-border',
              'focus:outline-none focus:ring-1 focus:ring-primary',
              'placeholder:text-muted-foreground/50'
            )}
          />
        </div>
      )}

      {/* Image preview (shown when an image is set) */}
      {value && (
        <div className="relative group">
          {/* Preview container */}
          <div
            className={cn(
              'w-full aspect-video rounded-lg overflow-hidden',
              'border border-border bg-muted/30'
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="Preview"
              className="w-full h-full object-cover"
              onError={(e) => {
                // Show placeholder on error
                e.currentTarget.style.display = 'none'
              }}
            />
          </div>

          {/* Clear button (visible on hover) */}
          <button
            type="button"
            onClick={handleClear}
            className={cn(
              'absolute top-2 right-2',
              'w-6 h-6 rounded-full',
              'bg-background/80 hover:bg-destructive hover:text-destructive-foreground',
              'border border-border hover:border-destructive',
              'flex items-center justify-center',
              'opacity-0 group-hover:opacity-100',
              'transition-all duration-200'
            )}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Empty state (shown when no image is set) */}
      {!value && (
        <div
          className={cn(
            'w-full aspect-video rounded-lg',
            'border border-dashed border-border',
            'flex flex-col items-center justify-center gap-2',
            'bg-muted/20'
          )}
        >
          <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground/60 text-center">
            No image selected
          </p>
        </div>
      )}

      {/* Storage Browser Modal */}
      <StorageBrowserModal
        open={isStorageOpen}
        onOpenChange={setIsStorageOpen}
        organizationId={organizationId}
        mode="select"
        fileFilter="image"
        title="Select Image"
        subtitle="Choose an image from your storage"
        onSelect={(file) => handleStorageSelect(file as SelectedFile)}
      />
    </div>
  )
}
