/**
 * Bi-Directional Message Pagination Hook (useInfiniteQuery)
 *
 * WHY: WhatsApp/Messenger-style UX for inbox conversations with PROPER caching
 * HOW: Uses useInfiniteQuery so ALL pages are stored in a SINGLE cache entry
 *
 * OPTIMISTIC UI: Uses tRPC onMutate/onError/onSuccess callbacks
 * NO MANUAL STATE - all optimistic updates go through the tRPC cache
 *
 * CACHING PATTERN (following use-pipeline.ts):
 * - Single cache key per conversation: ['inbox', 'getMessagesPaginated', { organizationId, conversationId }]
 * - All pages stored in query.data.pages array
 * - When user switches conversations and returns, ALL loaded pages are restored from cache
 * - No refetching unless data is stale (5 min) or manually invalidated
 *
 * FEATURES:
 * - Bi-directional pagination (older via getPreviousPageParam, newer via getNextPageParam)
 * - Load messages around a target message (for notification clicks)
 * - Jump to latest (resets query, fetches fresh)
 * - Optimistic UI via tRPC mutation callbacks (NOT manual state)
 *
 * SOURCE OF TRUTH KEYWORDS: UsePaginatedMessages, BiDirectionalPagination, InboxPagination
 */

import { useCallback, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { trpc } from '@/trpc/react-provider'
import type { MessageChannel } from '@/generated/prisma'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Serialized message from tRPC (dates are strings after JSON serialization)
 * This matches the shape returned by the pagination endpoints
 * SOURCE OF TRUTH KEYWORDS: PaginatedMessage, SerializedInboxMessage
 */
export interface PaginatedMessage {
  id: string
  conversationId: string
  organizationId: string
  channel: string
  direction: string
  subject: string | null
  body: string
  bodyHtml: string | null
  fromName: string | null
  fromEmail: string | null
  toEmail: string | null
  resendMessageId: string | null
  externalId: string | null
  /** RFC 2822 Message-ID header for email threading */
  emailMessageId: string | null
  isRead: boolean
  status: string
  attachments: unknown
  sentAt: string | Date
  createdAt: string | Date
  updatedAt: string | Date
  deletedAt: string | null
  /** Flag indicating this is a pending optimistic message */
  isOptimistic?: boolean
}

/**
 * Pagination state for the hook
 */
export interface PaginationState {
  /** Cursor for loading older messages */
  previousCursor: string | null
  /** Cursor for loading newer messages */
  nextCursor: string | null
  /** Whether there are more older messages */
  hasPrevious: boolean
  /** Whether there are more newer messages */
  hasNext: boolean
  /** Total message count in conversation */
  totalCount: number
  /** Message ID to focus/scroll to */
  focusMessageId: string | null
}

/**
 * Hook options
 */
export interface UsePaginatedMessagesOptions {
  organizationId: string
  conversationId: string
  /** Target message ID to load around (for notification clicks) */
  targetMessageId?: string
  /** Enable the hook (set false when no conversation selected) */
  enabled?: boolean
}

/**
 * Send message parameters
 * SOURCE OF TRUTH KEYWORDS: SendMessageParams, InboxSendMessage
 */
export interface SendMessageParams {
  /** Message channel - must be a valid Prisma MessageChannel enum value */
  channel: MessageChannel
  body: string
  subject?: string
  fromName?: string
  fromEmail?: string
}

/**
 * Hook return type
 *
 * OPTIMISTIC UI: Uses tRPC onMutate/onError/onSuccess - NO manual state
 */
export interface UsePaginatedMessagesReturn {
  /** All loaded messages in chronological order */
  messages: PaginatedMessage[]
  /** Pagination state */
  pagination: PaginationState
  /** Whether initial load is in progress */
  isLoading: boolean
  /** Whether loading older messages */
  isLoadingPrevious: boolean
  /** Whether loading newer messages */
  isLoadingNext: boolean
  /** Error from any query */
  error: Error | null
  /** Load older messages (scroll up trigger) */
  loadPrevious: () => void
  /** Load newer messages (scroll down trigger) */
  loadNext: () => void
  /** Jump to latest messages (FAB button) */
  jumpToLatest: () => void
  /** Jump to a specific message */
  jumpToMessage: (messageId: string) => void
  /** Send message with optimistic UI via tRPC callbacks */
  sendMessage: (params: SendMessageParams) => void
  /** Whether sending a message */
  isSending: boolean
  /** Whether user is at the bottom (no newer messages to load) */
  isAtBottom: boolean
  /** Refetch the current view */
  refetch: () => void
}

// ============================================================================
// CURSOR ENCODING - For bi-directional pagination
// ============================================================================

/**
 * Encode cursor with direction for bi-directional pagination
 * WHY: tRPC expects string cursors, we need to encode direction info
 * FORMAT: 'before:msgId' or 'after:msgId'
 */
function encodeCursor(direction: 'before' | 'after', messageId: string): string {
  return `${direction}:${messageId}`
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function usePaginatedMessages(
  options: UsePaginatedMessagesOptions
): UsePaginatedMessagesReturn {
  const { organizationId, conversationId, targetMessageId, enabled = true } = options

  /**
   * tRPC utils for cache manipulation in mutation callbacks
   * WHY: onMutate needs to update the infinite query cache optimistically
   */
  const utils = trpc.useUtils()

  /**
   * Track target message for jump-to-message feature
   */
  const jumpTargetRef = useRef<string | null>(null)

  // -------------------------------------------------------------------------
  // INFINITE QUERY - Single cache entry for all pages
  // -------------------------------------------------------------------------

  /**
   * Bi-directional infinite query using unified endpoint
   *
   * CACHING (following use-pipeline.ts pattern):
   * - staleTime: 5 min - data considered fresh, no refetch needed
   * - gcTime: 30 min - keep in cache when inactive
   * - refetchOnMount: false - use cached data when switching back
   *
   * PAGES STRUCTURE:
   * - Pages are stored in order: [oldest...initial...newest]
   * - getPreviousPageParam: returns encoded cursor 'before:msgId' for loading older
   * - getNextPageParam: returns encoded cursor 'after:msgId' for loading newer
   *
   * CURSOR FORMAT: 'before:msgId' or 'after:msgId' (string, not object)
   */
  const infiniteQuery = trpc.inbox.getMessagesPaginated.useInfiniteQuery(
    {
      organizationId,
      conversationId,
      targetMessageId: jumpTargetRef.current || targetMessageId,
      limit: 20,
    },
    {
      enabled: enabled && !!conversationId,

      /**
       * Get cursor for loading OLDER messages (scroll up)
       * WHY: Returns encoded string cursor for next 'before' fetch
       * FORMAT: 'before:msgId' - parsed by endpoint to route to getMessagesBefore
       *
       * NOTE: firstPage is from allPages[0] (oldest loaded page)
       */
      getPreviousPageParam: (firstPage) => {
        if (!firstPage.hasPrevious || !firstPage.previousCursor) {
          return undefined
        }
        return encodeCursor('before', firstPage.previousCursor)
      },

      /**
       * Get cursor for loading NEWER messages (scroll down)
       * WHY: Returns encoded string cursor for next 'after' fetch
       * FORMAT: 'after:msgId' - parsed by endpoint to route to getMessagesAfter
       *
       * NOTE: lastPage is from allPages[allPages.length - 1] (newest loaded page)
       */
      getNextPageParam: (lastPage) => {
        if (!lastPage.hasNext || !lastPage.nextCursor) {
          return undefined
        }
        return encodeCursor('after', lastPage.nextCursor)
      },

      /**
       * Cache configuration for optimal UX when switching conversations
       * Following pattern from use-pipeline.ts
       */
      staleTime: 5 * 60 * 1000, // 5 minutes - data considered fresh
      gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache when inactive
      refetchOnWindowFocus: false,
      refetchOnMount: false, // Don't refetch if we have cached data
    }
  )

  // -------------------------------------------------------------------------
  // SEND MESSAGE MUTATION - with proper tRPC optimistic UI callbacks
  // -------------------------------------------------------------------------

  /**
   * Send message mutation with onMutate/onError/onSuccess
   *
   * OPTIMISTIC UI FLOW:
   * 1. onMutate: Cancel queries, save previous data, add optimistic message to cache
   * 2. onError: Rollback to previous data
   * 3. onSuccess: Invalidate to sync with server
   */
  // @ts-ignore - TS2589: tRPC type inference too deep (appears only in fresh Docker builds)
  const sendMessageMutation = trpc.inbox.sendMessage.useMutation({
    /**
     * onMutate - Optimistic update BEFORE the request
     * WHY: Message appears instantly without waiting for server
     * HOW: Add temp message to the infinite query cache
     */
    onMutate: async (variables) => {
      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await utils.inbox.getMessagesPaginated.cancel()

      // Snapshot the previous value for rollback
      const previousData = utils.inbox.getMessagesPaginated.getInfiniteData({
        organizationId,
        conversationId,
        limit: 20,
      })

      // Create optimistic message
      const tempId = `temp-${Date.now()}`
      const optimisticMessage: PaginatedMessage = {
        id: tempId,
        conversationId: variables.conversationId,
        organizationId: variables.organizationId,
        channel: variables.channel,
        direction: 'OUTBOUND',
        subject: variables.subject || null,
        body: variables.body,
        bodyHtml: null,
        fromName: variables.fromName || null,
        fromEmail: variables.fromEmail || null,
        toEmail: null,
        resendMessageId: null,
        externalId: null,
        emailMessageId: null,
        isRead: true,
        status: 'pending',
        attachments: [],
        sentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        isOptimistic: true,
      }

      // Optimistically update the infinite query cache
      utils.inbox.getMessagesPaginated.setInfiniteData(
        {
          organizationId,
          conversationId,
          limit: 20,
        },
        (oldData) => {
          if (!oldData) return oldData

          // Add optimistic message to the last page (newest messages)
          const newPages = [...oldData.pages]
          if (newPages.length > 0) {
            const lastPageIndex = newPages.length - 1
            // Cast optimistic message to match the server's message type
            // This is safe because we invalidate on success to sync with real data
            type ServerMessage = (typeof newPages)[0]['messages'][0]
            newPages[lastPageIndex] = {
              ...newPages[lastPageIndex],
              messages: [
                ...newPages[lastPageIndex].messages,
                optimisticMessage as unknown as ServerMessage,
              ],
            }
          }

          return {
            ...oldData,
            pages: newPages,
          }
        }
      )

      // Return context for rollback
      return { previousData, optimisticId: tempId }
    },

    /**
     * onError - Rollback on failure
     * WHY: Remove the optimistic message if send failed
     * HOW: Restore the previous data snapshot
     */
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        utils.inbox.getMessagesPaginated.setInfiniteData(
          {
            organizationId,
            conversationId,
            limit: 20,
          },
          context.previousData
        )
      }
    },

    /**
     * onSuccess - Sync with server and check for delivery failures
     * WHY: Replace optimistic message with real server message.
     * Resend errors (e.g., domain not found, domain not verified) are returned
     * as { success: false, error: "..." } instead of throwing, so we must check explicitly.
     * Without this, domain-related failures silently appear to succeed.
     */
    onSuccess: (data) => {
      if ('success' in data && !data.success) {
        const errorMsg =
          'error' in data && typeof data.error === 'string'
            ? data.error
            : 'The email could not be delivered. Please check your sender domain is verified.'
        toast.error('Email failed to send', { description: errorMsg })
      }

      // Invalidate to get the real message from server (also removes optimistic msg if send failed)
      utils.inbox.getMessagesPaginated.invalidate({
        organizationId,
        conversationId,
      })
      // Also invalidate the list to update preview
      utils.inbox.list.invalidate()
    },
  })

  /**
   * Send message wrapper function
   * WHY: Simple API for components to call
   */
  const sendMessage = useCallback(
    (params: SendMessageParams) => {
      if (!conversationId) return
      sendMessageMutation.mutate({
        organizationId,
        conversationId,
        channel: params.channel,
        body: params.body,
        subject: params.subject,
        fromName: params.fromName,
        fromEmail: params.fromEmail,
      })
    },
    [organizationId, conversationId, sendMessageMutation]
  )

  // -------------------------------------------------------------------------
  // COMPUTED VALUES
  // -------------------------------------------------------------------------

  /**
   * Combine all pages into single sorted message array
   * WHY: useInfiniteQuery stores pages separately, UI needs flat array
   * HOW: Flatten pages, deduplicate by ID (using Map), sort by sentAt
   *
   * PERFORMANCE: Using Map for O(1) deduplication
   */
  const messages = useMemo((): PaginatedMessage[] => {
    const messagesMap = new Map<string, PaginatedMessage>()

    // Add all messages from infinite query pages
    if (infiniteQuery.data?.pages) {
      for (const page of infiniteQuery.data.pages) {
        for (const msg of page.messages) {
          messagesMap.set(msg.id, msg as PaginatedMessage)
        }
      }
    }

    // Convert to array and sort by sentAt (chronological order)
    const arr = Array.from(messagesMap.values())
    return arr.sort((a, b) => {
      const dateA = typeof a.sentAt === 'string' ? new Date(a.sentAt) : a.sentAt
      const dateB = typeof b.sentAt === 'string' ? new Date(b.sentAt) : b.sentAt
      return dateA.getTime() - dateB.getTime()
    })
  }, [infiniteQuery.data?.pages])

  /**
   * Extract pagination state from infinite query
   * WHY: UI components need cursor/hasMore info
   */
  const pagination = useMemo((): PaginationState => {
    const pages = infiniteQuery.data?.pages
    if (!pages || pages.length === 0) {
      return {
        previousCursor: null,
        nextCursor: null,
        hasPrevious: false,
        hasNext: false,
        totalCount: 0,
        focusMessageId: null,
      }
    }

    // First page has info about older messages
    const firstPage = pages[0]
    // Last page has info about newer messages
    const lastPage = pages[pages.length - 1]
    // Initial page has totalCount and focusMessageId
    const initialPage = pages.find((p) => p.totalCount > 0) || firstPage

    return {
      previousCursor: firstPage.previousCursor,
      nextCursor: lastPage.nextCursor,
      hasPrevious: infiniteQuery.hasPreviousPage ?? firstPage.hasPrevious,
      hasNext: infiniteQuery.hasNextPage ?? lastPage.hasNext,
      totalCount: initialPage.totalCount,
      focusMessageId: initialPage.focusMessageId,
    }
  }, [infiniteQuery.data?.pages, infiniteQuery.hasPreviousPage, infiniteQuery.hasNextPage])

  /**
   * Whether user is at the bottom of conversation (no newer messages)
   */
  const isAtBottom = !pagination.hasNext

  // -------------------------------------------------------------------------
  // HANDLERS
  // -------------------------------------------------------------------------

  /**
   * Load older messages (triggered by scrolling to top)
   */
  const loadPrevious = useCallback(() => {
    if (infiniteQuery.hasPreviousPage && !infiniteQuery.isFetchingPreviousPage) {
      infiniteQuery.fetchPreviousPage()
    }
  }, [infiniteQuery])

  /**
   * Load newer messages (triggered by scrolling to bottom when not at end)
   */
  const loadNext = useCallback(() => {
    if (infiniteQuery.hasNextPage && !infiniteQuery.isFetchingNextPage) {
      infiniteQuery.fetchNextPage()
    }
  }, [infiniteQuery])

  /**
   * Jump to latest messages (FAB button click)
   * WHY: User wants to skip to bottom without loading intermediate pages
   * HOW: Reset query cache to force fresh fetch of latest messages
   */
  const jumpToLatest = useCallback(() => {
    // Clear jump target to load latest
    jumpTargetRef.current = null
    // Refetch will reset to latest since no targetMessageId
    infiniteQuery.refetch()
  }, [infiniteQuery])

  /**
   * Jump to a specific message (e.g., from notification click)
   * WHY: User clicked on old notification, need to load around that message
   * HOW: Set target and refetch (will load around that message)
   */
  const jumpToMessage = useCallback(
    (messageId: string) => {
      // Check if message is already loaded
      const isLoaded = messages.some((m) => m.id === messageId)

      if (isLoaded) {
        // Message already loaded - just need to scroll to it (handled by UI)
        return
      }

      // Message not loaded - set target and refetch
      jumpTargetRef.current = messageId
      infiniteQuery.refetch()
    },
    [messages, infiniteQuery]
  )

  /**
   * Refetch current view
   */
  const refetch = useCallback(() => {
    infiniteQuery.refetch()
  }, [infiniteQuery])

  // -------------------------------------------------------------------------
  // RETURN
  // -------------------------------------------------------------------------

  return {
    messages,
    pagination,
    isLoading: infiniteQuery.isLoading,
    isLoadingPrevious: infiniteQuery.isFetchingPreviousPage,
    isLoadingNext: infiniteQuery.isFetchingNextPage,
    error: infiniteQuery.error ? new Error(infiniteQuery.error.message) : null,
    loadPrevious,
    loadNext,
    jumpToLatest,
    jumpToMessage,
    sendMessage,
    isSending: sendMessageMutation.isPending,
    isAtBottom,
    refetch,
  }
}
