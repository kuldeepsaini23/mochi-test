/**
 * ============================================================================
 * MOCHI AI TOOLS - DATASETS / CMS (Custom Data)
 * ============================================================================
 *
 * Vercel AI SDK tool definitions for full CMS management:
 * - Create datasets (tables) with configurable fields (columns)
 * - Create, read, and update rows (lead custom data responses)
 * - List datasets and their structure
 * - NO DELETE operations — deletion is not available through AI
 *
 * Uses "Label:TYPE" flat string format for field creation because
 * nested z.object() arrays break AI model tool calling.
 *
 * For TEXTAREA fields, the AI should provide well-formatted plain text.
 * Multi-line content with markdown-like formatting is supported in
 * text areas (line breaks preserved, but no rich-text rendering).
 *
 * SECURITY: All operations route through the tRPC caller instead of calling
 * service functions directly. This ensures every call passes through the
 * full middleware chain — permissions, feature gates, Stripe connect checks.
 *
 * SOURCE OF TRUTH KEYWORDS: MochiDatasetTools, AIDatasetManagement, MochiCmsTools
 * ============================================================================
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { TRPCCaller } from '@/trpc/server'
import type { CustomDataFieldType } from '@/generated/prisma'
import { handleToolError } from './tool-error'

/**
 * Common aliases -> canonical field types.
 * AI models often pass "boolean", "string", "text" etc. instead of the exact enum value.
 * Normalization happens inside the execute function (NOT in Zod schema)
 * because Vercel AI SDK can't serialize .transform() to JSON Schema.
 */
const FIELD_TYPE_ALIASES: Record<string, string> = {
  boolean: 'CHECKBOX',
  bool: 'CHECKBOX',
  toggle: 'CHECKBOX',
  string: 'TEXT',
  text: 'TEXT',
  richtext: 'TEXTAREA',
  rich_text: 'TEXTAREA',
  textarea: 'TEXTAREA',
  longtext: 'TEXTAREA',
  number: 'NUMBER',
  integer: 'NUMBER',
  int: 'NUMBER',
  float: 'NUMBER',
  decimal: 'NUMBER',
  currency: 'CURRENCY',
  money: 'CURRENCY',
  price: 'CURRENCY',
  email: 'EMAIL',
  phone: 'PHONE',
  tel: 'PHONE',
  url: 'URL',
  link: 'URL',
  date: 'DATE',
  datetime: 'DATETIME',
  checkbox: 'CHECKBOX',
  radio: 'RADIO',
  select: 'SELECT',
  dropdown: 'SELECT',
  multiselect: 'MULTISELECT',
  multi_select: 'MULTISELECT',
}

/**
 * Resolves a field type string to a canonical CustomDataFieldType.
 * Handles case-insensitivity and common aliases like "boolean" -> "CHECKBOX".
 */
function resolveFieldType(raw: string): string {
  const lower = raw.toLowerCase()
  if (FIELD_TYPE_ALIASES[lower]) return FIELD_TYPE_ALIASES[lower]
  return raw.toUpperCase()
}

/**
 * Creates all dataset/CMS-related tools bound to the given organization.
 * Each tool calls the tRPC caller with organizationId pre-bound,
 * enforcing permissions on every operation.
 *
 * @param organizationId - The org these tools operate on
 * @param caller - tRPC caller for secure procedure invocation
 */
export function createDatasetTools(organizationId: string, caller: TRPCCaller) {
  return {
    // ========================================================================
    // DATASET (TABLE) MANAGEMENT
    // ========================================================================

    /**
     * Create a new dataset (custom data category).
     * Routes through caller.customData.createCategory() which enforces
     * CUSTOM_FIELDS_CREATE permission and duplicate slug check.
     */
    createDataset: tool({
      description: 'Create a new dataset (custom data table).',
      inputSchema: z.object({
        name: z.string().describe('Dataset name'),
        description: z.string().optional().describe('Dataset description'),
        icon: z.string().optional().describe('Icon identifier'),
      }),
      execute: async (params) => {
        try {
          const dataset = await caller.customData.createCategory({
            organizationId,
            name: params.name,
            description: params.description,
            icon: params.icon,
          })
          return {
            success: true,
            datasetId: dataset.id,
            name: dataset.name,
            message: `Created dataset "${params.name}" (ID: ${dataset.id})`,
          }
        } catch (err) {
          return handleToolError('createDataset', err)
        }
      },
    }),

    /**
     * List all datasets in the organization.
     * Routes through caller.customData.listCategories() which enforces
     * CUSTOM_FIELDS_READ permission.
     */
    listDatasets: tool({
      description: 'List all datasets (custom data tables) in the organization.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const datasets = await caller.customData.listCategories({ organizationId })
          return {
            success: true,
            datasets: datasets.map((d) => ({
              id: d.id,
              name: d.name,
              description: d.description,
            })),
            message: `Found ${datasets.length} datasets`,
          }
        } catch (err) {
          return handleToolError('listDatasets', err)
        }
      },
    }),

    /**
     * Get a dataset with its field definitions (column schema).
     * Routes through caller.customData.getCategory() which enforces
     * CUSTOM_FIELDS_READ permission and throws NOT_FOUND if missing.
     */
    getDataset: tool({
      description:
        'Get a dataset by ID with its field definitions (columns). ' +
        'Use this to see what fields a dataset has before creating or updating rows.',
      inputSchema: z.object({
        datasetId: z.string().describe('The dataset ID'),
      }),
      execute: async (params) => {
        try {
          const dataset = await caller.customData.getCategory({
            organizationId,
            categoryId: params.datasetId,
          })
          return {
            success: true,
            dataset: {
              id: dataset.id,
              name: dataset.name,
              description: dataset.description,
              fields: dataset.fields,
            },
            message: `Found dataset "${dataset.name}" with ${dataset.fields.length} fields`,
          }
        } catch (err) {
          return handleToolError('getDataset', err)
        }
      },
    }),

    /**
     * Rename or update a dataset's metadata (name, description, icon).
     * Routes through caller.customData.updateCategory() which enforces
     * CUSTOM_FIELDS_UPDATE permission, existence check, and slug uniqueness.
     */
    updateDataset: tool({
      description:
        'Rename a dataset or update its description/icon. ' +
        'Only provide the fields you want to change.',
      inputSchema: z.object({
        datasetId: z.string().describe('The dataset ID to update'),
        name: z.string().optional().describe('New dataset name'),
        description: z.string().optional().describe('New description'),
        icon: z.string().optional().describe('New icon identifier'),
      }),
      execute: async (params) => {
        try {
          const { datasetId, ...data } = params
          const dataset = await caller.customData.updateCategory({
            organizationId,
            categoryId: datasetId,
            ...data,
          })
          return {
            success: true,
            datasetId: dataset.id,
            name: dataset.name,
            message: `Updated dataset "${dataset.name}"`,
          }
        } catch (err) {
          return handleToolError('updateDataset', err)
        }
      },
    }),

    /**
     * Create a dataset WITH fields in one call — this is the preferred tool
     * whenever the user specifies fields. Also supports adding fields to an
     * existing dataset when datasetId is provided.
     *
     * Uses a simple "Label:TYPE" string format for fields to avoid nested-object
     * issues with AI model tool calling.
     */
    createDatasetWithFields: tool({
      description:
        'Create a new dataset with fields in a single call. This is the PREFERRED tool whenever the user ' +
        'mentions fields. Also adds fields to an existing dataset when datasetId is provided. ' +
        'Each field string must be in "Label:TYPE" format. ' +
        'Valid types: TEXT, TEXTAREA, NUMBER, CURRENCY, EMAIL, PHONE, URL, DATE, DATETIME, CHECKBOX, RADIO, SELECT, MULTISELECT. ' +
        'Use CHECKBOX for boolean/toggle fields. Use TEXTAREA for long text or rich content fields. ' +
        'Example fields: ["Company:TEXT", "Ticket Type:TEXT", "Attended:CHECKBOX", "Rating:NUMBER", "Notes:TEXTAREA"]',
      inputSchema: z.object({
        datasetId: z.string().optional().describe('If provided, adds fields to this existing dataset instead of creating a new one'),
        name: z.string().optional().describe('Dataset name (required when creating a new dataset)'),
        description: z.string().optional().describe('Dataset description'),
        fields: z
          .array(z.string())
          .describe(
            'Array of fields in "Label:TYPE" format. ' +
            'Example: ["Company:TEXT", "Email:EMAIL", "Attended:CHECKBOX", "Start Date:DATE", "Bio:TEXTAREA"]. ' +
            'Valid types: TEXT, TEXTAREA, NUMBER, CURRENCY, EMAIL, PHONE, URL, DATE, DATETIME, CHECKBOX, RADIO, SELECT, MULTISELECT'
          ),
      }),
      execute: async (params) => {
        try {
          let datasetId = params.datasetId
          let datasetName = params.name || 'Untitled Dataset'

          /**
           * If no datasetId is provided, create a new dataset first via tRPC.
           * Otherwise we're adding fields to an existing one.
           */
          if (!datasetId) {
            const dataset = await caller.customData.createCategory({
              organizationId,
              name: datasetName,
              description: params.description,
            })
            datasetId = dataset.id
            datasetName = dataset.name
          }

          /** Parse "Label:TYPE" strings and create each field via tRPC */
          const createdFields: string[] = []
          const failedFields: string[] = []

          for (const fieldStr of params.fields) {
            try {
              const colonIdx = fieldStr.lastIndexOf(':')
              const label = colonIdx > 0 ? fieldStr.slice(0, colonIdx).trim() : fieldStr.trim()
              const rawType = colonIdx > 0 ? fieldStr.slice(colonIdx + 1).trim() : 'TEXT'
              const resolvedType = resolveFieldType(rawType)
              const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

              await caller.customData.createField({
                organizationId,
                categoryId: datasetId,
                name: slug,
                label,
                fieldType: resolvedType as CustomDataFieldType,
                required: false,
              })
              createdFields.push(label)
            } catch (err) {
              failedFields.push(`${fieldStr}: ${err instanceof Error ? err.message : 'Unknown error'}`)
            }
          }

          const message = failedFields.length > 0
            ? `Created dataset "${datasetName}" with ${createdFields.length}/${params.fields.length} fields. Failed: ${failedFields.join(', ')}`
            : params.datasetId
              ? `Added ${createdFields.length} fields to existing dataset`
              : `Created dataset "${datasetName}" with ${createdFields.length} fields (ID: ${datasetId})`

          return {
            success: createdFields.length > 0,
            datasetId,
            name: datasetName,
            fieldsCreated: createdFields,
            fieldsFailed: failedFields,
            message,
          }
        } catch (err) {
          return handleToolError('createDatasetWithFields', err)
        }
      },
    }),

    // ========================================================================
    // ROW (RESPONSE) MANAGEMENT — Create, Read, Update data in datasets
    // ========================================================================

    /**
     * Save or update data for a lead in a dataset (create/update a row).
     * Values are keyed by field slug (the auto-generated name from the field label).
     * If the lead already has data for this dataset, a new version is created.
     *
     * Use getDataset first to see available field slugs, then pass values
     * as a flat "fieldSlug:value" string array to avoid nested-object issues.
     *
     * Routes through caller.customData.saveResponse() which enforces
     * LEADS_UPDATE permission and validates both lead and category.
     */
    saveCmsData: tool({
      description:
        'Save or update custom data for a lead in a dataset (create/update a row). ' +
        'Pass data as flat "fieldSlug:value" strings to populate the row. ' +
        'Use getDataset first to see the field slugs (column names). ' +
        'If the lead already has data, a new version is created (non-destructive). ' +
        'For TEXTAREA fields, use \\n for line breaks in longer content. ' +
        'Example: saveCmsData(datasetId="xxx", leadId="yyy", data=["company:Acme Corp", "rating:5", "notes:Great customer.\\nVIP status."])',
      inputSchema: z.object({
        datasetId: z.string().describe('The dataset ID (from createDataset, listDatasets, or getDataset result)'),
        leadId: z.string().describe('The lead ID to save data for (from listLeads or search result)'),
        data: z
          .array(z.string())
          .describe(
            'Field values as "fieldSlug:value" strings. ' +
            'The fieldSlug is the auto-generated name from the field label (lowercase, underscores). ' +
            'Example: ["company:Acme Corp", "email:john@acme.com", "attended:true", "rating:5", "notes:Multi-line\\ncontent here"]'
          ),
      }),
      execute: async (params) => {
        try {
          /**
           * First, get the dataset to know the field definitions.
           * This lets us validate field slugs and auto-coerce types.
           */
          const dataset = await caller.customData.getCategory({
            organizationId,
            categoryId: params.datasetId,
          })

          /** Build a slug -> field type map for type coercion */
          const fieldTypeMap = new Map<string, string>()
          for (const field of dataset.fields) {
            fieldTypeMap.set(field.slug, field.fieldType)
          }

          /**
           * Parse "fieldSlug:value" strings into a values object.
           * Coerce types based on field definitions (e.g., NUMBER -> number).
           */
          const values: Record<string, unknown> = {}
          const parsedFields: string[] = []
          const skippedFields: string[] = []

          for (const entry of params.data) {
            /** Split on first colon only — value may contain colons */
            const colonIdx = entry.indexOf(':')
            if (colonIdx <= 0) {
              skippedFields.push(entry)
              continue
            }

            const slug = entry.slice(0, colonIdx).trim()
            let rawValue: string = entry.slice(colonIdx + 1).trim()

            /** Unescape literal \n to real newlines for TEXTAREA content */
            rawValue = rawValue.replace(/\\n/g, '\n')

            const fieldType = fieldTypeMap.get(slug)
            if (!fieldType) {
              skippedFields.push(`${slug} (unknown field)`)
              continue
            }

            /** Coerce value based on field type */
            switch (fieldType) {
              case 'NUMBER':
              case 'CURRENCY': {
                const num = Number(rawValue)
                values[slug] = isNaN(num) ? rawValue : num
                break
              }
              case 'CHECKBOX': {
                values[slug] = rawValue === 'true' || rawValue === '1' || rawValue === 'yes'
                break
              }
              case 'MULTISELECT': {
                /** Support comma-separated values for multiselect */
                values[slug] = rawValue.split(',').map((v) => v.trim())
                break
              }
              default: {
                values[slug] = rawValue
              }
            }
            parsedFields.push(slug)
          }

          /**
           * If the lead doesn't have a response yet, we need to ensure they're
           * added to the dataset first. addLeadsToCategory skips duplicates.
           */
          try {
            await caller.customData.addLeadsToCategory({
              organizationId,
              categoryId: params.datasetId,
              leadIds: [params.leadId],
            })
          } catch {
            /** Silently continue — lead may already be in dataset */
          }

          /** Save the response via tRPC (creates new version) */
          const response = await caller.customData.saveResponse({
            organizationId,
            leadId: params.leadId,
            categoryId: params.datasetId,
            values,
          })

          return {
            success: true,
            datasetId: params.datasetId,
            leadId: params.leadId,
            fieldsSaved: parsedFields,
            fieldsSkipped: skippedFields,
            version: response.version,
            message: `Saved ${parsedFields.length} field(s) for lead in dataset "${dataset.name}" (version ${response.version})${
              skippedFields.length > 0 ? `. Skipped: ${skippedFields.join(', ')}` : ''
            }`,
          }
        } catch (err) {
          return handleToolError('saveCmsData', err)
        }
      },
    }),

    /**
     * Get a lead's custom data for a specific dataset (read a row).
     * Returns the latest version of the data with field labels for context.
     *
     * Routes through caller.customData.getResponseForCategory() which enforces
     * LEADS_READ permission.
     */
    getCmsData: tool({
      description:
        'Get a lead\'s custom data for a specific dataset (read a single row). ' +
        'Returns the latest field values with labels. ' +
        'Use this before updating to see current values.',
      inputSchema: z.object({
        datasetId: z.string().describe('The dataset ID'),
        leadId: z.string().describe('The lead ID to get data for'),
      }),
      execute: async (params) => {
        try {
          const result = await caller.customData.getResponseForCategory({
            organizationId,
            leadId: params.leadId,
            categoryId: params.datasetId,
          })

          /**
           * Build a readable summary of the current data.
           * Maps field slugs to their labels for human-readable output.
           */
          const currentValues = (result.currentResponse?.values as Record<string, unknown>) || {}
          const fieldMap = result.category.fields.map((f) => ({
            slug: f.slug,
            label: f.label,
            type: f.fieldType,
            value: currentValues[f.slug] ?? null,
          }))

          return {
            success: true,
            datasetId: params.datasetId,
            datasetName: result.category.name,
            leadId: params.leadId,
            version: result.currentResponse?.version || 0,
            fields: fieldMap,
            message: result.currentResponse
              ? `Found data for lead in "${result.category.name}" (version ${result.currentResponse.version})`
              : `No data found for lead in "${result.category.name}" — lead may not be in this dataset yet`,
          }
        } catch (err) {
          return handleToolError('getCmsData', err)
        }
      },
    }),

    /**
     * List all rows (lead responses) in a dataset.
     * Returns leads with their custom data values for the given dataset.
     * Useful for viewing all data in a dataset table.
     *
     * Routes through caller.customData.getDatasetRows() which enforces
     * CUSTOM_FIELDS_READ permission.
     */
    getDatasetRows: tool({
      description:
        'List all rows in a dataset (leads with their custom data values). ' +
        'Returns the field definitions and all lead data for the dataset. ' +
        'Use this to view the full table contents.',
      inputSchema: z.object({
        datasetId: z.string().describe('The dataset ID'),
        limit: z
          .number()
          .optional()
          .describe('Max rows to return (default: 50, max: 100)'),
      }),
      execute: async (params) => {
        try {
          const result = await caller.customData.getDatasetRows({
            organizationId,
            categoryId: params.datasetId,
            limit: params.limit,
          })

          return {
            success: true,
            datasetId: params.datasetId,
            datasetName: result.categoryName,
            fields: result.fields,
            rows: result.rows,
            total: result.total,
            message: `Found ${result.total} rows in "${result.categoryName}"`,
          }
        } catch (err) {
          return handleToolError('getDatasetRows', err)
        }
      },
    }),

    // ========================================================================
    // LEAD-DATASET RELATIONSHIPS
    // ========================================================================

    /**
     * Add one or more leads to a dataset (with optional initial data).
     * Creates empty responses for each lead (skips duplicates).
     * After adding, use saveCmsData to populate field values.
     *
     * Routes through caller.customData.addLeadsToCategory() which enforces
     * CUSTOM_FIELDS_CREATE permission and validates category belongs to org.
     */
    addLeadsToDataset: tool({
      description:
        'Add one or more leads to a dataset. Use listLeads to find lead IDs first. ' +
        'Creates empty rows for each lead (skips duplicates). ' +
        'After adding, use saveCmsData to populate field values.',
      inputSchema: z.object({
        datasetId: z.string().describe('The dataset ID'),
        leadIds: z
          .array(z.string())
          .describe('Array of lead IDs to add to the dataset'),
      }),
      execute: async (params) => {
        try {
          const results = await caller.customData.addLeadsToCategory({
            organizationId,
            categoryId: params.datasetId,
            leadIds: params.leadIds,
          })
          return {
            success: true,
            datasetId: params.datasetId,
            leadsAdded: Array.isArray(results) ? results.length : params.leadIds.length,
            leadsRequested: params.leadIds.length,
            message: `Added leads to dataset`,
          }
        } catch (err) {
          return handleToolError('addLeadsToDataset', err)
        }
      },
    }),
  }
}
