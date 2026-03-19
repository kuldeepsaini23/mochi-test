/**
 * Settings Layout
 *
 * WHY: Shared layout for all settings pages
 * HOW: Provides consistent page structure with header and navigation tabs
 *
 * PERMISSION: Each child page handles its own permissions
 */

import { ContentLayout } from '@/components/global/content-layout'
import { SectionHeader } from '@/components/global/section-header'
import { SettingsNav } from './_components/settings-nav'

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ContentLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <SectionHeader
          title="Settings"
          description="Manage your organization settings, billing, and preferences"
        />

        {/* Navigation Tabs */}
        <SettingsNav />

        {/* Child pages */}
        <div className="pt-2">
          {children}
        </div>
      </div>
    </ContentLayout>
  )
}
