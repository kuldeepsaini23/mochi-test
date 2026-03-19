/**
 * Payment Service
 *
 * WHY: Centralized payment and billing operations using Stripe
 * HOW: Handles payment methods, subscriptions, and billing through Stripe API
 *
 * ARCHITECTURE:
 * - All Stripe operations go through this service
 * - Uses Subscription table to find Stripe customer IDs
 * - Follows DAL pattern - no direct Prisma access in routers
 */

import 'server-only'

import { stripe } from '@/lib/config/stripe'
import { prisma } from '@/lib/config'

/**
 * Get Stripe customer ID for an organization.
 * Used for listing/managing payment methods on the billing settings page.
 *
 * WHY: The subscription record is the source of truth, but free plan users
 * don't have one yet — their stripeCustomerId lives on the owner's User record
 * (set during onboarding). We fall back to that so free users can still see
 * and manage their saved card before they upgrade.
 *
 * LOOKUP ORDER:
 * 1. Active/trialing/past_due subscription (source of truth for paying orgs)
 * 2. Owner's User.stripeCustomerId (fallback for free plan users)
 */
async function getStripeCustomerId(organizationId: string): Promise<string | null> {
  // Primary: check subscription record (source of truth for paying orgs)
  const subscription = await prisma.subscription.findFirst({
    where: {
      referenceId: organizationId,
      status: { in: ['active', 'trialing', 'past_due'] },
    },
    select: { stripeCustomerId: true },
  })

  if (subscription?.stripeCustomerId) {
    return subscription.stripeCustomerId
  }

  // Fallback: free plan users have no subscription yet, but their Stripe
  // customer ID was stored on the owner's User record during onboarding
  const ownerMember = await prisma.member.findFirst({
    where: {
      organizationId,
      role: 'owner',
    },
    select: {
      user: {
        select: { stripeCustomerId: true },
      },
    },
  })

  return ownerMember?.user?.stripeCustomerId || null
}

/**
 * Resolve the existing Stripe customer ID for an organization using a 3-tier lookup.
 *
 * SOURCE OF TRUTH KEYWORDS: ResolveStripeCustomer, OrgStripeCustomerLookup
 *
 * WHY: During upgrades, we must NEVER blindly create a new Stripe customer.
 * Creating duplicate customers causes orphaned subscriptions, split billing
 * history, and payment method conflicts. This function exhaustively checks
 * every place a customer ID could exist before giving up.
 *
 * LOOKUP ORDER:
 * 1. ANY subscription record for this org (regardless of status — canceled subs still have the customer)
 * 2. The org owner's User.stripeCustomerId (set during initial onboarding)
 * 3. null — truly no Stripe customer exists (free plan user who never entered a card)
 *
 * @param organizationId - The organization to find a Stripe customer for
 * @returns The existing Stripe customer ID or null if none exists anywhere
 */
export async function resolveExistingStripeCustomerId(
  organizationId: string
): Promise<string | null> {
  // Tier 1: Check ALL subscription records (not just active ones)
  // A canceled subscription still has a valid stripeCustomerId we should reuse
  const anySubscription = await prisma.subscription.findFirst({
    where: {
      referenceId: organizationId,
      stripeCustomerId: { not: null },
    },
    select: { stripeCustomerId: true },
    orderBy: { createdAt: 'desc' },
  })

  if (anySubscription?.stripeCustomerId) {
    // Verify the customer still exists in Stripe (could have been deleted via dashboard)
    const customer = await stripe.customers.retrieve(anySubscription.stripeCustomerId)
    if (!customer.deleted) {
      return anySubscription.stripeCustomerId
    }
  }

  // Tier 2: Check the org owner's User record (set during onboarding via markUserOnboarded)
  const ownerMember = await prisma.member.findFirst({
    where: {
      organizationId,
      role: 'owner',
    },
    select: {
      user: {
        select: { stripeCustomerId: true },
      },
    },
  })

  if (ownerMember?.user?.stripeCustomerId) {
    // Verify the customer still exists in Stripe
    const customer = await stripe.customers.retrieve(ownerMember.user.stripeCustomerId)
    if (!customer.deleted) {
      return ownerMember.user.stripeCustomerId
    }
  }

  // No valid Stripe customer exists anywhere for this organization
  return null
}

/**
 * Get payment methods for an organization
 */
export async function getPaymentMethods(organizationId: string) {
  const stripeCustomerId = await getStripeCustomerId(organizationId)

  if (!stripeCustomerId) {
    return { paymentMethods: [], defaultPaymentMethodId: null }
  }

  // Get customer details from Stripe
  const customer = await stripe.customers.retrieve(stripeCustomerId)

  if (customer.deleted) {
    return { paymentMethods: [], defaultPaymentMethodId: null }
  }

  // Get payment methods from Stripe
  const paymentMethods = await stripe.paymentMethods.list({
    customer: stripeCustomerId,
    type: 'card',
  })

  // Get default payment method ID
  const defaultPaymentMethodId =
    typeof customer.invoice_settings.default_payment_method === 'string'
      ? customer.invoice_settings.default_payment_method
      : customer.invoice_settings.default_payment_method?.id

  return {
    paymentMethods: paymentMethods.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand,
      last4: pm.card?.last4,
      expMonth: pm.card?.exp_month,
      expYear: pm.card?.exp_year,
    })),
    defaultPaymentMethodId,
  }
}

/**
 * Set default payment method for an organization
 */
export async function setDefaultPaymentMethod(
  organizationId: string,
  paymentMethodId: string
): Promise<void> {
  const stripeCustomerId = await getStripeCustomerId(organizationId)

  if (!stripeCustomerId) {
    throw new Error('Organization not found or has no active subscription')
  }

  // Update default payment method in Stripe
  await stripe.customers.update(stripeCustomerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId,
    },
  })
}

/**
 * Delete payment method from an organization
 */
export async function deletePaymentMethod(
  organizationId: string,
  paymentMethodId: string
): Promise<void> {
  const stripeCustomerId = await getStripeCustomerId(organizationId)

  if (!stripeCustomerId) {
    throw new Error('Organization not found or has no active subscription')
  }

  // Detach payment method from customer
  await stripe.paymentMethods.detach(paymentMethodId)
}

/**
 * Add new payment method to an organization
 */
export async function addPaymentMethod(
  organizationId: string,
  paymentMethodId: string,
  setAsDefault = false,
  retryFailedPayment = false
): Promise<void> {
  const stripeCustomerId = await getStripeCustomerId(organizationId)

  if (!stripeCustomerId) {
    throw new Error('Organization not found or has no active subscription')
  }

  // Attach payment method to customer
  await stripe.paymentMethods.attach(paymentMethodId, {
    customer: stripeCustomerId,
  })

  // If retrying failed payment, attempt to pay the open invoice first
  if (retryFailedPayment) {
    // Get the customer's open invoices
    const invoices = await stripe.invoices.list({
      customer: stripeCustomerId,
      status: 'open',
      limit: 10,
    })

    if (invoices.data.length > 0) {
      // Try to pay each open invoice with the new payment method
      for (const invoice of invoices.data) {
        if (!invoice.id) continue

        try {
          // Pay the invoice with the new payment method
          const paidInvoice = await stripe.invoices.pay(invoice.id, {
            payment_method: paymentMethodId,
          })

          // If payment succeeded, set this as the default payment method
          if (paidInvoice.status === 'paid') {
            await stripe.customers.update(stripeCustomerId, {
              invoice_settings: {
                default_payment_method: paymentMethodId,
              },
            })
            return // Success! Exit early
          }
        } catch (error) {
          // Continue to next invoice or throw error
          throw new Error(`Failed to charge invoice: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }
    } else {
      // No open invoices, just set as default
      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      })
    }
  } else if (setAsDefault) {
    // Normal flow: Set as default if requested
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    })
  }
}

// ============================================================================
// SUBSCRIPTION QUERIES
// ============================================================================
// SOURCE OF TRUTH: SubscriptionQueries, SubscriptionManagement

/**
 * Get free trial history for an organization.
 *
 * WHY: Checks if the organization has ever used a free trial before.
 * HOW: Looks for any subscription with trial dates set.
 *
 * SOURCE OF TRUTH: FreeTrialHistory, TrialAbuseCheck
 */
export async function getFreeTrialHistory(organizationId: string) {
  const pastTrialSubscription = await prisma.subscription.findFirst({
    where: {
      referenceId: organizationId,
      trialStart: { not: null },
      trialEnd: { not: null },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  return {
    hasUsedFreeTrial: !!pastTrialSubscription,
    lastTrialDate: pastTrialSubscription?.trialStart || null,
  }
}

/**
 * Get organization's Stripe connected account ID for checkout.
 *
 * WHY: Checkout page needs the connected account to initialize Stripe Elements.
 * HOW: Returns only the stripeConnectedAccountId — no sensitive data exposed.
 *
 * SOURCE OF TRUTH: CheckoutOrgInfo, ConnectedAccountLookup
 */
export async function getCheckoutOrgInfo(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { stripeConnectedAccountId: true },
  })

  return {
    stripeConnectedAccountId: org?.stripeConnectedAccountId ?? null,
  }
}

/**
 * Get organization's active subscription.
 *
 * WHY: Needed by cancel/reactivate to find the right Stripe subscription.
 * HOW: Finds the most recent subscription in the given statuses.
 *
 * SOURCE OF TRUTH: ActiveSubscriptionLookup
 */
export async function getOrganizationSubscription(
  organizationId: string,
  statuses: string[],
  cancelAtPeriodEnd?: boolean
) {
  return await prisma.subscription.findFirst({
    where: {
      referenceId: organizationId,
      status: { in: statuses },
      ...(cancelAtPeriodEnd !== undefined ? { cancelAtPeriodEnd } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Update subscription's cancelAtPeriodEnd flag in database.
 *
 * WHY: Keeps DB in sync with Stripe after cancel/reactivate.
 * HOW: Updates the flag and timestamp on the subscription record.
 *
 * SOURCE OF TRUTH: SubscriptionCancelUpdate
 */
export async function updateSubscriptionCancelFlag(
  subscriptionId: string,
  cancelAtPeriodEnd: boolean
) {
  return await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      cancelAtPeriodEnd,
      updatedAt: new Date(),
    },
  })
}

/**
 * Get organization with owner details for Stripe customer creation.
 *
 * WHY: When upgrading from free plan, we need to create a Stripe customer
 *      using the organization owner's details.
 * HOW: Fetches org with owner member + user data.
 *
 * SOURCE OF TRUTH: OrgOwnerForStripe
 */
export async function getOrganizationWithOwner(organizationId: string) {
  return await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      members: {
        where: { role: 'owner' },
        include: { user: true },
        take: 1,
      },
    },
  })
}
