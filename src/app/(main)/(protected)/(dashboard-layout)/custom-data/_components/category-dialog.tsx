/**
 * Data Set Dialog Component
 *
 * WHY: Create/edit custom data sets (folders)
 * HOW: Sheet with form for name, description, icon
 *
 * ARCHITECTURE:
 * - Same component handles create and edit modes
 * - Uses tRPC mutations with optimistic updates
 * - Icon picker for data set customization
 */

'use client'

import { useEffect } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { trpc } from '@/trpc/react-provider'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

// Form schema
const dataSetFormSchema = z.object({
  name: z.string().min(1, 'Data set name is required'),
  description: z.string().optional(),
  icon: z.string().optional(),
})

type DataSetFormValues = z.infer<typeof dataSetFormSchema>

// Available icons for data sets
const DATA_SET_ICONS = [
  { value: 'folder', label: 'Folder' },
  { value: 'user', label: 'User' },
  { value: 'building', label: 'Building' },
  { value: 'briefcase', label: 'Briefcase' },
  { value: 'file-text', label: 'Document' },
  { value: 'settings', label: 'Settings' },
  { value: 'tag', label: 'Tag' },
  { value: 'star', label: 'Star' },
  { value: 'heart', label: 'Heart' },
  { value: 'bookmark', label: 'Bookmark' },
  { value: 'archive', label: 'Archive' },
  { value: 'database', label: 'Database' },
]

interface DataSet {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  order: number
  fieldsCount: number
}

interface CategoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  dataSet?: DataSet | null // If provided, edit mode
  onSuccess?: () => void
}

export function CategoryDialog({
  open,
  onOpenChange,
  organizationId,
  dataSet,
  onSuccess,
}: CategoryDialogProps) {
  const isEditMode = !!dataSet
  const utils = trpc.useUtils()

  const form = useForm<DataSetFormValues>({
    resolver: zodResolver(dataSetFormSchema),
    defaultValues: {
      name: '',
      description: '',
      icon: '',
    },
  })

  // Reset form when dialog opens/closes or data set changes
  useEffect(() => {
    if (open && dataSet) {
      form.reset({
        name: dataSet.name,
        description: dataSet.description || '',
        icon: dataSet.icon || '',
      })
    } else if (open && !dataSet) {
      form.reset({
        name: '',
        description: '',
        icon: '',
      })
    }
  }, [open, dataSet, form])

  // Create mutation
  const createMutation = trpc.customData.createCategory.useMutation({
    onMutate: async (newDataSet) => {
      // Cancel outgoing refetches
      await utils.customData.listCategories.cancel({ organizationId })

      // Snapshot previous value
      const previousDataSets = utils.customData.listCategories.getData({
        organizationId,
      })

      // Optimistically update the cache
      utils.customData.listCategories.setData({ organizationId }, (old) => {
        if (!old) return old
        const now = new Date().toISOString()
        const optimisticDataSet = {
          id: `temp-${Date.now()}`,
          name: newDataSet.name,
          slug: newDataSet.name.toLowerCase().replace(/\s+/g, '-'),
          description: newDataSet.description || null,
          icon: newDataSet.icon || null,
          order: old.length,
          fieldsCount: 0,
          createdAt: now,
          updatedAt: now,
        }
        return [...old, optimisticDataSet]
      })

      return { previousDataSets }
    },
    onError: (err, _newDataSet, context) => {
      // Rollback on error
      if (context?.previousDataSets) {
        utils.customData.listCategories.setData(
          { organizationId },
          context.previousDataSets
        )
      }
      toast.error(err.message || 'Failed to create data set')
    },
    onSuccess: () => {
      toast.success('Data set created')
      onOpenChange(false)
      onSuccess?.()
    },
    onSettled: () => {
      utils.customData.listCategories.invalidate({ organizationId })
      /* Invalidate usage cache so feature gate reflects the new count */
      utils.usage.getFeatureGates.invalidate()
    },
  })

  // Update mutation
  const updateMutation = trpc.customData.updateCategory.useMutation({
    onMutate: async (updatedDataSet) => {
      // Cancel outgoing refetches
      await utils.customData.listCategories.cancel({ organizationId })

      // Snapshot previous value
      const previousDataSets = utils.customData.listCategories.getData({
        organizationId,
      })

      // Optimistically update the cache
      utils.customData.listCategories.setData({ organizationId }, (old) => {
        if (!old) return old
        return old.map((item) =>
          item.id === updatedDataSet.categoryId
            ? {
                ...item,
                name: updatedDataSet.name || item.name,
                description: updatedDataSet.description ?? item.description,
                icon: updatedDataSet.icon ?? item.icon,
              }
            : item
        )
      })

      return { previousDataSets }
    },
    onError: (err, _updatedDataSet, context) => {
      // Rollback on error
      if (context?.previousDataSets) {
        utils.customData.listCategories.setData(
          { organizationId },
          context.previousDataSets
        )
      }
      toast.error(err.message || 'Failed to update data set')
    },
    onSuccess: () => {
      toast.success('Data set updated')
      onOpenChange(false)
      onSuccess?.()
    },
    onSettled: () => {
      utils.customData.listCategories.invalidate({ organizationId })
    },
  })

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  const onSubmit = (values: DataSetFormValues) => {
    if (isEditMode && dataSet) {
      updateMutation.mutate({
        organizationId,
        categoryId: dataSet.id,
        name: values.name,
        description: values.description || null,
        icon: values.icon || null,
      })
    } else {
      createMutation.mutate({
        organizationId,
        name: values.name,
        description: values.description || null,
        icon: values.icon || null,
      })
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col border-border/40"
      >
        {/* Hidden header for accessibility */}
        <SheetHeader className="sr-only">
          <SheetTitle>
            {isEditMode ? 'Edit Data Set' : 'Create Data Set'}
          </SheetTitle>
        </SheetHeader>

        {/* Header */}
        <div className="px-6 py-5 border-b">
          <h2 className="text-lg font-semibold">
            {isEditMode ? 'Edit Data Set' : 'Create Data Set'}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isEditMode
              ? 'Update this data set'
              : 'Create a new data set to organize your custom fields'}
          </p>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Contact Information" {...field} />
                    </FormControl>
                    <FormDescription>
                      The name of this data set
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Additional contact details for the lead..."
                        className="resize-none"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Optional description to help users understand this
                      data set
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="icon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Icon</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an icon" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DATA_SET_ICONS.map((icon) => (
                          <SelectItem key={icon.value} value={icon.value}>
                            {icon.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Optional icon to display in the sidebar
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Submit button */}
              <div className="pt-4">
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isEditMode ? 'Update Data Set' : 'Create Data Set'}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
