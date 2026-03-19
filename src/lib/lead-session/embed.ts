/**
 * Lead Session Embed Utilities
 *
 * Handles lead session management for embedded contexts (iframes, external websites).
 * Provides cross-origin support where cookies may be blocked.
 *
 * SOURCE OF TRUTH KEYWORDS: LeadSessionEmbed, StickyFormEmbed
 *
 * CROSS-ORIGIN STRATEGY:
 * 1. Try cookies first (works if same-site or allowed)
 * 2. Fall back to localStorage (works within same origin)
 * 3. Use postMessage for parent-iframe communication
 */

import {
  LEAD_SESSION_COOKIE_NAME,
  getSessionToken,
  setSessionToken,
  getSessionTokenFromStorage,
  setSessionTokenInStorage,
} from './client'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Message types for postMessage communication
 */
export type LeadSessionMessageType =
  | 'MOCHI_LEAD_SESSION_REQUEST'
  | 'MOCHI_LEAD_SESSION_RESPONSE'
  | 'MOCHI_LEAD_SESSION_SET'
  | 'MOCHI_LEAD_SESSION_CLEAR'

/**
 * Message structure for postMessage communication
 */
export interface LeadSessionMessage {
  type: LeadSessionMessageType
  organizationId: string
  token?: string
  requestId?: string
}

// ============================================================================
// CONTEXT DETECTION
// ============================================================================

/**
 * Check if we're running inside an iframe
 *
 * WHY: Different behavior needed for embedded contexts
 * HOW: Compare window with parent
 */
export function isInIframe(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return window.self !== window.top
  } catch {
    // Cross-origin restriction - we're in an iframe
    return true
  }
}

/**
 * Check if cookies are likely to work
 *
 * WHY: Third-party cookies are often blocked
 * HOW: Try to set a test cookie and read it back
 */
export function areCookiesEnabled(): boolean {
  if (typeof document === 'undefined') {
    return false
  }

  try {
    // Try to set a test cookie
    const testKey = '__mochi_cookie_test__'
    document.cookie = `${testKey}=1; path=/; samesite=lax`

    // Check if it was set
    const cookieEnabled = document.cookie.includes(testKey)

    // Clean up
    document.cookie = `${testKey}=; max-age=0; path=/`

    return cookieEnabled
  } catch {
    return false
  }
}

// ============================================================================
// EMBED TOKEN MANAGEMENT
// ============================================================================

/**
 * Get session token with cross-origin fallback
 *
 * WHY: Provide single function that works in any context
 * HOW: Try multiple storage methods in order of preference
 *
 * Flow:
 * 1. Try cookie first (most reliable for same-origin)
 * 2. Fall back to localStorage
 *
 * @returns The session token or null if not found
 *
 * @example
 * ```ts
 * const token = getEmbedSessionToken()
 * if (token) {
 *   const validation = await trpc.leadSession.validate.query({
 *     organizationId,
 *     token,
 *   })
 * }
 * ```
 */
export function getEmbedSessionToken(): string | null {
  // Try cookie first
  const cookieToken = getSessionToken()
  if (cookieToken) {
    return cookieToken
  }

  // Fall back to localStorage
  const storageToken = getSessionTokenFromStorage()
  if (storageToken) {
    return storageToken
  }

  return null
}

/**
 * Set session token with cross-origin fallback
 *
 * WHY: Store token in all available storage for reliability
 * HOW: Set in cookie and localStorage
 *
 * @param token - The session token to store
 * @param domain - Optional domain for cookie
 *
 * @example
 * ```ts
 * const result = await trpc.leadSession.create.mutate({
 *   organizationId: 'org_xxx',
 *   email: 'user@example.com',
 * })
 *
 * if (result.success && result.token) {
 *   setEmbedSessionToken(result.token)
 * }
 * ```
 */
export function setEmbedSessionToken(token: string, domain?: string): void {
  // Always try to set cookie
  setSessionToken(token, { domain })

  // Always set in localStorage as fallback
  setSessionTokenInStorage(token)
}

/**
 * Clear session token from all storage
 */
export function clearEmbedSessionToken(domain?: string): void {
  // Clear cookie
  if (typeof document !== 'undefined') {
    const parts: string[] = [
      `${LEAD_SESSION_COOKIE_NAME}=`,
      'max-age=0',
      'expires=Thu, 01 Jan 1970 00:00:00 GMT',
      'path=/',
    ]

    if (domain) {
      parts.push(`domain=${domain}`)
    }

    document.cookie = parts.join('; ')
  }

  // Clear localStorage
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(LEAD_SESSION_COOKIE_NAME)
    } catch {
      // Ignore errors
    }
  }
}

// ============================================================================
// POSTMESSAGE COMMUNICATION
// ============================================================================

/**
 * Request session token from parent window
 *
 * WHY: When embedded in iframe, may need to get token from parent
 * HOW: Use postMessage to communicate with parent window
 *
 * @param organizationId - The organization ID for the request
 * @param timeout - Timeout in milliseconds (default: 3000)
 * @returns Promise that resolves to token or null
 *
 * @example
 * ```ts
 * // In embedded widget
 * const token = await requestTokenFromParent('org_xxx')
 * if (token) {
 *   setEmbedSessionToken(token)
 * }
 * ```
 */
export function requestTokenFromParent(
  organizationId: string,
  timeout = 3000
): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !isInIframe()) {
      resolve(null)
      return
    }

    const requestId = Math.random().toString(36).substring(2)

    // Set up listener for response
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as LeadSessionMessage
      if (
        data?.type === 'MOCHI_LEAD_SESSION_RESPONSE' &&
        data?.requestId === requestId &&
        data?.organizationId === organizationId
      ) {
        window.removeEventListener('message', handleMessage)
        resolve(data.token || null)
      }
    }

    window.addEventListener('message', handleMessage)

    // Send request to parent
    const message: LeadSessionMessage = {
      type: 'MOCHI_LEAD_SESSION_REQUEST',
      organizationId,
      requestId,
    }

    try {
      window.parent.postMessage(message, '*')
    } catch {
      window.removeEventListener('message', handleMessage)
      resolve(null)
      return
    }

    // Timeout
    setTimeout(() => {
      window.removeEventListener('message', handleMessage)
      resolve(null)
    }, timeout)
  })
}

/**
 * Send session token to parent window
 *
 * WHY: Share newly created token with parent window
 * HOW: Use postMessage to communicate with parent
 *
 * @param organizationId - The organization ID
 * @param token - The session token to send
 */
export function sendTokenToParent(
  organizationId: string,
  token: string
): void {
  if (typeof window === 'undefined' || !isInIframe()) {
    return
  }

  const message: LeadSessionMessage = {
    type: 'MOCHI_LEAD_SESSION_SET',
    organizationId,
    token,
  }

  try {
    window.parent.postMessage(message, '*')
  } catch {
    // Parent may not be accessible
  }
}

/**
 * Set up listener to respond to token requests from child iframes
 *
 * WHY: Parent window needs to share token with embedded widgets
 * HOW: Listen for postMessage requests and respond with token
 *
 * @param organizationId - The organization ID to respond for
 * @returns Cleanup function to remove listener
 *
 * @example
 * ```ts
 * // In parent page
 * useEffect(() => {
 *   const cleanup = setupParentTokenListener('org_xxx')
 *   return cleanup
 * }, [])
 * ```
 */
export function setupParentTokenListener(
  organizationId: string
): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handleMessage = (event: MessageEvent) => {
    const data = event.data as LeadSessionMessage

    // Handle token requests
    if (
      data?.type === 'MOCHI_LEAD_SESSION_REQUEST' &&
      data?.organizationId === organizationId
    ) {
      const token = getEmbedSessionToken()
      const response: LeadSessionMessage = {
        type: 'MOCHI_LEAD_SESSION_RESPONSE',
        organizationId,
        token: token || undefined,
        requestId: data.requestId,
      }

      // Send response back to the iframe
      if (event.source && typeof event.source.postMessage === 'function') {
        ;(event.source as Window).postMessage(response, '*')
      }
    }

    // Handle token updates from iframes
    if (
      data?.type === 'MOCHI_LEAD_SESSION_SET' &&
      data?.organizationId === organizationId &&
      data?.token
    ) {
      setEmbedSessionToken(data.token)
    }

    // Handle token clear from iframes
    if (
      data?.type === 'MOCHI_LEAD_SESSION_CLEAR' &&
      data?.organizationId === organizationId
    ) {
      clearEmbedSessionToken()
    }
  }

  window.addEventListener('message', handleMessage)

  return () => {
    window.removeEventListener('message', handleMessage)
  }
}
