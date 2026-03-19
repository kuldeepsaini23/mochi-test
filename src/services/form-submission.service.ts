/**
 * Form Submission Service (DAL)
 *
 * Data Access Layer for processing form submissions.
 * Handles the complete flow: validation → lead upsert → data distribution → submission storage.
 *
 * This service is called by the public submitForm endpoint.
 * No authentication required - forms are submitted by anonymous visitors.
 */

import { prisma } from '@/lib/config'
import { Prisma, FormStatus, LeadStatus } from '@/generated/prisma'
import type { FormSchema } from '@/components/form-builder/_lib/types'
import type { LeadUpdateInput } from '@/services/leads.service'
import { saveResponse as saveCustomDataResponse } from '@/services/custom-data.service'
import {
  type FormSubmissionInput,
  type FormSubmissionResult,
  type FormSubmissionData,
  type FormSubmissionValue,
  type ParsedForm,
  type CategorizedSubmissionData,
  type LeadUpsertResult,
  buildFieldMappings,
  extractStringValue,
  isValidSubmissionValue,
} from '@/lib/form-submission/types'

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Process a form submission.
 *
 * This is the main entry point for form submissions. It:
 * 1. Validates the form exists and is PUBLISHED
 * 2. Parses and validates submission data
 * 3. Builds field mappings (auto-detect where data goes)
 * 4. Extracts email and finds/creates lead (match-first)
 * 5. Distributes data to Lead model and CustomDataResponse
 * 6. Creates FormSubmission record (audit trail)
 *
 * @param input - Form submission input
 * @returns Submission result with leadId and submissionId
 */
export async function processFormSubmission(
  input: FormSubmissionInput
): Promise<FormSubmissionResult> {
  try {
    // Step 1: Get and validate form
    const form = await getFormForSubmission(input.formId)
    if (!form) {
      return {
        success: false,
        error: 'Form not found',
        code: 'FORM_NOT_FOUND',
      }
    }

    if (form.status !== FormStatus.PUBLISHED) {
      return {
        success: false,
        error: 'Form is not accepting submissions',
        code: 'FORM_NOT_PUBLISHED',
      }
    }

    // Step 2: Parse form config and build field mappings
    const formConfig = form.config as FormSchema

    const mappings = buildFieldMappings(formConfig.elements)

    // Step 3: Categorize submission data based on mappings
    const categorized = categorizeSubmissionData(input.data, mappings)

    // Step 4: Optionally link to a lead — only when email is present
    // Forms without an email field still save submissions, just without a lead link
    let leadId: string | null = null
    let isNew = false

    if (categorized.email) {
      // Find or create lead by email (match-first logic)
      const { lead, isNew: leadIsNew } = await upsertLeadFromSubmission(
        form.organizationId,
        categorized.email,
        categorized.leadData
      )
      leadId = lead.id
      isNew = leadIsNew

      // Save custom data responses (if any) — requires a lead to attach to
      // SECURITY: Pass organizationId to validate custom data belongs to same org
      await saveCustomDataResponses(form.organizationId, lead.id, categorized.customData)
    }

    // Step 5: Create form submission record (always — with or without a lead)
    const submission = await createFormSubmissionRecord(
      form.id,
      leadId,
      input.data,
      input.metadata
    )

    // Step 6: Update form submission count
    await incrementFormSubmissionCount(form.id)

    // Step 7: Trigger automations for FORM_SUBMITTED event
    // Only fire if we have a lead — automations need a leadId to operate on
    if (leadId) {
      try {
        const { triggerAutomation } = await import('@/services/automation.service')
        await triggerAutomation('FORM_SUBMITTED', {
          organizationId: form.organizationId,
          leadId,
          triggerData: {
            type: 'FORM_SUBMITTED',
            formId: form.id,
            formName: form.name,
            submissionId: submission.id,
            submissionData: input.data,
          },
        })
      } catch (automationError) {
        // Log but don't fail the submission if automation trigger fails
        console.error('Failed to trigger automation for form submission:', automationError)
      }
    }

    return {
      success: true,
      submissionId: submission.id,
      leadId,
      isNewLead: isNew,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
    }
  }
}

// ============================================================================
// CONTEXT BUILDER HELPERS (Variable Interpolation)
// ============================================================================
// Used by context-builder.ts to fetch form submissions for template variable interpolation.
// SOURCE OF TRUTH KEYWORDS: LeadFormSubmissions, ContextBuilderSubmissions

/**
 * Fetch form submissions for a lead with form name included.
 *
 * WHY: The variable context builder needs form submissions to populate
 * {{lead.submission.formName}}, {{lead.submission.data.*}} variables.
 *
 * SOURCE OF TRUTH: FetchLeadSubmissionsForContext, SubmissionWithFormName
 *
 * @param leadId - The lead whose submissions to fetch
 * @param options - Control how many submissions to include
 * @returns Array of submissions with form name included
 */
export async function getLeadSubmissionsForContext(
  leadId: string,
  options: { includeAllSubmissions?: boolean }
) {
  return await prisma.formSubmission.findMany({
    where: { leadId },
    include: {
      form: {
        select: { name: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: options.includeAllSubmissions ? undefined : 5,
  })
}

// ============================================================================
// FORM RETRIEVAL
// ============================================================================

/**
 * Get a form by ID for submission processing.
 * Returns null if form doesn't exist.
 *
 * Note: This is a public endpoint query - no organization check.
 * The form ID is the only identifier needed.
 */
async function getFormForSubmission(formId: string): Promise<ParsedForm | null> {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: {
      id: true,
      name: true,
      status: true,
      organizationId: true,
      config: true,
    },
  })

  if (!form) return null

  return {
    id: form.id,
    name: form.name,
    status: form.status,
    organizationId: form.organizationId,
    config: form.config as unknown as FormSchema,
  }
}

// ============================================================================
// DATA CATEGORIZATION
// ============================================================================

/**
 * Import the ElementMapping type for use in categorization.
 */
import type { ElementMapping } from '@/lib/form-submission/types'

/**
 * Categorize submission data based on field mappings.
 *
 * Separates the submitted data into:
 * - leadData: Fields that map to Lead model columns
 * - customData: Fields that map to CustomDataResponse (grouped by datasetId)
 * - email: The extracted email address for lead matching
 */
function categorizeSubmissionData(
  data: FormSubmissionData,
  mappings: Map<string, ElementMapping>
): CategorizedSubmissionData {
  const leadData: Partial<LeadUpdateInput> = {}
  const customData = new Map<string, Record<string, FormSubmissionValue>>()
  let email: string | null = null

  for (const [fieldName, value] of Object.entries(data)) {
    // Skip invalid values
    if (!isValidSubmissionValue(value)) continue

    const mapping = mappings.get(fieldName)
    if (!mapping) continue

    const { target } = mapping

    switch (target.type) {
      case 'lead': {
        // Map to Lead model field
        const stringValue = extractStringValue(value)
        if (stringValue !== null) {
          // Type-safe assignment to leadData
          assignLeadField(leadData, target.field, stringValue)

          // Track email specifically for lead matching
          if (target.field === 'email') {
            email = stringValue
          }
        }
        break
      }

      case 'customData': {
        // Group by datasetId for batch saving
        const datasetValues = customData.get(target.datasetId) ?? {}
        datasetValues[target.fieldSlug] = value
        customData.set(target.datasetId, datasetValues)
        break
      }

      case 'submission':
        // No additional processing - data is stored in FormSubmission.data
        break
    }
  }

  return { leadData, customData, email }
}

/**
 * Type-safe assignment of a value to a lead field.
 * Handles the different field types properly.
 */
function assignLeadField(
  leadData: Partial<LeadUpdateInput>,
  field: keyof LeadUpdateInput,
  value: string
): void {
  // String fields
  const stringFields: Array<keyof LeadUpdateInput> = [
    'firstName',
    'lastName',
    'email',
    'phone',
    'location',
    'locationCode',
    'source',
    'address',
    'address2',
    'city',
    'state',
    'zipCode',
    'country',
    'assignedToId',
  ]

  if (stringFields.includes(field)) {
    ;(leadData as Record<string, string>)[field] = value
  }

  // Note: status and cltv are not set from form submissions
  // They have specific types (LeadStatus, number) that shouldn't come from forms
}

// ============================================================================
// LEAD UPSERT
// ============================================================================

/**
 * Find or create a lead by email (match-first logic).
 *
 * 1. Check if a lead with this email exists in the organization
 * 2. If exists: update with new data
 * 3. If not: create new lead
 *
 * @param organizationId - Organization to create/find lead in
 * @param email - Email to match on
 * @param leadData - Additional lead data to save
 */
async function upsertLeadFromSubmission(
  organizationId: string,
  email: string,
  leadData: Partial<LeadUpdateInput>
): Promise<LeadUpsertResult> {
  // Try to find existing lead by email
  const existingLead = await prisma.lead.findFirst({
    where: {
      organizationId,
      email,
      deletedAt: null,
    },
  })

  if (existingLead) {
    // Update existing lead with new data
    const updatedLead = await prisma.lead.update({
      where: { id: existingLead.id },
      data: {
        ...leadData,
        lastActivityAt: new Date(),
      },
    })

    return { lead: updatedLead, isNew: false }
  }

  // Create new lead
  const newLead = await prisma.lead.create({
    data: {
      organizationId,
      email,
      firstName: leadData.firstName ?? '',
      lastName: leadData.lastName ?? '',
      phone: leadData.phone,
      address: leadData.address,
      address2: leadData.address2,
      city: leadData.city,
      state: leadData.state,
      zipCode: leadData.zipCode,
      country: leadData.country,
      source: leadData.source ?? 'Form Submission',
      location: leadData.location ?? 'Unknown',
      locationCode: leadData.locationCode ?? 'XX',
      status: LeadStatus.LEAD,
      lastActivityAt: new Date(),
    },
  })

  return { lead: newLead, isNew: true }
}

// ============================================================================
// CUSTOM DATA SAVING
// ============================================================================

/**
 * Save custom data responses for each dataset.
 *
 * Groups field values by datasetId and saves them to CustomDataResponse.
 * Uses the existing saveResponse function from custom-data.service.
 *
 * SECURITY: organizationId is required to validate datasets belong to the same
 * organization as the form/lead. This prevents cross-tenant data injection.
 */
async function saveCustomDataResponses(
  organizationId: string,
  leadId: string,
  customData: Map<string, Record<string, FormSubmissionValue>>
): Promise<void> {
  if (customData.size === 0) {
    return
  }

  for (const [datasetId, values] of customData) {
    // Convert FormSubmissionValue to the expected Record<string, unknown>
    const valuesRecord: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(values)) {
      valuesRecord[key] = value
    }

    try {
      // SECURITY: Pass organizationId to validate dataset belongs to same org
      await saveCustomDataResponse(organizationId, leadId, datasetId, valuesRecord)
    } catch (error) {
      throw error
    }
  }
}

// ============================================================================
// FORM SUBMISSION RECORD
// ============================================================================

/**
 * Create a FormSubmission record to store the raw submission data.
 *
 * This serves as an audit trail - all submitted data is preserved here
 * regardless of how it was distributed to Lead/CustomDataResponse.
 */
async function createFormSubmissionRecord(
  formId: string,
  leadId: string | null,
  data: FormSubmissionData,
  metadata?: { ipAddress?: string; userAgent?: string; referrerUrl?: string }
) {
  return await prisma.formSubmission.create({
    data: {
      formId,
      leadId,
      data: data as Prisma.InputJsonValue,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
      referrerUrl: metadata?.referrerUrl,
    },
  })
}

/**
 * Increment the form's submission count.
 */
async function incrementFormSubmissionCount(formId: string): Promise<void> {
  await prisma.form.update({
    where: { id: formId },
    data: {
      submissionCount: {
        increment: 1,
      },
    },
  })
}

// ============================================================================
// SUBMISSION QUERY & MANAGEMENT
// ============================================================================
// Protected service functions for listing, viewing, and deleting submissions.
// Used by tRPC procedures that require authentication and org scoping.
//
// SOURCE OF TRUTH KEYWORDS: ListFormSubmissions, FormSubmissionWithLead,
// FormSubmissionPaginated, DeleteFormSubmission

/**
 * Input type for listing form submissions with filters and pagination.
 *
 * SOURCE OF TRUTH: ListFormSubmissionsInput
 */
export interface ListFormSubmissionsInput {
  organizationId: string
  formId?: string
  search?: string
  dateFrom?: string
  dateTo?: string
  page: number
  pageSize: number
}

/**
 * Lead data attached to a submission for display purposes.
 * Subset of the Lead model with only the fields needed in the submissions table.
 *
 * SOURCE OF TRUTH: SubmissionLeadInfo
 */
export interface SubmissionLeadInfo {
  id: string
  firstName: string | null
  lastName: string | null
  email: string
}

/**
 * A form submission enriched with its form name and associated lead info.
 * FormSubmission has no direct `lead` relation in the schema — only `leadId`.
 * We batch-fetch leads separately and merge them here.
 *
 * SOURCE OF TRUTH: FormSubmissionWithDetails
 */
export interface FormSubmissionWithDetails {
  id: string
  formId: string
  data: Prisma.JsonValue
  leadId: string | null
  ipAddress: string | null
  userAgent: string | null
  referrerUrl: string | null
  createdAt: Date
  form: { id: string; name: string; slug: string }
  lead: SubmissionLeadInfo | null
}

/**
 * Paginated result for form submissions listing.
 *
 * SOURCE OF TRUTH: FormSubmissionPaginatedResult
 */
export interface FormSubmissionPaginatedResult {
  submissions: FormSubmissionWithDetails[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/**
 * List form submissions with pagination, search, and date filters.
 *
 * HOW IT WORKS:
 * 1. Build a Prisma `where` clause scoped to the organization via `form.organizationId`
 * 2. Apply optional filters (formId, date range)
 * 3. For search: batch-fetch matching lead IDs by email/name, then filter submissions by those leadIds
 * 4. Query submissions with pagination
 * 5. Batch-fetch leads for the returned submissions and merge
 *
 * WHY batch-fetch leads: FormSubmission only has `leadId` (no Prisma relation to Lead),
 * so we collect all leadIds from the result page and do a single `findMany` call.
 *
 * @param input - Filters, search, and pagination options
 * @returns Paginated submissions with form and lead details
 */
export async function listFormSubmissions(
  input: ListFormSubmissionsInput
): Promise<FormSubmissionPaginatedResult> {
  const { organizationId, formId, search, dateFrom, dateTo, page, pageSize } = input

  // Base where clause: org-scoped through the form relation
  const where: Prisma.FormSubmissionWhereInput = {
    form: {
      organizationId,
    },
  }

  // Filter by specific form
  if (formId) {
    where.formId = formId
  }

  // Date range filter
  if (dateFrom || dateTo) {
    where.createdAt = {}
    if (dateFrom) {
      where.createdAt.gte = new Date(dateFrom)
    }
    if (dateTo) {
      where.createdAt.lte = new Date(dateTo)
    }
  }

  // Search filter: find leads matching the search term, then filter submissions by those leadIds
  if (search && search.trim().length > 0) {
    const searchTerm = search.trim()
    const matchingLeads = await prisma.lead.findMany({
      where: {
        organizationId,
        OR: [
          { email: { contains: searchTerm, mode: 'insensitive' } },
          { firstName: { contains: searchTerm, mode: 'insensitive' } },
          { lastName: { contains: searchTerm, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    })

    const matchingLeadIds = matchingLeads.map((l) => l.id)

    // If no leads match the search, return empty result immediately
    if (matchingLeadIds.length === 0) {
      return {
        submissions: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
      }
    }

    where.leadId = { in: matchingLeadIds }
  }

  // Get total count and paginated submissions in parallel
  const [total, rawSubmissions] = await Promise.all([
    prisma.formSubmission.count({ where }),
    prisma.formSubmission.findMany({
      where,
      include: {
        form: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  // Batch-fetch leads for the returned submissions
  const leadIds = rawSubmissions
    .map((s) => s.leadId)
    .filter((id): id is string => id !== null)
  const uniqueLeadIds = [...new Set(leadIds)]

  const leads =
    uniqueLeadIds.length > 0
      ? await prisma.lead.findMany({
          where: { id: { in: uniqueLeadIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : []

  // Build a lookup map for leads
  const leadMap = new Map(leads.map((l) => [l.id, l]))

  // Merge submissions with lead data
  const submissions: FormSubmissionWithDetails[] = rawSubmissions.map((s) => ({
    id: s.id,
    formId: s.formId,
    data: s.data,
    leadId: s.leadId,
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
    referrerUrl: s.referrerUrl,
    createdAt: s.createdAt,
    form: s.form,
    lead: s.leadId ? leadMap.get(s.leadId) ?? null : null,
  }))

  return {
    submissions,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Get a single form submission by ID with full details.
 *
 * Validates org scoping through the form's organizationId.
 * Returns null if not found or not in the given organization.
 *
 * @param organizationId - Organization for security scoping
 * @param submissionId - The submission to retrieve
 * @returns Submission with form and lead details, or null
 */
export async function getFormSubmission(
  organizationId: string,
  submissionId: string
): Promise<FormSubmissionWithDetails | null> {
  const submission = await prisma.formSubmission.findFirst({
    where: {
      id: submissionId,
      form: { organizationId },
    },
    include: {
      form: {
        select: { id: true, name: true, slug: true },
      },
    },
  })

  if (!submission) return null

  // Fetch lead data if linked
  let lead: SubmissionLeadInfo | null = null
  if (submission.leadId) {
    const leadRecord = await prisma.lead.findUnique({
      where: { id: submission.leadId },
      select: { id: true, firstName: true, lastName: true, email: true },
    })
    lead = leadRecord
  }

  return {
    id: submission.id,
    formId: submission.formId,
    data: submission.data,
    leadId: submission.leadId,
    ipAddress: submission.ipAddress,
    userAgent: submission.userAgent,
    referrerUrl: submission.referrerUrl,
    createdAt: submission.createdAt,
    form: submission.form,
    lead,
  }
}

/**
 * Hard delete a form submission by ID.
 *
 * Validates org scoping through the form's organizationId before deletion.
 * Also decrements the parent form's submissionCount to keep analytics accurate.
 *
 * @param organizationId - Organization for security scoping
 * @param submissionId - The submission to delete
 * @throws Error if submission not found or not in the given organization
 */
export async function deleteFormSubmission(
  organizationId: string,
  submissionId: string
): Promise<void> {
  // Find the submission first to validate org scoping and get formId for count update
  const submission = await prisma.formSubmission.findFirst({
    where: {
      id: submissionId,
      form: { organizationId },
    },
    select: { id: true, formId: true },
  })

  if (!submission) {
    throw new Error('Submission not found')
  }

  // Delete submission and decrement form count in a transaction
  await prisma.$transaction([
    prisma.formSubmission.delete({
      where: { id: submission.id },
    }),
    prisma.form.update({
      where: { id: submission.formId },
      data: {
        submissionCount: { decrement: 1 },
      },
    }),
  ])
}
