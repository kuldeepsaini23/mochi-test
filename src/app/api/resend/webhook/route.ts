/**
 * RESEND WEBHOOK HANDLER - Inbound Email Processing
 *
 * WHY: Receive and process inbound emails from leads via Resend
 * HOW: Verifies webhook signature using Svix, routes to service layer handlers
 *
 * SETUP REQUIREMENTS:
 * 1. Configure MX records for your domain to point to Resend
 * 2. Add webhook URL in Resend dashboard: https://yourdomain.com/api/resend/webhook
 * 3. Set RESEND_WEBHOOK_SECRET environment variable from webhook details page
 *
 * EVENTS HANDLED:
 * - email.received: Inbound email from external sender
 * - email.sent/delivered/bounced/etc: Outbound email status updates
 *
 * SOURCE OF TRUTH KEYWORDS: ResendWebhookRoute, InboundEmailRoute
 */

import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { Webhook } from 'svix'
import {
  handleResendWebhookEvent,
  ResendWebhookEvent,
} from '@/services/resend-webhook.service'

/**
 * Webhook secret for signature verification
 * Get this from your Resend webhook details page
 */
const webhookSecret = process.env.RESEND_WEBHOOK_SECRET

/**
 * POST handler for Resend webhook events
 *
 * FLOW:
 * 1. Get raw request body (required for signature verification)
 * 2. Extract Svix headers for verification
 * 3. Verify webhook signature using Svix library
 * 4. Route verified event to appropriate handler
 * 5. Return success/error response
 */
export async function POST(req: Request) {
  // Check if webhook secret is configured
  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    )
  }

  // Get raw body as string (required for signature verification)
  const payload = await req.text()

  // Get Svix headers for verification
  const headersList = await headers()
  const svixId = headersList.get('svix-id')
  const svixTimestamp = headersList.get('svix-timestamp')
  const svixSignature = headersList.get('svix-signature')

  // Validate required headers are present
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: 'Missing webhook verification headers' },
      { status: 400 }
    )
  }

  let event: ResendWebhookEvent

  // Verify webhook signature using Svix library
  try {
    const wh = new Webhook(webhookSecret)
    event = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ResendWebhookEvent
  } catch (err) {
    // Log the detailed error server-side; never expose webhook internals to the client
    console.error('[Resend Webhook] Signature verification failed:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: 'Invalid webhook signature' },
      { status: 400 }
    )
  }

  // Process the event
  try {
    const result = await handleResendWebhookEvent(event)

    if (!result.success) {
      // Return 200 to prevent retries for known issues
    }

    return NextResponse.json({ received: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}

/**
 * GET handler - Webhook health check endpoint
 *
 * WHY: Allow testing that the webhook URL is accessible
 */
export async function GET() {
  // Do NOT expose whether the webhook secret is configured —
  // that leaks infrastructure details to unauthenticated callers.
  return NextResponse.json({
    status: 'ok',
    message: 'Resend webhook endpoint is active',
  })
}
