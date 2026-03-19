/**
 * ============================================================================
 * TEMPLATE LIBRARY — INSTALL DIALOG
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: TemplateInstallDialog, TemplateInstallation
 *
 * WHY: Confirmation dialog before installing a template. For templates with
 * multiple items (bundles), allows the user to opt out of specific dependencies
 * while keeping the main item always selected.
 *
 * HOW: AlertDialog with template info, optional dependency checkboxes,
 * and install/cancel buttons. Uses the tRPC install mutation.
 */

'use client'

import { useState, useMemo } from 'react'
import { Loader2, Check, AlertCircle, ArrowUpCircle } from 'lucide-react'


import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

import { cn } from '@/lib/utils'
import { TEMPLATE_CATEGORY_META, TEMPLATE_CATEGORY_GATE_KEY } from '@/lib/templates/constants'
import type { TemplateDetailItem, InstallResult, InstallItemResult, TemplateCategory } from '@/lib/templates/types'
import { useFeatureGates } from '@/components/feature-gate'
import { trpc } from '@/trpc/react-provider'

// ============================================================================
// PROPS
// ============================================================================

/**
 * Props accept a subset of the template detail — only the fields actually
 * used by the dialog. This avoids Date/string type mismatches from tRPC
 * serialization while keeping the component fully type-safe.
 */
interface TemplateInstallDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: {
    id: string
    name: string
    description: string | null
    items: TemplateDetailItem[]
  }
  /** Organization ID for the install mutation — passed as prop so this dialog
   *  works outside TemplateLibraryProvider (e.g., on the public detail page) */
  organizationId?: string
  /** Callback to open the upgrade modal — lifted to parent to avoid nested dialog issues */
  onRequestUpgrade?: () => void
}

// ============================================================================
// INSTALL STATUS — Tracks the dialog's lifecycle
// ============================================================================

type InstallStatus = 'idle' | 'installing' | 'success' | 'error'

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Installation confirmation dialog for a template.
 *
 * Features:
 * - Shows template name and description
 * - For multi-item templates: checkbox list to opt out of dependencies
 * - Main item is always checked and disabled (cannot opt out)
 * - Loading spinner during installation
 * - Success state after install completes
 * - Error handling with retry
 */
export function TemplateInstallDialog({
  open,
  onOpenChange,
  template,
  organizationId,
  onRequestUpgrade,
}: TemplateInstallDialogProps) {
  const [status, setStatus] = useState<InstallStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  /**
   * Stores the full InstallResult from the mutation response.
   * Used to show per-item success/failure details after installation completes.
   * Reuses the existing InstallResult type (SOURCE OF TRUTH: lib/templates/types.ts).
   */
  const [installResult, setInstallResult] = useState<InstallResult | null>(null)

  /**
   * Track which dependency items are selected for installation.
   * The main item (index 0) is always included.
   * Default: all items selected.
   */
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() =>
    new Set(template.items.map((item) => item.id))
  )

  /** Separate the main item from dependency items */
  const mainItem: TemplateDetailItem | undefined = template.items[0]
  const dependencyItems = template.items.slice(1)
  const hasMultipleItems = template.items.length > 1

  /** Compute the final list of item IDs to install */
  const itemIdsToInstall = useMemo(() => {
    const ids = new Set(selectedItemIds)
    /** Main item is always included */
    if (mainItem) {
      ids.add(mainItem.id)
    }
    return Array.from(ids)
  }, [selectedItemIds, mainItem])

  /**
   * Feature gate pre-flight check — uses the existing useFeatureGates() hook
   * (SOURCE OF TRUTH: feature-gate.tsx) to compare the template's items against
   * the org's current usage + plan limits. Fully dynamic — respects whatever
   * gates are defined in TEMPLATE_CATEGORY_GATE_KEY.
   */
  const featureGates = useFeatureGates()

  /**
   * Compute which feature gates would be exceeded by installing the selected items.
   * Returns an array of violations with gate data for display.
   */
  const gateViolations = useMemo(() => {
    if (!featureGates?.gates) return []

    /** Count selected items per feature type */
    const countsByType = new Map<string, number>()
    const selectedItems = template.items.filter((i) => itemIdsToInstall.includes(i.id))
    for (const item of selectedItems) {
      const count = countsByType.get(item.featureType) ?? 0
      countsByType.set(item.featureType, count + 1)
    }

    /** Check each gated category against the org's feature gates */
    const violations: Array<{
      featureType: TemplateCategory
      gateKey: string
      featureName: string
      currentUsage: number
      limit: number
      wouldAdd: number
    }> = []

    for (const [featureType, wouldAdd] of countsByType) {
      const gateKey = TEMPLATE_CATEGORY_GATE_KEY[featureType as TemplateCategory]
      if (!gateKey) continue

      const gate = featureGates.gates[gateKey]
      if (!gate || gate.isUnlimited) continue

      /** Check if adding these items would exceed the limit */
      if (gate.limit !== null && gate.usage + wouldAdd > gate.limit) {
        violations.push({
          featureType: featureType as TemplateCategory,
          gateKey,
          featureName: gate.featureName,
          currentUsage: gate.usage,
          limit: gate.limit,
          wouldAdd,
        })
      }
    }

    return violations
  }, [featureGates, template.items, itemIdsToInstall])

  /** Whether the install should be blocked due to gate violations */
  const hasGateViolations = gateViolations.length > 0

  /** Toggle a dependency item's selection */
  const toggleItem = (itemId: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })
  }

  /** tRPC utils for cache invalidation after successful install */
  const utils = trpc.useUtils()

  /**
   * Install mutation — captures the full InstallResult on success for
   * per-item progress display. Invalidates checkInstalled cache so the
   * install button updates to "Installed" state.
   */
  const installMutation = trpc.templates.install.useMutation({
    onSuccess: (result) => {
      setInstallResult(result as InstallResult)
      setStatus('success')
      utils.templates.checkInstalled.invalidate()
    },
    onError: (err) => {
      setStatus('error')
      setErrorMessage(err.message)
    },
  })

  /** Execute the installation — requires organizationId to be present */
  const handleInstall = () => {
    if (!organizationId) return
    setStatus('installing')
    setErrorMessage(null)
    /** Compute which items the user opted OUT of (the install schema uses excludeItemIds) */
    const allItemIds = template.items.map((i) => i.id)
    const excludedIds = allItemIds.filter((id) => !itemIdsToInstall.includes(id))

    installMutation.mutate({
      organizationId,
      templateId: template.id,
      excludeItemIds: excludedIds.length > 0 ? excludedIds : undefined,
    })
  }

  /** Reset state when dialog closes */
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setStatus('idle')
      setErrorMessage(null)
      setInstallResult(null)
      setSelectedItemIds(new Set(template.items.map((i) => i.id)))
    }
    onOpenChange(nextOpen)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {status === 'success' ? 'Installation Complete' : `Install "${template.name}"`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {status === 'success'
              ? 'The template has been successfully installed into your organization.'
              : 'This template will be installed into your organization.'}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Installing State — shows item count being processed */}
        {status === 'installing' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                Installing {itemIdsToInstall.length} item{itemIdsToInstall.length !== 1 ? 's' : ''}...
              </span>
            </div>
            {/* Show what's being installed during the process */}
            {itemIdsToInstall.length > 1 && (
              <div className="max-h-32 overflow-y-auto space-y-1">
                {template.items
                  .filter((i) => itemIdsToInstall.includes(i.id))
                  .map((item) => {
                    const meta = TEMPLATE_CATEGORY_META[item.featureType]
                    const ItemIcon = meta.icon
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground"
                      >
                        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                        <ItemIcon className="h-3 w-3 shrink-0" />
                        <span className="truncate">{item.sourceName}</span>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        )}

        {/*
         * Success State — shows per-item results from InstallResult.
         * Reuses InstallItemResult data to display success/failure per feature.
         */}
        {status === 'success' && installResult && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-md bg-green-500/10 px-4 py-3 text-sm text-green-600">
              <Check className="h-5 w-5 shrink-0" />
              <span>
                {installResult.installedCount} of {installResult.items.length} item{installResult.items.length !== 1 ? 's' : ''} installed successfully.
              </span>
            </div>
            {/* Per-item result list — shows each feature with success/failure icon */}
            {installResult.items.length > 1 && (
              <div className="max-h-40 overflow-y-auto space-y-1 rounded-md border p-2">
                {installResult.items.map((item: InstallItemResult) => {
                  const meta = TEMPLATE_CATEGORY_META[item.featureType]
                  const ItemIcon = meta?.icon
                  return (
                    <div
                      key={item.templateItemId}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
                    >
                      {item.success ? (
                        <Check className="h-3 w-3 text-green-500 shrink-0" />
                      ) : (
                        <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
                      )}
                      {ItemIcon && <ItemIcon className="h-3 w-3 text-muted-foreground shrink-0" />}
                      <span className="flex-1 truncate">{item.featureName}</span>
                      <span className={cn(
                        'text-[10px] shrink-0',
                        item.success ? 'text-muted-foreground' : 'text-destructive'
                      )}>
                        {item.success
                          ? item.action === 'reused' ? 'Already exists' : 'Installed'
                          : 'Failed'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
            {/* Show failed items summary if any */}
            {installResult.failedCount > 0 && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {installResult.failedCount} item{installResult.failedCount !== 1 ? 's' : ''} failed to install.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Fallback success state if installResult somehow missing */}
        {status === 'success' && !installResult && (
          <div className="flex items-center gap-3 rounded-md bg-green-500/10 px-4 py-3 text-sm text-green-600">
            <Check className="h-5 w-5 shrink-0" />
            <span>Template installed successfully.</span>
          </div>
        )}

        {/* Error State */}
        {status === 'error' && errorMessage && (
          <div className="flex items-center gap-3 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/*
         * Feature gate violation banner — styled to match the layout red banner
         * (SOURCE OF TRUTH: subscription-canceled-banner.tsx, stripe-restricted-banner).
         * Hides the items list entirely when violated — shows an upgrade prompt instead.
         */}
        {hasGateViolations && (status === 'idle' || status === 'error') && (
          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-sm font-medium">
                Plan limit{gateViolations.length > 1 ? 's' : ''} exceeded
              </p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              This template needs more resources than your current plan allows.
            </p>
            <Button
              size="sm"
              className="gap-2"
              onClick={() => {
                /** Tell the parent to open the upgrade modal */
                onRequestUpgrade?.()
              }}
            >
              <ArrowUpCircle className="h-4 w-4" />
              Upgrade Plan
            </Button>
          </div>
        )}

        {/* Dependency Selection — hidden when gate violations exist, shown for multi-item templates */}
        {!hasGateViolations && hasMultipleItems && (status === 'idle' || status === 'error') && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Items to install:</p>
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {/* Main Item — always selected, checkbox disabled */}
              {mainItem && (
                <DependencyCheckboxItem
                  item={mainItem}
                  checked={true}
                  disabled={true}
                  isMain={true}
                  onCheckedChange={() => {}}
                />
              )}

              {/* Dependency Items — toggle-able */}
              {dependencyItems.map((item) => (
                <DependencyCheckboxItem
                  key={item.id}
                  item={item}
                  checked={selectedItemIds.has(item.id)}
                  disabled={false}
                  isMain={false}
                  onCheckedChange={() => toggleItem(item.id)}
                />
              ))}
            </div>
          </div>
        )}

        <AlertDialogFooter>
          {status === 'success' ? (
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          ) : hasGateViolations ? (
            /* When gate violations exist, only show cancel — upgrade is in the banner above */
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          ) : (
            <>
              <AlertDialogCancel disabled={status === 'installing'}>
                Cancel
              </AlertDialogCancel>
              <Button
                onClick={handleInstall}
                disabled={status === 'installing'}
              >
                {status === 'installing' && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {status === 'error' ? 'Retry Install' : 'Install'}
              </Button>
            </>
          )}
        </AlertDialogFooter>

      </AlertDialogContent>
    </AlertDialog>
  )
}

// ============================================================================
// DEPENDENCY CHECKBOX ITEM
// ============================================================================

/** Single checkbox row for a template item in the install dialog */
function DependencyCheckboxItem({
  item,
  checked,
  disabled,
  isMain,
  onCheckedChange,
}: {
  item: TemplateDetailItem
  checked: boolean
  disabled: boolean
  isMain: boolean
  onCheckedChange: () => void
}) {
  const meta = TEMPLATE_CATEGORY_META[item.featureType]
  const Icon = meta.icon

  return (
    <label className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/50">
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm">{item.sourceName}</p>
        <p className="text-xs text-muted-foreground">{meta.label}</p>
      </div>
      {isMain && (
        <span className="text-xs text-muted-foreground shrink-0">Required</span>
      )}
    </label>
  )
}
