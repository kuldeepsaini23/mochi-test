/**
 * Storage Page - Blazing Fast Navigation with Client-Side Caching
 *
 * WHY: Google Drive-style file storage page for organizations.
 * HOW: Protected by (protected)/layout.tsx which runs handleRedirectCheck()
 *
 * PERMISSION: Requires storage:read to view files
 *
 * URL STRUCTURE:
 * - /storage - Root level (My Files)
 * - /storage?folder=xxx - Inside a specific folder
 *
 * FEATURES:
 * - Folder creation and nesting
 * - File upload with PUBLIC/PRIVATE visibility
 * - Grid and list views
 * - Search functionality
 * - File type icons and thumbnails
 *
 * CACHING ARCHITECTURE:
 * - Initial load: Client component shows skeleton, fetches from server
 * - Re-navigation: Instant render from TanStack Query cache (no skeleton)
 *
 * NOTE: This page uses the reusable StorageBrowser component
 * which can also be used in modals and other contexts.
 *
 * Search Keywords: SOURCE OF TRUTH, STORAGE PAGE, CLIENT CACHING, PERFORMANCE
 */

import { StoragePageClient } from './_components/storage-page-client'

export default function StoragePage() {
  return <StoragePageClient />
}

// ============================================================================
// METADATA
// ============================================================================

export const metadata = {
  title: 'Storage | Mochi',
  description: 'Upload and manage your files',
}
