/**
 * ============================================================================
 * MOCHI AI TOOLS - DOMAINS
 * ============================================================================
 *
 * Vercel AI SDK tool definitions for domain management.
 * Website domains and email domains are managed separately through their
 * own tRPC routers (domains + emailDomains).
 * Routes through tRPC caller for full middleware (permissions, feature gates).
 *
 * SOURCE OF TRUTH KEYWORDS: MochiDomainTools, AIDomainManagement
 * ============================================================================
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { TRPCCaller } from '@/trpc/server'
import { handleToolError } from './tool-error'

/**
 * Creates all domain-related tools bound to the given organization.
 * Uses tRPC caller for permission-checked DB operations.
 *
 * @param organizationId - The org these tools operate on
 * @param caller - tRPC caller that enforces permissions, feature gates, etc.
 */
export function createDomainTools(organizationId: string, caller: TRPCCaller) {
  return {
    /**
     * List all website domains for the organization.
     * Returns domain verification status and website count per domain.
     */
    listDomains: tool({
      description:
        'List all website (custom) domains for the organization. Supports search and pagination. For email domains, use listEmailDomains.',
      inputSchema: z.object({
        search: z
          .string()
          .optional()
          .describe('Optional search term to filter domains'),
        page: z.number().optional().describe('Page number (defaults to 1)'),
        pageSize: z
          .number()
          .optional()
          .describe('Number of results per page (defaults to 20)'),
      }),
      execute: async (params) => {
        try {
          /* Website domain list via tRPC — enforces DOMAINS_READ permission */
          const result = await caller.domains.list({
            organizationId,
            search: params.search,
            page: params.page ?? 1,
            pageSize: params.pageSize ?? 20,
          })
          return {
            success: true,
            domains: result.domains.map((d) => ({
              id: d.id,
              customDomain: d.customDomain,
              isVerified: d.isVerified,
              websiteCount: d._count.websites,
              createdAt: d.createdAt,
            })),
            total: result.total,
            page: result.page,
            totalPages: result.totalPages,
            message: `Found ${result.total} website domain(s)`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('listDomains', err)
        }
      },
    }),

    /**
     * List all email domains for the organization.
     * Returns email verification status, sending capability, and DNS records.
     */
    listEmailDomains: tool({
      description:
        'List all email domains for the organization with verification status and sending capability. For website domains, use listDomains.',
      inputSchema: z.object({
        page: z.number().optional().describe('Page number (defaults to 1)'),
        pageSize: z
          .number()
          .optional()
          .describe('Number of results per page (defaults to 20)'),
      }),
      execute: async (params) => {
        try {
          /* Email domain list via tRPC — enforces EMAIL_READ permission */
          const result = await caller.emailDomains.list({
            organizationId,
            page: params.page ?? 1,
            pageSize: params.pageSize ?? 20,
          })
          return {
            success: true,
            domains: result.domains.map((d) => ({
              id: d.id,
              name: d.name,
              status: d.status,
              sendingEnabled: d.sendingEnabled,
              createdAt: d.createdAt,
            })),
            total: result.total,
            page: result.page,
            totalPages: result.totalPages,
            message: `Found ${result.total} email domain(s)`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('listEmailDomains', err)
        }
      },
    }),

    /**
     * Get a single domain by its ID with full details
     */
    getDomain: tool({
      description: 'Get details for a specific domain by its ID.',
      inputSchema: z.object({
        domainId: z.string().describe('The ID of the domain to retrieve'),
      }),
      execute: async (params) => {
        try {
          /* Get via tRPC — enforces DOMAINS_READ permission */
          const domain = await caller.domains.getById({
            organizationId,
            domainId: params.domainId,
          })
          return {
            success: true,
            domain: {
              id: domain.id,
              customDomain: domain.customDomain,
              isVerified: domain.isVerified,
              createdAt: domain.createdAt,
              updatedAt: domain.updatedAt,
            },
            message: `Domain: ${domain.customDomain} (verified: ${domain.isVerified})`,
          }
        } catch (err) {
          /* tRPC throws NOT_FOUND for missing domains */
          return handleToolError('getDomain', err)
        }
      },
    }),

    /**
     * Register a new website domain for hosting.
     * The domain must be a plain domain name (no https://, no www.).
     * Domain cleaning (strip protocol/www) stays in the tool since the
     * tRPC schema rejects domains with protocol/www prefixes.
     * For email domain creation, use createEmailDomain.
     */
    createDomain: tool({
      description:
        'Create/register a new website domain for hosting. Pass a plain domain name (e.g. "example.com", not "https://example.com"). For email sending, use createEmailDomain separately.',
      inputSchema: z.object({
        customDomain: z
          .string()
          .describe(
            'Plain domain name to register (e.g. "example.com"). No protocol or www prefix.'
          ),
      }),
      execute: async (params) => {
        try {
          /* Strip protocol/www if the user accidentally included them */
          const cleaned = params.customDomain
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .replace(/\/+$/, '')

          /* Create website domain via tRPC — enforces DOMAINS_CREATE + custom_domain feature gate */
          const domain = await caller.domains.create({
            organizationId,
            customDomain: cleaned,
          })
          return {
            success: true,
            domainId: domain.id,
            customDomain: domain.customDomain,
            isVerified: domain.isVerified,
            message: `Website domain "${domain.customDomain}" created (ID: ${domain.id}). You need to set up DNS records — use getDnsInstructions to see what records to add. To also set up email sending, use createEmailDomain.`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('createDomain', err)
        }
      },
    }),

    /**
     * Register a new email domain for sending via Resend.
     * The domain must be a plain domain name (no https://, no www.).
     * For website hosting, use createDomain.
     */
    createEmailDomain: tool({
      description:
        'Create/register a new email domain for email sending via Resend. Pass a plain domain name (e.g. "example.com"). For website hosting, use createDomain separately.',
      inputSchema: z.object({
        name: z
          .string()
          .describe(
            'Plain domain name to register for email (e.g. "example.com"). No protocol or www prefix.'
          ),
      }),
      execute: async (params) => {
        try {
          /* Strip protocol/www if the user accidentally included them */
          const cleaned = params.name
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .replace(/\/+$/, '')
            .toLowerCase()

          /* Create email domain via tRPC — enforces EMAIL_SEND + email_domains.limit feature gate */
          const domain = await caller.emailDomains.create({
            organizationId,
            name: cleaned,
            region: 'us-east-1',
          })
          return {
            success: true,
            emailDomainId: domain.id,
            name: domain.name,
            status: domain.status,
            message: `Email domain "${domain.name}" created (ID: ${domain.id}). DNS records need to be added at your registrar for email verification.`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('createEmailDomain', err)
        }
      },
    }),

    /**
     * Update a domain's custom domain name.
     * Domain cleaning stays in the tool since the tRPC schema
     * rejects domains with protocol/www prefixes.
     */
    updateDomain: tool({
      description: 'Update the custom domain name for an existing domain.',
      inputSchema: z.object({
        domainId: z.string().describe('The ID of the domain to update'),
        customDomain: z
          .string()
          .describe('New plain domain name (e.g. "newdomain.com")'),
      }),
      execute: async (params) => {
        try {
          /* Strip protocol/www if the user accidentally included them */
          const cleaned = params.customDomain
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .replace(/\/+$/, '')

          /* Update via tRPC — enforces DOMAINS_UPDATE permission */
          const domain = await caller.domains.update({
            organizationId,
            domainId: params.domainId,
            customDomain: cleaned,
          })

          /* Guard: tRPC returns null when no changes are made (shouldn't happen here) */
          if (!domain) {
            return {
              success: false,
              message: `Domain with ID "${params.domainId}" not found`,
            }
          }

          return {
            success: true,
            domainId: domain.id,
            customDomain: domain.customDomain,
            message: `Domain updated to "${domain.customDomain}"`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('updateDomain', err)
        }
      },
    }),

    /**
     * Permanently delete a website domain.
     * This only removes the website hosting domain — email domains must be
     * deleted separately via deleteEmailDomain.
     * ALWAYS confirm with askUser first before calling this tool.
     */
    deleteDomain: tool({
      description:
        'Permanently delete a website domain. This will disconnect it from any websites. ' +
        'To also remove email sending, use deleteEmailDomain separately. ' +
        'IMPORTANT: Always use askUser to confirm with the user before calling this tool.',
      inputSchema: z.object({
        domainId: z.string().describe('The ID of the website domain to delete'),
      }),
      execute: async (params) => {
        try {
          /* Delete website domain via tRPC — enforces DOMAINS_DELETE permission */
          await caller.domains.delete({
            organizationId,
            domainId: params.domainId,
          })
          return {
            success: true,
            domainId: params.domainId,
            message: `Website domain deleted. If there is an associated email domain, use deleteEmailDomain to remove it too.`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('deleteDomain', err)
        }
      },
    }),

    /**
     * Permanently delete an email domain from Resend.
     * This only removes the email sending domain — website domains must be
     * deleted separately via deleteDomain.
     * ALWAYS confirm with askUser first before calling this tool.
     */
    deleteEmailDomain: tool({
      description:
        'Permanently delete an email domain. Emails can no longer be sent from this domain after deletion. ' +
        'To also remove website hosting, use deleteDomain separately. ' +
        'IMPORTANT: Always use askUser to confirm with the user before calling this tool.',
      inputSchema: z.object({
        domainId: z.string().describe('The ID of the email domain to delete'),
      }),
      execute: async (params) => {
        try {
          /* Delete email domain via tRPC — enforces EMAIL_SEND permission + decrements usage */
          await caller.emailDomains.delete({
            organizationId,
            domainId: params.domainId,
          })
          return {
            success: true,
            domainId: params.domainId,
            message: `Email domain deleted successfully`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('deleteEmailDomain', err)
        }
      },
    }),

    /**
     * Check whether a domain name is available for website hosting.
     * Domain cleaning stays in the tool since the user may provide
     * a URL instead of a plain domain name.
     * For email availability, use checkEmailDomainAvailability.
     */
    checkDomainAvailability: tool({
      description:
        'Check if a custom domain name is available for website hosting. For email availability, use checkEmailDomainAvailability.',
      inputSchema: z.object({
        customDomain: z
          .string()
          .describe('Plain domain name to check (e.g. "example.com")'),
      }),
      execute: async (params) => {
        try {
          /* Strip protocol/www if the user accidentally included them */
          const cleaned = params.customDomain
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .replace(/\/+$/, '')

          /* Check website domain availability via tRPC */
          const result = await caller.domains.checkAvailability({
            customDomain: cleaned,
          })
          return {
            success: true,
            customDomain: cleaned,
            available: result.available,
            message: result.available
              ? `"${cleaned}" is available for website hosting — you can register it`
              : `"${cleaned}" is already taken for website hosting`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('checkDomainAvailability', err)
        }
      },
    }),

    /**
     * Check whether a domain name is available for email sending.
     * For website availability, use checkDomainAvailability.
     */
    checkEmailDomainAvailability: tool({
      description:
        'Check if a domain name is available for email sending. For website availability, use checkDomainAvailability.',
      inputSchema: z.object({
        name: z
          .string()
          .describe('Plain domain name to check (e.g. "example.com")'),
      }),
      execute: async (params) => {
        try {
          /* Strip protocol/www if the user accidentally included them */
          const cleaned = params.name
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .replace(/\/+$/, '')
            .toLowerCase()

          /* Check email domain availability via tRPC */
          const result = await caller.emailDomains.checkAvailability({
            name: cleaned,
          })
          return {
            success: true,
            name: cleaned,
            available: result.available,
            message: result.available
              ? `"${cleaned}" is available for email sending — you can register it`
              : `"${cleaned}" is already taken for email sending`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('checkEmailDomainAvailability', err)
        }
      },
    }),

    /**
     * Get DNS setup instructions for a domain.
     * Shows the user exactly which DNS records to add at their registrar.
     * The tRPC procedure combines domain lookup + DNS instruction generation
     * + live DNS status check into a single call.
     */
    getDnsInstructions: tool({
      description:
        'Get the DNS records a user needs to configure at their domain registrar to point the domain to this platform.',
      inputSchema: z.object({
        domainId: z.string().describe('The ID of the domain'),
      }),
      execute: async (params) => {
        try {
          /* Get DNS instructions via tRPC — enforces DOMAINS_READ permission */
          /* Single tRPC call replaces getDomainForDnsInstructions + generateDnsInstructions */
          const result = await caller.domains.getDnsInstructions({
            organizationId,
            domainId: params.domainId,
          })
          return {
            success: true,
            domainId: params.domainId,
            customDomain: result.customDomain,
            records: result.records.map((r) => ({
              type: r.type,
              name: r.name,
              value: r.value,
              ttl: r.ttl,
              description: r.description,
            })),
            instructions: result.instructions,
            message: `DNS instructions for "${result.customDomain}": add the records below at your domain registrar, then use verifyDomain to check.`,
          }
        } catch (err) {
          /* tRPC throws NOT_FOUND for missing domains */
          return handleToolError('getDnsInstructions', err)
        }
      },
    }),

    /**
     * Verify that a domain's DNS records are correctly configured.
     * Checks CNAME and TXT records against expected values and updates
     * the isVerified status in the database.
     */
    verifyDomain: tool({
      description:
        'Verify that a domain has its DNS records correctly configured. Run this after the user has added DNS records at their registrar.',
      inputSchema: z.object({
        domainId: z.string().describe('The ID of the domain to verify'),
      }),
      execute: async (params) => {
        try {
          /* Verify via tRPC — enforces DOMAINS_UPDATE permission */
          /* Single tRPC call replaces verifyAndUpdateDomainDns + verifyCustomDomainDns */
          const result = await caller.domains.verifyDomain({
            organizationId,
            domainId: params.domainId,
          })

          return {
            success: true,
            domainId: result.domainId,
            customDomain: result.customDomain,
            verified: result.verified,
            records: result.records.map((r) => ({
              type: r.type,
              name: r.name,
              value: r.value,
              status: r.status,
            })),
            message: result.verified
              ? `Domain "${result.customDomain}" is verified and ready to use!`
              : `Domain "${result.customDomain}" verification failed: ${result.message}. Make sure DNS records are set correctly and have propagated (can take up to 48 hours).`,
          }
        } catch (err) {
          /* tRPC throws NOT_FOUND for missing domains */
          return handleToolError('verifyDomain', err)
        }
      },
    }),
  }
}
