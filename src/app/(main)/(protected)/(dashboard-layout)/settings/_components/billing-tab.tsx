'use client'

/**
 * Billing Tab Component - Active Organization Pattern
 *
 * WHY: Manage payment methods, subscription, and billing details
 * HOW: Uses useActiveOrganization hook for org context and permissions
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based access control for ACTIONS only (add, delete, cancel)
 *
 * VIEWING vs ACTIONS:
 * - All members can VIEW billing page (subscription status, masked payment methods)
 * - MODIFYING requires billing permissions (billing:create, billing:update)
 * - This prevents double-charges where members can't see org's existing cards
 */

import { useState } from 'react'
import { trpc } from '@/trpc/react-provider'
import { Separator } from '@/components/ui/separator'
import { SectionHeader } from '@/components/global/section-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  CreditCard,
  Plus,
  Check,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Calendar,
  Trash2,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { AddPaymentMethodDialog } from './add-payment-method-dialog'
import { UpgradeModal } from '@/components/upgrade-modal'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

/**
 * Loading skeleton for the billing settings page
 * WHY: Provides visual feedback during initial load
 */
function BillingSettingsSkeleton() {
  return (
    <div className="space-y-8">
      {/* Subscription Section Skeleton */}
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Separator />
        <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
          <div className="space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="space-y-6 max-w-md">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-5 w-20" />
              </div>
              <div className="space-y-2 text-right">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-20" />
              </div>
            </div>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-9 w-36" />
          </div>
        </div>
      </div>

      {/* Payment Methods Section Skeleton */}
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Separator />
        <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
          <div className="space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-52" />
          </div>
          <div className="space-y-4 max-w-md">
            <Skeleton className="h-4 w-full" />
            {/* Payment method card skeletons */}
            {[1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-md" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
                <Skeleton className="h-9 w-28" />
              </div>
            ))}
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      </div>

      {/* Security Section Skeleton */}
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Separator />
        <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="flex items-start gap-3 max-w-md">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-72" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function BillingTab() {
  const [isAddingCard, setIsAddingCard] = useState(false)
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false)
  const router = useRouter()

  /**
   * Get active organization from the hook
   * This respects domain-first approach and session activeOrganizationId
   */
  const {
    activeOrganization,
    isLoading: isLoadingOrg,
    hasPermission,
  } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''

  /**
   * Check permissions for ACTIONS only (not viewing)
   * WHY: All members can VIEW billing info (masked data, subscription status)
   * but only members with billing permissions can MODIFY (add/delete cards, cancel)
   */
  const hasBillingCreatePermission = hasPermission(permissions.BILLING_CREATE)
  const hasBillingUpdatePermission = hasPermission(permissions.BILLING_UPDATE)

  /**
   * Fetch tier data (includes subscription info) with aggressive caching
   * WHY: All members can view subscription status - enables instant re-navigation
   */
  const { data: tierData, isLoading: isLoadingTier } =
    trpc.usage.getTier.useQuery(
      { organizationId },
      {
        enabled: !!organizationId,
        staleTime: Infinity,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
      },
    )

  /**
   * Fetch payment methods with aggressive caching
   * WHY: All members can view masked payment methods - prevents double-charge scenario
   */
  const { data: paymentMethodsData, isLoading: isLoadingPaymentMethods } =
    trpc.payment.getPaymentMethods.useQuery(
      { organizationId },
      {
        enabled: !!organizationId,
        staleTime: Infinity,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
      },
    )

  /**
   * Set default payment method mutation with optimistic UI
   * WHY: Provides instant feedback when default payment method is changed
   */
  const utils = trpc.useUtils()
  const setDefaultMutation = trpc.payment.setDefaultPaymentMethod.useMutation({
    onMutate: async ({ paymentMethodId }) => {
      if (!organizationId) return

      await utils.payment.getPaymentMethods.cancel()
      const previousData = utils.payment.getPaymentMethods.getData({
        organizationId,
      })

      utils.payment.getPaymentMethods.setData({ organizationId }, (old) => {
        if (!old) return old
        return {
          ...old,
          defaultPaymentMethodId: paymentMethodId,
        }
      })

      return { previousData }
    },
    onError: (_err, _variables, context) => {
      if (context?.previousData && organizationId) {
        utils.payment.getPaymentMethods.setData(
          { organizationId },
          context.previousData,
        )
      }
      toast.error('Failed to set default payment method')
    },
    onSuccess: () => {
      toast.success('Default payment method updated')
    },
    onSettled: () => {
      utils.payment.getPaymentMethods.invalidate()
    },
  })

  /**
   * Cancel subscription mutation
   * WHY: Allows users to cancel their subscription
   */
  const cancelSubscriptionMutation =
    trpc.payment.cancelSubscription.useMutation({
      onSuccess: () => {
        toast.success('Subscription canceled successfully')
        utils.usage.getTier.invalidate({ organizationId })
        router.refresh()
      },
      onError: (error) => {
        toast.error(error.message || 'Failed to cancel subscription')
      },
    })

  /**
   * Reactivate subscription mutation
   * WHY: Allows users to reactivate a canceled subscription
   */
  const reactivateSubscriptionMutation =
    trpc.payment.reactivateSubscription.useMutation({
      onSuccess: () => {
        toast.success('Subscription reactivated successfully!')
        utils.usage.getTier.invalidate({ organizationId })
        router.refresh()
      },
      onError: (error) => {
        toast.error(error.message || 'Failed to reactivate subscription')
      },
    })

  /**
   * Delete payment method mutation
   * WHY: Allows users to remove saved payment methods
   */
  const deletePaymentMethodMutation =
    trpc.payment.deletePaymentMethod.useMutation({
      onSuccess: () => {
        toast.success('Payment method deleted')
        utils.payment.getPaymentMethods.invalidate({ organizationId })
      },
      onError: () => {
        toast.error('Failed to delete payment method')
      },
    })

  const handleSetDefault = (paymentMethodId: string) => {
    if (!organizationId) return
    setDefaultMutation.mutate({
      organizationId,
      paymentMethodId,
    })
  }

  const handleDeletePaymentMethod = (
    paymentMethodId: string,
    isDefault: boolean,
  ) => {
    if (!organizationId) return

    // Prevent deleting default payment method
    if (isDefault) {
      toast.error(
        'Cannot delete the default payment method. Set another card as default first.',
      )
      return
    }

    if (!confirm('Are you sure you want to delete this payment method?')) {
      return
    }

    deletePaymentMethodMutation.mutate({
      organizationId,
      paymentMethodId,
    })
  }

  const handleCancelSubscription = () => {
    if (!organizationId) return
    if (
      !confirm(
        'Are you sure you want to cancel your subscription? You will lose access at the end of your billing period.',
      )
    ) {
      return
    }
    cancelSubscriptionMutation.mutate({ organizationId })
  }

  const handleReactivateSubscription = () => {
    if (!organizationId) return
    reactivateSubscriptionMutation.mutate({ organizationId })
  }

  // Show skeleton while loading organization data (only on initial load)
  if (isLoadingOrg && !activeOrganization) {
    return <BillingSettingsSkeleton />
  }

  // No organization found
  if (!activeOrganization) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-sm text-muted-foreground">
          No active organization found. Please complete onboarding first.
        </p>
      </div>
    )
  }

  // NOTE: No permission check for VIEWING billing page
  // All members can view subscription status and masked payment methods
  // This prevents double-charge scenarios where members can't see org's cards
  // Modification actions (add, delete, cancel) still require billing permissions

  // Show skeleton while loading tier/payment data (only on initial load)
  if (
    (isLoadingTier && !tierData) ||
    (isLoadingPaymentMethods && !paymentMethodsData)
  ) {
    return <BillingSettingsSkeleton />
  }

  const paymentMethods = paymentMethodsData?.paymentMethods || []
  const defaultPaymentMethodId = paymentMethodsData?.defaultPaymentMethodId
  const subscription = tierData?.subscription
  const isCanceled = subscription?.cancelAtPeriodEnd || false
  const periodEnd = subscription?.periodEnd

  return (
    <>
      <AddPaymentMethodDialog
        open={isAddingCard}
        onOpenChange={setIsAddingCard}
        organizationId={organizationId}
        subscriptionStatus={subscription?.status}
      />

      <UpgradeModal
        open={isUpgradeOpen}
        onOpenChange={setIsUpgradeOpen}
        organizationId={organizationId}
      />

      <div className="space-y-8">
        {/* Subscription Section */}
        {subscription && (
          <div className="space-y-6">
            <SectionHeader
              title="Subscription"
              description="Manage your subscription plan and billing cycle"
            />

            <Separator />

            <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
              {/* Left Column - Description */}
              <div className="space-y-1">
                <h4 className="text-sm font-medium">Current Plan</h4>
                <p className="text-sm text-muted-foreground">
                  Your active subscription details
                </p>
              </div>

              {/* Right Column - Subscription Info */}
              <div className="space-y-6 max-w-md">
                {/* Canceled Subscription Alert */}
                {isCanceled && periodEnd && (
                  <Alert className="border-destructive bg-destructive/10">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <AlertTitle className="text-destructive">
                      Subscription Canceled
                    </AlertTitle>
                    <AlertDescription className="text-sm space-y-3">
                      <p>
                        Your subscription will end on{' '}
                        <strong>
                          {format(new Date(periodEnd), 'MMMM d, yyyy')}
                        </strong>
                        . All data will be permanently deleted.
                      </p>
                      <Button
                        onClick={handleReactivateSubscription}
                        disabled={reactivateSubscriptionMutation.isPending}
                        className="w-full gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg"
                        size="lg"
                      >
                        {reactivateSubscriptionMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Reactivating...
                          </>
                        ) : (
                          <>
                            <div className="flex flex-col">
                              <div className="flex gap-2 items-center">
                                <RefreshCw className="h-4 w-4 " />
                                Reactivate Subscription - Keep My Data!
                              </div>
                            </div>
                          </>
                        )}
                      </Button>
                      <small>
                        You will loose access to any discounts applied.
                      </small>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Plan Info */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Plan</Label>
                      <div className="flex items-center gap-2">
                        {/*
                         * Use planName (from PLANS config / env) for display
                         * WHY: Source of truth for plan names is PLANS.*.name in feature-gates.ts
                         * This ensures consistency with team switcher and other UI components
                         */}
                        <p className="text-sm font-medium">
                          {tierData?.planName}
                        </p>
                        {tierData?.isOnTrial && (
                          <Badge
                            variant="secondary"
                            className="text-xs"
                          >
                            Trial
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <Label>Billing</Label>
                      <p className="text-sm font-medium capitalize">
                        {tierData?.billingInterval || 'N/A'}
                      </p>
                    </div>
                  </div>

                  {subscription.periodEnd && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {isCanceled ? 'Ends' : 'Renews'} on{' '}
                        {format(
                          new Date(subscription.periodEnd),
                          'MMMM d, yyyy',
                        )}
                      </span>
                    </div>
                  )}

                  {!isCanceled && hasBillingUpdatePermission && (
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => setIsUpgradeOpen(true)}
                        size="sm"
                        className="gap-2"
                      >
                        <Sparkles className="h-4 w-4" />
                        Change Plan
                      </Button>
                      <Button
                        onClick={handleCancelSubscription}
                        disabled={cancelSubscriptionMutation.isPending}
                        variant="outline"
                        size="sm"
                        className="gap-2"
                      >
                        {cancelSubscriptionMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Canceling...
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="h-4 w-4" />
                            Cancel Subscription
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Payment Methods Section */}
        <div className="space-y-6">
          <SectionHeader
            title="Payment Methods"
            description="Manage your saved payment methods"
          />

          <Separator />

          <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
            {/* Left Column - Description */}
            <div className="space-y-1">
              <h4 className="text-sm font-medium">Saved Cards</h4>
              <p className="text-sm text-muted-foreground">
                Payment methods for your subscription.
              </p>
            </div>

            {/* Right Column - Payment Methods */}
            <div className="space-y-4 max-w-md">
              {paymentMethods.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center border border-dashed rounded-lg">
                  <CreditCard className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">
                    No payment methods on file
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Add a payment method to manage your subscription
                  </p>
                  {hasBillingCreatePermission && (
                    <Button
                      onClick={() => setIsAddingCard(true)}
                      variant="outline"
                      className="mt-4 gap-2"
                      size="sm"
                    >
                      <Plus className="h-4 w-4" />
                      Add Payment Method
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Always keep a 2nd card on file.
                  </p>
                  {paymentMethods.map((pm) => {
                    const isDefault = pm.id === defaultPaymentMethodId
                    const brandName = pm.brand?.toUpperCase() || 'CARD'

                    return (
                      <div
                        key={pm.id}
                        className="group relative flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent/50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-md border bg-background">
                            <CreditCard className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">
                                {brandName} **** {pm.last4}
                              </p>
                              {isDefault && (
                                <Badge
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  Default
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Expires {pm.expMonth}/{pm.expYear}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {!isDefault && hasBillingUpdatePermission && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSetDefault(pm.id)}
                              disabled={setDefaultMutation.isPending}
                              className="gap-2"
                            >
                              {setDefaultMutation.isPending &&
                              setDefaultMutation.variables?.paymentMethodId ===
                                pm.id ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Setting...
                                </>
                              ) : (
                                <>
                                  <Check className="h-4 w-4" />
                                  Set as Default
                                </>
                              )}
                            </Button>
                          )}

                          {hasBillingUpdatePermission && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                handleDeletePaymentMethod(pm.id, isDefault)
                              }
                              disabled={deletePaymentMethodMutation.isPending}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              {deletePaymentMethodMutation.isPending &&
                              deletePaymentMethodMutation.variables
                                ?.paymentMethodId === pm.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                              <span className="sr-only">
                                Delete payment method
                              </span>
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {hasBillingCreatePermission && (
                    <Button
                      onClick={() => setIsAddingCard(true)}
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Add New Payment Method
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
