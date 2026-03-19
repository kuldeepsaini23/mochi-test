/**
 * Product Detail Page - Blazing Fast Navigation with Client-Side Caching
 *
 * WHY: Minimal server component for instant navigation
 * HOW: All data fetching and permissions handled client-side in ProductDetailPage
 *
 * Displays detailed information about a single product including pricing tiers,
 * features, and store associations with inline editing capabilities.
 */

import { ProductDetailPage } from './_components/product-detail-page'

interface PageProps {
  params: Promise<{ productId: string }>
}

export default async function ProductPage({ params }: PageProps) {
  const { productId } = await params
  return <ProductDetailPage productId={productId} />
}
