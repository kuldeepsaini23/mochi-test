/**
 * ============================================================================
 * PUBLIC WEBSITE PAGE - Live Website Display (With Dynamic Page Support)
 * ============================================================================
 *
 * Renders published website pages to visitors. NO AUTHENTICATION REQUIRED.
 *
 * ROUTE: /[domain]/[[...pathname]]
 *
 * ============================================================================
 * URL PATTERNS SUPPORTED
 * ============================================================================
 *
 * 1. REGULAR PAGES (single segment):
 *    - /webprodigies/home -> pathname = ['home']
 *    - /webprodigies/about -> pathname = ['about']
 *
 * 2. DYNAMIC PAGES (two segments):
 *    - /webprodigies/blog/post-123 -> pathname = ['blog', 'post-123']
 *    - First segment is the template page slug
 *    - Second segment is the CMS row ID or slug
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * This page is PUBLIC (no auth required):
 * - Visitors can view published websites without logging in
 * - Uses baseProcedure (not organizationProcedure)
 * - Only shows PUBLISHED pages (not drafts or archived)
 *
 * DYNAMIC PAGE DETECTION:
 * When pathname has 2 segments, we check if the first segment is a dynamic
 * page template (has cmsTableId set). If so, we fetch the specific CMS row
 * and render the page with that row's data in context.
 *
 * ============================================================================
 * DATA FLOW
 * ============================================================================
 *
 * For Regular Pages:
 * 1. Server component receives domain + pathname from URL
 * 2. Calls public tRPC procedure (websites.getPublishedPage)
 * 3. Returns elements array from publishedCanvasData
 * 4. ResponsivePageRenderer renders with correct breakpoint
 *
 * For Dynamic Pages:
 * 1. Server component detects 2-segment pathname
 * 2. Calls getDynamicPageData with templateSlug + rowIdOrSlug
 * 3. Returns elements + CMS row data
 * 4. DynamicPageRenderer wraps content in CmsRowProvider
 * 5. Link elements can resolve dynamic URLs using row context
 */

import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { trpc, getQueryClient } from '@/trpc/server'
import { prisma } from '@/lib/config/prisma'
import { ResponsivePageRenderer } from '@/components/website-builder/builder-v1.2/_components/responsive-page-renderer'
import type { CanvasElement, LocalComponent } from '@/components/website-builder/builder-v1.2/_lib/types'
import {
  extractFontsFromElements,
  generateFontUrl,
} from '@/components/website-builder/builder-v1.2/_lib/google-fonts-service'
import { CartSheet } from '@/components/website-builder/builder-v1.2/_components/ecommerce'
import { CartProvider } from '@/components/website-builder/builder-v1.2/_lib/cart-provider'
import { PageViewTracker } from '@/components/website-builder/page-view-tracker'
import { ChatWidgetPublicEmbed } from '@/components/chat-widget/chat-widget-public-embed'
import { getCustomBrandingCached } from '@/lib/page-cache'
import { PoweredByBadge } from '@/components/website-builder/powered-by-badge'
import { detectInitialBreakpoint } from '@/lib/user-agent'

/**
 * Props for the public page component.
 * pathname is now an optional catch-all array:
 * - undefined: /domain (no path)
 * - ['home']: /domain/home
 * - ['blog', 'post-123']: /domain/blog/post-123 (dynamic page)
 */
interface PublicPageProps {
  params: Promise<{
    domain: string
    pathname?: string[]
  }>
}

/**
 * Public Website Page - Renders published website content
 *
 * Handles both regular pages and dynamic pages with CMS data.
 *
 * REGULAR PAGE: /domain/slug
 * DYNAMIC PAGE: /domain/template-slug/row-id
 */
export default async function PublicWebsitePage({ params }: PublicPageProps) {
  const { domain, pathname } = await params

  // Convert catch-all array to path string
  // Empty array or undefined -> empty string (root)
  // ['home'] -> 'home'
  // ['blog', 'post-123'] -> 'blog/post-123' (will be parsed for dynamic pages later)
  const pathSegments = pathname ?? []
  const fullPath = pathSegments.join('/')

  // ============================================================================
  // CUSTOM DOMAIN DETECTION
  // ============================================================================
  // Read the proxy header to determine if this page is being served on a custom domain.
  // This affects how navigation links are built (basePath handling).
  //
  // CUSTOM DOMAIN: basePath = "" (proxy transparently rewrites /about → /customdomain.com/about)
  // SUBDOMAIN/DEV: basePath = "/${domain}" (URL path includes the domain segment)
  const headersList = await headers()
  const isCustomDomain = headersList.get('x-is-custom-domain') === 'true'

  /**
   * Base path for navigation links.
   *
   * On custom domains, the proxy rewrites URLs transparently:
   *   customdomain.com/about → internally /customdomain.com/about
   * So user-facing links should NOT include the domain prefix.
   *
   * On subdomains (or dev), the URL path includes the domain:
   *   org.mochi.test/webprodigies/about → /webprodigies/about
   * So links need the /${domain} prefix to route correctly.
   */
  const basePath = isCustomDomain ? '' : `/${domain}`

  /**
   * Detect mobile device from User-Agent header for SSR breakpoint.
   * This prevents FOUC (Flash of Unstyled Content) by ensuring the server
   * renders with the correct breakpoint from the start — mobile users
   * get mobile layout in the SSR HTML, no flash of desktop styles.
   *
   * The client-side useBreakpoint hook still confirms/corrects this after
   * hydration using actual viewport width (handles edge cases like unusual UAs).
   */
  const initialBreakpoint = detectInitialBreakpoint(headersList.get('user-agent'))

  // ============================================================================
  // EDIT MODE REDIRECT FOR CUSTOM DOMAINS
  // ============================================================================
  // When accessing /edit on a custom domain, redirect to the subdomain version.
  // Custom domains are PUBLIC-ONLY - editing requires authentication via subdomain.
  //
  // Example: webprodigiesmail.com/home/edit → acme.mochidev.net/mochi-website/home/edit
  //
  // WHY: The (protected) edit route requires auth, but custom domains don't carry
  // session cookies from the main app. Redirecting to subdomain ensures proper auth flow.
  const lastSegment = pathSegments[pathSegments.length - 1]
  const isEditRoute = lastSegment === 'edit'

  if (isEditRoute) {

    if (isCustomDomain) {
      /**
       * Look up the domain to get organization's subdomain for the edit URL.
       *
       * NOTE: customDomain now stores just the domain (e.g., "webprodigies.com")
       * without protocol prefix. The proxy passes the hostname, so we check exact match.
       *
       * REDIRECT PATTERN: customdomain.com/page/edit → org.mochidev.net/customdomain.com/page/edit
       *
       * We use the customDomain as the identifier in the edit URL because the page lookup
       * supports both customDomain (contains ".") and previewId (no ".") identifiers.
       */
      const domainRecord = await prisma.domain.findFirst({
        where: {
          OR: [
            { customDomain: domain }, // Exact match (webprodigies.com)
            { customDomain: `https://${domain}` }, // Legacy format with protocol
            { customDomain: `http://${domain}` }, // Legacy format with protocol
          ],
        },
        select: {
          customDomain: true,
          organizationId: true,
        },
      })

      if (domainRecord) {
        // Get organization slug for subdomain URL
        const organization = await prisma.organization.findUnique({
          where: { id: domainRecord.organizationId },
          select: { slug: true },
        })

        if (organization?.slug) {
          // Build the subdomain edit URL
          // Remove 'edit' from path segments to get the actual page path
          const pagePathSegments = pathSegments.slice(0, -1)
          const pagePath = pagePathSegments.join('/')

          const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'mochidev.net'
          // Use customDomain as identifier - the edit page handles both domain and previewId lookups
          const subdomainUrl = `https://${organization.slug}.${rootDomain}/${domainRecord.customDomain}/${pagePath}/edit`

          redirect(subdomainUrl)
        }
      }

      // If domain not found, fall through to 404
      notFound()
    }

    // Non-custom-domain edit request that reached the public catch-all.
    // This happens when the user is NOT authenticated — the protected layout's
    // auth check redirected them away, causing the request to fall through here.
    // Redirect to /sign-in so they can authenticate and access the builder.
    redirect('/sign-in')
  }

  // Get cached query client for tRPC calls (dedupes between Page and generateMetadata)
  const queryClient = getQueryClient()

  // ============================================================================
  // DYNAMIC PAGE DETECTION
  // ============================================================================
  // If we have exactly 2 path segments, check if this is a dynamic page request.
  // Pattern: /domain/templateSlug/rowIdOrSlug
  //
  // TODO: Implement dynamic page fetching once getDynamicPageData is added to tRPC
  // For now, fall through to regular page lookup

  if (pathSegments.length === 2) {
    /**
     * Decode the row identifier from the URL. Next.js catch-all params
     * may keep URL-encoded values (e.g., "Sage%20Green%20Crewneck").
     * The CMS stores raw values, so we need to decode for DB lookups.
     */
    const [templateSlug, rawRowIdOrSlug] = pathSegments
    const rowIdOrSlug = decodeURIComponent(rawRowIdOrSlug)

    // Try to fetch as a dynamic page
    try {
      const dynamicData = await queryClient.fetchQuery(
        trpc.websites.getDynamicPageData.queryOptions({
          domainName: domain,
          templateSlug,
          rowIdOrSlug,
        })
      )

      if (dynamicData) {
        // Dynamic page found - render with CMS row context
        const elements = dynamicData.elements as CanvasElement[]
        const components = dynamicData.components as Record<string, LocalComponent> | undefined
        const organizationId = dynamicData.organizationId

        // Extract fonts for preloading
        const fonts = extractFontsFromElements(elements)
        const fontUrl = fonts.length > 0 ? generateFontUrl(fonts) : null

        /* Check custom_branding feature — if disabled, show "Powered by Mochi" badge */
        const hasCustomBranding = organizationId
          ? await getCustomBrandingCached(organizationId)
          : false

        // Import DynamicPageRenderer for CMS row context wrapping
        const { DynamicPageRenderer } = await import(
          '@/components/website-builder/builder-v1.2/_components/dynamic-page-renderer'
        )

        return (
          <>
            {fontUrl && (
              <>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link rel="preload" href={fontUrl} as="style" />
                <link rel="stylesheet" href={fontUrl} />
              </>
            )}

            {/* CartProvider wraps page content + CartSheet so Redux cart state
                is available to checkout, add-to-cart, and cart elements.
                websiteIdentifier scopes localStorage persistence per website. */}
            <CartProvider websiteIdentifier={domain}>
              <main className="h-dvh overflow-y-auto overscroll-none bg-white">
                <DynamicPageRenderer
                  elements={elements}
                  cmsRow={dynamicData.cmsRow}
                  cmsTableId={dynamicData.cmsTableId}
                  components={components}
                  organizationId={organizationId}
                  basePath={basePath}
                  enableEcommerce={(dynamicData as { enableEcommerce?: boolean }).enableEcommerce ?? false}
                  initialBreakpoint={initialBreakpoint}
                  pageSlugColumns={(dynamicData as { pageSlugColumns?: Record<string, string> }).pageSlugColumns}
                />
              </main>

              {/* E-commerce Cart Sheet - slides out when cart is opened.
                  Uses the actual checkout page slug from the website's e-commerce pages.
                  SOURCE OF TRUTH: CartCheckoutNavigation */}
              <CartSheet
                basePath={basePath}
                checkoutSlug={(dynamicData as { checkoutSlug?: string | null }).checkoutSlug}
              />
            </CartProvider>

            {/* Chat Widget - renders floating chat bubble when website has a chatbot configured */}
            {dynamicData.chatWidgetId && organizationId && (
              <ChatWidgetPublicEmbed
                organizationId={organizationId}
                chatWidgetId={dynamicData.chatWidgetId}
              />
            )}

            {/* Silent page view tracker - fires once on mount, renders nothing.
                Only rendered when organizationId is available (always true for valid pages). */}
            {organizationId && (
              <PageViewTracker
                organizationId={organizationId}
                pageId={dynamicData.pageId}
                pathname={fullPath || '/'}
              />
            )}

            {/* Powered by Mochi badge — only shown when custom_branding is disabled (free tier) */}
            {!hasCustomBranding && <PoweredByBadge />}
          </>
        )
      }
    } catch {
      // getDynamicPageData not found or failed - fall through to regular page
    }
  }

  // ============================================================================
  // REGULAR PAGE FETCH
  // ============================================================================
  const pageData = await queryClient.fetchQuery(
    trpc.websites.getPublishedPage.queryOptions({
      domainName: domain,
      pathname: fullPath,
    })
  )

  // If page not found or not published, show 404
  if (!pageData) {
    notFound()
  }

  // Cast elements to CanvasElement[] for type safety
  const elements = pageData.elements as CanvasElement[]

  // Cast components to Record<string, LocalComponent> for type safety
  const components = pageData.components as Record<string, LocalComponent> | undefined

  // Get organizationId for CMS data fetching in SmartCMS List elements
  const organizationId = pageData.organizationId

  // Extract baked CMS snapshots for SmartCMS List instant rendering.
  // These are populated at publish time — undefined for old pages (backward compat).
  const cmsSnapshots = (pageData as { cmsSnapshots?: Record<string, unknown> }).cmsSnapshots

  // E-commerce flag — gates navbar cart button visibility
  const enableEcommerce = (pageData as { enableEcommerce?: boolean }).enableEcommerce ?? false

  // Page slug columns map for SEO-friendly dynamic URLs in published mode
  // SOURCE OF TRUTH: PageSlugColumnsMap, DynamicUrlSlugResolution
  const pageSlugColumns = (pageData as { pageSlugColumns?: Record<string, string> }).pageSlugColumns

  // Extract fonts from elements and generate Google Fonts URL
  const fonts = extractFontsFromElements(elements)
  const fontUrl = fonts.length > 0 ? generateFontUrl(fonts) : null

  /* Check custom_branding feature — if disabled, show "Powered by Mochi" badge */
  const hasCustomBranding = organizationId
    ? await getCustomBrandingCached(organizationId)
    : false

  // Render the published page with font preloading
  return (
    <>
      {fontUrl && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="preload" href={fontUrl} as="style" />
          <link rel="stylesheet" href={fontUrl} />
        </>
      )}

      {/* CartProvider wraps page content + CartSheet so Redux cart state
          is available to checkout, add-to-cart, and cart elements.
          websiteIdentifier scopes localStorage persistence per website. */}
      <CartProvider websiteIdentifier={domain}>
        <main className="h-dvh overflow-y-auto overscroll-none bg-white">
          <ResponsivePageRenderer
            elements={elements}
            className="min-h-screen"
            style={{ margin: '0 auto' }}
            components={components}
            organizationId={organizationId}
            basePath={basePath}
            cmsSnapshots={cmsSnapshots}
            enableEcommerce={enableEcommerce}
            initialBreakpoint={initialBreakpoint}
            pageSlugColumns={pageSlugColumns}
          />
        </main>

        {/* E-commerce Cart Sheet - slides out when cart is opened.
            Uses the actual checkout page slug from the website's e-commerce pages.
            SOURCE OF TRUTH: CartCheckoutNavigation */}
        <CartSheet
          basePath={basePath}
          checkoutSlug={(pageData as { checkoutSlug?: string | null }).checkoutSlug}
        />
      </CartProvider>

      {/* Chat Widget - renders floating chat bubble when website has a chatbot configured */}
      {pageData.chatWidgetId && organizationId && (
        <ChatWidgetPublicEmbed
          organizationId={organizationId}
          chatWidgetId={pageData.chatWidgetId}
        />
      )}

      {/* Silent page view tracker - fires once on mount, renders nothing.
          Only rendered when organizationId is available (always true for valid pages). */}
      {organizationId && (
        <PageViewTracker
          organizationId={organizationId}
          pageId={pageData.pageId}
          pathname={fullPath || '/'}
        />
      )}

      {/* Powered by Mochi badge — only shown when custom_branding is disabled (free tier) */}
      {!hasCustomBranding && <PoweredByBadge />}
    </>
  )
}

/**
 * Next.js generateMetadata — sets <title>, meta description, OpenGraph,
 * Twitter cards, and robots directives for published pages.
 *
 * SOURCE OF TRUTH: PageSeo, PageMetadata, GenerateMetadata
 *
 * RESOLUTION ORDER:
 * 1. Page-level SEO fields (metaTitle, metaDescription, ogImage)
 * 2. For dynamic pages: CMS row field mappings override template defaults
 * 3. Fallback: page name → website name → 'Page'
 *
 * CANONICAL URLS:
 * Every page gets a canonical URL to prevent duplicate content indexing.
 * Custom domains use https://{domain}/{slug}, preview domains use the
 * domainName param as-is. Dynamic pages canonicalize to the slug-based
 * URL (not the row-id URL) when a slug column is configured.
 * SOURCE OF TRUTH: CanonicalUrl, SeoCanonical
 */
export async function generateMetadata({ params }: PublicPageProps): Promise<Metadata> {
  const { domain, pathname } = await params
  const pathSegments = pathname ?? []
  const fullPath = pathSegments.join('/')

  try {
    const queryClient = getQueryClient()

    // ========================================================================
    // DYNAMIC PAGES — CMS row data can override template SEO fields
    // ========================================================================
    if (pathSegments.length === 2) {
      const [templateSlug, rowIdOrSlug] = pathSegments
      try {
        const dynamicData = await queryClient.fetchQuery(
          trpc.websites.getDynamicPageData.queryOptions({
            domainName: domain,
            templateSlug,
            rowIdOrSlug,
          })
        )

        if (dynamicData) {
          /**
           * Resolve SEO values for dynamic pages:
           * 1. Check CMS column mappings (seoTitleColumn, etc.) against row data
           * 2. Fall back to template-level SEO fields
           * 3. Fall back to page/website name
           */
          const rowValues = (dynamicData.cmsRow?.values ?? {}) as Record<string, unknown>

          /**
           * Extract SEO fields with type assertion for cache compatibility.
           * Dynamic pages resolve: CMS column mapping → template SEO → page name
           * SOURCE OF TRUTH: DynamicPageSeo, CmsSeoMapping
           */
          const dynSeo = dynamicData as {
            metaTitle?: string | null; metaDescription?: string | null; ogImage?: string | null
            noIndex?: boolean; seoTitleColumn?: string | null; seoDescriptionColumn?: string | null
            seoImageColumn?: string | null; domainName?: string | null
          }

          const title = (dynSeo.seoTitleColumn && rowValues[dynSeo.seoTitleColumn]
            ? String(rowValues[dynSeo.seoTitleColumn])
            : dynSeo.metaTitle) || dynamicData.pageName || 'Page'

          const description = (dynSeo.seoDescriptionColumn && rowValues[dynSeo.seoDescriptionColumn]
            ? String(rowValues[dynSeo.seoDescriptionColumn])
            : dynSeo.metaDescription) || undefined

          const ogImage = (dynSeo.seoImageColumn && rowValues[dynSeo.seoImageColumn]
            ? String(rowValues[dynSeo.seoImageColumn])
            : dynSeo.ogImage) || undefined

          /**
           * Build canonical URL for dynamic pages.
           * WHY: Same content may be accessible via row-id or slug — canonical
           * tells search engines which URL is the "real" one.
           * SOURCE OF TRUTH: CanonicalUrl, DynamicPageCanonical
           */
          const canonicalBase = buildCanonicalBase(dynSeo.domainName || domain)
          const canonicalUrl = `${canonicalBase}/${templateSlug}/${rowIdOrSlug}`

          return {
            title,
            description,
            alternates: { canonical: canonicalUrl },
            openGraph: {
              title,
              url: canonicalUrl,
              ...(description && { description }),
              ...(ogImage && { images: [{ url: ogImage }] }),
            },
            twitter: {
              card: ogImage ? 'summary_large_image' : 'summary',
              title,
              ...(description && { description }),
              ...(ogImage && { images: [ogImage] }),
            },
            ...(dynSeo.noIndex && {
              robots: { index: false, follow: false },
            }),
          }
        }
      } catch {
        // Fall through to regular page lookup
      }
    }

    // ========================================================================
    // REGULAR PAGES — Use page-level SEO fields with fallbacks
    // ========================================================================
    const pageData = await queryClient.fetchQuery(
      trpc.websites.getPublishedPage.queryOptions({
        domainName: domain,
        pathname: fullPath,
      })
    )

    if (!pageData) {
      return { title: 'Page Not Found' }
    }

    /**
     * Extract SEO fields — use type assertion for cache type compatibility.
     * The fresh tRPC response includes these fields but the Redis cache type
     * has them as optional (backward compatible with pre-SEO cached pages).
     * SOURCE OF TRUTH: PageSeo, PageMetadata
     */
    const seoData = pageData as { metaTitle?: string | null; metaDescription?: string | null; ogImage?: string | null; noIndex?: boolean }
    const title = seoData.metaTitle || pageData.pageName || pageData.websiteName || 'Page'
    const description = seoData.metaDescription || undefined
    const ogImage = seoData.ogImage || undefined

    /**
     * Build canonical URL for regular pages.
     * WHY: Prevents duplicate content from custom domain vs preview URL.
     * Custom domain takes precedence when available.
     * SOURCE OF TRUTH: CanonicalUrl, RegularPageCanonical
     */
    const canonicalBase = buildCanonicalBase(pageData.domainName || domain)
    const canonicalUrl = fullPath ? `${canonicalBase}/${fullPath}` : canonicalBase

    return {
      title,
      description,
      alternates: { canonical: canonicalUrl },
      openGraph: {
        title,
        url: canonicalUrl,
        ...(description && { description }),
        ...(ogImage && { images: [{ url: ogImage }] }),
      },
      twitter: {
        card: ogImage ? 'summary_large_image' : 'summary',
        title,
        ...(description && { description }),
        ...(ogImage && { images: [ogImage] }),
      },
      ...(seoData.noIndex && {
        robots: { index: false, follow: false },
      }),
    }
  } catch {
    return { title: 'Page Not Found' }
  }
}

/**
 * Build the base canonical URL from a domain identifier.
 *
 * WHY: Canonical URLs must be absolute. Custom domains use https://,
 * preview/internal domains need the app's base URL as prefix.
 *
 * SOURCE OF TRUTH: CanonicalBase, CanonicalUrlBuilder
 */
function buildCanonicalBase(domainName: string): string {
  /**
   * If the domain contains a dot, it's a custom domain (e.g., mysite.com).
   * Custom domains get their own https:// origin.
   * Otherwise it's a previewId or internal identifier — prefix with the app URL.
   */
  if (domainName.includes('.')) {
    return `https://${domainName}`
  }
  const appUrl = process.env.NEXT_PUBLIC_URL || 'https://app.mochi.is'
  return `${appUrl}/${domainName}`
}
