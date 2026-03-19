/**
 * Email Template Service
 *
 * Data Access Layer (DAL) for email templates.
 * Handles CRUD operations and rendering of email templates.
 *
 * SOURCE OF TRUTH KEYWORDS: EmailTemplateService, TemplateDAL, EmailTemplateCRUD
 *
 * ARCHITECTURE:
 * - Templates stored in database with JSON content (array of blocks)
 * - Rendering uses React Email components via render-blocks.tsx
 * - Variable interpolation uses existing system from src/lib/variables/
 *
 * USAGE:
 * - Create/update templates from the UI
 * - Render templates to HTML for sending
 * - Apply variables at send time
 */

import { prisma } from '@/lib/config'
import { buildVariableContext, interpolate } from '@/lib/variables'
import { renderBlocksToHtml } from '@/lib/email-templates/render-blocks'
import { resend, RESEND_DEFAULT_FROM } from '@/lib/config/resend'
import { getVerifiedEmailDomain } from './email-domain.service'
import { chargeForEmail } from './wallet.service'
import { logActivity } from './activity-log.service'
import type {
  EmailBlock,
  EmailTemplateWithBlocks,
  CreateEmailTemplateInput,
  UpdateEmailTemplateInput,
  ListEmailTemplatesInput,
  EmailSettings,
} from '@/types/email-templates'
import { DEFAULT_EMAIL_SETTINGS } from '@/types/email-templates'

// ============================================================================
// CONTENT PARSING HELPERS
// ============================================================================

/**
 * Content structure stored in database.
 * Can be either:
 * - EmailBlock[] (legacy format)
 * - { blocks: EmailBlock[], emailSettings?: EmailSettings } (new format)
 *
 * SOURCE OF TRUTH KEYWORDS: TemplateContentFormat, ParsedContent
 */
interface ParsedTemplateContent {
  blocks: EmailBlock[]
  emailSettings: EmailSettings
}

/**
 * Parse template content from database JSON.
 * Handles both legacy (array) and new (object) formats.
 * Always returns normalized structure with blocks and emailSettings.
 */
function parseTemplateContent(content: unknown): ParsedTemplateContent {
  // Handle legacy format: just an array of blocks
  if (Array.isArray(content)) {
    return {
      blocks: content as EmailBlock[],
      emailSettings: DEFAULT_EMAIL_SETTINGS,
    }
  }

  // Handle new format: { blocks, emailSettings }
  if (content && typeof content === 'object') {
    const obj = content as { blocks?: unknown; emailSettings?: unknown }

    // If it has a blocks array, it's the new format
    if (Array.isArray(obj.blocks)) {
      return {
        blocks: obj.blocks as EmailBlock[],
        emailSettings: {
          ...DEFAULT_EMAIL_SETTINGS,
          ...(obj.emailSettings as Partial<EmailSettings>),
        },
      }
    }
  }

  // Fallback: empty template
  return {
    blocks: [],
    emailSettings: DEFAULT_EMAIL_SETTINGS,
  }
}

/**
 * Serialize template content for database storage.
 * Stores as { blocks, emailSettings } format.
 */
function serializeTemplateContent(
  blocks: EmailBlock[],
  emailSettings?: EmailSettings
): object {
  return {
    blocks,
    emailSettings: emailSettings ?? DEFAULT_EMAIL_SETTINGS,
  }
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of listing templates with pagination.
 */
export interface ListEmailTemplatesResult {
  templates: EmailTemplateWithBlocks[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ============================================================================
// CREATE
// ============================================================================

/**
 * Create a new email template.
 *
 * @param input - Template creation input (includes blocks and optional emailSettings)
 * @param userId - Optional user ID for activity logging
 * @returns Created template with parsed blocks and emailSettings
 *
 * @example
 * const template = await createEmailTemplate({
 *   organizationId: 'org_123',
 *   name: 'Welcome Email',
 *   subject: 'Welcome to {{organization.name}}!',
 *   content: [{ id: '1', type: 'heading', props: { text: 'Hello!', level: 'h1', align: 'center' } }],
 *   emailSettings: { bodyBackgroundColor: '#f0f0f0', ... },
 *   folderId: 'folder_123' // optional
 * }, userId)
 */
export async function createEmailTemplate(
  input: CreateEmailTemplateInput,
  userId?: string
): Promise<EmailTemplateWithBlocks> {
  // Serialize content with emailSettings in the new format
  const contentJson = serializeTemplateContent(input.content, input.emailSettings)

  const template = await prisma.emailTemplate.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      description: input.description,
      subject: input.subject,
      content: contentJson,
      folderId: input.folderId ?? null,
    },
  })

  // Log activity if userId is provided
  if (userId) {
    logActivity({
      userId,
      organizationId: input.organizationId,
      action: 'create',
      entity: 'email_template',
      entityId: template.id,
    })
  }

  // Parse content back to return properly typed result
  const parsed = parseTemplateContent(template.content)

  return {
    ...template,
    content: parsed.blocks,
    emailSettings: parsed.emailSettings,
  }
}

// ============================================================================
// READ
// ============================================================================

/**
 * Get a single email template by ID.
 * Parses content to extract blocks and emailSettings.
 *
 * @param organizationId - Organization context
 * @param templateId - Template to fetch
 * @returns Template with parsed blocks and emailSettings, or null if not found
 */
export async function getEmailTemplateById(
  organizationId: string,
  templateId: string
): Promise<EmailTemplateWithBlocks | null> {
  const template = await prisma.emailTemplate.findFirst({
    where: {
      id: templateId,
      organizationId,
      deletedAt: null,
    },
  })

  if (!template) return null

  // Parse content to extract blocks and emailSettings
  const parsed = parseTemplateContent(template.content)

  return {
    ...template,
    content: parsed.blocks,
    emailSettings: parsed.emailSettings,
  }
}

/**
 * List email templates with pagination, search, and folder filter.
 * Parses content to extract blocks and emailSettings for each template.
 *
 * @param input - List input with pagination, search, and folderId
 * @returns Paginated list of templates with parsed content
 */
export async function listEmailTemplates(
  input: ListEmailTemplatesInput
): Promise<ListEmailTemplatesResult> {
  const { organizationId, page = 1, pageSize = 10, search, folderId } = input

  // Build where clause
  // If search is provided, search across ALL folders (ignore folderId)
  // Otherwise, filter by folderId (null for root level templates)
  const where = {
    organizationId,
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } },
            { subject: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {
          folderId: folderId ?? null,
        }),
  }

  // Fetch templates and count in parallel
  const [templates, total] = await Promise.all([
    prisma.emailTemplate.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.emailTemplate.count({ where }),
  ])

  return {
    templates: templates.map((t) => {
      const parsed = parseTemplateContent(t.content)
      return {
        ...t,
        content: parsed.blocks,
        emailSettings: parsed.emailSettings,
      }
    }),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

// ============================================================================
// UPDATE
// ============================================================================

/**
 * Update an existing email template.
 * Handles both blocks and emailSettings updates.
 *
 * @param input - Update input with templateId and fields to update
 * @param userId - Optional user ID for activity logging
 * @returns Updated template with parsed blocks and emailSettings
 * @throws Error if template not found
 */
export async function updateEmailTemplate(
  input: UpdateEmailTemplateInput,
  userId?: string
): Promise<EmailTemplateWithBlocks> {
  const { organizationId, templateId, ...updateData } = input

  // Check template exists and get current content for merging emailSettings
  const existing = await prisma.emailTemplate.findFirst({
    where: {
      id: templateId,
      organizationId,
      deletedAt: null,
    },
  })

  if (!existing) {
    throw new Error(`Email template not found: ${templateId}`)
  }

  // Build update data
  const data: Record<string, unknown> = {}
  if (updateData.name !== undefined) data.name = updateData.name
  if (updateData.description !== undefined) data.description = updateData.description
  if (updateData.subject !== undefined) data.subject = updateData.subject
  if (updateData.folderId !== undefined) data.folderId = updateData.folderId

  // Handle content + emailSettings update
  // If content is provided, we need to serialize it with emailSettings
  if (updateData.content !== undefined) {
    // Get existing emailSettings to merge with new ones
    const existingParsed = parseTemplateContent(existing.content)
    const newEmailSettings = updateData.emailSettings ?? existingParsed.emailSettings
    data.content = serializeTemplateContent(updateData.content, newEmailSettings)
  } else if (updateData.emailSettings !== undefined) {
    // Only emailSettings changed, preserve existing blocks
    const existingParsed = parseTemplateContent(existing.content)
    data.content = serializeTemplateContent(existingParsed.blocks, updateData.emailSettings)
  }

  const template = await prisma.emailTemplate.update({
    where: { id: templateId },
    data,
  })

  // Log activity if userId is provided
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'email_template',
      entityId: template.id,
    })
  }

  // Parse content back to return properly typed result
  const parsed = parseTemplateContent(template.content)

  return {
    ...template,
    content: parsed.blocks,
    emailSettings: parsed.emailSettings,
  }
}

// ============================================================================
// DELETE
// ============================================================================

/**
 * Soft delete an email template.
 *
 * @param organizationId - Organization context
 * @param templateId - Template to delete
 * @param userId - Optional user ID for activity logging
 * @throws Error if template not found
 */
export async function deleteEmailTemplate(
  organizationId: string,
  templateId: string,
  userId?: string
): Promise<void> {
  const existing = await prisma.emailTemplate.findFirst({
    where: {
      id: templateId,
      organizationId,
      deletedAt: null,
    },
  })

  if (!existing) {
    throw new Error(`Email template not found: ${templateId}`)
  }

  await prisma.emailTemplate.update({
    where: { id: templateId },
    data: { deletedAt: new Date() },
  })

  // Log activity if userId is provided
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'delete',
      entity: 'email_template',
      entityId: templateId,
    })
  }
}

// ============================================================================
// DUPLICATE
// ============================================================================

/**
 * Duplicate an email template.
 * Creates a copy with "(Copy)" appended to the name.
 * Keeps template in the same folder as the original.
 * Preserves emailSettings from the original template.
 *
 * @param organizationId - Organization context
 * @param templateId - Template to duplicate
 * @param userId - Optional user ID for activity logging
 * @returns New template copy with parsed blocks and emailSettings
 * @throws Error if template not found
 */
export async function duplicateEmailTemplate(
  organizationId: string,
  templateId: string,
  userId?: string
): Promise<EmailTemplateWithBlocks> {
  const existing = await prisma.emailTemplate.findFirst({
    where: {
      id: templateId,
      organizationId,
      deletedAt: null,
    },
  })

  if (!existing) {
    throw new Error(`Email template not found: ${templateId}`)
  }

  // Preserve the content structure (which includes emailSettings)
  const template = await prisma.emailTemplate.create({
    data: {
      organizationId,
      name: `${existing.name} (Copy)`,
      description: existing.description,
      subject: existing.subject,
      content: existing.content as object,
      folderId: existing.folderId, // Preserve folder
    },
  })

  // Propagate origin marker if the source email template was installed from a template.
  // This ensures duplicated template-installed emails retain their lineage.
  const { propagateOriginMarker } = await import('@/lib/templates/origin-hash')
  await propagateOriginMarker(templateId, template.id, 'EMAIL', organizationId)

  // Log activity if userId is provided (duplicating is a create action)
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'create',
      entity: 'email_template',
      entityId: template.id,
    })
  }

  // Parse content to return properly typed result
  const parsed = parseTemplateContent(template.content)

  return {
    ...template,
    content: parsed.blocks,
    emailSettings: parsed.emailSettings,
  }
}

// ============================================================================
// MOVE
// ============================================================================

/**
 * Move an email template to a different folder.
 *
 * @param organizationId - Organization context
 * @param templateId - Template to move
 * @param folderId - Target folder (null for root)
 * @param userId - Optional user ID for activity logging
 * @returns Updated template with parsed blocks and emailSettings
 * @throws Error if template not found
 */
export async function moveEmailTemplate(
  organizationId: string,
  templateId: string,
  folderId: string | null,
  userId?: string
): Promise<EmailTemplateWithBlocks> {
  const existing = await prisma.emailTemplate.findFirst({
    where: {
      id: templateId,
      organizationId,
      deletedAt: null,
    },
  })

  if (!existing) {
    throw new Error(`Email template not found: ${templateId}`)
  }

  // Verify target folder exists (if specified)
  if (folderId) {
    const folder = await prisma.emailTemplateFolder.findFirst({
      where: {
        id: folderId,
        organizationId,
        deletedAt: null,
      },
    })
    if (!folder) {
      throw new Error(`Target folder not found: ${folderId}`)
    }
  }

  const template = await prisma.emailTemplate.update({
    where: { id: templateId },
    data: { folderId },
  })

  // Log activity if userId is provided (moving is an update action)
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'email_template',
      entityId: template.id,
    })
  }

  // Parse content to return properly typed result
  const parsed = parseTemplateContent(template.content)

  return {
    ...template,
    content: parsed.blocks,
    emailSettings: parsed.emailSettings,
  }
}

// ============================================================================
// RENDERING
// ============================================================================

/**
 * Render a template's blocks to HTML.
 * Variables are preserved as {{variable}} - use interpolate at send time.
 *
 * @param blocks - Array of email blocks
 * @param emailSettings - Optional email settings for styling (body/container backgrounds, padding)
 * @returns HTML string
 */
export async function renderTemplateBlocks(
  blocks: EmailBlock[],
  emailSettings?: EmailSettings
): Promise<string> {
  return await renderBlocksToHtml(blocks, undefined, emailSettings)
}

/**
 * Render a template with variables interpolated for a specific lead.
 * This is the function to call when actually sending an email.
 * Applies the template's emailSettings for proper body/container styling.
 *
 * @param templateId - Template to render
 * @param organizationId - Organization context
 * @param leadId - Lead to interpolate variables for
 * @returns Object with rendered HTML body and interpolated subject
 * @throws Error if template not found
 *
 * @example
 * const { html, subject } = await renderTemplateForLead(templateId, orgId, leadId)
 * // html = "<html>...Hello John!...</html>"
 * // subject = "Welcome to Acme Corp!"
 */
export async function renderTemplateForLead(
  templateId: string,
  organizationId: string,
  leadId: string
): Promise<{ html: string; subject: string }> {
  // Fetch template (includes blocks and emailSettings)
  const template = await getEmailTemplateById(organizationId, templateId)
  if (!template) {
    throw new Error(`Email template not found: ${templateId}`)
  }

  // Build variable context for this lead
  const context = await buildVariableContext(organizationId, leadId)

  // Render blocks to HTML with emailSettings for proper styling
  const rawHtml = await renderBlocksToHtml(template.content, undefined, template.emailSettings)

  // Interpolate variables in both HTML and subject
  const html = interpolate(rawHtml, context)
  const subject = interpolate(template.subject, context)

  // Update usage tracking
  await prisma.emailTemplate.update({
    where: { id: templateId },
    data: {
      usageCount: { increment: 1 },
      lastUsedAt: new Date(),
    },
  })

  return { html, subject }
}

/**
 * Preview a template with sample data.
 * Uses a mock context for preview purposes.
 * Applies emailSettings for proper body/container styling in the preview.
 *
 * @param blocks - Blocks to preview
 * @param subject - Subject to preview
 * @param emailSettings - Optional email settings for styling
 * @returns Object with preview HTML and subject
 */
export async function previewTemplate(
  blocks: EmailBlock[],
  subject: string,
  emailSettings?: EmailSettings
): Promise<{ html: string; subject: string }> {
  // Render blocks to HTML with emailSettings for proper styling
  const html = await renderBlocksToHtml(blocks, undefined, emailSettings)

  // For preview, we show the raw HTML with variable placeholders
  // The UI can replace them with sample data if needed
  return { html, subject }
}

// ============================================================================
// SEND TEST EMAIL
// ============================================================================

/**
 * Input for sending a test email.
 *
 * SOURCE OF TRUTH KEYWORDS: SendTestEmailInput, TestEmailInput
 */
export interface SendTestEmailInput {
  organizationId: string
  leadId: string
  subject: string
  blocks: EmailBlock[]
  /** Email settings for body/container styling */
  emailSettings?: EmailSettings
}

/**
 * Send a test email to a lead with real variable interpolation.
 *
 * WHY: Allows users to test their email template with real lead data
 * before sending to actual recipients.
 *
 * WALLET CHARGING: Charges the organization's wallet for the test email.
 * Cost is taken from feature-gates.ts (SOURCE OF TRUTH).
 * Test emails cost the same as regular emails - they're real sends.
 *
 * HOW:
 * 1. Fetch real variable context for the lead (name, custom data, transactions, etc.)
 * 2. Render blocks to HTML with emailSettings for proper styling
 * 3. Interpolate variables in both subject and HTML
 * 4. Send via Resend using organization's verified domain if available
 * 5. Charge wallet for the email usage
 *
 * @param input - Test email input with blocks, subject, lead info, and emailSettings
 * @returns Success status and message ID or error
 *
 * SOURCE OF TRUTH KEYWORDS: SendTestEmail, TestEmailSender
 */
export async function sendTestEmail(
  input: SendTestEmailInput
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const { organizationId, leadId, subject, blocks, emailSettings } = input

    // 1. Build variable context with REAL lead data
    const variableContext = await buildVariableContext(organizationId, leadId, {
      includeAllTransactions: true,
      includeAllSubmissions: true,
    })

    // 2. Render blocks to HTML with emailSettings for proper styling
    // This applies body background, container background, padding, border radius, max width
    const rawHtml = await renderBlocksToHtml(blocks, undefined, emailSettings)

    // 3. Interpolate variables in subject and HTML
    const interpolatedSubject = interpolate(subject, variableContext)
    const interpolatedHtml = interpolate(rawHtml, variableContext)

    // 4. Get recipient email from the lead context
    const recipientEmail = variableContext.lead.email
    if (!recipientEmail) {
      return { success: false, error: 'Lead does not have an email address' }
    }

    // 5. Determine sender - use org's verified domain if available
    let fromAddress = RESEND_DEFAULT_FROM
    const verifiedDomain = await getVerifiedEmailDomain(organizationId)
    if (verifiedDomain) {
      fromAddress = `noreply@${verifiedDomain.name}`
    }

    // 6. Send the email via Resend
    const { data: result, error } = await resend.emails.send({
      from: fromAddress,
      to: recipientEmail,
      subject: `[TEST] ${interpolatedSubject}`,
      html: interpolatedHtml,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    /**
     * 7. Charge wallet for email usage
     *
     * WHY: PAYG email charging - organizations pay per email sent
     * HOW: Uses chargeForEmail which gets cost from feature-gates.ts
     *
     * NOTE: We charge AFTER successful send to avoid charging for failed emails
     * Test emails cost the same as regular emails - they're actual sends via Resend.
     */
    try {
      await chargeForEmail(
        organizationId,
        `Test email to ${recipientEmail}`,
        {
          type: 'test-email',
          leadId,
          recipient: recipientEmail,
          messageId: result?.id,
        }
      )
    } catch (chargeError) {
      // Log but don't fail the email send - email was already sent
      console.error('Failed to charge for email:', chargeError)
    }

    return { success: true, messageId: result?.id }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send test email',
    }
  }
}
