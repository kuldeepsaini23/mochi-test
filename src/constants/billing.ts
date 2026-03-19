/**
 * Billing Type Constants
 *
 * Source of truth for all billing type values.
 * Import from @/generated/prisma for type-safe usage.
 */

import type { BillingType } from '@/generated/prisma'

export const BILLING_TYPES = {
  ONE_TIME: 'ONE_TIME',
  RECURRING: 'RECURRING',
  SPLIT_PAYMENT: 'SPLIT_PAYMENT',
} as const satisfies Record<BillingType, BillingType>
