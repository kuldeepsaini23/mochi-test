'use client'

/**
 * Feature Gate Component
 *
 * SOURCE OF TRUTH KEYWORDS: FeatureGate, UsageGate, UpgradeTeaser
 *
 * WHY: Client-side feature limit checking with upgrade modal teaser
 * HOW: Wraps buttons/actions and intercepts clicks when at limit
 *
 * PATTERN: "Teaser" - Button is always visible and clickable, but when
 * the user has reached their limit, clicking shows upgrade modal instead
 * of proceeding with the action.
 *
 * USAGE:
 * ```tsx
 * <FeatureGate feature="forms.limit">
 *   <Button onClick={openCreateFormModal}>Create Form</Button>
 * </FeatureGate>
 * ```
 *
 * The button will work normally until the limit is reached.
 * When at limit, clicking shows the upgrade modal instead.
 *
 * IMPORTANT: This is a CLIENT-SIDE check for UX only.
 * Server-side enforcement still happens via withFeatureGate().
 */

import * as React from 'react'
import { trpc } from '@/trpc/react-provider'
import { useActiveOrganizationId } from '@/hooks/use-active-organization'
import { UpgradeModal } from '@/components/upgrade-modal'
import type { FeatureKey } from '@/lib/config/feature-gates'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Feature gate data for a single feature
 *
 * SOURCE OF TRUTH: FeatureGateData, SingleFeatureGate
 */
export interface FeatureGateData {
  usage: number
  limit: number | null
  atLimit: boolean
  isUnlimited: boolean
  featureName: string
}

/**
 * Combined feature gates data returned from the query
 *
 * SOURCE OF TRUTH: FeatureGatesResponse, AllFeatureGates
 */
export interface FeatureGatesData {
  tier: string
  planName: string
  isOnTrial: boolean | null
  isPortalOrganization: boolean
  gates: Record<string, FeatureGateData>
}

/**
 * Props for the FeatureGate component
 */
export interface FeatureGateProps {
  /** The feature key to check (e.g., "forms.limit") */
  feature: FeatureKey

  /** The child element to wrap - must accept onClick */
  children: React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>

  /**
   * Optional callback when feature is at limit
   * If not provided, upgrade modal is shown automatically
   */
  onLimitReached?: () => void

  /**
   * Whether to disable the child when loading
   * Default: false (optimistic - assume feature is available)
   */
  disableWhileLoading?: boolean
}

// ============================================================================
// HOOK: useFeatureGate
// ============================================================================

/**
 * Hook to check a single feature gate
 *
 * WHY: Provides easy access to feature gate data for conditional rendering
 * HOW: Uses the cached getFeatureGates query
 *
 * @param feature - The feature key to check
 * @returns Feature gate data or null if loading/not found
 *
 * @example
 * ```tsx
 * const gate = useFeatureGate('forms.limit')
 * if (gate?.atLimit) {
 *   // Show upgrade prompt
 * }
 * ```
 *
 * SOURCE OF TRUTH KEYWORDS: UseFeatureGate, FeatureGateHook
 */
export function useFeatureGate(feature: FeatureKey): FeatureGateData | null {
  const organizationId = useActiveOrganizationId()

  const { data } = trpc.usage.getFeatureGates.useQuery(
    { organizationId: organizationId! },
    {
      enabled: !!organizationId,
      // Long stale time - data is prefetched in layout
      staleTime: 1000 * 60 * 5, // 5 minutes
      // Keep in cache for session
      gcTime: 1000 * 60 * 30, // 30 minutes
    }
  )

  if (!data?.gates[feature]) return null

  return data.gates[feature]
}

/**
 * Hook to get all feature gates
 *
 * WHY: Provides access to full feature gates data
 * HOW: Uses the cached getFeatureGates query
 *
 * @returns Full feature gates data or null if loading
 *
 * SOURCE OF TRUTH KEYWORDS: UseFeatureGates, AllGatesHook
 */
export function useFeatureGates(): FeatureGatesData | null {
  const organizationId = useActiveOrganizationId()

  const { data } = trpc.usage.getFeatureGates.useQuery(
    { organizationId: organizationId! },
    {
      enabled: !!organizationId,
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
    }
  )

  return data ?? null
}

// ============================================================================
// COMPONENT: FeatureGate
// ============================================================================

/**
 * Feature Gate Wrapper Component
 *
 * Wraps a clickable element (button, link, etc.) and intercepts clicks
 * when the feature limit has been reached, showing an upgrade modal instead.
 *
 * The child element is always rendered and appears clickable.
 * This creates a "teaser" experience where users can see features
 * but are prompted to upgrade when they try to use them beyond their limit.
 *
 * @example
 * ```tsx
 * // Basic usage - shows upgrade modal when at limit
 * <FeatureGate feature="forms.limit">
 *   <Button onClick={() => setShowCreateModal(true)}>
 *     Create Form
 *   </Button>
 * </FeatureGate>
 *
 * // Custom limit handler
 * <FeatureGate
 *   feature="websites.limit"
 *   onLimitReached={() => toast.error('Upgrade to create more websites!')}
 * >
 *   <Button onClick={createWebsite}>New Website</Button>
 * </FeatureGate>
 * ```
 */
export function FeatureGate({
  feature,
  children,
  onLimitReached,
  disableWhileLoading = false,
}: FeatureGateProps) {
  const [showUpgradeModal, setShowUpgradeModal] = React.useState(false)
  const organizationId = useActiveOrganizationId()
  const gate = useFeatureGate(feature)

  // Clone the child element and wrap its onClick handler
  const wrappedChild = React.cloneElement(children, {
    onClick: (e: React.MouseEvent) => {
      // Check if at limit
      if (gate?.atLimit) {
        e.preventDefault()
        e.stopPropagation()

        // Call custom handler or show modal
        if (onLimitReached) {
          onLimitReached()
        } else {
          setShowUpgradeModal(true)
        }
        return
      }

      // Not at limit - call original onClick if it exists
      if (children.props.onClick) {
        children.props.onClick(e)
      }
    },
    // Optionally disable while loading
    ...(disableWhileLoading && !gate ? { disabled: true } : {}),
  })

  return (
    <>
      {wrappedChild}

      {/* Upgrade Modal - only rendered when needed */}
      {organizationId && (
        <UpgradeModal
          open={showUpgradeModal}
          onOpenChange={setShowUpgradeModal}
          organizationId={organizationId}
        />
      )}
    </>
  )
}

// ============================================================================
// COMPONENT: FeatureGateUsage (Optional Display Component)
// ============================================================================

/**
 * Optional component to display current usage
 *
 * @example
 * ```tsx
 * <FeatureGateUsage feature="forms.limit" />
 * // Renders: "2 / 5 forms used"
 * ```
 */
export function FeatureGateUsage({ feature }: { feature: FeatureKey }) {
  const gate = useFeatureGate(feature)

  if (!gate) return null
  if (gate.isUnlimited) return null

  return (
    <span className="text-sm text-muted-foreground">
      {gate.usage} / {gate.limit} {gate.featureName.toLowerCase()}
    </span>
  )
}

export default FeatureGate
