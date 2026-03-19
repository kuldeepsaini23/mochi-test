/**
 * CMS Page - Blazing Fast Navigation with Client-Side Caching
 *
 * WHY: Minimal server component that only renders the client component
 * HOW: All data fetching and permission checks are done client-side with
 *      aggressive caching for instant navigation
 *
 * ARCHITECTURE:
 * - Server component = zero server-side data fetching (instant page load)
 * - Client component handles all data fetching with React Query caching
 * - Organizations are cached indefinitely for blazing fast access
 * - Wrapped in Suspense because CmsPageContent uses useSearchParams
 *   (Next.js requires Suspense boundary for useSearchParams in client components)
 *
 * SOURCE OF TRUTH: CmsTable, CmsColumn, CmsRow, Organization
 */

import { Suspense } from 'react'
import { CmsPageContent } from './_components/cms-page-content'

export default function CmsPage() {
  return (
    <Suspense>
      <CmsPageContent />
    </Suspense>
  )
}
