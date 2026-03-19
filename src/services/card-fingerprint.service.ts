/**
 * CARD FINGERPRINT SERVICE
 *
 * Manages card fingerprint tracking for free trial abuse prevention.
 * Uses Stripe card fingerprints to detect if a user has already used
 * a free trial with the same payment method.
 */

import { prisma } from '@/lib/config'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-10-29.clover' as any,
})

/**
 * Check if a user has already used a free trial with this payment method
 * or any payment method they've previously used
 */
export async function hasUserUsedFreeTrial(userId: string, paymentMethodId: string): Promise<boolean> {
  try {
    // Verify prisma client has cardFingerprint model
    if (!prisma.cardFingerprint) {
      return false // Fail safely - allow trial
    }

    // Get the payment method to extract the card fingerprint
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId)

    if (!paymentMethod.card?.fingerprint) {
      // If we can't get a fingerprint, allow the trial to be safe
      return false
    }

    const fingerprint = paymentMethod.card.fingerprint

    // Check if this fingerprint has been used for a free trial before
    // by this user OR any other user
    const existingFingerprint = await prisma.cardFingerprint.findFirst({
      where: {
        fingerprint,
        usedFreeTrial: true,
      },
    })

    if (existingFingerprint) {
      return true
    }

    return false
  } catch (error) {
    // On error, allow the trial to be safe
    return false
  }
}

/**
 * Store a card fingerprint for a user with trial usage flag
 */
export async function storeCardFingerprint(
  userId: string,
  paymentMethodId: string,
  usedFreeTrial: boolean = false
): Promise<void> {
  try {
    // Verify prisma client has cardFingerprint model
    if (!prisma.cardFingerprint) {
      return // Fail silently - fingerprint tracking is non-critical
    }

    // Get the payment method to extract the card fingerprint
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId)

    if (!paymentMethod.card?.fingerprint) {
      return
    }

    const fingerprint = paymentMethod.card.fingerprint

    // Upsert the fingerprint record
    await prisma.cardFingerprint.upsert({
      where: {
        userId_fingerprint: {
          userId,
          fingerprint,
        },
      },
      update: {
        usedFreeTrial: usedFreeTrial || undefined, // Only update if true
        updatedAt: new Date(),
      },
      create: {
        userId,
        fingerprint,
        usedFreeTrial,
      },
    })
  } catch (error) {
    // Don't throw - fingerprint tracking is non-critical
  }
}

/**
 * Mark all fingerprints for a user as having used a free trial
 * Called after a user successfully starts a trial
 */
export async function markUserFingerprintsAsTrialUsed(userId: string): Promise<void> {
  try {
    // Verify prisma client has cardFingerprint model
    if (!prisma.cardFingerprint) {
      return // Fail silently - fingerprint tracking is non-critical
    }

    await prisma.cardFingerprint.updateMany({
      where: {
        userId,
        usedFreeTrial: false,
      },
      data: {
        usedFreeTrial: true,
        updatedAt: new Date(),
      },
    })
  } catch (error) {
    // Fail silently - fingerprint tracking is non-critical
  }
}

/**
 * Check if any of a user's stored fingerprints have been used for a trial
 * Useful for quick lookups without needing to retrieve a payment method
 */
export async function hasUserAnyTrialUsedFingerprint(userId: string): Promise<boolean> {
  try {
    // Verify prisma client has cardFingerprint model
    if (!prisma.cardFingerprint) {
      return false // Fail safely - assume no trial used
    }

    const trialUsedFingerprint = await prisma.cardFingerprint.findFirst({
      where: {
        userId,
        usedFreeTrial: true,
      },
    })

    return !!trialUsedFingerprint
  } catch (error) {
    return false
  }
}
