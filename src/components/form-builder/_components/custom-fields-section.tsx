/**
 * ============================================================================
 * CUSTOM FIELDS SECTION
 * ============================================================================
 *
 * Displays organization's custom dataset fields in the form builder sidebar.
 * Fields are grouped by dataset (category) and can be dragged onto the canvas.
 *
 * When dropped, the form element is automatically configured with:
 * - Correct field type mapping (CustomDataFieldType → FormElementType)
 * - datasetFieldRef populated for submission routing
 * - Label and other properties from the custom field definition
 *
 * ARCHITECTURE:
 * - Fetches datasets via tRPC (customData.listCategories, customData.getCategory)
 * - Maps CustomDataFieldType to FormElementType for rendering
 * - Drag data includes datasetFieldRef for auto-configuration on drop
 */

'use client'

import React, { useState, useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ChevronRight,
  Database,
  Type,
  AlignLeft,
  Hash,
  Mail,
  Phone,
  Link,
  Calendar,
  CalendarClock,
  Square,
  Circle,
  ChevronDown,
  ListChecks,
  DollarSign,
  Layers,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { trpc } from '@/trpc/react-provider'
import { CustomDataFieldType } from '@/generated/prisma'
import type { FormElementType } from '../_lib/types'

// ============================================================================
// TYPE MAPPING
// ============================================================================

/**
 * Maps CustomDataFieldType (from Prisma) to FormElementType (form builder).
 * This ensures custom fields render with the correct input component.
 */
const FIELD_TYPE_MAP: Record<CustomDataFieldType, FormElementType> = {
  TEXT: 'text',
  TEXTAREA: 'textarea',
  NUMBER: 'number',
  CURRENCY: 'number', // Currency uses number input with formatting
  EMAIL: 'email',
  PHONE: 'phone',
  URL: 'url',
  DATE: 'date',
  DATETIME: 'datetime',
  CHECKBOX: 'checkbox',
  RADIO: 'radio',
  SELECT: 'select',
  MULTISELECT: 'multiselect',
}

/**
 * Icons for each field type - provides visual hint of field purpose.
 */
const FIELD_TYPE_ICONS: Record<CustomDataFieldType, LucideIcon> = {
  TEXT: Type,
  TEXTAREA: AlignLeft,
  NUMBER: Hash,
  CURRENCY: DollarSign,
  EMAIL: Mail,
  PHONE: Phone,
  URL: Link,
  DATE: Calendar,
  DATETIME: CalendarClock,
  CHECKBOX: Square,
  RADIO: Circle,
  SELECT: ChevronDown,
  MULTISELECT: ListChecks,
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Custom field data passed during drag operations.
 * Contains everything needed to create a properly configured form element.
 */
export interface CustomFieldDragData {
  type: 'custom-field'
  /** The form element type to create */
  elementType: FormElementType
  /** Reference linking this element to the custom dataset field */
  datasetFieldRef: {
    datasetId: string
    fieldId: string
    fieldSlug: string
  }
  /** Pre-populated field properties */
  fieldConfig: {
    label: string
    placeholder?: string
    helpText?: string
    required: boolean
    options?: string[]
  }
}

/**
 * Shape of a custom field from the API.
 */
interface CustomField {
  id: string
  categoryId: string
  name: string
  slug: string
  label: string
  fieldType: CustomDataFieldType
  required: boolean
  placeholder: string | null
  helpText: string | null
  options: string[] | null
}

/**
 * Shape of a dataset (category) from the API.
 */
interface CustomDataset {
  id: string
  name: string
  slug: string
  icon: string | null
  fieldsCount: number
}

// ============================================================================
// DRAGGABLE CUSTOM FIELD
// ============================================================================

interface DraggableCustomFieldProps {
  field: CustomField
  datasetId: string
}

/**
 * Individual draggable custom field item.
 * When dragged, passes all necessary data for element creation.
 */
function DraggableCustomField({ field, datasetId }: DraggableCustomFieldProps) {
  const elementType = FIELD_TYPE_MAP[field.fieldType]
  const Icon = FIELD_TYPE_ICONS[field.fieldType]

  // Build drag data with all info needed to create the form element
  const dragData: CustomFieldDragData = {
    type: 'custom-field',
    elementType,
    datasetFieldRef: {
      datasetId,
      fieldId: field.id,
      fieldSlug: field.slug,
    },
    fieldConfig: {
      label: field.label,
      placeholder: field.placeholder ?? undefined,
      helpText: field.helpText ?? undefined,
      required: field.required,
      options: field.options ?? undefined,
    },
  }

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `custom-field-${field.id}`,
      data: dragData,
    })

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-md',
        'bg-muted/30 hover:bg-muted/60 border border-transparent',
        'cursor-grab active:cursor-grabbing',
        'transition-all duration-150',
        'hover:border-border hover:shadow-sm',
        isDragging && 'opacity-50 shadow-lg border-primary/50'
      )}
      title={field.helpText || `Add ${field.label} field`}
    >
      <div className="w-6 h-6 rounded flex items-center justify-center bg-background/80 shrink-0">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <span className="text-xs font-medium text-foreground/80 truncate">
        {field.label}
      </span>
      {field.required && (
        <span className="text-[10px] text-destructive ml-auto">*</span>
      )}
    </div>
  )
}

// ============================================================================
// DATASET SECTION (COLLAPSIBLE)
// ============================================================================

interface DatasetSectionProps {
  dataset: CustomDataset
  organizationId: string
  /** Search query for filtering fields */
  searchQuery?: string
  /** Force section to be open (used when search is active) */
  forceOpen?: boolean
}

/**
 * Collapsible section for a single dataset.
 * Lazily loads fields when expanded.
 * Supports search filtering of fields.
 */
function DatasetSection({
  dataset,
  organizationId,
  searchQuery = '',
  forceOpen = false,
}: DatasetSectionProps) {
  const [isOpen, setIsOpen] = useState(false)

  // Determine if section should be open (manual toggle or forced by search)
  const effectiveIsOpen = forceOpen || isOpen

  // Fetch fields when section is opened OR when search is active
  const { data: categoryData, isLoading } = trpc.customData.getCategory.useQuery(
    { organizationId, categoryId: dataset.id },
    { enabled: effectiveIsOpen }
  )

  // Explicitly type to avoid deep type inference issues with tRPC
  const allFields: CustomField[] = (categoryData?.fields as unknown as CustomField[]) ?? []

  // Filter fields based on search query (client-side filter after fetch)
  const filteredFields = useMemo(() => {
    if (!searchQuery.trim()) return allFields

    const query = searchQuery.toLowerCase().trim()
    return allFields.filter(
      (field) =>
        field.label.toLowerCase().includes(query) ||
        field.name.toLowerCase().includes(query) ||
        (field.helpText && field.helpText.toLowerCase().includes(query))
    )
  }, [allFields, searchQuery])

  // Hide section if search is active and no fields match
  if (searchQuery.trim() && !isLoading && filteredFields.length === 0) {
    return null
  }

  return (
    <Collapsible open={effectiveIsOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full py-1.5 px-2 hover:bg-muted/50 rounded-md transition-colors group">
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground transition-transform',
            effectiveIsOpen && 'rotate-90'
          )}
        />
        <Database className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-foreground/70 truncate flex-1 text-left">
          {dataset.name}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {searchQuery.trim() ? filteredFields.length : dataset.fieldsCount}
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="pl-4 pr-1 py-1.5 space-y-1">
          {isLoading ? (
            // Loading skeleton
            <>
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </>
          ) : filteredFields.length === 0 ? (
            // Empty state
            <p className="text-xs text-muted-foreground py-2 text-center">
              No fields in this dataset
            </p>
          ) : (
            // Field list
            filteredFields.map((field) => (
              <DraggableCustomField
                key={field.id}
                field={field}
                datasetId={dataset.id}
              />
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface CustomFieldsSectionProps {
  organizationId: string
  /** Search query for filtering fields (debounced from parent) */
  searchQuery?: string
}

/**
 * Custom Fields section for the form builder sidebar.
 * Displays all custom datasets and their fields as draggable items.
 *
 * Features:
 * - Lazy loading of fields (only fetch when dataset is expanded)
 * - Grouped by dataset for organization
 * - Visual type indicators
 * - Smooth drag and drop integration
 * - Search/filter support (filters by field label)
 */
export function CustomFieldsSection({
  organizationId,
  searchQuery = '',
}: CustomFieldsSectionProps) {
  // Fetch all datasets for the organization
  const { data: datasets, isLoading } = trpc.customData.listCategories.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  )

  // Filter to only show datasets with fields
  // Explicitly type to avoid deep type inference issues with tRPC
  const datasetsWithFields: CustomDataset[] = useMemo(
    () => ((datasets ?? []) as CustomDataset[]).filter((d) => d.fieldsCount > 0),
    [datasets]
  )

  // Show empty state when no datasets
  if (!isLoading && datasetsWithFields.length === 0) {
    return (
      <div className="text-center py-8">
        <Database className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">
          No custom fields defined
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Create datasets in Settings → Custom Data
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {isLoading ? (
        // Loading skeleton
        <div className="space-y-2">
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
        </div>
      ) : datasetsWithFields.length > 0 ? (
        // Dataset sections - all expanded when search is active
        datasetsWithFields.map((dataset) => (
          <DatasetSection
            key={dataset.id}
            dataset={dataset}
            organizationId={organizationId}
            searchQuery={searchQuery}
            forceOpen={!!searchQuery.trim()}
          />
        ))
      ) : null}
    </div>
  )
}
