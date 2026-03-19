/**
 * ============================================================================
 * MARKETPLACE LAYOUT — Dashboard Template Marketplace
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: MarketplaceLayout, MarketplaceDashboard
 *
 * WHY: Shared layout for all marketplace pages (/marketplace, /marketplace/my-templates,
 * /marketplace/installed, /marketplace/[templateId]). Provides consistent page
 * structure with header and navigation tabs — exactly like the settings layout.
 *
 * HOW: Server component that wraps child pages in ContentLayout with a
 * SectionHeader and MarketplaceNav. Each child page handles its own data
 * fetching and permissions.
 *
 * PERMISSION: Each child page handles its own permissions independently.
 */

import { ContentLayout } from '@/components/global/content-layout'
import { SectionHeader } from '@/components/global/section-header'
import { MarketplaceNav } from './_components/marketplace-nav'

export default function MarketplaceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ContentLayout>
      <div className="space-y-6">
        {/* Page Header — title and description for the marketplace section */}
        <SectionHeader
          title="Marketplace"
          description="Browse, create, and manage reusable templates for websites, emails, automations, and blueprints"
        />

        {/* Navigation Tabs — Browse, My Templates, Installed + Create button */}
        <MarketplaceNav />

        {/* Child pages — each route renders its own content */}
        <div className="pt-2">
          {children}
        </div>
      </div>
    </ContentLayout>
  )
}
