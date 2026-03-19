/**
 * ============================================================================
 * PUBLIC FORM CLIENT
 * ============================================================================
 *
 * Client component wrapper for the public form page.
 * FormRenderer is now SELF-CONTAINED and handles:
 * - Form submission via tRPC (single endpoint)
 * - Success state display
 * - Redirect after submission
 * - Lead session identification (sticky forms) for returning visitors
 *
 * This component is now just a thin wrapper that passes props.
 * All submission logic lives in FormRenderer for consistency
 * across all contexts (public page, website builder, iframe embeds).
 *
 * SOURCE OF TRUTH KEYWORDS: PublicForm, LeadSession, StickyForm
 */

'use client'

import { FormRenderer } from '@/components/form-builder'
import type { FormSchema } from '@/components/form-builder'

// ============================================================================
// TYPES
// ============================================================================

interface PublicFormClientProps {
  formId: string
  slug: string
  schema: FormSchema
  organization: {
    id: string
    name: string
    logo: string | null
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export function PublicFormClient({
  formId,
  schema,
  organization,
}: PublicFormClientProps) {
  // FormRenderer is self-contained - it handles submission, success state,
  // redirects, and lead session identification internally via tRPC.
  // Pass organizationId for lead session (sticky forms) functionality.
  return (
    <FormRenderer
      formId={formId}
      schema={schema}
      organizationId={organization.id}
      showCanvas={true}
    />
  )
}
