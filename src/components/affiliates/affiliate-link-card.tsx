/**
 * Affiliate Link Card Component
 *
 * WHY: Display and copy affiliate referral link
 * HOW: Shows affiliate link with copy button
 */

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Copy, Check } from 'lucide-react'
import { trpc } from '@/trpc/react-provider'

export function AffiliateLinkCard() {
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState('')

  const { data, isLoading } = trpc.affiliate.getAffiliateLink.useQuery()

  // Set origin on client side only
  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const affiliateLink = data?.affiliateCode && origin
    ? `${origin}/sign-up?ref=${data.affiliateCode}`
    : ''

  const handleCopy = async () => {
    if (!affiliateLink) return

    try {
      // Modern clipboard API (requires secure context)
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(affiliateLink)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } else {
        // Fallback for non-secure contexts
        const textArea = document.createElement('textarea')
        textArea.value = affiliateLink
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()

        try {
          document.execCommand('copy')
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        } catch (err) {
          console.error('Fallback copy failed:', err)
        }

        document.body.removeChild(textArea)
      }
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  if (isLoading || !origin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your Affiliate Link</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-10 bg-muted animate-pulse rounded-md" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Affiliate Link</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Share this link to refer new users to Mochi. When they sign up using
          your link, they'll be tracked as your referral.
        </p>
        <div className="flex gap-2">
          <Input
            value={affiliateLink}
            readOnly
            className="font-mono text-sm"
          />
          <Button
            onClick={handleCopy}
            variant="outline"
            size="icon"
            className="shrink-0"
          >
            {copied ? (
              <Check className="size-4" />
            ) : (
              <Copy className="size-4" />
            )}
          </Button>
        </div>
        {data?.affiliateCode && (
          <div className="text-xs text-muted-foreground">
            Your affiliate code: <span className="font-mono">{data.affiliateCode}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
