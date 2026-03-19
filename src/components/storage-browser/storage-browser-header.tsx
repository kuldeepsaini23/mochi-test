/**
 * STORAGE BROWSER HEADER COMPONENT
 *
 * Top header bar for the StorageBrowser with:
 * - Custom title/subtitle (or defaults based on mode)
 * - Breadcrumb navigation
 * - Search input
 * - View toggle (grid/list)
 * - Upload/New Folder buttons (when enabled)
 * - Trash toggle (when enabled)
 *
 * This is a reusable version of storage-header.tsx
 * that works with internal state instead of URL params.
 */

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  ChevronRight,
  Grid3X3,
  List,
  Search,
  Upload,
  FolderPlus,
  Home,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FeatureGate } from '@/components/feature-gate'
import { Input } from '@/components/ui/input'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import type { ViewMode, Breadcrumb, SelectionMode, FileTypeFilter } from './types'

// ============================================================================
// TYPES
// ============================================================================

/** Storage usage data from the feature gate system */
interface StorageUsageData {
  /** Current storage used in MB */
  usage: number
  /** Storage limit in MB (null if unlimited) */
  limit: number | null
  /** Whether storage is at capacity */
  atLimit: boolean
  /** Whether plan has unlimited storage */
  isUnlimited: boolean
}

interface StorageBrowserHeaderProps {
  /** Current folder breadcrumb path */
  breadcrumb?: Breadcrumb[]
  /** Current view mode */
  viewMode: ViewMode
  /** View mode change handler */
  onViewModeChange: (mode: ViewMode) => void
  /** Search handler */
  onSearch: (query: string) => void
  /** Upload button click handler */
  onUpload?: () => void
  /** New folder button click handler */
  onNewFolder?: () => void
  /** Navigate to folder handler */
  onNavigate: (folderId: string | null) => void
  /** Current search query */
  searchQuery?: string
  /** Whether we're viewing the trash */
  isTrashView?: boolean
  /** Toggle trash view handler */
  onToggleTrash?: () => void
  /** Number of items in trash (for badge) */
  trashCount?: number
  /** Whether to show upload button */
  showUpload?: boolean
  /** Whether to show create folder button */
  showCreateFolder?: boolean
  /** Whether to show trash button */
  showTrash?: boolean
  /** Custom title */
  title?: string
  /** Custom subtitle */
  subtitle?: string
  /** Selection mode */
  mode?: SelectionMode
  /** File filter active */
  fileFilter?: FileTypeFilter
  /** Whether embedded in modal */
  isModal?: boolean
  /** Close handler for modal */
  onClose?: () => void
  /** Storage usage data from feature gate (for showing usage bar) */
  storageUsage?: StorageUsageData | null
}

// ============================================================================
// FILTER DISPLAY NAME
// ============================================================================

const FILTER_DISPLAY_NAMES: Record<FileTypeFilter, string> = {
  all: 'All Files',
  image: 'Images',
  video: 'Videos',
  audio: 'Audio',
  document: 'Documents',
  archive: 'Archives',
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StorageBrowserHeader({
  breadcrumb = [],
  viewMode,
  onViewModeChange,
  onSearch,
  onUpload,
  onNewFolder,
  onNavigate,
  searchQuery = '',
  isTrashView = false,
  onToggleTrash,
  trashCount = 0,
  showUpload = true,
  showCreateFolder = true,
  showTrash = true,
  title,
  subtitle,
  mode = 'browse',
  fileFilter = 'all',
  isModal = false,
  onClose,
  storageUsage,
}: StorageBrowserHeaderProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Sync local search with parent when searchQuery prop changes
  useEffect(() => {
    setLocalSearch(searchQuery)
  }, [searchQuery])

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  /**
   * Handle search input with debouncing.
   * 400ms delay for good balance between responsiveness and performance.
   */
  const handleSearchChange = useCallback((value: string) => {
    setLocalSearch(value)

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      onSearch(value)
    }, 400)
  }, [onSearch])

  // Generate default title based on mode
  const displayTitle = title || (
    isTrashView ? 'Trash' :
    mode === 'select' ? 'Select File' :
    mode === 'multi-select' ? 'Select Files' :
    'Storage'
  )

  // Generate default subtitle based on mode and filter
  const displaySubtitle = subtitle || (
    isTrashView ? 'Items here will be permanently deleted after 30 days' :
    mode === 'select' || mode === 'multi-select' ? (
      fileFilter !== 'all'
        ? `Choose from ${FILTER_DISPLAY_NAMES[fileFilter].toLowerCase()}`
        : 'Choose files from your storage'
    ) :
    'Upload and manage your files'
  )

  return (
    <div className="flex flex-col gap-3 sm:gap-4 mb-4 sm:mb-6">
      {/* Top row: Title and actions - stacks on mobile */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold truncate">
              {displayTitle}
            </h1>
            {/* Show filter badge when filtering */}
            {fileFilter !== 'all' && !isTrashView && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary shrink-0">
                {FILTER_DISPLAY_NAMES[fileFilter]}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground truncate">
            {displaySubtitle}
          </p>
        </div>

        {/* Storage usage indicator — shows how much of the plan quota is used */}
        {!isTrashView && storageUsage && !storageUsage.isUnlimited && storageUsage.limit !== null && (
          <StorageUsageBar
            usage={storageUsage.usage}
            limit={storageUsage.limit}
            atLimit={storageUsage.atLimit}
          />
        )}

        {/* Action buttons - wrap on smaller screens */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Trash toggle button */}
          {showTrash && onToggleTrash && (
            <Button
              variant={isTrashView ? 'secondary' : 'outline'}
              size="sm"
              onClick={onToggleTrash}
              className="relative"
            >
              <Trash2 className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">
                {isTrashView ? 'Back to Files' : 'Trash'}
              </span>
              {/* Badge for trash count */}
              {!isTrashView && trashCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                  {trashCount > 99 ? '99+' : trashCount}
                </span>
              )}
            </Button>
          )}

          {/* New folder button - hidden in trash view */}
          {!isTrashView && showCreateFolder && onNewFolder && (
            <Button variant="outline" size="sm" onClick={onNewFolder}>
              <FolderPlus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">New Folder</span>
            </Button>
          )}

          {/* Upload button — gated by storage limit, shows upgrade modal when at capacity */}
          {!isTrashView && showUpload && onUpload && (
            <FeatureGate feature="storage_kb.limit">
              <Button size="sm" onClick={onUpload}>
                <Upload className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Upload</span>
              </Button>
            </FeatureGate>
          )}

          {/* Close button for modal */}
          {isModal && onClose && (
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Second row: Breadcrumb, search, view toggle - stacks on mobile */}
      {!isTrashView && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Breadcrumb navigation - scrollable on overflow */}
          <nav className="flex items-center gap-1 text-sm overflow-x-auto pb-1 sm:pb-0 scrollbar-thin">
            <button
              onClick={() => onNavigate(null)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-md transition-colors shrink-0',
                'hover:bg-muted',
                breadcrumb.length === 0 && 'font-medium text-foreground'
              )}
            >
              <Home className="w-4 h-4" />
              <span className="hidden xs:inline">My Files</span>
            </button>

            {breadcrumb.map((folder, index) => (
              <div key={folder.id} className="flex items-center shrink-0">
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                <button
                  onClick={() => onNavigate(folder.id)}
                  className={cn(
                    'px-2 py-1 rounded-md transition-colors truncate max-w-[100px] sm:max-w-[150px]',
                    'hover:bg-muted',
                    index === breadcrumb.length - 1 && 'font-medium text-foreground'
                  )}
                  title={folder.name}
                >
                  {folder.name}
                </button>
              </div>
            ))}
          </nav>

          {/* Right side: Search and view toggle */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Search input - full width on mobile, fixed on desktop */}
            <div className="relative flex-1 sm:flex-none sm:w-48 md:w-56 lg:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder={
                  fileFilter !== 'all'
                    ? `Search ${FILTER_DISPLAY_NAMES[fileFilter].toLowerCase()}...`
                    : 'Search files...'
                }
                value={localSearch}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            {/* View mode toggle */}
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(value) => value && onViewModeChange(value as ViewMode)}
              className="bg-muted rounded-md p-1 shrink-0"
            >
              <ToggleGroupItem
                value="grid"
                aria-label="Grid view"
                className="h-7 w-7 p-0 data-[state=on]:bg-background"
              >
                <Grid3X3 className="w-4 h-4" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="list"
                aria-label="List view"
                className="h-7 w-7 p-0 data-[state=on]:bg-background"
              >
                <List className="w-4 h-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// STORAGE USAGE BAR
// ============================================================================

/**
 * Compact storage usage indicator showing used / total with a colored progress bar.
 *
 * COLOR CODING:
 * - Green (<70%): Plenty of room
 * - Yellow (70-90%): Getting close
 * - Red (>90%): Almost full or at limit
 */
function StorageUsageBar({
  usage,
  limit,
  atLimit,
}: {
  usage: number
  limit: number
  atLimit: boolean
}) {
  const percentage = limit > 0 ? Math.min(100, (usage / limit) * 100) : 0

  /* Format KB to human-readable: KB → MB → GB based on size */
  const formatStorage = (kb: number) => {
    if (kb >= 1024 * 1024) return `${(kb / (1024 * 1024)).toFixed(1)} GB`
    if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`
    return `${Math.round(kb)} KB`
  }

  /* Pick bar color based on fullness percentage */
  const barColor = atLimit || percentage >= 90
    ? 'bg-destructive'
    : percentage >= 70
      ? 'bg-amber-500'
      : 'bg-primary'

  return (
    <div className="flex items-center gap-3 pl-4 sm:pl-6 border-l border-border shrink-0">
      <div className="min-w-[120px] sm:min-w-[140px]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground">Storage</span>
          <span className="text-xs text-muted-foreground">
            {formatStorage(usage)} / {formatStorage(limit)}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-300', barColor)}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  )
}
