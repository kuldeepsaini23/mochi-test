/**
 * ============================================================================
 * INSTALLED TEMPLATES PAGE — Dashboard Route for Installed Templates
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: InstalledTemplatesPage, InstalledTemplatesRoute
 *
 * WHY: Server component page at /marketplace/installed. Shows all templates
 * that have been installed into the current organization, with sync/update
 * capabilities. Delegates all client-side logic to InstalledContent.
 *
 * HOW: Exports metadata for SEO/tab title and renders the InstalledContent
 * client component which handles org resolution and view rendering.
 */

import { InstalledContent } from '../_components/installed-content'

export const metadata = {
  title: 'Installed Templates - Marketplace',
  description: 'View and manage templates installed in your organization',
}

export default function InstalledTemplatesPage() {
  return <InstalledContent />
}
