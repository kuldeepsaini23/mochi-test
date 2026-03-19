'use client'

/**
 * Chat Widget Preview Component
 *
 * WHY: Shows a live preview of the chat widget in the editor
 * HOW: Multi-page widget with animated transitions, themed via context
 *
 * Pages (in /pages folder):
 * 1. Welcome - Logo, greeting, CTA to start chat
 * 2. Chat - Main chat interface
 * 3. Help - FAQ with shadcn Accordion
 * 4. Updates - Product updates (with detail view)
 *
 * All theme colors and settings come from ChatWidgetThemeContext
 *
 * SOURCE OF TRUTH: ChatWidgetThemeContext, ChatWidget
 */

import { useState, useCallback } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import {
  WelcomePage,
  ChatPage,
  HelpPage,
  UpdatesPage,
  WidgetHeader,
  type WidgetPage,
} from './pages'
import { useChatWidgetTheme, type UpdateItem } from './chat-widget-theme-context'
import { gradientToCSS } from '@/components/email-builder/_lib/gradient-utils'
import { IconRenderer } from '@/lib/icons'

// ============================================================================
// TYPES
// ============================================================================

interface ChatWidgetPreviewProps {
  widget: {
    id: string
    name: string
    description: string | null
  }
}

// ============================================================================
// ANIMATION VARIANTS
// Direction-aware slide + fade for page transitions
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
// MAIN COMPONENT
// ============================================================================

export function ChatWidgetPreview({ widget }: ChatWidgetPreviewProps) {
  const [currentPage, setCurrentPage] = useState<WidgetPage>('welcome')
  const [direction, setDirection] = useState(0)
  // Toggle image is set during widget creation - no runtime fallback needed
  const { config } = useChatWidgetTheme()

  /** Track selected update for header title (null = list view) */
  const [selectedUpdate, setSelectedUpdate] = useState<UpdateItem | null>(null)

  /**
   * Navigate to a page (forward direction)
   */
  const navigateTo = (page: WidgetPage) => {
    setDirection(1)
    setCurrentPage(page)
  }

  /**
   * Navigate back to welcome (backward direction)
   * Also clears selected update if any
   */
  const navigateBack = () => {
    // If viewing update detail, go back to updates list first
    if (currentPage === 'updates' && selectedUpdate) {
      setSelectedUpdate(null)
      return
    }
    setDirection(-1)
    setCurrentPage('welcome')
  }

  /**
   * Handle update selection from UpdatesPage
   * Updates the header title accordingly
   */
  const handleSelectUpdate = useCallback((update: UpdateItem | null) => {
    setSelectedUpdate(update)
  }, [])

  /**
   * Get the title for the current page
   * For updates: show update title if viewing detail, else "Updates"
   */
  const getPageTitle = (page: WidgetPage): string => {
    if (page === 'updates' && selectedUpdate) {
      return selectedUpdate.title
    }
    switch (page) {
      case 'chat':
        return 'Chat'
      case 'help':
        return 'Help'
      case 'updates':
        return 'Updates'
      default:
        return ''
    }
  }

  // Build background style (supports solid or gradient)
  const backgroundStyle = config.theme.backgroundGradient
    ? { background: gradientToCSS(config.theme.backgroundGradient) }
    : { backgroundColor: config.theme.background }

  // Build accent style for buttons
  const accentStyle = config.theme.accentGradient
    ? { background: gradientToCSS(config.theme.accentGradient) }
    : { backgroundColor: config.theme.accent }

  return (
    <div className="flex flex-col items-end gap-4">
      {/* Main Chat Widget
          SOURCE OF TRUTH: Widget dimensions 24rem × 40rem (384px × 640px)
          SYNC WITH: chat-widget-embed.tsx, embed script iframe */}
      <div
        className="w-[24rem] h-[40rem] flex flex-col rounded-xl overflow-hidden border"
        style={{ ...backgroundStyle, borderColor: config.theme.border }}
      >
        {/* Page Content with animated transitions */}
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
                  onClose={navigateBack}
                  theme={config.theme}
                />
                <div className="flex-1 overflow-hidden">
                  <ChatPage
                    widget={widget}
                    theme={config.theme}
                    toggleConfig={config.toggle}
                    accentStyle={accentStyle}
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
                  onClose={navigateBack}
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
                  onClose={navigateBack}
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

        {/* Footer - only show if branding enabled */}
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
      </div>

      {/* Toggle Button - Chat widget launcher */}
      <button
        type="button"
        className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 overflow-hidden"
        style={{ ...accentStyle }}
        title="Chat widget toggle"
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
            name={config.toggle.icon || 'message-circle'}
            size={24}
            className="text-white"
          />
        )}
      </button>
    </div>
  )
}
