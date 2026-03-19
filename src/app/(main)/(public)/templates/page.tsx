/**
 * ============================================================================
 * PUBLIC TEMPLATE LIBRARY PAGE
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: TemplateLibraryPublicPage, TemplateBrowsePublic
 *
 * WHY: Public-facing template library at /templates. No authentication
 * required. Renders the full browse experience — sidebar categories on the
 * left, template grid on the right.
 *
 * HOW: Server component that renders the TemplateBrowseView client component.
 * The browse view manages its own state (filters, search, pagination) via
 * the TemplateBrowseProvider context, and contains its own sidebar.
 */

import { TemplateBrowseView } from '@/components/templates/template-browse-view'

export const metadata = {
  title: 'Templates',
  description: 'Browse and install reusable templates for your organization',
}

export default function TemplateLibraryPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8 lg:px-10">
      <TemplateBrowseView basePath="/templates" />
    </div>
  )
}
