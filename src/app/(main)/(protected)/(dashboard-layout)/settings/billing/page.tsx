/**
 * Billing Settings Page - Blazing Fast Navigation with Client-Side Caching
 *
 * CACHING ARCHITECTURE:
 * - Initial load: Client component shows skeleton, fetches from server
 * - Re-navigation: Instant render from TanStack Query cache (no skeleton)
 *
 * PERMISSION: billing:read required (handled by client component)
 */

import { BillingTab } from '../_components/billing-tab'

export default function BillingSettingsPage() {
  return <BillingTab />
}
