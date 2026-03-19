/**
 * ============================================================================
 * STRIPE PLATFORM WEBHOOK — SaaS Events + Test Mode Payments
 * ============================================================================
 *
 * This endpoint handles TWO completely separated categories of events:
 *
 * SECTION 1 — TEST MODE CONNECTED ACCOUNT PAYMENTS
 *   Payments from website builder, payment links, embedded forms, and cart
 *   checkout when testMode is enabled. These charge the PLATFORM's test Stripe
 *   account (no connected account). Detected via metadata.testMode === 'true'.
 *   Handled first, returns early if matched.
 *
 * SECTION 2 — PLATFORM SaaS SUBSCRIPTION LIFECYCLE
 *   Organization creation, plan changes, billing failures, cancellations for
 *   the Mochi platform itself. These events NEVER have testMode metadata.
 *
 * Live mode connected account payments go to /api/stripe/connect-webhook.
 *
 * ROUTING LOGIC:
 * 1. Verify signature, skip connected account events
 * 2. Check if event is a test mode payment → handleTestModeEvent() → early return
 * 3. If not test mode → fall through to SaaS switch (zero test mode checks)
 * ============================================================================
 */

import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe, getStripeInstance } from '@/lib/config'
import {
  isTestModePayment,
  isSubscriptionInvoice,
  getSubscriptionId,
  getSubscriptionMetadata,
  resolveAndFirePaymentNotification,
  getCancellationReason,
} from '@/lib/stripe/webhook-utils'
import {
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleCheckoutCompleted,
  handleTrialWillEnd,
  handleInvoicePaymentSucceeded,
  handleInvoicePaymentFailed,
} from '@/services/stripe-webhook.service'
import {
  fireTestModePaymentTriggers,
  decodeTriggerItemsFromMetadata,
  classifySubscriptionEvent,
  dispatchSubscriptionTriggers,
  fireSubscriptionCancelledTriggers,
} from '@/services/payment/payment-triggers.service'
import { updateAccountRestrictionCache } from '@/services/stripe/standard-account.service'

const LOG = '[platform-webhook]'

// ============================================================================
// POST HANDLER
// ============================================================================

export async function POST(req: Request) {
  /** Runtime check — fail fast if the webhook secret is missing instead of crashing inside constructEvent */
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error(`${LOG} STRIPE_WEBHOOK_SECRET is not configured`)
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  const body = await req.text()
  const headersList = await headers()
  const signature = headersList.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    // Log the detailed error server-side; never expose webhook internals to the client
    console.error('[Stripe Webhook] Signature verification failed:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: 'Invalid webhook signature' },
      { status: 400 }
    )
  }

  /** Skip connected account events — those go to /api/stripe/connect-webhook */
  if (event.account) {
    return NextResponse.json({ received: true })
  }

  console.log(`${LOG} ${event.type}, eventId=${event.id}`)

  try {
    // ==================================================================
    // SECTION 1: TEST MODE CONNECTED ACCOUNT PAYMENTS
    // ==================================================================
    // Detect test mode via metadata and handle all test payment events.
    // If handled, returns early — SaaS section below never sees these.
    // ==================================================================

    const testModeHandled = await handleTestModeEvent(event)
    if (testModeHandled) {
      return NextResponse.json({ received: true })
    }

    // ==================================================================
    // SECTION 2: PLATFORM SaaS SUBSCRIPTION LIFECYCLE
    // ==================================================================
    // Everything below is ONLY platform SaaS events.
    // Zero test mode checks — that's fully handled above.
    // ==================================================================

    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event.data.object as Stripe.Subscription)
        break

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice)
        break

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
        break

      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break

      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        await updateAccountRestrictionCache(account.id, {
          requirements: account.requirements,
        })
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error(`${LOG} Handler error for ${event.type}:`, err)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}

// ============================================================================
// TEST MODE EVENT HANDLER
// ============================================================================

/**
 * Handle test mode connected account payment events.
 *
 * Test mode payments are identified by metadata.testMode === 'true'.
 * They come from payment links, embedded forms, cart checkout, and any
 * other payment source when testMode is enabled in the website builder.
 *
 * TEST MODE BEHAVIOR (NO DB RECORDS):
 * - No Transaction, TransactionItem, TransactionPayment, or Order records exist
 * - Trigger data (productId, priceId, leadId, etc.) is encoded in Stripe metadata
 * - Automation triggers fire directly from metadata via fireTestModePaymentTriggers()
 * - Single-item payments: metadata has productId, priceId, productName, priceName, leadId
 * - Cart payments: metadata has triggerItems (compact JSON) + leadId
 *
 * @returns true if the event was a test mode event (handled), false if not
 */
async function handleTestModeEvent(event: Stripe.Event): Promise<boolean> {
  const stripeTest = getStripeInstance(true)

  switch (event.type) {
    // ----------------------------------------------------------------
    // ONE_TIME test mode payments (PaymentIntent-based)
    // ----------------------------------------------------------------

    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent
      if (!isTestModePayment(pi)) return false

      const md = pi.metadata ?? {}
      console.log(`${LOG} [test] PI succeeded: ${pi.id}, billingType=${md.billingType}, leadId=${md.leadId}, amount=${pi.amount_received}`)

      /**
       * Fire automation triggers directly from PI metadata.
       * No DB operations — test mode has no Transaction records.
       *
       * Two paths:
       * 1. Cart checkout: metadata has triggerItems (compact JSON of multiple items)
       * 2. Single-item: metadata has individual productId, priceId, productName, priceName
       */
      if (md.leadId && md.organizationId) {
        const items = decodeTriggerItemsFromMetadata(md)
          ?? (md.productId && md.priceId
            ? [{
                productId: md.productId,
                priceId: md.priceId,
                productName: md.productName || '',
                priceName: md.priceName || '',
                billingType: md.billingType || 'ONE_TIME',
              }]
            : [])

        if (items.length > 0) {
          console.log(`${LOG} [test] Firing ${items.length} trigger(s) from PI metadata`)
          await fireTestModePaymentTriggers({
            organizationId: md.organizationId,
            leadId: md.leadId,
            items,
            amount: pi.amount_received,
            currency: pi.currency,
            paymentLinkId: md.paymentLinkId,
          })
          console.log(`${LOG} [test] PI triggers done`)
        }

        /**
         * PAYMENT NOTIFICATION (Test Mode): Unified resolver handles lead name
         * lookup and notification dispatch. In test mode, leads exist in DB but
         * Transaction records do NOT — so leadId/orgId/currency path is used.
         */
        await resolveAndFirePaymentNotification(
          { leadId: md.leadId, organizationId: md.organizationId, currency: pi.currency },
          pi.amount_received,
          LOG
        )
      } else {
        console.log(`${LOG} [test] PI succeeded but no trigger data: leadId=${md.leadId}, orgId=${md.organizationId}`)
      }
      return true
    }

    case 'payment_intent.payment_failed': {
      const pi = event.data.object as Stripe.PaymentIntent
      if (!isTestModePayment(pi)) return false
      /** No DB to update in test mode — just acknowledge */
      console.log(`${LOG} [test] PI failed: ${pi.id} (no DB update in test mode)`)
      return true
    }

    // ----------------------------------------------------------------
    // RECURRING / SPLIT_PAYMENT test mode subscription invoices
    // ----------------------------------------------------------------

    case 'invoice.paid': {
      const webhookInvoice = event.data.object as Stripe.Invoice
      const isSub = isSubscriptionInvoice(webhookInvoice)
      const isTest = isTestModeInvoice(webhookInvoice)
      console.log(`${LOG} [test-check] invoice.paid: billing_reason=${webhookInvoice.billing_reason}, isSub=${isSub}, isTest=${isTest}`)

      if (!isSub || !isTest) return false

      /**
       * For subscription invoices, trigger data lives in the SUBSCRIPTION metadata.
       * Retrieve the subscription to get leadId, productId/priceId or triggerItems.
       */
      const subscriptionId = getSubscriptionId(webhookInvoice)
      if (!subscriptionId) {
        console.log(`${LOG} [test] invoice.paid — no subscription ID in payload, skipping`)
        return true
      }

      /** Fetch subscription to get full metadata */
      let subMetadata: Record<string, string> = {}
      try {
        const subscription = await stripeTest.subscriptions.retrieve(subscriptionId)
        subMetadata = subscription.metadata ?? {}
      } catch (err) {
        console.error(`${LOG} [test] Failed to fetch subscription ${subscriptionId}:`, err)
        return true
      }

      console.log(`${LOG} [test] invoice.paid subMetadata: leadId=${subMetadata.leadId}, orgId=${subMetadata.organizationId}, billing_reason=${webhookInvoice.billing_reason}`)

      if (subMetadata.leadId && subMetadata.organizationId) {
        const items = decodeTriggerItemsFromMetadata(subMetadata)
          ?? (subMetadata.productId && subMetadata.priceId
            ? [{
                productId: subMetadata.productId,
                priceId: subMetadata.priceId,
                productName: subMetadata.productName || '',
                priceName: subMetadata.priceName || '',
                billingType: subMetadata.billingType || 'RECURRING',
              }]
            : [])

        if (items.length > 0) {
          /**
           * SHARED CLASSIFICATION + DISPATCH: Use the same classify → dispatch pipeline
           * as live mode. Construct a virtual transaction from metadata so the dispatcher
           * works identically — no duplicated boolean logic.
           * SOURCE OF TRUTH: SubscriptionEventType, PaymentTriggerClassification
           */
          const trialDays = subMetadata.trialDays ? parseInt(subMetadata.trialDays, 10) : null
          const eventType = classifySubscriptionEvent(
            webhookInvoice.amount_paid,
            trialDays,
            0, // test mode doesn't track successfulPayments — always 0
            webhookInvoice.billing_reason ?? undefined
          )

          /** Build a virtual transaction from metadata for the shared dispatcher */
          const virtualTransaction = {
            id: 'test-mode',
            organizationId: subMetadata.organizationId,
            leadId: subMetadata.leadId,
            currency: webhookInvoice.currency,
            trialDays,
            trialEndsAt: trialDays ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000) : null,
            paymentLinkId: subMetadata.paymentLinkId || null,
            successfulPayments: 0,
            items,
          }

          console.log(`${LOG} [test] Event: ${eventType}, items=${items.length}`)
          await dispatchSubscriptionTriggers(eventType, virtualTransaction, webhookInvoice.amount_paid, 1)
          console.log(`${LOG} [test] Subscription triggers done`)
        }

        /**
         * PAYMENT NOTIFICATION (Test Mode): Unified resolver handles lead name
         * lookup and notification dispatch for subscription payments.
         */
        await resolveAndFirePaymentNotification(
          { leadId: subMetadata.leadId, organizationId: subMetadata.organizationId, currency: webhookInvoice.currency },
          webhookInvoice.amount_paid,
          LOG
        )
      } else {
        console.log(`${LOG} [test] invoice.paid — no trigger data in subscription metadata`)
      }

      /**
       * SPLIT PAYMENT COMPLETION (Test Mode):
       * Cancel the subscription after the last installment to prevent extra charges.
       * In test mode there are no DB records, so we count paid invoices on the
       * subscription and compare against totalInstallments from metadata.
       */
      if (subMetadata.billingType === 'SPLIT_PAYMENT' && subMetadata.totalInstallments) {
        const totalInstallments = Number(subMetadata.totalInstallments)
        const invoices = await stripeTest.invoices.list({
          subscription: subscriptionId,
          status: 'paid',
          limit: totalInstallments + 1,
        })
        const paidCount = invoices.data.length

        if (paidCount >= totalInstallments) {
          try {
            await stripeTest.subscriptions.cancel(subscriptionId)
            console.log(`${LOG} [test] Canceled split payment subscription ${subscriptionId} after ${paidCount}/${totalInstallments} installments`)
          } catch (cancelErr) {
            console.error(`${LOG} [test] Failed to cancel split payment subscription ${subscriptionId}:`, cancelErr)
          }
        }
      }

      return true
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      if (!isSubscriptionInvoice(invoice) || !isTestModeInvoice(invoice)) return false
      /** No DB to update in test mode — just acknowledge */
      console.log(`${LOG} [test] Subscription payment failed (no DB update in test mode)`)
      return true
    }

    // ----------------------------------------------------------------
    // Test mode subscription canceled
    // ----------------------------------------------------------------

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      if (!isTestModePayment(subscription)) return false

      /**
       * No DB to update in test mode, but fire SUBSCRIPTION_CANCELLED triggers
       * using the shared fireSubscriptionCancelledTriggers() function.
       * Construct a virtual transaction from metadata — same pattern as invoice.paid.
       * SOURCE OF TRUTH: SubscriptionCancelledAutomationTrigger
       */
      const cancelMeta = subscription.metadata
      console.log(`${LOG} [test] Subscription canceled: sub=${subscription.id}, orgId=${cancelMeta?.organizationId}, leadId=${cancelMeta?.leadId}`)

      const cancelItems = cancelMeta ? decodeTriggerItemsFromMetadata(cancelMeta) : null
      if (cancelMeta?.leadId && cancelMeta?.organizationId && cancelItems) {
        /** Extract cancellation reason using shared helper from webhook-utils */
        const cancelReason = getCancellationReason(subscription)

        await fireSubscriptionCancelledTriggers(
          {
            id: 'test-mode',
            organizationId: cancelMeta.organizationId,
            leadId: cancelMeta.leadId,
            currency: cancelMeta.currency || 'usd',
            items: cancelItems.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              priceId: item.priceId,
              priceName: item.priceName,
            })),
          },
          cancelReason
        )
      }

      return true
    }

    default:
      return false
  }
}

// ============================================================================
// INTERNAL HELPER
// ============================================================================

/**
 * Check if an invoice is a test mode invoice by examining subscription metadata.
 * Uses the shared getSubscriptionMetadata helper to extract from the webhook payload.
 */
function isTestModeInvoice(invoice: Stripe.Invoice): boolean {
  const metadata = getSubscriptionMetadata(invoice)
  return metadata?.testMode === 'true'
}
