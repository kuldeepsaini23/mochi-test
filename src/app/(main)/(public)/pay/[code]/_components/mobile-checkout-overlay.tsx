'use client'

import { ArrowLeft } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { CheckoutForm } from './checkout-form'
import { formatCurrency, getPaymentAmount } from './utils'
import type { Product, Price } from './types'

interface MobileCheckoutOverlayProps {
  paymentLinkId: string
  product: Product
  price: Price
  onBack: () => void
  /**
   * SOURCE OF TRUTH: ProductTestMode
   * When true, displays test mode badge and uses test Stripe keys.
   */
  testMode?: boolean
}

export function MobileCheckoutOverlay({
  paymentLinkId,
  product,
  price,
  onBack,
  testMode,
}: MobileCheckoutOverlayProps) {
  const buttonAmount = getPaymentAmount(price)
  const isSplitPayment = price.billingType === 'SPLIT_PAYMENT'

  return (
    <div className="min-h-screen bg-background animate-in fade-in duration-200">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b">
        <div className="px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="-ml-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Avatar className="h-8 w-8 rounded-lg shrink-0">
              {product.imageUrl && (
                <AvatarImage src={product.imageUrl} alt={product.name} className="object-cover" />
              )}
              <AvatarFallback className="rounded-lg bg-muted text-xs">
                {product.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{product.name}</div>
              <div className="text-xs text-muted-foreground">
                {formatCurrency(buttonAmount, price.currency)}
                {isSplitPayment && price.installments && (
                  <span className="ml-1">1/{price.installments}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 pb-8">
        <CheckoutForm paymentLinkId={paymentLinkId} priceId={price.id} price={price} testMode={testMode} />
      </main>
    </div>
  )
}
