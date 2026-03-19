'use client'

/**
 * Preview Area Component
 *
 * WHY: Display the chat widget preview with decorative background
 * HOW: Centered preview with tab-specific settings panel placeholder
 *
 * SOURCE OF TRUTH: ChatWidgetEditor
 */

import { Loader2, Check } from 'lucide-react'
import { ChatWidgetPreview } from './chat-widget-preview'
import { useChatWidgetTheme } from './chat-widget-theme-context'

// ============================================================================
// TYPES
// ============================================================================

export type SettingsTab = 'general' | 'appearance' | 'behavior' | 'embed'

interface PreviewAreaProps {
  activeTab: SettingsTab
  widget: {
    id: string
    name: string
    description: string | null
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function PreviewArea({ activeTab, widget }: PreviewAreaProps) {
  const { saveStatus } = useChatWidgetTheme()

  return (
    <div className="h-full relative overflow-hidden bg-muted/50 bg-[radial-gradient(circle,rgb(80_80_80/0.25)_1px,transparent_1px)] bg-[length:20px_20px]">
      {/* Save status indicator - top right */}
      {saveStatus !== 'idle' && (
        <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 text-xs text-muted-foreground">
          {saveStatus === 'saving' && (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Saving...</span>
            </>
          )}
          {saveStatus === 'saved' && (
            <>
              <Check className="h-3 w-3" />
              <span>Saved</span>
            </>
          )}
        </div>
      )}

      {/* Chat Preview - centered with title above */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {/* Widget Title & Description - left aligned, same width as preview */}
        <div className="w-[22rem] mb-4">
          <h1 className="text-lg font-semibold">{widget.name}</h1>
          {widget.description && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {widget.description}
            </p>
          )}
        </div>

        {/* Preview Widget */}
        <div className="relative z-10">
          <ChatWidgetPreview widget={widget} />
        </div>
      </div>

      {/* Tab-specific settings panel (placeholder) */}
      <div className="absolute bottom-4 left-4 right-4">
        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            {activeTab === 'general' && 'Configure basic widget settings'}
            {activeTab === 'appearance' && 'Customize colors and styling'}
            {activeTab === 'behavior' && 'Set up chat behavior and responses'}
            {activeTab === 'embed' && 'Get the embed code for your site'}
          </p>
        </div>
      </div>
    </div>
  )
}
