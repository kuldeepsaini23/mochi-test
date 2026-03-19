/**
 * ============================================================================
 * STRIPE WEBHOOK SHARED UTILITIES
 * ============================================================================
 *
 * SOURCE OF TRUTH: StripeWebhookHelpers, PaymentNotificationHelpers
 *
 * Shared helpers used by BOTH webhook endpoints:
 * - Platform webhook (/api/stripe/webhook) — platform SaaS + test mode payments
 * - Connect webhook (/api/stripe/connect-webhook) — live connected account payments
 *
 * WHY THIS FILE EXISTS:
 * Both webhooks need to extract the same data from Stripe objects (subscription IDs,
 * metadata, charge IDs, etc). Without this file, every helper was duplicated
 * with slightly different names. Now there's ONE source of truth.
 *
 * SECTIONS:
 * 1. Invoice Extraction — pull IDs and metadata from invoice webhook payloads
 * 2. Subscription Resolution — 3-tier fallback to resolve transactionId
 * 3. Charge Resolution — expand invoice/PI to get charge IDs
 * 4. Transaction Validation — check if metadata has a valid transactionId
 * 5. Payment Notifications — centralized notification + dashboard invalidation
 * ============================================================================
 */

import 'server-only'
import type Stripe from 'stripe'
import { notifyAllMembers } from '@/lib/notifications/send-notification'

/** Re-export test mode detection for convenience */
export { isTestModePayment } from '@/lib/stripe/test-mode'

// ============================================================================
// 1. INVOICE EXTRACTION HELPERS
// ============================================================================

/**
 * Stripe API 2025-10-29.clover invoice structure for subscription invoices.
 * The `parent.subscription_details` field contains subscription ID and metadata.
 *
 * SOURCE OF TRUTH: StripeInvoiceParentShape
 *
 * NOTE: We use a standalone type + cast instead of extending Stripe.Invoice
 * because Stripe's typed `parent` field conflicts with the actual webhook shape.
 */
type InvoiceWithParent = Stripe.Invoice & {
  parent?: {
    subscription_details?: {
      subscription?: string
      metadata?: Record<string, string>
    }
  } | null
}

/**
 * Extract subscription ID from a Stripe Invoice.
 * Uses API v2025-10-29.clover structure: parent.subscription_details.subscription
 *
 * NOTE: May return undefined for renewal invoices where the webhook payload is sparse.
 */
export function getSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  return (invoice as InvoiceWithParent).parent?.subscription_details?.subscription
}

/**
 * Extract subscription metadata from a Stripe Invoice.
 * Uses API v2025-10-29.clover structure: parent.subscription_details.metadata
 *
 * NOTE: Often returns undefined for renewal invoices — use resolveSubscriptionData()
 * for reliable metadata access.
 */
export function getSubscriptionMetadata(invoice: Stripe.Invoice): Record<string, string> | undefined {
  return (invoice as InvoiceWithParent).parent?.subscription_details?.metadata
}

/**
 * Extract PaymentIntent ID from a Stripe Invoice's expanded payments array.
 * Requires the invoice to be retrieved with expand: ['payments.data.payment.payment_intent']
 */
export function getPaymentIntentId(invoice: Stripe.Invoice): string | undefined {
  const firstPayment = invoice.payments?.data?.[0]
  if (!firstPayment) return undefined

  const pi = firstPayment.payment.payment_intent
  return typeof pi === 'string' ? pi : pi?.id
}

/**
 * Extract Charge ID from a Stripe Invoice's expanded payments array.
 * Requires the invoice to be retrieved with expand: ['payments.data.payment.charge']
 */
export function getChargeId(invoice: Stripe.Invoice): string | undefined {
  const firstPayment = invoice.payments?.data?.[0]
  if (!firstPayment) return undefined

  const charge = firstPayment.payment.charge
  return typeof charge === 'string' ? charge : charge?.id
}

/**
 * Check if an invoice is for a subscription payment (initial or renewal).
 * Returns false for manual invoices, one-off invoices, etc.
 */
export function isSubscriptionInvoice(invoice: Stripe.Invoice): boolean {
  return (
    invoice.billing_reason === 'subscription_create' ||
    invoice.billing_reason === 'subscription_cycle'
  )
}

// ============================================================================
// 2. SUBSCRIPTION DATA RESOLUTION (3-TIER FALLBACK)
// ============================================================================

/**
 * Resolved subscription data needed to process a payment.
 *
 * SOURCE OF TRUTH: ResolvedSubscriptionData
 */
export interface ResolvedSubscriptionData {
  subscriptionId: string
  transactionId: string
}

/**
 * Resolve subscription ID and transactionId with a 3-tier fallback chain.
 *
 * WHY: Stripe webhook payloads for renewal invoices (billing_reason: subscription_cycle)
 * often DON'T include parent.subscription_details.metadata. Without the transactionId,
 * we can't find the Transaction to update.
 *
 * TIER 1: Extract from webhook payload (fastest, works for initial invoices)
 * TIER 2: Fetch subscription from Stripe API (works when payload is sparse)
 * TIER 3: Look up transaction in DB by stripeSubscriptionId (ultimate fallback)
 *
 * @param invoice - The invoice from the webhook event
 * @param stripeInstance - Stripe SDK instance (live or test)
 * @param stripeAccount - Optional connected account ID for Stripe API calls
 * @param logPrefix - Log prefix for debugging (e.g. '[connect-webhook]' or '[platform-webhook]')
 */
export async function resolveSubscriptionData(
  invoice: Stripe.Invoice,
  stripeInstance: Stripe,
  stripeAccount: string | undefined,
  logPrefix: string
): Promise<ResolvedSubscriptionData | null> {
  const subscriptionId = getSubscriptionId(invoice)
  const webhookMetadata = getSubscriptionMetadata(invoice)

  /** Tier 1: Webhook payload metadata */
  if (subscriptionId && webhookMetadata?.transactionId) {
    console.log(`${logPrefix} Tier 1: Got metadata from webhook payload (sub: ${subscriptionId})`)
    return { subscriptionId, transactionId: webhookMetadata.transactionId }
  }

  if (!subscriptionId) {
    console.log(`${logPrefix} No subscription ID in webhook payload — skipping`)
    return null
  }

  /** Tier 2: Fetch subscription from Stripe API */
  try {
    console.log(`${logPrefix} Tier 2: Fetching subscription ${subscriptionId} from Stripe...`)
    const requestOptions: Stripe.RequestOptions | undefined = stripeAccount
      ? { stripeAccount }
      : undefined

    const subscription = await stripeInstance.subscriptions.retrieve(
      subscriptionId,
      undefined,
      requestOptions
    )

    if (subscription.metadata?.transactionId) {
      console.log(`${logPrefix} Tier 2: Got transactionId from Stripe subscription metadata`)
      return { subscriptionId, transactionId: subscription.metadata.transactionId }
    }
  } catch (err) {
    console.error(`${logPrefix} Tier 2: Failed to fetch subscription from Stripe:`, err)
  }

  /** Tier 3: Database lookup by stripeSubscriptionId */
  try {
    console.log(`${logPrefix} Tier 3: Looking up transaction by subscriptionId in DB...`)
    // Delegates to transaction.service.ts for database access (DAL pattern)
    const { findTransactionByStripeSubscriptionId } = await import('@/services/transaction.service')
    const transaction = await findTransactionByStripeSubscriptionId(subscriptionId)

    if (transaction) {
      console.log(`${logPrefix} Tier 3: Found transaction ${transaction.id} in DB`)
      return { subscriptionId, transactionId: transaction.id }
    }
  } catch (err) {
    console.error(`${logPrefix} Tier 3: Failed to look up transaction in DB:`, err)
  }

  console.warn(`${logPrefix} All tiers failed — could not resolve transactionId for subscription ${subscriptionId}`)
  return null
}

// ============================================================================
// 3. CHARGE RESOLUTION
// ============================================================================

/**
 * Resolve charge ID from an invoice by retrieving expanded payment data.
 *
 * WHY: Webhook payloads don't include expanded fields. We must re-retrieve the
 * invoice with payments expanded. If the charge is still missing (race condition
 * where invoice.paid fires before charge is attached), we fall back to expanding
 * PaymentIntent.latest_charge.
 *
 * @param invoiceId - The invoice ID to retrieve
 * @param stripeInstance - Stripe SDK instance (live or test)
 * @param stripeAccount - Optional connected account ID
 * @param logPrefix - Log prefix for debugging
 * @returns { invoice, paymentIntentId, chargeId } with the expanded invoice
 */
export async function resolveInvoicePaymentIds(
  invoiceId: string,
  stripeInstance: Stripe,
  stripeAccount: string | undefined,
  logPrefix: string
): Promise<{ invoice: Stripe.Invoice; paymentIntentId: string | undefined; chargeId: string | undefined }> {
  const requestOptions: Stripe.RequestOptions | undefined = stripeAccount
    ? { stripeAccount }
    : undefined

  /** Retrieve invoice with expanded payment data */
  const invoice = await stripeInstance.invoices.retrieve(
    invoiceId,
    { expand: ['payments.data.payment.payment_intent', 'payments.data.payment.charge'] },
    requestOptions
  )

  const paymentIntentId = getPaymentIntentId(invoice)
  let chargeId = getChargeId(invoice)

  /** Fallback: Expand PaymentIntent.latest_charge if charge not in invoice yet */
  if (!chargeId && paymentIntentId) {
    try {
      const pi = await stripeInstance.paymentIntents.retrieve(
        paymentIntentId,
        { expand: ['latest_charge'] },
        requestOptions
      )

      if (typeof pi.latest_charge === 'string') {
        chargeId = pi.latest_charge
      } else if (pi.latest_charge && typeof pi.latest_charge === 'object') {
        chargeId = pi.latest_charge.id
      }
    } catch {
      console.warn(`${logPrefix} Could not fetch charge from PI ${paymentIntentId} — charge.succeeded will backfill`)
    }
  }

  return { invoice, paymentIntentId, chargeId }
}

// ============================================================================
// 4. TRANSACTION VALIDATION
// ============================================================================

/**
 * Check if metadata contains a valid (non-empty) transactionId.
 *
 * Test mode payments may not create transaction records, so transactionId
 * can be empty. This helper determines whether we should attempt DB updates.
 */
export function hasValidTransactionId(metadata?: Record<string, string> | null): boolean {
  return Boolean(metadata?.transactionId && metadata.transactionId.length > 0)
}

// ============================================================================
// 5. CANCELLATION REASON EXTRACTION
// ============================================================================

/**
 * Safely extract the cancellation reason from a Stripe Subscription.
 *
 * WHY: Stripe's TypeScript types may not expose `cancellation_details` directly
 * on the Subscription object, but the field IS present in webhook payloads.
 * This helper centralizes the `as unknown as` cast so webhook handlers don't
 * need to duplicate it.
 *
 * SOURCE OF TRUTH: StripeCancellationReasonExtractor
 *
 * @param subscription - The Stripe Subscription from a webhook event
 * @returns The cancellation reason string, or undefined if not available
 */
export function getCancellationReason(subscription: Stripe.Subscription): string | undefined {
  const details = (subscription as unknown as { cancellation_details?: { reason?: string } }).cancellation_details
  return details?.reason
}

// ============================================================================
// 6. PAYMENT NOTIFICATION HELPERS
// ============================================================================

/**
 * Format a Stripe amount (in cents) as a human-readable currency string.
 * Uses en-US locale and ISO 4217 currency code (e.g., "usd" → "$99.00").
 *
 * WHY centralized: Both connect-webhook and platform-webhook need identical
 * formatting for payment notification bodies. Duplicating this logic is
 * fragile and error-prone.
 *
 * @param amountInCents - Stripe amount in the smallest currency unit
 * @param currency - ISO 4217 currency code from Stripe (always lowercase)
 * @returns Formatted currency string like "$99.00"
 */
export function formatPaymentAmount(amountInCents: number, currency: string): string {
  return (amountInCents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency,
  })
}

/**
 * Fire a payment-received notification to ALL members of an organization.
 *
 * WHY THIS IS THE SINGLE SOURCE OF TRUTH FOR PAYMENT NOTIFICATIONS:
 * Previously, each webhook file had its own copy of formatPaymentAmount +
 * firePaymentNotification. Now both webhooks call this ONE function.
 * Adding new notification features (sound, icon, deep-link) only needs
 * a change here — not in every webhook file.
 *
 * COVERAGE: This fires for ALL payment types from ALL sources:
 * - ONE_TIME payments (payment links, embedded forms, cart)
 * - RECURRING subscription payments (initial + renewals)
 * - SPLIT_PAYMENT installments
 * - Invoice payments
 * - Test mode payments (all of the above)
 *
 * WHY fire-and-forget: Notification delivery must NEVER block or break the
 * payment processing pipeline. If notifications fail (DB down, realtime error,
 * push service unavailable), the payment itself has already been recorded.
 *
 * WHAT THIS TRIGGERS DOWNSTREAM:
 * 1. DB notification record created (notification.service.ts)
 * 2. Upstash realtime event emitted → client-side toast + cha-ching sound
 * 3. Dashboard cache invalidation (revenue charts, transactions, orders)
 * 4. Web push notification to all subscribed PWA devices
 *
 * @param organizationId - The org whose members should be notified
 * @param amount - Formatted currency string (e.g., "$99.00")
 * @param customerName - Optional customer/lead name for the notification body
 * @param logPrefix - Log prefix for error messages (e.g., '[connect-webhook]')
 */
export function firePaymentNotification(
  organizationId: string,
  amount: string,
  customerName?: string,
  logPrefix = '[webhook]'
): void {
  const body = customerName
    ? `${amount} from ${customerName}`
    : `${amount} payment received`

  /** DEBUG: Track every notification call with a stack trace to find the duplicate source */
  const callStack = new Error().stack
  console.log(`🔔 [NOTIF-DEBUG] firePaymentNotification CALLED — org=${organizationId}, amount=${amount}, customer=${customerName}`)
  console.log(`🔔 [NOTIF-DEBUG] Call stack:\n${callStack}`)

  /**
   * Fire-and-forget: catch errors so notification failures never propagate
   * up to the webhook handler and cause a 500 response to Stripe.
   */
  notifyAllMembers({
    organizationId,
    title: 'Payment received',
    body,
    category: 'payment',
    actionUrl: '/payments/transactions',
  }).catch((err) => {
    console.error(`${logPrefix} Failed to send payment notification for org ${organizationId}:`, err)
  })
}

/**
 * Re-export notification context resolution functions from the notification service.
 * These functions access Prisma (DB queries), so they MUST live in a service file.
 * Re-exported here for convenience so webhooks can import everything from one place.
 *
 * SOURCE OF TRUTH: notification.service.ts is the actual implementation.
 */
export {
  resolveTransactionNotificationData,
  resolveSubscriptionNotificationData,
  resolveLeadName,
} from '@/services/notification.service'

/**
 * Identifiers for resolving and firing a payment notification.
 * Pass whichever identifiers are available — the function resolves from the
 * best available source automatically.
 *
 * SOURCE OF TRUTH: PaymentNotificationIdentifiers
 *
 * RESOLUTION PRIORITY (first match wins):
 * 1. paymentIntentId — DB lookup via Transaction.stripePaymentIntentId (live ONE_TIME + invoice)
 * 2. subscriptionId  — DB lookup via Transaction.stripeSubscriptionId (live RECURRING/SPLIT)
 * 3. leadId + organizationId + currency — direct lead name lookup (test mode, no Transaction in DB)
 */
interface PaymentNotificationIdentifiers {
  /** Stripe PaymentIntent ID — available for ONE_TIME and invoice payments */
  paymentIntentId?: string
  /** Stripe Subscription ID — available for RECURRING and SPLIT_PAYMENT */
  subscriptionId?: string
  /** Lead ID from metadata — always available in test mode (leads exist in DB) */
  leadId?: string
  /** Organization ID from metadata — available in test mode */
  organizationId?: string
  /** ISO 4217 currency code — available in test mode from Stripe object */
  currency?: string
}

/**
 * Unified notification resolver + dispatcher for ALL payment webhooks.
 *
 * WHY THIS EXISTS:
 * Before this function, each webhook path (test ONE_TIME, test subscription,
 * live ONE_TIME, live subscription, invoice) had its own try/catch block that
 * resolved notification data differently and then called firePaymentNotification().
 * That was 5 nearly-identical blocks across 2 files. Now there's ONE call site
 * per payment event — pass the identifiers you have and this handles the rest.
 *
 * SOURCE OF TRUTH: UnifiedPaymentNotificationResolver
 *
 * HOW IT WORKS:
 * 1. Tries paymentIntentId → resolveTransactionNotificationData() (live ONE_TIME)
 * 2. Tries subscriptionId → resolveSubscriptionNotificationData() (live subscription)
 * 3. Falls back to leadId + organizationId + currency → resolveLeadName() (test mode)
 * 4. Formats amount and fires notification via firePaymentNotification()
 *
 * Fire-and-forget — errors are logged but never thrown. Notification failure
 * must NEVER break the payment processing pipeline.
 *
 * @param ids - Available identifiers (pass whichever the webhook has)
 * @param amountInCents - Stripe amount in smallest currency unit
 * @param logPrefix - Log prefix for error messages
 */
export async function resolveAndFirePaymentNotification(
  ids: PaymentNotificationIdentifiers,
  amountInCents: number,
  logPrefix = '[webhook]'
): Promise<void> {
  try {
    const {
      resolveTransactionNotificationData: resolveTx,
      resolveSubscriptionNotificationData: resolveSub,
      resolveLeadName: resolveLead,
    } = await import('@/services/notification.service')

    let orgId: string | undefined
    let currency: string | undefined
    let customerName: string | undefined

    /**
     * Priority 1: Resolve from Transaction via PaymentIntent ID.
     * Works for live ONE_TIME payments and invoice payments where
     * a Transaction record exists in the DB.
     */
    if (ids.paymentIntentId) {
      const data = await resolveTx(ids.paymentIntentId)
      if (data) {
        orgId = data.organizationId
        currency = data.currency
        customerName = data.customerName
      }
    }

    /**
     * Priority 2: Resolve from Transaction via Subscription ID.
     * Works for live RECURRING and SPLIT_PAYMENT where a Transaction
     * record is linked by stripeSubscriptionId.
     */
    if (!orgId && ids.subscriptionId) {
      const data = await resolveSub(ids.subscriptionId)
      if (data) {
        orgId = data.organizationId
        currency = data.currency
        customerName = data.customerName
      }
    }

    /**
     * Priority 3: Test mode fallback — no Transaction records exist.
     * Use leadId for customer name, orgId and currency from metadata.
     */
    if (!orgId && ids.leadId && ids.organizationId && ids.currency) {
      orgId = ids.organizationId
      currency = ids.currency
      customerName = await resolveLead(ids.leadId)
    }

    /** If we couldn't resolve orgId from any source, we can't send a notification */
    if (!orgId || !currency) {
      console.warn(`${logPrefix} Could not resolve notification context — skipping notification`)
      return
    }

    const formattedAmount = formatPaymentAmount(amountInCents, currency)
    firePaymentNotification(orgId, formattedAmount, customerName, logPrefix)
  } catch (err) {
    console.error(`${logPrefix} Error in resolveAndFirePaymentNotification:`, err)
  }
}
