/**
 * ============================================================================
 * LEAD SESSION ROUTER - Sticky Forms / Lead Identification
 * ============================================================================
 *
 * tRPC router for lead session management (sticky forms feature).
 * Enables identifying returning visitors across forms, chat widgets,
 * and embedded components.
 *
 * PUBLIC ENDPOINTS (no auth required):
 * - create: Create or retrieve a session for a lead
 * - validate: Validate a session token and get lead data
 * - updateLead: Update lead data using a valid session token
 *
 * PROTECTED ENDPOINTS (admin only):
 * - listForLead: List all sessions for a lead
 * - delete: Delete a session
 *
 * SOURCE OF TRUTH KEYWORDS: LeadSession, StickyForm, LeadIdentification
 */

import { z } from 'zod'
import {
  createTRPCRouter,
  baseProcedure,
  organizationProcedure,
} from '../init'
import { permissions } from '@/lib/better-auth/permissions'
import * as leadSessionService from '@/services/lead-session.service'

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * Schema for creating a lead session
 *
 * Used by forms, chat widgets, and embeds to identify leads
 */
const createSessionSchema = z.object({
  /** The organization ID this session belongs to */
  organizationId: z.string().min(1, 'Organization ID is required'),
  /** Lead's email address (unique identifier) */
  email: z.string().email('Valid email is required'),
  /** Lead's first name (optional) */
  firstName: z.string().optional(),
  /** Lead's last name (optional) */
  lastName: z.string().optional(),
  /** Lead's phone number (optional) */
  phone: z.string().optional(),
  /** Where the session was created: 'form', 'chatbot', 'website', etc. */
  source: z.string().optional(),
})

/**
 * Schema for validating a session token
 */
const validateSessionSchema = z.object({
  /** The organization to validate against */
  organizationId: z.string().min(1, 'Organization ID is required'),
  /** The session token from the client */
  token: z.string().min(1, 'Token is required'),
})

/**
 * Schema for updating lead data via session
 */
const updateLeadSchema = z.object({
  /** The organization ID */
  organizationId: z.string().min(1, 'Organization ID is required'),
  /** The session token */
  token: z.string().min(1, 'Token is required'),
  /** Updates to apply to the lead */
  updates: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().optional(),
  }),
})

/**
 * Schema for listing sessions for a lead (admin)
 */
const listForLeadSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  leadId: z.string().min(1, 'Lead ID is required'),
})

/**
 * Schema for deleting a session (admin)
 */
const deleteSessionSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  sessionId: z.string().min(1, 'Session ID is required'),
})

// ============================================================================
// ROUTER
// ============================================================================

export const leadSessionRouter = createTRPCRouter({
  // ==========================================================================
  // PUBLIC ENDPOINTS (No authentication required)
  // ==========================================================================

  /**
   * Create or retrieve a session for a lead
   *
   * PUBLIC - No auth required. Called from forms, chat widgets, embeds.
   *
   * Flow:
   * 1. Client sends email (required) + optional lead data
   * 2. Server finds or creates lead by email in organization
   * 3. Server creates or retrieves session
   * 4. Returns token for client to store in cookie (only for new sessions)
   *
   * @example
   * ```ts
   * const result = await trpc.leadSession.create.mutate({
   *   organizationId: 'org_xxx',
   *   email: 'user@example.com',
   *   firstName: 'John',
   *   source: 'chatbot',
   * })
   *
   * if (result.success && result.token) {
   *   setSessionCookie(result.token)
   * }
   * ```
   */
  create: baseProcedure
    .input(createSessionSchema)
    .mutation(async ({ input }) => {
      return await leadSessionService.createSession({
        organizationId: input.organizationId,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        source: input.source,
      })
    }),

  /**
   * Validate a session token and get lead data
   *
   * PUBLIC - No auth required. Used to check returning visitors.
   *
   * @example
   * ```ts
   * const result = await trpc.leadSession.validate.query({
   *   organizationId: 'org_xxx',
   *   token: 'v1.xxxxx.xxxxx',
   * })
   *
   * if (result.valid && result.lead) {
   *   prefillForm(result.lead)
   * }
   * ```
   */
  validate: baseProcedure
    .input(validateSessionSchema)
    .query(async ({ input }) => {
      return await leadSessionService.validateSession({
        organizationId: input.organizationId,
        token: input.token,
      })
    }),

  /**
   * Update lead data using a valid session token
   *
   * PUBLIC - No auth required. Requires valid token.
   *
   * Allows leads to update their info from forms without re-identification.
   *
   * @example
   * ```ts
   * await trpc.leadSession.updateLead.mutate({
   *   organizationId: 'org_xxx',
   *   token: 'v1.xxxxx.xxxxx',
   *   updates: { phone: '+1234567890' },
   * })
   * ```
   */
  updateLead: baseProcedure
    .input(updateLeadSchema)
    .mutation(async ({ input }) => {
      return await leadSessionService.updateLeadFromSession({
        organizationId: input.organizationId,
        token: input.token,
        updates: input.updates,
      })
    }),

  // ==========================================================================
  // PROTECTED ENDPOINTS (Admin only)
  // ==========================================================================

  /**
   * List all sessions for a lead
   *
   * PROTECTED - Requires leads:read permission.
   *
   * Used in admin UI to view and manage lead sessions.
   */
  listForLead: organizationProcedure({
    requirePermission: permissions.LEADS_READ,
  })
    .input(listForLeadSchema)
    .query(async ({ input }) => {
      return await leadSessionService.getLeadSessions(
        input.organizationId,
        input.leadId
      )
    }),

  /**
   * Delete a session
   *
   * PROTECTED - Requires leads:update permission.
   *
   * Used to revoke a session (e.g., for security or upon user request).
   */
  delete: organizationProcedure({
    requirePermission: permissions.LEADS_UPDATE,
  })
    .input(deleteSessionSchema)
    .mutation(async ({ input }) => {
      return await leadSessionService.deleteSession(
        input.organizationId,
        input.sessionId
      )
    }),
})
