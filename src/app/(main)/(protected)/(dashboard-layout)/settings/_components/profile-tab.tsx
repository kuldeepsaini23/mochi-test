'use client'

/**
 * Profile Settings Tab - Blazing Fast Client-Side Caching
 *
 * WHY: Allows users to manage their personal information
 * HOW: Uses tRPC with aggressive caching for instant re-navigation
 *
 * CACHING ARCHITECTURE:
 * - Uses trpc.profile.getProfile with staleTime: Infinity
 * - Initial load: Shows skeleton while fetching
 * - Re-navigation: Instant render from cache (no skeleton)
 * - Optimistic updates for instant feedback
 * - Manual invalidation after successful mutations
 * - Updates propagate to all components displaying user data
 *
 * PERMISSION: No permission required - users can always edit their own profile
 */

import { useState, useEffect } from 'react'
import { Separator } from '@/components/ui/separator'
import { SectionHeader } from '@/components/global/section-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { AvailabilitySection } from './availability-section'

/**
 * Loading skeleton for the profile settings page
 * WHY: Provides visual feedback during initial load
 */
function ProfileSettingsSkeleton() {
  return (
    <div className="space-y-8">
      {/* Personal Information Section Skeleton */}
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Separator />
        <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
          <div className="space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="space-y-6 max-w-md">
            {/* Name Form Skeleton */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
              </div>
              <Skeleton className="h-9 w-28" />
            </div>
            {/* Email Form Skeleton */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-10 flex-1" />
                  <Skeleton className="h-6 w-20" />
                </div>
              </div>
              <Skeleton className="h-9 w-28" />
            </div>
          </div>
        </div>
      </div>

      {/* Security Section Skeleton */}
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Separator />
        <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-80" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ProfileTab() {
  /**
   * Get cached profile data with aggressive caching
   * WHY: Enables instant re-navigation without refetching
   */
  const { data: profile, isLoading } = trpc.profile.getProfile.useQuery(undefined, {
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

  const utils = trpc.useUtils()

  // Local state
  const [name, setName] = useState(profile?.name || '')
  const [email, setEmail] = useState(profile?.email || '')

  // Sync local state with profile data when it changes
  useEffect(() => {
    if (profile?.name) setName(profile.name)
    if (profile?.email) setEmail(profile.email)
  }, [profile?.name, profile?.email])

  /**
   * Update name mutation with optimistic UI
   * WHY: Provides instant feedback when name is updated
   */
  const updateNameMutation = trpc.profile.updateName.useMutation({
    onMutate: async (variables) => {
      // Cancel outgoing refetches for both queries
      await utils.profile.getProfile.cancel()
      await utils.user.getProfile.cancel()

      // Snapshot previous values
      const previousProfile = utils.profile.getProfile.getData()
      const previousUser = utils.user.getProfile.getData()

      // Optimistically update BOTH caches for instant UI updates
      utils.profile.getProfile.setData(undefined, (old) => {
        if (!old) return old
        return {
          ...old,
          name: variables.name,
        }
      })

      // Update sidebar cache instantly
      utils.user.getProfile.setData(undefined, (old) => {
        if (!old) return old
        return {
          ...old,
          name: variables.name,
        }
      })

      // Return context with previous values for rollback
      return { previousProfile, previousUser }
    },
    onSuccess: () => {
      // Invalidate all user-related queries to propagate changes
      utils.profile.getProfile.invalidate()
      utils.user.getProfile.invalidate()
      toast.success('Name updated successfully')
    },
    onError: (error, variables, context) => {
      // Rollback BOTH caches on error
      if (context?.previousProfile) {
        utils.profile.getProfile.setData(undefined, context.previousProfile)
      }
      if (context?.previousUser) {
        utils.user.getProfile.setData(undefined, context.previousUser)
      }
      toast.error('Failed to update name')
    },
    onSettled: () => {
      // Always refetch both after mutation completes
      utils.profile.getProfile.invalidate()
      utils.user.getProfile.invalidate()
    },
  })

  /**
   * Update email mutation with optimistic UI
   * WHY: Provides instant feedback when email is updated
   */
  const updateEmailMutation = trpc.profile.updateEmail.useMutation({
    onMutate: async (variables) => {
      // Cancel outgoing refetches for both queries
      await utils.profile.getProfile.cancel()
      await utils.user.getProfile.cancel()

      // Snapshot previous values
      const previousProfile = utils.profile.getProfile.getData()
      const previousUser = utils.user.getProfile.getData()

      // Optimistically update BOTH caches for instant UI updates
      utils.profile.getProfile.setData(undefined, (old) => {
        if (!old) return old
        return {
          ...old,
          email: variables.email,
          // Email verification will be reset on server
          emailVerified: false,
        }
      })

      // Update sidebar cache instantly
      utils.user.getProfile.setData(undefined, (old) => {
        if (!old) return old
        return {
          ...old,
          email: variables.email,
        }
      })

      // Return context with previous values for rollback
      return { previousProfile, previousUser }
    },
    onSuccess: (data: { success: boolean; user: unknown; message?: string }) => {
      // Invalidate all user-related queries to propagate changes
      utils.profile.getProfile.invalidate()
      utils.user.getProfile.invalidate()
      toast.success(data.message || 'Email updated successfully')
    },
    onError: (error: { message: string }, variables, context) => {
      // Rollback BOTH caches on error
      if (context?.previousProfile) {
        utils.profile.getProfile.setData(undefined, context.previousProfile)
      }
      if (context?.previousUser) {
        utils.user.getProfile.setData(undefined, context.previousUser)
      }
      toast.error(error.message || 'Failed to update email')
    },
    onSettled: () => {
      // Always refetch both after mutation completes
      utils.profile.getProfile.invalidate()
      utils.user.getProfile.invalidate()
    },
  })

  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    updateNameMutation.mutate({ name })
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    updateEmailMutation.mutate({ email })
  }

  // Show skeleton while loading profile data (only on initial load)
  if (isLoading && !profile) {
    return <ProfileSettingsSkeleton />
  }

  // Profile not found - should not happen but handle gracefully
  if (!profile) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="max-w-md text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            Unable to load profile. Please try refreshing the page.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Personal Information Section */}
      <div className="space-y-6">
        <SectionHeader
          title="Personal Information"
          description="Update your name and email address"
        />

        <Separator />

        <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
          {/* Left Column - Description */}
          <div className="space-y-1">
            <h4 className="text-sm font-medium">Basic Details</h4>
            <p className="text-sm text-muted-foreground">
              Manage your personal information
            </p>
          </div>

          {/* Right Column - Forms */}
          <div className="space-y-6 max-w-md">
            {/* Name Form */}
            <form onSubmit={handleNameSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  required
                />
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={updateNameMutation.isPending || name === profile.name}
              >
                {updateNameMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Update Name
              </Button>
            </form>

            {/* Email Form */}
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                  />
                  {profile.emailVerified ? (
                    <Badge variant="outline" className="gap-1 shrink-0">
                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                      Verified
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 shrink-0">
                      <XCircle className="h-3 w-3 text-destructive" />
                      Unverified
                    </Badge>
                  )}
                </div>
                {!profile.emailVerified && (
                  <p className="text-xs text-muted-foreground">
                    Please verify your email address
                  </p>
                )}
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={updateEmailMutation.isPending || email === profile.email}
              >
                {updateEmailMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Update Email
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Security Section */}
      <div className="space-y-6">
        <SectionHeader
          title="Security"
          description="Manage your password and two-factor authentication"
        />

        <Separator />

        <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
          {/* Left Column - Description */}
          <div className="space-y-1">
            <h4 className="text-sm font-medium">Account Security</h4>
            <p className="text-sm text-muted-foreground">
              Password and authentication settings
            </p>
          </div>

          {/* Right Column - Security Info */}
          <div className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label>Password</Label>
              <p className="text-sm text-muted-foreground">
                Password changes are managed through the sign-in page. Sign out and use
                &quot;Forgot Password&quot; to reset.
              </p>
            </div>

            {profile.twoFactorEnabled && (
              <div className="space-y-2">
                <Label>Two-Factor Authentication</Label>
                <Badge variant="outline" className="gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  Enabled
                </Badge>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Availability Section */}
      <AvailabilitySection />
    </div>
  )
}
