/**
 * ========================================
 * VIDEO SOURCE CONTROL - Properties Panel
 * ========================================
 *
 * Provides the ability for users to select a video from storage.
 * Opens the StorageBrowserModal with video filter to select HLS videos.
 *
 * Features:
 * - "Open Media Bucket" button that opens the storage browser with video filter
 * - Video preview with thumbnail when a source is set
 * - Clear button to remove the video
 * - Mobile override indicator support
 */

'use client'

import { useState } from 'react'
import { Video, FolderOpen, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MobileOverrideIndicator } from './mobile-override-indicator'
import { StorageBrowserModal } from '@/components/storage-browser/storage-browser-modal'
import { useBuilderContext } from '../../../_lib/builder-context'
import type { SelectedFile } from '@/components/storage-browser/types'

// ============================================================================
// TYPES
// ============================================================================

interface VideoSourceControlProps {
  /** Label text displayed above the control */
  label: string
  /** Current video URL (empty string if no video) */
  value: string
  /** Change handler - called with new video URL */
  onChange: (value: string) => void
  /** Shows a blue dot indicator when this property has a mobile override */
  hasMobileOverride?: boolean
  /** Called to reset/clear the mobile override for this property */
  onResetMobileOverride?: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export function VideoSourceControl({
  label,
  value,
  onChange,
  hasMobileOverride,
  onResetMobileOverride,
}: VideoSourceControlProps) {
  // Access organization ID from builder context for storage browser
  const { organizationId } = useBuilderContext()

  // Track whether the storage browser modal is open
  const [isStorageOpen, setIsStorageOpen] = useState(false)

  /**
   * Handle file selection from storage browser.
   * For videos, we need the HLS manifest URL which is stored as accessUrl.
   */
  const handleStorageSelect = (file: SelectedFile) => {
    // Use the accessUrl which contains the HLS manifest URL for videos
    const videoUrl = file.accessUrl || file.publicUrl || ''
    onChange(videoUrl)
    setIsStorageOpen(false)
  }

  /**
   * Clear the current video source.
   */
  const handleClear = () => {
    onChange('')
  }

  /**
   * Extract a displayable thumbnail from the video URL.
   * For HLS videos, the poster is typically at the same path with /poster.jpg
   */
  const getPosterUrl = (): string | undefined => {
    if (!value) return undefined
    // If the URL contains /hls/, try to get the poster
    if (value.includes('/hls/') && value.includes('/master.m3u8')) {
      return value.replace('/master.m3u8', '/poster.jpg')
    }
    return undefined
  }

  const posterUrl = getPosterUrl()

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

      {/* Open Media Bucket button */}
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

      {/* Video preview (shown when a video is set) */}
      {value && (
        <div className="relative group">
          {/* Preview container */}
          <div
            className={cn(
              'w-full aspect-video rounded-lg overflow-hidden',
              'border border-border bg-muted/30'
            )}
          >
            {/* Show poster if available, otherwise show video icon */}
            {posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={posterUrl}
                alt="Video thumbnail"
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Hide on error
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-black/50">
                <Video className="w-12 h-12 text-muted-foreground/60" />
              </div>
            )}

            {/* Video icon overlay to indicate it's a video */}
            <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/70 flex items-center gap-1">
              <Video className="w-3 h-3 text-white" />
              <span className="text-xs text-white">Video</span>
            </div>
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

      {/* Empty state (shown when no video is set) */}
      {!value && (
        <div
          className={cn(
            'w-full aspect-video rounded-lg',
            'border border-dashed border-border',
            'flex flex-col items-center justify-center gap-2',
            'bg-muted/20'
          )}
        >
          <Video className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground/60 text-center">
            No video selected
          </p>
        </div>
      )}

      {/* Storage Browser Modal - filtered to videos only */}
      <StorageBrowserModal
        open={isStorageOpen}
        onOpenChange={setIsStorageOpen}
        organizationId={organizationId}
        mode="select"
        fileFilter="video"
        title="Select Video"
        subtitle="Choose a video from your storage"
        onSelect={(file) => handleStorageSelect(file as SelectedFile)}
      />
    </div>
  )
}
