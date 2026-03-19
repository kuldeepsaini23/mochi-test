/**
 * Referral Stats Card Component
 *
 * WHY: Display affiliate referral statistics
 * HOW: Shows total referrals and recent referrals
 */

'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { trpc } from '@/trpc/react-provider'
import { Users } from 'lucide-react'

export function ReferralStatsCard() {
  const { data: stats, isLoading: statsLoading } =
    trpc.affiliate.getReferralStats.useQuery()
  const { data: referrals, isLoading: referralsLoading } =
    trpc.affiliate.getReferrals.useQuery()

  const isLoading = statsLoading || referralsLoading

  return (
    <Card>
      <CardHeader>
        <CardTitle>Referral Statistics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total Referrals */}
        <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="bg-primary/10 rounded-full p-3">
            <Users className="size-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold">
              {isLoading ? '...' : stats?.totalReferrals || 0}
            </p>
            <p className="text-sm text-muted-foreground">Total Referrals</p>
          </div>
        </div>

        {/* Recent Referrals */}
        {referrals && referrals.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Recent Referrals</h4>
            <div className="space-y-2">
              {referrals.slice(0, 5).map((referral: { id: string; name: string; email: string; image: string | null; createdAt: string }) => (
                <div
                  key={referral.id}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <Avatar className="size-8">
                    <AvatarImage
                      src={referral.image || undefined}
                      alt={referral.name}
                    />
                    <AvatarFallback className="text-xs">
                      {referral.name
                        .split(' ')
                        .map((n: string) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {referral.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {referral.email}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(referral.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {referrals && referrals.length === 0 && !isLoading && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            No referrals yet. Share your link to get started!
          </div>
        )}
      </CardContent>
    </Card>
  )
}
