/**
 * ============================================================================
 * BUILDER HEADER - Website & Page Information Display (Editable)
 * ============================================================================
 *
 * Displays contextual information about the current editing session:
 * - Website name (from props, loaded via tRPC) - editable via double-click
 * - Active page name (human-readable, from Redux) - editable via double-click
 * - Active page path/slug (URL path, from Redux) - editable via double-click
 *
 * RIGHT SIDE CONTROLS:
 * - Undo/Redo buttons (no text, icons only)
 * - Save status indicator (minimal icons, no text)
 * - Publish button (makes changes live)
 *
 * INLINE EDITING:
 * - Double-click on any field to edit
 * - Uses contentEditable for seamless editing (no layout swap)
 * - Enter key or blur commits the change
 * - Escape key cancels the edit
 *
 * DATA FLOW:
 * - Website name: Updated via tRPC mutation (persisted to DB)
 * - Page name: Updated via Redux renamePage action (persisted on auto-save)
 * - Page slug: Updated via Redux updatePageSlug action (persisted on auto-save)
 * - Publish: Copies canvasData to publishedCanvasData via tRPC mutation
 */

'use client'

import { useRef, useState, useCallback, useMemo, useEffect, KeyboardEvent } from 'react'
import {
  ArrowLeft,
  ChevronRight,
  Globe,
  FileText,
  Undo2,
  Redo2,
  Loader2,
  Check,
  Circle,
  Upload,
  Eye,
  ExternalLink,
  Database,
  ImageIcon,
  Settings,
} from 'lucide-react'
import Link from 'next/link'
import {
  useAppSelector,
  useAppDispatch,
  selectActivePage,
  selectCanUndo,
  selectCanRedo,
  renamePage,
  updatePageSlug,
  undo,
  redo,
  togglePreviewMode,
  sanitizeSlug,
} from '../../_lib'
import { trpc } from '@/trpc/react-provider'
import { trackEvent, CLARITY_EVENTS } from '@/lib/clarity/events'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { SaveStatus } from '../../_hooks'
import { useBuilderContext } from '../../_lib/builder-context'
import { BuilderSettingsDialog } from './builder-settings-dialog'

type EditableField = 'page' | 'slug'

interface BuilderHeaderProps {
  /** Page display name from database */
  pageName: string
  /** Website (category) name - shown with globe icon */
  websiteName?: string
  /** Page ID (first-class Page entity) for tRPC mutations */
  pageId: string
  /** Website ID for settings */
  websiteId: string
  /** Domain ID (if assigned) - null when domain is hard-deleted */
  domainId?: string | null
  /** Organization ID for tRPC mutations */
  organizationId: string
  /** Current save status for indicator */
  saveStatus: SaveStatus
  /** Callback to open the CMS modal */
  onOpenCms?: () => void
  /** Callback to open the Storage browser modal */
  onOpenStorage?: () => void
  /** External trigger to open settings dialog (from spotlight search) */
  settingsOpenExternal?: boolean
  /** Callback when settings dialog closes (syncs external state) */
  onSettingsOpenChange?: (open: boolean) => void
  /** Expose publish handler so spotlight search can trigger it */
  onPublishRef?: React.MutableRefObject<(() => void) | null>
}

/**
 * Header component showing website and page context with inline editing.
 *
 * LAYOUT:
 * LEFT: [Globe Icon] Website Name > [File Icon] Page Name (/page-slug)
 * RIGHT: [Undo] [Redo] [Save Status] [Publish Button]
 *
 * Double-click any text field to edit inline.
 * Changes are saved on Enter or blur, cancelled on Escape.
 */
export function BuilderHeader({
  pageName: _pageNameProp,
  websiteName,
  pageId,
  websiteId,
  domainId,
  organizationId,
  saveStatus,
  onOpenCms,
  onOpenStorage,
  settingsOpenExternal,
  onSettingsOpenChange,
  onPublishRef,
}: BuilderHeaderProps) {
  const dispatch = useAppDispatch()

  // Settings dialog state — synced with external trigger from spotlight
  const [settingsOpen, setSettingsOpen] = useState(false)

  /** Sync external settings open trigger (from spotlight search) */
  useEffect(() => {
    if (settingsOpenExternal) setSettingsOpen(true)
  }, [settingsOpenExternal])


  // Get active page info from Redux
  const activePage = useAppSelector(selectActivePage)
  const activePageId = activePage?.info.id ?? ''

  // Undo/redo state from Redux
  const canUndo = useAppSelector(selectCanUndo)
  const canRedo = useAppSelector(selectCanRedo)

  // Extract page name and slug from active page
  const pageName = activePage?.info.name ?? 'Loading...'
  const pageSlug = activePage?.info.slug ?? ''

  // Get domain name from builder context for constructing the visit URL
  const { domainName } = useBuilderContext()

  /**
   * Build the "Visit Site" URL based on environment and domain availability.
   *
   * LOCAL/DEV: Always use path-based URLs (can't reach production domains locally).
   *   → /{domainName || websiteId}/{slug}
   *
   * PRODUCTION + domain assigned: Link to the full production domain.
   *   → https://{domainName}/{slug}
   *
   * PRODUCTION + no domain: Use path-based (no external URL to link to).
   *   → /{websiteId}/{slug}
   */
  const visitSiteUrl = useMemo(() => {
    const slug = pageSlug?.replace(/^\//, '') || 'home'
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || ''
    const isDev = rootDomain.includes('.test') || rootDomain.includes('localhost')

    if (isDev || !domainName) {
      // Local dev or no domain — path-based (same origin)
      const identifier = domainName || websiteId
      return `/${identifier}/${slug}`
    }

    // Production with domain — full external URL
    return `https://${domainName}/${slug}`
  }, [domainName, websiteId, pageSlug])

  // Refs for contentEditable elements (page name and slug are editable)
  const pageNameRef = useRef<HTMLSpanElement>(null)
  const pageSlugRef = useRef<HTMLSpanElement>(null)

  // Track which field is being edited
  const [editingField, setEditingField] = useState<EditableField | null>(null)

  // Store original value for cancel
  const originalValueRef = useRef<string>('')

  // tRPC mutations
  const utils = trpc.useUtils()

  // Update page name mutation
  const updatePage = trpc.pages.update.useMutation({
    onSuccess: () => {
      utils.builder.getDataById.invalidate({ organizationId, pageId })
    },
  })

  // Publish page mutation - copies canvasData to publishedCanvasData
  const publishPage = trpc.pages.publish.useMutation({
    onSuccess: () => {
      trackEvent(CLARITY_EVENTS.PAGE_PUBLISHED)
      // Invalidate the cache for the ACTIVE page (the one we just published)
      // NOT pageId from URL - activePageId is the currently selected page in Redux
      utils.builder.getDataById.invalidate({ organizationId, pageId: activePageId })
      // Invalidate websites list so the preview image refreshes when user
      // navigates back (screenshot capture runs async via Trigger.dev)
      utils.websites.list.invalidate()
    },
  })

  /**
   * Handle publish confirmation.
   * Called when user confirms in the AlertDialog.
   * Copies current canvasData to publishedCanvasData making changes live.
   *
   * CRITICAL FIX: Uses activePageId (from Redux) instead of pageId (from URL).
   * This ensures we publish the page the user is ACTUALLY EDITING, not the
   * page from the initial URL. Users can switch pages via the sidebar without
   * the URL changing, so we must use Redux state as the source of truth.
   */
  const handlePublishConfirm = useCallback(() => {
    // Guard: Don't publish if no active page is selected
    if (!activePageId) {
      console.error('Cannot publish: No active page selected')
      return
    }

    publishPage.mutate({
      organizationId,
      pageId: activePageId,
    })
  }, [publishPage, organizationId, activePageId])

  /** Expose publish handler to parent via ref (for spotlight search) */
  useEffect(() => {
    if (onPublishRef) onPublishRef.current = handlePublishConfirm
  }, [onPublishRef, handlePublishConfirm])

  /**
   * Start editing a field on double-click.
   * Stores original value and selects all text.
   */
  const handleDoubleClick = useCallback(
    (field: EditableField, ref: React.RefObject<HTMLSpanElement | null>) => {
      if (!ref.current) return

      setEditingField(field)
      originalValueRef.current = ref.current.textContent || ''

      // Select all text after a tick (after contentEditable activates)
      requestAnimationFrame(() => {
        if (ref.current) {
          const range = document.createRange()
          range.selectNodeContents(ref.current)
          const selection = window.getSelection()
          selection?.removeAllRanges()
          selection?.addRange(range)
        }
      })
    },
    []
  )

  /**
   * Commit the edit - save the new value.
   */
  const commitEdit = useCallback(
    (field: EditableField, ref: React.RefObject<HTMLSpanElement | null>) => {
      if (!ref.current) return

      const newValue = ref.current.textContent?.trim() || ''

      // Don't save if empty or unchanged
      if (!newValue || newValue === originalValueRef.current) {
        ref.current.textContent = originalValueRef.current
        setEditingField(null)
        return
      }

      if (field === 'page' && activePageId) {
        // Update page name via Redux
        dispatch(renamePage({ pageId: activePageId, newName: newValue }))
      } else if (field === 'slug' && activePageId) {
        /**
         * SLUG SANITIZATION
         *
         * User can type anything - we clean it up:
         * - "///My Page!!!" → "/my-page"
         * - "about us" → "/about-us"
         * - "contact_me" → "/contact-me"
         *
         * This ensures valid URL paths without bothering the user.
         */
        const sanitizedSlug = sanitizeSlug(newValue)

        // Update page slug via Redux with sanitized value
        dispatch(updatePageSlug({ pageId: activePageId, newSlug: sanitizedSlug }))

        /**
         * Sync URL with the new slug (no page refresh).
         *
         * URL STRUCTURE: /[domain]/[pathname]/edit
         * Example: /my-domain/home/edit
         *
         * We need to replace the pathname segment (second-to-last when URL ends with /edit).
         */
        const currentPath = window.location.pathname
        const pathParts = currentPath.split('/')

        // Find the index to replace:
        // If URL ends with /edit, replace the segment before /edit
        // Otherwise, replace the last segment
        const endsWithEdit = pathParts[pathParts.length - 1] === 'edit'
        const replaceIndex = endsWithEdit ? pathParts.length - 2 : pathParts.length - 1

        pathParts[replaceIndex] = sanitizedSlug.replace(/^\//, '')
        const newPath = pathParts.join('/')
        window.history.replaceState(null, '', newPath)
      }

      setEditingField(null)
    },
    [dispatch, activePageId, updatePage, organizationId, pageId]
  )

  /**
   * Cancel the edit - restore original value.
   */
  const cancelEdit = useCallback(
    (ref: React.RefObject<HTMLSpanElement | null>) => {
      if (ref.current) {
        ref.current.textContent = originalValueRef.current
      }
      setEditingField(null)
    },
    []
  )

  /**
   * Handle keyboard events during editing.
   * Enter commits, Escape cancels.
   */
  const handleKeyDown = useCallback(
    (
      e: KeyboardEvent<HTMLSpanElement>,
      _field: EditableField,
      ref: React.RefObject<HTMLSpanElement | null>
    ) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        ref.current?.blur()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancelEdit(ref)
        ref.current?.blur()
      }
    },
    [cancelEdit]
  )

  /**
   * Handle blur - commit the edit.
   */
  const handleBlur = useCallback(
    (field: EditableField, ref: React.RefObject<HTMLSpanElement | null>) => {
      if (editingField === field) {
        commitEdit(field, ref)
      }
    },
    [editingField, commitEdit]
  )

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-muted text-muted-foreground text-[13px] font-sans min-h-[40px] z-50">
      {/* LEFT SIDE: Back link, website and page info */}
      <div className="flex items-center gap-2">
        {/* Back to websites link - prefetch ensures instant navigation */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/sites/websites"
                prefetch={true}
                className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <ArrowLeft size={16} />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Back to websites</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Divider */}
        <div className="w-px h-4 bg-border" />

        {/* Website section - shows the website (category) name (read-only display) */}
        <div className="flex items-center gap-1.5">
          <Globe size={14} className="text-muted-foreground flex-shrink-0" />
          <span className="text-foreground font-medium whitespace-nowrap px-1 py-0.5">
            {websiteName || 'Website'}
          </span>
        </div>

        {/* Separator */}
        <ChevronRight size={14} className="text-muted-foreground/50 flex-shrink-0" />

        {/* Page section */}
        <div className="flex items-center gap-1.5">
          <FileText size={14} className="text-muted-foreground flex-shrink-0" />
          <span
            ref={pageNameRef}
            contentEditable={editingField === 'page'}
            suppressContentEditableWarning
            className={cn(
              'text-foreground font-medium whitespace-nowrap cursor-text px-1 py-0.5 rounded transition-colors',
              editingField === 'page'
                ? 'outline-none bg-primary/10 ring-1 ring-primary/30'
                : 'hover:bg-muted'
            )}
            title={editingField !== 'page' ? 'Double-click to edit' : undefined}
            onDoubleClick={() => handleDoubleClick('page', pageNameRef)}
            onKeyDown={(e) => handleKeyDown(e, 'page', pageNameRef)}
            onBlur={() => handleBlur('page', pageNameRef)}
          >
            {pageName}
          </span>

          {/* Page slug/path - editable */}
          {pageSlug && (
            <span
              ref={pageSlugRef}
              contentEditable={editingField === 'slug'}
              suppressContentEditableWarning
              className={cn(
                'text-muted-foreground text-xs font-mono bg-muted px-1.5 py-0.5 rounded whitespace-nowrap cursor-text transition-all',
                editingField === 'slug'
                  ? 'outline-none bg-muted ring-1 ring-primary/40'
                  : 'hover:bg-muted/80'
              )}
              title={editingField !== 'slug' ? 'Double-click to edit route' : undefined}
              onDoubleClick={() => handleDoubleClick('slug', pageSlugRef)}
              onKeyDown={(e) => handleKeyDown(e, 'slug', pageSlugRef)}
              onBlur={() => handleBlur('slug', pageSlugRef)}
            >
              {pageSlug}
            </span>
          )}
        </div>

        {/* Divider before Visit Site */}
        <div className="w-px h-4 bg-border" />

        {/* Visit site link — opens the published page in a new tab */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={visitSiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <ExternalLink size={14} />
                <span className="text-xs whitespace-nowrap">Visit site</span>
              </a>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="font-mono text-xs">{visitSiteUrl}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* RIGHT SIDE: CMS, Preview, Undo/Redo, Save Status, and Publish */}
      <div className="flex items-center gap-1">
        <TooltipProvider delayDuration={300}>
          {/* CMS Database button */}
          {onOpenCms && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onOpenCms}
                  className="flex items-center justify-center w-7 h-7 border-none rounded bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
                >
                  <Database size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Content Management (CMS)</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Storage browser button - opens media bucket for quick file access */}
          {onOpenStorage && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onOpenStorage}
                  className="flex items-center justify-center w-7 h-7 border-none rounded bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
                >
                  <ImageIcon size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Media Storage</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Preview mode toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => dispatch(togglePreviewMode())}
                className="flex items-center justify-center w-7 h-7 border-none rounded bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
              >
                <Eye size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Preview website</p>
            </TooltipContent>
          </Tooltip>

          {/* Settings button - opens website/page settings dialog */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setSettingsOpen(true)}
                className="flex items-center justify-center w-7 h-7 border-none rounded bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
              >
                <Settings size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Website Settings</p>
            </TooltipContent>
          </Tooltip>

          {/* Divider */}
          <div className="w-px h-4 bg-border mx-1" />

          {/* Undo button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => canUndo && dispatch(undo())}
                disabled={!canUndo}
                className={cn(
                  'flex items-center justify-center w-7 h-7 border-none rounded bg-transparent transition-colors',
                  canUndo
                    ? 'text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer'
                    : 'text-muted-foreground/30 cursor-not-allowed'
                )}
              >
                <Undo2 size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Undo (⌘Z)</p>
            </TooltipContent>
          </Tooltip>

          {/* Redo button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => canRedo && dispatch(redo())}
                disabled={!canRedo}
                className={cn(
                  'flex items-center justify-center w-7 h-7 border-none rounded bg-transparent transition-colors',
                  canRedo
                    ? 'text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer'
                    : 'text-muted-foreground/30 cursor-not-allowed'
                )}
              >
                <Redo2 size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Redo (⌘⇧Z)</p>
            </TooltipContent>
          </Tooltip>

          {/* Divider */}
          <div className="w-px h-4 bg-border mx-1" />

          {/* Save status indicator */}
          <SaveStatusIcon status={saveStatus} />

          {/* Divider */}
          <div className="w-px h-4 bg-border mx-1" />
        </TooltipProvider>

        {/* Publish button with confirmation dialog */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              disabled={publishPage.isPending || !activePageId}
              className="h-7 px-3 text-xs font-medium gap-1.5"
            >
              {publishPage.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Upload size={14} />
              )}
              {publishPage.isPending ? 'Publishing...' : 'Publish'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Publish Changes?</AlertDialogTitle>
              <AlertDialogDescription>
                This will make your current changes live and visible to all
                visitors. Your published website will be updated immediately.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handlePublishConfirm}>
                Publish
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Settings Dialog */}
      <BuilderSettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open)
          onSettingsOpenChange?.(open)
        }}
        organizationId={organizationId}
        websiteId={websiteId}
        pageId={activePageId || pageId}
        websiteName={websiteName || ''}
        currentDomainId={domainId}
      />
    </header>
  )
}

// ============================================================================
// SAVE STATUS ICON - Minimal indicator with no text
// ============================================================================

/**
 * Minimal save status indicator using icons only.
 *
 * STATES:
 * - idle: Gray checkmark (saved, no pending changes)
 * - pending: Muted spinner (changes pending, will save soon)
 * - saving: Spinning loader (actively saving)
 * - saved: Green checkmark (just saved, fades to idle)
 * - error: Orange/amber circle (save failed)
 */
function SaveStatusIcon({ status }: { status: SaveStatus }) {
  const baseClass = 'flex items-center justify-center w-7 h-7'

  switch (status) {
    case 'idle':
      return (
        <div className={baseClass} title="All changes saved">
          <Check size={16} className="text-muted-foreground/50" />
        </div>
      )

    case 'pending':
      return (
        <div className={baseClass} title="Changes pending...">
          <Loader2 size={16} className="text-muted-foreground/50 animate-spin" />
        </div>
      )

    case 'saving':
      return (
        <div className={baseClass} title="Saving...">
          <Loader2 size={16} className="text-muted-foreground animate-spin" />
        </div>
      )

    case 'saved':
      return (
        <div className={baseClass} title="Saved">
          <Check size={16} className="text-green-400" />
        </div>
      )

    case 'error':
      return (
        <div className={baseClass} title="Save failed - will retry">
          <Circle size={8} className="text-amber-500 fill-amber-500" />
        </div>
      )

    default:
      return null
  }
}
