/**
 * Chat Widget Session Hook
 *
 * Manages the chat widget session state including initialization,
 * typing indicators, and user identification.
 *
 * SIMPLIFIED: Uses anonymous leads so messages appear in inbox immediately.
 *
 * REALTIME: Uses @upstash/realtime SSE for instant message updates
 * instead of polling. Visitors see team replies immediately.
 *
 * NOTE: Message sending and optimistic UI is handled by useChatWidgetPaginatedMessages
 * using proper tRPC onMutate/onError/onSuccess callbacks.
 *
 * SOURCE OF TRUTH KEYWORDS: ChatWidgetSessionHook, LiveChatSession
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { trpc } from '@/trpc/react-provider'
import { useRealtime } from '@/lib/realtime-client'
import type { ChatSession } from './index'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Local storage key prefix for chat widget session token */
const STORAGE_KEY_PREFIX = 'mochi_chat_widget_'

/**
 * Get storage key for a specific widget
 */
function getStorageKey(chatWidgetId: string): string {
  return `${STORAGE_KEY_PREFIX}${chatWidgetId}`
}

// ============================================================================
// HOOK TYPES
// ============================================================================

export interface UseChatWidgetSessionOptions {
  organizationId: string
  chatWidgetId: string
}

export interface UseChatWidgetSessionReturn {
  /** Whether session is initializing */
  isLoading: boolean
  /** Current session info */
  session: ChatSession | null
  /** Session token for API calls */
  token: string | null
  /** Lead ID for realtime filtering */
  leadId: string | null
  /** Whether user is identified (has real email, not anonymous) */
  isIdentified: boolean
  /** Identify user with email */
  identifyUser: (data: {
    email: string
    firstName?: string
    lastName?: string
    phone?: string
  }) => Promise<boolean>
  /** Is identifying user */
  isIdentifying: boolean
  /** Error message if any */
  error: string | null
  /** Whether team is currently typing */
  isTeamTyping: boolean
  /** Emit visitor typing indicator (call on input change) */
  emitTyping: (isTyping: boolean) => void
  /** Refetch messages callback (called by realtime) */
  onTeamMessage: () => void
  /** Set the refetch callback */
  setOnTeamMessage: (callback: () => void) => void
  /**
   * Activate session after the first message creates a Lead + LeadSession.
   * Called by the paginated messages hook when sendMessage returns a session.
   *
   * WHY: initSession() no longer creates DB records for new visitors.
   *      The session is created inline in sendMessage(), and this callback
   *      lets the client adopt the new token/leadId.
   */
  activateSession: (sessionData: {
    token: string
    isIdentified: boolean
    leadId: string
    lead?: { id: string; firstName: string | null; lastName: string | null; email: string }
  }) => void
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook for managing chat widget session
 *
 * Handles:
 * - Session initialization (creates anonymous lead immediately)
 * - User identification (updates anonymous lead OR merges with existing)
 * - Token storage in localStorage
 * - Typing indicators (realtime)
 *
 * NOTE: Message sending is handled by useChatWidgetPaginatedMessages
 * which uses proper tRPC onMutate/onError/onSuccess for optimistic UI.
 */
export function useChatWidgetSession(
  options: UseChatWidgetSessionOptions
): UseChatWidgetSessionReturn {
  const { organizationId, chatWidgetId } = options

  // State
  const [session, setSession] = useState<ChatSession | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [leadId, setLeadId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isInitializedRef = useRef(false)

  /**
   * Ref to hold current leadId for realtime callbacks
   *
   * WHY CRITICAL: useRealtime callback is created once at mount time.
   *               If we use `leadId` state directly, it captures the initial null value
   *               and NEVER updates (stale closure problem).
   *
   * HOW: Mirror the leadId state to a ref, and use the ref in the callback.
   *      Refs are mutable and always reflect the current value.
   *
   * SOURCE OF TRUTH KEYWORDS: LeadIdRef, RealtimeLeadIdFix
   */
  const leadIdRef = useRef<string | null>(null)

  /**
   * Callback to refetch messages when team sends a message
   * Set by the paginated messages hook
   */
  const onTeamMessageRef = useRef<() => void>(() => {})

  /**
   * Team typing indicator state
   * WHY: Show "typing..." when team is typing a response
   */
  const [isTeamTyping, setIsTeamTyping] = useState(false)
  const teamTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  /**
   * Typing indicator state
   * WHY: Send periodic "still typing" signals while user is typing
   * HOW: Emit true every 1.5s while typing, emit false when stopped
   */
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const stopTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isCurrentlyTypingRef = useRef(false)

  // tRPC mutations
  const initSessionMutation = trpc.chatWidgetMessaging.initSession.useMutation()
  const identifyUserMutation = trpc.chatWidgetMessaging.identifyUser.useMutation()
  const emitTypingMutation = trpc.chatWidgetMessaging.emitTyping.useMutation()

  // -------------------------------------------------------------------------
  // SYNC LEADID REF - Keep ref in sync with state for realtime callbacks
  // -------------------------------------------------------------------------

  /**
   * Sync leadIdRef whenever leadId state changes
   * WHY: Realtime callback uses ref.current to avoid stale closure
   */
  useEffect(() => {
    leadIdRef.current = leadId
  }, [leadId])

  // -------------------------------------------------------------------------
  // REALTIME SUBSCRIPTION - Instant updates when team replies or types
  // -------------------------------------------------------------------------

  useRealtime({
    events: ['inbox.chatSent', 'chat.teamTyping'],
    onData({ event, data }) {
      /**
       * CRITICAL: Use leadIdRef.current instead of leadId state
       * WHY: This callback is created once at mount. Using state directly
       *      would capture the initial null value (stale closure).
       *      Refs are mutable and always reflect current value.
       */
      const currentLeadId = leadIdRef.current

      // Team sent a message
      if (event === 'inbox.chatSent') {
        if (data.leadId === currentLeadId) {
          // Team replied - trigger refetch callback
          onTeamMessageRef.current()
          // Clear typing indicator since they sent
          setIsTeamTyping(false)
          if (teamTypingTimeoutRef.current) {
            clearTimeout(teamTypingTimeoutRef.current)
          }
        }
      }

      // Team typing indicator
      if (event === 'chat.teamTyping' && data.leadId === currentLeadId) {
        if (data.isTyping) {
          setIsTeamTyping(true)
          // Auto-clear after 3 seconds if no update
          if (teamTypingTimeoutRef.current) {
            clearTimeout(teamTypingTimeoutRef.current)
          }
          teamTypingTimeoutRef.current = setTimeout(() => {
            setIsTeamTyping(false)
          }, 3000)
        } else {
          setIsTeamTyping(false)
          if (teamTypingTimeoutRef.current) {
            clearTimeout(teamTypingTimeoutRef.current)
          }
        }
      }
    },
  })

  // -------------------------------------------------------------------------
  // Session Initialization
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (isInitializedRef.current) return
    isInitializedRef.current = true

    async function initSession() {
      setIsLoading(true)
      setError(null)

      try {
        const storageKey = getStorageKey(chatWidgetId)
        const existingToken = typeof window !== 'undefined'
          ? localStorage.getItem(storageKey) ?? undefined
          : undefined

        const result = await initSessionMutation.mutateAsync({
          organizationId,
          chatWidgetId,
          existingToken,
        })

        if (result.success && result.session) {
          /**
           * EXISTING SESSION restored — store token and activate immediately.
           * This path runs when the visitor returns and has a valid token in localStorage.
           */
          if (result.session.token && typeof window !== 'undefined') {
            localStorage.setItem(storageKey, result.session.token)
          }

          setToken(result.session.token)
          setLeadId(result.session.leadId)
          setSession({
            isIdentified: result.session.isIdentified,
            lead: result.session.lead ? {
              firstName: result.session.lead.firstName,
              email: result.session.lead.email,
            } : undefined,
          })
        } else if (result.success && !result.session) {
          /**
           * NEW VISITOR — widget is valid but no session created yet.
           * No Lead/LeadSession in DB. The session will be created when
           * the visitor sends their first message (via sendMessage).
           * Client stays in "pending" state: token=null, session=null.
           */
          // Nothing to set — defaults are already null/false
        } else {
          setError(result.error || 'Failed to initialize session')
        }
      } catch (err) {
        setError('Failed to connect to chat')
      } finally {
        setIsLoading(false)
      }
    }

    initSession()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, chatWidgetId])

  // -------------------------------------------------------------------------
  // User Identification
  // -------------------------------------------------------------------------

  const identifyUser = useCallback(
    async (data: {
      email: string
      firstName?: string
      lastName?: string
      phone?: string
    }): Promise<boolean> => {
      if (!token) {
        setError('No active session')
        return false
      }

      try {
        const result = await identifyUserMutation.mutateAsync({
          organizationId,
          chatWidgetId,
          token,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
        })

        if (result.success) {
          if (result.token && result.token !== token) {
            const storageKey = getStorageKey(chatWidgetId)
            if (typeof window !== 'undefined') {
              localStorage.setItem(storageKey, result.token)
            }
            setToken(result.token)
          }

          if (result.leadId && result.leadId !== leadId) {
            setLeadId(result.leadId)
          }

          setSession({
            isIdentified: true,
            lead: {
              firstName: data.firstName || null,
              email: data.email,
            },
          })

          // Trigger refetch for new session
          onTeamMessageRef.current()
          return true
        } else {
          setError(result.error || 'Failed to identify user')
          return false
        }
      } catch (err) {
        setError('Failed to identify user')
        return false
      }
    },
    [token, leadId, organizationId, chatWidgetId, identifyUserMutation]
  )

  // -------------------------------------------------------------------------
  // Typing Indicator - Emit visitor typing status (debounced)
  // -------------------------------------------------------------------------

  /**
   * Start typing - emit true immediately and every 1.5s while typing
   */
  const startTyping = useCallback(() => {
    if (!token || isCurrentlyTypingRef.current) return

    isCurrentlyTypingRef.current = true
    emitTypingMutation.mutate({
      organizationId,
      chatWidgetId,
      token,
      isTyping: true,
    })

    // Send periodic "still typing" signals every 1.5 seconds
    typingIntervalRef.current = setInterval(() => {
      emitTypingMutation.mutate({
        organizationId,
        chatWidgetId,
        token,
        isTyping: true,
      })
    }, 1500)
  }, [token, organizationId, chatWidgetId, emitTypingMutation])

  /**
   * Stop typing - clear interval and emit false
   */
  const stopTyping = useCallback(() => {
    if (!token || !isCurrentlyTypingRef.current) return

    isCurrentlyTypingRef.current = false

    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current)
      typingIntervalRef.current = null
    }

    if (stopTypingTimeoutRef.current) {
      clearTimeout(stopTypingTimeoutRef.current)
      stopTypingTimeoutRef.current = null
    }

    emitTypingMutation.mutate({
      organizationId,
      chatWidgetId,
      token,
      isTyping: false,
    })
  }, [token, organizationId, chatWidgetId, emitTypingMutation])

  /**
   * Handle typing activity - start typing and reset stop timer
   *
   * USAGE: Call with true on input change, false on blur/submit
   */
  const emitTyping = useCallback(
    (isTyping: boolean) => {
      if (!token) return

      if (isTyping) {
        // Start typing if not already
        startTyping()

        // Reset the auto-stop timer (stops 2s after last keystroke)
        if (stopTypingTimeoutRef.current) {
          clearTimeout(stopTypingTimeoutRef.current)
        }
        stopTypingTimeoutRef.current = setTimeout(() => {
          stopTyping()
        }, 2000)
      } else {
        // Explicit stop (blur, send, cancel)
        stopTyping()
      }
    },
    [token, startTyping, stopTyping]
  )

  /**
   * Set callback for when team sends a message
   */
  const setOnTeamMessage = useCallback((callback: () => void) => {
    onTeamMessageRef.current = callback
  }, [])

  // -------------------------------------------------------------------------
  // ACTIVATE SESSION — called when first message creates Lead + LeadSession
  // -------------------------------------------------------------------------

  /**
   * Adopt a newly created session from the sendMessage response.
   *
   * WHY: initSession() no longer creates a Lead for new visitors.
   *      When the visitor sends their first message, sendMessage() creates
   *      the Lead + LeadSession and returns the session data. This callback
   *      stores the token, updates state, and enables future queries/realtime.
   */
  const activateSession = useCallback(
    (sessionData: {
      token: string
      isIdentified: boolean
      leadId: string
      lead?: { id: string; firstName: string | null; lastName: string | null; email: string }
    }) => {
      const storageKey = getStorageKey(chatWidgetId)
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, sessionData.token)
      }

      setToken(sessionData.token)
      setLeadId(sessionData.leadId)
      setSession({
        isIdentified: sessionData.isIdentified,
        lead: sessionData.lead
          ? { firstName: sessionData.lead.firstName, email: sessionData.lead.email }
          : undefined,
      })
    },
    [chatWidgetId]
  )

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    isLoading,
    session,
    token,
    leadId,
    isIdentified: session?.isIdentified || false,
    identifyUser,
    isIdentifying: identifyUserMutation.isPending,
    error,
    isTeamTyping,
    emitTyping,
    onTeamMessage: () => onTeamMessageRef.current(),
    setOnTeamMessage,
    activateSession,
  }
}
