'use client'

/**
 * Portal Navigation Component
 *
 * SOURCE OF TRUTH: Portal Sidebar Navigation
 * Compact sidebar navigation for the Client Portal.
 *
 * DESIGN:
 * - Workspace switcher at top (switch between Portal and personal org)
 * - Navigation items grouped into sections
 * - Logout button at bottom
 * - Clean, minimal appearance
 */

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2,
  Users,
  ScrollText,
  LayoutDashboard,
  Shield,
  ChevronDown,
  Loader2,
  LogOut,
  Package,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { trpc } from '@/trpc/react-provider'
import { authClient } from '@/lib/better-auth/auth-client'
import type { PortalRoleType, PortalPermission } from '@/lib/portal/types'

// ============================================================================
// PORTAL NAVIGATION DATA
// ============================================================================

type NavItem = {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
  permission?: PortalPermission
}

type NavGroup = {
  title?: string
  items: NavItem[]
}

/**
 * Portal navigation structure - grouped items
 */
const portalNavGroups: NavGroup[] = [
  {
    items: [
      {
        title: 'Overview',
        url: '/portal',
        icon: LayoutDashboard,
      },
    ],
  },
  {
    title: 'Management',
    items: [
      {
        title: 'Organizations',
        url: '/portal/organizations',
        icon: Building2,
        permission: 'organizations:view',
      },
      {
        title: 'Users',
        url: '/portal/users',
        icon: Users,
        permission: 'users:view',
      },
      {
        /** Template moderation — review and approve pending templates */
        title: 'Templates',
        url: '/portal/templates',
        icon: Package,
      },
    ],
  },
  {
    title: 'System',
    items: [
      {
        title: 'Audit Logs',
        url: '/portal/audit-logs',
        icon: ScrollText,
        permission: 'audit-logs:view',
      },
    ],
  },
]

// ============================================================================
// PORTAL ROLE PERMISSIONS
// ============================================================================

const PORTAL_ROLE_PERMISSIONS: Record<PortalRoleType, PortalPermission[]> = {
  OWNER: [
    'organizations:view',
    'organizations:create',
    'organizations:update',
    'organizations:delete',
    'organizations:impersonate',
    'users:view',
    'users:create',
    'users:update',
    'users:delete',
    'audit-logs:view',
  ],
  ADMIN: [
    'organizations:view',
    'organizations:update',
    'organizations:impersonate',
    'users:view',
    'users:update',
    'audit-logs:view',
  ],
  SUPPORT: [
    'organizations:view',
    'organizations:impersonate',
    'users:view',
    'audit-logs:view',
  ],
  VIEWER: [
    'organizations:view',
    'users:view',
  ],
}

// ============================================================================
// PORTAL NAV PROPS
// ============================================================================

interface PortalNavProps {
  admin: {
    id: string
    email: string
    displayName?: string | null
    role: PortalRoleType
  }
}

// ============================================================================
// PORTAL NAV COMPONENT
// ============================================================================

/**
 * Portal Nav - Compact Sidebar Navigation
 *
 * WHY: Clean, minimal navigation for portal admin functions
 * HOW: Workspace switcher at top, grouped nav items below
 */
export function PortalNav({ admin }: PortalNavProps) {
  const pathname = usePathname()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  // Fetch portal owner's organization for workspace switcher
  // Track loading state to show indicator while fetching
  const { data: myOrg, isLoading: isLoadingMyOrg } = trpc.portal.getMyPortalOrganization.useQuery()

  // App name from environment
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'App'

  /**
   * Handle logout - sign out and redirect to sign-in page
   */
  async function handleLogout() {
    setIsLoggingOut(true)

    try {
      await authClient.signOut()
      await new Promise((resolve) => setTimeout(resolve, 100))
      window.location.href = '/sign-in'
    } catch (err) {
      console.error('Sign out error:', err)
      setIsLoggingOut(false)
    }
  }

  /**
   * Check if admin has a specific permission
   */
  const hasPermission = (permission?: PortalPermission): boolean => {
    if (!permission) return true
    return PORTAL_ROLE_PERMISSIONS[admin.role]?.includes(permission) ?? false
  }

  /**
   * Check if a URL is active
   * For overview, only exact match. For others, prefix match.
   */
  const isActive = (url: string) => {
    if (url === '/portal') {
      return pathname === '/portal' || pathname === '/portal/'
    }
    return pathname.startsWith(url)
  }

  return (
    <nav className="space-y-6">
      {/* Workspace Switcher */}
      <DropdownMenu>
        <DropdownMenuTrigger className="w-full outline-none">
          <div className="flex items-center justify-between rounded-md bg-accent/50 px-3 py-2 hover:bg-accent transition-colors group">
            <div className="flex items-center gap-2.5">
              <Shield className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Portal</span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[200px]">
          <DropdownMenuItem className="gap-2.5 bg-accent/50">
            <Shield className="h-4 w-4" />
            <span>Portal</span>
          </DropdownMenuItem>
          {/* Show loading state while fetching org, then show org if exists */}
          {isLoadingMyOrg ? (
            <DropdownMenuItem disabled className="gap-2.5">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-muted-foreground">Loading...</span>
            </DropdownMenuItem>
          ) : myOrg ? (
            <DropdownMenuItem asChild className="gap-2.5">
              <Link href="/">
                <Building2 className="h-4 w-4" />
                <span>Your Organization</span>
              </Link>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Navigation Groups */}
      <div className="space-y-4">
        {portalNavGroups.map((group, groupIndex) => {
          // Filter items based on permissions
          const visibleItems = group.items.filter((item) =>
            hasPermission(item.permission)
          )

          if (visibleItems.length === 0) return null

          return (
            <div key={groupIndex} className="space-y-1">
              {/* Group Title */}
              {group.title && (
                <p className="text-xs font-medium text-muted-foreground px-2 py-1">
                  {group.title}
                </p>
              )}

              {/* Group Items */}
              {visibleItems.map((item) => {
                const active = isActive(item.url)

                return (
                  <Link
                    key={item.url}
                    href={item.url}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                      active
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </Link>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* User Info & Logout */}
      <div className="pt-4 mt-4 border-t space-y-3">
        {/* Admin Info */}
        <div className="px-2">
          <p className="text-sm font-medium truncate">{admin.displayName || admin.email}</p>
          <p className="text-xs text-muted-foreground truncate">{admin.email}</p>
        </div>

        {/* Logout Button */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          onClick={handleLogout}
          disabled={isLoggingOut}
        >
          <LogOut className="h-4 w-4" />
          {isLoggingOut ? 'Logging out...' : 'Log out'}
        </Button>
      </div>
    </nav>
  )
}
