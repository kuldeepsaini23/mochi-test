/**
 * ============================================================================
 * PAYMENT TRIGGERS SERVICE
 * ============================================================================
 *
 * SOURCE OF TRUTH: PaymentTriggersService, SubscriptionEventType,
 * PaymentTriggerClassification, PaymentTriggerDispatch
 *
 * Centralized automation trigger firing for ALL payment events:
 * - PAYMENT_COMPLETED (per-product, live + test mode)
 * - TRIAL_STARTED (pure trial + mixed cart trial items)
 * - SUBSCRIPTION_RENEWED (2nd+ payments, post-trial first charge)
 * - SUBSCRIPTION_CANCELLED (live + test mode)
 *
 * ARCHITECTURE:
 * 1. classifySubscriptionEvent() — pure function, maps invoice data to event type
 * 2. dispatchSubscriptionTriggers() — routes event type to correct fire functions
 * 3. firePerProductPaymentTriggers() — SINGLE code path for PAYMENT_COMPLETED (live + test)
 * 4. fireTestModePaymentTriggers() — thin wrapper that builds a virtual transaction
 *    and delegates to firePerProductPaymentTriggers() (unified with live mode)
 *
 * This service is consumed by:
 * - payment-link.service.ts (live mode payment completion)
 * - webhook/route.ts (platform webhook, test mode)
 * - connect-webhook/route.ts (connect webhook, live mode)
 *
 * ============================================================================
 */

import 'server-only'

// ============================================================================
// TYPES
// ============================================================================

/**
 * SOURCE OF TRUTH: TestModeTriggerItem
 *
 * Represents a single product/price item for automation trigger firing.
 * Used by both live mode (from Transaction items) and test mode (from metadata).
 */
export type TriggerItem = {
  productId: string
  priceId: string
  productName: string
  priceName: string
  billingType: string
}

/**
 * Every subscription invoice maps to exactly one of these event types.
 * Determined ONCE from Stripe data, then used by the trigger dispatcher.
 * This is the single source of truth for "what kind of payment is this?"
 *
 * SOURCE OF TRUTH: SubscriptionEventType, PaymentTriggerClassification
 */
export type SubscriptionEventType =
  /** $0 invoice on a trial subscription → fire TRIAL_STARTED */
  | 'TRIAL_INVOICE'
  /** First invoice > $0 in a mixed cart with trial items (billing_reason=subscription_create) → fire PAYMENT_COMPLETED + TRIAL_STARTED for recurring items */
  | 'MIXED_CART_WITH_TRIAL'
  /** First real charge, no trial context → fire PAYMENT_COMPLETED only */
  | 'FIRST_PAYMENT'
  /** First real charge after trial ends (billing_reason=subscription_cycle, has trial) → fire PAYMENT_COMPLETED + SUBSCRIPTION_RENEWED */
  | 'POST_TRIAL_FIRST_CHARGE'
  /** 2nd+ payment (successfulPayments > 0) → fire PAYMENT_COMPLETED + SUBSCRIPTION_RENEWED */
  | 'RENEWAL'

// ============================================================================
// TRIGGER ITEM ENCODING / DECODING (for Stripe metadata in test mode)
// ============================================================================

/** Compact shape for a single trigger item in Stripe metadata */
type CompactTriggerItem = { p: string; r: string; n: string; rn: string; b: string }

/** Stripe enforces a hard 500 character limit per metadata value */
const STRIPE_META_VALUE_LIMIT = 500

/**
 * Encode trigger items into Stripe metadata entries, splitting across
 * multiple keys if the payload exceeds Stripe's 500-char-per-value limit.
 * SOURCE OF TRUTH: TestModeTriggerItemEncoding
 *
 * Returns a Record to spread directly into Stripe metadata.
 * Single chunk: { triggerItems: "[...]" }
 * Multiple chunks: { triggerItems: "[...]", triggerItems_1: "[...]", ... }
 *
 * @param items - Array of trigger items to encode
 * @returns Metadata entries safe for Stripe's 500-char limit
 */
export function encodeTriggerItemsMetadata(items: TriggerItem[]): Record<string, string> {
  const compact: CompactTriggerItem[] = items.map((i) => ({
    p: i.productId,
    r: i.priceId,
    n: i.productName.slice(0, 20),
    rn: i.priceName.slice(0, 20),
    b: i.billingType,
  }))

  /** Try single key first — most carts fit in one chunk */
  const full = JSON.stringify(compact)
  if (full.length <= STRIPE_META_VALUE_LIMIT) {
    return { triggerItems: full }
  }

  /** Split items into chunks that each fit within the limit */
  const meta: Record<string, string> = {}
  let batch: CompactTriggerItem[] = []
  let chunkIndex = 0

  for (const item of compact) {
    const withItem = JSON.stringify([...batch, item])
    if (withItem.length > STRIPE_META_VALUE_LIMIT && batch.length > 0) {
      meta[chunkIndex === 0 ? 'triggerItems' : `triggerItems_${chunkIndex}`] = JSON.stringify(batch)
      batch = []
      chunkIndex++
    }
    batch.push(item)
  }

  if (batch.length > 0) {
    meta[chunkIndex === 0 ? 'triggerItems' : `triggerItems_${chunkIndex}`] = JSON.stringify(batch)
  }

  return meta
}

/**
 * Decode trigger items from Stripe metadata, reassembling from split keys.
 * SOURCE OF TRUTH: TestModeTriggerItemDecoding
 *
 * Handles both single-key (triggerItems) and multi-key (triggerItems_1, etc.)
 * formats produced by encodeTriggerItemsMetadata().
 *
 * @param metadata - The full Stripe metadata object
 * @returns Array of trigger items, or null if no trigger data found
 */
export function decodeTriggerItemsFromMetadata(
  metadata: Record<string, string | undefined>
): TriggerItem[] | null {
  if (!metadata.triggerItems) return null

  /** Collect all chunks in order: triggerItems, triggerItems_1, triggerItems_2, ... */
  const allCompact: CompactTriggerItem[] = []
  const keys = ['triggerItems']
  for (let i = 1; metadata[`triggerItems_${i}`]; i++) {
    keys.push(`triggerItems_${i}`)
  }

  for (const key of keys) {
    const chunk = metadata[key]
    if (!chunk) continue
    const parsed = JSON.parse(chunk) as CompactTriggerItem[]
    allCompact.push(...parsed)
  }

  if (allCompact.length === 0) return null

  return allCompact.map((i) => ({
    productId: i.p,
    priceId: i.r,
    productName: i.n,
    priceName: i.rn,
    billingType: i.b,
  }))
}

// ============================================================================
// SUBSCRIPTION EVENT CLASSIFICATION + DISPATCH
// ============================================================================

/**
 * Classify a subscription invoice into one of 5 event types.
 * ALL trigger decision logic lives here — no boolean flags scattered elsewhere.
 *
 * @param invoiceAmount - Stripe invoice amount in cents
 * @param trialDays - Transaction's trialDays (null if no trial)
 * @param successfulPayments - How many real payments have been recorded so far
 * @param billingReason - Stripe invoice.billing_reason from the webhook
 *
 * SOURCE OF TRUTH: ClassifySubscriptionEvent, BillingReasonTrialGuard
 */
export function classifySubscriptionEvent(
  invoiceAmount: number,
  trialDays: number | null,
  successfulPayments: number,
  billingReason?: string
): SubscriptionEventType {
  const hasTrial = trialDays != null && trialDays > 0

  /** $0 invoice on a trial subscription = trial just started */
  if (invoiceAmount === 0 && hasTrial) {
    return 'TRIAL_INVOICE'
  }

  /** Already has successful payments = this is a renewal (2nd, 3rd, etc.) */
  if (successfulPayments > 0) {
    return 'RENEWAL'
  }

  /**
   * First real payment (successfulPayments === 0, invoice > $0).
   * billing_reason tells us what Stripe considers this invoice to be:
   *
   * subscription_create + trial = mixed cart (E-Book + trial sub in same invoice)
   * subscription_cycle  + trial = post-trial first charge (trial ended, now paying)
   * subscription_cycle  + no trial = renewal (test mode doesn't track successfulPayments,
   *                                  so this is the only signal we have for renewals)
   * subscription_create + no trial = regular first payment
   */
  if (billingReason === 'subscription_cycle') {
    /** subscription_cycle always means "not the first invoice" from Stripe's perspective */
    return hasTrial ? 'POST_TRIAL_FIRST_CHARGE' : 'RENEWAL'
  }

  if (hasTrial && billingReason === 'subscription_create') {
    return 'MIXED_CART_WITH_TRIAL'
  }

  return 'FIRST_PAYMENT'
}

/**
 * Dispatch automation triggers based on the classified subscription event type.
 * Clean switch statement — no boolean logic, just routing to the correct fire functions.
 *
 * SOURCE OF TRUTH: DispatchSubscriptionTriggers, PaymentTriggerDispatch
 */
export async function dispatchSubscriptionTriggers(
  eventType: SubscriptionEventType,
  transaction: {
    id: string
    organizationId: string
    leadId: string | null
    currency: string
    trialDays: number | null
    trialEndsAt: Date | null
    paymentLinkId: string | null
    successfulPayments: number
    items: Array<{
      productId: string
      productName: string
      priceId: string
      priceName: string
      billingType: string
      /** Per-item amount in cents (from TransactionItem.totalAmount). Optional for test mode. */
      totalAmount?: number
    }>
  },
  stripeAmount: number,
  newSuccessfulPayments: number
): Promise<void> {
  console.log(`[triggers] Event: ${eventType}, txn=${transaction.id}, amount=${stripeAmount}`)

  switch (eventType) {
    /**
     * Pure trial ($0 invoice): Fire TRIAL_STARTED for all items.
     * No PAYMENT_COMPLETED — no money was charged.
     */
    case 'TRIAL_INVOICE': {
      if (transaction.trialDays && transaction.trialEndsAt) {
        await fireTrialStartedTriggers({
          transactionId: transaction.id,
          organizationId: transaction.organizationId,
          leadId: transaction.leadId,
          currency: transaction.currency,
          trialDays: transaction.trialDays,
          trialEndsAt: transaction.trialEndsAt,
          items: transaction.items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            priceId: item.priceId,
            priceName: item.priceName,
          })),
        })
      }
      break
    }

    /**
     * Mixed cart first invoice (e.g. E-Book $97 ONE_TIME + Sub7Day trial RECURRING):
     * - PAYMENT_COMPLETED for ALL items (money was charged for ONE_TIME items)
     * - TRIAL_STARTED for RECURRING items only (they're starting a trial)
     */
    case 'MIXED_CART_WITH_TRIAL': {
      await firePerProductPaymentTriggers(transaction, stripeAmount, false)

      if (transaction.trialDays && transaction.trialEndsAt) {
        const recurringItems = transaction.items.filter((i) => i.billingType !== 'ONE_TIME')
        if (recurringItems.length > 0) {
          console.log(`[triggers] Mixed cart: TRIAL_STARTED for ${recurringItems.length} recurring item(s)`)
          await fireTrialStartedTriggers({
            transactionId: transaction.id,
            organizationId: transaction.organizationId,
            leadId: transaction.leadId,
            currency: transaction.currency,
            trialDays: transaction.trialDays,
            trialEndsAt: transaction.trialEndsAt,
            items: recurringItems.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              priceId: item.priceId,
              priceName: item.priceName,
            })),
          })
        }
      }
      break
    }

    /**
     * Regular first payment (no trial): PAYMENT_COMPLETED only.
     */
    case 'FIRST_PAYMENT': {
      await firePerProductPaymentTriggers(transaction, stripeAmount, false)
      break
    }

    /**
     * Post-trial first real charge: Trial ended, customer is now paying.
     * From the user's perspective this IS a renewal — the subscription was active during trial.
     * - PAYMENT_COMPLETED (marked as renewal so ONE_TIME items are excluded)
     * - SUBSCRIPTION_RENEWED
     */
    case 'POST_TRIAL_FIRST_CHARGE': {
      await firePerProductPaymentTriggers(transaction, stripeAmount, true)
      await fireSubscriptionRenewedTriggers(
        { ...transaction, successfulPayments: newSuccessfulPayments },
        stripeAmount
      )
      break
    }

    /**
     * 2nd+ payment: Regular renewal.
     * - PAYMENT_COMPLETED (marked as renewal)
     * - SUBSCRIPTION_RENEWED
     */
    case 'RENEWAL': {
      await firePerProductPaymentTriggers(transaction, stripeAmount, true)
      await fireSubscriptionRenewedTriggers(
        { ...transaction, successfulPayments: newSuccessfulPayments },
        stripeAmount
      )
      break
    }
  }
}

// ============================================================================
// INDIVIDUAL TRIGGER FIRE FUNCTIONS
// ============================================================================

/**
 * Fire PAYMENT_COMPLETED triggers for test mode ONE_TIME payments.
 * SOURCE OF TRUTH: TestModeOneTimePaymentTrigger, UnifiedPaymentTriggerPath
 *
 * ONLY used for ONE_TIME payments from payment_intent.succeeded in test mode.
 * Subscription payments (RECURRING/SPLIT) use the shared classify+dispatch pipeline
 * via classifySubscriptionEvent() + dispatchSubscriptionTriggers() instead.
 *
 * UNIFIED ARCHITECTURE: Constructs a virtual transaction from Stripe metadata
 * and delegates to firePerProductPaymentTriggers() — the SAME function used by
 * live mode. This ensures test and live mode fire identical trigger payloads
 * through a single code path.
 */
export async function fireTestModePaymentTriggers(params: {
  organizationId: string
  leadId: string
  items: TriggerItem[]
  amount: number
  currency: string
  paymentLinkId?: string
}) {
  const { organizationId, leadId, items, amount, currency, paymentLinkId } = params

  console.log(
    `[triggers] [test] fireTestModePaymentTriggers: org=${organizationId}, leadId=${leadId}, items=${items.length}, amount=${amount}`
  )

  /**
   * Build a virtual transaction from metadata so we can delegate to
   * the shared firePerProductPaymentTriggers(). Same pattern used by
   * subscription test mode triggers (virtual transaction → dispatchSubscriptionTriggers).
   * SOURCE OF TRUTH: UnifiedPaymentTriggerPath
   */
  const virtualTransaction = {
    id: 'test-mode',
    organizationId,
    leadId,
    currency,
    paymentLinkId: paymentLinkId || null,
    items,
  }

  await firePerProductPaymentTriggers(virtualTransaction, amount, false)
}

/**
 * Fire PAYMENT_COMPLETED automation triggers for each product/price in a transaction.
 * SOURCE OF TRUTH: PerProductAutomationTrigger
 *
 * This fires ONE trigger per transaction item so product-specific automations
 * match correctly regardless of payment source (link, embedded, cart).
 * A cart with 3 items fires 3 separate triggers.
 *
 * AMOUNT SEMANTICS:
 * - `amount` in triggerData = per-item amount (TransactionItem.totalAmount)
 * - `checkoutTotal` in triggerData = full Stripe charge for the entire checkout
 * For test mode or subscription renewals where per-item amounts aren't available,
 * `amount` falls back to `stripeAmount` (the checkout total).
 * SOURCE OF TRUTH: PerItemTriggerAmount, CheckoutTotalTriggerAmount
 *
 * @param transaction - Transaction with items loaded (items may include optional totalAmount)
 * @param stripeAmount - The Stripe charge amount (cents) for this invoice/payment (checkout total)
 * @param isRenewal - Whether this is a renewal (subsequent) payment
 */
export async function firePerProductPaymentTriggers(
  transaction: {
    id: string
    organizationId: string
    leadId: string | null
    currency: string
    paymentLinkId: string | null
    items: Array<{
      productId: string
      productName: string
      priceId: string
      priceName: string
      billingType: string
      /** Per-item amount in cents (from TransactionItem.totalAmount). Optional for test mode. */
      totalAmount?: number
    }>
  },
  stripeAmount: number,
  isRenewal: boolean
) {
  console.log(`[triggers] firePerProductPaymentTriggers: txn=${transaction.id}, leadId=${transaction.leadId}, items=${transaction.items.length}, checkoutTotal=${stripeAmount}, isRenewal=${isRenewal}`)

  if (!transaction.leadId || transaction.items.length === 0) {
    console.log(`[triggers] SKIPPED: leadId=${transaction.leadId}, items=${transaction.items.length}`)
    return
  }

  /**
   * On renewals (2nd+ subscription payment), Stripe only charges for RECURRING
   * and SPLIT_PAYMENT items. ONE_TIME items in a mixed cart were charged on the
   * first invoice only via add_invoice_items. Firing triggers for one-time items
   * again on renewal would be incorrect — those were already paid and triggered.
   */
  const itemsToTrigger = isRenewal
    ? transaction.items.filter((item) => item.billingType !== 'ONE_TIME')
    : transaction.items

  if (itemsToTrigger.length === 0) return

  const { triggerAutomation } = await import('@/services/automation.service')

  /**
   * Fire PAYMENT_COMPLETED for each item individually.
   * Each item gets its own try/catch so one item's failure doesn't block the rest.
   *
   * Per-item amount: uses TransactionItem.totalAmount when available (live mode),
   * falls back to stripeAmount (test mode / subscription renewals where per-item
   * amounts aren't tracked in metadata).
   *
   * SOURCE OF TRUTH: PerItemTriggerIsolation, PerItemTriggerAmount
   */
  for (const item of itemsToTrigger) {
    try {
      const itemAmount = item.totalAmount ?? stripeAmount
      console.log(`[triggers] Firing PAYMENT_COMPLETED for: product="${item.productName}" (${item.productId}), price="${item.priceName}" (${item.priceId}), billing=${item.billingType}, itemAmount=${itemAmount}, checkoutTotal=${stripeAmount}`)
      const result = await triggerAutomation('PAYMENT_COMPLETED', {
        organizationId: transaction.organizationId,
        leadId: transaction.leadId,
        triggerData: {
          type: 'PAYMENT_COMPLETED',
          transactionId: transaction.id,
          amount: itemAmount,
          checkoutTotal: stripeAmount,
          currency: transaction.currency,
          productId: item.productId,
          productName: item.productName,
          priceId: item.priceId,
          priceName: item.priceName,
          billingType: item.billingType as 'ONE_TIME' | 'RECURRING' | 'SPLIT_PAYMENT',
          isRenewal,
          paymentLinkId: transaction.paymentLinkId || undefined,
        },
      })
      console.log(`[triggers] Result: triggered=${result.triggered}, automationIds=${result.automationIds}`)
    } catch (itemError) {
      console.error(`[triggers] PAYMENT_COMPLETED failed for product="${item.productName}" (${item.productId}):`, itemError)
    }
  }
}

/**
 * Fire TRIAL_STARTED automation triggers for each product in a trial group.
 * SOURCE OF TRUTH: TrialStartedAutomationTrigger
 *
 * Called from dispatchSubscriptionTriggers() for TRIAL_INVOICE and MIXED_CART_WITH_TRIAL events.
 * Fires one trigger per trial item so product-specific automations match correctly.
 *
 * @param params - Trial group data with transaction, items, and trial details
 */
async function fireTrialStartedTriggers(params: {
  transactionId: string
  organizationId: string
  leadId: string | null
  currency: string
  trialDays: number
  trialEndsAt: Date
  items: Array<{
    productId: string
    productName: string
    priceId: string
    priceName: string
  }>
}) {
  const { transactionId, organizationId, leadId, currency, trialDays, trialEndsAt, items } = params

  console.log(`[triggers] fireTrialStartedTriggers: txn=${transactionId}, leadId=${leadId}, items=${items.length}, trialDays=${trialDays}`)

  if (!leadId || items.length === 0) {
    console.log(`[triggers] TRIAL_STARTED SKIPPED: leadId=${leadId}, items=${items.length}`)
    return
  }

  const { triggerAutomation } = await import('@/services/automation.service')

  /**
   * Fire TRIAL_STARTED for each item individually.
   * Each item gets its own try/catch so one item's failure doesn't block the rest.
   * SOURCE OF TRUTH: PerItemTriggerIsolation
   */
  for (const item of items) {
    try {
      console.log(`[triggers] Firing TRIAL_STARTED for: product="${item.productName}" (${item.productId}), trialDays=${trialDays}`)
      const result = await triggerAutomation('TRIAL_STARTED', {
        organizationId,
        leadId,
        triggerData: {
          type: 'TRIAL_STARTED',
          transactionId,
          productId: item.productId,
          productName: item.productName,
          priceId: item.priceId,
          priceName: item.priceName,
          trialDays,
          trialEndsAt: trialEndsAt.toISOString(),
          currency,
        },
      })
      console.log(`[triggers] TRIAL_STARTED result: triggered=${result.triggered}, automationIds=${result.automationIds}`)
    } catch (itemError) {
      console.error(`[triggers] TRIAL_STARTED failed for product="${item.productName}" (${item.productId}):`, itemError)
    }
  }
}

/**
 * Fire SUBSCRIPTION_RENEWED automation triggers for each recurring product in a transaction.
 * SOURCE OF TRUTH: SubscriptionRenewedAutomationTrigger
 *
 * Called from dispatchSubscriptionTriggers() for RENEWAL and POST_TRIAL_FIRST_CHARGE events.
 * Fires alongside PAYMENT_COMPLETED for the same items.
 * ONE_TIME items are excluded — they were charged on the first invoice only.
 *
 * @param transaction - Transaction with items loaded
 * @param stripeAmount - The Stripe charge amount (cents) for this invoice
 */
async function fireSubscriptionRenewedTriggers(
  transaction: {
    id: string
    organizationId: string
    leadId: string | null
    currency: string
    successfulPayments: number
    items: Array<{
      productId: string
      productName: string
      priceId: string
      priceName: string
      billingType: string
    }>
  },
  stripeAmount: number
) {
  console.log(`[triggers] fireSubscriptionRenewedTriggers: txn=${transaction.id}, leadId=${transaction.leadId}, payment#=${transaction.successfulPayments}`)

  if (!transaction.leadId || transaction.items.length === 0) {
    console.log(`[triggers] SUBSCRIPTION_RENEWED SKIPPED: leadId=${transaction.leadId}, items=${transaction.items.length}`)
    return
  }

  /** Only fire for recurring/split items — ONE_TIME items don't renew */
  const recurringItems = transaction.items.filter((item) => item.billingType !== 'ONE_TIME')
  if (recurringItems.length === 0) return

  const { triggerAutomation } = await import('@/services/automation.service')

  /**
   * Fire SUBSCRIPTION_RENEWED for each recurring item individually.
   * Each item gets its own try/catch so one item's failure doesn't block the rest.
   * SOURCE OF TRUTH: PerItemTriggerIsolation
   */
  for (const item of recurringItems) {
    try {
      console.log(`[triggers] Firing SUBSCRIPTION_RENEWED for: product="${item.productName}" (${item.productId}), payment#=${transaction.successfulPayments}`)
      const result = await triggerAutomation('SUBSCRIPTION_RENEWED', {
        organizationId: transaction.organizationId,
        leadId: transaction.leadId,
        triggerData: {
          type: 'SUBSCRIPTION_RENEWED',
          transactionId: transaction.id,
          amount: stripeAmount,
          currency: transaction.currency,
          productId: item.productId,
          productName: item.productName,
          priceId: item.priceId,
          priceName: item.priceName,
          paymentNumber: transaction.successfulPayments,
        },
      })
      console.log(`[triggers] SUBSCRIPTION_RENEWED result: triggered=${result.triggered}, automationIds=${result.automationIds}`)
    } catch (itemError) {
      console.error(`[triggers] SUBSCRIPTION_RENEWED failed for product="${item.productName}" (${item.productId}):`, itemError)
    }
  }
}

/**
 * Fire SUBSCRIPTION_CANCELLED automation triggers for each product in a cancelled subscription.
 * SOURCE OF TRUTH: SubscriptionCancelledAutomationTrigger
 *
 * Called from handleSubscriptionCanceled() after the transaction status is updated.
 * Also called from the connect webhook for subscription.deleted events.
 * Shared between live mode and test mode cancellation handlers.
 *
 * @param transaction - Transaction with items and leadId loaded
 * @param cancelReason - Optional cancellation reason from Stripe
 */
export async function fireSubscriptionCancelledTriggers(
  transaction: {
    id: string
    organizationId: string
    leadId: string | null
    currency: string
    items: Array<{
      productId: string
      productName: string
      priceId: string
      priceName: string
    }>
  },
  cancelReason?: string
) {
  console.log(`[triggers] fireSubscriptionCancelledTriggers: txn=${transaction.id}, leadId=${transaction.leadId}, items=${transaction.items.length}`)

  if (!transaction.leadId || transaction.items.length === 0) {
    console.log(`[triggers] SUBSCRIPTION_CANCELLED SKIPPED: leadId=${transaction.leadId}, items=${transaction.items.length}`)
    return
  }

  const { triggerAutomation } = await import('@/services/automation.service')

  /**
   * Fire SUBSCRIPTION_CANCELLED for each item individually.
   * Each item gets its own try/catch so one item's failure doesn't block the rest.
   * SOURCE OF TRUTH: PerItemTriggerIsolation
   */
  for (const item of transaction.items) {
    try {
      console.log(`[triggers] Firing SUBSCRIPTION_CANCELLED for: product="${item.productName}" (${item.productId})`)
      const result = await triggerAutomation('SUBSCRIPTION_CANCELLED', {
        organizationId: transaction.organizationId,
        leadId: transaction.leadId,
        triggerData: {
          type: 'SUBSCRIPTION_CANCELLED',
          transactionId: transaction.id,
          productId: item.productId,
          productName: item.productName,
          priceId: item.priceId,
          priceName: item.priceName,
          cancelReason,
          currency: transaction.currency,
        },
      })
      console.log(`[triggers] SUBSCRIPTION_CANCELLED result: triggered=${result.triggered}, automationIds=${result.automationIds}`)
    } catch (itemError) {
      console.error(`[triggers] SUBSCRIPTION_CANCELLED failed for product="${item.productName}" (${item.productId}):`, itemError)
    }
  }
}
