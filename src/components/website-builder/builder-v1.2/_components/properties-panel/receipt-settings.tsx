/**
 * ============================================================================
 * RECEIPT SETTINGS SECTION - Configuration for Receipt Elements
 * ============================================================================
 *
 * SOURCE OF TRUTH: Receipt Element Settings in Properties Panel
 *
 * Renders the Settings tab content for Receipt elements.
 * Currently only exposes a theme toggle (light/dark) since all receipt data
 * is fetched at runtime from the transaction service — no configurable content.
 *
 * Follows the same Sun/Moon toggle pattern used by checkout-settings.tsx
 * and payment-settings.tsx for visual consistency across the builder.
 *
 * ============================================================================
 */

'use client'

import React from 'react'
import { PropertySection } from './controls'
import { useAppDispatch, updateElement } from '../../_lib'
import type { ReceiptElement } from '../../_lib/types'
import { Sun, Moon } from 'lucide-react'

interface ReceiptSettingsSectionProps {
  /** The selected receipt element — SOURCE OF TRUTH: ReceiptElement from types.ts */
  element: ReceiptElement
}

/**
 * Renders Receipt element settings in the Settings tab.
 * Provides a theme toggle so users can switch the receipt between
 * light and dark mode to match their website's design.
 *
 * SOURCE OF TRUTH: ReceiptSettingsSection, ReceiptSettingsPanel
 */
export function ReceiptSettingsSection({ element }: ReceiptSettingsSectionProps) {
  const dispatch = useAppDispatch()

  /**
   * Update a receipt element property via Redux dispatch.
   * Generic helper for type-safe property updates.
   */
  const updateProperty = <K extends keyof ReceiptElement>(
    key: K,
    value: ReceiptElement[K]
  ) => {
    dispatch(
      updateElement({
        id: element.id,
        updates: { [key]: value },
      })
    )
  }

  /** Current theme with fallback to dark (default) */
  const theme = element.theme ?? 'dark'

  return (
    <>
      {/* Appearance Section — Theme toggle */}
      <PropertySection title="Appearance" defaultOpen>
        {/* Theme Toggle — Light/Dark mode with Sun/Moon icons */}
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm text-foreground">Theme</span>
          <div className="flex items-center gap-1 bg-muted rounded-md p-1">
            {/* Light mode button */}
            <button
              type="button"
              onClick={() => updateProperty('theme', 'light')}
              className={`p-1.5 rounded transition-colors ${
                theme === 'light'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Light mode"
            >
              <Sun className="w-4 h-4" />
            </button>

            {/* Dark mode button */}
            <button
              type="button"
              onClick={() => updateProperty('theme', 'dark')}
              className={`p-1.5 rounded transition-colors ${
                theme === 'dark'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Dark mode"
            >
              <Moon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </PropertySection>

      {/* Info Section — Explains how the receipt element works */}
      <PropertySection title="How It Works" defaultOpen={false}>
        <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/50 rounded-md space-y-2">
          <p>
            Displays a payment receipt after a successful checkout. Drop this element
            on a confirmation page.
          </p>
          <p>
            <strong>How it works:</strong>
          </p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Customer completes payment on checkout page</li>
            <li>Customer is redirected to this page with a transaction ID</li>
            <li>Receipt element loads and displays the payment details</li>
            <li>Customer can generate and download an invoice</li>
          </ol>
          <p className="text-muted-foreground/60 italic">
            Pair with a Checkout or Payment element that redirects to this page after payment.
          </p>
        </div>
      </PropertySection>
    </>
  )
}
