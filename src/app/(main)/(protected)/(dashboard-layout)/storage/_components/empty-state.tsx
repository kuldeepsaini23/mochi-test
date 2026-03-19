/**
 * EMPTY STATE COMPONENT
 *
 * Displays when the current folder has no files or folders.
 * Provides quick actions to upload files or create folders.
 */

'use client'

import { FolderOpen, Upload, FolderPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FeatureGate } from '@/components/feature-gate'

// ============================================================================
// TYPES
// ============================================================================

interface EmptyStateProps {
  /** Whether we're in a folder or at root */
  isInFolder?: boolean
  /** Upload handler */
  onUpload: () => void
  /** New folder handler */
  onNewFolder: () => void
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function EmptyState({
  isInFolder = false,
  onUpload,
  onNewFolder,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {/* Icon */}
      <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mb-6">
        <FolderOpen className="w-10 h-10 text-muted-foreground" />
      </div>

      {/* Text */}
      <h3 className="text-lg font-semibold mb-2">
        {isInFolder ? 'This folder is empty' : 'No files yet'}
      </h3>
      <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
        {isInFolder
          ? 'Upload files or create folders to organize your content.'
          : 'Get started by uploading your first files or creating a folder to organize them.'}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onNewFolder}>
          <FolderPlus className="w-4 h-4 mr-2" />
          New Folder
        </Button>
        {/* Upload button — gated by storage limit, shows upgrade modal when at capacity */}
        <FeatureGate feature="storage_kb.limit">
          <Button onClick={onUpload}>
            <Upload className="w-4 h-4 mr-2" />
            Upload Files
          </Button>
        </FeatureGate>
      </div>
    </div>
  )
}
