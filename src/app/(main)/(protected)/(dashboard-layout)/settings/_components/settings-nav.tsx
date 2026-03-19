'use client'

/**
 * Settings Navigation Tabs - Active Organization Pattern
 *
 * WHY: Provides quick navigation between settings pages
 * HOW: Minimal tab design with horizontal scroll on mobile
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based tab filtering via hasPermission helper
 * - Active state based on current pathname
 * - Horizontally scrollable on mobile (overflow-x-auto)
 *
 * VIEWING vs ACTIONS:
 * - Billing/Wallet tabs visible to all (members can VIEW masked payment info)
 * - Modification actions on those pages still require billing permissions
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions, type Permission } from '@/lib/better-auth/permissions'
import { useMemo } from 'react'

type SettingsTab = {
  label: string
  href: string
  permission?: Permission
}

const tabs: SettingsTab[] = [
  {
    label: 'Billing',
    href: '/settings/billing',
    // No permission required to VIEW - all members can see subscription & masked payment methods
    // Modification actions on the page still require billing permissions
  },
  {
    label: 'Wallet',
    href: '/settings/wallet',
    // No permission required to VIEW - all members can see wallet balance
    // Top-up and other actions still require billing permissions
  },
  {
    label: 'Profile',
    href: '/settings/profile',
    // No permission required - own profile
  },
  {
    label: 'Organization',
    href: '/settings/organization',
    permission: permissions.ORGANIZATION_SETTINGS_READ,
  },
  {
    label: 'Integrations',
    href: '/settings/integrations',
    permission: permissions.INTEGRATIONS_READ,
  },
]

export function SettingsNav() {
  const pathname = usePathname()

  /**
   * Get active organization from the hook
   * This respects domain-first approach and session activeOrganizationId
   */
  const { activeOrganization, hasPermission } = useActiveOrganization()

  /**
   * Filter tabs based on permissions using hasPermission helper
   * Owners have full access, members need explicit permission
   */
  const visibleTabs = useMemo(() => {
    return tabs.filter((tab) => {
      if (!tab.permission) return true
      if (!activeOrganization) return false

      // Use hasPermission helper which handles owner check internally
      return hasPermission(tab.permission)
    })
  }, [activeOrganization, hasPermission])

  return (
    <div className="border-b border-border">
      <nav className="-mb-px flex gap-1 overflow-x-auto scrollbar-hide">
        {visibleTabs.map((tab) => {
          const isActive = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                'hover:text-foreground hover:border-border',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground'
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
