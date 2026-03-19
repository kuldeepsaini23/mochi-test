'use client'

/**
 * Chat Widget Dialog Component
 *
 * WHY: Create and edit chat widgets with a minimal form dialog
 * HOW: Uses react-hook-form with zod validation, matches store dialog pattern
 *
 * SOURCE OF TRUTH: ChatWidget
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

const chatWidgetFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional().nullable(),
})

type ChatWidgetFormValues = z.infer<typeof chatWidgetFormSchema>

// ============================================================================
// TYPES
// ============================================================================

interface ChatWidgetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  widget?: {
    id: string
    name: string
    description?: string | null
  } | null
  onSubmit: (data: ChatWidgetFormValues) => void
  isSubmitting?: boolean
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ChatWidgetDialog({
  open,
  onOpenChange,
  widget,
  onSubmit,
  isSubmitting,
}: ChatWidgetDialogProps) {
  const isEditing = !!widget

  const form = useForm<ChatWidgetFormValues>({
    resolver: zodResolver(chatWidgetFormSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  })

  // Reset form when dialog opens or widget changes
  useEffect(() => {
    if (open) {
      if (widget) {
        form.reset({
          name: widget.name,
          description: widget.description || '',
        })
      } else {
        form.reset({
          name: '',
          description: '',
        })
      }
    }
  }, [open, widget, form])

  const handleSubmit = (data: ChatWidgetFormValues) => {
    onSubmit({
      name: data.name,
      description: data.description || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Widget' : 'Create Widget'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update your chat widget details.'
              : 'Create a new chat widget for your site.'}
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
                    <Input placeholder="Customer Support" {...field} />
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
                      placeholder="A short description..."
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
                {isEditing ? 'Save' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
