'use client'

/**
 * Store Dialog Component
 *
 * WHY: Create and edit stores with a minimal dialog
 * HOW: Uses react-hook-form with zod validation
 *
 * Features:
 * - Create new store
 * - Edit existing store
 * - Image URL field (optional)
 * - Loading state during submission
 *
 * SOURCE OF TRUTH: Store, Ecommerce
 */

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

// ============================================================================
// SCHEMA
// ============================================================================

const storeFormSchema = z.object({
  name: z.string().min(1, 'Store name is required'),
  description: z.string().optional().nullable(),
  imageUrl: z.string().url('Must be a valid URL').optional().nullable().or(z.literal('')),
})

type StoreFormValues = z.infer<typeof storeFormSchema>

// ============================================================================
// TYPES
// ============================================================================

interface StoreDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  store?: {
    id: string
    name: string
    description?: string | null
    imageUrl?: string | null
  } | null
  onSubmit: (data: StoreFormValues) => void
  isSubmitting?: boolean
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function StoreDialog({
  open,
  onOpenChange,
  store,
  onSubmit,
  isSubmitting,
}: StoreDialogProps) {
  const isEditing = !!store

  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeFormSchema),
    defaultValues: {
      name: '',
      description: '',
      imageUrl: '',
    },
  })

  // Reset form when dialog opens or store changes
  useEffect(() => {
    if (open) {
      if (store) {
        form.reset({
          name: store.name,
          description: store.description || '',
          imageUrl: store.imageUrl || '',
        })
      } else {
        form.reset({
          name: '',
          description: '',
          imageUrl: '',
        })
      }
    }
  }, [open, store, form])

  const handleSubmit = (data: StoreFormValues) => {
    // Convert empty strings to null
    onSubmit({
      name: data.name,
      description: data.description || null,
      imageUrl: data.imageUrl || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Store' : 'Create Store'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update your store details.'
              : 'Create a new store to organize your products.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Name Field */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="My Store" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description Field */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="A short description of your store..."
                      className="resize-none"
                      rows={3}
                      {...field}
                      value={field.value || ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Image URL Field */}
            <FormField
              control={form.control}
              name="imageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Image URL (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://example.com/image.jpg"
                      {...field}
                      value={field.value || ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="size-4 mr-2 animate-spin" />}
                {isEditing ? 'Save Changes' : 'Create Store'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
