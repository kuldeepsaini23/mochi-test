/**
 * Dashboard Layout - Sidebar UI Wrapper
 *
 * WHY: Provides the sidebar navigation and content wrapper for dashboard pages.
 * HOW: Uses SidebarProvider + AppSidebar + SidebarInset for the dashboard UI.
 *
 * ============================================================================
 * IMPORTANT: AUTH IS HANDLED BY PARENT LAYOUT
 * ============================================================================
 *
 * This layout does NOT handle authentication or data prefetching.
 * The parent (protected)/layout.tsx handles:
 * - Authentication verification
 * - Onboarding checks
 * - Data prefetching (organizations, user profile, tier, usage)
 * - Critical banners (subscription canceled, payment failed, Stripe restricted)
 *
 * This layout ONLY handles:
 * - Sidebar navigation UI
 * - Content area wrapper
 * - Mochi AI chat (for users with AI access)
 *
 * ============================================================================
 * BANNER PADDING
 * ============================================================================
 *
 * When a critical banner is shown (from parent layout), we need to add padding
 * to prevent content from being hidden behind the fixed banner.
 * Uses the shared `getShowAnyBanner()` utility (single source of truth).
 *
 * NOTE: The utility reads from React Query cache (already populated by
 * parent layout), so it returns instantly without making network requests.
 *
 * ============================================================================
 */

import { AppSidebar } from '@/components/app-sidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { getQueryClient, trpc } from '@/trpc/server'
import { CurrencyProvider } from '@/components/providers/currency-provider'
import { cn } from '@/lib/utils'
import { getShowAnyBanner } from '@/lib/utils/banner-visibility'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const queryClient = getQueryClient()

  // ========================================================================
  // READ CACHED DATA (already prefetched by parent layout)
  // ========================================================================
  // These fetchQuery calls hit the cache - data was prefetched by parent.
  // They return instantly without network requests.

  // Get active organization from cache
  // Uses getActiveOrganization which respects domain-first approach:
  // - Subdomain (acme.mochi.test) → that org IS the active org
  // - Custom domain (mycompany.com) → that org IS the active org
  // - Root domain (mochi.test) → use session.activeOrganizationId
  const activeOrg = await queryClient.fetchQuery(
    trpc.organization.getActiveOrganization.queryOptions()
  )

  // ========================================================================
  // BANNER VISIBILITY CHECK (for padding calculation)
  // ========================================================================
  // Uses shared utility — single source of truth for banner visibility.
  // The actual banners are rendered by the parent (protected) layout.
  const showAnyBanner = await getShowAnyBanner()

  // ========================================================================
  // RENDER - Sidebar UI
  // ========================================================================
  return (
    <>
      <SidebarProvider>
        <AppSidebar
          className={cn(
            // Add top padding when a banner is visible (banner is fixed position)
            showAnyBanner ? 'pt-12' : ''
          )}
        />
        <SidebarInset className="flex h-screen flex-col md:pb-2 md:pt-2 md:pr-2">
          <div className="flex h-full flex-col overflow-hidden rounded-3xl bg-background shadow-sm">
            <div
              className={cn(
                'flex-1 overflow-auto flex flex-col',
                // Add top padding when a banner is visible
                showAnyBanner ? 'pt-10' : ''
              )}
            >
              {/* Wrap with CurrencyProvider for organization-wide currency context */}
              {activeOrg?.id ? (
                <CurrencyProvider organizationId={activeOrg.id}>
                  {children}
                </CurrencyProvider>
              ) : (
                children
              )}
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </>
  )
}
