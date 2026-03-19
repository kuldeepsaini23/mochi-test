/**
 * ============================================================================
 * FORM BUILDER PAGE
 * ============================================================================
 *
 * Server component page for the form builder.
 * Loads form data by slug and renders the FormBuilder component.
 *
 * ROUTE: /forms/[slug]/edit
 *
 * ARCHITECTURE:
 * - Server component prefetches form data
 * - Passes data to client FormBuilderWrapper component
 * - FormBuilderWrapper handles save mutations via tRPC
 */

import { notFound } from 'next/navigation'
import { getQueryClient, trpc } from '@/trpc/server'
import { HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { handleAuthError } from '@/lib/errors'
import { FormBuilderWrapper } from './_components/form-builder-wrapper'
import type { FormSchema, FormStatus } from '@/components/form-builder'
import { DEFAULT_FORM_SCHEMA } from '@/components/form-builder'

// ============================================================================
// TYPES
// ============================================================================

interface FormBuilderPageProps {
  params: Promise<{
    slug: string
  }>
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default async function FormBuilderPage({ params }: FormBuilderPageProps) {
  const { slug } = await params
  const queryClient = getQueryClient()

  // Get active organization from cached data
  // Uses getActiveOrganization which respects domain-first approach
  const activeOrg = await queryClient
    .fetchQuery(trpc.organization.getActiveOrganization.queryOptions())
    .catch(handleAuthError)

  if (!activeOrg) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">
          No organization found. Please contact your administrator.
        </p>
      </div>
    )
  }

  // Fetch form data by slug
  let formSchema: FormSchema = DEFAULT_FORM_SCHEMA
  let formId: string | undefined
  let formName: string = 'New Form'
  let formStatus: FormStatus = 'DRAFT'

  try {
    const form = await queryClient.fetchQuery(
      trpc.forms.getBySlug.queryOptions({
        organizationId: activeOrg.id,
        slug,
      })
    )

    if (form) {
      formId = form.id
      formName = form.name
      formStatus = form.status

      // Parse the config if it exists, otherwise use default schema
      // Config is stored as JSON in the database
      // Access config through bracket notation to avoid Prisma's deeply recursive Json type
      const rawConfig = (form as { config?: unknown })['config'] as Record<string, unknown> | null

      if (rawConfig && typeof rawConfig === 'object') {
        // Validate that it has the required fields before using
        const config = rawConfig as Record<string, unknown>
        if (config.version && config.elements && config.styles && config.settings) {
          formSchema = config as unknown as FormSchema

          // Ensure title is set from form name if not present in schema
          if (!formSchema.title) {
            formSchema = { ...formSchema, title: form.name }
          }
        } else {
          // Config exists but is invalid, use default with form name
          formSchema = { ...DEFAULT_FORM_SCHEMA, title: form.name }
        }
      } else {
        // No config yet, use default schema but set the title
        formSchema = { ...DEFAULT_FORM_SCHEMA, title: form.name }
      }
    }
  } catch (error) {
    // If form not found, return 404
    notFound()
  }

  if (!formId) {
    notFound()
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <FormBuilderWrapper
        organizationId={activeOrg.id}
        formId={formId}
        formSlug={slug}
        initialSchema={formSchema}
        initialStatus={formStatus}
      />
    </HydrationBoundary>
  )
}
