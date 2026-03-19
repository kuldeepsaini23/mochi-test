/**
 * Profile Settings Page - Blazing Fast Navigation with Client-Side Caching
 *
 * CACHING ARCHITECTURE:
 * - Initial load: Client component shows skeleton, fetches from server
 * - Re-navigation: Instant render from TanStack Query cache (no skeleton)
 *
 * PERMISSION: No permission required - users can always edit their own profile
 */

import { ProfileTab } from '../_components/profile-tab'

export default function ProfileSettingsPage() {
  return <ProfileTab />
}
