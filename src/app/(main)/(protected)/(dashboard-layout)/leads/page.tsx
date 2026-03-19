/**
 * Leads Page - Blazing Fast Navigation with Client-Side Caching
 *
 * WHY: CRM leads management for organization contacts and prospects
 * HOW: Protected by (protected)/layout.tsx which runs handleRedirectCheck()
 *
 * PERMISSION: Requires leads:read to view leads
 *
 * CACHING ARCHITECTURE:
 * - Initial load: Client component shows skeleton, fetches from server
 * - Re-navigation: Instant render from TanStack Query cache (no skeleton)
 *
 * Search Keywords: SOURCE OF TRUTH, LEADS PAGE, CLIENT CACHING, PERFORMANCE
 */

import { LeadsPageContent } from './_components/leads-page-content'

export default function LeadsPage() {
  return <LeadsPageContent />
}
