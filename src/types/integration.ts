/**
 * Integration Types
 * Response types for integration API endpoints
 */

/**
 * Supported integration types
 * - stripe-connect: Stripe Standard account integration (OAuth)
 * - mailchimp: Mailchimp email marketing (future)
 * - zapier: Zapier automation (future)
 */
export type IntegrationType = 'stripe-connect' | 'mailchimp' | 'zapier'

/**
 * Integration connection status
 * - connected: Integration is active
 * - disconnected: Integration is not connected
 */
export type IntegrationStatus = 'connected' | 'disconnected'

/**
 * Integration flow type
 * - hosted: Redirects to external hosted page
 * - embedded: Renders component inside modal
 */
export type IntegrationFlowType = 'hosted' | 'embedded'

/**
 * Integration with current connection status
 * Returned from GET /api/studio/integrations
 */
export interface Integration {
  /** Unique identifier for the integration */
  id: IntegrationType
  /** Display name of the integration */
  name: string
  /** Brief description of what the integration does */
  description: string
  /** Path to integration logo image */
  logo: string
  /** Current connection status */
  status: IntegrationStatus
  /** ISO timestamp when integration was connected */
  connectedAt?: string
  /** External account ID (e.g., Stripe account ID) */
  accountId?: string
  /** Flow configuration - determines if we use modal or redirect */
  flowType: IntegrationFlowType
}

