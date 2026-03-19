'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Settings,
  Handshake,
  SearchIcon,
  Inbox,
  DollarSign,
  Globe,
  Contact,
  Globe2,
  Megaphone,
  HardDrive,
  Smartphone,
  Kanban,
  Store,
  CalendarDays,
  Zap,
  LayoutTemplate,
} from 'lucide-react'

import { NavUser } from '@/components/nav-user'
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
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ChevronRight, Search } from 'lucide-react'
import { TeamSwitcher } from './team-switcher'
import {
  permissions,
  type Permission,
} from '@/lib/better-auth/permissions'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { PromotionWidget } from './promotion-widget'
import { Input } from '@/components/ui/input'
import { CommandInput } from './ui/command'
import { cn } from '@/lib/utils'
import { usePipelineNavigation } from './pipelines/pipeline-nav-link'

/**
 * Sidebar Navigation Data with Permission Requirements
 *
 * IMPORTANT: Always use permission constants from @/lib/better-auth/permissions
 * - Use permissions.MEMBER_READ, NOT 'member:read' as string
 * - This ensures type safety and single source of truth
 *
 * If you need a permission that doesn't exist in permissions,
 * add it to @/lib/better-auth/permissions.ts first!
 */
type NavItem = {
  title: string
  url: string
  description?: string // Hidden description for search
  icon?: React.ComponentType<{
    className?: string
    size?: number
    'aria-hidden'?: boolean
  }>
  permission?: Permission // Permission required to see this item
  items?: Array<{
    title: string
    url: string
    description?: string // Hidden description for search
    permission?: Permission // Permission required to see this sub-item
  }>
}

const navData = {
  navMain: [
    {
      title: 'General',
      items: [
        {
          title: 'Dashboard',
          url: '/',
          description:
            'View analytics, metrics, overview, performance stats, revenue reports, and key business insights at a glance',
          icon: LayoutDashboard,
          permission: permissions.ANALYTICS_READ,
        },
        {
          title: 'Inbox',
          url: '/inbox',
          description:
            'View form submissions, messages, notifications, and incoming communications',
          icon: Inbox,
          permission: permissions.SUBMISSIONS_READ,
        },
        {
          title: 'Payments',
          url: '/payments',
          description:
            'Manage invoices, products, orders, contracts, coupons, and transactions',
          icon: DollarSign,
          permission: permissions.INVOICES_READ,
          items: [
            {
              title: 'Invoices',
              url: '/payments/invoices',
              description:
                'Create, view, and manage invoices for your customers',
              permission: permissions.INVOICES_READ,
            },
            {
              title: 'Products',
              url: '/payments/products',
              description:
                'Manage your products, pricing, and inventory',
              permission: permissions.PRODUCTS_READ,
            },
            {
              title: 'Orders',
              url: '/payments/orders',
              description:
                'Manage order fulfillment, tracking, and shipping',
              permission: permissions.TRANSACTIONS_READ,
            },
            {
              title: 'Contracts',
              url: '/payments/contracts',
              description:
                'Create and manage contracts with customers',
              permission: permissions.CONTRACTS_READ,
            },
            {
              title: 'Transactions',
              url: '/payments/transactions',
              description:
                'View transaction history and payment records',
              permission: permissions.ORDERS_READ,
            },
          ],
        },
        {
          title: 'Sites',
          url: '/sites',
          description:
            'Build and manage websites, forms, and landing pages',
          icon: Globe,
          permission: permissions.WEBSITES_READ,
          items: [
            {
              title: 'Websites',
              url: '/sites/websites',
              description:
                'Create and manage your websites and landing pages',
              permission: permissions.WEBSITES_READ,
            },
            {
              title: 'Forms',
              url: '/sites/forms',
              description:
                'Create and manage forms for data collection',
              permission: permissions.FORMS_READ,
            },
            {
              title: 'Ecommerce',
              url: '/sites/stores',
              description:
                'Create and manage ecommerce stores and product catalogs',
              permission: permissions.STORES_READ,
            },
            {
              title: 'CMS',
              url: '/sites/cms',
              description:
                'Manage content tables and data for your websites',
              permission: permissions.CMS_READ,
            },
            {
              title: 'Chat Widgets',
              url: '/sites/chat-widgets',
              description:
                'Create and manage chat widgets for customer support and AI chatbots',
              permission: permissions.STORES_READ,
            },
          ],
        },
        {
          title: 'Leads',
          url: '/leads',
          description:
            'Manage leads, customers, and CRM data',
          icon: Contact,
          permission: permissions.LEADS_READ,
          items: [
            {
              title: 'All Leads',
              url: '/leads',
              description:
                'View and manage all your leads',
              permission: permissions.LEADS_READ,
            },
            {
              title: 'Custom Data',
              url: '/custom-data',
              description:
                'Configure custom data categories and fields for lead data',
              permission: permissions.CUSTOM_FIELDS_READ,
            },
          ],
        },
        {
          title: 'Marketing',
          url: '/marketing',
          description:
            'Manage email templates and promotions',
          icon: Megaphone,
          permission: permissions.EMAIL_TEMPLATES_READ,
          items: [
            {
              title: 'Email Templates',
              url: '/marketing/email-templates',
              description:
                'Design and manage email templates',
              permission: permissions.EMAIL_TEMPLATES_READ,
            },
          ],
        },
        {
          title: 'Domains',
          url: '/domains',
          description:
            'Manage custom domains and DNS settings for your sites',
          icon: Globe2,
          permission: permissions.DOMAINS_READ,
        },
        {
          title: 'Storage',
          url: '/storage',
          description:
            'Upload and manage files, images, videos, documents, and media assets',
          icon: HardDrive,
          permission: permissions.STORAGE_READ,
        },
        {
          title: 'Pipelines',
          url: '/pipelines',
          description:
            'Manage kanban boards, tickets, tasks, workflows, and project pipelines',
          icon: Kanban,
          permission: permissions.PIPELINES_READ,
        },
        {
          title: 'Automations',
          url: '/automations',
          description:
            'Create and manage workflow automations with triggers and actions',
          icon: Zap,
          permission: permissions.AUTOMATIONS_READ,
        },
        {
          title: 'Marketplace',
          url: '/marketplace',
          description:
            'Browse, create, and manage reusable templates for websites, emails, automations, and blueprints',
          icon: LayoutTemplate,
          permission: permissions.TEMPLATES_READ,
        },
        {
          title: 'Calendar',
          url: '/calendar',
          description:
            'View and manage calendar events, meetings, scheduling, appointments, and bookings',
          icon: CalendarDays,
          permission: permissions.CALENDAR_READ,
          items: [
            {
              title: 'Events',
              url: '/calendar',
              description:
                'View and manage calendar events, meetings, and scheduled activities',
              permission: permissions.CALENDAR_READ,
            },
            {
              title: 'Booking Calendars',
              url: '/calendar/booking',
              description:
                'Create and manage booking calendars for appointment scheduling',
              permission: permissions.CALENDAR_READ,
            },
          ],
        },
        {
          title: 'Affiliates',
          url: '/affiliates',
          description:
            'Manage affiliate partners, referral programs, track commissions, view affiliate performance, affiliate marketing, and partner relationships',
          icon: Handshake,
          permission: permissions.AFFILIATE_READ,
        },
        {
          title: 'Team',
          url: '/team',
          description:
            'Manage team members, staff, employees, roles, permissions, access control, invite users, and configure team settings',
          icon: Users,
          permission: permissions.MEMBER_READ,
        },
        {
          title: 'Settings',
          url: '/settings',
          description:
            'Configure organization, billing, profile, preferences, account settings, and general application configuration',
          icon: Settings,
          items: [
            {
              title: 'Billing',
              url: '/settings/billing',
              description:
                'Manage subscriptions, plans, invoices, payment methods, cards, billing history, upgrade, downgrade, and payment settings',
              // No permission required to VIEW billing page - all members can see org's subscription status
              // Sensitive operations (modify, upgrade) still require billing permissions at the tRPC level
            },
            {
              title: 'Wallet',
              url: '/settings/wallet',
              description:
                'View wallet balance, add funds, manage usage credits, view transaction history, and top-up settings',
              // No permission required to VIEW wallet - all members can see balance
              // Modification operations require billing permissions at the tRPC level
            },
            {
              title: 'Profile',
              url: '/settings/profile',
              description:
                'Update your personal information, name, email, password, avatar, preferences, and user profile settings',
              // No permission required - own profile
            },
            {
              title: 'Organization',
              url: '/settings/organization',
              description:
                'Configure organization name, branding, logo, colors, domain, and general organization settings',
              permission: permissions.ORGANIZATION_SETTINGS_READ,
            },
            {
              title: 'Integrations',
              url: '/settings/integrations',
              description:
                'Connect third-party services, external tools, APIs, webhooks, Stripe, payment gateways, and other platform integrations',
              permission: permissions.INTEGRATIONS_READ,
            },
          ],
        },
      ] as NavItem[],
    },
  ],
}

function SidebarLogo() {
  const id = React.useId()
  return (
    <div className="flex gap-2 px-2 group-data-[collapsible=icon]:px-0 transition-[padding] duration-200 ease-in-out">
      <Link
        className="group/logo inline-flex"
        href="/"
      >
        <span className="sr-only">Logo</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="36"
          height="36"
          viewBox="0 0 36 36"
          className="size-9 group-data-[collapsible=icon]:size-8 transition-[width,height] duration-200 ease-in-out"
        >
          <path
            fill={`url(#${id})`}
            fillRule="evenodd"
            d="M12.972 2a6.806 6.806 0 0 0-4.813 1.993L2 10.153v2.819c0 1.991.856 3.783 2.22 5.028A6.788 6.788 0 0 0 2 23.028v2.82l6.16 6.159A6.806 6.806 0 0 0 18 31.78a6.806 6.806 0 0 0 9.841.226L34 25.847v-2.819A6.788 6.788 0 0 0 31.78 18 6.788 6.788 0 0 0 34 12.972v-2.82l-6.159-6.159A6.806 6.806 0 0 0 18 4.22 6.788 6.788 0 0 0 12.972 2Zm9.635 16a6.741 6.741 0 0 1-.226-.216L18 13.403l-4.381 4.381a6.741 6.741 0 0 1-.226.216c.077.07.152.142.226.216L18 22.597l4.381-4.381c.074-.074.15-.146.226-.216Zm-2.83 7.848v1.346a3.25 3.25 0 0 0 5.55 2.298l5.117-5.117v-1.347a3.25 3.25 0 0 0-5.549-2.298l-5.117 5.117Zm-3.555 0-5.117-5.118a3.25 3.25 0 0 0-5.55 2.298v1.347l5.118 5.117a3.25 3.25 0 0 0 5.55-2.298v-1.346Zm0-17.042v1.347l-5.117 5.117a3.25 3.25 0 0 1-5.55-2.298v-1.347l5.118-5.117a3.25 3.25 0 0 1 5.55 2.298Zm8.673 6.464-5.117-5.117V8.806a3.25 3.25 0 0 1 5.549-2.298l5.117 5.117v1.347a3.25 3.25 0 0 1-5.549 2.298Z"
            clipRule="evenodd"
          />
          <defs>
            <linearGradient
              id={id}
              x1="18"
              x2="18"
              y1="2"
              y2="34"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#F4F4F5" />
              <stop
                offset="1"
                stopColor="#A1A1AA"
              />
            </linearGradient>
          </defs>
        </svg>
      </Link>
    </div>
  )
}

/**
 * App Sidebar with Permission-Based Filtering
 *
 * PERFORMANCE: Uses cached permissions from layout prefetch for instant filtering
 * - No API calls needed (reads from prefetched getUserOrganizations)
 * - Items without permission are hidden instantly
 * - Sub-items are also filtered based on permissions
 * - If all sub-items are hidden, parent item is hidden too
 */
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const [searchQuery, setSearchQuery] = React.useState('')
  const { state } = useSidebar()

  /**
   * Pipeline navigation hook - provides direct navigation to last viewed pipeline
   * WHY: Avoids the loading flash from /pipelines -> /pipelines/{id} redirect
   */
  const { href: pipelineHref, handleNavigate: handlePipelineNavigate } = usePipelineNavigation()

  /**
   * Get active organization using centralized hook
   * This respects domain-first approach:
   * 1. Subdomain → that org IS active
   * 2. Custom domain → that org IS active
   * 3. Root domain → session.activeOrganizationId
   */
  const { activeOrganization: activeOrg, hasPermission } = useActiveOrganization()

  /**
   * Helper: Check if user has permission
   * Uses hasPermission from useActiveOrganization which respects domain context
   */
  const checkPermission = React.useCallback(
    (permission?: Permission): boolean => {
      if (!permission) return true // No permission required
      return hasPermission(permission)
    },
    [hasPermission]
  )

  // Filter nav items based on permissions (instant - uses cached data)
  const filteredNavData = React.useMemo(() => {
    return navData.navMain.map((group) => ({
      ...group,
      items: group.items
        .map((item) => {
          // Check main item permission
          if (!checkPermission(item.permission)) return null

          // If item has sub-items, filter them too
          if (item.items) {
            const visibleSubItems = item.items.filter((subItem) =>
              checkPermission(subItem.permission)
            )

            // If all sub-items are hidden, hide the parent item too
            if (visibleSubItems.length === 0) return null

            // Return item with filtered sub-items
            return { ...item, items: visibleSubItems }
          }

          return item
        })
        .filter((item): item is NavItem => item !== null),
    }))
  }, [checkPermission])

  // Helper: Check if a URL is active based on current pathname
  const isActive = (url: string) => {
    // Exact match for root path (dashboard)
    if (url === '/') {
      return pathname === '/'
    }

    // For other paths, check if pathname starts with the URL
    // This handles both exact matches and nested routes
    return pathname.startsWith(url)
  }

  // Helper: Check if any sub-item is active (for collapsible items)
  const hasActiveSubItem = (
    items?: { url: string; permission?: Permission }[]
  ) => {
    if (!items) return false
    // Only check sub-items that user has permission to see
    const visibleItems = items.filter((subItem) =>
      checkPermission(subItem.permission)
    )
    return visibleItems.some((subItem) =>
      pathname.startsWith(subItem.url.split('?')[0])
    )
  }

  // Flatten nav items for search (preserves hrefs and icons)
  const flattenedItems = React.useMemo(() => {
    const flattened: Array<{
      title: string
      url: string
      description?: string
      icon?: React.ComponentType<{
        className?: string
        size?: number
        'aria-hidden'?: boolean
      }>
      searchTerms: string
    }> = []

    filteredNavData.forEach((group) => {
      group.items.forEach((item) => {
        // Add main item (only if it doesn't have sub-items, or if we want to include parent items too)
        // For better UX, we'll include all items in search
        if (!item.items || item.items.length === 0) {
          flattened.push({
            title: item.title,
            url: item.url,
            description: item.description,
            icon: item.icon,
            searchTerms: `${item.title} ${
              item.description || ''
            }`.toLowerCase(),
          })
        }

        // Add all sub-items (flattened - not nested)
        if (item.items) {
          item.items.forEach((subItem) => {
            flattened.push({
              title: subItem.title,
              url: subItem.url,
              description: subItem.description,
              icon: item.icon, // Use parent icon for sub-items
              searchTerms: `${subItem.title} ${subItem.description || ''} ${
                item.title
              }`.toLowerCase(),
            })
          })
        }
      })
    })

    return flattened
  }, [filteredNavData])

  // Filter items based on search query
  const searchResults = React.useMemo(() => {
    if (!searchQuery.trim()) return []
    const query = searchQuery.toLowerCase()
    return flattenedItems.filter((item) => item.searchTerms.includes(query))
  }, [searchQuery, flattenedItems])

  // Reset search when navigating
  React.useEffect(() => {
    setSearchQuery('')
  }, [pathname])

  // Reset search when sidebar collapses
  React.useEffect(() => {
    if (state === 'collapsed') {
      setSearchQuery('')
    }
  }, [state])

  return (
    <Sidebar
      collapsible="icon"
      variant="inset"
      {...props}
    >
      <SidebarHeader className="h-16 max-md:mt-2 mb-2 justify-center mt-3">
        <TeamSwitcher />
      </SidebarHeader>
      <SidebarContent className="-mt-2">
        {/* Search Input - only show when sidebar is expanded */}
        {state !== 'collapsed' && (
          <div className="px-2 mt-2">
            <div className=" rounded-md bg-muted ">
              <div className="flex h-9 items-center gap-2 px-2 ">
                <SearchIcon className="size-4 shrink-0 opacity-50" />
                <Input
                  type="search"
                  placeholder="Search sidebar..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-slot="command-input"
                  className={cn(
                    'placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent! py-3 text-sm outline-hidden! disabled:cursor-not-allowed disabled:opacity-50 border-none! focus-visible:ring-0 pl-1 shadow-none!'
                  )}
                />
              </div>
            </div>
          </div>
        )}

        {/* Show search results when searching, otherwise show normal navigation */}
        {searchQuery.trim() && state !== 'collapsed' ? (
          <SidebarGroup>
            <SidebarGroupLabel className="uppercase text-muted-foreground/65">
              Search Results
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {searchResults.length === 0 ? (
                  <div className="px-4 py-2 text-sm text-muted-foreground">
                    No results found
                  </div>
                ) : (
                  searchResults.map((item) => {
                    const itemIsActive = isActive(item.url)
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton
                          asChild
                          className="group/menu-button group-data-[collapsible=icon]:px-[5px]! font-medium gap-3 h-9"
                          tooltip={item.title}
                          isActive={itemIsActive}
                        >
                          {/* Special handling for Pipelines - use dynamic URL from localStorage */}
                          {item.url === '/pipelines' ? (
                            <a
                              href={pipelineHref}
                              onClick={handlePipelineNavigate}
                            >
                              {item.icon && (
                                <item.icon
                                  className="text-muted-foreground/65 group-data-[active=true]/menu-button:text-primary"
                                  size={22}
                                  aria-hidden={true}
                                />
                              )}
                              <span>{item.title}</span>
                            </a>
                          ) : (
                            <Link href={item.url}>
                              {item.icon && (
                                <item.icon
                                  className="text-muted-foreground/65 group-data-[active=true]/menu-button:text-primary"
                                  size={22}
                                  aria-hidden={true}
                                />
                              )}
                              <span>{item.title}</span>
                            </Link>
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          filteredNavData.map((group) => (
            <SidebarGroup key={group.title}>
              <SidebarGroupLabel className="uppercase text-muted-foreground/65">
                {group.title}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const itemIsActive = isActive(item.url)
                    const hasActiveSub = hasActiveSubItem(item.items)
                    const shouldBeActive = itemIsActive || hasActiveSub

                    return item.items ? (
                      <Collapsible
                        key={item.title}
                        asChild
                        defaultOpen={shouldBeActive}
                        className="group/collapsible"
                        suppressHydrationWarning
                      >
                        <SidebarMenuItem>
                          <CollapsibleTrigger
                            asChild
                            suppressHydrationWarning
                          >
                            <SidebarMenuButton
                              className="group/menu-button group-data-[collapsible=icon]:px-[5px]! font-medium gap-3 h-9"
                              tooltip={item.title}
                              isActive={shouldBeActive}
                              suppressHydrationWarning
                            >
                              {item.icon && (
                                <item.icon
                                  className="text-muted-foreground/65 group-data-[active=true]/menu-button:text-primary"
                                  size={22}
                                  aria-hidden={true}
                                />
                              )}
                              <span>{item.title}</span>
                              <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent suppressHydrationWarning>
                            <SidebarMenuSub>
                              {item.items.map((subItem) => {
                                const subItemIsActive = pathname.startsWith(
                                  subItem.url.split('?')[0]
                                )

                                return (
                                  <SidebarMenuSubItem key={subItem.title}>
                                    <SidebarMenuSubButton
                                      asChild
                                      isActive={subItemIsActive}
                                    >
                                      <Link href={subItem.url}>
                                        <span>{subItem.title}</span>
                                      </Link>
                                    </SidebarMenuSubButton>
                                  </SidebarMenuSubItem>
                                )
                              })}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuItem>
                      </Collapsible>
                    ) : (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          className="group/menu-button group-data-[collapsible=icon]:px-[5px]! font-medium gap-3 h-9"
                          tooltip={item.title}
                          isActive={itemIsActive}
                        >
                          {/* Special handling for Pipelines - use dynamic URL from localStorage */}
                          {item.url === '/pipelines' ? (
                            <a
                              href={pipelineHref}
                              onClick={handlePipelineNavigate}
                            >
                              {item.icon && (
                                <item.icon
                                  className="text-muted-foreground/65 group-data-[active=true]/menu-button:text-primary"
                                  size={22}
                                  aria-hidden={true}
                                />
                              )}
                              <span>{item.title}</span>
                            </a>
                          ) : (
                            <Link href={item.url}>
                              {item.icon && (
                                <item.icon
                                  className="text-muted-foreground/65 group-data-[active=true]/menu-button:text-primary"
                                  size={22}
                                  aria-hidden={true}
                                />
                              )}
                              <span>{item.title}</span>
                            </Link>
                          )}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))
        )}
      </SidebarContent>
      <SidebarFooter>
        <PromotionWidget />
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
