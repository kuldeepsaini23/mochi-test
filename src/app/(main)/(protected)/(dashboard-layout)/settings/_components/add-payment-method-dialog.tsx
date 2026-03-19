'use client'

/**
 * Add Payment Method Dialog
 *
 * WHY: Allow users to add new payment methods to their organization
 * HOW: Uses Stripe Elements CardElement wrapped in a dialog
 */

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { AddPaymentMethodForm } from './add-payment-method-form'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

interface AddPaymentMethodDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  subscriptionStatus?: string
}

export function AddPaymentMethodDialog({
  open,
  onOpenChange,
  organizationId,
  subscriptionStatus,
}: AddPaymentMethodDialogProps) {
  const isPaymentFailed = subscriptionStatus === 'past_due'
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Payment Method</DialogTitle>
          <DialogDescription>
            Add a new payment method to your organization. Your payment information is securely
            processed by Stripe.
          </DialogDescription>
        </DialogHeader>

        <Elements stripe={stripePromise}>
          <AddPaymentMethodForm
            organizationId={organizationId}
            onSuccess={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
            isPaymentFailed={isPaymentFailed}
          />
        </Elements>
      </DialogContent>
    </Dialog>
  )
}
