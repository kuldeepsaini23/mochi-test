/**
 * Email Templates Page - Blazing Fast Navigation with Client-Side Caching
 *
 * WHY: Manages reusable email templates for campaigns and automated emails
 * HOW: Client-side data fetching with aggressive TanStack Query caching
 *
 * CACHING ARCHITECTURE:
 * - Initial load: Client component shows skeleton, fetches from server
 * - Re-navigation: Instant render from TanStack Query cache (no skeleton)
 * - staleTime: Infinity - data never becomes stale automatically
 * - gcTime: 30 minutes - cached data persists for instant re-navigation
 *
 * URL STRUCTURE:
 * - /marketing/email-templates - Root level (all templates)
 * - /marketing/email-templates?folder=xxx - Inside a specific folder
 * - /marketing/email-templates?template=xxx - Opens template editor
 *
 * FEATURES:
 * - Folder organization (nested folders)
 * - Template CRUD operations
 * - Search with debouncing
 * - Grid/list view toggle
 * - URL state for sharing
 *
 * PERMISSION: email-templates:read required
 *
 * Search Keywords: SOURCE OF TRUTH, EMAIL TEMPLATES PAGE, CLIENT CACHING, PERFORMANCE
 */

import { TemplatesPageContent } from './_components/templates-page-content'

export default function EmailTemplatesPage() {
  return <TemplatesPageContent />
}

export const metadata = {
  title: 'Email Templates | Mochi',
  description: 'Create and manage reusable email templates',
}
