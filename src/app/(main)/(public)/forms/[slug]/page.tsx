/**
 * ============================================================================
 * PUBLIC FORM PAGE
 * ============================================================================
 *
 * Public route for viewing and submitting forms.
 * No authentication required.
 *
 * ROUTE: /forms/[slug] (public, no auth required)
 *
 * URL PATTERN:
 * - /forms/my-form     → Public view (this page)
 * - /forms/my-form/edit → Edit mode (protected, opens form builder)
 *
 * FEATURES:
 * - Displays published forms only (draft/paused/archived not shown)
 * - Uses FormRenderer for consistent rendering
 * - Handles form submission
 * - Canvas color determines page background
 *
 * USAGE:
 * - Share form link: https://yourapp.com/forms/contact-us
 * - Embed in iframe: <iframe src="https://yourapp.com/forms/contact-us" />
 * - Edit the form: https://yourapp.com/forms/contact-us/edit (requires auth)
 */

import { notFound } from 'next/navigation'
import { createCaller } from '@/trpc/server'
import { PublicFormClient } from './_components/public-form-client'
import type { FormSchema } from '@/components/form-builder'
import { DEFAULT_FORM_SCHEMA } from '@/components/form-builder'

// ============================================================================
// TYPES
// ============================================================================

interface PageProps {
  params: Promise<{ slug: string }>
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default async function PublicFormPage({ params }: PageProps) {
  const { slug } = await params

  // Fetch form data (public endpoint, no auth required)
  const api = await createCaller()
  let form

  try {
    form = await api.forms.getPublicFormBySlug({ slug })
  } catch {
    notFound()
  }

  if (!form) {
    notFound()
  }

  // Parse form config to get the schema
  let formSchema: FormSchema = DEFAULT_FORM_SCHEMA

  // Access config - Prisma returns Json type which we need to cast
  const rawConfig = form.config as Record<string, unknown> | null

  if (rawConfig && typeof rawConfig === 'object') {
    if (rawConfig.version && rawConfig.elements && rawConfig.styles && rawConfig.settings) {
      formSchema = rawConfig as unknown as FormSchema

      // Ensure title is set from form name if not present
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

  return (
    <PublicFormClient
      formId={form.id}
      slug={form.slug}
      schema={formSchema}
      organization={form.organization}
    />
  )
}
