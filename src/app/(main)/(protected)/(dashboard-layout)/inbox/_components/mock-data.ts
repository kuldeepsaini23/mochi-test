/**
 * Mock Data for Inbox UI
 *
 * WHY: Provides sample data for UI development with conversation history
 * NOTE: Temporary - will be replaced with real API data
 */

import {
  InboxMessage,
  MessageChannel,
  Conversation,
  ConversationMessage,
  Lead,
} from './types'

/**
 * Helper to generate dates relative to now
 */
function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000)
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

/**
 * Mock leads
 */
const leads: Record<string, Lead> = {
  sarah: {
    id: 's1',
    name: 'Sarah Chen',
    email: 'sarah@techcorp.io',
    avatar: undefined,
  },
  alex: {
    id: 's2',
    name: 'Alex Rivera',
    email: 'alex@email.com',
    handle: '@alexrivera',
  },
  michael: {
    id: 's3',
    name: 'Michael Brown',
    email: 'mbrown@example.com',
  },
  david: {
    id: 's4',
    name: 'David Park',
    email: 'david.park@gmail.com',
  },
  emily: {
    id: 's5',
    name: 'Emily Watson',
    email: 'emily@design.co',
  },
}

/**
 * Mock conversations with full message history
 */
export const mockConversations: Conversation[] = [
  {
    id: 'conv-1',
    lead: leads.sarah,
    isStarred: true,
    hasUnread: true,
    messages: [
      {
        id: 'msg-1-1',
        channel: 'form' as MessageChannel,
        direction: 'inbound',
        subject: 'Contact Form Submission',
        body: 'Hi, I found your website and I\'m interested in learning more about your services. We\'re a mid-size tech company looking for partnership opportunities.',
        preview: 'Hi, I found your website and I\'m interested...',
        timestamp: daysAgo(5),
        isRead: true,
      },
      {
        id: 'msg-1-2',
        channel: 'email' as MessageChannel,
        direction: 'outbound',
        subject: 'Re: Contact Form Submission',
        body: 'Hi Sarah,\n\nThank you for reaching out! I\'d love to learn more about TechCorp and explore how we might work together.\n\nWould you be available for a quick call this week?\n\nBest regards',
        timestamp: daysAgo(4),
        isRead: true,
      },
      {
        id: 'msg-1-3',
        channel: 'email' as MessageChannel,
        direction: 'inbound',
        subject: 'Re: Contact Form Submission',
        body: 'That sounds great! I\'m free Thursday afternoon or Friday morning. Let me know what works best for you.\n\nLooking forward to it!\n\nSarah',
        timestamp: daysAgo(3),
        isRead: true,
      },
      {
        id: 'msg-1-4',
        channel: 'email' as MessageChannel,
        direction: 'outbound',
        subject: 'Re: Contact Form Submission',
        body: 'Perfect! Let\'s do Thursday at 2pm. I\'ll send over a calendar invite.\n\nTalk soon!',
        timestamp: daysAgo(2),
        isRead: true,
      },
      {
        id: 'msg-1-5',
        channel: 'email' as MessageChannel,
        direction: 'inbound',
        subject: 'Partnership Proposal',
        body: 'Hi!\n\nFollowing up on our call - I wanted to reach out regarding the partnership opportunity we discussed. I\'ve attached our proposal document for your review.\n\nKey points:\n- Revenue sharing model\n- Joint marketing initiatives\n- Technical integration support\n\nWould love to schedule a follow-up to discuss the details.\n\nBest,\nSarah',
        preview: 'Hi! I wanted to reach out regarding a potential partnership...',
        timestamp: hoursAgo(0.5),
        isRead: false,
        hasAttachment: true,
      },
    ],
    get lastMessage() {
      return this.messages[this.messages.length - 1]
    },
  },
  {
    id: 'conv-2',
    lead: leads.alex,
    isStarred: false,
    hasUnread: true,
    messages: [
      {
        id: 'msg-2-1',
        channel: 'instagram' as MessageChannel,
        direction: 'inbound',
        body: 'Hey! Just discovered your page and I\'m obsessed with your content 🔥',
        timestamp: daysAgo(2),
        isRead: true,
      },
      {
        id: 'msg-2-2',
        channel: 'instagram' as MessageChannel,
        direction: 'outbound',
        body: 'Thanks so much! Really appreciate the love 🙏',
        timestamp: daysAgo(2),
        isRead: true,
      },
      {
        id: 'msg-2-3',
        channel: 'instagram' as MessageChannel,
        direction: 'inbound',
        body: 'Hey! Love your content. Would you be interested in a collab? I have a product launch coming up and think we\'d be a great fit!',
        preview: 'Hey! Love your content. Would you be interested in a collab?',
        timestamp: hoursAgo(2),
        isRead: false,
      },
    ],
    get lastMessage() {
      return this.messages[this.messages.length - 1]
    },
  },
  {
    id: 'conv-3',
    lead: leads.michael,
    isStarred: false,
    hasUnread: true,
    messages: [
      {
        id: 'msg-3-1',
        channel: 'form' as MessageChannel,
        direction: 'inbound',
        subject: 'Contact Form Submission',
        body: 'Name: Michael Brown\nEmail: mbrown@example.com\nCompany: Brown Industries\n\nMessage: We\'re interested in enterprise pricing for our team of 50+ users. Can you send over more information?',
        preview: 'New inquiry about enterprise pricing...',
        timestamp: hoursAgo(3),
        isRead: false,
        hasAttachment: true,
      },
    ],
    get lastMessage() {
      return this.messages[this.messages.length - 1]
    },
  },
  {
    id: 'conv-4',
    lead: leads.david,
    isStarred: false,
    hasUnread: false,
    messages: [
      {
        id: 'msg-4-1',
        channel: 'email' as MessageChannel,
        direction: 'inbound',
        subject: 'Quick question about pricing',
        body: 'Hi there,\n\nI saw your product and had a quick question about the pricing tiers. Do you offer monthly billing?\n\nThanks,\nDavid',
        timestamp: daysAgo(3),
        isRead: true,
      },
      {
        id: 'msg-4-2',
        channel: 'email' as MessageChannel,
        direction: 'outbound',
        subject: 'Re: Quick question about pricing',
        body: 'Hi David,\n\nYes! We offer both monthly and annual billing. Annual saves you 20%.\n\nLet me know if you have any other questions!',
        timestamp: daysAgo(3),
        isRead: true,
      },
      {
        id: 'msg-4-3',
        channel: 'sms' as MessageChannel,
        direction: 'inbound',
        body: 'Hey, just confirming our meeting tomorrow at 2pm. Still works?',
        preview: 'Confirming our meeting tomorrow at 2pm',
        timestamp: hoursAgo(5),
        isRead: true,
      },
      {
        id: 'msg-4-4',
        channel: 'sms' as MessageChannel,
        direction: 'outbound',
        body: 'Yes! See you then 👍',
        timestamp: hoursAgo(4),
        isRead: true,
      },
    ],
    get lastMessage() {
      return this.messages[this.messages.length - 1]
    },
  },
  {
    id: 'conv-5',
    lead: leads.emily,
    isStarred: true,
    hasUnread: false,
    messages: [
      {
        id: 'msg-5-1',
        channel: 'email' as MessageChannel,
        direction: 'outbound',
        subject: 'Design Project Kickoff',
        body: 'Hi Emily,\n\nExcited to kick off this project! Here are the initial requirements we discussed.\n\nLooking forward to seeing your ideas!',
        timestamp: daysAgo(10),
        isRead: true,
      },
      {
        id: 'msg-5-2',
        channel: 'email' as MessageChannel,
        direction: 'inbound',
        subject: 'Re: Design Project Kickoff',
        body: 'Thanks! I\'ll have some initial concepts ready by end of week.',
        timestamp: daysAgo(9),
        isRead: true,
      },
      {
        id: 'msg-5-3',
        channel: 'internal' as MessageChannel,
        direction: 'inbound',
        body: 'Note: Emily submitted first draft designs via file upload.',
        timestamp: daysAgo(7),
        isRead: true,
      },
      {
        id: 'msg-5-4',
        channel: 'email' as MessageChannel,
        direction: 'inbound',
        subject: 'Project Deliverables',
        body: 'Hi!\n\nThe final designs are ready for review. I\'ve attached all the files including:\n\n- Homepage mockups (3 variants)\n- Mobile responsive versions\n- Component library\n- Style guide PDF\n\nPlease review and let me know if any changes are needed.\n\nThanks,\nEmily',
        preview: 'The final designs are ready for review...',
        timestamp: hoursAgo(8),
        isRead: true,
        hasAttachment: true,
      },
    ],
    get lastMessage() {
      return this.messages[this.messages.length - 1]
    },
  },
]

/**
 * Convert conversations to inbox messages for sidebar display
 * Each inbox message represents a conversation's latest activity
 */
export const mockMessages: InboxMessage[] = mockConversations.map((conv) => ({
  id: conv.lastMessage.id,
  conversationId: conv.id,
  channel: conv.lastMessage.channel,
  sender: conv.lead,
  subject: conv.lastMessage.subject || conv.lead.name,
  preview: conv.lastMessage.preview || conv.lastMessage.body.slice(0, 80) + '...',
  body: conv.lastMessage.body,
  isRead: !conv.hasUnread,
  isStarred: conv.isStarred,
  receivedAt: conv.lastMessage.timestamp,
  hasAttachment: conv.lastMessage.hasAttachment,
})).sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())

/**
 * Get conversation by ID
 */
export function getConversationById(id: string): Conversation | undefined {
  return mockConversations.find((c) => c.id === id)
}

/**
 * Get conversation by message ID
 */
export function getConversationByMessageId(messageId: string): Conversation | undefined {
  return mockConversations.find((c) =>
    c.messages.some((m) => m.id === messageId)
  )
}

/**
 * Get unread count
 */
export function getUnreadCount(): number {
  return mockConversations.filter((c) => c.hasUnread).length
}
