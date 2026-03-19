/**
 * FOLDER CARD COMPONENT
 *
 * A minimal, modern folder card component inspired by macOS/Google Drive.
 * Features a realistic folder shape with a subtle "page sticking out"
 * effect when the folder contains files.
 *
 * DESIGN FEATURES:
 * - Dark glass-morphism aesthetic
 * - Subtle page peek for non-empty folders
 * - Hover animations
 * - Integration icons display (like Drive/Notion badges)
 * - Compact, reasonable sizing
 * - Inline rename on double-click (same UX as files)
 * - Edit modal for name and color changes
 */

'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { MoreHorizontal, Folder, Pencil, Palette } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

// ============================================================================
// TYPES
// ============================================================================

interface FolderCardProps {
  /** Folder ID */
  id: string
  /** Folder name to display */
  name: string
  /** Number of files inside (shows page peek if > 0) */
  fileCount?: number
  /** Folder color (hex) */
  color?: string
  /** Integration icons to display (e.g., Google Drive, Notion logos) */
  integrationIcons?: React.ReactNode[]
  /** Whether the folder is selected */
  isSelected?: boolean
  /** Click handler for opening the folder */
  onClick?: () => void
  /** Double-click handler */
  onDoubleClick?: () => void
  /**
   * Rename handler - receives new name
   * Called when user finishes inline editing
   */
  onRename?: (newName: string) => void
  /** Whether rename is in progress (for loading state) */
  isRenaming?: boolean
  /** Delete handler */
  onDelete?: () => void
  /** Move handler */
  onMove?: () => void
  /**
   * Edit handler - opens edit modal for name and color
   * Called from dropdown menu "Edit" option
   */
  onEdit?: () => void
  /** Additional className */
  className?: string
}

// ============================================================================
// FOLDER ICON SVG
// ============================================================================

/**
 * Custom folder SVG with glass-morphism effect
 * Clean, minimal folder design
 */
function FolderShape({
  color = '#3f3f46',
}: {
  color?: string
}) {
  return (
    <div className="relative w-full aspect-[4/3]">
      {/* Main folder body */}
      <svg
        viewBox="0 0 120 90"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-lg"
      >
        {/* Folder back */}
        <path
          d="M8 20C8 15.5817 11.5817 12 16 12H42C44.6522 12 47.1957 13.0536 49.0711 14.9289L54 20H104C108.418 20 112 23.5817 112 28V78C112 82.4183 108.418 86 104 86H16C11.5817 86 8 82.4183 8 78V20Z"
          fill={color}
          fillOpacity="0.9"
        />
        {/* Folder tab */}
        <path
          d="M8 20C8 15.5817 11.5817 12 16 12H38C40.1217 12 42.1566 12.8429 43.6569 14.3431L48 18.6863C49.5003 20.1866 51.5352 21.0294 53.6569 21.0294H104C108.418 21.0294 112 24.6111 112 29.0294V78C112 82.4183 108.418 86 104 86H16C11.5817 86 8 82.4183 8 78V20Z"
          fill={color}
        />
        {/* Subtle highlight on top edge */}
        <path
          d="M16 12H38C40.1217 12 42.1566 12.8429 43.6569 14.3431L48 18.6863C49.5003 20.1866 51.5352 21.0294 53.6569 21.0294H104C106.209 21.0294 108.209 22.0723 109.536 23.6863"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Inner shadow for depth */}
        <path
          d="M12 28H108V78C108 80.2091 106.209 82 104 82H16C13.7909 82 12 80.2091 12 78V28Z"
          fill="rgba(0,0,0,0.15)"
        />
      </svg>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * FolderCard Component
 *
 * Displays a folder in the file manager grid with modern styling.
 * Includes context menu for folder actions and inline rename on double-click.
 *
 * @example
 * <FolderCard
 *   id="folder_123"
 *   name="Documents"
 *   fileCount={15}
 *   onClick={() => openFolder('folder_123')}
 *   onRename={(newName) => renameFolder('folder_123', newName)}
 *   onEdit={() => openEditModal('folder_123')}
 * />
 */
export function FolderCard({
  id,
  name,
  fileCount = 0,
  color,
  integrationIcons,
  isSelected,
  onClick,
  onDoubleClick,
  onRename,
  isRenaming,
  onDelete,
  onMove,
  onEdit,
  className,
}: FolderCardProps) {
  // State for inline name editing
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Reset edit name when name prop changes (e.g., after successful rename)
  useEffect(() => {
    setEditName(name)
  }, [name])

  /**
   * Enter edit mode on double-click on name
   */
  const handleNameDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onRename) return
    setIsEditing(true)
  }, [onRename])

  /**
   * Save the new name
   */
  const handleSaveName = useCallback(() => {
    const trimmedName = editName.trim()
    if (trimmedName && trimmedName !== name) {
      onRename?.(trimmedName)
    }
    setIsEditing(false)
  }, [editName, name, onRename])

  /**
   * Cancel editing and reset name
   */
  const handleCancelEdit = useCallback(() => {
    setEditName(name)
    setIsEditing(false)
  }, [name])

  /**
   * Handle keyboard events in edit mode
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSaveName()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelEdit()
    }
  }, [handleSaveName, handleCancelEdit])

  return (
    <div
      className={cn(
        'group relative flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer transition-all duration-200',
        'hover:bg-muted/50',
        isSelected && 'bg-muted ring-2 ring-primary/50',
        className
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {/* Context menu trigger (top right) */}
      <DropdownMenu modal={true}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity',
              'hover:bg-muted'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-48"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              // Enter inline edit mode
              setIsEditing(true)
            }}
          >
            <Pencil className="w-4 h-4 mr-2" />
            Rename
          </DropdownMenuItem>
          {/* Edit option - opens modal for name + color */}
          {onEdit && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
            >
              <Palette className="w-4 h-4 mr-2" />
              Edit Folder
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              onMove?.()
            }}
          >
            Move to...
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              onDelete?.()
            }}
            className="text-destructive focus:text-destructive"
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Folder icon */}
      <div className="w-20 h-auto">
        <FolderShape color={color} />
      </div>

      {/* Integration icons (positioned at bottom of folder) */}
      {integrationIcons && integrationIcons.length > 0 && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex -space-x-1">
          {integrationIcons.slice(0, 3).map((icon, index) => (
            <div
              key={index}
              className="w-5 h-5 rounded-full bg-background border border-border flex items-center justify-center"
            >
              {icon}
            </div>
          ))}
        </div>
      )}

      {/* Folder name and file count with inline rename */}
      {/*
       * IMPORTANT: This entire section stops click propagation to prevent
       * navigation when user is trying to interact with the name area.
       * Double-click enters edit mode, single clicks do nothing here.
       */}
      <div
        className="flex flex-col items-center text-center max-w-full"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {isEditing ? (
          // Inline edit mode
          <input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSaveName}
            onClick={(e) => e.stopPropagation()}
            disabled={isRenaming}
            className={cn(
              'w-full max-w-[100px] text-sm font-medium bg-transparent text-center',
              'border-b border-primary outline-none',
              'focus:border-primary',
              isRenaming && 'opacity-50'
            )}
          />
        ) : (
          // Display mode - double-click to edit
          <span
            className={cn(
              'text-sm font-medium truncate max-w-[100px]',
              onRename && 'cursor-text hover:bg-muted/50 rounded px-1 transition-colors'
            )}
            title={`${name} (double-click to rename)`}
            onDoubleClick={handleNameDoubleClick}
          >
            {name}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {fileCount} {fileCount === 1 ? 'File' : 'Files'}
        </span>
      </div>
    </div>
  )
}

// ============================================================================
// FOLDER GRID COMPONENT
// ============================================================================

interface FolderGridProps {
  children: React.ReactNode
  className?: string
}

/**
 * Grid layout for folder cards
 * Responsive grid that adapts to screen size
 */
export function FolderGrid({ children, className }: FolderGridProps) {
  return (
    <div
      className={cn(
        'grid gap-2',
        'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
        className
      )}
    >
      {children}
    </div>
  )
}

// ============================================================================
// CREATE FOLDER BUTTON
// ============================================================================

interface CreateFolderButtonProps {
  onClick?: () => void
  className?: string
}

/**
 * Button to create a new folder
 * Styled to match folder cards but with dashed border
 */
export function CreateFolderButton({ onClick, className }: CreateFolderButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-2 p-3 rounded-xl',
        'border-2 border-dashed border-muted-foreground/30',
        'hover:border-primary/50 hover:bg-muted/30',
        'transition-all duration-200 cursor-pointer',
        'min-h-[120px]',
        className
      )}
    >
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
        <Folder className="w-6 h-6 text-muted-foreground" />
      </div>
      <span className="text-sm text-muted-foreground">New Folder</span>
    </button>
  )
}

// ============================================================================
// FOLDER CARD SKELETON
// ============================================================================

interface FolderCardSkeletonProps {
  className?: string
}

/**
 * Loading skeleton that matches FolderCard layout EXACTLY.
 * Uses identical wrapper classes and dimensions for seamless transition.
 */
export function FolderCardSkeleton({ className }: FolderCardSkeletonProps) {
  return (
    <div
      className={cn(
        // Exact same wrapper classes as FolderCard
        'group relative flex flex-col items-center gap-2 p-3 rounded-xl',
        className
      )}
    >
      {/* Folder icon placeholder - exact same dimensions as FolderShape */}
      <div className="w-20 h-auto">
        <div className="relative w-full aspect-[4/3]">
          {/* Subtle folder shape using muted background */}
          <svg
            viewBox="0 0 120 90"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full animate-pulse"
          >
            <path
              d="M8 20C8 15.5817 11.5817 12 16 12H38C40.1217 12 42.1566 12.8429 43.6569 14.3431L48 18.6863C49.5003 20.1866 51.5352 21.0294 53.6569 21.0294H104C108.418 21.0294 112 24.6111 112 29.0294V78C112 82.4183 108.418 86 104 86H16C11.5817 86 8 82.4183 8 78V20Z"
              className="fill-muted"
            />
          </svg>
        </div>
      </div>

      {/* Name and file count - exact same wrapper as FolderCard */}
      <div className="flex flex-col items-center text-center max-w-full gap-1">
        {/* Name placeholder - matches text-sm height */}
        <div className="h-[14px] w-16 rounded bg-muted animate-pulse" />
        {/* File count placeholder - matches text-xs height */}
        <div className="h-[12px] w-10 rounded bg-muted/60 animate-pulse" />
      </div>
    </div>
  )
}
