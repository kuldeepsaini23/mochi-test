'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { BILLING_TYPES } from '@/constants/billing'

interface CancelTransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isLoading: boolean
}

export function CancelTransactionDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: CancelTransactionDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel Transaction</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to cancel this transaction? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep Transaction</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? 'Canceling...' : 'Cancel Transaction'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface CancelSubscriptionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isLoading: boolean
  billingType: string
  totalPayments: number
  /** SOURCE OF TRUTH: Matches Transaction.successfulPayments from Prisma schema */
  successfulPayments: number
}

export function CancelSubscriptionDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
  billingType,
  totalPayments,
  successfulPayments,
}: CancelSubscriptionDialogProps) {
  const isRecurring = billingType === BILLING_TYPES.RECURRING

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel {isRecurring ? 'Subscription' : 'Payment Plan'}</AlertDialogTitle>
          <AlertDialogDescription>
            {isRecurring ? (
              <>
                Are you sure you want to cancel this subscription? The customer will no longer be charged and will lose
                access at the end of their current billing period.
              </>
            ) : (
              <>
                Are you sure you want to cancel this payment plan? The remaining {totalPayments - successfulPayments}{' '}
                installments will not be collected.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep Active</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? 'Canceling...' : `Cancel ${isRecurring ? 'Subscription' : 'Plan'}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
