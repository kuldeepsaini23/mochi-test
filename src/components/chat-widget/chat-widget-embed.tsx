/**
 * Chat Widget Embed Component
 *
 * Public chat widget for embedding on any page.
 * Uses the SOURCE OF TRUTH components from the chat widget editor.
 *
 * SOURCE OF TRUTH KEYWORDS: ChatWidgetEmbed, PublicChatWidget
 *
 * NOTE: This component uses the exact same page components as the editor preview,
 * just with 'live' mode enabled for the ChatPage to support real messaging.
 *
 * OPTIMISTIC UI: Uses tRPC onMutate/onError/onSuccess via useChatWidgetPaginatedMessages
 * NO MANUAL STATE for messages - all optimistic updates go through tRPC cache
 */

'use client'

import { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import { trpc } from '@/trpc/react-provider'
import { gradientToCSS } from '@/components/email-builder/_lib/gradient-utils'
import { IconRenderer } from '@/lib/icons'
import { useChatWidgetSession } from './use-chat-widget-session'
import { useChatWidgetPaginatedMessages } from './use-chat-widget-paginated-messages'

// Import SOURCE OF TRUTH components and types from the editor
import {
  WelcomePage,
  ChatPage,
  HelpPage,
  UpdatesPage,
  WidgetHeader,
  type WidgetPage,
} from '@/app/(main)/(protected)/(dashboard-layout)/sites/chat-widgets/[chatWidgetId]/_components/pages'
import {
  type ChatWidgetConfig,
  LIGHT_THEME,
} from '@/app/(main)/(protected)/(dashboard-layout)/sites/chat-widgets/[chatWidgetId]/_components/chat-widget-theme-context'

// ============================================================================
// TYPES
// ============================================================================

interface ChatWidgetEmbedProps {
  organizationId: string
  chatWidgetId: string
  /**
   * Device type passed from parent embed script
   * WHY: Widget is in iframe, can't detect real device from viewport
   * HOW: Embed script passes ?isMobile=true/false, parent reads and passes here
   * DEFAULT: false (desktop) for backwards compatibility
   */
  isMobileDevice?: boolean
}

// ============================================================================
// ANIMATION VARIANTS (same as ChatWidgetPreview)
// ============================================================================

const pageVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 20 : -20,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -20 : 20,
    opacity: 0,
  }),
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: ChatWidgetConfig = {
  theme: LIGHT_THEME,
  behavior: { autoOpen: false, enableSounds: false, showBranding: true, chatWelcomeMessage: 'Hi there! How can I help you today?' },
  toggle: { type: 'image', image: null, icon: 'message-circle' },
  welcomePage: { title: 'Hi there', subtitle: 'How can we help you today?' },
  helpPage: { faqItems: [] },
  updatesPage: { updates: [] },
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ChatWidgetEmbed({ organizationId, chatWidgetId, isMobileDevice = false }: ChatWidgetEmbedProps) {
  // Widget state
  const [isOpen, setIsOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState<WidgetPage>('welcome')
  const [direction, setDirection] = useState(0)
  const [selectedUpdate, setSelectedUpdate] = useState<{
    id: string
    title: string
    content: string
    featuredImage?: string | null
    featuredImageFileId?: string | null
    createdAt: Date
  } | null>(null)

  // Fetch widget configuration using the SOURCE OF TRUTH service
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const widgetQuery = trpc.chatWidgetMessaging.getWidgetConfig.useQuery(
    { organizationId, chatWidgetId },
    { refetchOnWindowFocus: false }
  ) as { data: any; isLoading: boolean }

  /**
   * Chat session management - handles session init, typing, identifying
   * NOTE: Message sending moved to paginated hook for proper optimistic UI
   */
  const {
    isLoading: isSessionLoading,
    session,
    token,
    isIdentified,
    identifyUser,
    isIdentifying,
    error,
    isTeamTyping,
    emitTyping,
    setOnTeamMessage,
    activateSession,
  } = useChatWidgetSession({ organizationId, chatWidgetId })

  /**
   * Paginated messages hook - uses useInfiniteQuery for bi-directional pagination
   * + tRPC onMutate/onError/onSuccess for proper optimistic UI
   *
   * WHY: Load older messages when scrolling up, with proper caching
   * HOW: All pages stored in single cache entry, instant scroll positioning
   *
   * OPTIMISTIC UI: Handled via tRPC mutation callbacks, NOT manual state
   */
  /**
   * Paginated messages hook — uses useInfiniteQuery for bi-directional pagination
   * + tRPC onMutate/onError/onSuccess for proper optimistic UI
   *
   * FIRST MESSAGE FLOW: When no token exists and the visitor sends their first
   * message, the server creates a Lead + LeadSession inline. The session is
   * returned and onSessionCreated → activateSession stores the token on the client,
   * which then enables the infinite query for future messages.
   */
  const {
    messages,
    pagination,
    isLoading: isPaginatedLoading,
    isLoadingPrevious,
    loadPrevious,
    sendMessage,
    isSending,
  } = useChatWidgetPaginatedMessages({
    organizationId,
    chatWidgetId,
    token,
    enabled: !!token && !isSessionLoading,
    setOnTeamMessage,
    onSessionCreated: activateSession,
  })

  // Parse widget config - same parsing as ChatWidgetThemeProvider
  const widgetData = widgetQuery.data
  const parsedConfig = widgetData?.config as Partial<{
    theme: Partial<ChatWidgetConfig['theme']>
    behavior: Partial<ChatWidgetConfig['behavior']>
    toggle: Partial<ChatWidgetConfig['toggle']>
    welcomePage: Partial<ChatWidgetConfig['welcomePage']>
  }> | null

  // Type helpers for widgetData
  const faqItemsData = widgetData && 'faqItems' in widgetData
    ? (widgetData.faqItems as Array<{ id: string; question: string; answer: string }>)
    : []

  const updatesData = widgetData && 'updates' in widgetData
    ? (widgetData.updates as Array<{ id: string; title: string; content: string; featuredImage?: string | null; featuredImageFileId?: string | null; createdAt: string | Date }>)
    : []

  const config: ChatWidgetConfig = {
    theme: { ...DEFAULT_CONFIG.theme, ...parsedConfig?.theme },
    behavior: { ...DEFAULT_CONFIG.behavior, ...parsedConfig?.behavior },
    toggle: { ...DEFAULT_CONFIG.toggle, ...parsedConfig?.toggle },
    welcomePage: { ...DEFAULT_CONFIG.welcomePage, ...parsedConfig?.welcomePage },
    helpPage: {
      faqItems: faqItemsData.map((f) => ({
        id: f.id,
        question: f.question,
        answer: f.answer,
      })),
    },
    updatesPage: {
      updates: updatesData.map((u) => ({
        id: u.id,
        title: u.title,
        content: u.content,
        featuredImage: u.featuredImage,
        featuredImageFileId: u.featuredImageFileId,
        createdAt: typeof u.createdAt === 'string' ? new Date(u.createdAt) : u.createdAt,
      })),
    },
  }

  // Navigation handlers (same as ChatWidgetPreview)
  const navigateTo = useCallback((page: WidgetPage) => {
    setDirection(1)
    setCurrentPage(page)
  }, [])

  const navigateBack = useCallback(() => {
    if (currentPage === 'updates' && selectedUpdate) {
      setSelectedUpdate(null)
      return
    }
    setDirection(-1)
    setCurrentPage('welcome')
  }, [currentPage, selectedUpdate])

  const handleSelectUpdate = useCallback((update: typeof selectedUpdate) => {
    setSelectedUpdate(update)
  }, [])

  /**
   * Auto-open based on behavior settings
   *
   * WHY useLayoutEffect instead of useEffect:
   * useEffect fires AFTER the browser paints — causing a visible flash of the
   * closed state (toggle button only) before the panel opens. useLayoutEffect
   * fires synchronously BEFORE paint, so the user never sees the closed state.
   *
   * WHY ref guard:
   * Prevents re-opening the widget if the user manually closes it. Without the
   * guard, any config query refetch where autoOpen=true would reopen the widget.
   */
  const autoOpenHandledRef = useRef(false)
  useLayoutEffect(() => {
    if (!autoOpenHandledRef.current && config.behavior.autoOpen && !isOpen) {
      autoOpenHandledRef.current = true
      setIsOpen(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.behavior.autoOpen])

  // Build styles (same as ChatWidgetPreview)
  const backgroundStyle = config.theme.backgroundGradient
    ? { background: gradientToCSS(config.theme.backgroundGradient) }
    : { backgroundColor: config.theme.background }

  const accentStyle = config.theme.accentGradient
    ? { background: gradientToCSS(config.theme.accentGradient) }
    : { backgroundColor: config.theme.accent }

  // Page title helper (same as ChatWidgetPreview)
  const getPageTitle = (page: WidgetPage): string => {
    if (page === 'updates' && selectedUpdate) {
      return selectedUpdate.title
    }
    switch (page) {
      case 'chat': return 'Chat'
      case 'help': return 'Help'
      case 'updates': return 'Updates'
      default: return ''
    }
  }

  // Loading state
  if (widgetQuery.isLoading) {
    return null
  }

  // Widget not found
  if (!widgetData) {
    return null
  }

  const widget = {
    id: widgetData.id,
    name: widgetData.name,
    description: widgetData.description,
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-end justify-end pointer-events-none">
      {/* Main Chat Widget Panel - Uses isMobileDevice prop from parent (NOT viewport) */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className={`flex flex-col overflow-hidden shadow-xl pointer-events-auto relative ${
              isMobileDevice
                ? 'w-full h-full rounded-none border-0'
                : 'w-[24rem] h-[40rem] rounded-xl border m-4'
            }`}
            style={{ ...backgroundStyle, borderColor: config.theme.border }}
          >
            {/*
              Mobile close button - only visible on REAL mobile devices
              WHY: On mobile the widget is full screen, need a way to close it
              HOW: Uses isMobileDevice prop from parent, NOT viewport breakpoints
            */}
            {isMobileDevice && (
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full flex items-center justify-center bg-black/10 hover:bg-black/20 transition-colors"
                title="Close chat"
              >
                <IconRenderer
                  name="x"
                  size={20}
                  style={{ color: config.theme.primaryText }}
                />
              </button>
            )}

            {/* Page Content with animated transitions - SAME as ChatWidgetPreview */}
            <div className="flex-1 overflow-hidden relative">
              <AnimatePresence initial={false} custom={direction} mode="popLayout">
                {currentPage === 'welcome' && (
                  <motion.div
                    key="welcome"
                    custom={direction}
                    variants={pageVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                    className="absolute inset-0 overflow-y-auto"
                  >
                    <WelcomePage
                      widget={widget}
                      onNavigate={navigateTo}
                      theme={config.theme}
                      welcomeConfig={config.welcomePage}
                      toggleConfig={config.toggle}
                      accentStyle={accentStyle}
                    />
                  </motion.div>
                )}
                {currentPage === 'chat' && (
                  <motion.div
                    key="chat"
                    custom={direction}
                    variants={pageVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                    className="absolute inset-0 flex flex-col overflow-hidden"
                  >
                    <WidgetHeader
                      title={getPageTitle('chat')}
                      onBack={navigateBack}
                      onClose={() => setIsOpen(false)}
                      theme={config.theme}
                    />
                    <div className="flex-1 overflow-hidden">
                      {/* ChatPage with LIVE mode + OPTIMISTIC UI via tRPC callbacks
                          + TYPING INDICATORS for realtime "..." animation
                          + BI-DIRECTIONAL PAGINATION for infinite scroll
                          + INITIAL TYPING ANIMATION with custom welcome message */}
                      <ChatPage
                        widget={widget}
                        theme={config.theme}
                        toggleConfig={config.toggle}
                        accentStyle={accentStyle}
                        mode="live"
                        messages={messages}
                        session={session}
                        isLoading={isSessionLoading || isPaginatedLoading}
                        onSendMessage={sendMessage}
                        isSending={isSending}
                        onIdentifyUser={identifyUser}
                        isIdentifying={isIdentifying}
                        error={error}
                        isTeamTyping={isTeamTyping}
                        onTyping={emitTyping}
                        // Pagination props
                        hasPrevious={pagination.hasPrevious}
                        onLoadPrevious={loadPrevious}
                        isLoadingPrevious={isLoadingPrevious}
                        // Welcome message - custom greeting from behavior config
                        welcomeMessage={config.behavior.chatWelcomeMessage}
                      />
                    </div>
                  </motion.div>
                )}
                {currentPage === 'help' && (
                  <motion.div
                    key="help"
                    custom={direction}
                    variants={pageVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                    className="absolute inset-0 flex flex-col overflow-hidden"
                  >
                    <WidgetHeader
                      title={getPageTitle('help')}
                      onBack={navigateBack}
                      onClose={() => setIsOpen(false)}
                      theme={config.theme}
                    />
                    <div className="flex-1 overflow-hidden">
                      <HelpPage theme={config.theme} faqItems={config.helpPage.faqItems} />
                    </div>
                  </motion.div>
                )}
                {currentPage === 'updates' && (
                  <motion.div
                    key="updates"
                    custom={direction}
                    variants={pageVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                    className="absolute inset-0 flex flex-col overflow-hidden"
                  >
                    <WidgetHeader
                      title={getPageTitle('updates')}
                      onBack={navigateBack}
                      onClose={() => setIsOpen(false)}
                      theme={config.theme}
                    />
                    <div className="flex-1 overflow-hidden">
                      <UpdatesPage
                        theme={config.theme}
                        updates={config.updatesPage.updates}
                        selectedUpdate={selectedUpdate}
                        onSelectUpdate={handleSelectUpdate}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer - only show if branding enabled (same as ChatWidgetPreview) */}
            {config.behavior.showBranding && (
              <div
                className="px-4 py-2 border-t"
                style={{ borderColor: config.theme.border }}
              >
                <p
                  className="text-[10px] text-center"
                  style={{ color: config.theme.secondaryText }}
                >
                  Powered by Mochi
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/*
        Toggle Button - Chat widget launcher
        WHY: Opens/closes the chat widget
        HOW:
        - pointer-events-auto: Makes button clickable (parent has pointer-events-none)
        - On mobile: Hidden when widget is open (widget is full screen with X button)
        - On desktop: Always visible
        - Uses isMobileDevice prop from parent, NOT viewport breakpoints
        - mr-4 mb-4: Margin for shadow breathing room (shadow-lg extends ~10px)
        - flex-shrink-0: Prevents layout shift when panel opens/closes
      */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 mr-4 mb-4 flex-shrink-0 rounded-full items-center justify-center shadow-lg hover:scale-105 overflow-hidden pointer-events-auto transition-all duration-200 ${
          isOpen && isMobileDevice ? 'hidden' : 'flex'
        }`}
        style={accentStyle}
        title={isOpen ? 'Close chat' : 'Open chat'}
      >
        {config.toggle.type === 'image' && config.toggle.image ? (
          <Image
            src={config.toggle.image}
            alt="Chat"
            width={56}
            height={56}
            priority
            className="w-full h-full object-cover"
          />
        ) : (
          <IconRenderer
            name={isOpen ? 'x' : (config.toggle.icon || 'message-circle')}
            size={24}
            className="text-white"
          />
        )}
      </button>
    </div>
  )
}

export default ChatWidgetEmbed
