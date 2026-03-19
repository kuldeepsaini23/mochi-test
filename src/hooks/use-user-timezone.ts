'use client'

/**
 * User Timezone Hook
 *
 * WHY: Provides access to the current user's timezone preference for calendar display
 * HOW: Fetches timezone from user profile via tRPC with caching
 *
 * USAGE:
 * - Calendar events displayed in user's preferred timezone
 * - Availability settings shown in correct timezone
 * - Time formatting respects user preference
 *
 * SOURCE OF TRUTH KEYWORDS: UserTimezone, TimezonePreference, CalendarTimezone
 */

import { trpc } from '@/trpc/react-provider'
import { getBrowserTimezone } from '@/lib/timezone/timezone-utils'

/**
 * Hook to get the current user's timezone preference
 *
 * WHY: Calendar components need to display times in user's preferred timezone
 * HOW: Fetches from user profile, falls back to browser timezone if not set
 *
 * @returns Object with timezone string and loading state
 */
export function useUserTimezone() {
  /**
   * Fetch user's timezone preference from the database
   * Uses tRPC query with automatic caching
   */
  const timezoneQuery = trpc.memberAvailability.getMyTimezone.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  })

  /**
   * User's timezone preference
   * Falls back to browser timezone if not set or query fails
   */
  const timezone = timezoneQuery.data?.timezone ?? getBrowserTimezone()

  return {
    /** User's timezone (IANA format, e.g., "America/New_York") */
    timezone,
    /** Whether timezone is still loading from server */
    isLoading: timezoneQuery.isLoading,
    /** Whether timezone is being refetched */
    isFetching: timezoneQuery.isFetching,
    /** Any error from fetching timezone */
    error: timezoneQuery.error,
    /** Refetch timezone from server */
    refetch: timezoneQuery.refetch,
  }
}
