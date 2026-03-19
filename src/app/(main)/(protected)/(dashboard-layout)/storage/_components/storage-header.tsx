/**
 * STORAGE HEADER COMPONENT
 *
 * Top header bar for the storage page with:
 * - Breadcrumb navigation
 * - Search input
 * - View toggle (grid/list)
 * - Upload button
 */

'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronRight,
  Grid3X3,
  List,
  Search,
  Upload,
  FolderPlus,
  Home,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { FeatureGate } from '@/components/feature-gate'

// ============================================================================
// TYPES
// ============================================================================

export type ViewMode = 'grid' | 'list'

interface Breadcrumb {
  id: string
  name: string
}

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

interface StorageHeaderProps {
  /** Current folder breadcrumb path */
  breadcrumb?: Breadcrumb[]
  /** Current view mode */
  viewMode: ViewMode
  /** View mode change handler */
  onViewModeChange: (mode: ViewMode) => void
  /** Search handler */
  onSearch: (query: string) => void
  /** Upload button click handler */
  onUpload: () => void
  /** New folder button click handler */
  onNewFolder: () => void
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
  /** Storage usage data from feature gate */
  storageUsage?: StorageUsageData | null
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StorageHeader({
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
  storageUsage,
}: StorageHeaderProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Sync local search with parent when searchQuery prop changes (e.g., navigation)
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
   * Handle search input with proper debouncing.
   * Uses a ref to track the timeout so we can cancel previous pending searches.
   * 400ms delay provides good balance between responsiveness and performance.
   */
  const handleSearchChange = useCallback((value: string) => {
    setLocalSearch(value)

    // Clear any pending debounced search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    // Debounce the actual search call
    debounceRef.current = setTimeout(() => {
      onSearch(value)
    }, 400) // 400ms debounce - fast enough to feel responsive, slow enough to avoid spam
  }, [onSearch])

  return (
    <div className="flex flex-col gap-4 mb-6">
      {/* Top row: Title and actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-2xl font-semibold">
              {isTrashView ? 'Trash' : 'Storage'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isTrashView
                ? 'Items here will be permanently deleted after 30 days'
                : 'Upload and manage your files'}
            </p>
          </div>

          {/* Storage usage indicator — shows how much of the plan quota is used */}
          {!isTrashView && storageUsage && !storageUsage.isUnlimited && storageUsage.limit !== null && (
            <StorageUsageBar usage={storageUsage.usage} limit={storageUsage.limit} atLimit={storageUsage.atLimit} />
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Trash toggle button */}
          {onToggleTrash && (
            <Button
              variant={isTrashView ? 'secondary' : 'outline'}
              size="sm"
              onClick={onToggleTrash}
              className="relative"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {isTrashView ? 'Back to Files' : 'Trash'}
              {/* Badge for trash count */}
              {!isTrashView && trashCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                  {trashCount > 99 ? '99+' : trashCount}
                </span>
              )}
            </Button>
          )}

          {/* New folder button - hidden in trash view */}
          {!isTrashView && (
            <Button variant="outline" size="sm" onClick={onNewFolder}>
              <FolderPlus className="w-4 h-4 mr-2" />
              New Folder
            </Button>
          )}

          {/* Upload button - hidden in trash view, gated by storage limit */}
          {!isTrashView && (
            <FeatureGate feature="storage_kb.limit">
              <Button size="sm" onClick={onUpload}>
                <Upload className="w-4 h-4 mr-2" />
                Upload
              </Button>
            </FeatureGate>
          )}
        </div>
      </div>

      {/* Second row: Breadcrumb, search, view toggle - hidden in trash view */}
      {!isTrashView && (
        <div className="flex items-center justify-between gap-4">
          {/* Breadcrumb navigation */}
          <nav className="flex items-center gap-1 text-sm">
            <button
              onClick={() => onNavigate(null)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-md transition-colors',
                'hover:bg-muted',
                breadcrumb.length === 0 && 'font-medium text-foreground'
              )}
            >
              <Home className="w-4 h-4" />
              <span>My Files</span>
            </button>

            {breadcrumb.map((folder, index) => (
              <div key={folder.id} className="flex items-center">
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                <button
                  onClick={() => onNavigate(folder.id)}
                  className={cn(
                    'px-2 py-1 rounded-md transition-colors',
                    'hover:bg-muted',
                    index === breadcrumb.length - 1 && 'font-medium text-foreground'
                  )}
                >
                  {folder.name}
                </button>
              </div>
            ))}
          </nav>

          {/* Right side: Search and view toggle */}
          <div className="flex items-center gap-3">
            {/* Search input - searches globally across all folders */}
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search all files & folders..."
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
              className="bg-muted rounded-md p-1"
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
    <div className="flex items-center gap-3 pl-6 border-l border-border">
      <div className="min-w-[140px]">
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
