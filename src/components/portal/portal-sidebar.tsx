'use client'

/**
 * Portal Sidebar Component
 *
 * SOURCE OF TRUTH: Portal Navigation UI
 * Provides sidebar navigation for the Client Portal.
 * Simplified to focus on core admin functions: Organizations and Users.
 *
 * DESIGN: Clean portal branding with quick access to personal organization
 * - Shows "{APP_NAME} Portal" at the top
 * - Quick switch button to access personal organization
 * - NavUser at the footer
 * - Only shows Organizations and Users for management/impersonation
 */

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, Users, ScrollText, Shield, ChevronDown } from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NavUser } from '@/components/nav-user'
import { trpc } from '@/trpc/react-provider'
import type { PortalRoleType, PortalPermission } from '@/lib/portal/types'

// ============================================================================
// PORTAL NAVIGATION DATA (Simplified)
// ============================================================================

type NavItem = {
  title: string
  url: string
  icon: React.ComponentType<{
    className?: string
    size?: number
  }>
  permission?: PortalPermission
}

/**
 * Simplified portal navigation
 * Organizations, Users (for impersonation), and Audit Logs
 */
const portalNavItems: NavItem[] = [
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
    title: 'Audit Logs',
    url: '/portal/audit-logs',
    icon: ScrollText,
    permission: 'audit-logs:view',
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
// PORTAL SIDEBAR PROPS
// ============================================================================

interface PortalSidebarProps extends React.ComponentProps<typeof Sidebar> {
  admin: {
    id: string
    email: string
    displayName?: string | null
    role: PortalRoleType
  }
}

// ============================================================================
// PORTAL SIDEBAR COMPONENT
// ============================================================================

/**
 * Portal Sidebar - Simplified Admin Navigation
 *
 * WHY: Provides clean navigation for portal admin functions
 * HOW: Shows app name with Portal branding, quick org switch, NavUser at bottom
 */
export function PortalSidebar({ admin, ...props }: PortalSidebarProps) {
  const pathname = usePathname()

  // Fetch portal owner's organization for quick switch
  const { data: myOrg } = trpc.portal.getMyPortalOrganization.useQuery()

  // App name from environment
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'App'

  /**
   * Check if admin has a specific permission
   */
  const hasPermission = React.useCallback(
    (permission?: PortalPermission): boolean => {
      if (!permission) return true
      return PORTAL_ROLE_PERMISSIONS[admin.role]?.includes(permission) ?? false
    },
    [admin.role]
  )

  /**
   * Filter nav items based on admin permissions
   */
  const filteredNavItems = React.useMemo(() => {
    return portalNavItems.filter((item) => hasPermission(item.permission))
  }, [hasPermission])

  /**
   * Check if a URL is active
   */
  const isActive = (url: string) => {
    return pathname.startsWith(url)
  }

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      {/* Header - Workspace Switcher */}
      <SidebarHeader className="h-auto max-md:mt-2 mb-2 mt-3 px-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="w-full group-data-[collapsible=icon]:hidden">
            <div className="flex items-center justify-between rounded-lg border bg-card p-2 hover:bg-accent transition-colors">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Shield className="h-4 w-4 text-primary" />
                </div>
                <span className="text-sm font-medium">{appName} Portal</span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[200px]">
            {/* Portal Option - Currently Active */}
            <DropdownMenuItem className="gap-2 bg-accent">
              <Shield className="h-4 w-4" />
              <span>{appName} Portal</span>
            </DropdownMenuItem>
            {/* My Organization Option */}
            {myOrg && (
              <DropdownMenuItem asChild className="gap-2">
                <Link href="/">
                  <Building2 className="h-4 w-4" />
                  <span className="truncate">{myOrg.name}</span>
                </Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Collapsed state - just show icon */}
        <div className="hidden group-data-[collapsible=icon]:flex items-center justify-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Shield className="h-4 w-4 text-primary" />
          </div>
        </div>
      </SidebarHeader>

      {/* Content - Navigation Items */}
      <SidebarContent className="-mt-2">
        <SidebarGroup>
          <SidebarGroupLabel className="uppercase text-muted-foreground/65">
            Management
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredNavItems.map((item) => {
                const itemIsActive = isActive(item.url)

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      className="group/menu-button group-data-[collapsible=icon]:px-[5px]! font-medium gap-3 h-9"
                      tooltip={item.title}
                      isActive={itemIsActive}
                    >
                      <Link href={item.url}>
                        <item.icon
                          className="text-muted-foreground/65 group-data-[active=true]/menu-button:text-primary"
                          size={22}
                        />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer - NavUser (matches protected dashboard) */}
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
