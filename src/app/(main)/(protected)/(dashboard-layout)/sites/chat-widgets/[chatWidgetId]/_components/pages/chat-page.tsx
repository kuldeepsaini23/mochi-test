'use client'

/**
 * Chat Page Component
 *
 * WHY: Main chat interface for conversations
 * HOW: Messages area with input field, themed via context
 *      Supports both 'preview' mode (static, for editor) and 'live' mode (with real messaging)
 *
 * SOURCE OF TRUTH: ChatWidgetPreview, ChatWidgetThemeContext, ChatWidgetEmbed
 *
 * MODES:
 * - preview: Static display for the widget editor (default)
 * - live: Interactive messaging for the public embed
 *
 * OPTIMISTIC UI: Messages appear instantly - no loading spinners or status
 * indicators. Just like a real chat app.
 *
 * BI-DIRECTIONAL PAGINATION:
 * - Supports loading older messages when scrolling to top
 * - Instant scroll positioning using useLayoutEffect (no visible animation)
 * - Scroll position preserved when loading older messages
 *
 * FLOW (live mode):
 * 1. User can send messages immediately as guest (no email required)
 * 2. After first message, a non-blocking contact form appears
 * 3. User can dismiss the form and continue chatting
 * 4. If user provides email, they become an identified lead
 */

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import Image from 'next/image'
import { Send, X } from 'lucide-react'
import { IconRenderer } from '@/lib/icons'
import type { ChatWidgetThemeColors, ChatWidgetToggleConfig } from '../chat-widget-theme-context'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Message type for live mode
 * SOURCE OF TRUTH KEYWORDS: ChatWidgetMessage, LiveChatMessage
 */
export interface ChatMessage {
  id: string
  direction: 'INBOUND' | 'OUTBOUND'
  body: string
  sentAt: Date
}

/**
 * Session info for live mode
 * SOURCE OF TRUTH KEYWORDS: ChatWidgetSession, LiveChatSession
 */
export interface ChatSession {
  isIdentified: boolean
  lead?: {
    firstName: string | null
    email: string
  }
}

interface ChatPageProps {
  widget: {
    name: string
    description: string | null
  }
  /** Theme colors from context */
  theme: ChatWidgetThemeColors
  /** Toggle button config for logo/icon (set during widget creation) */
  toggleConfig: ChatWidgetToggleConfig
  /** Pre-computed accent style (supports gradients) */
  accentStyle: React.CSSProperties
  /** Mode: 'preview' for editor, 'live' for public embed */
  mode?: 'preview' | 'live'
  /** Messages to display (live mode only) */
  messages?: ChatMessage[]
  /** Session info (live mode only) */
  session?: ChatSession | null
  /** Loading state (live mode only) */
  isLoading?: boolean
  /** Send message callback (live mode only) - returns void with optimistic UI */
  onSendMessage?: (body: string) => void | Promise<boolean>
  /** Is currently sending a message (live mode only) */
  isSending?: boolean
  /** Identify user callback (live mode only) */
  onIdentifyUser?: (data: { email: string; firstName?: string; lastName?: string; phone?: string }) => Promise<boolean>
  /** Is currently identifying user (live mode only) */
  isIdentifying?: boolean
  /** Error message (live mode only) */
  error?: string | null
  /**
   * Whether team member is currently typing (live mode only)
   * WHY: Show typing indicator to visitor when team is responding
   * SECURITY: Does NOT reveal team member identity - just shows dots animation
   */
  isTeamTyping?: boolean
  /**
   * Emit visitor typing indicator (live mode only)
   * WHY: Let team see when visitor is typing in inbox
   * PERFORMANCE: Should be debounced on client side
   */
  onTyping?: (isTyping: boolean) => void
  // ==========================================================================
  // PAGINATION PROPS (live mode only)
  // ==========================================================================
  /**
   * Whether there are older messages to load (live mode only)
   * WHY: Enable bi-directional infinite scroll
   */
  hasPrevious?: boolean
  /**
   * Load older messages callback (live mode only)
   * WHY: Called when user scrolls to top
   */
  onLoadPrevious?: () => void
  /**
   * Whether older messages are loading (live mode only)
   * WHY: Show loading indicator at top
   */
  isLoadingPrevious?: boolean
  /**
   * Custom welcome message shown when user opens chat for the first time (live mode only)
   * WHY: Allow customization of the initial greeting message
   * DEFAULT: Falls back to widget.description or "Hi there! How can I help you today?"
   * SOURCE OF TRUTH: ChatWidgetWelcomeMessage
   */
  welcomeMessage?: string
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ChatPage({
  widget,
  theme,
  toggleConfig,
  accentStyle,
  mode = 'preview',
  messages = [],
  session = null,
  isLoading = false,
  onSendMessage,
  isSending: _isSending = false, // Kept for backwards compatibility, not used with optimistic UI
  onIdentifyUser,
  isIdentifying = false,
  error = null,
  isTeamTyping = false,
  onTyping,
  // Pagination props
  hasPrevious = false,
  onLoadPrevious,
  isLoadingPrevious = false,
  // Welcome message
  welcomeMessage,
}: ChatPageProps) {
  // Live mode state
  const [message, setMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  /**
   * Track scroll height before loading older messages
   * WHY: Preserve scroll position when new messages are prepended
   */
  const prevScrollHeightRef = useRef<number>(0)
  const isLoadingRef = useRef(false)

  /**
   * Track if user has sent at least one message
   * Used to show non-blocking contact info form AFTER first message
   */
  const [hasSentFirstMessage, setHasSentFirstMessage] = useState(false)

  /**
   * Track if user has dismissed the contact info form
   * Allows user to continue chatting without providing contact info
   */
  const [hasDeclinedContactInfo, setHasDeclinedContactInfo] = useState(false)

  /**
   * Track if the contact info form is expanded (user clicked to provide info)
   */
  const [showContactForm, setShowContactForm] = useState(false)

  // Contact form fields
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')

  /**
   * Track initial typing indicator state for the welcome message
   * WHY: Show a typing indicator when user first opens chat (no previous messages)
   *      then transition to showing the welcome message after a brief delay.
   *      This creates a more natural, human-like experience.
   * SOURCE OF TRUTH: ChatWidgetInitialTypingIndicator
   */
  const [showInitialTyping, setShowInitialTyping] = useState(false)
  const [showWelcomeMessage, setShowWelcomeMessage] = useState(false)
  const hasShownInitialTypingRef = useRef(false)

  /**
   * Effect 1: Detect when to start the initial typing animation
   *
   * WHY: Creates a natural, human-like greeting when user first opens the chat.
   * HOW: When loading finishes and there are no existing messages, set
   *      showInitialTyping=true to trigger the bouncing dots.
   *
   * ONCE ONLY: Uses hasShownInitialTypingRef to ensure the animation only fires once.
   *
   * BUG FIX: Previously the timer lived in THIS effect, but isLoading in the deps
   * caused the cleanup to fire (clearing the timeout) when the paginated query
   * started loading AFTER the session resolved. The ref was already set to true,
   * so the timer never restarted — leaving the dots spinning forever.
   *
   * FIX: Split into two effects. This one detects the trigger moment and sets
   * showInitialTyping. Effect 2 watches showInitialTyping and runs the timer
   * independently so isLoading changes can't kill it.
   */
  useEffect(() => {
    // Only animate in live mode — preview mode shows message immediately
    if (mode !== 'live') {
      setShowWelcomeMessage(true)
      return
    }

    // Skip if already shown typing indicator before
    if (hasShownInitialTypingRef.current) return

    // Wait until data is loaded before deciding
    if (isLoading) return

    // If user already has messages, show welcome message immediately (no animation)
    if (messages.length > 0) {
      setShowWelcomeMessage(true)
      hasShownInitialTypingRef.current = true
      return
    }

    // First time opening with no messages — start typing animation
    hasShownInitialTypingRef.current = true
    setShowInitialTyping(true)
  }, [mode, isLoading, messages.length])

  /**
   * Effect 2: Run the 1.5s timer to transition from typing dots → welcome message
   *
   * WHY: Isolated from isLoading changes so the timer can't be accidentally cleared.
   * HOW: Watches showInitialTyping — when it becomes true, starts a 1.5s timeout
   *      that hides the dots and reveals the welcome message.
   */
  useEffect(() => {
    if (!showInitialTyping) return

    const timer = setTimeout(() => {
      setShowInitialTyping(false)
      setShowWelcomeMessage(true)
    }, 1500)

    return () => clearTimeout(timer)
  }, [showInitialTyping])

  /**
   * INSTANT scroll positioning on initial load
   * WHY: User should see latest messages immediately without visible scroll animation
   * HOW: useLayoutEffect runs BEFORE paint, behavior: 'auto' for instant positioning
   */
  useLayoutEffect(() => {
    if (mode !== 'live' || !messagesContainerRef.current) return

    const container = messagesContainerRef.current

    // If we were loading older messages, preserve scroll position
    if (isLoadingRef.current && prevScrollHeightRef.current > 0) {
      const heightDiff = container.scrollHeight - prevScrollHeightRef.current
      container.scrollTop = heightDiff
      isLoadingRef.current = false
      prevScrollHeightRef.current = 0
      return
    }

    // Initial load or new messages - scroll to bottom instantly
    if (messagesEndRef.current && messages.length > 0) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' })
    }
  }, [messages, mode])

  /**
   * Scroll to bottom when team starts typing
   * WHY: Show typing indicator without requiring manual scroll
   * NOTE: Uses smooth scroll since this is a user feedback feature
   */
  useEffect(() => {
    if (mode === 'live' && isTeamTyping && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [isTeamTyping, mode])

  /**
   * Handle scroll for loading older messages
   * WHY: Trigger pagination when user scrolls near top
   * HOW: Detect scroll position, save scroll height before loading
   */
  const handleScroll = useCallback(() => {
    if (mode !== 'live' || !messagesContainerRef.current) return
    if (!hasPrevious || !onLoadPrevious || isLoadingPrevious) return

    const container = messagesContainerRef.current
    const scrollTop = container.scrollTop
    const threshold = 50 // pixels from top to trigger load

    if (scrollTop < threshold && !isLoadingRef.current) {
      // Save scroll height before loading
      prevScrollHeightRef.current = container.scrollHeight
      isLoadingRef.current = true
      onLoadPrevious()
    }
  }, [mode, hasPrevious, onLoadPrevious, isLoadingPrevious])

  // Track when messages are loaded from server (user returning to existing session)
  useEffect(() => {
    if (mode === 'live' && messages.length > 0) {
      // If there are already messages, user has sent at least one before
      setHasSentFirstMessage(true)
    }
  }, [mode, messages.length])

  /**
   * Handle input change - update message state and emit typing indicator
   * WHY: Let team see when visitor is typing in inbox
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setMessage(newValue)

    // Emit typing indicator (debouncing handled in hook)
    if (mode === 'live' && onTyping) {
      onTyping(newValue.length > 0)
    }
  }

  /**
   * Handle send button click - WhatsApp-style instant send
   *
   * WHY: User should be able to send multiple messages quickly
   * HOW: Clear input immediately, don't wait for server response
   */
  const handleSendClick = () => {
    if (!message.trim() || mode === 'preview') return

    const messageToSend = message.trim()

    // Step 1: Clear input IMMEDIATELY (WhatsApp pattern)
    setMessage('')

    // Step 2: Stop typing indicator since we sent the message
    if (onTyping) {
      onTyping(false)
    }

    // Step 3: Mark first message sent (for contact prompt)
    if (!hasSentFirstMessage) {
      setHasSentFirstMessage(true)
    }

    // Step 4: Send in background - optimistic UI handles the rest
    if (onSendMessage) {
      onSendMessage(messageToSend)
    }
  }

  /**
   * Handle contact info form submission
   * Identifies the user (converts guest to lead)
   */
  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !onIdentifyUser) return

    const success = await onIdentifyUser({
      email,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      phone: phone || undefined,
    })
    if (success) {
      // Form completed successfully - hide the contact prompt
      setShowContactForm(false)
      setHasDeclinedContactInfo(true) // Don't show prompt again
    }
  }

  /**
   * Handle dismissing the contact info prompt
   * User can continue chatting as guest
   */
  const handleDismissContactPrompt = () => {
    setHasDeclinedContactInfo(true)
    setShowContactForm(false)
  }

  /**
   * Determine if we should show the contact info prompt
   * Shows after first message, only for guests who haven't declined
   */
  const shouldShowContactPrompt =
    mode === 'live' &&
    hasSentFirstMessage &&
    !session?.isIdentified &&
    !hasDeclinedContactInfo

  // Preview mode: Show static UI
  if (mode === 'preview') {
    return (
      <div className="h-full flex flex-col">
        {/* Messages Area */}
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="flex gap-2">
            {/* Bot avatar - Uses toggle config (image or icon) */}
            <div
              className="size-6 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
              style={accentStyle}
            >
              {toggleConfig.type === 'image' && toggleConfig.image ? (
                <Image
                  src={toggleConfig.image}
                  alt="Bot"
                  width={24}
                  height={24}
                  priority
                  className="w-full h-full object-cover"
                />
              ) : (
                <IconRenderer
                  name={toggleConfig.icon || 'message-circle'}
                  size={12}
                  className="text-white"
                />
              )}
            </div>
            {/* Message bubble */}
            <div
              className="rounded-lg rounded-tl-none px-3 py-2 max-w-[85%]"
              style={{ backgroundColor: theme.secondaryBackground }}
            >
              <p className="text-sm" style={{ color: theme.primaryText }}>
                {welcomeMessage || 'Hi there! How can I help you today?'}
              </p>
            </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="p-3 border-t" style={{ borderColor: theme.border }}>
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg border"
            style={{ backgroundColor: theme.secondaryBackground, borderColor: theme.border }}
          >
            <input
              type="text"
              placeholder="Type a message..."
              className="flex-1 text-sm bg-transparent outline-none"
              style={{ color: theme.primaryText }}
              disabled
            />
          </div>
        </div>
      </div>
    )
  }

  // Live mode: Loading state
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div
          className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent"
          style={{ borderColor: theme.accent }}
        />
      </div>
    )
  }

  // Live mode: Chat interface
  return (
    <div className="h-full flex flex-col">
      {/* Messages Area - with scroll detection for loading older messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 p-4 overflow-y-auto space-y-3"
      >
        {/* Loading indicator for older messages */}
        {isLoadingPrevious && (
          <div className="flex justify-center py-2">
            <div
              className="animate-spin rounded-full h-5 w-5 border-2 border-t-transparent"
              style={{ borderColor: theme.accent }}
            />
          </div>
        )}

        {/* Initial typing indicator OR Welcome message
            WHY: Show typing indicator briefly on first open for a more human-like experience
            HOW: showInitialTyping controls typing dots, showWelcomeMessage shows the greeting */}
        {(showInitialTyping || showWelcomeMessage) && (
          <div className="flex gap-2">
            <div
              className="size-6 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
              style={accentStyle}
            >
              {toggleConfig.type === 'image' && toggleConfig.image ? (
                <Image src={toggleConfig.image} alt="Bot" width={24} height={24} priority className="w-full h-full object-cover" />
              ) : (
                <IconRenderer name={toggleConfig.icon || 'message-circle'} size={12} className="text-white" />
              )}
            </div>
            {showInitialTyping ? (
              /* Typing dots animation during initial greeting */
              <div
                className="rounded-lg rounded-tl-none px-3 py-2"
                style={{ backgroundColor: theme.secondaryBackground }}
              >
                <div className="flex gap-1 items-center h-5">
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{
                      backgroundColor: theme.secondaryText,
                      animationDelay: '0ms',
                      animationDuration: '600ms',
                    }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{
                      backgroundColor: theme.secondaryText,
                      animationDelay: '150ms',
                      animationDuration: '600ms',
                    }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{
                      backgroundColor: theme.secondaryText,
                      animationDelay: '300ms',
                      animationDuration: '600ms',
                    }}
                  />
                </div>
              </div>
            ) : (
              /* Welcome message - shown after typing animation completes */
              <div className="rounded-lg rounded-tl-none px-3 py-2 max-w-[85%]" style={{ backgroundColor: theme.secondaryBackground }}>
                <p className="text-sm" style={{ color: theme.primaryText }}>
                  {session?.isIdentified && session?.lead?.firstName
                    ? `Welcome back, ${session.lead.firstName}! How can I help you?`
                    : welcomeMessage || 'Hi there! How can I help you today?'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Chat messages */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2 ${msg.direction === 'INBOUND' ? 'flex-row-reverse' : ''}`}
          >
            {msg.direction === 'OUTBOUND' && (
              <div
                className="size-6 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
                style={accentStyle}
              >
                {toggleConfig.type === 'image' && toggleConfig.image ? (
                  <Image src={toggleConfig.image} alt="Bot" width={24} height={24} priority className="w-full h-full object-cover" />
                ) : (
                  <IconRenderer name={toggleConfig.icon || 'message-circle'} size={12} className="text-white" />
                )}
              </div>
            )}
            <div
              className={`rounded-lg px-3 py-2 max-w-[85%] ${
                msg.direction === 'INBOUND' ? 'rounded-tr-none' : 'rounded-tl-none'
              }`}
              style={{
                backgroundColor: msg.direction === 'INBOUND' ? theme.accent : theme.secondaryBackground,
                color: msg.direction === 'INBOUND' ? '#ffffff' : theme.primaryText,
              }}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
            </div>
          </div>
        ))}

        {/* Team typing indicator - shows when team member is typing
            SECURITY: Does NOT reveal team member name/identity - just dots animation */}
        {isTeamTyping && (
          <div className="flex gap-2">
            <div
              className="size-6 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
              style={accentStyle}
            >
              {toggleConfig.type === 'image' && toggleConfig.image ? (
                <Image src={toggleConfig.image} alt="Bot" width={24} height={24} priority className="w-full h-full object-cover" />
              ) : (
                <IconRenderer name={toggleConfig.icon || 'message-circle'} size={12} className="text-white" />
              )}
            </div>
            {/* Typing dots animation */}
            <div
              className="rounded-lg rounded-tl-none px-3 py-2"
              style={{ backgroundColor: theme.secondaryBackground }}
            >
              <div className="flex gap-1 items-center h-5">
                <span
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{
                    backgroundColor: theme.secondaryText,
                    animationDelay: '0ms',
                    animationDuration: '600ms',
                  }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{
                    backgroundColor: theme.secondaryText,
                    animationDelay: '150ms',
                    animationDuration: '600ms',
                  }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{
                    backgroundColor: theme.secondaryText,
                    animationDelay: '300ms',
                    animationDuration: '600ms',
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Non-blocking contact info prompt - appears after first message for guests */}
        {shouldShowContactPrompt && (
          <div
            className="rounded-lg border p-3"
            style={{
              backgroundColor: theme.secondaryBackground,
              borderColor: theme.border,
            }}
          >
            {!showContactForm ? (
              /* Compact prompt - user can click to expand or dismiss */
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: theme.primaryText }}>
                    Want us to get back to you?
                  </p>
                  <p className="text-xs" style={{ color: theme.secondaryText }}>
                    Leave your contact info so we can follow up
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowContactForm(true)}
                    className="px-3 py-1.5 rounded-md text-xs font-medium text-white transition-colors hover:opacity-90"
                    style={accentStyle}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={handleDismissContactPrompt}
                    className="p-1.5 rounded-md transition-colors hover:bg-black/5"
                    style={{ color: theme.secondaryText }}
                    title="Dismiss"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
            ) : (
              /* Expanded contact form */
              <form onSubmit={handleContactSubmit} className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium" style={{ color: theme.primaryText }}>
                    Your contact info
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowContactForm(false)}
                    className="p-1 rounded-md transition-colors hover:bg-black/5"
                    style={{ color: theme.secondaryText }}
                    title="Collapse"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* Name row (first name + last name) */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="First name"
                      disabled={isIdentifying}
                      className="w-full px-2.5 py-1.5 rounded-md border text-xs outline-none"
                      style={{
                        backgroundColor: theme.background,
                        borderColor: theme.border,
                        color: theme.primaryText,
                      }}
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Last name"
                      disabled={isIdentifying}
                      className="w-full px-2.5 py-1.5 rounded-md border text-xs outline-none"
                      style={{
                        backgroundColor: theme.background,
                        borderColor: theme.border,
                        color: theme.primaryText,
                      }}
                    />
                  </div>
                </div>

                {/* Email (required) */}
                <div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email *"
                    required
                    disabled={isIdentifying}
                    className="w-full px-2.5 py-1.5 rounded-md border text-xs outline-none"
                    style={{
                      backgroundColor: theme.background,
                      borderColor: theme.border,
                      color: theme.primaryText,
                    }}
                  />
                </div>

                {/* Phone (optional) */}
                <div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Phone (optional)"
                    disabled={isIdentifying}
                    className="w-full px-2.5 py-1.5 rounded-md border text-xs outline-none"
                    style={{
                      backgroundColor: theme.background,
                      borderColor: theme.border,
                      color: theme.primaryText,
                    }}
                  />
                </div>

                {error && <p className="text-xs text-red-500">{error}</p>}

                {/* Submit buttons */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleDismissContactPrompt}
                    className="flex-1 py-1.5 px-3 rounded-md border text-xs transition-colors hover:opacity-80"
                    style={{ borderColor: theme.border, color: theme.secondaryText }}
                  >
                    Skip
                  </button>
                  <button
                    type="submit"
                    disabled={isIdentifying || !email.trim()}
                    className="flex-1 py-1.5 px-3 rounded-md text-xs text-white disabled:opacity-50 transition-colors hover:opacity-90"
                    style={accentStyle}
                  >
                    {isIdentifying ? 'Saving...' : 'Submit'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - WhatsApp-style, never blocks user */}
      <div className="p-3 border-t" style={{ borderColor: theme.border }}>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={message}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSendClick()
              }
            }}
            onBlur={() => {
              // Stop typing indicator when input loses focus
              if (onTyping) onTyping(false)
            }}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none"
            style={{
              backgroundColor: theme.secondaryBackground,
              borderColor: theme.border,
              color: theme.primaryText,
            }}
          />
          <button
            type="button"
            onClick={handleSendClick}
            disabled={!message.trim()}
            className="p-2 rounded-lg text-white disabled:opacity-50 transition-colors hover:opacity-90"
            style={accentStyle}
          >
            <Send className="size-4" />
          </button>
        </div>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    </div>
  )
}
