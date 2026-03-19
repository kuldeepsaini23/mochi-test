/**
 * ============================================================================
 * AUTOMATION BUILDER LAYOUT
 * ============================================================================
 *
 * Layout for automation builder pages.
 * Provides a clean full-screen layout without the dashboard navigation.
 *
 * WHY: The automation builder needs full screen real estate for the
 * node canvas, sidebar, and properties drawer.
 *
 * BANNER PADDING: Uses shared `getShowAnyBanner()` to offset content
 * when a critical banner is visible (rendered by parent protected layout).
 */

import { cn } from '@/lib/utils'
import { getShowAnyBanner } from '@/lib/utils/banner-visibility'

export default async function AutomationBuilderLayout({
  children,
}: {
  children: React.ReactNode
}) {
  /* Check if any critical banner is visible (reads from cache — instant) */
  const showAnyBanner = await getShowAnyBanner()

  return (
    <div
      className={cn(
        'h-screen w-screen overflow-hidden',
        /* When a banner is showing, add top padding so builder content
           sits below the absolute-positioned banner (same approach as dashboard) */
        showAnyBanner && 'pt-10'
      )}
    >
      {children}
    </div>
  )
}
