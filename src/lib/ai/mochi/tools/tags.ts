/**
 * ============================================================================
 * MOCHI AI TOOLS - TAGS
 * ============================================================================
 *
 * Vercel AI SDK tool definitions for tag management.
 * Tags can be created and assigned to leads for organization.
 *
 * SECURITY: All operations route through the tRPC caller instead of calling
 * service functions directly. This ensures every call passes through the
 * full middleware chain — permissions, feature gates, Stripe connect checks.
 *
 * SOURCE OF TRUTH KEYWORDS: MochiTagTools, AITagManagement
 * ============================================================================
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { TRPCCaller } from '@/trpc/server'
import { handleToolError } from './tool-error'

/** All tag operations go through the tRPC caller for security. */

/**
 * Creates all tag-related tools bound to the given organization.
 * Each tool calls the tRPC caller with organizationId pre-bound,
 * enforcing permissions on every operation.
 *
 * @param organizationId - The org these tools operate on
 * @param caller - tRPC caller for secure procedure invocation
 */
export function createTagTools(organizationId: string, caller: TRPCCaller) {
  return {
    /**
     * Create a new tag for organizing leads.
     * Uses getTagByName (service) for pre-flight duplicate check, then
     * routes through caller.leads.createTag() which enforces LEADS_CREATE permission.
     */
    createTag: tool({
      description: 'Create a new tag. If the tag already exists, returns the existing one.',
      inputSchema: z.object({
        name: z.string().describe('Tag name'),
        color: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .optional()
          .describe('Hex color code (e.g. #3b82f6, defaults to blue)'),
      }),
      execute: async (params) => {
        try {
          /**
           * Pre-flight duplicate check via tRPC.
           * If tag already exists, return it without calling the create procedure.
           */
          const existing = await caller.leads.getTagByName({
            organizationId,
            name: params.name,
          })
          if (existing) {
            return {
              success: true,
              tagId: existing.id,
              name: existing.name,
              message: `Tag "${params.name}" already exists (ID: ${existing.id})`,
            }
          }

          /** tRPC createTag expects { organizationId, name, color } */
          const tag = await caller.leads.createTag({
            organizationId,
            name: params.name,
            color: params.color ?? '#3b82f6',
          })
          return {
            success: true,
            tagId: tag.id,
            name: tag.name,
            message: `Created tag "${params.name}" (ID: ${tag.id})`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('createTag', err)
        }
      },
    }),

    /**
     * List all tags in the organization.
     * Routes through caller.leads.listTags() which enforces LEADS_READ permission.
     */
    listTags: tool({
      description: 'List all tags in the organization.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          /** tRPC listTags expects { organizationId } */
          const tags = await caller.leads.listTags({ organizationId })
          return {
            success: true,
            tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })),
            message: `Found ${tags.length} tags`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('listTags', err)
        }
      },
    }),

    /**
     * Add a tag to a lead — call createTag first if the tag doesn't exist yet.
     * Routes through caller.leads.addTagToLead() which enforces:
     * - LEADS_UPDATE permission
     * - Lead and tag existence checks
     * - Duplicate assignment check
     */
    addTagToLead: tool({
      description:
        'Add a tag to a lead. IMPORTANT: If the tag does not exist yet, call createTag FIRST to get the tagId, ' +
        'then call this tool immediately after with the returned tagId. Both steps must happen in the same turn.',
      inputSchema: z.object({
        leadId: z.string().describe('The lead ID to tag'),
        tagId: z.string().describe('The tag ID (from createTag result or listTags)'),
      }),
      execute: async (params) => {
        try {
          /** tRPC addTagToLead expects { organizationId, leadId, tagId } */
          await caller.leads.addTagToLead({
            organizationId,
            leadId: params.leadId,
            tagId: params.tagId,
          })
          return {
            success: true,
            leadId: params.leadId,
            tagId: params.tagId,
            message: 'Added tag to lead',
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('addTagToLead', err)
        }
      },
    }),

    /**
     * Remove a tag from a lead — use listTags or getLead to find the tagId first.
     * Routes through caller.leads.removeTagFromLead() which enforces:
     * - LEADS_UPDATE permission
     * - Lead existence check
     */
    removeTagFromLead: tool({
      description:
        'Remove a tag from a lead. If you do not have the tagId, call listTags first to find it by name, ' +
        'then call this tool with the tagId. Use askUser to confirm before removing.',
      inputSchema: z.object({
        leadId: z.string().describe('The lead ID to remove the tag from'),
        tagId: z.string().describe('The tag ID (from listTags or getLead result)'),
      }),
      execute: async (params) => {
        try {
          /** tRPC removeTagFromLead expects { organizationId, leadId, tagId } */
          await caller.leads.removeTagFromLead({
            organizationId,
            leadId: params.leadId,
            tagId: params.tagId,
          })
          return {
            success: true,
            leadId: params.leadId,
            tagId: params.tagId,
            message: 'Removed tag from lead',
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('removeTagFromLead', err)
        }
      },
    }),
  }
}
