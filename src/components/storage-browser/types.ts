/**
 * STORAGE BROWSER TYPES
 *
 * Shared types for the reusable StorageBrowser component.
 * Defines props, modes, and filter options.
 */

import type { FileCategory, FileVisibility, VideoProcessingStatus } from '@/generated/prisma'

// ============================================================================
// FILE FILTER TYPES
// ============================================================================

/**
 * File type filter options.
 * When set, only files matching this category will be shown.
 * Folders are always visible for navigation.
 */
export type FileTypeFilter =
  | 'all'       // Show all files (no filter)
  | 'image'     // Images only (IMAGE category)
  | 'video'     // Videos only (VIDEO category)
  | 'audio'     // Audio only (AUDIO category)
  | 'document'  // Documents only (DOCUMENT category)
  | 'archive'   // Archives only (ARCHIVE category)

/**
 * Maps FileTypeFilter to Prisma FileCategory
 */
export const FILE_FILTER_MAP: Record<FileTypeFilter, FileCategory | null> = {
  all: null,
  image: 'IMAGE',
  video: 'VIDEO',
  audio: 'AUDIO',
  document: 'DOCUMENT',
  archive: 'ARCHIVE',
}

// ============================================================================
// SELECTION MODE
// ============================================================================

/**
 * Selection mode determines how files can be selected.
 * - browse: No selection, just browsing (default storage page behavior)
 * - select: Single file selection with callback
 * - multi-select: Multiple file selection with callback
 */
export type SelectionMode = 'browse' | 'select' | 'multi-select'

// ============================================================================
// SELECTED FILE DATA
// ============================================================================

/**
 * Data returned when a file is selected.
 * Contains all necessary information for the caller to use the file.
 */
export interface SelectedFile {
  id: string
  name: string
  displayName: string | null
  extension: string
  category: FileCategory
  size: number
  visibility: FileVisibility
  /** URL to access the file (CDN for public, API route for private) */
  accessUrl: string | null
  /** Public CDN URL (only for PUBLIC files) */
  publicUrl: string | null
  /** Thumbnail URL for images/videos */
  thumbnailUrl: string | null
  /** HLS manifest URL for videos (only for PUBLIC videos) */
  hlsManifestUrl: string | null
  /** Poster URL for videos */
  posterUrl: string | null
  /** Video processing status */
  videoProcessingStatus: VideoProcessingStatus | null
  /** MIME type */
  mimeType: string
}

// ============================================================================
// VIEW MODE
// ============================================================================

export type ViewMode = 'grid' | 'list'

// ============================================================================
// BREADCRUMB
// ============================================================================

export interface Breadcrumb {
  id: string
  name: string
}

// ============================================================================
// STORAGE BROWSER PROPS
// ============================================================================

export interface StorageBrowserProps {
  /** Organization ID - required */
  organizationId: string

  /**
   * File type filter - only show files matching this category.
   * Folders are always visible for navigation.
   * @default 'all'
   */
  fileFilter?: FileTypeFilter

  /**
   * Selection mode - determines selection behavior.
   * - 'browse': No selection (default storage page behavior)
   * - 'select': Single file selection
   * - 'multi-select': Multiple file selection
   * @default 'browse'
   */
  mode?: SelectionMode

  /**
   * Callback when file(s) are selected.
   * For 'select' mode: receives single SelectedFile
   * For 'multi-select' mode: receives array of SelectedFile
   */
  onSelect?: (files: SelectedFile | SelectedFile[]) => void

  /**
   * Callback when selection is confirmed (e.g., "Select" button clicked).
   * Useful for modal mode where you want explicit confirmation.
   */
  onConfirm?: (files: SelectedFile[]) => void

  /**
   * Callback when browser is closed/cancelled.
   * Useful for modal mode.
   */
  onClose?: () => void

  /**
   * Whether to show trash functionality.
   * @default true
   */
  showTrash?: boolean

  /**
   * Whether to show upload button/functionality.
   * @default true
   */
  showUpload?: boolean

  /**
   * Whether to show create folder functionality.
   * @default true
   */
  showCreateFolder?: boolean

  /**
   * Initial folder ID to open.
   * If not provided, starts at root.
   */
  initialFolderId?: string | null

  /**
   * Custom title for the browser.
   * If not provided, uses "Storage" or "Select File" based on mode.
   */
  title?: string

  /**
   * Custom subtitle/description.
   */
  subtitle?: string

  /**
   * Whether this is embedded in a modal.
   * Affects styling and behavior (e.g., no page navigation).
   * @default false
   */
  isModal?: boolean

  /**
   * Custom class name for the container.
   */
  className?: string

  /**
   * Maximum number of files that can be selected in multi-select mode.
   * @default undefined (unlimited)
   */
  maxSelection?: number

  /**
   * Text for the confirm button (only shown in select/multi-select modes).
   * @default "Select"
   */
  confirmButtonText?: string

  /**
   * Text for the cancel button (only shown when isModal is true).
   * @default "Cancel"
   */
  cancelButtonText?: string
}

// ============================================================================
// STORAGE BROWSER MODAL PROPS
// ============================================================================

export interface StorageBrowserModalProps extends Omit<StorageBrowserProps, 'isModal' | 'onClose'> {
  /** Whether the modal is open */
  open: boolean
  /** Callback when modal closes */
  onOpenChange: (open: boolean) => void
}
