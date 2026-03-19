/**
 * WEBHOOK URL VALIDATION — SSRF PROTECTION
 *
 * Validates URLs before making server-side HTTP requests to prevent
 * Server-Side Request Forgery (SSRF) attacks. Blocks requests to
 * internal networks, cloud metadata endpoints, and non-HTTP protocols.
 *
 * SOURCE OF TRUTH KEYWORDS: WebhookUrlValidation, SsrfProtection, UrlSafetyCheck
 */

import dns from 'dns/promises'

/** Result of a webhook URL validation check */
interface UrlValidationResult {
  safe: boolean
  reason?: string
}

/**
 * Blocked hostnames that should never be accessed by webhooks.
 * Includes localhost aliases and cloud provider metadata endpoints.
 */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
  'kubernetes.default.svc',
])

/**
 * Checks if an IPv4 address falls within a private/reserved range.
 * These ranges are non-routable and typically host internal services
 * that should not be reachable from user-controlled webhook URLs.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) return true

  const [a, b] = parts

  return (
    a === 0 || // 0.0.0.0/8 — current network
    a === 10 || // 10.0.0.0/8 — private
    a === 127 || // 127.0.0.0/8 — loopback
    (a === 169 && b === 254) || // 169.254.0.0/16 — link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 — private
    (a === 192 && b === 168) // 192.168.0.0/16 — private
  )
}

/**
 * Checks if an IPv6 address is private/reserved.
 * Covers loopback (::1), link-local (fe80::), and unique local (fd00::).
 */
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase()
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fe80') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fc')
  )
}

/**
 * Validates a webhook URL is safe to fetch from the server.
 * Prevents SSRF by blocking internal networks, metadata endpoints,
 * and non-HTTP protocols before the request is made.
 *
 * @param url - The URL string to validate
 * @returns Validation result with safe flag and optional rejection reason
 */
export async function validateWebhookUrl(
  url: string
): Promise<UrlValidationResult> {
  // Parse and validate the URL structure
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { safe: false, reason: 'Invalid URL format' }
  }

  // Only allow HTTP and HTTPS protocols — block file://, ftp://, gopher://, etc.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      safe: false,
      reason: `Protocol "${parsed.protocol}" is not allowed. Only http and https are permitted.`,
    }
  }

  // Block known internal/metadata hostnames
  const hostname = parsed.hostname.toLowerCase()
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return {
      safe: false,
      reason: `Hostname "${hostname}" is blocked for security reasons.`,
    }
  }

  // Resolve the hostname to IP addresses and check each one.
  // This prevents DNS rebinding attacks where a hostname resolves to an internal IP.
  try {
    const ipv4Addresses = await dns
      .resolve4(hostname)
      .catch(() => [] as string[])
    const ipv6Addresses = await dns
      .resolve6(hostname)
      .catch(() => [] as string[])

    const allAddresses = [...ipv4Addresses, ...ipv6Addresses]

    // If DNS resolution returns no results, the hostname may be an IP literal
    if (allAddresses.length === 0) {
      // Check if the hostname itself is an IP address
      if (isPrivateIPv4(hostname)) {
        return {
          safe: false,
          reason: 'Webhook URLs targeting private/internal IP addresses are not allowed.',
        }
      }
      if (isPrivateIPv6(hostname)) {
        return {
          safe: false,
          reason: 'Webhook URLs targeting private/internal IPv6 addresses are not allowed.',
        }
      }
    }

    // Check all resolved IPs — if any resolve to a private range, block it
    for (const ip of ipv4Addresses) {
      if (isPrivateIPv4(ip)) {
        return {
          safe: false,
          reason: `Hostname resolves to private IP address (${ip}). Webhook URLs must target public endpoints.`,
        }
      }
    }

    for (const ip of ipv6Addresses) {
      if (isPrivateIPv6(ip)) {
        return {
          safe: false,
          reason: `Hostname resolves to private IPv6 address (${ip}). Webhook URLs must target public endpoints.`,
        }
      }
    }
  } catch {
    // DNS resolution failed entirely — allow the request to proceed
    // and let fetch() handle the network error naturally.
    // This avoids blocking legitimate URLs when DNS is temporarily unavailable.
  }

  return { safe: true }
}
