/**
 * ============================================================================
 * CMS FIELD RENDERERS - Shared Type-Aware Form Fields for CMS
 * ============================================================================
 *
 * SOURCE OF TRUTH for all CMS field rendering components.
 * Used by CmsRowSheet (and any future CMS form surfaces).
 *
 * Each column type maps to a specialized input:
 * - TEXT → Textarea (multi-line)
 * - NUMBER → Number input
 * - BOOLEAN → Switch toggle
 * - MULTISELECT → Tag selector with dropdown
 * - DATE → Calendar popover
 * - IMAGE_URL → Storage browser or URL input with preview
 * - COLOR → GradientControl (solid + gradient support)
 * - RICH_TEXT → RichTextEditor (formatted text with headings, lists, etc.)
 * - DATE_CREATED / DATE_UPDATED → System-managed, not editable
 *
 * SOURCE OF TRUTH KEYWORDS: CmsFieldRenderer, CmsColorValue, FieldRenderer
 * ============================================================================
 */

'use client'

import { useState, useCallback } from 'react'
import { X, ImageIcon, CalendarIcon, FolderOpen, Link, Plus, Images } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { format } from 'date-fns'
import { ColumnTypeIcon } from './column-type-icon'
import { cn } from '@/lib/utils'
import type { CmsColumn } from './types'
import { StorageBrowserModal } from '@/components/storage-browser/storage-browser-modal'
import type { SelectedFile } from '@/components/storage-browser/types'
import type { GradientConfig } from '../../_lib/types'
import { gradientConfigToCSS } from '../../_lib/gradient-utils'
import { GradientControl } from '../properties-panel/controls/gradient-control'
import { RichTextEditor } from '@/components/editor'

// ============================================================================
// CMS COLOR VALUE TYPE
// ============================================================================

/**
 * Color value stored in CMS COLOR columns.
 * Supports both solid colors and gradients, matching the website builder.
 *
 * SOURCE OF TRUTH: CmsColorValue
 */
export interface CmsColorValue {
  /** Solid color value (hex or 'transparent') */
  color: string
  /** Optional gradient configuration */
  gradient?: GradientConfig
}

/**
 * Parse a stored CMS color value into CmsColorValue format.
 * Handles backwards compatibility with plain string values.
 */
export function parseCmsColorValue(value: unknown): CmsColorValue {
  if (value === null || value === undefined) {
    return { color: 'transparent' }
  }
  if (typeof value === 'string') {
    return { color: value || 'transparent' }
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return {
      color: (obj.color as string) || 'transparent',
      gradient: obj.gradient as GradientConfig | undefined,
    }
  }
  return { color: 'transparent' }
}

// ============================================================================
// FIELD RENDERER - Main Type-Aware Form Field
// ============================================================================

export interface FieldRendererProps {
  /** Column definition determining the input type */
  column: CmsColumn
  /** Current value for this field */
  value: unknown
  /** Callback when value changes */
  onChange: (value: unknown) => void
  /** Whether the input is disabled (e.g. during save) */
  disabled: boolean
  /** Organization ID for storage browser in image fields */
  organizationId: string
}

/**
 * Renders the appropriate labeled input for a CMS column type.
 * Shows column icon, name, and required indicator above the input.
 */
export function FieldRenderer({ column, value, onChange, disabled, organizationId }: FieldRendererProps) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <ColumnTypeIcon type={column.columnType} className="w-4 h-4" />
        <span>{column.name}</span>
        {column.required && <span className="text-destructive">*</span>}
      </Label>

      {renderInput(column, value, onChange, disabled, organizationId)}
    </div>
  )
}

/**
 * Render the appropriate input component based on column type.
 * Delegates to specialized sub-components for complex types.
 */
function renderInput(
  column: CmsColumn,
  value: unknown,
  onChange: (value: unknown) => void,
  disabled: boolean,
  organizationId: string
) {
  switch (column.columnType) {
    case 'TEXT':
      return (
        <Textarea
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter ${column.name.toLowerCase()}...`}
          disabled={disabled}
          rows={3}
        />
      )

    case 'NUMBER':
      return (
        <Input
          type="number"
          value={(value as number) ?? ''}
          onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : '')}
          placeholder="0"
          disabled={disabled}
        />
      )

    case 'BOOLEAN':
      return (
        <div className="flex items-center gap-2">
          <Switch
            checked={!!value}
            onCheckedChange={onChange}
            disabled={disabled}
          />
          <span className="text-sm text-muted-foreground">
            {value ? 'Yes' : 'No'}
          </span>
        </div>
      )

    case 'MULTISELECT':
      return (
        <MultiselectInput
          value={(value as string[]) ?? []}
          onChange={onChange}
          options={Array.isArray(column.options) ? column.options as string[] : []}
          disabled={disabled}
        />
      )

    case 'DATE':
      return (
        <DatePickerInput
          value={(value as string) ?? ''}
          onChange={onChange}
          disabled={disabled}
        />
      )

    case 'IMAGE_URL':
      return (
        <ImageUrlInput
          value={(value as string) ?? ''}
          onChange={onChange}
          disabled={disabled}
          organizationId={organizationId}
        />
      )

    case 'GALLERY':
      return (
        <GalleryInput
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          disabled={disabled}
          organizationId={organizationId}
        />
      )

    case 'COLOR':
      return (
        <ColorPickerField
          value={parseCmsColorValue(value)}
          onChange={onChange}
          disabled={disabled}
        />
      )

    case 'RICH_TEXT':
      return (
        <div className="min-h-[200px] border border-input rounded-md">
          <RichTextEditor
            initialContent={(value as string) || ''}
            onChange={(content: string) => onChange(content)}
            variant="standard"
            readOnly={disabled}
            placeholder="Write your content..."
            className="p-3"
            organizationId={organizationId}
          />
        </div>
      )

    default:
      return (
        <Input
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter ${column.name.toLowerCase()}...`}
          disabled={disabled}
        />
      )
  }
}

// ============================================================================
// MULTISELECT INPUT - Tag selector from predefined options
// ============================================================================

interface MultiselectInputProps {
  value: string[]
  onChange: (value: string[]) => void
  options: string[]
  disabled: boolean
}

/**
 * Multi-select input with tag display and dropdown.
 * Selected tags shown as badges above the selector.
 */
function MultiselectInput({ value, onChange, options, disabled }: MultiselectInputProps) {
  const [isOpen, setIsOpen] = useState(false)

  /** Toggle an option on/off in the selection */
  const toggleOption = (option: string) => {
    if (value.includes(option)) {
      onChange(value.filter((v) => v !== option))
    } else {
      onChange([...value, option])
    }
  }

  /** Remove a specific tag from the selection */
  const removeOption = (option: string) => {
    onChange(value.filter((v) => v !== option))
  }

  return (
    <div className="space-y-2">
      {/* Selected tags displayed as removable badges */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                onClick={() => removeOption(tag)}
                className="ml-1 hover:text-destructive"
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Options selector dropdown */}
      <Select
        open={isOpen}
        onOpenChange={setIsOpen}
        value=""
        onValueChange={(val) => {
          toggleOption(val)
          setIsOpen(false)
        }}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select options..." />
        </SelectTrigger>
        <SelectContent>
          {options.length === 0 ? (
            <div className="p-2 text-sm text-muted-foreground text-center">
              No options defined
            </div>
          ) : (
            options.map((option) => (
              <SelectItem
                key={option}
                value={option}
                className={cn(
                  value.includes(option) && 'bg-primary/10'
                )}
              >
                <div className="flex items-center gap-2">
                  {value.includes(option) && (
                    <span className="text-primary">✓</span>
                  )}
                  {option}
                </div>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  )
}

// ============================================================================
// IMAGE URL INPUT - Storage browser or URL input with preview
// ============================================================================

/**
 * Source type for image input
 * - storage: Select from the organization's media storage
 * - url: Paste an external URL
 */
type ImageSourceType = 'storage' | 'url'

interface ImageUrlInputProps {
  value: string
  onChange: (value: string) => void
  disabled: boolean
  /** Organization ID for storage browser access */
  organizationId: string
}

/**
 * Image input with storage browser or URL input and live preview.
 * Allows users to select images from their media storage or paste external URLs.
 */
function ImageUrlInput({ value, onChange, disabled, organizationId }: ImageUrlInputProps) {
  const [showPreview, setShowPreview] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [sourceType, setSourceType] = useState<ImageSourceType>('storage')
  const [isStorageOpen, setIsStorageOpen] = useState(false)
  const [urlInput, setUrlInput] = useState(value)

  const isValidUrl = value && value.startsWith('http')

  /** Handle file selection from storage browser */
  const handleStorageSelect = (file: SelectedFile) => {
    const imageUrl = file.accessUrl || file.publicUrl || ''
    onChange(imageUrl)
    setIsStorageOpen(false)
    setHasError(false)
    setShowPreview(true)
  }

  /** Apply the typed URL value */
  const handleUrlApply = () => {
    onChange(urlInput)
    setHasError(false)
    setShowPreview(true)
  }

  return (
    <div className="space-y-2">
      {/* Source type dropdown (Storage vs URL) */}
      <div className="relative">
        <select
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value as ImageSourceType)}
          disabled={disabled}
          className={cn(
            'w-full h-8 px-3 pr-8 text-sm rounded-md',
            'bg-muted/50 border border-border',
            'focus:outline-none focus:ring-1 focus:ring-primary',
            'appearance-none cursor-pointer',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <option value="storage">From Storage</option>
          <option value="url">From URL</option>
        </select>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Source-specific UI */}
      {sourceType === 'storage' ? (
        <button
          type="button"
          onClick={() => setIsStorageOpen(true)}
          disabled={disabled}
          className={cn(
            'w-full py-2.5 px-4 rounded-lg',
            'border-2 border-dashed border-border',
            'hover:border-primary/50 hover:bg-primary/5',
            'transition-all duration-200',
            'flex items-center justify-center gap-2',
            'text-sm text-muted-foreground hover:text-foreground',
            disabled && 'opacity-50 cursor-not-allowed hover:border-border hover:bg-transparent'
          )}
        >
          <FolderOpen className="w-4 h-4" />
          <span>Open Media Bucket</span>
        </button>
      ) : (
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            <Link className="w-4 h-4 text-muted-foreground" />
          </div>
          <Input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onBlur={handleUrlApply}
            onKeyDown={(e) => e.key === 'Enter' && handleUrlApply()}
            placeholder="https://example.com/image.jpg"
            disabled={disabled}
            className="pl-9"
          />
        </div>
      )}

      {/* Image preview thumbnail */}
      {isValidUrl && showPreview && !hasError && (
        <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-muted border">
          <img
            src={value}
            alt="Preview"
            className="w-full h-full object-cover"
            onError={() => setHasError(true)}
          />
        </div>
      )}

      {hasError && (
        <div className="flex items-center gap-2 text-xs text-amber-600">
          <ImageIcon className="w-4 h-4" />
          <span>Could not load image preview</span>
        </div>
      )}

      {/* Storage Browser Modal for selecting from media bucket */}
      <StorageBrowserModal
        open={isStorageOpen}
        onOpenChange={setIsStorageOpen}
        organizationId={organizationId}
        mode="select"
        fileFilter="image"
        title="Select Image"
        subtitle="Choose an image from your storage"
        onSelect={(file) => handleStorageSelect(file as SelectedFile)}
      />
    </div>
  )
}

// ============================================================================
// GALLERY INPUT - Multiple image selection with grid display
// ============================================================================

interface GalleryInputProps {
  /** Array of image URLs currently in the gallery */
  value: string[]
  /** Called with updated array when images are added or removed */
  onChange: (value: string[]) => void
  /** Whether the input is disabled (e.g. during save) */
  disabled: boolean
  /** Organization ID for storage browser access */
  organizationId: string
}

/**
 * Gallery input for selecting and managing multiple images.
 * Uses StorageBrowserModal in multi-select mode to pick images from storage.
 * Displays selected images in a thumbnail grid with individual remove buttons.
 */
function GalleryInput({ value, onChange, disabled, organizationId }: GalleryInputProps) {
  const [isStorageOpen, setIsStorageOpen] = useState(false)

  /** Handle multi-file selection from storage browser — appends new images to existing list */
  const handleStorageConfirm = (files: SelectedFile[]) => {
    const newUrls = files
      .map((file) => file.accessUrl || file.publicUrl || '')
      .filter((url) => url.length > 0)
    onChange([...value, ...newUrls])
    setIsStorageOpen(false)
  }

  /** Remove a single image from the gallery by index */
  const handleRemove = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      {/* Thumbnail grid showing all selected images */}
      {value.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {value.map((url, index) => (
            <div
              key={`${url}-${index}`}
              className="relative group aspect-square rounded-lg overflow-hidden bg-muted border border-border/30"
            >
              <img
                src={url}
                alt={`Gallery image ${index + 1}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
              {/* Remove button — visible on hover */}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add images button — opens storage browser in multi-select mode */}
      <button
        type="button"
        onClick={() => setIsStorageOpen(true)}
        disabled={disabled}
        className={cn(
          'w-full py-2.5 px-4 rounded-lg',
          'border-2 border-dashed border-border',
          'hover:border-primary/50 hover:bg-primary/5',
          'transition-all duration-200',
          'flex items-center justify-center gap-2',
          'text-sm text-muted-foreground hover:text-foreground',
          disabled && 'opacity-50 cursor-not-allowed hover:border-border hover:bg-transparent'
        )}
      >
        <Plus className="w-4 h-4" />
        <span>{value.length > 0 ? 'Add More Images' : 'Add Images'}</span>
      </button>

      {/* Image count summary */}
      {value.length > 0 && (
        <p className="text-xs text-muted-foreground/60">
          {value.length} image{value.length !== 1 ? 's' : ''} selected
        </p>
      )}

      {/* Storage Browser Modal in multi-select mode */}
      <StorageBrowserModal
        open={isStorageOpen}
        onOpenChange={setIsStorageOpen}
        organizationId={organizationId}
        mode="multi-select"
        fileFilter="image"
        title="Select Images"
        subtitle="Choose multiple images for the gallery"
        onConfirm={(files) => handleStorageConfirm(files as SelectedFile[])}
      />
    </div>
  )
}

// ============================================================================
// DATE PICKER INPUT - Calendar-based date selection
// ============================================================================

interface DatePickerInputProps {
  value: string
  onChange: (value: string) => void
  disabled: boolean
}

/**
 * Date picker input using shadcn Calendar + Popover.
 * Stores dates as YYYY-MM-DD strings and parses with local timezone
 * to avoid off-by-one day issues from UTC conversion.
 */
function DatePickerInput({ value, onChange, disabled }: DatePickerInputProps) {
  const [isOpen, setIsOpen] = useState(false)

  /**
   * Parse date string as local time to avoid timezone offset issues.
   * Native Date parsing treats YYYY-MM-DD as UTC midnight which can
   * shift the displayed date by one day in negative UTC offsets.
   */
  const selectedDate = value ? new Date(value + 'T00:00:00') : undefined

  /** Handle date selection - formats as YYYY-MM-DD for storage */
  const handleSelect = (date: Date | undefined) => {
    if (date) {
      const dateStr = format(date, 'yyyy-MM-dd')
      onChange(dateStr)
    } else {
      onChange('')
    }
    setIsOpen(false)
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            'w-full justify-start text-left font-normal',
            !value && 'text-muted-foreground'
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(selectedDate!, 'PPP') : 'Pick a date'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}

// ============================================================================
// COLOR PICKER FIELD - Solid color + gradient selection
// ============================================================================

interface ColorPickerFieldProps {
  /** Current color value with optional gradient */
  value: CmsColorValue
  /** Called when color/gradient changes */
  onChange: (value: CmsColorValue) => void
  /** Whether the field is disabled */
  disabled: boolean
}

/**
 * Color picker field using GradientControl from the website builder.
 * Supports both solid colors and gradients with:
 * - Toggle between Solid and Gradient fill modes
 * - Gradient type selection (Linear / Radial)
 * - Visual gradient stop bar for managing color stops
 * - Angle control for linear gradients
 */
function ColorPickerField({ value, onChange, disabled }: ColorPickerFieldProps) {
  /** Generate CSS for the preview swatch */
  const previewCSS = value.gradient
    ? gradientConfigToCSS(value.gradient)
    : value.color

  const isTransparent = !value.gradient && (value.color === 'transparent' || value.color === '')

  /** Handle solid color change - clears gradient */
  const handleSolidColorChange = useCallback((color: string) => {
    onChange({ color, gradient: undefined })
  }, [onChange])

  /** Handle gradient change - preserves current solid color */
  const handleGradientChange = useCallback((gradient: GradientConfig | undefined) => {
    onChange({ color: value.color, gradient })
  }, [onChange, value.color])

  return (
    <div className={cn(
      'w-full rounded-md border border-input bg-background p-3',
      disabled && 'opacity-50 pointer-events-none'
    )}>
      {/* Preview swatch with label */}
      <div className="flex items-center gap-3 mb-3">
        {isTransparent ? (
          <div className="w-8 h-8 rounded border border-border/50 bg-white relative overflow-hidden flex-shrink-0">
            <div className="absolute inset-0">
              <div
                className="absolute bg-destructive"
                style={{
                  width: '141%',
                  height: '2px',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%) rotate(45deg)',
                }}
              />
            </div>
          </div>
        ) : (
          <div
            className="w-8 h-8 rounded border border-border/50 flex-shrink-0"
            style={{ background: previewCSS }}
          />
        )}
        <span className="text-sm text-muted-foreground font-mono">
          {value.gradient
            ? `${value.gradient.type === 'radial' ? 'Radial' : 'Linear'} Gradient`
            : isTransparent
            ? 'None (transparent)'
            : value.color.toUpperCase()}
        </span>
      </div>

      {/* GradientControl from the website builder */}
      <GradientControl
        label="Fill"
        solidColor={value.color}
        gradient={value.gradient}
        onSolidColorChange={handleSolidColorChange}
        onGradientChange={handleGradientChange}
      />
    </div>
  )
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get the default value for a column based on its type and default setting.
 * Used when creating new rows or initializing empty fields.
 */
export function getDefaultValue(column: CmsColumn): unknown {
  // If column has a defined default, parse it based on type
  if (column.defaultValue !== null && column.defaultValue !== '') {
    switch (column.columnType) {
      case 'NUMBER':
        return parseFloat(column.defaultValue) || 0
      case 'BOOLEAN':
        return column.defaultValue === 'true'
      case 'MULTISELECT':
        try {
          return JSON.parse(column.defaultValue)
        } catch {
          return []
        }
      default:
        return column.defaultValue
    }
  }

  // Type-specific defaults when no default is configured
  switch (column.columnType) {
    case 'BOOLEAN':
      return false
    case 'MULTISELECT':
      return []
    case 'GALLERY':
      return []
    case 'NUMBER':
      return ''
    case 'COLOR':
      return { color: 'transparent' }
    case 'RICH_TEXT':
      return ''
    default:
      return ''
  }
}
