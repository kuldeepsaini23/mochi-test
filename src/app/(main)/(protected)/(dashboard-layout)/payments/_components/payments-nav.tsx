'use client'

/**
 * Payments Navigation Tabs - Active Organization Pattern
 *
 * WHY: Provides quick navigation between payments pages
 * HOW: Minimal tab design with horizontal scroll on mobile
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based tab filtering via hasPermission helper
 * - Active state based on current pathname
 * - Horizontally scrollable on mobile (overflow-x-auto)
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions, type Permission } from '@/lib/better-auth/permissions'
import { useMemo } from 'react'

type PaymentsTab = {
  label: string
  href: string
  permission?: Permission
}

const tabs: PaymentsTab[] = [
  {
    label: 'Products',
    href: '/payments/products',
    permission: permissions.PRODUCTS_READ,
  },
  {
    label: 'Orders',
    href: '/payments/orders',
    permission: permissions.TRANSACTIONS_READ, // Reuses transactions permission
  },
  {
    label: 'Transactions',
    href: '/payments/transactions',
    permission: permissions.TRANSACTIONS_READ,
  },
  {
    label: 'Subscriptions',
    href: '/payments/subscriptions',
    permission: permissions.TRANSACTIONS_READ,
  },
  {
    label: 'Contracts',
    href: '/payments/contracts',
    permission: permissions.CONTRACTS_READ,
  },
  {
    label: 'Invoices',
    href: '/payments/invoices',
    permission: permissions.INVOICES_READ,
  },
]

export function PaymentsNav() {
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
          const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
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
