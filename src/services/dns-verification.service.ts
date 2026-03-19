/**
 * DNS VERIFICATION SERVICE
 *
 * Handles DNS verification for custom domains.
 * Used to verify that users have correctly configured their DNS settings
 * to point their custom domain to the Mochi platform.
 *
 * DNS SETUP OPTIONS FOR USERS:
 * ============================
 * Option 1 (Recommended): CNAME Record
 * - Type: CNAME
 * - Name: @ or www (depending on their domain setup)
 * - Value: {ROOT_DOMAIN} (e.g., mochidev.net)
 *
 * Option 2: A Record
 * - Type: A
 * - Name: @ (for root domain) or subdomain name
 * - Value: Server IP address
 *
 * VERIFICATION PROCESS:
 * ====================
 * 1. User adds custom domain to their website domain
 * 2. System generates DNS records user needs to configure
 * 3. User adds records in their DNS provider (Cloudflare, GoDaddy, etc.)
 * 4. User clicks "Verify" to check DNS propagation
 * 5. System performs DNS lookup to verify configuration
 * 6. If verified, isVerified is set to true
 */

import 'server-only'
import { Resolver } from 'dns'
import { promisify } from 'util'

/**
 * Custom DNS resolver that uses Google and Cloudflare public DNS servers
 * WHY: The system's default DNS resolver can be slow or return stale/cached results
 * (especially ISP resolvers). Public DNS servers are faster and more reliable
 * for verifying freshly added DNS records.
 */
const resolver = new Resolver()
resolver.setServers([
  '8.8.8.8',  // Google Public DNS (primary)
  '1.1.1.1',  // Cloudflare DNS (fastest, privacy-focused)
  '8.8.4.4',  // Google Public DNS (secondary/fallback)
])

/** Promisified DNS methods bound to our custom resolver */
const dns = {
  resolveCname: promisify(resolver.resolveCname.bind(resolver)),
  resolveTxt: promisify(resolver.resolveTxt.bind(resolver)),
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * DNS Record type that users need to add
 * SOURCE OF TRUTH: DnsRecord, DnsRecordType, DnsVerificationStatus
 */
export type DnsRecordType = 'A' | 'CNAME' | 'TXT'

export type DnsRecord = {
  type: DnsRecordType
  name: string
  value: string
  ttl: string
  priority?: number
  status: 'pending' | 'verified' | 'failed'
  description: string
}

export type DnsVerificationResult = {
  verified: boolean
  records: DnsRecord[]
  message: string
  checkedAt: Date
}

export type DnsInstructions = {
  domain: string
  records: DnsRecord[]
  instructions: string[]
  verificationTxtValue: string
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Platform configuration for DNS verification
 *
 * WHY: Only CNAME verification - no server IP exposed for security
 * HOW: Users point their domain to our root domain via CNAME
 */
const PLATFORM_CONFIG = {
  // The root domain of the platform (used for CNAME records)
  rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'mochidev.net',
  // TXT record prefix for ownership verification
  txtPrefix: '_mochi-verification',
}

// ============================================================================
// DNS RECORD GENERATION
// ============================================================================

/**
 * Generate DNS records that user needs to add for their custom domain
 *
 * WHY: Users need clear instructions on what DNS records to configure
 * HOW: Returns CNAME record pointing to our platform root domain
 *
 * SECURITY: We only use CNAME - no server IP exposed
 *
 * @param customDomain - The custom domain (e.g., "courses.example.com")
 * @param domainId - The domain ID (used for TXT verification value)
 * @returns DNS instructions with records to add
 */
export function generateDnsInstructions(
  customDomain: string,
  domainId: string
): DnsInstructions {
  // Remove protocol if present and clean the domain
  const cleanDomain = customDomain
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .toLowerCase()

  // Check if it's a subdomain (has more than one dot, e.g., app.example.com)
  const parts = cleanDomain.split('.')
  const isSubdomain = parts.length > 2
  const recordName = isSubdomain ? parts[0] : '@'

  // Generate a unique TXT verification value
  const verificationTxtValue = `mochi-verify=${domainId}`

  const records: DnsRecord[] = []

  // CNAME Record - the only option we provide (secure, no IP exposure)
  records.push({
    type: 'CNAME',
    name: recordName,
    value: PLATFORM_CONFIG.rootDomain,
    ttl: '3600',
    status: 'pending',
    description: `Points ${cleanDomain} to Mochi`,
  })

  // TXT Record for ownership verification (REQUIRED for security)
  records.push({
    type: 'TXT',
    name: PLATFORM_CONFIG.txtPrefix,
    value: verificationTxtValue,
    ttl: '3600',
    status: 'pending',
    description: 'Ownership verification (required)',
  })

  const instructions = [
    `Add these DNS records to your domain provider:`,
    ``,
    `1. CNAME Record (points traffic to Mochi):`,
    `   Type: CNAME`,
    `   Name: ${recordName === '@' ? '@ (or leave empty for root)' : recordName}`,
    `   Value: ${PLATFORM_CONFIG.rootDomain}`,
    ``,
    `2. TXT Record (proves ownership):`,
    `   Type: TXT`,
    `   Name: ${PLATFORM_CONFIG.txtPrefix}`,
    `   Value: ${verificationTxtValue}`,
    ``,
    `Note: Both records are required. DNS changes can take up to 48 hours to propagate.`,
  ]

  return {
    domain: cleanDomain,
    records,
    instructions,
    verificationTxtValue,
  }
}

// ============================================================================
// DNS VERIFICATION
// ============================================================================

/**
 * Verify if a custom domain is correctly configured
 *
 * WHY: Confirms that the user has set up their DNS correctly
 * HOW: Performs DNS lookup to check CNAME record points to our platform
 *
 * SECURITY: Only checks CNAME - no server IP involved
 *
 * @param customDomain - The custom domain to verify (e.g., "courses.example.com")
 * @param domainId - The domain ID for TXT verification
 * @returns Verification result with status for each record type
 */
export async function verifyCustomDomainDns(
  customDomain: string,
  domainId: string
): Promise<DnsVerificationResult> {
  // Clean the domain
  const cleanDomain = customDomain
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .toLowerCase()

  const expectedTxtValue = `mochi-verify=${domainId}`
  const records: DnsRecord[] = []

  // Check CNAME record - this is the main verification
  const cnameResult = await checkCnameRecord(cleanDomain)
  records.push({
    type: 'CNAME',
    name: '@',
    value: cnameResult.value || PLATFORM_CONFIG.rootDomain,
    ttl: '3600',
    status: cnameResult.verified ? 'verified' : 'pending',
    description: cnameResult.message,
  })

  // Check TXT record for ownership verification (optional)
  const txtResult = await checkTxtRecord(cleanDomain, expectedTxtValue)
  records.push({
    type: 'TXT',
    name: PLATFORM_CONFIG.txtPrefix,
    value: expectedTxtValue,
    ttl: '3600',
    status: txtResult.verified ? 'verified' : 'pending',
    description: txtResult.message,
  })

  // Domain is verified if BOTH CNAME points to us AND TXT ownership is verified
  // SECURITY: TXT verification proves domain ownership - only the actual owner
  // can add TXT records to their DNS. This prevents domain hijacking.
  const isVerified = cnameResult.verified && txtResult.verified

  let verificationMessage: string
  if (isVerified) {
    verificationMessage = `Domain ${cleanDomain} is verified and pointing to Mochi.`
  } else if (cnameResult.verified && !txtResult.verified) {
    verificationMessage = `CNAME is correct but TXT ownership verification is missing. Add the TXT record to prove domain ownership.`
  } else if (!cnameResult.verified && txtResult.verified) {
    verificationMessage = `TXT verified but CNAME is not pointing to Mochi. Please add the CNAME record.`
  } else {
    verificationMessage = `Please add both CNAME and TXT records to verify domain ownership.`
  }

  return {
    verified: isVerified,
    records,
    message: verificationMessage,
    checkedAt: new Date(),
  }
}

/**
 * Check if CNAME record points to our platform
 */
async function checkCnameRecord(
  domain: string
): Promise<{ verified: boolean; value: string | null; message: string }> {
  try {
    const records = await dns.resolveCname(domain)

    if (records && records.length > 0) {
      const cnameTarget = records[0].toLowerCase()

      // Check if CNAME points to our root domain
      if (
        cnameTarget === PLATFORM_CONFIG.rootDomain ||
        cnameTarget.endsWith(`.${PLATFORM_CONFIG.rootDomain}`)
      ) {
        return {
          verified: true,
          value: cnameTarget,
          message: `CNAME correctly points to ${cnameTarget}`,
        }
      }

      return {
        verified: false,
        value: cnameTarget,
        message: `CNAME points to ${cnameTarget}, expected ${PLATFORM_CONFIG.rootDomain}`,
      }
    }

    return {
      verified: false,
      value: null,
      message: 'No CNAME record found',
    }
  } catch (error) {
    // ENODATA or ENOTFOUND means no record exists
    return {
      verified: false,
      value: null,
      message: 'No CNAME record found',
    }
  }
}

/**
 * Check if TXT record exists for ownership verification
 */
async function checkTxtRecord(
  domain: string,
  expectedValue: string
): Promise<{ verified: boolean; value: string | null; message: string }> {
  try {
    // Check both the subdomain and root domain for TXT records
    const txtDomain = `${PLATFORM_CONFIG.txtPrefix}.${domain}`

    const records = await dns.resolveTxt(txtDomain)

    if (records && records.length > 0) {
      // TXT records are returned as arrays of strings
      const flatRecords = records.flat()
      const foundValue = flatRecords.find((r) => r === expectedValue)

      if (foundValue) {
        return {
          verified: true,
          value: foundValue,
          message: 'Ownership verification TXT record found',
        }
      }

      return {
        verified: false,
        value: flatRecords.join(', '),
        message: `TXT record found but value doesn't match. Expected: ${expectedValue}`,
      }
    }

    return {
      verified: false,
      value: null,
      message: 'TXT ownership record not found. Add TXT record to verify ownership.',
    }
  } catch (error) {
    return {
      verified: false,
      value: null,
      message: 'TXT ownership record not found. Add TXT record to verify ownership.',
    }
  }
}

/**
 * Quick check if domain resolves to our platform
 *
 * WHY: Fast verification without detailed record analysis
 * HOW: Checks if CNAME points to our root domain
 *
 * @param customDomain - The custom domain to check
 * @returns true if domain CNAME points to our platform
 */
export async function isDomainPointingToUs(customDomain: string): Promise<boolean> {
  const cleanDomain = customDomain
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .toLowerCase()

  try {
    const cnameRecords = await dns.resolveCname(cleanDomain)
    if (cnameRecords && cnameRecords.length > 0) {
      const target = cnameRecords[0].toLowerCase()
      return (
        target === PLATFORM_CONFIG.rootDomain ||
        target.endsWith(`.${PLATFORM_CONFIG.rootDomain}`)
      )
    }
  } catch {
    // CNAME not found
  }

  return false
}
