/**
 * CMS Router
 *
 * tRPC router for CMS operations (tables, columns, and rows).
 * Uses organizationProcedure for authorization.
 * All data access goes through cms.service.ts (DAL).
 *
 * ORGANIZATION OF PROCEDURES:
 * 1. TABLES - Create, read, update, delete CMS tables
 * 2. COLUMNS - Manage table schema (field definitions)
 * 3. ROWS - CRUD operations with pagination, filtering, sorting
 */

import { z } from 'zod'
import {
  createTRPCRouter,
  baseProcedure,
  organizationProcedure,
  createStructuredError,
} from '../init'
import { ERROR_CODES } from '@/lib/errors'
import { CmsColumnType } from '@/generated/prisma'
import * as cmsService from '@/services/cms.service'
import {
  getCachedCmsPublicRows,
  cacheCmsPublicRows,
  invalidateCmsRelatedCaches,
  isCmsTableLive,
} from '@/lib/page-cache'
import { permissions } from '@/lib/better-auth/permissions'
import {
  incrementUsageAndInvalidate,
  decrementUsageAndInvalidate,
} from '@/trpc/procedures/feature-gates'

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

// Table Schemas
export const createTableSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1, 'Table name is required'),
  slug: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  order: z.number().optional().default(0),
})

export const updateTableSchema = z.object({
  organizationId: z.string(),
  tableId: z.string(),
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  order: z.number().optional(),
})

export const reorderTablesSchema = z.object({
  organizationId: z.string(),
  tableOrders: z.array(
    z.object({
      tableId: z.string(),
      order: z.number(),
    })
  ),
})

// Column Schemas
export const createColumnSchema = z.object({
  organizationId: z.string(),
  tableId: z.string(),
  name: z.string().min(1, 'Column name is required'),
  slug: z.string().min(1).optional(), // Optional - auto-generated from name if not provided
  columnType: z.nativeEnum(CmsColumnType),
  required: z.boolean().optional().default(false),
  defaultValue: z.string().optional().nullable(),
  options: z.unknown().optional().nullable(), // Type-specific options
  order: z.number().optional().default(0),
})

export const updateColumnSchema = z.object({
  organizationId: z.string(),
  columnId: z.string(),
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  columnType: z.nativeEnum(CmsColumnType).optional(),
  required: z.boolean().optional(),
  defaultValue: z.string().optional().nullable(),
  options: z.unknown().optional().nullable(),
  order: z.number().optional(),
})

export const reorderColumnsSchema = z.object({
  organizationId: z.string(),
  tableId: z.string(),
  columnOrders: z.array(
    z.object({
      columnId: z.string(),
      order: z.number(),
    })
  ),
})

// Row Schemas
export const listRowsSchema = z.object({
  organizationId: z.string(),
  tableId: z.string(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(25),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  filters: z
    .array(
      z.object({
        columnSlug: z.string(),
        operator: z.enum(['eq', 'neq', 'contains', 'gt', 'lt', 'gte', 'lte']),
        value: z.unknown(),
      })
    )
    .optional(),
})

// ============================================================================
// INFINITE SCROLL ROWS SCHEMA - For SmartCMS List with range support
// ============================================================================
// This schema supports cursor-based infinite scrolling with optional range limits.
// Range limits allow users to specify "fetch rows from order 1 to 50 only".
export const listRowsInfiniteSchema = z.object({
  organizationId: z.string(),
  tableId: z.string(),
  /** Number of items to fetch per page */
  limit: z.number().int().positive().max(100).default(10),
  /** Cursor for pagination - the 'order' value of the last fetched row */
  cursor: z.number().int().nullish(),
  /** Sort order - determines scroll direction (asc = left-to-right/top-to-bottom) */
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  /** Optional range start - only fetch rows with order >= rangeStart */
  rangeStart: z.number().int().optional(),
  /** Optional range end - only fetch rows with order <= rangeEnd */
  rangeEnd: z.number().int().optional(),
})

export const createRowSchema = z.object({
  organizationId: z.string(),
  tableId: z.string(),
  values: z.record(z.string(), z.unknown()),
  /** Order is optional - if not provided, a unique timestamp-based order will be generated */
  order: z.number().optional(),
})

export const updateRowSchema = z.object({
  organizationId: z.string(),
  rowId: z.string(),
  values: z.record(z.string(), z.unknown()).optional(),
  order: z.number().optional(),
})

export const bulkDeleteRowsSchema = z.object({
  organizationId: z.string(),
  tableId: z.string(),
  rowIds: z.array(z.string()),
})

// ============================================================================
// ROUTER
// ============================================================================

export const cmsRouter = createTRPCRouter({
  // ==========================================================================
  // TABLES
  // ==========================================================================

  /**
   * List CMS tables for organization with cursor-based pagination.
   * Designed for tRPC's useInfiniteQuery - returns nextCursor for efficient caching.
   * Tables are cached between sessions, eliminating redundant refetches.
   */
  listTables: organizationProcedure({ requirePermission: permissions.CMS_READ })
    .input(
      z.object({
        organizationId: z.string(),
        limit: z.number().int().positive().max(100).default(50),
        cursor: z.string().nullish(), // ID of the last item from previous page
        search: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      return await cmsService.listTables({
        organizationId: input.organizationId,
        limit: input.limit,
        cursor: input.cursor ?? undefined,
        search: input.search,
      })
    }),

  /**
   * Get single table with columns
   */
  getTable: organizationProcedure({ requirePermission: permissions.CMS_READ })
    .input(
      z.object({
        organizationId: z.string(),
        tableId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const table = await cmsService.getTableById(input.organizationId, input.tableId)

      if (!table) {
        throw createStructuredError('NOT_FOUND', 'Table not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Table not found',
        })
      }

      return cmsService.transformTable(table)
    }),

  /**
   * Create a new table
   *
   * FEATURE GATE: cms_tables.limit
   * Checks organization's CMS table limit before creating.
   */
  /** Feature-gated: cms_tables.limit checked at procedure level before handler runs */
  createTable: organizationProcedure({
    requirePermission: permissions.CMS_CREATE,
    requireFeature: 'cms_tables.limit',
  })
    .input(createTableSchema)
    .mutation(async ({ ctx, input }) => {
      const { organizationId, name, slug: inputSlug, description, icon, order } = input

      // Use provided slug or auto-generate from name
      const slug = inputSlug || cmsService.generateSlug(name)

      // Check for duplicate slug
      const slugExists = await cmsService.checkTableSlugExists(organizationId, slug)

      if (slugExists) {
        throw createStructuredError(
          'BAD_REQUEST',
          'A table with this name already exists',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'A table with this name already exists',
          }
        )
      }

      const table = await cmsService.createTable({
        organizationId,
        name,
        slug,
        description,
        icon,
        order,
      })

      // Increment usage after successful creation
      await incrementUsageAndInvalidate(ctx, organizationId, 'cms_tables.limit')

      return cmsService.transformTable(table)
    }),

  /**
   * Update a table
   * NOTE: System tables (synced from ecommerce stores) cannot be edited
   */
  updateTable: organizationProcedure({ requirePermission: permissions.CMS_UPDATE })
    .input(updateTableSchema)
    .mutation(async ({ input }) => {
      const { organizationId, tableId, name, slug, description, icon, order } = input

      // Verify table exists and belongs to organization
      const existing = await cmsService.getTableById(organizationId, tableId)

      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Table not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Table not found',
        })
      }

      // Check if this is a system table (synced from ecommerce store)
      if (await cmsService.isSystemTable(tableId)) {
        throw createStructuredError(
          'FORBIDDEN',
          'This table is synced with an ecommerce store and cannot be edited',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'System tables cannot be edited',
          }
        )
      }

      // Auto-generate slug from name if name is being changed
      let newSlug = slug
      if (name && name !== existing.name && !slug) {
        newSlug = cmsService.generateSlug(name)
      }

      // Check for duplicate slug if slug is being changed
      if (newSlug && newSlug !== existing.slug) {
        const slugExists = await cmsService.checkTableSlugExists(
          organizationId,
          newSlug,
          tableId
        )

        if (slugExists) {
          throw createStructuredError(
            'BAD_REQUEST',
            'A table with this slug already exists',
            {
              errorCode: ERROR_CODES.VALIDATION_ERROR,
              message: 'A table with this slug already exists',
            }
          )
        }
      }

      const table = await cmsService.updateTable(tableId, {
        ...(name && { name }),
        ...(newSlug && { slug: newSlug }),
        ...(description !== undefined && { description }),
        ...(icon !== undefined && { icon }),
        ...(order !== undefined && { order }),
      })

      return {
        id: table.id,
        name: table.name,
        slug: table.slug,
        description: table.description,
        icon: table.icon,
        order: table.order,
        columnsCount: table._count.columns,
        rowsCount: table._count.rows,
        createdAt: table.createdAt,
        updatedAt: table.updatedAt,
      }
    }),

  /**
   * Delete a table (soft delete)
   * NOTE: System tables (synced from ecommerce stores) cannot be deleted
   *
   * FEATURE GATE: cms_tables.limit
   * Decrements usage after successful deletion.
   */
  deleteTable: organizationProcedure({ requirePermission: permissions.CMS_DELETE })
    .input(
      z.object({
        organizationId: z.string(),
        tableId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { organizationId, tableId } = input

      // Verify table exists and belongs to organization
      const existing = await cmsService.getTableById(organizationId, tableId)

      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Table not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Table not found',
        })
      }

      // Check if this is a system table (synced from ecommerce store)
      if (await cmsService.isSystemTable(tableId)) {
        throw createStructuredError(
          'FORBIDDEN',
          'This table is synced with an ecommerce store and cannot be deleted',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'System tables cannot be deleted. Delete the store to remove this table.',
          }
        )
      }

      await cmsService.deleteTable(tableId)

      // Decrement usage after successful deletion
      await decrementUsageAndInvalidate(ctx, organizationId, 'cms_tables.limit')

      return { success: true, message: 'Table deleted' }
    }),

  /**
   * Reorder tables
   */
  reorderTables: organizationProcedure({ requirePermission: permissions.CMS_UPDATE })
    .input(reorderTablesSchema)
    .mutation(async ({ input }) => {
      const { organizationId, tableOrders } = input

      // Verify all tables exist and belong to organization
      const tableIds = tableOrders.map(to => to.tableId)
      const ownershipValid = await cmsService.verifyTableOwnership(organizationId, tableIds)

      if (!ownershipValid) {
        throw createStructuredError('BAD_REQUEST', 'Invalid table IDs', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'One or more tables not found',
        })
      }

      await cmsService.reorderTables(organizationId, tableOrders)

      return { success: true, message: 'Tables reordered' }
    }),

  // ==========================================================================
  // COLUMNS
  // ==========================================================================

  /**
   * List columns for a table
   */
  listColumns: organizationProcedure({ requirePermission: permissions.CMS_READ })
    .input(
      z.object({
        organizationId: z.string(),
        tableId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const { organizationId, tableId } = input

      // Verify table exists and belongs to organization
      const table = await cmsService.getTableById(organizationId, tableId)

      if (!table) {
        throw createStructuredError('NOT_FOUND', 'Table not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Table not found',
        })
      }

      const columns = await cmsService.listColumns(tableId)

      return columns.map(cmsService.transformColumn)
    }),

  /**
   * Create a new column.
   * ALLOWED on system tables — users can add custom columns to store-synced tables.
   * Custom columns will have isSystemColumn=false by default so they can be
   * freely edited/deleted later. System columns remain protected.
   */
  createColumn: organizationProcedure({ requirePermission: permissions.CMS_CREATE })
    .input(createColumnSchema)
    .mutation(async ({ input }) => {
      const { organizationId, tableId, name, slug: inputSlug, columnType, required, defaultValue, options, order } =
        input

      // Verify table exists and belongs to organization
      const table = await cmsService.getTableById(organizationId, tableId)

      if (!table) {
        throw createStructuredError('NOT_FOUND', 'Table not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Table not found',
        })
      }

      // Use provided slug or auto-generate from name
      const slug = inputSlug || cmsService.generateSlug(name)

      // Check for duplicate slug in this table
      const slugExists = await cmsService.checkColumnSlugExists(tableId, slug)

      if (slugExists) {
        throw createStructuredError(
          'BAD_REQUEST',
          'A column with this name already exists in this table',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'A column with this name already exists in this table',
          }
        )
      }

      // Prevent creating system column types manually (DATE_CREATED, DATE_UPDATED)
      if (cmsService.isSystemColumnType(columnType)) {
        throw createStructuredError(
          'BAD_REQUEST',
          'System columns (DATE_CREATED, DATE_UPDATED) are added automatically',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'System columns cannot be created manually',
          }
        )
      }

      const column = await cmsService.createColumn({
        tableId,
        name,
        slug,
        columnType,
        required,
        defaultValue,
        options,
        order,
      })

      /* Invalidate cached CMS data — column schema changed affects row display */
      invalidateCmsRelatedCaches(tableId)

      return cmsService.transformColumn(column)
    }),

  /**
   * Update a column.
   * Protected columns (isSystemColumn=true or DATE_CREATED/DATE_UPDATED) cannot be modified.
   * Custom columns on system tables CAN be modified freely.
   */
  updateColumn: organizationProcedure({ requirePermission: permissions.CMS_UPDATE })
    .input(updateColumnSchema)
    .mutation(async ({ input }) => {
      const { organizationId, columnId, name, slug, columnType, required, defaultValue, options, order } =
        input

      // Verify column exists and belongs to organization
      const existing = await cmsService.getColumnById(organizationId, columnId)

      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Column not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Column not found',
        })
      }

      // Prevent modifying protected columns (store-synced or system column types)
      if (cmsService.isProtectedColumn(existing)) {
        throw createStructuredError(
          'FORBIDDEN',
          'This column is protected and cannot be modified',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Protected columns (store-synced or system) cannot be modified',
          }
        )
      }

      // Auto-generate slug from name if name is being changed
      let newSlug = slug
      if (name && name !== existing.name && !slug) {
        newSlug = cmsService.generateSlug(name)
      }

      // Check for duplicate slug if slug is being changed
      if (newSlug && newSlug !== existing.slug) {
        const slugExists = await cmsService.checkColumnSlugExists(
          existing.tableId,
          newSlug,
          columnId
        )

        if (slugExists) {
          throw createStructuredError(
            'BAD_REQUEST',
            'A column with this slug already exists in this table',
            {
              errorCode: ERROR_CODES.VALIDATION_ERROR,
              message: 'A column with this slug already exists in this table',
            }
          )
        }
      }

      const column = await cmsService.updateColumn(columnId, {
        ...(name && { name }),
        ...(newSlug && { slug: newSlug }),
        ...(columnType && { columnType }),
        ...(required !== undefined && { required }),
        ...(defaultValue !== undefined && { defaultValue }),
        ...(options !== undefined && { options }),
        ...(order !== undefined && { order }),
      })

      /* Invalidate cached CMS data — column definition changed */
      invalidateCmsRelatedCaches(existing.tableId)

      return cmsService.transformColumn(column)
    }),

  /**
   * Delete a column (soft delete).
   * Protected columns (isSystemColumn=true or DATE_CREATED/DATE_UPDATED) cannot be deleted.
   * Custom columns on system tables CAN be deleted freely.
   */
  deleteColumn: organizationProcedure({ requirePermission: permissions.CMS_DELETE })
    .input(
      z.object({
        organizationId: z.string(),
        columnId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { organizationId, columnId } = input

      // Verify column exists and belongs to organization
      const existing = await cmsService.getColumnById(organizationId, columnId)

      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Column not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Column not found',
        })
      }

      // Prevent deleting protected columns (store-synced or system column types)
      if (cmsService.isProtectedColumn(existing)) {
        throw createStructuredError(
          'FORBIDDEN',
          'This column is protected and cannot be deleted',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Protected columns (store-synced or system) cannot be deleted',
          }
        )
      }

      await cmsService.deleteColumn(columnId)

      /* Invalidate cached CMS data — column removed */
      invalidateCmsRelatedCaches(existing.tableId)

      return { success: true, message: 'Column deleted' }
    }),

  /**
   * Reorder columns within a table
   */
  reorderColumns: organizationProcedure({ requirePermission: permissions.CMS_UPDATE })
    .input(reorderColumnsSchema)
    .mutation(async ({ input }) => {
      const { organizationId, tableId, columnOrders } = input

      // Verify table exists and belongs to organization
      const table = await cmsService.getTableById(organizationId, tableId)

      if (!table) {
        throw createStructuredError('NOT_FOUND', 'Table not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Table not found',
        })
      }

      // Verify all columns exist and belong to this table
      const columnIds = columnOrders.map(co => co.columnId)
      const ownershipValid = await cmsService.verifyColumnOwnership(tableId, columnIds)

      if (!ownershipValid) {
        throw createStructuredError('BAD_REQUEST', 'Invalid column IDs', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'One or more columns not found',
        })
      }

      await cmsService.reorderColumns(tableId, columnOrders)

      return { success: true, message: 'Columns reordered' }
    }),

  // ==========================================================================
  // ROWS
  // ==========================================================================

  /**
   * List rows with pagination, filtering, sorting, and search
   */
  listRows: organizationProcedure({ requirePermission: permissions.CMS_READ })
    .input(listRowsSchema)
    .query(async ({ input }) => {
      const { organizationId, tableId, page, pageSize, search, sortBy, sortOrder, filters } = input

      // Verify table exists and belongs to organization
      const table = await cmsService.getTableById(organizationId, tableId)

      if (!table) {
        throw createStructuredError('NOT_FOUND', 'Table not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Table not found',
        })
      }

      const result = await cmsService.listRows({
        tableId,
        page,
        pageSize,
        search,
        sortBy,
        sortOrder,
        filters,
      })

      /**
       * Format store table rows — ensures price_amount has currency symbol for both
       * old rows (raw number) and new rows (already formatted).
       */
      const isStoreTable = Boolean(table.sourceStoreId)

      return {
        ...result,
        rows: result.rows.map(row => ({
          ...row,
          values: cmsService.formatStoreRowValues(row.values, isStoreTable),
        })),
        // Include column definitions for the frontend
        columns: table.columns.map(cmsService.transformColumn),
      }
    }),

  /**
   * List rows with cursor-based infinite scrolling and optional range limits.
   *
   * DESIGNED FOR: SmartCMS List component with infinite scroll behavior.
   *
   * HOW IT WORKS:
   * 1. Fetches rows ordered by 'order' field (row number)
   * 2. Uses cursor-based pagination for efficient infinite scroll
   * 3. Optional range limits restrict which rows can be fetched
   * 4. Returns nextCursor for subsequent fetches
   *
   * RANGE BEHAVIOR:
   * - rangeStart: 1, rangeEnd: 50 = only fetch rows with order 1-50
   * - Even if table has 1000 rows, pagination stops at row 50
   * - pageSize still controls how many items load per scroll
   *
   * DIRECTION:
   * - sortOrder: 'asc' = start from rangeStart, scroll forward
   * - sortOrder: 'desc' = start from rangeEnd, scroll backward
   */
  listRowsInfinite: organizationProcedure({ requirePermission: permissions.CMS_READ })
    .input(listRowsInfiniteSchema)
    .query(async ({ input }) => {
      const { organizationId, tableId, limit, cursor, sortOrder, rangeStart, rangeEnd } = input

      // Verify table exists and belongs to organization
      const table = await cmsService.getTableById(organizationId, tableId)

      if (!table) {
        throw createStructuredError('NOT_FOUND', 'Table not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Table not found',
        })
      }

      const result = await cmsService.listRowsInfinite({
        tableId,
        limit,
        cursor: cursor ?? undefined,
        sortOrder,
        rangeStart,
        rangeEnd,
      })

      /**
       * Format store table rows — ensures price_amount has currency symbol for both
       * old rows (raw number) and new rows (already formatted).
       */
      const isStoreTable = Boolean(table.sourceStoreId)

      return {
        ...result,
        rows: result.rows.map(row => ({
          ...row,
          values: cmsService.formatStoreRowValues(row.values, isStoreTable),
        })),
        // Include column definitions for the frontend (only on first page)
        columns: cursor === null || cursor === undefined
          ? table.columns.map(cmsService.transformColumn)
          : undefined,
      }
    }),

  /**
   * Get single row with table info
   */
  getRow: organizationProcedure({ requirePermission: permissions.CMS_READ })
    .input(
      z.object({
        organizationId: z.string(),
        rowId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const { organizationId, rowId } = input

      const row = await cmsService.getRowById(organizationId, rowId)

      if (!row) {
        throw createStructuredError('NOT_FOUND', 'Row not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Row not found',
        })
      }

      const transformed = cmsService.transformRow(row)
      const isStoreTable = Boolean(row.table.sourceStoreId)

      return {
        ...transformed,
        values: cmsService.formatStoreRowValues(transformed.values, isStoreTable),
        table: cmsService.transformTable(row.table),
      }
    }),

  /**
   * Create a new row
   * NOTE: Cannot create rows in system tables (synced from ecommerce stores)
   */
  createRow: organizationProcedure({ requirePermission: permissions.CMS_CREATE })
    .input(createRowSchema)
    .mutation(async ({ input }) => {
      const { organizationId, tableId, values, order } = input

      // Verify table exists and belongs to organization
      const table = await cmsService.getTableById(organizationId, tableId)

      if (!table) {
        throw createStructuredError('NOT_FOUND', 'Table not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Table not found',
        })
      }

      // Check if this is a system table (synced from ecommerce store)
      if (await cmsService.isSystemTable(tableId)) {
        throw createStructuredError(
          'FORBIDDEN',
          'Cannot create rows in system tables',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'System tables are synced with ecommerce stores. Add products through the store page.',
          }
        )
      }

      // Validate required columns (skip system column types like DATE_CREATED/DATE_UPDATED)
      const requiredColumns = table.columns.filter(
        col => col.required && !cmsService.isSystemColumnType(col.columnType)
      )

      for (const col of requiredColumns) {
        if (values[col.slug] === undefined || values[col.slug] === null || values[col.slug] === '') {
          throw createStructuredError(
            'BAD_REQUEST',
            `Field "${col.name}" (${col.slug}) is required`,
            {
              errorCode: ERROR_CODES.VALIDATION_ERROR,
              message: `Field "${col.name}" (${col.slug}) is required`,
            }
          )
        }
      }

      const row = await cmsService.createRow({
        tableId,
        values,
        order,
      })

      /* Invalidate cached CMS data for this table — new row added */
      invalidateCmsRelatedCaches(tableId)

      return cmsService.transformRow(row)
    }),

  /**
   * Update a row.
   * Supports partial updates — only the fields in `values` will be updated.
   * Existing values are preserved and merged with new values.
   *
   * SYSTEM TABLE BEHAVIOR:
   * - Users can update CUSTOM column values (isSystemColumn=false)
   * - System column values (isSystemColumn=true) are stripped from the update
   * - Order changes are blocked on system tables (row order synced from store)
   */
  updateRow: organizationProcedure({ requirePermission: permissions.CMS_UPDATE })
    .input(updateRowSchema)
    .mutation(async ({ input }) => {
      const { organizationId, rowId, values, order } = input

      // Verify row exists and belongs to organization
      const existing = await cmsService.getRowById(organizationId, rowId)

      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Row not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Row not found',
        })
      }

      const isSystem = existing.table.isSystemTable

      // Block order changes on system tables (row ordering synced from store)
      if (isSystem && order !== undefined) {
        throw createStructuredError(
          'FORBIDDEN',
          'Cannot reorder rows in system tables',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'Row order in store tables is managed by the ecommerce sync.',
          }
        )
      }

      // Get existing values as a record
      const existingValues = (existing.values ?? {}) as Record<string, unknown>

      /**
       * For system tables, strip out any system column slugs from the update.
       * This prevents users from modifying store-synced values (product_name, price, etc.)
       * while allowing them to set values for their custom columns.
       */
      let sanitizedValues = values
      if (isSystem && values) {
        const systemColumnSlugs = new Set(
          existing.table.columns
            .filter(col => cmsService.isProtectedColumn(col))
            .map(col => col.slug)
        )
        sanitizedValues = Object.fromEntries(
          Object.entries(values).filter(([key]) => !systemColumnSlugs.has(key))
        )
      }

      // Merge new values with existing values (new values override existing)
      const mergedValues = sanitizedValues
        ? { ...existingValues, ...sanitizedValues }
        : existingValues

      // Validate required columns against the MERGED values
      if (sanitizedValues && Object.keys(sanitizedValues).length > 0) {
        const requiredColumns = existing.table.columns.filter(
          col => col.required && !cmsService.isSystemColumnType(col.columnType)
        )

        for (const col of requiredColumns) {
          const mergedValue = mergedValues[col.slug]
          if (mergedValue === undefined || mergedValue === null || mergedValue === '') {
            throw createStructuredError(
              'BAD_REQUEST',
              `Field "${col.name}" (${col.slug}) is required`,
              {
                errorCode: ERROR_CODES.VALIDATION_ERROR,
                message: `Field "${col.name}" (${col.slug}) is required`,
              }
            )
          }
        }
      }

      // Pass the merged values to the service
      const row = await cmsService.updateRow(rowId, {
        ...(sanitizedValues && { values: mergedValues }),
        ...(order !== undefined && { order }),
      })

      /* Invalidate cached CMS data for this table — row values changed */
      invalidateCmsRelatedCaches(existing.tableId)

      return cmsService.transformRow(row)
    }),

  /**
   * Delete a row (soft delete)
   * NOTE: Cannot delete rows from system tables (synced from ecommerce stores)
   */
  deleteRow: organizationProcedure({ requirePermission: permissions.CMS_DELETE })
    .input(
      z.object({
        organizationId: z.string(),
        rowId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { organizationId, rowId } = input

      // Verify row exists and belongs to organization
      const existing = await cmsService.getRowById(organizationId, rowId)

      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Row not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Row not found',
        })
      }

      // Check if this row belongs to a system table
      if (await cmsService.isSystemTable(existing.tableId)) {
        throw createStructuredError(
          'FORBIDDEN',
          'Cannot delete rows from system tables',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'System tables are synced with ecommerce stores. Remove products through the store page.',
          }
        )
      }

      await cmsService.deleteRow(rowId)

      /* Invalidate cached CMS data for this table — row removed */
      invalidateCmsRelatedCaches(existing.tableId)

      return { success: true, message: 'Row deleted' }
    }),

  /**
   * Bulk delete rows
   * NOTE: Cannot delete rows from system tables (synced from ecommerce stores)
   */
  bulkDeleteRows: organizationProcedure({ requirePermission: permissions.CMS_DELETE })
    .input(bulkDeleteRowsSchema)
    .mutation(async ({ input }) => {
      const { organizationId, tableId, rowIds } = input

      // Verify table exists and belongs to organization
      const table = await cmsService.getTableById(organizationId, tableId)

      if (!table) {
        throw createStructuredError('NOT_FOUND', 'Table not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Table not found',
        })
      }

      // Check if this is a system table (synced from ecommerce store)
      if (await cmsService.isSystemTable(tableId)) {
        throw createStructuredError(
          'FORBIDDEN',
          'Cannot delete rows from system tables',
          {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: 'System tables are synced with ecommerce stores. Remove products through the store page.',
          }
        )
      }

      // Verify all rows exist and belong to this table
      const ownershipValid = await cmsService.verifyRowOwnership(tableId, rowIds)

      if (!ownershipValid) {
        throw createStructuredError('BAD_REQUEST', 'Invalid row IDs', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'One or more rows not found',
        })
      }

      const result = await cmsService.bulkDeleteRows(rowIds)

      /* Invalidate cached CMS data for this table — rows removed */
      invalidateCmsRelatedCaches(tableId)

      return { success: true, count: result.count }
    }),

  /**
   * Check if a CMS table is displayed on any published website page.
   *
   * WHY: The CMS editor UI shows an info banner when the table is "live" —
   * telling the user that changes will update their published website.
   *
   * HOW: Checks the Redis reverse mapping (tableId → websiteIds) registered
   * at publish time. Returns true if at least one website uses this table.
   */
  isTableLive: organizationProcedure({ requirePermission: permissions.CMS_READ })
    .input(z.object({ organizationId: z.string(), tableId: z.string() }))
    .query(async ({ input }) => {
      return isCmsTableLive(input.tableId)
    }),

  // ==========================================================================
  // PUBLIC ENDPOINTS - No Authentication Required
  // ==========================================================================
  // These endpoints are for published website pages that need to display
  // CMS data to unauthenticated visitors. Security is enforced server-side
  // by checking the table's isPublic flag.

  /**
   * List rows for PUBLIC access with server-side isPublic check.
   *
   * SECURITY MODEL:
   * - Uses baseProcedure (NO auth required)
   * - Server-side check: only returns data if table.isPublic === true
   * - If table is not public, returns 403 Forbidden
   * - Only READ access - write operations always require authentication
   *
   * WHY: Published websites need to display CMS data (blog posts, products, etc.)
   * to visitors without requiring them to log in.
   *
   * HOW: The isPublic check happens in the service layer, so even if someone
   * bypasses the client and calls the API directly, they cannot access
   * private table data.
   *
   * Used by: SmartCMS List component on published website pages
   */
  listRowsPublicInfinite: baseProcedure
    .input(
      z.object({
        tableId: z.string(),
        /** Number of items to fetch per page */
        limit: z.number().int().positive().max(100).default(10),
        /** Cursor for pagination - the 'order' value of the last fetched row */
        cursor: z.number().int().nullish(),
        /** Sort order - determines scroll direction */
        sortOrder: z.enum(['asc', 'desc']).default('asc'),
        /** Optional range start - only fetch rows with order >= rangeStart */
        rangeStart: z.number().int().optional(),
        /** Optional range end - only fetch rows with order <= rangeEnd */
        rangeEnd: z.number().int().optional(),
      })
    )
    .query(async ({ input }) => {
      const { tableId, limit, cursor, sortOrder, rangeStart, rangeEnd } = input

      /**
       * REDIS CACHE CHECK: Serve cached CMS data when available.
       *
       * WHY: CMS list queries run on every published page mount — caching eliminates
       * the DB hit for repeat visitors. Cache is invalidated when rows change.
       */
      const resolvedCursor = cursor ?? undefined
      const cached = await getCachedCmsPublicRows(
        tableId, resolvedCursor, limit, sortOrder, rangeStart, rangeEnd
      )
      if (cached) return cached as {
        rows: { id: string; values: Record<string, unknown>; order: number }[]
        nextCursor: number | undefined
        hasMore: boolean
        totalInRange: number
        columns: unknown
      }

      // Call service function which performs the isPublic security check
      const result = await cmsService.listRowsPublicInfinite({
        tableId,
        limit,
        cursor: resolvedCursor,
        sortOrder,
        rangeStart,
        rangeEnd,
      })

      // If table is not public or not found, throw 403 Forbidden
      // SECURITY: This is the final gate - service layer already checked isPublic,
      // but we throw here to return proper HTTP 403 status to the client.
      if (!result.authorized) {
        throw createStructuredError('FORBIDDEN', result.error || 'Access denied', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: result.error || 'This table is not accessible publicly',
        })
      }

      // Return the data in the same format as listRowsInfinite
      const response = {
        rows: result.rows || [],
        nextCursor: result.nextCursor,
        hasMore: result.hasMore ?? false,
        totalInRange: result.totalInRange ?? 0,
        columns: result.columns,
      }

      /* Fire-and-forget: populate Redis cache for next visitor */
      cacheCmsPublicRows(tableId, resolvedCursor, limit, sortOrder, rangeStart, rangeEnd, response)

      return response
    }),
})
