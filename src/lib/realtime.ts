/**
 * Upstash Realtime Configuration
 *
 * WHY: Production-grade realtime events via true pub/sub
 * HOW: Uses @upstash/realtime with Redis Streams + SSE
 *
 * USAGE:
 * - Server: await realtime.emit('inbox.emailReceived', payload)
 * - Client: useRealtime({ events: ['inbox.emailReceived'], onData: ... })
 *
 * SOURCE OF TRUTH KEYWORDS: RealtimeSchema, RealtimeEvents, RealtimePubSub
 */

import { Realtime, InferRealtimeEvents } from '@upstash/realtime'
import { redis } from './redis'
import { z } from 'zod'

// ============================================================================
// REALTIME EVENT SCHEMA
// ============================================================================

/**
 * Lead info schema for events that include lead data
 */
const leadSchema = z.object({
  id: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
})

/**
 * All realtime events organized by domain
 * Format: domain.eventName
 *
 * SOURCE OF TRUTH KEYWORDS: RealtimeEventSchema
 */
const schema = {
  // Inbox events
  inbox: {
    /** Inbound email received from lead */
    emailReceived: z.object({
      organizationId: z.string(),
      conversationId: z.string(),
      messageId: z.string(),
      leadId: z.string(),
      lead: leadSchema,
      preview: z.string(),
      subject: z.string().nullable(),
    }),

    /** Outbound email sent by team */
    emailSent: z.object({
      organizationId: z.string(),
      conversationId: z.string(),
      messageId: z.string(),
    }),

    /** Email delivery status changed */
    emailStatusChanged: z.object({
      organizationId: z.string(),
      conversationId: z.string(),
      messageId: z.string(),
      status: z.enum(['SENT', 'DELIVERED', 'OPENED', 'BOUNCED', 'FAILED']),
    }),

    /** Chat message received from widget visitor */
    chatReceived: z.object({
      organizationId: z.string(),
      conversationId: z.string(),
      messageId: z.string(),
      leadId: z.string(),
      lead: leadSchema,
      preview: z.string(),
    }),

    /** Chat reply sent by team */
    chatSent: z.object({
      organizationId: z.string(),
      conversationId: z.string(),
      messageId: z.string(),
      leadId: z.string(),
      body: z.string(),
      senderName: z.string().nullable(),
    }),

    /** Conversation updated (read, starred, archived) */
    conversationUpdated: z.object({
      organizationId: z.string(),
      conversationId: z.string(),
      hasUnread: z.boolean(),
      isStarred: z.boolean(),
      isArchived: z.boolean(),
    }),

    /**
     * Session merged - guest conversation merged into existing lead
     *
     * WHY: When a guest provides email that matches an existing lead,
     *      the anonymous conversation is deleted and messages are transferred.
     *      Inbox UI needs to remove the deleted conversation and refresh target.
     *
     * SOURCE OF TRUTH KEYWORDS: SessionMerged, GuestMerge, ConversationMerge
     */
    sessionMerged: z.object({
      organizationId: z.string(),
      /** The anonymous conversation that was deleted */
      deletedConversationId: z.string().nullable(),
      /** The anonymous lead that was deleted */
      deletedLeadId: z.string(),
      /** The existing lead that received the messages */
      targetLeadId: z.string(),
      /** The conversation that received the merged messages */
      targetConversationId: z.string().nullable(),
      /** Lead info for UI update */
      targetLead: leadSchema,
    }),

    /**
     * Lead identified - guest provided their info (converted to named lead)
     *
     * WHY: When a guest provides their info but email is NEW (not existing),
     *      the anonymous lead is updated with real info.
     *      Inbox sidebar needs to show updated lead name.
     *
     * SOURCE OF TRUTH KEYWORDS: LeadIdentified, GuestIdentified
     */
    leadIdentified: z.object({
      organizationId: z.string(),
      conversationId: z.string().nullable(),
      leadId: z.string(),
      lead: leadSchema,
    }),
  },

  // Lead events
  leads: {
    /** New lead created */
    created: z.object({
      organizationId: z.string(),
      leadId: z.string(),
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
      email: z.string(),
      source: z.string(),
    }),

    /** Lead updated */
    updated: z.object({
      organizationId: z.string(),
      leadId: z.string(),
      updatedFields: z.array(z.string()),
    }),
  },

  // Onboarding events
  onboarding: {
    /**
     * Organization created after payment - onboarding complete
     *
     * WHY: Replaces polling in payment step with instant real-time notification
     * HOW: Emitted from Stripe webhook when organization is created
     *
     * SOURCE OF TRUTH KEYWORDS: OnboardingComplete, PaymentSuccess
     */
    completed: z.object({
      userId: z.string(),
      organizationId: z.string(),
      organizationName: z.string(),
    }),
  },

  // Notification events
  notifications: {
    /** New notification created for a specific user */
    created: z.object({
      organizationId: z.string(),
      /** The user this notification belongs to — clients filter by this */
      userId: z.string(),
      notificationId: z.string(),
      title: z.string(),
      body: z.string(),
      category: z.string(),
      actionUrl: z.string().optional(),
    }),

    /** Notification marked as read */
    read: z.object({
      organizationId: z.string(),
      notificationId: z.string(),
    }),
  },

  /**
   * Permission and role update events
   *
   * WHY: Critical for security - users must see permission changes in real-time
   * HOW: Events are scoped by targetUserId for security (only the affected user receives)
   *
   * FLOW:
   * 1. Admin updates member's role/permissions
   * 2. Server emits 'permissions.memberUpdated' event
   * 3. Affected user's client receives event and invalidates permission cache
   * 4. UI immediately reflects new permissions (buttons hidden/shown, access denied, etc.)
   *
   * SECURITY:
   * - Events include targetUserId - client filters to only process relevant events
   * - New permissions are NOT included in event - client must refetch from server
   * - This prevents permission spoofing via websocket inspection
   *
   * SOURCE OF TRUTH KEYWORDS: PermissionRealtime, RoleUpdate, PermissionSync
   */
  permissions: {
    /**
     * Member's role or permissions were updated
     *
     * WHEN: updateMemberPermissions mutation completes
     * WHO: The member whose permissions changed
     */
    memberUpdated: z.object({
      organizationId: z.string(),
      targetUserId: z.string(),
      memberId: z.string(),
      role: z.string(),
      /** ISO timestamp for cache busting */
      updatedAt: z.string(),
    }),

    /**
     * A reusable role definition was updated
     *
     * WHEN: updateRole mutation completes
     * WHO: All members who have this role assigned
     *
     * Note: Client must fetch fresh permissions since we don't send permissions
     * in the event (security: prevents permission spoofing)
     */
    roleUpdated: z.object({
      organizationId: z.string(),
      roleId: z.string(),
      roleName: z.string(),
      /** All user IDs that have this role - each should refresh their permissions */
      affectedUserIds: z.array(z.string()),
      updatedAt: z.string(),
    }),

    /**
     * Member was removed from organization
     *
     * WHEN: removeMember mutation completes
     * WHO: The removed member - should redirect out of org
     */
    memberRemoved: z.object({
      organizationId: z.string(),
      targetUserId: z.string(),
      memberId: z.string(),
      removedAt: z.string(),
    }),
  },

  /**
   * Payment events for real-time receipt rendering
   *
   * WHY: After Stripe payment, customer is redirected to confirmation page
   *      BEFORE the webhook finishes processing. Instead of expensive polling,
   *      we emit a realtime event when the TransactionPayment is created with
   *      SUCCEEDED status. The receipt element listens for this and fetches once.
   *
   * FLOW:
   * 1. Customer pays → redirected to confirmation page with ?transactionId=xxx
   * 2. Receipt element mounts → subscribes to payments.completed
   * 3. Webhook fires → completeTransaction/handleSubscriptionPayment → emits event
   * 4. Receipt element receives event → single tRPC fetch → renders receipt
   *
   * SOURCE OF TRUTH KEYWORDS: PaymentRealtime, ReceiptRealtime, PaymentCompleted
   */
  payments: {
    /** TransactionPayment created with SUCCEEDED status */
    completed: z.object({
      organizationId: z.string(),
      transactionId: z.string(),
    }),
  },

  /**
   * Chat typing indicator events
   *
   * WHY: Real-time typing feedback for chat conversations
   * HOW: Lightweight events with minimal data for performance
   *
   * SECURITY:
   * - teamTyping: Does NOT include team member name/info (anonymous to visitor)
   * - visitorTyping: Only sent to authorized inbox users
   *
   * SOURCE OF TRUTH KEYWORDS: ChatTyping, TypingIndicator
   */
  chat: {
    /**
     * Team member is typing in inbox
     *
     * SECURITY: No team member info exposed - just shows "typing..." to visitor
     */
    teamTyping: z.object({
      organizationId: z.string(),
      conversationId: z.string(),
      leadId: z.string(),
      isTyping: z.boolean(),
    }),

    /**
     * Visitor is typing in chat widget
     *
     * Shown to team members in inbox
     */
    visitorTyping: z.object({
      organizationId: z.string(),
      conversationId: z.string(),
      leadId: z.string(),
      isTyping: z.boolean(),
    }),
  },
}

// ============================================================================
// REALTIME INSTANCE
// ============================================================================

/**
 * Realtime pub/sub instance
 *
 * USAGE (Server):
 * ```ts
 * import { realtime } from '@/lib/realtime'
 * await realtime.emit('inbox.emailReceived', { organizationId, ... })
 * ```
 */
export const realtime = new Realtime({ schema, redis })

/**
 * Type for all realtime events (for client-side typed hooks)
 */
export type RealtimeEvents = InferRealtimeEvents<typeof realtime>
