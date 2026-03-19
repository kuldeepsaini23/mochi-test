/**
 * ============================================================================
 * MARKETPLACE PAGE — Dashboard Template Browse
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: MarketplacePage, TemplateMarketplace
 *
 * WHY: Dashboard route at /marketplace for browsing the template library.
 * This is the default tab (Browse) in the marketplace layout. The layout
 * provides the SectionHeader and MarketplaceNav tabs; this page just renders
 * the browse content with category sidebar, search, and template grid.
 *
 * HOW: Server component exports metadata, renders MarketplaceBrowseContent
 * (client component) which handles org resolution and the TemplateBrowseView.
 */

import { MarketplaceBrowseContent } from './_components/marketplace-browse-content'

export const metadata = {
  title: 'Marketplace',
  description: 'Browse, create, and manage reusable templates',
}

export default function MarketplacePage() {
  return <MarketplaceBrowseContent />
}
