/**
 * Portal Organizations Page
 *
 * SOURCE OF TRUTH: Portal Organizations List, portal-org-page
 * Birds-eye view of all organizations with health indicators and lifecycle filtering.
 *
 * FILTER TABS:
 * - All: Every organization on the platform
 * - Trialing: Organizations on trial OR free tier (never paid)
 * - Active: Paid active subscriptions (not cancelling)
 * - Cancelling: Active subscriptions set to cancel at period end
 * - Churned: Organizations whose paid subscription has ended
 *
 * HEALTH INDICATORS:
 * - Subscription: Active, Trialing, Past Due, Free, Cancelling, Churned
 * - Stripe: Connected (green), Restricted (red), None (gray)
 * - Email: Configured or not
 */

'use client'

import * as React from 'react'
import { useState } from 'react'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import {
  Building2,
  Search,
  Users,
  CreditCard,
  Mail,
  AlertTriangle,
  Shield,
  Info,
  UserCog,
  Loader2,
} from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { PortalPagination } from '@/components/portal/portal-pagination'
import { Separator } from '@/components/ui/separator'
import { authClient } from '@/lib/better-auth/auth-client'
import type { PortalOrganizationStatusFilter } from '@/lib/portal/types'

// ============================================================================
// FILTER TAB CONFIGURATION
// ============================================================================

/**
 * Tab definitions for the status filter bar.
 * Each tab maps to a PortalOrganizationStatusFilter value with a label and color.
 */
const STATUS_TABS: {
  value: PortalOrganizationStatusFilter
  label: string
}[] = [
  { value: 'all', label: 'All' },
  { value: 'trialing', label: 'Trialing' },
  { value: 'active', label: 'Active' },
  { value: 'cancelling', label: 'Cancelling' },
  { value: 'churned', label: 'Churned' },
]

// ============================================================================
// ORGANIZATION ROW
// ============================================================================

/**
 * Organization Row Component
 *
 * Renders a single organization row with health indicators, owner info,
 * and an impersonate button. Reuses the impersonation pattern from the
 * portal users tab (authClient.admin.impersonateUser).
 */
function OrganizationRow({
  org,
  getSubscriptionBadge,
  onImpersonate,
  impersonatingUserId,
}: {
  org: {
    id: string
    name: string
    slug: string
    logo: string | null
    memberCount: number
    createdAt: string
    isPortalOrganization?: boolean
    owner?: { id: string; name: string; email: string; image: string | null } | null
    subscription?: { status: string; plan?: string; cancelAtPeriodEnd?: boolean } | null
    churnedAt?: string | null
    health: {
      stripe: string
      emailEnabled: boolean
    }
  }
  getSubscriptionBadge: (
    org: {
      subscription?: { status: string; plan?: string; cancelAtPeriodEnd?: boolean } | null
      isPortalOrganization?: boolean
      churnedAt?: string | null
    }
  ) => React.ReactNode
  /** Callback to impersonate the org owner — reuses users tab pattern */
  onImpersonate: (userId: string, userName: string, orgSlug: string) => void
  /** Currently impersonating user ID — disables button while in progress */
  impersonatingUserId: string | null
}) {
  const isImpersonating = impersonatingUserId === org.owner?.id

  return (
    <div
      className={`p-4 ${
        org.isPortalOrganization
          ? 'bg-gradient-to-r from-primary/5 to-transparent border-l-2 border-l-primary'
          : ''
      }`}
    >
      <div className="flex items-center justify-between">
        {/* Org Info */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {org.logo ? (
            <img
              src={org.logo}
              alt={org.name}
              className="h-10 w-10 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full flex-shrink-0 ${
                org.isPortalOrganization ? 'bg-primary/20' : 'bg-primary/10'
              }`}
            >
              {org.isPortalOrganization ? (
                <Shield className="h-5 w-5 text-primary" />
              ) : (
                <Building2 className="h-5 w-5 text-primary" />
              )}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium truncate">{org.name}</p>
              {org.isPortalOrganization && (
                <Badge className="bg-primary/20 text-primary hover:bg-primary/30 text-xs flex-shrink-0">
                  Portal
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">{org.slug}</p>
          </div>
        </div>

        {/* Right side: Owner + Health Indicators */}
        <div className="flex items-center gap-4 flex-shrink-0">
          {/* Owner Info + Impersonate */}
          {org.owner && (
            <div className="flex items-center gap-2">
              {/* Owner avatar + name */}
              <Tooltip>
                <TooltipTrigger>
                  <div className="flex items-center gap-1.5">
                    {org.owner.image ? (
                      <img
                        src={org.owner.image}
                        alt={org.owner.name}
                        className="h-6 w-6 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {org.owner.name?.charAt(0)?.toUpperCase() || '?'}
                        </span>
                      </div>
                    )}
                    <span className="text-xs text-muted-foreground max-w-[100px] truncate">
                      {org.owner.name}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{org.owner.email}</p>
                </TooltipContent>
              </Tooltip>

              {/* Impersonate button — same pattern as portal users tab */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={!!impersonatingUserId}
                    onClick={() =>
                      onImpersonate(org.owner!.id, org.owner!.name, org.slug)
                    }
                  >
                    {isImpersonating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <UserCog className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Impersonate {org.owner.name}
                </TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* Members */}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{org.memberCount}</span>
          </div>

          {/* Health Icons */}
          <div className="flex items-center gap-2">
            {/* Stripe Status */}
            <Tooltip>
              <TooltipTrigger>
                {org.health.stripe === 'connected' ? (
                  <CreditCard className="h-4 w-4 text-green-500" />
                ) : org.health.stripe === 'restricted' ? (
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                ) : (
                  <CreditCard className="h-4 w-4 text-muted-foreground/40" />
                )}
              </TooltipTrigger>
              <TooltipContent>
                {org.health.stripe === 'connected'
                  ? 'Stripe Connected'
                  : org.health.stripe === 'restricted'
                    ? 'Stripe Restricted'
                    : 'Stripe Not Connected'}
              </TooltipContent>
            </Tooltip>

            {/* Email Status */}
            <Tooltip>
              <TooltipTrigger>
                {org.health.emailEnabled ? (
                  <Mail className="h-4 w-4 text-green-500" />
                ) : (
                  <Mail className="h-4 w-4 text-muted-foreground/40" />
                )}
              </TooltipTrigger>
              <TooltipContent>
                {org.health.emailEnabled ? 'Email Configured' : 'No Email Domain'}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Subscription / Tier */}
          <div>
            {getSubscriptionBadge(org)}
          </div>

          {/* Date */}
          <span className="text-sm text-muted-foreground w-24">
            {new Date(org.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function PortalOrganizationsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [statusFilter, setStatusFilter] = useState<PortalOrganizationStatusFilter>('all')
  const [impersonatingUserId, setImpersonatingUserId] = useState<string | null>(null)

  /**
   * Impersonate organization owner.
   * Reuses the same pattern from portal users tab (authClient.admin.impersonateUser).
   * Redirects to the org's subdomain after creating the impersonation session.
   */
  const handleImpersonate = async (
    userId: string,
    userName: string,
    organizationSlug: string
  ) => {
    setImpersonatingUserId(userId)

    try {
      const { error } = await authClient.admin.impersonateUser({ userId })

      if (error) {
        toast.error('Failed to impersonate user', {
          description: error.message || 'An error occurred while impersonating',
        })
        setImpersonatingUserId(null)
        return
      }

      toast.success(`Now impersonating ${userName}`, {
        description: 'Redirecting to their organization...',
      })

      // Build subdomain URL and redirect — same pattern as users tab
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://mochi.test:3000'
      const url = new URL(appUrl)
      const rootDomain = url.hostname
      const port = url.port ? `:${url.port}` : ''
      const protocol = url.protocol

      window.location.href = `${protocol}//${organizationSlug}.${rootDomain}${port}/`
    } catch (err) {
      console.error('[Portal] Impersonation error:', err)
      toast.error('Impersonation failed', {
        description: 'An unexpected error occurred',
      })
      setImpersonatingUserId(null)
    }
  }

  /**
   * Fetch organizations with caching and status filtering
   */
  const { data, isLoading, isFetching } = trpc.portal.getOrganizations.useQuery(
    {
      search: search || undefined,
      page,
      pageSize,
      statusFilter,
    },
    {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )

  /**
   * Fetch status counts for filter tab badges
   */
  const { data: counts } = trpc.portal.getOrganizationStatusCounts.useQuery(
    undefined,
    {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    }
  )

  /**
   * Handle page size change - reset to page 1
   */
  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    setPage(1)
  }

  /**
   * Handle status filter change - reset to page 1
   */
  const handleStatusFilterChange = (filter: PortalOrganizationStatusFilter) => {
    setStatusFilter(filter)
    setPage(1)
  }

  /**
   * Get subscription status badge based on organization data.
   * Shows status + plan name for subscribed orgs (e.g., "Active: Pro", "Trial: Starter").
   *
   * Priority: Portal > Cancelling > Active > Trial > Past Due > Churned > Free
   */
  const getSubscriptionBadge = (org: {
    subscription?: { status: string; plan?: string; cancelAtPeriodEnd?: boolean } | null
    isPortalOrganization?: boolean
    churnedAt?: string | null
  }) => {
    // Portal organizations always show Portal tier
    if (org.isPortalOrganization) {
      return (
        <Badge className="bg-primary/20 text-primary hover:bg-primary/30">
          Portal
        </Badge>
      )
    }

    const sub = org.subscription
    // Capitalize plan name for display (e.g., "pro" → "Pro")
    const planLabel = sub?.plan
      ? sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1)
      : null

    // Has an active subscription — show status with plan name
    if (sub) {
      if (sub.cancelAtPeriodEnd) {
        return (
          <Badge className="bg-yellow-500/20 text-yellow-600 hover:bg-yellow-500/30">
            Cancelling{planLabel ? `: ${planLabel}` : ''}
          </Badge>
        )
      }

      switch (sub.status) {
        case 'active':
          return (
            <Badge className="bg-green-500/20 text-green-600 hover:bg-green-500/30">
              Active{planLabel ? `: ${planLabel}` : ''}
            </Badge>
          )
        case 'trialing':
          return (
            <Badge className="bg-blue-500/20 text-blue-600 hover:bg-blue-500/30">
              Trial{planLabel ? `: ${planLabel}` : ''}
            </Badge>
          )
        case 'past_due':
          return (
            <Badge className="bg-red-500/20 text-red-600 hover:bg-red-500/30">
              Past Due{planLabel ? `: ${planLabel}` : ''}
            </Badge>
          )
        default:
          return <Badge variant="secondary">Free</Badge>
      }
    }

    // No subscription — check if churned or never paid
    if (org.churnedAt) {
      return (
        <Badge className="bg-gray-500/20 text-gray-500 hover:bg-gray-500/30">
          Churned
        </Badge>
      )
    }

    return <Badge variant="secondary">Free</Badge>
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-semibold">Organizations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All organizations on the platform
          </p>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 border-b border-border">
          {STATUS_TABS.map((tab) => {
            const isActive = statusFilter === tab.value
            const count = counts?.[tab.value]

            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => handleStatusFilterChange(tab.value)}
                className={`
                  flex items-center gap-1.5 px-3 py-2 text-sm font-medium
                  border-b-2 transition-colors -mb-px
                  ${
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }
                `}
              >
                {tab.label}
                {count !== undefined && (
                  <span
                    className={`
                      text-xs px-1.5 py-0.5 rounded-full
                      ${isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}
                    `}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search organizations..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {isFetching && !isLoading && (
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            )}
            {data && <span>{data.total} total</span>}
          </div>
        </div>

        {/* Organizations List */}
        <div className="space-y-6">
          {isLoading ? (
            <div className="rounded-lg border bg-card p-8 text-center">
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Loading...
              </div>
            </div>
          ) : !data?.organizations.length ? (
            <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
              {statusFilter === 'all'
                ? 'No organizations found'
                : `No ${statusFilter} organizations found`}
            </div>
          ) : (
            <>
              {/* Portal Organization Section - shown separately if exists */}
              {data.organizations.some((org) => org.isPortalOrganization) && (
                <div className="space-y-3">
                  {/* Section Header with Info Tooltip */}
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-medium text-muted-foreground">
                      Your Organization
                    </h2>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3.5 w-3.5 text-muted-foreground/60" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[280px]">
                        <p className="text-xs">
                          Portal organizations have unlimited features at no
                          additional cost. This is your personal organization as
                          the portal owner.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {/* Portal Organization Card */}
                  <div className="rounded-lg border bg-card">
                    {data.organizations
                      .filter((org) => org.isPortalOrganization)
                      .map((org) => (
                        <OrganizationRow
                          key={org.id}
                          org={org}
                          getSubscriptionBadge={getSubscriptionBadge}
                          onImpersonate={handleImpersonate}
                          impersonatingUserId={impersonatingUserId}
                        />
                      ))}
                  </div>
                </div>
              )}

              {/* Separator between sections */}
              {data.organizations.some((org) => org.isPortalOrganization) &&
                data.organizations.some((org) => !org.isPortalOrganization) && (
                  <Separator className="my-2" />
                )}

              {/* All Other Organizations */}
              {data.organizations.some((org) => !org.isPortalOrganization) && (
                <div className="space-y-3">
                  <h2 className="text-sm font-medium text-muted-foreground">
                    All Organizations
                  </h2>
                  <div className="rounded-lg border bg-card divide-y">
                    {data.organizations
                      .filter((org) => !org.isPortalOrganization)
                      .map((org) => (
                        <OrganizationRow
                          key={org.id}
                          org={org}
                          getSubscriptionBadge={getSubscriptionBadge}
                          onImpersonate={handleImpersonate}
                          impersonatingUserId={impersonatingUserId}
                        />
                      ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Pagination */}
        {data && (
          <PortalPagination
            page={data.page}
            pageSize={pageSize}
            totalPages={data.totalPages}
            total={data.total}
            currentCount={data.organizations.length}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
            itemLabel="organizations"
          />
        )}
      </div>
    </TooltipProvider>
  )
}
