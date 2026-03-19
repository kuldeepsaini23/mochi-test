/**
 * Payment Success/Redirect Landing Page
 *
 * This page handles the return_url redirect from Stripe after:
 * - 3DS authentication
 * - Bank redirects (iDEAL, Bancontact, etc.)
 * - Other redirect-based payment methods (Klarna, Afterpay, etc.)
 *
 * The page:
 * 1. Extracts payment_intent and payment_intent_client_secret from URL
 * 2. Checks the actual payment status with Stripe
 * 3. Shows appropriate success/failure/processing message
 *
 * IMPORTANT: The webhook is the source of truth for transaction status.
 * This page just provides user feedback while webhook processes.
 */

import { Suspense } from 'react'
import { PaymentResultClient } from './_components/payment-result-client'
import { Loader2 } from 'lucide-react'

// Loading component while we verify payment
function PaymentLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Verifying your payment...</p>
      </div>
    </div>
  )
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<PaymentLoading />}>
      <PaymentResultClient />
    </Suspense>
  )
}
