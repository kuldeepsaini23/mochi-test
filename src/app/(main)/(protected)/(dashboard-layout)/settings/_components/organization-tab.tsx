'use client'

/**
 * Organization Settings Tab - Active Organization Pattern
 *
 * WHY: Allows organization owners/admins to manage organization settings
 * HOW: Uses useActiveOrganization hook for org context and permissions
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based access control via hasPermission helper
 *
 * PERMISSION: Requires organization-settings:read to view
 * Multi-query invalidation pattern: Updates invalidate ALL queries showing org data
 *   - organizationSettings.getOrganizationSettings (this page)
 *   - organization.getUserOrganizations (org selector)
 *   - organization.getActiveOrganization (active org hook)
 *   - user.getAccounts (TeamSwitcher)
 */

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Separator } from '@/components/ui/separator'
import { SectionHeader } from '@/components/global/section-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2, CheckCircle2, ImageIcon, X } from 'lucide-react'
import { trpc } from '@/trpc/react-provider'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { StorageBrowserModal } from '@/components/storage-browser/storage-browser-modal'
import type { SelectedFile } from '@/components/storage-browser/types'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

/**
 * Loading skeleton for the organization settings page
 * WHY: Provides visual feedback during initial load
 */
function OrganizationSettingsSkeleton() {
  return (
    <div className="space-y-8">
      {/* Basic Information Section Skeleton */}
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Separator />
        <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
          <div className="space-y-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-52" />
          </div>
          <div className="space-y-6 max-w-md">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-9 w-24" />
          </div>
        </div>
      </div>

      {/* Logos Section Skeleton */}
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Separator />
        <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
          <div className="space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="flex flex-wrap gap-6">
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-24 w-24" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-24 w-48" />
            </div>
          </div>
        </div>
      </div>

      {/* Custom Domain Section Skeleton */}
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Separator />
        <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
          <div className="space-y-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-60" />
          </div>
          <div className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function OrganizationTab() {
  /**
   * Get active organization from the hook
   * This respects domain-first approach and session activeOrganizationId
   */
  const { activeOrganization, isLoading: isLoadingOrg, hasPermission } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''

  /**
   * Check permission using hook's hasPermission helper
   * Owners have full access, members need explicit permission
   */
  const hasAccess = hasPermission(permissions.ORGANIZATION_SETTINGS_READ)

  /**
   * Get organization settings (requires permission)
   * WHY: Only fetch when we have access to avoid unnecessary API calls
   */
  const { data: orgSettings, isLoading: isLoadingSettings } = trpc.organizationSettings.getOrganizationSettings.useQuery(
    { organizationId },
    {
      enabled: !!organizationId && hasAccess,
      staleTime: Infinity,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    }
  )

  const utils = trpc.useUtils()

  /**
   * Mutations with multi-query invalidation
   * WHY: Ensures all components displaying org data update together
   */
  const updateOrganizationInfoMutation = trpc.organizationSettings.updateOrganizationInfo.useMutation({
    onSuccess: () => {
      // Invalidate ALL queries that display organization name
      utils.organizationSettings.getOrganizationSettings.invalidate()
      utils.organization.getUserOrganizations.invalidate()
      utils.user.getAccounts.invalidate()
      showMessage('success', 'Organization info updated successfully')
    },
    onError: (error: { message: string }) => {
      showMessage('error', error.message || 'Failed to update organization info')
    },
  })

  const updateDomainMutation = trpc.organizationSettings.updateCustomDomain.useMutation({
    onSuccess: (data: { success: boolean; organization: unknown; message?: string }) => {
      utils.organizationSettings.getOrganizationSettings.invalidate()
      utils.organization.getUserOrganizations.invalidate()
      utils.user.getAccounts.invalidate()
      showMessage('success', data.message || 'Custom domain updated')
    },
    onError: (error: { message: string }) => {
      showMessage('error', error.message || 'Failed to update custom domain')
    },
  })

  const removeDomainMutation = trpc.organizationSettings.removeCustomDomain.useMutation({
    onSuccess: () => {
      utils.organizationSettings.getOrganizationSettings.invalidate()
      utils.organization.getUserOrganizations.invalidate()
      utils.user.getAccounts.invalidate()
      setCustomDomain('')
      showMessage('success', 'Custom domain removed')
    },
    onError: () => {
      showMessage('error', 'Failed to remove custom domain')
    },
  })

  /**
   * Update square logo mutation with optimistic UI
   * WHY: Provides instant feedback when logo is changed
   */
  const updateLogoMutation = trpc.organizationSettings.updateLogo.useMutation({
    onMutate: async ({ logo }) => {
      await utils.organizationSettings.getOrganizationSettings.cancel()
      const previousData = utils.organizationSettings.getOrganizationSettings.getData({
        organizationId,
      })
      utils.organizationSettings.getOrganizationSettings.setData(
        { organizationId },
        (old) => (old ? { ...old, logo } : old)
      )
      return { previousData }
    },
    onSuccess: () => {
      utils.organizationSettings.getOrganizationSettings.invalidate()
      utils.organization.getUserOrganizations.invalidate()
      utils.user.getAccounts.invalidate()
      showMessage('success', 'Square logo updated successfully')
    },
    onError: (error, _, context) => {
      if (context?.previousData) {
        utils.organizationSettings.getOrganizationSettings.setData(
          { organizationId },
          context.previousData
        )
      }
      showMessage('error', error.message || 'Failed to update logo')
    },
  })

  /**
   * Update rectangle logo mutation with optimistic UI
   * WHY: Provides instant feedback when rectangle logo is changed
   */
  const updateRectangleLogoMutation = trpc.organizationSettings.updateRectangleLogo.useMutation({
    onMutate: async ({ rectangleLogo }) => {
      await utils.organizationSettings.getOrganizationSettings.cancel()
      const previousData = utils.organizationSettings.getOrganizationSettings.getData({
        organizationId,
      })
      utils.organizationSettings.getOrganizationSettings.setData(
        { organizationId },
        (old) => (old ? { ...old, rectangleLogo } : old)
      )
      return { previousData }
    },
    onSuccess: () => {
      utils.organizationSettings.getOrganizationSettings.invalidate()
      utils.organization.getUserOrganizations.invalidate()
      utils.user.getAccounts.invalidate()
      showMessage('success', 'Rectangle logo updated successfully')
    },
    onError: (error, _, context) => {
      if (context?.previousData) {
        utils.organizationSettings.getOrganizationSettings.setData(
          { organizationId },
          context.previousData
        )
      }
      showMessage('error', error.message || 'Failed to update rectangle logo')
    },
  })

  // Local state - initialize with organization data
  const [name, setName] = useState(orgSettings?.name || '')
  const [slug, setSlug] = useState(orgSettings?.slug || '')
  const [customDomain, setCustomDomain] = useState(orgSettings?.customDomain || '')
  const [message, setMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  // Logo storage modal state
  const [isSquareLogoModalOpen, setIsSquareLogoModalOpen] = useState(false)
  const [isRectangleLogoModalOpen, setIsRectangleLogoModalOpen] = useState(false)

  // Sync local state with organization data when it changes (after refetch)
  useEffect(() => {
    if (orgSettings?.name) setName(orgSettings.name)
    if (orgSettings?.slug) setSlug(orgSettings.slug)
    if (orgSettings?.customDomain) setCustomDomain(orgSettings.customDomain)
  }, [orgSettings?.name, orgSettings?.slug, orgSettings?.customDomain])

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const handleBasicInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!organizationId) return

    updateOrganizationInfoMutation.mutate({
      organizationId,
      name,
      slug,
    })
  }

  const handleDomainSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!organizationId || !customDomain) return

    updateDomainMutation.mutate({
      organizationId,
      domain: customDomain,
    })
  }

  const handleDomainRemove = async () => {
    if (!organizationId) return

    removeDomainMutation.mutate({
      organizationId,
    })
  }

  /**
   * Handle square logo selection from storage browser
   * WHY: Updates logo with optimistic UI for instant feedback
   */
  const handleSquareLogoSelect = (fileOrFiles: SelectedFile | SelectedFile[]) => {
    if (!organizationId) return
    const file = Array.isArray(fileOrFiles) ? fileOrFiles[0] : fileOrFiles
    if (!file) return

    const logoUrl = file.accessUrl || file.publicUrl || ''
    updateLogoMutation.mutate({
      organizationId,
      logo: logoUrl,
    })
    setIsSquareLogoModalOpen(false)
  }

  /**
   * Handle square logo removal
   */
  const handleSquareLogoRemove = () => {
    if (!organizationId) return
    updateLogoMutation.mutate({
      organizationId,
      logo: null,
    })
  }

  /**
   * Handle rectangle logo selection from storage browser
   * WHY: Updates rectangle logo with optimistic UI
   */
  const handleRectangleLogoSelect = (fileOrFiles: SelectedFile | SelectedFile[]) => {
    if (!organizationId) return
    const file = Array.isArray(fileOrFiles) ? fileOrFiles[0] : fileOrFiles
    if (!file) return

    const logoUrl = file.accessUrl || file.publicUrl || ''
    updateRectangleLogoMutation.mutate({
      organizationId,
      rectangleLogo: logoUrl,
    })
    setIsRectangleLogoModalOpen(false)
  }

  /**
   * Handle rectangle logo removal
   */
  const handleRectangleLogoRemove = () => {
    if (!organizationId) return
    updateRectangleLogoMutation.mutate({
      organizationId,
      rectangleLogo: null,
    })
  }

  // Show skeleton while loading organization data (only on initial load)
  if (isLoadingOrg && !activeOrganization) {
    return <OrganizationSettingsSkeleton />
  }

  // No organization found
  if (!activeOrganization) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="max-w-md text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            No organization found. Please contact your administrator.
          </p>
        </div>
      </div>
    )
  }

  // Permission denied state
  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="max-w-md text-center space-y-2">
          <p className="text-sm text-destructive font-medium">
            You don&apos;t have permission to view organization settings
          </p>
          <p className="text-xs text-muted-foreground">
            Contact your organization owner to grant you the{' '}
            <code className="px-1 py-0.5 bg-muted rounded text-xs">
              organization-settings:read
            </code>{' '}
            permission.
          </p>
        </div>
      </div>
    )
  }

  // Show skeleton while loading settings (only on initial load)
  if (isLoadingSettings && !orgSettings) {
    return <OrganizationSettingsSkeleton />
  }

  // Failed to load organization settings
  if (!orgSettings) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load organization settings</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-8">
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* Basic Information Section */}
      <div className="space-y-6">
        <SectionHeader
          title="Basic Information"
          description="Update your organization name and slug"
        />

        <Separator />

        <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
          <div className="space-y-1">
            <h4 className="text-sm font-medium">Organization Details</h4>
            <p className="text-sm text-muted-foreground">
              Your organization name and unique identifier
            </p>
          </div>

          <form onSubmit={handleBasicInfoSubmit} className="space-y-6 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="name">Organization Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Organization"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="acme-org"
                required
              />
              <p className="text-xs text-muted-foreground">
                Used in URLs and subdomain (lowercase, alphanumeric, and hyphens only)
              </p>
            </div>

            <Button
              type="submit"
              size="sm"
              disabled={
                updateOrganizationInfoMutation.isPending ||
                (name === orgSettings.name && slug === orgSettings.slug)
              }
            >
              {updateOrganizationInfoMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Update Info
            </Button>
          </form>
        </div>
      </div>

      {/* Organization Logos Section */}
      <div className="space-y-6">
        <SectionHeader
          title="Organization Logos"
          description="Upload your organization logos for branding"
        />

        <Separator />

        <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
          <div className="space-y-1">
            <h4 className="text-sm font-medium">Brand Logos</h4>
            <p className="text-sm text-muted-foreground">
              Square logo for icons and rectangle logo for headers
            </p>
          </div>

          <div className="flex flex-wrap gap-6">
            {/* Square Logo Placeholder */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Square Logo</Label>
              <div className="relative group">
                {orgSettings.logo && orgSettings.logo.trim() !== '' ? (
                  <div className="relative w-24 h-24 rounded-lg border overflow-hidden bg-muted/30">
                    <Image
                      src={orgSettings.logo}
                      alt="Square Logo"
                      fill
                      className="object-contain"
                    />
                    {/* Loading overlay during mutation */}
                    {updateLogoMutation.isPending && (
                      <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {/* Remove button - appears on hover (hidden during loading) */}
                    {!updateLogoMutation.isPending && (
                      <button
                        type="button"
                        onClick={handleSquareLogoRemove}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/50 hover:bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove logo"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsSquareLogoModalOpen(true)}
                    disabled={updateLogoMutation.isPending}
                    className="w-24 h-24 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 flex flex-col items-center justify-center gap-2 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {updateLogoMutation.isPending ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : (
                      <>
                        <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
                        <span className="text-xs text-muted-foreground">Add Logo</span>
                      </>
                    )}
                  </button>
                )}
                {/* Change button when logo exists */}
                {orgSettings.logo && orgSettings.logo.trim() !== '' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full text-xs"
                    onClick={() => setIsSquareLogoModalOpen(true)}
                    disabled={updateLogoMutation.isPending}
                  >
                    Change
                  </Button>
                )}
              </div>
            </div>

            {/* Rectangle Logo Placeholder */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Rectangle Logo</Label>
              <div className="relative group">
                {orgSettings.rectangleLogo && orgSettings.rectangleLogo.trim() !== '' ? (
                  <div className="relative w-48 h-24 rounded-lg border overflow-hidden bg-muted/30">
                    <Image
                      src={orgSettings.rectangleLogo}
                      alt="Rectangle Logo"
                      fill
                      className="object-contain"
                    />
                    {/* Loading overlay during mutation */}
                    {updateRectangleLogoMutation.isPending && (
                      <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {/* Remove button - appears on hover (hidden during loading) */}
                    {!updateRectangleLogoMutation.isPending && (
                      <button
                        type="button"
                        onClick={handleRectangleLogoRemove}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/50 hover:bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove logo"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsRectangleLogoModalOpen(true)}
                    disabled={updateRectangleLogoMutation.isPending}
                    className="w-48 h-24 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 flex flex-col items-center justify-center gap-2 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {updateRectangleLogoMutation.isPending ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : (
                      <>
                        <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
                        <span className="text-xs text-muted-foreground">Add Logo</span>
                      </>
                    )}
                  </button>
                )}
                {/* Change button when logo exists */}
                {orgSettings.rectangleLogo && orgSettings.rectangleLogo.trim() !== '' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full text-xs"
                    onClick={() => setIsRectangleLogoModalOpen(true)}
                    disabled={updateRectangleLogoMutation.isPending}
                  >
                    Change
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Storage Browser Modals */}
      {organizationId && (
        <>
          <StorageBrowserModal
            open={isSquareLogoModalOpen}
            onOpenChange={setIsSquareLogoModalOpen}
            organizationId={organizationId}
            fileFilter="image"
            mode="select"
            onSelect={handleSquareLogoSelect}
            title="Select Square Logo"
            subtitle="Choose an image for your square logo (recommended: 512x512px)"
          />
          <StorageBrowserModal
            open={isRectangleLogoModalOpen}
            onOpenChange={setIsRectangleLogoModalOpen}
            organizationId={organizationId}
            fileFilter="image"
            mode="select"
            onSelect={handleRectangleLogoSelect}
            title="Select Rectangle Logo"
            subtitle="Choose an image for your rectangle logo (recommended: 400x200px)"
          />
        </>
      )}

      {/* Custom Domain Section */}
      <div className="space-y-6">
        <SectionHeader
          title="Custom Domain"
          description="Use your own domain for white-labeling"
        />

        <Separator />

        <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
          <div className="space-y-1">
            <h4 className="text-sm font-medium">White-Label Domain</h4>
            <p className="text-sm text-muted-foreground">
              Connect your domain for a fully branded experience
            </p>
          </div>

          <div className="space-y-6 max-w-md">
            <form onSubmit={handleDomainSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customDomain">Domain Name</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="customDomain"
                    value={customDomain}
                    onChange={(e) => setCustomDomain(e.target.value.toLowerCase())}
                    placeholder="studio.yourdomain.com"
                  />
                </div>
                {orgSettings.customDomain && (
                  <p className="text-xs text-muted-foreground">
                    Add CNAME record pointing to your subdomain to verify
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    updateDomainMutation.isPending ||
                    !customDomain ||
                    customDomain === orgSettings.customDomain
                  }
                >
                  {updateDomainMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {orgSettings.customDomain ? 'Update Domain' : 'Add Domain'}
                </Button>

                {orgSettings.customDomain && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={removeDomainMutation.isPending}
                      >
                        Remove
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove custom domain?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove your custom domain configuration. You can add it
                          back later.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={handleDomainRemove}
                        >
                          Remove Domain
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Stripe Connect Section */}
      {orgSettings.stripeConnectedAccountId && (
        <div className="space-y-6">
          <SectionHeader
            title="Payment Account"
            description="Your Stripe Connect account for receiving platform fees"
          />

          <Separator />

          <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:gap-12">
            <div className="space-y-1">
              <h4 className="text-sm font-medium">Stripe Connect</h4>
              <p className="text-sm text-muted-foreground">
                Connected payment account
              </p>
            </div>

            <div className="space-y-4 max-w-md">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  Connected
                </Badge>
                <p className="text-sm text-muted-foreground">
                  Account ID: {orgSettings.stripeConnectedAccountId.slice(0, 20)}...
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
