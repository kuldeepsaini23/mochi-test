'use client'

/**
 * ============================================================================
 * PAGE VIEW TRACKER - Silent Analytics Component for Published Pages
 * ============================================================================
 *
 * Invisible client component that fires a single page view event on mount.
 * Rendered inside every published website page (regular and dynamic) to track
 * visitor traffic without affecting page load performance.
 *
 * WHY A SEPARATE COMPONENT:
 * The published page is a server component, so browser-only APIs (localStorage,
 * URLSearchParams, document.referrer) can only run inside a client boundary.
 * This component encapsulates all client-side tracking logic and renders null.
 *
 * DEDUPLICATION:
 * - Client-side: useRef prevents double-fire in React StrictMode dev remounts
 * - Server-side: The pageView.track mutation debounces by visitorId+pageId
 *   with a 1-hour window, so rapid refreshes are harmlessly absorbed
 *
 * SOURCE OF TRUTH KEYWORDS: PageViewTracker, VisitorTracking, WebsiteAnalytics
 */

import { useEffect, useRef } from 'react'
import { trpc } from '@/trpc/react-provider'
import { getSessionTokenAny } from '@/lib/lead-session/client'

// ============================================================================
// TYPES
// ============================================================================

interface PageViewTrackerProps {
  /** Organization that owns the website being viewed */
  organizationId: string
  /** Database ID of the page being viewed */
  pageId: string
  /** URL pathname for this page (e.g., "/home", "/blog/post-123") */
  pathname: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** localStorage key for the anonymous visitor identifier */
const VISITOR_ID_KEY = 'mochi_visitor_id'

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate a random UUID without requiring crypto.randomUUID().
 *
 * WHY: crypto.randomUUID() requires a secure context (HTTPS). In local dev
 * on http://localhost it throws "crypto.randomUUID is not a function".
 * This fallback uses crypto.getRandomValues() which works on both HTTP and HTTPS.
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback: build a v4-style UUID from crypto.getRandomValues()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 1
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Retrieve an existing visitor ID from localStorage or generate a new one.
 *
 * WHY localStorage: We need a stable anonymous identifier that persists across
 * page loads and sessions so the server can count unique visitors accurately.
 */
function getOrCreateVisitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_ID_KEY)
    if (existing) return existing

    const newId = generateUUID()
    localStorage.setItem(VISITOR_ID_KEY, newId)
    return newId
  } catch {
    // Safari private browsing or storage quota exceeded — fall back to a
    // session-only UUID so tracking still works for this page load
    return generateUUID()
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Silent page view tracker rendered on every published website page.
 *
 * Fires the pageView.track mutation exactly once on mount, then does nothing.
 * The mutation is fire-and-forget: failures are caught silently because a
 * missed analytics event should never degrade the visitor experience.
 */
export function PageViewTracker({
  organizationId,
  pageId,
  pathname,
}: PageViewTrackerProps) {
  // Prevent double-fire caused by React StrictMode unmount/remount in dev
  const hasFiredRef = useRef(false)

  const trackMutation = trpc.pageView.track.useMutation()

  useEffect(() => {
    if (hasFiredRef.current) return
    hasFiredRef.current = true

    const visitorId = getOrCreateVisitorId()
    const params = new URLSearchParams(window.location.search)

    // Read the lead session token directly from cookie/localStorage.
    // We do NOT use the useLeadSession hook here because:
    // 1. It creates a duplicate async validation query with race conditions
    // 2. The server should resolve the leadId from the token (more secure, no timing issues)
    // 3. getSessionTokenAny() is synchronous — reads from cookie then falls back to localStorage
    const sessionToken = getSessionTokenAny()

    console.log('[PageViewTracker] Firing page view:', {
      organizationId,
      pageId,
      pathname,
      sessionToken: sessionToken ? 'PRESENT' : 'NONE',
      visitorId,
      utmSource: params.get('utm_source') ?? 'none',
    })

    // Fire-and-forget: we intentionally do NOT await or chain on this.
    // Errors are caught silently so analytics never blocks page interaction.
    trackMutation.mutate(
      {
        organizationId,
        pageId,
        visitorId,
        pathname,
        sessionToken: sessionToken ?? undefined,
        utmSource: params.get('utm_source') ?? undefined,
        utmMedium: params.get('utm_medium') ?? undefined,
        utmCampaign: params.get('utm_campaign') ?? undefined,
        referrer: document.referrer || undefined,
      },
      {
        onSuccess: (data) => {
          console.log('[PageViewTracker] Server response:', data)
        },
        onError: (err) => {
          console.error('[PageViewTracker] Error:', err.message)
        },
      }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally fire once on mount
  }, [])

  // This component exists purely for its side-effect; it renders nothing
  return null
}
