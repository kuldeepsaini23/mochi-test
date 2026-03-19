'use client'

/**
 * Invoice Preview — Live Document Render
 *
 * Displays a clean, document-like preview of the invoice in the centered
 * content area of the builder. Shows organization header, recipient info,
 * items table, totals, and rendered notes.
 *
 * Styled to look like a printable invoice document with refined shadow and
 * white background. Updated to use rounded-2xl and shadow-md for a more
 * polished appearance matching the contract/automation builder aesthetic.
 *
 * SOURCE OF TRUTH: InvoiceItemLocal from builder-types
 * Keywords: INVOICE_PREVIEW, INVOICE_DOCUMENT, INVOICE_RENDER
 */

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { formatInvoiceAmount, formatInvoiceDate, INVOICE_STATUS_CONFIG } from './utils'
import type { InvoiceItemLocal, InvoiceStatus } from './builder-types'
import type { LeadOption } from '@/components/leads/lead-search-command'

// ============================================================================
// TYPES
// ============================================================================

interface InvoicePreviewProps {
  /** Invoice display name */
  invoiceName: string
  /** Invoice number (e.g. "INV-0001") */
  invoiceNumber: string
  /** Current invoice status */
  invoiceStatus: InvoiceStatus
  /** Line items to display */
  items: InvoiceItemLocal[]
  /** Currency code for formatting */
  currency: string
  /** Payment due date */
  dueDate: Date | null
  /** Invoice creation date */
  createdAt: Date
  /** Recipient lead data */
  recipientLead: LeadOption | null
  /** Organization name for "From" section */
  organizationName: string
  /** Organization logo URL */
  organizationLogo: string | null
  /** Organization address — displayed under org name when set */
  organizationAddress?: string | null
  /** Organization contact email — displayed under org name when set */
  organizationEmail?: string | null
}

// ============================================================================
// COMPONENT
// ============================================================================

export function InvoicePreview({
  invoiceName,
  invoiceNumber,
  invoiceStatus,
  items,
  currency,
  dueDate,
  createdAt,
  recipientLead,
  organizationName,
  organizationLogo,
  organizationAddress,
  organizationEmail,
}: InvoicePreviewProps) {
  /** Calculate total from items */
  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.unitAmount, 0),
    [items]
  )

  const statusConfig = INVOICE_STATUS_CONFIG[invoiceStatus]

  /** Build recipient display name */
  const recipientName = recipientLead
    ? [recipientLead.firstName, recipientLead.lastName].filter(Boolean).join(' ') ||
      recipientLead.email
    : null

  return (
    <div className="w-full">
      {/* Invoice document — white card with refined shadow for centered layout */}
      <div className="bg-card dark:bg-card rounded-2xl p-8 sm:p-10 space-y-8">
        {/* Header — org info + "INVOICE" title */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {organizationLogo ? (
              <img
                src={organizationLogo}
                alt={organizationName}
                className="h-10 w-10 rounded-xl object-cover"
              />
            ) : (
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">
                  {organizationName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div>
              <p className="text-sm font-semibold">{organizationName}</p>
              {/* Organization address — shown when set in org settings */}
              {organizationAddress && (
                <p className="text-xs text-muted-foreground">{organizationAddress}</p>
              )}
              {/* Organization contact email — shown when set in org settings */}
              {organizationEmail && (
                <p className="text-xs text-muted-foreground">{organizationEmail}</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-bold tracking-tight text-foreground">INVOICE</h1>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{invoiceNumber}</p>
          </div>
        </div>

        {/* Status badge + dates row */}
        <div className="flex items-center justify-between">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
              statusConfig.bgClass,
              statusConfig.colorClass
            )}
          >
            <span className={cn('w-1.5 h-1.5 rounded-full', statusConfig.dotClass)} />
            {statusConfig.label}
          </span>
          <div className="text-right space-y-0.5">
            <p className="text-xs text-muted-foreground">
              <span className="text-muted-foreground/60">Issued: </span>
              {formatInvoiceDate(createdAt)}
            </p>
            {dueDate && (
              <p className="text-xs text-muted-foreground">
                <span className="text-muted-foreground/60">Due: </span>
                {formatInvoiceDate(dueDate)}
              </p>
            )}
          </div>
        </div>

        {/* Bill To + Amount Due row — recipient on left, total on right */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium">
              Bill To
            </p>
            {recipientName ? (
              <div>
                <p className="text-sm font-medium">{recipientName}</p>
                {recipientLead?.email && (
                  <p className="text-xs text-muted-foreground">{recipientLead.email}</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No recipient assigned</p>
            )}
          </div>

          {/* Amount due — mirrors the Pay button position on the public page */}
          {total > 0 && (
            <div className="text-right shrink-0">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium">
                Amount Due
              </p>
              <p className="text-lg font-bold tabular-nums mt-0.5">
                {formatInvoiceAmount(total, currency)}
              </p>
            </div>
          )}
        </div>

        {/* Invoice name */}
        {invoiceName && invoiceName !== 'Untitled Invoice' && (
          <div>
            <p className="text-sm font-medium text-foreground">{invoiceName}</p>
          </div>
        )}

        {/* Items table — rounded-xl to match the refined card styling */}
        <div>
          {items.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-xs text-muted-foreground">No items added yet</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_60px_80px_80px] gap-2 px-4 py-2 bg-muted/50 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium">
                <span>Item</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Price</span>
                <span className="text-right">Total</span>
              </div>

              {/* Table rows */}
              {items.map((item) => {
                const lineTotal = item.quantity * item.unitAmount
                return (
                  <div
                    key={item.tempId}
                    className="grid grid-cols-[1fr_60px_80px_80px] gap-2 px-4 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="text-sm truncate">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {item.description}
                        </p>
                      )}
                      {item.billingType !== 'ONE_TIME' && item.interval && (
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                          {item.billingType === 'RECURRING' ? 'Recurring' : 'Split'}{' '}
                          / {item.interval.toLowerCase()}
                        </p>
                      )}
                    </div>
                    <span className="text-right tabular-nums">{item.quantity}</span>
                    <span className="text-right tabular-nums">
                      {formatInvoiceAmount(item.unitAmount, currency)}
                    </span>
                    <span className="text-right tabular-nums font-medium">
                      {formatInvoiceAmount(lineTotal, currency)}
                    </span>
                  </div>
                )
              })}

              {/* Total row */}
              <div className="grid grid-cols-[1fr_60px_80px_80px] gap-2 px-4 py-3 bg-muted/30">
                <span className="text-sm font-semibold col-span-3">Total</span>
                <span className="text-right text-sm font-bold tabular-nums">
                  {formatInvoiceAmount(total, currency)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* PAID watermark overlay */}
        {invoiceStatus === 'PAID' && (
          <div className="flex justify-center">
            <div className="px-8 py-3.5 rounded-xl border-2 border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-900/20">
              <span className="text-lg font-bold tracking-widest text-emerald-600 dark:text-emerald-400">
                PAID
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
