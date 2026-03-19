/**
 * Permission Sync Hook
 *
 * WHY: Critical for security - keeps client permissions in sync with server changes
 * HOW: Listens for realtime permission events and invalidates cache automatically
 *
 * EVENTS HANDLED:
 * - permissions.memberUpdated: User's role/permissions changed directly
 * - permissions.roleUpdated: A role definition changed (affects all users with that role)
 * - permissions.memberRemoved: User was removed from organization
 *
 * SECURITY:
 * - Events contain targetUserId - only processes events for current user
 * - Doesn't trust event data for permissions - always refetches from server
 * - On member removal, redirects to org selector instead of showing errors
 *
 * SOURCE OF TRUTH KEYWORDS: PermissionSync, RealtimePermissions, CacheInvalidation
 */

'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useRealtime } from '@/lib/realtime-client'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'

interface UsePermissionSyncOptions {
  /** Whether to show toast notifications on permission changes */
  showNotifications?: boolean
}

/**
 * Hook to sync permissions in realtime
 *
 * USAGE: Add this hook once in a high-level layout component.
 * It will automatically listen for permission changes and update the cache.
 *
 * @example
 * ```tsx
 * // In your protected layout:
 * function ProtectedLayout({ children }) {
 *   usePermissionSync({ showNotifications: true })
 *   return <>{children}</>
 * }
 * ```
 */
export function usePermissionSync(options: UsePermissionSyncOptions = {}) {
  const { showNotifications = true } = options
  const router = useRouter()
  const params = useParams()
  const utils = trpc.useUtils()

  /**
   * Get current user from cached profile data
   *
   * WHY: Better Auth's useSession is an atom, not a traditional hook
   * HOW: Use prefetched user.getProfile which is already hydrated
   *
   * SOURCE OF TRUTH: User ID comes from tRPC user.getProfile query
   */
  const { data: user } = trpc.user.getProfile.useQuery(undefined, {
    staleTime: Infinity,
    gcTime: Infinity,
  })
  const userId = user?.id

  /**
   * Track last processed event to prevent duplicate processing
   * (SSE can sometimes deliver the same event multiple times)
   */
  const lastProcessedRef = useRef<string>('')

  /**
   * Invalidate the user's organization permissions cache
   * This forces a refetch of getUserOrganizations on next access
   */
  const invalidatePermissions = useCallback(async () => {
    await utils.organization.getUserOrganizations.invalidate()
  }, [utils])

  /**
   * Handle member being removed from organization
   * Redirects them to org selector with a message
   */
  const handleMemberRemoved = useCallback(
    async (organizationId: string) => {
      // Invalidate cache first
      await invalidatePermissions()

      // Get current org from URL params (handles both slug and id patterns)
      const currentOrgParam = params?.organizationId || params?.organizationSlug

      // If user is currently viewing the org they were removed from, redirect
      if (currentOrgParam === organizationId) {
        if (showNotifications) {
          toast.error('Access removed', {
            description:
              'You have been removed from this organization. Redirecting...',
            duration: 4000,
          })
        }

        // Short delay for toast to show, then redirect
        setTimeout(() => {
          router.push('/')
        }, 1000)
      } else {
        // User is in a different org, just show notification
        if (showNotifications) {
          toast.info('Access updated', {
            description: 'You have been removed from an organization.',
          })
        }
      }
    },
    [invalidatePermissions, params, router, showNotifications]
  )

  /**
   * Handle permission update (role change or role definition change)
   *
   * WHY: Simple, clean notification without showing technical details
   * HOW: Just inform user permissions changed - they'll see the effect in UI
   */
  const handlePermissionUpdate = useCallback(async () => {
    // Invalidate cache - new permissions will be fetched on next access
    await invalidatePermissions()

    if (showNotifications) {
      toast.info('Permissions updated', {
        description: 'Your access permissions have been updated by an admin.',
        duration: 4000,
      })
    }
  }, [invalidatePermissions, showNotifications])

  /**
   * Subscribe to permission-related realtime events
   */
  useRealtime({
    events: [
      'permissions.memberUpdated',
      'permissions.roleUpdated',
      'permissions.memberRemoved',
    ],
    onData({ event, data }) {
      // Skip if no user session
      if (!userId) return

      // Create event ID for deduplication
      const eventId = `${event}-${JSON.stringify(data)}`
      if (lastProcessedRef.current === eventId) return
      lastProcessedRef.current = eventId

      /**
       * Handle each event type with proper filtering
       */
      if (event === 'permissions.memberUpdated') {
        // Only process if this event is for the current user
        if (data.targetUserId === userId) {
          handlePermissionUpdate()
        }
      } else if (event === 'permissions.roleUpdated') {
        // Check if current user is in the affected users list
        if (data.affectedUserIds.includes(userId)) {
          handlePermissionUpdate()
        }
      } else if (event === 'permissions.memberRemoved') {
        // Only process if this event is for the current user
        if (data.targetUserId === userId) {
          handleMemberRemoved(data.organizationId)
        }
      }
    },
  })

  /**
   * Clear last processed ref when userId changes
   * (e.g., when user signs out and back in)
   */
  useEffect(() => {
    lastProcessedRef.current = ''
  }, [userId])
}
