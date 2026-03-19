/**
 * Inbox Types - SOURCE OF TRUTH
 *
 * WHY: Centralized type definitions for the unified inbox feature
 * HOW: Defines message types, channel types, conversation threads, and related interfaces
 *
 * NOTE: These types are designed to work with both the Prisma models and the UI components.
 * The Prisma models use UPPERCASE enums, while UI uses lowercase for display.
 *
 * SOURCE OF TRUTH KEYWORDS: InboxMessage, MessageChannel, InboxFilter, Conversation, ConversationMessage
 */

import type {
  MessageChannel as PrismaMessageChannel,
  MessageDirection as PrismaMessageDirection,
  MessageStatus as PrismaMessageStatus,
  Conversation as PrismaConversation,
  Message as PrismaMessage,
  Lead as PrismaLead,
} from '@/generated/prisma'

// ============================================================================
// CHANNEL AND DIRECTION TYPES
// ============================================================================

/**
 * Supported communication channels for the unified inbox (lowercase for UI)
 * SOURCE OF TRUTH KEYWORDS: MessageChannel, InboxChannel, CHATBOT
 */
export type MessageChannel = 'email' | 'instagram' | 'sms' | 'internal' | 'form' | 'chatbot'

/**
 * Message direction - inbound from lead or outbound from us (lowercase for UI)
 */
export type MessageDirection = 'inbound' | 'outbound'

/**
 * Map Prisma MessageChannel to UI MessageChannel
 */
export function mapPrismaChannelToUI(
  channel: PrismaMessageChannel
): MessageChannel {
  const mapping: Record<PrismaMessageChannel, MessageChannel> = {
    EMAIL: 'email',
    INSTAGRAM: 'instagram',
    SMS: 'sms',
    INTERNAL: 'internal',
    FORM: 'form',
    CHATBOT: 'chatbot',
  }
  return mapping[channel]
}

/**
 * Map UI MessageChannel to Prisma MessageChannel
 */
export function mapUIChannelToPrisma(
  channel: MessageChannel
): PrismaMessageChannel {
  const mapping: Record<MessageChannel, PrismaMessageChannel> = {
    email: 'EMAIL',
    instagram: 'INSTAGRAM',
    sms: 'SMS',
    internal: 'INTERNAL',
    form: 'FORM',
    chatbot: 'CHATBOT',
  }
  return mapping[channel]
}

/**
 * Map Prisma MessageDirection to UI MessageDirection
 */
export function mapPrismaDirectionToUI(
  direction: PrismaMessageDirection
): MessageDirection {
  return direction === 'INBOUND' ? 'inbound' : 'outbound'
}

/**
 * Email delivery status (lowercase for UI)
 * WHY: Track delivery lifecycle for outbound emails
 * SOURCE OF TRUTH KEYWORDS: MessageStatus, EmailStatus
 */
export type MessageStatus =
  | 'draft'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'failed'
  | 'bounced'

/**
 * Map Prisma MessageStatus to UI MessageStatus
 */
export function mapPrismaStatusToUI(
  status: PrismaMessageStatus
): MessageStatus {
  const mapping: Record<PrismaMessageStatus, MessageStatus> = {
    DRAFT: 'draft',
    QUEUED: 'queued',
    SENT: 'sent',
    DELIVERED: 'delivered',
    OPENED: 'opened',
    FAILED: 'failed',
    BOUNCED: 'bounced',
  }
  return mapping[status]
}

// ============================================================================
// LEAD TYPES
// ============================================================================

/**
 * Lead/Contact information - the person we're communicating with (UI format)
 */
export interface Lead {
  id: string
  name: string
  email?: string
  avatar?: string
  handle?: string
}

/**
 * Convert Prisma Lead to UI Lead format
 */
export function mapPrismaLeadToUI(
  lead: Pick<PrismaLead, 'id' | 'firstName' | 'lastName' | 'email' | 'avatarUrl'>
): Lead {
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unknown'
  return {
    id: lead.id,
    name,
    email: lead.email,
    avatar: lead.avatarUrl ?? undefined,
  }
}

// ============================================================================
// MESSAGE TYPES
// ============================================================================

/**
 * Individual message within a conversation thread (UI format)
 * Can be from any channel and either direction
 */
export interface ConversationMessage {
  id: string
  channel: MessageChannel
  direction: MessageDirection
  /** Subject line (primarily for emails) */
  subject?: string
  /** Message content */
  body: string
  /** HTML body for rich email content */
  bodyHtml?: string
  /** Short preview text for collapsed emails */
  preview?: string
  /** Sender name (for emails) */
  fromName?: string
  /** Sender email (for emails) */
  fromEmail?: string
  timestamp: Date
  isRead: boolean
  hasAttachment?: boolean
  /** Email delivery status for outbound messages */
  status?: MessageStatus
  /** Attachments for the message */
  attachments?: Array<{ id: string; filename: string; mimeType: string; size: number; url: string }>
  /** Flag for optimistic UI - message not yet confirmed by server */
  isOptimistic?: boolean
}

/**
 * Convert Prisma Message to UI ConversationMessage format
 */
export function mapPrismaMessageToUI(message: PrismaMessage): ConversationMessage {
  return {
    id: message.id,
    channel: mapPrismaChannelToUI(message.channel),
    direction: mapPrismaDirectionToUI(message.direction),
    subject: message.subject ?? undefined,
    body: message.body,
    bodyHtml: message.bodyHtml ?? undefined,
    preview: message.body.slice(0, 100) + (message.body.length > 100 ? '...' : ''),
    timestamp: message.sentAt,
    isRead: message.isRead,
    hasAttachment: message.attachments !== null,
    status: mapPrismaStatusToUI(message.status),
  }
}

// ============================================================================
// CONVERSATION TYPES
// ============================================================================

/**
 * Conversation thread with a lead - contains all messages across channels (UI format)
 */
export interface Conversation {
  id: string
  lead: Lead
  messages: ConversationMessage[]
  /** Most recent message for preview in sidebar */
  lastMessage: ConversationMessage
  /** Whether the conversation has any unread messages */
  hasUnread: boolean
  isStarred: boolean
}

/**
 * Prisma conversation with lead and messages included
 */
export type PrismaConversationWithDetails = PrismaConversation & {
  lead: Pick<PrismaLead, 'id' | 'firstName' | 'lastName' | 'email' | 'avatarUrl'>
  messages?: PrismaMessage[]
}

/**
 * Serialized conversation type from tRPC (dates are strings after JSON serialization)
 * WHY: tRPC serializes Date objects to ISO strings over the network
 * HOW: This type mirrors PrismaConversationWithDetails but with string dates
 * SOURCE OF TRUTH KEYWORDS: SerializedConversation, tRPC serialization
 */
export type SerializedConversation = {
  id: string
  organizationId: string
  leadId: string
  subject: string | null
  isStarred: boolean
  isArchived: boolean
  hasUnread: boolean
  lastReadAt: string | null
  lastMessageAt: string
  lastMessagePreview: string | null
  primaryChannel: PrismaMessageChannel
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  lead: Pick<PrismaLead, 'id' | 'firstName' | 'lastName' | 'email' | 'avatarUrl'>
  messages?: SerializedMessage[]
}

/**
 * Serialized message type from tRPC (dates are strings after JSON serialization)
 */
export type SerializedMessage = {
  id: string
  conversationId: string
  organizationId: string
  channel: PrismaMessageChannel
  direction: PrismaMessageDirection
  subject: string | null
  body: string
  bodyHtml: string | null
  fromName: string | null
  fromEmail: string | null
  toEmail: string | null
  resendMessageId: string | null
  externalId: string | null
  isRead: boolean
  status: string
  attachments: unknown
  sentAt: string
  createdAt: string
  updatedAt: string
}

/**
 * Convert Prisma Conversation to UI Conversation format
 */
export function mapPrismaConversationToUI(
  conv: PrismaConversationWithDetails
): Conversation {
  const lead = mapPrismaLeadToUI(conv.lead)
  const messages = (conv.messages || []).map(mapPrismaMessageToUI)
  const lastMessage: ConversationMessage = messages.length > 0
    ? messages[messages.length - 1]
    : {
        id: 'placeholder',
        channel: mapPrismaChannelToUI(conv.primaryChannel),
        direction: 'inbound',
        body: conv.lastMessagePreview || '',
        timestamp: conv.lastMessageAt,
        isRead: !conv.hasUnread,
      }

  return {
    id: conv.id,
    lead,
    messages,
    lastMessage,
    hasUnread: conv.hasUnread,
    isStarred: conv.isStarred,
  }
}

/**
 * Convert serialized message from tRPC to UI ConversationMessage format
 * WHY: tRPC serializes Date objects to ISO strings, this converts them back
 */
export function mapSerializedMessageToUI(message: SerializedMessage): ConversationMessage {
  return {
    id: message.id,
    channel: mapPrismaChannelToUI(message.channel),
    direction: mapPrismaDirectionToUI(message.direction),
    subject: message.subject ?? undefined,
    body: message.body,
    bodyHtml: message.bodyHtml ?? undefined,
    preview: message.body.slice(0, 100) + (message.body.length > 100 ? '...' : ''),
    timestamp: new Date(message.sentAt),
    isRead: message.isRead,
    hasAttachment: message.attachments !== null,
    status: message.status.toLowerCase() as MessageStatus,
  }
}

/**
 * Convert serialized conversation from tRPC to UI Conversation format
 * WHY: tRPC serializes Date objects to ISO strings, this converts them back
 * SOURCE OF TRUTH KEYWORDS: mapSerializedConversationToUI, tRPC to UI conversion
 */
export function mapSerializedConversationToUI(
  conv: SerializedConversation
): Conversation {
  const lead = mapPrismaLeadToUI(conv.lead)
  const messages = (conv.messages || []).map(mapSerializedMessageToUI)
  const lastMessage: ConversationMessage = messages.length > 0
    ? messages[messages.length - 1]
    : {
        id: 'placeholder',
        channel: mapPrismaChannelToUI(conv.primaryChannel),
        direction: 'inbound',
        body: conv.lastMessagePreview || '',
        timestamp: new Date(conv.lastMessageAt),
        isRead: !conv.hasUnread,
      }

  return {
    id: conv.id,
    lead,
    messages,
    lastMessage,
    hasUnread: conv.hasUnread,
    isStarred: conv.isStarred,
  }
}

// ============================================================================
// INBOX MESSAGE TYPE (SIDEBAR DISPLAY)
// ============================================================================

/**
 * Core inbox message interface - for sidebar display
 * Represents the latest message preview for a conversation
 */
export interface InboxMessage {
  id: string
  conversationId: string
  channel: MessageChannel
  sender: Lead
  subject: string
  preview: string
  body: string
  isRead: boolean
  isStarred: boolean
  receivedAt: Date
  hasAttachment?: boolean
}

/**
 * Convert Prisma Conversation to InboxMessage for sidebar display
 */
export function mapPrismaConversationToInboxMessage(
  conv: PrismaConversationWithDetails
): InboxMessage {
  const lead = mapPrismaLeadToUI(conv.lead)
  const preview = conv.lastMessagePreview || ''

  return {
    id: conv.id, // Use conversation ID as message ID for sidebar
    conversationId: conv.id,
    channel: mapPrismaChannelToUI(conv.primaryChannel),
    sender: lead,
    subject: conv.subject || lead.name,
    preview: preview.slice(0, 80) + (preview.length > 80 ? '...' : ''),
    body: preview,
    isRead: !conv.hasUnread,
    isStarred: conv.isStarred,
    receivedAt: conv.lastMessageAt,
    hasAttachment: false, // TODO: Track attachment status at conversation level
  }
}

/**
 * Convert serialized conversation from tRPC to InboxMessage for sidebar display
 * WHY: tRPC serializes Date objects to ISO strings, this converts them back
 * SOURCE OF TRUTH KEYWORDS: mapSerializedConversationToInboxMessage, tRPC sidebar
 */
export function mapSerializedConversationToInboxMessage(
  conv: SerializedConversation
): InboxMessage {
  const lead = mapPrismaLeadToUI(conv.lead)
  const preview = conv.lastMessagePreview || ''

  return {
    id: conv.id,
    conversationId: conv.id,
    channel: mapPrismaChannelToUI(conv.primaryChannel),
    sender: lead,
    subject: conv.subject || lead.name,
    preview: preview.slice(0, 80) + (preview.length > 80 ? '...' : ''),
    body: preview,
    isRead: !conv.hasUnread,
    isStarred: conv.isStarred,
    receivedAt: new Date(conv.lastMessageAt),
    hasAttachment: false,
  }
}

// ============================================================================
// FILTER TYPES
// ============================================================================

/**
 * Simple filter state - All or Unopened only
 */
export type InboxFilterStatus = 'all' | 'unopened'
