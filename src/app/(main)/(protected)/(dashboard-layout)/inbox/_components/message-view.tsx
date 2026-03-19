'use client'

/**
 * Message View Component
 *
 * WHY: Display full conversation history with a lead
 * HOW: Premium, minimal chat-style interface
 *      - Groups emails into collapsible threads
 *      - Shows other messages as individual bubbles
 *      - Scrolls to focused message when conversation opens
 *      - Bi-directional infinite scroll (WhatsApp/Messenger style)
 *
 * PROPS:
 * - message: The selected inbox message (for focus tracking)
 * - conversation: Full conversation data with messages
 * - onSendReply: Callback when user sends a reply
 * - isLoading: Show loading state while fetching conversation
 * - isSending: Show sending state in composer
 * - onBack: Mobile only - callback to go back to list
 * - showBackButton: Mobile only - whether to show back button
 *
 * PAGINATION PROPS (optional - for bi-directional scroll):
 * - hasPrevious: Whether older messages can be loaded
 * - hasNext: Whether newer messages can be loaded
 * - isLoadingPrevious: Loading state for older messages
 * - isLoadingNext: Loading state for newer messages
 * - loadPrevious: Callback to load older messages
 * - loadNext: Callback to load newer messages
 * - jumpToLatest: Callback to jump to latest messages
 * - isAtBottom: Whether user is viewing latest messages
 *
 * SOURCE OF TRUTH KEYWORDS: MessageView, InboxMessageDisplay, BiDirectionalScroll
 */

import { useEffect, useLayoutEffect, useRef, useMemo, useState, useCallback, type ReactNode } from 'react'
import { format, isSameDay, isToday, isYesterday } from 'date-fns'
import { Inbox, ArrowLeft, Loader2, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { MarqueeFade } from '@/components/global/marquee-fade'
import { Conversation, InboxMessage, ConversationMessage, MessageChannel } from './types'
import { getLeadAvatarColor } from '@/lib/utils/lead-helpers'
import { getTextColorForBackground } from '@/constants/colors'
import { MessageBubble } from './message-bubble'
import { EmailThread } from './email-thread'
import { ReplyComposer } from './reply-composer'
import { InlineReplyComposer } from './inline-reply-composer'
import { JumpToBottomButton } from './jump-to-bottom-button'

interface MessageViewProps {
  /** The selected inbox message (used to get conversation + focus) */
  message: InboxMessage | null
  /** Full conversation data */
  conversation: Conversation | null
  /** Callback when user sends a reply */
  onSendReply?: (data: {
    channel: MessageChannel
    fromName?: string
    fromEmail?: string
    subject?: string
    body: string
    attachments: File[]
  }) => void
  /** Show loading state while fetching conversation */
  isLoading?: boolean
  /** Show sending state in composer */
  isSending?: boolean
  /** Mobile only: callback to go back to message list */
  onBack?: () => void
  /** Mobile only: whether to show the back button */
  showBackButton?: boolean
  /** Mobile only: callback to show lead sheet panel */
  onShowLeadSheet?: () => void

  // -------------------------------------------------------------------------
  // TYPING INDICATOR PROPS
  // -------------------------------------------------------------------------

  /**
   * Whether visitor is currently typing (chat widget)
   * WHY: Show "..." animation when visitor is composing a message
   */
  isVisitorTyping?: boolean
  /**
   * Emit team typing indicator
   * WHY: Let visitor know team is responding
   * PERFORMANCE: Caller handles debouncing
   */
  onTeamTyping?: (isTyping: boolean) => void

  // -------------------------------------------------------------------------
  // PAGINATION PROPS (optional - for bi-directional infinite scroll)
  // -------------------------------------------------------------------------

  /** Whether there are older messages to load (scroll up) */
  hasPrevious?: boolean
  /** Whether there are newer messages to load (scroll down) */
  hasNext?: boolean
  /** Loading state for older messages */
  isLoadingPrevious?: boolean
  /** Loading state for newer messages */
  isLoadingNext?: boolean
  /** Callback to load older messages when scrolling up */
  loadPrevious?: () => void
  /** Callback to load newer messages when scrolling down */
  loadNext?: () => void
  /** Callback to jump to latest messages (FAB button) */
  jumpToLatest?: () => void
  /** Whether user is viewing latest messages (at bottom) */
  isAtBottom?: boolean
  /** Number of new messages while scrolled up */
  newMessageCount?: number
  /**
   * Message ID to focus/scroll to on initial load
   * WHY: When opening conversation from notification or clicking specific email in thread,
   *      scroll to that message instead of bottom
   * SOURCE: pagination.focusMessageId from usePaginatedMessages hook
   */
  focusMessageId?: string | null
}

/**
 * Get initials from name for avatar fallback
 */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/**
 * Empty state when no conversation selected
 */
function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center bg-sidebar h-full">
      <div className="text-center space-y-2">
        <Inbox className="size-12 text-muted-foreground/20 mx-auto" />
        <p className="text-sm text-muted-foreground">
          Select a conversation to view
        </p>
      </div>
    </div>
  )
}

/**
 * Loading skeleton for conversation
 */
function LoadingSkeleton() {
  return (
    <div className="flex flex-col h-full w-full bg-sidebar">
      {/* Header skeleton */}
      <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
        <Skeleton className="size-8 rounded-full" />
        <div className="space-y-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      {/* Messages skeleton */}
      <div className="flex-1 p-4 space-y-4">
        <div className="flex justify-start">
          <Skeleton className="h-16 w-64 rounded-lg" />
        </div>
        <div className="flex justify-end">
          <Skeleton className="h-12 w-48 rounded-lg" />
        </div>
        <div className="flex justify-start">
          <Skeleton className="h-20 w-72 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

/**
 * Format date for separator display
 * Shows "Today", "Yesterday", or "MMM d, yyyy" format
 */
function formatDateSeparator(date: Date): string {
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'MMM d, yyyy')
}

/**
 * Date Separator Component
 * WHY: Visually separate messages by date like Instagram chat
 * HOW: Horizontal line with centered date label
 */
function DateSeparator({ date }: { date: Date }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[11px] text-muted-foreground font-medium">
        {formatDateSeparator(date)}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

/**
 * Group messages into display items (email threads vs individual messages)
 * Consecutive emails with the same subject are grouped into threads
 * Inserts date separators when the date changes between messages
 */
interface DisplayItem {
  type: 'email-thread' | 'message' | 'date-separator'
  id: string
  emails?: ConversationMessage[]
  message?: ConversationMessage
  date?: Date
}

function groupMessagesForDisplay(
  messages: ConversationMessage[]
): DisplayItem[] {
  const items: DisplayItem[] = []
  let currentEmailThread: ConversationMessage[] = []
  let currentSubject: string | null = null
  let lastDate: Date | null = null

  /**
   * Insert date separator if the date changed from the last item
   */
  const maybeInsertDateSeparator = (timestamp: Date) => {
    if (!lastDate || !isSameDay(lastDate, timestamp)) {
      items.push({
        type: 'date-separator',
        id: `date-${timestamp.getTime()}`,
        date: timestamp,
      })
      lastDate = timestamp
    }
  }

  /**
   * Flush accumulated email thread into a single display item
   */
  const flushEmailThread = () => {
    if (currentEmailThread.length > 0) {
      // Insert date separator based on first email in thread
      maybeInsertDateSeparator(currentEmailThread[0].timestamp)
      items.push({
        type: 'email-thread',
        id: `thread-${currentEmailThread[0].id}`,
        emails: [...currentEmailThread],
      })
      currentEmailThread = []
      currentSubject = null
    }
  }

  for (const msg of messages) {
    if (msg.channel === 'email') {
      /**
       * Normalize email subject for thread grouping
       * WHY: Email clients add various prefixes - we need to strip ALL of them
       * HANDLES: "Re:", "RE:", "Fwd:", "FW:", and multiple prefixes like "Re: Re: Subject"
       */
      const normalizeSubject = (subject: string | undefined): string => {
        let normalized = (subject || '').trim()
        // Keep stripping prefixes until there are no more
        // Handles: "Re: Re: RE: Fwd: Original Subject" -> "Original Subject"
        while (/^(Re|Fwd|FW):\s*/i.test(normalized)) {
          normalized = normalized.replace(/^(Re|Fwd|FW):\s*/i, '').trim()
        }
        return normalized.toLowerCase() // Case-insensitive comparison
      }

      const normalizedSubject = normalizeSubject(msg.subject)
      const normalizedCurrent = normalizeSubject(currentSubject ?? undefined)

      if (
        currentEmailThread.length === 0 ||
        normalizedSubject === normalizedCurrent
      ) {
        currentEmailThread.push(msg)
        currentSubject = msg.subject || currentSubject
      } else {
        // Different subject, flush and start new thread
        flushEmailThread()
        currentEmailThread.push(msg)
        currentSubject = msg.subject || null
      }
    } else {
      // Non-email message, flush any pending email thread first
      flushEmailThread()
      // Insert date separator if needed
      maybeInsertDateSeparator(msg.timestamp)
      items.push({
        type: 'message',
        id: msg.id,
        message: msg,
      })
    }
  }

  // Flush remaining emails
  flushEmailThread()

  return items
}

export function MessageView({
  message,
  conversation,
  onSendReply,
  isLoading,
  isSending,
  onBack,
  showBackButton,
  onShowLeadSheet,
  // Typing indicator props
  isVisitorTyping = false,
  onTeamTyping,
  // Pagination props (optional)
  hasPrevious = false,
  hasNext = false,
  isLoadingPrevious = false,
  isLoadingNext = false,
  loadPrevious,
  loadNext,
  jumpToLatest,
  isAtBottom = true,
  newMessageCount = 0,
  focusMessageId,
}: MessageViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const focusedMessageRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  /**
   * Track previous message count to detect new messages
   * WHY: Auto-scroll to bottom when NEW messages arrive (not on initial load)
   */
  const prevMessageCountRef = useRef<number>(0)

  /**
   * Scroll position preservation for loading older messages
   * WHY: When loading older messages (scroll up), maintain viewport position
   *      so user doesn't lose their place
   */
  const prevScrollHeightRef = useRef<number>(0)

  /**
   * Loading state ref to prevent duplicate triggers
   * WHY: Debounce scroll triggers to avoid rapid-fire requests
   */
  const isLoadingRef = useRef({ previous: false, next: false })

  /**
   * Track if we just loaded older messages (pagination up)
   * WHY: Block auto-scroll after loading older messages
   * HOW: Set true when loadPrevious is called, reset after scroll preservation
   */
  const justLoadedOlderRef = useRef(false)

  /**
   * Scroll threshold for triggering pagination (in pixels)
   * WHY: Trigger loading before user hits the edge for smoother UX
   */
  const SCROLL_THRESHOLD = 100

  /**
   * Scroll indicator state
   * WHY: Show fade gradients when more content exists above/below viewport
   * HOW: Track scroll position and compare against scrollable area
   */
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)

  /**
   * Inline reply state
   * WHY: Track which message is being replied to for inline reply UI
   * HOW: Store message ID, show InlineReplyComposer under that message
   *
   * NOTE: Uses conversation?.id as key part to auto-reset when conversation changes
   */
  const [activeReplyMessageId, setActiveReplyMessageId] = useState<string | null>(null)

  /**
   * Track previous conversation ID to reset inline reply state
   * WHY: Clear reply state when switching conversations without useEffect setState
   */
  const prevConversationIdRef = useRef<string | null>(null)

  /**
   * Track if initial scroll has been done for current conversation
   * WHY: Only scroll to bottom ONCE on initial load, not on every pagination load
   * HOW: Reset when conversation changes, set to true after first scroll
   */
  const hasInitialScrolledRef = useRef<string | null>(null)

  // Reset state when conversation changes (before render)
  if (conversation?.id !== prevConversationIdRef.current) {
    prevConversationIdRef.current = conversation?.id ?? null
    // Reset inline reply
    if (activeReplyMessageId !== null) {
      setActiveReplyMessageId(null)
    }
    // Reset initial scroll flag when switching conversations
    // This ensures we scroll to bottom when re-opening any conversation
    hasInitialScrolledRef.current = null
  }

  /**
   * Handle inline reply initiation
   * WHY: User clicked reply on a specific message
   */
  const handleReply = useCallback((messageId: string) => {
    setActiveReplyMessageId(messageId)
  }, [])

  /**
   * Handle inline reply cancel
   * WHY: User clicked cancel or pressed Escape
   */
  const handleCancelReply = useCallback(() => {
    setActiveReplyMessageId(null)
  }, [])

  /**
   * Handle inline reply send
   * WHY: User submitted the inline reply form
   * HOW: Forward to parent onSendReply with minimal data (no from fields needed)
   */
  const handleInlineReplySend = useCallback(
    (data: { channel: MessageChannel; subject?: string; body: string }) => {
      onSendReply?.({
        channel: data.channel,
        subject: data.subject,
        body: data.body,
        attachments: [], // Inline reply doesn't support attachments for simplicity
      })
      // Clear the inline reply state after sending
      setActiveReplyMessageId(null)
    },
    [onSendReply]
  )

  /**
   * Update scroll indicators based on current scroll position
   * WHY: Determine if there's content above or below the visible area
   *      Also triggers bi-directional pagination when near edges
   */
  const updateScrollIndicators = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const { scrollTop, scrollHeight, clientHeight } = container
    // Can scroll up if not at the top (with small threshold for precision)
    setCanScrollUp(scrollTop > 5)
    // Can scroll down if not at the bottom (with small threshold)
    setCanScrollDown(scrollTop + clientHeight < scrollHeight - 5)
  }, [])

  /**
   * Handle scroll for bi-directional pagination
   * WHY: Trigger loading when user scrolls near edges
   * HOW: Check scroll position against threshold, trigger loadPrevious/loadNext
   */
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    // Update visual indicators
    updateScrollIndicators()

    const { scrollTop, scrollHeight, clientHeight } = container

    // Check if near top (load older messages)
    if (
      scrollTop < SCROLL_THRESHOLD &&
      hasPrevious &&
      loadPrevious &&
      !isLoadingRef.current.previous &&
      !isLoadingPrevious
    ) {
      // Save scroll height BEFORE loading to restore position after
      prevScrollHeightRef.current = scrollHeight
      isLoadingRef.current.previous = true
      justLoadedOlderRef.current = true // Flag to block auto-scroll
      loadPrevious()
    }

    // Check if near bottom (load newer messages)
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight
    if (
      distanceFromBottom < SCROLL_THRESHOLD &&
      hasNext &&
      loadNext &&
      !isLoadingRef.current.next &&
      !isLoadingNext
    ) {
      isLoadingRef.current.next = true
      loadNext()
    }
  }, [
    hasPrevious,
    hasNext,
    loadPrevious,
    loadNext,
    isLoadingPrevious,
    isLoadingNext,
    updateScrollIndicators,
    SCROLL_THRESHOLD,
  ])

  /**
   * Reset loading refs when loading states change
   * WHY: Allow next pagination trigger after current one completes
   */
  useEffect(() => {
    if (!isLoadingPrevious) {
      isLoadingRef.current.previous = false
    }
    if (!isLoadingNext) {
      isLoadingRef.current.next = false
    }
  }, [isLoadingPrevious, isLoadingNext])

  // Group messages for display
  const displayItems = useMemo(() => {
    if (!conversation) return []
    return groupMessagesForDisplay(conversation.messages)
  }, [conversation])

  /**
   * Preserve scroll position after loading older messages
   * WHY: When prepending older messages, the viewport jumps - this restores position
   * HOW: Compare new scrollHeight vs saved, adjust scrollTop by the difference
   *
   * CRITICAL: Uses useLayoutEffect to run SYNCHRONOUSLY before browser paint
   *           This prevents visual flicker/jump when older messages are prepended
   */
  useLayoutEffect(() => {
    const container = scrollContainerRef.current
    if (!container || prevScrollHeightRef.current === 0) return

    // After older messages load, preserve scroll position
    const newScrollHeight = container.scrollHeight
    const heightDiff = newScrollHeight - prevScrollHeightRef.current

    if (heightDiff > 0) {
      container.scrollTop = container.scrollTop + heightDiff
      prevScrollHeightRef.current = 0 // Reset after restoration

      // Keep the flag blocking auto-scroll for a bit longer
      // Reset after a tick to ensure auto-scroll effect doesn't trigger
      setTimeout(() => {
        justLoadedOlderRef.current = false
      }, 100)
    }
  }, [displayItems])

  /**
   * Scroll to correct position on initial load - INSTANT, no animation
   *
   * WHY: Users should never see the content at wrong scroll position then animate
   * HOW: useLayoutEffect runs SYNCHRONOUSLY before browser paint
   *      Using 'auto' behavior for instant scroll (no smooth animation)
   *
   * CRITICAL: This must be useLayoutEffect, not useEffect!
   *           useEffect runs AFTER paint → user sees scroll animation (bad UX)
   *           useLayoutEffect runs BEFORE paint → scroll position is correct from start
   */
  useLayoutEffect(() => {
    const container = scrollContainerRef.current
    if (!container || !conversation?.id) return

    // Wait until we have messages loaded before scrolling
    if (!conversation.messages || conversation.messages.length === 0) return

    // Skip if we already did initial scroll for this conversation
    if (hasInitialScrolledRef.current === conversation.id) return

    // Mark that we're doing initial scroll for this conversation
    hasInitialScrolledRef.current = conversation.id

    // Scroll immediately (no animation) - this runs before browser paint
    if (focusedMessageRef.current) {
      // Scroll to focused message if there is one
      focusedMessageRef.current.scrollIntoView({
        behavior: 'auto', // Instant - no animation
        block: 'center',
      })
    } else if (messagesEndRef.current) {
      // Otherwise scroll to bottom (latest messages)
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' })
    }

    // Update scroll indicators after a microtask (still before paint)
    queueMicrotask(updateScrollIndicators)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id, conversation?.messages?.length])

  /**
   * Auto-scroll to bottom when NEW messages arrive (NOT when loading older messages)
   *
   * WHY: Like WhatsApp/chat apps - new messages should be visible immediately
   * HOW: Track message count AND check if we're NOT loading previous (older) messages
   *
   * CRITICAL: When loading OLDER messages (scroll up), count also increases but we
   *           must NOT scroll to bottom - that would defeat the purpose of pagination!
   */
  useEffect(() => {
    const currentCount = displayItems.filter(
      (item) => item.type !== 'date-separator'
    ).length

    // Only scroll if:
    // 1. Message count increased (new message added)
    // 2. We did NOT just load older messages via pagination
    // 3. This isn't the initial load
    const shouldAutoScroll =
      currentCount > prevMessageCountRef.current &&
      prevMessageCountRef.current > 0 &&
      !justLoadedOlderRef.current

    if (shouldAutoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      // Update indicators after scroll
      setTimeout(updateScrollIndicators, 350)
    }

    prevMessageCountRef.current = currentCount
  }, [displayItems, updateScrollIndicators])

  /**
   * Initialize scroll indicators and observe content changes
   * WHY: Check scrollability when content loads, resizes, or reply composer expands
   */
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    // Initial check after DOM renders
    const initialCheck = setTimeout(updateScrollIndicators, 50)

    // Watch for content size changes (images loading, dynamic content, etc.)
    const resizeObserver = new ResizeObserver(() => {
      updateScrollIndicators()
    })
    resizeObserver.observe(container)

    // Observe the scroll content div for size changes
    const scrollContent = container.firstElementChild
    if (scrollContent) {
      resizeObserver.observe(scrollContent)
    }

    // Observe the parent wrapper (catches reply composer expand/collapse)
    const parentWrapper = container.parentElement
    if (parentWrapper) {
      resizeObserver.observe(parentWrapper)
    }

    // Observe the main flex container (catches any sibling size changes)
    const mainContainer = parentWrapper?.parentElement
    if (mainContainer) {
      resizeObserver.observe(mainContainer)
    }

    return () => {
      clearTimeout(initialCheck)
      resizeObserver.disconnect()
    }
  }, [displayItems, updateScrollIndicators])

  // Show loading skeleton
  if (isLoading && message) {
    return <LoadingSkeleton />
  }

  // Show empty state when no conversation selected
  if (!conversation || !message) {
    return <EmptyState />
  }

  const lead = conversation.lead

  return (
    <div className="flex flex-col h-full w-full bg-sidebar">
      {/* Header - shows lead info */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {/* Back button - shown on mobile only */}
          {showBackButton && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 -ml-2"
              onClick={onBack}
            >
              <ArrowLeft className="size-4" />
            </Button>
          )}

          {/* Lead avatar */}
          <Avatar className="size-8 shrink-0">
            <AvatarImage
              src={lead.avatar}
              alt={lead.name}
            />
            <AvatarFallback
              className="text-[10px] font-medium"
              style={{
                backgroundColor: getLeadAvatarColor(lead.id, lead.name),
                color: getTextColorForBackground(getLeadAvatarColor(lead.id, lead.name)),
              }}
            >
              {getInitials(lead.name)}
            </AvatarFallback>
          </Avatar>

          {/* Lead name and email/handle */}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{lead.name}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {lead.email || lead.handle}
            </p>
          </div>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Sending indicator */}
          {isSending && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}

          {/* Mobile only: Button to open lead sheet panel */}
          {onShowLeadSheet && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 md:hidden"
              onClick={onShowLeadSheet}
              title="View lead details"
            >
              <User className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Conversation history with CSS mask fade effect */}
      <div className="relative flex-1 min-h-0">
        <MarqueeFade
          showTopFade={canScrollUp}
          showBottomFade={canScrollDown}
          fadeHeight={48}
          className="h-full"
        >
          {/* Scrollable message container */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="h-full overflow-y-auto overflow-x-hidden px-4 py-6"
          >
            <div className="space-y-4">
              {/* Loading spinner at top (for older messages) */}
              {isLoadingPrevious && (
                <div className="flex justify-center py-4">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {displayItems.map((item) => {
              // Date separator - horizontal line with centered date
              if (item.type === 'date-separator' && item.date) {
                return (
                  <DateSeparator
                    key={item.id}
                    date={item.date}
                  />
                )
              }

              // Email thread - grouped emails with same subject
              if (item.type === 'email-thread' && item.emails) {
                // Check if any email in this thread is the focus target
                const hasFocusedEmailInThread = focusMessageId
                  ? item.emails.some((e) => e.id === focusMessageId)
                  : false

                return (
                  <EmailThread
                    key={item.id}
                    emails={item.emails}
                    lead={lead}
                    focusedMessageId={focusMessageId ?? undefined}
                    focusedMessageRef={hasFocusedEmailInThread ? focusedMessageRef : undefined}
                    onReply={handleReply}
                    activeReplyMessageId={activeReplyMessageId}
                    onSendReply={handleInlineReplySend}
                    onCancelReply={handleCancelReply}
                    isSendingReply={isSending}
                  />
                )
              }

              // Individual message bubble (non-email channels)
              if (item.type === 'message' && item.message) {
                // Check if this specific message should be focused (scroll target)
                const isFocused = focusMessageId ? item.message.id === focusMessageId : false
                const isReplyActive = activeReplyMessageId === item.message.id

                return (
                  <div key={item.id} className="space-y-2">
                    <MessageBubble
                      message={item.message}
                      lead={lead}
                      isFocused={isFocused}
                      messageRef={isFocused ? focusedMessageRef : undefined}
                      onReply={handleReply}
                      isReplyActive={isReplyActive}
                    />
                    {/* Inline reply composer for this message */}
                    {isReplyActive && (
                      <div className="ml-10">
                        <InlineReplyComposer
                          channel={item.message.channel}
                          replyToSubject={item.message.subject}
                          onSend={handleInlineReplySend}
                          onCancel={handleCancelReply}
                          isSending={isSending}
                        />
                      </div>
                    )}
                  </div>
                )
              }

              return null
            })}

              {/* Loading spinner at bottom (for newer messages) */}
              {isLoadingNext && (
                <div className="flex justify-center py-4">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* Visitor typing indicator - shows when chat widget visitor is typing
                  WHY: Let team know visitor is composing a message */}
              {isVisitorTyping && (
                <div className="flex gap-2">
                  {/* Lead avatar */}
                  <Avatar className="size-6 shrink-0">
                    <AvatarImage src={lead.avatar} alt={lead.name} />
                    <AvatarFallback
                      className="text-[8px] font-medium"
                      style={{
                        backgroundColor: getLeadAvatarColor(lead.id, lead.name),
                        color: getTextColorForBackground(getLeadAvatarColor(lead.id, lead.name)),
                      }}
                    >
                      {getInitials(lead.name)}
                    </AvatarFallback>
                  </Avatar>
                  {/* Typing dots animation */}
                  <div className="rounded-lg rounded-tl-none px-3 py-2 bg-muted">
                    <div className="flex gap-1 items-center h-5">
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce"
                        style={{ animationDelay: '0ms', animationDuration: '600ms' }}
                      />
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce"
                        style={{ animationDelay: '150ms', animationDuration: '600ms' }}
                      />
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce"
                        style={{ animationDelay: '300ms', animationDuration: '600ms' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Scroll anchor - auto-scroll target for new messages */}
              <div ref={messagesEndRef} />
            </div>
          </div>
        </MarqueeFade>

        {/* Jump to bottom FAB - shows when user scrolled up */}
        {jumpToLatest && (
          <JumpToBottomButton
            visible={!isAtBottom}
            newMessageCount={newMessageCount}
            onClick={jumpToLatest}
          />
        )}
      </div>

      {/* Reply composer - hidden when inline reply is active */}
      {!activeReplyMessageId && (
        <ReplyComposer
          lead={lead}
          activeChannel={conversation.lastMessage.channel}
          onSend={onSendReply}
          isSending={isSending}
          onTyping={onTeamTyping}
        />
      )}
    </div>
  )
}
