'use client'

/**
 * IMAGE SOURCE CONTROL COMPONENT
 *
 * Provides a dual-mode image selection control for the email builder.
 * Users can either select images from their storage or enter a URL directly.
 *
 * FEATURES:
 * - Toggle between "From Storage" and "From URL" modes
 * - Integration with StorageBrowserModal for storage selection
 * - Image preview when URL is set
 * - Clean, minimal design matching the properties sidebar
 *
 * SOURCE OF TRUTH KEYWORDS: ImageSourceControl, EmailImagePicker
 */

import { useState } from 'react'
import { ImageIcon, Link, FolderOpen, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { StorageBrowserModal } from '@/components/storage-browser/storage-browser-modal'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import type { SelectedFile } from '@/components/storage-browser/types'

// ============================================================================
// TYPES
// ============================================================================

interface ImageSourceControlProps {
  /** Current image URL value */
  value: string
  /** Callback when image URL changes */
  onChange: (url: string) => void
  /** Label for the control (default: "Image") */
  label?: string
  /** Placeholder for URL input */
  placeholder?: string
  /** Whether the control is disabled */
  disabled?: boolean
  /** Show preview thumbnail when URL is set */
  showPreview?: boolean
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ImageSourceControl({
  value,
  onChange,
  label = 'Image',
  placeholder = 'https://...',
  disabled = false,
  showPreview = true,
}: ImageSourceControlProps) {
  // Track which input mode is active
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false)
  const [imageError, setImageError] = useState(false)

  // Get organization ID for storage browser from active organization hook
  const { activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id

  /**
   * Handle file selection from storage browser.
   * Uses accessUrl for private files, publicUrl for public files.
   * Note: In single-select mode, we receive a single file, but the type
   * is a union so we need to handle both cases.
   */
  const handleStorageSelect = (fileOrFiles: SelectedFile | SelectedFile[]) => {
    // In single-select mode, we expect a single file but handle array just in case
    const file = Array.isArray(fileOrFiles) ? fileOrFiles[0] : fileOrFiles
    if (!file) return

    const imageUrl = file.accessUrl || file.publicUrl || ''
    onChange(imageUrl)
    setImageError(false)
    setIsStorageModalOpen(false)
  }

  /**
   * Handle URL input change with validation reset
   */
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
    setImageError(false)
  }

  /**
   * Clear the current image
   */
  const handleClear = () => {
    onChange('')
    setImageError(false)
  }

  /**
   * Handle image load error
   */
  const handleImageError = () => {
    setImageError(true)
  }

  const hasImage = value && value.trim().length > 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        {/* Source selector dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-primary hover:text-primary"
              disabled={disabled}
            >
              <ImageIcon className="h-3 w-3 mr-1" />
              Add
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onClick={() => setIsStorageModalOpen(true)}
              disabled={!organizationId}
            >
              <FolderOpen className="h-4 w-4 mr-2" />
              From Storage
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                // Focus the URL input when user selects "From URL"
                const input = document.getElementById('image-url-input')
                if (input) input.focus()
              }}
            >
              <Link className="h-4 w-4 mr-2" />
              From URL
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Image preview or placeholder */}
      {showPreview && (
        <div
          className={cn(
            'relative w-full aspect-video rounded-lg border border-dashed overflow-hidden',
            'bg-muted/30 flex items-center justify-center',
            hasImage && 'border-solid border-border'
          )}
        >
          {hasImage && !imageError ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value}
                alt="Preview"
                className="w-full h-full object-cover"
                onError={handleImageError}
              />
              {/* Clear button overlay */}
              <button
                type="button"
                onClick={handleClear}
                className={cn(
                  'absolute top-1 right-1 p-1 rounded-full',
                  'bg-black/50 hover:bg-black/70 text-white',
                  'opacity-0 group-hover:opacity-100 transition-opacity',
                  'focus:opacity-100'
                )}
                title="Remove image"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
              <ImageIcon className="h-6 w-6" />
              <span className="text-xs">
                {imageError ? 'Failed to load image' : 'No image selected'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* URL input */}
      <div className="flex gap-2">
        <Input
          id="image-url-input"
          type="url"
          value={value}
          onChange={handleUrlChange}
          placeholder={placeholder}
          className="h-8 text-xs"
          disabled={disabled}
        />
        {hasImage && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleClear}
            disabled={disabled}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Storage Browser Modal */}
      {organizationId && (
        <StorageBrowserModal
          open={isStorageModalOpen}
          onOpenChange={setIsStorageModalOpen}
          organizationId={organizationId}
          fileFilter="image"
          mode="select"
          onSelect={handleStorageSelect}
          title="Select Image"
          subtitle="Choose an image from your storage"
        />
      )}
    </div>
  )
}

/**
 * BACKGROUND IMAGE CONTROL COMPONENT
 *
 * Specialized version for selecting background images.
 * Shows compact preview and includes position/size options.
 *
 * SOURCE OF TRUTH KEYWORDS: BackgroundImageControl, EmailBackgroundPicker
 */

interface BackgroundImageControlProps {
  /** Current background image URL */
  value: string | undefined
  /** Callback when background image changes */
  onChange: (url: string | undefined) => void
  /** Whether the control is disabled */
  disabled?: boolean
}

export function BackgroundImageControl({
  value,
  onChange,
  disabled = false,
}: BackgroundImageControlProps) {
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false)

  // Get organization ID for storage browser from active organization hook
  const { activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id

  /**
   * Handle file selection from storage browser.
   * Note: In single-select mode, we receive a single file, but the type
   * is a union so we need to handle both cases.
   */
  const handleStorageSelect = (fileOrFiles: SelectedFile | SelectedFile[]) => {
    // In single-select mode, we expect a single file but handle array just in case
    const file = Array.isArray(fileOrFiles) ? fileOrFiles[0] : fileOrFiles
    if (!file) return

    const imageUrl = file.accessUrl || file.publicUrl || ''
    onChange(imageUrl)
    setIsStorageModalOpen(false)
  }

  const hasImage = value && value.trim().length > 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Background Image</Label>
        <div className="flex items-center gap-1">
          {hasImage && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-destructive hover:text-destructive"
              onClick={() => onChange(undefined)}
              disabled={disabled}
            >
              Remove
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-primary hover:text-primary"
                disabled={disabled}
              >
                <ImageIcon className="h-3 w-3 mr-1" />
                {hasImage ? 'Change' : 'Add'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                onClick={() => setIsStorageModalOpen(true)}
                disabled={!organizationId}
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                From Storage
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const input = document.getElementById('bg-image-url-input')
                  if (input) input.focus()
                }}
              >
                <Link className="h-4 w-4 mr-2" />
                From URL
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Compact preview or URL input */}
      {hasImage ? (
        <div
          className="relative h-12 rounded-lg border overflow-hidden bg-cover bg-center"
          style={{ backgroundImage: `url(${value})` }}
        >
          {/* Overlay with URL display */}
          <div className="absolute inset-0 bg-black/40 flex items-center px-2">
            <span className="text-[10px] text-white/90 truncate flex-1">
              {value}
            </span>
          </div>
        </div>
      ) : (
        <Input
          id="bg-image-url-input"
          type="url"
          value={value || ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          placeholder="Enter image URL..."
          className="h-8 text-xs"
          disabled={disabled}
        />
      )}

      {/* Storage Browser Modal */}
      {organizationId && (
        <StorageBrowserModal
          open={isStorageModalOpen}
          onOpenChange={setIsStorageModalOpen}
          organizationId={organizationId}
          fileFilter="image"
          mode="select"
          onSelect={handleStorageSelect}
          title="Select Background Image"
          subtitle="Choose an image from your storage"
        />
      )}
    </div>
  )
}

/**
 * AVATAR IMAGE CONTROL COMPONENT
 *
 * Compact image picker for avatar/profile images.
 * Shows small circular preview with storage/URL selection.
 * Designed for use in lists of avatars (e.g., social proof stacks).
 *
 * SOURCE OF TRUTH KEYWORDS: AvatarImageControl, AvatarPicker
 */

interface AvatarImageControlProps {
  /** Current avatar URL value */
  value: string
  /** Callback when avatar URL changes */
  onChange: (url: string) => void
  /** Callback when avatar should be removed */
  onRemove?: () => void
  /** Placeholder for URL input */
  placeholder?: string
  /** Whether the control is disabled */
  disabled?: boolean
}

export function AvatarImageControl({
  value,
  onChange,
  onRemove,
  placeholder = 'https://...',
  disabled = false,
}: AvatarImageControlProps) {
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false)
  const [imageError, setImageError] = useState(false)

  // Get organization ID for storage browser from active organization hook
  const { activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id

  /**
   * Handle file selection from storage browser.
   */
  const handleStorageSelect = (fileOrFiles: SelectedFile | SelectedFile[]) => {
    const file = Array.isArray(fileOrFiles) ? fileOrFiles[0] : fileOrFiles
    if (!file) return

    const imageUrl = file.accessUrl || file.publicUrl || ''
    onChange(imageUrl)
    setImageError(false)
    setIsStorageModalOpen(false)
  }

  /**
   * Handle URL input change
   */
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
    setImageError(false)
  }

  const hasImage = value && value.trim().length > 0

  return (
    <div className="flex items-center gap-2">
      {/* Compact circular avatar preview */}
      <div
        className={cn(
          'w-9 h-9 rounded-full shrink-0 overflow-hidden',
          'border-2 border-dashed border-muted-foreground/30',
          'flex items-center justify-center bg-muted/30',
          hasImage && !imageError && 'border-solid border-border'
        )}
      >
        {hasImage && !imageError ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={value}
            alt="Avatar"
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
        )}
      </div>

      {/* URL input */}
      <Input
        type="url"
        value={value}
        onChange={handleUrlChange}
        placeholder={placeholder}
        className="flex-1 h-9 text-xs"
        disabled={disabled}
      />

      {/* Storage picker button */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            disabled={disabled}
          >
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onClick={() => setIsStorageModalOpen(true)}
            disabled={!organizationId}
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            From Storage
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              // User wants to enter URL manually - focus is already on input
            }}
          >
            <Link className="h-4 w-4 mr-2" />
            Enter URL
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Remove button */}
      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={onRemove}
          disabled={disabled}
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </Button>
      )}

      {/* Storage Browser Modal */}
      {organizationId && (
        <StorageBrowserModal
          open={isStorageModalOpen}
          onOpenChange={setIsStorageModalOpen}
          organizationId={organizationId}
          fileFilter="image"
          mode="select"
          onSelect={handleStorageSelect}
          title="Select Avatar"
          subtitle="Choose an image from your storage"
        />
      )}
    </div>
  )
}
