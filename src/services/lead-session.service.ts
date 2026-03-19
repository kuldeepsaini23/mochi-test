/**
 * Lead Session Service (DAL)
 *
 * Global service for lead identification. Can be called from:
 * - Form submissions
 * - Chat widgets
 * - External embeds
 * - Any API endpoint
 *
 * This is the ONLY place that should interact with Prisma for lead sessions.
 *
 * SOURCE OF TRUTH KEYWORDS: LeadSession, StickyForm, LeadIdentification
 */

import 'server-only'

import { prisma } from '@/lib/config'
import {
  createLeadSessionToken,
  validateTokenSignature,
  hashToken,
} from '@/lib/lead-session/token'
import {
  getLeadByEmail,
  createLead,
  updateLead,
} from '@/services/leads.service'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Input for creating a new lead session
 */
export interface CreateSessionInput {
  /** The organization this session belongs to */
  organizationId: string
  /** Lead's email address (unique identifier) */
  email: string
  /** Lead's first name (optional) */
  firstName?: string
  /** Lead's last name (optional) */
  lastName?: string
  /** Lead's phone number (optional) */
  phone?: string
  /** Where the session was created: 'form', 'chatbot', 'website', etc. */
  source?: string
}

/**
 * Result of creating a session
 */
export interface CreateSessionResult {
  /** Whether the operation succeeded */
  success: boolean
  /** Token to send to client for cookie storage (only on new session) */
  token?: string
  /** The lead's ID */
  leadId?: string
  /** Whether this is a newly created lead */
  isNewLead?: boolean
  /** Error message if failed */
  error?: string
}

/**
 * Input for validating a session token
 */
export interface ValidateSessionInput {
  /** The organization to validate against */
  organizationId: string
  /** The session token from the client */
  token: string
}

/**
 * Result of validating a session
 */
export interface ValidateSessionResult {
  /** Whether the token is valid */
  valid: boolean
  /** The lead's ID if valid */
  leadId?: string
  /** Basic lead data for prefilling forms */
  lead?: {
    firstName: string | null
    lastName: string | null
    email: string
    phone: string | null
  }
  /** Error message if invalid */
  error?: string
}

/**
 * Input for updating lead data via session
 */
export interface UpdateLeadFromSessionInput {
  organizationId: string
  token: string
  updates: {
    firstName?: string
    lastName?: string
    phone?: string
  }
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Create or retrieve a session for a lead
 *
 * Flow:
 * 1. Find or create lead by email
 * 2. Check for existing session
 * 3. If exists, update lastSeenAt and return (token already with client)
 * 4. If not, create new session and return token
 *
 * WHY: Single entry point for lead identification from any source
 * HOW: Uses email as unique identifier, creates session with secure token
 */
export async function createSession(
  input: CreateSessionInput
): Promise<CreateSessionResult> {
  try {
    // Find or create lead by email
    let leadId: string
    let isNewLead = false

    const existingLead = await getLeadByEmail(input.organizationId, input.email)

    if (!existingLead) {
      // Create new lead
      const newLead = await createLead({
        organizationId: input.organizationId,
        email: input.email,
        firstName: input.firstName || '',
        lastName: input.lastName || '',
        phone: input.phone,
        source: input.source || 'Lead Session',
      })
      leadId = newLead.id
      isNewLead = true
    } else {
      leadId = existingLead.id

      // Update existing lead with any new info provided
      if (input.firstName || input.lastName || input.phone) {
        const updates: { firstName?: string; lastName?: string; phone?: string } = {}

        if (input.firstName && !existingLead.firstName) {
          updates.firstName = input.firstName
        }
        if (input.lastName && !existingLead.lastName) {
          updates.lastName = input.lastName
        }
        if (input.phone && !existingLead.phone) {
          updates.phone = input.phone
        }

        // Only update if there are changes
        if (Object.keys(updates).length > 0) {
          await updateLead(input.organizationId, leadId, updates)
        }
      }
    }

    // Check for existing session for this lead
    const existingSession = await prisma.leadSession.findFirst({
      where: {
        organizationId: input.organizationId,
        leadId,
      },
    })

    /**
     * Always generate and return a token
     *
     * WHY: The client may have lost their token (cleared cookies, different device, etc.)
     * If we don't return a token, the client can never prefill forms again.
     *
     * APPROACH: Regenerate token and update the existing session, or create new session.
     * This ensures the client always gets a valid token on successful identification.
     *
     * SOURCE OF TRUTH: This is the only place that handles token generation for sessions.
     */
    const { token, tokenHash, tokenSuffix } = createLeadSessionToken({
      organizationId: input.organizationId,
      leadId,
    })

    if (existingSession) {
      // Update existing session with new token (regenerate for client)
      await prisma.leadSession.update({
        where: { id: existingSession.id },
        data: {
          tokenHash,
          tokenSuffix,
          lastSeenAt: new Date(),
        },
      })

      return {
        success: true,
        token, // Always return token so client can store it
        leadId,
        isNewLead: false,
      }
    }

    // Create new session with secure token
    await prisma.leadSession.create({
      data: {
        organizationId: input.organizationId,
        leadId,
        tokenHash,
        tokenSuffix,
        source: input.source,
      },
    })

    return {
      success: true,
      token, // Send to client for cookie storage
      leadId,
      isNewLead,
    }
  } catch (error) {
    console.error('[LeadSession] Error creating session:', error)
    return {
      success: false,
      error: 'Failed to create session',
    }
  }
}

/**
 * Validate a session token and get lead data
 *
 * Flow:
 * 1. Verify token signature matches organization
 * 2. Look up token hash in database
 * 3. Return lead data if valid
 *
 * WHY: Secure verification of returning visitors
 * HOW: Signature check first (fast), then database lookup
 */
export async function validateSession(
  input: ValidateSessionInput
): Promise<ValidateSessionResult> {
  try {
    // First, verify token signature (fast, no DB call)
    const signatureValid = validateTokenSignature(
      input.token,
      input.organizationId
    )

    if (!signatureValid) {
      return { valid: false, error: 'Invalid token signature' }
    }

    // Look up token in database
    const tokenHashValue = hashToken(input.token)
    const session = await prisma.leadSession.findUnique({
      where: { tokenHash: tokenHashValue },
      include: {
        lead: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            deletedAt: true,
          },
        },
      },
    })

    if (!session) {
      return { valid: false, error: 'Session not found' }
    }

    // Verify organization match
    if (session.organizationId !== input.organizationId) {
      return { valid: false, error: 'Organization mismatch' }
    }

    // Check if lead was deleted
    if (session.lead.deletedAt) {
      return { valid: false, error: 'Lead has been deleted' }
    }

    // Update lastSeenAt
    await prisma.leadSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    })

    return {
      valid: true,
      leadId: session.leadId,
      lead: {
        firstName: session.lead.firstName,
        lastName: session.lead.lastName,
        email: session.lead.email,
        phone: session.lead.phone,
      },
    }
  } catch (error) {
    console.error('[LeadSession] Error validating session:', error)
    return { valid: false, error: 'Validation failed' }
  }
}

/**
 * Update lead data using a valid session token
 *
 * WHY: Allow leads to update their info via forms without re-identification
 * HOW: Validate token first, then update lead data
 */
export async function updateLeadFromSession(
  input: UpdateLeadFromSessionInput
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate the session first
    const validation = await validateSession({
      organizationId: input.organizationId,
      token: input.token,
    })

    if (!validation.valid || !validation.leadId) {
      return { success: false, error: validation.error || 'Invalid session' }
    }

    // Update the lead
    await updateLead(input.organizationId, validation.leadId, input.updates)

    return { success: true }
  } catch (error) {
    console.error('[LeadSession] Error updating lead:', error)
    return { success: false, error: 'Failed to update lead' }
  }
}

// ============================================================================
// ADMIN FUNCTIONS
// ============================================================================

/**
 * Get all sessions for a lead (for admin UI)
 *
 * WHY: Allow admins to see and manage lead sessions
 * HOW: Query by leadId with organization scoping
 */
export async function getLeadSessions(
  organizationId: string,
  leadId: string
): Promise<Array<{
  id: string
  source: string | null
  lastSeenAt: Date
  createdAt: Date
}>> {
  const sessions = await prisma.leadSession.findMany({
    where: {
      organizationId,
      leadId,
    },
    select: {
      id: true,
      source: true,
      lastSeenAt: true,
      createdAt: true,
    },
    orderBy: { lastSeenAt: 'desc' },
  })

  return sessions
}

/**
 * Delete a session (for admin or lead request)
 *
 * WHY: Allow revoking sessions for security or upon request
 * HOW: Hard delete the session record
 */
export async function deleteSession(
  organizationId: string,
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify session belongs to organization
    const session = await prisma.leadSession.findFirst({
      where: {
        id: sessionId,
        organizationId,
      },
    })

    if (!session) {
      return { success: false, error: 'Session not found' }
    }

    // Delete the session
    await prisma.leadSession.delete({
      where: { id: sessionId },
    })

    return { success: true }
  } catch (error) {
    console.error('[LeadSession] Error deleting session:', error)
    return { success: false, error: 'Failed to delete session' }
  }
}

/**
 * Delete all sessions for a lead
 *
 * WHY: Clean up when lead is deleted or requests data removal
 * HOW: Delete all session records for the lead
 */
export async function deleteAllLeadSessions(
  organizationId: string,
  leadId: string
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const result = await prisma.leadSession.deleteMany({
      where: {
        organizationId,
        leadId,
      },
    })

    return { success: true, count: result.count }
  } catch (error) {
    console.error('[LeadSession] Error deleting all sessions:', error)
    return { success: false, count: 0, error: 'Failed to delete sessions' }
  }
}
