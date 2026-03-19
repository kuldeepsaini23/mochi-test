/**
 * Organization Settings Page - Blazing Fast Navigation with Client-Side Caching
 *
 * CACHING ARCHITECTURE:
 * - Initial load: Client component shows skeleton, fetches from server
 * - Re-navigation: Instant render from TanStack Query cache (no skeleton)
 *
 * PERMISSION: organization-settings:read required (handled by client component)
 */

import { OrganizationTab } from '../_components/organization-tab'

export default function OrganizationSettingsPage() {
  return <OrganizationTab />
}
