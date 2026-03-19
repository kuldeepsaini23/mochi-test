'use client'

/**
 * Payment Card Form
 * Custom Stripe Elements card input for collecting payment details
 */

import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js'
import type { StripeCardElementChangeEvent } from '@stripe/stripe-js'
import { useState } from 'react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface PaymentCardFormProps {
  onSubmit: (paymentMethodId: string) => Promise<void>
  onBack: () => void
  isProcessing?: boolean
}

export function PaymentCardForm({ onSubmit, onBack, isProcessing = false }: PaymentCardFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const { theme } = useTheme()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCardReady, setIsCardReady] = useState(false)

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

    setIsLoading(true)
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

      // Call parent handler with payment method ID
      await onSubmit(paymentMethod.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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

      {/* Action Buttons */}
      <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={isLoading || isProcessing}
          className="w-full sm:w-auto"
        >
          Back
        </Button>

        <Button
          type="submit"
          disabled={!stripe || isLoading || isProcessing || !isCardReady}
          className="w-full sm:w-auto"
        >
          {isLoading || isProcessing ? 'Processing...' : 'Complete Payment'}
        </Button>
      </div>
    </form>
  )
}
