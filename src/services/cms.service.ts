/**
 * CMS Service (DAL)
 *
 * Data Access Layer for CMS operations (tables, columns, rows).
 * This is the ONLY place that should interact with Prisma for CMS data.
 *
 * tRPC routers call these functions after security checks.
 *
 * KEY FEATURES:
 * - Tables: Organization-scoped collections with dynamic schema
 * - Columns: Field definitions with type-specific configurations
 * - Rows: Data records stored as JSON with column slugs as keys
 * - Pagination: Server-side with configurable page size
 * - Filtering: Type-aware filters for JSON values (Postgres JSONB)
 * - Sorting: By column values or metadata (createdAt, updatedAt)
 */

import { prisma } from '@/lib/config'
import { CmsColumnType, Prisma } from '@/generated/prisma'
import { formatCurrency } from '@/lib/utils'
import { logActivity, logActivities } from './activity-log.service'
import { invalidateCmsRelatedCaches } from '@/lib/page-cache'

// ============================================================================
// TYPES
// ============================================================================

export type TableCreateInput = {
  organizationId: string
  name: string
  slug?: string
  description?: string | null
  icon?: string | null
  order?: number
  /** Optional userId for activity logging */
  userId?: string
}

export type TableUpdateInput = {
  name?: string
  slug?: string
  description?: string | null
  icon?: string | null
  order?: number
}

export type ColumnCreateInput = {
  tableId: string
  name: string
  slug?: string // Optional - auto-generated from name if not provided
  columnType: CmsColumnType
  required?: boolean
  defaultValue?: string | null
  options?: unknown | null // For MULTISELECT: string[], for NUMBER: { min?, max?, decimals? }
  order?: number
}

export type ColumnUpdateInput = {
  name?: string
  slug?: string
  columnType?: CmsColumnType
  required?: boolean
  defaultValue?: string | null
  options?: unknown | null
  order?: number
}

export type RowCreateInput = {
  tableId: string
  values: Record<string, unknown>
  order?: number
  /** Organization ID (required for activity logging) */
  organizationId?: string
  /** Optional userId for activity logging */
  userId?: string
}

export type RowUpdateInput = {
  values?: Record<string, unknown>
  order?: number
}

// Filter types for row queries
export type FilterOperator = 'eq' | 'neq' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte'

export type RowFilter = {
  columnSlug: string
  operator: FilterOperator
  value: unknown
}

export type ListRowsInput = {
  tableId: string
  page?: number
  pageSize?: number
  search?: string
  sortBy?: string // Column slug or 'createdAt' | 'updatedAt'
  sortOrder?: 'asc' | 'desc'
  filters?: RowFilter[]
}

export type ListRowsResult = {
  rows: Array<{
    id: string
    tableId: string
    values: Record<string, unknown>
    order: number
    createdAt: Date
    updatedAt: Date
  }>
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ============================================================================
// INFINITE SCROLL TYPES - For SmartCMS List with range support
// ============================================================================

export type ListRowsInfiniteInput = {
  tableId: string
  /** Number of items to fetch per page */
  limit?: number
  /** Cursor for pagination - the 'order' value of the last fetched row */
  cursor?: number
  /** Sort order - determines scroll direction */
  sortOrder?: 'asc' | 'desc'
  /** Optional range start - only fetch rows with order >= rangeStart */
  rangeStart?: number
  /** Optional range end - only fetch rows with order <= rangeEnd */
  rangeEnd?: number
}

export type ListRowsInfiniteResult = {
  rows: Array<{
    id: string
    tableId: string
    values: Record<string, unknown>
    order: number
    createdAt: Date
    updatedAt: Date
  }>
  /** Next cursor for pagination (order value of last row), undefined if no more pages */
  nextCursor: number | undefined
  /** Whether there are more rows to fetch within the range */
  hasMore: boolean
  /** Total rows within the specified range (for progress indication) */
  totalInRange: number
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate URL-friendly slug from name
 * Used for table and column slugs (keys for data binding)
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Get default columns that every table gets automatically
 * These are system columns that users cannot delete
 */
export function getSystemColumns(): Array<{
  name: string
  slug: string
  columnType: CmsColumnType
  required: boolean
  order: number
  isSystemColumn: boolean
}> {
  return [
    {
      name: 'Created',
      slug: 'created_at',
      columnType: CmsColumnType.DATE_CREATED,
      required: false,
      order: 9998,
      isSystemColumn: true,
    },
    {
      name: 'Updated',
      slug: 'updated_at',
      columnType: CmsColumnType.DATE_UPDATED,
      required: false,
      order: 9999,
      isSystemColumn: true,
    },
  ]
}

// ============================================================================
// TABLE CRUD
// ============================================================================

/**
 * Check if table slug exists in organization
 */
export async function checkTableSlugExists(
  organizationId: string,
  slug: string,
  excludeTableId?: string
): Promise<boolean> {
  const existing = await prisma.cmsTable.findFirst({
    where: {
      organizationId,
      slug,
      deletedAt: null,
      ...(excludeTableId && { id: { not: excludeTableId } }),
    },
    select: { id: true },
  })
  return !!existing
}

/**
 * Input type for paginated table listing
 */
export type ListTablesInput = {
  organizationId: string
  limit?: number
  cursor?: string // ID of the last item from previous page
  search?: string
}

/**
 * List tables for organization with cursor-based pagination.
 * Designed for tRPC's useInfiniteQuery - returns nextCursor for pagination.
 * Tables are cached properly between sessions using this pattern.
 */
export async function listTables(input: ListTablesInput) {
  const { organizationId, limit = 50, cursor, search } = input

  // Build where clause with optional search
  const where: Prisma.CmsTableWhereInput = {
    organizationId,
    deletedAt: null,
    ...(search && {
      name: { contains: search, mode: 'insensitive' as const },
    }),
  }

  // Fetch one extra item to determine if there are more pages
  const tables = await prisma.cmsTable.findMany({
    where,
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      icon: true,
      order: true,
      // System table flags for UI to distinguish internal vs custom tables
      isSystemTable: true,
      sourceStoreId: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          columns: { where: { deletedAt: null } },
          rows: { where: { deletedAt: null } },
        },
      },
    },
    orderBy: [{ order: 'asc' }, { id: 'asc' }], // Stable ordering with id as tiebreaker
    take: limit + 1, // Fetch one extra to check for more
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1, // Skip the cursor item itself
    }),
  })

  // Check if there are more items
  let nextCursor: string | undefined = undefined
  if (tables.length > limit) {
    const nextItem = tables.pop() // Remove the extra item
    nextCursor = nextItem?.id
  }

  return {
    tables: tables.map(table => ({
      id: table.id,
      name: table.name,
      slug: table.slug,
      description: table.description,
      icon: table.icon,
      order: table.order,
      // System table flags for UI
      isSystemTable: table.isSystemTable,
      sourceStoreId: table.sourceStoreId,
      columnsCount: table._count.columns,
      rowsCount: table._count.rows,
      createdAt: table.createdAt.toISOString(),
      updatedAt: table.updatedAt.toISOString(),
    })),
    nextCursor,
  }
}

/**
 * Get table by ID with columns
 */
export async function getTableById(organizationId: string, tableId: string) {
  return await prisma.cmsTable.findFirst({
    where: {
      id: tableId,
      organizationId,
      deletedAt: null,
    },
    include: {
      columns: {
        where: { deletedAt: null },
        orderBy: { order: 'asc' },
      },
    },
  })
}

/**
 * Get table by slug with columns
 */
export async function getTableBySlug(organizationId: string, slug: string) {
  return await prisma.cmsTable.findFirst({
    where: {
      organizationId,
      slug,
      deletedAt: null,
    },
    include: {
      columns: {
        where: { deletedAt: null },
        orderBy: { order: 'asc' },
      },
    },
  })
}

/**
 * Create a new table with system columns
 */
export async function createTable(input: TableCreateInput) {
  // Use provided slug or generate from name
  const slug = input.slug || generateSlug(input.name)

  // Create table with system columns (DATE_CREATED, DATE_UPDATED)
  const table = await prisma.cmsTable.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      slug,
      description: input.description,
      icon: input.icon,
      order: input.order ?? 0,
      columns: {
        create: getSystemColumns(),
      },
    },
    include: {
      columns: {
        where: { deletedAt: null },
        orderBy: { order: 'asc' },
      },
    },
  })

  // Log the activity if userId is provided
  if (input.userId) {
    logActivity({
      userId: input.userId,
      organizationId: input.organizationId,
      action: 'create',
      entity: 'cms_table',
      entityId: table.id,
    })
  }

  return table
}

/**
 * Update a table
 *
 * @param tableId - Table ID to update
 * @param data - Update data
 * @param organizationId - Organization ID (required for activity logging)
 * @param userId - Optional userId for activity logging
 */
export async function updateTable(
  tableId: string,
  data: TableUpdateInput,
  organizationId?: string,
  userId?: string
) {
  const updateData: Prisma.CmsTableUpdateInput = {}

  if (data.name !== undefined) updateData.name = data.name
  if (data.slug !== undefined) updateData.slug = data.slug
  if (data.description !== undefined) updateData.description = data.description
  if (data.icon !== undefined) updateData.icon = data.icon
  if (data.order !== undefined) updateData.order = data.order

  const table = await prisma.cmsTable.update({
    where: { id: tableId },
    data: updateData,
    include: {
      _count: {
        select: {
          columns: { where: { deletedAt: null } },
          rows: { where: { deletedAt: null } },
        },
      },
    },
  })

  // Log the activity if userId and organizationId are provided
  if (userId && organizationId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'cms_table',
      entityId: table.id,
    })
  }

  return table
}

/**
 * Soft delete a table
 *
 * @param tableId - Table ID to delete
 * @param organizationId - Organization ID (required for activity logging)
 * @param userId - Optional userId for activity logging
 */
export async function deleteTable(
  tableId: string,
  organizationId?: string,
  userId?: string
) {
  const table = await prisma.cmsTable.update({
    where: { id: tableId },
    data: { deletedAt: new Date() },
  })

  // Log the activity if userId and organizationId are provided
  if (userId && organizationId) {
    logActivity({
      userId,
      organizationId,
      action: 'delete',
      entity: 'cms_table',
      entityId: table.id,
    })
  }

  return table
}

/**
 * Reorder tables
 */
export async function reorderTables(
  _organizationId: string,
  orders: Array<{ tableId: string; order: number }>
) {
  await Promise.all(
    orders.map(o =>
      prisma.cmsTable.update({
        where: { id: o.tableId },
        data: { order: o.order },
      })
    )
  )
}

/**
 * Verify all table IDs belong to organization
 */
export async function verifyTableOwnership(
  organizationId: string,
  tableIds: string[]
): Promise<boolean> {
  const tables = await prisma.cmsTable.findMany({
    where: {
      id: { in: tableIds },
      organizationId,
      deletedAt: null,
    },
    select: { id: true },
  })
  return tables.length === tableIds.length
}

// ============================================================================
// COLUMN CRUD
// ============================================================================

/**
 * Check if column slug exists in table
 */
export async function checkColumnSlugExists(
  tableId: string,
  slug: string,
  excludeColumnId?: string
): Promise<boolean> {
  const existing = await prisma.cmsColumn.findFirst({
    where: {
      tableId,
      slug,
      deletedAt: null,
      ...(excludeColumnId && { id: { not: excludeColumnId } }),
    },
    select: { id: true },
  })
  return !!existing
}

/**
 * List columns for a table
 */
export async function listColumns(tableId: string) {
  return await prisma.cmsColumn.findMany({
    where: {
      tableId,
      deletedAt: null,
    },
    orderBy: { order: 'asc' },
  })
}

/**
 * Get column by ID
 */
export async function getColumnById(organizationId: string, columnId: string) {
  return await prisma.cmsColumn.findFirst({
    where: {
      id: columnId,
      deletedAt: null,
      table: {
        organizationId,
        deletedAt: null,
      },
    },
    include: {
      table: true,
    },
  })
}

/**
 * Create a new column.
 * Uses provided slug or auto-generates one from the name.
 */
export async function createColumn(input: ColumnCreateInput) {
  // Use provided slug or auto-generate from name
  const slug = input.slug || generateSlug(input.name)

  return await prisma.cmsColumn.create({
    data: {
      tableId: input.tableId,
      name: input.name,
      slug,
      columnType: input.columnType,
      required: input.required ?? false,
      defaultValue: input.defaultValue,
      options: input.options as Prisma.InputJsonValue | undefined,
      order: input.order ?? 0,
    },
  })
}

/**
 * Update a column
 */
export async function updateColumn(columnId: string, data: ColumnUpdateInput) {
  const updateData: Prisma.CmsColumnUpdateInput = {}

  if (data.name !== undefined) updateData.name = data.name
  if (data.slug !== undefined) updateData.slug = data.slug
  if (data.columnType !== undefined) updateData.columnType = data.columnType
  if (data.required !== undefined) updateData.required = data.required
  if (data.defaultValue !== undefined) updateData.defaultValue = data.defaultValue
  if (data.options !== undefined) {
    updateData.options = (data.options ?? undefined) as Prisma.InputJsonValue | undefined
  }
  if (data.order !== undefined) updateData.order = data.order

  return await prisma.cmsColumn.update({
    where: { id: columnId },
    data: updateData,
  })
}

/**
 * Soft delete a column
 * Note: System columns (DATE_CREATED, DATE_UPDATED) cannot be deleted
 */
export async function deleteColumn(columnId: string) {
  return await prisma.cmsColumn.update({
    where: { id: columnId },
    data: { deletedAt: new Date() },
  })
}

/**
 * Reorder columns within a table
 */
export async function reorderColumns(
  _tableId: string,
  orders: Array<{ columnId: string; order: number }>
) {
  await Promise.all(
    orders.map(o =>
      prisma.cmsColumn.update({
        where: { id: o.columnId },
        data: { order: o.order },
      })
    )
  )
}

/**
 * Verify all column IDs belong to table
 */
export async function verifyColumnOwnership(
  tableId: string,
  columnIds: string[]
): Promise<boolean> {
  const columns = await prisma.cmsColumn.findMany({
    where: {
      id: { in: columnIds },
      tableId,
      deletedAt: null,
    },
    select: { id: true },
  })
  return columns.length === columnIds.length
}

/**
 * Check if column TYPE is a system type (DATE_CREATED/DATE_UPDATED).
 * These are always protected regardless of isSystemColumn flag.
 */
export function isSystemColumnType(columnType: CmsColumnType): boolean {
  return columnType === CmsColumnType.DATE_CREATED || columnType === CmsColumnType.DATE_UPDATED
}

/**
 * Check if a column is protected from edit/delete.
 * Uses BOTH the DB isSystemColumn flag AND the column type check.
 * WHY: Store-synced columns have isSystemColumn=true in the DB,
 * and DATE_CREATED/DATE_UPDATED are always system columns by type.
 *
 * SOURCE OF TRUTH KEYWORDS: isSystemColumn, isProtectedColumn, CmsColumn protection
 */
export function isProtectedColumn(column: { isSystemColumn: boolean; columnType: CmsColumnType }): boolean {
  return column.isSystemColumn || isSystemColumnType(column.columnType)
}

/**
 * @deprecated Use isSystemColumnType() or isProtectedColumn() instead.
 * Kept for backward compatibility with existing callers.
 */
export function isSystemColumn(columnType: CmsColumnType): boolean {
  return isSystemColumnType(columnType)
}

// ============================================================================
// ROW CRUD
// ============================================================================

/**
 * List rows with pagination, filtering, sorting, and search
 * Uses Postgres JSONB queries for filtering on values
 */
export async function listRows(input: ListRowsInput): Promise<ListRowsResult> {
  const {
    tableId,
    page = 1,
    pageSize = 25,
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    filters = [],
  } = input

  // Build where clause
  const where: Prisma.CmsRowWhereInput = {
    tableId,
    deletedAt: null,
  }

  // Add search filter (searches across TEXT and IMAGE_URL columns)
  if (search) {
    // Get text-searchable columns for this table
    const textColumns = await prisma.cmsColumn.findMany({
      where: {
        tableId,
        deletedAt: null,
        columnType: { in: [CmsColumnType.TEXT, CmsColumnType.IMAGE_URL] },
      },
      select: { slug: true },
    })

    if (textColumns.length > 0) {
      // Build OR conditions for each text column
      const searchConditions = textColumns.map(col => ({
        values: {
          path: [col.slug],
          string_contains: search,
          // Note: Case-insensitive search in JSONB requires raw SQL or materialized views
        },
      }))

      where.OR = searchConditions as Prisma.CmsRowWhereInput[]
    }
  }

  // Add filters
  if (filters.length > 0) {
    const filterConditions: Prisma.CmsRowWhereInput[] = filters.map(filter => {
      const { columnSlug, operator, value } = filter

      // Build JSON path filter based on operator
      switch (operator) {
        case 'eq':
          return {
            values: {
              path: [columnSlug],
              equals: value as Prisma.InputJsonValue,
            },
          }
        case 'neq':
          return {
            NOT: {
              values: {
                path: [columnSlug],
                equals: value as Prisma.InputJsonValue,
              },
            },
          }
        case 'contains':
          return {
            values: {
              path: [columnSlug],
              string_contains: String(value),
            },
          }
        case 'gt':
          return {
            values: {
              path: [columnSlug],
              gt: value as Prisma.InputJsonValue,
            },
          }
        case 'lt':
          return {
            values: {
              path: [columnSlug],
              lt: value as Prisma.InputJsonValue,
            },
          }
        case 'gte':
          return {
            values: {
              path: [columnSlug],
              gte: value as Prisma.InputJsonValue,
            },
          }
        case 'lte':
          return {
            values: {
              path: [columnSlug],
              lte: value as Prisma.InputJsonValue,
            },
          }
        default:
          return {}
      }
    })

    // AND all filter conditions together
    if (where.OR) {
      // If we have search conditions, combine with filters
      where.AND = [{ OR: where.OR }, ...filterConditions]
      delete where.OR
    } else {
      where.AND = filterConditions
    }
  }

  // Count total rows
  const total = await prisma.cmsRow.count({ where })

  // Build order by clause
  let orderBy: Prisma.CmsRowOrderByWithRelationInput

  if (sortBy === 'createdAt' || sortBy === 'updatedAt' || sortBy === 'order') {
    orderBy = { [sortBy]: sortOrder }
  } else {
    // Sort by JSON column value - requires raw SQL for complex sorting
    // For now, fall back to createdAt for custom columns
    // TODO: Implement proper JSON column sorting with raw SQL if needed
    orderBy = { createdAt: sortOrder }
  }

  // Fetch rows
  const rows = await prisma.cmsRow.findMany({
    where,
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      tableId: true,
      values: true,
      order: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return {
    rows: rows.map(row => ({
      ...row,
      values: row.values as Record<string, unknown>,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Get row by ID
 */
export async function getRowById(organizationId: string, rowId: string) {
  return await prisma.cmsRow.findFirst({
    where: {
      id: rowId,
      deletedAt: null,
      table: {
        organizationId,
        deletedAt: null,
      },
    },
    include: {
      table: {
        include: {
          columns: {
            where: { deletedAt: null },
            orderBy: { order: 'asc' },
          },
        },
      },
    },
  })
}

/**
 * Create a new row
 * Applies default values from column definitions
 */
export async function createRow(input: RowCreateInput) {
  // Get columns to apply defaults
  const columns = await prisma.cmsColumn.findMany({
    where: {
      tableId: input.tableId,
      deletedAt: null,
      defaultValue: { not: null },
    },
    select: { slug: true, defaultValue: true, columnType: true },
  })

  // Merge default values with provided values
  const values: Record<string, unknown> = { ...input.values }

  for (const col of columns) {
    // Only apply default if value not provided
    if (values[col.slug] === undefined && col.defaultValue !== null) {
      // Parse default value based on column type
      switch (col.columnType) {
        case CmsColumnType.NUMBER:
          values[col.slug] = parseFloat(col.defaultValue)
          break
        case CmsColumnType.BOOLEAN:
          values[col.slug] = col.defaultValue === 'true'
          break
        case CmsColumnType.MULTISELECT:
          try {
            values[col.slug] = JSON.parse(col.defaultValue)
          } catch {
            values[col.slug] = []
          }
          break
        default:
          values[col.slug] = col.defaultValue
      }
    }
  }

  /**
   * Generate a unique order value if not provided.
   * Uses max(order) + 1 to ensure unique, incrementing values that fit
   * within PostgreSQL's integer range (max ~2.1 billion).
   * NOTE: Date.now() would overflow Int since it returns ~1.77 trillion.
   */
  let orderValue = input.order
  if (orderValue === undefined || orderValue === null) {
    const maxOrder = await prisma.cmsRow.aggregate({
      where: { tableId: input.tableId, deletedAt: null },
      _max: { order: true },
    })
    orderValue = (maxOrder._max.order ?? -1) + 1
  }

  /**
   * Auto-populate DATE_CREATED/DATE_UPDATED timestamps.
   * These are stored in the JSON values so the table-view can render them
   * via the DATE_CREATED/DATE_UPDATED column type accessor.
   */
  const now = new Date().toISOString()
  if (values.created_at === undefined) values.created_at = now
  if (values.updated_at === undefined) values.updated_at = now

  const row = await prisma.cmsRow.create({
    data: {
      tableId: input.tableId,
      values: values as Prisma.InputJsonValue,
      order: orderValue,
    },
  })

  // Log the activity if userId and organizationId are provided
  if (input.userId && input.organizationId) {
    logActivity({
      userId: input.userId,
      organizationId: input.organizationId,
      action: 'create',
      entity: 'cms_row',
      entityId: row.id,
    })
  }

  return row
}

/**
 * Update a row
 *
 * @param rowId - Row ID to update
 * @param data - Update data
 * @param organizationId - Organization ID (required for activity logging)
 * @param userId - Optional userId for activity logging
 */
export async function updateRow(
  rowId: string,
  data: RowUpdateInput,
  organizationId?: string,
  userId?: string
) {
  const updateData: Prisma.CmsRowUpdateInput = {}

  if (data.values !== undefined) {
    /**
     * Auto-update the updated_at timestamp on every row edit.
     * Merges into the values JSON so the DATE_UPDATED column accessor can read it.
     */
    const valuesWithTimestamp = {
      ...(data.values as Record<string, unknown>),
      updated_at: new Date().toISOString(),
    }
    updateData.values = valuesWithTimestamp as Prisma.InputJsonValue
  }
  if (data.order !== undefined) {
    updateData.order = data.order
  }

  const row = await prisma.cmsRow.update({
    where: { id: rowId },
    data: updateData,
  })

  // Log the activity if userId and organizationId are provided
  if (userId && organizationId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'cms_row',
      entityId: row.id,
    })
  }

  return row
}

/**
 * Soft delete a row
 *
 * @param rowId - Row ID to delete
 * @param organizationId - Organization ID (required for activity logging)
 * @param userId - Optional userId for activity logging
 */
export async function deleteRow(
  rowId: string,
  organizationId?: string,
  userId?: string
) {
  const row = await prisma.cmsRow.update({
    where: { id: rowId },
    data: { deletedAt: new Date() },
  })

  // Log the activity if userId and organizationId are provided
  if (userId && organizationId) {
    logActivity({
      userId,
      organizationId,
      action: 'delete',
      entity: 'cms_row',
      entityId: row.id,
    })
  }

  return row
}

/**
 * Bulk delete rows
 *
 * @param rowIds - Array of row IDs to delete
 * @param organizationId - Organization ID (required for activity logging)
 * @param userId - Optional userId for activity logging
 */
export async function bulkDeleteRows(
  rowIds: string[],
  organizationId?: string,
  userId?: string
) {
  const result = await prisma.cmsRow.updateMany({
    where: {
      id: { in: rowIds },
      deletedAt: null,
    },
    data: { deletedAt: new Date() },
  })

  // Log activities for all deleted rows if userId and organizationId are provided
  if (userId && organizationId && rowIds.length > 0) {
    logActivities(
      rowIds.map((rowId) => ({
        userId,
        organizationId,
        action: 'delete' as const,
        entity: 'cms_row',
        entityId: rowId,
      }))
    )
  }

  return result
}

/**
 * Verify all row IDs belong to table
 */
export async function verifyRowOwnership(
  tableId: string,
  rowIds: string[]
): Promise<boolean> {
  const rows = await prisma.cmsRow.findMany({
    where: {
      id: { in: rowIds },
      tableId,
      deletedAt: null,
    },
    select: { id: true },
  })
  return rows.length === rowIds.length
}

/**
 * Reorder rows within a table
 */
export async function reorderRows(
  _tableId: string,
  orders: Array<{ rowId: string; order: number }>
) {
  await Promise.all(
    orders.map(o =>
      prisma.cmsRow.update({
        where: { id: o.rowId },
        data: { order: o.order },
      })
    )
  )
}

// ============================================================================
// INFINITE SCROLL ROW FETCHING - For SmartCMS List
// ============================================================================

/**
 * List rows with cursor-based infinite scrolling and optional range limits.
 *
 * This function is optimized for infinite scroll UX in the SmartCMS List component.
 * It uses cursor-based pagination (via the 'order' field) which is more efficient
 * than offset-based pagination for large datasets.
 *
 * RANGE FILTERING:
 * - rangeStart/rangeEnd restrict which rows can be fetched
 * - This enables "show only rows 1-50" functionality
 * - Pagination respects these limits (won't fetch beyond range)
 *
 * SCROLL DIRECTION:
 * - sortOrder 'asc': Start from lowest order, scroll forward (left-to-right, top-to-bottom)
 * - sortOrder 'desc': Start from highest order, scroll backward (right-to-left, bottom-to-top)
 *
 * @param input - Configuration for the query
 * @returns Rows, nextCursor for pagination, and metadata
 */
export async function listRowsInfinite(input: ListRowsInfiniteInput): Promise<ListRowsInfiniteResult> {
  const {
    tableId,
    limit = 10,
    cursor,
    sortOrder = 'asc',
    rangeStart,
    rangeEnd,
  } = input

  // ========================================================================
  // BUILD WHERE CLAUSE - Apply range limits and cursor
  // ========================================================================
  const where: Prisma.CmsRowWhereInput = {
    tableId,
    deletedAt: null,
  }

  // Apply range limits
  // These restrict which rows can ever be fetched, regardless of pagination
  const orderConditions: Prisma.IntFilter = {}

  if (rangeStart !== undefined) {
    orderConditions.gte = rangeStart
  }
  if (rangeEnd !== undefined) {
    orderConditions.lte = rangeEnd
  }

  // Apply cursor for pagination
  // For 'asc': fetch rows with order > cursor (next page)
  // For 'desc': fetch rows with order < cursor (previous page going backward)
  if (cursor !== undefined) {
    if (sortOrder === 'asc') {
      // If we already have a gte from rangeStart, cursor takes precedence
      // because cursor will always be >= rangeStart after first fetch
      orderConditions.gt = cursor
    } else {
      // For desc, cursor means "fetch rows with order < cursor"
      orderConditions.lt = cursor
    }
  }

  // Only add order filter if we have conditions
  if (Object.keys(orderConditions).length > 0) {
    where.order = orderConditions
  }

  // ========================================================================
  // COUNT TOTAL IN RANGE - For progress indication
  // ========================================================================
  // Count total rows within the specified range (ignoring cursor)
  const rangeWhere: Prisma.CmsRowWhereInput = {
    tableId,
    deletedAt: null,
  }

  if (rangeStart !== undefined || rangeEnd !== undefined) {
    rangeWhere.order = {}
    if (rangeStart !== undefined) (rangeWhere.order as Prisma.IntFilter).gte = rangeStart
    if (rangeEnd !== undefined) (rangeWhere.order as Prisma.IntFilter).lte = rangeEnd
  }

  const totalInRange = await prisma.cmsRow.count({ where: rangeWhere })

  // ========================================================================
  // FETCH ROWS - Get limit + 1 to check if more exist
  // ========================================================================
  const rows = await prisma.cmsRow.findMany({
    where,
    orderBy: { order: sortOrder },
    take: limit + 1, // Fetch one extra to determine if there are more
    select: {
      id: true,
      tableId: true,
      values: true,
      order: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  // ========================================================================
  // DETERMINE PAGINATION STATE
  // ========================================================================
  let hasMore = false
  let nextCursor: number | undefined = undefined

  if (rows.length > limit) {
    // We fetched more than limit, so there are more rows
    hasMore = true
    rows.pop() // Remove the extra row we used for checking
  }

  // Set next cursor to the order value of the last row
  if (rows.length > 0 && hasMore) {
    nextCursor = rows[rows.length - 1].order
  }

  return {
    rows: rows.map(row => ({
      ...row,
      values: row.values as Record<string, unknown>,
    })),
    nextCursor,
    hasMore,
    totalInRange,
  }
}

// ============================================================================
// TRANSFORM HELPERS
// ============================================================================

/**
 * Transform table to API response format
 */
export function transformTable(
  table: Prisma.CmsTableGetPayload<{
    include: { columns: true }
  }>
) {
  return {
    id: table.id,
    organizationId: table.organizationId,
    name: table.name,
    slug: table.slug,
    description: table.description,
    icon: table.icon,
    order: table.order,
    // System table flags for UI to distinguish internal vs custom tables
    isSystemTable: table.isSystemTable,
    sourceStoreId: table.sourceStoreId,
    columns: table.columns.map(transformColumn),
    createdAt: table.createdAt,
    updatedAt: table.updatedAt,
  }
}

/**
 * Transform column to API response format.
 * isSystem combines both the DB flag (isSystemColumn) and type-based check
 * for backward compatibility with existing non-flagged system columns.
 */
export function transformColumn(column: Prisma.CmsColumnGetPayload<object>) {
  return {
    id: column.id,
    tableId: column.tableId,
    name: column.name,
    slug: column.slug,
    columnType: column.columnType,
    required: column.required,
    defaultValue: column.defaultValue,
    options: column.options,
    order: column.order,
    /** True if this column is protected (store-synced or DATE_CREATED/DATE_UPDATED) */
    isSystem: column.isSystemColumn || isSystemColumnType(column.columnType),
    createdAt: column.createdAt,
    updatedAt: column.updatedAt,
  }
}

/**
 * Transform row to API response format
 */
export function transformRow(row: Prisma.CmsRowGetPayload<object>) {
  return {
    id: row.id,
    tableId: row.tableId,
    values: row.values as Record<string, unknown>,
    order: row.order,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * Format inventory quantity for CMS display.
 *
 * SOURCE OF TRUTH: CmsStockDisplay, formatStockDisplay
 *
 * Converts raw inventory data into a user-friendly string for the CMS "Stock" column.
 * - Not tracked → "" (blank — inventory isn't relevant for this product)
 * - Tracked, quantity = 0 → "No Stock"
 * - Tracked, quantity > 0 → "5" (the actual number as a string)
 *
 * @param trackInventory - Whether the product tracks inventory
 * @param inventoryQuantity - The raw stock count
 */
export function formatStockDisplay(
  trackInventory: boolean,
  inventoryQuantity: number
): string {
  if (!trackInventory) return ''
  if (inventoryQuantity <= 0) return 'No Stock'
  return String(inventoryQuantity)
}

/**
 * Format trial days for CMS display.
 *
 * SOURCE OF TRUTH: CmsTrialDisplay, formatTrialDisplay
 *
 * - No trial (0 or null/undefined) → "" (blank)
 * - Has trial → "7 days", "14 days", etc.
 *
 * @param trialDays - Number of free trial days (0 or falsy = no trial)
 */
export function formatTrialDisplay(trialDays: number | null | undefined): string {
  if (!trialDays || trialDays <= 0) return ''
  return `${trialDays} ${trialDays === 1 ? 'day' : 'days'}`
}

/**
 * Format billing info into a single human-readable string for CMS display.
 *
 * SOURCE OF TRUTH: BillingDescription, formatBillingDescription
 *
 * Converts raw billing enum values into UX-friendly text for the CMS "Billing" column.
 * Raw values are kept as hidden row fields for cart/checkout logic.
 *
 * ONE_TIME products return empty string — showing "One-Time" in the store
 * CMS table looks redundant since most products are one-time by default.
 *
 * Examples:
 * - ONE_TIME → "" (empty — no label needed)
 * - RECURRING + MONTH + 1 → "Monthly"
 * - RECURRING + YEAR + 1 → "Yearly"
 * - RECURRING + WEEK + 2 → "Every 2 weeks"
 * - SPLIT_PAYMENT + MONTH + 1 → "Installments (monthly)"
 */
export function formatBillingDescription(
  billingType: string,
  billingInterval?: string | null,
  intervalCount?: number | null
): string {
  /** One-time products don't need a billing label — it's the default assumption. */
  if (billingType === 'ONE_TIME') return ''

  const count = intervalCount ?? 1
  const interval = billingInterval?.toUpperCase()

  /** Maps Stripe interval enums to human-readable labels */
  const intervalLabels: Record<string, { adjective: string; plural: string }> = {
    DAY: { adjective: 'Daily', plural: 'days' },
    WEEK: { adjective: 'Weekly', plural: 'weeks' },
    MONTH: { adjective: 'Monthly', plural: 'months' },
    YEAR: { adjective: 'Yearly', plural: 'years' },
  }

  const label = interval ? intervalLabels[interval] : null
  if (!label) return billingType

  /** "Monthly" for count=1, "Every 2 months" for count>1 */
  const intervalText = count === 1 ? label.adjective : `Every ${count} ${label.plural}`

  /** Split payments show as "Installments (monthly)" */
  if (billingType === 'SPLIT_PAYMENT') {
    return `Installments (${intervalText.toLowerCase()})`
  }

  return intervalText
}

/**
 * Format store table row values — ensures price_amount has currency symbol
 * and billing fields have human-readable descriptions.
 *
 * SOURCE OF TRUTH: StoreRowPriceFormatting
 *
 * Handles both old format (raw number like 49.99) and new format (already formatted "$49.99").
 * For non-store tables, returns values unchanged.
 * Also backfills _price_cents for old rows that don't have it (needed for cart calculations).
 * Also backfills billing description for old rows that don't have the formatted billing field.
 *
 * @param values - Row values JSON object
 * @param isStoreTable - Whether this row belongs to a store CMS table
 */
export function formatStoreRowValues(
  values: Record<string, unknown>,
  isStoreTable: boolean
): Record<string, unknown> {
  if (!isStoreTable) return values

  let result = values
  const priceAmount = values.price_amount
  const currency = values.currency as string | undefined
  const priceCents = values._price_cents as number | undefined

  /** Old format: price_amount is a raw number (e.g., 49.99 dollars). Format it with currency symbol. */
  if (typeof priceAmount === 'number' && currency) {
    const amountInCents = Math.round(priceAmount * 100)
    result = {
      ...result,
      price_amount: formatCurrency(amountInCents, currency),
      _price_cents: priceCents ?? amountInCents,
    }
  }

  /**
   * Billing description — generate for old rows that don't have the formatted billing field yet.
   * New rows store this at write time; old rows get it computed on-the-fly from raw values.
   */
  if (!result.billing && result.billing_type) {
    result = {
      ...result,
      billing: formatBillingDescription(
        result.billing_type as string,
        result.billing_interval as string | null,
        result.interval_count as number | null
      ),
    }
  }

  return result
}

// ============================================================================
// SYSTEM TABLE FUNCTIONS - For Ecommerce Store Sync
// ============================================================================

/**
 * Check if a table is a system table (protected from edit/delete in CMS UI)
 * WHY: System tables are auto-synced from ecommerce stores
 */
export async function isSystemTable(tableId: string): Promise<boolean> {
  const table = await prisma.cmsTable.findUnique({
    where: { id: tableId },
    select: { isSystemTable: true },
  })
  return table?.isSystemTable ?? false
}

/**
 * Get CMS table by source store ID
 * WHY: Find the synced CMS table for a specific ecommerce store
 */
export async function getTableByStoreId(storeId: string) {
  return await prisma.cmsTable.findFirst({
    where: {
      sourceStoreId: storeId,
      deletedAt: null,
    },
    include: {
      columns: {
        where: { deletedAt: null },
        orderBy: { order: 'asc' },
      },
    },
  })
}

/**
 * Create a system CMS table for an ecommerce store
 * WHY: Auto-create a CMS table when a store is created for two-way sync
 *
 * Creates predefined columns for store products:
 * - product_name (TEXT, required)
 * - product_description (TEXT)
 * - product_image (IMAGE_URL)
 * - price_name (TEXT)
 * - price_amount (NUMBER)
 * - currency (TEXT)
 * - billing_type (TEXT) - ONE_TIME, RECURRING
 * - billing_interval (TEXT) - DAY, WEEK, MONTH, YEAR (for subscriptions)
 * - interval_count (NUMBER) - e.g., 2 for "every 2 months" (for subscriptions)
 * - stripe_price_id (TEXT) - Stripe price ID for checkout
 */
export async function createStoreTable(input: {
  organizationId: string
  storeId: string
  storeName: string
  storeDescription?: string | null
}) {
  const slug = generateSlug(input.storeName)

  // Check for slug collision and add suffix if needed
  let finalSlug = slug
  let suffix = 1
  while (await checkTableSlugExists(input.organizationId, finalSlug)) {
    finalSlug = `${slug}-${suffix}`
    suffix++
  }

  return await prisma.cmsTable.create({
    data: {
      organizationId: input.organizationId,
      name: input.storeName,
      slug: finalSlug,
      description: input.storeDescription || `Products from ${input.storeName} store`,
      icon: '🛒',
      isSystemTable: true,
      sourceStoreId: input.storeId,
      columns: {
        create: [
          /**
           * Store system columns — all marked with isSystemColumn: true
           * WHY: These columns are mandatory for ecommerce store sync and
           * must NOT be deleted or modified by users. Users can add custom
           * columns (isSystemColumn: false) alongside these.
           */
          {
            name: 'Product Name',
            slug: 'product_name',
            columnType: CmsColumnType.TEXT,
            required: true,
            order: 0,
            isSystemColumn: true,
          },
          /**
           * SOURCE OF TRUTH: ProductDescription
           * Product description text — synced from product.description via two-way sync.
           * Visible in CMS table and available for website builder field pickers.
           */
          {
            name: 'Product Description',
            slug: 'product_description',
            columnType: CmsColumnType.TEXT,
            required: false,
            order: 1,
            isSystemColumn: true,
          },
          {
            name: 'Product Image',
            slug: 'product_image',
            columnType: CmsColumnType.IMAGE_URL,
            required: false,
            order: 2,
            isSystemColumn: true,
          },
          /**
           * SOURCE OF TRUTH: ProductImages
           * Gallery column for additional product images (stored as string[]).
           * Displayed in product detail pages and carousels.
           */
          {
            name: 'Product Images',
            slug: 'product_images',
            columnType: CmsColumnType.GALLERY,
            required: false,
            order: 3,
            isSystemColumn: true,
          },
          {
            name: 'Price Name',
            slug: 'price_name',
            columnType: CmsColumnType.TEXT,
            required: false,
            order: 4,
            isSystemColumn: true,
          },
          /**
           * Price displayed with currency symbol (e.g., "$49.99").
           * TEXT type because it stores formatted strings via formatCurrency().
           * Raw cents are stored in hidden _price_cents for cart calculations.
           * Currency column removed — currency is embedded in the formatted price.
           */
          {
            name: 'Price',
            slug: 'price_amount',
            columnType: CmsColumnType.TEXT,
            required: false,
            order: 5,
            isSystemColumn: true,
          },
          /**
           * Human-readable billing description (e.g., "One-time", "Monthly", "Every 2 weeks").
           * Generated by formatBillingDescription() from raw billing_type/interval/count values.
           * Raw values stored as hidden fields (no CmsColumn) for cart/checkout logic.
           */
          {
            name: 'Billing',
            slug: 'billing',
            columnType: CmsColumnType.TEXT,
            required: false,
            order: 6,
            isSystemColumn: true,
          },
          /**
           * Internal columns — used by cart/checkout logic but hidden from
           * website builder field pickers via options.internal flag.
           * WHY: Users should only see user-facing data (name, price, billing).
           * New columns WITHOUT { internal: true } auto-appear in field pickers.
           */
          {
            name: 'Stripe Price ID',
            slug: 'stripe_price_id',
            columnType: CmsColumnType.TEXT,
            required: false,
            order: 7,
            options: { internal: true },
            isSystemColumn: true,
          },
          {
            name: 'Track Inventory',
            slug: 'track_inventory',
            columnType: CmsColumnType.BOOLEAN,
            required: false,
            order: 8,
            options: { internal: true },
            isSystemColumn: true,
          },
          {
            name: 'Stock',
            slug: 'inventory_quantity',
            columnType: CmsColumnType.TEXT,
            required: false,
            order: 9,
            /**
             * Visible in table view — users need to see stock levels at a glance.
             * TEXT type so we can show: "" (not tracked), "No Stock" (0), or "5" (count).
             *
             * SOURCE OF TRUTH: CmsStockColumn, InventoryDisplay
             */
            isSystemColumn: true,
          },
          {
            name: 'In Stock',
            slug: 'in_stock',
            columnType: CmsColumnType.BOOLEAN,
            required: false,
            order: 10,
            /** Visible in table view — quick yes/no stock indicator */
            isSystemColumn: true,
          },
          {
            name: 'Trial',
            slug: 'trial_days',
            columnType: CmsColumnType.TEXT,
            required: false,
            order: 11,
            /**
             * Visible in table — shows free trial duration.
             * TEXT type so we can show: "" (no trial) or "7 days" (with trial).
             *
             * SOURCE OF TRUTH: CmsTrialColumn, TrialDisplay
             */
            isSystemColumn: true,
          },
          {
            name: 'Features',
            slug: 'features',
            columnType: CmsColumnType.TEXT,
            required: false,
            order: 12,
            /** Visible in table — comma-separated feature names */
            isSystemColumn: true,
          },
          {
            name: 'Allow Backorder',
            slug: 'allow_backorder',
            columnType: CmsColumnType.BOOLEAN,
            required: false,
            order: 13,
            options: { internal: true },
            isSystemColumn: true,
          },
          // System timestamp columns (DATE_CREATED, DATE_UPDATED) — also marked as system
          ...getSystemColumns(),
        ],
      },
    },
    include: {
      columns: {
        where: { deletedAt: null },
        orderBy: { order: 'asc' },
      },
    },
  })
}

/**
 * Update a system CMS table when store is updated
 * WHY: Keep table name/description in sync with store
 */
export async function updateStoreTable(
  storeId: string,
  data: { name?: string; description?: string | null }
) {
  const table = await getTableByStoreId(storeId)
  if (!table) return null

  const updateData: Prisma.CmsTableUpdateInput = {}
  if (data.name !== undefined) {
    updateData.name = data.name
    // Also update slug if name changed
    const newSlug = generateSlug(data.name)
    const slugExists = await checkTableSlugExists(table.organizationId, newSlug, table.id)
    if (!slugExists) {
      updateData.slug = newSlug
    }
  }
  if (data.description !== undefined) {
    updateData.description = data.description
  }

  return await prisma.cmsTable.update({
    where: { id: table.id },
    data: updateData,
  })
}

/**
 * Delete a system CMS table when store is deleted
 * WHY: Clean up CMS table when store is removed
 * NOTE: Hard delete since store is hard deleted
 */
export async function deleteStoreTable(storeId: string) {
  const table = await getTableByStoreId(storeId)
  if (!table) return null

  // Hard delete the table and all its rows/columns (cascade)
  return await prisma.cmsTable.delete({
    where: { id: table.id },
  })
}

/**
 * Add a product row to the store's CMS table
 * WHY: Sync product additions to CMS
 *
 * Includes stripe_price_id for Add to Cart button functionality
 */
export async function addStoreProductRow(input: {
  storeId: string
  productId: string
  productName: string
  /** SOURCE OF TRUTH: ProductDescription — product description text for CMS display */
  productDescription?: string | null
  productImage?: string | null
  /** SOURCE OF TRUTH: ProductImages — additional product gallery images */
  productImages?: string[]
  priceName: string
  priceAmount: number
  currency: string
  billingType: string
  /** Billing interval for subscriptions (DAY, WEEK, MONTH, YEAR) */
  billingInterval?: string | null
  /** Interval count for subscriptions (e.g., 2 for "every 2 months") */
  intervalCount?: number | null
  /** Stripe price ID - may be null if price hasn't been synced to Stripe yet */
  stripePriceId: string | null
  /** Inventory fields - for conditional display in website builder */
  trackInventory?: boolean
  inventoryQuantity?: number
  allowBackorder?: boolean
  /** Free trial days — 0 or undefined means no trial */
  trialDays?: number | null
  /** Comma-separated feature names from the selected price */
  features?: string
}) {
  const table = await getTableByStoreId(input.storeId)
  if (!table) return null

  // Get max order for this table to increment
  const maxOrder = await prisma.cmsRow.aggregate({
    where: { tableId: table.id, deletedAt: null },
    _max: { order: true },
  })

  // Calculate in_stock based on inventory settings
  const inStock = !input.trackInventory || input.inventoryQuantity! > 0 || input.allowBackorder

  /**
   * Create the row with product data.
   * price_amount stores formatted price with currency symbol (e.g., "$49.99").
   * _price_cents stores raw cents for cart calculations (hidden — no CmsColumn = invisible in table).
   * currency stored in values for cart to read but no visible CmsColumn in new stores.
   */
  const row = await prisma.cmsRow.create({
    data: {
      tableId: table.id,
      values: {
        product_name: input.productName,
        product_description: input.productDescription || '',
        product_image: input.productImage || '',
        product_images: input.productImages || [],
        price_name: input.priceName,
        price_amount: formatCurrency(input.priceAmount, input.currency),
        _price_cents: input.priceAmount,
        currency: input.currency.toUpperCase(),
        /** Human-readable billing description visible in CMS table (e.g., "Monthly", "One-time") */
        billing: formatBillingDescription(input.billingType, input.billingInterval, input.intervalCount),
        /** Raw billing values kept hidden (no CmsColumn) for cart/checkout logic */
        billing_type: input.billingType,
        billing_interval: input.billingInterval || null,
        interval_count: input.intervalCount ?? 1,
        stripe_price_id: input.stripePriceId,
        track_inventory: input.trackInventory ?? false,
        /** Display-formatted stock: blank (untracked), "No Stock" (0), or count string */
        inventory_quantity: formatStockDisplay(
          input.trackInventory ?? false,
          input.inventoryQuantity ?? 0
        ),
        /** Raw numeric stock — hidden, used by cart logic (Number() safe). */
        _inventory_quantity_raw: input.inventoryQuantity ?? 0,
        in_stock: inStock,
        allow_backorder: input.allowBackorder ?? false,
        trial_days: formatTrialDisplay(input.trialDays),
        /** Raw numeric trial days — hidden, used by cart logic (Number() safe). */
        _trial_days_raw: input.trialDays ?? 0,
        features: input.features || '',
        _product_id: input.productId,
        /** System timestamps — stored in values for DATE_CREATED/DATE_UPDATED columns */
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Prisma.InputJsonValue,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  })

  /* Invalidate cached CMS public rows — new product row added to store table */
  invalidateCmsRelatedCaches(table.id)

  return row
}

/**
 * Remove a product row from the store's CMS table
 * WHY: Sync product removals from store
 */
export async function removeStoreProductRow(storeId: string, productId: string) {
  const table = await getTableByStoreId(storeId)
  if (!table) return null

  // Find and delete the row with this product
  const row = await prisma.cmsRow.findFirst({
    where: {
      tableId: table.id,
      deletedAt: null,
      values: {
        path: ['_product_id'],
        equals: productId,
      },
    },
  })

  if (!row) return null

  // Hard delete since we're syncing with store
  const deleted = await prisma.cmsRow.delete({
    where: { id: row.id },
  })

  /* Invalidate cached CMS public rows — product row removed from store table */
  invalidateCmsRelatedCaches(table.id)

  return deleted
}

/**
 * Update a product row in the store's CMS table when price changes
 * WHY: Sync price changes to CMS
 */
export async function updateStoreProductRow(input: {
  storeId: string
  productId: string
  priceName: string
  priceAmount: number
  currency: string
  billingType: string
  /** Billing interval for subscriptions (DAY, WEEK, MONTH, YEAR) */
  billingInterval?: string | null
  /** Interval count for subscriptions (e.g., 2 for "every 2 months") */
  intervalCount?: number | null
  /** Stripe price ID - required for checkout functionality in website builder */
  stripePriceId: string | null
  /** Free trial days — 0 or undefined means no trial */
  trialDays?: number | null
  /** Comma-separated feature names from the selected price */
  features?: string
}) {
  const table = await getTableByStoreId(input.storeId)
  if (!table) return null

  // Find the row with this product
  const row = await prisma.cmsRow.findFirst({
    where: {
      tableId: table.id,
      deletedAt: null,
      values: {
        path: ['_product_id'],
        equals: input.productId,
      },
    },
  })

  if (!row) return null

  /**
   * Update the price fields including stripe_price_id for checkout.
   * price_amount stores formatted price with currency symbol (e.g., "$49.99").
   * _price_cents stores raw cents for cart calculations (hidden — no CmsColumn).
   */
  const currentValues = row.values as Record<string, unknown>
  const updated = await prisma.cmsRow.update({
    where: { id: row.id },
    data: {
      values: {
        ...currentValues,
        price_name: input.priceName,
        price_amount: formatCurrency(input.priceAmount, input.currency),
        _price_cents: input.priceAmount,
        currency: input.currency.toUpperCase(),
        /** Human-readable billing description visible in CMS table */
        billing: formatBillingDescription(input.billingType, input.billingInterval, input.intervalCount),
        /** Raw billing values kept hidden for cart/checkout logic */
        billing_type: input.billingType,
        billing_interval: input.billingInterval || null,
        interval_count: input.intervalCount ?? 1,
        stripe_price_id: input.stripePriceId,
        trial_days: formatTrialDisplay(input.trialDays),
        features: input.features ?? (currentValues.features || ''),
        updated_at: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  })

  /* Invalidate cached CMS public rows — product price/details changed */
  invalidateCmsRelatedCaches(table.id)

  return updated
}

/**
 * Sync product inventory to all CMS tables where the product exists
 * WHY: Two-way sync - when inventory changes on product, update all store CMS tables
 *
 * SOURCE OF TRUTH: CMS Inventory Sync
 */
export async function syncProductInventoryToCms(input: {
  productId: string
  trackInventory: boolean
  inventoryQuantity: number
  allowBackorder: boolean
}) {
  // Calculate in_stock based on inventory settings
  const inStock = !input.trackInventory || input.inventoryQuantity > 0 || input.allowBackorder

  // Find all CMS rows that reference this product
  const rows = await prisma.cmsRow.findMany({
    where: {
      deletedAt: null,
      values: {
        path: ['_product_id'],
        equals: input.productId,
      },
    },
  })

  if (rows.length === 0) return []

  // Update all rows with new inventory data
  const updates = rows.map((row) => {
    const currentValues = row.values as Record<string, unknown>
    return prisma.cmsRow.update({
      where: { id: row.id },
      data: {
        values: {
          ...currentValues,
          track_inventory: input.trackInventory,
          /** Display-formatted stock: blank (untracked), "No Stock" (0), or count string */
          inventory_quantity: formatStockDisplay(input.trackInventory, input.inventoryQuantity),
          /** Raw numeric stock — hidden, used by cart logic */
          _inventory_quantity_raw: input.inventoryQuantity,
          in_stock: inStock,
          allow_backorder: input.allowBackorder,
          updated_at: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    })
  })

  const result = await prisma.$transaction(updates)

  /* Invalidate cached CMS public rows for ALL affected tables */
  const affectedTableIds = [...new Set(rows.map((r) => r.tableId))]
  for (const tableId of affectedTableIds) {
    invalidateCmsRelatedCaches(tableId)
  }

  return result
}

/**
 * Sync product details (name, image) to all CMS tables where the product exists
 * WHY: Two-way sync - when product details change, update all store CMS tables
 *
 * SOURCE OF TRUTH: CMS Product Details Sync
 */
export async function syncProductDetailsToCms(input: {
  productId: string
  productName?: string
  /** SOURCE OF TRUTH: ProductDescription — product description for CMS two-way sync */
  productDescription?: string | null
  productImage?: string | null
  /** SOURCE OF TRUTH: ProductImages — additional product gallery images */
  productImages?: string[]
}) {
  // Find all CMS rows that reference this product
  const rows = await prisma.cmsRow.findMany({
    where: {
      deletedAt: null,
      values: {
        path: ['_product_id'],
        equals: input.productId,
      },
    },
  })

  if (rows.length === 0) return []

  // Update all rows with new product data (name, primary image, gallery images)
  const updates = rows.map((row) => {
    const currentValues = row.values as Record<string, unknown>
    return prisma.cmsRow.update({
      where: { id: row.id },
      data: {
        values: {
          ...currentValues,
          ...(input.productName !== undefined && { product_name: input.productName }),
          ...(input.productDescription !== undefined && { product_description: input.productDescription || '' }),
          ...(input.productImage !== undefined && { product_image: input.productImage || '' }),
          ...(input.productImages !== undefined && { product_images: input.productImages }),
          updated_at: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    })
  })

  const result = await prisma.$transaction(updates)

  /* Invalidate cached CMS public rows for ALL affected tables */
  const affectedTableIds = [...new Set(rows.map((r) => r.tableId))]
  for (const tableId of affectedTableIds) {
    invalidateCmsRelatedCaches(tableId)
  }

  return result
}

/**
 * Sync product pricing details (price, billing, trial, features) to all CMS tables
 * SOURCE OF TRUTH: CMS Pricing Sync, CMS Trial Sync, CMS Features Sync
 *
 * Called when price details change (name, amount, trial days, features).
 * Finds all CMS rows with matching _product_id and updates pricing fields.
 * Uses partial update — only fields that are provided will be overwritten.
 */
export async function syncProductPricingToCms(input: {
  productId: string
  priceName?: string
  priceAmount?: number
  currency?: string
  billingType?: string
  billingInterval?: string | null
  intervalCount?: number | null
  stripePriceId?: string | null
  /** Free trial days — 0 or undefined means no trial */
  trialDays?: number | null
  /** Comma-separated feature names from the selected price */
  features?: string
}) {
  // Find all CMS rows across all store tables that reference this product
  const rows = await prisma.cmsRow.findMany({
    where: {
      deletedAt: null,
      values: {
        path: ['_product_id'],
        equals: input.productId,
      },
    },
    include: { table: { select: { id: true } } },
  })

  if (rows.length === 0) return

  // Track affected table IDs for cache invalidation
  const affectedTableIds = new Set<string>()

  for (const row of rows) {
    const currentValues = row.values as Record<string, unknown>
    const updatedValues: Record<string, unknown> = { ...currentValues }

    // Only update fields that are provided (partial update)
    if (input.priceName !== undefined) updatedValues.price_name = input.priceName
    if (input.priceAmount !== undefined) {
      const currency = input.currency || String(currentValues.currency || 'USD')
      updatedValues.price_amount = formatCurrency(input.priceAmount, currency)
      updatedValues._price_cents = input.priceAmount
    }
    if (input.currency !== undefined) updatedValues.currency = input.currency.toUpperCase()
    if (input.billingType !== undefined) {
      updatedValues.billing_type = input.billingType
      /** Regenerate human-readable billing description from updated values */
      updatedValues.billing = formatBillingDescription(
        input.billingType,
        input.billingInterval ?? (currentValues.billing_interval as string | null),
        input.intervalCount ?? (currentValues.interval_count as number | null)
      )
    }
    if (input.billingInterval !== undefined) updatedValues.billing_interval = input.billingInterval
    if (input.intervalCount !== undefined) updatedValues.interval_count = input.intervalCount
    if (input.stripePriceId !== undefined) updatedValues.stripe_price_id = input.stripePriceId
    if (input.trialDays !== undefined) {
      updatedValues.trial_days = formatTrialDisplay(input.trialDays)
      /** Raw numeric trial days — hidden, used by cart logic */
      updatedValues._trial_days_raw = input.trialDays ?? 0
    }
    if (input.features !== undefined) updatedValues.features = input.features

    // Always update the timestamp when syncing pricing
    updatedValues.updated_at = new Date().toISOString()

    await prisma.cmsRow.update({
      where: { id: row.id },
      data: { values: updatedValues as Prisma.InputJsonValue },
    })

    affectedTableIds.add(row.table.id)
  }

  // Invalidate caches for all affected tables
  for (const tableId of affectedTableIds) {
    invalidateCmsRelatedCaches(tableId)
  }
}

// ============================================================================
// PUBLIC CMS ACCESS - For Published Website Pages (No Auth Required)
// ============================================================================

/**
 * SOURCE OF TRUTH: Public CMS Row Access for Published Website Pages
 *
 * SECURITY MODEL:
 * - Only tables with isPublic=true can be accessed without authentication
 * - Server-side enforcement - the isPublic check happens HERE, not in the client
 * - Only READ access is granted - write operations always require authentication
 * - Returns null if table is not public (endpoint should return 403)
 *
 * WHY: Published websites need to display CMS data (e.g., blog posts, products)
 * to visitors without requiring them to log in. This function provides that
 * capability while maintaining strict security boundaries.
 *
 * HOW: The check is server-side in the service layer, so even if someone
 * bypasses the client and calls the API directly, they cannot access
 * private table data.
 */

/**
 * Input type for public row listing (no organizationId required)
 */
export type ListRowsPublicInfiniteInput = {
  tableId: string
  /** Number of items to fetch per page */
  limit?: number
  /** Cursor for pagination - the 'order' value of the last fetched row */
  cursor?: number
  /** Sort order - determines scroll direction */
  sortOrder?: 'asc' | 'desc'
  /** Optional range start - only fetch rows with order >= rangeStart */
  rangeStart?: number
  /** Optional range end - only fetch rows with order <= rangeEnd */
  rangeEnd?: number
}

/**
 * Result type for public row listing with isPublic validation info
 */
export type ListRowsPublicInfiniteResult = {
  /** Whether the table was found and is public */
  authorized: boolean
  /** Error message if not authorized */
  error?: string
  /** Rows data - only present if authorized */
  rows?: Array<{
    id: string
    tableId: string
    values: Record<string, unknown>
    order: number
    createdAt: Date
    updatedAt: Date
  }>
  /** Next cursor for pagination - only present if authorized */
  nextCursor?: number
  /** Whether there are more rows - only present if authorized */
  hasMore?: boolean
  /** Total rows in range - only present if authorized */
  totalInRange?: number
  /** Column definitions - only present if authorized and on first page */
  columns?: Array<{
    id: string
    tableId: string
    name: string
    slug: string
    columnType: CmsColumnType
    required: boolean
    defaultValue: string | null
    options: unknown
    order: number
  }>
}

/**
 * List rows for PUBLIC access with isPublic table check.
 *
 * SECURITY: This function performs the critical isPublic check server-side.
 * If the table doesn't exist or is not marked as public, it returns an
 * unauthorized result. This prevents data leakage from private tables.
 *
 * Used by: SmartCMS List component on published website pages (no auth context)
 *
 * @param input - Table ID and pagination params
 * @returns Authorized result with rows, or unauthorized with error message
 */
export async function listRowsPublicInfinite(
  input: ListRowsPublicInfiniteInput
): Promise<ListRowsPublicInfiniteResult> {
  const {
    tableId,
    limit = 10,
    cursor,
    sortOrder = 'asc',
    rangeStart,
    rangeEnd,
  } = input

  // ========================================================================
  // SECURITY CHECK: Verify table exists and is marked as public
  // ========================================================================
  // This is the CRITICAL security gate. If the table is not public,
  // we return an unauthorized response without any data leakage.
  const table = await prisma.cmsTable.findUnique({
    where: { id: tableId },
    select: {
      id: true,
      isPublic: true,
      deletedAt: true,
      /** Needed to determine if this is a store table for price formatting */
      sourceStoreId: true,
      columns: {
        where: { deletedAt: null },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          tableId: true,
          name: true,
          slug: true,
          columnType: true,
          required: true,
          defaultValue: true,
          options: true,
          order: true,
        },
      },
    },
  })

  // Table not found or soft-deleted
  if (!table || table.deletedAt) {
    return {
      authorized: false,
      error: 'Table not found',
    }
  }

  // SECURITY: Table is not public - deny access
  if (!table.isPublic) {
    return {
      authorized: false,
      error: 'Access denied - table is not public',
    }
  }

  // ========================================================================
  // BUILD WHERE CLAUSE - Apply range limits and cursor
  // ========================================================================
  const where: Prisma.CmsRowWhereInput = {
    tableId,
    deletedAt: null,
  }

  const orderConditions: Prisma.IntFilter = {}

  if (rangeStart !== undefined) {
    orderConditions.gte = rangeStart
  }
  if (rangeEnd !== undefined) {
    orderConditions.lte = rangeEnd
  }

  if (cursor !== undefined) {
    if (sortOrder === 'asc') {
      orderConditions.gt = cursor
    } else {
      orderConditions.lt = cursor
    }
  }

  if (Object.keys(orderConditions).length > 0) {
    where.order = orderConditions
  }

  // ========================================================================
  // COUNT TOTAL IN RANGE
  // ========================================================================
  const rangeWhere: Prisma.CmsRowWhereInput = {
    tableId,
    deletedAt: null,
  }

  if (rangeStart !== undefined || rangeEnd !== undefined) {
    rangeWhere.order = {}
    if (rangeStart !== undefined) (rangeWhere.order as Prisma.IntFilter).gte = rangeStart
    if (rangeEnd !== undefined) (rangeWhere.order as Prisma.IntFilter).lte = rangeEnd
  }

  const totalInRange = await prisma.cmsRow.count({ where: rangeWhere })

  // ========================================================================
  // FETCH ROWS
  // ========================================================================
  const rows = await prisma.cmsRow.findMany({
    where,
    orderBy: { order: sortOrder },
    take: limit + 1,
    select: {
      id: true,
      tableId: true,
      values: true,
      order: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  // ========================================================================
  // DETERMINE PAGINATION STATE
  // ========================================================================
  let hasMore = false
  let nextCursor: number | undefined = undefined

  if (rows.length > limit) {
    hasMore = true
    rows.pop()
  }

  if (rows.length > 0 && hasMore) {
    nextCursor = rows[rows.length - 1].order
  }

  /**
   * Format store table rows — ensures price_amount has currency symbol
   * for both old rows (raw number) and new rows (already formatted).
   * Same logic as the authenticated listRowsInfinite endpoint.
   */
  const isStoreTable = Boolean(table.sourceStoreId)

  // Return authorized result with data
  return {
    authorized: true,
    rows: rows.map(row => ({
      ...row,
      values: formatStoreRowValues(
        row.values as Record<string, unknown>,
        isStoreTable
      ),
    })),
    nextCursor,
    hasMore,
    totalInRange,
    // Include columns on first page (when cursor is undefined)
    columns: cursor === undefined ? table.columns.map(col => ({
      ...col,
      options: col.options,
    })) : undefined,
  }
}
