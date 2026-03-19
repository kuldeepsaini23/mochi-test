/**
 * ============================================================================
 * PAGES PANEL - Page Management Component for Sidebar
 * ============================================================================
 *
 * Displays and manages all pages in the project.
 *
 * FEATURES:
 * - List of pages with page icon and name
 * - Click to switch between pages
 * - Double-click to rename page inline
 * - + button to create new page
 * - Active page highlighted
 *
 * ============================================================================
 * WHY PAGES?
 * ============================================================================
 *
 * Each page encapsulates:
 * - One page element + all child elements
 * - Its own viewport (pan/zoom)
 * - Its own undo/redo history (LOCAL to the page)
 *
 * This mirrors Figma's page system where each page has independent history.
 *
 * ============================================================================
 */

'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Plus, FileText, Trash2, Copy, Loader2, Database, ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  useAppDispatch,
  useAppSelector,
  selectPageInfos,
  selectActivePageId,
  createPage,
  switchPage,
  renamePage,
  deletePage,
  duplicatePage,
  useBuilderContext,
} from '../../_lib'
import { store } from '../../_lib/store'
import type { PageInfo } from '../../_lib/types'
import { trpc } from '@/trpc/react-provider'
import { FeatureGate } from '@/components/feature-gate'

// ============================================================================
// PAGE ITEM COMPONENT - Individual page row with rename capability
// ============================================================================

interface PageItemProps {
  /** Page info data */
  page: PageInfo
  /** Whether this page is currently active */
  isActive: boolean
  /** Whether this is the only page (can't delete) */
  isOnlyPage: boolean
  /** Whether this page is currently being duplicated (shows loading state) */
  isDuplicating: boolean
  /** Whether this is an E-commerce page (can't delete from here) */
  isEcommercePage: boolean
  /** Callback when page is clicked (to switch) */
  onSwitch: () => void
  /** Callback when page name is changed */
  onRename: (newName: string) => void
  /** Callback when delete is requested */
  onDeleteRequest: () => void
  /** Callback when duplicate is requested */
  onDuplicateRequest: () => void
}

function PageItem({
  page,
  isActive,
  isOnlyPage,
  isDuplicating,
  isEcommercePage,
  onSwitch,
  onRename,
  onDeleteRequest,
  onDuplicateRequest,
}: PageItemProps) {
  // Track if we're in rename mode (double-click to edit)
  const [isEditing, setIsEditing] = useState(false)
  // Local state for the name during editing
  const [editName, setEditName] = useState(page.name)
  // Ref to the input for auto-focus
  const inputRef = useRef<HTMLInputElement>(null)
  // Track hover state for showing delete button
  const [isHovered, setIsHovered] = useState(false)

  // Auto-focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  /**
   * Handle double-click to start editing the page name.
   */
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditName(page.name)
    setIsEditing(true)
  }

  /**
   * Handle blur (click away) - save the name if changed.
   */
  const handleBlur = () => {
    setIsEditing(false)
    const trimmedName = editName.trim()
    if (trimmedName && trimmedName !== page.name) {
      onRename(trimmedName)
    }
  }

  /**
   * Handle keyboard events in the input.
   * - Enter: Save and exit edit mode
   * - Escape: Cancel and exit edit mode
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleBlur()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
      setEditName(page.name) // Reset to original
    }
  }

  /**
   * Handle delete button click.
   * Stops propagation to prevent switching pages.
   */
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDeleteRequest()
  }

  /**
   * Handle duplicate button click.
   * Stops propagation to prevent switching pages.
   */
  const handleDuplicateClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDuplicateRequest()
  }

  return (
    <div
      onClick={onSwitch}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        // Base styling
        'flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer',
        'transition-colors duration-150',
        // Active state - highlighted
        isActive
          ? 'bg-primary/20 text-foreground'
          : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground',
        // Disabled state when duplicating
        isDuplicating && 'opacity-50 pointer-events-none'
      )}
    >
      {/* Page icon - shows spinner when duplicating, database icon for dynamic pages */}
      {isDuplicating ? (
        <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-primary" />
      ) : page.cmsTableId ? (
        <span title="Dynamic page (connected to CMS)">
          <Database className="h-4 w-4 flex-shrink-0 text-primary" />
        </span>
      ) : (
        <FileText className="h-4 w-4 flex-shrink-0" />
      )}

      {/* Page name - editable on double-click */}
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'flex-1 bg-transparent border-none outline-none',
            'text-sm font-medium',
            'px-1 py-0 -my-0.5',
            'ring-1 ring-primary/50 rounded'
          )}
        />
      ) : (
        <span
          onDoubleClick={handleDoubleClick}
          className="flex-1 text-sm font-medium truncate"
        >
          {page.name}
        </span>
      )}

      {/* Action buttons - visible on hover, hidden during edit/duplicating */}
      {!isEditing && !isDuplicating && (
        <div className={cn(
          'flex items-center gap-0.5 transition-opacity',
          isHovered ? 'opacity-100' : 'opacity-0'
        )}>
          {/* Duplicate button - hidden for E-commerce pages */}
          {!isEcommercePage && (
            <button
              onClick={handleDuplicateClick}
              className={cn(
                'p-1 rounded transition-colors',
                'text-muted-foreground/50 hover:text-primary hover:bg-primary/10'
              )}
              title="Duplicate page"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Delete button - hidden for E-commerce pages and if only page */}
          {!isOnlyPage && !isEcommercePage && (
            <button
              onClick={handleDeleteClick}
              className={cn(
                'p-1 rounded transition-colors',
                'text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10'
              )}
              title="Delete page"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// PAGES PANEL COMPONENT - Main panel for the sidebar
// ============================================================================

export function PagesPanel() {
  const dispatch = useAppDispatch()

  // Get organization ID, website ID, domain ID and navigation utility from builder context
  const { navigateToPage, organizationId, websiteId, domainId } = useBuilderContext()

  // Get all pages and the active page ID
  const pageInfos = useAppSelector(selectPageInfos)
  const activePageId = useAppSelector(selectActivePageId)

  // ============================================================================
  // E-COMMERCE PAGES SECTION
  // ============================================================================
  // SOURCE OF TRUTH: isEcommercePage flag in PageInfo
  //
  // The isEcommercePage flag is loaded with the pages from the database,
  // so we can split them locally without an extra query.
  // This eliminates the 10-second delay that occurred when waiting for
  // a separate tRPC query to determine which pages were e-commerce pages.
  // ============================================================================

  // Split pages into regular pages and E-commerce pages using the flag
  // No separate query needed - isEcommercePage is already loaded with page data
  const { regularPages, ecommercePagesInStore } = useMemo(() => {
    const regular: typeof pageInfos = []
    const ecommerce: typeof pageInfos = []

    for (const page of pageInfos) {
      if (page.isEcommercePage) {
        ecommerce.push(page)
      } else {
        regular.push(page)
      }
    }

    return { regularPages: regular, ecommercePagesInStore: ecommerce }
  }, [pageInfos])

  // State for delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pageToDelete, setPageToDelete] = useState<PageInfo | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // State for duplicate confirmation dialog
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)
  const [pageToDuplicate, setPageToDuplicate] = useState<PageInfo | null>(null)
  const [isDuplicating, setIsDuplicating] = useState(false)
  // Track which page ID is being duplicated (for loading state in the list)
  const [duplicatingPageId, setDuplicatingPageId] = useState<string | null>(null)

  // State for tracking page creation
  const [isCreating, setIsCreating] = useState(false)

  /**
   * tRPC mutation to save a new page to the database.
   * This is called IMMEDIATELY after creating a new page in Redux.
   *
   * ============================================================================
   * CRITICAL: Immediate Save for New Pages
   * ============================================================================
   *
   * WHY IMMEDIATE SAVE:
   * - Auto-save is debounced (1.5 seconds)
   * - If user tries to publish before debounce completes, page doesn't exist in DB
   * - This causes "Page not found" errors
   *
   * HOW IT WORKS:
   * 1. Page is created in Redux with client-generated ID (e.g., page_1234_abcd)
   * 2. We immediately call saveCanvas with the new page data
   * 3. Database upsert creates the new Page with that ID
   * 4. Now the page exists and can be published, fetched, etc.
   *
   * NOTE: Feature limit enforcement is handled client-side by the FeatureGate
   * wrapper on the "Add Page" and "Duplicate Page" buttons. Server-side
   * enforcement via withFeatureGate() acts as a safety net.
   */
  const saveNewPageMutation = trpc.pages.saveCanvas.useMutation()

  /**
   * tRPC mutation to delete the page from the database.
   * This is called AFTER the Redux state is updated (optimistic UI).
   */
  const deletePageMutation = trpc.pages.delete.useMutation()

  /**
   * Handle creating a new page.
   * Generates a human-readable name ("Page 2") and a UNIQUE random slug.
   *
   * ============================================================================
   * CRITICAL: Immediate Save to Database
   * ============================================================================
   *
   * When creating a new page:
   * 1. Create page in Redux (optimistic - UI updates immediately)
   * 2. IMMEDIATELY save to database (don't wait for auto-save debounce)
   *
   * WHY IMMEDIATE SAVE:
   * - Auto-save is debounced (1.5 seconds)
   * - If user tries to publish before debounce completes, page doesn't exist in DB
   * - This causes "Page not found" errors
   *
   * IMPORTANT: Slugs must be unique to avoid routing conflicts.
   * We use a random ID instead of sequential numbers to guarantee uniqueness.
   */
  const handleCreatePage = async () => {
    // Feature gate limit check is handled by the FeatureGate wrapper
    // around the "Add Page" button — it intercepts clicks when at limit.

    // Prevent multiple clicks while creating
    if (isCreating) return
    setIsCreating(true)

    try {
      // Find the next available page number for the display name
      const existingNumbers = pageInfos
        .map((p) => {
          const match = p.name.match(/^Page (\d+)$/)
          return match ? parseInt(match[1], 10) : 0
        })
        .filter((n) => n > 0)

      const nextNumber = existingNumbers.length > 0
        ? Math.max(...existingNumbers) + 1
        : pageInfos.length + 1

      // Generate human-readable name
      const pageName = `Page ${nextNumber}`

      // Generate UNIQUE random slug (8 chars should be sufficient)
      // Using timestamp + random for cross-browser compatibility
      const uniqueId = `${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`
      const pageSlug = `/page-${uniqueId}`

      // Create the page in Redux (this also switches to it by default)
      dispatch(createPage({ name: pageName, slug: pageSlug }))

      // Get the new page from Redux state AFTER dispatching
      // The new active page ID is the one we just created
      const state = store.getState()
      const newPageId = state.canvas.pages.activePageId
      const newPage = state.canvas.pages.pages[newPageId]

      if (newPage && organizationId && websiteId && domainId) {
        // IMMEDIATELY save the new page to the database
        // This ensures the page exists before any other operations (publish, etc.)
        await saveNewPageMutation.mutateAsync({
          organizationId,
          pageId: newPageId,
          websiteId,
          domainId,
          name: newPage.info.name,
          slug: newPage.info.slug.replace(/^\//, ''), // Remove leading slash
          canvasData: {
            elements: newPage.canvas.elements,
            rootIds: newPage.canvas.rootIds,
            childrenMap: newPage.canvas.childrenMap,
            viewport: { panX: 0, panY: 0, zoom: 1 },
            selection: { selectedIds: [] },
            history: { past: [], future: [], maxSize: 50 },
          },
        })
      }

      // Navigate to the new page's URL
      navigateToPage(pageSlug)
    } catch (error) {
      // Error creating page
    } finally {
      setIsCreating(false)
    }
  }

  /**
   * Handle switching to a different page.
   * Updates both Redux state and browser URL to reflect the new page.
   */
  const handleSwitchPage = (pageId: string) => {
    if (pageId !== activePageId) {
      // Dispatch to Redux to switch page
      dispatch(switchPage(pageId))

      // Find the page's slug and update URL
      const page = pageInfos.find((p) => p.id === pageId)
      if (page?.slug) {
        navigateToPage(page.slug)
      }
    }
  }

  /**
   * Handle renaming a page.
   */
  const handleRenamePage = (pageId: string, newName: string) => {
    dispatch(renamePage({ pageId, newName }))
  }

  /**
   * Handle delete request - opens confirmation dialog.
   */
  const handleDeleteRequest = (page: PageInfo) => {
    setPageToDelete(page)
    setDeleteDialogOpen(true)
  }

  /**
   * Handle duplicate request - opens confirmation dialog.
   */
  const handleDuplicateRequest = (page: PageInfo) => {
    setPageToDuplicate(page)
    setDuplicateDialogOpen(true)
  }

  /**
   * Handle confirmed delete - removes page from Redux AND database.
   *
   * ============================================================================
   * CRITICAL: DUAL DELETION (Redux + Database)
   * ============================================================================
   *
   * When deleting a page, we must:
   * 1. Remove from Redux state (optimistic - UI updates immediately)
   * 2. Delete from database (the Page entity that backs this page)
   *
   * WHY BOTH:
   * - Redux state is ephemeral and resets on page reload
   * - Database is the source of truth - if we don't delete there,
   *   the "deleted" page reappears on next load
   *
   * PAGE ID = PAGE ID:
   * - When pages are loaded from database, page ID = page ID
   * - So we use the page ID directly to delete the page
   *
   * OPTIMISTIC UI:
   * - Page is immediately removed from Redux state
   * - UI updates instantly
   * - Database delete happens in background
   * - If delete fails, page will reappear on next load
   */
  const handleConfirmDelete = async () => {
    if (!pageToDelete) return

    // Prevent double-clicks while deletion is in progress
    if (isDeleting) return
    setIsDeleting(true)

    try {
      // If we're deleting the active page, switch to another page first
      if (pageToDelete.id === activePageId) {
        // Find another page to switch to (first one that isn't the deleted page)
        const otherPage = pageInfos.find((p) => p.id !== pageToDelete.id)
        if (otherPage) {
          dispatch(switchPage(otherPage.id))
          navigateToPage(otherPage.slug)
        }
      }

      // Delete the page from Redux (optimistic - UI updates immediately)
      dispatch(deletePage(pageToDelete.id))

      // Delete the page from the database
      // The page ID equals the page ID (set in builder.ts when loading)
      if (organizationId) {
        await deletePageMutation.mutateAsync({
          organizationId,
          pageId: pageToDelete.id,
        })
      }
    } catch (error) {
      // Error during page deletion - the page is already removed from Redux
      // If the delete failed, the page will reappear on next load
    } finally {
      // Close dialog and reset state
      setDeleteDialogOpen(false)
      setPageToDelete(null)
      setIsDeleting(false)
    }
  }

  /**
   * Handle cancel delete - closes dialog without action.
   */
  const handleCancelDelete = () => {
    setDeleteDialogOpen(false)
    setPageToDelete(null)
  }

  /**
   * Handle confirmed duplicate - creates duplicate page in Redux and saves to database.
   *
   * ============================================================================
   * WORKFLOW:
   * ============================================================================
   *
   * 1. Show loading state on the SOURCE page (not optimistic UI)
   * 2. Generate a unique slug for the duplicate
   * 3. Dispatch duplicatePage action to Redux (creates page with fresh IDs)
   * 4. Get the new page data from Redux state
   * 5. Save the new page to database
   * 6. Remove loading state (now the page is fully ready)
   *
   * WHY NOT OPTIMISTIC:
   * - We need to save to DB first before the page is truly usable
   * - Shows loading on the source page, new page appears when ready
   * - User can only click on the duplicate after it's saved
   */
  const handleConfirmDuplicate = async () => {
    if (!pageToDuplicate) return

    // Prevent double-clicks
    if (isDuplicating) return
    setIsDuplicating(true)
    setDuplicatingPageId(pageToDuplicate.id)

    // Close dialog immediately (loading shows on the page item)
    setDuplicateDialogOpen(false)

    try {
      // Generate unique name and slug for duplicate
      const duplicateName = `${pageToDuplicate.name} (Copy)`
      const uniqueId = `${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`
      const duplicateSlug = `/page-${uniqueId}`

      // Dispatch to Redux - this creates the page with all new IDs
      dispatch(
        duplicatePage({
          sourcePageId: pageToDuplicate.id,
          newName: duplicateName,
          newSlug: duplicateSlug,
        })
      )

      // Get the new page from Redux state AFTER dispatching
      // The new page is the last one in pageOrder
      const state = store.getState()
      const newPageId = state.canvas.pages.pageOrder[state.canvas.pages.pageOrder.length - 1]
      const newPage = state.canvas.pages.pages[newPageId]

      if (newPage && organizationId && websiteId && domainId) {
        // Save the new page to the database
        await saveNewPageMutation.mutateAsync({
          organizationId,
          pageId: newPageId,
          websiteId,
          domainId,
          name: newPage.info.name,
          slug: newPage.info.slug.replace(/^\//, ''), // Remove leading slash
          canvasData: {
            elements: newPage.canvas.elements,
            rootIds: newPage.canvas.rootIds,
            childrenMap: newPage.canvas.childrenMap,
            viewport: { panX: 0, panY: 0, zoom: 1 },
            selection: { selectedIds: [] },
            history: { past: [], future: [], maxSize: 50 },
          },
        })
      }
    } catch (error) {
      // Error duplicating page
    } finally {
      // Clear loading state
      setIsDuplicating(false)
      setDuplicatingPageId(null)
      setPageToDuplicate(null)
    }
  }

  /**
   * Handle cancel duplicate - closes dialog without action.
   */
  const handleCancelDuplicate = () => {
    setDuplicateDialogOpen(false)
    setPageToDuplicate(null)
  }

  return (
    <div className="flex flex-col h-full">
      {/* ================================================================== */}
      {/* REGULAR PAGES SECTION - with + button for creating new pages */}
      {/* ================================================================== */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-sm font-medium text-muted-foreground">Pages</span>
        {/* FeatureGate intercepts clicks when pages_per_website limit is reached
            and shows an upgrade modal instead of calling handleCreatePage */}
        <FeatureGate feature="pages_per_website.limit">
          <button
            onClick={handleCreatePage}
            disabled={isCreating}
            className={cn(
              'p-1 rounded-md transition-colors',
              'hover:bg-accent/50 text-muted-foreground hover:text-foreground',
              isCreating && 'opacity-50 cursor-not-allowed'
            )}
            title={isCreating ? 'Creating page...' : 'Create new page'}
          >
            <Plus className={cn('h-4 w-4', isCreating && 'animate-spin')} />
          </button>
        </FeatureGate>
      </div>

      {/* Scrollable page list container */}
      <div className="flex-1 overflow-y-auto">
        {/* Regular Pages List */}
        <div className="p-2 space-y-1">
          {regularPages.map((page) => (
            <PageItem
              key={page.id}
              page={page}
              isActive={page.id === activePageId}
              isOnlyPage={regularPages.length === 1 && ecommercePagesInStore.length === 0}
              isDuplicating={duplicatingPageId === page.id}
              isEcommercePage={false}
              onSwitch={() => handleSwitchPage(page.id)}
              onRename={(newName) => handleRenamePage(page.id, newName)}
              onDeleteRequest={() => handleDeleteRequest(page)}
              onDuplicateRequest={() => handleDuplicateRequest(page)}
            />
          ))}
        </div>

        {/* ================================================================== */}
        {/* E-COMMERCE PAGES SECTION - NO + button (pages are auto-created) */}
        {/* ================================================================== */}
        {ecommercePagesInStore.length > 0 && (
          <>
            {/* E-commerce Section Header - no + button */}
            <div className="flex items-center gap-2 px-3 py-2 border-t border-b border-border mt-2">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Ecommerce</span>
            </div>

            {/* E-commerce Pages List - No delete/duplicate allowed */}
            <div className="p-2 space-y-1">
              {ecommercePagesInStore.map((page) => (
                <PageItem
                  key={page.id}
                  page={page}
                  isActive={page.id === activePageId}
                  isOnlyPage={false}
                  isDuplicating={duplicatingPageId === page.id}
                  isEcommercePage={true}
                  onSwitch={() => handleSwitchPage(page.id)}
                  onRename={(newName) => handleRenamePage(page.id, newName)}
                  onDeleteRequest={() => {}} // No-op - E-commerce pages can't be deleted from here
                  onDuplicateRequest={() => {}} // No-op - E-commerce pages can't be duplicated
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Page</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <span className="block">
                  Are you sure you want to delete <strong>&quot;{pageToDelete?.name}&quot;</strong>?
                </span>
                <span className="block text-destructive">
                  This action cannot be undone. The website page and all elements
                  within this page will be permanently destroyed.
                </span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete} disabled={isDeleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete Page'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate Confirmation Dialog */}
      <AlertDialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate Page</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <span className="block">
                  Create a copy of <strong>&quot;{pageToDuplicate?.name}&quot;</strong>?
                </span>
                <div className="text-sm space-y-1.5 bg-muted/50 rounded-md p-3">
                  <span className="block font-medium text-foreground">What will be duplicated:</span>
                  <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                    <li>The page element and all its child elements</li>
                    <li>All frames, text, images, buttons inside the page</li>
                    <li>All element styles and responsive settings</li>
                  </ul>
                </div>
                <div className="text-sm space-y-1.5 bg-muted/50 rounded-md p-3">
                  <span className="block font-medium text-foreground">What will NOT be duplicated:</span>
                  <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                    <li>Floating elements outside the page</li>
                    <li>Undo/redo history (starts fresh)</li>
                    <li>Publish status (new page is unpublished)</li>
                  </ul>
                </div>
                <span className="block text-xs text-muted-foreground italic">
                  A unique URL will be generated for the duplicate.
                </span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDuplicate}>
              Cancel
            </AlertDialogCancel>
            {/* FeatureGate intercepts clicks when pages_per_website limit is reached,
                showing an upgrade modal instead of proceeding with the duplication */}
            <FeatureGate feature="pages_per_website.limit">
              <AlertDialogAction onClick={handleConfirmDuplicate}>
                Duplicate Page
              </AlertDialogAction>
            </FeatureGate>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
