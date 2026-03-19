/**
 * Integration Definitions
 * Configuration for all supported integrations
 */

import type {
  IntegrationType,
  IntegrationFlowType,
} from '@/types/integration'

/**
 * Integration definition with configuration and permissions
 */
export interface IntegrationDefinition {
  /** Unique identifier for the integration */
  id: IntegrationType
  /** Display name of the integration */
  name: string
  /** Brief description of what the integration does */
  description: string
  /** Path to integration logo image (relative to /public) */
  logo: string
  /** List of benefits/features for the integration */
  benefits: string[]
  /** Required permissions to manage this integration */
  requiredPermissions: string[]
  /** Flow configuration for connection (hosted or embedded) */
  flowType: IntegrationFlowType
}

/**
 * Stripe Connect Integration (Studio)
 * For connecting Standard accounts via OAuth
 */
export const STRIPE_CONNECT_INTEGRATION: IntegrationDefinition = {
  id: 'stripe-connect',
  name: 'Stripe',
  description:
    'Connect your Stripe account to receive payments and manage transactions directly.',
  logo: '/integrations/stripe-logo.png',
  benefits: [
    'Accept payments directly to your Stripe account',
    'Full access to Stripe Dashboard',
    'You control fraud and dispute management',
    'Platform fee: 0-10% per transaction (varies by tier)',
  ],
  requiredPermissions: ['integrations:read', 'integrations:update'],
  // Hosted flow - redirects to Stripe OAuth
  flowType: 'hosted',
}

/**
 * All Available Integrations - Extensible
 */
export const AVAILABLE_INTEGRATIONS: IntegrationDefinition[] = [
  STRIPE_CONNECT_INTEGRATION,
  // Future integrations can be added here
]

/**
 * Get integration by ID
 * @param id - Integration type identifier
 * @returns Integration definition or undefined if not found
 */
export function getIntegrationById(
  id: IntegrationType
): IntegrationDefinition | undefined {
  return AVAILABLE_INTEGRATIONS.find((integration) => integration.id === id)
}
