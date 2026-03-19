/**
 * Inbox Router
 *
 * tRPC router for inbox conversation and message management.
 * Handles listing conversations, viewing messages, and sending emails via Resend.
 *
 * INBOX WORKFLOW:
 * ===============
 * 1. User views inbox → listConversations() returns sidebar data
 * 2. User selects conversation → getConversation() returns full thread
 * 3. User composes reply → sendMessage() sends via Resend and stores
 * 4. Lead replies → recordInboundMessage() (called from webhooks)
 *
 * PERMISSIONS:
 * - SUBMISSIONS_READ: View inbox and conversations
 * - SUBMISSIONS_WRITE: Send messages and modify conversations
 *
 * SOURCE OF TRUTH KEYWORDS: InboxRouter, ConversationRouter, MessageRouter
 */

import { z } from 'zod'
import {
  createTRPCRouter,
  organizationProcedure,
  createStructuredError,
} from '../init'
import { ERROR_CODES } from '@/lib/errors'
import { permissions } from '@/lib/better-auth/permissions'
import {
  listConversations,
  getConversationById,
  markConversationAsRead,
  toggleConversationStar,
  archiveConversation,
  deleteConversation,
  sendMessage,
  getInboxStats,
  sendNewEmailToLead,
  searchLeadsForCompose,
  // Bi-directional pagination functions
  getMessagesAround,
  getMessagesBefore,
  getMessagesAfter,
  getLatestMessages,
} from '@/services/inbox.service'
import { realtime } from '@/lib/realtime'

// ============================================================================
// INPUT SCHEMAS - SOURCE OF TRUTH for inbox validation
// ============================================================================

/**
 * Schema for listing conversations with pagination and filtering
 *
 * FILTERS:
 * - filter: Status filter (all, unread, starred, archived)
 * - search: Text search on subject and lead name/email
 * - leadId: Filter to show only conversations with a specific lead (used in lead sheet)
 */
export const listConversationsSchema = z.object({
  organizationId: z.string(),
  filter: z.enum(['all', 'unread', 'starred', 'archived']).default('all'),
  search: z.string().optional(),
  /** Filter to get conversations for a specific lead (used in lead sheet communications tab) */
  leadId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(100).default(50),
})

/**
 * Schema for getting a single conversation by ID
 */
export const getConversationSchema = z.object({
  organizationId: z.string(),
  conversationId: z.string(),
})

/**
 * Schema for marking conversation as read
 */
export const markReadSchema = z.object({
  organizationId: z.string(),
  conversationId: z.string(),
})

/**
 * Schema for toggling star status
 */
export const toggleStarSchema = z.object({
  organizationId: z.string(),
  conversationId: z.string(),
})

/**
 * Schema for archiving a conversation
 */
export const archiveConversationSchema = z.object({
  organizationId: z.string(),
  conversationId: z.string(),
})

/**
 * Schema for deleting a conversation
 */
export const deleteConversationSchema = z.object({
  organizationId: z.string(),
  conversationId: z.string(),
})

/**
 * Schema for sending a message
 *
 * VALIDATION RULES:
 * - channel: Must be a valid MessageChannel enum value
 * - body: Required, non-empty message content
 * - subject: Optional, used for emails
 * - fromName/fromEmail: Optional — when omitted for EMAIL channel, the service
 *   resolves sender info automatically from the conversation thread:
 *   1) Previous outbound message, 2) Inbound's toEmail, 3) Error if none found
 * SOURCE OF TRUTH KEYWORDS: sendMessageSchema, MessageChannel, CHATBOT
 */
export const sendMessageSchema = z.object({
  organizationId: z.string(),
  conversationId: z.string(),
  channel: z.enum(['EMAIL', 'SMS', 'INSTAGRAM', 'INTERNAL', 'FORM', 'CHATBOT']),
  body: z.string().min(1, 'Message body is required'),
  subject: z.string().optional(),
  fromName: z.string().optional(),
  fromEmail: z.string().email().optional(),
})

/**
 * Schema for getting inbox stats
 */
export const getInboxStatsSchema = z.object({
  organizationId: z.string(),
})

/**
 * Schema for sending a new email to a lead (no existing conversation required)
 *
 * VALIDATION RULES:
 * - leadId: Required, must be a valid lead in the organization
 * - subject: Required for new emails
 * - body: Required, non-empty message content
 * - fromName/fromEmail: Required sender identification
 *
 * SOURCE OF TRUTH KEYWORDS: SendNewEmailSchema, NewEmailComposition
 */
export const sendNewEmailSchema = z.object({
  organizationId: z.string(),
  leadId: z.string(),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Message body is required'),
  fromName: z.string().min(1, 'Sender name is required'),
  fromEmail: z.string().email('Must be a valid email address'),
})

/**
 * Schema for searching leads to compose emails
 */
export const searchLeadsSchema = z.object({
  organizationId: z.string(),
  query: z.string().min(2, 'Search query must be at least 2 characters'),
  limit: z.number().int().positive().max(20).default(10),
})

// ============================================================================
// BI-DIRECTIONAL PAGINATION SCHEMAS
// SOURCE OF TRUTH KEYWORDS: InboxPagination, BiDirectionalMessagePagination
// ============================================================================

/**
 * Schema for loading messages around a target message (bi-directional initial load)
 *
 * WHY: WhatsApp/Messenger-style UX - load messages around focused message
 * HOW: If targetMessageId provided, loads messages before AND after
 *      If not provided, loads latest messages (bottom of conversation)
 */
export const getMessagesAroundSchema = z.object({
  organizationId: z.string(),
  conversationId: z.string(),
  /** Target message ID to load around (omit to load latest) */
  targetMessageId: z.string().optional(),
  /** Number of messages to load in each direction (default 15) */
  limit: z.number().int().positive().max(50).default(15),
})

/**
 * Schema for loading older messages (infinite scroll up)
 *
 * WHY: Load history when user scrolls up
 * HOW: Cursor-based pagination going backward in time
 */
export const getMessagesBeforeSchema = z.object({
  organizationId: z.string(),
  conversationId: z.string(),
  /** Cursor - ID of the oldest message currently loaded */
  cursor: z.string(),
  /** Number of messages to load (default 20) */
  limit: z.number().int().positive().max(50).default(20),
})

/**
 * Schema for loading newer messages (infinite scroll down)
 *
 * WHY: Load newer messages when scrolling down after viewing history
 * HOW: Cursor-based pagination going forward in time
 */
export const getMessagesAfterSchema = z.object({
  organizationId: z.string(),
  conversationId: z.string(),
  /** Cursor - ID of the newest message currently loaded */
  cursor: z.string(),
  /** Number of messages to load (default 20) */
  limit: z.number().int().positive().max(50).default(20),
})

/**
 * Schema for jumping to latest messages (skip intermediate pages)
 *
 * WHY: User wants to see latest messages without loading all history
 * HOW: Resets pagination state to "at bottom" position
 */
export const getLatestMessagesSchema = z.object({
  organizationId: z.string(),
  conversationId: z.string(),
  /** Number of messages to load (default 30) */
  limit: z.number().int().positive().max(50).default(30),
})

/**
 * Schema for unified paginated messages endpoint (useInfiniteQuery compatible)
 *
 * WHY: Single endpoint for bi-directional pagination with proper caching
 * HOW: Cursor encodes direction: 'before:msgId' or 'after:msgId' or undefined for initial
 *
 * CACHING: All pages stored in single cache entry via useInfiniteQuery
 * SOURCE OF TRUTH KEYWORDS: GetMessagesPaginatedSchema, InfiniteQueryPagination
 *
 * CURSOR FORMAT:
 * - undefined/null: Initial load (uses targetMessageId if provided, else latest)
 * - 'before:msgId': Load older messages before msgId
 * - 'after:msgId': Load newer messages after msgId
 */
export const getMessagesPaginatedSchema = z.object({
  organizationId: z.string(),
  conversationId: z.string(),
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

/**
 * Schema for team member typing indicator
 *
 * WHY: Real-time "typing..." indicator in chat widget
 * HOW: Team member types in inbox → emits chat.teamTyping event
 *
 * SECURITY: Does NOT include team member name/info - anonymous to visitor
 */
export const emitTeamTypingSchema = z.object({
  organizationId: z.string(),
  conversationId: z.string(),
  /** Whether currently typing */
  isTyping: z.boolean(),
})

// ============================================================================
// ROUTER
// ============================================================================

export const inboxRouter = createTRPCRouter({
  // ==========================================================================
  // READ OPERATIONS
  // ==========================================================================

  /**
   * List conversations for inbox sidebar
   *
   * WHY: Powers the inbox message list UI
   * HOW: Returns paginated conversations with lead info and unread status
   */
  list: organizationProcedure({
    requirePermission: permissions.SUBMISSIONS_READ,
  })
    .input(listConversationsSchema)
    .query(async ({ input }) => {
      try {
        return await listConversations(input)
      } catch (error) {
        throw createStructuredError(
          'INTERNAL_SERVER_ERROR',
          'Failed to list conversations',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message:
              error instanceof Error
                ? error.message
                : 'Failed to list conversations',
          }
        )
      }
    }),

  /**
   * Get a single conversation with all messages
   *
   * WHY: Powers the conversation view panel
   * HOW: Returns conversation with lead details and full message history
   */
  getConversation: organizationProcedure({
    requirePermission: permissions.SUBMISSIONS_READ,
  })
    .input(getConversationSchema)
    .query(async ({ input }) => {
      const conversation = await getConversationById(
        input.organizationId,
        input.conversationId
      )

      if (!conversation) {
        throw createStructuredError('NOT_FOUND', 'Conversation not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Conversation not found',
        })
      }

      return conversation
    }),

  /**
   * Get inbox statistics
   *
   * WHY: Display unread count badge and other metrics
   * HOW: Aggregates conversation data for quick stats
   */
  getStats: organizationProcedure({
    requirePermission: permissions.SUBMISSIONS_READ,
  })
    .input(getInboxStatsSchema)
    .query(async ({ input }) => {
      try {
        return await getInboxStats(input.organizationId)
      } catch (error) {
        throw createStructuredError(
          'INTERNAL_SERVER_ERROR',
          'Failed to get inbox stats',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message:
              error instanceof Error
                ? error.message
                : 'Failed to get inbox stats',
          }
        )
      }
    }),

  // ==========================================================================
  // UPDATE OPERATIONS
  // ==========================================================================

  /**
   * Mark conversation as read
   *
   * WHY: Update read status when user views conversation
   * HOW: Sets hasUnread to false and marks all messages as read
   */
  markAsRead: organizationProcedure({
    requirePermission: permissions.SUBMISSIONS_READ,
  })
    .input(markReadSchema)
    .mutation(async ({ input }) => {
      try {
        return await markConversationAsRead(
          input.organizationId,
          input.conversationId
        )
      } catch (error) {
        throw createStructuredError(
          'INTERNAL_SERVER_ERROR',
          'Failed to mark conversation as read',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message:
              error instanceof Error
                ? error.message
                : 'Failed to mark conversation as read',
          }
        )
      }
    }),

  /**
   * Toggle starred status
   *
   * WHY: Allow users to mark important conversations
   * HOW: Toggles isStarred boolean on conversation
   */
  toggleStar: organizationProcedure({
    requirePermission: permissions.SUBMISSIONS_READ,
  })
    .input(toggleStarSchema)
    .mutation(async ({ input }) => {
      try {
        return await toggleConversationStar(
          input.organizationId,
          input.conversationId
        )
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to toggle star status'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', 'Conversation not found', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Conversation not found',
          })
        }

        throw createStructuredError(
          'INTERNAL_SERVER_ERROR',
          'Failed to toggle star status',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          }
        )
      }
    }),

  /**
   * Archive a conversation
   *
   * WHY: Declutter inbox without permanent deletion
   * HOW: Sets isArchived to true, excluded from default list
   */
  archive: organizationProcedure({
    requirePermission: permissions.SUBMISSIONS_READ,
  })
    .input(archiveConversationSchema)
    .mutation(async ({ input }) => {
      try {
        return await archiveConversation(
          input.organizationId,
          input.conversationId
        )
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to archive conversation'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', 'Conversation not found', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Conversation not found',
          })
        }

        throw createStructuredError(
          'INTERNAL_SERVER_ERROR',
          'Failed to archive conversation',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          }
        )
      }
    }),

  // ==========================================================================
  // DELETE OPERATIONS
  // ==========================================================================

  /**
   * Soft delete a conversation
   *
   * WHY: Remove conversation while allowing recovery
   * HOW: Sets deletedAt timestamp, excluded from all queries
   */
  delete: organizationProcedure({
    requirePermission: permissions.SUBMISSIONS_DELETE,
  })
    .input(deleteConversationSchema)
    .mutation(async ({ input }) => {
      try {
        await deleteConversation(input.organizationId, input.conversationId)
        return { success: true, message: 'Conversation deleted successfully' }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to delete conversation'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', 'Conversation not found', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Conversation not found',
          })
        }

        throw createStructuredError(
          'INTERNAL_SERVER_ERROR',
          'Failed to delete conversation',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          }
        )
      }
    }),

  // ==========================================================================
  // MESSAGE OPERATIONS
  // ==========================================================================

  /**
   * Send a message in a conversation
   *
   * WHY: Core function for sending replies to leads
   * HOW: Creates message record and sends via appropriate channel
   *
   * For EMAIL channel:
   * - Uses organization's verified domain if available
   * - Falls back to platform default sender
   * - Stores Resend message ID for tracking
   *
   * For other channels:
   * - Stores message locally (actual sending via other integrations)
   */
  sendMessage: organizationProcedure({
    requirePermission: permissions.EMAIL_SEND,
  })
    .input(sendMessageSchema)
    .mutation(async ({ input }) => {
      try {
        const result = await sendMessage({
          organizationId: input.organizationId,
          conversationId: input.conversationId,
          channel: input.channel,
          body: input.body,
          subject: input.subject,
          fromName: input.fromName,
          fromEmail: input.fromEmail,
        })

        // If email failed to send, return error info but don't throw
        // The message was still created in the database
        if (result.error) {
          return {
            success: false,
            message: result.message,
            emailSent: false,
            error: result.error,
          }
        }

        return {
          success: true,
          message: result.message,
          emailSent: result.emailSent,
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to send message'

        if (message.includes('not found')) {
          throw createStructuredError('NOT_FOUND', 'Conversation not found', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Conversation not found',
          })
        }

        throw createStructuredError(
          'INTERNAL_SERVER_ERROR',
          'Failed to send message',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          }
        )
      }
    }),

  /**
   * Send a new email to a lead (creates conversation if needed)
   *
   * WHY: Allows users to initiate email conversations with leads they haven't contacted before
   * HOW: Creates or finds existing conversation, sends email via Resend
   *
   * USE CASE: User wants to email a lead for the first time from the inbox
   */
  sendNewEmail: organizationProcedure({
    requirePermission: permissions.EMAIL_SEND,
  })
    .input(sendNewEmailSchema)
    .mutation(async ({ input }) => {
      try {
        const result = await sendNewEmailToLead({
          organizationId: input.organizationId,
          leadId: input.leadId,
          subject: input.subject,
          body: input.body,
          fromName: input.fromName,
          fromEmail: input.fromEmail,
        })

        // If email failed to send, return error info but don't throw
        if (result.error) {
          return {
            success: false,
            conversation: result.conversation,
            message: result.message,
            emailSent: false,
            error: result.error,
          }
        }

        return {
          success: true,
          conversation: result.conversation,
          message: result.message,
          emailSent: result.emailSent,
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to send email'

        throw createStructuredError(
          'INTERNAL_SERVER_ERROR',
          'Failed to send email',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message,
          }
        )
      }
    }),

  /**
   * Search leads for compose autocomplete
   *
   * WHY: Users need to find leads to email when composing new messages
   * HOW: Searches by name and email, returns leads with valid email addresses
   */
  searchLeads: organizationProcedure({
    requirePermission: permissions.LEADS_READ,
  })
    .input(searchLeadsSchema)
    .query(async ({ input }) => {
      try {
        const leads = await searchLeadsForCompose(
          input.organizationId,
          input.query,
          input.limit
        )
        return { leads }
      } catch (error) {
        throw createStructuredError(
          'INTERNAL_SERVER_ERROR',
          'Failed to search leads',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message:
              error instanceof Error ? error.message : 'Failed to search leads',
          }
        )
      }
    }),

  // ==========================================================================
  // BI-DIRECTIONAL MESSAGE PAGINATION - WhatsApp/Messenger Style
  // ==========================================================================

  /**
   * Get messages around a target message (bi-directional initial load)
   *
   * WHY: WhatsApp/Messenger-style UX - when clicking notification/sidebar item,
   *      load messages AROUND that message for context
   * HOW: Fetches messages before and after target, enabling bi-directional scroll
   *
   * USE CASES:
   * - User opens conversation: targetMessageId = undefined → loads latest
   * - User clicks notification: targetMessageId = clicked message → loads around it
   */
  getMessagesAround: organizationProcedure({
    requirePermission: permissions.SUBMISSIONS_READ,
  })
    .input(getMessagesAroundSchema)
    .query(async ({ input }) => {
      try {
        return await getMessagesAround({
          organizationId: input.organizationId,
          conversationId: input.conversationId,
          targetMessageId: input.targetMessageId,
          limit: input.limit,
        })
      } catch (error) {
        throw createStructuredError(
          'INTERNAL_SERVER_ERROR',
          'Failed to load messages',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message:
              error instanceof Error ? error.message : 'Failed to load messages',
          }
        )
      }
    }),

  /**
   * Get older messages (infinite scroll up)
   *
   * WHY: Load history when user scrolls to top of message view
   * HOW: Cursor-based pagination going backward in time
   */
  getMessagesBefore: organizationProcedure({
    requirePermission: permissions.SUBMISSIONS_READ,
  })
    .input(getMessagesBeforeSchema)
    .query(async ({ input }) => {
      try {
        return await getMessagesBefore({
          organizationId: input.organizationId,
          conversationId: input.conversationId,
          cursor: input.cursor,
          limit: input.limit,
        })
      } catch (error) {
        throw createStructuredError(
          'INTERNAL_SERVER_ERROR',
          'Failed to load older messages',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message:
              error instanceof Error
                ? error.message
                : 'Failed to load older messages',
          }
        )
      }
    }),

  /**
   * Get newer messages (infinite scroll down)
   *
   * WHY: Load newer messages when scrolling down after viewing history
   * HOW: Cursor-based pagination going forward in time
   */
  getMessagesAfter: organizationProcedure({
    requirePermission: permissions.SUBMISSIONS_READ,
  })
    .input(getMessagesAfterSchema)
    .query(async ({ input }) => {
      try {
        return await getMessagesAfter({
          organizationId: input.organizationId,
          conversationId: input.conversationId,
          cursor: input.cursor,
          limit: input.limit,
        })
      } catch (error) {
        throw createStructuredError(
          'INTERNAL_SERVER_ERROR',
          'Failed to load newer messages',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message:
              error instanceof Error
                ? error.message
                : 'Failed to load newer messages',
          }
        )
      }
    }),

  /**
   * Get latest messages (jump to bottom)
   *
   * WHY: User wants to skip to latest without loading intermediate pages
   * HOW: Resets pagination state to "at bottom" with latest messages
   *
   * TRIGGERED BY: Jump-to-bottom FAB button
   */
  getLatestMessages: organizationProcedure({
    requirePermission: permissions.SUBMISSIONS_READ,
  })
    .input(getLatestMessagesSchema)
    .query(async ({ input }) => {
      try {
        return await getLatestMessages({
          organizationId: input.organizationId,
          conversationId: input.conversationId,
          limit: input.limit,
        })
      } catch (error) {
        throw createStructuredError(
          'INTERNAL_SERVER_ERROR',
          'Failed to load latest messages',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message:
              error instanceof Error
                ? error.message
                : 'Failed to load latest messages',
          }
        )
      }
    }),

  /**
   * Unified paginated messages endpoint (useInfiniteQuery compatible)
   *
   * WHY: All pages cached in single entry via useInfiniteQuery - data persists when switching conversations
   * HOW: Cursor encodes direction: 'before:msgId' or 'after:msgId'
   *
   * CURSOR FORMAT (parsed from string):
   * - undefined: Initial load (uses targetMessageId if provided, else latest)
   * - 'before:msgId': Load older messages before msgId
   * - 'after:msgId': Load newer messages after msgId
   *
   * CACHING: Single cache key per conversation - all pages stored together
   * SOURCE OF TRUTH KEYWORDS: InfiniteQueryPagination, BiDirectionalMessages
   */
  getMessagesPaginated: organizationProcedure({
    requirePermission: permissions.SUBMISSIONS_READ,
  })
    .input(getMessagesPaginatedSchema)
    .query(async ({ input }) => {
      try {
        const { organizationId, conversationId, targetMessageId, limit, cursor } = input

        // Parse cursor to extract direction and message ID
        // Format: 'before:msgId' or 'after:msgId'
        let direction: 'initial' | 'before' | 'after' = 'initial'
        let cursorMessageId: string | undefined

        if (cursor) {
          const [dir, ...idParts] = cursor.split(':')
          if (dir === 'before' || dir === 'after') {
            direction = dir
            cursorMessageId = idParts.join(':') // Handle IDs with colons
          }
        }

        // Route to appropriate pagination function based on direction
        if (direction === 'before' && cursorMessageId) {
          // Loading older messages (scroll up)
          const result = await getMessagesBefore({
            organizationId,
            conversationId,
            cursor: cursorMessageId,
            limit,
          })
          return {
            messages: result.messages,
            previousCursor: result.previousCursor,
            nextCursor: null, // Not used for 'before' direction
            hasPrevious: result.hasPrevious,
            hasNext: false, // Not relevant for this page
            focusMessageId: null,
            totalCount: 0, // Not needed for incremental loads
          }
        }

        if (direction === 'after' && cursorMessageId) {
          // Loading newer messages (scroll down)
          const result = await getMessagesAfter({
            organizationId,
            conversationId,
            cursor: cursorMessageId,
            limit,
          })
          return {
            messages: result.messages,
            previousCursor: null, // Not used for 'after' direction
            nextCursor: result.nextCursor,
            hasPrevious: false, // Not relevant for this page
            hasNext: result.hasNext,
            focusMessageId: null,
            totalCount: 0, // Not needed for incremental loads
          }
        }

        // Initial load (no cursor)
        return await getMessagesAround({
          organizationId,
          conversationId,
          targetMessageId,
          limit,
        })
      } catch (error) {
        throw createStructuredError(
          'INTERNAL_SERVER_ERROR',
          'Failed to load messages',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message:
              error instanceof Error ? error.message : 'Failed to load messages',
          }
        )
      }
    }),

  // ==========================================================================
  // TYPING INDICATOR
  // ==========================================================================

  /**
   * Emit team member typing indicator
   *
   * WHY: Real-time typing feedback in chat widget
   * HOW: Emits chat.teamTyping event - visitor sees "typing..."
   *
   * SECURITY: Does NOT include team member name/info - anonymous to visitor
   *
   * PERFORMANCE: Called frequently - kept lightweight (just emit event)
   */
  emitTeamTyping: organizationProcedure({
    requirePermission: permissions.EMAIL_SEND, // Same permission as sending messages
  })
    .input(emitTeamTypingSchema)
    .mutation(async ({ input }) => {
      // Get conversation to find leadId
      const conversation = await getConversationById(
        input.organizationId,
        input.conversationId
      )

      if (!conversation) {
        return { success: false, error: 'Conversation not found' }
      }

      // Emit typing event (no team member info for security)
      await realtime.emit('chat.teamTyping', {
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        leadId: conversation.leadId,
        isTyping: input.isTyping,
      })

      return { success: true }
    }),
})
