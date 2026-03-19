/**
 * Affiliate Banner Component
 *
 * WHY: Show who referred the user on sign-up page
 * HOW: Displays affiliate user info with animation (copied from mochi-webprodigies)
 */

'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { trpc } from '@/trpc/react-provider'

interface AffiliateBannerProps {
  affiliateCode: string
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function AffiliateBanner({ affiliateCode }: AffiliateBannerProps) {
  const [shouldShow, setShouldShow] = useState(false)

  const { data: affiliateInfo, isLoading } =
    trpc.affiliate.getAffiliateInfo.useQuery({
      code: affiliateCode,
    })

  // Delay showing the banner for smooth animation
  useEffect(() => {
    if (affiliateInfo && !isLoading) {
      // Small delay to let the form render first
      const timer = setTimeout(() => {
        setShouldShow(true)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [affiliateInfo, isLoading])

  if (isLoading || !affiliateInfo) {
    return null
  }

  const initials = getInitials(affiliateInfo.name)

  return (
    <AnimatePresence mode="wait">
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          className="overflow-hidden"
        >
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <div className="relative h-6 w-6 rounded-full overflow-hidden bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground">
              {affiliateInfo.image ? (
                <Image
                  src={affiliateInfo.image}
                  alt={affiliateInfo.name}
                  fill
                  className="object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <span>
              Referred by{' '}
              <span className="font-medium text-foreground">
                {affiliateInfo.name}
              </span>{' '}
              ❤️
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
