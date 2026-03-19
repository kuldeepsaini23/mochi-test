/**
 * PAYMENT ROUTER - Subscription Management
 *
 * Creates subscriptions via Stripe API with custom Elements
 * Custom Stripe webhook (/api/stripe/webhook) handles subscription events and database updates
 *
 * PERMISSIONS:
 * - Uses organizationProcedure for organization-scoped billing operations
 * - TypeScript IntelliSense shows all valid Permission values
 * - Format: 'resource:action' (e.g., 'billing:read', 'billing:update')
 */

import { createTRPCRouter, protectedProcedure, baseProcedure } from '../init'
import { organizationProcedure } from '../procedures/organization'
import { z } from 'zod'
import Stripe from 'stripe'
import { PLANS, stripe } from '@/lib/config'
import { TRPCError } from '@trpc/server'
import { createStudioOrganization } from '@/services/organization.service'
import { markUserOnboarded } from '@/services/stripe.service'
import { realtime } from '@/lib/realtime'

/**
 * Stripe instance imported from @/lib/config (Single Source of Truth).
 * Previously duplicated here — now uses the shared singleton from src/lib/config/stripe.ts
 * to ensure consistent API version and prevent multiple Stripe client instantiations.
 */

export const paymentRouter = createTRPCRouter({
  /**
   * Get user billing details for prepopulating forms
   */
  getUserBillingDetails: protectedProcedure.query(async ({ ctx }) => {
    const user = ctx.user

    return {
      email: user.email,
      name: user.name || '',
    }
  }),

  /**
   * Get payment methods for the current user's organization
   *
   * WHY NO PERMISSION REQUIRED:
   * - Payment method data is masked (only last 4 digits visible)
   * - Read-only operation - no modification possible
   * - The org is billed, not individual users
   * - All members should see existing payment methods to avoid adding duplicates
   * - This prevents double-charge scenarios where members can't see org's card
   *
   * Note: Modifying operations (add, delete, update) still require billing permissions
   */
  getPaymentMethods: organizationProcedure()
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const { getPaymentMethods } = await import('@/services/payment.service')
      return await getPaymentMethods(input.organizationId)
    }),

  /**
   * Set default payment method
   * Requires: billing:update permission
   */
  setDefaultPaymentMethod: organizationProcedure({ requirePermission: 'billing:update' })
    .input(
      z.object({
        organizationId: z.string(),
        paymentMethodId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { setDefaultPaymentMethod } = await import('@/services/payment.service')

      try {
        await setDefaultPaymentMethod(input.organizationId, input.paymentMethodId)
        return { success: true }
      } catch (error) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: error instanceof Error ? error.message : 'Failed to set default payment method',
        })
      }
    }),

  /**
   * Add new payment method
   * Requires: billing:create permission
   */
  addPaymentMethod: organizationProcedure({ requirePermission: 'billing:create' })
    .input(
      z.object({
        organizationId: z.string(),
        paymentMethodId: z.string(),
        setAsDefault: z.boolean().optional(),
        retryFailedPayment: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { addPaymentMethod } = await import('@/services/payment.service')

      try {
        await addPaymentMethod(
          input.organizationId,
          input.paymentMethodId,
          input.setAsDefault,
          input.retryFailedPayment
        )
        return { success: true }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to add payment method',
        })
      }
    }),

  /**
   * Delete payment method
   * Requires: billing:update permission
   */
  deletePaymentMethod: organizationProcedure({ requirePermission: 'billing:update' })
    .input(
      z.object({
        organizationId: z.string(),
        paymentMethodId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { deletePaymentMethod } = await import('@/services/payment.service')

      try {
        await deletePaymentMethod(input.organizationId, input.paymentMethodId)
        return { success: true }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to delete payment method',
        })
      }
    }),

  /**
   * Create subscription with payment method
   * 1. Creates Stripe customer
   * 2. Attaches payment method
   * 3. Creates subscription (with studioData in metadata)
   * 4. Stripe webhook (/api/stripe/webhook) creates organization + subscription record
   */
  createSubscription: protectedProcedure
    .input(
      z.object({
        planKey: z.string(),
        billingInterval: z.enum(['monthly', 'yearly']),
        paymentMethodId: z.string(),
        expectTrial: z.boolean().optional(), // Does the user expect a trial?
        studioData: z.object({
          studioName: z.string(),
          phoneNumber: z.string(),
          country: z.string(),
          address: z.string(),
          city: z.string(),
          state: z.string(),
          zipCode: z.string(),
          referralSource: z.string().optional(),
          role: z.string().optional(),
          teamSize: z.string().optional(),
          intendedUse: z.string().optional(),
          niche: z.string().optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user
      const { planKey, billingInterval, paymentMethodId, expectTrial, studioData } = input

      // Get plan configuration
      const plan = PLANS[planKey as keyof typeof PLANS]
      if (!plan) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid plan selected',
        })
      }

      // Check if this is a free plan (only 'free' plan key should skip subscription)
      const isFreePlan = planKey === 'free'

      // Get price ID from plan (free plan won't have one)
      const priceId = billingInterval === 'monthly' ? plan.stripe.monthly : plan.stripe.yearly

      // Free plan with PAYG: Setup payment method AND create organization
      // WHY: When NEXT_PUBLIC_ACCEPT_PAYMENT_FOR_FREE_PLAN=true, the frontend routes
      // free plan users through the payment flow (card form + progress modal).
      // The frontend expects a realtime 'onboarding.completed' event to complete the flow,
      // just like paid plans get from the Stripe webhook. So we must create the org here
      // and emit that event — otherwise the user gets stuck on "Creating your studio..." forever.
      if (isFreePlan) {
        try {
          // 1. Create Stripe customer for PAYG features
          const customer = await stripe.customers.create({
            email: user.email,
            name: user.name || undefined,
            metadata: {
              userId: user.id,
              planKey: 'free',
              studioData: JSON.stringify(studioData),
            },
          })

          // 2. Attach payment method to customer
          await stripe.paymentMethods.attach(paymentMethodId, {
            customer: customer.id,
          })

          // 3. Set as default payment method for future PAYG charges
          await stripe.customers.update(customer.id, {
            invoice_settings: {
              default_payment_method: paymentMethodId,
            },
          })

          // 4. Create organization (mirrors what the Stripe webhook does for paid plans)
          // This is the step that was missing — free plan payment flow never created the org
          const orgResult = await createStudioOrganization({
            userId: user.id,
            studioName: studioData.studioName,
            phoneNumber: studioData.phoneNumber,
            country: studioData.country,
            address: studioData.address,
            city: studioData.city,
            state: studioData.state,
            zipCode: studioData.zipCode,
            referralSource: studioData.referralSource,
            role: studioData.role,
            teamSize: studioData.teamSize,
            intendedUse: studioData.intendedUse,
            niche: studioData.niche,
          })

          // 5. Mark user as onboarded with Stripe customer ID (for PAYG billing)
          await markUserOnboarded(user.id, customer.id)

          // 6. Emit realtime event so frontend progress modal completes and redirects
          // This is the same event the Stripe webhook emits for paid plans
          await realtime.emit('onboarding.completed', {
            userId: user.id,
            organizationId: orgResult.organizationId,
            organizationName: studioData.studioName,
          })

          return {
            customerId: customer.id,
            status: 'free_plan_setup',
          }
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error instanceof Error ? error.message : 'Failed to setup free plan',
          })
        }
      }

      // Paid plan: Must have a price ID
      if (!priceId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `No price configured for ${planKey} plan with ${billingInterval} billing. Please contact support.`,
        })
      }

      try {
        // Check if user has used a free trial before (via any fingerprint on their account)
        const { hasUserUsedFreeTrial, storeCardFingerprint, hasUserAnyTrialUsedFingerprint } = await import('@/services/card-fingerprint.service')

        // Check if THIS user has used a trial before (not just this card)
        const userHasUsedTrial = await hasUserAnyTrialUsedFingerprint(user.id)

        // Also check if this specific card has been used for trial before
        const cardHasUsedTrial = await hasUserUsedFreeTrial(user.id, paymentMethodId)

        // Determine if we should apply trial
        // Only apply trial if: plan has trial AND user hasn't used trial before
        const shouldApplyTrial = plan.trialDays > 0 && !userHasUsedTrial && !cardHasUsedTrial

        // CRITICAL: If user expects a trial but shouldn't get one, throw error
        // This means frontend and backend are out of sync
        if (expectTrial && (userHasUsedTrial || cardHasUsedTrial)) {
          // Store the fingerprint for tracking
          await storeCardFingerprint(user.id, paymentMethodId, true)

          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'TRIAL_ALREADY_USED',
          })
        }

        // Step 1: Create or get Stripe customer
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.name || undefined,
          metadata: {
            userId: user.id,
            studioData: JSON.stringify(studioData),
          },
        })

        // Step 2: Attach payment method to customer
        await stripe.paymentMethods.attach(paymentMethodId, {
          customer: customer.id,
        })

        // Set as default payment method
        await stripe.customers.update(customer.id, {
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        })

        // Step 3: Create subscription with studioData in metadata
        // Better-auth webhook will create the organization on subscription.created
        const subscriptionParams: Stripe.SubscriptionCreateParams = {
          customer: customer.id,
          items: [{ price: priceId }],
          metadata: {
            userId: user.id,
            planKey,
            studioData: JSON.stringify(studioData),
          },
          payment_settings: {
            save_default_payment_method: 'on_subscription',
          },
          expand: ['latest_invoice.payment_intent'],
        }

        // Add trial period only if user is eligible
        if (shouldApplyTrial) {
          subscriptionParams.trial_period_days = plan.trialDays
          subscriptionParams.payment_behavior = 'default_incomplete'
          // Store fingerprint now (will be marked as trial used by webhook when trial starts)
          await storeCardFingerprint(user.id, paymentMethodId, false)
        } else if (plan.trialDays > 0) {
          // User ineligible for trial - charge immediately
          subscriptionParams.payment_behavior = 'error_if_incomplete'
          // Store fingerprint as trial already used
          await storeCardFingerprint(user.id, paymentMethodId, true)
        } else {
          // No trial on this plan at all - charge immediately
          subscriptionParams.payment_behavior = 'error_if_incomplete'
          await storeCardFingerprint(user.id, paymentMethodId, false)
        }

        const subscription = await stripe.subscriptions.create(subscriptionParams)

        // Stripe webhook will handle creating organization + subscription record in database
        return {
          subscriptionId: subscription.id,
          status: subscription.status,
        }
      } catch (error) {
        // Re-throw TRPCError as-is (like our TRIAL_ALREADY_USED error)
        if (error instanceof TRPCError) {
          throw error
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create subscription',
        })
      }
    }),

  /**
   * Get free trial history for an organization
   * Checks if the organization has ever used a free trial before
   * Used for free trial abuse prevention
   */
  getFreeTrialHistory: organizationProcedure()
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const { getFreeTrialHistory } = await import('@/services/payment.service')
      return await getFreeTrialHistory(input.organizationId)
    }),

  /**
   * Check if a user can use a free trial based on their payment method
   * Checks card fingerprint against all previously used fingerprints
   */
  checkFreeTrialEligibility: protectedProcedure
    .input(
      z.object({
        paymentMethodId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { hasUserUsedFreeTrial } = await import('@/services/card-fingerprint.service')

      const hasUsedTrial = await hasUserUsedFreeTrial(ctx.user.id, input.paymentMethodId)

      return {
        canUseTrial: !hasUsedTrial,
        hasUsedTrialBefore: hasUsedTrial,
      }
    }),

  /**
   * Check if the current user has any fingerprints marked as trial used
   * Used for quick lookups to determine if trial options should be shown
   */
  getUserTrialStatus: protectedProcedure.query(async ({ ctx }) => {
    const { hasUserAnyTrialUsedFingerprint } = await import('@/services/card-fingerprint.service')

    const hasUsedTrial = await hasUserAnyTrialUsedFingerprint(ctx.user.id)

    return {
      hasUsedTrialBefore: hasUsedTrial,
    }
  }),

  // ============================================================================
  // E-COMMERCE CART CHECKOUT
  // ============================================================================

  /**
   * Create a Stripe Checkout Session for e-commerce cart checkout.
   *
   * SOURCE OF TRUTH: CartCheckoutSession, EcommerceCheckout
   *
   * SUPPORTS MIXED CARTS:
   * - Subscriptions (RECURRING) + One-time purchases (ONE_TIME)
   * - When ANY item is recurring, uses Stripe's subscription mode
   * - One-time items in subscription mode are charged on the first invoice
   *
   * PUBLIC ENDPOINT: Uses baseProcedure (no auth required) because customers
   * checking out from a published e-commerce website won't be logged in.
   * The endpoint validates the organizationId and items exist in the database.
   */
  /**
   * Get organization's Stripe connected account ID for cart checkout.
   *
   * SOURCE OF TRUTH: CartCheckoutOrgInfo, CheckoutConnectedAccount
   *
   * PUBLIC ENDPOINT: Used by the checkout page to initialize Stripe Elements
   * with the correct connected account. Without this, Stripe API calls would
   * hit the platform account instead of the merchant's connected account,
   * causing "No such price" errors.
   *
   * Only returns the stripeConnectedAccountId — no sensitive data exposed.
   */
  getCheckoutOrgInfo: baseProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      const { getCheckoutOrgInfo } = await import('@/services/payment.service')
      return await getCheckoutOrgInfo(input.organizationId)
    }),

  /**
   * Pre-validate cart items before checkout and return full pricing metadata.
   *
   * SOURCE OF TRUTH: CartItemValidation, ValidateCartItemsQuery, ValidatedCartItem
   *
   * PUBLIC ENDPOINT: Uses baseProcedure because customers on published
   * websites are not authenticated users of the platform.
   *
   * Checks each cart item for:
   * - Price existence in DB (price_not_found)
   * - Product deletion status (product_deleted)
   * - Inventory availability (out_of_stock)
   *
   * Returns an array of validation results WITH pricing metadata so the
   * frontend can show inline errors AND sync source-of-truth pricing data
   * (product name, price, billing type, trial days, etc.) into the cart store.
   */
  validateCartItems: baseProcedure
    .input(
      z.object({
        organizationId: z.string(),
        items: z.array(
          z.object({
            stripePriceId: z.string(),
            quantity: z.number().int().positive(),
          })
        ),
      })
    )
    .query(async ({ input }) => {
      const { validateCartItems } = await import('@/services/payment/checkout.service')

      try {
        console.log(`[trpc:validateCartItems] START — org=${input.organizationId}, items=${input.items.length}`)
        const results = await validateCartItems(input.organizationId, input.items)
        console.log(`[trpc:validateCartItems] DONE — ${results.filter(r => !r.valid).length} invalid items`)
        return results
      } catch (error) {
        console.error(`[trpc:validateCartItems] ERROR:`, error instanceof Error ? error.message : error)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to validate cart items',
        })
      }
    }),

  /**
   * Create a cart checkout intent for embedded Payment Element.
   *
   * SOURCE OF TRUTH: CartCheckoutIntent, EcommercePaymentElement
   *
   * PUBLIC ENDPOINT: Uses baseProcedure because customers on published
   * websites are not authenticated users of the platform.
   *
   * Returns a clientSecret for use with Stripe Payment Element on the frontend.
   * Keeps the checkout flow on-site - no external redirects.
   *
   * MIXED CART SUPPORT:
   * - ONE_TIME only → Creates PaymentIntent
   * - Has RECURRING → Creates Subscription with one-time items as invoice items
   */
  createCartCheckoutSession: baseProcedure
    .input(
      z.object({
        organizationId: z.string(),
        items: z.array(
          z.object({
            stripePriceId: z.string(),
            quantity: z.number().int().positive(),
            billingType: z.enum(['ONE_TIME', 'RECURRING']),
            name: z.string(),
            priceInCents: z.number().int(),
            currency: z.string(),
          })
        ),
        customer: z.object({
          firstName: z.string(),
          lastName: z.string(),
          email: z.string().email(),
        }),
        testMode: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { createCartCheckoutSession } = await import('@/services/payment/checkout.service')

      try {
        console.log(`[trpc:cartCheckout] START — org=${input.organizationId}, items=${input.items.length}, testMode=${input.testMode}`)
        const result = await createCartCheckoutSession({
          organizationId: input.organizationId,
          items: input.items,
          customer: input.customer,
          // successUrl/cancelUrl no longer needed - we use embedded Payment Element
          successUrl: '',
          cancelUrl: '',
          testMode: input.testMode,
        })

        console.log(`[trpc:cartCheckout] SUCCESS — clientSecret=${result.clientSecret ? 'YES' : 'NO'}, type=${result.type}, checkoutSessionId=${result.checkoutSessionId ?? 'none'}`)

        /**
         * Return checkout result with checkoutSessionId for grouping related transactions.
         * In the new architecture, a mixed cart creates MULTIPLE Transactions linked by
         * checkoutSessionId. The primary transactionId is still returned for backward compat.
         *
         * SOURCE OF TRUTH: CartCheckoutResponse, CheckoutSessionGrouping
         */
        return {
          clientSecret: result.clientSecret,
          transactionId: result.transactionId,
          checkoutSessionId: result.checkoutSessionId ?? null,
          type: result.type,
          isTrial: result.isTrial,
          testMode: result.testMode,
          subscriptionId: 'subscriptionId' in result ? result.subscriptionId : undefined,
          paymentIntentId: 'paymentIntentId' in result ? result.paymentIntentId : undefined,
        }
      } catch (error) {
        console.error(`[trpc:cartCheckout] ERROR:`, error instanceof Error ? error.message : error)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create checkout intent',
        })
      }
    }),

  /**
   * Complete pending trial subscriptions after the main cart payment succeeds.
   * Called by the frontend after Stripe payment confirmation when the cart
   * contained items with different trial periods that needed separate subscriptions.
   *
   * PUBLIC ENDPOINT: Uses baseProcedure because customers on published
   * websites are not authenticated users of the platform.
   *
   * NEW ARCHITECTURE: Uses checkoutSessionId to find all pending trial transactions
   * from this checkout session, plus primarySubscriptionId to retrieve the saved
   * payment method from the completed Stripe subscription.
   *
   * SECURITY:
   * - Requires checkoutSessionId + primarySubscriptionId for validation
   * - Pending trial items read from server-stored transaction metadata (never from client)
   * - Payment method retrieved server-side from the completed subscription
   * - Replay prevention: pendingTrialItems cleared after processing
   *
   * SOURCE OF TRUTH: CartTrialSplit, CompleteTrialSubscriptions
   */
  completeTrialSubscriptions: baseProcedure
    .input(
      z.object({
        checkoutSessionId: z.string(),
        primarySubscriptionId: z.string(),
        organizationId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { completeTrialSubscriptions } = await import('@/services/payment/checkout.service')

      try {
        console.log(`[trpc:completeTrialSubs] START — session=${input.checkoutSessionId}, primarySub=${input.primarySubscriptionId}`)
        const result = await completeTrialSubscriptions(
          input.checkoutSessionId,
          input.primarySubscriptionId,
          input.organizationId
        )
        console.log(`[trpc:completeTrialSubs] SUCCESS — created ${result.trialSubscriptionIds.length} trial sub(s)`)
        return result
      } catch (error) {
        console.error(`[trpc:completeTrialSubs] ERROR:`, error instanceof Error ? error.message : error)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create trial subscriptions',
        })
      }
    }),

  /**
   * Cancel subscription at period end
   * Sets cancel_at_period_end to true, subscription remains active until period ends
   */
  cancelSubscription: organizationProcedure({ requirePermission: 'billing:update' })
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ input }) => {
      const { getOrganizationSubscription, updateSubscriptionCancelFlag } =
        await import('@/services/payment.service')

      try {
        // Get organization's active subscription
        const subscription = await getOrganizationSubscription(
          input.organizationId,
          ['active', 'trialing']
        )

        if (!subscription?.stripeSubscriptionId) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'No active subscription found',
          })
        }

        // Cancel at period end in Stripe
        await stripe.subscriptions.update(
          subscription.stripeSubscriptionId,
          { cancel_at_period_end: true }
        )

        // Update database
        await updateSubscriptionCancelFlag(subscription.id, true)

        return { success: true }
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to cancel subscription',
        })
      }
    }),

  /**
   * Reactivate a canceled subscription
   * Removes cancel_at_period_end flag, subscription continues normally
   */
  reactivateSubscription: organizationProcedure({ requirePermission: 'billing:update' })
    .input(z.object({ organizationId: z.string() }))
    .mutation(async ({ input }) => {
      const { getOrganizationSubscription, updateSubscriptionCancelFlag } =
        await import('@/services/payment.service')

      try {
        // Get organization's canceled subscription
        const subscription = await getOrganizationSubscription(
          input.organizationId,
          ['active', 'trialing'],
          true // cancelAtPeriodEnd = true
        )

        if (!subscription?.stripeSubscriptionId) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'No canceled subscription found',
          })
        }

        // Reactivate in Stripe
        await stripe.subscriptions.update(
          subscription.stripeSubscriptionId,
          { cancel_at_period_end: false }
        )

        // Update database
        await updateSubscriptionCancelFlag(subscription.id, false)

        return { success: true }
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to reactivate subscription',
        })
      }
    }),

  /**
   * Upgrade or downgrade an organization to a new plan
   * Updates existing subscription item to new price
   *
   * Flow:
   * 1. Get organization's existing Stripe subscription
   * 2. Update subscription item with new price
   * 3. Stripe handles prorations automatically
   * 4. Webhook will handle updating StudioPlan
   *
   * Handles both upgrades and downgrades:
   * - Upgrades: Immediate proration, customer pays difference
   * - Downgrades: Credit proration applied to next invoice
   */
  upgradeOrganization: organizationProcedure({ requirePermission: 'billing:update' })
    .input(
      z.object({
        organizationId: z.string(),
        planKey: z.enum(['starter', 'pro', 'enterprise']),
        billingInterval: z.enum(['monthly', 'yearly']),
        paymentMethodId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { organizationId, planKey, billingInterval, paymentMethodId } = input
      const {
        getOrganizationSubscription,
        getOrganizationWithOwner,
        getFreeTrialHistory,
        resolveExistingStripeCustomerId,
      } = await import('@/services/payment.service')

      try {
        /**
         * Fetch organization with owner upfront — needed for both customer creation
         * fallback (if no Stripe customer exists) and fingerprint tracking below.
         * Single DB query instead of calling getOrganizationWithOwner twice.
         */
        const organization = await getOrganizationWithOwner(organizationId)

        if (!organization || !organization.members[0]) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Organization or owner not found',
          })
        }

        const owner = organization.members[0].user

        /**
         * STEP 1: Resolve the existing Stripe customer ID.
         *
         * WHY: We must NEVER blindly create a new Stripe customer during upgrades.
         * Creating duplicate customers causes orphaned subscriptions, split billing
         * history, and payment method conflicts (a PM can only belong to one customer).
         *
         * The resolveExistingStripeCustomerId helper checks:
         *   1. ALL subscription records (any status, including canceled)
         *   2. The org owner's User.stripeCustomerId (set during onboarding)
         *   3. Verifies the customer still exists in Stripe (not deleted via dashboard)
         * Only if all checks return null do we create a new customer.
         */
        let customerId = await resolveExistingStripeCustomerId(organizationId)

        if (!customerId) {
          // Truly no valid Stripe customer exists — create one (e.g. free plan user upgrading for the first time)
          const customer = await stripe.customers.create({
            email: owner.email,
            name: owner.name || undefined,
            metadata: {
              organizationId,
              userId: owner.id,
            },
          })

          customerId = customer.id
        }

        /**
         * STEP 2: Find the existing active/trialing subscription to determine
         * whether we UPDATE an existing sub or CREATE a new one.
         */
        const existingSubscription = await getOrganizationSubscription(
          organizationId,
          ['active', 'trialing', 'past_due']
        )
        const stripeSubscriptionId = existingSubscription?.stripeSubscriptionId ?? null

        /**
         * STEP 3: Attach payment method to the EXISTING customer if needed.
         *
         * WHY: In Stripe, a payment method can only belong to one customer.
         * - If the PM is already on THIS customer → skip (no-op)
         * - If the PM is unattached (null) → attach it
         * - If the PM is on a DIFFERENT customer → Stripe throws an error,
         *   which is correct — prevents cross-customer PM theft
         *
         * NOTE: paymentMethod.customer can be string | Stripe.Customer | null,
         * so we normalize to string before comparing.
         */
        const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId)
        const pmCustomerId =
          typeof paymentMethod.customer === 'string'
            ? paymentMethod.customer
            : paymentMethod.customer?.id ?? null

        if (pmCustomerId !== customerId) {
          await stripe.paymentMethods.attach(paymentMethodId, {
            customer: customerId,
          })
        }

        // Set as default payment method for invoices
        await stripe.customers.update(customerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        })

        // Get plan configuration
        const plan = PLANS[planKey as keyof typeof PLANS]
        if (!plan) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid plan selected',
          })
        }

        // Get price ID based on billing interval
        const newPriceId = billingInterval === 'monthly' ? plan.stripe.monthly : plan.stripe.yearly
        if (!newPriceId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `No price configured for ${planKey} plan with ${billingInterval} billing. Please contact support.`,
          })
        }

        // Check if user has used a free trial before (both via subscription history and card fingerprint)
        const { hasUsedFreeTrial: pastTrialUsed } = await getFreeTrialHistory(organizationId)

        // Also check card fingerprint using the owner we already fetched
        const { hasUserUsedFreeTrial, storeCardFingerprint } = await import('@/services/card-fingerprint.service')

        const ownerId = owner.id
        const hasUsedTrialViaFingerprint = await hasUserUsedFreeTrial(ownerId, paymentMethodId)

        const hasUsedTrialBefore = pastTrialUsed || hasUsedTrialViaFingerprint

        // Store the fingerprint for tracking
        await storeCardFingerprint(ownerId, paymentMethodId, false)

        let subscription: Stripe.Subscription

        if (stripeSubscriptionId) {
          /**
           * UPGRADE PATH: Update the existing Stripe subscription in-place.
           * Stripe handles proration automatically — no new customer or sub needed.
           */
          const existingStripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId)

          if (!existingStripeSubscription.items.data[0]) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Subscription has no items',
            })
          }

          const subscriptionItemId = existingStripeSubscription.items.data[0].id

          const updateParams: Stripe.SubscriptionUpdateParams = {
            items: [
              {
                id: subscriptionItemId,
                price: newPriceId,
              },
            ],
            metadata: {
              organizationId,
              planKey,
              upgrade: 'true',
            },
            proration_behavior: 'always_invoice',
          }

          // If subscription is currently in trial and user is upgrading to paid,
          // end the trial immediately to start billing
          if (existingStripeSubscription.status === 'trialing') {
            updateParams.trial_end = 'now'
          }

          subscription = await stripe.subscriptions.update(stripeSubscriptionId, updateParams)
        } else {
          /**
           * NEW SUBSCRIPTION PATH: No active subscription exists.
           * This happens when a free-plan user upgrades for the first time,
           * or when a previously canceled user re-subscribes.
           * Uses the resolved (or newly created) customer — never a duplicate.
           */
          /**
           * Upgrade subscriptions NEVER get trials (free users already chose free).
           * Use 'error_if_incomplete' so Stripe charges immediately and throws
           * if the card fails — matching the onboarding pattern for non-trial subs.
           * Also set default_payment_method directly on the subscription so Stripe
           * knows exactly which card to charge on the first invoice.
           */
          const subscriptionParams: Stripe.SubscriptionCreateParams = {
            customer: customerId,
            items: [{ price: newPriceId }],
            metadata: {
              organizationId,
              planKey,
              upgrade: 'true',
            },
            default_payment_method: paymentMethodId,
            payment_behavior: 'error_if_incomplete',
            payment_settings: {
              save_default_payment_method: 'on_subscription',
            },
            expand: ['latest_invoice.payment_intent'],
          }

          subscription = await stripe.subscriptions.create(subscriptionParams)
        }

        // Webhook will handle updating the StudioPlan and subscription record
        return {
          subscriptionId: subscription.id,
          status: subscription.status,
          success: true,
        }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to upgrade plan',
        })
      }
    }),
})
