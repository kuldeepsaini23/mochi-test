/**
 * Guest Session Service (DAL)
 *
 * Handles anonymous chat widget sessions before lead identification.
 * Provides session creation, validation, and conversion to lead sessions.
 *
 * SOURCE OF TRUTH KEYWORDS: GuestSession, ChatWidgetGuest, AnonymousSession, GuestMessage
 *
 * FLOW:
 * 1. Visitor opens chat widget -> createGuestSession()
 * 2. Visitor sends messages -> messages stored via GuestMessage
 * 3. Visitor provides email -> convertGuestToLead()
 * 4. All messages transferred to Lead's conversation in inbox
 *
 * SECURITY: Uses same HMAC-SHA256 token approach as LeadSession
 */

import 'server-only'

import { prisma } from '@/lib/config'
import {
  createLeadSessionToken,
  validateTokenSignature,
  hashToken,
} from '@/lib/lead-session/token'
import { createSession as createLeadSession } from '@/services/lead-session.service'
import { recordInboundMessage, getOrCreateConversation } from '@/services/inbox.service'
import type { GuestSession, GuestMessage, MessageDirection } from '@/generated/prisma'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Input for creating a new guest session
 */
export interface CreateGuestSessionInput {
  /** The organization this session belongs to */
  organizationId: string
  /** The chat widget this session is for */
  chatWidgetId: string
  /** Browser user agent string (optional, for continuity) */
  userAgent?: string
  /** Browser fingerprint hash (optional, for continuity) */
  fingerprint?: string
}

/**
 * Result of creating a guest session
 */
export interface CreateGuestSessionResult {
  /** Whether the operation succeeded */
  success: boolean
  /** Token to send to client for storage */
  token?: string
  /** The guest session ID */
  guestSessionId?: string
  /** Error message if failed */
  error?: string
}

/**
 * Input for validating a guest session
 */
export interface ValidateGuestSessionInput {
  /** The organization to validate against */
  organizationId: string
  /** The session token from the client */
  token: string
  /** The chat widget ID to validate against */
  chatWidgetId: string
}

/**
 * Result of validating a guest session
 */
export interface ValidateGuestSessionResult {
  /** Whether the token is valid */
  valid: boolean
  /** The guest session ID if valid */
  guestSessionId?: string
  /** Whether this session has been converted to a lead */
  isConverted?: boolean
  /** The lead ID if converted */
  convertedToLeadId?: string
  /** Error message if invalid */
  error?: string
}

/**
 * Input for converting a guest session to a lead
 */
export interface ConvertGuestToLeadInput {
  /** The organization ID */
  organizationId: string
  /** The guest session token */
  token: string
  /** The chat widget ID */
  chatWidgetId: string
  /** Lead's email address (unique identifier) */
  email: string
  /** Lead's first name (optional) */
  firstName?: string
  /** Lead's last name (optional) */
  lastName?: string
  /** Lead's phone number (optional) */
  phone?: string
}

/**
 * Result of converting a guest to lead
 */
export interface ConvertGuestToLeadResult {
  /** Whether the conversion succeeded */
  success: boolean
  /** The new lead session token (for cookie update) */
  token?: string
  /** The lead's ID */
  leadId?: string
  /** Whether this is a newly created lead */
  isNewLead?: boolean
  /** Number of messages transferred */
  messagesTransferred?: number
  /** Error message if failed */
  error?: string
}

/**
 * Input for sending a guest message
 */
export interface SendGuestMessageInput {
  /** The organization ID */
  organizationId: string
  /** The guest session token */
  token: string
  /** The chat widget ID */
  chatWidgetId: string
  /** The message body */
  body: string
  /** Message direction (INBOUND = from guest, OUTBOUND = to guest) */
  direction: MessageDirection
}

/**
 * Result of sending a guest message
 */
export interface SendGuestMessageResult {
  /** Whether the message was sent successfully */
  success: boolean
  /** The created message */
  message?: GuestMessage
  /** Error message if failed */
  error?: string
}

/**
 * Guest message with session info
 */
export type GuestMessageWithSession = GuestMessage & {
  guestSession: Pick<GuestSession, 'id' | 'chatWidgetId' | 'isConverted'>
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Create a new guest session for an anonymous visitor
 *
 * WHY: Allow anonymous visitors to use chat widgets before providing email
 * HOW: Creates session with secure token bound to organization and widget
 *
 * @param input - Session creation parameters
 * @returns Session creation result with token
 */
export async function createGuestSession(
  input: CreateGuestSessionInput
): Promise<CreateGuestSessionResult> {
  try {
    // Verify the chat widget exists and belongs to the organization
    const chatWidget = await prisma.chatWidget.findFirst({
      where: {
        id: input.chatWidgetId,
        organizationId: input.organizationId,
      },
    })

    if (!chatWidget) {
      return {
        success: false,
        error: 'Chat widget not found or does not belong to organization',
      }
    }

    // Create secure token (reusing lead session token logic)
    // We pass a placeholder leadId since guest sessions don't have leads yet
    const { token, tokenHash, tokenSuffix } = createLeadSessionToken({
      organizationId: input.organizationId,
      leadId: `guest_${input.chatWidgetId}`, // Placeholder for signature binding
    })

    // Create the guest session
    const guestSession = await prisma.guestSession.create({
      data: {
        organizationId: input.organizationId,
        chatWidgetId: input.chatWidgetId,
        tokenHash,
        tokenSuffix,
        userAgent: input.userAgent,
        fingerprint: input.fingerprint,
      },
    })

    return {
      success: true,
      token,
      guestSessionId: guestSession.id,
    }
  } catch (error) {
    console.error('[GuestSession] Error creating session:', error)
    return {
      success: false,
      error: 'Failed to create guest session',
    }
  }
}

/**
 * Validate a guest session token
 *
 * WHY: Verify that a token is valid for the given organization and widget
 * HOW: Check signature, then lookup in database
 *
 * @param input - Validation parameters
 * @returns Validation result
 */
export async function validateGuestSession(
  input: ValidateGuestSessionInput
): Promise<ValidateGuestSessionResult> {
  try {
    // First, verify token signature (fast, no DB call)
    // Note: We use a placeholder leadId that matches what was used in creation
    const signatureValid = validateTokenSignature(
      input.token,
      input.organizationId
    )

    if (!signatureValid) {
      return { valid: false, error: 'Invalid token signature' }
    }

    // Look up token in database
    const tokenHashValue = hashToken(input.token)
    const session = await prisma.guestSession.findUnique({
      where: { tokenHash: tokenHashValue },
    })

    if (!session) {
      return { valid: false, error: 'Session not found' }
    }

    // Verify organization and widget match
    if (session.organizationId !== input.organizationId) {
      return { valid: false, error: 'Organization mismatch' }
    }

    if (session.chatWidgetId !== input.chatWidgetId) {
      return { valid: false, error: 'Chat widget mismatch' }
    }

    // Update lastSeenAt
    await prisma.guestSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    })

    return {
      valid: true,
      guestSessionId: session.id,
      isConverted: session.isConverted,
      convertedToLeadId: session.convertedToLeadId ?? undefined,
    }
  } catch (error) {
    console.error('[GuestSession] Error validating session:', error)
    return { valid: false, error: 'Validation failed' }
  }
}

/**
 * Convert a guest session to a lead session
 *
 * WHY: When a guest provides their email, convert their anonymous session
 *      to an identified lead session and transfer all messages
 * HOW:
 *   1. Validate guest session
 *   2. Create or find existing lead by email
 *   3. Create lead session
 *   4. Transfer guest messages to inbox conversation
 *   5. Mark guest session as converted
 *
 * @param input - Conversion parameters
 * @returns Conversion result with new lead session token
 */
export async function convertGuestToLead(
  input: ConvertGuestToLeadInput
): Promise<ConvertGuestToLeadResult> {
  try {
    // Validate guest session first
    const validation = await validateGuestSession({
      organizationId: input.organizationId,
      token: input.token,
      chatWidgetId: input.chatWidgetId,
    })

    if (!validation.valid || !validation.guestSessionId) {
      return {
        success: false,
        error: validation.error || 'Invalid guest session',
      }
    }

    // Check if already converted
    if (validation.isConverted && validation.convertedToLeadId) {
      return {
        success: false,
        error: 'Session already converted to lead',
      }
    }

    // Create lead session (this will find or create the lead)
    const leadSessionResult = await createLeadSession({
      organizationId: input.organizationId,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      source: 'chatbot',
    })

    if (!leadSessionResult.success || !leadSessionResult.leadId) {
      return {
        success: false,
        error: leadSessionResult.error || 'Failed to create lead session',
      }
    }

    // Get all guest messages to transfer
    const guestMessages = await prisma.guestMessage.findMany({
      where: {
        guestSessionId: validation.guestSessionId,
      },
      orderBy: { sentAt: 'asc' },
    })

    // Transfer messages to inbox conversation
    let messagesTransferred = 0

    if (guestMessages.length > 0) {
      // Get or create conversation for this lead
      const conversation = await getOrCreateConversation({
        organizationId: input.organizationId,
        leadId: leadSessionResult.leadId,
        subject: 'Chat Widget Conversation',
        primaryChannel: 'CHATBOT',
      })

      // Transfer each message to the conversation
      for (const guestMessage of guestMessages) {
        if (guestMessage.direction === 'INBOUND') {
          // Inbound messages (from guest/lead)
          await recordInboundMessage({
            organizationId: input.organizationId,
            leadId: leadSessionResult.leadId,
            channel: 'CHATBOT',
            body: guestMessage.body,
            fromName: input.firstName || undefined,
            fromEmail: input.email,
          })
        } else {
          // Outbound messages (from system/bot)
          await prisma.message.create({
            data: {
              organizationId: input.organizationId,
              conversationId: conversation.id,
              channel: 'CHATBOT',
              direction: 'OUTBOUND',
              body: guestMessage.body,
              status: 'SENT',
              isRead: true,
              sentAt: guestMessage.sentAt,
            },
          })
        }
        messagesTransferred++
      }

      // Update conversation metadata
      const lastMessage = guestMessages[guestMessages.length - 1]
      const preview = lastMessage.body.slice(0, 100) + (lastMessage.body.length > 100 ? '...' : '')

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: lastMessage.sentAt,
          lastMessagePreview: preview,
          hasUnread: true,
        },
      })
    }

    // Mark guest session as converted
    await prisma.guestSession.update({
      where: { id: validation.guestSessionId },
      data: {
        isConverted: true,
        convertedToLeadId: leadSessionResult.leadId,
      },
    })

    // Delete guest messages (they're now in the main Message table)
    await prisma.guestMessage.deleteMany({
      where: {
        guestSessionId: validation.guestSessionId,
      },
    })

    return {
      success: true,
      token: leadSessionResult.token,
      leadId: leadSessionResult.leadId,
      isNewLead: leadSessionResult.isNewLead,
      messagesTransferred,
    }
  } catch (error) {
    console.error('[GuestSession] Error converting to lead:', error)
    return {
      success: false,
      error: 'Failed to convert guest to lead',
    }
  }
}

/**
 * Send a message in a guest session
 *
 * WHY: Allow anonymous visitors to send/receive messages before identification
 * HOW: Validate session, then create message in GuestMessage table
 *
 * @param input - Message parameters
 * @returns Message creation result
 */
export async function sendGuestMessage(
  input: SendGuestMessageInput
): Promise<SendGuestMessageResult> {
  try {
    // Validate guest session first
    const validation = await validateGuestSession({
      organizationId: input.organizationId,
      token: input.token,
      chatWidgetId: input.chatWidgetId,
    })

    if (!validation.valid || !validation.guestSessionId) {
      return {
        success: false,
        error: validation.error || 'Invalid guest session',
      }
    }

    // Check if session is converted - should use lead session instead
    if (validation.isConverted) {
      return {
        success: false,
        error: 'Session has been converted to lead. Use lead session for messages.',
      }
    }

    // Create the guest message
    const message = await prisma.guestMessage.create({
      data: {
        organizationId: input.organizationId,
        guestSessionId: validation.guestSessionId,
        direction: input.direction,
        body: input.body,
      },
    })

    return {
      success: true,
      message,
    }
  } catch (error) {
    console.error('[GuestSession] Error sending message:', error)
    return {
      success: false,
      error: 'Failed to send message',
    }
  }
}

/**
 * Get all messages for a guest session
 *
 * WHY: Retrieve chat history for anonymous visitors
 * HOW: Validate session, then fetch messages ordered by time
 *
 * @param organizationId - The organization ID
 * @param token - The guest session token
 * @param chatWidgetId - The chat widget ID
 * @returns Array of messages or error
 */
export async function getGuestMessages(
  organizationId: string,
  token: string,
  chatWidgetId: string
): Promise<{ success: boolean; messages?: GuestMessage[]; error?: string }> {
  try {
    // Validate guest session first
    const validation = await validateGuestSession({
      organizationId,
      token,
      chatWidgetId,
    })

    if (!validation.valid || !validation.guestSessionId) {
      return {
        success: false,
        error: validation.error || 'Invalid guest session',
      }
    }

    // Get messages
    const messages = await prisma.guestMessage.findMany({
      where: {
        guestSessionId: validation.guestSessionId,
      },
      orderBy: { sentAt: 'asc' },
    })

    return {
      success: true,
      messages,
    }
  } catch (error) {
    console.error('[GuestSession] Error getting messages:', error)
    return {
      success: false,
      error: 'Failed to get messages',
    }
  }
}

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

/**
 * Get all guest sessions for a chat widget (for admin UI)
 *
 * WHY: Allow admins to see anonymous visitor activity
 * HOW: Query by chatWidgetId with organization scoping
 */
export async function getGuestSessionsForWidget(
  organizationId: string,
  chatWidgetId: string
): Promise<Array<{
  id: string
  isConverted: boolean
  convertedToLeadId: string | null
  lastSeenAt: Date
  createdAt: Date
  _count: { messages: number }
}>> {
  const sessions = await prisma.guestSession.findMany({
    where: {
      organizationId,
      chatWidgetId,
    },
    select: {
      id: true,
      isConverted: true,
      convertedToLeadId: true,
      lastSeenAt: true,
      createdAt: true,
      _count: {
        select: { messages: true },
      },
    },
    orderBy: { lastSeenAt: 'desc' },
  })

  return sessions
}

/**
 * Delete a guest session (hard delete)
 *
 * WHY: Allow cleanup of abandoned sessions
 * HOW: Delete session and all associated messages
 */
export async function deleteGuestSession(
  organizationId: string,
  guestSessionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify session belongs to organization
    const session = await prisma.guestSession.findFirst({
      where: {
        id: guestSessionId,
        organizationId,
      },
    })

    if (!session) {
      return { success: false, error: 'Session not found' }
    }

    // Delete messages first (due to foreign key)
    await prisma.guestMessage.deleteMany({
      where: {
        guestSessionId,
      },
    })

    // Delete the session
    await prisma.guestSession.delete({
      where: { id: guestSessionId },
    })

    return { success: true }
  } catch (error) {
    console.error('[GuestSession] Error deleting session:', error)
    return { success: false, error: 'Failed to delete session' }
  }
}
