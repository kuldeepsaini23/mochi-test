/**
 * ============================================================================
 * WEBSITE BUILDER LAYOUT GROUP - Instant Loading State
 * ============================================================================
 *
 * ROUTE: /(website-builder)/*
 *
 * WHY THIS FILE EXISTS AND WHY IT'S HERE (NOT in /edit/):
 * In Next.js App Router, loading.tsx creates a Suspense boundary around the
 * page at its OWN level. It does NOT wrap parent layouts. Previously,
 * loading.tsx was placed at /[domain]/[pathname]/edit/ — but that only
 * shows AFTER the (website-builder)/layout.tsx fully resolves (which calls
 * getShowAnyBanner() with 3 sequential async queries). This caused the
 * loader to take up to 20 seconds to appear.
 *
 * By placing loading.tsx HERE at the layout group level, Next.js shows
 * the CanvasLoader INSTANTLY when navigating from the dashboard to ANY
 * website builder route — before the layout even starts rendering.
 *
 * IMPORTANT: This loading state covers ALL routes under (website-builder).
 * The individual /edit/loading.tsx has been removed to avoid duplicates.
 *
 * SOURCE OF TRUTH KEYWORDS: WebsiteBuilderLoading, BuilderLoadingState
 */

import { CanvasLoader } from '@/components/website-builder/builder-v1.2/_components/canvas'

export default function WebsiteBuilderLoading() {
  return <CanvasLoader isVisible={true} />
}
