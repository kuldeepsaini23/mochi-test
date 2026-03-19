'use client'

import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatCurrency } from '../../_components/utils'

interface RefundTransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transactionAmount: number
  currency: string
  refundAmount: string
  onRefundAmountChange: (value: string) => void
  refundReason: 'duplicate' | 'fraudulent' | 'requested_by_customer'
  onRefundReasonChange: (value: 'duplicate' | 'fraudulent' | 'requested_by_customer') => void
  refundError: string | null
  onSubmit: () => void
  isSubmitting: boolean
}

export function RefundTransactionDialog({
  open,
  onOpenChange,
  transactionAmount,
  currency,
  refundAmount,
  onRefundAmountChange,
  refundReason,
  onRefundReasonChange,
  refundError,
  onSubmit,
  isSubmitting,
}: RefundTransactionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund Transaction</DialogTitle>
          <DialogDescription>
            Process a full or partial refund for this transaction. The amount will be returned to the customer&apos;s
            payment method.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="refund-amount">Amount</Label>
            <Input
              id="refund-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={refundAmount}
              onChange={(e) => onRefundAmountChange(e.target.value)}
              placeholder={`Max ${formatCurrency(transactionAmount, currency)}`}
              className={cn(refundError && 'border-red-500')}
            />
            {refundError ? (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {refundError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Leave empty to refund full amount</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="refund-reason">Reason</Label>
            <Select value={refundReason} onValueChange={onRefundReasonChange}>
              <SelectTrigger id="refund-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="requested_by_customer">Requested by customer</SelectItem>
                <SelectItem value="duplicate">Duplicate charge</SelectItem>
                <SelectItem value="fraudulent">Fraudulent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting || !!refundError}>
            {isSubmitting ? 'Processing...' : 'Process Refund'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface RefundPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  paymentAmount: number | null
  currency: string
  refundAmount: string
  onRefundAmountChange: (value: string) => void
  refundReason: 'duplicate' | 'fraudulent' | 'requested_by_customer'
  onRefundReasonChange: (value: 'duplicate' | 'fraudulent' | 'requested_by_customer') => void
  refundError: string | null
  onSubmit: () => void
  isSubmitting: boolean
}

export function RefundPaymentDialog({
  open,
  onOpenChange,
  paymentAmount,
  currency,
  refundAmount,
  onRefundAmountChange,
  refundReason,
  onRefundReasonChange,
  refundError,
  onSubmit,
  isSubmitting,
}: RefundPaymentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund Payment</DialogTitle>
          <DialogDescription>
            Process a full or partial refund for this individual payment. The amount will be returned to the
            customer&apos;s payment method.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="payment-refund-amount">Amount</Label>
            <Input
              id="payment-refund-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={refundAmount}
              onChange={(e) => onRefundAmountChange(e.target.value)}
              placeholder={paymentAmount ? `Max ${formatCurrency(paymentAmount, currency)}` : ''}
              className={cn(refundError && 'border-red-500')}
            />
            {refundError ? (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {refundError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Leave empty to refund full amount</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment-refund-reason">Reason</Label>
            <Select value={refundReason} onValueChange={onRefundReasonChange}>
              <SelectTrigger id="payment-refund-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="requested_by_customer">Requested by customer</SelectItem>
                <SelectItem value="duplicate">Duplicate charge</SelectItem>
                <SelectItem value="fraudulent">Fraudulent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting || !!refundError}>
            {isSubmitting ? 'Processing...' : 'Process Refund'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
