/**
 * Automations Page - Workflow Automation List
 *
 * WHY: View and manage all automations for the organization
 * HOW: Protected by (protected)/layout.tsx which runs handleRedirectCheck()
 *
 * PERMISSION: Requires automations:read to view automations
 *
 * SOURCE OF TRUTH: Automation, AutomationBuilderTypes
 */

import { AutomationsPageContent } from './_components/automations-page-content'

export const metadata = {
  title: 'Automations',
  description: 'Create and manage workflow automations',
}

export default function AutomationsPage() {
  return <AutomationsPageContent />
}
