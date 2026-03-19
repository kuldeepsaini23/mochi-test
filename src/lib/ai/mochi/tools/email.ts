/**
 * ============================================================================
 * MOCHI AI TOOLS - EMAIL
 * ============================================================================
 *
 * Vercel AI SDK tool definitions for email/inbox management.
 * Uses tRPC caller for sending emails and listing conversations.
 *
 * SECURITY: All operations route through tRPC caller to enforce permissions
 * (EMAIL_READ, EMAIL_SEND, SUBMISSIONS_READ) instead of calling service
 * functions directly.
 *
 * All operations now route through tRPC — zero direct service calls.
 *
 * SOURCE OF TRUTH KEYWORDS: MochiEmailTools, AIEmailManagement
 * ============================================================================
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { TRPCCaller } from '@/trpc/server'
import { handleToolError } from './tool-error'

/**
 * Creates all email-related tools bound to the given organization.
 * Routes through tRPC caller for permission enforcement.
 */
export function createEmailTools(organizationId: string, caller: TRPCCaller) {
  return {
    /**
     * Get verified email domains that can be used for sending emails.
     * ALWAYS call this before sending an email so you know which domains are available.
     *
     * tRPC route: caller.emailDomains.list — enforces EMAIL_READ permission.
     * Filtering to VERIFIED + sendingEnabled happens in the tool (tRPC returns all).
     */
    getVerifiedEmailDomains: tool({
      description:
        'Get the list of verified email domains that can be used for sending emails. ' +
        'ALWAYS call this tool BEFORE sending an email so you know which sender domains are available. ' +
        'Use a verified domain for the senderEmail (e.g., "john@verified-domain.com").',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const result = await caller.emailDomains.list({
            organizationId,
            page: 1,
            pageSize: 50,
          })

          /** Only return verified domains that have sending enabled */
          const verifiedDomains = result.domains
            .filter((d) => d.status === 'VERIFIED' && d.sendingEnabled)
            .map((d) => ({
              id: d.id,
              domain: d.name,
              status: d.status,
            }))

          return {
            success: true,
            domains: verifiedDomains,
            total: verifiedDomains.length,
            message: verifiedDomains.length > 0
              ? `Found ${verifiedDomains.length} verified email domain(s): ${verifiedDomains.map((d) => d.domain).join(', ')}`
              : 'No verified email domains found. The user needs to add and verify an email domain first (Settings > Integrations).',
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('getVerifiedEmailDomains', err)
        }
      },
    }),

    /**
     * Send a new email to a lead.
     * Can provide either leadId or leadEmail — if leadEmail is provided,
     * we look up the lead first using the service layer (no tRPC equivalent).
     *
     * tRPC route: caller.inbox.sendNewEmail — enforces EMAIL_SEND permission.
     */
    sendNewEmailToLead: tool({
      description:
        'Send a new email to a lead. BEFORE calling this, use getVerifiedEmailDomains to find available sender domains. ' +
        'Ask the user for their sender name. The senderEmail MUST use a verified domain. ' +
        'Provide either leadId (preferred) or leadEmail to identify the recipient.',
      inputSchema: z.object({
        leadId: z
          .string()
          .optional()
          .describe('Lead ID (preferred - use if you have it from a previous operation)'),
        leadEmail: z
          .string()
          .email()
          .optional()
          .describe('Email address of the lead (used to look up the lead if leadId is not provided)'),
        subject: z.string().describe('Email subject line'),
        body: z.string().describe('Email body content (plain text or HTML)'),
        senderName: z
          .string()
          .describe('Name of the sender (e.g. "John Smith"). Ask the user for this.'),
        senderEmail: z
          .string()
          .email()
          .describe('Verified sender email address (must be from a domain verified in Resend). Ask the user for this.'),
      }),
      execute: async (params) => {
        /**
         * Resolve leadId from email if not provided directly.
         * Routes through caller.leads.getByEmail() for permission enforcement.
         */
        let resolvedLeadId = params.leadId
        if (!resolvedLeadId && params.leadEmail) {
          const lead = await caller.leads.getByEmail({
            organizationId,
            email: params.leadEmail,
          })
          if (!lead) {
            return {
              success: false,
              message: `No lead found with email: ${params.leadEmail}`,
            }
          }
          resolvedLeadId = lead.id
        }

        if (!resolvedLeadId) {
          return {
            success: false,
            message: 'Either leadId or leadEmail is required',
          }
        }

        try {
          /**
           * Send email via tRPC — the procedure enforces EMAIL_SEND permission
           * and handles conversation creation/lookup internally.
           */
          const result = await caller.inbox.sendNewEmail({
            organizationId,
            leadId: resolvedLeadId,
            subject: params.subject,
            body: params.body,
            fromName: params.senderName,
            fromEmail: params.senderEmail,
          })

          if (result.error) {
            return {
              success: false,
              message: `Failed to send email: ${result.error}`,
            }
          }

          return {
            success: true,
            conversationId: result.conversation.id,
            emailSent: result.emailSent,
            message: `Sent email "${params.subject}" from ${params.senderName} <${params.senderEmail}>`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('sendNewEmailToLead', err)
        }
      },
    }),

    /**
     * List email conversations in the inbox.
     *
     * tRPC route: caller.inbox.list — enforces SUBMISSIONS_READ permission.
     */
    listConversations: tool({
      description: 'List email conversations in the inbox. Optionally search by keyword.',
      inputSchema: z.object({
        search: z.string().optional().describe('Search conversations by keyword'),
      }),
      execute: async (params) => {
        try {
          const result = await caller.inbox.list({
            organizationId,
            limit: 20,
            search: params.search,
          })
          return {
            success: true,
            conversations: result.conversations.map((c) => ({
              id: c.id,
              subject: c.subject,
              leadName: c.lead
                ? `${c.lead.firstName} ${c.lead.lastName}`
                : 'Unknown',
              leadEmail: c.lead?.email,
              hasUnread: c.hasUnread,
              lastMessageAt: c.lastMessageAt,
            })),
            message: `Found ${result.conversations.length} conversations`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('listConversations', err)
        }
      },
    }),
  }
}
