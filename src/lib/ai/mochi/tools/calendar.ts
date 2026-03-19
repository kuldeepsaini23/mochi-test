/**
 * ============================================================================
 * MOCHI AI TOOLS - CALENDAR
 * ============================================================================
 *
 * Vercel AI SDK tool definitions for calendar event management.
 * Supports creating, updating, deleting, and querying calendar events.
 *
 * SECURITY: All operations route through tRPC caller to enforce permissions
 * (CALENDAR_READ, CALENDAR_CREATE, CALENDAR_UPDATE, CALENDAR_DELETE) instead
 * of calling service functions directly.
 *
 * SOURCE OF TRUTH KEYWORDS: MochiCalendarTools, AICalendarManagement
 * ============================================================================
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { TRPCCaller } from '@/trpc/server'
import { handleToolError } from './tool-error'

/**
 * Creates all calendar-related tools bound to the given organization.
 * Routes through tRPC caller for permission enforcement.
 */
export function createCalendarTools(organizationId: string, caller: TRPCCaller) {
  return {
    /**
     * Create a new calendar event.
     * Accepts ISO date strings from the AI model and passes them to the tRPC
     * procedure which uses z.coerce.date() for automatic conversion.
     *
     * tRPC route: caller.calendar.create — enforces CALENDAR_CREATE permission.
     */
    createCalendarEvent: tool({
      description:
        'Create a new calendar event or meeting. Use this when the user wants to schedule something, ' +
        'add an event, or create a reminder on their calendar. ' +
        'Dates must be in ISO 8601 format (e.g., "2026-03-01T10:00:00Z").',
      inputSchema: z.object({
        title: z.string().describe('Event title (e.g., "Follow up with Acme")'),
        description: z.string().optional().describe('Event description or notes'),
        startDate: z.string().describe('Start date/time in ISO 8601 format (e.g., "2026-03-01T10:00:00Z")'),
        endDate: z.string().describe('End date/time in ISO 8601 format (e.g., "2026-03-01T11:00:00Z")'),
      }),
      execute: async (params) => {
        try {
          /**
           * Pass ISO strings directly — the tRPC createEventSchema uses
           * z.coerce.date() which handles string-to-Date conversion.
           */
          const event = await caller.calendar.create({
            organizationId,
            title: params.title,
            description: params.description,
            startDate: new Date(params.startDate),
            endDate: new Date(params.endDate),
          })
          return {
            success: true,
            eventId: event.id,
            title: event.title,
            startDate: event.startDate.toISOString(),
            endDate: event.endDate.toISOString(),
            message: `Created event "${params.title}" (ID: ${event.id})`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('createCalendarEvent', err)
        }
      },
    }),

    /**
     * Update a calendar event — only provide the fields you want to change.
     * The tRPC update procedure handles ownership verification internally.
     *
     * tRPC route: caller.calendar.update — enforces CALENDAR_UPDATE permission
     * and verifies event ownership.
     */
    updateCalendarEvent: tool({
      description:
        'Update an existing calendar event (change title, description, or dates). ' +
        'Use this when the user wants to rename, reschedule, or edit an event. ' +
        'Only provide the fields you want to change — the eventId is always required. ' +
        'Use the event ID from createCalendarEvent or getUpcomingEvents results.',
      inputSchema: z.object({
        eventId: z.string().describe('The event ID to update (from a previous tool result)'),
        title: z.string().optional().describe('New title for the event'),
        description: z.string().optional().describe('New description for the event'),
        startDate: z.string().optional().describe('New start date/time in ISO 8601 format'),
        endDate: z.string().optional().describe('New end date/time in ISO 8601 format'),
      }),
      execute: async (params) => {
        try {
          /**
           * Build the update input — only include fields the AI actually provided.
           * Convert ISO strings to Date objects for z.coerce.date() in the schema.
           */
          const updateInput: {
            organizationId: string
            eventId: string
            title?: string
            description?: string
            startDate?: Date
            endDate?: Date
          } = {
            organizationId,
            eventId: params.eventId,
          }

          if (params.title !== undefined) updateInput.title = params.title
          if (params.description !== undefined) updateInput.description = params.description
          if (params.startDate) updateInput.startDate = new Date(params.startDate)
          if (params.endDate) updateInput.endDate = new Date(params.endDate)

          const event = await caller.calendar.update(updateInput)
          return {
            success: true,
            eventId: event.id,
            title: event.title,
            startDate: event.startDate.toISOString(),
            endDate: event.endDate.toISOString(),
            message: `Updated event "${event.title}"`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('updateCalendarEvent', err)
        }
      },
    }),

    /**
     * Delete a calendar event permanently — ALWAYS confirm with askUser first.
     *
     * tRPC route: caller.calendar.delete — enforces CALENDAR_DELETE permission
     * and verifies event ownership internally.
     */
    deleteCalendarEvent: tool({
      description:
        'Permanently delete a calendar event. ' +
        'IMPORTANT: Always use askUser to confirm with the user before calling this tool.',
      inputSchema: z.object({
        eventId: z.string().describe('The event ID to delete'),
      }),
      execute: async (params) => {
        try {
          await caller.calendar.delete({
            organizationId,
            eventId: params.eventId,
          })
          return {
            success: true,
            eventId: params.eventId,
            message: 'Deleted calendar event',
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('deleteCalendarEvent', err)
        }
      },
    }),

    /**
     * Get calendar events within a date range.
     * Returns events as JSON-safe objects with ISO string dates.
     *
     * tRPC route: caller.calendar.getByDateRange — enforces CALENDAR_READ permission.
     */
    getUpcomingEvents: tool({
      description:
        'Get calendar events within a date range. Use this to check what events are scheduled ' +
        'for a specific day, week, or month. Dates must be in ISO 8601 format.',
      inputSchema: z.object({
        startDate: z.string().describe('Start of range in ISO 8601 format (e.g., "2026-03-01T00:00:00Z")'),
        endDate: z.string().describe('End of range in ISO 8601 format (e.g., "2026-03-31T23:59:59Z")'),
      }),
      execute: async (params) => {
        try {
          /**
           * The tRPC getByDateRange schema uses z.coerce.date() so we
           * pass Date objects converted from the ISO strings.
           */
          const result = await caller.calendar.getByDateRange({
            organizationId,
            startDate: new Date(params.startDate),
            endDate: new Date(params.endDate),
            limit: 50,
          })
          return {
            success: true,
            events: result.events.map((e) => ({
              id: e.id,
              title: e.title,
              startDate: e.startDate.toISOString(),
              endDate: e.endDate.toISOString(),
              description: e.description,
            })),
            total: result.events.length,
            message: `Found ${result.events.length} events`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('getUpcomingEvents', err)
        }
      },
    }),
  }
}
