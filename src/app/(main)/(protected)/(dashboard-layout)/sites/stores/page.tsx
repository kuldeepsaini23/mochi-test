/**
 * Stores Page - Blazing Fast Navigation with Client-Side Caching
 *
 * WHY: Minimal server component that only renders the client component
 * HOW: All data fetching and permission checks are done client-side with
 *      aggressive caching for instant navigation
 *
 * ARCHITECTURE:
 * - Server component = zero server-side data fetching (instant page load)
 * - Client component handles all data fetching with React Query caching
 * - Organizations are cached indefinitely for blazing fast access
 *
 * SOURCE OF TRUTH: Store, StoreProduct, Ecommerce, ProductCatalog
 */

import { StoresPageContent } from './_components/stores-page-content'

export default function StoresPage() {
  return <StoresPageContent />
}
