/**
 * Custom Data Section Component
 *
 * WHY: Display and edit custom data fields for a lead
 * HOW: Accordion of categories, each with its fields rendered as forms
 *
 * ARCHITECTURE:
 * - Fetches all categories and responses for a lead
 * - Each category is an accordion item
 * - Fields rendered based on their type
 * - Auto-saves on field change (debounced)
 */

'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { FolderIcon, CheckIcon, Loader2, CalendarIcon } from 'lucide-react'
import { CustomDataFieldType } from '@/generated/prisma'
import { format, parseISO } from 'date-fns'

interface CustomDataSectionProps {
  organizationId: string
  leadId: string
}

interface FieldValue {
  [fieldSlug: string]: string | string[] | boolean | number | null
}

export function CustomDataSection({
  organizationId,
  leadId,
}: CustomDataSectionProps) {
  const [expandedCategories, setExpandedCategories] = useState<string[]>([])
  const [localValues, setLocalValues] = useState<Record<string, FieldValue>>({})
  const [savingCategories, setSavingCategories] = useState<Set<string>>(new Set())
  const [savedCategories, setSavedCategories] = useState<Set<string>>(new Set())
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({})
  // Keep track of pending values to save (avoids stale closure issues)
  const pendingValues = useRef<Record<string, FieldValue>>({})

  /**
   * Reset local state when leadId changes
   * WHY: Prevents stale data from previous lead being shown while new data loads
   * This is crucial for inbox where leads change frequently
   */
  useEffect(() => {
    setLocalValues({})
    setExpandedCategories([])
    setSavingCategories(new Set())
    setSavedCategories(new Set())
    pendingValues.current = {}
    // Clear any pending debounce timers
    Object.values(debounceTimers.current).forEach(clearTimeout)
    debounceTimers.current = {}
  }, [leadId])

  // Fetch categories
  const { data: categories, isLoading: categoriesLoading } =
    trpc.customData.listCategories.useQuery(
      { organizationId },
      { enabled: !!organizationId }
    )

  // Response type for the query
  interface ResponseData {
    categoryId: string
    categoryName: string
    categorySlug: string
    categoryIcon: string | null
    values: Record<string, unknown>
    version: number
    updatedAt: Date | string | null
  }

  // Fetch all responses for this lead - using type assertion to avoid deep type instantiation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: responses, isLoading: responsesLoading } = (
    trpc.customData.getResponsesForLead as any
  ).useQuery(
    { organizationId, leadId },
    { enabled: !!organizationId && !!leadId }
  ) as { data: ResponseData[] | undefined; isLoading: boolean }

  // Initialize local values from responses
  useEffect(() => {
    if (responses) {
      const values: Record<string, FieldValue> = {}
      responses.forEach((response) => {
        values[response.categoryId] = (response.values as FieldValue) || {}
      })
      setLocalValues(values)
    }
  }, [responses])

  // Save mutation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saveMutation = (trpc.customData.saveResponse as any).useMutation({
    onSuccess: (_: unknown, variables: { categoryId: string }) => {
      setSavingCategories((prev) => {
        const next = new Set(prev)
        next.delete(variables.categoryId)
        return next
      })
      setSavedCategories((prev) => new Set(prev).add(variables.categoryId))
      // Remove saved indicator after 2 seconds
      setTimeout(() => {
        setSavedCategories((prev) => {
          const next = new Set(prev)
          next.delete(variables.categoryId)
          return next
        })
      }, 2000)
    },
    onError: (err: Error, variables: { categoryId: string }) => {
      setSavingCategories((prev) => {
        const next = new Set(prev)
        next.delete(variables.categoryId)
        return next
      })
      toast.error(err.message || 'Failed to save custom data')
    },
  })

  // Handle field value change
  const handleValueChange = (
    categoryId: string,
    fieldSlug: string,
    value: string | string[] | boolean | number | null
  ) => {
    // Update local state immediately for responsive UI
    setLocalValues((prev) => {
      const newValues = {
        ...prev,
        [categoryId]: {
          ...prev[categoryId],
          [fieldSlug]: value,
        },
      }
      // Also update pending values ref (avoids stale closure in setTimeout)
      pendingValues.current[categoryId] = newValues[categoryId]
      return newValues
    })

    // Clear any existing debounce timer for this category
    if (debounceTimers.current[categoryId]) {
      clearTimeout(debounceTimers.current[categoryId])
    }

    // Set new debounce timer - longer delay (800ms) for better batching
    debounceTimers.current[categoryId] = setTimeout(() => {
      // Show saving indicator only when actually saving
      setSavingCategories((prev) => new Set(prev).add(categoryId))

      saveMutation.mutate({
        organizationId,
        leadId,
        categoryId,
        values: pendingValues.current[categoryId],
      })
    }, 800)
  }

  if (categoriesLoading || responsesLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  if (!categories || categories.length === 0) {
    return (
      <div className="flex h-full items-center justify-center py-12">
        <div className="text-center text-muted-foreground">
          <FolderIcon className="mx-auto h-10 w-10 mb-3 opacity-20" />
          <p className="text-sm font-medium">No Custom Data Categories</p>
          <p className="text-xs mt-1">
            Create categories in Custom Data settings
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <Accordion
        type="multiple"
        value={expandedCategories}
        onValueChange={setExpandedCategories}
        className="space-y-2"
      >
        {categories.map((category) => {
          const categoryResponse = responses?.find(
            (r) => r.categoryId === category.id
          )
          const isSaving = savingCategories.has(category.id)
          const isSaved = savedCategories.has(category.id)

          return (
            <AccordionItem
              key={category.id}
              value={category.id}
              className="border rounded-lg bg-background px-4"
            >
              <AccordionTrigger className="hover:no-underline py-3">
                <div className="flex items-center gap-3">
                  <FolderIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{category.name}</span>
                  {isSaving && (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                  {isSaved && !isSaving && (
                    <CheckIcon className="h-3 w-3 text-green-500" />
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-4">
                <CategoryFields
                  categoryId={category.id}
                  organizationId={organizationId}
                  values={localValues[category.id] || {}}
                  onValueChange={(fieldSlug, value) =>
                    handleValueChange(category.id, fieldSlug, value)
                  }
                />
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>
    </div>
  )
}

// Component to render fields for a category
interface CategoryFieldsProps {
  categoryId: string
  organizationId: string
  values: FieldValue
  onValueChange: (
    fieldSlug: string,
    value: string | string[] | boolean | number | null
  ) => void
}

interface FieldData {
  id: string
  slug: string
  label: string
  fieldType: string
  required: boolean
  placeholder: string | null
  helpText: string | null
  options: unknown
}

function CategoryFields({
  categoryId,
  organizationId,
  values,
  onValueChange,
}: CategoryFieldsProps) {
  // Fetch fields for this category - using type assertion to avoid deep type instantiation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: fields, isLoading } = (trpc.customData.listFields as any).useQuery(
    { organizationId, categoryId },
    { enabled: !!organizationId && !!categoryId }
  ) as { data: FieldData[] | undefined; isLoading: boolean }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  if (!fields || fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No fields in this category yet.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <FieldRenderer
          key={field.id}
          field={field}
          value={values[field.slug]}
          onChange={(value) => onValueChange(field.slug, value)}
        />
      ))}
    </div>
  )
}

// Field renderer component
interface FieldRendererProps {
  field: FieldData
  value: string | string[] | boolean | number | null | undefined
  onChange: (value: string | string[] | boolean | number | null) => void
}

function FieldRenderer({ field, value, onChange }: FieldRendererProps) {
  const fieldType = field.fieldType as CustomDataFieldType
  const options = (field.options as string[]) || []

  /**
   * Find the matching option using case-insensitive comparison.
   * This handles the case where form submissions store lowercase values
   * (e.g., "high") but the custom field options are capitalized (e.g., "High").
   *
   * Also handles snake_case to space conversion (e.g., "very_high" matches "Very High").
   */
  const findMatchingOption = (val: string | null | undefined): string => {
    if (!val) return ''
    const normalizedVal = val.toLowerCase().replace(/_/g, ' ')
    const match = options.find(
      (opt) => opt.toLowerCase() === normalizedVal || opt.toLowerCase().replace(/\s+/g, '_') === val.toLowerCase()
    )
    return match || ''
  }

  /**
   * Check if a value matches an option (case-insensitive).
   * Used for MULTISELECT to check if an option is selected.
   */
  const isOptionSelected = (selectedValues: string[], opt: string): boolean => {
    const normalizedOpt = opt.toLowerCase()
    return selectedValues.some(
      (v) => v.toLowerCase() === normalizedOpt || v.toLowerCase().replace(/_/g, ' ') === normalizedOpt
    )
  }

  const renderInput = () => {
    switch (fieldType) {
      case 'TEXT':
      case 'EMAIL':
      case 'PHONE':
      case 'URL':
        return (
          <Input
            placeholder={field.placeholder || undefined}
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
          />
        )

      case 'TEXTAREA':
        return (
          <Textarea
            placeholder={field.placeholder || undefined}
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
          />
        )

      case 'NUMBER':
      case 'CURRENCY':
        return (
          <Input
            type="number"
            placeholder={field.placeholder || undefined}
            value={(value as number) || ''}
            onChange={(e) => onChange(e.target.valueAsNumber || null)}
          />
        )

      case 'DATE':
        const dateValue = value ? (typeof value === 'string' ? parseISO(value) : undefined) : undefined
        return (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal',
                  !value && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateValue ? format(dateValue, 'PPP') : 'Pick a date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={dateValue}
                onSelect={(date) => onChange(date ? format(date, 'yyyy-MM-dd') : null)}
              />
            </PopoverContent>
          </Popover>
        )

      case 'DATETIME':
        const dateTimeValue = value ? (typeof value === 'string' ? parseISO(value) : undefined) : undefined
        const timeValue = dateTimeValue ? format(dateTimeValue, 'HH:mm') : ''
        return (
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'flex-1 justify-start text-left font-normal',
                    !value && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTimeValue ? format(dateTimeValue, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateTimeValue}
                  onSelect={(date) => {
                    if (date) {
                      const currentTime = timeValue || '00:00'
                      onChange(`${format(date, 'yyyy-MM-dd')}T${currentTime}`)
                    } else {
                      onChange(null)
                    }
                  }}
                />
              </PopoverContent>
            </Popover>
            <Input
              type="time"
              className="w-32"
              value={timeValue}
              onChange={(e) => {
                if (dateTimeValue) {
                  onChange(`${format(dateTimeValue, 'yyyy-MM-dd')}T${e.target.value}`)
                } else {
                  onChange(`${format(new Date(), 'yyyy-MM-dd')}T${e.target.value}`)
                }
              }}
            />
          </div>
        )

      case 'CHECKBOX':
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              id={field.id}
              checked={(value as boolean) || false}
              onCheckedChange={(checked) => onChange(checked as boolean)}
            />
            {field.placeholder && (
              <label
                htmlFor={field.id}
                className="text-sm text-muted-foreground cursor-pointer"
              >
                {field.placeholder}
              </label>
            )}
          </div>
        )

      case 'SELECT':
        // Use case-insensitive matching to find the correct option
        const matchedSelectValue = findMatchingOption(value as string)
        return (
          <Select
            value={matchedSelectValue}
            onValueChange={onChange}
          >
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder || 'Select...'} />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt, i) => (
                <SelectItem key={i} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )

      case 'RADIO':
        // Use case-insensitive matching to find the correct option
        const matchedRadioValue = findMatchingOption(value as string)
        return (
          <RadioGroup
            value={matchedRadioValue}
            onValueChange={onChange}
          >
            {options.map((opt, i) => (
              <div key={i} className="flex items-center space-x-2">
                <RadioGroupItem value={opt} id={`${field.id}-${i}`} />
                <Label htmlFor={`${field.id}-${i}`} className="text-sm cursor-pointer">
                  {opt}
                </Label>
              </div>
            ))}
          </RadioGroup>
        )

      case 'MULTISELECT':
        // Use case-insensitive matching for multiselect
        const selectedValues = (value as string[]) || []
        return (
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center space-x-2">
                <Checkbox
                  id={`${field.id}-${i}`}
                  checked={isOptionSelected(selectedValues, opt)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      onChange([...selectedValues, opt])
                    } else {
                      // Remove both the exact match and any case-variant matches
                      const normalizedOpt = opt.toLowerCase()
                      onChange(selectedValues.filter(
                        (v) => v.toLowerCase() !== normalizedOpt && v.toLowerCase().replace(/_/g, ' ') !== normalizedOpt
                      ))
                    }
                  }}
                />
                <Label htmlFor={`${field.id}-${i}`} className="text-sm cursor-pointer">
                  {opt}
                </Label>
              </div>
            ))}
          </div>
        )

      default:
        return (
          <Input
            placeholder={field.placeholder || undefined}
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
          />
        )
    }
  }

  return (
    <div className="space-y-2">
      <Label
        className={cn(
          field.required &&
            "after:content-['*'] after:ml-0.5 after:text-destructive"
        )}
      >
        {field.label}
      </Label>
      {renderInput()}
      {field.helpText && (
        <p className="text-xs text-muted-foreground">{field.helpText}</p>
      )}
    </div>
  )
}
