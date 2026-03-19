/**
 * Chat Widget Components - Shared Exports
 *
 * WHY: Single entry point for chat widget components
 * HOW: Re-exports from the SOURCE OF TRUTH location
 *
 * SOURCE OF TRUTH KEYWORDS: ChatWidget, ChatWidgetEmbed, ChatWidgetPages
 *
 * NOTE: The actual components live in the chat-widgets editor folder.
 * This file re-exports them for use in other parts of the app (like the public embed).
 */

// Page components
export {
  WelcomePage,
  ChatPage,
  HelpPage,
  UpdatesPage,
  WidgetHeader,
  type WidgetPage,
  type ChatMessage,
  type ChatSession,
} from '@/app/(main)/(protected)/(dashboard-layout)/sites/chat-widgets/[chatWidgetId]/_components/pages'

// Theme context types
export {
  type ChatWidgetThemeColors,
  type ChatWidgetBehavior,
  type ChatWidgetToggleConfig,
  type WelcomPageConfig,
  type FAQItem,
  type UpdateItem,
  type ChatWidgetConfig,
  LIGHT_THEME,
  DARK_THEME,
} from '@/app/(main)/(protected)/(dashboard-layout)/sites/chat-widgets/[chatWidgetId]/_components/chat-widget-theme-context'

// Public embed component
export { ChatWidgetEmbed } from './chat-widget-embed'
export { useChatWidgetSession } from './use-chat-widget-session'
export { useChatWidgetPaginatedMessages } from './use-chat-widget-paginated-messages'
