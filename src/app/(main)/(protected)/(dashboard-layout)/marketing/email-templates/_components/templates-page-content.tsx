'use client'

/**
 * Email Templates Page Content - Active Organization Pattern
 *
 * WHY: Main content area for browsing and managing email templates with folder organization
 * HOW: Uses useActiveOrganization hook for org context
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based access control via hasPermission helper
 *
 * FEATURES:
 * - Folder-based organization (nested folders like storage)
 * - URL state management for sharing links (?folder=xxx, ?template=xxx)
 * - Grid view of folders and templates
 * - Breadcrumb navigation
 * - Search with debouncing (400ms)
 * - Create, edit, duplicate, delete, move actions
 *
 * SOURCE OF TRUTH: EmailTemplate, EmailTemplateFolder, ActiveOrganization
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
  Plus,
  Search,
  MoreHorizontal,
  Copy,
  Trash2,
  Mail,
  Clock,
  FolderPlus,
  ChevronRight,
  Home,
  Palette,
  FolderInput,
  Grid3X3,
  List,
  ShieldAlert,
  Building2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ContentLayout } from '@/components/global/content-layout'
import { trpc } from '@/trpc/react-provider'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { FeatureGate } from '@/components/feature-gate'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { TemplateEditorDialog } from './template-editor-dialog'
import { CreateFolderDialog } from './create-folder-dialog'
import { EditFolderDialog } from './edit-folder-dialog'
import { MoveTemplateDialog } from './move-template-dialog'
import { TemplatePreviewCard } from './template-preview-card'
import type { EmailTemplateWithBlocks } from '@/types/email-templates'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Serialized template type (dates are strings after tRPC serialization)
 * SOURCE OF TRUTH KEYWORDS: SerializedEmailTemplate
 */
type SerializedTemplate = Omit<
  EmailTemplateWithBlocks,
  'createdAt' | 'updatedAt' | 'deletedAt' | 'lastUsedAt'
> & {
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  lastUsedAt: string | null
}

/**
 * View mode for templates display - grid or list
 */
type ViewMode = 'grid' | 'list'

// ============================================================================
// LOADING SKELETON COMPONENT
// ============================================================================

/**
 * Full page loading skeleton that matches the email templates page layout.
 * Shown during initial data fetch before organization/permissions are loaded.
 */
function EmailTemplatesLoadingSkeleton() {
  return (
    <ContentLayout>
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>

        {/* Breadcrumb and search skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-8 w-16" />
          </div>
        </div>

        {/* Folders skeleton */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2 p-3">
              <Skeleton className="w-20 h-[60px]" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>

        {/* Templates preview card skeletons */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col">
              <Skeleton className="h-[240px] rounded-xl" />
              <div className="mt-3 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </ContentLayout>
  )
}

// ============================================================================
// FOLDER CARD COMPONENT (Inline for now, can be extracted later)
// ============================================================================

/**
 * Custom folder SVG with glass-morphism effect
 * Matches the storage folder card design
 */
function FolderShape({ color = '#3f3f46' }: { color?: string }) {
  return (
    <div className="relative w-full aspect-[4/3]">
      <svg
        viewBox="0 0 120 90"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-lg"
      >
        <path
          d="M8 20C8 15.5817 11.5817 12 16 12H42C44.6522 12 47.1957 13.0536 49.0711 14.9289L54 20H104C108.418 20 112 23.5817 112 28V78C112 82.4183 108.418 86 104 86H16C11.5817 86 8 82.4183 8 78V20Z"
          fill={color}
          fillOpacity="0.9"
        />
        <path
          d="M8 20C8 15.5817 11.5817 12 16 12H38C40.1217 12 42.1566 12.8429 43.6569 14.3431L48 18.6863C49.5003 20.1866 51.5352 21.0294 53.6569 21.0294H104C108.418 21.0294 112 24.6111 112 29.0294V78C112 82.4183 108.418 86 104 86H16C11.5817 86 8 82.4183 8 78V20Z"
          fill={color}
        />
        <path
          d="M16 12H38C40.1217 12 42.1566 12.8429 43.6569 14.3431L48 18.6863C49.5003 20.1866 51.5352 21.0294 53.6569 21.0294H104C106.209 21.0294 108.209 22.0723 109.536 23.6863"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="2"
          strokeLinecap="round"
        />
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

export function TemplatesPageContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // ============================================================================
  // ORGANIZATION DATA - Using active organization hook
  // ============================================================================

  /**
   * Get active organization from the hook
   * This respects domain-first approach and session activeOrganizationId
   */
  const { activeOrganization, isLoading: isLoadingOrg, hasPermission } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''

  /**
   * Check permission using hook's hasPermission helper
   * Owners have full access, members need explicit permission
   */
  const hasAccess = hasPermission(permissions.EMAIL_TEMPLATES_READ)

  // URL state - folder and template IDs from query params
  const currentFolderId = searchParams.get('folder') || null
  const editingTemplateId = searchParams.get('template') || null

  // View mode state (grid or list)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  // Local search state with debouncing
  const [localSearch, setLocalSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Dialog states
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [editFolderDialog, setEditFolderDialog] = useState<{
    open: boolean
    folderId: string
    folderName: string
    folderColor: string | null
  } | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    type: 'folder' | 'template'
    id: string
    name: string
  } | null>(null)
  const [moveDialog, setMoveDialog] = useState<{
    open: boolean
    templateId: string
    templateName: string
    currentFolderId: string | null
  } | null>(null)

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  /**
   * Update URL params helper - maintains folder context when editing templates
   */
  const updateUrlParams = useCallback(
    (params: { folder?: string | null; template?: string | null }) => {
      const newParams = new URLSearchParams(searchParams.toString())

      if (params.folder !== undefined) {
        if (params.folder === null) {
          newParams.delete('folder')
        } else {
          newParams.set('folder', params.folder)
        }
      }

      if (params.template !== undefined) {
        if (params.template === null) {
          newParams.delete('template')
        } else {
          newParams.set('template', params.template)
        }
      }

      const queryString = newParams.toString()
      router.push(`${pathname}${queryString ? `?${queryString}` : ''}`, { scroll: false })
    },
    [router, pathname, searchParams]
  )

  /**
   * Handle search input with 400ms debouncing
   */
  const handleSearchChange = useCallback((value: string) => {
    setLocalSearch(value)

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value)
    }, 400)
  }, [])

  // ============================================================================
  // EARLY RETURNS FOR LOADING / NO ORG / NO ACCESS STATES
  // ============================================================================

  // Show skeleton while organization data is loading (only on initial load)
  if (isLoadingOrg && !activeOrganization) {
    return <EmailTemplatesLoadingSkeleton />
  }

  // No organization found - user needs to contact admin
  if (!activeOrganization) {
    return (
      <ContentLayout>
        <div className="flex items-center justify-center h-full p-6">
          <div className="max-w-md text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No Organization Found</h3>
            <p className="text-sm text-muted-foreground">
              You need to be part of an organization to access email templates.
              Please contact your administrator.
            </p>
          </div>
        </div>
      </ContentLayout>
    )
  }

  // No permission - user needs EMAIL_TEMPLATES_READ permission
  if (!hasAccess) {
    return (
      <ContentLayout>
        <div className="flex items-center justify-center h-full p-6">
          <div className="max-w-md text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <ShieldAlert className="h-6 w-6 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold">Access Denied</h3>
            <p className="text-sm text-muted-foreground">
              You don&apos;t have permission to view email templates.
            </p>
            <p className="text-xs text-muted-foreground">
              Contact your organization owner to grant you the{' '}
              <code className="px-1 py-0.5 bg-muted rounded text-xs">
                email-templates:read
              </code>{' '}
              permission.
            </p>
          </div>
        </div>
      </ContentLayout>
    )
  }

  // ============================================================================
  // MAIN CONTENT (wrapped in TemplatesPageContentInner for cleaner code)
  // ============================================================================

  return (
    <ContentLayout>
      <TemplatesPageContentInner
        organizationId={organizationId}
        currentFolderId={currentFolderId}
        editingTemplateId={editingTemplateId}
        viewMode={viewMode}
        setViewMode={setViewMode}
        localSearch={localSearch}
        debouncedSearch={debouncedSearch}
        handleSearchChange={handleSearchChange}
        updateUrlParams={updateUrlParams}
        createFolderOpen={createFolderOpen}
        setCreateFolderOpen={setCreateFolderOpen}
        editFolderDialog={editFolderDialog}
        setEditFolderDialog={setEditFolderDialog}
        deleteDialog={deleteDialog}
        setDeleteDialog={setDeleteDialog}
        moveDialog={moveDialog}
        setMoveDialog={setMoveDialog}
      />
    </ContentLayout>
  )
}

// ============================================================================
// INNER CONTENT COMPONENT (separated for cleaner early returns)
// ============================================================================

interface TemplatesPageContentInnerProps {
  organizationId: string
  currentFolderId: string | null
  editingTemplateId: string | null
  viewMode: ViewMode
  setViewMode: React.Dispatch<React.SetStateAction<ViewMode>>
  localSearch: string
  debouncedSearch: string
  handleSearchChange: (value: string) => void
  updateUrlParams: (params: { folder?: string | null; template?: string | null }) => void
  createFolderOpen: boolean
  setCreateFolderOpen: React.Dispatch<React.SetStateAction<boolean>>
  editFolderDialog: {
    open: boolean
    folderId: string
    folderName: string
    folderColor: string | null
  } | null
  setEditFolderDialog: React.Dispatch<
    React.SetStateAction<{
      open: boolean
      folderId: string
      folderName: string
      folderColor: string | null
    } | null>
  >
  deleteDialog: {
    open: boolean
    type: 'folder' | 'template'
    id: string
    name: string
  } | null
  setDeleteDialog: React.Dispatch<
    React.SetStateAction<{
      open: boolean
      type: 'folder' | 'template'
      id: string
      name: string
    } | null>
  >
  moveDialog: {
    open: boolean
    templateId: string
    templateName: string
    currentFolderId: string | null
  } | null
  setMoveDialog: React.Dispatch<
    React.SetStateAction<{
      open: boolean
      templateId: string
      templateName: string
      currentFolderId: string | null
    } | null>
  >
}

function TemplatesPageContentInner({
  organizationId,
  currentFolderId,
  editingTemplateId,
  viewMode,
  setViewMode,
  localSearch,
  debouncedSearch,
  handleSearchChange,
  updateUrlParams,
  createFolderOpen,
  setCreateFolderOpen,
  editFolderDialog,
  setEditFolderDialog,
  deleteDialog,
  setDeleteDialog,
  moveDialog,
  setMoveDialog,
}: TemplatesPageContentInnerProps) {
  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  // Fetch folders in current directory
  const { data: folders, isLoading: foldersLoading } = trpc.emailTemplates.listFolders.useQuery(
    {
      organizationId,
      parentId: currentFolderId,
      search: debouncedSearch || undefined,
    },
    { staleTime: 30000 }
  )

  // Fetch templates in current directory
  const { data: templatesData, isLoading: templatesLoading } = trpc.emailTemplates.list.useQuery(
    {
      organizationId,
      page: 1,
      pageSize: 100,
      search: debouncedSearch || undefined,
      folderId: currentFolderId,
    },
    { staleTime: 30000 }
  )

  // Fetch breadcrumb for current folder
  const { data: breadcrumb } = trpc.emailTemplates.getFolderBreadcrumb.useQuery(
    { organizationId, folderId: currentFolderId! },
    { enabled: !!currentFolderId }
  )

  // Fetch template for editing (when ?template=xxx in URL)
  // We need to track loading state to prevent showing empty "new template" while loading
  const { data: editingTemplate, isLoading: isLoadingTemplate } = trpc.emailTemplates.getById.useQuery(
    { organizationId, templateId: editingTemplateId! },
    { enabled: !!editingTemplateId && editingTemplateId !== 'new' }
  )

  const utils = trpc.useUtils()

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  // Create folder mutation
  const createFolderMutation = trpc.emailTemplates.createFolder.useMutation({
    onSuccess: () => {
      toast.success('Folder created')
      utils.emailTemplates.listFolders.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create folder')
    },
  })

  // Update folder mutation
  const updateFolderMutation = trpc.emailTemplates.updateFolder.useMutation({
    onSuccess: () => {
      toast.success('Folder updated')
      utils.emailTemplates.listFolders.invalidate()
      setEditFolderDialog(null)
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update folder')
    },
  })

  // Delete folder mutation
  const deleteFolderMutation = trpc.emailTemplates.deleteFolder.useMutation({
    onSuccess: () => {
      toast.success('Folder deleted')
      utils.emailTemplates.listFolders.invalidate()
      utils.emailTemplates.list.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete folder')
    },
  })

  // Duplicate template mutation
  const duplicateMutation = trpc.emailTemplates.duplicate.useMutation({
    onSuccess: () => {
      toast.success('Template duplicated')
      utils.emailTemplates.list.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to duplicate template')
    },
  })

  // Delete template mutation
  const deleteMutation = trpc.emailTemplates.delete.useMutation({
    onSuccess: () => {
      toast.success('Template deleted')
      utils.emailTemplates.list.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete template')
    },
  })

  // Move template mutation
  const moveMutation = trpc.emailTemplates.move.useMutation({
    onSuccess: () => {
      toast.success('Template moved')
      utils.emailTemplates.list.invalidate()
      utils.emailTemplates.listFolders.invalidate()
      setMoveDialog(null)
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to move template')
    },
  })

  // ============================================================================
  // HANDLERS
  // ============================================================================

  // Navigate to folder
  const handleNavigateToFolder = (folderId: string | null) => {
    updateUrlParams({ folder: folderId, template: null })
  }

  // Open template editor via URL
  const handleEditTemplate = (templateId: string) => {
    updateUrlParams({ template: templateId })
  }

  // Create new template (opens editor with no template)
  const handleCreateNew = () => {
    updateUrlParams({ template: 'new' })
  }

  // Close template editor
  const handleEditorClose = () => {
    updateUrlParams({ template: null })
  }

  /**
   * Template saved - invalidate ALL related caches to prevent stale data.
   * We invalidate both the list (for template cards) and getById (for the editor).
   * This ensures that reopening the template shows fresh data.
   * NOTE: Does NOT auto-close - user can continue editing or close manually.
   */
  const handleEditorSave = async () => {
    // Invalidate the list query (for template cards preview)
    await utils.emailTemplates.list.invalidate()

    // Also invalidate the specific template if we were editing one
    // This prevents stale data when reopening the same template
    if (editingTemplateId && editingTemplateId !== 'new') {
      await utils.emailTemplates.getById.invalidate({
        organizationId,
        templateId: editingTemplateId,
      })
    }

    // Editor stays open - user can continue editing or close manually
  }

  // Duplicate template
  const handleDuplicate = (templateId: string) => {
    duplicateMutation.mutate({ organizationId, templateId })
  }

  // Delete click (opens confirmation)
  const handleDeleteClick = (type: 'folder' | 'template', id: string, name: string) => {
    setDeleteDialog({ open: true, type, id, name })
  }

  // Confirm delete
  const handleDeleteConfirm = () => {
    if (!deleteDialog) return

    if (deleteDialog.type === 'folder') {
      deleteFolderMutation.mutate({ organizationId, folderId: deleteDialog.id })
    } else {
      deleteMutation.mutate({ organizationId, templateId: deleteDialog.id })
    }

    setDeleteDialog(null)
  }

  // Create folder handler
  const handleCreateFolder = async (data: { name: string; color?: string }) => {
    await createFolderMutation.mutateAsync({
      organizationId,
      name: data.name,
      parentId: currentFolderId,
      color: data.color,
    })
  }

  // Open move dialog for a template
  const handleMoveClick = (templateId: string, templateName: string, templateFolderId: string | null) => {
    setMoveDialog({
      open: true,
      templateId,
      templateName,
      currentFolderId: templateFolderId,
    })
  }

  // Handle move confirmation from dialog
  const handleMoveTemplate = (targetFolderId: string | null) => {
    if (!moveDialog) return
    moveMutation.mutate({
      organizationId,
      templateId: moveDialog.templateId,
      folderId: targetFolderId,
    })
  }

  // ============================================================================
  // COMPUTED STATE
  // ============================================================================

  const isLoading = foldersLoading || templatesLoading
  const templates = templatesData?.templates || []
  const isEmpty = !isLoading && (!folders || folders.length === 0) && templates.length === 0
  const isSearching = debouncedSearch.length > 0

  // Editor is open when:
  // 1. Creating new template (editingTemplateId === 'new')
  // 2. Editing existing template AND data has loaded (not still loading)
  // This prevents showing empty "new template" view while fetching existing template
  const editorOpen =
    editingTemplateId === 'new' ||
    (!!editingTemplateId && !isLoadingTemplate && !!editingTemplate)

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Email Templates</h2>
          <p className="text-sm text-muted-foreground">
            Create and manage reusable email templates for your campaigns
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setCreateFolderOpen(true)}>
            <FolderPlus className="mr-2 h-4 w-4" />
            New Folder
          </Button>
          <FeatureGate feature="email_templates.limit">
            <Button onClick={handleCreateNew}>
              <Plus className="mr-2 h-4 w-4" />
              New Template
            </Button>
          </FeatureGate>
        </div>
      </div>

      {/* Breadcrumb and Search row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Breadcrumb navigation */}
        <nav className="flex items-center gap-1 text-sm overflow-x-auto pb-1 sm:pb-0 scrollbar-thin">
          <button
            onClick={() => handleNavigateToFolder(null)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-md transition-colors shrink-0',
              'hover:bg-muted',
              !currentFolderId && !isSearching && 'font-medium text-foreground'
            )}
          >
            <Home className="w-4 h-4" />
            <span className="hidden xs:inline">All Templates</span>
          </button>

          {breadcrumb?.map((folder, index) => (
            <div key={folder.id} className="flex items-center shrink-0">
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <button
                onClick={() => handleNavigateToFolder(folder.id)}
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

        {/* Search input and view toggle */}
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={localSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          {/* View mode toggle */}
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => value && setViewMode(value as ViewMode)}
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

      {/* Search indicator */}
      {isSearching && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Showing results for</span>
          <span className="font-medium text-foreground">&quot;{debouncedSearch}&quot;</span>
          <span>across all folders</span>
        </div>
      )}

      {/* Loading state when fetching a specific template from URL */}
      {editingTemplateId && editingTemplateId !== 'new' && isLoadingTemplate && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4 animate-pulse">
              <Mail className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Loading Template...</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Please wait while we fetch the template
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading skeleton - Grid view */}
      {isLoading && viewMode === 'grid' && !(editingTemplateId && editingTemplateId !== 'new' && isLoadingTemplate) && (
        <div className="space-y-6">
          {/* Folder skeletons */}
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col items-center gap-2 p-3">
                <Skeleton className="w-20 h-[60px]" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
          {/* Template preview card skeletons */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col">
                <Skeleton className="h-[240px] rounded-xl" />
                <div className="mt-3 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading skeleton - List view */}
      {isLoading && viewMode === 'list' && !(editingTemplateId && editingTemplateId !== 'new' && isLoadingTemplate) && (
        <div className="space-y-1">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center gap-4 p-3 rounded-lg">
              <Skeleton className="w-10 h-10 rounded" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && !isLoading && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Mail className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              {isSearching ? 'No results found' : 'No templates yet'}
            </h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
              {isSearching
                ? `No templates or folders match "${debouncedSearch}"`
                : 'Create your first email template to start sending professional emails'}
            </p>
            {!isSearching && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setCreateFolderOpen(true)}>
                  <FolderPlus className="mr-2 h-4 w-4" />
                  New Folder
                </Button>
                <FeatureGate feature="email_templates.limit">
                  <Button onClick={handleCreateNew}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Template
                  </Button>
                </FeatureGate>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Content: Grid View */}
      {!isLoading && !isEmpty && viewMode === 'grid' && (
        <div className="space-y-6">
          {/* Folders section */}
          {folders && folders.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3">
                {isSearching ? 'Matching Folders' : 'Folders'}
              </h2>
              <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    className={cn(
                      'group relative flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer transition-all duration-200',
                      'hover:bg-muted/50'
                    )}
                    onClick={() => handleNavigateToFolder(folder.id)}
                  >
                    {/* Folder dropdown menu */}
                    <DropdownMenu>
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
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem
                          onClick={() =>
                            setEditFolderDialog({
                              open: true,
                              folderId: folder.id,
                              folderName: folder.name,
                              folderColor: folder.color,
                            })
                          }
                        >
                          <Palette className="mr-2 h-4 w-4" />
                          Edit Folder
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => handleDeleteClick('folder', folder.id, folder.name)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Folder icon */}
                    <div className="w-20 h-auto">
                      <FolderShape color={folder.color || undefined} />
                    </div>

                    {/* Folder name and count */}
                    <div className="flex flex-col items-center text-center max-w-full">
                      <span className="text-sm font-medium truncate max-w-[100px]" title={folder.name}>
                        {folder.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {folder._count.templates} {folder._count.templates === 1 ? 'template' : 'templates'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Templates section - Visual preview cards */}
          {templates.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-4">
                {isSearching ? 'Matching Templates' : 'Templates'}
              </h2>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {templates.map((template) => (
                  <TemplatePreviewCard
                    key={template.id}
                    id={template.id}
                    name={template.name}
                    subject={template.subject}
                    content={template.content}
                    emailSettings={template.emailSettings}
                    usageCount={template.usageCount}
                    lastUsedAt={template.lastUsedAt}
                    onClick={() => handleEditTemplate(template.id)}
                    onDuplicate={() => handleDuplicate(template.id)}
                    onMove={() => handleMoveClick(template.id, template.name, template.folderId)}
                    onDelete={() => handleDeleteClick('template', template.id, template.name)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Content: List View */}
      {!isLoading && !isEmpty && viewMode === 'list' && (
        <div className="space-y-2">
          {/* Folders section - List */}
          {folders && folders.length > 0 && (
            <div className="space-y-1">
              <h2 className="text-sm font-medium text-muted-foreground mb-2">
                {isSearching ? 'Matching Folders' : 'Folders'}
              </h2>
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className={cn(
                    'group flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-colors',
                    'hover:bg-muted/50'
                  )}
                  onClick={() => handleNavigateToFolder(folder.id)}
                >
                  {/* Folder icon */}
                  <div className="w-10 h-10 flex-shrink-0">
                    <svg
                      viewBox="0 0 120 90"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-full h-full"
                    >
                      <path
                        d="M8 20C8 15.5817 11.5817 12 16 12H38C40.1217 12 42.1566 12.8429 43.6569 14.3431L48 18.6863C49.5003 20.1866 51.5352 21.0294 53.6569 21.0294H104C108.418 21.0294 112 24.6111 112 29.0294V78C112 82.4183 108.418 86 104 86H16C11.5817 86 8 82.4183 8 78V20Z"
                        fill={folder.color || '#3f3f46'}
                      />
                    </svg>
                  </div>

                  {/* Folder info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{folder.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {folder._count.templates} {folder._count.templates === 1 ? 'template' : 'templates'}
                    </p>
                  </div>

                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem
                        onClick={() =>
                          setEditFolderDialog({
                            open: true,
                            folderId: folder.id,
                            folderName: folder.name,
                            folderColor: folder.color,
                          })
                        }
                      >
                        <Palette className="mr-2 h-4 w-4" />
                        Edit Folder
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => handleDeleteClick('folder', folder.id, folder.name)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}

          {/* Templates section - List */}
          {templates.length > 0 && (
            <div className="space-y-1">
              <h2 className="text-sm font-medium text-muted-foreground mb-2 mt-4">
                {isSearching ? 'Matching Templates' : 'Templates'}
              </h2>
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={cn(
                    'group flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-colors',
                    'hover:bg-muted/50'
                  )}
                  onClick={() => handleEditTemplate(template.id)}
                >
                  {/* Template icon */}
                  <div className="w-10 h-10 flex-shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-primary" />
                  </div>

                  {/* Template info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{template.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{template.subject}</p>
                  </div>

                  {/* Usage info */}
                  <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
                    {template.usageCount > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        Used {template.usageCount}×
                      </Badge>
                    )}
                    {template.lastUsedAt && (
                      <span className="hidden md:flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(template.lastUsedAt))} ago
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDuplicate(template.id)
                        }}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          handleMoveClick(template.id, template.name, template.folderId)
                        }}
                      >
                        <FolderInput className="mr-2 h-4 w-4" />
                        Move to...
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteClick('template', template.id, template.name)
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Template Editor Dialog - controlled by URL */}
      <TemplateEditorDialog
        open={editorOpen}
        onOpenChange={(open) => {
          if (!open) handleEditorClose()
        }}
        template={editingTemplateId === 'new' ? null : (editingTemplate as SerializedTemplate) || null}
        onSave={handleEditorSave}
        onClose={handleEditorClose}
        currentFolderId={currentFolderId}
      />

      {/* Create Folder Dialog */}
      <CreateFolderDialog
        open={createFolderOpen}
        onClose={() => setCreateFolderOpen(false)}
        onCreate={handleCreateFolder}
        isLoading={createFolderMutation.isPending}
      />

      {/* Edit Folder Dialog */}
      {editFolderDialog && (
        <EditFolderDialog
          open={editFolderDialog.open}
          onClose={() => setEditFolderDialog(null)}
          folderId={editFolderDialog.folderId}
          folderName={editFolderDialog.folderName}
          folderColor={editFolderDialog.folderColor}
          onSave={(data) => {
            updateFolderMutation.mutate({
              organizationId,
              folderId: editFolderDialog.folderId,
              name: data.name,
              color: data.color,
            })
          }}
          isSaving={updateFolderMutation.isPending}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteDialog?.open ?? false}
        onOpenChange={(open) => {
          if (!open) setDeleteDialog(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteDialog?.type === 'folder' ? 'Folder' : 'Template'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteDialog?.name}&quot;?
              {deleteDialog?.type === 'folder' && (
                <span className="block mt-2 text-amber-600 dark:text-amber-500">
                  Templates in this folder will be moved to root. Subfolders will also be deleted.
                </span>
              )}
              <span className="block mt-2">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {(deleteFolderMutation.isPending || deleteMutation.isPending) ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move Template Dialog */}
      {moveDialog && (
        <MoveTemplateDialog
          open={moveDialog.open}
          onClose={() => setMoveDialog(null)}
          templateId={moveDialog.templateId}
          templateName={moveDialog.templateName}
          organizationId={organizationId}
          currentFolderId={moveDialog.currentFolderId}
          onMove={handleMoveTemplate}
          isMoving={moveMutation.isPending}
        />
      )}
    </div>
  )
}
