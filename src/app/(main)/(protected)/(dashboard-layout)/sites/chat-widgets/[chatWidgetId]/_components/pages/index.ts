/**
 * Chat Widget Pages - Barrel Export
 *
 * WHY: Clean imports for all page components
 * HOW: Re-exports all page components from single entry point
 *
 * SOURCE OF TRUTH: ChatWidgetPreview pages
 */

export { WelcomePage, type WidgetPage } from './welcome-page'
export { ChatPage, type ChatMessage, type ChatSession } from './chat-page'
export { HelpPage } from './help-page'
export { UpdatesPage } from './updates-page'
export { WidgetHeader } from './widget-header'
