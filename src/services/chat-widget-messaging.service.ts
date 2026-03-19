/**
 * Chat Widget Messaging Service (DAL)
 *
 * LAZY SESSION service for chat widget messaging.
 * Leads are ONLY created when the visitor sends their first message,
 * preventing phantom "Unknown" leads from visitors who never engage.
 *
 * SOURCE OF TRUTH KEYWORDS: ChatWidgetMessaging, ChatWidgetSession, ChatWidgetMessage
 *
 * FLOW:
 * 1. Widget opens → initSession() validates widget only (NO DB writes for new visitors)
 * 2. Returning visitor → initSession() restores existing session from token
 * 3. First message → sendMessage() creates Lead + LeadSession inline, conversation shows in inbox
 * 4. Provide email → identifyUser() updates lead info OR merges with existing lead
 *
 * SECURITY:
 * - All operations validate organization and widget ownership
 * - Tokens are HMAC-SHA256 signed and bound to organization
 */

import 'server-only'

import { prisma } from '@/lib/config'
import {
  createLeadSessionToken,
  validateTokenSignature,
  hashToken,
} from '@/lib/lead-session/token'
import {
  recordInboundMessage,
  getOrCreateConversation,
  sendMessage as sendInboxMessage,
} from '@/services/inbox.service'
import { realtime } from '@/lib/realtime'
import { notifyAllMembers } from '@/lib/notifications/send-notification'
import type { Message, MessageDirection } from '@/generated/prisma'

// ============================================================================
// TYPES
// ============================================================================

export interface ChatWidgetSession {
  token: string
  isIdentified: boolean
  leadId: string
  lead?: {
    id: string
    firstName: string | null
    lastName: string | null
    email: string
  }
}

export interface InitSessionInput {
  organizationId: string
  chatWidgetId: string
  existingToken?: string
}

export interface InitSessionResult {
  success: boolean
  /**
   * The restored session (returning visitor) or null (new visitor, no DB records yet).
   * null signals "widget is valid but no Lead/LeadSession created" — the session
   * will be created lazily in sendMessage() on the first message.
   */
  session?: ChatWidgetSession | null
  error?: string
}

export interface SendWidgetMessageInput {
  organizationId: string
  chatWidgetId: string
  /**
   * Session token — optional for the FIRST message.
   * When omitted, a new Lead + LeadSession is created inline so that
   * leads are only stored when the visitor actually engages.
   */
  token?: string
  body: string
}

export interface ChatWidgetMessage {
  id: string
  direction: MessageDirection
  body: string
  sentAt: Date
}

export interface SendWidgetMessageResult {
  success: boolean
  message?: ChatWidgetMessage
  /**
   * Returned only on the FIRST message when the session was created inline.
   * The client uses this to activate the session (store token, enable queries).
   */
  session?: ChatWidgetSession
  error?: string
}

export interface IdentifyUserInput {
  organizationId: string
  chatWidgetId: string
  token: string
  email: string
  firstName?: string
  lastName?: string
  phone?: string
}

export interface IdentifyUserResult {
  success: boolean
  token?: string
  leadId?: string
  isNewLead?: boolean
  error?: string
}

export interface GetMessagesResult {
  success: boolean
  messages?: ChatWidgetMessage[]
  error?: string
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Verify chat widget exists and belongs to organization
 */
async function verifyChatWidget(
  organizationId: string,
  chatWidgetId: string
): Promise<boolean> {
  const widget = await prisma.chatWidget.findFirst({
    where: {
      id: chatWidgetId,
      organizationId,
    },
  })
  return !!widget
}

/**
 * Check if a lead is anonymous (has no real email)
 *
 * WHY: Anonymous leads have empty/null email - we never create fake emails
 *      Fake emails would violate email marketing deliverability if accidentally used
 *
 * HOW: Check for empty string, null, or whitespace-only email
 */
function isAnonymousLead(email: string | null | undefined): boolean {
  return !email || email.trim() === ''
}

/**
 * Check if email is an anonymous placeholder (legacy support for old data)
 *
 * NOTE: This also handles legacy data that may have fake @chat.anonymous emails
 */
function isAnonymousEmail(email: string | null | undefined): boolean {
  // Primary check: empty or null email means anonymous
  if (!email || email.trim() === '') {
    return true
  }
  // Legacy fallback: old anonymous emails ended with @chat.anonymous
  return email.endsWith('@chat.anonymous')
}

/**
 * Convert Message to ChatWidgetMessage format
 */
function messageToWidgetMessage(msg: Message): ChatWidgetMessage {
  return {
    id: msg.id,
    direction: msg.direction,
    body: msg.body,
    sentAt: msg.sentAt,
  }
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Initialize a chat widget session
 *
 * EXISTING TOKEN: Validates signature → restores session with lead info.
 * NO TOKEN (new visitor): Just validates the widget exists — returns
 * session: null. No Lead or LeadSession is created yet; that happens
 * lazily in sendMessage() when the visitor actually engages.
 */
export async function initSession(
  input: InitSessionInput
): Promise<InitSessionResult> {
  try {
    // Verify chat widget exists
    const widgetValid = await verifyChatWidget(input.organizationId, input.chatWidgetId)
    if (!widgetValid) {
      return { success: false, error: 'Chat widget not found' }
    }

    // If we have an existing token, try to validate it
    if (input.existingToken) {
      const signatureValid = validateTokenSignature(
        input.existingToken,
        input.organizationId
      )

      if (signatureValid) {
        const tokenHashValue = hashToken(input.existingToken)
        const leadSession = await prisma.leadSession.findUnique({
          where: { tokenHash: tokenHashValue },
          include: {
            lead: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        })

        if (leadSession && leadSession.organizationId === input.organizationId) {
          // Valid existing session
          return {
            success: true,
            session: {
              token: input.existingToken,
              isIdentified: !isAnonymousEmail(leadSession.lead.email),
              leadId: leadSession.leadId,
              lead: leadSession.lead,
            },
          }
        }
      }
      // Token invalid - fall through to create new session
    }

    /**
     * NEW VISITOR — no DB writes, just confirm the widget is valid.
     *
     * WHY: Creating a Lead on every widget load wastes DB storage and clutters
     *      the inbox with "Unknown" entries from visitors who never engage.
     *      The Lead + LeadSession are created later in sendMessage() when
     *      the visitor actually sends their first message.
     *
     * HOW: Return session: null to signal "widget valid, awaiting first message".
     *      The client stores no token and enables the first-message flow.
     */
    return {
      success: true,
      session: null,
    }
  } catch (error) {
    return { success: false, error: 'Failed to initialize session' }
  }
}

/**
 * Send a message through the chat widget
 *
 * Handles TWO flows:
 * 1. EXISTING SESSION (has token) — validate token, send message normally
 * 2. FIRST MESSAGE (no token) — create Lead + LeadSession inline, then send
 *
 * WHY the first-message flow exists:
 * Leads should only be created when the visitor actually engages (sends a message).
 * initSession() no longer creates a Lead — it just validates the widget.
 * This prevents phantom "Unknown" leads in the inbox from visitors who never chat.
 */
export async function sendMessage(
  input: SendWidgetMessageInput
): Promise<SendWidgetMessageResult> {
  try {
    // Verify chat widget exists
    const widgetValid = await verifyChatWidget(input.organizationId, input.chatWidgetId)
    if (!widgetValid) {
      return { success: false, error: 'Chat widget not found' }
    }

    /**
     * Resolve the lead for this message.
     * - If token is provided → validate existing session
     * - If no token → create a new Lead + LeadSession (first message flow)
     */
    let leadId: string
    let leadFirstName: string | null
    let leadEmail: string
    let newSession: ChatWidgetSession | undefined

    if (input.token) {
      // ---------------------------------------------------------------
      // EXISTING SESSION: validate token and resolve lead
      // ---------------------------------------------------------------
      const signatureValid = validateTokenSignature(input.token, input.organizationId)
      if (!signatureValid) {
        return { success: false, error: 'Invalid token' }
      }

      const tokenHashValue = hashToken(input.token)
      const leadSession = await prisma.leadSession.findUnique({
        where: { tokenHash: tokenHashValue },
        include: {
          lead: { select: { id: true, firstName: true, email: true } },
        },
      })

      if (!leadSession || leadSession.organizationId !== input.organizationId) {
        return { success: false, error: 'Invalid session' }
      }

      leadId = leadSession.leadId
      leadFirstName = leadSession.lead.firstName
      leadEmail = leadSession.lead.email
    } else {
      // ---------------------------------------------------------------
      // FIRST MESSAGE: create Lead + LeadSession now that visitor engaged
      // ---------------------------------------------------------------
      const lead = await prisma.lead.create({
        data: {
          organizationId: input.organizationId,
          email: '',
          firstName: 'Unknown',
          source: 'chatbot',
        },
      })

      const { token, tokenHash, tokenSuffix } = createLeadSessionToken({
        organizationId: input.organizationId,
        leadId: lead.id,
      })

      await prisma.leadSession.create({
        data: {
          organizationId: input.organizationId,
          leadId: lead.id,
          tokenHash,
          tokenSuffix,
          source: 'chatbot',
        },
      })

      leadId = lead.id
      leadFirstName = 'Unknown'
      leadEmail = ''

      /* Build the session object to return to the client so it can
         store the token and enable future requests. */
      newSession = {
        token,
        isIdentified: false,
        leadId: lead.id,
        lead: {
          id: lead.id,
          firstName: 'Unknown',
          lastName: null,
          email: '',
        },
      }
    }

    // Get or create conversation
    const conversation = await getOrCreateConversation({
      organizationId: input.organizationId,
      leadId,
      subject: 'Chat Widget',
      primaryChannel: 'CHATBOT',
    })

    /**
     * Record as inbound message (from visitor)
     *
     * NOTE: For anonymous visitors, fromName defaults to "Unknown" and
     *       fromEmail may be empty. This is intentional — we never fake emails.
     */
    const result = await recordInboundMessage({
      organizationId: input.organizationId,
      leadId,
      channel: 'CHATBOT',
      body: input.body,
      fromName: leadFirstName || 'Unknown',
      fromEmail: leadEmail || '',
    })

    /**
     * Emit realtime event for inbox subscribers
     * WHY: Team members with inbox open will see new messages INSTANTLY
     * HOW: True pub/sub via @upstash/realtime — no polling!
     */
    await realtime.emit('inbox.chatReceived', {
      organizationId: input.organizationId,
      conversationId: conversation.id,
      messageId: result.message.id,
      leadId,
      lead: {
        id: leadId,
        firstName: leadFirstName,
        lastName: null,
        email: leadEmail,
        avatarUrl: null,
      },
      preview: input.body.slice(0, 100),
    })

    /**
     * Notify all org members about the new chatbot message.
     * WHY: Team members need real-time awareness when visitors start chatting.
     * HOW: Uses the existing notification service for DB insert + realtime + web push.
     * Category 'inbox' maps to the Inbox icon in the notification dropdown.
     * Fire-and-forget — notification failure should never block chat flow.
     */
    notifyAllMembers({
      organizationId: input.organizationId,
      title: `New chat from ${leadFirstName || 'Visitor'}`,
      body: input.body.slice(0, 100) + (input.body.length > 100 ? '...' : ''),
      category: 'inbox',
      actionUrl: `/inbox?conversationId=${conversation.id}`,
    }).catch(() => {
      // Fire-and-forget — notification failure should never block chat message flow
    })

    return {
      success: true,
      message: messageToWidgetMessage(result.message),
      session: newSession,
    }
  } catch (error) {
    return { success: false, error: 'Failed to send message' }
  }
}

/**
 * Identify a user (update anonymous lead with real info)
 *
 * If a lead with that email already exists:
 *   - Transfer all messages to existing lead's conversation
 *   - Delete the anonymous lead
 *   - Return new token for existing lead
 *   - Emit realtime event so inbox updates instantly
 *
 * If no existing lead:
 *   - Just update the anonymous lead's info
 *   - Emit realtime event so inbox shows updated lead name
 *
 * WHY TRANSACTION: Merge involves multiple DB operations that must succeed together.
 *                  If any fails, we roll back to avoid orphaned data.
 */
export async function identifyUser(
  input: IdentifyUserInput
): Promise<IdentifyUserResult> {
  try {
    // Verify chat widget exists
    const widgetValid = await verifyChatWidget(input.organizationId, input.chatWidgetId)
    if (!widgetValid) {
      return { success: false, error: 'Chat widget not found' }
    }

    // Validate token and get current lead
    const signatureValid = validateTokenSignature(input.token, input.organizationId)
    if (!signatureValid) {
      return { success: false, error: 'Invalid token' }
    }

    const tokenHashValue = hashToken(input.token)
    const currentSession = await prisma.leadSession.findUnique({
      where: { tokenHash: tokenHashValue },
      include: { lead: true },
    })

    if (!currentSession || currentSession.organizationId !== input.organizationId) {
      return { success: false, error: 'Invalid session' }
    }

    const currentLead = currentSession.lead

    // If already identified with real email, nothing to do
    if (!isAnonymousEmail(currentLead.email)) {
      return {
        success: true,
        token: input.token,
        leadId: currentLead.id,
        isNewLead: false,
      }
    }

    /**
     * Check if a lead with this email already exists in the organization
     *
     * IMPORTANT FILTERS:
     * - deletedAt: null → Exclude soft-deleted leads
     * - email comparison → Case-insensitive via mode: 'insensitive'
     * - NOT the current anonymous lead → Exclude self-match
     */
    const normalizedEmail = input.email.trim().toLowerCase()

    /**
     * Main query: Find existing lead with same email
     */
    const existingLead = await prisma.lead.findFirst({
      where: {
        organizationId: input.organizationId,
        email: {
          equals: normalizedEmail,
          mode: 'insensitive', // Case-insensitive comparison
        },
        deletedAt: null, // Exclude soft-deleted leads
        id: {
          not: currentLead.id, // Exclude the current anonymous lead
        },
      },
    })

    if (existingLead) {
      /**
       * MERGE FLOW: Transfer messages from anonymous lead to existing lead
       *
       * WHY: Guest identified themselves with an email that already exists in DB.
       *      We merge conversations so the existing lead has all chat history.
       *
       * CRITICAL: This is wrapped in a transaction to ensure atomicity.
       *           All operations succeed together or none do.
       */

      // Store IDs for realtime event (needed outside transaction scope)
      let oldConversationId: string | null = null
      let newConversationId: string | null = null
      let newToken: string = ''

      // Get anonymous lead's conversation (before transaction for the ID)
      const anonConversation = await prisma.conversation.findFirst({
        where: {
          organizationId: input.organizationId,
          leadId: currentLead.id,
          primaryChannel: 'CHATBOT',
        },
      })

      oldConversationId = anonConversation?.id || null

      // Run merge in transaction for atomicity
      await prisma.$transaction(async (tx) => {
        if (anonConversation) {
          /**
           * Find the existing lead's SINGLE conversation
           *
           * ARCHITECTURE: ONE conversation per lead, period.
           * The conversation contains ALL messages (email, SMS, chat, etc.)
           * The `primaryChannel` field is just informational about the first contact.
           *
           * WHY: Single source of truth - all communication with a lead
           *      should be in ONE place, not scattered across channels.
           */
          let existingConversation = await tx.conversation.findFirst({
            where: {
              organizationId: input.organizationId,
              leadId: existingLead.id,
              isArchived: false,
              deletedAt: null,
            },
            orderBy: { lastMessageAt: 'desc' },
          })

          if (!existingConversation) {
            // Lead has no conversation yet - create one
            existingConversation = await tx.conversation.create({
              data: {
                organizationId: input.organizationId,
                leadId: existingLead.id,
                subject: 'Conversation',
                primaryChannel: 'CHATBOT', // First contact was via chatbot
                hasUnread: true,
              },
            })
          }

          newConversationId = existingConversation.id

          // Transfer all messages from anonymous to existing conversation
          await tx.message.updateMany({
            where: { conversationId: anonConversation.id },
            data: { conversationId: existingConversation.id },
          })

          // Update existing conversation metadata with latest message info
          const lastMessage = await tx.message.findFirst({
            where: { conversationId: existingConversation.id },
            orderBy: { sentAt: 'desc' },
          })

          if (lastMessage) {
            await tx.conversation.update({
              where: { id: existingConversation.id },
              data: {
                lastMessageAt: lastMessage.sentAt,
                lastMessagePreview: lastMessage.body.slice(0, 100),
                hasUnread: true,
              },
            })
          }

          // Delete the anonymous conversation (messages already moved)
          await tx.conversation.delete({
            where: { id: anonConversation.id },
          })
        }

        // Delete anonymous lead's session
        await tx.leadSession.delete({
          where: { id: currentSession.id },
        })

        // Delete anonymous lead (cascade should handle remaining relations)
        await tx.lead.delete({
          where: { id: currentLead.id },
        })

        // Create new session for existing lead
        const tokenData = createLeadSessionToken({
          organizationId: input.organizationId,
          leadId: existingLead.id,
        })
        newToken = tokenData.token

        await tx.leadSession.create({
          data: {
            organizationId: input.organizationId,
            leadId: existingLead.id,
            tokenHash: tokenData.tokenHash,
            tokenSuffix: tokenData.tokenSuffix,
            source: 'chatbot',
          },
        })

        // Update existing lead with any new info provided
        await tx.lead.update({
          where: { id: existingLead.id },
          data: {
            firstName: input.firstName || existingLead.firstName,
            lastName: input.lastName || existingLead.lastName,
            phone: input.phone || existingLead.phone,
          },
        })
      })

      /**
       * Emit realtime event for inbox to update INSTANTLY
       *
       * WHY: The inbox UI needs to know:
       *   1. The anonymous guest conversation was deleted
       *   2. Messages were merged into the existing lead's conversation
       *   3. UI should refresh to reflect this change
       *
       * EVENT: inbox.sessionMerged contains both old (deleted) and new (target) IDs
       */
      await realtime.emit('inbox.sessionMerged', {
        organizationId: input.organizationId,
        /** The anonymous conversation that was deleted */
        deletedConversationId: oldConversationId,
        /** The anonymous lead that was deleted */
        deletedLeadId: currentLead.id,
        /** The existing lead that received the messages */
        targetLeadId: existingLead.id,
        /** The conversation that received the merged messages */
        targetConversationId: newConversationId,
        /** Lead info for UI update */
        targetLead: {
          id: existingLead.id,
          firstName: input.firstName || existingLead.firstName,
          lastName: input.lastName || existingLead.lastName,
          email: existingLead.email,
          avatarUrl: existingLead.avatarUrl,
        },
      })

      return {
        success: true,
        token: newToken,
        leadId: existingLead.id,
        isNewLead: false,
      }
    } else {
      /**
       * NO EXISTING LEAD: Just update the anonymous lead's info
       *
       * WHY: This email doesn't exist in the system, so we're converting
       *      the anonymous lead into a real lead (same record, updated email).
       *
       * NOTE: We use the normalized (lowercase, trimmed) email for consistency
       */
      const updatedLead = await prisma.lead.update({
        where: { id: currentLead.id },
        data: {
          email: normalizedEmail, // Use normalized email
          firstName: input.firstName || null,
          lastName: input.lastName || null,
          phone: input.phone || null,
        },
      })

      // Get the conversation to include in event
      const conversation = await prisma.conversation.findFirst({
        where: {
          organizationId: input.organizationId,
          leadId: currentLead.id,
          primaryChannel: 'CHATBOT',
        },
      })

      /**
       * Emit realtime event for inbox to update the lead info display
       *
       * WHY: The inbox sidebar shows lead name/email. When anonymous user provides info,
       *      we need the UI to update from "Unknown" to actual name.
       */
      await realtime.emit('inbox.leadIdentified', {
        organizationId: input.organizationId,
        conversationId: conversation?.id || null,
        leadId: updatedLead.id,
        lead: {
          id: updatedLead.id,
          firstName: updatedLead.firstName,
          lastName: updatedLead.lastName,
          email: updatedLead.email,
          avatarUrl: updatedLead.avatarUrl,
        },
      })

      return {
        success: true,
        token: input.token,
        leadId: currentLead.id,
        isNewLead: true,
      }
    }
  } catch (error) {
    return { success: false, error: 'Failed to identify user' }
  }
}

/**
 * Get messages for a chat widget session
 *
 * SECURITY CRITICAL:
 * This function ONLY returns CHATBOT channel messages.
 * Email, SMS, and other channel messages are NEVER exposed to the chat widget.
 * This is enforced SERVER-SIDE - we query directly with channel filter.
 *
 * WHY: The chat widget is public-facing. Users should only see their
 *      own chat messages, never internal team emails or other channels.
 *
 * SOURCE OF TRUTH KEYWORDS: ChatWidgetGetMessages, SecureChatMessages
 */
export async function getMessages(
  organizationId: string,
  chatWidgetId: string,
  token: string
): Promise<GetMessagesResult> {
  try {
    // Verify chat widget exists
    const widgetValid = await verifyChatWidget(organizationId, chatWidgetId)
    if (!widgetValid) {
      return { success: false, error: 'Chat widget not found' }
    }

    // Validate token
    const signatureValid = validateTokenSignature(token, organizationId)
    if (!signatureValid) {
      return { success: false, error: 'Invalid token' }
    }

    const tokenHashValue = hashToken(token)
    const leadSession = await prisma.leadSession.findUnique({
      where: { tokenHash: tokenHashValue },
    })

    if (!leadSession || leadSession.organizationId !== organizationId) {
      return { success: false, error: 'Invalid session' }
    }

    /**
     * Find THE conversation for this lead (ONE conversation per lead architecture)
     * Don't filter by primaryChannel - there's only one conversation.
     */
    const conversation = await prisma.conversation.findFirst({
      where: {
        organizationId,
        leadId: leadSession.leadId,
        deletedAt: null,
      },
      orderBy: { lastMessageAt: 'desc' },
    })

    if (!conversation) {
      return { success: true, messages: [] }
    }

    /**
     * SECURITY: Query messages directly with CHATBOT channel filter
     *
     * CRITICAL: Do NOT use getConversationMessages here - it returns ALL messages.
     * We MUST filter by channel: 'CHATBOT' to prevent email/SMS leakage.
     */
    const messages = await prisma.message.findMany({
      where: {
        conversationId: conversation.id,
        channel: 'CHATBOT', // SECURITY: Only return chat messages, NEVER emails
        deletedAt: null,
      },
      orderBy: { sentAt: 'asc' },
      take: 100,
    })

    return {
      success: true,
      messages: messages.map(messageToWidgetMessage),
    }
  } catch (error) {
    return { success: false, error: 'Failed to get messages' }
  }
}

/**
 * Get chat widget configuration for public display
 */
export async function getPublicWidgetConfig(
  organizationId: string,
  chatWidgetId: string
) {
  const widget = await prisma.chatWidget.findFirst({
    where: {
      id: chatWidgetId,
      organizationId,
    },
    select: {
      id: true,
      name: true,
      description: true,
      config: true,
      organization: {
        select: {
          id: true,
          name: true,
          logo: true,
        },
      },
      faqItems: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          question: true,
          answer: true,
        },
      },
      updates: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          title: true,
          content: true,
          featuredImage: true,
          featuredImageFileId: true,
          createdAt: true,
        },
      },
    },
  })

  return widget
}

// ============================================================================
// BI-DIRECTIONAL MESSAGE PAGINATION - WhatsApp/Messenger Style
// ============================================================================

/**
 * Result type for paginated chat widget messages
 *
 * WHY: Same structure as inbox pagination for consistency
 * HOW: Matches GetMessagesAroundResult from inbox.service.ts
 *
 * SOURCE OF TRUTH KEYWORDS: ChatWidgetPaginatedMessages, ChatWidgetPagination
 */
export interface ChatWidgetPaginatedMessagesResult {
  success: boolean
  messages: ChatWidgetMessage[]
  /** Cursor for loading older messages (ID of oldest message returned) */
  previousCursor: string | null
  /** Cursor for loading newer messages (ID of newest message returned) */
  nextCursor: string | null
  /** Whether there are more older messages */
  hasPrevious: boolean
  /** Whether there are more newer messages */
  hasNext: boolean
  /** The message ID to focus/scroll to */
  focusMessageId: string | null
  /** Total message count in conversation */
  totalCount: number
  error?: string
}

/**
 * Get paginated messages for chat widget (bi-directional)
 *
 * WHY: WhatsApp/Messenger-style UX - load messages around a target or latest
 * HOW: Uses cursor-based pagination with direction encoding
 *
 * CURSOR FORMAT:
 * - undefined/null: Initial load (uses targetMessageId if provided, else latest)
 * - 'before:msgId': Load older messages before msgId
 * - 'after:msgId': Load newer messages after msgId
 *
 * SECURITY CRITICAL:
 * This function ONLY returns CHATBOT channel messages.
 * Email, SMS, and other channel messages are NEVER exposed to the chat widget.
 *
 * SOURCE OF TRUTH KEYWORDS: ChatWidgetGetMessagesPaginated, ChatWidgetBiDirectional
 */
export async function getMessagesPaginated(
  organizationId: string,
  chatWidgetId: string,
  token: string,
  options: {
    cursor?: string
    targetMessageId?: string
    limit?: number
  } = {}
): Promise<ChatWidgetPaginatedMessagesResult> {
  const { cursor, targetMessageId, limit = 20 } = options

  try {
    // Verify chat widget exists
    const widgetValid = await verifyChatWidget(organizationId, chatWidgetId)
    if (!widgetValid) {
      return {
        success: false,
        messages: [],
        previousCursor: null,
        nextCursor: null,
        hasPrevious: false,
        hasNext: false,
        focusMessageId: null,
        totalCount: 0,
        error: 'Chat widget not found',
      }
    }

    // Validate token
    const signatureValid = validateTokenSignature(token, organizationId)
    if (!signatureValid) {
      return {
        success: false,
        messages: [],
        previousCursor: null,
        nextCursor: null,
        hasPrevious: false,
        hasNext: false,
        focusMessageId: null,
        totalCount: 0,
        error: 'Invalid token',
      }
    }

    const tokenHashValue = hashToken(token)
    const leadSession = await prisma.leadSession.findUnique({
      where: { tokenHash: tokenHashValue },
    })

    if (!leadSession || leadSession.organizationId !== organizationId) {
      return {
        success: false,
        messages: [],
        previousCursor: null,
        nextCursor: null,
        hasPrevious: false,
        hasNext: false,
        focusMessageId: null,
        totalCount: 0,
        error: 'Invalid session',
      }
    }

    // Find THE conversation for this lead
    const conversation = await prisma.conversation.findFirst({
      where: {
        organizationId,
        leadId: leadSession.leadId,
        deletedAt: null,
      },
      orderBy: { lastMessageAt: 'desc' },
    })

    if (!conversation) {
      return {
        success: true,
        messages: [],
        previousCursor: null,
        nextCursor: null,
        hasPrevious: false,
        hasNext: false,
        focusMessageId: null,
        totalCount: 0,
      }
    }

    // Parse cursor to extract direction and message ID
    let direction: 'initial' | 'before' | 'after' = 'initial'
    let cursorMessageId: string | undefined

    if (cursor) {
      const [dir, ...idParts] = cursor.split(':')
      if (dir === 'before' || dir === 'after') {
        direction = dir
        cursorMessageId = idParts.join(':') // Handle IDs with colons
      }
    }

    // Base where clause - SECURITY: Only CHATBOT channel messages
    const baseWhere = {
      conversationId: conversation.id,
      channel: 'CHATBOT' as const,
      deletedAt: null,
    }

    // Get total count for CHATBOT messages only
    const totalCount = await prisma.message.count({ where: baseWhere })

    // Handle "before" direction (loading older messages)
    if (direction === 'before' && cursorMessageId) {
      const cursorMessage = await prisma.message.findFirst({
        where: { id: cursorMessageId, ...baseWhere },
      })

      if (!cursorMessage) {
        return {
          success: true,
          messages: [],
          previousCursor: null,
          nextCursor: null,
          hasPrevious: false,
          hasNext: false,
          focusMessageId: null,
          totalCount,
        }
      }

      // Fetch messages BEFORE the cursor (older)
      const messages = await prisma.message.findMany({
        where: {
          ...baseWhere,
          sentAt: { lt: cursorMessage.sentAt },
        },
        orderBy: { sentAt: 'desc' },
        take: limit + 1,
      })

      const hasPrevious = messages.length > limit
      if (hasPrevious) messages.pop()

      // Reverse to chronological order
      messages.reverse()

      const previousCursor = messages.length > 0 ? messages[0].id : null

      return {
        success: true,
        messages: messages.map(messageToWidgetMessage),
        previousCursor,
        nextCursor: null,
        hasPrevious,
        hasNext: false,
        focusMessageId: null,
        totalCount,
      }
    }

    // Handle "after" direction (loading newer messages)
    if (direction === 'after' && cursorMessageId) {
      const cursorMessage = await prisma.message.findFirst({
        where: { id: cursorMessageId, ...baseWhere },
      })

      if (!cursorMessage) {
        return {
          success: true,
          messages: [],
          previousCursor: null,
          nextCursor: null,
          hasPrevious: false,
          hasNext: false,
          focusMessageId: null,
          totalCount,
        }
      }

      // Fetch messages AFTER the cursor (newer)
      const messages = await prisma.message.findMany({
        where: {
          ...baseWhere,
          sentAt: { gt: cursorMessage.sentAt },
        },
        orderBy: { sentAt: 'asc' },
        take: limit + 1,
      })

      const hasNext = messages.length > limit
      if (hasNext) messages.pop()

      const nextCursor = messages.length > 0 ? messages[messages.length - 1].id : null

      return {
        success: true,
        messages: messages.map(messageToWidgetMessage),
        previousCursor: null,
        nextCursor,
        hasPrevious: false,
        hasNext,
        focusMessageId: null,
        totalCount,
      }
    }

    // Initial load - either around target or latest
    if (targetMessageId) {
      // Load messages around target
      const targetMessage = await prisma.message.findFirst({
        where: { id: targetMessageId, ...baseWhere },
      })

      if (!targetMessage) {
        // Target not found, fall back to latest
        return getMessagesPaginated(organizationId, chatWidgetId, token, { limit })
      }

      // Fetch messages BEFORE the target
      const messagesBefore = await prisma.message.findMany({
        where: {
          ...baseWhere,
          sentAt: { lt: targetMessage.sentAt },
        },
        orderBy: { sentAt: 'desc' },
        take: limit + 1,
      })

      // Fetch messages AFTER the target
      const messagesAfter = await prisma.message.findMany({
        where: {
          ...baseWhere,
          sentAt: { gt: targetMessage.sentAt },
        },
        orderBy: { sentAt: 'asc' },
        take: limit + 1,
      })

      const hasPrevious = messagesBefore.length > limit
      const hasNext = messagesAfter.length > limit

      if (hasPrevious) messagesBefore.pop()
      if (hasNext) messagesAfter.pop()

      // Combine: older (reversed) + target + newer
      const allMessages = [
        ...messagesBefore.reverse(),
        targetMessage,
        ...messagesAfter,
      ]

      const previousCursor = allMessages.length > 0 ? allMessages[0].id : null
      const nextCursor = allMessages.length > 0 ? allMessages[allMessages.length - 1].id : null

      return {
        success: true,
        messages: allMessages.map(messageToWidgetMessage),
        previousCursor,
        nextCursor,
        hasPrevious,
        hasNext,
        focusMessageId: targetMessageId,
        totalCount,
      }
    }

    // Load latest messages (default - no target)
    const messages = await prisma.message.findMany({
      where: baseWhere,
      orderBy: { sentAt: 'desc' },
      take: limit * 2 + 1,
    })

    // Reverse to chronological order
    messages.reverse()

    const hasPrevious = messages.length > limit * 2
    if (hasPrevious) {
      messages.shift()
    }

    const previousCursor = messages.length > 0 ? messages[0].id : null
    const focusMessageId = messages.length > 0 ? messages[messages.length - 1].id : null

    return {
      success: true,
      messages: messages.map(messageToWidgetMessage),
      previousCursor,
      nextCursor: null, // At bottom
      hasPrevious,
      hasNext: false, // At bottom
      focusMessageId,
      totalCount,
    }
  } catch (error) {
    return {
      success: false,
      messages: [],
      previousCursor: null,
      nextCursor: null,
      hasPrevious: false,
      hasNext: false,
      focusMessageId: null,
      totalCount: 0,
      error: 'Failed to get messages',
    }
  }
}

// ============================================================================
// TYPING INDICATOR
// ============================================================================

export interface EmitTypingInput {
  organizationId: string
  chatWidgetId: string
  token: string
  isTyping: boolean
}

export interface EmitTypingResult {
  success: boolean
  error?: string
}

/**
 * Emit visitor typing event
 *
 * WHY: Real-time typing feedback in chat conversations
 * HOW: Validates session, finds conversation, emits lightweight event
 *
 * PERFORMANCE: This is called frequently - keep it lightweight
 * - No heavy DB queries
 * - Just validate session and emit event
 *
 * SOURCE OF TRUTH KEYWORDS: VisitorTyping, ChatTypingEmit
 */
export async function emitVisitorTyping(
  input: EmitTypingInput
): Promise<EmitTypingResult> {
  try {
    // Validate token
    const signatureValid = validateTokenSignature(input.token, input.organizationId)
    if (!signatureValid) {
      return { success: false, error: 'Invalid token' }
    }

    const tokenHashValue = hashToken(input.token)
    const leadSession = await prisma.leadSession.findUnique({
      where: { tokenHash: tokenHashValue },
      select: { leadId: true, organizationId: true },
    })

    if (!leadSession || leadSession.organizationId !== input.organizationId) {
      return { success: false, error: 'Invalid session' }
    }

    // Find conversation ID (lightweight query)
    const conversation = await prisma.conversation.findFirst({
      where: {
        organizationId: input.organizationId,
        leadId: leadSession.leadId,
        deletedAt: null,
      },
      select: { id: true },
    })

    if (!conversation) {
      // No conversation yet - that's OK, just don't emit
      return { success: true }
    }

    // Emit typing event
    await realtime.emit('chat.visitorTyping', {
      organizationId: input.organizationId,
      conversationId: conversation.id,
      leadId: leadSession.leadId,
      isTyping: input.isTyping,
    })

    return { success: true }
  } catch (error) {
    return { success: false, error: 'Failed to emit typing' }
  }
}
