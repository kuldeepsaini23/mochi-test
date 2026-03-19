/**
 * ============================================================================
 * CMS MODAL - Full-Screen Content Management (Builder-Style)
 * ============================================================================
 *
 * Full-screen CMS interface matching the builder's compact design language.
 * Header style matches builder-header.tsx for visual consistency.
 *
 * LAYOUT:
 * - Compact header (40px) matching builder style
 * - Collapsible sidebar with server-side search (handled by TableList)
 * - Excel-like data grid with inline editing
 *
 * ARCHITECTURE:
 * - TableList handles its own data fetching with pagination/search
 * - Selected table fetched separately via getTable query
 * - Clean separation of concerns for better performance
 *
 * ============================================================================
 */

'use client'

import { useState, useCallback } from 'react'
import {
  X,
  Database,
  Plus,
  PanelLeftClose,
  PanelLeft,
  ChevronRight,
  ImageIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/react-provider'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { StorageBrowserModal } from '@/components/storage-browser/storage-browser-modal'
import { TableList } from './table-list'
import { TableView } from './table-view'
import { CreateTableDialog } from './create-table-dialog'
import { FeatureGate } from '@/components/feature-gate'

interface CmsModalProps {
  isOpen: boolean
  onClose: () => void
  organizationId: string
}

/**
 * Full-screen CMS modal with builder-matching design.
 * Table list data fetching is delegated to the TableList component
 * for better separation of concerns and server-side search support.
 */
export function CmsModal({ isOpen, onClose, organizationId }: CmsModalProps) {
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showStorageBrowser, setShowStorageBrowser] = useState(false)

  /**
   * Open the create table dialog.
   * Feature gating is handled by FeatureGate wrapping the create buttons.
   */
  const handleOpenCreateDialog = useCallback(() => {
    setShowCreateDialog(true)
  }, [])

  /**
   * Fetch the currently selected table with columns.
   * Only fetches when a table is selected and modal is open.
   */
  const { data: selectedTable } = trpc.cms.getTable.useQuery(
    { organizationId, tableId: selectedTableId! },
    { enabled: isOpen && !!selectedTableId }
  )

  const handleSelectTable = useCallback((tableId: string) => {
    setSelectedTableId(tableId)
    // Auto-close sidebar on mobile
    if (window.innerWidth < 768) {
      setSidebarOpen(false)
    }
  }, [])

  const handleTableDeleted = useCallback(
    (deletedTableId: string) => {
      if (selectedTableId === deletedTableId) {
        setSelectedTableId(null)
      }
    },
    [selectedTableId]
  )

  const handleTableCreated = useCallback((newTableId: string) => {
    setSelectedTableId(newTableId)
    setShowCreateDialog(false)
  }, [])

  if (!isOpen) return null

  return (
    <>
      {/* Full-screen overlay */}
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        {/* Header - Matches builder-header.tsx style (40px height, compact) */}
        <header className="relative z-50 flex items-center justify-between px-4 border-b border-border bg-background text-muted-foreground text-[13px] font-sans h-10 shrink-0">
          <TooltipProvider delayDuration={300}>
            {/* Left side */}
            <div className="flex items-center gap-2">
              {/* Sidebar toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>{sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}</p>
                </TooltipContent>
              </Tooltip>

              {/* Divider */}
              <div className="w-px h-4 bg-border" />

              {/* CMS branding */}
              <div className="flex items-center gap-1.5">
                <Database size={14} className="text-muted-foreground" />
                <span className="text-foreground font-medium">CMS</span>
              </div>

              {/* Show selected table name */}
              {selectedTable && (
                <>
                  <ChevronRight size={14} className="text-muted-foreground/50" />
                  <span className="text-foreground font-medium truncate max-w-[200px]">
                    {selectedTable.name}
                  </span>
                </>
              )}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-1">
              {/* Media storage button - opens storage browser for quick file access */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setShowStorageBrowser(true)}
                    className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <ImageIcon size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Media Storage</p>
                </TooltipContent>
              </Tooltip>

              {/* Divider */}
              <div className="w-px h-4 bg-border mx-1" />

              {/* New table button - FeatureGate intercepts click when at CMS table limit */}
              <FeatureGate feature="cms_tables.limit">
                <button
                  onClick={handleOpenCreateDialog}
                  className="flex items-center gap-1.5 h-7 px-2 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-xs"
                >
                  <Plus size={14} />
                  <span className="hidden sm:inline">New Table</span>
                </button>
              </FeatureGate>

              {/* Divider */}
              <div className="w-px h-4 bg-border mx-1" />

              {/* Close button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onClose}
                    className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <X size={16} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>Close CMS</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </header>

        {/* Main content - no gap between header and content */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Sidebar - TableList handles its own data fetching */}
          <aside
            className={cn(
              'border-r border-border flex flex-col transition-all duration-200 shrink-0',
              sidebarOpen ? 'w-56' : 'w-0',
              // Mobile: fixed position below header. Desktop: relative in flow
              'fixed md:relative top-10 md:top-0 bottom-0 left-0 z-40 md:z-auto',
              !sidebarOpen && 'border-r-0 overflow-hidden'
            )}
          >
            {sidebarOpen && (
              <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-background">
                <TableList
                  organizationId={organizationId}
                  selectedTableId={selectedTableId}
                  onSelectTable={handleSelectTable}
                  onTableDeleted={handleTableDeleted}
                />
              </div>
            )}
          </aside>

          {/* Mobile backdrop */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 top-[40px] bg-black/50 z-30 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          {/* Content area - fills remaining space */}
          <main className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">
            {selectedTable ? (
              <TableView
                table={selectedTable}
                organizationId={organizationId}
                isSystemTable={selectedTable.isSystemTable ?? false}
              />
            ) : (
              <EmptyState onCreateTable={handleOpenCreateDialog} />
            )}
          </main>
        </div>
      </div>

      {/* Create Table Dialog */}
      <CreateTableDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={handleTableCreated}
        organizationId={organizationId}
      />

      {/* Storage Browser Modal - Quick access to media files */}
      <StorageBrowserModal
        open={showStorageBrowser}
        onOpenChange={setShowStorageBrowser}
        organizationId={organizationId}
        mode="browse"
        title="Media Storage"
        subtitle="Browse and manage your media files"
      />

    </>
  )
}

/**
 * Empty state shown when no table is selected.
 * Prompts user to select or create a table.
 */
function EmptyState({ onCreateTable }: { onCreateTable: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <div className="w-14 h-14 rounded-full bg-muted/30 flex items-center justify-center mb-5">
        <Database className="w-6 h-6 text-muted-foreground/30" />
      </div>
      <p className="text-sm font-medium text-foreground/80 mb-1.5">
        Select a table
      </p>
      <p className="text-xs text-muted-foreground/60 mb-5 max-w-[220px]">
        Choose a table from the sidebar to view its data, or create a new one
      </p>
      {/* FeatureGate intercepts click when CMS table limit is reached */}
      <FeatureGate feature="cms_tables.limit">
        <button
          onClick={onCreateTable}
          className="inline-flex items-center gap-1.5 h-8 px-4 rounded-md bg-foreground text-background text-xs font-medium hover:bg-foreground/90 transition-colors"
        >
          <Plus size={14} />
          Create Table
        </button>
      </FeatureGate>
    </div>
  )
}
