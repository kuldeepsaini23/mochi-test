/**
 * Affiliate Tracker Component
 *
 * WHY: Automatically track affiliate referrals via URL parameter
 * HOW: Listens for 'ref' query parameter and sets 3-month cookie
 */

'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { setAffiliateCookie } from '@/lib/affiliate-cookie'

export function AffiliateTracker() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const affiliateCode = searchParams.get('ref')

    if (affiliateCode) {
      // Set cookie for 3 months
      setAffiliateCookie(affiliateCode)
    }
  }, [searchParams])

  // This component doesn't render anything
  return null
}
