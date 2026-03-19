/**
 * Affiliates Page - Blazing Fast Navigation with Client-Side Caching
 *
 * WHY: Enables instant re-navigation without skeleton flashes
 * HOW: Page only renders the client component which handles all data fetching
 *
 * CACHING ARCHITECTURE:
 * - Initial load: Client component shows skeleton, fetches from server
 * - Re-navigation: Instant render from TanStack Query cache (no skeleton)
 *
 * This pattern eliminates server-side data fetching in the page component,
 * moving all organization/permission checks to the client where TanStack Query
 * can cache the data with aggressive settings (staleTime: Infinity).
 *
 * Search Keywords: SOURCE OF TRUTH, AFFILIATES PAGE, CLIENT CACHING, PERFORMANCE
 */

import { AffiliatesPageContent } from './_components/affiliates-page-content'

export default function AffiliatesPage() {
  return <AffiliatesPageContent />
}
