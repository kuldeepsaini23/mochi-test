/**
 * Portal Overview Page
 *
 * SOURCE OF TRUTH: Portal Dashboard/Overview
 * Shows platform-wide metrics and analytics charts.
 * Minimal design - follows same pattern as main dashboard.
 */

'use client'

import { useState } from 'react'
import { trpc } from '@/trpc/react-provider'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  PortalMRRChart,
  PortalActivityChart,
  PortalChurnChart,
  PortalFeesChart,
  PortalReferralChart,
  PortalDemographicsChart,
} from './_components'

export default function PortalOverviewPage() {
  const [orgName, setOrgName] = useState('')
  const utils = trpc.useUtils()

  // Fetch portal owner's organization
  // Track loading state to avoid flashing the setup card
  const { data: myOrg, isLoading: isLoadingMyOrg } =
    trpc.portal.getMyPortalOrganization.useQuery()

  // Create portal organization mutation
  const createOrgMutation = trpc.portal.createMyPortalOrganization.useMutation({
    onSuccess: () => {
      toast.success('Your portal organization has been created')
      utils.portal.getMyPortalOrganization.invalidate()
      utils.portal.getOrganizations.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create organization')
    },
  })

  const handleCreateOrg = () => {
    if (!orgName.trim()) {
      toast.error('Please enter an organization name')
      return
    }
    createOrgMutation.mutate({ name: orgName.trim() })
  }

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <h1 className="text-2xl font-semibold">Overview</h1>

      {/* Portal owner's personal organization setup - only show after loading completes */}
      {!isLoadingMyOrg && !myOrg && (
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <div className="space-y-1">
            <h2 className="font-medium">Set Up Your Portal Organization</h2>
            <p className="text-sm text-muted-foreground">
              As the portal owner, you get your own organization with unlimited
              features at no cost to manage your own websites, calendars and do
              everything a regular organization can do.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Input
              placeholder="Your organization name"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="max-w-[280px]"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateOrg()}
            />
            <Button
              onClick={handleCreateOrg}
              disabled={createOrgMutation.isPending || !orgName.trim()}
            >
              {createOrgMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Create
            </Button>
          </div>
        </div>
      )}

      {/* Analytics Charts - 2x2 Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* MRR Chart - Shows platform-wide recurring revenue */}
        <PortalMRRChart />

        {/* Platform Fees Chart - Shows fees earned from transactions */}
        <PortalFeesChart />

        {/* Activity Chart - Shows platform usage */}
        <PortalActivityChart />

        {/* Churn Chart - Shows subscription churn */}
        <PortalChurnChart />
      </div>

      {/* Onboarding Survey Insights — Who are our users and where do they come from */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Referral Sources — Donut chart showing discovery channels */}
        <PortalReferralChart />

        {/* User Demographics — Role, team size, and intended use breakdown */}
        <PortalDemographicsChart />
      </div>
    </div>
  )
}
