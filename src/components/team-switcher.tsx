/**
 * Team Switcher Component
 *
 * WHY: Allows users to switch between organizations they belong to
 * HOW: Navigates to org's subdomain/custom domain for proper multi-tenancy
 *
 * MULTI-TENANCY FLOW:
 * 1. User clicks on a different organization
 * 2. Component calls authClient.organization.setActive() to update session
 * 3. THEN navigates to the org's subdomain/custom domain
 * 4. Server context automatically picks up correct org from domain
 * 5. All data now reflects the selected organization
 *
 * SECURITY:
 * - Only shows organizations user is a member of
 * - Server validates membership before allowing access to any data
 * - setActive only works for orgs user belongs to
 * - Navigation to subdomain ensures domain-based isolation
 *
 * WHY NAVIGATE INSTEAD OF RELOAD:
 * - On subdomain (acme.mochi.test): Navigating to different org's subdomain
 *   is the ONLY way to switch orgs - domain determines active org
 * - On root domain (mochi.test): Could reload, but navigation is more consistent
 * - Cross-subdomain cookies ensure auth persists across domains
 *
 * SOURCE OF TRUTH KEYWORDS: TeamSwitcher, OrgSwitcher, MultiTenancy, SubdomainNavigation
 */

'use client'

import * as React from 'react'
import { ChevronsUpDown, Building2, Check, Loader2, Shield } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'
import { trpc } from '@/trpc/react-provider'
import { authClient } from '@/lib/better-auth/auth-client'
import { toast } from 'sonner'
import { buildOrganizationUrl } from '@/lib/utils/domain-client'
import { useActiveOrganization } from '@/hooks/use-active-organization'

export function TeamSwitcher() {
  const { isMobile } = useSidebar()
  const [isSwitching, setIsSwitching] = React.useState(false)

  /**
   * Get all organizations user belongs to
   * This includes orgs they own and orgs they're a member of
   *
   * NOTE: staleTime: 0 allows proper hydration from server on navigation
   * The server prefetches this, so it hydrates instantly on first load
   */
  const { data: organizations, isLoading } =
    trpc.organization.getUserOrganizations.useQuery(undefined, {
      staleTime: 0, // Allow hydration from server
      gcTime: 1000 * 60 * 30, // 30 minutes
    })

  /**
   * Check if user is a portal admin
   * WHY: Show portal option in team switcher for portal admins
   * HOW: Uses the query endpoint (no side effects, cacheable)
   *
   * NOTE: This only returns true if user is already a portal admin
   * The auto-creation only happens on sign-in/sign-up via mutation
   */
  const { data: portalStatus } = trpc.portal.getPortalAdminStatus.useQuery(
    undefined,
    {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
      retry: false, // Don't retry on failure
    }
  )

  /**
   * Get the currently active organization using the centralized hook
   * This respects domain-first approach:
   * 1. Subdomain → that org IS active
   * 2. Custom domain → that org IS active
   * 3. Root domain → session.activeOrganizationId
   */
  const { activeOrganization: activeOrg } = useActiveOrganization()

  /**
   * Get tier data for plan badge
   * WHY: All members should see the organization's plan, not just owners
   */
  const { data: tierData } = trpc.usage.getTier.useQuery(
    { organizationId: activeOrg?.id || '' },
    {
      enabled: !!activeOrg?.id,
      staleTime: 0, // Allow hydration from server
      gcTime: 1000 * 60 * 30, // 30 minutes
    }
  )

  /**
   * Handle navigation to portal
   *
   * WHY: Portal admins can switch between org view and portal admin view
   * HOW: Navigates to /portal on the root domain
   */
  const handlePortalSwitch = () => {
    setIsSwitching(true)
    toast.success('Switching to Client Portal...', {
      duration: 2000,
    })
    // Portal is always on the root domain
    window.location.href = '/portal'
  }

  /**
   * Handle organization switch
   *
   * FLOW:
   * 1. Call Better Auth's setActive to update session.activeOrganizationId
   * 2. Navigate to the org's subdomain/custom domain
   * 3. Server context automatically picks up correct org from domain
   *
   * WHY NAVIGATE INSTEAD OF RELOAD:
   * - On subdomain (acme.mochi.test): The domain DETERMINES the active org
   *   - getActiveOrganization checks subdomain first
   *   - If we just reload, we stay on the same subdomain = same org
   *   - Must navigate to new org's subdomain to actually switch
   * - On root domain (mochi.test): Could reload, but navigation is consistent
   *
   * SECURITY:
   * - Better Auth validates user is a member before allowing setActive
   * - Server's getActiveOrganization validates domain-based access
   * - Cross-subdomain cookies maintain authentication across domains
   */
  const handleOrgSwitch = async (
    orgId: string,
    orgSlug: string,
    customDomain: string | null
  ) => {
    // Don't switch if already on this org
    if (activeOrg?.id === orgId) return

    setIsSwitching(true)

    try {
      // Update session's activeOrganizationId via Better Auth
      // This ensures the session reflects the new org (useful on root domain)
      await authClient.organization.setActive({
        organizationId: orgId,
        organizationSlug: orgSlug,
      })

      // Show feedback
      toast.success('Switching organization...', {
        duration: 2000,
      })

      // Navigate to the org's subdomain/custom domain
      // This is the KEY change - domain-based isolation requires navigation
      // The new domain triggers getActiveOrganization to use that org
      const targetUrl = buildOrganizationUrl(orgSlug, customDomain)

      // Use window.location.href for cross-origin navigation
      // (subdomains are considered different origins for cookies in some browsers)
      window.location.href = targetUrl
    } catch (error) {
      console.error('Failed to switch organization:', error)
      toast.error('Failed to switch organization')
      setIsSwitching(false)
    }
  }

  // Loading state
  if (isLoading || !organizations || organizations.length === 0) {
    return null
  }

  // Use activeOrg from query, fallback to first org if query hasn't loaded yet
  const displayActiveOrg = activeOrg || organizations[0]

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild suppressHydrationWarning>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              suppressHydrationWarning
              disabled={isSwitching}
            >
              {isSwitching ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : (
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage
                    src={''}
                    alt={displayActiveOrg.name}
                  />
                  <AvatarFallback className="rounded-lg">
                    <Building2 className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {displayActiveOrg.name}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs text-muted-foreground">
                    {displayActiveOrg.role === 'owner' ? 'Owner' : 'Member'}
                  </span>
                  {/* Show plan badge for all members */}
                  {tierData?.planName && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] h-4 px-1.5 font-normal"
                    >
                      {tierData.planName}
                    </Badge>
                  )}
                </div>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            {/* Portal Admin Option - shown only if user is a portal admin */}
            {portalStatus?.isPortalAdmin && (
              <>
                <DropdownMenuLabel className="text-muted-foreground text-xs">
                  Platform Admin
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={handlePortalSwitch}
                  className="gap-2 p-2 cursor-pointer"
                  disabled={isSwitching}
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
                    <Shield className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex-1 flex flex-col">
                    <span className="font-medium">Client Portal</span>
                    <span className="text-xs text-muted-foreground">
                      {portalStatus.role}
                    </span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}

            <DropdownMenuLabel className="text-muted-foreground text-xs">
              Organizations ({organizations.length})
            </DropdownMenuLabel>
            {organizations.map((org) => {
              const isActive = displayActiveOrg.id === org.id

              return (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => handleOrgSwitch(org.id, org.slug, org.customDomain)}
                  className="gap-2 p-2 cursor-pointer"
                  disabled={isSwitching}
                >
                  <Avatar className="h-6 w-6 rounded-md">
                    <AvatarImage src={''} alt={org.name} />
                    <AvatarFallback className="rounded-md">
                      <Building2 className="h-3.5 w-3.5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 flex flex-col">
                    <span className="font-medium">{org.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {org.role === 'owner' ? 'Owner' : 'Member'}
                    </span>
                  </div>
                  {/* Show checkmark for active org */}
                  {isActive && <Check className="h-4 w-4 text-primary" />}
                </DropdownMenuItem>
              )
            })}
            <DropdownMenuSeparator />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
