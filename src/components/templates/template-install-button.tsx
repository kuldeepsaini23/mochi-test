/**
 * ============================================================================
 * TEMPLATE BROWSE — INSTALL / PURCHASE BUTTON
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: TemplateInstallButton, TemplateInstallAction,
 * TemplateBuyButton, TemplatePurchaseAction
 *
 * WHY: Smart button that handles multiple authentication/install/purchase states:
 * 1. Not authenticated → "Sign in to Install" link
 * 2. Authenticated + already installed → "Installed" (disabled)
 * 3. Authenticated + free template + not installed → "Install Template" → install dialog
 * 4. Authenticated + paid template + not installed → "Buy {price}" → purchase dialog
 *
 * HOW: Uses trpc.templates.checkInstalled to determine install status.
 * For paid templates (price > 0), renders a "Buy" button that opens the
 * TemplatePurchaseDialog instead of the free install dialog.
 * Uses usePlatformCurrency() for all price formatting — never hardcodes $ or USD.
 *
 * NOTE: This component does NOT depend on TemplateLibraryContext. It receives
 * all data via props so it can be used on both the public browse page and
 * the dashboard detail view.
 */

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Download, CheckCircle2, LogIn, ShoppingCart } from 'lucide-react'

import { Button } from '@/components/ui/button'

import type { TemplateDetailItem } from '@/lib/templates/types'
import { TemplateInstallDialog } from './template-install-dialog'
import { TemplatePurchaseDialog } from './template-purchase-dialog'
import { UpgradeModal } from '@/components/upgrade-modal'
import { usePlatformCurrency } from '@/components/providers/platform-currency-provider'
import { useActiveOrganizationId } from '@/hooks/use-active-organization'
import { trpc } from '@/trpc/react-provider'
import { cn } from '@/lib/utils'

// ============================================================================
// PROPS
// ============================================================================

interface TemplateInstallButtonProps {
  /** Template data needed for the install dialog */
  template: {
    id: string
    name: string
    description: string | null
    items: TemplateDetailItem[]
  }
  /** Template price in cents — null or 0 means free */
  price?: number | null
  /** Whether the current user is authenticated */
  isAuthenticated?: boolean
  /** Current organization ID — needed for install check and install mutation */
  organizationId?: string
  /** Additional className for the button */
  className?: string
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Context-free install/purchase button that manages its own dialog state.
 * Renders different states based on auth status, install status, and price.
 *
 * For paid templates (price > 0), the button text changes to "Buy {formatted price}"
 * and clicking opens the TemplatePurchaseDialog with Stripe Elements.
 */
export function TemplateInstallButton({
  template,
  price,
  isAuthenticated,
  organizationId,
  className,
}: TemplateInstallButtonProps) {
  const [installDialogOpen, setInstallDialogOpen] = useState(false)
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const { formatCurrency } = usePlatformCurrency()

  /**
   * Client-side org ID — needed because the server-side prop may be undefined
   * (e.g., session.activeOrganizationId not set on the server). The UpgradeModal
   * requires a valid organizationId to fetch plans and process upgrades.
   */
  const clientOrgId = useActiveOrganizationId()
  const resolvedOrgId = organizationId || clientOrgId

  /** Whether this template costs money to install */
  const isPaid = price != null && price > 0

  /**
   * Check if the template is already installed in the user's org.
   * Only runs when we have both auth and an orgId.
   */
  const { data: installCheck } = trpc.templates.checkInstalled.useQuery(
    { organizationId: organizationId!, templateId: template.id },
    { enabled: !!isAuthenticated && !!organizationId }
  )
  const alreadyInstalled = installCheck?.installed ?? false

  // --------------------------------------------------------------------------
  // State 1: Not Authenticated — show sign-in link
  // --------------------------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <Button variant="outline" className={cn('gap-2', className)} asChild>
        <Link href="/sign-in">
          <LogIn className="h-4 w-4" />
          Sign in to Install
        </Link>
      </Button>
    )
  }

  // --------------------------------------------------------------------------
  // State 2: Already Installed — show disabled "Installed" button
  // --------------------------------------------------------------------------
  if (alreadyInstalled) {
    return (
      <Button variant="outline" disabled className={cn('gap-2', className)}>
        <CheckCircle2 className="h-4 w-4" />
        Installed
      </Button>
    )
  }

  // --------------------------------------------------------------------------
  // State 3: Paid Template — show "Buy" button → purchase dialog
  // --------------------------------------------------------------------------
  if (isPaid) {
    return (
      <>
        <Button
          className={cn('gap-2', className)}
          onClick={() => setPurchaseDialogOpen(true)}
        >
          <ShoppingCart className="h-4 w-4" />
          Buy {formatCurrency(price)}
        </Button>

        {/* Purchase dialog — Stripe Elements card form + payment */}
        <TemplatePurchaseDialog
          open={purchaseDialogOpen}
          onOpenChange={setPurchaseDialogOpen}
          templateId={template.id}
          templateName={template.name}
          price={price}
        />
      </>
    )
  }

  // --------------------------------------------------------------------------
  // State 4: Free Template — show install button + dialog (unchanged flow)
  // --------------------------------------------------------------------------
  return (
    <>
      <Button
        className={cn('gap-2', className)}
        onClick={() => setInstallDialogOpen(true)}
      >
        <Download className="h-4 w-4" />
        Install Template
      </Button>

      {/* Install dialog — self-contained confirmation + progress UI */}
      <TemplateInstallDialog
        open={installDialogOpen}
        onOpenChange={setInstallDialogOpen}
        template={template}
        organizationId={resolvedOrgId}
        onRequestUpgrade={() => {
          /** Close install dialog and open upgrade modal in the same batch.
           *  The UpgradeModal is always mounted (controlled via `open` prop) so
           *  Radix Dialog handles the closed→open transition properly. */
          setInstallDialogOpen(false)
          setUpgradeOpen(true)
        }}
      />

      {/* Upgrade modal — uses resolvedOrgId (client-side hook) because the server-side
       *  organizationId prop may be undefined when activeOrganizationId isn't set on
       *  the server session. Always mounted so Radix Dialog handles transitions properly. */}
      {resolvedOrgId && (
        <UpgradeModal
          open={upgradeOpen}
          onOpenChange={(open) => {
            setUpgradeOpen(open)
            if (!open) setInstallDialogOpen(false)
          }}
          organizationId={resolvedOrgId}
        />
      )}
    </>
  )
}
