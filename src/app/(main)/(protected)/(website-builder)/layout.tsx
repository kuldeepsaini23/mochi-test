/**
 * ============================================================================
 * WEBSITE BUILDER LAYOUT
 * ============================================================================
 *
 * Layout for website builder pages.
 * Provides a clean full-screen layout without the dashboard navigation.
 *
 * WHY: The website builder needs full screen real estate for the
 * canvas, element panels, and property inspectors.
 *
 * BANNER PADDING: Uses shared `getShowAnyBanner()` to offset content
 * when a critical banner is visible (rendered by parent protected layout).
 *
 * SOURCE OF TRUTH KEYWORDS: WebsiteBuilderLayout
 */

import { getShowAnyBanner } from '@/lib/utils/banner-visibility'

export default async function WebsiteBuilderLayout({
  children,
}: {
  children: React.ReactNode
}) {
  /* Check if any critical banner is visible (reads from cache — instant) */
  const showAnyBanner = await getShowAnyBanner()

  return (
    <div
      className="h-screen w-screen overflow-hidden"
      /* Pass banner offset as a CSS variable so the fixed-positioned canvas
         can read it. CSS custom properties inherit through the DOM tree even
         to fixed-positioned children, unlike padding which is ignored by fixed. */
      style={
        showAnyBanner
          ? ({ '--banner-top-offset': '2.5rem' } as React.CSSProperties)
          : undefined
      }
    >
      {children}
    </div>
  )
}
