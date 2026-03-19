/**
 * Calendar Page - Blazing Fast Navigation with Client-Side Caching
 *
 * WHY: Calendar booking system for viewing and managing events, meetings, and appointments
 * HOW: Protected by (protected)/layout.tsx which runs handleRedirectCheck()
 *
 * PERMISSION: Requires calendar:read to view calendar
 *
 * ============================================================================
 * CACHING ARCHITECTURE
 * ============================================================================
 *
 * This page uses CLIENT-SIDE CACHING for blazing fast re-navigation:
 * - Initial load: CalendarPageContent shows skeleton, fetches from server
 * - Re-navigation: Instant render from TanStack Query cache (no skeleton)
 *
 * Same pattern as Dashboard, Inbox, and Pipelines pages - page.tsx is minimal,
 * client component handles all data fetching with aggressive caching.
 *
 * Search Keywords: SOURCE OF TRUTH, CALENDAR PAGE, CLIENT CACHING, PERFORMANCE
 */

import { CalendarPageContent } from './_components/calendar-page-content'

export default function CalendarPage() {
  /**
   * Render client component that handles all data fetching with caching
   * WHY: Client-side caching enables instant re-navigation
   * NOTE: CalendarPageContent fetches organization data internally with aggressive caching
   */
  return <CalendarPageContent />
}
