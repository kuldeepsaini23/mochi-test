/**
 * ============================================================================
 * MY TEMPLATES PAGE — Dashboard Route for Organization Templates
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: MyTemplatesPage, MyTemplatesRoute
 *
 * WHY: Server component page at /marketplace/my-templates. Shows all templates
 * created by the current organization with management capabilities (republish,
 * delete). Delegates all client-side logic to MyTemplatesContent.
 *
 * HOW: Exports metadata for SEO/tab title and renders the MyTemplatesContent
 * client component which handles org resolution and view rendering.
 */

import { MyTemplatesContent } from '../_components/my-templates-content'

export const metadata = {
  title: 'My Templates - Marketplace',
  description: 'Manage templates created by your organization',
}

export default function MyTemplatesPage() {
  return <MyTemplatesContent />
}
