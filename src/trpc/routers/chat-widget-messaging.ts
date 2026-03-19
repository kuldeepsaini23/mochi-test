/**
 * ============================================================================
 * CHAT WIDGET MESSAGING ROUTER - Public Chat Widget API
 * ============================================================================
 *
 * tRPC router for chat widget messaging. Provides PUBLIC endpoints for
 * anonymous and identified users to interact with chat widgets.
 *
 * PUBLIC ENDPOINTS (no auth required):
 * - initSession: Initialize a chat widget session (guest or lead)
 * - sendMessage: Send a message through the chat widget
 * - getMessages: Get chat history for a session
 * - identifyUser: Convert guest to lead by providing email
 * - getWidgetConfig: Get widget configuration for display
 *
 * SECURITY:
 * - All operations require valid organizationId + chatWidgetId
 * - Session tokens are HMAC-SHA256 signed and validated
 * - Organization and widget ownership is verified on every request
 *
 * SOURCE OF TRUTH KEYWORDS: ChatWidgetMessaging, ChatWidgetPublicAPI, ChatWidgetSession
 */

import { z } from 'zod'
import { createTRPCRouter, baseProcedure } from '../init'
import * as chatWidgetMessagingService from '@/services/chat-widget-messaging.service'

// ============================================================================
// BI-DIRECTIONAL PAGINATION SCHEMA
// ============================================================================

/**
 * Schema for paginated messages endpoint (useInfiniteQuery compatible)
 *
 * WHY: Single endpoint for bi-directional pagination with proper caching
 * HOW: Cursor encodes direction: 'before:msgId' or 'after:msgId'
 *
 * CURSOR FORMAT:
 * - undefined/null: Initial load (uses targetMessageId if provided, else latest)
 * - 'before:msgId': Load older messages before msgId
 * - 'after:msgId': Load newer messages after msgId
 *
 * CACHING: All pages stored in single cache entry via useInfiniteQuery
 * SOURCE OF TRUTH KEYWORDS: ChatWidgetPaginatedSchema, ChatWidgetInfiniteQuery
 */
const getMessagesPaginatedSchema = z.object({
  /** The organization ID */
  organizationId: z.string().min(1, 'Organization ID is required'),
  /** The chat widget ID */
  chatWidgetId: z.string().min(1, 'Chat Widget ID is required'),
  /** The session token */
  token: z.string().min(1, 'Token is required'),
  /** Target message ID to load around (only used on initial load) */
  targetMessageId: z.string().optional(),
  /** Number of messages per page (default 20) */
  limit: z.number().int().positive().max(50).default(20),
  /**
   * Pagination cursor - encoded string with direction
   * Format: 'before:msgId' or 'after:msgId' or undefined for initial
   */
  cursor: z.string().optional(),
})

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * Schema for initializing a chat widget session
 *
 * Called when widget opens - creates anonymous lead or validates existing token
 */
const initSessionSchema = z.object({
  /** The organization ID */
  organizationId: z.string().min(1, 'Organization ID is required'),
  /** The chat widget ID */
  chatWidgetId: z.string().min(1, 'Chat Widget ID is required'),
  /** Existing session token from client storage (optional) */
  existingToken: z.string().optional(),
})

/**
 * Schema for sending a message through the widget
 *
 * NOTE: `token` is optional — omitted on the FIRST message when no session exists yet.
 * The service creates a Lead + LeadSession inline on the first message so leads
 * are only stored when the visitor actually engages.
 */
const sendMessageSchema = z.object({
  /** The organization ID */
  organizationId: z.string().min(1, 'Organization ID is required'),
  /** The chat widget ID */
  chatWidgetId: z.string().min(1, 'Chat Widget ID is required'),
  /** The session token — optional for first message (creates session inline) */
  token: z.string().min(1).optional(),
  /** The message body */
  body: z.string().min(1, 'Message body is required').max(5000, 'Message too long'),
})

/**
 * Schema for getting messages
 */
const getMessagesSchema = z.object({
  /** The organization ID */
  organizationId: z.string().min(1, 'Organization ID is required'),
  /** The chat widget ID */
  chatWidgetId: z.string().min(1, 'Chat Widget ID is required'),
  /** The session token */
  token: z.string().min(1, 'Token is required'),
})

/**
 * Schema for identifying a user (guest to lead conversion)
 */
const identifyUserSchema = z.object({
  /** The organization ID */
  organizationId: z.string().min(1, 'Organization ID is required'),
  /** The chat widget ID */
  chatWidgetId: z.string().min(1, 'Chat Widget ID is required'),
  /** Current session token */
  token: z.string().min(1, 'Token is required'),
  /** User's email (required for identification) */
  email: z.string().email('Valid email is required'),
  /** User's first name (optional) */
  firstName: z.string().optional(),
  /** User's last name (optional) */
  lastName: z.string().optional(),
  /** User's phone (optional) */
  phone: z.string().optional(),
})

/**
 * Schema for getting widget configuration
 */
const getWidgetConfigSchema = z.object({
  /** The organization ID */
  organizationId: z.string().min(1, 'Organization ID is required'),
  /** The chat widget ID */
  chatWidgetId: z.string().min(1, 'Chat Widget ID is required'),
})

/**
 * Schema for typing indicator
 *
 * WHY: Real-time "typing..." indicator between customer and team
 * HOW: Emits chat.typing event via @upstash/realtime
 */
const typingIndicatorSchema = z.object({
  /** The organization ID */
  organizationId: z.string().min(1, 'Organization ID is required'),
  /** The chat widget ID */
  chatWidgetId: z.string().min(1, 'Chat Widget ID is required'),
  /** Current session token */
  token: z.string().min(1, 'Token is required'),
  /** Whether currently typing */
  isTyping: z.boolean(),
})

// ============================================================================
// ROUTER
// ============================================================================

export const chatWidgetMessagingRouter = createTRPCRouter({
  // ==========================================================================
  // PUBLIC ENDPOINTS (No authentication required)
  // All operations validate organization + widget + token internally
  // ==========================================================================

  /**
   * Initialize a chat widget session
   *
   * PUBLIC - No auth required. Called when widget opens.
   *
   * Flow:
   * 1. If existingToken provided, validate it (try lead session, then guest)
   * 2. If valid, return session info (type, isIdentified, lead data if any)
   * 3. If invalid or no token, create new guest session
   * 4. Return session with token for client storage
   *
   * @example
   * ```ts
   * // First visit - no token
   * const result = await trpc.chatWidgetMessaging.initSession.mutate({
   *   organizationId: 'org_xxx',
   *   chatWidgetId: 'widget_yyy',
   * })
   * // Returns: { session: { type: 'guest', token: 'v1.xxx', isIdentified: false } }
   * localStorage.setItem('mochi_chat_token', result.session.token)
   *
   * // Return visit - with token
   * const result = await trpc.chatWidgetMessaging.initSession.mutate({
   *   organizationId: 'org_xxx',
   *   chatWidgetId: 'widget_yyy',
   *   existingToken: localStorage.getItem('mochi_chat_token'),
   * })
   * // If identified: { session: { type: 'lead', isIdentified: true, lead: {...} } }
   * ```
   */
  initSession: baseProcedure
    .input(initSessionSchema)
    .mutation(async ({ input }) => {
      return await chatWidgetMessagingService.initSession({
        organizationId: input.organizationId,
        chatWidgetId: input.chatWidgetId,
        existingToken: input.existingToken,
      })
    }),

  /**
   * Send a message through the chat widget
   *
   * PUBLIC - No auth required. Requires valid session token.
   *
   * Routes to guest messaging or lead inbox based on session type.
   *
   * @example
   * ```ts
   * const result = await trpc.chatWidgetMessaging.sendMessage.mutate({
   *   organizationId: 'org_xxx',
   *   chatWidgetId: 'widget_yyy',
   *   token: 'v1.xxxxx.xxxxx',
   *   body: 'Hello, I have a question!',
   * })
   * ```
   */
  sendMessage: baseProcedure
    .input(sendMessageSchema)
    .mutation(async ({ input }) => {
      return await chatWidgetMessagingService.sendMessage({
        organizationId: input.organizationId,
        chatWidgetId: input.chatWidgetId,
        token: input.token,
        body: input.body,
      })
    }),

  /**
   * Get messages for a chat widget session
   *
   * PUBLIC - No auth required. Requires valid session token.
   *
   * Returns messages from guest session or lead conversation.
   *
   * @example
   * ```ts
   * const result = await trpc.chatWidgetMessaging.getMessages.query({
   *   organizationId: 'org_xxx',
   *   chatWidgetId: 'widget_yyy',
   *   token: 'v1.xxxxx.xxxxx',
   * })
   * // Returns: { messages: [{ id, direction, body, sentAt }, ...] }
   * ```
   */
  getMessages: baseProcedure
    .input(getMessagesSchema)
    .query(async ({ input }) => {
      return await chatWidgetMessagingService.getMessages(
        input.organizationId,
        input.chatWidgetId,
        input.token
      )
    }),

  /**
   * Identify a user (convert guest to lead)
   *
   * PUBLIC - No auth required. Called when user provides email.
   *
   * Flow:
   * 1. If guest session, convert to lead and transfer messages
   * 2. If already lead, return existing info
   * 3. If no valid session, create new lead session
   * 4. Return new token for client to update storage
   *
   * @example
   * ```ts
   * const result = await trpc.chatWidgetMessaging.identifyUser.mutate({
   *   organizationId: 'org_xxx',
   *   chatWidgetId: 'widget_yyy',
   *   token: 'v1.guest_token.xxx',
   *   email: 'user@example.com',
   *   firstName: 'John',
   * })
   * // Update stored token with lead session token
   * if (result.success && result.token) {
   *   localStorage.setItem('mochi_chat_token', result.token)
   * }
   * ```
   */
  identifyUser: baseProcedure
    .input(identifyUserSchema)
    .mutation(async ({ input }) => {
      return await chatWidgetMessagingService.identifyUser({
        organizationId: input.organizationId,
        chatWidgetId: input.chatWidgetId,
        token: input.token,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
      })
    }),

  /**
   * Get chat widget configuration for public display
   *
   * PUBLIC - No auth required. Returns widget theme, FAQ, updates.
   *
   * @example
   * ```ts
   * const widget = await trpc.chatWidgetMessaging.getWidgetConfig.query({
   *   organizationId: 'org_xxx',
   *   chatWidgetId: 'widget_yyy',
   * })
   * // Returns: { id, name, description, config, faqItems, updates, organization }
   * ```
   */
  getWidgetConfig: baseProcedure
    .input(getWidgetConfigSchema)
    .query(async ({ input }) => {
      return await chatWidgetMessagingService.getPublicWidgetConfig(
        input.organizationId,
        input.chatWidgetId
      )
    }),

  /**
   * Emit visitor typing indicator
   *
   * PUBLIC - No auth required. Uses session token for validation.
   *
   * PERFORMANCE: Called frequently during typing - kept lightweight.
   * Only validates session and emits event, no heavy DB operations.
   *
   * @example
   * ```ts
   * // Call on input change (debounced on client side)
   * await trpc.chatWidgetMessaging.emitTyping.mutate({
   *   organizationId: 'org_xxx',
   *   chatWidgetId: 'widget_yyy',
   *   token: 'session_token',
   *   isTyping: true,
   * })
   * ```
   */
  emitTyping: baseProcedure
    .input(typingIndicatorSchema)
    .mutation(async ({ input }) => {
      return await chatWidgetMessagingService.emitVisitorTyping({
        organizationId: input.organizationId,
        chatWidgetId: input.chatWidgetId,
        token: input.token,
        isTyping: input.isTyping,
      })
    }),

  // ==========================================================================
  // BI-DIRECTIONAL PAGINATION - WhatsApp/Messenger Style
  // ==========================================================================

  /**
   * Get paginated messages (useInfiniteQuery compatible)
   *
   * PUBLIC - No auth required. Requires valid session token.
   *
   * WHY: All pages cached in single entry via useInfiniteQuery - data persists
   *      when switching views, no data loss on navigation
   * HOW: Cursor encodes direction: 'before:msgId' or 'after:msgId'
   *
   * USE CASES:
   * - Chat widget opens: cursor = undefined → loads latest messages
   * - User scrolls up: cursor = 'before:oldestMsgId' → loads older messages
   * - User scrolls down (after viewing history): cursor = 'after:newestMsgId' → loads newer
   *
   * SECURITY: Only CHATBOT channel messages are returned (never email/SMS)
   *
   * SOURCE OF TRUTH KEYWORDS: ChatWidgetInfiniteQuery, ChatWidgetBiDirectional
   *
   * @example
   * ```ts
   * // Initial load (latest messages)
   * const { data } = useInfiniteQuery({
   *   queryFn: ({ pageParam }) => trpc.chatWidgetMessaging.getMessagesPaginated.query({
   *     organizationId: 'org_xxx',
   *     chatWidgetId: 'widget_yyy',
   *     token: 'session_token',
   *     cursor: pageParam,
   *   }),
   *   getNextPageParam: (lastPage) => lastPage.hasNext
   *     ? `after:${lastPage.nextCursor}`
   *     : undefined,
   *   getPreviousPageParam: (firstPage) => firstPage.hasPrevious
   *     ? `before:${firstPage.previousCursor}`
   *     : undefined,
   * })
   * ```
   */
  getMessagesPaginated: baseProcedure
    .input(getMessagesPaginatedSchema)
    .query(async ({ input }) => {
      return await chatWidgetMessagingService.getMessagesPaginated(
        input.organizationId,
        input.chatWidgetId,
        input.token,
        {
          cursor: input.cursor,
          targetMessageId: input.targetMessageId,
          limit: input.limit,
        }
      )
    }),
})
