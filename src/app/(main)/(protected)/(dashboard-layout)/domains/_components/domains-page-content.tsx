'use client'

/**
 * Domains Page Content — Split Tab Layout
 *
 * WHY: Separates website domains and email domains into independent tabs
 *      with their own creation flows, verification, and management.
 *
 * ARCHITECTURE:
 * - Two tabs: "Email Domains" and "Website Domains"
 * - Each tab has its own list, create dialog, and management actions
 * - Email domains use trpc.emailDomains.* endpoints
 * - Website domains use trpc.domains.* endpoints
 * - Permissions: domains:read/create/update/delete for website, email:read/send for email
 * - Feature gates: email_domains.limit (numeric), custom_domain (boolean)
 *
 * SOURCE OF TRUTH: DomainsPage, SplitDomainTabs
 */

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { ContentLayout } from '@/components/global/content-layout'
import { trpc } from '@/trpc/react-provider'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  Globe,
  Mail,
  Plus,
  Check,
  Copy,
  Clock,
  AlertCircle,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Loader2,
  Home,
  FileText,
  Info,
  CheckCircle2,
  XCircle,
  Settings2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { FeatureGate, useFeatureGate } from '@/components/feature-gate'
import { UpgradeButton } from '@/components/upgrade-button'
import type { ResendDnsRecord } from '@/lib/config/resend'
import type { EmailDomainStatus } from '@/generated/prisma'

// ============================================================================
// LOADING SKELETON
// ============================================================================

/**
 * Skeleton for the Domains page while organization data loads
 * WHY: Matches actual layout to minimize content shift on load
 */
function DomainsPageSkeleton() {
  return (
    <ContentLayout>
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-full max-w-xs" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </ContentLayout>
  )
}

// ============================================================================
// SHARED HELPERS
// ============================================================================

/**
 * Returns badge styling and icon for a given email domain status
 * WHY: Consistent visual treatment of verification states across the UI
 */
function getEmailStatusConfig(status: EmailDomainStatus) {
  switch (status) {
    case 'VERIFIED':
      return { label: 'Verified', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: Check }
    case 'PENDING':
      return { label: 'Pending', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: Clock }
    case 'FAILED':
      return { label: 'Failed', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: AlertCircle }
    case 'TEMPORARY_FAILURE':
      return { label: 'Retry', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: RefreshCw }
    case 'NOT_STARTED':
    default:
      return { label: 'Pending', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: Clock }
  }
}

/**
 * Returns badge styling and icon for website domain verification
 * WHY: Binary verified/pending status for website DNS records
 */
function getWebsiteVerificationStatus(isVerified: boolean) {
  if (isVerified) {
    return { label: 'Verified', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: Check }
  }
  return { label: 'Pending', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: Clock }
}

// ============================================================================
// COPY BUTTON — Clipboard copy with checkmark feedback
// ============================================================================

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator?.clipboard?.writeText(value).then(() => {
      setCopied(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="p-1 rounded hover:bg-muted transition-colors"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
      )}
    </button>
  )
}

// ============================================================================
// DOMAIN INPUT — Text input with real-time availability indicator
// ============================================================================

/**
 * Validates domain input and strips protocol/www prefixes
 * WHY: Users sometimes paste full URLs — we need a clean domain string
 */
function useDomainValidation(domainInput: string) {
  const hasProtocol = domainInput.includes('://')
  const hasWww = domainInput.toLowerCase().startsWith('www.')
  const hasInvalidPrefix = hasProtocol || hasWww
  const normalized = domainInput.replace(/\/$/, '').toLowerCase()
  const isValidFormat = !hasInvalidPrefix && !!normalized && normalized.length >= 4 && normalized.includes('.')

  return { hasProtocol, hasWww, hasInvalidPrefix, normalized, isValidFormat }
}

/**
 * Reusable domain input with availability checking and error display
 * WHY: Both email and website domain creation need the same input validation UX
 */
function DomainInput({
  value,
  onChange,
  isAvailable,
  isChecking,
  hasInvalidPrefix,
  hasProtocol,
  hasWww,
  unavailableMessage,
}: {
  value: string
  onChange: (val: string) => void
  isAvailable: boolean | undefined
  isChecking: boolean
  hasInvalidPrefix: boolean
  hasProtocol: boolean
  hasWww: boolean
  unavailableMessage?: string
}) {
  return (
    <div className="space-y-2">
      <Label>Domain</Label>
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          placeholder="example.com"
          className={cn(
            'font-mono pr-10',
            (hasInvalidPrefix || isAvailable === false) && 'border-destructive',
            !hasInvalidPrefix && isAvailable === true && 'border-green-500'
          )}
        />
        {/* Availability indicator */}
        {value && !hasInvalidPrefix && value.length >= 4 && value.includes('.') && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {isChecking ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : isAvailable === true ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : isAvailable === false ? (
              <XCircle className="h-4 w-4 text-destructive" />
            ) : null}
          </div>
        )}
        {/* Error for invalid prefix */}
        {hasInvalidPrefix && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <XCircle className="h-4 w-4 text-destructive" />
          </div>
        )}
      </div>
      {/* Validation error messages */}
      {hasProtocol ? (
        <p className="text-xs text-destructive">
          Do not include http:// or https:// - just enter the domain
        </p>
      ) : hasWww ? (
        <p className="text-xs text-destructive">
          Do not include www. - just enter the domain
        </p>
      ) : isAvailable === false ? (
        <p className="text-xs text-destructive">
          {unavailableMessage || 'This domain is already registered.'}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Enter your custom domain (e.g., webprodigies.com)
        </p>
      )}
    </div>
  )
}

// ============================================================================
// DNS RECORD TABLE — Shared table for both email and website DNS records
// ============================================================================

/**
 * Reusable DNS record table with copy buttons and status badges
 * WHY: Both email and website domains display DNS records in the same format
 *
 * @param records — Array of DNS records (website or email format)
 * @param icon — Icon component for the section header
 * @param title — Section header text
 * @param showPriority — Whether to show the priority column (email DNS has MX priority)
 * @param domainName — Used for MX records with empty name field
 * @param footnote — Help text below the table
 */
function DnsRecordTable({
  records,
  icon: Icon,
  title,
  showPriority = false,
  domainName,
  footnote,
}: {
  records: Array<{
    type: string
    name: string
    value: string
    status: string
    priority?: number
  }>
  icon: typeof Globe
  title: string
  showPriority?: boolean
  domainName?: string
  footnote?: string
}) {
  if (!records || records.length === 0) return null

  return (
    <div className="rounded-lg dark:bg-muted/80 bg-muted overflow-hidden border-border border ring-background ring-1 dark:shadow-lg">
      <div className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
        </div>
        <div className="rounded-md border dark:bg-background/40 bg-background overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
                {showPriority && (
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Priority</th>
                )}
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Value</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record, i) => {
                /* MX records on root domain have empty name — show "@" for display */
                const displayName = record.name || '@'
                const copyName = record.name || domainName || '@'

                return (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="font-mono text-[10px]">{record.type}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded break-all">{displayName}</code>
                        <CopyButton value={copyName} />
                      </div>
                    </td>
                    {showPriority && (
                      <td className="px-3 py-2">
                        {record.priority !== undefined ? (
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{record.priority}</code>
                        ) : (
                          <span className="text-xs text-muted-foreground">&mdash;</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <div className="flex items-start gap-1">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded break-all">{record.value}</code>
                        <CopyButton value={record.value} />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px]',
                          record.status === 'verified' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                          (record.status === 'pending' || record.status === 'not_started') && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                          record.status === 'failed' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        )}
                      >
                        {record.status === 'not_started' ? 'Pending' :
                         record.status === 'pending' ? 'Pending' :
                         record.status === 'verified' ? 'Verified' :
                         record.status === 'failed' ? 'Failed' : record.status}
                      </Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {footnote && (
          <p className="text-[10px] text-muted-foreground/80 mt-2">{footnote}</p>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// DEFAULT PAGE SECTION — Dropdown for website domain root page
// ============================================================================

/**
 * Lets users select which page loads when visiting the domain root
 *
 * WHY: Without a default page, visiting example.com shows a 404
 * HOW: Fetches published pages via trpc.domains.getPages, sets via setDefaultPage
 *
 * EDGE CASES:
 * - No websites yet -> message to create one
 * - Websites exist but no published pages -> message to publish
 * - Pages available -> dropdown selection
 */
function DefaultPageSection({
  organizationId,
  domainId,
}: {
  organizationId: string
  domainId: string
}) {
  const utils = trpc.useUtils()

  const { data, isLoading } = trpc.domains.getPages.useQuery(
    { organizationId, domainId },
    { staleTime: 0 }
  )

  const setDefaultPageMutation = trpc.domains.setDefaultPage.useMutation({
    onSuccess: () => {
      utils.domains.getPages.invalidate({ organizationId, domainId })
    },
  })

  if (isLoading) {
    return (
      <div className="rounded-lg dark:bg-muted/80 bg-muted overflow-hidden border-border border ring-background ring-1">
        <div className="p-3 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (!data?.hasWebsites) {
    return (
      <div className="rounded-lg dark:bg-muted/80 bg-muted overflow-hidden border-border border ring-background ring-1">
        <div className="p-3">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-foreground">No Default Page Available</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Create a website and publish a page first. Then you can select it as the default page for this domain.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!data?.hasPages) {
    return (
      <div className="rounded-lg dark:bg-muted/80 bg-muted overflow-hidden border-border border ring-background ring-1">
        <div className="p-3">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-foreground">No Published Pages</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Publish at least one page to set it as the default. Only published pages can be the landing page for your domain.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg dark:bg-muted/80 bg-muted overflow-hidden border-border border ring-background ring-1">
      <div className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <Home className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-medium text-muted-foreground">Default Page</p>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          When visitors access the root of this domain, they will be redirected to this page.
        </p>
        <Select
          value={data.currentDefaultPageId || 'none'}
          onValueChange={(value) => {
            setDefaultPageMutation.mutate({
              organizationId,
              domainId,
              defaultPageId: value === 'none' ? null : value,
            })
          }}
          disabled={setDefaultPageMutation.isPending}
        >
          <SelectTrigger className="w-full h-9 text-sm">
            <SelectValue placeholder="Select a default page" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">No default page</span>
              </div>
            </SelectItem>
            {data.pages.map((page) => (
              <SelectItem key={page.id} value={page.id}>
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{page.name}</span>
                  <span className="text-muted-foreground text-[10px]">
                    ({page.websiteName} / {page.slug})
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {setDefaultPageMutation.isPending && (
          <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving...
          </p>
        )}
        {setDefaultPageMutation.error && (
          <p className="text-[10px] text-destructive mt-2">
            {setDefaultPageMutation.error.message}
          </p>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// EMAIL SETTINGS SECTION — Sending toggle + tracking settings
// ============================================================================

/**
 * Manages email sending and tracking toggles for an email domain
 *
 * WHY: Users need fine-grained control over email sending behavior
 * HOW: Uses optimistic local state for instant toggle feedback,
 *      reverts on mutation error
 */
function EmailSettingsSection({
  organizationId,
  emailDomainId,
  sendingEnabled: sendingEnabledProp,
  openTracking: openTrackingProp,
  clickTracking: clickTrackingProp,
}: {
  organizationId: string
  emailDomainId: string
  sendingEnabled: boolean
  openTracking: boolean
  clickTracking: boolean
}) {
  const utils = trpc.useUtils()

  /* Optimistic local state — instant toggle without waiting for server */
  const [localSending, setLocalSending] = useState(sendingEnabledProp)
  const [localOpenTracking, setLocalOpenTracking] = useState(openTrackingProp)
  const [localClickTracking, setLocalClickTracking] = useState(clickTrackingProp)

  const toggleSendingMutation = trpc.emailDomains.toggleSending.useMutation({
    onSuccess: () => {
      utils.emailDomains.list.invalidate()
      utils.emailDomains.getById.invalidate()
    },
    onError: (error) => {
      setLocalSending(sendingEnabledProp)
      toast.error('Failed to toggle sending', { description: error.message })
    },
  })

  const updateTrackingMutation = trpc.emailDomains.updateTracking.useMutation({
    onSuccess: () => {
      utils.emailDomains.list.invalidate()
      utils.emailDomains.getById.invalidate()
      toast.success('Tracking settings updated')
    },
    onError: (error) => {
      setLocalOpenTracking(openTrackingProp)
      setLocalClickTracking(clickTrackingProp)
      toast.error('Failed to update tracking', { description: error.message })
    },
  })

  return (
    <div className="rounded-lg dark:bg-muted/80 bg-muted overflow-hidden border-border border ring-background ring-1">
      <div className="p-3">
        <div className="flex items-center gap-2 mb-3">
          <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-medium text-muted-foreground">Email Settings</p>
        </div>
        <div className="space-y-3">
          {/* Sending Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor={`sending-${emailDomainId}`} className="text-sm font-medium cursor-pointer">
                Email Sending
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Enable or disable sending emails from this domain
              </p>
            </div>
            <Switch
              id={`sending-${emailDomainId}`}
              checked={localSending}
              disabled={toggleSendingMutation.isPending}
              onCheckedChange={(checked) => {
                setLocalSending(checked)
                toggleSendingMutation.mutate({
                  organizationId,
                  domainId: emailDomainId,
                  enabled: checked,
                })
              }}
            />
          </div>

          <div className="border-t border-border/50" />

          {/* Open Tracking Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor={`open-tracking-${emailDomainId}`} className="text-sm font-medium cursor-pointer">
                Open Tracking
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Track when recipients open your emails
              </p>
            </div>
            <Switch
              id={`open-tracking-${emailDomainId}`}
              checked={localOpenTracking}
              disabled={updateTrackingMutation.isPending}
              onCheckedChange={(checked) => {
                setLocalOpenTracking(checked)
                updateTrackingMutation.mutate({
                  organizationId,
                  domainId: emailDomainId,
                  openTracking: checked,
                  clickTracking: localClickTracking,
                })
              }}
            />
          </div>

          {/* Click Tracking Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor={`click-tracking-${emailDomainId}`} className="text-sm font-medium cursor-pointer">
                Click Tracking
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Track when recipients click links in your emails
              </p>
            </div>
            <Switch
              id={`click-tracking-${emailDomainId}`}
              checked={localClickTracking}
              disabled={updateTrackingMutation.isPending}
              onCheckedChange={(checked) => {
                setLocalClickTracking(checked)
                updateTrackingMutation.mutate({
                  organizationId,
                  domainId: emailDomainId,
                  openTracking: localOpenTracking,
                  clickTracking: checked,
                })
              }}
            />
          </div>

          <p className="text-[10px] text-muted-foreground/80 pt-1 border-t border-border/50">
            Note: Tracking may affect deliverability. Disabled by default for best inbox placement.
          </p>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// EMAIL DOMAINS TAB
// ============================================================================

/**
 * Full email domain management tab — list, create, verify, delete, settings
 *
 * WHY: Email domains are managed independently from website domains
 * HOW: Uses trpc.emailDomains.* endpoints for all operations
 *
 * FEATURES:
 * - Paginated list with live Resend status
 * - Create dialog with availability check + optional website domain creation
 * - Expandable rows with DNS records and settings
 * - Feature gated create button (email_domains.limit)
 */
function EmailDomainsTab({
  organizationId,
  hasCreatePermission,
  hasUpdatePermission,
  hasDeletePermission,
}: {
  organizationId: string
  hasCreatePermission: boolean
  hasUpdatePermission: boolean
  hasDeletePermission: boolean
}) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [domainInput, setDomainInput] = useState('')
  const [alsoCreateWebsite, setAlsoCreateWebsite] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const utils = trpc.useUtils()

  /* Feature gate for the "Also create website domain" checkbox */
  const customDomainGate = useFeatureGate('custom_domain')
  const websiteGateBlocked = customDomainGate?.atLimit === true

  /* Domain input validation */
  const { hasProtocol, hasWww, hasInvalidPrefix, normalized, isValidFormat } = useDomainValidation(domainInput)

  /* Real-time availability check for email domain (global uniqueness) */
  const { data: emailAvailability, isFetching: isCheckingEmail } =
    trpc.emailDomains.checkAvailability.useQuery(
      { name: normalized },
      {
        enabled: showCreateDialog && isValidFormat,
        staleTime: 1000,
      }
    )

  /* Fetch email domain list */
  const { data: listData, isLoading: isLoadingList } = trpc.emailDomains.list.useQuery(
    { organizationId, page: 1, pageSize: 50 },
    { staleTime: 0 }
  )

  /* Create email domain mutation */
  const createEmailMutation = trpc.emailDomains.create.useMutation()

  /* Create website domain mutation (for the checkbox option) */
  const createWebsiteMutation = trpc.domains.create.useMutation()

  /* Delete email domain mutation */
  const deleteEmailMutation = trpc.emailDomains.delete.useMutation({
    onSuccess: () => {
      utils.emailDomains.list.invalidate()
      utils.usage.getFeatureGates.invalidate()
      setDeleteId(null)
      toast.success('Email domain deleted')
    },
    onError: (error) => {
      toast.error('Failed to delete email domain', { description: error.message })
    },
  })

  /* Verify email domain mutation */
  const verifyEmailMutation = trpc.emailDomains.verify.useMutation({
    onSuccess: () => {
      utils.emailDomains.list.invalidate()
      utils.emailDomains.getById.invalidate()
      toast.success('Verification triggered. Check back in a few minutes.')
    },
    onError: (error) => {
      toast.error('Verification failed', { description: error.message })
    },
  })

  /**
   * Handle email domain creation with optional website domain
   *
   * WHY: Two independent try-catch blocks so email domain failure
   *      does not prevent website domain creation and vice versa
   */
  const handleCreateEmailDomain = useCallback(async () => {
    let emailSuccess = false
    let websiteSuccess = false

    /* Try-catch #1: Create email domain (primary action) */
    try {
      await createEmailMutation.mutateAsync({
        organizationId,
        name: normalized,
      })
      emailSuccess = true
    } catch {
      toast.error('Failed to create email domain')
      return
    }

    /* Try-catch #2: Optionally create website domain (independent) */
    if (alsoCreateWebsite) {
      try {
        await createWebsiteMutation.mutateAsync({
          organizationId,
          customDomain: normalized,
        })
        websiteSuccess = true
      } catch {
        /* Website creation failed but email succeeded — not blocking */
      }
    }

    /* Show appropriate toast based on results */
    if (emailSuccess && websiteSuccess) {
      toast.success('Email domain created. Website domain also added.')
    } else if (emailSuccess && alsoCreateWebsite && !websiteSuccess) {
      toast.info('Email domain created. Website domain could not be added — create it separately in the Website Domains tab.')
    } else if (emailSuccess) {
      toast.success('Email domain added. Configure DNS records to start sending.')
    }

    /* Invalidate queries and reset dialog state */
    utils.emailDomains.list.invalidate()
    utils.domains.list.invalidate()
    utils.usage.getFeatureGates.invalidate()
    setShowCreateDialog(false)
    setDomainInput('')
    setAlsoCreateWebsite(false)
  }, [normalized, organizationId, alsoCreateWebsite, createEmailMutation, createWebsiteMutation, utils])

  /* Get expanded email domain detail with DNS records */
  const { data: expandedDetail } = trpc.emailDomains.getById.useQuery(
    { organizationId, domainId: expandedId! },
    { enabled: !!expandedId, staleTime: 30000 }
  )

  const domains = listData?.domains || []

  if (isLoadingList) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with create button */}
      <div className="flex justify-end">
        {hasCreatePermission && (
          <FeatureGate feature="email_domains.limit">
            <Button size="sm" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add Email Domain
            </Button>
          </FeatureGate>
        )}
      </div>

      {/* Email Domain List */}
      {domains.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed p-8 text-center">
          <Mail className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">No email domains yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a domain to send branded emails from your custom address
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {domains.map((domain) => {
            const statusConfig = getEmailStatusConfig(domain.status)
            const StatusIcon = statusConfig.icon
            const isExpanded = expandedId === domain.id
            const needsVerify = domain.status !== 'VERIFIED'

            return (
              <div key={domain.id} className="rounded-xl dark:bg-muted/50 border overflow-hidden">
                {/* Row header — domain name, status, actions */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : domain.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 transition-colors text-left cursor-pointer"
                >
                  <div className="text-muted-foreground">
                    {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </div>
                  <Mail className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">{domain.name}</span>
                  <div className="flex-1" />

                  {/* Status badge */}
                  <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0.5', statusConfig.className)}>
                    <StatusIcon className="h-3 w-3 mr-0.5" />
                    {statusConfig.label}
                  </Badge>

                  {/* Verify button */}
                  {needsVerify && hasUpdatePermission && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={(e) => {
                        e.stopPropagation()
                        verifyEmailMutation.mutate({ organizationId, domainId: domain.id })
                      }}
                      disabled={verifyEmailMutation.isPending}
                    >
                      {verifyEmailMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        'Verify'
                      )}
                    </Button>
                  )}

                  {/* Delete button */}
                  {hasDeletePermission && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteId(domain.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </button>

                {/* Expanded detail — DNS records + settings */}
                {isExpanded && expandedDetail && (
                  <div className="p-1 space-y-1">
                    {/* Email DNS Records */}
                    <DnsRecordTable
                      records={expandedDetail.dnsRecords.map((r: ResendDnsRecord) => ({
                        type: r.type,
                        name: r.name,
                        value: r.value,
                        status: r.status,
                        priority: r.priority,
                      }))}
                      icon={Mail}
                      title="Email DNS Records"
                      showPriority
                      domainName={domain.name}
                      footnote="Add these records at your DNS provider. Verification may take a few minutes."
                    />

                    {/* Email Settings — only show when user has update permission */}
                    {hasUpdatePermission && (
                      <EmailSettingsSection
                        organizationId={organizationId}
                        emailDomainId={domain.id}
                        sendingEnabled={expandedDetail.sendingEnabled}
                        openTracking={expandedDetail.openTracking}
                        clickTracking={expandedDetail.clickTracking}
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Create Email Domain Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open)
        if (!open) {
          setDomainInput('')
          setAlsoCreateWebsite(false)
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Email Domain</DialogTitle>
            <DialogDescription>
              Register a custom domain with Resend to send branded emails
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleCreateEmailDomain()
            }}
            className="space-y-4"
          >
            <DomainInput
              value={domainInput}
              onChange={setDomainInput}
              isAvailable={emailAvailability?.available}
              isChecking={isCheckingEmail}
              hasInvalidPrefix={hasInvalidPrefix}
              hasProtocol={hasProtocol}
              hasWww={hasWww}
              unavailableMessage="This domain is already registered for email sending."
            />

            {/* Checkbox: Also create website domain — shows upgrade button when gated */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="also-create-website"
                  checked={alsoCreateWebsite}
                  onCheckedChange={(checked) => setAlsoCreateWebsite(checked === true)}
                  disabled={websiteGateBlocked}
                />
                <Label
                  htmlFor="also-create-website"
                  className={cn(
                    'text-sm cursor-pointer',
                    websiteGateBlocked && 'text-muted-foreground cursor-not-allowed'
                  )}
                >
                  Also create a website domain
                </Label>
              </div>

              {/* Show upgrade button when website domains are gated on the current plan */}
              {websiteGateBlocked && (
                <UpgradeButton size="sm" label="Upgrade" />
              )}
            </div>

            {createEmailMutation.error && (
              <p className="text-sm text-destructive">{createEmailMutation.error.message}</p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  createEmailMutation.isPending ||
                  createWebsiteMutation.isPending ||
                  !isValidFormat ||
                  isCheckingEmail ||
                  emailAvailability?.available === false
                }
              >
                {(createEmailMutation.isPending || createWebsiteMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Add Email Domain
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete email domain?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the email domain from Resend. Emails can no longer be sent from this domain. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteId) return
                deleteEmailMutation.mutate({ organizationId, domainId: deleteId })
              }}
            >
              {deleteEmailMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ============================================================================
// WEBSITE DOMAINS TAB
// ============================================================================

/**
 * Full website domain management tab — list, create, verify, delete, DNS, default page
 *
 * WHY: Website domains are managed independently from email domains
 * HOW: Uses trpc.domains.* endpoints for all operations
 *
 * FEATURES:
 * - Paginated list with website count per domain
 * - Create dialog with global availability check
 * - Expandable rows with DNS records and default page selector
 * - Feature gated create (custom_domain boolean)
 */
function WebsiteDomainsTab({
  organizationId,
  hasCreatePermission,
  hasUpdatePermission,
  hasDeletePermission,
}: {
  organizationId: string
  hasCreatePermission: boolean
  hasUpdatePermission: boolean
  hasDeletePermission: boolean
}) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [domainInput, setDomainInput] = useState('')
  const [alsoCreateEmail, setAlsoCreateEmail] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const utils = trpc.useUtils()

  /* Feature gate for email_domains — used for "Also create email domain" checkbox */
  const emailDomainGate = useFeatureGate('email_domains.limit')
  const emailGateBlocked = emailDomainGate?.atLimit === true

  /* Domain input validation */
  const { hasProtocol, hasWww, hasInvalidPrefix, normalized, isValidFormat } = useDomainValidation(domainInput)

  /* Real-time availability check for website domain (global uniqueness) */
  const { data: websiteAvailability, isFetching: isCheckingWebsite } =
    trpc.domains.checkAvailability.useQuery(
      { customDomain: normalized },
      {
        enabled: showCreateDialog && isValidFormat,
        staleTime: 1000,
      }
    )

  /* Real-time availability check for email domain (for the checkbox option) */
  const { data: emailAvailability, isFetching: isCheckingEmail } =
    trpc.emailDomains.checkAvailability.useQuery(
      { name: normalized },
      {
        enabled: showCreateDialog && isValidFormat && alsoCreateEmail,
        staleTime: 1000,
      }
    )

  /* Fetch website domain list */
  const { data: listData, isLoading: isLoadingList } = trpc.domains.list.useQuery(
    { organizationId, page: 1, pageSize: 50 },
    { staleTime: 0 }
  )

  /* Create website domain mutation */
  const createWebsiteMutation = trpc.domains.create.useMutation()

  /* Create email domain mutation (for the checkbox option) */
  const createEmailMutation = trpc.emailDomains.create.useMutation()

  /* Delete website domain mutation */
  const deleteWebsiteMutation = trpc.domains.delete.useMutation({
    onSuccess: () => {
      utils.domains.list.invalidate()
      utils.usage.getFeatureGates.invalidate()
      setDeleteId(null)
      toast.success('Website domain deleted')
    },
    onError: (error) => {
      toast.error('Failed to delete website domain', { description: error.message })
    },
  })

  /* Verify website domain DNS mutation */
  const verifyWebsiteMutation = trpc.domains.verifyDomain.useMutation({
    onSuccess: (data) => {
      utils.domains.list.invalidate()
      utils.domains.getDnsInstructions.invalidate()
      if (data.verified) {
        toast.success('Domain verified! DNS is correctly configured.')
      } else {
        toast.warning('DNS verification incomplete. Some records are still pending.')
      }
    },
    onError: (error) => {
      toast.error('Verification failed', { description: error.message })
    },
  })

  /* Get DNS instructions for expanded domain */
  const { data: dnsData } = trpc.domains.getDnsInstructions.useQuery(
    { organizationId, domainId: expandedId! },
    { enabled: !!expandedId, staleTime: 60000 }
  )

  /**
   * Handle website domain creation with optional email domain
   *
   * WHY: Two independent try-catch blocks so website domain failure
   *      does not prevent email domain creation and vice versa
   */
  const handleCreateWebsiteDomain = useCallback(async () => {
    let websiteSuccess = false
    let emailSuccess = false

    /* Try-catch #1: Create website domain (primary action) */
    try {
      await createWebsiteMutation.mutateAsync({
        organizationId,
        customDomain: normalized,
      })
      websiteSuccess = true
    } catch {
      toast.error('Failed to create website domain')
      return
    }

    /* Try-catch #2: Optionally create email domain (independent) */
    if (alsoCreateEmail) {
      try {
        await createEmailMutation.mutateAsync({
          organizationId,
          name: normalized,
        })
        emailSuccess = true
      } catch {
        /* Email creation failed but website succeeded — not blocking */
      }
    }

    /* Show appropriate toast based on results */
    if (websiteSuccess && emailSuccess) {
      toast.success('Website domain created. Email domain also added.')
    } else if (websiteSuccess && alsoCreateEmail && !emailSuccess) {
      toast.info('Website domain created. Email domain could not be added — create it separately in the Email Domains tab.')
    } else if (websiteSuccess) {
      toast.success('Website domain added. Configure DNS records to activate.')
    }

    /* Invalidate queries and reset dialog state */
    utils.domains.list.invalidate()
    utils.emailDomains.list.invalidate()
    utils.usage.getFeatureGates.invalidate()
    setShowCreateDialog(false)
    setDomainInput('')
    setAlsoCreateEmail(false)
  }, [normalized, organizationId, alsoCreateEmail, createWebsiteMutation, createEmailMutation, utils])

  const domains = listData?.domains || []

  if (isLoadingList) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with create button — FeatureGate intercepts clicks at limit and shows upgrade modal */}
      <div className="flex justify-end">
        {hasCreatePermission && (
          <FeatureGate feature="custom_domain">
            <Button size="sm" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add Website Domain
            </Button>
          </FeatureGate>
        )}
      </div>

      {/* Website Domain List */}
      {domains.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed p-8 text-center">
          <Globe className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">No website domains yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a custom domain to host your websites on your own address
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {domains.map((domain) => {
            const verificationStatus = getWebsiteVerificationStatus(domain.isVerified)
            const VerifyIcon = verificationStatus.icon
            const isExpanded = expandedId === domain.id
            const needsVerify = !domain.isVerified
            const websiteCount = domain._count.websites

            return (
              <div key={domain.id} className="rounded-xl dark:bg-muted/50 border overflow-hidden">
                {/* Row header — domain name, website count, verification, actions */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : domain.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 transition-colors text-left cursor-pointer"
                >
                  <div className="text-muted-foreground">
                    {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  </div>
                  <Globe className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">{domain.customDomain}</span>
                  <span className="text-xs text-muted-foreground">
                    {websiteCount} site{websiteCount !== 1 ? 's' : ''}
                  </span>
                  <div className="flex-1" />

                  {/* Verification badge */}
                  <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0.5', verificationStatus.className)}>
                    <VerifyIcon className="h-3 w-3 mr-0.5" />
                    {verificationStatus.label}
                  </Badge>

                  {/* Verify button */}
                  {needsVerify && hasUpdatePermission && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={(e) => {
                        e.stopPropagation()
                        verifyWebsiteMutation.mutate({ organizationId, domainId: domain.id })
                      }}
                      disabled={verifyWebsiteMutation.isPending}
                    >
                      {verifyWebsiteMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        'Verify'
                      )}
                    </Button>
                  )}

                  {/* Delete button */}
                  {hasDeletePermission && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteId(domain.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </button>

                {/* Expanded detail — Default page + DNS records */}
                {isExpanded && (
                  <div className="p-1 space-y-1">
                    {/* Default Page Selector */}
                    <DefaultPageSection
                      organizationId={organizationId}
                      domainId={domain.id}
                    />

                    {/* Website DNS Records */}
                    {dnsData && dnsData.records && dnsData.records.length > 0 && (
                      <DnsRecordTable
                        records={dnsData.records.map((r) => ({
                          type: r.type,
                          name: r.name,
                          value: r.value,
                          status: r.status,
                        }))}
                        icon={Globe}
                        title="Website DNS Records"
                        footnote="DNS changes can take up to 48 hours to propagate. Click &quot;Verify&quot; after adding records."
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Create Website Domain Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open)
        if (!open) {
          setDomainInput('')
          setAlsoCreateEmail(false)
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Website Domain</DialogTitle>
            <DialogDescription>
              Connect a custom domain to host your websites
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (isValidFormat && websiteAvailability?.available !== false) {
                handleCreateWebsiteDomain()
              }
            }}
            className="space-y-4"
          >
            <DomainInput
              value={domainInput}
              onChange={setDomainInput}
              isAvailable={websiteAvailability?.available}
              isChecking={isCheckingWebsite}
              hasInvalidPrefix={hasInvalidPrefix}
              hasProtocol={hasProtocol}
              hasWww={hasWww}
              unavailableMessage="This domain is already registered for website hosting."
            />

            {/* Checkbox: Also create email domain — shows upgrade button when gated */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="also-create-email"
                  checked={alsoCreateEmail}
                  onCheckedChange={(checked) => setAlsoCreateEmail(checked === true)}
                  disabled={emailGateBlocked}
                />
                <Label
                  htmlFor="also-create-email"
                  className={cn(
                    'text-sm cursor-pointer',
                    emailGateBlocked && 'text-muted-foreground cursor-not-allowed'
                  )}
                >
                  Also create an email domain
                </Label>
              </div>

              {/* Show upgrade button when email domains are gated on the current plan */}
              {emailGateBlocked && (
                <UpgradeButton size="sm" label="Upgrade" />
              )}
            </div>

            {/* Warning if email domain is unavailable while checkbox is active */}
            {alsoCreateEmail && !emailGateBlocked && isValidFormat && emailAvailability?.available === false && (
              <p className="text-sm text-amber-500">
                This domain is already registered for email sending. The website domain will still be created.
              </p>
            )}

            {createWebsiteMutation.error && (
              <p className="text-sm text-destructive">{createWebsiteMutation.error.message}</p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  createWebsiteMutation.isPending ||
                  createEmailMutation.isPending ||
                  !isValidFormat ||
                  isCheckingWebsite ||
                  websiteAvailability?.available === false
                }
              >
                {(createWebsiteMutation.isPending || createEmailMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Add Website Domain
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete website domain?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the domain. Websites under this domain will still be accessible via preview URLs. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!deleteId) return
                deleteWebsiteMutation.mutate({ organizationId, domainId: deleteId })
              }}
            >
              {deleteWebsiteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}

// ============================================================================
// MAIN COMPONENT — DomainsPageContent
// ============================================================================

/**
 * DomainsPageContent — Main page with two tabs for email and website domains
 *
 * WHY: Clean separation of concerns between email and website domain management
 * HOW: Uses useActiveOrganization for org context, permission checks gate UI actions,
 *      Tabs component switches between EmailDomainsTab and WebsiteDomainsTab
 *
 * PERMISSIONS:
 * - domains:read — view the page at all
 * - domains:create / email:send — create buttons
 * - domains:update / email:send — verify, settings
 * - domains:delete / email:send — delete buttons
 *
 * SOURCE OF TRUTH: DomainsPage, SplitDomainTabs
 */
export function DomainsPageContent() {
  const { activeOrganization, isLoading: isLoadingOrg, hasPermission } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''

  /* Permission checks for both domain types */
  const hasDomainsRead = hasPermission(permissions.DOMAINS_READ)
  const hasDomainsCreate = hasPermission(permissions.DOMAINS_CREATE)
  const hasDomainsUpdate = hasPermission(permissions.DOMAINS_UPDATE)
  const hasDomainsDelete = hasPermission(permissions.DOMAINS_DELETE)
  const hasEmailSend = hasPermission(permissions.EMAIL_SEND)
  const hasEmailRead = hasPermission(permissions.EMAIL_READ)

  /* Show skeleton only on initial load when no cached data exists */
  if (isLoadingOrg && !activeOrganization) {
    return <DomainsPageSkeleton />
  }

  if (!activeOrganization) {
    return (
      <ContentLayout>
        <div className="flex items-center justify-center h-full">
          <p className="text-sm text-muted-foreground">
            No organization found. Please contact your administrator.
          </p>
        </div>
      </ContentLayout>
    )
  }

  /* At least one of domains:read or email:read is needed to view this page */
  if (!hasDomainsRead && !hasEmailRead) {
    return (
      <ContentLayout>
        <div className="flex items-center justify-center h-full p-6">
          <div className="max-w-md text-center space-y-2">
            <p className="text-sm text-destructive font-medium">
              You don&apos;t have permission to view domains
            </p>
            <p className="text-xs text-muted-foreground">
              Contact your organization owner to grant you the{' '}
              <code className="px-1 py-0.5 bg-muted rounded text-xs">
                domains:read
              </code>{' '}
              or{' '}
              <code className="px-1 py-0.5 bg-muted rounded text-xs">
                email:read
              </code>{' '}
              permission.
            </p>
          </div>
        </div>
      </ContentLayout>
    )
  }

  return (
    <ContentLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Domains</h1>
          <p className="text-muted-foreground">Manage your website hosting and email sending domains</p>
        </div>

        {/* Tabs — Email Domains | Website Domains */}
        <Tabs defaultValue="email">
          <TabsList>
            <TabsTrigger value="email">
              <Mail className="h-4 w-4 mr-1.5" />
              Email Domains
            </TabsTrigger>
            <TabsTrigger value="website">
              <Globe className="h-4 w-4 mr-1.5" />
              Website Domains
            </TabsTrigger>
          </TabsList>

          <TabsContent value="email">
            {hasEmailRead ? (
              <EmailDomainsTab
                organizationId={organizationId}
                hasCreatePermission={hasEmailSend}
                hasUpdatePermission={hasEmailSend}
                hasDeletePermission={hasEmailSend}
              />
            ) : (
              <div className="rounded-lg border-2 border-dashed p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  You don&apos;t have permission to view email domains.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="website">
            {hasDomainsRead ? (
              <WebsiteDomainsTab
                organizationId={organizationId}
                hasCreatePermission={hasDomainsCreate}
                hasUpdatePermission={hasDomainsUpdate}
                hasDeletePermission={hasDomainsDelete}
              />
            ) : (
              <div className="rounded-lg border-2 border-dashed p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  You don&apos;t have permission to view website domains.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  )
}
