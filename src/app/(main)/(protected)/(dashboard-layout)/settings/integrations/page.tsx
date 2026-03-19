/**
 * Integrations Settings Page - Blazing Fast Navigation with Client-Side Caching
 *
 * CACHING ARCHITECTURE:
 * - Initial load: Client component shows skeleton, fetches from server
 * - Re-navigation: Instant render from TanStack Query cache (no skeleton)
 *
 * PERMISSION: integrations:read required (handled by client component)
 */

import { IntegrationsTab } from '../_components/integrations-tab'

export const metadata = {
  title: 'Integrations | Settings | Mochi',
  description: 'Connect your organization to third-party services',
}

export default function IntegrationsSettingsPage() {
  return <IntegrationsTab />
}
