/**
 * Team Page - Blazing Fast Navigation with Client-Side Caching
 *
 * WHY: Server components that fetch data cause delay on every navigation.
 * By delegating to a client component with TanStack Query caching, we achieve:
 * - Initial load: Client shows skeleton, fetches from server
 * - Re-navigation: Instant render from cache (no skeleton, no server call)
 *
 * ARCHITECTURE:
 * - Page is a thin wrapper - no server-side data fetching
 * - TeamClient handles organization fetching with aggressive caching
 * - Permission checks happen client-side using cached organization data
 *
 * Search Keywords: SOURCE OF TRUTH, TEAM PAGE, CLIENT CACHING, PERFORMANCE
 */

import { TeamClient } from './_components/team-client'

export default function TeamPage() {
  return <TeamClient />
}
