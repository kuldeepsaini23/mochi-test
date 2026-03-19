// proxy.ts - Multi-tenant routing for subdomains and custom domains
import { NextRequest, NextResponse } from 'next/server'

// 🎛️ FEATURE TOGGLES: Set to false to disable subdomain/custom domain routing
const ENABLE_SUBDOMAIN_ROUTING = true // ⬅️ Set to false to disable
const ENABLE_CUSTOM_DOMAIN_ROUTING = true // ⬅️ Set to false to disable

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'yourapp.com'

// 🔐 PORTAL CONFIGURATION
const PORTAL_ENABLED = process.env.PORTAL_ENABLED === 'true'
const PORTAL_PATH_PREFIX = process.env.PORTAL_PATH_PREFIX || '/portal'

/**
 * Extract subdomain from hostname
 * Examples:
 *   acme.yourapp.com → "acme"
 *   yourapp.com → null
 */
function getSubdomain(hostname: string): string | null {
  if (!ENABLE_SUBDOMAIN_ROUTING) return null // ⬅️ FEATURE TOGGLE

  const host = hostname.split(':')[0]

  if (host === ROOT_DOMAIN) return null
  if (host === 'localhost' || host.startsWith('127.0.0.1')) return null
  if (!host.endsWith(`.${ROOT_DOMAIN}`)) return null

  const subdomain = host.replace(`.${ROOT_DOMAIN}`, '')
  if (subdomain.includes('.')) return null // Only first-level subdomains

  return subdomain
}

/**
 * Check if hostname is a custom domain
 * Examples:
 *   acme.com → true
 *   app.acme.com → true
 *   acme.yourapp.com → false (this is a subdomain)
 *   yourapp.com → false (root domain)
 */
function isCustomDomain(hostname: string): boolean {
  if (!ENABLE_CUSTOM_DOMAIN_ROUTING) return false // ⬅️ FEATURE TOGGLE

  const cleanHostname = hostname.split(':')[0]

  if (
    cleanHostname === ROOT_DOMAIN ||
    cleanHostname === 'localhost' ||
    cleanHostname.startsWith('127.0.0.1')
  ) {
    return false
  }

  if (cleanHostname.endsWith(`.${ROOT_DOMAIN}`)) {
    return false
  }

  /**
   * Exclude raw IP addresses from custom domain routing.
   * WHY: When accessing the dev server via local network IP (e.g., 192.168.1.42)
   *      for mobile testing / PWA testing, the IP should be treated like localhost,
   *      NOT as a custom domain. Real custom domains are always hostnames.
   */
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleanHostname)) {
    return false
  }

  return true
}

/**
 * Check if path is an auth route
 */
function isAuthRoute(pathname: string): boolean {
  return (
    pathname === '/sign-in' ||
    pathname === '/sign-up' ||
    pathname.startsWith('/verify-')
  )
}

/**
 * Check if path is a shared portal route (accessible on both root and subdomains)
 */
function isSharedPortalRoute(pathname: string): boolean {
  return pathname === '/onboarding' || pathname.startsWith('/onboarding/')
}

/**
 * Check if path is a Client Portal route
 *
 * WHY: Client Portal is the platform admin dashboard (MOCHI owner/team access)
 * HOW: Routes starting with /portal prefix are portal routes
 *
 * SECURITY: Portal routes are ONLY accessible from the root domain.
 * - ✅ yourapp.com/portal/* - Allowed
 * - ❌ acme.yourapp.com/portal/* - Blocked (subdomain)
 * - ❌ custom.com/portal/* - Blocked (custom domain)
 *
 * Examples:
 *   /portal → true
 *   /portal/dashboard → true
 *   /portal/organizations → true
 *   /settings → false
 */
function isClientPortalRoute(pathname: string): boolean {
  if (!PORTAL_ENABLED) return false
  return pathname === PORTAL_PATH_PREFIX || pathname.startsWith(`${PORTAL_PATH_PREFIX}/`)
}

/**
 * Check if path is a protected route
 * These routes require authentication and are the main app routes
 */
function isProtectedRoute(pathname: string): boolean {
  const protectedRoutes = [
    '/settings',
    '/team',
    '/affiliates',
    '/integrations',
    '/unauthorized',
  ]

  // Root path is also protected (dashboard)
  if (pathname === '/') return true

  return protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  )
}

/**
 * Website routing parameters extracted from URL
 */
interface WebsiteParams {
  domain: string // The website domain identifier (e.g., "webprodigies")
  slug: string // The page slug (e.g., "home", "about-us")
  isEditMode: boolean // Whether user is in edit mode (/edit suffix)
}

/**
 * Check if a pathname matches the website preview route pattern
 * Pattern: /{domain}/{slug}
 *
 * Examples:
 *   /webprodigies/home → true
 *   /webprodigies/about-us → true
 *   /settings → false (protected route)
 *   / → false (dashboard)
 *
 * @param pathname - The URL pathname to check
 * @returns true if matches preview pattern (exactly 2 segments)
 */
function isWebsitePreviewRoute(pathname: string): boolean {
  // Remove leading/trailing slashes and split into segments
  const segments = pathname.replace(/^\/|\/$/g, '').split('/')

  // Preview route must have exactly 2 segments: [domain, slug]
  // Example: /webprodigies/home → ["webprodigies", "home"]
  if (segments.length !== 2) return false

  // Make sure both segments are non-empty
  if (!segments[0] || !segments[1]) return false

  // Exclude known protected routes that might have 2 segments
  // This prevents false positives with app routes
  const firstSegment = segments[0]
  const excludedPrefixes = [
    'settings',
    'team',
    'affiliates',
    'integrations',
    'onboarding',
    'sign-in',
    'sign-up',
    'api',
    '_next',
    'forms', // Public form routes like /forms/[slug]
    'portal', // Client portal routes
    'templates', // Public template library route
    'marketplace', // Dashboard template marketplace route
  ]

  if (excludedPrefixes.includes(firstSegment)) return false

  return true
}

/**
 * Check if a pathname matches the website edit route pattern
 * Pattern: /{domain}/{slug}/edit
 *
 * Examples:
 *   /webprodigies/home/edit → true
 *   /webprodigies/about-us/edit → true
 *   /webprodigies/home → false (preview, not edit)
 *
 * @param pathname - The URL pathname to check
 * @returns true if matches edit pattern (exactly 3 segments with "edit" at end)
 */
function isWebsiteEditRoute(pathname: string): boolean {
  // Remove leading/trailing slashes and split into segments
  const segments = pathname.replace(/^\/|\/$/g, '').split('/')

  // Edit route must have exactly 3 segments: [domain, slug, "edit"]
  // Example: /webprodigies/home/edit → ["webprodigies", "home", "edit"]
  if (segments.length !== 3) return false

  // Make sure all segments are non-empty
  if (!segments[0] || !segments[1] || !segments[2]) return false

  // The third segment must be exactly "edit"
  if (segments[2] !== 'edit') return false

  // Exclude known protected routes (same as preview check)
  const firstSegment = segments[0]
  const excludedPrefixes = [
    'settings',
    'team',
    'affiliates',
    'integrations',
    'onboarding',
    'sign-in',
    'sign-up',
    'api',
    '_next',
    'forms', // Public form routes like /forms/[slug]/edit
    'portal', // Client portal routes
    'templates', // Public template library route
    'marketplace', // Dashboard template marketplace route
  ]

  if (excludedPrefixes.includes(firstSegment)) return false

  return true
}

/**
 * Extract website parameters from pathname
 * Supports both preview and edit mode routes
 *
 * Examples:
 *   /webprodigies/home → { domain: "webprodigies", slug: "home", isEditMode: false }
 *   /webprodigies/home/edit → { domain: "webprodigies", slug: "home", isEditMode: true }
 *   /acme/contact-us/edit → { domain: "acme", slug: "contact-us", isEditMode: true }
 *
 * @param pathname - The URL pathname to parse
 * @returns WebsiteParams object or null if pathname doesn't match website route pattern
 */
function extractWebsiteParams(pathname: string): WebsiteParams | null {
  // Remove leading/trailing slashes and split into segments
  const segments = pathname.replace(/^\/|\/$/g, '').split('/')

  // Check if this is an edit route (3 segments)
  if (segments.length === 3 && segments[2] === 'edit') {
    return {
      domain: segments[0],
      slug: segments[1],
      isEditMode: true,
    }
  }

  // Check if this is a preview route (2 segments)
  if (segments.length === 2) {
    return {
      domain: segments[0],
      slug: segments[1],
      isEditMode: false,
    }
  }

  // Doesn't match website route pattern
  return null
}

export async function proxy(request: NextRequest) {
  // CRITICAL: Read from Host header (not nextUrl.hostname)
  const hostname = request.headers.get('host') || request.nextUrl.hostname
  const pathname = request.nextUrl.pathname


  // Skip middleware for static files and public routes
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/fonts/') ||
    pathname.startsWith('/pay/') ||
    pathname.startsWith('/invoice/') ||
    (pathname.startsWith('/api/') && pathname !== '/api/auth/redirect') ||
    /\.(png|jpg|jpeg|gif|svg|ico|webp|css|js|woff|woff2|ttf|eot)$/.test(
      pathname
    )
  ) {
    return NextResponse.next()
  }

  const subdomain = getSubdomain(hostname)
  const customDomain = isCustomDomain(hostname)

  // ========================================
  // CLIENT PORTAL ROUTE HANDLING
  // Portal is ONLY accessible from root domain
  // ========================================

  if (isClientPortalRoute(pathname)) {
    // SECURITY: Block portal access from subdomains and custom domains
    if (subdomain || customDomain) {
      // Return 404 - don't reveal that portal exists
      return new NextResponse('Not Found', { status: 404 })
    }

    // ROOT DOMAIN: Allow portal access with special headers
    const response = NextResponse.next()
    response.headers.set('x-pathname', pathname)
    response.headers.set('x-is-portal', 'true')
    return response
  }

  // ROOT DOMAIN (yourapp.com) - Pass through normally
  if (!subdomain && !customDomain) {
    const response = NextResponse.next()
    response.headers.set('x-pathname', pathname)
    return response
  }

  // ========================================
  // CUSTOM DOMAIN ROUTING (PRIORITY)
  // Handle custom domains FIRST before subdomain logic
  // ========================================

  /**
   * Custom domain routing: webprodigiesmail.com/...
   *
   * For custom domains, the hostname IS the domain identifier.
   * The pathname contains the page slug and optional modifiers.
   *
   * SUPPORTED PATTERNS:
   * - webprodigiesmail.com/ → /webprodigiesmail.com (root, uses default page)
   * - webprodigiesmail.com/home → /webprodigiesmail.com/home (regular page)
   * - webprodigiesmail.com/home/edit → /webprodigiesmail.com/home/edit (edit mode)
   * - webprodigiesmail.com/blog/post-123 → /webprodigiesmail.com/blog/post-123 (dynamic page)
   * - webprodigiesmail.com/blog/post-123/edit → /webprodigiesmail.com/blog/post-123/edit (dynamic edit)
   */
  if (customDomain) {
    const cleanHostname = hostname.split(':')[0]
    const segments = pathname.replace(/^\/|\/$/g, '').split('/').filter(Boolean)


    // ========================================================================
    // CUSTOM DOMAIN = 100% WEBSITE
    // ========================================================================
    // On custom domains, ALL paths are website pages. Users can create pages
    // with ANY slug they want, including /sign-in, /settings, /team, etc.
    //
    // The ONLY exclusions are truly system-level routes that are required
    // for the website to function:
    // - /api/* - tRPC endpoints, webhooks, etc.
    // - /_next/* - Next.js static assets (already handled above, but just in case)
    //
    // NO app routes (sign-in, onboarding, settings, etc.) are excluded here
    // because custom domains don't serve the app - they serve the website ONLY.
    // ========================================================================
    const firstSegment = segments[0] || ''
    const isSystemRoute = firstSegment === 'api' || firstSegment === '_next'

    // If not a system route, treat as website page request
    if (!isSystemRoute) {
      // Detect if this is an edit route (last segment is "edit")
      const lastSegment = segments[segments.length - 1]
      const isEditMode = lastSegment === 'edit'

      // Build rewrite path: /[customDomain]/[[...pathname]]
      // Patterns:
      // - / → /customdomain (root)
      // - /home → /customdomain/home (regular page)
      // - /sign-in → /customdomain/sign-in (user's custom sign-in page!)
      // - /home/edit → /customdomain/home/edit (edit mode)
      // - /blog/post-123 → /customdomain/blog/post-123 (dynamic page)
      const rewritePath = segments.length > 0
        ? `/${cleanHostname}/${segments.join('/')}`
        : `/${cleanHostname}`

      const url = request.nextUrl.clone()
      url.pathname = rewritePath

      const response = NextResponse.rewrite(url)

      // Set headers for the application
      response.headers.set('x-hostname', hostname)
      response.headers.set('x-custom-domain', cleanHostname)
      response.headers.set('x-original-path', pathname)
      response.headers.set('x-is-custom-domain', 'true')
      response.headers.set('x-website-domain', cleanHostname)
      response.headers.set('x-website-mode', isEditMode ? 'edit' : 'preview')

      return response
    }

    // System route on custom domain (api, _next) - pass through with headers
    const response = NextResponse.next()
    response.headers.set('x-hostname', hostname)
    response.headers.set('x-custom-domain', cleanHostname)
    return response
  }

  // ========================================
  // SUBDOMAIN WEBSITE ROUTING
  // Handle subdomains: acme.mochi.test/webprodigies/home
  // ========================================

  /**
   * Subdomain website routes:
   * - Format: {subdomain}.mochi.test/{domain-name}/{slug}[/edit]
   * - Requires 2 segments for preview, 3 for edit
   */

  // Check if this is a website route (preview or edit) for SUBDOMAIN access
  const isWebsiteRoute =
    isWebsitePreviewRoute(pathname) || isWebsiteEditRoute(pathname)

  if (isWebsiteRoute && subdomain) {
    // Extract website parameters from pathname
    const params = extractWebsiteParams(pathname)

    if (params) {
      const { domain: websiteDomain, slug: websiteSlug, isEditMode } = params

      // Build the internal rewrite URL
      const rewritePath = isEditMode
        ? `/${websiteDomain}/${websiteSlug}/edit`
        : `/${websiteDomain}/${websiteSlug}`

      const url = request.nextUrl.clone()
      url.pathname = rewritePath

      const response = NextResponse.rewrite(url)

      // Set website-specific headers
      response.headers.set('x-website-domain', websiteDomain)
      response.headers.set('x-website-slug', websiteSlug)
      response.headers.set('x-website-mode', isEditMode ? 'edit' : 'preview')
      response.headers.set('x-is-custom-domain', 'false')
      response.headers.set('x-hostname', hostname)
      response.headers.set('x-original-path', pathname)
      response.headers.set('x-subdomain', subdomain)

      return response
    }
  }

  // ========================================
  // END WEBSITE ROUTING LOGIC
  // ========================================

  // STUDIO SUBDOMAIN or CUSTOM DOMAIN
  // Auth routes: Pass through with headers for branding
  if (isAuthRoute(pathname)) {
    const response = NextResponse.next()
    response.headers.set('x-hostname', hostname)
    response.headers.set('x-original-path', pathname)

    if (subdomain) {
      response.headers.set('x-subdomain', subdomain)
    }

    if (customDomain) {
      response.headers.set('x-custom-domain', hostname.split(':')[0])
    }

    return response
  }

  // Shared portal routes: Pass through without rewriting (e.g., /onboarding)
  if (isSharedPortalRoute(pathname)) {
    const response = NextResponse.next()
    response.headers.set('x-hostname', hostname)
    response.headers.set('x-original-path', pathname)

    if (subdomain) {
      response.headers.set('x-subdomain', subdomain)
    }

    if (customDomain) {
      response.headers.set('x-custom-domain', hostname.split(':')[0])
    }

    return response
  }

  // PROTECTED ROUTES: Pass through with headers for custom domain/subdomain context
  // B2B Model: All protected routes are accessed directly at root level
  const response = NextResponse.next()
  response.headers.set('x-hostname', hostname)
  response.headers.set('x-original-path', pathname)

  if (subdomain) {
    response.headers.set('x-subdomain', subdomain)
  }

  if (customDomain) {
    response.headers.set('x-custom-domain', hostname.split(':')[0])
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw\\.js|images|fonts).*)'],
}
