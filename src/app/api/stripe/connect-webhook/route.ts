/**
 * ============================================================================
 * STRIPE CONNECT WEBHOOK — Live Connected Account Payments
 * ============================================================================
 *
 * This endpoint processes ALL live mode payment events from connected accounts.
 * Platform-level SaaS events and test mode payments go to /api/stripe/webhook.
 *
 * STRIPE API VERSION: 2025-10-29.clover
 *
 * EVENTS HANDLED:
 * - payment_intent.succeeded/failed — ONE_TIME payments
 * - invoice.paid/payment_failed — RECURRING and SPLIT_PAYMENT subscriptions
 * - charge.succeeded — Backfills missing charge IDs (race condition fix)
 * - charge.refunded — Refunds for all payment types
 * - charge.dispute.created — Chargebacks
 * - customer.subscription.deleted — Subscription cancellation
 * - account.updated — Connected account restriction/currency sync
 *
 * PAYMENT SOURCES COVERED:
 * Payment links, embedded payment forms, cart checkout, wallet top-ups, invoice payments
 *
 * METADATA RESILIENCE:
 * Uses 3-tier fallback from webhook-utils.ts for subscription metadata:
 * Tier 1: webhook payload → Tier 2: Stripe API → Tier 3: DB lookup
 * ============================================================================
 */

import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '@/lib/config'
import {
  isSubscriptionInvoice,
  resolveSubscriptionData,
  resolveInvoicePaymentIds,
  getCancellationReason,
} from '@/lib/stripe/webhook-utils'
import {
  completeTransaction,
  failTransaction,
  handleSubscriptionPayment,
  handleSubscriptionPaymentFailed,
  handleSubscriptionCanceled,
  handleChargeback,
  backfillChargeId,
} from '@/services/payment/payment-completion.service'
import { processRefund } from '@/services/payment/refund.service'
import { completeInvoicePayment, completeInvoiceSubscriptionPayment } from '@/services/invoice.service'
import { updateAccountRestrictionCache } from '@/services/stripe/standard-account.service'
import { findTransactionIdBySubscriptionId } from '@/services/transaction.service'

const LOG = '[connect-webhook]'

export async function POST(req: Request) {
  /** Runtime check — fail fast if the webhook secret is missing instead of crashing inside constructEvent */
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error(`${LOG} STRIPE_CONNECT_WEBHOOK_SECRET is not configured`)
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
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  /** Only process connected account events — platform events go elsewhere */
  if (!event.account) {
    return NextResponse.json({ received: true })
  }

  const connectedAccountId = event.account
  console.log(`${LOG} ${event.type} from account ${connectedAccountId}, eventId=${event.id}`)

  try {
    switch (event.type) {
      // ================================================================
      // ONE_TIME PAYMENTS
      // ================================================================

      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent

        /**
         * Existing: ONE_TIME payment link/form/cart payments.
         * Skip invoice payments — they're handled by the invoice block below
         * to avoid duplicate notifications.
         */
        if (pi.metadata?.transactionId && pi.metadata?.billingType === 'ONE_TIME' && pi.metadata?.source !== 'invoice_payment') {
          const latestCharge = pi.latest_charge
          const chargeId = typeof latestCharge === 'string' ? latestCharge : latestCharge?.id

          console.log(`${LOG} ONE_TIME payment succeeded: PI ${pi.id}, amount: ${pi.amount_received}`)

          /**
           * completeTransaction handles EVERYTHING for ONE_TIME payments:
           * - DB update (AWAITING_PAYMENT → PAID)
           * - TransactionPayment record
           * - Payment notification (ONE per checkout, not per product)
           * - Per-product automation triggers
           * - Order creation for cart checkouts
           * SOURCE OF TRUTH: OneNotificationPerCheckout
           */
          await completeTransaction(pi.id, pi.amount_received, chargeId)
        }

        /**
         * Invoice payments — complete Transaction + mark invoice PAID.
         * Identified by metadata.source === 'invoice_payment' set in createInvoiceCheckoutSession().
         * Transaction was already created by the unified checkout pipeline.
         * Notification fires inside completeInvoicePayment → completeTransaction path.
         */
        if (pi.metadata?.source === 'invoice_payment' && pi.metadata?.invoiceId) {
          const latestCharge = pi.latest_charge
          const chargeId = typeof latestCharge === 'string' ? latestCharge : latestCharge?.id

          console.log(`${LOG} Invoice payment succeeded: PI ${pi.id}, invoiceId: ${pi.metadata.invoiceId}, amount: ${pi.amount_received}`)
          await completeInvoicePayment(pi.id, pi.amount_received, chargeId, connectedAccountId)
        }

        break
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent

        if (pi.metadata?.transactionId && pi.metadata?.billingType === 'ONE_TIME') {
          console.log(`${LOG} ONE_TIME payment failed: PI ${pi.id}`)
          await failTransaction(pi.id, pi.last_payment_error?.message)
        }
        break
      }

      // ================================================================
      // RECURRING & SPLIT_PAYMENT (Subscriptions)
      // ================================================================

      case 'invoice.paid': {
        const webhookInvoice = event.data.object as Stripe.Invoice

        if (!isSubscriptionInvoice(webhookInvoice)) {
          console.log(`${LOG} invoice.paid: billing_reason=${webhookInvoice.billing_reason} — not a subscription, skipping`)
          break
        }

        console.log(`${LOG} invoice.paid: billing_reason=${webhookInvoice.billing_reason}, invoice=${webhookInvoice.id}`)

        /** Resolve subscription data with 3-tier fallback for renewal resilience */
        const subData = await resolveSubscriptionData(webhookInvoice, stripe, connectedAccountId, LOG)
        if (!subData || !webhookInvoice.id) {
          console.warn(`${LOG} invoice.paid: Could not resolve subscription data — skipping`)
          break
        }

        /** Retrieve expanded invoice to get charge and PaymentIntent IDs */
        const { paymentIntentId, chargeId } = await resolveInvoicePaymentIds(
          webhookInvoice.id,
          stripe,
          connectedAccountId,
          LOG
        )

        console.log(`${LOG} invoice.paid: sub=${subData.subscriptionId}, PI=${paymentIntentId}, charge=${chargeId}, amount=${webhookInvoice.amount_paid}`)

        /**
         * Pass resolved transactionId as fallback for trial-split subscriptions.
         * Trial-split subscriptions have their transactionId in Stripe metadata
         * but NOT in Transaction.stripeSubscriptionId (only the main sub is stored there).
         * SOURCE OF TRUTH: CartTrialSplitWebhookFallback
         */
        await handleSubscriptionPayment(
          subData.subscriptionId,
          webhookInvoice.id,
          paymentIntentId,
          webhookInvoice.amount_paid,
          chargeId,
          connectedAccountId,
          subData.transactionId,
          /** Pass billing_reason so handleSubscriptionPayment can distinguish
           * subscription_create (new sub, mixed cart) from subscription_cycle
           * (renewal/post-trial). Critical for TRIAL_STARTED trigger guard.
           * SOURCE OF TRUTH: BillingReasonTrialGuard */
          webhookInvoice.billing_reason ?? undefined
        )

        /**
         * INVOICE SUBSCRIPTION COMPLETION:
         * If this subscription was created from an invoice payment, also mark the
         * Mochi Invoice record as PAID. Uses subscriptionId to find the invoice —
         * if no invoice matches, it's a regular subscription payment and this no-ops.
         * The Transaction lifecycle was already handled by handleSubscriptionPayment above.
         * SOURCE OF TRUTH: InvoiceSubscriptionWebhookCompletion
         */
        try {
          await completeInvoiceSubscriptionPayment(subData.subscriptionId)
        } catch (err) {
          console.error(`${LOG} Failed to complete invoice subscription payment for sub ${subData.subscriptionId}:`, err)
        }

        /**
         * Payment notification is now fired INSIDE handleSubscriptionPayment()
         * (ONE per checkout, not per product). No notification call needed here.
         * SOURCE OF TRUTH: OneNotificationPerCheckout
         */

        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        if (!isSubscriptionInvoice(invoice)) break

        const failedSubData = await resolveSubscriptionData(invoice, stripe, connectedAccountId, LOG)
        if (!failedSubData) {
          console.warn(`${LOG} invoice.payment_failed: Could not resolve subscription data — skipping`)
          break
        }

        console.log(`${LOG} invoice.payment_failed: sub=${failedSubData.subscriptionId}`)
        await handleSubscriptionPaymentFailed(failedSubData.subscriptionId)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription

        /**
         * Check subscription metadata first, then fall back to DB lookup.
         * The subscription object in the webhook always includes its own metadata.
         */
        let transactionId: string | undefined = subscription.metadata?.transactionId

        if (!transactionId) {
          console.log(`${LOG} subscription.deleted: No transactionId in metadata, checking DB...`)
          const transaction = await findTransactionIdBySubscriptionId(subscription.id)
          transactionId = transaction?.id
        }

        if (transactionId) {
          /** Extract cancellation reason using shared helper from webhook-utils */
          const cancelReason = getCancellationReason(subscription)
          console.log(`${LOG} subscription.deleted: Canceling sub=${subscription.id}, reason=${cancelReason || 'none'}`)
          await handleSubscriptionCanceled(subscription.id, cancelReason)
        } else {
          console.log(`${LOG} subscription.deleted: No associated transaction for sub=${subscription.id} — skipping`)
        }
        break
      }

      // ================================================================
      // CHARGE EVENTS — Backfill, Refunds, Disputes
      // ================================================================

      case 'charge.succeeded': {
        /**
         * Backfill missing charge IDs from the invoice.paid race condition.
         * Stripe fires invoice.paid BEFORE the charge is attached to the PI.
         */
        const charge = event.data.object as Stripe.Charge & { invoice?: string | Stripe.Invoice | null }
        const invoiceId = typeof charge.invoice === 'string' ? charge.invoice : charge.invoice?.id

        if (invoiceId) {
          await backfillChargeId(invoiceId, charge.id)
        }
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge & { invoice?: string | Stripe.Invoice | null }
        const invoiceId = typeof charge.invoice === 'string' ? charge.invoice : charge.invoice?.id

        /** Retrieve expanded refunds (webhook payloads don't include them) */
        let latestRefund = charge.refunds?.data?.[0]

        if (!latestRefund) {
          const expandedCharge = await stripe.charges.retrieve(
            charge.id,
            { expand: ['refunds'] },
            { stripeAccount: connectedAccountId }
          )
          latestRefund = expandedCharge.refunds?.data?.[0]
        }

        if (!latestRefund) {
          console.warn(`${LOG} charge.refunded: No refund data for charge ${charge.id}`)
          break
        }

        console.log(`${LOG} charge.refunded: charge=${charge.id}, refund=${latestRefund.id}, amount=${latestRefund.amount}`)

        /**
         * Unified refund processing — processRefund handles all billing types.
         * Inventory increment only fires for ONE_TIME orders (transactions with items).
         */
        await processRefund(charge.id, latestRefund.id, latestRefund.amount, latestRefund.reason || undefined)
        break
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute
        const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id

        if (chargeId) {
          const charge = await stripe.charges.retrieve(chargeId, { stripeAccount: connectedAccountId })
          const paymentIntentId = typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : charge.payment_intent?.id

          if (paymentIntentId) {
            console.log(`${LOG} charge.dispute.created: PI=${paymentIntentId}, amount=${dispute.amount}`)
            await handleChargeback(paymentIntentId, dispute.amount, dispute.reason)
          }
        }
        break
      }

      // ================================================================
      // ACCOUNT STATUS
      // ================================================================

      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        await updateAccountRestrictionCache(account.id, {
          country: account.country,
          default_currency: account.default_currency,
          requirements: account.requirements,
        })
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error(`${LOG} Handler error for ${event.type}:`, err)
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }
}
