/**
 * Custom Data Page - Blazing Fast Navigation with Client-Side Caching
 *
 * WHY: Allows users to create custom data sets with fields to capture
 * additional information about their leads.
 * HOW: Protected by (protected)/layout.tsx which runs handleRedirectCheck()
 *
 * PERMISSION: Requires custom-fields:read to view
 *
 * CACHING ARCHITECTURE:
 * - Initial load: Client component shows skeleton, fetches from server
 * - Re-navigation: Instant render from TanStack Query cache (no skeleton)
 *
 * Search Keywords: SOURCE OF TRUTH, CUSTOM DATA PAGE, CLIENT CACHING, PERFORMANCE
 */

import { ContentLayout } from '@/components/global/content-layout'
import { CustomDataTab } from './_components/custom-data-tab'

export default function CustomDataPage() {
  return (
    <ContentLayout>
      <CustomDataTab />
    </ContentLayout>
  )
}
