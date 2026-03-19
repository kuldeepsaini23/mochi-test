/**
 * Field Dialog Component
 *
 * WHY: Create/edit custom data fields within a data set
 * HOW: Sheet with form for field properties and live preview
 *
 * ARCHITECTURE:
 * - Same component handles create and edit modes
 * - Live preview of field input with optional required state toggle
 * - Dynamic options for select/radio/multiselect types
 * - Conditional field properties based on field type
 * - Uses tRPC mutations
 */

'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { trpc } from '@/trpc/react-provider'
import { Loader2, Plus, X, CalendarIcon } from 'lucide-react'
import { toast } from 'sonner'
import { FIELD_TYPES, FIELD_TYPE_LIST } from '@/constants/custom-data-fields'
import { CustomDataFieldType } from '@/generated/prisma'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

// Form validation schema
const fieldFormSchema = z.object({
  label: z.string().min(1, 'Label is required'),
  fieldType: z.nativeEnum(CustomDataFieldType),
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
  options: z.array(z.string()).optional(),
})

type FieldFormValues = z.infer<typeof fieldFormSchema>

interface CustomField {
  id: string
  categoryId: string
  name: string
  label: string
  slug: string
  fieldType: string
  required: boolean
  placeholder: string | null
  helpText: string | null
  defaultValue: string | null
  validation: unknown
  options: unknown
  order: number
  createdAt: Date | string
  updatedAt: Date | string
}

interface FieldDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  categoryId: string
  field?: CustomField | null // If provided, edit mode
  onSuccess?: () => void
}

// Helper to create slug from string
function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '_')
    .replace(/^-+|-+$/g, '')
}

// Field types that support placeholder
const PLACEHOLDER_SUPPORTED_TYPES: CustomDataFieldType[] = [
  'TEXT',
  'EMAIL',
  'PHONE',
  'URL',
  'TEXTAREA',
  'NUMBER',
  'CURRENCY',
]

// Field types that support options
const OPTION_SUPPORTED_TYPES: CustomDataFieldType[] = [
  'SELECT',
  'RADIO',
  'MULTISELECT',
]

export function FieldDialog({
  open,
  onOpenChange,
  organizationId,
  categoryId,
  field,
  onSuccess,
}: FieldDialogProps) {
  const isEditMode = !!field
  const utils = trpc.useUtils()
  const [newOption, setNewOption] = useState('')
  const [previewRequired, setPreviewRequired] = useState(false)

  const form = useForm<FieldFormValues>({
    resolver: zodResolver(fieldFormSchema),
    defaultValues: {
      label: '',
      fieldType: 'TEXT' as CustomDataFieldType,
      placeholder: '',
      helpText: '',
      options: [],
    },
  })

  const watchedValues = form.watch()
  const selectedFieldType = watchedValues.fieldType
  const fieldTypeConfig = FIELD_TYPES[selectedFieldType]
  const hasOptions = OPTION_SUPPORTED_TYPES.includes(selectedFieldType)
  const hasPlaceholder = PLACEHOLDER_SUPPORTED_TYPES.includes(selectedFieldType)

  // Reset form when dialog opens/closes or field changes
  useEffect(() => {
    if (open && field) {
      const fieldOptions = field.options as string[] | null
      form.reset({
        label: field.label,
        fieldType: field.fieldType as CustomDataFieldType,
        placeholder: field.placeholder || '',
        helpText: field.helpText || '',
        options: fieldOptions || [],
      })
      setPreviewRequired(field.required)
    } else if (open && !field) {
      form.reset({
        label: '',
        fieldType: 'TEXT' as CustomDataFieldType,
        placeholder: '',
        helpText: '',
        options: [],
      })
      setPreviewRequired(false)
    }
  }, [open, field, form])

  // Create mutation with optimistic updates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createMutation = (trpc.customData.createField as any).useMutation({
    onMutate: async (newField: any) => {
      // Cancel outgoing refetches
      await utils.customData.listFields.cancel({ organizationId, categoryId })
      await utils.customData.listCategories.cancel({ organizationId })

      // Snapshot previous values
      const previousFields = utils.customData.listFields.getData({
        organizationId,
        categoryId,
      })
      const previousCategories = utils.customData.listCategories.getData({
        organizationId,
      })

      // Optimistically add the new field
      utils.customData.listFields.setData(
        { organizationId, categoryId },
        (old: any) => {
          if (!old) return old
          const optimisticField = {
            id: `temp-${Date.now()}`,
            categoryId,
            name: newField.name,
            label: newField.label,
            slug: newField.name,
            fieldType: newField.fieldType,
            required: newField.required || false,
            placeholder: newField.placeholder,
            helpText: newField.helpText,
            defaultValue: newField.defaultValue,
            validation: null,
            options: newField.options,
            order: old.length,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
          return [...old, optimisticField]
        }
      )

      // Update category fields count
      utils.customData.listCategories.setData({ organizationId }, (old: any) => {
        if (!old) return old
        return old.map((cat: any) =>
          cat.id === categoryId
            ? { ...cat, fieldsCount: cat.fieldsCount + 1 }
            : cat
        )
      })

      return { previousFields, previousCategories }
    },
    onError: (err: Error, _newField: any, context: any) => {
      // Rollback on error
      if (context?.previousFields) {
        utils.customData.listFields.setData(
          { organizationId, categoryId },
          context.previousFields
        )
      }
      if (context?.previousCategories) {
        utils.customData.listCategories.setData(
          { organizationId },
          context.previousCategories
        )
      }
      toast.error(err.message || 'Failed to create field')
    },
    onSuccess: () => {
      toast.success('Field created')
      onOpenChange(false)
      onSuccess?.()
    },
    onSettled: () => {
      utils.customData.listFields.invalidate({ organizationId, categoryId })
      utils.customData.listCategories.invalidate({ organizationId })
    },
  })

  // Update mutation with optimistic updates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateMutation = (trpc.customData.updateField as any).useMutation({
    onMutate: async (updatedField: any) => {
      // Cancel outgoing refetches
      await utils.customData.listFields.cancel({ organizationId, categoryId })

      // Snapshot previous value
      const previousFields = utils.customData.listFields.getData({
        organizationId,
        categoryId,
      })

      // Optimistically update the field
      utils.customData.listFields.setData(
        { organizationId, categoryId },
        (old: any) => {
          if (!old) return old
          return old.map((f: any) =>
            f.id === updatedField.fieldId
              ? {
                  ...f,
                  name: updatedField.name,
                  label: updatedField.label,
                  slug: updatedField.name,
                  fieldType: updatedField.fieldType,
                  required: updatedField.required || false,
                  placeholder: updatedField.placeholder,
                  helpText: updatedField.helpText,
                  options: updatedField.options,
                  updatedAt: new Date(),
                }
              : f
          )
        }
      )

      return { previousFields }
    },
    onError: (err: Error, _updatedField: any, context: any) => {
      // Rollback on error
      if (context?.previousFields) {
        utils.customData.listFields.setData(
          { organizationId, categoryId },
          context.previousFields
        )
      }
      toast.error(err.message || 'Failed to update field')
    },
    onSuccess: () => {
      toast.success('Field updated')
      onOpenChange(false)
      onSuccess?.()
    },
    onSettled: () => {
      utils.customData.listFields.invalidate({ organizationId, categoryId })
    },
  })

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  const onSubmit = (values: FieldFormValues) => {
    // Auto-generate name from label
    const name = slugify(values.label)

    const fieldData = {
      name,
      label: values.label,
      fieldType: values.fieldType,
      required: false, // Required is not controlled by user
      placeholder: hasPlaceholder && values.placeholder ? values.placeholder : null,
      helpText: values.helpText || null,
      defaultValue: null,
      options: hasOptions && values.options?.length ? values.options : null,
    }

    if (isEditMode && field) {
      updateMutation.mutate({
        organizationId,
        fieldId: field.id,
        ...fieldData,
      })
    } else {
      createMutation.mutate({
        organizationId,
        categoryId,
        ...fieldData,
      })
    }
  }

  // Handle adding options
  const addOption = () => {
    if (newOption.trim()) {
      const currentOptions = form.getValues('options') || []
      form.setValue('options', [...currentOptions, newOption.trim()])
      setNewOption('')
    }
  }

  // Handle removing options
  const removeOption = (index: number) => {
    const currentOptions = form.getValues('options') || []
    form.setValue(
      'options',
      currentOptions.filter((_, i) => i !== index)
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 flex flex-col border-border/40"
      >
        {/* Hidden header for accessibility */}
        <SheetHeader className="sr-only">
          <SheetTitle>{isEditMode ? 'Edit Field' : 'Create Field'}</SheetTitle>
        </SheetHeader>

        {/* Header */}
        <div className="px-6 py-5 border-b shrink-0">
          <h2 className="text-lg font-semibold">
            {isEditMode ? 'Edit Field' : 'Create Field'}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isEditMode
              ? 'Update this custom field'
              : 'Add a new field to this data set'}
          </p>
        </div>

        {/* Form - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Form {...form}>
            <form id="field-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Field Type */}
              <FormField
                control={form.control}
                name="fieldType"
                render={({ field: formField }) => (
                  <FormItem>
                    <FormLabel>Field Type</FormLabel>
                    <Select
                      onValueChange={formField.onChange}
                      defaultValue={formField.value}
                      value={formField.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select field type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {FIELD_TYPE_LIST.map((type) => (
                          <SelectItem key={type.type} value={type.type}>
                            <div className="flex flex-col">
                              <span>{type.label}</span>
                              <span className="text-xs text-muted-foreground">
                                {type.description}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Label */}
              <FormField
                control={form.control}
                name="label"
                render={({ field: formField }) => (
                  <FormItem>
                    <FormLabel>Label</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Email Address"
                        {...formField}
                      />
                    </FormControl>
                    <FormDescription>
                      The label shown to users when filling out this field
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Placeholder - Only show for supported types */}
              {hasPlaceholder && (
                <FormField
                  control={form.control}
                  name="placeholder"
                  render={({ field: formField }) => (
                    <FormItem>
                      <FormLabel>Placeholder</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter your email..."
                          {...formField}
                        />
                      </FormControl>
                      <FormDescription>
                        Placeholder text shown in the input
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Help Text */}
              <FormField
                control={form.control}
                name="helpText"
                render={({ field: formField }) => (
                  <FormItem>
                    <FormLabel>Help Text</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="We'll never share your email"
                        {...formField}
                      />
                    </FormControl>
                    <FormDescription>
                      Additional instructions shown below the field
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Options (for SELECT, RADIO, MULTISELECT) */}
              {hasOptions && (
                <div className="space-y-4">
                  <Label>Options</Label>
                  <div className="space-y-2">
                    {(watchedValues.options || []).map((option, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-2"
                      >
                        <span className="flex-1 text-sm">{option}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeOption(index)}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add option..."
                      value={newOption}
                      onChange={(e) => setNewOption(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addOption()
                        }
                      }}
                    />
                    <Button type="button" variant="outline" onClick={addOption}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Press Enter or click + to add an option
                  </p>
                </div>
              )}

              {/* Preview Section */}
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base">Preview</Label>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="preview-required" className="text-sm text-muted-foreground">
                      Show required
                    </Label>
                    <Switch
                      id="preview-required"
                      checked={previewRequired}
                      onCheckedChange={setPreviewRequired}
                    />
                  </div>
                </div>
                <div className="rounded-lg border bg-card p-4">
                  <FieldPreview
                    fieldType={selectedFieldType}
                    label={watchedValues.label || 'Field Label'}
                    placeholder={watchedValues.placeholder}
                    helpText={watchedValues.helpText}
                    required={previewRequired}
                    options={watchedValues.options || []}
                  />
                </div>
              </div>
            </form>
          </Form>
        </div>

        {/* Sticky Submit Button */}
        <div className="shrink-0 border-t px-6 py-4 bg-background">
          <Button
            type="submit"
            form="field-form"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {isEditMode ? 'Update Field' : 'Create Field'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// Field Preview Component
interface FieldPreviewProps {
  fieldType: CustomDataFieldType
  label: string
  placeholder?: string
  helpText?: string
  required?: boolean
  options?: string[]
}

function FieldPreview({
  fieldType,
  label,
  placeholder,
  helpText,
  required,
  options = [],
}: FieldPreviewProps) {
  const [selectedDate, setSelectedDate] = useState<Date>()

  const renderInput = () => {
    switch (fieldType) {
      case 'TEXT':
      case 'EMAIL':
      case 'PHONE':
      case 'URL':
        return (
          <Input
            placeholder={placeholder || `Enter ${label.toLowerCase()}...`}
            disabled
          />
        )

      case 'TEXTAREA':
        return (
          <Textarea
            placeholder={placeholder || `Enter ${label.toLowerCase()}...`}
            disabled
            rows={3}
          />
        )

      case 'NUMBER':
      case 'CURRENCY':
        return (
          <Input
            type="number"
            placeholder={placeholder || '0'}
            disabled
          />
        )

      case 'DATE':
        return (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal',
                  !selectedDate && 'text-muted-foreground'
                )}
                disabled
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? format(selectedDate, 'PPP') : 'Pick a date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
              />
            </PopoverContent>
          </Popover>
        )

      case 'DATETIME':
        return (
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'flex-1 justify-start text-left font-normal',
                    !selectedDate && 'text-muted-foreground'
                  )}
                  disabled
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                />
              </PopoverContent>
            </Popover>
            <Input type="time" className="w-32" disabled />
          </div>
        )

      case 'CHECKBOX':
        return (
          <div className="flex items-center space-x-2">
            <Checkbox id="preview-checkbox" disabled />
            <label
              htmlFor="preview-checkbox"
              className="text-sm text-muted-foreground"
            >
              {placeholder || 'Check this option'}
            </label>
          </div>
        )

      case 'SELECT':
        return (
          <Select disabled>
            <SelectTrigger>
              <SelectValue placeholder={placeholder || 'Select an option...'} />
            </SelectTrigger>
            <SelectContent>
              {options.length > 0 ? (
                options.map((opt, i) => (
                  <SelectItem key={i} value={opt}>
                    {opt}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="none" disabled>
                  No options defined
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        )

      case 'RADIO':
        return (
          <RadioGroup disabled>
            {options.length > 0 ? (
              options.map((opt, i) => (
                <div key={i} className="flex items-center space-x-2">
                  <RadioGroupItem value={opt} id={`preview-radio-${i}`} />
                  <Label htmlFor={`preview-radio-${i}`} className="text-sm">
                    {opt}
                  </Label>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No options defined</p>
            )}
          </RadioGroup>
        )

      case 'MULTISELECT':
        return (
          <div className="space-y-2">
            {options.length > 0 ? (
              options.map((opt, i) => (
                <div key={i} className="flex items-center space-x-2">
                  <Checkbox id={`preview-multi-${i}`} disabled />
                  <Label htmlFor={`preview-multi-${i}`} className="text-sm">
                    {opt}
                  </Label>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No options defined</p>
            )}
          </div>
        )

      default:
        return <Input placeholder={placeholder} disabled />
    }
  }

  return (
    <div className="space-y-2">
      <Label className={cn(required && "after:content-['*'] after:ml-0.5 after:text-destructive")}>
        {label}
      </Label>
      {renderInput()}
      {helpText && (
        <p className="text-xs text-muted-foreground">{helpText}</p>
      )}
      {required && (
        <p className="text-xs text-destructive">This field is required</p>
      )}
    </div>
  )
}
