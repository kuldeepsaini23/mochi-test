/**
 * Products Page - Blazing Fast Navigation with Client-Side Caching
 *
 * WHY: Minimal server component for instant navigation
 * HOW: All data fetching and permissions handled client-side in ProductsTab
 *
 * Products allow users to create and manage their digital products with
 * multiple pricing options (one-time, recurring, split payments) and features.
 */

import { ProductsTab } from './_components/products-tab'

export default function ProductsPage() {
  return <ProductsTab />
}
