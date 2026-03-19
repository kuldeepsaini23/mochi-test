'use client'

/**
 * Invoice Builder — Full-Screen Overlay
 *
 * Core component for creating and editing invoices. Opens as a fixed full-screen
 * overlay controlled by the ?invoice=xxx URL parameter from invoices-page-content.
 *
 * LAYOUT (revamped to match contract-builder.tsx / automation-builder pattern):
 * ┌──────────────────────────────────────────────────────────────┐
 * │  NAVBAR (floating) — Name, Status, Send, Save, Close         │
 * ├──────────────────────────────────────────────────────────────┤
 * │                                                              │
 * │  ┌────────────┐                                              │
 * │  │  FLOATING   │         INVOICE PREVIEW                     │
 * │  │  SIDEBAR    │    (centered, scrollable with fade)          │
 * │  │  (absolute) │                                              │
 * │  │  Items tab  │    Organization header                       │
 * │  │  Details tab│    Invoice details                           │
 * │  └────────────┘    Items table                                │
 * │                    Total                                      │
 * └──────────────────────────────────────────────────────────────┘
 *
 * PATTERN: Mirrors contract-builder.tsx (data fetch, state, mutations, auto-save)
 * Uses floating sidebar + centered preview instead of split panel layout.
 *
 * SOURCE OF TRUTH: Invoice, InvoiceItem, InvoiceStatus from Prisma
 * Keywords: INVOICE_BUILDER, INVOICE_EDITOR, INVOICE_OVERLAY
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { nanoid } from 'nanoid'
import { toast } from 'sonner'
import { trpc } from '@/trpc/react-provider'
import { trackEvent, CLARITY_EVENTS } from '@/lib/clarity/events'
import { MarqueeFade } from '@/components/global/marquee-fade'
import { useLeadSearch, type LeadOption } from '@/components/leads/lead-search-command'
import { useMochiEvents } from '@/lib/ai/mochi/events'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { InvoiceBuilderNavbar } from './invoice-builder-navbar'
import { InvoiceItemsPanel } from './invoice-items-panel'
import { InvoicePreview } from './invoice-preview'
import { itemsToInput } from './builder-types'
import type { InvoiceItemLocal, InvoiceBuilderProps, InvoiceStatus } from './builder-types'

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function InvoiceBuilder({
  invoiceId,
  organizationId,
  onClose,
}: InvoiceBuilderProps) {
  /**
   * Org's Stripe currency — used as the initial default for new invoices.
   * WHY: Avoids a brief 'usd' flash before server data loads with the correct currency.
   */
  const { activeOrganization } = useActiveOrganization()
  const orgCurrency = activeOrganization?.stripeAccountCurrency || 'usd'
  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const { data: invoice, isLoading } = trpc.invoices.getById.useQuery(
    { organizationId, id: invoiceId },
    { staleTime: 30000 }
  )

  const utils = trpc.useUtils()

  /**
   * Subscribe to Mochi AI invoice events for real-time data refresh.
   * WHY: When Mochi AI adds products, sets recipients, or modifies items,
   * we invalidate the tRPC cache → React Query refetches → the existing
   * useEffect syncs the new data into local state → UI updates naturally.
   */
  useMochiEvents('invoice', (event) => {
    if (event.entityId !== invoiceId) return
    utils.invoices.getById.invalidate({ organizationId, id: invoiceId })
  })

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  /** Update invoice metadata (name, notes, dueDate, currency, leadId) */
  const updateMutation = trpc.invoices.update.useMutation({
    onError: (error) => {
      toast.error(error.message || 'Failed to save invoice')
    },
  })

  /** Sync invoice items (full replacement) */
  const updateItemsMutation = trpc.invoices.updateItems.useMutation({
    onError: (error) => {
      toast.error(error.message || 'Failed to save items')
    },
  })

  /** Send invoice (DRAFT → SENT) */
  const sendMutation = trpc.invoices.send.useMutation({
    onSuccess: (data) => {
      trackEvent(CLARITY_EVENTS.INVOICE_SENT)
      setInvoiceStatus('SENT')
      setAccessToken(data.accessToken)
      utils.invoices.list.invalidate()
      utils.invoices.getById.invalidate({ organizationId, id: invoiceId })

      /**
       * Show appropriate toast based on email delivery result.
       * Invoice status is SENT regardless, but warn if the email didn't go through.
       */
      if (data.emailFailed) {
        toast.warning('Invoice marked as sent, but the email failed to deliver', {
          description: data.emailError,
        })
      } else {
        toast.success('Invoice sent successfully')
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to send invoice')
    },
  })

  /** Mark invoice as paid (SENT/OVERDUE → PAID) */
  const markPaidMutation = trpc.invoices.markPaid.useMutation({
    onSuccess: () => {
      setInvoiceStatus('PAID')
      toast.success('Invoice marked as paid')
      utils.invoices.list.invalidate()
      utils.invoices.getById.invalidate({ organizationId, id: invoiceId })
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to mark invoice as paid')
    },
  })

  // ============================================================================
  // LOCAL STATE
  // ============================================================================

  const [invoiceName, setInvoiceName] = useState('')
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus>('DRAFT')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [items, setItems] = useState<InvoiceItemLocal[]>([])
  const [dueDate, setDueDate] = useState<Date | null>(null)
  const [currency, setCurrency] = useState(orgCurrency)
  const [notes, setNotes] = useState<object | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [createdAt, setCreatedAt] = useState<Date>(new Date())
  const [isDirty, setIsDirty] = useState(false)
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true)

  /** Selected recipient lead */
  const [recipientLead, setRecipientLead] = useState<LeadOption | null>(null)

  /**
   * Content version counter — increments on each change.
   * WHY: useAutoSave watches this to reset its debounce timer.
   */
  const [contentVersion, setContentVersion] = useState(0)

  /** Latest items ref — avoids stale closure in save function */
  const latestItemsRef = useRef<InvoiceItemLocal[]>([])
  latestItemsRef.current = items

  /** Latest notes ref */
  const latestNotesRef = useRef<object | null>(null)
  latestNotesRef.current = notes

  /** Fetch org data for preview (name, logo) */
  const { data: orgData } = trpc.organizationSettings.getOrganizationSettings.useQuery(
    { organizationId },
    { staleTime: 60000 }
  )

  /** Lead search dialog */
  const { openSearch: openRecipientSearch, LeadSearchDialog: RecipientSearchDialog } =
    useLeadSearch({
      organizationId,
      onSelect: (lead) => {
        setRecipientLead(lead)
        setIsDirty(true)
        setContentVersion((v) => v + 1)
      },
      selectedLeadId: recipientLead?.id,
      title: 'Select Recipient',
      placeholder: 'Search for a recipient...',
    })

  // ============================================================================
  // SCROLL FADE STATE — drives MarqueeFade top/bottom indicators
  // ============================================================================

  const scrollRef = useRef<HTMLDivElement>(null)
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(false)

  /** Recalculate scroll overflow for MarqueeFade indicators */
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setShowTopFade(el.scrollTop > 10)
    setShowBottomFade(el.scrollTop + el.clientHeight < el.scrollHeight - 10)
  }, [])

  // ============================================================================
  // SYNC FROM SERVER
  // ============================================================================

  /** Sync local state when invoice data loads */
  useEffect(() => {
    if (!invoice) return

    setInvoiceName(invoice.name)
    setInvoiceStatus(invoice.status)
    setInvoiceNumber(invoice.invoiceNumber)
    setCurrency(invoice.currency)
    setAccessToken(invoice.accessToken ?? null)
    setCreatedAt(new Date(invoice.createdAt))
    setNotes((invoice.notes as object | null) ?? null)

    if (invoice.dueDate) {
      setDueDate(new Date(invoice.dueDate))
    }

    /** Convert server items to local items with tempIds */
    if (invoice.items) {
      setItems(
        invoice.items.map((item) => ({
          tempId: nanoid(10),
          productId: item.productId,
          priceId: item.priceId,
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unitAmount: item.unitAmount,
          billingType: item.billingType,
          interval: item.interval,
          intervalCount: item.intervalCount,
          isAdHoc: item.isAdHoc,
        }))
      )
    }

    /** Load recipient lead if set on the invoice */
    if (invoice.lead) {
      setRecipientLead({
        id: invoice.lead.id,
        firstName: invoice.lead.firstName,
        lastName: invoice.lead.lastName,
        email: invoice.lead.email,
        phone: invoice.lead.phone,
        avatarUrl: invoice.lead.avatarUrl,
      })
    }
  }, [invoice])

  // ============================================================================
  // CHANGE HANDLERS
  // ============================================================================

  const handleNameChange = useCallback((name: string) => {
    setInvoiceName(name)
    setIsDirty(true)
    setContentVersion((v) => v + 1)
  }, [])

  const handleItemsChange = useCallback((newItems: InvoiceItemLocal[]) => {
    setItems(newItems)
    setIsDirty(true)
    setContentVersion((v) => v + 1)
  }, [])

  const handleDueDateChange = useCallback((date: Date | null) => {
    setDueDate(date)
    setIsDirty(true)
    setContentVersion((v) => v + 1)
  }, [])

  const handleNotesChange = useCallback((newNotes: object) => {
    setNotes(newNotes)
    setIsDirty(true)
    setContentVersion((v) => v + 1)
  }, [])

  const handleRemoveRecipient = useCallback(() => {
    setRecipientLead(null)
    setIsDirty(true)
    setContentVersion((v) => v + 1)
  }, [])

  // ============================================================================
  // SAVE LOGIC
  // ============================================================================

  /**
   * Core save function — sends current state to the server.
   * Called by both auto-save and manual save.
   * Updates metadata and items in parallel for efficiency.
   */
  const performSave = useCallback(async () => {
    const currentItems = latestItemsRef.current
    const currentNotes = latestNotesRef.current

    /** Run metadata update and items sync in parallel */
    await Promise.all([
      updateMutation.mutateAsync({
        organizationId,
        id: invoiceId,
        name: invoiceName,
        notes: currentNotes as Record<string, unknown> | null,
        dueDate: dueDate?.toISOString() ?? null,
        currency,
        leadId: recipientLead?.id ?? null,
      }),
      updateItemsMutation.mutateAsync({
        organizationId,
        invoiceId,
        items: itemsToInput(currentItems),
      }),
    ])

    setIsDirty(false)
    await Promise.all([
      utils.invoices.list.invalidate(),
      utils.invoices.getById.invalidate({ organizationId, id: invoiceId }),
    ])
  }, [
    invoiceId,
    organizationId,
    invoiceName,
    dueDate,
    currency,
    recipientLead,
    updateMutation,
    updateItemsMutation,
    utils,
  ])

  /**
   * Mark the invoice as sent WITHOUT emailing the lead.
   * Saves first to persist latest content, then transitions DRAFT -> SENT.
   */
  const handleMarkAsSent = useCallback(async () => {
    if (sendMutation.isPending || !recipientLead) return
    await performSave()
    await sendMutation.mutateAsync({ organizationId, id: invoiceId, sendEmail: false })
  }, [sendMutation, recipientLead, performSave, organizationId, invoiceId])

  /**
   * Send the invoice WITH an email notification to the lead.
   * Saves first to persist latest content, then transitions DRAFT -> SENT
   * and fires an email to the assigned lead.
   */
  const handleSendWithEmail = useCallback(async () => {
    if (sendMutation.isPending || !recipientLead) return
    await performSave()
    await sendMutation.mutateAsync({ organizationId, id: invoiceId, sendEmail: true })
  }, [sendMutation, recipientLead, performSave, organizationId, invoiceId])

  /** Mark the invoice as paid */
  const handleMarkPaid = useCallback(() => {
    if (markPaidMutation.isPending) return
    markPaidMutation.mutate({ organizationId, id: invoiceId })
  }, [markPaidMutation, organizationId, invoiceId])

  // ============================================================================
  // COMPUTED STATE
  // ============================================================================

  /** Whether the invoice is editable (only DRAFT and SENT) */
  const isReadOnly = invoiceStatus !== 'DRAFT' && invoiceStatus !== 'SENT'

  /** Organization info for preview */
  const orgName = orgData?.name ?? 'Organization'
  const orgLogo = orgData?.logo ?? null
  const orgAddress = orgData?.address ?? null
  const orgEmail = orgData?.contactEmail ?? null

  // ============================================================================
  // LOADING STATE
  // ============================================================================

  if (isLoading || !invoice) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
          <p className="text-sm text-muted-foreground">Loading invoice...</p>
        </div>
      </div>
    )
  }

  // ============================================================================
  // RENDER — Floating sidebar + centered preview layout
  // Matches contract-builder.tsx pattern: full-screen overlay with muted bg,
  // floating absolute-positioned sidebar, centered scrollable preview with fade.
  // ============================================================================

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Floating Navbar — overlays the top of the content area */}
      <InvoiceBuilderNavbar
        invoiceName={invoiceName}
        invoiceStatus={invoiceStatus}
        isDirty={isDirty}
        isSaving={updateMutation.isPending || updateItemsMutation.isPending}
        contentVersion={contentVersion}
        autoSaveEnabled={autoSaveEnabled}
        onAutoSaveChange={setAutoSaveEnabled}
        onNameChange={handleNameChange}
        onSave={performSave}
        onClose={onClose}
        recipientLead={recipientLead}
        onSend={handleSendWithEmail}
        onMarkAsSent={handleMarkAsSent}
        isSending={sendMutation.isPending}
        accessToken={accessToken}
        onMarkPaid={handleMarkPaid}
        isMarkingPaid={markPaidMutation.isPending}
      />

      {/* Main content area — muted background matching contract/automation builder */}
      <div className="flex-1 relative overflow-hidden dark:bg-sidebar bg-muted">
        {/* Floating sidebar — positioned absolutely by the panel itself */}
        <InvoiceItemsPanel
          organizationId={organizationId}
          items={items}
          onItemsChange={handleItemsChange}
          recipientLead={recipientLead}
          onSelectRecipient={openRecipientSearch}
          onRemoveRecipient={handleRemoveRecipient}
          dueDate={dueDate}
          onDueDateChange={handleDueDateChange}
          currency={currency}
          isReadOnly={isReadOnly}
          notes={notes}
          onNotesChange={handleNotesChange}
        />

        {/* Centered preview with scroll fade — mirrors contract editor scrollable area */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto"
        >
          <MarqueeFade
            showTopFade={showTopFade}
            showBottomFade={showBottomFade}
            fadeHeight={60}
            className="h-full"
          >
            <div className="max-w-2xl mx-auto py-8 px-4 sm:px-8 pt-16">
              <InvoicePreview
                invoiceName={invoiceName}
                invoiceNumber={invoiceNumber}
                invoiceStatus={invoiceStatus}
                items={items}
                currency={currency}
                dueDate={dueDate}
                createdAt={createdAt}
                recipientLead={recipientLead}
                organizationName={orgName}
                organizationLogo={orgLogo}
                organizationAddress={orgAddress}
                organizationEmail={orgEmail}
              />
            </div>
          </MarqueeFade>
        </div>
      </div>

      {/* Lead search dialog — rendered outside to avoid z-index issues */}
      <RecipientSearchDialog />
    </div>
  )
}
