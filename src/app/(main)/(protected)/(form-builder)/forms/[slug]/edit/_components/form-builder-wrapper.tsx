/**
 * ============================================================================
 * FORM BUILDER WRAPPER
 * ============================================================================
 *
 * Client component wrapper for the FormBuilder.
 * Handles save mutations via tRPC and passes the save function to FormBuilder.
 *
 * WHY THIS EXISTS:
 * - FormBuilder is a pure UI component that doesn't know about tRPC
 * - This wrapper connects the UI to the data layer
 * - Separation of concerns: UI logic vs data fetching
 *
 * SAVE FLOW:
 * 1. User makes changes in FormBuilder
 * 2. Auto-save or manual save triggers onSave callback
 * 3. This wrapper calls tRPC mutation to update the form
 * 4. FormBuilder's dirty state is reset on success
 */

'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FormBuilder } from '@/components/form-builder'
import type { FormSchema, FormStatus } from '@/components/form-builder'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'

// ============================================================================
// TYPES
// ============================================================================

interface FormBuilderWrapperProps {
  organizationId: string
  formId: string
  formSlug: string
  initialSchema: FormSchema
  initialStatus: FormStatus
}

// ============================================================================
// COMPONENT
// ============================================================================

export function FormBuilderWrapper({
  organizationId,
  formId,
  formSlug,
  initialSchema,
  initialStatus,
}: FormBuilderWrapperProps) {
  const router = useRouter()

  // tRPC utils for cache invalidation
  const utils = trpc.useUtils()

  // Track current form status locally for optimistic updates
  const [formStatus, setFormStatus] = useState<FormStatus>(initialStatus)

  // Track current slug locally for optimistic URL updates
  const [currentSlug, setCurrentSlug] = useState(formSlug)

  // tRPC mutation for updating the form
  const updateFormMutation = trpc.forms.update.useMutation({
    onSuccess: () => {
      // Invalidate forms list cache so changes appear when navigating back
      utils.forms.list.invalidate()
      // Silent success for auto-save, toast for manual save is handled in FormBuilder
    },
    onError: (error: { message: string }) => {
      toast.error('Failed to save form', {
        description: error.message,
      })
    },
  })

  // tRPC mutation for publishing/unpublishing the form
  // Type assertion to avoid deep type instantiation error from Prisma types
  const publishFormMutation = (trpc.forms.update as any).useMutation({
    onSuccess: (_: unknown, variables: { status?: FormStatus }) => {
      // Invalidate forms list cache so status changes appear when navigating back
      utils.forms.list.invalidate()

      // Update local state on success
      if (variables.status) {
        setFormStatus(variables.status as FormStatus)
        const isPublishing = variables.status === 'PUBLISHED'
        toast.success(isPublishing ? 'Form published' : 'Form unpublished', {
          description: isPublishing
            ? 'Your form is now live and accepting submissions.'
            : 'Your form is now private and no longer accepting submissions.',
        })
      }
    },
    onError: (error: { message: string }) => {
      toast.error('Failed to update form status', {
        description: error.message,
      })
    },
  })

  // tRPC mutation for updating the form slug
  // Type assertion to avoid deep type instantiation error from Prisma types
  const updateSlugMutation = (trpc.forms.update as any).useMutation({
    onSuccess: (_: unknown, variables: { slug?: string }) => {
      // Invalidate forms list cache so slug changes appear when navigating back
      // This prevents 404 errors when clicking old cached links
      utils.forms.list.invalidate()

      // Update local slug state on success
      if (variables.slug) {
        setCurrentSlug(variables.slug)
        toast.success('URL updated', {
          description: `Your form is now available at /f/${variables.slug}`,
        })
        // Optimistically update the browser URL without a full page reload
        router.replace(`/forms/${variables.slug}/edit`, { scroll: false })
      }
    },
    onError: (error: { message: string }) => {
      toast.error('Failed to update URL', {
        description: error.message,
      })
    },
  })

  /**
   * Save handler passed to FormBuilder.
   * Calls tRPC mutation to persist the form schema.
   *
   * NOTE: This saves the entire schema including:
   * - title (synced to form name)
   * - elements (form fields)
   * - styles (form appearance)
   * - settings (form behavior)
   */
  const handleSave = useCallback(
    async (schema: FormSchema) => {
      await updateFormMutation.mutateAsync({
        organizationId,
        formId,
        // Sync the schema title to the form name
        name: schema.title,
        // Store the full schema in the config JSON field
        config: schema,
      })
    },
    [organizationId, formId, updateFormMutation]
  )

  /**
   * Publish handler passed to FormBuilder.
   * Changes the form status between PUBLISHED and DRAFT.
   *
   * PUBLISHED: Form is live and accepting submissions at public URL
   * DRAFT: Form is private and only visible in the editor
   */
  const handlePublish = useCallback(
    async (status: FormStatus) => {
      await publishFormMutation.mutateAsync({
        organizationId,
        formId,
        status,
      })
    },
    [organizationId, formId, publishFormMutation]
  )

  /**
   * Slug change handler passed to FormBuilder.
   * Updates the form slug and optimistically updates the browser URL.
   *
   * WHY OPTIMISTIC URL UPDATE:
   * - User stays in the editor without a full page reload
   * - Browser history is updated so back button works correctly
   * - If mutation fails, user is notified but stays on current page
   */
  const handleSlugChange = useCallback(
    async (newSlug: string) => {
      await updateSlugMutation.mutateAsync({
        organizationId,
        formId,
        slug: newSlug,
      })
    },
    [organizationId, formId, updateSlugMutation]
  )

  return (
    <FormBuilder
      organizationId={organizationId}
      formId={formId}
      formSlug={currentSlug}
      initialSchema={initialSchema}
      formStatus={formStatus}
      onSave={handleSave}
      onPublish={handlePublish}
      onSlugChange={handleSlugChange}
    />
  )
}
