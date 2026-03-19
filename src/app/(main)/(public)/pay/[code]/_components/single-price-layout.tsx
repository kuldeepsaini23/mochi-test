'use client'

import { OrganizationHeader } from './organization-header'
import { ProductInfo } from './product-info'
import { PriceSelector } from './price-selector'
import { CheckoutForm } from './checkout-form'
import type { Organization, Product, Price } from './types'

interface SinglePriceLayoutProps {
  paymentLinkId: string
  organization: Organization
  product: Product
  price: Price
  /**
   * SOURCE OF TRUTH: ProductTestMode
   * When true, displays test mode badge and uses test Stripe keys.
   */
  testMode?: boolean
}

export function SinglePriceLayout({
  paymentLinkId,
  organization,
  product,
  price,
  testMode,
}: SinglePriceLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12 lg:py-16">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
          {/* Left: Product Info */}
          <div className="space-y-6">
            <OrganizationHeader organization={organization} />
            <ProductInfo product={product} />
            <PriceSelector prices={[price]} selectedPriceId={price.id} onSelect={() => {}} />
          </div>

          {/* Right: Form */}
          <div className="lg:pl-8 lg:border-l">
            <CheckoutForm paymentLinkId={paymentLinkId} priceId={price.id} price={price} testMode={testMode} />
          </div>
        </div>
      </div>
    </div>
  )
}
