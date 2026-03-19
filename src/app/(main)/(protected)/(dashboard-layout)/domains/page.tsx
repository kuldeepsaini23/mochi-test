/**
 * Domains Page - Blazing Fast Navigation with Client-Side Caching
 *
 * WHY: Unified domain management for website and email domains
 * HOW: Protected by (protected)/layout.tsx which runs handleRedirectCheck()
 *
 * PERMISSION: Requires domains:read to view
 *
 * CACHING ARCHITECTURE:
 * - Initial load: Client component shows skeleton, fetches from server
 * - Re-navigation: Instant render from TanStack Query cache (no skeleton)
 *
 * Search Keywords: SOURCE OF TRUTH, DOMAINS PAGE, CLIENT CACHING, PERFORMANCE
 */

import { DomainsPageContent } from './_components/domains-page-content'

export default function DomainsPage() {
  return <DomainsPageContent />
}
