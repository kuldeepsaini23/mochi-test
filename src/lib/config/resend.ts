/**
 * Resend Client Configuration
 *
 * WHY: Centralized Resend client for email sending and domain management
 * HOW: Single instance exported for use across services
 *
 * FEATURES AVAILABLE:
 * - emails.send() - Send transactional emails
 * - domains.create() - Add custom domain
 * - domains.verify() - Verify domain DNS records
 * - domains.get() - Get domain with DNS records
 * - domains.list() - List all domains
 * - domains.remove() - Delete domain
 *
 * ENV REQUIRED:
 * - RESEND_API_KEY: API key from Resend dashboard
 * - RESEND_FROM_EMAIL: Default sender for platform emails (optional)
 */

import { Resend } from 'resend'

/**
 * Resend API client instance (lazy initialization)
 *
 * WHY: Prevents client-side errors when this module is partially imported
 * HOW: Only creates Resend instance when actually needed on the server
 */
let _resendClient: Resend | null = null

function getResendClient(): Resend {
  if (!_resendClient) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is not set')
    }
    _resendClient = new Resend(process.env.RESEND_API_KEY)
  }
  return _resendClient
}

/**
 * Resend API client proxy
 * Lazy-loads the actual client only when methods are called
 */
export const resend = {
  emails: {
    send: (...args: Parameters<Resend['emails']['send']>) =>
      getResendClient().emails.send(...args),
  },
  domains: {
    create: (...args: Parameters<Resend['domains']['create']>) =>
      getResendClient().domains.create(...args),
    get: (...args: Parameters<Resend['domains']['get']>) =>
      getResendClient().domains.get(...args),
    verify: (...args: Parameters<Resend['domains']['verify']>) =>
      getResendClient().domains.verify(...args),
    remove: (...args: Parameters<Resend['domains']['remove']>) =>
      getResendClient().domains.remove(...args),
    list: () => getResendClient().domains.list(),
  },
}

/**
 * Default sender email for platform transactional emails
 * Used when no custom domain is configured
 *
 * Constructs full "Name <email>" format from:
 * - NEXT_PUBLIC_APP_NAME: The app/platform name
 * - RESEND_FROM_EMAIL: The verified sender email address
 */
const defaultFromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@resend.dev'
const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Mochi'
export const RESEND_DEFAULT_FROM = `${appName} <${defaultFromEmail}>`

/**
 * Available Resend regions for domain creation
 * Affects email delivery latency based on recipient location
 */
export const RESEND_REGIONS = [
  { value: 'us-east-1', label: 'US East (Virginia)' },
  { value: 'eu-west-1', label: 'Europe (Ireland)' },
  { value: 'sa-east-1', label: 'South America (São Paulo)' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
] as const

export type ResendRegion = (typeof RESEND_REGIONS)[number]['value']

/**
 * DNS Record type from Resend API
 * SOURCE OF TRUTH: Matches Resend API response structure
 */
export interface ResendDnsRecord {
  record: string // e.g., "SPF", "DKIM", "DKIM2", "DKIM3"
  name: string // DNS record name
  type: string // e.g., "TXT", "MX", "CNAME"
  ttl: string // Time to live
  status: 'pending' | 'verified' | 'failed' | 'not_started'
  value: string // DNS record value
  priority?: number // For MX records
}

/**
 * Domain status mapping from Resend to our enum
 * SOURCE OF TRUTH: Maps Resend API status to EmailDomainStatus enum
 */
export const mapResendStatusToEnum = (
  status: string
): 'NOT_STARTED' | 'PENDING' | 'VERIFIED' | 'FAILED' | 'TEMPORARY_FAILURE' => {
  switch (status) {
    case 'verified':
      return 'VERIFIED'
    case 'pending':
      return 'PENDING'
    case 'failed':
      return 'FAILED'
    case 'temporary_failure':
      return 'TEMPORARY_FAILURE'
    case 'not_started':
    default:
      return 'NOT_STARTED'
  }
}
