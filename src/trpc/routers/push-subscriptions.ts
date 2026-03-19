/**
 * ============================================================================
 * PUSH SUBSCRIPTIONS ROUTER - Web Push Subscription Management
 * ============================================================================
 *
 * tRPC router for managing web push subscriptions for PWA notifications.
 *
 * ALL endpoints are protected via organizationProcedure (requires auth + org membership).
 * No special permission required — every org member can manage their OWN push subscriptions.
 *
 * ENDPOINTS:
 * - subscribe: Save a new push subscription (from PushManager.subscribe on client)
 * - unsubscribe: Remove a push subscription when user opts out
 *
 * SOURCE OF TRUTH KEYWORDS: PushSubscriptionRouter, PushTRPC, PushAPI, WebPushRouter
 */

import { z } from 'zod'
import { createTRPCRouter, organizationProcedure } from '../init'
import {
  savePushSubscription,
  removePushSubscription,
} from '@/lib/push/push.service'

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * Input for subscribing to web push notifications.
 * The client sends the PushSubscription data from the browser's Push API.
 */
const subscribeInput = z.object({
  organizationId: z.string().min(1),
  /** Push service endpoint URL from PushSubscription.endpoint */
  endpoint: z.string().url(),
  /** Client public key from PushSubscription.getKey('p256dh') — base64url encoded */
  p256dh: z.string().min(1),
  /** Shared auth secret from PushSubscription.getKey('auth') — base64url encoded */
  auth: z.string().min(1),
})

/**
 * Input for unsubscribing from web push notifications.
 * Only needs the endpoint to identify which subscription to remove.
 */
const unsubscribeInput = z.object({
  /** Push service endpoint URL that identifies the subscription to remove */
  endpoint: z.string().url(),
})

// ============================================================================
// ROUTER
// ============================================================================

export const pushSubscriptionsRouter = createTRPCRouter({
  /**
   * Save a push subscription for the current user.
   *
   * Called when the client successfully subscribes via PushManager.subscribe().
   * Uses upsert so re-subscribing on the same device updates keys instead of duplicating.
   */
  subscribe: organizationProcedure({})
    .input(subscribeInput)
    .mutation(async ({ ctx, input }) => {
      await savePushSubscription({
        organizationId: input.organizationId,
        userId: ctx.user.id,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
      })
      return { success: true }
    }),

  /**
   * Remove a push subscription for the current user.
   *
   * Called when the user opts out of push notifications or when the
   * client detects the subscription has expired.
   */
  unsubscribe: organizationProcedure({})
    .input(unsubscribeInput)
    .mutation(async ({ ctx, input }) => {
      await removePushSubscription(ctx.user.id, input.endpoint)
      return { success: true }
    }),
})
