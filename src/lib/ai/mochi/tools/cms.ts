/**
 * ============================================================================
 * MOCHI AI TOOLS - CMS (Content Management System)
 * ============================================================================
 *
 * Vercel AI SDK tool definitions for CMS table management.
 * CMS tables are standalone content collections (blog posts, team members,
 * portfolio items, FAQs, etc.) that power the SmartCMS List element
 * on published websites.
 *
 * CMS tables are DIFFERENT from datasets (custom data categories).
 * - CMS tables: Standalone content collections with rows displayed on websites
 * - Datasets: Lead-scoped custom fields attached to contacts in the CRM
 *
 * Column types: TEXT, NUMBER, BOOLEAN, MULTISELECT, DATE, IMAGE_URL, RICH_TEXT
 * (DATE_CREATED and DATE_UPDATED are auto-added system columns)
 *
 * SECURITY: All operations route through the tRPC caller to enforce
 * permissions (CMS_READ, CMS_CREATE, CMS_UPDATE) and feature gates
 * (cms_tables.limit).
 *
 * SOURCE OF TRUTH KEYWORDS: MochiCmsTableTools, AICmsManagement
 * ============================================================================
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { TRPCCaller } from '@/trpc/server'
import type { CmsColumnType } from '@/generated/prisma'
import { handleToolError } from './tool-error'
import { markdownToLexicalJson } from './markdown-to-lexical'

// ============================================================================
// COLUMN TYPE ALIASES — normalize AI model output to canonical CmsColumnType
// ============================================================================

/**
 * Maps common names the AI might use to canonical CmsColumnType values.
 * The CMS supports: TEXT, NUMBER, BOOLEAN, MULTISELECT, DATE, IMAGE_URL
 * (DATE_CREATED and DATE_UPDATED are system-managed — cannot be created manually)
 */
const CMS_COLUMN_TYPE_ALIASES: Record<string, string> = {
  text: 'TEXT',
  string: 'TEXT',
  title: 'TEXT',
  name: 'TEXT',
  description: 'TEXT',
  richtext: 'RICH_TEXT',
  rich_text: 'RICH_TEXT',
  textarea: 'RICH_TEXT',
  longtext: 'RICH_TEXT',
  html: 'RICH_TEXT',
  content: 'RICH_TEXT',
  body: 'RICH_TEXT',
  number: 'NUMBER',
  integer: 'NUMBER',
  int: 'NUMBER',
  float: 'NUMBER',
  decimal: 'NUMBER',
  price: 'NUMBER',
  currency: 'NUMBER',
  boolean: 'BOOLEAN',
  bool: 'BOOLEAN',
  checkbox: 'BOOLEAN',
  toggle: 'BOOLEAN',
  multiselect: 'MULTISELECT',
  multi_select: 'MULTISELECT',
  select: 'MULTISELECT',
  tags: 'MULTISELECT',
  dropdown: 'MULTISELECT',
  date: 'DATE',
  datetime: 'DATE',
  image: 'IMAGE_URL',
  image_url: 'IMAGE_URL',
  imageurl: 'IMAGE_URL',
  img: 'IMAGE_URL',
  photo: 'IMAGE_URL',
  thumbnail: 'IMAGE_URL',
  avatar: 'IMAGE_URL',
  url: 'TEXT',
  link: 'TEXT',
  email: 'TEXT',
  phone: 'TEXT',
}

/**
 * Resolves a column type string to a canonical CmsColumnType.
 * Case-insensitive with common alias support.
 */
function resolveCmsColumnType(raw: string): string {
  const lower = raw.toLowerCase().trim()
  return CMS_COLUMN_TYPE_ALIASES[lower] || raw.toUpperCase()
}

/**
 * Creates all CMS-related tools bound to the given organization.
 * Each tool calls the tRPC caller with organizationId pre-bound,
 * enforcing permissions on every operation.
 */
export function createCmsTools(organizationId: string, caller: TRPCCaller) {
  return {
    // ========================================================================
    // CMS TABLE MANAGEMENT
    // ========================================================================

    /**
     * Create a new CMS table with columns in a single call.
     * This is the primary tool for creating CMS tables.
     * Columns are defined using flat "Label:TYPE" string format.
     *
     * tRPC routes: caller.cms.createTable (CMS_CREATE) + caller.cms.createColumn (CMS_CREATE)
     */
    createCmsTable: tool({
      description:
        'Create a new CMS table with columns. CMS tables are content collections ' +
        '(blog posts, team members, FAQs, portfolio items, etc.) displayed on websites via SmartCMS List. ' +
        'Each column string is in "Label:TYPE" format. ' +
        'Valid types: TEXT, NUMBER, BOOLEAN, MULTISELECT, DATE, IMAGE_URL, RICH_TEXT. ' +
        'Use RICH_TEXT for formatted content (supports markdown: headings, bold, italic, lists, links). ' +
        'DATE_CREATED and DATE_UPDATED columns are added automatically. ' +
        'Example: createCmsTable(name="Blog Posts", columns=["Title:TEXT", "Content:RICH_TEXT", "Author:TEXT", "Published:BOOLEAN", "Cover Image:IMAGE_URL"])',
      inputSchema: z.object({
        name: z.string().describe('Table name (e.g., "Blog Posts", "Team Members", "FAQs")'),
        description: z.string().optional().describe('Internal description for the table'),
        icon: z.string().optional().describe('Emoji icon for the table (e.g., "📝", "👥", "❓")'),
        columns: z
          .array(z.string())
          .describe(
            'Columns in "Label:TYPE" format. ' +
            'Valid types: TEXT (short text/string), RICH_TEXT (formatted content with headings, bold, lists — use for blog body, descriptions, bios), ' +
            'NUMBER (numeric values), BOOLEAN (true/false), MULTISELECT (tags/categories), DATE (dates), IMAGE_URL (image links). ' +
            'Example: ["Title:TEXT", "Body:RICH_TEXT", "Price:NUMBER", "Featured:BOOLEAN", "Tags:MULTISELECT", "Photo:IMAGE_URL"]'
          ),
      }),
      execute: async (params) => {
        try {
          /** Create the table via tRPC — handles slug generation and feature gate */
          const table = await caller.cms.createTable({
            organizationId,
            name: params.name,
            description: params.description,
            icon: params.icon,
          })

          /** Parse "Label:TYPE" strings and create each column via tRPC */
          const createdColumns: string[] = []
          const failedColumns: string[] = []

          for (let i = 0; i < params.columns.length; i++) {
            const colStr = params.columns[i]
            try {
              const colonIdx = colStr.lastIndexOf(':')
              const name = colonIdx > 0 ? colStr.slice(0, colonIdx).trim() : colStr.trim()
              const rawType = colonIdx > 0 ? colStr.slice(colonIdx + 1).trim() : 'TEXT'
              const resolvedType = resolveCmsColumnType(rawType)

              await caller.cms.createColumn({
                organizationId,
                tableId: table.id,
                name,
                columnType: resolvedType as CmsColumnType,
                order: i,
              })
              createdColumns.push(name)
            } catch (err) {
              failedColumns.push(`${colStr}: ${err instanceof Error ? err.message : 'Unknown error'}`)
            }
          }

          return {
            success: true,
            tableId: table.id,
            tableName: table.name,
            columnsCreated: createdColumns,
            columnsFailed: failedColumns,
            message: failedColumns.length > 0
              ? `Created CMS table "${params.name}" with ${createdColumns.length}/${params.columns.length} columns (ID: ${table.id}). Failed: ${failedColumns.join(', ')}`
              : `Created CMS table "${params.name}" with ${createdColumns.length} columns (ID: ${table.id})`,
          }
        } catch (err) {
          return handleToolError('createCmsTable', err)
        }
      },
    }),

    /**
     * List all CMS tables in the organization.
     *
     * tRPC route: caller.cms.listTables (CMS_READ)
     */
    listCmsTables: tool({
      description: 'List all CMS tables in the organization.',
      inputSchema: z.object({
        search: z.string().optional().describe('Search tables by name'),
      }),
      execute: async (params) => {
        try {
          const result = await caller.cms.listTables({
            organizationId,
            search: params.search,
          })
          return {
            success: true,
            tables: result.tables.map((t) => ({
              id: t.id,
              name: t.name,
              description: t.description,
              columnsCount: t.columnsCount,
              rowsCount: t.rowsCount,
            })),
            total: result.tables.length,
            message: `Found ${result.tables.length} CMS tables`,
          }
        } catch (err) {
          return handleToolError('listCmsTables', err)
        }
      },
    }),

    /**
     * Get a CMS table with its column definitions.
     * Use this to see the table schema before creating or updating rows.
     *
     * tRPC route: caller.cms.getTable (CMS_READ)
     */
    getCmsTable: tool({
      description:
        'Get a CMS table by ID with its column definitions. ' +
        'Use this to see the column slugs before creating or updating rows.',
      inputSchema: z.object({
        tableId: z.string().describe('The CMS table ID'),
      }),
      execute: async (params) => {
        try {
          const table = await caller.cms.getTable({
            organizationId,
            tableId: params.tableId,
          })
          return {
            success: true,
            table: {
              id: table.id,
              name: table.name,
              description: table.description,
              columns: table.columns,
            },
            message: `Found CMS table "${table.name}" with ${table.columns.length} columns`,
          }
        } catch (err) {
          return handleToolError('getCmsTable', err)
        }
      },
    }),

    /**
     * Update a CMS table's name, description, or icon.
     * Only pass the fields you want to change.
     *
     * tRPC route: caller.cms.updateTable (CMS_UPDATE)
     */
    updateCmsTable: tool({
      description: 'Update a CMS table name, description, or icon. Only pass fields you want to change.',
      inputSchema: z.object({
        tableId: z.string().describe('The CMS table ID to update'),
        name: z.string().optional().describe('New table name'),
        description: z.string().optional().describe('New description'),
        icon: z.string().optional().describe('New emoji icon'),
      }),
      execute: async (params) => {
        try {
          const { tableId, ...data } = params
          const table = await caller.cms.updateTable({
            organizationId,
            tableId,
            ...data,
          })
          return {
            success: true,
            tableId: table.id,
            name: table.name,
            message: `Updated CMS table "${table.name}"`,
          }
        } catch (err) {
          return handleToolError('updateCmsTable', err)
        }
      },
    }),

    /**
     * Add columns to an existing CMS table.
     * Uses the same "Label:TYPE" format as createCmsTable.
     *
     * tRPC route: caller.cms.createColumn (CMS_CREATE)
     */
    addCmsColumns: tool({
      description:
        'Add columns to an existing CMS table. ' +
        'Each column string is in "Label:TYPE" format. ' +
        'Valid types: TEXT, NUMBER, BOOLEAN, MULTISELECT, DATE, IMAGE_URL, RICH_TEXT. ' +
        'Example: addCmsColumns(tableId="xxx", columns=["Author:TEXT", "Bio:RICH_TEXT", "Published:BOOLEAN"])',
      inputSchema: z.object({
        tableId: z.string().describe('The CMS table ID to add columns to'),
        columns: z
          .array(z.string())
          .describe(
            'Columns in "Label:TYPE" format. ' +
            'Example: ["Author:TEXT", "Featured:BOOLEAN", "Tags:MULTISELECT"]'
          ),
      }),
      execute: async (params) => {
        try {
          /**
           * Get existing columns to determine the next order value.
           * New columns are appended after existing ones.
           */
          const existingColumns = await caller.cms.listColumns({
            organizationId,
            tableId: params.tableId,
          })
          let nextOrder = existingColumns.length

          const createdColumns: string[] = []
          const failedColumns: string[] = []

          for (const colStr of params.columns) {
            try {
              const colonIdx = colStr.lastIndexOf(':')
              const name = colonIdx > 0 ? colStr.slice(0, colonIdx).trim() : colStr.trim()
              const rawType = colonIdx > 0 ? colStr.slice(colonIdx + 1).trim() : 'TEXT'
              const resolvedType = resolveCmsColumnType(rawType)

              await caller.cms.createColumn({
                organizationId,
                tableId: params.tableId,
                name,
                columnType: resolvedType as CmsColumnType,
                order: nextOrder++,
              })
              createdColumns.push(name)
            } catch (err) {
              failedColumns.push(`${colStr}: ${err instanceof Error ? err.message : 'Unknown error'}`)
            }
          }

          return {
            success: true,
            tableId: params.tableId,
            columnsCreated: createdColumns,
            columnsFailed: failedColumns,
            message: `Added ${createdColumns.length} columns to CMS table`,
          }
        } catch (err) {
          return handleToolError('addCmsColumns', err)
        }
      },
    }),

    // ========================================================================
    // CMS ROW MANAGEMENT — Create, Read, Update rows in CMS tables
    // ========================================================================

    /**
     * Create a new row in a CMS table.
     * Values are passed as flat "columnSlug:value" strings.
     * Use getCmsTable first to see the column slugs.
     *
     * tRPC route: caller.cms.createRow (CMS_CREATE)
     */
    createCmsRow: tool({
      description:
        'Create a new row in a CMS table. ' +
        'Pass data as flat "columnSlug:value" strings. ' +
        'Use getCmsTable first to see column slugs. ' +
        'For BOOLEAN columns, use "true" or "false". ' +
        'For MULTISELECT columns, use comma-separated values. ' +
        'For IMAGE_URL columns, pass a full image URL. ' +
        'For RICH_TEXT columns, write markdown content (headings with #, **bold**, *italic*, - bullet lists, 1. numbered lists, [links](url), > quotes). ' +
        'The markdown is automatically converted to the rich text editor format. ' +
        'Example: createCmsRow(tableId="xxx", data=["title:My Blog Post", "body:# Introduction\\n\\nThis is a **great** article about...\\n\\n## Key Points\\n\\n- First point\\n- Second point", "published:true"])',
      inputSchema: z.object({
        tableId: z.string().describe('The CMS table ID to add a row to'),
        data: z
          .array(z.string())
          .describe(
            'Row values as "columnSlug:value" strings. ' +
            'The slug is the auto-generated name from the column label (lowercase, hyphens). ' +
            'Example: ["title:Hello World", "author:John Doe", "published:true", "tags:tech,news", "cover-image:https://example.com/img.jpg"]'
          ),
      }),
      execute: async (params) => {
        try {
          /**
           * Get the table schema to know column types for value coercion.
           * This ensures numbers are stored as numbers, booleans as booleans, etc.
           */
          const table = await caller.cms.getTable({
            organizationId,
            tableId: params.tableId,
          })

          /** Build column slug → type map for coercion */
          const columnTypeMap = new Map<string, string>()
          for (const col of table.columns) {
            columnTypeMap.set(col.slug, col.columnType)
          }

          /** Parse "columnSlug:value" strings into a values object with type coercion */
          const values: Record<string, unknown> = {}
          const parsedColumns: string[] = []
          const skippedColumns: string[] = []

          for (const entry of params.data) {
            const colonIdx = entry.indexOf(':')
            if (colonIdx <= 0) {
              skippedColumns.push(entry)
              continue
            }

            const slug = entry.slice(0, colonIdx).trim()
            let rawValue: string = entry.slice(colonIdx + 1).trim()

            /** Unescape literal \n to real newlines for text content */
            rawValue = rawValue.replace(/\\n/g, '\n')

            const colType = columnTypeMap.get(slug)
            if (!colType) {
              skippedColumns.push(`${slug} (unknown column)`)
              continue
            }

            /** Coerce value based on column type */
            switch (colType) {
              case 'NUMBER': {
                const num = Number(rawValue)
                values[slug] = isNaN(num) ? rawValue : num
                break
              }
              case 'BOOLEAN': {
                values[slug] = rawValue === 'true' || rawValue === '1' || rawValue === 'yes'
                break
              }
              case 'MULTISELECT': {
                values[slug] = rawValue.split(',').map((v) => v.trim())
                break
              }
              case 'RICH_TEXT': {
                /**
                 * Convert markdown to Lexical JSON for the rich text editor.
                 * The AI writes markdown (headings, bold, lists, links, etc.)
                 * and we convert it server-side to the serialized Lexical format
                 * that RichTextEditor.initialContent expects.
                 */
                values[slug] = markdownToLexicalJson(rawValue)
                break
              }
              default: {
                values[slug] = rawValue
              }
            }
            parsedColumns.push(slug)
          }

          /** Create the row via tRPC */
          const row = await caller.cms.createRow({
            organizationId,
            tableId: params.tableId,
            values,
          })

          return {
            success: true,
            tableId: params.tableId,
            rowId: row.id,
            columnsSaved: parsedColumns,
            columnsSkipped: skippedColumns,
            message: `Created row in CMS table "${table.name}" with ${parsedColumns.length} values (Row ID: ${row.id})${
              skippedColumns.length > 0 ? `. Skipped: ${skippedColumns.join(', ')}` : ''
            }`,
          }
        } catch (err) {
          return handleToolError('createCmsRow', err)
        }
      },
    }),

    /**
     * Update an existing row in a CMS table.
     * Supports partial updates — only the columns you pass are changed.
     * Existing values are preserved and merged.
     *
     * tRPC route: caller.cms.updateRow (CMS_UPDATE)
     */
    updateCmsRow: tool({
      description:
        'Update an existing row in a CMS table. Only pass columns you want to change. ' +
        'Existing values are preserved. ' +
        'Use getCmsTable to see column slugs and listCmsRows to find row IDs. ' +
        'Example: updateCmsRow(rowId="xxx", data=["title:Updated Title", "published:true"])',
      inputSchema: z.object({
        rowId: z.string().describe('The row ID to update (from createCmsRow or listCmsRows result)'),
        data: z
          .array(z.string())
          .describe(
            'Updated values as "columnSlug:value" strings. Only pass columns to change. ' +
            'Example: ["title:New Title", "published:false"]'
          ),
      }),
      execute: async (params) => {
        try {
          /**
           * Get the row first to know the table and column types.
           * The tRPC updateRow endpoint merges new values with existing ones.
           */
          const existingRow = await caller.cms.getRow({
            organizationId,
            rowId: params.rowId,
          })

          /** Build column slug → type map from the table's columns */
          const columnTypeMap = new Map<string, string>()
          for (const col of existingRow.table.columns) {
            columnTypeMap.set(col.slug, col.columnType)
          }

          /** Parse "columnSlug:value" strings with type coercion */
          const values: Record<string, unknown> = {}
          const updatedColumns: string[] = []

          for (const entry of params.data) {
            const colonIdx = entry.indexOf(':')
            if (colonIdx <= 0) continue

            const slug = entry.slice(0, colonIdx).trim()
            let rawValue: string = entry.slice(colonIdx + 1).trim()
            rawValue = rawValue.replace(/\\n/g, '\n')

            const colType = columnTypeMap.get(slug)
            if (!colType) continue

            switch (colType) {
              case 'NUMBER': {
                const num = Number(rawValue)
                values[slug] = isNaN(num) ? rawValue : num
                break
              }
              case 'BOOLEAN': {
                values[slug] = rawValue === 'true' || rawValue === '1' || rawValue === 'yes'
                break
              }
              case 'MULTISELECT': {
                values[slug] = rawValue.split(',').map((v) => v.trim())
                break
              }
              case 'RICH_TEXT': {
                /** Convert markdown to Lexical JSON for the rich text editor */
                values[slug] = markdownToLexicalJson(rawValue)
                break
              }
              default: {
                values[slug] = rawValue
              }
            }
            updatedColumns.push(slug)
          }

          /** Update the row — tRPC merges with existing values */
          await caller.cms.updateRow({
            organizationId,
            rowId: params.rowId,
            values,
          })

          return {
            success: true,
            rowId: params.rowId,
            columnsUpdated: updatedColumns,
            message: `Updated ${updatedColumns.length} columns in row`,
          }
        } catch (err) {
          return handleToolError('updateCmsRow', err)
        }
      },
    }),

    /**
     * List rows in a CMS table with pagination.
     * Returns column definitions and row values.
     *
     * tRPC route: caller.cms.listRows (CMS_READ)
     */
    listCmsRows: tool({
      description:
        'List rows in a CMS table with pagination. ' +
        'Returns column definitions and all row values. ' +
        'Use this to view table contents or find row IDs for updates.',
      inputSchema: z.object({
        tableId: z.string().describe('The CMS table ID'),
        page: z.number().optional().describe('Page number (default: 1)'),
        pageSize: z.number().optional().describe('Rows per page (default: 25, max: 100)'),
        search: z.string().optional().describe('Search across all text columns'),
        sortBy: z.string().optional().describe('Column slug to sort by'),
        sortOrder: z.enum(['asc', 'desc']).optional().describe('Sort order (default: desc)'),
      }),
      execute: async (params) => {
        try {
          const result = await caller.cms.listRows({
            organizationId,
            tableId: params.tableId,
            page: params.page || 1,
            pageSize: params.pageSize || 25,
            search: params.search,
            sortBy: params.sortBy,
            sortOrder: params.sortOrder || 'desc',
          })

          return {
            success: true,
            tableId: params.tableId,
            columns: result.columns,
            rows: result.rows.map((r) => ({
              id: r.id,
              values: r.values,
              order: r.order,
            })),
            total: result.total,
            page: result.page,
            totalPages: result.totalPages,
            message: `Found ${result.total} rows (page ${result.page}/${result.totalPages})`,
          }
        } catch (err) {
          return handleToolError('listCmsRows', err)
        }
      },
    }),

    /**
     * Get a single row by ID with its full values and table info.
     *
     * tRPC route: caller.cms.getRow (CMS_READ)
     */
    getCmsRow: tool({
      description: 'Get a single CMS row by ID with its values and table information.',
      inputSchema: z.object({
        rowId: z.string().describe('The row ID'),
      }),
      execute: async (params) => {
        try {
          const row = await caller.cms.getRow({
            organizationId,
            rowId: params.rowId,
          })
          return {
            success: true,
            row: {
              id: row.id,
              values: row.values,
              order: row.order,
              tableName: row.table.name,
              columns: row.table.columns,
            },
            message: `Found row in "${row.table.name}"`,
          }
        } catch (err) {
          return handleToolError('getCmsRow', err)
        }
      },
    }),
  }
}
