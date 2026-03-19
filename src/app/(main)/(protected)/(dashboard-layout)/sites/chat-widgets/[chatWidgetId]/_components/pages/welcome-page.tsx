'use client'

/**
 * Welcome Page Component
 *
 * WHY: First page users see when opening the chat widget
 * HOW: Shows logo, greeting message (from config), and navigation CTAs
 *
 * Theme colors applied via props from ChatWidgetThemeContext
 *
 * SOURCE OF TRUTH: ChatWidgetPreview, ChatWidgetThemeContext
 */

import Image from 'next/image'
import { ChevronRight } from 'lucide-react'
import { IconRenderer } from '@/lib/icons'
import type { ChatWidgetThemeColors, WelcomPageConfig, ChatWidgetToggleConfig } from '../chat-widget-theme-context'

// ============================================================================
// TYPES
// ============================================================================

export type WidgetPage = 'welcome' | 'chat' | 'help' | 'updates'

interface WelcomePageProps {
  widget: {
    name: string
    description: string | null
  }
  onNavigate: (page: WidgetPage) => void
  /** Theme colors from context */
  theme: ChatWidgetThemeColors
  /** Welcome page specific config */
  welcomeConfig: WelcomPageConfig
  /** Toggle button config for logo/icon (set during widget creation) */
  toggleConfig: ChatWidgetToggleConfig
  /** Pre-computed accent style (supports gradients) */
  accentStyle: React.CSSProperties
}

// ============================================================================
// COMPONENT
// ============================================================================

export function WelcomePage({
  widget,
  onNavigate,
  theme,
  welcomeConfig,
  toggleConfig,
  accentStyle,
}: WelcomePageProps) {
  return (
    <div className="h-full flex flex-col p-6">
      {/* Logo - Uses toggle config (image or icon) */}
      <div
        className="size-10 rounded-lg flex items-center justify-center overflow-hidden"
        style={accentStyle}
      >
        {toggleConfig.type === 'image' && toggleConfig.image ? (
          <Image
            src={toggleConfig.image}
            alt="Logo"
            width={40}
            height={40}
            priority
            className="w-full h-full object-cover"
          />
        ) : (
          <IconRenderer
            name={toggleConfig.icon || 'message-circle'}
            size={20}
            className="text-white"
          />
        )}
      </div>

      {/* Title from config */}
      <h1
        className="text-2xl font-semibold mt-6"
        style={{ color: theme.primaryText }}
      >
        {welcomeConfig.title}
      </h1>

      {/* Subtitle from config */}
      {welcomeConfig.subtitle && (
        <p
          className="text-sm mt-1"
          style={{ color: theme.secondaryText }}
        >
          {welcomeConfig.subtitle}
        </p>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Navigation Cards */}
      <div className="space-y-2">
        {/* Chat CTA */}
        <button
          onClick={() => onNavigate('chat')}
          className="w-full p-4 rounded-lg border transition-colors text-left group"
          style={{ backgroundColor: 'transparent', borderColor: theme.border }}
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: theme.primaryText }}>
                Start a conversation
              </p>
              <p className="text-xs mt-0.5" style={{ color: theme.secondaryText }}>
                {widget.description || 'We typically reply within minutes'}
              </p>
            </div>
            <ChevronRight
              className="size-5 group-hover:translate-x-0.5 transition-transform"
              style={{ color: theme.secondaryText }}
            />
          </div>
        </button>

        {/* Help CTA */}
        <button
          onClick={() => onNavigate('help')}
          className="w-full p-4 rounded-lg border transition-colors text-left group"
          style={{ backgroundColor: 'transparent', borderColor: theme.border }}
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: theme.primaryText }}>
                Help center
              </p>
              <p className="text-xs mt-0.5" style={{ color: theme.secondaryText }}>
                Find answers to common questions
              </p>
            </div>
            <ChevronRight
              className="size-5 group-hover:translate-x-0.5 transition-transform"
              style={{ color: theme.secondaryText }}
            />
          </div>
        </button>

        {/* Updates CTA */}
        <button
          onClick={() => onNavigate('updates')}
          className="w-full p-4 rounded-lg border transition-colors text-left group"
          style={{ backgroundColor: 'transparent', borderColor: theme.border }}
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: theme.primaryText }}>
                Updates
              </p>
              <p className="text-xs mt-0.5" style={{ color: theme.secondaryText }}>
                See what&apos;s new
              </p>
            </div>
            <ChevronRight
              className="size-5 group-hover:translate-x-0.5 transition-transform"
              style={{ color: theme.secondaryText }}
            />
          </div>
        </button>
      </div>
    </div>
  )
}
