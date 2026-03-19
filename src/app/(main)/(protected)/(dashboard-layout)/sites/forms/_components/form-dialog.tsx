/**
 * Form Dialog Component
 *
 * WHY: Create new forms with name and optional description
 * HOW: Uses shadcn dialog with form validation
 *
 * Simple form creation - just name and description.
 * The form builder will handle all the field configuration.
 *
 * FEATURE GATE: Server-side errors show upgrade modal instead of toast
 */

'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'

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

const formSchema = z.object({
  name: z
    .string()
    .min(1, 'Form name is required')
    .max(100, 'Name must be less than 100 characters'),
  description: z.string().max(500).optional(),
})

type FormValues = z.infer<typeof formSchema>

// ============================================================================
// COMPONENT
// ============================================================================

interface FormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  folderId?: string | null
}

export function FormDialog({
  open,
  onOpenChange,
  organizationId,
  folderId,
}: FormDialogProps) {
  const utils = trpc.useUtils()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  })

  // Create form mutation
  // NOTE: Feature gates cache is auto-invalidated by global mutation observer
  const createMutation = trpc.forms.create.useMutation({
    onSuccess: () => {
      toast.success('Form created successfully')
      utils.forms.list.invalidate()
      onOpenChange(false)
      form.reset()
    },
    onError: (error) => {
      /**
       * Server-side feature limit errors are caught here as a fallback.
       * The parent already wraps the create button with <FeatureGate> for
       * client-side pre-checks, so this only fires if the gate was bypassed.
       */
      toast.error(error.message || 'Failed to create form')
    },
    onSettled: () => {
      setIsSubmitting(false)
    },
  })

  const onSubmit = (values: FormValues) => {
    setIsSubmitting(true)
    createMutation.mutate({
      organizationId,
      name: values.name,
      description: values.description || null,
      folderId: folderId ?? null,
    })
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      form.reset()
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Form</DialogTitle>
          <DialogDescription>
            Create a new form. You can configure fields and settings in the form
            builder.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Contact Form, Feedback Survey"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description for internal reference"
                      className="resize-none"
                      rows={3}
                      {...field}
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
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create Form'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
