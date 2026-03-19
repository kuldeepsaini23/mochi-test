/**
 * Chat Widget Paginated Messages Hook (useInfiniteQuery)
 *
 * WHY: WhatsApp/Messenger-style UX for chat widget with PROPER caching
 * HOW: Uses useInfiniteQuery so ALL pages are stored in a SINGLE cache entry
 *
 * OPTIMISTIC UI: Uses tRPC onMutate/onError/onSuccess callbacks
 * NO MANUAL STATE - all optimistic updates go through the tRPC cache
 *
 * CACHING PATTERN (following use-paginated-messages.ts from inbox):
 * - Single cache key per session: ['chatWidgetMessaging', 'getMessagesPaginated', { token, ... }]
 * - All pages stored in query.data.pages array
 * - When user navigates away and returns, ALL loaded pages are restored from cache
 * - No refetching unless data is stale or manually invalidated
 *
 * FEATURES:
 * - Bi-directional pagination (older via getPreviousPageParam, newer via getNextPageParam)
 * - Load messages around a target message (for notification clicks)
 * - Optimistic UI via tRPC mutation callbacks (NOT manual state)
 *
 * SOURCE OF TRUTH KEYWORDS: UseChatWidgetPaginatedMessages, ChatWidgetBiDirectionalPagination
 */

'use client'

import { useCallback, useMemo, useEffect } from 'react'
import { trpc } from '@/trpc/react-provider'
import type { ChatMessage } from './index'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Pagination state for the hook
 */
export interface ChatWidgetPaginationState {
  /** Cursor for loading older messages */
  previousCursor: string | null
  /** Cursor for loading newer messages */
  nextCursor: string | null
  /** Whether there are more older messages */
  hasPrevious: boolean
  /** Whether there are more newer messages */
  hasNext: boolean
  /** Total message count */
  totalCount: number
  /** Message ID to focus/scroll to */
  focusMessageId: string | null
}

/**
 * Hook options
 */
export interface UseChatWidgetPaginatedMessagesOptions {
  organizationId: string
  chatWidgetId: string
  /** Session token for authentication */
  token: string | null
  /** Target message ID to load around */
  targetMessageId?: string
  /** Enable the hook */
  enabled?: boolean
  /** Callback to set on session hook for realtime refetch */
  setOnTeamMessage?: (callback: () => void) => void
  /**
   * Called when the first message creates a new session (Lead + LeadSession).
   * The embed component wires this to useChatWidgetSession.activateSession
   * so the session state, token, and leadId get stored on the client.
   */
  onSessionCreated?: (session: {
    token: string
    isIdentified: boolean
    leadId: string
    lead?: { id: string; firstName: string | null; lastName: string | null; email: string }
  }) => void
}

/**
 * Hook return type
 *
 * OPTIMISTIC UI: Uses tRPC onMutate/onError/onSuccess - NO manual state
 */
export interface UseChatWidgetPaginatedMessagesReturn {
  /** All loaded messages in chronological order */
  messages: ChatMessage[]
  /** Pagination state */
  pagination: ChatWidgetPaginationState
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
  /** Jump to latest messages */
  jumpToLatest: () => void
  /** Whether user is at the bottom (no newer messages to load) */
  isAtBottom: boolean
  /** Refetch the current view */
  refetch: () => void
  /** Send a message with optimistic UI via tRPC callbacks */
  sendMessage: (body: string) => void
  /** Whether sending a message */
  isSending: boolean
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

export function useChatWidgetPaginatedMessages(
  options: UseChatWidgetPaginatedMessagesOptions
): UseChatWidgetPaginatedMessagesReturn {
  const {
    organizationId,
    chatWidgetId,
    token,
    targetMessageId,
    enabled = true,
    setOnTeamMessage,
    onSessionCreated,
  } = options

  /**
   * tRPC utils for cache manipulation in mutation callbacks
   * WHY: onMutate needs to update the infinite query cache optimistically
   */
  const utils = trpc.useUtils()

  // -------------------------------------------------------------------------
  // INFINITE QUERY - Single cache entry for all pages
  // -------------------------------------------------------------------------

  /**
   * Bi-directional infinite query using unified endpoint
   *
   * CACHING:
   * - staleTime: 5 min - data considered fresh, no refetch needed
   * - gcTime: 30 min - keep in cache when inactive
   * - refetchOnMount: false - use cached data when switching back
   *
   * PAGES STRUCTURE:
   * - Pages are stored in order: [oldest...initial...newest]
   * - getPreviousPageParam: returns encoded cursor 'before:msgId' for loading older
   * - getNextPageParam: returns encoded cursor 'after:msgId' for loading newer
   */
  const infiniteQuery = trpc.chatWidgetMessaging.getMessagesPaginated.useInfiniteQuery(
    {
      organizationId,
      chatWidgetId,
      token: token || '',
      targetMessageId,
      limit: 20,
    },
    {
      enabled: enabled && !!token,

      /**
       * Get cursor for loading OLDER messages (scroll up)
       * WHY: Returns encoded string cursor for next 'before' fetch
       * FORMAT: 'before:msgId' - parsed by endpoint
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
       * FORMAT: 'after:msgId' - parsed by endpoint
       */
      getNextPageParam: (lastPage) => {
        if (!lastPage.hasNext || !lastPage.nextCursor) {
          return undefined
        }
        return encodeCursor('after', lastPage.nextCursor)
      },

      /**
       * Cache configuration for optimal UX
       */
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes
      refetchOnWindowFocus: false,
      refetchOnMount: false,
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
   * 3. onSuccess: Invalidate to sync with server (or just let it be since onMutate added it)
   */
  const sendMessageMutation = trpc.chatWidgetMessaging.sendMessage.useMutation({
    /**
     * onMutate - Optimistic update BEFORE the request
     * WHY: Message appears instantly without waiting for server
     * HOW: Add temp message to the infinite query cache
     *
     * NOTE: Skipped for the first message (no token yet) because the
     *       infinite query hasn't run and there's no cache to update.
     *       The message will appear once the session is activated and
     *       the query fires for the first time.
     */
    onMutate: async (variables) => {
      // Skip optimistic update when no token — first message creates the session
      if (!token) {
        return { previousData: undefined, optimisticId: '' }
      }

      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await utils.chatWidgetMessaging.getMessagesPaginated.cancel()

      // Snapshot the previous value for rollback
      const previousData = utils.chatWidgetMessaging.getMessagesPaginated.getInfiniteData({
        organizationId,
        chatWidgetId,
        token: token || '',
        limit: 20,
      })

      // Create optimistic message
      const optimisticMessage: ChatMessage = {
        id: `temp-${Date.now()}`,
        direction: 'INBOUND',
        body: variables.body,
        sentAt: new Date(),
      }

      // Optimistically update the infinite query cache
      utils.chatWidgetMessaging.getMessagesPaginated.setInfiniteData(
        {
          organizationId,
          chatWidgetId,
          token: token || '',
          limit: 20,
        },
        (oldData) => {
          if (!oldData) return oldData

          // Add optimistic message to the last page (newest messages)
          const newPages = [...oldData.pages]
          if (newPages.length > 0) {
            const lastPageIndex = newPages.length - 1
            newPages[lastPageIndex] = {
              ...newPages[lastPageIndex],
              messages: [
                ...newPages[lastPageIndex].messages,
                {
                  id: optimisticMessage.id,
                  direction: optimisticMessage.direction,
                  body: optimisticMessage.body,
                  sentAt: optimisticMessage.sentAt.toISOString(),
                },
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
      return { previousData, optimisticId: optimisticMessage.id }
    },

    /**
     * onError - Rollback on failure
     * WHY: Remove the optimistic message if send failed
     * HOW: Restore the previous data snapshot
     */
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        utils.chatWidgetMessaging.getMessagesPaginated.setInfiniteData(
          {
            organizationId,
            chatWidgetId,
            token: token || '',
            limit: 20,
          },
          context.previousData
        )
      }
    },

    /**
     * onSuccess - Sync with server
     * WHY: Replace optimistic message with real server message
     * HOW: Invalidate the query to refetch fresh data
     *
     * FIRST MESSAGE FLOW: If the result contains a session, it means this was
     * the first message and a Lead + LeadSession were created. Activate the
     * session so the client stores the token and enables future queries.
     */
    onSuccess: (result) => {
      // First message created a session — activate it on the client
      if (result.session && onSessionCreated) {
        onSessionCreated(result.session)
        return
      }

      // Invalidate to get the real message from server
      utils.chatWidgetMessaging.getMessagesPaginated.invalidate({
        organizationId,
        chatWidgetId,
        token: token || '',
      })
    },
  })

  /**
   * Send message wrapper function
   *
   * WHY: Simple API for components to call.
   * FIRST MESSAGE: If no token yet, sends without token — the server
   * creates Lead + LeadSession inline and returns the session in the response.
   */
  const sendMessage = useCallback(
    (body: string) => {
      sendMessageMutation.mutate({
        organizationId,
        chatWidgetId,
        ...(token ? { token } : {}),
        body,
      })
    },
    [token, organizationId, chatWidgetId, sendMessageMutation]
  )

  // -------------------------------------------------------------------------
  // REGISTER REFETCH CALLBACK WITH SESSION HOOK
  // -------------------------------------------------------------------------

  /**
   * Register refetch callback with session hook for realtime updates
   * WHY: When team sends a message via realtime, we need to refetch
   */
  useEffect(() => {
    if (setOnTeamMessage) {
      setOnTeamMessage(() => {
        infiniteQuery.refetch()
      })
    }
  }, [setOnTeamMessage, infiniteQuery])

  // -------------------------------------------------------------------------
  // COMPUTED VALUES
  // -------------------------------------------------------------------------

  /**
   * Combine all pages into single sorted message array
   * WHY: useInfiniteQuery stores pages separately, UI needs flat array
   * HOW: Flatten pages, deduplicate by ID (using Map), sort by sentAt
   */
  const messages = useMemo((): ChatMessage[] => {
    const messagesMap = new Map<string, ChatMessage>()

    // Add all messages from infinite query pages
    if (infiniteQuery.data?.pages) {
      for (const page of infiniteQuery.data.pages) {
        for (const msg of page.messages) {
          messagesMap.set(msg.id, {
            id: msg.id,
            direction: msg.direction as 'INBOUND' | 'OUTBOUND',
            body: msg.body,
            sentAt: typeof msg.sentAt === 'string' ? new Date(msg.sentAt) : msg.sentAt,
          })
        }
      }
    }

    // Convert to array and sort by sentAt (chronological order)
    const arr = Array.from(messagesMap.values())
    return arr.sort((a, b) => {
      const dateA = a.sentAt instanceof Date ? a.sentAt : new Date(a.sentAt)
      const dateB = b.sentAt instanceof Date ? b.sentAt : new Date(b.sentAt)
      return dateA.getTime() - dateB.getTime()
    })
  }, [infiniteQuery.data])

  /**
   * Extract pagination state from infinite query
   */
  const pagination = useMemo((): ChatWidgetPaginationState => {
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
  }, [infiniteQuery.data, infiniteQuery.hasPreviousPage, infiniteQuery.hasNextPage])

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
   * Jump to latest messages
   * WHY: User wants to skip to bottom without loading intermediate pages
   * HOW: Refetch to get latest messages
   */
  const jumpToLatest = useCallback(() => {
    infiniteQuery.refetch()
  }, [infiniteQuery])

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
    isAtBottom,
    refetch,
    sendMessage,
    isSending: sendMessageMutation.isPending,
  }
}
