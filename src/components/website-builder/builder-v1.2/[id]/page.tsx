/**
 * ============================================================================
 * TEST BUILDER V1 - Dynamic Page Entry Point
 * ============================================================================
 *
 * This is the entry point for editing a specific website in the canvas builder.
 * The [id] parameter is the website ID from the database.
 *
 * ROUTE: /test-builder-v1/[id]
 *
 * ============================================================================
 * DATA FLOW WITH TRPC PREFETCHING
 * ============================================================================
 *
 * 1. Server Component (this file):
 *    - Gets organizationId from cached organizations (prefetched in layout)
 *    - Prefetches builder data using tRPC queryOptions
 *    - Passes websiteId and organizationId to client
 *
 * 2. Client Component (BuilderClient):
 *    - Wraps Canvas in Redux Provider + HydrationBoundary
 *    - Uses useSuspenseQuery to get prefetched data instantly
 *    - Loads canvas data into Redux store
 *
 * This pattern ensures:
 * - First visit: Data loads server-side, no loading spinner for canvas data
 * - Page switches: Instant if prefetched, skeleton if not
 * - Browser refresh: Server prefetches, client hydrates immediately
 *
 * ============================================================================
 * CRITICAL ARCHITECTURE - READ BEFORE MODIFYING
 * ============================================================================
 *
 * This application uses a HYBRID STATE ARCHITECTURE for optimal performance:
 *
 * 1. REDUX TOOLKIT (Single Source of Truth)
 *    - Stores all PERSISTENT data (elements, selection, tool mode, viewport)
 *    - Provides O(1) element lookups via normalized data structure
 *    - Handles undo/redo via state snapshots
 *    - Data is SERIALIZABLE for database storage
 *
 * 2. REACT REFS (Performance-Critical Interaction State)
 *    - Stores EPHEMERAL state during drag/resize/creation operations
 *    - NO React re-renders during 60fps interactions
 *    - Updated via requestAnimationFrame for smooth animations
 *
 * 3. DIRECT DOM MANIPULATION (Visual Feedback)
 *    - Used for real-time visual updates during interactions
 *    - Transform, opacity, and style changes during drag
 *
 * ============================================================================
 * FILE STRUCTURE
 * ============================================================================
 *
 * /test-builder-v1/
 * ├── [id]/page.tsx            - This file (server component with prefetching)
 * ├── [id]/builder-client.tsx  - Client component with Redux Provider
 * ├── _lib/                    - Core library code
 * │   ├── types.ts             - All type definitions (SOURCE OF TRUTH)
 * │   ├── canvas-slice.ts      - Redux slice with actions and selectors
 * │   ├── store.ts             - Redux store configuration
 * │   ├── render-mode-context.tsx - RenderModeProvider for canvas/preview modes
 * │   ├── shared-element-styles.ts - Position/size/wrapper style utilities
 * │   └── index.ts             - Central exports
 * ├── _hooks/                  - Custom hooks for interactions
 * │   ├── use-drag.ts          - Drag and drop with 60fps refs
 * │   ├── use-resize.ts        - Element resizing with 60fps refs
 * │   ├── use-frame-creation.ts - Drawing new frames
 * │   └── index.ts             - Central exports
 * └── _components/             - UI components
 *     ├── canvas/              - Canvas editor (ElementWrapper, wrappers)
 *     ├── unified-elements/    - ONE component per type (canvas + preview)
 *     ├── shared/              - NonInteractiveChildRenderer (canvas children)
 *     ├── renderers/           - Page renderer + ComponentChildRenderer
 *     ├── sidebar/             - Element/component sidebar
 *     ├── header/              - Top toolbar and breakpoint controls
 *     └── overlay/             - Gradient border overlay
 *
 * ============================================================================
 * DATA FLOW
 * ============================================================================
 *
 * Redux Store (Single Source of Truth)
 *     ↓ reads via useAppSelector
 * Canvas Component
 *     ↓ passes data and handlers
 * FrameElement, ResizeHandles, etc.
 *     ↓ trigger pointer events
 * Hooks (useDrag, useResize, useFrameCreation)
 *     ↓ update REFS during 60fps operations
 *     ↓ dispatch to Redux ONLY on interaction end
 * Redux Store (cycle completes)
 *
 * ============================================================================
 * KEY RULES (Read these before making changes!)
 * ============================================================================
 *
 * 1. DO NOT dispatch Redux actions in pointer move handlers
 * 2. DO use refs for anything that updates at 60fps
 * 3. DO use RAF for DOM updates during interactions
 * 4. DO dispatch to Redux only when interactions complete
 * 5. DO keep components as pure renderers (read from Redux, render UI)
 *
 * ============================================================================
 */

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getQueryClient, trpc } from '@/trpc/server'
import { handleAuthError } from '@/lib/errors'
import { permissions } from '@/lib/better-auth/permissions'
import { BuilderClient } from './builder-client'
import { CanvasLoader } from '../_components/canvas'

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * Server component that prefetches builder data and passes to client.
 *
 * WHY: Prefetching ensures instant data availability on client.
 * HOW: Uses tRPC queryOptions to prefetch, HydrationBoundary to transfer.
 *
 * PERMISSION CHECK:
 * - Checks WEBSITES_READ permission using cached organization data
 * - Zero additional DB calls (uses layout-prefetched data)
 * - Returns error UI if no permission
 */
export default async function TestBuilderV1Page({ params }: PageProps) {
  const queryClient = getQueryClient()

  // Await the params promise (Next.js 15 async params)
  const { id: pageId } = await params

  // Get active organization from cache (prefetched in layout)
  // Uses getActiveOrganization which respects domain-first approach
  const activeOrg = await queryClient
    .fetchQuery(trpc.organization.getActiveOrganization.queryOptions())
    .catch(handleAuthError)

  // Handle no organization case
  if (!activeOrg) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="max-w-md text-center space-y-2 p-6">
          <p className="text-sm text-destructive font-medium">
            No organization found
          </p>
          <p className="text-xs text-muted-foreground">
            Please contact your administrator.
          </p>
        </div>
      </div>
    )
  }

  // Check permission using cached data (zero DB calls)
  const hasAccess =
    activeOrg.role === 'owner' ||
    activeOrg.permissions.includes(permissions.WEBSITES_READ)

  if (!hasAccess) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="max-w-md text-center space-y-2 p-6">
          <p className="text-sm text-destructive font-medium">
            You don&apos;t have permission to edit websites
          </p>
          <p className="text-xs text-muted-foreground">
            Contact your organization owner to grant you the{' '}
            <code className="px-1 py-0.5 bg-muted rounded text-xs">
              websites:read
            </code>{' '}
            permission.
          </p>
        </div>
      </div>
    )
  }

  // Fetch builder data and check if page exists
  // We await here to handle the case where page was deleted
  // This ensures we redirect gracefully instead of showing an error
  // Uses the dedicated builder router for consistent data fetching
  const builderData = await queryClient
    .fetchQuery(
      trpc.builder.getDataById.queryOptions({
        organizationId: activeOrg.id,
        pageId,
      })
    )
    .catch(() => null)

  // Website not found (deleted or invalid ID) - redirect to websites list
  if (!builderData) {
    redirect('/sites/websites')
  }

  // Extract the first page slug from canvasData for initial active page
  // This is the default page to show when no specific page is requested
  let initialPathname = ''
  const canvasData = builderData.canvasData as {
    pages?: Record<string, { info?: { slug?: string } }>
    pageOrder?: string[]
  } | null

  if (canvasData?.pages && canvasData?.pageOrder?.length) {
    const firstPageId = canvasData.pageOrder[0]
    const firstPage = canvasData.pages[firstPageId]
    if (firstPage?.info?.slug) {
      initialPathname = firstPage.info.slug.replace(/^\//, '')
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<CanvasLoader isVisible={true} />}>
        <BuilderClient
          pageId={pageId}
          organizationId={activeOrg.id}
          initialPathname={initialPathname}
        />
      </Suspense>
    </HydrationBoundary>
  )
}
