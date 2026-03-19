/**
 * APPOINTMENT STARTED TASK (Event-Driven)
 *
 * Trigger.dev delayed task that fires the 'APPOINTMENT_STARTED' automation trigger
 * at exactly the booking's start time.
 *
 * SOURCE OF TRUTH KEYWORDS: AppointmentStartedTask, AppointmentAutomationTrigger
 *
 * WHY THIS REPLACED THE CRON:
 * Previously, a cron job ran every minute polling for bookings that just started.
 * That was wasteful — most runs did nothing. Now, when a booking is created in
 * booking-calendar.service.ts, we schedule a one-off delayed task to fire at
 * exactly the booking's startTime. Same pattern as scheduledFolderDeletionTask.
 *
 * HOW IT WORKS:
 * 1. createBooking() triggers this task with `delay: startTime` (fires at start time)
 * 2. At execution time, task verifies the booking is still CONFIRMED (handles cancellations)
 * 3. Looks up lead by bookerEmail (lead may not exist at booking time)
 * 4. Resumes any waiting automations (wait-for-event pattern) + triggers legacy ones
 *
 * CANCELLATION:
 * - When a booking is cancelled, we cancel this run via runs.cancel()
 * - scheduledStartRunId on CalendarBooking stores the run ID for cancellation
 * - Defense-in-depth: task also verifies CONFIRMED status before firing
 */

import { schemaTask, logger } from '@trigger.dev/sdk'
import { z } from 'zod'
import { triggerAutomation, resumeWaitingAutomationsByEvent } from '@/services/automation.service'
import { isBookingConfirmed } from '@/services/booking-calendar.service'
import { findLeadIdByEmail } from '@/services/leads.service'

// ============================================================================
// SCHEMA
// ============================================================================

/**
 * Input schema for the appointment started task
 * WHY: Minimal data needed — we look up the rest at execution time
 * to ensure we have the freshest state (lead may be created after booking)
 */
const appointmentStartedSchema = z.object({
  bookingId: z.string(),
  bookingCalendarId: z.string(),
  organizationId: z.string(),
  bookerEmail: z.string(),
})

// ============================================================================
// TASK
// ============================================================================

/**
 * Appointment Started Task
 *
 * Delayed task that fires when a booking's start time arrives.
 * Triggered from createBooking() with `delay: startTime`.
 * Verifies booking is still CONFIRMED before firing the automation.
 */
export const appointmentStartedTask = schemaTask({
  id: 'automation-appointment-started',
  description: 'Fire APPOINTMENT_STARTED automation when a booking start time arrives',
  schema: appointmentStartedSchema,
  run: async (input) => {
    const { bookingId, bookingCalendarId, organizationId, bookerEmail } = input

    logger.info('Appointment started task executing', {
      bookingId,
      organizationId,
    })

    // Verify booking still exists and is CONFIRMED
    // WHY: Booking may have been cancelled between scheduling and execution.
    // runs.cancel() handles most cases, but this is defense-in-depth.
    // Delegates to booking-calendar.service.ts for database access
    const booking = await isBookingConfirmed(bookingId, organizationId)

    if (!booking) {
      logger.info('Booking no longer CONFIRMED, skipping automation', {
        bookingId,
      })
      return { triggered: false, reason: 'booking_not_confirmed' }
    }

    // Look up lead by bookerEmail at execution time
    // WHY: Lead may not exist at booking time (e.g., created via form after booking)
    // Delegates to leads.service.ts for database access
    const lead = await findLeadIdByEmail(organizationId, bookerEmail)

    if (!lead) {
      logger.warn('No lead found for booking, skipping automation', {
        bookingId,
        bookerEmail,
        organizationId,
      })
      return { triggered: false, reason: 'no_lead_found' }
    }

    // ── NEW PATTERN: Resume automations using wait-for-event ──
    // Finds all APPOINTMENT_SCHEDULED automations that have a wait_for_event node
    // paused with token `appt_start:{bookingId}:*` and resumes them.
    const resumedCount = await resumeWaitingAutomationsByEvent(
      `appt_start:${bookingId}:`,
      {
        type: 'APPOINTMENT_STARTED',
        appointmentId: bookingId,
        calendarId: bookingCalendarId,
      }
    )

    logger.info('Resumed waiting automations for appointment', {
      bookingId,
      resumedCount,
    })

    // ── LEGACY PATTERN: Trigger APPOINTMENT_STARTED automations directly ──
    // Backward compat — existing automations using the APPOINTMENT_STARTED trigger
    // (deprecated from UI but still functional) continue to fire normally.
    const result = await triggerAutomation('APPOINTMENT_STARTED', {
      organizationId,
      leadId: lead.id,
      triggerData: {
        type: 'APPOINTMENT_STARTED',
        appointmentId: bookingId,
        calendarId: bookingCalendarId,
      },
    })

    logger.info('Triggered APPOINTMENT_STARTED automation (legacy)', {
      bookingId,
      leadId: lead.id,
      triggered: result.triggered,
      automationIds: result.automationIds,
    })

    return {
      triggered: result.triggered > 0 || resumedCount > 0,
      automationsTriggered: result.triggered,
      automationsResumed: resumedCount,
      automationIds: result.automationIds,
      bookingId,
      leadId: lead.id,
    }
  },
})
