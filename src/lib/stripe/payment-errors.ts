/**
 * Shared Stripe payment error message mapping.
 *
 * Maps Stripe error codes to user-friendly error messages.
 * Used by all client-side payment forms (payment links, invoices, checkout elements).
 *
 * SOURCE OF TRUTH: StripePaymentErrors, PaymentErrorMessages
 */

/** Stripe error shape from confirmPayment/confirmSetup results */
interface StripePaymentError {
  type: string
  code?: string
  message?: string
}

/**
 * Map a Stripe error to a user-friendly message.
 * Covers the most common card-related errors with clear, actionable messages.
 * Falls back to Stripe's own message, then a generic message.
 */
export function getPaymentErrorMessage(error: StripePaymentError): string {
  switch (error.code) {
    case 'card_declined':
      return 'Your card was declined. Please try a different payment method.'
    case 'insufficient_funds':
      return 'Insufficient funds. Please try a different payment method.'
    case 'expired_card':
      return 'Your card has expired. Please use a different card.'
    case 'incorrect_cvc':
      return 'Incorrect security code. Please check and try again.'
    case 'processing_error':
      return 'An error occurred while processing your card. Please try again.'
    case 'incorrect_number':
      return 'Incorrect card number. Please check and try again.'
    case 'authentication_required':
      return 'Authentication required. Please complete the verification.'
    default:
      return error.message || 'Payment failed. Please try again.'
  }
}
