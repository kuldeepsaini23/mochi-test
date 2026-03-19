/**
 * Automation Dialog Component
 *
 * WHY: Create new automations with just name and description
 * HOW: Uses shadcn dialog with form validation, then redirects to builder
 *
 * The dialog collects basic info, creates the automation in the database,
 * and redirects to the automation builder where user can configure the trigger
 * and full workflow.
 *
 * SOURCE OF TRUTH: Automation
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { trackEvent, CLARITY_EVENTS } from '@/lib/clarity/events'

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
    .min(1, 'Automation name is required')
    .max(100, 'Name must be less than 100 characters'),
  description: z.string().max(500).optional(),
})

type FormValues = z.infer<typeof formSchema>

// ============================================================================
// COMPONENT
// ============================================================================

interface AutomationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  /** Optional folder ID to assign the automation to */
  folderId?: string | null
}

export function AutomationDialog({
  open,
  onOpenChange,
  organizationId,
  folderId,
}: AutomationDialogProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  })

  const utils = trpc.useUtils()

  /**
   * Create automation mutation.
   * Sets a default trigger type (FORM_SUBMITTED) which can be changed in the builder.
   * On success, invalidate the list cache so the automations page has fresh data,
   * then redirect to the automation builder using the slug.
   */
  const createMutation = trpc.automation.create.useMutation({
    onSuccess: (automation) => {
      trackEvent(CLARITY_EVENTS.AUTOMATION_CREATED)
      toast.success('Automation created')
      onOpenChange(false)
      form.reset()
      // Invalidate so the automations list is fresh when user navigates back
      utils.automation.list.invalidate()
      utils.automation.listFolders.invalidate()
      // Redirect to automation builder using slug for URL-friendly routing (falls back to ID)
      const identifier = automation.slug ?? automation.id
      router.push(`/automations/${identifier}/edit`)
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create automation')
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
      description: values.description || undefined,
      // Default trigger type - user will configure in builder
      triggerType: 'FORM_SUBMITTED',
      // Assign to current folder if specified
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
          <DialogTitle>Create Automation</DialogTitle>
          <DialogDescription>
            Give your automation a name. You&apos;ll configure the trigger and
            actions in the builder.
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
                      placeholder="e.g., Welcome Email Sequence"
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
                      rows={2}
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
                {isSubmitting ? 'Creating...' : 'Create Automation'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
