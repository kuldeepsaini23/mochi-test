'use client'

/**
 * MOVE TEMPLATE DIALOG COMPONENT
 *
 * Clean, minimal modal for moving email templates to folders.
 * Uses the same folder design and colors as the folder cards.
 *
 * SOURCE OF TRUTH KEYWORDS: MoveEmailTemplateDialog
 */

import { useState, useCallback } from 'react'
import { trpc } from '@/trpc/react-provider'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChevronRight, Loader2, Home } from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

interface MoveTemplateDialogProps {
  open: boolean
  onClose: () => void
  templateId: string
  templateName: string
  organizationId: string
  currentFolderId: string | null
  onMove: (targetFolderId: string | null) => void
  isMoving?: boolean
}

interface FolderTreeItem {
  id: string
  name: string
  color: string | null
  parentId: string | null
  _count: {
    children: number
    templates: number
  }
}

// ============================================================================
// FOLDER ICON
// ============================================================================

/**
 * Folder icon using the same SVG as folder cards
 */
function FolderIcon({ color = '#3f3f46', size = 20 }: { color?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size * 0.75}
      viewBox="0 0 120 90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="flex-shrink-0"
    >
      <path
        d="M8 20C8 15.5817 11.5817 12 16 12H38C40.1217 12 42.1566 12.8429 43.6569 14.3431L48 18.6863C49.5003 20.1866 51.5352 21.0294 53.6569 21.0294H104C108.418 21.0294 112 24.6111 112 29.0294V78C112 82.4183 108.418 86 104 86H16C11.5817 86 8 82.4183 8 78V20Z"
        fill={color}
      />
      <path
        d="M12 28H108V78C108 80.2091 106.209 82 104 82H16C13.7909 82 12 80.2091 12 78V28Z"
        fill="rgba(0,0,0,0.15)"
      />
    </svg>
  )
}

// ============================================================================
// FOLDER ROW
// ============================================================================

interface FolderRowProps {
  folder: FolderTreeItem
  depth: number
  isSelected: boolean
  isCurrent: boolean
  isExpanded: boolean
  hasChildren: boolean
  isLoadingChildren: boolean
  onSelect: () => void
  onToggle: () => void
}

function FolderRow({
  folder,
  depth,
  isSelected,
  isCurrent,
  isExpanded,
  hasChildren,
  isLoadingChildren,
  onSelect,
  onToggle,
}: FolderRowProps) {
  return (
    <div
      className={cn(
        'flex items-center h-10 px-3 rounded-lg cursor-pointer transition-colors',
        'hover:bg-muted',
        isSelected && 'bg-primary/10',
        isCurrent && 'opacity-50 cursor-not-allowed hover:bg-transparent'
      )}
      style={{ paddingLeft: `${12 + depth * 20}px` }}
      onClick={() => !isCurrent && onSelect()}
    >
      {/* Expand/Collapse */}
      <button
        className={cn(
          'w-5 h-5 flex items-center justify-center mr-2 transition-transform duration-200',
          isExpanded && 'rotate-90',
          !hasChildren && 'invisible'
        )}
        onClick={(e) => {
          e.stopPropagation()
          hasChildren && onToggle()
        }}
      >
        {isLoadingChildren ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {/* Folder icon */}
      <FolderIcon color={folder.color || '#3f3f46'} size={20} />

      {/* Name */}
      <span className="ml-3 text-sm truncate flex-1">{folder.name}</span>

      {/* Current badge */}
      {isCurrent && (
        <span className="text-xs text-muted-foreground ml-2">Current</span>
      )}

      {/* Template count */}
      {!isCurrent && folder._count.templates > 0 && (
        <span className="text-xs text-muted-foreground ml-2">
          {folder._count.templates}
        </span>
      )}
    </div>
  )
}

// ============================================================================
// FOLDER NODE (RECURSIVE)
// ============================================================================

interface FolderNodeProps {
  folder: FolderTreeItem
  depth: number
  selectedId: string | null
  currentFolderId: string | null
  expandedIds: Set<string>
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  organizationId: string
}

function FolderNode({
  folder,
  depth,
  selectedId,
  currentFolderId,
  expandedIds,
  onSelect,
  onToggle,
  organizationId,
}: FolderNodeProps) {
  const isExpanded = expandedIds.has(folder.id)
  const hasChildren = folder._count.children > 0

  // Fetch children when expanded
  const { data: children, isLoading } = trpc.emailTemplates.listFolders.useQuery(
    { organizationId, parentId: folder.id },
    { enabled: isExpanded && hasChildren }
  )

  return (
    <>
      <FolderRow
        folder={folder}
        depth={depth}
        isSelected={selectedId === folder.id}
        isCurrent={currentFolderId === folder.id}
        isExpanded={isExpanded}
        hasChildren={hasChildren}
        isLoadingChildren={isLoading}
        onSelect={() => onSelect(folder.id)}
        onToggle={() => onToggle(folder.id)}
      />
      {isExpanded && children?.map((child) => (
        <FolderNode
          key={child.id}
          folder={child}
          depth={depth + 1}
          selectedId={selectedId}
          currentFolderId={currentFolderId}
          expandedIds={expandedIds}
          onSelect={onSelect}
          onToggle={onToggle}
          organizationId={organizationId}
        />
      ))}
    </>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function MoveTemplateDialog({
  open,
  onClose,
  templateId,
  templateName,
  organizationId,
  currentFolderId,
  onMove,
  isMoving = false,
}: MoveTemplateDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Fetch root folders
  const { data: rootFolders, isLoading } = trpc.emailTemplates.listFolders.useQuery(
    { organizationId, parentId: null },
    { enabled: open }
  )

  /**
   * Close and reset state
   */
  const handleClose = useCallback(() => {
    onClose()
    setSelectedId(null)
    setExpandedIds(new Set())
  }, [onClose])

  /**
   * Toggle folder expansion
   */
  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  // Can only move if selected folder is different from current
  const canMove = selectedId !== currentFolderId
  const isRootSelected = selectedId === null
  const isRootCurrent = currentFolderId === null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-4">
          <DialogTitle className="text-base font-semibold">
            Move Template
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1 truncate">
            {templateName}
          </p>
        </DialogHeader>

        {/* Folder List */}
        <ScrollArea className="h-[320px] px-2">
          <div className="space-y-0.5 pb-2">
            {/* Root / All Templates */}
            <div
              className={cn(
                'flex items-center h-10 px-3 rounded-lg cursor-pointer transition-colors',
                'hover:bg-muted',
                isRootSelected && 'bg-primary/10',
                isRootCurrent && 'opacity-50 cursor-not-allowed hover:bg-transparent'
              )}
              onClick={() => !isRootCurrent && setSelectedId(null)}
            >
              <div className="w-5 h-5 mr-2" />
              <div className="w-5 h-5 flex items-center justify-center mr-3">
                <Home className="w-5 h-5 text-primary" />
              </div>
              <span className="text-sm flex-1">All Templates (Root)</span>
              {isRootCurrent && (
                <span className="text-xs text-muted-foreground">Current</span>
              )}
            </div>

            {/* Divider */}
            {rootFolders && rootFolders.length > 0 && (
              <div className="h-px bg-border mx-3 my-2" />
            )}

            {/* Loading */}
            {isLoading && (
              <div className="flex justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Empty state */}
            {!isLoading && (!rootFolders || rootFolders.length === 0) && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FolderIcon color="#3f3f46" size={32} />
                <p className="text-sm text-muted-foreground mt-3">No folders yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Create folders to organize your templates
                </p>
              </div>
            )}

            {/* Folder tree */}
            {!isLoading && rootFolders?.map((folder) => (
              <FolderNode
                key={folder.id}
                folder={folder}
                depth={0}
                selectedId={selectedId}
                currentFolderId={currentFolderId}
                expandedIds={expandedIds}
                onSelect={setSelectedId}
                onToggle={handleToggle}
                organizationId={organizationId}
              />
            ))}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isMoving}
          >
            Cancel
          </Button>
          <Button
            onClick={() => onMove(selectedId)}
            disabled={!canMove || isMoving}
          >
            {isMoving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Moving...
              </>
            ) : (
              'Move'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
