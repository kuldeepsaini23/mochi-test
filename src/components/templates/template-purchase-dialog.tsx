/**
 * ============================================================================
 * TEMPLATE PURCHASE DIALOG — Stripe-powered payment for paid templates
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: TemplatePurchaseDialog, TemplatePurchaseForm,
 * TemplatePurchasePayment, TemplateStripePayment
 *
 * WHY: When a template has a price > 0, users must pay before the template is
 * installed. This dialog collects card details via Stripe Elements, creates a
 * PaymentMethod, then calls `templates.createPurchaseIntent` which charges the
 * card and installs the template in one atomic backend operation.
 *
 * HOW: Dialog wraps an inner form component that has access to Stripe Elements
 * context. The outer dialog manages open/close and renders the Elements wrapper.
 * The inner form handles card input, submission, and lifecycle states
 * (idle → processing → success → error).
 *
 * PATTERNS REPLICATED:
 * - CardElement styling from `onboarding/_components/payment-card-form.tsx`
 * - Elements wrapper from `onboarding/_components/stripe-elements-provider.tsx`
 * - Dialog structure from `template-install-dialog.tsx`
 */

'use client'

import { useState, useCallback } from 'react'
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import type { StripeCardElementChangeEvent } from '@stripe/stripe-js'
import { Loader2, CheckCircle, AlertCircle, CreditCard } from 'lucide-react'
import { useTheme } from 'next-themes'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

import { usePlatformCurrency } from '@/components/providers/platform-currency-provider'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { trpc } from '@/trpc/react-provider'

// ============================================================================
// STRIPE INITIALIZATION — Singleton promise reused across dialog mounts
// ============================================================================

/**
 * Stripe.js loaded with the platform publishable key.
 * This is the same key used by onboarding and other platform-level payments
 * (NOT the connected-account key used for org-level transactions).
 */
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

// ============================================================================
// DIALOG LIFECYCLE STATES
// ============================================================================

type PurchaseStatus = 'idle' | 'processing' | 'success' | 'error'

// ============================================================================
// PROPS
// ============================================================================

interface TemplatePurchaseDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback to control dialog open state */
  onOpenChange: (open: boolean) => void
  /** Template ID for the purchase mutation */
  templateId: string
  /** Template display name — shown in the dialog header */
  templateName: string
  /** Template price in cents — displayed formatted via usePlatformCurrency */
  price: number
}

// ============================================================================
// OUTER DIALOG — Wraps Stripe Elements around the inner form
// ============================================================================

/**
 * Purchase dialog for paid templates. Renders a Stripe Elements wrapper
 * around the inner payment form. The Elements provider must be an ancestor
 * of any component that calls useStripe() or useElements().
 */
export function TemplatePurchaseDialog({
  open,
  onOpenChange,
  templateId,
  templateName,
  price,
}: TemplatePurchaseDialogProps) {
  const { formatCurrency } = usePlatformCurrency()
  const { activeOrganization } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <Elements stripe={stripePromise}>
          <PurchaseForm
            templateId={templateId}
            templateName={templateName}
            price={price}
            formattedPrice={formatCurrency(price)}
            organizationId={organizationId}
            onClose={() => onOpenChange(false)}
          />
        </Elements>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// INNER FORM — Accesses Stripe Elements context for card input + submission
// ============================================================================

interface PurchaseFormProps {
  templateId: string
  templateName: string
  price: number
  formattedPrice: string
  /** Buyer's organization ID — required by the purchaseAndInstall tRPC procedure */
  organizationId: string
  onClose: () => void
}

/**
 * Inner form component that lives INSIDE the Elements provider.
 * Handles card input, payment method creation, and purchase mutation.
 *
 * Flow:
 * 1. User enters card details into CardElement
 * 2. On submit: stripe.createPaymentMethod() to tokenize the card
 * 3. Send paymentMethodId to templates.createPurchaseIntent tRPC mutation
 * 4. Backend charges the card and installs the template atomically
 * 5. Show success or error state
 */
function PurchaseForm({
  templateId,
  templateName,
  formattedPrice,
  organizationId,
  onClose,
}: PurchaseFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const { theme } = useTheme()
  const utils = trpc.useUtils()

  const [status, setStatus] = useState<PurchaseStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isCardReady, setIsCardReady] = useState(false)

  /** Dynamic card input styling based on the current theme (mirrors payment-card-form.tsx) */
  const textColor = theme === 'dark' ? '#ffffff' : '#0f172a'
  const placeholderColor = theme === 'dark' ? '#71717a' : '#71717a'

  /**
   * Track card element state — enable submit only when the card is complete
   * and there are no validation errors.
   */
  const handleCardChange = useCallback((event: StripeCardElementChangeEvent) => {
    if (event.error) {
      setErrorMessage(event.error.message)
      setIsCardReady(false)
    } else {
      setErrorMessage(null)
      setIsCardReady(event.complete)
    }
  }, [])

  /**
   * Purchase mutation — calls backend to charge the card and install the template.
   * On success, invalidates relevant caches so the install button updates immediately.
   */
  const purchaseMutation = trpc.templates.purchaseAndInstall.useMutation({
    onSuccess: () => {
      setStatus('success')
      /* Invalidate install check so the button switches to "Installed" */
      utils.templates.checkInstalled.invalidate()
      /* Invalidate browse library in case install count changed */
      utils.templates.browseLibrary.invalidate()
    },
    onError: (err) => {
      setStatus('error')
      setErrorMessage(err.message || 'Payment failed. Please try again.')
    },
  })

  /**
   * Handle form submission:
   * 1. Create a Stripe PaymentMethod from the card details
   * 2. Send it to the backend via tRPC mutation
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) return

    setStatus('processing')
    setErrorMessage(null)

    try {
      const cardElement = elements.getElement(CardElement)
      if (!cardElement) {
        throw new Error('Card element not found')
      }

      /* Tokenize the card — never send raw card data to our server */
      const { error: stripeError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      })

      if (stripeError) {
        throw new Error(stripeError.message || 'Failed to process card')
      }

      if (!paymentMethod) {
        throw new Error('Failed to create payment method')
      }

      /* Send tokenized payment method to the backend for charging + installation */
      purchaseMutation.mutate({
        organizationId,
        templateId,
        paymentMethodId: paymentMethod.id,
      })
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred')
    }
  }

  // --------------------------------------------------------------------------
  // SUCCESS STATE — Template purchased and installed
  // --------------------------------------------------------------------------
  if (status === 'success') {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Purchase Complete</DialogTitle>
          <DialogDescription>
            &quot;{templateName}&quot; has been purchased and installed into your organization.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-md bg-green-500/10 px-4 py-3 text-sm text-green-600">
          <CheckCircle className="h-5 w-5 shrink-0" />
          <span>Template installed successfully.</span>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </>
    )
  }

  // --------------------------------------------------------------------------
  // PAYMENT FORM STATE — idle, processing, or error
  // --------------------------------------------------------------------------
  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Purchase Template
        </DialogTitle>
        <DialogDescription>
          Buy &quot;{templateName}&quot; for {formattedPrice}. The template will be
          installed into your organization immediately after payment.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4">
        {/* Price summary line */}
        <div className="flex items-center justify-between rounded-md bg-muted px-4 py-3">
          <span className="text-sm font-medium">{templateName}</span>
          <span className="text-sm font-semibold">{formattedPrice}</span>
        </div>

        {/* Stripe CardElement — same styling as onboarding payment form */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Card Details</label>
          <div className="rounded-md border p-3">
            <CardElement
              options={{
                style: {
                  base: {
                    fontSize: '16px',
                    color: textColor,
                    '::placeholder': {
                      color: placeholderColor,
                    },
                  },
                  invalid: {
                    color: '#dc2626',
                  },
                },
                hidePostalCode: false,
              }}
              onChange={handleCardChange}
            />
          </div>

          {/* Error message below card input */}
          {status === 'error' && errorMessage && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Your payment is securely processed by Stripe. We do not store your card details.
          </p>
        </div>
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={status === 'processing'}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!stripe || !isCardReady || status === 'processing'}
        >
          {status === 'processing' ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : status === 'error' ? (
            `Retry ${formattedPrice}`
          ) : (
            `Pay ${formattedPrice}`
          )}
        </Button>
      </DialogFooter>
    </form>
  )
}
