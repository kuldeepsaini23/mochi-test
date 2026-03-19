/**
 * Inbox Page - Blazing Fast Navigation with Client-Side Caching
 *
 * WHY: Unified inbox for viewing and managing conversations
 * HOW: Protected by (protected)/layout.tsx which runs handleRedirectCheck()
 *
 * PERMISSION: Requires submissions:read to view inbox
 *
 * ============================================================================
 * CACHING ARCHITECTURE
 * ============================================================================
 *
 * This page uses CLIENT-SIDE CACHING for blazing fast re-navigation:
 * - Initial load: InboxPageContent shows skeleton, fetches from server
 * - Re-navigation: Instant render from TanStack Query cache (no skeleton)
 *
 * Same pattern as Dashboard and Pipelines pages - page.tsx is minimal,
 * client component handles all data fetching with aggressive caching.
 *
 * Search Keywords: SOURCE OF TRUTH, INBOX PAGE, CLIENT CACHING, PERFORMANCE
 */

import { InboxPageContent } from './_components/inbox-page-content'

export default function InboxPage() {
  /**
   * Render client component that handles all data fetching with caching
   * WHY: Client-side caching enables instant re-navigation
   * NOTE: InboxPageContent fetches organization data internally with aggressive caching
   */
  return <InboxPageContent />
}
