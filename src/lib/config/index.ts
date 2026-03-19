/**
 * App Configuration
 *
 * Shared config, clients, and constants
 */

export { prisma } from './prisma'
export { stripe, stripeTest, getStripeInstance } from './stripe'
export { PLANS, PLATFORM_CONFIG, type FeatureKey, type PlanKey } from './feature-gates'
