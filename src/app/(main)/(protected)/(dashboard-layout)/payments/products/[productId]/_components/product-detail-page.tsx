/**
 * Product Detail Page Component - Active Organization Pattern
 *
 * WHY: Wrapper component that handles organization and product data fetching
 * HOW: Uses useActiveOrganization hook for org context, then fetches product client-side
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based access control via hasPermission helper
 * - Fetches product data client-side with loading states
 * - Renders ProductDetail component with all necessary props
 *
 * PERMISSIONS:
 * - canUpdate: Can edit product details, toggle active, edit prices/features
 * - canDelete: Can delete product and prices
 * - canCreatePrice: Can add new prices (uses PRODUCTS_CREATE permission)
 *
 * SOURCE OF TRUTH: Product, ActiveOrganization
 */

'use client'

import { notFound } from 'next/navigation'
import { trpc } from '@/trpc/react-provider'
import { ProductDetail } from './product-detail'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import ProductDetailLoading from '../loading'

interface ProductDetailPageProps {
  productId: string
}

/**
 * ProductDetailPage component with integrated organization caching
 * Only requires productId prop - fetches organization data internally with aggressive caching
 */
export function ProductDetailPage({ productId }: ProductDetailPageProps) {
  /**
   * Get active organization from the hook
   * This respects domain-first approach and session activeOrganizationId
   */
  const { activeOrganization, isLoading: isLoadingOrg, hasPermission } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''

  /**
   * Extract role and permissions from active organization for child components
   */
  const userRole = activeOrganization?.role ?? ''
  const userPermissions = activeOrganization?.permissions ?? []

  /**
   * Check permission using hook's hasPermission helper
   * Owners have full access, members need explicit permission
   */
  const hasAccess = hasPermission(permissions.PRODUCTS_READ)

  // Fetch product data client-side (only when we have an organization and access)
  const { data: product, isLoading: isLoadingProduct } =
    trpc.products.getById.useQuery(
      {
        organizationId,
        productId,
      },
      {
        enabled: !!organizationId && hasAccess,
      }
    )

  // Show loading skeleton while fetching organization data (only on initial load)
  if (isLoadingOrg && !activeOrganization) {
    return <ProductDetailLoading />
  }

  // Handle no organization found
  if (!activeOrganization) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">
          No organization found. Please contact your administrator.
        </p>
      </div>
    )
  }

  // Handle no access permission
  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">
          You do not have permission to view this product.
        </p>
      </div>
    )
  }

  // Show loading state while fetching product
  if (isLoadingProduct) {
    return <ProductDetailLoading />
  }

  // Handle product not found
  if (!product) {
    notFound()
  }

  // Render product detail with all organization data
  return (
    <ProductDetail
      product={product}
      organizationId={organizationId}
      userRole={userRole}
      userPermissions={userPermissions}
    />
  )
}
