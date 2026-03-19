/**
 * Folder Grid Component
 *
 * WHY: Display folders in a grid layout
 * HOW: Clickable folder cards with count info
 */

'use client'

import { Folder, MoreHorizontal, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

type FolderWithCounts = {
  id: string
  name: string
  color: string | null
  _count: {
    forms: number
    children: number
  }
}

interface FolderGridProps {
  folders: FolderWithCounts[]
  onFolderClick: (folderId: string) => void
  onDeleteFolder?: (folderId: string) => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export function FolderGrid({
  folders,
  onFolderClick,
  onDeleteFolder,
}: FolderGridProps) {
  if (folders.length === 0) {
    return null
  }

  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-muted-foreground mb-3">Folders</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {folders.map((folder) => (
          <FolderCard
            key={folder.id}
            folder={folder}
            onClick={() => onFolderClick(folder.id)}
            onDelete={onDeleteFolder ? () => onDeleteFolder(folder.id) : undefined}
          />
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// FOLDER CARD COMPONENT
// ============================================================================

interface FolderCardProps {
  folder: FolderWithCounts
  onClick: () => void
  onDelete?: () => void
}

function FolderCard({ folder, onClick, onDelete }: FolderCardProps) {
  const totalItems = folder._count.forms + folder._count.children

  return (
    <div
      className={cn(
        'group relative rounded-lg border bg-card p-3',
        'hover:bg-accent/50 hover:border-accent cursor-pointer',
        'transition-colors duration-150'
      )}
      onClick={onClick}
    >
      {/* Folder icon and name */}
      <div className="flex items-start gap-2">
        <Folder
          className="h-8 w-8 flex-shrink-0"
          style={{ color: folder.color || 'hsl(var(--primary))' }}
          fill={folder.color || 'hsl(var(--primary))'}
          fillOpacity={0.2}
        />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{folder.name}</p>
          <p className="text-xs text-muted-foreground">
            {totalItems} {totalItems === 1 ? 'item' : 'items'}
          </p>
        </div>
      </div>

      {/* Actions menu */}
      {onDelete && (
        <div
          className={cn(
            'absolute top-2 right-2',
            'opacity-0 group-hover:opacity-100',
            'transition-opacity duration-150'
          )}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Folder actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
}
