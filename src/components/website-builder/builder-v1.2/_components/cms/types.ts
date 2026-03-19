/**
 * ============================================================================
 * CMS TYPES - Shared Types for CMS Components
 * ============================================================================
 *
 * Centralized type definitions for CMS components.
 * These match the tRPC router return types.
 *
 * ============================================================================
 */

/**
 * CMS Column types matching Prisma enum.
 */
export type CmsColumnType =
  | 'TEXT'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'MULTISELECT'
  | 'DATE'
  | 'DATE_CREATED'
  | 'DATE_UPDATED'
  | 'IMAGE_URL'
  | 'GALLERY'
  | 'COLOR'
  | 'RICH_TEXT'

/**
 * CMS Table from tRPC listTables response.
 */
export interface CmsTableListItem {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  order: number
  columnsCount: number
  rowsCount: number
  createdAt: string
  updatedAt: string
}

/**
 * CMS Table with full details from tRPC getTable response.
 */
export interface CmsTable {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  order: number
  /** True if this table is synced from an ecommerce store */
  isSystemTable?: boolean
  /** Store ID this table syncs with (if isSystemTable) */
  sourceStoreId?: string | null
  createdAt: string
  updatedAt: string
}

/**
 * CMS Column from tRPC.
 * The options field is JSON type from Prisma - typically string[] for MULTISELECT.
 */
export interface CmsColumn {
  id: string
  tableId: string
  name: string
  slug: string
  columnType: CmsColumnType
  required: boolean
  defaultValue: string | null
  options: unknown // JSON type - can be string[], null, etc.
  order: number
  isSystem?: boolean
  createdAt?: string
  updatedAt?: string
}

/**
 * CMS Row from tRPC.
 * Values are stored as JSONB keyed by column slugs.
 */
export interface CmsRow {
  id: string
  tableId: string
  values: Record<string, unknown>
  order: number
  createdAt: string
  updatedAt: string
}
