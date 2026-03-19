/**
 * Portal Layout
 *
 * SOURCE OF TRUTH: Portal Authentication & Layout
 * Provides authentication checking and centered layout for Client Portal.
 *
 * DESIGN: Centered container with compact sidebar (matches mockup)
 * - Max-width container centered on screen
 * - Compact left sidebar with user info and navigation
 * - Main content area on the right
 *
 * SECURITY:
 * - Verifies user is authenticated via better-auth (portalProcedure)
 * - Verifies user has portal admin access
 * - Creates initial owner automatically if conditions match ENV
 *
 * WHY force-dynamic: Portal routes always need auth (cookies/headers),
 * so static generation would always fail. This prevents noisy build errors.
 */

import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getQueryClient, trpc } from '@/trpc/server'
import { handleAuthError } from '@/lib/errors'
import { PortalNav } from '@/components/portal/portal-nav'

/** Force dynamic rendering — portal always needs auth headers */
export const dynamic = 'force-dynamic'

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const queryClient = getQueryClient()

  // ========================================================================
  // PORTAL AUTHENTICATION CHECK
  // ========================================================================
  // Verify the user has portal admin access.
  // Uses the same .catch(handleAuthError) pattern as the protected layout.
  // If not authenticated → redirects to /sign-in
  // If not a portal admin → portalProcedure throws FORBIDDEN → redirects to /sign-in
  const portalAdmin = await queryClient
    .fetchQuery(trpc.portal.getCurrentAdmin.queryOptions())
    .catch(handleAuthError)

  // ========================================================================
  // RENDER - Centered layout with compact sidebar
  // ========================================================================
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="min-h-screen bg-muted/30">
        {/* Centered Container */}
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="flex gap-8">
            {/* Left Sidebar */}
            <aside className="w-64 shrink-0">
              <PortalNav
                admin={{
                  id: portalAdmin.id,
                  email: portalAdmin.email,
                  displayName: portalAdmin.displayName,
                  role: portalAdmin.role,
                }}
              />
            </aside>

            {/* Main Content */}
            <main className="flex-1 min-w-0">
              {children}
            </main>
          </div>
        </div>
      </div>
    </HydrationBoundary>
  )
}
