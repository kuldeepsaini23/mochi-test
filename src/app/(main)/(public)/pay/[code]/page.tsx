/**
 * Public Checkout Page
 *
 * Allows customers to purchase products via payment links.
 * Uses Stripe Payment Element for 100+ payment methods.
 *
 * ROUTE: /pay/[code] (public, no auth required)
 */

import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createCaller } from '@/trpc/server'
import { CheckoutClient } from './_components/checkout-client'
import { CheckoutSkeleton } from './_components/checkout-skeleton'
import type { BillingInterval } from '@/generated/prisma'

interface PageProps {
  params: Promise<{ code: string }>
}

// Price type for mapping
interface PriceData {
  id: string
  name: string
  amount: number
  currency: string
  billingType: string
  interval: BillingInterval | null
  intervalCount: number | null
  installments: number | null
  installmentInterval: BillingInterval | null
  features: { id: string; name: string }[]
  /** SOURCE OF TRUTH: ProductPriceTrialDays */
  trialDays?: number | null
}

export default async function CheckoutPage({ params }: PageProps) {
  const { code } = await params

  // Fetch payment link data
  const api = await createCaller()
  let paymentLink
  try {
    paymentLink = await api.products.getPaymentLinkByCode({ code })
  } catch {
    notFound()
  }

  if (!paymentLink) {
    notFound()
  }

  // Extract organization and product info based on link type
  const organization =
    paymentLink.type === 'PRODUCT'
      ? paymentLink.product?.organization
      : paymentLink.price?.product.organization

  const product =
    paymentLink.type === 'PRODUCT'
      ? paymentLink.product
      : paymentLink.price?.product

  const prices =
    paymentLink.type === 'PRODUCT'
      ? paymentLink.product?.prices || []
      : paymentLink.price
        ? [paymentLink.price]
        : []

  if (!organization || !product || prices.length === 0) {
    notFound()
  }

  // Stripe Connect account must be connected
  if (!organization.stripeConnectedAccountId) {
    notFound()
  }

  return (
    <Suspense fallback={<CheckoutSkeleton />}>
      <CheckoutClient
        paymentLinkId={paymentLink.id}
        organization={{
          id: organization.id,
          name: organization.name,
          logo: organization.logo,
          stripeConnectedAccountId: organization.stripeConnectedAccountId,
        }}
        product={{
          id: product.id,
          name: product.name,
          description: product.description,
          imageUrl: product.imageUrl,
          /**
           * SOURCE OF TRUTH: ProductTestMode
           * When true, use test Stripe API keys for this checkout.
           * NOTE: Requires 'testMode' field in Product schema.
           */
          testMode: (product as { testMode?: boolean }).testMode,
        }}
        prices={prices.map((p: PriceData) => ({
          id: p.id,
          name: p.name,
          amount: p.amount,
          currency: p.currency,
          billingType: p.billingType as 'ONE_TIME' | 'RECURRING' | 'SPLIT_PAYMENT',
          interval: p.interval,
          intervalCount: p.intervalCount,
          installments: p.installments,
          installmentInterval: p.installmentInterval,
          features: p.features.map((f) => ({ id: f.id, name: f.name })),
          trialDays: p.trialDays,
        }))}
        defaultPriceId={paymentLink.type === 'PRICE' ? paymentLink.priceId : undefined}
      />
    </Suspense>
  )
}
