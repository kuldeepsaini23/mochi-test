/**
 * Dashboard Page - Blazing Fast Navigation with Client-Side Caching
 *
 * WHY: Landing page for authenticated users who completed onboarding
 * HOW: Protected by (protected)/layout.tsx which runs handleRedirectCheck()
 *
 * PERMISSION: Requires analytics:read to view dashboard
 *
 * ============================================================================
 * CACHING ARCHITECTURE
 * ============================================================================
 *
 * This page uses CLIENT-SIDE CACHING for blazing fast re-navigation:
 * - Initial load: DashboardContent shows skeleton, fetches from server
 * - Re-navigation: Instant render from TanStack Query cache (no skeleton)
 *
 * This is the same pattern used by the Pipelines page, which enables
 * instant page transitions when navigating between pages.
 *
 * KEY SETTINGS (in useDashboardOrganization hook):
 * - staleTime: Infinity - data never becomes stale
 * - gcTime: 30 minutes - cache survives for 30 min
 * - refetchOnWindowFocus: false - no refetch on tab focus
 * - refetchOnMount: false - use cache on re-navigation
 *
 * Search Keywords: SOURCE OF TRUTH, DASHBOARD PAGE, CLIENT CACHING, PERFORMANCE
 */

import { DashboardContent } from './_components/dashboard-content'

export default function DashboardPage() {
  /**
   * Render client component that handles all data fetching with caching
   * WHY: Client-side caching enables instant re-navigation
   */
  return <DashboardContent />
}
