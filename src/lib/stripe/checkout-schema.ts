/**
 * Shared checkout contact form validation schema.
 *
 * Used by all payment forms that collect customer contact info
 * (payment links, checkout elements, payment elements).
 * Validates firstName, lastName, and email — the minimum required
 * for Stripe PaymentElement billing details.
 *
 * SOURCE OF TRUTH: CheckoutFormSchema, PaymentContactValidation
 */

import { z } from 'zod'

export const checkoutSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email is required'),
})

/** Inferred type for checkout form data */
export type CheckoutFormData = z.infer<typeof checkoutSchema>
