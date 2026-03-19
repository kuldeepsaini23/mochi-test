'use client'

/**
 * Top-up Dialog Component
 *
 * WHY: Allow users to manually add funds to their wallet
 * HOW: Dialog with amount input and payment method selection
 *
 * FEATURES:
 * - Preset amounts with dynamic currency symbol from platform Stripe account
 * - Custom amount input
 * - Payment method selection (uses saved cards from billing)
 * - Minimum top-up: 1 unit of platform currency
 *
 * SOURCE OF TRUTH: TopUpDialog, WalletTopUp
 */

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { CreditCard, Loader2, Wallet, AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { usePlatformCurrency } from '@/components/providers/platform-currency-provider'

interface TopUpDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Handler called when top-up is submitted
   * For now this is just UI, will be wired up later
   */
  onTopUp?: (amount: number) => Promise<void>
  /**
   * Whether the top-up is in progress
   */
  isLoading?: boolean
}

/* Preset amount options (in display units of the platform currency) */
const PRESET_AMOUNTS = [1, 5, 10, 25]
const MINIMUM_AMOUNT = 1

export function TopUpDialog({
  open,
  onOpenChange,
  onTopUp,
  isLoading = false,
}: TopUpDialogProps) {
  const [selectedPreset, setSelectedPreset] = useState<number | null>(5)
  const [customAmount, setCustomAmount] = useState<string>('')
  const [useCustom, setUseCustom] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* Get platform currency symbol for dynamic display */
  const { symbol } = usePlatformCurrency()

  /**
   * Get the final amount to top up.
   * Returns amount in display units of the platform currency.
   */
  const getFinalAmount = (): number => {
    if (useCustom) {
      const parsed = parseFloat(customAmount)
      return isNaN(parsed) ? 0 : parsed
    }
    return selectedPreset ?? 0
  }

  const finalAmount = getFinalAmount()
  const isValidAmount = finalAmount >= MINIMUM_AMOUNT

  /**
   * Handle preset amount selection
   */
  const handlePresetSelect = (amount: number) => {
    setSelectedPreset(amount)
    setUseCustom(false)
    setCustomAmount('')
    setError(null)
  }

  /**
   * Handle custom amount input
   */
  const handleCustomAmountChange = (value: string) => {
    // Only allow numbers and decimal point
    const sanitized = value.replace(/[^0-9.]/g, '')
    setCustomAmount(sanitized)
    setUseCustom(true)
    setSelectedPreset(null)
    setError(null)
  }

  /**
   * Handle form submission
   */
  const handleSubmit = async () => {
    if (!isValidAmount) {
      setError(`Minimum top-up amount is ${symbol}${MINIMUM_AMOUNT}`)
      return
    }

    setError(null)

    if (onTopUp) {
      try {
        await onTopUp(finalAmount)
        // Reset form on success
        setSelectedPreset(25)
        setCustomAmount('')
        setUseCustom(false)
        onOpenChange(false)
      } catch (err) {
        setError('Failed to process top-up. Please try again.')
      }
    } else {
      // For now, just close since we're only building UI
      onOpenChange(false)
    }
  }

  /**
   * Reset form when dialog closes
   */
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setSelectedPreset(25)
      setCustomAmount('')
      setUseCustom(false)
      setError(null)
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Add Funds to Wallet
          </DialogTitle>
          <DialogDescription>
            Choose an amount to add to your organization wallet. Funds are used
            for usage-based services like AI, SMS, and more.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Preset Amounts — symbol comes from platform Stripe account */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Select Amount</Label>
            <div className="grid grid-cols-4 gap-2">
              {PRESET_AMOUNTS.map((amount) => (
                <Button
                  key={amount}
                  type="button"
                  variant={selectedPreset === amount && !useCustom ? 'default' : 'outline'}
                  className={cn(
                    'h-12 text-base font-semibold',
                    selectedPreset === amount && !useCustom && 'ring-2 ring-primary ring-offset-2'
                  )}
                  onClick={() => handlePresetSelect(amount)}
                >
                  {symbol}{amount}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom Amount */}
          <div className="space-y-3">
            <Label htmlFor="custom-amount" className="text-sm font-medium">
              Or enter custom amount
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                {symbol}
              </span>
              <Input
                id="custom-amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={customAmount}
                onChange={(e) => handleCustomAmountChange(e.target.value)}
                className={cn(
                  'pl-7 h-12 text-base font-semibold',
                  useCustom && 'ring-2 ring-primary ring-offset-2'
                )}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Minimum top-up: {symbol}{MINIMUM_AMOUNT}
            </p>
          </div>

          {/* Payment Method Note */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="flex items-start gap-3">
              <CreditCard className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Payment Method</p>
                <p className="text-xs text-muted-foreground">
                  Your default payment method on file will be charged. You can
                  update your payment methods in Billing settings.
                </p>
              </div>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!isValidAmount || isLoading}
            className="gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Add {symbol}{finalAmount.toFixed(2)}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
