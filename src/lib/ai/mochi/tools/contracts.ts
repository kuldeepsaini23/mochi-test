/**
 * ============================================================================
 * MOCHI AI TOOLS - CONTRACTS
 * ============================================================================
 *
 * Vercel AI SDK tool definitions for contract management.
 * Routes through tRPC caller for full middleware (permissions, feature gates).
 *
 * SOURCE OF TRUTH KEYWORDS: MochiContractTools, AIContractManagement
 * ============================================================================
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { TRPCCaller } from '@/trpc/server'
import { handleToolError } from './tool-error'
import { resolveLeadId } from './resolve-helpers'

/**
 * Creates all contract-related tools bound to the given organization.
 * Uses tRPC caller for permission-checked DB operations.
 *
 * @param organizationId - The org these tools operate on
 * @param caller - tRPC caller that enforces permissions, feature gates, etc.
 */
export function createContractTools(organizationId: string, caller: TRPCCaller) {
  return {
    /**
     * Create a new contract draft — optionally with AI content generation.
     *
     * When contentPrompt is provided, the tool navigates to the contract
     * builder and the model outputs contract markdown in a ```contract
     * code fence in its NEXT response step. The modular content fence
     * transform (pipeContractContent) separates it into data-contract
     * events that stream to the builder's Lexical editor.
     *
     * Content streams inline through the chat via modular content fences.
     */
    createContract: tool({
      description:
        'Create a new contract draft. Set the recipient using EITHER recipientSearch (preferred — pass ' +
        'the person\'s name or email) OR recipientId (only if you have a verified ID from a previous tool result). ' +
        'If the user wants contract body text/content generated with AI, provide the contentPrompt field — ' +
        'this will open the contract builder. After receiving the result, output the contract content inside ' +
        'a ```contract:generate code fence.',
      inputSchema: z.object({
        name: z.string().describe('Contract name/title (e.g., "Service Agreement with Acme")'),
        description: z.string().optional().describe('Contract description or summary'),
        recipientSearch: z
          .string()
          .optional()
          .describe(
            'Search for the recipient by name or email. The system will find the matching lead automatically. ' +
            'PREFERRED over recipientId — use this when you know the person\'s name or email from the conversation.'
          ),
        recipientId: z
          .string()
          .optional()
          .describe(
            'Lead ID — ONLY use if you have a verified ID from a listLeads/getLead result in THIS conversation. ' +
            'Prefer recipientSearch instead.'
          ),
        contentPrompt: z
          .string()
          .optional()
          .describe(
            'If provided, opens the contract builder. After this tool returns, generate the contract ' +
            'content in a ```contract:generate code fence based on this prompt.'
          ),
      }),
      execute: async (params) => {
        try {
          /**
           * Resolve recipient: prefer search by name/email, fall back to direct ID.
           * This prevents the AI from fabricating lead IDs — it passes the person's
           * name/email and the server does the lookup.
           */
          let resolvedRecipientId: string | undefined
          const leadResult = await resolveLeadId(
            caller, organizationId, params.recipientId, params.recipientSearch
          )
          if (leadResult) {
            if (!leadResult.success) return leadResult
            resolvedRecipientId = leadResult.leadId
          }

          /* Create via tRPC — enforces CONTRACTS_CREATE permission */
          const contract = await caller.contracts.create({
            organizationId,
            name: params.name,
            description: params.description,
            recipientId: resolvedRecipientId,
          })

          /**
           * If contentPrompt is provided, navigate to the builder.
           * The model's next step outputs contract markdown in a ```contract fence.
           */
          if (params.contentPrompt) {
            return {
              success: true,
              contractId: contract.id,
              name: contract.name,
              /**
               * Tell the model to output contract content in a fence.
               * DO NOT include the raw contentPrompt in the message — the model
               * already knows what to generate (it decided the contentPrompt).
               * Including it causes the model to echo instructions verbatim.
               */
              message: `Contract "${params.name}" created successfully. Now output the full contract content inside a \`\`\`contract:generate code fence. Follow the contract generation rules from your system prompt. The user's request was about: ${params.name}`,
              /** Event bus: navigate to the contract builder */
              _event: { feature: 'contract', action: 'navigate', entityId: contract.id, navigate: true },
            }
          }

          return {
            success: true,
            contractId: contract.id,
            name: contract.name,
            message: `Created contract "${params.name}" (ID: ${contract.id})`,
            /** Event bus: notify that a new contract was created */
            _event: { feature: 'contract', action: 'created', entityId: contract.id },
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('createContract', err)
        }
      },
    }),

    /**
     * Update a contract's name, description, or recipient.
     * Only provide the fields you want to change.
     */
    updateContract: tool({
      description:
        'Update a contract draft — change name, description, or set/change the recipient (lead). ' +
        'Only provide the fields you want to change. Use the contract ID from createContract or listContracts results.',
      inputSchema: z.object({
        contractId: z.string().describe('The contract ID to update (from a previous tool result)'),
        name: z.string().optional().describe('New contract name'),
        description: z.string().optional().describe('New contract description'),
        recipientId: z.string().optional().describe('Lead ID to set as the contract recipient (for signing)'),
      }),
      execute: async (params) => {
        try {
          /* Update via tRPC — enforces CONTRACTS_UPDATE permission */
          /* NOTE: tRPC schema uses `id`, not `contractId` */
          const contract = await caller.contracts.update({
            organizationId,
            id: params.contractId,
            name: params.name,
            description: params.description,
            recipientId: params.recipientId,
          })
          return {
            success: true,
            contractId: contract.id,
            name: contract.name,
            message: `Updated contract "${contract.name}"`,
            /** Event bus: notify builders that contract metadata changed */
            _event: { feature: 'contract', action: 'updated', entityId: contract.id },
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('updateContract', err)
        }
      },
    }),

    /**
     * Send a contract to a lead/recipient for signing.
     * The tRPC procedure handles email sending, status transition, and access token.
     *
     * SAFETY GUARD: Requires `userConfirmedSend` to be explicitly true.
     * Code-level guard against AI auto-sending. Prompt-level instructions alone
     * are insufficient — LLMs can misinterpret and call send without user consent.
     * This is destructive and irreversible (the contract gets emailed to the recipient).
     */
    sendContract: tool({
      description:
        'Send a contract to a lead for signing. The contract must be in DRAFT or ACTIVE status. ' +
        'Provide the contract ID and the recipient (use recipientSearch with name/email, or recipientId if verified). ' +
        'You MUST first use askUser to get EXPLICIT user confirmation before calling this tool.',
      inputSchema: z.object({
        contractId: z.string().describe('The contract ID to send'),
        recipientSearch: z
          .string()
          .optional()
          .describe('Search for the recipient by name or email. PREFERRED over recipientId.'),
        recipientId: z
          .string()
          .optional()
          .describe('Lead ID — ONLY if verified from a previous tool result. Prefer recipientSearch.'),
        userConfirmedSend: z
          .boolean()
          .describe(
            'REQUIRED: Must be true. You MUST first use askUser to get EXPLICIT user confirmation ' +
            '(e.g., "Should I send this contract to [name]?") BEFORE calling this tool. ' +
            'If the user has not explicitly said to send it, do NOT call this tool.'
          ),
      }),
      execute: async (params) => {
        try {
          /**
           * CODE-LEVEL CONSENT GUARD
           * -------------------------
           * Sending a contract is destructive and irreversible — an email goes out
           * to the recipient. Prompt-level instructions ("NEVER auto-send") can be
           * misinterpreted by the LLM. This hard check ensures the model explicitly
           * confirmed with the user via askUser before reaching this point.
           */
          if (params.userConfirmedSend !== true) {
            return {
              success: false,
              message:
                'Cannot send contract without explicit user confirmation. ' +
                'Use askUser first to confirm: "Should I send this contract to [recipient name]?" ' +
                'Only call sendContract after the user explicitly agrees.',
              errorCode: 'VALIDATION_ERROR' as const,
            }
          }

          /** Resolve recipient — server-side lookup prevents fabricated IDs */
          const leadResult = await resolveLeadId(
            caller, organizationId, params.recipientId, params.recipientSearch
          )
          if (!leadResult || !leadResult.success) {
            return leadResult ?? {
              success: false as const,
              message: 'A recipient is required to send a contract. Provide recipientSearch or recipientId.',
              errorCode: 'VALIDATION_ERROR' as const,
            }
          }

          /* Send via tRPC — enforces CONTRACTS_UPDATE permission + handles email */
          const result = await caller.contracts.send({
            organizationId,
            id: params.contractId,
            recipientId: leadResult.leadId,
          })
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
          const contractUrl = `${baseUrl}/contract/view/${result.accessToken}`
          return {
            success: true,
            contractId: params.contractId,
            contractUrl,
            message: `Sent contract for signing. View: ${contractUrl}`,
            /** Event bus: notify that contract was sent (status change) */
            _event: { feature: 'contract', action: 'sent', entityId: params.contractId },
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('sendContract', err)
        }
      },
    }),

    /**
     * Permanently delete a contract.
     * ALWAYS confirm with askUser before calling this tool.
     */
    deleteContract: tool({
      description:
        'Permanently delete a contract and all associated data. ' +
        'ALWAYS confirm with askUser before calling this tool.',
      inputSchema: z.object({
        contractId: z.string().describe('The contract ID to delete'),
      }),
      execute: async (params) => {
        try {
          /* Delete via tRPC — enforces CONTRACTS_DELETE permission */
          /* NOTE: tRPC schema uses `id`, not `contractId` */
          await caller.contracts.delete({
            organizationId,
            id: params.contractId,
          })
          return {
            success: true,
            contractId: params.contractId,
            message: `Deleted contract (ID: ${params.contractId})`,
            /** Event bus: notify that contract was deleted */
            _event: { feature: 'contract', action: 'deleted', entityId: params.contractId },
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('deleteContract', err)
        }
      },
    }),

    /**
     * Set or change the recipient (lead) on a contract draft.
     *
     * WHY a standalone tool: Users often say "set John as the recipient"
     * or "add a recipient to this contract" — a focused tool is easier
     * for the AI to match than updateContract with many optional fields.
     */
    setContractRecipient: tool({
      description:
        'Set or change the recipient (lead) on a contract. The recipient is the person ' +
        'who will sign the contract. Use recipientSearch (name or email) to find the lead, ' +
        'or recipientId only if you have a verified ID from a previous tool result.',
      inputSchema: z.object({
        contractId: z.string().describe('The contract ID'),
        recipientSearch: z
          .string()
          .optional()
          .describe('Search for the recipient by name or email. PREFERRED over recipientId.'),
        recipientId: z
          .string()
          .optional()
          .describe('Lead ID — ONLY if verified from a previous tool result. Prefer recipientSearch.'),
      }),
      execute: async (params) => {
        try {
          /** Resolve recipient — server-side lookup prevents fabricated IDs */
          const leadResult = await resolveLeadId(
            caller, organizationId, params.recipientId, params.recipientSearch
          )
          if (!leadResult || !leadResult.success) {
            return leadResult ?? {
              success: false as const,
              message: 'A recipient is required. Provide recipientSearch or recipientId.',
              errorCode: 'VALIDATION_ERROR' as const,
            }
          }

          /* Update recipient via tRPC — enforces CONTRACTS_UPDATE permission */
          const contract = await caller.contracts.update({
            organizationId,
            id: params.contractId,
            recipientId: leadResult.leadId,
          })
          return {
            success: true,
            contractId: contract.id,
            name: contract.name,
            message: `Set recipient on contract "${contract.name}" to ${leadResult.leadName} (${leadResult.leadEmail})`,
            _event: { feature: 'contract', action: 'updated', entityId: contract.id },
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('setContractRecipient', err)
        }
      },
    }),

    /**
     * Update existing contract content using AI — opens the builder
     * and the model outputs updated markdown in a ```contract:{mode} fence.
     *
     * NO DB CALL: This is purely UI navigation. The model's next step
     * outputs the content in a code fence which streams to the builder.
     */
    updateContractContent: tool({
      description:
        'Update or add new sections to an existing contract using AI. Opens the contract builder. ' +
        'After this tool returns, output the content in a ```contract:update or ```contract:append code fence. ' +
        'Use "update" mode to rewrite the entire contract, or "append" to add a new section at the end.',
      inputSchema: z.object({
        contractId: z
          .string()
          .describe('The contract ID to update content for'),
        prompt: z
          .string()
          .describe('Instructions for what to change or add to the contract content'),
        mode: z
          .enum(['update', 'append'])
          .describe('"update" rewrites the full contract, "append" adds a new section at the end'),
        contractName: z.string().optional().describe('Contract name for context'),
      }),
      execute: async (params) => {
        try {
          return {
            success: true,
            contractId: params.contractId,
            /**
             * Tell the model to output content in the correct fence mode.
             * DO NOT include the raw prompt — the model already knows the
             * user's instructions from the conversation context.
             */
            message: `Ready to update contract content. Now output the ${params.mode === 'append' ? 'new section' : 'updated content'} inside a \`\`\`contract:${params.mode} code fence. Follow the contract generation rules from your system prompt.`,
            /** Event bus: navigate to the contract builder */
            _event: { feature: 'contract', action: 'navigate', entityId: params.contractId, navigate: true },
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('updateContractContent', err)
        }
      },
    }),

    /**
     * List contracts with optional status filter.
     */
    listContracts: tool({
      description: 'List contracts in the organization. Optionally filter by status.',
      inputSchema: z.object({
        status: z
          .enum(['DRAFT', 'ACTIVE', 'SENT', 'COMPLETED', 'ARCHIVED'])
          .optional()
          .describe('Filter by contract status'),
      }),
      execute: async (params) => {
        try {
          /* List via tRPC — enforces CONTRACTS_READ permission */
          const result = await caller.contracts.list({
            organizationId,
            status: params.status,
            page: 1,
            limit: 20,
          })
          return {
            success: true,
            contracts: result.contracts.map((c) => ({
              id: c.id,
              name: c.name,
              status: c.status,
            })),
            total: result.total,
            message: `Found ${result.total} contracts`,
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('listContracts', err)
        }
      },
    }),

    /**
     * List all contract templates in the organization.
     *
     * Templates are reusable contract blueprints (isTemplate=true) that contain
     * predefined content, variables, and structure. Users create instances from
     * templates via createContractFromTemplate.
     *
     * SOURCE OF TRUTH KEYWORDS: ListContractTemplates, AIContractTemplateList
     */
    listContractTemplates: tool({
      description:
        'List all contract templates in the organization. Templates are reusable contract ' +
        'blueprints that can be used to quickly create new contracts with predefined content, ' +
        'variables, and structure.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          /* List templates via tRPC — enforces CONTRACTS_READ permission */
          const result = await caller.contracts.list({
            organizationId,
            isTemplate: true,
            page: 1,
            limit: 50,
          })

          return {
            success: true,
            templates: result.contracts.map((c) => ({
              id: c.id,
              name: c.name,
              description: c.description,
            })),
            total: result.total,
            message:
              result.total > 0
                ? `Found ${result.total} contract template${result.total === 1 ? '' : 's'}`
                : 'No contract templates found. Create one with saveAsContractTemplate.',
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('listContractTemplates', err)
        }
      },
    }),

    /**
     * Create a new contract instance from an existing template.
     *
     * Duplicates the template's content, variables, and structure into a new
     * DRAFT contract. Optionally overrides the name, sets a recipient lead,
     * and pre-fills variable values by matching template variable names
     * (case-insensitive). If contentPrompt is provided, opens the builder
     * with AI streaming instead of returning the contract directly.
     *
     * Variable matching: Template variables are stored as
     * `{ id: string, name: string, value: string }[]`. This tool matches
     * incoming `variables` by name (case-insensitive), updates the value,
     * and leaves unmatched template variables untouched.
     *
     * SOURCE OF TRUTH KEYWORDS: CreateContractFromTemplate, AIContractTemplateInstance
     */
    createContractFromTemplate: tool({
      description:
        'Create a new contract from an existing template. The template\'s content, variables, ' +
        'and structure are copied into a new DRAFT contract. You can optionally set a custom name, ' +
        'assign a recipient (lead), pre-fill template variables with specific values, and provide a ' +
        'contentPrompt to open the builder with AI content streaming.',
      inputSchema: z.object({
        templateId: z
          .string()
          .describe('The template ID to create a contract from (from listContractTemplates)'),
        name: z
          .string()
          .optional()
          .describe('Override the contract name (defaults to the template name)'),
        recipientSearch: z
          .string()
          .optional()
          .describe(
            'Search for the recipient by name or email. PREFERRED over recipientId — ' +
            'the system finds the matching lead automatically.'
          ),
        recipientId: z
          .string()
          .optional()
          .describe('Lead ID — ONLY if verified from a previous tool result. Prefer recipientSearch.'),
        variables: z
          .array(
            z.object({
              name: z.string().describe('Variable name to match (case-insensitive)'),
              value: z.string().describe('Value to set for this variable'),
            })
          )
          .optional()
          .describe(
            'Variable values to pre-fill. Names are matched case-insensitively against the template variables.'
          ),
        contentPrompt: z
          .string()
          .optional()
          .describe(
            'If provided, opens the contract builder and streams AI-generated content changes. ' +
            'Describe what to modify or add to the template content.'
          ),
      }),
      execute: async (params) => {
        try {
          /**
           * Step 0: Resolve recipient before creating contract.
           * Done first so we fail fast on invalid recipient — no orphaned contract.
           */
          let resolvedRecipientId: string | undefined
          const leadResult = await resolveLeadId(
            caller, organizationId, params.recipientId, params.recipientSearch
          )
          if (leadResult) {
            if (!leadResult.success) return leadResult
            resolvedRecipientId = leadResult.leadId
          }

          /* Step 1: Create the contract instance from the template via tRPC */
          const contract = await caller.contracts.createFromTemplate({
            organizationId,
            templateId: params.templateId,
            name: params.name,
          })

          /* Step 2: Build update payload for recipient and/or variables */
          const updatePayload: {
            recipientId?: string
            variables?: { id: string; name: string; value: string }[]
          } = {}

          if (resolvedRecipientId) {
            updatePayload.recipientId = resolvedRecipientId
          }

          /**
           * Step 3: Merge incoming variable values into the template's variables.
           * Fetch the newly created contract to access its copied variables, then
           * match by name (case-insensitive) and update the values.
           */
          if (params.variables && params.variables.length > 0) {
            /* Fetch full contract via tRPC to get copied variables */
            const fullContract = await caller.contracts.getById({
              organizationId,
              id: contract.id,
            })

            /* Parse existing variables — Prisma Json field stores as unknown */
            const existingVars = Array.isArray(fullContract?.variables)
              ? (fullContract.variables as { id: string; name: string; value: string }[])
              : []

            if (existingVars.length > 0) {
              /* Build a lookup map from incoming variable names (lowercased) -> value */
              const incomingMap = new Map(
                params.variables.map((v) => [v.name.toLowerCase(), v.value])
              )

              /* Update matching variables in-place, leave others untouched */
              const mergedVars = existingVars.map((v) => {
                const newValue = incomingMap.get(v.name.toLowerCase())
                return newValue !== undefined ? { ...v, value: newValue } : v
              })

              updatePayload.variables = mergedVars
            }
          }

          /* Step 4: Apply updates if any fields need to be set */
          if (Object.keys(updatePayload).length > 0) {
            await caller.contracts.update({
              organizationId,
              id: contract.id,
              ...updatePayload,
            })
          }

          /**
           * Step 5: If contentPrompt is provided, navigate to the builder.
           * The model's next step outputs updated content in a ```contract fence.
           */
          if (params.contentPrompt) {
            return {
              success: true,
              contractId: contract.id,
              name: contract.name,
              /**
               * DO NOT include raw contentPrompt — model already knows the instructions.
               * Including it causes the model to echo prompt text into the fence.
               */
              message: `Contract "${contract.name}" created from template successfully. Now output the updated content inside a \`\`\`contract:update code fence. Follow the contract generation rules from your system prompt.`,
              /** Event bus: navigate to the contract builder */
              _event: { feature: 'contract', action: 'navigate', entityId: contract.id, navigate: true },
            }
          }

          return {
            success: true,
            contractId: contract.id,
            name: contract.name,
            message: `Created contract "${contract.name}" from template (ID: ${contract.id})`,
            /** Event bus: notify that a new contract was created from template */
            _event: { feature: 'contract', action: 'created', entityId: contract.id },
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('createContractFromTemplate', err)
        }
      },
    }),

    /**
     * Save an existing contract as a reusable template, or create a new blank template.
     *
     * Two modes:
     * - contractId provided: Converts the existing contract into a template
     *   by setting isTemplate=true. The contract's content, variables, and
     *   structure become the template blueprint.
     * - name provided (no contractId): Creates a brand-new blank template
     *   that can be populated later in the builder.
     *
     * These are mutually exclusive — provide one or the other.
     *
     * SOURCE OF TRUTH KEYWORDS: SaveAsContractTemplate, AIContractTemplateSave
     */
    saveAsContractTemplate: tool({
      description:
        'Save a contract as a reusable template. Either provide a contractId to convert an existing ' +
        'contract into a template, OR provide a name to create a new blank template. ' +
        'These options are mutually exclusive.',
      inputSchema: z.object({
        contractId: z
          .string()
          .optional()
          .describe(
            'Existing contract ID to convert into a template (mutually exclusive with name)'
          ),
        name: z
          .string()
          .optional()
          .describe(
            'Name for a new blank template (mutually exclusive with contractId)'
          ),
      }),
      execute: async (params) => {
        try {
          /* Validate that exactly one of contractId or name is provided */
          if (params.contractId && params.name) {
            return {
              success: false,
              message:
                'Provide either contractId (to convert an existing contract) or name (to create a blank template), not both.',
            }
          }

          if (!params.contractId && !params.name) {
            return {
              success: false,
              message:
                'Provide either a contractId to convert into a template, or a name to create a new blank template.',
            }
          }

          /**
           * Mode 1: Convert an existing contract into a template.
           * Sets isTemplate=true on the contract, preserving all content.
           */
          if (params.contractId) {
            /* Update via tRPC — enforces CONTRACTS_UPDATE permission */
            const contract = await caller.contracts.update({
              organizationId,
              id: params.contractId,
              isTemplate: true,
            })
            return {
              success: true,
              templateId: contract.id,
              name: contract.name,
              message: `Saved contract "${contract.name}" as a template (ID: ${contract.id})`,
              /** Event bus: notify that contract was converted to template */
              _event: { feature: 'contract', action: 'updated', entityId: contract.id },
            }
          }

          /**
           * Mode 2: Create a brand-new blank template.
           * Starts with no content — user can populate it in the builder.
           */
          const template = await caller.contracts.create({
            organizationId,
            name: params.name!,
            isTemplate: true,
          })

          return {
            success: true,
            templateId: template.id,
            name: template.name,
            message: `Created blank template "${template.name}" (ID: ${template.id})`,
            /** Event bus: notify that a new template was created */
            _event: { feature: 'contract', action: 'created', entityId: template.id },
          }
        } catch (err) {
          /** Catch and normalize errors via shared handler */
          return handleToolError('saveAsContractTemplate', err)
        }
      },
    }),
  }
}
