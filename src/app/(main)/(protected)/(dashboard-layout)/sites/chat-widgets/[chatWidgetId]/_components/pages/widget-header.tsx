'use client'

/**
 * Widget Header Component
 *
 * WHY: Navigation header for non-welcome pages
 * HOW: Back button, title, and close button with theme colors
 *
 * SOURCE OF TRUTH: ChatWidgetPreview, ChatWidgetThemeContext
 */

import { ArrowLeft, X } from 'lucide-react'
import type { ChatWidgetThemeColors } from '../chat-widget-theme-context'

// ============================================================================
// TYPES
// ============================================================================

interface WidgetHeaderProps {
  title: string
  onBack: () => void
  onClose: () => void
  /** Theme colors from context */
  theme: ChatWidgetThemeColors
}

// ============================================================================
// COMPONENT
// ============================================================================

export function WidgetHeader({ title, onBack, onClose, theme }: WidgetHeaderProps) {
  return (
    <div
      className="px-4 py-3 border-b flex items-center gap-3"
      style={{ borderColor: theme.border }}
    >
      <button
        onClick={onBack}
        className="size-8 rounded-full hover:bg-black/5 flex items-center justify-center transition-colors"
      >
        <ArrowLeft className="size-4" style={{ color: theme.secondaryText }} />
      </button>
      <p className="flex-1 text-sm font-medium" style={{ color: theme.primaryText }}>
        {title}
      </p>
      <button
        onClick={onClose}
        className="size-8 rounded-full hover:bg-black/5 flex items-center justify-center transition-colors"
      >
        <X className="size-4" style={{ color: theme.secondaryText }} />
      </button>
    </div>
  )
}
