/**
 * ============================================================================
 * PREVIEW OVERLAY - Full-screen Preview with iPhone Frame for Mobile
 * ============================================================================
 *
 * Simple preview that toggles between desktop (full-width) and mobile
 * (iPhone 16 Pro frame) views.
 *
 * ANIMATION:
 * - Desktop: Full-width, full-height content
 * - Mobile: Content container smoothly resizes to iPhone screen dimensions
 * - iPhone frame appears around the resized content
 */

'use client'

import { useEffect, useCallback, useMemo, useState, useRef } from 'react'
import { EyeOff, Monitor, Smartphone } from 'lucide-react'
import {
  useAppSelector,
  useAppDispatch,
  selectActivePage,
  selectPreviewMode,
  togglePreviewMode,
  selectLocalComponents,
  selectPageInfos,
  switchPage,
  useBuilderContext,
} from '../../_lib'
import { PageRenderer } from '../page-renderer'
import { CmsRowProvider } from '../../_lib/cms-row-context'
import { trpc } from '@/trpc/react-provider'
import { ChatWidgetEmbed } from '@/components/chat-widget/chat-widget-embed'
import { CartSheet } from '../ecommerce'
import { CartProvider } from '../../_lib/cart-provider'

type ViewportMode = 'desktop' | 'mobile'

/**
 * iPhone 16 Pro dimensions.
 */
const IPHONE_SCREEN_WIDTH = 393
const IPHONE_SCREEN_HEIGHT = 852
const IPHONE_BEZEL = 14
const IPHONE_CORNER_RADIUS = 55
const IPHONE_SCREEN_RADIUS = 47


export function PreviewOverlay() {
  const dispatch = useAppDispatch()
  const previewMode = useAppSelector(selectPreviewMode)
  const activePage = useAppSelector(selectActivePage)
  const localComponents = useAppSelector(selectLocalComponents)
  const pageInfos = useAppSelector(selectPageInfos)
  const { organizationId, domainName, chatWidgetId, enableEcommerce, navigateToPage } = useBuilderContext()

  /**
   * Derive checkout page slug from the builder's page list.
   * Finds the e-commerce page whose slug starts with 'checkout'.
   * This matches the server-side lookup in getCheckoutPageSlug().
   *
   * SOURCE OF TRUTH: CheckoutPageSlug, CartCheckoutNavigation
   */
  const checkoutSlug = useMemo(() => {
    if (!enableEcommerce) return null
    const checkoutPage = pageInfos.find(
      (p) => p.isEcommercePage && p.slug.replace(/^\//, '').startsWith('checkout')
    )
    return checkoutPage?.slug ?? null
  }, [enableEcommerce, pageInfos])

  const [viewportMode, setViewportMode] = useState<ViewportMode>('desktop')

  // Get the page's cmsTableId for dynamic page preview
  const cmsTableId = activePage?.info?.cmsTableId

  /**
   * Holds the CMS row data from a clicked CMS list item in preview.
   * Set SYNCHRONOUSLY from the data-cms-row attribute on the <a> tag
   * so there's zero flash — the row data is available instantly when
   * the page switches, no async fetch needed.
   * When null, falls back to fetching the first row (default behavior).
   *
   * SOURCE OF TRUTH: PreviewDynamicRowNavigation, ClickedRowState
   */
  const [clickedRow, setClickedRow] = useState<{
    id: string
    values: Record<string, unknown>
    order: number
  } | null>(null)

  /** Clear the clicked row when navigating to a non-dynamic page */
  const prevPageIdRef = useRef(activePage?.info?.id)
  useEffect(() => {
    if (activePage?.info?.id !== prevPageIdRef.current) {
      prevPageIdRef.current = activePage?.info?.id
      if (!activePage?.info?.cmsTableId) {
        setClickedRow(null)
      }
    }
  }, [activePage?.info?.id, activePage?.info?.cmsTableId])

  /** Fetch the first CMS row for preview on dynamic pages (default fallback) */
  const { data: defaultPreviewRow } = trpc.pages.getPreviewRow.useQuery(
    {
      organizationId,
      tableId: cmsTableId ?? '',
    },
    {
      enabled: !!organizationId && Boolean(cmsTableId) && !clickedRow,
      placeholderData: (prev) => prev,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    }
  )

  /** Clicked row takes priority over default first row — no flash */
  const previewRow = clickedRow ?? defaultPreviewRow ?? null
  const [availableHeight, setAvailableHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 900
  )

  const elements = useMemo(() => {
    if (!activePage?.canvas?.elements) return []
    return Object.values(activePage.canvas.elements)
  }, [activePage?.canvas?.elements])

  const handleClose = useCallback(() => {
    dispatch(togglePreviewMode())
    setViewportMode('desktop')
  }, [dispatch])

  /**
   * Find a page by slug from the builder's page list.
   * Handles slug normalization (with/without leading slash).
   * For multi-segment paths (dynamic pages like /blog/post-123),
   * falls back to matching just the first segment (template page).
   *
   * SOURCE OF TRUTH: PreviewPageLookup, PreviewNavigation
   */
  const findPageBySlug = useCallback(
    (slug: string) => {
      const normalized = slug.replace(/^\//, '')

      /* Exact match first — handles regular pages like "about", "contact" */
      const exact = pageInfos.find(
        (p) => p.slug.replace(/^\//, '') === normalized
      )
      if (exact) return exact

      /* Multi-segment fallback — for dynamic page URLs like "blog/post-123",
         match the first segment ("blog") to the template page */
      if (normalized.includes('/')) {
        const firstSegment = normalized.split('/')[0]
        return pageInfos.find(
          (p) => p.slug.replace(/^\//, '') === firstSegment
        ) ?? null
      }

      return null
    },
    [pageInfos]
  )

  /**
   * Capture-phase click handler that intercepts internal link clicks
   * INSIDE the preview overlay. Fires BEFORE element-level handlers
   * (including Next.js Link's router.push), allowing us to prevent
   * navigation and switch pages within the builder instead.
   *
   * WHAT IT DOES:
   * - External links (http/https): Let through — open normally
   * - Hash links (#section): Let through — scroll within page
   * - Internal links (/about, /blog): Intercept, find matching page,
   *   dispatch switchPage to show that page's draft content in preview
   *
   * WHY CAPTURE PHASE:
   * React's onClickCapture fires before the target element's onClick.
   * This means we can call stopPropagation + preventDefault before
   * Next.js <Link> calls router.push(), preventing real navigation.
   *
   * SOURCE OF TRUTH: PreviewLinkInterception, PreviewNavigation
   */
  const handlePreviewLinkClick = useCallback(
    (e: React.MouseEvent) => {
      /* Walk up from the click target to find the nearest <a> ancestor */
      let target = e.target as HTMLElement | null
      while (target && target !== e.currentTarget) {
        if (target.tagName === 'A') {
          const href = target.getAttribute('href')
          if (!href) return

          /* External links — let through (open in new tab or same tab) */
          if (href.startsWith('http://') || href.startsWith('https://')) return

          /* Hash links — let through (scroll within preview) */
          if (href.startsWith('#')) return

          /* Internal link — intercept to stay within preview */
          e.preventDefault()
          e.stopPropagation()

          /* Strip the basePath prefix to extract the page slug.
             Example: "/mysite/about" → "about" */
          const basePrefixPattern = domainName
            ? new RegExp(`^/?${domainName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`)
            : null
          const rawSlug = basePrefixPattern
            ? href.replace(/^\//, '').replace(basePrefixPattern, '')
            : href.replace(/^\//, '')

          const page = findPageBySlug(rawSlug)
          if (page) {
            /**
             * DYNAMIC PAGE NAVIGATION:
             * When a CMS list item is clicked, the <a> has a data-cms-row attribute
             * with the full row data as JSON (set by DynamicPageLink). We read it
             * SYNCHRONOUSLY so the dynamic page renders instantly with the correct
             * row data — no flash from an async fetch.
             *
             * SOURCE OF TRUTH: PreviewDynamicRowNavigation
             */
            const cmsRowJson = target.getAttribute('data-cms-row')
            if (cmsRowJson && page.cmsTableId) {
              try {
                const rowData = JSON.parse(cmsRowJson) as {
                  id: string
                  values: Record<string, unknown>
                  order: number
                }
                setClickedRow(rowData)
              } catch {
                setClickedRow(null)
              }
            } else {
              setClickedRow(null)
            }

            dispatch(switchPage(page.id))
            navigateToPage(page.slug)
          }

          return
        }
        target = target.parentElement
      }
    },
    [domainName, findPageBySlug, dispatch, navigateToPage]
  )

  /**
   * Navigation callback for CartSheet's checkout button.
   * CartSheet uses router.push() (not <a> tags) so the capture handler
   * above won't intercept it. This callback does the same page lookup
   * and switchPage dispatch for the checkout page.
   *
   * SOURCE OF TRUTH: PreviewCartNavigation, CartCheckoutNavigation
   */
  const handlePreviewNavigate = useCallback(
    (slug: string) => {
      const page = findPageBySlug(slug)
      if (page) {
        dispatch(switchPage(page.id))
        navigateToPage(page.slug)
      }
    },
    [findPageBySlug, dispatch, navigateToPage]
  )

  useEffect(() => {
    const handleResize = () => setAvailableHeight(window.innerHeight)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!previewMode) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault()
        setViewportMode('desktop')
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        setViewportMode('mobile')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [previewMode, handleClose])

  if (!previewMode || !activePage) return null

  const isMobile = viewportMode === 'mobile'

  // Scale iPhone frame to fit viewport with padding
  const padding = 80
  const maxHeight = availableHeight - padding
  const scale = Math.min(1, maxHeight / (IPHONE_SCREEN_HEIGHT + IPHONE_BEZEL * 2))

  // Scaled dimensions
  const scaledScreenWidth = IPHONE_SCREEN_WIDTH * scale
  const scaledScreenHeight = IPHONE_SCREEN_HEIGHT * scale
  const scaledBezel = IPHONE_BEZEL * scale
  const scaledCornerRadius = IPHONE_CORNER_RADIUS * scale
  const scaledScreenRadius = IPHONE_SCREEN_RADIUS * scale

  /* Use shadcn bg-background so the overlay adapts to light/dark theme */
  return (
    <CartProvider websiteIdentifier={domainName || 'preview'}>
    <div
      className="fixed inset-0 z-[9999] overflow-hidden flex items-center justify-center bg-background"
    >
      {/* Main container - the frame wraps around the content and both shrink together */}
      <div
        className="relative transition-all duration-500 ease-in-out"
        style={{
          // Frame size: content + bezel on each side
          width: isMobile ? scaledScreenWidth + scaledBezel * 2 : '100%',
          height: isMobile ? scaledScreenHeight + scaledBezel * 2 : '100%',
          borderRadius: isMobile ? scaledCornerRadius : 0,
          background: isMobile
            ? 'linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 50%, #0f0f0f 100%)'
            : 'transparent',
          boxShadow: isMobile
            ? `0 0 0 ${1 * scale}px rgba(60, 60, 60, 0.8), 0 ${30 * scale}px ${60 * scale}px rgba(0, 0, 0, 0.5), inset 0 ${1 * scale}px ${1 * scale}px rgba(255, 255, 255, 0.05)`
            : 'none',
          padding: isMobile ? scaledBezel : 0,
        }}
      >
        {/* Side buttons - transition with the frame */}
        {/* Power button (right) */}
        <div
          className="absolute bg-gradient-to-b from-neutral-500 to-neutral-700 transition-all duration-500"
          style={{
            top: '25%',
            right: isMobile ? -3 * scale : -20,
            width: isMobile ? 3 * scale : 0,
            height: isMobile ? 80 * scale : 0,
            borderRadius: `0 ${2 * scale}px ${2 * scale}px 0`,
            opacity: isMobile ? 1 : 0,
          }}
        />
        {/* Volume up (left) */}
        <div
          className="absolute bg-gradient-to-b from-neutral-500 to-neutral-700 transition-all duration-500"
          style={{
            top: '18%',
            left: isMobile ? -3 * scale : -20,
            width: isMobile ? 3 * scale : 0,
            height: isMobile ? 40 * scale : 0,
            borderRadius: `${2 * scale}px 0 0 ${2 * scale}px`,
            opacity: isMobile ? 1 : 0,
          }}
        />
        {/* Volume down (left) */}
        <div
          className="absolute bg-gradient-to-b from-neutral-500 to-neutral-700 transition-all duration-500"
          style={{
            top: '25%',
            left: isMobile ? -3 * scale : -20,
            width: isMobile ? 3 * scale : 0,
            height: isMobile ? 40 * scale : 0,
            borderRadius: `${2 * scale}px 0 0 ${2 * scale}px`,
            opacity: isMobile ? 1 : 0,
          }}
        />
        {/* Action button (left) */}
        <div
          className="absolute bg-gradient-to-b from-neutral-500 to-neutral-700 transition-all duration-500"
          style={{
            top: '12%',
            left: isMobile ? -3 * scale : -20,
            width: isMobile ? 3 * scale : 0,
            height: isMobile ? 28 * scale : 0,
            borderRadius: `${2 * scale}px 0 0 ${2 * scale}px`,
            opacity: isMobile ? 1 : 0,
          }}
        />

        {/* Content area - the actual screen.

            CONTAINING BLOCK FOR FIXED ELEMENTS (mobile only):
            When in mobile mode, we add transform: translateZ(0) to create a new
            containing block. This traps position:fixed elements (like the mobile
            nav sheet) inside the phone frame instead of letting them escape to
            the browser viewport.

            This does NOT affect position:sticky inside the scroll container below,
            because sticky is relative to its nearest scrollport (the overflow:auto
            div), not the containing block created by this transform. */}
        <div
          className="relative bg-white transition-all duration-500 ease-in-out w-full h-full"
          style={{
            borderRadius: isMobile ? scaledScreenRadius : 0,
            overflow: 'hidden',
            ...(isMobile ? { transform: 'translateZ(0)' } : {}),
          }}
        >
        {/* Scrollable content area - overscrollBehavior prevents bounce/snap-back.
            onClickCapture intercepts internal link clicks in the capture phase,
            BEFORE Next.js <Link> fires router.push(). This keeps navigation
            within the preview instead of breaking out to the live site.
            SOURCE OF TRUTH: PreviewLinkInterception */}
        {/* Scrollable content area — this is the scroll container for sticky navbars.
            IMPORTANT: Do NOT add transform/filter/will-change here — they create
            a new containing block that breaks position:sticky and position:fixed
            for descendant elements (like navbars).
            SOURCE OF TRUTH: PreviewScrollContainer, NavbarStickyFix */}
        <div
          onClickCapture={handlePreviewLinkClick}
          style={{
            width: '100%',
            height: '100%',
            overflow: 'auto',
            overscrollBehavior: 'none',
            containerType: 'inline-size',
            position: 'relative',
          }}
        >
          {/* Wrap with CmsRowProvider for dynamic page preview */}
          {cmsTableId && previewRow ? (
            <CmsRowProvider
              row={previewRow}
              tableId={cmsTableId}
              basePath={`/${domainName}`}
            >
              <PageRenderer
                elements={elements}
                className="min-h-full"
                components={localComponents}
                breakpoint={isMobile ? 'mobile' : 'desktop'}
                enableEcommerce={enableEcommerce}
                basePath={domainName ? `/${domainName}` : undefined}
              />
            </CmsRowProvider>
          ) : (
            <PageRenderer
              elements={elements}
              className="min-h-full"
              components={localComponents}
              breakpoint={isMobile ? 'mobile' : 'desktop'}
              enableEcommerce={enableEcommerce}
              basePath={domainName ? `/${domainName}` : undefined}
            />
          )}
        </div>

{/* Dynamic Island removed — it overlaps page content and isn't useful for design preview */}
        </div>
      </div>

      {/* Cart Sheet - E-commerce shopping cart slide-out panel.
          Uses the actual checkout page slug from the builder's page list.
          SOURCE OF TRUTH: ShoppingCart, CartSheet, CartCheckoutNavigation */}
      {/* NOTE: CartSheet has z-[10003] to render above preview overlay (z-[9999]) */}
      <CartSheet
        basePath={domainName ? `/${domainName}` : undefined}
        checkoutSlug={checkoutSlug}
        onNavigate={handlePreviewNavigate}
      />

      {/* Chat Widget - renders when chatWidgetId is assigned to the website */}
      {/* SOURCE OF TRUTH: WebsiteChatWidget, ChatbotIntegration */}
      {chatWidgetId && (
        <div className="fixed bottom-4 right-4 z-[10001]">
          <ChatWidgetEmbed
            organizationId={organizationId}
            chatWidgetId={chatWidgetId}
            isMobileDevice={isMobile}
          />
        </div>
      )}

      {/* Controls */}
      <div className="fixed top-4 right-4 flex items-center gap-2 z-[10000]">
        {/* Viewport toggle: popover surface with border for theme-adaptive controls */}
        <div className="flex items-center bg-popover/80 rounded-full p-1 shadow-lg backdrop-blur-sm border border-border">
          <button
            onClick={() => setViewportMode('desktop')}
            className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
              viewportMode === 'desktop' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Desktop view (D)"
          >
            <Monitor size={16} />
          </button>
          <button
            onClick={() => setViewportMode('mobile')}
            className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
              viewportMode === 'mobile' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Mobile view (M)"
          >
            <Smartphone size={16} />
          </button>
        </div>
        {/* Close button: popover surface with border for theme-adaptive styling */}
        <button
          onClick={handleClose}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-popover/80 text-popover-foreground hover:bg-popover transition-colors shadow-lg backdrop-blur-sm border border-border"
          title="Exit preview (Esc)"
        >
          <EyeOff size={18} />
        </button>
      </div>

      {/* Viewport indicator */}
      {/* Viewport indicator pill: popover surface adapts to light/dark theme */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-popover/70 text-popover-foreground text-xs font-medium rounded-full shadow-lg z-[10000] backdrop-blur-sm border border-border">
        {isMobile ? `iPhone 16 Pro (${IPHONE_SCREEN_WIDTH}×${IPHONE_SCREEN_HEIGHT})` : 'Desktop'}
      </div>

      {/* Shortcuts */}
      {/* Shortcuts pill: popover surface with muted text for secondary info */}
      <div className="fixed bottom-4 right-4 px-3 py-2 bg-popover/60 text-muted-foreground text-xs rounded-lg backdrop-blur-sm z-[10000] border border-border">
        <span className="font-medium text-popover-foreground">Shortcuts:</span>{' '}
        <span className="px-1.5 py-0.5 bg-foreground/10 rounded">D</span> Desktop{' '}
        <span className="px-1.5 py-0.5 bg-foreground/10 rounded">M</span> Mobile{' '}
        <span className="px-1.5 py-0.5 bg-foreground/10 rounded">Esc</span> Close
      </div>
    </div>
    </CartProvider>
  )
}
