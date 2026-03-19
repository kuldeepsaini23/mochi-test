/**
 * ============================================================================
 * TEMPLATE LIBRARY — INSTALLED TEMPLATES VIEW
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: InstalledTemplatesView, InstalledTemplateCard,
 * InstalledTemplateItem, SyncChanges
 *
 * WHY: Shows all templates that have been installed into the current organization.
 * Users can see which templates they have, check for available updates, and sync
 * changes when the original template author publishes a new version.
 *
 * HOW: Reads organizationId from context, paginates through the listInstalled
 * tRPC query, and renders each installed template as a portrait card matching
 * the browse theme — clean, no heavy borders, ghost buttons.
 */

'use client'

import { useState } from 'react'
import {
  PackageCheck,
  RefreshCw,
  Loader2,
  ArrowUpCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react'

import { Button } from '@/components/ui/button'

import {
  TEMPLATE_CATEGORY_META,
  TEMPLATE_PAGE_SIZE,
} from '@/lib/templates/constants'
import type { TemplateCategory } from '@/lib/templates/types'
import { useTemplateLibrary } from './template-library-context'
import { trpc } from '@/trpc/react-provider'
import { cn } from '@/lib/utils'

// ============================================================================
// INSTALLED TEMPLATE ITEM TYPE
// ============================================================================

/**
 * Shape of a single installed template returned by the listInstalled query.
 *
 * SOURCE OF TRUTH: InstalledTemplateItem
 */
interface InstalledTemplateItem {
  installId: string
  templateId: string
  templateName: string
  templateDescription: string | null
  templateCategory: TemplateCategory
  templateThumbnail: string | null
  templateTags: string[]
  creatorOrgName: string
  installedByName: string
  installedAt: Date | string
  installedVersion: number
  currentVersion: number
  hasUpdate: boolean
  itemCount: number
  items: {
    id: string
    featureType: TemplateCategory
    sourceName: string
    order: number
  }[]
}

// ============================================================================
// SYNC STATUS TYPE
// ============================================================================

/**
 * Inline feedback state for the sync button on each card.
 *
 * SOURCE OF TRUTH: SyncStatus
 */
interface SyncStatus {
  state: 'idle' | 'syncing' | 'success' | 'partial' | 'error'
  message?: string
  updatedCount?: number
  restoredCount?: number
  missingItems?: { name: string; featureType: string }[]
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Installed templates view — portrait card grid matching the browse theme.
 * Clean layout with no heavy borders, ghost-style pagination.
 */
export function InstalledTemplatesView() {
  const { organizationId } = useTemplateLibrary()
  const [page, setPage] = useState(1)
  const [syncStatuses, setSyncStatuses] = useState<Record<string, SyncStatus>>({})

  const { data, isLoading } = trpc.templates.listInstalled.useQuery(
    {
      organizationId,
      page,
      pageSize: TEMPLATE_PAGE_SIZE,
    },
    {
      enabled: !!organizationId,
      placeholderData: (prev) => prev,
    }
  )

  const utils = trpc.useUtils()

  /** Sync mutation — pulls the latest version of a template into this org */
  const syncMutation = trpc.templates.syncChanges.useMutation({
    onSuccess: (result, variables) => {
      utils.templates.listInstalled.invalidate()

      const hasMissing = result.missingItems.length > 0
      const hasErrors = result.errors.length > 0
      const parts: string[] = []
      if (result.updatedCount > 0) parts.push(`${result.updatedCount} updated`)
      if (result.restoredCount > 0) parts.push(`${result.restoredCount} restored`)
      if (hasMissing) parts.push(`${result.missingItems.length} missing`)
      if (hasErrors) parts.push(`${result.errors.length} failed`)
      const message = parts.length > 0 ? parts.join(', ') : 'Synced successfully'

      setSyncStatuses((prev) => ({
        ...prev,
        [variables.installId]: {
          state: hasMissing || hasErrors ? 'partial' : 'success',
          message,
          updatedCount: result.updatedCount,
          restoredCount: result.restoredCount,
          missingItems: result.missingItems,
        },
      }))
    },
    onError: (error, variables) => {
      setSyncStatuses((prev) => ({
        ...prev,
        [variables.installId]: {
          state: 'error',
          message: error.message || 'Sync failed',
        },
      }))
    },
  })

  const handleSync = (installId: string) => {
    setSyncStatuses((prev) => ({
      ...prev,
      [installId]: { state: 'syncing' },
    }))
    syncMutation.mutate({ organizationId, installId })
  }

  const items = (data?.items ?? []) as InstalledTemplateItem[]
  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {isLoading ? (
        /* Loading Skeletons */
        <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <PackageCheck className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">
            No installed templates yet
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Browse the library and install templates to see them here
          </p>
        </div>
      ) : (
        /* Installed Template Card Grid */
        <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <InstalledTemplateCard
              key={item.installId}
              item={item}
              syncStatus={syncStatuses[item.installId] ?? { state: 'idle' }}
              onSync={handleSync}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && !isLoading && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// INSTALLED TEMPLATE CARD — Portrait card matching browse theme
// ============================================================================

interface InstalledTemplateCardProps {
  item: InstalledTemplateItem
  syncStatus: SyncStatus
  onSync: (installId: string) => void
}

/**
 * Portrait card for installed templates. Shows thumbnail, name, creator,
 * version info, update badge, and sync controls. Matches browse card aesthetic.
 */
function InstalledTemplateCard({ item, syncStatus, onSync }: InstalledTemplateCardProps) {
  const categoryMeta = TEMPLATE_CATEGORY_META[item.templateCategory]
  const CategoryIcon = categoryMeta.icon

  const formattedDate = new Date(item.installedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="group">
      {/* Thumbnail — portrait aspect ratio */}
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-muted">
        {item.templateThumbnail ? (
          <img
            src={item.templateThumbnail}
            alt={item.templateName}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <CategoryIcon className="h-8 w-8 text-muted-foreground/15" />
          </div>
        )}

        {/* Update badge — top right */}
        {item.hasUpdate && (
          <div className="absolute right-2 top-2">
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 flex items-center gap-1">
              <ArrowUpCircle className="h-3 w-3" />
              Update
            </span>
          </div>
        )}

        {/* Sync overlay — shown on hover when update is available */}
        {item.hasUpdate && (
          <div className="absolute inset-x-0 bottom-0 flex items-center bg-gradient-to-t from-black/60 to-transparent px-2.5 pb-2.5 pt-8 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="secondary"
              size="sm"
              className="h-7 w-full gap-1.5 text-xs"
              onClick={() => onSync(item.installId)}
              disabled={syncStatus.state === 'syncing'}
            >
              {syncStatus.state === 'syncing' ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-3 w-3" />
                  Sync Changes
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Template info below the thumbnail */}
      <div className="mt-2.5 space-y-0.5">
        <p className="truncate text-sm font-medium">{item.templateName}</p>
        <p className="text-xs text-muted-foreground">
          by {item.creatorOrgName}
        </p>
        <p className="text-xs text-muted-foreground/60">
          v{item.installedVersion} · {formattedDate}
        </p>
      </div>

      {/* Sync feedback — shown below the card */}
      <SyncFeedback syncStatus={syncStatus} />
    </div>
  )
}

// ============================================================================
// SYNC FEEDBACK — Inline status messages below the card
// ============================================================================

function SyncFeedback({ syncStatus }: { syncStatus: SyncStatus }) {
  if (syncStatus.state === 'idle' || syncStatus.state === 'syncing') return null

  return (
    <div className="mt-2 space-y-1">
      {syncStatus.state === 'success' && (
        <p className="flex items-center gap-1 text-xs text-green-600">
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          {syncStatus.message}
        </p>
      )}

      {(syncStatus.restoredCount ?? 0) > 0 && (
        <p className="flex items-center gap-1 text-xs text-blue-600">
          <RotateCcw className="h-3 w-3 shrink-0" />
          {syncStatus.restoredCount} restored
        </p>
      )}

      {syncStatus.state === 'partial' && (
        <p className="flex items-center gap-1 text-xs text-amber-600">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {syncStatus.message}
        </p>
      )}

      {syncStatus.state === 'error' && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <XCircle className="h-3 w-3 shrink-0" />
          {syncStatus.message}
        </p>
      )}
    </div>
  )
}

// ============================================================================
// SKELETON — Loading placeholder matching portrait card layout
// ============================================================================

function SkeletonCard() {
  return (
    <div>
      <div className="aspect-[3/4] rounded-lg bg-muted animate-pulse" />
      <div className="mt-2.5 space-y-1">
        <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
        <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
      </div>
    </div>
  )
}
