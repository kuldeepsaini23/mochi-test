'use client'

/**
 * Add Payment Method Form
 *
 * WHY: Stripe Elements form for collecting payment method details
 * HOW: Uses CardElement and creates payment method via Stripe API
 */

import { useState } from 'react'
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js'
import type { StripeCardElementChangeEvent } from '@stripe/stripe-js'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface AddPaymentMethodFormProps {
  organizationId: string
  onSuccess: () => void
  onCancel: () => void
  isPaymentFailed?: boolean
}

export function AddPaymentMethodForm({
  organizationId,
  onSuccess,
  onCancel,
  isPaymentFailed = false,
}: AddPaymentMethodFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const { theme } = useTheme()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isCardReady, setIsCardReady] = useState(false)

  // Force default when payment has failed - user MUST fix the failed payment
  const [setAsDefault, setSetAsDefault] = useState(isPaymentFailed)

  const utils = trpc.useUtils()
  const addPaymentMethodMutation = trpc.payment.addPaymentMethod.useMutation({
    onSuccess: () => {
      const successMessage = isPaymentFailed
        ? 'Payment retried successfully! Your subscription is now active.'
        : 'Payment method added successfully'

      toast.success(successMessage)

      // Invalidate payment methods cache
      utils.payment.getPaymentMethods.invalidate({ organizationId })

      // Invalidate tier cache (contains subscription status for banner)
      utils.usage.getTier.invalidate({ organizationId })

      // Refresh server-side data
      router.refresh()

      onSuccess()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to add payment method')
    },
  })

  // Dynamic styling based on theme
  const textColor = theme === 'dark' ? '#ffffff' : '#0f172a'
  const placeholderColor = theme === 'dark' ? '#71717a' : '#71717a'

  const handleCardChange = (event: StripeCardElementChangeEvent) => {
    if (event.error) {
      setError(event.error.message)
      setIsCardReady(false)
    } else {
      setError(null)
      setIsCardReady(event.complete)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) {
      return
    }

    setError(null)

    try {
      // Get card element
      const cardElement = elements.getElement(CardElement)

      if (!cardElement) {
        throw new Error('Card element not found')
      }

      // Create payment method
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

      // Add payment method via tRPC
      await addPaymentMethodMutation.mutateAsync({
        organizationId,
        paymentMethodId: paymentMethod.id,
        setAsDefault,
        retryFailedPayment: isPaymentFailed, // Retry payment if subscription is past_due
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  const isLoading = addPaymentMethodMutation.isPending

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6"
    >
      {/* Card Element */}
      <div className="space-y-2">
        <Label>Card Details</Label>
        <div className="border rounded-md p-3">
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
        {error && <p className="text-sm text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">
          Your payment information is securely processed by Stripe. We do not store your card
          details.
        </p>
      </div>

      {/* Set as Default Checkbox */}
      <div className="flex items-center space-x-2">
        <Checkbox
          id="setAsDefault"
          checked={setAsDefault}
          onCheckedChange={(checked) => setSetAsDefault(checked === true)}
          disabled={isPaymentFailed}
        />
        <label
          htmlFor="setAsDefault"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          Set as default payment method
          {isPaymentFailed && (
            <span className="text-xs text-orange-600 dark:text-orange-500 block mt-1">
              Required to retry failed payment
            </span>
          )}
        </label>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel
        </Button>

        <Button
          type="submit"
          disabled={!stripe || isLoading || !isCardReady}
        >
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isLoading ? 'Adding...' : 'Add Payment Method'}
        </Button>
      </div>
    </form>
  )
}
