/**
 * ============================================================================
 * CMS PAGE CONTENT - Active Organization Pattern
 * ============================================================================
 *
 * WHY: Client component that displays CMS for the active organization
 * HOW: Uses useActiveOrganization hook for org context and permissions
 *
 * Non-modal version of the CMS interface for the Sites > CMS page.
 * Reuses the existing CMS components (TableList, TableView, etc.)
 * but renders within the dashboard layout instead of as a full-screen modal.
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based access control via hasPermission helper
 *
 * LAYOUT:
 * - Compact header with CMS branding and actions
 * - Collapsible sidebar with table list
 * - Excel-like data grid with inline editing
 *
 * PERMISSIONS:
 * - cms:read - Can view CMS tables
 * - cms:create - Can create new tables
 * - cms:update - Can edit table data
 * - cms:delete - Can delete tables
 *
 * SOURCE OF TRUTH: CmsTable, CmsColumn, CmsRow, ActiveOrganization
 * ============================================================================
 */

'use client'

import { useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  Database,
  Plus,
  PanelLeftClose,
  PanelLeft,
  ChevronRight,
  ImageIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/react-provider'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { Skeleton } from '@/components/ui/skeleton'
import { ContentLayout } from '@/components/global/content-layout'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { StorageBrowserModal } from '@/components/storage-browser/storage-browser-modal'
import { TableList } from '@/components/website-builder/builder-v1.2/_components/cms/table-list'
import { TableView } from '@/components/website-builder/builder-v1.2/_components/cms/table-view'
import { CreateTableDialog } from '@/components/website-builder/builder-v1.2/_components/cms/create-table-dialog'
import { FeatureGate } from '@/components/feature-gate'

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * CMS page content that renders within the dashboard layout.
 * Based on CmsModal but without the modal overlay and close button.
 * No props needed - everything is fetched client-side with caching
 */
export function CmsPageContent() {
  /**
   * URL-driven table selection — read the `table` search param so that
   * the selected table persists across navigation and can be shared via URL
   * (e.g. /sites/cms?table=abc123).
   */
  const searchParams = useSearchParams()
  const router = useRouter()
  const selectedTableId = searchParams.get('table')

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showStorageBrowser, setShowStorageBrowser] = useState(false)

  // ============================================================================
  // ORGANIZATION DATA - Using active organization hook
  // ============================================================================
  const { activeOrganization, isLoading, hasPermission } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''

  // ============================================================================
  // PERMISSION CHECKS - Using hasPermission helper from hook
  // ============================================================================
  const hasReadAccess = hasPermission(permissions.CMS_READ)

  // ============================================================================
  // SELECTED TABLE DATA
  // ============================================================================
  /**
   * Fetch the currently selected table with columns.
   * Only fetches when a table is selected and we have an org ID.
   */
  const { data: selectedTable } = trpc.cms.getTable.useQuery(
    { organizationId, tableId: selectedTableId! },
    { enabled: !!selectedTableId && !!organizationId }
  )

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================
  /**
   * Select a table by pushing its ID into the URL search params.
   * This makes the selection shareable and persistent across navigation.
   */
  const handleSelectTable = useCallback((tableId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('table', tableId)
    router.push(`?${params.toString()}`, { scroll: false })
    // Auto-close sidebar on mobile
    if (window.innerWidth < 768) {
      setSidebarOpen(false)
    }
  }, [searchParams, router])

  /**
   * When a table is deleted, clear the URL param if it was the selected one.
   * This prevents the UI from trying to fetch a non-existent table.
   */
  const handleTableDeleted = useCallback(
    (deletedTableId: string) => {
      if (selectedTableId === deletedTableId) {
        const params = new URLSearchParams(searchParams.toString())
        params.delete('table')
        router.push(`?${params.toString()}`, { scroll: false })
      }
    },
    [selectedTableId, searchParams, router]
  )

  /**
   * After creating a new table, push its ID into the URL so
   * the user lands on it immediately and the selection is in the URL.
   */
  const handleTableCreated = useCallback((newTableId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('table', newTableId)
    router.push(`?${params.toString()}`, { scroll: false })
    setShowCreateDialog(false)
  }, [searchParams, router])

  // ============================================================================
  // LOADING STATE - Show skeleton while organization data is being fetched
  // ============================================================================
  if (isLoading && !activeOrganization) {
    return <CmsPageSkeleton />
  }

  // ============================================================================
  // NO ORGANIZATION - User doesn't belong to any organization
  // ============================================================================
  if (!activeOrganization) {
    return (
      <ContentLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-sm text-muted-foreground">
            No organization found. Please contact your administrator.
          </p>
        </div>
      </ContentLayout>
    )
  }

  // ============================================================================
  // NO ACCESS - User doesn't have cms:read permission
  // ============================================================================
  if (!hasReadAccess) {
    return (
      <ContentLayout>
        <div className="flex items-center justify-center h-full p-6">
          <div className="max-w-md text-center space-y-2">
            <p className="text-sm text-destructive font-medium">
              You don&apos;t have permission to view CMS
            </p>
            <p className="text-xs text-muted-foreground">
              Contact your organization owner to grant you the{' '}
              <code className="px-1 py-0.5 bg-muted rounded text-xs">
                cms:read
              </code>{' '}
              permission.
            </p>
          </div>
        </div>
      </ContentLayout>
    )
  }

  // ============================================================================
  // MAIN CONTENT - User has access, render the CMS interface
  // ============================================================================
  return (
    <>
      {/* Outer wrapper — relative + flex-1 fills dashboard flex container, provides positioning context */}
      <div className="relative flex-1 min-h-0 w-full">
        {/* Absolute inner — bypasses CSS height cascade; inset-0 guarantees definite dimensions */}
        <div className="absolute inset-0 p-2 sm:p-4 md:p-6 overflow-hidden">
          {/* Main container — h-full works here because the absolute parent has definite size from inset-0 */}
          <div className="flex flex-col h-full w-full bg-background rounded-lg border border-border overflow-hidden">
          {/* Header - Compact with CMS branding */}
          <header className="relative z-10 flex items-center justify-between px-4 border-b border-border bg-muted/30 text-muted-foreground text-[13px] font-sans h-10 shrink-0">
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
              {/* Media storage button */}
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
                  onClick={() => setShowCreateDialog(true)}
                  className="flex items-center gap-1.5 h-7 px-2 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-xs"
                >
                  <Plus size={14} />
                  <span className="hidden sm:inline">New Table</span>
                </button>
              </FeatureGate>
            </div>
          </TooltipProvider>
        </header>

        {/* Main content area - flex with proper overflow constraints */}
        <div className="flex-1 flex overflow-hidden min-h-0 min-w-0">
          {/* Sidebar - TableList handles its own data fetching */}
          <aside
            className={cn(
              'border-r border-border flex flex-col transition-all duration-200 shrink-0 bg-background',
              sidebarOpen ? 'w-56' : 'w-0',
              !sidebarOpen && 'border-r-0 overflow-hidden'
            )}
          >
            {sidebarOpen && (
              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                <TableList
                  organizationId={organizationId}
                  selectedTableId={selectedTableId}
                  onSelectTable={handleSelectTable}
                  onTableDeleted={handleTableDeleted}
                />
              </div>
            )}
          </aside>

          {/* Content area - fills remaining space with proper overflow constraints */}
          <main className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">
            {selectedTable ? (
              <TableView
                table={selectedTable}
                organizationId={organizationId}
                isSystemTable={selectedTable.isSystemTable ?? false}
              />
            ) : (
              <EmptyState
                onCreateTable={() => setShowCreateDialog(true)}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  </div>

      {/* Create Table Dialog */}
      <CreateTableDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={handleTableCreated}
        organizationId={organizationId}
      />

      {/* Storage Browser Modal */}
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

// ============================================================================
// LOADING SKELETON - Matches the page layout structure
// ============================================================================

/**
 * Loading skeleton for CMS page
 * WHY: Show skeleton that matches the page structure during initial load
 * Provides visual feedback while organization data is being fetched
 */
function CmsPageSkeleton() {
  return (
    <div className="relative flex-1 min-h-0 w-full">
      <div className="absolute inset-0 p-2 sm:p-4 md:p-6 overflow-hidden">
        <div className="flex flex-col h-full w-full bg-background rounded-lg border border-border overflow-hidden">
          {/* Header skeleton */}
          <header className="flex items-center justify-between px-4 border-b border-border bg-muted/30 h-10 shrink-0">
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-7 rounded" />
              <div className="w-px h-4 bg-border" />
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-7 rounded" />
              <Skeleton className="h-7 w-20 rounded" />
            </div>
          </header>

          {/* Content skeleton */}
          <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Sidebar skeleton */}
            <aside className="w-56 border-r border-border p-3 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full rounded" />
              ))}
            </aside>

            {/* Main content skeleton */}
            <main className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-3">
                <Skeleton className="h-14 w-14 rounded-full mx-auto" />
                <Skeleton className="h-4 w-32 mx-auto" />
                <Skeleton className="h-3 w-48 mx-auto" />
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// EMPTY STATE
// ============================================================================

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
