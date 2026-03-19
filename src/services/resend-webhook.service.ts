/**
 * Resend Webhook Service - Inbound Email Processing
 *
 * WHY: Handle inbound emails from leads via Resend webhooks
 * HOW: Receives email.received events, fetches full content, stores in conversation
 *
 * FLOW:
 * 1. Webhook receives email.received event with basic info
 * 2. Fetch full email content via Resend API
 * 3. Find lead by sender email (or create if auto-create enabled)
 * 4. Store message in conversation via recordInboundMessage()
 *
 * REQUIREMENTS FOR INBOUND EMAILS TO WORK:
 * 1. Configure MX records to point to Resend for your domain
 * 2. Set up webhook URL in Resend dashboard
 * 3. Set RESEND_WEBHOOK_SECRET env variable
 *
 * SOURCE OF TRUTH KEYWORDS: ResendWebhookService, InboundEmailService
 */

import 'server-only'
import { prisma } from '@/lib/config/prisma'
import { recordInboundMessage } from './inbox.service'
import { realtime } from '@/lib/realtime'
import { notifyAllMembers } from '@/lib/notifications/send-notification'

// ============================================================================
// TYPES - Resend Webhook Payload Types
// ============================================================================

/**
 * Base webhook event structure from Resend
 * SOURCE OF TRUTH KEYWORDS: ResendWebhookEvent
 */
export interface ResendWebhookEvent {
  type: string
  created_at: string
  data: {
    email_id: string
    from: string
    to: string[]
    subject: string
    created_at: string
    cc?: string[]
    bcc?: string[]
    message_id?: string
    attachments?: Array<{
      id: string
      filename: string
      content_type: string
      content_disposition: string
      content_id?: string
    }>
  }
}

/**
 * Email content response from Resend GET /emails/receiving/:id
 *
 * IMPORTANT: The top-level `from` field is often just the email address.
 * The full display name is in `headers.from` (e.g., "Emmanuel Joseph" <email@domain.com>)
 *
 * SOURCE OF TRUTH KEYWORDS: ResendEmailContent, ResendInboundEmail
 */
interface ResendEmailContent {
  id: string
  from: string
  to: string[]
  subject: string
  html: string | null
  text: string | null
  created_at: string
  cc?: string[]
  bcc?: string[]
  reply_to?: string[]
  last_event?: string
  message_id?: string
  /** Raw email headers - contains the FULL from field with display name */
  headers?: {
    from?: string
    to?: string
    subject?: string
    date?: string
    'message-id'?: string
    [key: string]: string | undefined
  }
}

// ============================================================================
// WEBHOOK HANDLERS
// ============================================================================

/**
 * Handle email.received webhook event
 *
 * WHY: Process inbound emails from leads
 * HOW:
 * 1. Extract sender email and recipient domain
 * 2. Find which organization owns this domain
 * 3. Find or create lead by sender email
 * 4. Fetch full email content from Resend API
 * 5. Store as inbound message in conversation
 *
 * @returns Object with success status and optional error message
 */
export async function handleEmailReceived(
  event: ResendWebhookEvent
): Promise<{ success: boolean; error?: string; conversationId?: string }> {
  const { data } = event
  const { email_id, from, to, subject } = data

  try {
    // Parse sender email address (format: "Name <email@domain.com>" or "email@domain.com")
    const senderEmail = extractEmailAddress(from)
    const senderName = extractSenderName(from)

    if (!senderEmail) {
      return { success: false, error: 'Invalid sender email address' }
    }

    // Find organization by recipient domain
    // The "to" address should be on a domain we own
    const recipientEmail = to[0]
    if (!recipientEmail) {
      return { success: false, error: 'No recipient address' }
    }

    const recipientDomain = recipientEmail.split('@')[1]
    const organization = await findOrganizationByEmailDomain(recipientDomain)

    if (!organization) {
      return { success: false, error: `No organization found for domain: ${recipientDomain}` }
    }

    // Fetch full email content from Resend API FIRST
    // WHY: The full email content might have a more complete "from" field with display name
    const emailContent = await fetchEmailContent(email_id)
    if (!emailContent) {
      return { success: false, error: 'Failed to fetch email content from Resend' }
    }

    // Extract sender name - priority order:
    // 1. headers.from (has the full display name like "Emmanuel Joseph" <email@domain.com>)
    // 2. Top-level from field (often just the email address)
    // 3. Webhook from field (fallback)
    // WHY: Resend puts the full RFC 5322 from header in headers.from, but normalizes top-level from
    const headersFrom = emailContent.headers?.from
    const headersSenderName = headersFrom ? extractSenderName(headersFrom) : null
    const fetchedSenderName = extractSenderName(emailContent.from)
    const finalSenderName = headersSenderName || fetchedSenderName || senderName

    // Find lead by sender email, or create one if they don't exist
    let lead = await prisma.lead.findFirst({
      where: {
        organizationId: organization.id,
        email: senderEmail,
        deletedAt: null,
      },
    })

    // Parse the sender name into first/last name parts
    const { firstName, lastName } = parseSenderNameParts(finalSenderName, senderEmail)

    if (!lead) {
      // Auto-create lead from inbound email
      // WHY: When someone emails us who isn't in our system, we should capture them as a lead
      lead = await prisma.lead.create({
        data: {
          organizationId: organization.id,
          email: senderEmail,
          firstName,
          lastName,
          source: 'Inbound Email', // Track that this lead came from an inbound email
        },
      })
    } else {
      // Lead exists - check if their name has changed and update if so
      // WHY: People sometimes update their email display name, we should keep our records current
      // ONLY update firstName/lastName, nothing else
      const nameChanged =
        (firstName && lead.firstName !== firstName) ||
        (lastName && lead.lastName !== lastName)

      if (nameChanged && finalSenderName) {
        lead = await prisma.lead.update({
          where: { id: lead.id },
          data: {
            firstName,
            lastName,
          },
        })
      }
    }

    // Extract NEW email content (excludes quoted reply history)
    // WHY: Email replies include previous messages - we only want the NEW content
    // HOW: HTML path is preferred (structural markers like gmail_quote class),
    //      falls back to text pattern matching if HTML not available
    const body = extractNewEmailContent(emailContent.html, emailContent.text)

    // Record the inbound message
    // Store the RFC 2822 Message-ID for email threading (In-Reply-To/References headers)
    // Store toEmail so we know what address to reply FROM (reply from same address they emailed)
    const result = await recordInboundMessage({
      organizationId: organization.id,
      leadId: lead.id,
      channel: 'EMAIL',
      body,
      subject: subject || undefined,
      fromName: senderName || undefined,
      fromEmail: senderEmail,
      toEmail: recipientEmail, // Store which of our addresses they emailed - we reply FROM this
      externalId: email_id,
      emailMessageId: data.message_id, // RFC 2822 Message-ID for threading
    })

    // Skip realtime events and notifications if this is a duplicate (webhook retry)
    // WHY: Resend retries webhooks on timeout/5xx - we already processed this email
    if (!result.isDuplicate) {
      // =========================================================================
      // EMIT REALTIME EVENT - Notify connected clients of new email
      // =========================================================================
      /**
       * Emit inbox.emailReceived for realtime inbox updates
       * WHY: Allows inbox to instantly show new messages without polling
       * HOW: True pub/sub via @upstash/realtime - connected clients receive via SSE
       */
      await realtime.emit('inbox.emailReceived', {
        organizationId: organization.id,
        conversationId: result.conversation.id,
        messageId: result.message.id,
        leadId: lead.id,
        lead: {
          id: lead.id,
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email,
          avatarUrl: lead.avatarUrl,
        },
        preview: body.slice(0, 100) + (body.length > 100 ? '...' : ''),
        subject: subject || null,
      })

      /**
       * Notify all org members about the new inbound email.
       * WHY: Team members need to know when a customer emails so they can respond promptly.
       * HOW: Uses the existing notification service which handles DB insert + realtime + web push.
       * Category 'inbox' maps to the Inbox icon in the notification dropdown.
       * Fire-and-forget — notification failure should never block email processing.
       */
      notifyAllMembers({
        organizationId: organization.id,
        title: `New email from ${finalSenderName || senderEmail}`,
        body: body.slice(0, 100) + (body.length > 100 ? '...' : ''),
        category: 'inbox',
        actionUrl: `/inbox?conversationId=${result.conversation.id}`,
      }).catch(() => {
        // Fire-and-forget — notification failure should never block email processing
      })
    }

    return {
      success: true,
      conversationId: result.conversation.id,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract email address from sender string
 * Handles formats: "Name <email@domain.com>" or "email@domain.com"
 */
function extractEmailAddress(sender: string): string | null {
  // Check for angle bracket format: "Name <email@domain.com>"
  const angleMatch = sender.match(/<([^>]+)>/)
  if (angleMatch) {
    return angleMatch[1].toLowerCase()
  }

  // Check if it's just an email
  const emailMatch = sender.match(/^[\w.-]+@[\w.-]+\.\w+$/)
  if (emailMatch) {
    return sender.toLowerCase()
  }

  return null
}

/**
 * Extract sender name from sender string
 *
 * Handles formats:
 * - "Name <email@domain.com>" -> "Name"
 * - '"Name" <email@domain.com>' -> "Name" (with quotes stripped)
 * - "\"Name\" <email@domain.com>" -> "Name" (escaped quotes stripped)
 *
 * SOURCE OF TRUTH KEYWORDS: ExtractSenderName, EmailFromParsing
 */
function extractSenderName(sender: string): string | null {
  // Check for angle bracket format: anything before the <
  const match = sender.match(/^([^<]+)\s*</)
  if (match) {
    let name = match[1].trim()
    // Strip surrounding quotes (regular or escaped)
    // Handles: "Name", \"Name\", 'Name'
    name = name.replace(/^["'\\]+|["'\\]+$/g, '').trim()
    return name || null
  }
  return null
}

/**
 * Parse sender name into first and last name parts
 *
 * WHY: When auto-creating leads from inbound emails, we want to capture
 *      as much info as possible from the sender's display name
 *
 * HOW: Split name on spaces - first word is firstName, rest is lastName
 *      If no name available, use email prefix as firstName fallback
 *
 * EXAMPLES:
 * - "John Smith" -> { firstName: "John", lastName: "Smith" }
 * - "John" -> { firstName: "John", lastName: null }
 * - null (email: john@example.com) -> { firstName: "john", lastName: null }
 *
 * SOURCE OF TRUTH KEYWORDS: ParseSenderName, LeadNameExtraction
 */
function parseSenderNameParts(
  senderName: string | null,
  fallbackEmail?: string
): {
  firstName: string
  lastName: string | null
} {
  if (!senderName || senderName.trim() === '') {
    // No display name - use email prefix as fallback
    // e.g., "john.smith@example.com" -> "john.smith"
    if (fallbackEmail) {
      const emailPrefix = fallbackEmail.split('@')[0]
      // Capitalize first letter for nicer display
      const formattedPrefix = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1)
      return { firstName: formattedPrefix, lastName: null }
    }
    return { firstName: 'Unknown', lastName: null }
  }

  const parts = senderName.trim().split(/\s+/)

  if (parts.length === 1) {
    // Single name - use as firstName
    return { firstName: parts[0], lastName: null }
  }

  // Multiple parts - first word is firstName, rest is lastName
  const firstName = parts[0]
  const lastName = parts.slice(1).join(' ')

  return { firstName, lastName }
}

/**
 * Find organization by verified email domain with receiving enabled
 *
 * WHY: Match inbound emails to the correct organization
 * HOW: Look up EmailDomain record with matching domain name
 *
 * REQUIREMENTS FOR MATCH:
 * 1. Domain must be verified (DNS records confirmed)
 * 2. Domain must have receiving enabled (admin can toggle this)
 *
 * This allows organizations to temporarily disable receiving without
 * deleting the domain or removing DNS records.
 */
async function findOrganizationByEmailDomain(domain: string): Promise<{ id: string } | null> {
  const emailDomain = await prisma.emailDomain.findFirst({
    where: {
      name: domain.toLowerCase(),
      status: 'VERIFIED',
      receivingEnabled: true, // Only process emails if receiving is enabled
    },
    select: {
      organizationId: true,
    },
  })

  if (!emailDomain) {
    return null
  }

  return { id: emailDomain.organizationId }
}

/**
 * Fetch full email content from Resend API
 *
 * WHY: Webhook only contains basic info, need API call for body
 * HOW: GET /emails/receiving/:id returns full content for INBOUND emails
 *
 * IMPORTANT: Received/inbound emails use a different endpoint than sent emails!
 * - Sent emails: GET /emails/:id
 * - Received emails: GET /emails/receiving/:id
 */
async function fetchEmailContent(emailId: string): Promise<ResendEmailContent | null> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return null
  }

  try {
    // Use /emails/receiving/:id for inbound emails
    const response = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return data as ResendEmailContent
  } catch (error) {
    return null
  }
}

/**
 * Strip HTML tags from content to get plain text
 *
 * WHY: Convert HTML to readable plain text
 * HOW: Remove tags, decode entities, normalize whitespace
 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style tags
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags
    .replace(/<br\s*\/?>/gi, '\n') // Convert <br> to newlines
    .replace(/<\/div>/gi, '\n') // End of div becomes newline
    .replace(/<\/p>/gi, '\n\n') // End of paragraph becomes double newline
    .replace(/<[^>]+>/g, '') // Remove remaining HTML tags
    .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
    .replace(/&amp;/g, '&') // Decode ampersands
    .replace(/&lt;/g, '<') // Decode less than
    .replace(/&gt;/g, '>') // Decode greater than
    .replace(/&quot;/g, '"') // Decode quotes
    .replace(/&#39;/g, "'") // Decode apostrophe
    .replace(/[ \t]+/g, ' ') // Collapse horizontal whitespace (preserve newlines)
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .trim()
}

/**
 * Extract NEW email content from HTML by removing quoted reply sections
 *
 * WHY: Email replies include quoted history that we don't want to store
 * HOW: Use HTML structural markers (classes, elements) which are MORE RELIABLE than text patterns
 *
 * SUPPORTED EMAIL CLIENTS:
 * - Gmail: <div class="gmail_quote"> or <blockquote class="gmail_quote">
 * - Outlook: <div id="appendonsend"> or <hr> followed by header info
 * - Apple Mail: <blockquote type="cite">
 * - Generic: Any <blockquote> element
 *
 * SOURCE OF TRUTH KEYWORDS: ExtractNewEmailContent, HtmlQuoteRemoval
 */
function extractNewContentFromHtml(html: string): string {
  if (!html) return ''

  let cleanHtml = html

  // Gmail: Remove everything starting from gmail_quote container
  // The new content is BEFORE this element
  // Pattern: <div class="gmail_quote..."> or <div class="gmail_quote_container...">
  const gmailQuotePatterns = [
    /<div[^>]*class="[^"]*gmail_quote[^"]*"[^>]*>[\s\S]*$/i,
    /<div[^>]*class="[^"]*gmail_quote_container[^"]*"[^>]*>[\s\S]*$/i,
  ]
  for (const pattern of gmailQuotePatterns) {
    cleanHtml = cleanHtml.replace(pattern, '')
  }

  // Outlook: Remove everything starting from appendonsend div
  cleanHtml = cleanHtml.replace(/<div[^>]*id="appendonsend"[^>]*>[\s\S]*$/i, '')

  // Outlook: Remove everything starting from divider + header pattern
  // Pattern: <hr> followed by From:/Date:/Subject: headers
  cleanHtml = cleanHtml.replace(/<hr[^>]*>[\s\S]*<b>From:<\/b>[\s\S]*$/i, '')

  // Apple Mail: Remove blockquotes with type="cite"
  cleanHtml = cleanHtml.replace(/<blockquote[^>]*type="cite"[^>]*>[\s\S]*?<\/blockquote>/gi, '')

  // Generic: Remove any blockquote elements with gmail_quote class
  cleanHtml = cleanHtml.replace(/<blockquote[^>]*class="[^"]*gmail_quote[^"]*"[^>]*>[\s\S]*?<\/blockquote>/gi, '')

  // Remove tracking pixels (1x1 images, display:none images)
  cleanHtml = cleanHtml.replace(/<img[^>]*(width="1"|height="1"|display:\s*none)[^>]*>/gi, '')

  // Convert to plain text
  const text = stripHtmlTags(cleanHtml)

  return text
}

/**
 * Extract NEW email content - prefers HTML parsing, falls back to text patterns
 *
 * WHY: HTML has structural markers (classes, elements) that are more reliable than text patterns
 * HOW:
 * 1. If HTML available: Extract content by removing quoted sections from HTML structure
 * 2. If only text available: Use pattern matching (less reliable but better than nothing)
 *
 * SOURCE OF TRUTH KEYWORDS: ExtractEmailBody, InboundEmailParsing
 */
function extractNewEmailContent(html: string | null, text: string | null): string {
  // Prefer HTML path - it has reliable structural markers
  if (html && html.trim()) {
    const extracted = extractNewContentFromHtml(html)
    if (extracted.trim()) {
      return extracted
    }
  }

  // Fall back to text if HTML extraction failed or wasn't available
  if (text && text.trim()) {
    return extractNewContentFromText(text)
  }

  // Last resort: strip HTML tags from raw HTML
  return html ? stripHtmlTags(html) : ''
}

/**
 * Extract NEW content from plain text email (fallback when HTML not available)
 *
 * WHY: Some emails only have text version, need pattern matching
 * HOW: Detect quote markers and remove everything after them
 *
 * NOTE: This is less reliable than HTML parsing because:
 * - Gmail often concatenates lines without proper newlines
 * - Pattern variations across email clients
 */
function extractNewContentFromText(text: string): string {
  if (!text) return ''

  const lines = text.split('\n')
  const cleanLines: string[] = []
  let hitQuoteMarker = false

  for (const line of lines) {
    const trimmedLine = line.trim()

    // Skip if we've already hit a quote marker
    if (hitQuoteMarker) continue

    // Detect "On [date], [name] wrote:" pattern (Gmail, Apple Mail)
    if (/^On\s+.+wrote:$/i.test(trimmedLine)) {
      hitQuoteMarker = true
      continue
    }

    // Detect Outlook "From:" header pattern (only if we have some content already)
    if (/^From:\s+.+$/i.test(trimmedLine) && cleanLines.length > 0) {
      hitQuoteMarker = true
      continue
    }

    // Detect "-----Original Message-----" (Outlook)
    if (/^-{3,}\s*Original Message\s*-{3,}$/i.test(trimmedLine)) {
      hitQuoteMarker = true
      continue
    }

    // Detect "________________________________" (Outlook divider)
    if (/^_{10,}$/.test(trimmedLine)) {
      hitQuoteMarker = true
      continue
    }

    // Skip lines that start with ">" (quoted text)
    if (trimmedLine.startsWith('>')) {
      continue
    }

    cleanLines.push(line)
  }

  // Remove trailing empty lines
  while (cleanLines.length > 0 && cleanLines[cleanLines.length - 1].trim() === '') {
    cleanLines.pop()
  }

  return cleanLines.join('\n').trim()
}

// ============================================================================
// WEBHOOK EVENT ROUTER
// ============================================================================

/**
 * Handle email status update events from Resend
 *
 * WHY: Track email delivery lifecycle for sent messages
 * HOW: Map Resend event types to MessageStatus enum and update database
 *
 * EVENT LIFECYCLE:
 * email.sent → SENT (queued for delivery)
 * email.delivered → DELIVERED (reached recipient server)
 * email.opened → OPENED (recipient opened, if tracking enabled)
 * email.bounced → BOUNCED (permanently rejected)
 * email.failed → FAILED (failed to send)
 * email.complained → BOUNCED (marked as spam)
 *
 * SOURCE OF TRUTH KEYWORDS: HandleEmailStatus, EmailStatusWebhook
 */
async function handleEmailStatusEvent(
  event: ResendWebhookEvent
): Promise<{ success: boolean; error?: string }> {
  const { data, type } = event
  const emailId = data.email_id

  try {
    // Map Resend event type to our MessageStatus enum
    const statusMap: Record<string, 'SENT' | 'DELIVERED' | 'OPENED' | 'BOUNCED' | 'FAILED'> = {
      'email.sent': 'SENT',
      'email.delivered': 'DELIVERED',
      'email.opened': 'OPENED',
      'email.bounced': 'BOUNCED',
      'email.failed': 'FAILED',
      'email.complained': 'BOUNCED', // Spam complaints are treated as bounces
    }

    const newStatus = statusMap[type]
    if (!newStatus) {
      return { success: true }
    }

    // Find message by resendMessageId (stored when we send emails)
    const message = await prisma.message.findFirst({
      where: {
        resendMessageId: emailId,
        deletedAt: null,
      },
      select: {
        id: true,
        conversationId: true,
        organizationId: true,
        status: true,
      },
    })

    if (!message) {
      // Message not found - could be from a different system or deleted
      return { success: true }
    }

    // Only update if the new status is a progression (don't go backwards)
    // Status order: DRAFT < QUEUED < SENT < DELIVERED < OPENED
    // BOUNCED and FAILED can happen at any point
    const statusOrder: Record<string, number> = {
      DRAFT: 0,
      QUEUED: 1,
      SENT: 2,
      DELIVERED: 3,
      OPENED: 4,
      BOUNCED: 99, // Terminal states
      FAILED: 99,
    }

    const currentOrder = statusOrder[message.status] ?? 0
    const newOrder = statusOrder[newStatus] ?? 0

    // Skip if trying to go backwards (unless it's a terminal state)
    if (newOrder < currentOrder && newOrder < 99) {
      return { success: true }
    }

    // Update message status
    await prisma.message.update({
      where: { id: message.id },
      data: { status: newStatus },
    })

    /**
     * Emit realtime event for live status updates in the inbox
     * WHY: Users see delivery status changes (sent → delivered → opened) instantly
     * HOW: True pub/sub via @upstash/realtime
     */
    await realtime.emit('inbox.emailStatusChanged', {
      organizationId: message.organizationId,
      conversationId: message.conversationId,
      messageId: message.id,
      status: newStatus,
    })

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Route webhook event to appropriate handler
 *
 * WHY: Central dispatcher for all Resend webhook events
 * HOW: Switch on event type and call specific handler
 */
export async function handleResendWebhookEvent(
  event: ResendWebhookEvent
): Promise<{ success: boolean; error?: string }> {
  switch (event.type) {
    case 'email.received':
      return handleEmailReceived(event)

    // Email sending status events - update message status in database
    case 'email.sent':
    case 'email.delivered':
    case 'email.bounced':
    case 'email.complained':
    case 'email.opened':
    case 'email.failed':
      return handleEmailStatusEvent(event)

    default:
      return { success: true }
  }
}
