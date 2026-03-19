/**
 * Upsell Service
 *
 * Handles one-click upsell token generation and payment processing.
 * Extracted from payment-link.service.ts for separation of concerns.
 *
 * FLOW:
 * 1. After a successful payment, generateUpsellToken() creates an encrypted token
 *    containing the customer's payment method and Stripe references
 * 2. The token is passed via URL to the upsell page
 * 3. processUpsellPayment() decrypts the token and charges the customer's
 *    stored payment method without requiring re-entry of payment details
 *
 * SECURITY:
 * - Tokens are AES-256-GCM encrypted with a server-side secret
 * - Tokens expire in 15 minutes
 * - Payment method IDs are never exposed to the client
 * - Product ownership is validated server-side
 *
 * SOURCE OF TRUTH: UpsellService, OneClickUpsellTokenGeneration, OneClickUpsellCharge
 */

import 'server-only'
import { prisma, getStripeInstance } from '@/lib/config'
import { createUpsellToken, verifyUpsellToken, type UpsellTokenPayload } from '@/lib/upsell-token'
import {
  getStripeTransactionFee,
  calculatePlatformFeeCents,
  type PlanKey,
} from '@/lib/config/feature-gates'
import { getOrganizationTier } from '@/services/feature-gate.service'
import { checkAvailability } from '@/services/inventory.service'
import {
  getOrCreateStripeProduct,
  getOrCreateStripeTrialPrice,
} from '@/services/payment/stripe-resources.service'

/**
 * SOURCE OF TRUTH: GenerateUpsellToken, OneClickUpsellTokenGeneration
 *
 * Generate an encrypted upsell token after a successful payment.
 * Called by the client after payment confirmation, before redirecting
 * to the upsell page.
 *
 * FLOW:
 * 1. Look up the transaction to get Stripe customer ID and payment intent ID
 * 2. Retrieve the payment method from the Stripe PaymentIntent
 * 3. Create an encrypted token containing all info needed for the upsell charge
 * 4. Return the token string (safe to include in URL params)
 *
 * SECURITY:
 * - Token is AES-256-GCM encrypted — payment method ID is never exposed
 * - Token expires in 15 minutes
 * - Server-side secret used for encryption
 *
 * @param transactionId - The transaction ID from the original purchase
 * @param organizationId - The organization that owns the product (validated)
 * @returns The encrypted upsell token string
 */
export async function generateUpsellToken(
  transactionId: string,
  organizationId: string
): Promise<string> {
  /** Look up the transaction to get Stripe references */
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: {
      id: true,
      organizationId: true,
      stripeCustomerId: true,
      stripePaymentIntentId: true,
      stripeSubscriptionId: true,
      paymentStatus: true,
      metadata: true,
      leadId: true,
    },
  })

  if (!transaction) {
    throw new Error('Transaction not found')
  }

  if (transaction.organizationId !== organizationId) {
    throw new Error('Transaction does not belong to this organization')
  }

  /** Check if the original payment was in test mode (stored in metadata) */
  const metadata = transaction.metadata as Record<string, string> | null
  const testMode = metadata?.testMode === 'true' || false
  const stripeInstance = getStripeInstance(testMode)

  /** Get the organization's connected account ID */
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { stripeConnectedAccountId: true },
  })

  if (!organization?.stripeConnectedAccountId) {
    throw new Error('Organization has not connected Stripe')
  }

  if (!transaction.stripeCustomerId) {
    throw new Error('Transaction has no Stripe customer — cannot create upsell token')
  }

  /**
   * Get the payment method from the original payment.
   * For PaymentIntent-based payments, retrieve the payment method from the intent.
   * For subscription-based payments, retrieve from the subscription's default payment method.
   */
  let paymentMethodId: string | null = null

  if (transaction.stripePaymentIntentId) {
    const stripeOptions = testMode ? undefined : { stripeAccount: organization.stripeConnectedAccountId }
    const paymentIntent = await stripeInstance.paymentIntents.retrieve(
      transaction.stripePaymentIntentId,
      stripeOptions
    )
    paymentMethodId = typeof paymentIntent.payment_method === 'string'
      ? paymentIntent.payment_method
      : paymentIntent.payment_method?.id ?? null
  } else if (transaction.stripeSubscriptionId) {
    const stripeOptions = testMode ? undefined : { stripeAccount: organization.stripeConnectedAccountId }
    const subscription = await stripeInstance.subscriptions.retrieve(
      transaction.stripeSubscriptionId,
      stripeOptions
    )
    paymentMethodId = typeof subscription.default_payment_method === 'string'
      ? subscription.default_payment_method
      : subscription.default_payment_method?.id ?? null
  }

  if (!paymentMethodId) {
    throw new Error('Could not retrieve payment method from the original payment')
  }

  /** Create the encrypted upsell token */
  const token = createUpsellToken({
    stripeCustomerId: transaction.stripeCustomerId,
    stripePaymentMethodId: paymentMethodId,
    connectedAccountId: organization.stripeConnectedAccountId,
    organizationId,
    originalTransactionId: transactionId,
    leadId: transaction.leadId,
    testMode,
  })

  return token
}

/**
 * SOURCE OF TRUTH: ProcessUpsellPayment, OneClickUpsellCharge
 *
 * Process a one-click upsell payment using a previously generated upsell token.
 * This charges the customer's payment method for the upsell product without
 * requiring them to re-enter payment details.
 *
 * FLOW:
 * 1. Verify and decrypt the upsell token
 * 2. Validate the upsell product/price belongs to the organization
 * 3. Create a new PaymentIntent using the stored payment method
 * 4. Confirm the payment immediately (no customer interaction needed)
 * 5. Create a new Transaction record for the upsell
 *
 * SECURITY:
 * - Token is verified and decrypted server-side
 * - Token expiry is checked (15 minutes)
 * - Product ownership is validated
 * - Payment method is used directly from the encrypted token, never from client
 *
 * @param token - The encrypted upsell token from the URL
 * @param productId - The upsell product to charge for
 * @param priceId - The price tier of the upsell product
 * @returns Result with transactionId and payment status
 */
export async function processUpsellPayment(
  token: string,
  productId: string,
  priceId: string
): Promise<{
  success: boolean
  transactionId: string | null
  isTrial?: boolean
  error?: string
}> {
  /** Step 1: Verify and decrypt the upsell token */
  let payload: UpsellTokenPayload
  try {
    payload = verifyUpsellToken(token)
  } catch (err) {
    return {
      success: false,
      transactionId: null,
      error: err instanceof Error ? err.message : 'Invalid upsell token',
    }
  }

  const stripeInstance = getStripeInstance(payload.testMode)

  /** Step 2: Validate the upsell product/price belongs to the organization */
  const price = await prisma.productPrice.findUnique({
    where: { id: priceId },
    include: {
      product: {
        include: {
          organization: { select: { id: true } },
        },
      },
    },
  })

  if (!price) {
    return { success: false, transactionId: null, error: 'Upsell price not found' }
  }

  if (price.productId !== productId) {
    return { success: false, transactionId: null, error: 'Price does not belong to the specified product' }
  }

  if (price.product.organizationId !== payload.organizationId) {
    return { success: false, transactionId: null, error: 'Product does not belong to this organization' }
  }

  if (!price.active || price.deletedAt || !price.product.active || price.product.deletedAt) {
    return { success: false, transactionId: null, error: 'Product or price is not active' }
  }

  /** Only ONE_TIME billing is supported for upsells */
  if (price.billingType !== 'ONE_TIME') {
    return { success: false, transactionId: null, error: 'Upsell products must use one-time billing' }
  }

  // Stock validation — prevent overselling for upsell products
  const upsellAvailability = await checkAvailability(payload.organizationId, price.productId, 1)
  if (!upsellAvailability.available) {
    return { success: false, transactionId: null, error: `"${price.product.name}" is currently out of stock` }
  }

  /** Step 3: Get organization tier for platform fee calculation */
  const tierInfo = await getOrganizationTier(payload.organizationId)
  const tier = tierInfo.tier as PlanKey
  const feeConfig = getStripeTransactionFee(tier)
  const applicationFeeAmount = payload.testMode
    ? undefined
    : calculatePlatformFeeCents(price.amount, tier)

  /**
   * Step 3b: Trial upsell path — when the upsell price has trialDays configured,
   * create a subscription with trial_period_days and cancel_at_period_end instead
   * of an immediate PaymentIntent charge. The customer's saved payment method is
   * attached as default_payment_method so no additional interaction is needed.
   *
   * SOURCE OF TRUTH: UpsellTrialConversion, OneClickUpsellTrial
   */
  if (price.trialDays && price.trialDays > 0) {
    try {
      const effectiveAccountId = payload.testMode ? null : payload.connectedAccountId
      const stripeOptions = effectiveAccountId ? { stripeAccount: effectiveAccountId } : undefined

      /** Get or create Stripe product on the correct account */
      const stripeProductId = await getOrCreateStripeProduct(
        effectiveAccountId,
        price.product,
        stripeInstance
      )

      /** Create a monthly recurring price for the trial subscription */
      const stripePriceId = await getOrCreateStripeTrialPrice(
        effectiveAccountId,
        stripeProductId,
        {
          id: price.id,
          name: price.name,
          amount: price.amount,
          currency: price.currency,
        },
        stripeInstance
      )

      /**
       * Create Transaction record in live mode only.
       * SOURCE OF TRUTH: TransactionTrialFields
       * Upsell trial always has trialDays (we're inside the trialDays > 0 guard).
       */
      let transactionId = ''
      if (!payload.testMode) {
        const transaction = await prisma.transaction.create({
          data: {
            organizationId: payload.organizationId,
            /** Link to the lead from the original purchase for automation triggers */
            leadId: payload.leadId,
            originalAmount: price.amount,
            paidAmount: 0,
            refundedAmount: 0,
            currency: price.currency,
            billingType: 'ONE_TIME',
            paymentStatus: 'TRIALING',
            totalPayments: 1,
            successfulPayments: 0,
            stripeCustomerId: payload.stripeCustomerId,
            paymentLinkId: null,
            trialDays: price.trialDays,
            trialEndsAt: new Date(Date.now() + price.trialDays! * 24 * 60 * 60 * 1000),
            metadata: {
              source: 'one_click_upsell',
              originalTransactionId: payload.originalTransactionId,
              appliedTier: tier,
              isTrialConversion: 'true',
              trialDays: price.trialDays,
            },
            items: {
              create: {
                productId: price.productId,
                priceId: price.id,
                productName: price.product.name,
                productImage: price.product.imageUrl,
                priceName: price.name,
                quantity: 1,
                unitAmount: price.amount,
                totalAmount: price.amount,
                billingType: 'ONE_TIME',
              },
            },
          },
        })
        transactionId = transaction.id
      }

      /**
       * Create subscription with trial and the customer's existing payment method.
       * No user interaction needed — payment method is already saved from the original purchase.
       * cancel_at_period_end ensures auto-cancel after first charge post-trial.
       */
      const applicationFeePercent = payload.testMode ? undefined : Math.round(feeConfig.percentage * 10000) / 100
      const subscriptionParams: Parameters<typeof stripeInstance.subscriptions.create>[0] = {
        customer: payload.stripeCustomerId,
        items: [{ price: stripePriceId }],
        trial_period_days: price.trialDays,
        cancel_at_period_end: true,
        default_payment_method: payload.stripePaymentMethodId,
        metadata: {
          transactionId,
          priceId: price.id,
          productId: price.productId,
          organizationId: payload.organizationId,
          billingType: 'ONE_TIME',
          isTrialConversion: 'true',
          source: 'one_click_upsell',
          originalTransactionId: payload.originalTransactionId,
          /** Trial days in metadata for webhook to detect trial invoices */
          ...(price.trialDays && { trialDays: String(price.trialDays) }),
          ...(payload.testMode && {
            testMode: 'true',
            simulatedConnectedAccountId: payload.connectedAccountId,
            /** Test mode trigger data — leadId + product info for automation firing */
            ...(payload.leadId && { leadId: payload.leadId }),
            productName: price.product.name,
            priceName: price.name,
          }),
        },
      }

      if (applicationFeePercent) {
        subscriptionParams.application_fee_percent = applicationFeePercent
      }

      const subscription = await stripeInstance.subscriptions.create(subscriptionParams, stripeOptions)

      /** Link Transaction to Subscription — only in live mode */
      if (transactionId) {
        await prisma.transaction.update({
          where: { id: transactionId },
          data: { stripeSubscriptionId: subscription.id },
        })
      }

      return { success: true, transactionId: transactionId || null, isTrial: true }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Trial upsell subscription creation failed'
      return { success: false, transactionId: null, error: errorMessage }
    }
  }

  /** Step 4: Create a Transaction record (live mode only) — standard immediate charge path */
  let transactionId = ''
  if (!payload.testMode) {
    const transaction = await prisma.transaction.create({
      data: {
        organizationId: payload.organizationId,
        /** Link to the lead from the original purchase for automation triggers */
        leadId: payload.leadId,
        originalAmount: price.amount,
        paidAmount: 0,
        refundedAmount: 0,
        currency: price.currency,
        billingType: 'ONE_TIME',
        paymentStatus: 'AWAITING_PAYMENT',
        totalPayments: 1,
        successfulPayments: 0,
        stripeCustomerId: payload.stripeCustomerId,
        paymentLinkId: null,
        metadata: {
          source: 'one_click_upsell',
          originalTransactionId: payload.originalTransactionId,
          appliedTier: tier,
        },
        items: {
          create: {
            productId: price.productId,
            priceId: price.id,
            productName: price.product.name,
            productImage: price.product.imageUrl,
            priceName: price.name,
            quantity: 1,
            unitAmount: price.amount,
            totalAmount: price.amount,
            billingType: 'ONE_TIME',
          },
        },
      },
    })
    transactionId = transaction.id
  }

  /**
   * Step 5: Create and immediately confirm the PaymentIntent.
   * Using the customer's stored payment method for a seamless one-click charge.
   * off_session=true tells Stripe this is a merchant-initiated payment
   * using a previously saved payment method.
   */
  try {
    const paymentIntentParams: Parameters<typeof stripeInstance.paymentIntents.create>[0] = {
      amount: price.amount,
      currency: price.currency,
      customer: payload.stripeCustomerId,
      payment_method: payload.stripePaymentMethodId,
      description: `${price.product.name} - ${price.name} (one-click upsell)`,
      confirm: true,
      off_session: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
      metadata: {
        transactionId,
        priceId: price.id,
        productId: price.productId,
        organizationId: payload.organizationId,
        billingType: 'ONE_TIME',
        source: 'one_click_upsell',
        originalTransactionId: payload.originalTransactionId,
        ...(payload.testMode && {
          testMode: 'true',
          simulatedConnectedAccountId: payload.connectedAccountId,
          /** Test mode trigger data — leadId + product info for automation firing */
          ...(payload.leadId && { leadId: payload.leadId }),
          productName: price.product.name,
          priceName: price.name,
        }),
      },
    }

    if (applicationFeeAmount) {
      paymentIntentParams.application_fee_amount = applicationFeeAmount
    }

    const paymentIntent = payload.testMode
      ? await stripeInstance.paymentIntents.create(paymentIntentParams)
      : await stripeInstance.paymentIntents.create(paymentIntentParams, {
          stripeAccount: payload.connectedAccountId,
        })

    /** Link the PaymentIntent to the Transaction (live mode only) */
    if (transactionId) {
      await prisma.transaction.update({
        where: { id: transactionId },
        data: { stripePaymentIntentId: paymentIntent.id },
      })
    }

    /** Check if payment succeeded immediately */
    if (paymentIntent.status === 'succeeded') {
      return { success: true, transactionId: transactionId || null, isTrial: false }
    }

    /**
     * Payment requires additional action (e.g. 3DS challenge).
     * For off-session payments, this means the saved payment method
     * can't be charged automatically. Return an error.
     */
    return {
      success: false,
      transactionId: transactionId || null,
      error: 'Payment requires additional authentication. Please complete a manual purchase instead.',
    }
  } catch (err) {
    /** If the PaymentIntent failed, clean up the transaction if needed */
    const errorMessage = err instanceof Error ? err.message : 'Payment processing failed'

    if (transactionId) {
      await prisma.transaction.update({
        where: { id: transactionId },
        data: { paymentStatus: 'FAILED' },
      })
    }

    return {
      success: false,
      transactionId: transactionId || null,
      error: errorMessage,
    }
  }
}
