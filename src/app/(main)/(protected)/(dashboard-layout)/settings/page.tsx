/**
 * Settings Index Page
 *
 * WHY: Redirect to default settings page
 * HOW: Server-side redirect to billing page
 */

import { redirect } from 'next/navigation'

export default function SettingsPage() {
  redirect('/settings/billing')
}
