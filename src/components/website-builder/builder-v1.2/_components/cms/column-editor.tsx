/**
 * ============================================================================
 * COLUMN EDITOR - Modal for Creating/Editing CMS Columns
 * ============================================================================
 *
 * Dialog for creating or editing table columns with:
 * - Column name and slug
 * - Type selector with icons
 * - Required toggle
 * - Default value (type-aware)
 * - Options editor for MULTISELECT type
 *
 * FEATURES:
 * - Auto-generate slug from name
 * - Type-specific validation
 * - Optimistic create/update
 *
 * ============================================================================
 */

'use client'

import { useState, useEffect, useCallback, KeyboardEvent } from 'react'
import { Loader2, Plus, X, Columns3 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { trpc } from '@/trpc/react-provider'
import {
  ColumnTypeIcon,
  CREATABLE_COLUMN_TYPES,
  getColumnTypeLabel,
  getColumnTypeDescription,
} from './column-type-icon'
import type { CmsColumn, CmsColumnType } from './types'
import type { CmsColumnType as PrismaCmsColumnType } from '@/generated/prisma'

interface ColumnEditorProps {
  /** Whether the dialog is open */
  isOpen: boolean
  /** Callback when dialog should close */
  onClose: () => void
  /** Table ID for the column */
  tableId: string
  /** Organization ID for mutations */
  organizationId: string
  /** Column to edit (null for create mode) */
  column: CmsColumn | null
}

/**
 * Generate a URL-friendly slug from a name.
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * Column Editor dialog for creating/editing columns.
 */
export function ColumnEditor({
  isOpen,
  onClose,
  tableId,
  organizationId,
  column,
}: ColumnEditorProps) {
  const isEditMode = !!column

  // Form state
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [columnType, setColumnType] = useState<CmsColumnType>('TEXT')
  const [required, setRequired] = useState(false)
  const [defaultValue, setDefaultValue] = useState('')
  const [options, setOptions] = useState<string[]>([])
  const [newOption, setNewOption] = useState('')
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false)

  // tRPC utils
  const utils = trpc.useUtils()

  /**
   * Create column mutation with optimistic update.
   * Shows the new column immediately in the table header.
   * Note: We cast through unknown to handle tRPC's complex type inference.
   */
  const createColumn = trpc.cms.createColumn.useMutation({
    onSuccess: () => {
      utils.cms.listColumns.invalidate({ organizationId, tableId })
      onClose()
    },
  })

  // Update column mutation
  const updateColumn = trpc.cms.updateColumn.useMutation({
    onSuccess: () => {
      utils.cms.listColumns.invalidate({ organizationId, tableId })
      onClose()
    },
  })

  const isPending = createColumn.isPending || updateColumn.isPending

  /**
   * Initialize form when dialog opens.
   */
  useEffect(() => {
    if (isOpen) {
      if (column) {
        // Edit mode - populate from existing column
        setName(column.name)
        setSlug(column.slug)
        setColumnType(column.columnType)
        setRequired(column.required)
        setDefaultValue(column.defaultValue ?? '')
        // options is JSON from Prisma - cast to string[] or default to empty
        setOptions(Array.isArray(column.options) ? column.options as string[] : [])
        setIsSlugManuallyEdited(true)
      } else {
        // Create mode - reset form
        setName('')
        setSlug('')
        setColumnType('TEXT')
        setRequired(false)
        setDefaultValue('')
        setOptions([])
        setNewOption('')
        setIsSlugManuallyEdited(false)
      }
    }
  }, [isOpen, column])

  /**
   * Auto-generate slug from name unless manually edited.
   */
  useEffect(() => {
    if (!isSlugManuallyEdited && name) {
      setSlug(generateSlug(name))
    }
  }, [name, isSlugManuallyEdited])

  /**
   * Handle slug change - mark as manually edited.
   */
  const handleSlugChange = useCallback((value: string) => {
    setSlug(generateSlug(value))
    setIsSlugManuallyEdited(true)
  }, [])

  /**
   * Add a new option for MULTISELECT type.
   */
  const handleAddOption = useCallback(() => {
    const trimmed = newOption.trim()
    if (trimmed && !options.includes(trimmed)) {
      setOptions([...options, trimmed])
      setNewOption('')
    }
  }, [newOption, options])

  /**
   * Handle Enter key in option input.
   */
  const handleOptionKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddOption()
    }
  }

  /**
   * Remove an option.
   */
  const handleRemoveOption = useCallback((index: number) => {
    setOptions(options.filter((_, i) => i !== index))
  }, [options])

  /**
   * Handle form submission.
   */
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()

      const trimmedName = name.trim()
      if (!trimmedName) return

      /**
       * Cast columnType to Prisma's enum type for tRPC validation compatibility.
       * Our frontend CmsColumnType union may include values (e.g. GALLERY) that
       * haven't been generated by Prisma yet — the cast ensures the mutation
       * compiles while the DB enum is pending migration.
       */
      const columnData = {
        name: trimmedName,
        slug: slug || generateSlug(trimmedName),
        columnType: columnType as PrismaCmsColumnType,
        required,
        defaultValue: defaultValue.trim() || undefined,
        options: columnType === 'MULTISELECT' && options.length > 0 ? options : undefined,
      }

      if (isEditMode && column) {
        updateColumn.mutate({
          organizationId,
          columnId: column.id,
          ...columnData,
        })
      } else {
        createColumn.mutate({
          organizationId,
          tableId,
          ...columnData,
        })
      }
    },
    [
      name,
      slug,
      columnType,
      required,
      defaultValue,
      options,
      isEditMode,
      column,
      organizationId,
      tableId,
      createColumn,
      updateColumn,
    ]
  )

  const isValid = name.trim().length > 0
  const showOptionsEditor = columnType === 'MULTISELECT'

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Columns3 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle>
                {isEditMode ? 'Edit Column' : 'Add Column'}
              </DialogTitle>
              <DialogDescription>
                {isEditMode
                  ? 'Update the column settings'
                  : 'Add a new column to your table'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Column Name */}
          <div className="space-y-2">
            <Label htmlFor="column-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="column-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Title, Description"
              autoFocus
              disabled={isPending}
            />
          </div>

          {/* Column Slug */}
          <div className="space-y-2">
            <Label htmlFor="column-slug">
              Slug
              <span className="text-muted-foreground font-normal ml-1">
                (auto-generated)
              </span>
            </Label>
            <Input
              id="column-slug"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="title"
              disabled={isPending}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Key used when binding data to components
            </p>
          </div>

          {/* Column Type */}
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={columnType}
              onValueChange={(value) => setColumnType(value as CmsColumnType)}
              disabled={isPending || isEditMode} // Can't change type in edit mode
            >
              <SelectTrigger>
                <SelectValue>
                  <div className="flex items-center gap-2">
                    <ColumnTypeIcon type={columnType} className="w-4 h-4" />
                    <span>{getColumnTypeLabel(columnType)}</span>
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CREATABLE_COLUMN_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    <div className="flex items-center gap-2">
                      <ColumnTypeIcon type={type} className="w-4 h-4" />
                      <div>
                        <div className="font-medium">{getColumnTypeLabel(type)}</div>
                        <div className="text-xs text-muted-foreground">
                          {getColumnTypeDescription(type)}
                        </div>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isEditMode && (
              <p className="text-xs text-muted-foreground">
                Column type cannot be changed after creation
              </p>
            )}
          </div>

          {/* Required Toggle */}
          <div className="flex items-center justify-between py-2">
            <div>
              <Label htmlFor="column-required" className="cursor-pointer">
                Required
              </Label>
              <p className="text-xs text-muted-foreground">
                Rows must have a value for this column
              </p>
            </div>
            <Switch
              id="column-required"
              checked={required}
              onCheckedChange={setRequired}
              disabled={isPending}
            />
          </div>

          {/* Options Editor (for MULTISELECT) */}
          {showOptionsEditor && (
            <div className="space-y-2">
              <Label>Options</Label>
              <div className="flex gap-2">
                <Input
                  value={newOption}
                  onChange={(e) => setNewOption(e.target.value)}
                  onKeyDown={handleOptionKeyDown}
                  placeholder="Add an option..."
                  disabled={isPending}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleAddOption}
                  disabled={!newOption.trim() || isPending}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {options.length > 0 && (
                <div className="flex flex-wrap gap-2 p-2 rounded-md border border-border bg-muted/30">
                  {options.map((option, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="gap-1 pr-1"
                    >
                      {option}
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(index)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Default Value */}
          {columnType !== 'MULTISELECT' && (
            <div className="space-y-2">
              <Label htmlFor="column-default">
                Default Value
                <span className="text-muted-foreground font-normal ml-1">
                  (optional)
                </span>
              </Label>
              {columnType === 'BOOLEAN' ? (
                <Select
                  value={defaultValue || '__none__'}
                  onValueChange={(value) => setDefaultValue(value === '__none__' ? '' : value)}
                  disabled={isPending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No default" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No default</SelectItem>
                    <SelectItem value="true">True</SelectItem>
                    <SelectItem value="false">False</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="column-default"
                  value={defaultValue}
                  onChange={(e) => setDefaultValue(e.target.value)}
                  placeholder={getDefaultPlaceholder(columnType)}
                  type={columnType === 'NUMBER' ? 'number' : 'text'}
                  disabled={isPending}
                />
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isPending}>
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isEditMode ? 'Saving...' : 'Creating...'}
                </>
              ) : isEditMode ? (
                'Save Changes'
              ) : (
                'Add Column'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Get placeholder text for default value input based on column type.
 */
function getDefaultPlaceholder(type: CmsColumnType): string {
  switch (type) {
    case 'TEXT':
      return 'Enter default text...'
    case 'NUMBER':
      return '0'
    case 'DATE':
      return 'YYYY-MM-DD'
    case 'IMAGE_URL':
      return 'https://...'
    case 'COLOR':
      return '#ffffff or transparent'
    default:
      return ''
  }
}
