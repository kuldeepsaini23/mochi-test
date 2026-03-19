/**
 * ============================================================================
 * TEMPLATE PURCHASE SERVICE — Payment + Installation for Paid Templates
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: TemplatePurchase, TemplatePurchaseService,
 * createTemplatePurchaseAndInstall, TemplateBuyerPayment
 *
 * WHY: Paid templates require a Stripe payment before installation.
 * This service orchestrates the full purchase flow:
 *   1. Validate buyer eligibility (must be on a paid plan)
 *   2. Validate template is PUBLISHED and has a price
 *   3. Look up seller's connected Stripe account
 *   4. Create a PaymentIntent with platform fee on the seller's account
 *   5. Record the transaction in our database
 *   6. Install the template into the buyer's organization
 *
 * ARCHITECTURE:
 * - Uses the same platform fee pattern as payment-link.service.ts
 * - Uses getPlatformCurrency() for PaymentIntent currency
 * - Uses calculatePlatformFeeCents() for tier-aware platform fees
 * - Uses createTransaction() + recordPayment() from transaction.service.ts
 * - Uses installTemplate() from template.service.ts for the actual install
 *
 * SECURITY:
 * - Buyer must be on a paid plan (free tier cannot purchase)
 * - Seller must have a connected Stripe account
 * - Template must be PUBLISHED status with price > 0
 * - PaymentIntent is created with confirm: true (immediate charge)
 */

import 'server-only'
import { prisma, stripe } from '@/lib/config'
import { getOrganizationTier } from '@/services/feature-gate.service'
import { calculatePlatformFeeCents, getStripeTransactionFee, PLANS } from '@/lib/config/feature-gates'
import { getPlatformCurrency } from '@/services/platform-currency.service'
import { createTransaction, recordPayment } from '@/services/transaction.service'
import { installTemplate } from '@/services/template.service'
import { firePaymentNotification, formatPaymentAmount } from '@/lib/stripe/webhook-utils'
import type { InstallResult } from '@/lib/templates/types'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Input for creating a template purchase.
 *
 * SOURCE OF TRUTH: TemplatePurchaseInput
 */
interface TemplatePurchaseInput {
  /** The template being purchased */
  templateId: string
  /** Stripe PaymentMethod ID from the buyer's card/payment method */
  paymentMethodId: string
  /** The buyer's organization ID */
  buyerOrganizationId: string
  /** The buyer's user ID (for install record and transaction) */
  buyerUserId: string
}

/**
 * Result of a successful template purchase.
 *
 * SOURCE OF TRUTH: TemplatePurchaseResult
 */
interface TemplatePurchaseResult {
  /** Whether the purchase and installation succeeded */
  success: boolean
  /** Stripe PaymentIntent ID for reference */
  paymentIntentId: string
  /** Transaction ID in our database */
  transactionId: string
  /** Install result from template.service.ts */
  installResult: InstallResult
}

// ============================================================================
// MAIN PURCHASE FUNCTION
// ============================================================================

/**
 * Creates a template purchase: charges the buyer, records the transaction,
 * and installs the template into the buyer's organization.
 *
 * FLOW:
 * 1. Verify buyer is on a paid plan (free tier cannot purchase templates)
 * 2. Fetch the template and validate it's PUBLISHED with a price > 0
 * 3. Get the seller org's connected Stripe account ID
 * 4. Calculate platform fee based on seller's tier
 * 5. Get platform currency
 * 6. Create/find lead in seller's org for the buyer (so transaction shows customer info)
 * 7. Create a Stripe PaymentIntent with application_fee on the seller's account
 * 8. Create a Transaction + TransactionPayment record (linked to lead)
 * 9. Notify seller
 * 10. Install the template into the buyer's org
 *
 * @throws Error if buyer is on free plan
 * @throws Error if template is not purchasable
 * @throws Error if seller has no connected Stripe account
 * @throws Error if Stripe payment fails
 */
export async function createTemplatePurchaseAndInstall(
  input: TemplatePurchaseInput
): Promise<TemplatePurchaseResult> {
  const { templateId, paymentMethodId, buyerOrganizationId, buyerUserId } = input

  // =========================================================================
  // 1. Verify buyer eligibility — must be on a paid plan
  // =========================================================================
  const buyerTier = await getOrganizationTier(buyerOrganizationId)

  if (buyerTier.tier === 'free') {
    throw new Error(
      'Template purchases require a paid plan. Please upgrade to purchase templates.'
    )
  }

  // =========================================================================
  // 2. Fetch and validate the template
  // =========================================================================
  const template = await prisma.template.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      name: true,
      price: true,
      status: true,
      organizationId: true,
      category: true,
    },
  })

  if (!template) {
    throw new Error('Template not found')
  }

  if (template.status !== 'PUBLISHED') {
    throw new Error('Template is not available for purchase')
  }

  if (!template.price || template.price <= 0) {
    throw new Error('Template has no price set — use the free install flow instead')
  }

  /** Prevent self-purchase — an org cannot buy its own template */
  if (template.organizationId === buyerOrganizationId) {
    throw new Error('You cannot purchase your own template')
  }

  // =========================================================================
  // 3. Get the seller's connected Stripe account
  // =========================================================================
  const sellerOrg = await prisma.organization.findUnique({
    where: { id: template.organizationId },
    select: { stripeConnectedAccountId: true },
  })

  if (!sellerOrg?.stripeConnectedAccountId) {
    throw new Error(
      'Template creator does not have a connected Stripe account. They must connect Stripe before selling templates.'
    )
  }

  // =========================================================================
  // 4. Calculate platform fee based on seller's tier
  // =========================================================================
  const sellerTier = await getOrganizationTier(template.organizationId)
  const sellerPlanKey = sellerTier.tier as keyof typeof PLANS
  const platformFeeCents = calculatePlatformFeeCents(template.price, sellerPlanKey)
  /** Store the fee percentage at time of purchase for accurate historical reporting */
  const platformFeePercent = getStripeTransactionFee(sellerPlanKey).percentage

  // =========================================================================
  // 5. Get platform currency for the PaymentIntent
  // =========================================================================
  const { currency } = await getPlatformCurrency()

  // =========================================================================
  // 6. Create/find lead in the seller's org for this buyer
  // =========================================================================
  /**
   * The buyer is a logged-in user, so we know their name and email.
   * We create (or find) a lead in the SELLER's organization so the
   * transaction shows the buyer's info instead of "unknown customer".
   * This follows the same pattern as createOrUpdateLead in checkout.service.ts.
   */
  const buyerUser = await prisma.user.findUnique({
    where: { id: buyerUserId },
    select: { name: true, email: true, firstName: true, lastName: true },
  })

  let leadId: string | null = null
  if (buyerUser?.email) {
    try {
      /** Parse first/last name from the user record */
      const firstName = buyerUser.firstName || buyerUser.name?.split(' ')[0] || 'Unknown'
      const lastName = buyerUser.lastName || buyerUser.name?.split(' ').slice(1).join(' ') || ''

      const existingLead = await prisma.lead.findFirst({
        where: { organizationId: template.organizationId, email: buyerUser.email },
      })

      if (existingLead) {
        /** Update existing lead's activity timestamp */
        await prisma.lead.update({
          where: { id: existingLead.id },
          data: {
            firstName,
            lastName,
            lastActivityAt: new Date(),
          },
        })
        leadId = existingLead.id
      } else {
        /** Create a new lead in the seller's org attributed to template purchase */
        const newLead = await prisma.lead.create({
          data: {
            organizationId: template.organizationId,
            firstName,
            lastName,
            email: buyerUser.email,
            source: 'Template Purchase',
            status: 'LEAD',
          },
        })
        leadId = newLead.id
      }
    } catch (err) {
      /** Non-blocking — if lead creation fails, continue with the purchase */
      console.error('[TemplatePurchase] Failed to create/find lead:', err)
    }
  }

  // =========================================================================
  // 7. Create Stripe PaymentIntent on the seller's connected account
  // =========================================================================
  /**
   * The PaymentIntent is created with:
   * - confirm: true — charges immediately
   * - application_fee_amount — platform takes a cut based on seller's tier
   * - transfer_data.destination — funds go to the seller's connected account
   * - automatic_payment_methods — supports all payment methods
   *
   * This follows the same pattern as createOneTimePayment in payment-link.service.ts
   */
  const paymentIntent = await stripe.paymentIntents.create({
    amount: template.price,
    currency,
    payment_method: paymentMethodId,
    confirm: true,
    automatic_payment_methods: {
      enabled: true,
      allow_redirects: 'never',
    },
    application_fee_amount: platformFeeCents,
    transfer_data: {
      destination: sellerOrg.stripeConnectedAccountId,
    },
    metadata: {
      type: 'template_purchase',
      templateId: template.id,
      templateName: template.name,
      buyerOrgId: buyerOrganizationId,
      sellerOrgId: template.organizationId,
    },
    description: `Template purchase: ${template.name}`,
  })

  // =========================================================================
  // 8. Record the transaction in our database
  // =========================================================================
  /**
   * Create a Transaction record on the SELLER's org for revenue tracking.
   * WHY: The seller earns income from the sale — this is THEIR revenue,
   * not the buyer's. The buyer gets the installed template, not a transaction.
   * Uses ONE_TIME billing since template purchases are one-off payments.
   * Links to the buyer's lead so the transaction shows the customer's name/email.
   */
  const transaction = await createTransaction({
    organizationId: template.organizationId,
    leadId: leadId ?? undefined,
    originalAmount: template.price,
    currency,
    billingType: 'ONE_TIME',
    paymentStatus: 'PAID',
    totalPayments: 1,
    stripePaymentIntentId: paymentIntent.id,
    metadata: {
      type: 'template_purchase',
      /**
       * Generic flag for ALL platform-currency transactions (templates, future merch, affiliates).
       * WHY: Dashboard charts filter on this to exclude platform-currency revenue from
       * the seller's connect-account revenue charts. The marketplace chart queries
       * ONLY transactions where platformPayment === true.
       */
      platformPayment: true,
      templateId: template.id,
      templateName: template.name,
      buyerOrgId: buyerOrganizationId,
      platformFeeCents,
      platformFeePercent,
    },
    items: [
      {
        productId: template.id,
        priceId: template.id,
        productName: `Template: ${template.name}`,
        priceName: `${template.category} Template`,
        billingType: 'ONE_TIME',
        unitAmount: template.price,
        totalAmount: template.price,
        quantity: 1,
      },
    ],
  })

  /** Record the payment against the seller's transaction */
  await recordPayment(template.organizationId, transaction.id, {
    amount: template.price,
    currency,
    status: 'SUCCEEDED',
    paymentNumber: 1,
    stripePaymentIntentId: paymentIntent.id,
    paidAt: new Date(),
  })

  // =========================================================================
  // 9. Notify the seller's org about the template sale
  // =========================================================================
  /**
   * Fire-and-forget notification to ALL members of the seller's org.
   * Uses the same firePaymentNotification as product sales — triggers:
   * - In-app notification (DB + Upstash realtime)
   * - Cha-ching sound on the seller's dashboard
   * - Web push notification to all subscribed devices
   */
  const formattedAmount = formatPaymentAmount(template.price, currency)
  firePaymentNotification(
    template.organizationId,
    formattedAmount,
    `Template: ${template.name}`,
    '[template-purchase]'
  )

  // =========================================================================
  // 10. Install the template into the buyer's organization
  // =========================================================================
  const installResult = await installTemplate({
    organizationId: buyerOrganizationId,
    templateId: template.id,
    installedById: buyerUserId,
  })

  return {
    success: true,
    paymentIntentId: paymentIntent.id,
    transactionId: transaction.id,
    installResult,
  }
}
