/**
 * Chat Widget Editor Component - Active Organization Pattern
 *
 * WHY: Client component that displays chat widget editor for the active organization
 * HOW: Uses useActiveOrganization hook for org context and permissions
 *
 * Main editor layout for configuring a chat widget with:
 * - Left sidebar for settings
 * - Right area for live preview
 * - Wrapped with ChatWidgetThemeProvider to share settings
 * - All config is loaded from DB and saved via TRPC mutations
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based access control via hasPermission helper
 *
 * SOURCE OF TRUTH: ChatWidget, ChatWidgetThemeContext, ActiveOrganization
 */

'use client'

import { useState } from 'react'
import { useTheme } from 'next-themes'
import { trpc } from '@/trpc/react-provider'
import { PreviewArea, type SettingsTab } from './preview-area'
import { EditorSidebar } from './editor-sidebar'
import { EditorSkeleton } from './editor-skeleton'
import { ChatWidgetThemeProvider, LIGHT_THEME, DARK_THEME } from './chat-widget-theme-context'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'

// ============================================================================
// TYPES
// ============================================================================

interface ChatWidgetEditorProps {
  chatWidgetId: string
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Main chat widget editor component with client-side data fetching
 * Only requires chatWidgetId - organization data is fetched with caching
 */
export function ChatWidgetEditor({
  chatWidgetId,
}: ChatWidgetEditorProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  // Detect app theme to set initial widget theme if no saved config
  const { resolvedTheme } = useTheme()
  const defaultTheme = resolvedTheme === 'dark' ? DARK_THEME : LIGHT_THEME

  // ============================================================================
  // ORGANIZATION DATA - Using active organization hook
  // ============================================================================
  const { activeOrganization, isLoading: isLoadingOrg, hasPermission } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''

  // ============================================================================
  // PERMISSION CHECKS - Using hasPermission helper from hook
  // Using store permissions as placeholder until we add chat widget permissions
  // ============================================================================
  const hasReadAccess = hasPermission(permissions.STORES_READ)

  // ============================================================================
  // CHAT WIDGET DATA - Fetch after organization is loaded
  // ============================================================================
  const { data: widget, isLoading: isLoadingWidget } = trpc.chatWidgets.getById.useQuery(
    {
      organizationId,
      chatWidgetId,
    },
    {
      enabled: !!organizationId, // Only fetch when we have the org ID
    }
  )

  // ============================================================================
  // LOADING STATE - Show skeleton while data is being fetched
  // ============================================================================
  if ((isLoadingOrg && !activeOrganization) || isLoadingWidget) {
    return <EditorSkeleton />
  }

  // ============================================================================
  // NO ORGANIZATION - User doesn't belong to any organization
  // ============================================================================
  if (!activeOrganization) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">
          No organization found. Please contact your administrator.
        </p>
      </div>
    )
  }

  // ============================================================================
  // NO ACCESS - User doesn't have permission to view chat widgets
  // ============================================================================
  if (!hasReadAccess) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">
          You do not have permission to view this chat widget.
        </p>
      </div>
    )
  }

  // ============================================================================
  // WIDGET NOT FOUND
  // ============================================================================
  if (!widget) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Chat widget not found</p>
      </div>
    )
  }

  // ============================================================================
  // MAIN CONTENT - Prepare initial data from DB
  // ============================================================================
  // If no saved config, use defaults with app theme
  // Toggle config is set during widget creation (includes org logo if available)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const savedConfig = (widget as any).config as Record<string, unknown> | null
  const initialData = {
    config: savedConfig ?? { theme: defaultTheme },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    faqItems: (widget as any).faqItems ?? [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updates: (widget as any).updates ?? [],
  }

  return (
    <ChatWidgetThemeProvider
      organizationId={organizationId}
      chatWidgetId={chatWidgetId}
      initialData={initialData}
    >
      <div className="h-full flex overflow-hidden">
        {/* Left Sidebar - controls theme/settings */}
        <EditorSidebar activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Preview Area - renders with theme applied */}
        <main className="flex-1 overflow-hidden">
          <PreviewArea activeTab={activeTab} widget={widget} />
        </main>
      </div>
    </ChatWidgetThemeProvider>
  )
}
