/**
 * Inbox Service - Conversation and Message Management (DAL)
 *
 * WHY: Provides data access layer for inbox conversations and messages
 * HOW: CRUD operations for conversations, messages, and email sending via Resend
 *
 * SOURCE OF TRUTH KEYWORDS: InboxService, ConversationService, MessageService
 */

import 'server-only'
import { prisma } from '@/lib/config/prisma'
import { resend } from '@/lib/config/resend'
import { realtime } from '@/lib/realtime'
import { chargeForEmail } from './wallet.service'
import {
  Prisma,
  MessageChannel,
  Conversation,
  Message,
  Lead,
} from '@/generated/prisma'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Input for creating a new conversation
 */
export interface CreateConversationInput {
  organizationId: string
  leadId: string
  subject?: string
  primaryChannel?: MessageChannel
}

/**
 * Input for sending a message (creates message + sends email if applicable)
 */
export interface SendMessageInput {
  organizationId: string
  conversationId: string
  channel: MessageChannel
  body: string
  subject?: string
  fromName?: string
  fromEmail?: string
}

/**
 * Input for listing conversations with pagination and filters
 *
 * FILTERS:
 * - filter: Status filter (all, unread, starred, archived)
 * - search: Text search on subject and lead name/email
 * - leadId: Filter to show only conversations with a specific lead
 */
export interface ListConversationsInput {
  organizationId: string
  filter?: 'all' | 'unread' | 'starred' | 'archived'
  search?: string
  /** Filter to get conversations for a specific lead (used in lead sheet communications tab) */
  leadId?: string
  cursor?: string
  limit?: number
}

/**
 * Conversation with lead details for inbox display
 * SOURCE OF TRUTH: Return type for inbox queries
 */
export type ConversationWithLead = Conversation & {
  lead: Pick<Lead, 'id' | 'firstName' | 'lastName' | 'email' | 'avatarUrl'>
  messages?: Message[]
  _count?: { messages: number }
}

/**
 * Message with conversation context
 */
export type MessageWithContext = Message & {
  conversation: {
    id: string
    subject: string | null
    lead: Pick<Lead, 'id' | 'firstName' | 'lastName' | 'email' | 'avatarUrl'>
  }
}

// ============================================================================
// CONVERSATION OPERATIONS
// ============================================================================

/**
 * Create a new conversation with a lead
 *
 * WHY: Initiates a new communication thread
 * HOW: Creates conversation record linked to organization and lead
 */
export async function createConversation(
  input: CreateConversationInput
): Promise<Conversation> {
  const { organizationId, leadId, subject, primaryChannel = 'EMAIL' } = input

  return prisma.conversation.create({
    data: {
      organizationId,
      leadId,
      subject,
      primaryChannel,
      hasUnread: false, // New conversation created by us, so nothing unread
    },
  })
}

/**
 * Get or create a conversation with a lead
 *
 * ARCHITECTURE: ONE conversation per lead, always.
 * A conversation is a SINGLE source of truth containing ALL messages
 * with a lead across ALL channels (email, SMS, chat, etc.).
 *
 * The `primaryChannel` parameter is only used when CREATING a new conversation
 * to indicate the initial contact method. It does NOT filter when finding
 * existing conversations - we always return THE ONE conversation for the lead.
 *
 * WHY: Single source of truth - all communication history with a lead
 *      should be in ONE place, not scattered across channel-specific threads.
 *
 * SOURCE OF TRUTH KEYWORDS: GetOrCreateConversation, OneConversationPerLead
 */
export async function getOrCreateConversation(
  input: CreateConversationInput
): Promise<Conversation> {
  const { organizationId, leadId, subject, primaryChannel = 'EMAIL' } = input

  /**
   * Find THE conversation for this lead (not filtered by channel)
   * There should only ever be ONE active conversation per lead.
   */
  const existing = await prisma.conversation.findFirst({
    where: {
      organizationId,
      leadId,
      isArchived: false,
      deletedAt: null,
    },
    orderBy: { lastMessageAt: 'desc' },
  })

  if (existing) {
    return existing
  }

  // No conversation exists - create the lead's first (and only) conversation
  return createConversation({ organizationId, leadId, subject, primaryChannel })
}

/**
 * List conversations for an organization
 *
 * WHY: Powers the inbox sidebar display
 * HOW: Fetches conversations with pagination, filtering, and lead details
 */
export async function listConversations(
  input: ListConversationsInput
): Promise<{ conversations: ConversationWithLead[]; nextCursor?: string }> {
  const { organizationId, filter = 'all', search, leadId, cursor, limit = 50 } = input

  // Build where clause based on filters
  const where: Prisma.ConversationWhereInput = {
    organizationId,
    deletedAt: null,
  }

  // Filter by specific lead (used in lead sheet communications tab)
  if (leadId) {
    where.leadId = leadId
  }

  // Apply filter
  switch (filter) {
    case 'unread':
      where.hasUnread = true
      where.isArchived = false
      break
    case 'starred':
      where.isStarred = true
      where.isArchived = false
      break
    case 'archived':
      where.isArchived = true
      break
    case 'all':
    default:
      where.isArchived = false
      break
  }

  // Apply search (searches lead name/email and conversation subject)
  if (search) {
    where.OR = [
      { subject: { contains: search, mode: 'insensitive' } },
      { lead: { firstName: { contains: search, mode: 'insensitive' } } },
      { lead: { lastName: { contains: search, mode: 'insensitive' } } },
      { lead: { email: { contains: search, mode: 'insensitive' } } },
    ]
  }

  const conversations = await prisma.conversation.findMany({
    where,
    include: {
      lead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatarUrl: true,
        },
      },
      _count: {
        select: { messages: true },
      },
    },
    orderBy: { lastMessageAt: 'desc' },
    take: limit + 1, // Fetch one extra for cursor
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  })

  // Check if there are more results
  let nextCursor: string | undefined
  if (conversations.length > limit) {
    const nextItem = conversations.pop()
    nextCursor = nextItem?.id
  }

  return { conversations, nextCursor }
}

/**
 * Get a single conversation with all messages
 *
 * WHY: Powers the conversation view panel
 * HOW: Fetches conversation with lead details and all messages ordered by time
 */
export async function getConversationById(
  organizationId: string,
  conversationId: string
): Promise<ConversationWithLead | null> {
  return prisma.conversation.findFirst({
    where: {
      id: conversationId,
      organizationId,
      deletedAt: null,
    },
    include: {
      lead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatarUrl: true,
        },
      },
      messages: {
        where: { deletedAt: null },
        orderBy: { sentAt: 'asc' },
      },
    },
  })
}

/**
 * Mark a conversation as read
 *
 * WHY: Updates read status when user views conversation
 * HOW: Sets hasUnread to false and updates lastReadAt
 */
export async function markConversationAsRead(
  organizationId: string,
  conversationId: string
): Promise<Conversation> {
  // Also mark all messages as read
  await prisma.message.updateMany({
    where: {
      conversationId,
      organizationId,
      isRead: false,
    },
    data: { isRead: true },
  })

  return prisma.conversation.update({
    where: { id: conversationId },
    data: {
      hasUnread: false,
      lastReadAt: new Date(),
    },
  })
}

/**
 * Toggle starred status of a conversation
 *
 * WHY: Allows users to mark important conversations
 */
export async function toggleConversationStar(
  organizationId: string,
  conversationId: string
): Promise<Conversation> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId },
  })

  if (!conversation) {
    throw new Error('Conversation not found')
  }

  return prisma.conversation.update({
    where: { id: conversationId },
    data: { isStarred: !conversation.isStarred },
  })
}

/**
 * Archive a conversation
 *
 * WHY: Allows users to declutter inbox without deleting
 * HOW: Validates ownership via organizationId before archiving
 */
export async function archiveConversation(
  organizationId: string,
  conversationId: string
): Promise<Conversation> {
  // Verify conversation belongs to this organization
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId },
  })

  if (!conversation) {
    throw new Error('Conversation not found')
  }

  return prisma.conversation.update({
    where: { id: conversationId },
    data: { isArchived: true },
  })
}

/**
 * Soft delete a conversation
 *
 * WHY: Allows recovery while hiding from normal queries
 * HOW: Validates ownership via organizationId before deleting
 */
export async function deleteConversation(
  organizationId: string,
  conversationId: string
): Promise<Conversation> {
  // Verify conversation belongs to this organization
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId },
  })

  if (!conversation) {
    throw new Error('Conversation not found')
  }

  return prisma.conversation.update({
    where: { id: conversationId },
    data: { deletedAt: new Date() },
  })
}

// ============================================================================
// MESSAGE OPERATIONS
// ============================================================================

/**
 * Send a message in a conversation
 *
 * WHY: Core function to send messages to leads
 * HOW: Sends via appropriate channel (email via Resend), then saves to DB on success
 *
 * WALLET CHARGING: For EMAIL channel, charges the organization's wallet after
 * successful send. Cost is taken from feature-gates.ts (SOURCE OF TRUTH).
 *
 * IMPORTANT: For email replies, if fromEmail is not provided, we look up the
 * previous outbound email in this conversation to use the SAME sender address.
 * This ensures reply continuity and proper threading.
 *
 * DB SAVE POLICY: We only save to database AFTER successful email send to prevent
 * orphaned messages that appear sent but were never actually delivered.
 */
export async function sendMessage(
  input: SendMessageInput
): Promise<{ message: Message; emailSent?: boolean; error?: string }> {
  const {
    organizationId,
    conversationId,
    channel,
    body,
    subject,
    fromName: inputFromName,
    fromEmail: inputFromEmail,
  } = input

  // Verify conversation exists and get lead details + previous messages for sender info and threading
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      organizationId,
      deletedAt: null,
    },
    include: {
      lead: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  })

  // Separate query for previous outbound email (for sender info)
  const previousOutbound = await prisma.message.findFirst({
    where: {
      conversationId,
      direction: 'OUTBOUND',
      channel: 'EMAIL',
      fromEmail: { not: null },
      deletedAt: null,
    },
    orderBy: { sentAt: 'desc' },
    select: {
      fromName: true,
      fromEmail: true,
    },
  })

  // Get the most recent inbound email to use its toEmail as our reply-from address
  // WHY: If someone emails emmanuel@quaacko.com, we reply FROM emmanuel@quaacko.com
  const lastInboundEmail = await prisma.message.findFirst({
    where: {
      conversationId,
      direction: 'INBOUND',
      channel: 'EMAIL',
      deletedAt: null,
    },
    orderBy: { sentAt: 'desc' },
    select: {
      toEmail: true,
      emailMessageId: true,
    },
  })

  if (!conversation) {
    throw new Error('Conversation not found')
  }

  const leadEmail = conversation.lead.email

  // Determine sender info for emails
  // Priority: 1) Explicit input, 2) Previous outbound, 3) Inbound's toEmail (same address they emailed), 4) Error
  let fromName = inputFromName
  let fromEmail = inputFromEmail
  let senderAddress: string | null = null

  if (channel === 'EMAIL') {
    // If no fromEmail provided, try to get from previous outbound message
    if (!fromEmail && previousOutbound) {
      fromEmail = previousOutbound.fromEmail ?? undefined
      fromName = fromName ?? previousOutbound.fromName ?? undefined
    }

    // If still no fromEmail, use the address they sent their email TO
    // WHY: If they emailed emmanuel@quaacko.com, reply FROM emmanuel@quaacko.com
    if (!fromEmail && lastInboundEmail?.toEmail) {
      fromEmail = lastInboundEmail.toEmail
    }

    // Build sender address
    if (fromEmail) {
      senderAddress = fromName ? `${fromName} <${fromEmail}>` : fromEmail
    } else {
      // No sender info available - cannot send email
      throw new Error(
        'Cannot send email: No sender email available. The conversation has no inbound emails to reply to.'
      )
    }
  }

  // Get emailMessageId for threading (In-Reply-To/References headers)
  // Use the inbound email we're replying to, or any message with a message ID
  const threadingMessageId = lastInboundEmail?.emailMessageId

  // For EMAIL channel, send first, then save to DB only on success
  if (channel === 'EMAIL') {
    let resendMessageId: string | undefined

    // Build threading headers for proper email client threading (Gmail, Outlook, etc.)
    // WHY: Without these headers, replies appear as separate emails instead of threaded
    const threadingHeaders: Record<string, string> = {}
    if (threadingMessageId) {
      threadingHeaders['In-Reply-To'] = threadingMessageId
      threadingHeaders['References'] = threadingMessageId
    }

    try {
      // Send email via Resend
      // NOTE: HTML wrapper is kept minimal (no styling) - just converts newlines to <br> tags
      // The open tracking pixel from Resend requires HTML format to work properly
      const { data: result, error: resendError } = await resend.emails.send({
        from: senderAddress!,
        to: leadEmail,
        subject: subject || conversation.subject || 'Message from us',
        html: `<div>${body.replace(/\n/g, '<br>')}</div>`,
        // Include threading headers only if we have a Message-ID to reference
        ...(Object.keys(threadingHeaders).length > 0 && { headers: threadingHeaders }),
      })

      if (resendError) {
        // Don't save to DB - email failed
        return {
          message: null as unknown as Message, // No message created
          emailSent: false,
          error: resendError.message,
        }
      }

      resendMessageId = result?.id
    } catch (err) {
      // Don't save to DB - email failed
      return {
        message: null as unknown as Message,
        emailSent: false,
        error: err instanceof Error ? err.message : 'Failed to send email',
      }
    }

    // Email sent successfully - now save to DB
    const message = await prisma.message.create({
      data: {
        organizationId,
        conversationId,
        channel,
        direction: 'OUTBOUND',
        subject: subject || conversation.subject,
        body,
        bodyHtml: `<div>${body.replace(/\n/g, '<br>')}</div>`,
        fromName,
        fromEmail,
        toEmail: leadEmail,
        status: 'SENT',
        resendMessageId,
        isRead: true, // Outbound messages are always "read" by us
      },
    })

    // Update conversation metadata
    const preview = body.slice(0, 100) + (body.length > 100 ? '...' : '')
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: preview,
        primaryChannel: channel,
        subject: subject || conversation.subject,
      },
    })

    /**
     * Charge wallet for email usage
     *
     * WHY: PAYG email charging - organizations pay per email sent
     * HOW: Uses chargeForEmail which gets cost from feature-gates.ts
     *
     * NOTE: We charge AFTER successful send to avoid charging for failed emails
     */
    try {
      await chargeForEmail(
        organizationId,
        `Email to ${leadEmail}`,
        {
          type: 'inbox-message',
          conversationId,
          messageId: message.id,
          recipient: leadEmail,
          resendMessageId,
        }
      )
    } catch (chargeError) {
      // Log but don't fail the email send - email was already sent
      console.error('Failed to charge for email:', chargeError)
    }

    return {
      message,
      emailSent: true,
    }
  }

  // For non-email channels, create message and mark as sent
  // (actual sending would be via other integrations)
  const message = await prisma.message.create({
    data: {
      organizationId,
      conversationId,
      channel,
      direction: 'OUTBOUND',
      subject: subject || conversation.subject,
      body,
      bodyHtml: null,
      fromName,
      fromEmail,
      toEmail: leadEmail,
      status: 'SENT',
      isRead: true,
    },
  })

  // Update conversation metadata
  const preview = body.slice(0, 100) + (body.length > 100 ? '...' : '')
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      lastMessageAt: new Date(),
      lastMessagePreview: preview,
      primaryChannel: channel,
      subject: subject || conversation.subject,
    },
  })

  /**
   * Emit realtime event for CHATBOT channel
   * WHY: Chat widget visitors receive replies instantly via SSE
   * HOW: Event published to Redis via @upstash/realtime - true pub/sub
   */
  if (channel === 'CHATBOT') {
    await realtime.emit('inbox.chatSent', {
      organizationId,
      conversationId,
      messageId: message.id,
      leadId: conversation.lead.id,
      body,
      senderName: fromName || null,
    })
  }

  return {
    message,
    emailSent: false,
  }
}

/**
 * Record an outbound email that was already sent (e.g., contract/invoice emails)
 *
 * WHY: When emails are sent outside the inbox (contracts, invoices), we still want
 *      them to appear in the lead's conversation for complete communication history.
 *
 * HOW: Creates a Message record WITHOUT sending anything — the email was already
 *      sent via Resend by the calling service. This just records it in the inbox.
 *
 * SOURCE OF TRUTH KEYWORDS: RecordOutboundEmail, InboxEmailRecord
 */
export async function recordOutboundEmail(input: {
  organizationId: string
  leadId: string
  subject: string
  body: string
  bodyHtml: string
  toEmail: string
  fromEmail?: string
  fromName?: string
  resendMessageId?: string
}): Promise<{ conversationId: string; messageId: string }> {
  const {
    organizationId,
    leadId,
    subject,
    body,
    bodyHtml,
    toEmail,
    fromEmail,
    fromName,
    resendMessageId,
  } = input

  // Get or create the lead's single conversation
  const conversation = await getOrCreateConversation({
    organizationId,
    leadId,
    subject,
    primaryChannel: 'EMAIL',
  })

  // Create the outbound message record (email was already sent)
  const message = await prisma.message.create({
    data: {
      organizationId,
      conversationId: conversation.id,
      channel: 'EMAIL',
      direction: 'OUTBOUND',
      subject,
      body,
      bodyHtml,
      fromName,
      fromEmail,
      toEmail,
      status: 'SENT',
      resendMessageId,
      isRead: true, // Outbound messages are always "read" by us
    },
  })

  // Update conversation metadata
  const preview = body.slice(0, 100) + (body.length > 100 ? '...' : '')
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(),
      lastMessagePreview: preview,
      hasUnread: false,
    },
  })

  return { conversationId: conversation.id, messageId: message.id }
}

/**
 * Record an inbound message (from webhooks or form submissions)
 *
 * WHY: Store incoming messages from leads
 * HOW: Creates message and updates conversation unread status
 *
 * IMPORTANT: For emails:
 * - emailMessageId (RFC 2822 Message-ID) must be stored for threading headers
 * - toEmail must be stored so we know which address to reply FROM
 *   (when user emails emmanuel@quaacko.com, we reply FROM emmanuel@quaacko.com)
 */
export async function recordInboundMessage(input: {
  organizationId: string
  leadId: string
  channel: MessageChannel
  body: string
  subject?: string
  fromName?: string
  fromEmail?: string
  /** The address on OUR domain that the email was sent TO - used as reply-from address */
  toEmail?: string
  externalId?: string
  /** RFC 2822 Message-ID header for email threading (e.g., "<abc123@resend.dev>") */
  emailMessageId?: string
}): Promise<{ conversation: Conversation; message: Message; isDuplicate: boolean }> {
  const {
    organizationId,
    leadId,
    channel,
    body,
    subject,
    fromName,
    fromEmail,
    toEmail,
    externalId,
    emailMessageId,
  } = input

  // Idempotency check: If this message already exists (webhook retry), return the existing one
  // WHY: Resend retries webhooks on timeout/5xx, which would create duplicate messages
  // HOW: Check for existing message with same externalId in this organization
  if (externalId) {
    const existingMessage = await prisma.message.findFirst({
      where: { organizationId, externalId },
      include: { conversation: true },
    })

    if (existingMessage) {
      return {
        conversation: existingMessage.conversation,
        message: existingMessage,
        isDuplicate: true,
      }
    }
  }

  // Get or create conversation for this lead
  const conversation = await getOrCreateConversation({
    organizationId,
    leadId,
    subject,
    primaryChannel: channel,
  })

  // Create the inbound message
  const message = await prisma.message.create({
    data: {
      organizationId,
      conversationId: conversation.id,
      channel,
      direction: 'INBOUND',
      subject,
      body,
      fromName,
      fromEmail,
      toEmail, // Store recipient so we know what address to reply FROM
      externalId,
      emailMessageId, // RFC 2822 Message-ID for email threading
      status: 'DELIVERED',
      isRead: false,
    },
  })

  // Update conversation metadata
  const preview = body.slice(0, 100) + (body.length > 100 ? '...' : '')
  const updatedConversation = await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      hasUnread: true,
      lastMessageAt: new Date(),
      lastMessagePreview: preview,
      primaryChannel: channel,
      subject: subject || conversation.subject,
    },
  })

  return { conversation: updatedConversation, message, isDuplicate: false }
}

/**
 * Get messages for a conversation
 *
 * WHY: Fetch message history for display
 * HOW: Paginated query ordered by sent time
 */
export async function getConversationMessages(
  organizationId: string,
  conversationId: string,
  options?: { cursor?: string; limit?: number }
): Promise<{ messages: Message[]; nextCursor?: string }> {
  const limit = options?.limit || 50

  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      organizationId,
      deletedAt: null,
    },
    orderBy: { sentAt: 'asc' },
    take: limit + 1,
    ...(options?.cursor && { cursor: { id: options.cursor }, skip: 1 }),
  })

  let nextCursor: string | undefined
  if (messages.length > limit) {
    const nextItem = messages.pop()
    nextCursor = nextItem?.id
  }

  return { messages, nextCursor }
}

// ============================================================================
// BI-DIRECTIONAL MESSAGE PAGINATION - WhatsApp/Messenger Style
// ============================================================================

/**
 * Input for loading messages around a target message
 * SOURCE OF TRUTH KEYWORDS: GetMessagesAroundInput, BiDirectionalPagination
 */
export interface GetMessagesAroundInput {
  organizationId: string
  conversationId: string
  /** Target message ID to load around (if not provided, loads latest) */
  targetMessageId?: string
  /** Number of messages to load in each direction (default 15) */
  limit?: number
}

/**
 * Result for bi-directional message pagination
 * SOURCE OF TRUTH KEYWORDS: GetMessagesAroundResult, BiDirectionalPaginationResult
 */
export interface GetMessagesAroundResult {
  messages: Message[]
  /** Cursor for loading older messages (ID of oldest message returned) */
  previousCursor: string | null
  /** Cursor for loading newer messages (ID of newest message returned) */
  nextCursor: string | null
  /** Whether there are more older messages */
  hasPrevious: boolean
  /** Whether there are more newer messages */
  hasNext: boolean
  /** The target message ID (useful when loading latest) */
  focusMessageId: string | null
  /** Total message count in conversation */
  totalCount: number
}

/**
 * Get messages around a target message (bi-directional initial load)
 *
 * WHY: WhatsApp/Messenger-style UX - when clicking notification for old message,
 *      load messages AROUND that message, not from the beginning
 * HOW: Fetches messages before and after the target, enabling scroll both ways
 *
 * BEHAVIOR:
 * - If targetMessageId provided: Load `limit` messages before AND after it
 * - If not provided: Load latest `limit * 2` messages (bottom of conversation)
 */
export async function getMessagesAround(
  input: GetMessagesAroundInput
): Promise<GetMessagesAroundResult> {
  const { organizationId, conversationId, targetMessageId, limit = 15 } = input

  // Get total count for progress indication
  const totalCount = await prisma.message.count({
    where: { conversationId, organizationId, deletedAt: null },
  })

  // If no target, load latest messages (user opening conversation normally)
  if (!targetMessageId) {
    const messages = await prisma.message.findMany({
      where: { conversationId, organizationId, deletedAt: null },
      orderBy: { sentAt: 'desc' }, // Get newest first
      take: limit * 2 + 1, // Fetch extra to detect if there's more
    })

    // Reverse to get chronological order (oldest first)
    messages.reverse()

    // Check if there are older messages
    const hasPrevious = messages.length > limit * 2
    if (hasPrevious) {
      messages.shift() // Remove the extra message
    }

    const previousCursor = messages.length > 0 ? messages[0].id : null
    const focusMessageId = messages.length > 0 ? messages[messages.length - 1].id : null

    return {
      messages,
      previousCursor,
      nextCursor: null, // We're at the bottom
      hasPrevious,
      hasNext: false, // We're at the bottom
      focusMessageId,
      totalCount,
    }
  }

  // Load messages around the target message
  // First, get the target message to know its timestamp
  const targetMessage = await prisma.message.findFirst({
    where: { id: targetMessageId, conversationId, organizationId, deletedAt: null },
  })

  if (!targetMessage) {
    // Target not found, fall back to latest
    return getMessagesAround({ organizationId, conversationId, limit })
  }

  // Fetch messages BEFORE the target (older)
  const messagesBefore = await prisma.message.findMany({
    where: {
      conversationId,
      organizationId,
      deletedAt: null,
      sentAt: { lt: targetMessage.sentAt },
    },
    orderBy: { sentAt: 'desc' }, // Get closest to target first
    take: limit + 1, // Extra to detect more
  })

  // Fetch messages AFTER the target (newer)
  const messagesAfter = await prisma.message.findMany({
    where: {
      conversationId,
      organizationId,
      deletedAt: null,
      sentAt: { gt: targetMessage.sentAt },
    },
    orderBy: { sentAt: 'asc' }, // Get closest to target first
    take: limit + 1, // Extra to detect more
  })

  // Check if there are more in each direction
  const hasPrevious = messagesBefore.length > limit
  const hasNext = messagesAfter.length > limit

  // Trim the extra messages used for detection
  if (hasPrevious) messagesBefore.pop()
  if (hasNext) messagesAfter.pop()

  // Combine: older (reversed to chronological) + target + newer
  const allMessages = [
    ...messagesBefore.reverse(),
    targetMessage,
    ...messagesAfter,
  ]

  const previousCursor = allMessages.length > 0 ? allMessages[0].id : null
  const nextCursor = allMessages.length > 0 ? allMessages[allMessages.length - 1].id : null

  return {
    messages: allMessages,
    previousCursor,
    nextCursor,
    hasPrevious,
    hasNext,
    focusMessageId: targetMessageId,
    totalCount,
  }
}

/**
 * Input for loading older messages (scroll up)
 * SOURCE OF TRUTH KEYWORDS: GetMessagesBeforeInput
 */
export interface GetMessagesBeforeInput {
  organizationId: string
  conversationId: string
  /** Cursor - ID of the oldest message currently loaded */
  cursor: string
  /** Number of messages to load (default 20) */
  limit?: number
}

/**
 * Result for loading older messages
 */
export interface GetMessagesBeforeResult {
  messages: Message[]
  /** New cursor for next "load older" request */
  previousCursor: string | null
  /** Whether there are more older messages */
  hasPrevious: boolean
}

/**
 * Get older messages (infinite scroll up)
 *
 * WHY: Load history when user scrolls up
 * HOW: Cursor-based pagination going backward in time
 */
export async function getMessagesBefore(
  input: GetMessagesBeforeInput
): Promise<GetMessagesBeforeResult> {
  const { organizationId, conversationId, cursor, limit = 20 } = input

  // Get the cursor message to know its timestamp
  const cursorMessage = await prisma.message.findFirst({
    where: { id: cursor, conversationId, organizationId, deletedAt: null },
  })

  if (!cursorMessage) {
    return { messages: [], previousCursor: null, hasPrevious: false }
  }

  // Fetch messages BEFORE the cursor (older)
  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      organizationId,
      deletedAt: null,
      sentAt: { lt: cursorMessage.sentAt },
    },
    orderBy: { sentAt: 'desc' }, // Get closest to cursor first
    take: limit + 1, // Extra to detect more
  })

  // Check if there are more older messages
  const hasPrevious = messages.length > limit
  if (hasPrevious) messages.pop()

  // Reverse to get chronological order
  messages.reverse()

  const previousCursor = messages.length > 0 ? messages[0].id : null

  return { messages, previousCursor, hasPrevious }
}

/**
 * Input for loading newer messages (scroll down)
 * SOURCE OF TRUTH KEYWORDS: GetMessagesAfterInput
 */
export interface GetMessagesAfterInput {
  organizationId: string
  conversationId: string
  /** Cursor - ID of the newest message currently loaded */
  cursor: string
  /** Number of messages to load (default 20) */
  limit?: number
}

/**
 * Result for loading newer messages
 */
export interface GetMessagesAfterResult {
  messages: Message[]
  /** New cursor for next "load newer" request */
  nextCursor: string | null
  /** Whether there are more newer messages */
  hasNext: boolean
}

/**
 * Get newer messages (infinite scroll down)
 *
 * WHY: Load newer messages when user scrolled up to view history, then scrolls down
 * HOW: Cursor-based pagination going forward in time
 */
export async function getMessagesAfter(
  input: GetMessagesAfterInput
): Promise<GetMessagesAfterResult> {
  const { organizationId, conversationId, cursor, limit = 20 } = input

  // Get the cursor message to know its timestamp
  const cursorMessage = await prisma.message.findFirst({
    where: { id: cursor, conversationId, organizationId, deletedAt: null },
  })

  if (!cursorMessage) {
    return { messages: [], nextCursor: null, hasNext: false }
  }

  // Fetch messages AFTER the cursor (newer)
  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      organizationId,
      deletedAt: null,
      sentAt: { gt: cursorMessage.sentAt },
    },
    orderBy: { sentAt: 'asc' }, // Chronological order
    take: limit + 1, // Extra to detect more
  })

  // Check if there are more newer messages
  const hasNext = messages.length > limit
  if (hasNext) messages.pop()

  const nextCursor = messages.length > 0 ? messages[messages.length - 1].id : null

  return { messages, nextCursor, hasNext }
}

/**
 * Input for jumping to latest messages
 * SOURCE OF TRUTH KEYWORDS: GetLatestMessagesInput
 */
export interface GetLatestMessagesInput {
  organizationId: string
  conversationId: string
  /** Number of messages to load (default 30) */
  limit?: number
}

/**
 * Result for jumping to latest messages
 */
export interface GetLatestMessagesResult {
  messages: Message[]
  /** Cursor for loading older messages */
  previousCursor: string | null
  /** Whether there are more older messages */
  hasPrevious: boolean
  /** Total message count */
  totalCount: number
}

/**
 * Get latest messages (jump to bottom)
 *
 * WHY: User wants to see latest messages without loading all history
 * HOW: Resets pagination state to "at bottom" position
 */
export async function getLatestMessages(
  input: GetLatestMessagesInput
): Promise<GetLatestMessagesResult> {
  const { organizationId, conversationId, limit = 30 } = input

  // Get total count
  const totalCount = await prisma.message.count({
    where: { conversationId, organizationId, deletedAt: null },
  })

  // Fetch latest messages
  const messages = await prisma.message.findMany({
    where: { conversationId, organizationId, deletedAt: null },
    orderBy: { sentAt: 'desc' }, // Get newest first
    take: limit + 1, // Extra to detect more
  })

  // Reverse to get chronological order
  messages.reverse()

  // Check if there are older messages
  const hasPrevious = messages.length > limit
  if (hasPrevious) {
    messages.shift() // Remove the extra (oldest) message
  }

  const previousCursor = messages.length > 0 ? messages[0].id : null

  return { messages, previousCursor, hasPrevious, totalCount }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get inbox stats for an organization
 *
 * WHY: Display unread count and other metrics
 */
export async function getInboxStats(organizationId: string): Promise<{
  totalConversations: number
  unreadCount: number
  starredCount: number
}> {
  const [total, unread, starred] = await Promise.all([
    prisma.conversation.count({
      where: { organizationId, deletedAt: null, isArchived: false },
    }),
    prisma.conversation.count({
      where: { organizationId, deletedAt: null, isArchived: false, hasUnread: true },
    }),
    prisma.conversation.count({
      where: { organizationId, deletedAt: null, isStarred: true },
    }),
  ])

  return {
    totalConversations: total,
    unreadCount: unread,
    starredCount: starred,
  }
}

/**
 * Find or create a conversation by lead email
 *
 * WHY: Used when we need to start a conversation with a lead by email
 * HOW: Looks up lead by email first, then gets/creates conversation
 */
export async function getOrCreateConversationByLeadEmail(
  organizationId: string,
  leadEmail: string,
  options?: { subject?: string; channel?: MessageChannel }
): Promise<Conversation | null> {
  // Find lead by email
  const lead = await prisma.lead.findFirst({
    where: {
      organizationId,
      email: leadEmail,
      deletedAt: null,
    },
  })

  if (!lead) {
    return null
  }

  return getOrCreateConversation({
    organizationId,
    leadId: lead.id,
    subject: options?.subject,
    primaryChannel: options?.channel,
  })
}

// ============================================================================
// NEW EMAIL COMPOSITION
// ============================================================================

/**
 * Input for sending a new email to a lead (no existing conversation required)
 * SOURCE OF TRUTH KEYWORDS: SendNewEmailInput, NewEmailComposition
 */
export interface SendNewEmailInput {
  organizationId: string
  leadId: string
  subject: string
  body: string
  /** Sender display name (required for all outbound emails) */
  fromName: string
  /** Sender email address (required for all outbound emails) */
  fromEmail: string
}

/**
 * Send a new email to a lead, creating conversation if needed
 *
 * WHY: Allows users to initiate email conversations with leads
 * HOW: Gets or creates conversation, then sends the email via Resend
 *
 * @returns The conversation and message, plus email status
 */
export async function sendNewEmailToLead(
  input: SendNewEmailInput
): Promise<{
  conversation: ConversationWithLead
  message: Message
  emailSent: boolean
  error?: string
}> {
  const { organizationId, leadId, subject, body, fromName, fromEmail } = input

  // Get or create conversation with this lead
  const conversation = await getOrCreateConversation({
    organizationId,
    leadId,
    subject,
    primaryChannel: 'EMAIL',
  })

  // Send the message
  const result = await sendMessage({
    organizationId,
    conversationId: conversation.id,
    channel: 'EMAIL',
    subject,
    body,
    fromName,
    fromEmail,
  })

  // Fetch the full conversation with lead details
  const fullConversation = await getConversationById(organizationId, conversation.id)

  if (!fullConversation) {
    throw new Error('Failed to fetch conversation after sending message')
  }

  return {
    conversation: fullConversation,
    message: result.message,
    emailSent: result.emailSent ?? false,
    error: result.error,
  }
}

/**
 * Search leads for email composition autocomplete
 *
 * WHY: Users need to find leads to email when composing new messages
 * HOW: Searches by name and email, returns leads with valid email addresses
 */
export async function searchLeadsForCompose(
  organizationId: string,
  query: string,
  limit: number = 10
): Promise<Pick<Lead, 'id' | 'firstName' | 'lastName' | 'email' | 'avatarUrl'>[]> {
  if (!query || query.length < 2) {
    return []
  }

  return prisma.lead.findMany({
    where: {
      organizationId,
      deletedAt: null,
      // Must have email to send emails
      email: { not: '' },
      OR: [
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      avatarUrl: true,
    },
    take: limit,
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  })
}
