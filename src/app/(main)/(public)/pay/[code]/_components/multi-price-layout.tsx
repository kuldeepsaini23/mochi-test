'use client'

import { OrganizationHeader } from './organization-header'
import { ProductInfo } from './product-info'
import { PriceSelector } from './price-selector'
import { CheckoutForm } from './checkout-form'
import { MobileCheckoutFooter } from './mobile-checkout-footer'
import type { Organization, Product, Price } from './types'

interface MultiPriceLayoutProps {
  paymentLinkId: string
  organization: Organization
  product: Product
  prices: Price[]
  selectedPriceId: string
  selectedPrice: Price
  onPriceSelect: (priceId: string) => void
  onMobileCheckout: () => void
  /**
   * SOURCE OF TRUTH: ProductTestMode
   * When true, displays test mode badge and uses test Stripe keys.
   */
  testMode?: boolean
}

export function MultiPriceLayout({
  paymentLinkId,
  organization,
  product,
  prices,
  selectedPriceId,
  selectedPrice,
  onPriceSelect,
  onMobileCheckout,
  testMode,
}: MultiPriceLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12 lg:py-16">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
          {/* Left: Product Info & Price Selection */}
          <div className="space-y-6">
            <OrganizationHeader organization={organization} />
            <ProductInfo product={product} />
            <PriceSelector
              prices={prices}
              selectedPriceId={selectedPriceId}
              onSelect={onPriceSelect}
            />
          </div>

          {/* Right: Desktop Form Only */}
          <div className="hidden lg:block lg:pl-8 lg:border-l">
            <CheckoutForm
              paymentLinkId={paymentLinkId}
              priceId={selectedPriceId}
              price={selectedPrice}
              testMode={testMode}
            />
          </div>
        </div>
      </div>

      {/* Mobile: Sticky Footer */}
      <div className="lg:hidden">
        <div className="h-24" />
        <MobileCheckoutFooter price={selectedPrice} onContinue={onMobileCheckout} />
      </div>
    </div>
  )
}
