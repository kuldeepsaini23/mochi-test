/**
 * ============================================================================
 * MOCHI AI TOOLS - ENTITY RESOLUTION HELPERS
 * ============================================================================
 *
 * Server-side helpers that resolve entity references by name/email search
 * instead of requiring raw IDs. This prevents the AI from fabricating
 * entity IDs — a common LLM failure mode where the model generates
 * plausible-looking CUIDs that don't correspond to real records.
 *
 * WHY: Despite prompt-level instructions ("NEVER guess IDs"), LLMs still
 * fabricate IDs because it's "faster" than making a lookup call. By
 * accepting a search term and doing the lookup server-side, we make ID
 * fabrication structurally impossible. The AI passes a name or email
 * (which it genuinely has from the conversation) and the tool resolves
 * it to a real entity.
 *
 * SOURCE OF TRUTH KEYWORDS: ResolveHelpers, EntityResolution, LeadResolver
 * ============================================================================
 */

import type { TRPCCaller } from '@/trpc/server'
import type { ToolErrorResult } from './tool-error'

// ============================================================================
// TYPES
// ============================================================================

/** Successful lead resolution — contains the validated lead ID and display name */
interface ResolvedLead {
  success: true
  leadId: string
  leadName: string
  leadEmail: string
}

/** Failed lead resolution — returns a message the AI can use to self-correct */
interface LeadResolutionError {
  success: false
  message: string
  errorCode: ToolErrorResult['errorCode']
  /** When multiple matches are found, includes them so the AI can ask the user to pick */
  leads?: Array<{ id: string; name: string; email: string }>
}

type LeadResolutionResult = ResolvedLead | LeadResolutionError

// ============================================================================
// LEAD RESOLVER
// ============================================================================

/**
 * Resolves a lead by ID or search term (name/email).
 *
 * Priority:
 * 1. If `leadId` is provided, validates it exists in the organization
 * 2. If `search` is provided (and no leadId), searches by name/email
 * 3. If neither is provided, returns null (no lead specified)
 *
 * This eliminates the most common AI failure: fabricating entity IDs.
 * The AI passes the person's name or email (which it genuinely knows
 * from the conversation context) and this function resolves it to a
 * real lead record.
 *
 * @param caller - tRPC caller for DB access
 * @param organizationId - Organization scope
 * @param leadId - Optional direct lead ID (validated if provided)
 * @param search - Optional name/email search term
 * @returns Resolved lead with ID, or error with actionable message
 */
export async function resolveLeadId(
  caller: TRPCCaller,
  organizationId: string,
  leadId?: string,
  search?: string,
): Promise<LeadResolutionResult | null> {
  /**
   * Path 1: Direct ID provided — validate it exists.
   * Even with a direct ID, we validate to catch fabricated IDs early
   * and return a helpful error instead of a cryptic DB error.
   */
  if (leadId) {
    try {
      const lead = await caller.leads.getById({ organizationId, leadId })
      const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email
      return { success: true, leadId: lead.id, leadName: name, leadEmail: lead.email }
    } catch {
      return {
        success: false,
        message:
          `Lead ID "${leadId}" does not exist in this organization. ` +
          `Do NOT retry with another guessed ID. Instead, either:\n` +
          `1. Use the "recipientSearch" / "leadSearch" parameter with the person's name or email\n` +
          `2. Call listLeads to find the correct ID first`,
        errorCode: 'NOT_FOUND',
      }
    }
  }

  /**
   * Path 2: Search term provided — find the lead by name or email.
   * This is the preferred path: the AI passes the person's name/email
   * from the conversation, and we resolve it to a real lead.
   */
  if (search) {
    try {
      const result = await caller.leads.list({
        organizationId,
        search,
        page: 1,
        pageSize: 5,
      })

      /** Exact single match — use it directly */
      if (result.leads.length === 1) {
        const lead = result.leads[0]
        const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email
        return { success: true, leadId: lead.id, leadName: name, leadEmail: lead.email }
      }

      /** Multiple matches — return them so the AI can use askUser to let the user choose */
      if (result.leads.length > 1) {
        const leads = result.leads.map((l) => ({
          id: l.id,
          name: [l.firstName, l.lastName].filter(Boolean).join(' ') || l.email,
          email: l.email,
        }))
        return {
          success: false,
          message:
            `Multiple leads match "${search}". Use askUser to let the user choose:\n` +
            leads.map((l) => `- ${l.name} (${l.email}) — ID: ${l.id}`).join('\n'),
          errorCode: 'VALIDATION_ERROR',
          leads,
        }
      }

      /** No matches */
      return {
        success: false,
        message: `No lead found matching "${search}". Ask the user if they want to create a new lead first.`,
        errorCode: 'NOT_FOUND',
      }
    } catch (err) {
      console.error('[Mochi AI] resolveLeadId search error:', err)
      return {
        success: false,
        message: `Failed to search for lead "${search}". Try again or use listLeads manually.`,
        errorCode: 'UNKNOWN',
      }
    }
  }

  /** Neither leadId nor search provided — no lead specified (valid for optional fields) */
  return null
}
