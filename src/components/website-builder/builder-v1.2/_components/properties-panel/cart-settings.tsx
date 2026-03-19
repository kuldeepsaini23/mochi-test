/**
 * ============================================================================
 * CART SETTINGS SECTION - Settings Tab for Cart Button Elements
 * ============================================================================
 *
 * SOURCE OF TRUTH: Cart button element settings in the Properties Panel
 *
 * Renders the Settings tab content for Cart button elements.
 * The Cart button opens the shopping cart sheet when clicked.
 *
 * ============================================================================
 * IMPORTANT: NO ACTION CONFIGURATION
 * ============================================================================
 *
 * The Cart button always opens the shopping cart sheet when clicked.
 * This is intentional - the button's purpose is singular and clear.
 *
 * All visual controls (label, icon, colors, typography, etc.) are in the
 * Design tab alongside regular buttons. This Settings tab just provides
 * information about the cart button's behavior.
 *
 * ============================================================================
 */

'use client'

import React from 'react'
import { PropertySection } from './controls'
import type { CartElement } from '../../_lib/types'

interface CartSettingsSectionProps {
  element: CartElement
}

/**
 * Renders Cart button settings in the Settings tab.
 * Shows info about how the cart button works.
 * NO action configuration - functionality is implicit.
 */
export function CartSettingsSection({ element: _element }: CartSettingsSectionProps) {
  return (
    <PropertySection title="How It Works" defaultOpen>
      <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/50 rounded-md space-y-2">
        <p>
          This button opens the shopping cart sheet when clicked.
        </p>
        <p>
          <strong>Tip:</strong> Place in your header or navigation for easy access.
        </p>
        <p>
          A badge will automatically appear showing the number of items in the cart.
        </p>
        <p className="pt-2 border-t border-border/50">
          <strong>Note:</strong> Label, icon, colors, and styling options are in the Design tab.
        </p>
      </div>
    </PropertySection>
  )
}
