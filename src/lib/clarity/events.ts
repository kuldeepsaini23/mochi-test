/**
 * Microsoft Clarity Analytics — Event Helpers
 *
 * WHY: Provides type-safe, non-blocking wrappers for firing Clarity events
 *      and tagging sessions. All calls are fire-and-forget — they never throw
 *      and never block the calling code.
 *
 * HOW: Each helper wraps the Clarity SDK method in a try/catch so callers
 *      don't need to worry about Clarity being uninitialized or unavailable.
 *
 * USAGE:
 *   import { trackEvent, setTag, identifyUser } from '@/lib/clarity/events'
 *   trackEvent('payment_completed')
 *   setTag('plan', 'pro')
 *   identifyUser('user-123', 'John Doe')
 *
 * SOURCE OF TRUTH: ClarityEvents, ClarityAnalytics, ClarityTracking
 */

import Clarity from '@microsoft/clarity'

// ============================================================================
// EVENT NAMES — All custom events tracked in Clarity
// ============================================================================

/**
 * Centralized event name constants.
 * Using constants prevents typos and makes it easy to see all tracked events.
 */
export const CLARITY_EVENTS = {
  /** User signed in successfully */
  SIGN_IN: 'sign_in',
  /** New lead created from leads page */
  LEAD_CREATED: 'lead_created',
  /** Public form submitted (any form) */
  FORM_SUBMITTED: 'form_submitted',
  /** Appointment booked via booking calendar */
  APPOINTMENT_BOOKED: 'appointment_booked',
  /** Payment completed (pay link or embedded checkout) */
  PAYMENT_COMPLETED: 'payment_completed',
  /** Contract signed by recipient */
  CONTRACT_SIGNED: 'contract_signed',
  /** Contract sent to recipient */
  CONTRACT_SENT: 'contract_sent',
  /** New automation created */
  AUTOMATION_CREATED: 'automation_created',
  /** Website page published */
  PAGE_PUBLISHED: 'page_published',
  /** Pipeline ticket/deal created */
  TICKET_CREATED: 'ticket_created',
  /** Invoice created */
  INVOICE_CREATED: 'invoice_created',
  /** Invoice sent to recipient */
  INVOICE_SENT: 'invoice_sent',
  /** Email sent from inbox */
  EMAIL_SENT: 'email_sent',
} as const

// ============================================================================
// FIRE-AND-FORGET HELPERS
// ============================================================================

/**
 * Fire a custom Clarity event (non-blocking).
 * Safe to call even if Clarity hasn't initialized — silently no-ops.
 */
export function trackEvent(eventName: string): void {
  try {
    Clarity.event(eventName)
  } catch {
    // Non-blocking — Clarity may not be initialized yet
  }
}

/**
 * Set a custom tag on the current Clarity session (non-blocking).
 * Tags appear in Clarity's filtering dashboard.
 */
export function setTag(key: string, value: string | string[]): void {
  try {
    Clarity.setTag(key, value)
  } catch {
    // Non-blocking
  }
}

/**
 * Identify the current user in Clarity (non-blocking).
 * Links the session to a user ID so you can filter by user in the dashboard.
 *
 * @param userId - Unique user identifier (hashed client-side by Clarity)
 * @param friendlyName - Display name shown in Clarity dashboard
 */
export function identifyUser(userId: string, friendlyName?: string): void {
  try {
    Clarity.identify(userId, undefined, undefined, friendlyName)
  } catch {
    // Non-blocking
  }
}

/**
 * Upgrade the current session priority in Clarity (non-blocking).
 * Ensures this session is kept even if daily recording limits are hit.
 */
export function upgradeSession(reason: string): void {
  try {
    Clarity.upgrade(reason)
  } catch {
    // Non-blocking
  }
}
