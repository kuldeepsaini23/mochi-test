/**
 * ============================================================================
 * STRIPE TEST MODE UTILITIES
 * ============================================================================
 *
 * SOURCE OF TRUTH: StripeTestModeArchitecture
 *
 * Centralized utilities for handling Stripe test mode across ALL payment flows:
 * - Website builder payment elements
 * - Payment links (/pay/[code])
 * - Invoices
 * - Any future payment integrations
 *
 * WHY TEST MODE EXISTS:
 * Stripe Connect OAuth is mode-specific. Connected accounts authorized in live
 * mode can't be accessed with test API keys. This creates a problem for testing
 * payment flows without real money.
 *
 * SOLUTION:
 * In test mode, we bypass the connected account entirely and charge the
 * PLATFORM'S test Stripe account. Metadata identifies the payment as a test
 * payment and which organization it belongs to, allowing webhooks to route
 * events correctly.
 *
 * LIVE MODE: Platform → Connected Account (direct charge with application_fee)
 * TEST MODE: Platform Test Account (no connected account, no application_fee)
 *
 * ============================================================================
 */

import 'server-only'
import type Stripe from 'stripe'

// ============================================================================
// TYPES
// ============================================================================

/**
 * SOURCE OF TRUTH: TestModeMetadata
 *
 * Metadata added to test mode payments for webhook routing.
 * These fields identify a payment as test mode and provide context
 * for proper handling.
 */
export interface TestModeMetadata {
  /** Indicates this is a test mode payment */
  testMode: 'true'
  /** The connected account that WOULD have been used in live mode */
  simulatedConnectedAccountId: string
}

/**
 * SOURCE OF TRUTH: TestModePaymentOptions
 *
 * Options for creating a test mode payment.
 */
export interface TestModePaymentOptions {
  /** Whether test mode is enabled */
  testMode?: boolean
  /** The connected account ID (used in live mode, stored in metadata for test mode) */
  connectedAccountId: string
}

/**
 * Result of preparing Stripe options for a payment.
 */
export interface StripePaymentConfig {
  /** Stripe request options (includes stripeAccount for live mode) */
  stripeOptions: Stripe.RequestOptions | undefined
  /** Metadata to add to the payment */
  metadata: Record<string, string>
  /** Whether to include application fee (false in test mode) */
  includeApplicationFee: boolean
  /** Effective account ID for customer/product creation (null in test mode) */
  effectiveAccountId: string | null
}

// ============================================================================
// CORE UTILITIES
// ============================================================================

/**
 * Prepare Stripe configuration for a payment based on test mode.
 *
 * This is the SINGLE SOURCE OF TRUTH for test mode payment configuration.
 * All payment functions should use this to get the correct configuration.
 *
 * @param options - Test mode options including testMode flag and connectedAccountId
 * @param baseMetadata - Additional metadata to include with the payment
 * @returns Configuration for Stripe API calls
 *
 * @example
 * ```typescript
 * const config = getStripePaymentConfig({
 *   testMode: true,
 *   connectedAccountId: 'acct_123'
 * }, { transactionId: 'txn_456' })
 *
 * // Use config.stripeOptions for Stripe API calls
 * // Use config.metadata for payment metadata
 * // Check config.includeApplicationFee before adding fees
 * ```
 */
export function getStripePaymentConfig(
  options: TestModePaymentOptions,
  baseMetadata: Record<string, string> = {}
): StripePaymentConfig {
  const { testMode, connectedAccountId } = options

  if (testMode) {
    // TEST MODE: No connected account, add test metadata
    return {
      stripeOptions: undefined, // No stripeAccount - use platform
      metadata: {
        ...baseMetadata,
        testMode: 'true',
        simulatedConnectedAccountId: connectedAccountId,
      },
      includeApplicationFee: false, // No fees in test mode
      effectiveAccountId: null, // Create resources on platform account
    }
  }

  // LIVE MODE: Use connected account with standard flow
  return {
    stripeOptions: { stripeAccount: connectedAccountId },
    metadata: baseMetadata,
    includeApplicationFee: true,
    effectiveAccountId: connectedAccountId,
  }
}

/**
 * Check if a payment object is a test mode payment.
 *
 * Works with any Stripe object that has metadata (PaymentIntent, Subscription,
 * Invoice, Charge, etc.)
 *
 * @param obj - Stripe object with metadata
 * @returns True if this is a test mode payment
 */
export function isTestModePayment(obj: { metadata?: Record<string, string> | null }): boolean {
  return obj.metadata?.testMode === 'true'
}

/**
 * Get the simulated connected account ID from test mode metadata.
 *
 * In test mode, the actual connected account ID is stored in metadata
 * as `simulatedConnectedAccountId` for webhook routing purposes.
 *
 * @param obj - Stripe object with metadata
 * @returns The simulated connected account ID, or undefined if not a test payment
 */
export function getSimulatedConnectedAccountId(
  obj: { metadata?: Record<string, string> | null }
): string | undefined {
  return obj.metadata?.simulatedConnectedAccountId
}

/**
 * Build metadata object for a payment, including test mode fields if applicable.
 *
 * @param testMode - Whether test mode is enabled
 * @param connectedAccountId - The connected account ID
 * @param additionalMetadata - Additional metadata to include
 * @returns Complete metadata object
 */
export function buildPaymentMetadata(
  testMode: boolean | undefined,
  connectedAccountId: string,
  additionalMetadata: Record<string, string>
): Record<string, string> {
  const metadata = { ...additionalMetadata }

  if (testMode) {
    metadata.testMode = 'true'
    metadata.simulatedConnectedAccountId = connectedAccountId
  }

  return metadata
}

// ============================================================================
// STRIPE OPTIONS HELPERS
// ============================================================================

/**
 * Get Stripe request options for connected account operations.
 *
 * @param connectedAccountId - The connected account ID, or null for platform
 * @returns Stripe request options or undefined
 */
export function getConnectedAccountOptions(
  connectedAccountId: string | null
): Stripe.RequestOptions | undefined {
  return connectedAccountId ? { stripeAccount: connectedAccountId } : undefined
}

/**
 * Get the effective account ID for resource creation.
 *
 * In test mode, resources (customers, products, prices) are created on the
 * platform account instead of the connected account.
 *
 * @param testMode - Whether test mode is enabled
 * @param connectedAccountId - The connected account ID
 * @returns The account ID to use, or null for platform account
 */
export function getEffectiveAccountId(
  testMode: boolean | undefined,
  connectedAccountId: string
): string | null {
  return testMode ? null : connectedAccountId
}
