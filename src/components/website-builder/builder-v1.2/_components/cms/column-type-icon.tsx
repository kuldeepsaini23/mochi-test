/**
 * ============================================================================
 * COLUMN TYPE ICON - Visual icons for CMS column types
 * ============================================================================
 *
 * Maps each CMS column type to an appropriate icon for visual identification.
 * Used throughout the CMS UI in table headers, column editor, etc.
 *
 * ============================================================================
 */

'use client'

import {
  Type,
  Hash,
  ToggleLeft,
  Tags,
  Calendar,
  CalendarPlus,
  CalendarClock,
  Image,
  Images,
  Palette,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CmsColumnType } from './types'

// Re-export for backwards compatibility
export type { CmsColumnType } from './types'

interface ColumnTypeIconProps {
  /** The column type to display an icon for */
  type: CmsColumnType
  /** Additional CSS classes */
  className?: string
}

/**
 * Column type icon component.
 * Returns the appropriate icon for each column type.
 */
export function ColumnTypeIcon({ type, className }: ColumnTypeIconProps) {
  const baseClass = cn('text-muted-foreground', className)

  switch (type) {
    case 'TEXT':
      return <Type className={baseClass} />

    case 'NUMBER':
      return <Hash className={baseClass} />

    case 'BOOLEAN':
      return <ToggleLeft className={baseClass} />

    case 'MULTISELECT':
      return <Tags className={baseClass} />

    case 'DATE':
      return <Calendar className={baseClass} />

    case 'DATE_CREATED':
      return <CalendarPlus className={baseClass} />

    case 'DATE_UPDATED':
      return <CalendarClock className={baseClass} />

    case 'IMAGE_URL':
      return <Image className={baseClass} />

    case 'GALLERY':
      return <Images className={baseClass} />

    case 'COLOR':
      return <Palette className={baseClass} />

    case 'RICH_TEXT':
      return <FileText className={baseClass} />

    default:
      return <Type className={baseClass} />
  }
}

/**
 * Get the display label for a column type.
 */
export function getColumnTypeLabel(type: CmsColumnType): string {
  switch (type) {
    case 'TEXT':
      return 'Text'
    case 'NUMBER':
      return 'Number'
    case 'BOOLEAN':
      return 'Boolean'
    case 'MULTISELECT':
      return 'Multi-select'
    case 'DATE':
      return 'Date'
    case 'DATE_CREATED':
      return 'Created Date'
    case 'DATE_UPDATED':
      return 'Updated Date'
    case 'IMAGE_URL':
      return 'Image URL'
    case 'GALLERY':
      return 'Gallery'
    case 'COLOR':
      return 'Color'
    case 'RICH_TEXT':
      return 'Rich Text'
    default:
      return type
  }
}

/**
 * Get the description for a column type.
 */
export function getColumnTypeDescription(type: CmsColumnType): string {
  switch (type) {
    case 'TEXT':
      return 'Single line or paragraph text'
    case 'NUMBER':
      return 'Numeric values (integers or decimals)'
    case 'BOOLEAN':
      return 'True/false toggle'
    case 'MULTISELECT':
      return 'Choose from predefined options'
    case 'DATE':
      return 'Date and optional time'
    case 'DATE_CREATED':
      return 'Auto-populated when row is created'
    case 'DATE_UPDATED':
      return 'Auto-updated when row changes'
    case 'IMAGE_URL':
      return 'URL to an image or media file'
    case 'GALLERY':
      return 'Multiple images (gallery)'
    case 'COLOR':
      return 'Color picker with hex value'
    case 'RICH_TEXT':
      return 'Formatted text with headings, lists, and more'
    default:
      return ''
  }
}

/**
 * List of column types available for user creation.
 * System types (DATE_CREATED, DATE_UPDATED) are excluded.
 */
export const CREATABLE_COLUMN_TYPES: CmsColumnType[] = [
  'TEXT',
  'NUMBER',
  'BOOLEAN',
  'MULTISELECT',
  'DATE',
  'IMAGE_URL',
  'GALLERY',
  'COLOR',
  'RICH_TEXT',
]

/**
 * All column types including system types.
 */
export const ALL_COLUMN_TYPES: CmsColumnType[] = [
  'TEXT',
  'NUMBER',
  'BOOLEAN',
  'MULTISELECT',
  'DATE',
  'DATE_CREATED',
  'DATE_UPDATED',
  'IMAGE_URL',
  'GALLERY',
  'COLOR',
  'RICH_TEXT',
]
