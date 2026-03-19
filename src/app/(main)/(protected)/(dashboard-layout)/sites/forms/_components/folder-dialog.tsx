/**
 * Folder Dialog Component
 *
 * WHY: Create new folders for organizing forms
 * HOW: Simple name input with optional color selection
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
import { Button } from '@/components/ui/button'

// ============================================================================
// SCHEMA
// ============================================================================

const formSchema = z.object({
  name: z
    .string()
    .min(1, 'Folder name is required')
    .max(100, 'Name must be less than 100 characters'),
})

type FormValues = z.infer<typeof formSchema>

// ============================================================================
// COMPONENT
// ============================================================================

interface FolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  parentId?: string | null
}

export function FolderDialog({
  open,
  onOpenChange,
  organizationId,
  parentId,
}: FolderDialogProps) {
  const utils = trpc.useUtils()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
    },
  })

  // Create folder mutation
  const createMutation = trpc.forms.createFolder.useMutation({
    onSuccess: () => {
      toast.success('Folder created successfully')
      utils.forms.listFolders.invalidate()
      onOpenChange(false)
      form.reset()
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create folder')
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
      parentId: parentId ?? null,
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
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Create Folder</DialogTitle>
          <DialogDescription>
            Create a new folder to organize your forms.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Folder Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Marketing Forms, Contact Forms"
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
                {isSubmitting ? 'Creating...' : 'Create Folder'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
