/**
 * Email Service - Resend Integration Layer
 *
 * WHY: Provides unified abstraction for email sending across the platform
 * - Transactional: Platform emails (invitations, password resets, etc.) - uses default domain
 * - Marketing: Client/Studio campaigns - uses organization's verified domain
 *
 * HOW: Developers call sendTransactionalEmail() or sendMarketingEmail()
 * with the template name and data. The service handles provider integration.
 *
 * PROVIDER: Resend (https://resend.com)
 */

import 'server-only'
import { resend, RESEND_DEFAULT_FROM } from '@/lib/config/resend'
import { getVerifiedEmailDomain } from './email-domain.service'
import { chargeForEmail } from './wallet.service'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Transactional email types (platform-level)
 * These are sent by the platform itself for system operations
 */
export type TransactionalEmailType =
  | 'organization-invitation'
  | 'team-invitation'
  | 'password-reset'
  | 'email-verification'
  | 'two-factor-code'
  | 'payment-failed'
  | 'subscription-canceled'
  | 'subscription-reactivated'
  | 'template-approval-request'

/**
 * Marketing email types (client/studio-level)
 * These are sent by clients or studios to their customers
 */
export type MarketingEmailType = 'campaign' | 'newsletter' | 'promotional'

/**
 * Base email data that all emails require
 */
interface BaseEmailData {
  to: string
  subject: string
}

/**
 * Organization invitation email data
 */
export interface OrganizationInvitationEmailData extends BaseEmailData {
  inviterName: string
  organizationName: string
  invitationLink: string
  role?: string
  /** Organization ID - used to get verified domain for sending */
  organizationId?: string
}

/**
 * Payment failed email data
 */
export interface PaymentFailedEmailData extends BaseEmailData {
  organizationName: string
  attemptCount: number
  nextRetryDate?: Date
  updatePaymentLink: string
}

/**
 * Subscription event email data (canceled/reactivated)
 */
export interface SubscriptionEventEmailData extends BaseEmailData {
  organizationName: string
  planName: string
  eventDate: Date
  periodEnd?: Date
}

/**
 * Generic transactional email data
 */
export interface TransactionalEmailData extends BaseEmailData {
  template: TransactionalEmailType
  data: Record<string, unknown>
}

/**
 * Marketing email data (future)
 */
export interface MarketingEmailData extends BaseEmailData {
  template: MarketingEmailType
  data: Record<string, unknown>
  fromOrganizationId?: string
  fromTeamId?: string
  /** Optional explicit sender address override (e.g., "Acme Support <noreply@acme.com>"). Takes priority over domain auto-resolution. */
  from?: string
}

// ============================================================================
// TRANSACTIONAL EMAILS (Platform-level)
// ============================================================================

/**
 * Generate beautiful modern invitation email HTML
 *
 * DESIGN: Minimal, clean, modern design with subtle gradients
 * FEATURES:
 * - Dark mode compatible colors
 * - Responsive layout
 * - Clear CTA button
 * - Professional typography
 */
function generateInvitationEmailHtml(data: OrganizationInvitationEmailData): string {
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Mochi'
  const currentYear = new Date().getFullYear()

  // Format role name for display (remove prefixes and clean up)
  const displayRole = data.role
    ? data.role.includes('_')
      ? data.role.split('_').slice(1).join(' ')
      : data.role
    : null

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>You're invited to join ${data.organizationName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden;">

          <!-- Header with gradient accent -->
          <tr>
            <td style="background: linear-gradient(135deg, #18181b 0%, #27272a 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600; letter-spacing: -0.025em;">
                ${appName}
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <!-- Invitation Badge -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <span style="display: inline-block; background-color: #f4f4f5; color: #71717a; font-size: 12px; font-weight: 500; padding: 6px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em;">
                      Team Invitation
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Main Message -->
              <h2 style="margin: 0 0 16px 0; color: #18181b; font-size: 22px; font-weight: 600; text-align: center; line-height: 1.3;">
                You've been invited to join<br/>
                <span style="color: #18181b;">${data.organizationName}</span>
              </h2>

              <p style="margin: 0 0 32px 0; color: #52525b; font-size: 15px; line-height: 1.6; text-align: center;">
                <strong style="color: #18181b;">${data.inviterName}</strong> has invited you to collaborate${displayRole ? ` as <strong style="color: #18181b;">${displayRole}</strong>` : ''}.
              </p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom: 32px;">
                    <a href="${data.invitationLink}"
                       style="display: inline-block; background-color: #18181b; color: #ffffff; font-size: 15px; font-weight: 500; padding: 14px 32px; text-decoration: none; border-radius: 10px; transition: background-color 0.2s;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="border-bottom: 1px solid #e4e4e7;"></td>
                </tr>
              </table>

              <!-- Link fallback -->
              <p style="margin: 0 0 8px 0; color: #71717a; font-size: 13px; text-align: center;">
                If the button doesn't work, copy and paste this link:
              </p>
              <p style="margin: 0; color: #a1a1aa; font-size: 12px; text-align: center; word-break: break-all; background-color: #f4f4f5; padding: 12px; border-radius: 8px;">
                ${data.invitationLink}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #fafafa; padding: 24px 40px; border-top: 1px solid #f4f4f5;">
              <p style="margin: 0 0 8px 0; color: #71717a; font-size: 13px; text-align: center; line-height: 1.5;">
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
              <p style="margin: 0; color: #a1a1aa; font-size: 12px; text-align: center;">
                &copy; ${currentYear} ${appName}. All rights reserved.
              </p>
            </td>
          </tr>

        </table>

        <!-- Bottom spacing -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 520px;">
          <tr>
            <td style="padding: 24px 0; text-align: center;">
              <p style="margin: 0; color: #a1a1aa; font-size: 11px;">
                This email was sent by ${appName}
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

/**
 * Send organization invitation email
 *
 * WHY: Invite users to join an organization
 * HOW: Tries organization's verified domain first, falls back to platform default
 *
 * WALLET CHARGING: If organizationId is provided, charges the organization's wallet
 * for the email. Cost is taken from feature-gates.ts (SOURCE OF TRUTH).
 *
 * SENDER PRIORITY:
 * 1. Organization's verified email domain (if organizationId provided and domain exists)
 * 2. Platform default sender from ENV (RESEND_FROM_EMAIL)
 */
export async function sendOrganizationInvitationEmail(
  data: OrganizationInvitationEmailData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Determine sender: try org's verified domain first, then fall back to default
    let fromAddress = RESEND_DEFAULT_FROM

    if (data.organizationId) {
      const verifiedDomain = await getVerifiedEmailDomain(data.organizationId)
      if (verifiedDomain) {
        // Use org's verified domain with app name
        const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Mochi'
        fromAddress = `${appName} <noreply@${verifiedDomain.name}>`
      }
    }

    const { data: result, error } = await resend.emails.send({
      from: fromAddress,
      to: data.to,
      subject: data.subject,
      html: generateInvitationEmailHtml(data),
    })

    if (error) {
      return { success: false, error: error.message }
    }

    /**
     * Charge wallet for email usage (only if organizationId provided)
     *
     * WHY: PAYG email charging - organizations pay per email sent
     * HOW: Uses chargeForEmail which gets cost from feature-gates.ts
     *
     * NOTE: We charge AFTER successful send to avoid charging for failed emails
     */
    if (data.organizationId) {
      try {
        await chargeForEmail(
          data.organizationId,
          `Invitation email to ${data.to}`,
          {
            type: 'organization-invitation',
            recipient: data.to,
            messageId: result?.id,
          }
        )
      } catch (chargeError) {
        // Log but don't fail the email send - email was already sent
        console.error('Failed to charge for email:', chargeError)
      }
    }

    return { success: true, messageId: result?.id }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send email',
    }
  }
}

/**
 * Send payment failed email
 *
 * WHY: Notify users when payment processing fails
 * HOW: Uses Resend with platform default sender
 */
export async function sendPaymentFailedEmail(
  data: PaymentFailedEmailData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const retryInfo = data.nextRetryDate
      ? `We'll retry on ${data.nextRetryDate.toLocaleDateString()}.`
      : 'Please update your payment method to continue your subscription.'

    const { data: result, error } = await resend.emails.send({
      from: RESEND_DEFAULT_FROM,
      to: data.to,
      subject: data.subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Payment Failed for ${data.organizationName}</h2>
          <p>We were unable to process your payment (attempt ${data.attemptCount}).</p>
          <p>${retryInfo}</p>
          <p style="margin: 24px 0;">
            <a href="${data.updatePaymentLink}"
               style="background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Update Payment Method
            </a>
          </p>
        </div>
      `,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, messageId: result?.id }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send email',
    }
  }
}

/**
 * Send subscription event email (canceled/reactivated)
 *
 * WHY: Notify users of subscription status changes
 * HOW: Uses Resend with platform default sender
 */
export async function sendSubscriptionEventEmail(
  data: SubscriptionEventEmailData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const periodInfo = data.periodEnd
      ? `Access continues until ${data.periodEnd.toLocaleDateString()}.`
      : ''

    const { data: result, error } = await resend.emails.send({
      from: RESEND_DEFAULT_FROM,
      to: data.to,
      subject: data.subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Subscription Update for ${data.organizationName}</h2>
          <p>Your <strong>${data.planName}</strong> subscription status has changed on ${data.eventDate.toLocaleDateString()}.</p>
          ${periodInfo ? `<p>${periodInfo}</p>` : ''}
        </div>
      `,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, messageId: result?.id }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send email',
    }
  }
}

// ============================================================================
// PASSWORD RESET EMAILS (Platform-level, no wallet charging)
// ============================================================================

/**
 * Password reset email data
 *
 * SOURCE OF TRUTH: PasswordResetEmailData — defines the shape for password reset email payloads.
 */
export interface PasswordResetEmailData {
  /** Recipient email address */
  to: string
  /** Full reset URL with token (generated by Better Auth) */
  resetLink: string
}

/**
 * Generate password reset email HTML
 *
 * DESIGN: Same minimal Apple-style template as other platform emails.
 * Simple greeting, explanation, CTA button, and link fallback.
 */
function generatePasswordResetEmailHtml(data: PasswordResetEmailData): string {
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Mochi'
  const currentYear = new Date().getFullYear()

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Reset your password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden;">

          <!-- Header with gradient accent -->
          <tr>
            <td style="background: linear-gradient(135deg, #18181b 0%, #27272a 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600; letter-spacing: -0.025em;">
                ${appName}
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <!-- Badge -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <span style="display: inline-block; background-color: #f4f4f5; color: #71717a; font-size: 12px; font-weight: 500; padding: 6px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em;">
                      Password Reset
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Main Message -->
              <h2 style="margin: 0 0 16px 0; color: #18181b; font-size: 22px; font-weight: 600; text-align: center; line-height: 1.3;">
                Reset your password
              </h2>

              <p style="margin: 0 0 32px 0; color: #52525b; font-size: 15px; line-height: 1.6; text-align: center;">
                We received a request to reset your password. Click the button below to choose a new one. If you didn't request this, you can safely ignore this email.
              </p>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom: 32px;">
                    <a href="${data.resetLink}"
                       style="display: inline-block; background-color: #18181b; color: #ffffff; font-size: 15px; font-weight: 500; padding: 14px 32px; text-decoration: none; border-radius: 10px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="border-bottom: 1px solid #e4e4e7;"></td>
                </tr>
              </table>

              <!-- Link fallback -->
              <p style="margin: 0 0 8px 0; color: #71717a; font-size: 13px; text-align: center;">
                If the button doesn't work, copy and paste this link:
              </p>
              <p style="margin: 0; color: #a1a1aa; font-size: 12px; text-align: center; word-break: break-all; background-color: #f4f4f5; padding: 12px; border-radius: 8px;">
                ${data.resetLink}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #fafafa; padding: 24px 40px; border-top: 1px solid #f4f4f5;">
              <p style="margin: 0 0 8px 0; color: #71717a; font-size: 13px; text-align: center; line-height: 1.5;">
                This link will expire shortly. If you didn't request a password reset, no action is needed.
              </p>
              <p style="margin: 0; color: #a1a1aa; font-size: 12px; text-align: center;">
                &copy; ${currentYear} ${appName}. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

/**
 * Send password reset email
 *
 * WHY: Allows users to reset their forgotten password
 * HOW: Called by Better Auth's sendResetPassword callback. Sends an email
 *      with a reset link via Resend using the platform default sender.
 *
 * NO WALLET CHARGING: This is a platform-level transactional email,
 * not tied to any organization. Users don't pay for password resets.
 *
 * SOURCE OF TRUTH KEYWORDS: SendPasswordResetEmail, PasswordReset
 */
export async function sendPasswordResetEmail(
  data: PasswordResetEmailData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Mochi'

    const { data: result, error } = await resend.emails.send({
      from: RESEND_DEFAULT_FROM,
      to: data.to,
      subject: `Reset your ${appName} password`,
      html: generatePasswordResetEmailHtml(data),
    })

    if (error) {
      console.error('Failed to send password reset email:', error)
      return { success: false, error: error.message }
    }

    return { success: true, messageId: result?.id }
  } catch (err) {
    console.error('Password reset email error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send password reset email',
    }
  }
}

// ============================================================================
// TEMPLATE APPROVAL REQUEST EMAIL
// ============================================================================

/**
 * Data shape for the template approval request email.
 */
interface TemplateApprovalRequestEmailData {
  to: string
  subject: string
  templateName: string
  creatorOrgName: string
  price: string
  category: string
  reviewLink: string
}

/**
 * Generate the HTML for the template approval request email.
 * Notifies the portal owner that a paid template is awaiting review.
 */
function generateTemplateApprovalEmailHtml(data: TemplateApprovalRequestEmailData): string {
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Mochi'
  const currentYear = new Date().getFullYear()

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Template Awaiting Approval</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #18181b 0%, #27272a 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">${appName}</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <span style="display: inline-block; background-color: #fef3c7; color: #92400e; font-size: 12px; font-weight: 500; padding: 6px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em;">
                      Approval Required
                    </span>
                  </td>
                </tr>
              </table>
              <h2 style="margin: 0 0 16px 0; color: #18181b; font-size: 22px; font-weight: 600; text-align: center;">
                New Template Awaiting Approval
              </h2>
              <p style="margin: 0 0 24px 0; color: #52525b; font-size: 15px; line-height: 1.6; text-align: center;">
                A paid template has been submitted for review.
              </p>
              <!-- Template Details -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f4f5; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 8px 0; color: #71717a; font-size: 13px;">Template Name</p>
                    <p style="margin: 0 0 16px 0; color: #18181b; font-size: 15px; font-weight: 600;">${data.templateName}</p>
                    <p style="margin: 0 0 8px 0; color: #71717a; font-size: 13px;">Creator</p>
                    <p style="margin: 0 0 16px 0; color: #18181b; font-size: 15px;">${data.creatorOrgName}</p>
                    <p style="margin: 0 0 8px 0; color: #71717a; font-size: 13px;">Category</p>
                    <p style="margin: 0 0 16px 0; color: #18181b; font-size: 15px;">${data.category}</p>
                    <p style="margin: 0 0 8px 0; color: #71717a; font-size: 13px;">Price</p>
                    <p style="margin: 0; color: #18181b; font-size: 15px; font-weight: 600;">${data.price}</p>
                  </td>
                </tr>
              </table>
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <a href="${data.reviewLink}" style="display: inline-block; background-color: #18181b; color: #ffffff; font-size: 15px; font-weight: 500; padding: 14px 32px; text-decoration: none; border-radius: 10px;">
                      Review Template
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #fafafa; padding: 24px 40px; border-top: 1px solid #f4f4f5;">
              <p style="margin: 0; color: #a1a1aa; font-size: 12px; text-align: center;">
                &copy; ${currentYear} ${appName}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

/**
 * Send template approval request email to the portal owner.
 *
 * WHY: When a paid template is published and auto-approve is disabled,
 * the portal owner receives this email to review and approve/reject it.
 */
async function sendTemplateApprovalRequestEmail(
  data: TemplateApprovalRequestEmailData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const { data: result, error } = await resend.emails.send({
      from: RESEND_DEFAULT_FROM,
      to: data.to,
      subject: data.subject,
      html: generateTemplateApprovalEmailHtml(data),
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, messageId: result?.id }
  } catch (err) {
    console.error('Template approval email error:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send template approval email',
    }
  }
}

/**
 * Generic transactional email sender
 *
 * USAGE:
 * await sendTransactionalEmail({
 *   template: 'password-reset',
 *   to: 'user@example.com',
 *   subject: 'Reset your password',
 *   data: { resetLink: 'https://...' }
 * })
 */
export async function sendTransactionalEmail(
  emailData: TransactionalEmailData
): Promise<{ success: boolean; messageId?: string }> {
  const { template, to, subject, data } = emailData

  // Route to specific email handler based on template
  switch (template) {
    case 'organization-invitation':
      return sendOrganizationInvitationEmail({
        to,
        subject,
        inviterName: data.inviterName as string,
        organizationName: data.organizationName as string,
        invitationLink: data.invitationLink as string,
        role: data.role as string | undefined,
      })

    case 'payment-failed':
      return sendPaymentFailedEmail({
        to,
        subject,
        organizationName: data.organizationName as string,
        attemptCount: data.attemptCount as number,
        nextRetryDate: data.nextRetryDate as Date | undefined,
        updatePaymentLink: data.updatePaymentLink as string,
      })

    case 'subscription-canceled':
    case 'subscription-reactivated':
      return sendSubscriptionEventEmail({
        to,
        subject,
        organizationName: data.organizationName as string,
        planName: data.planName as string,
        eventDate: data.eventDate as Date,
        periodEnd: data.periodEnd as Date | undefined,
      })

    case 'password-reset':
      return sendPasswordResetEmail({
        to,
        resetLink: data.resetLink as string,
      })

    case 'template-approval-request':
      return sendTemplateApprovalRequestEmail({
        to,
        subject,
        templateName: data.templateName as string,
        creatorOrgName: data.creatorOrgName as string,
        price: data.price as string,
        category: data.category as string,
        reviewLink: data.reviewLink as string,
      })

    // Add more transactional email handlers as needed
    case 'team-invitation':
    case 'email-verification':
    case 'two-factor-code':
      // TODO: Implement these handlers
      return { success: true, messageId: `mock-${Date.now()}` }

    default:
      throw new Error(`Unknown transactional email template: ${template}`)
  }
}

// ============================================================================
// MARKETING EMAILS (Client/Studio-level)
// ============================================================================

/**
 * Send marketing email from organization's custom domain
 *
 * WHY: Allow organizations to send emails from their branded domain
 * HOW: Looks up verified domain for org, falls back to platform default
 *
 * WALLET CHARGING: If fromOrganizationId is provided, charges the organization's
 * wallet for the email. Cost is taken from feature-gates.ts (SOURCE OF TRUTH).
 *
 * FEATURES:
 * - Uses organization's verified custom domain when available
 * - Falls back to platform default if no verified domain
 * - Supports unsubscribe links (future: should be required by law)
 *
 * USAGE:
 * await sendMarketingEmail({
 *   template: 'campaign',
 *   to: 'customer@example.com',
 *   subject: 'Special Offer',
 *   data: { campaignData },
 *   fromOrganizationId: 'org-123'
 * })
 */
export async function sendMarketingEmail(
  emailData: MarketingEmailData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Determine sender: explicit from > org domain > default
    let fromAddress = RESEND_DEFAULT_FROM

    if (emailData.from) {
      // Use the explicit sender address provided by the automation config
      fromAddress = emailData.from
    } else if (emailData.fromOrganizationId) {
      const verifiedDomain = await getVerifiedEmailDomain(
        emailData.fromOrganizationId
      )
      if (verifiedDomain) {
        // Use org's custom domain
        fromAddress = `noreply@${verifiedDomain.name}`
      }
    }

    /**
     * Send as HTML when template content is provided, plain text otherwise.
     * WHY: Template mode produces full HTML emails that must be rendered by the client.
     *      Body mode produces plain text for simpler deliverability.
     */
    const hasHtml = !!emailData.data.html
    const { data: result, error } = await resend.emails.send({
      from: fromAddress,
      to: emailData.to,
      subject: emailData.subject,
      ...(hasHtml
        ? { html: String(emailData.data.html) }
        : { text: String(emailData.data.body || '') }),
    })

    if (error) {
      return { success: false, error: error.message }
    }

    /**
     * Charge wallet for email usage (only if fromOrganizationId provided)
     *
     * WHY: PAYG email charging - organizations pay per email sent
     * HOW: Uses chargeForEmail which gets cost from feature-gates.ts
     *
     * NOTE: We charge AFTER successful send to avoid charging for failed emails
     */
    if (emailData.fromOrganizationId) {
      try {
        await chargeForEmail(
          emailData.fromOrganizationId,
          `Marketing email to ${emailData.to}`,
          {
            type: emailData.template,
            recipient: emailData.to,
            messageId: result?.id,
          }
        )
      } catch (chargeError) {
        // Log but don't fail the email send - email was already sent
        console.error('Failed to charge for email:', chargeError)
      }
    }

    return { success: true, messageId: result?.id }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send email',
    }
  }
}

// ============================================================================
// CONTRACT EMAILS
// ============================================================================

/**
 * Contract email data
 *
 * SOURCE OF TRUTH: This interface defines the shape for all contract email payloads.
 * Used when sending contract review notifications to recipients.
 */
export interface ContractEmailData {
  /** Recipient email address */
  to: string
  /** Name of the contract being sent for review */
  contractName: string
  /** Unique access token used to build the contract viewing URL */
  accessToken: string
  /** Organization ID - used to resolve verified domain and charge wallet */
  organizationId: string
  /** Optional recipient name for personalized greeting */
  recipientName?: string
}

/**
 * Generate beautiful contract review email HTML
 *
 * DESIGN: Minimal, premium, Apple-feeling design matching the invitation email style
 * FEATURES:
 * - Table-based layout for maximum email client compatibility
 * - Dark gradient header with app branding
 * - "Contract Ready" badge
 * - Contract name displayed in a subtle card
 * - Clear CTA button linking to the contract view page
 * - Link fallback for clients that don't render buttons
 * - Footer with branding and copyright
 * - Same color scheme as invitation email (#18181b header, #f4f4f5 background)
 */
function generateContractEmailHtml(data: ContractEmailData): string {
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Mochi'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const contractViewUrl = `${appUrl}/contract/view/${data.accessToken}`

  /**
   * Ultra-minimal Apple-style email.
   * WHY: Previous design was too heavy with cards, badges, gradients, and footers.
   * This version is clean, airy, and trustworthy — just text and a single button.
   */
  const greeting = data.recipientName ? `Hi ${data.recipientName},` : 'Hi,'

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>${data.contractName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #ffffff; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 60px 24px 48px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width: 460px; width: 100%;">

          <!-- Greeting + Message -->
          <tr>
            <td style="padding-bottom: 32px;">
              <p style="margin: 0 0 16px 0; color: #1d1d1f; font-size: 17px; line-height: 1.5; font-weight: 400;">
                ${greeting}
              </p>
              <p style="margin: 0; color: #1d1d1f; font-size: 17px; line-height: 1.5; font-weight: 400;">
                A contract has been shared with you for review and signature.
              </p>
            </td>
          </tr>

          <!-- Contract name -->
          <tr>
            <td style="padding-bottom: 32px;">
              <p style="margin: 0; color: #86868b; font-size: 13px; line-height: 1.4; font-weight: 500; letter-spacing: 0.02em; text-transform: uppercase;">
                Contract
              </p>
              <p style="margin: 4px 0 0 0; color: #1d1d1f; font-size: 17px; line-height: 1.4; font-weight: 600;">
                ${data.contractName}
              </p>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding-bottom: 40px;">
              <a href="${contractViewUrl}"
                 style="display: inline-block; background-color: #0071e3; color: #ffffff; font-size: 17px; font-weight: 400; padding: 12px 24px; text-decoration: none; border-radius: 980px; letter-spacing: -0.01em;">
                Review Contract
              </a>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding-bottom: 20px;">
              <div style="height: 1px; background-color: #d2d2d7;"></div>
            </td>
          </tr>

          <!-- Link fallback -->
          <tr>
            <td>
              <p style="margin: 0 0 4px 0; color: #86868b; font-size: 12px; line-height: 1.5;">
                Or copy this link into your browser:
              </p>
              <p style="margin: 0; color: #86868b; font-size: 12px; line-height: 1.5; word-break: break-all;">
                ${contractViewUrl}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

/**
 * Send contract review email to a recipient
 *
 * WHY: Notify recipients that a contract is ready for their review
 * HOW: Tries organization's verified domain first, falls back to platform default
 *
 * WALLET CHARGING: Charges the organization's wallet for the email after successful send.
 * Cost is taken from feature-gates.ts (SOURCE OF TRUTH).
 *
 * SENDER PRIORITY:
 * 1. Organization's verified email domain (if domain exists and is verified)
 * 2. Platform default sender from ENV (RESEND_FROM_EMAIL)
 */
export async function sendContractEmail(
  data: ContractEmailData
): Promise<{ success: boolean; messageId?: string; error?: string; html?: string; fromAddress?: string }> {
  try {
    // Determine sender: try org's verified domain first, then fall back to default
    let fromAddress = RESEND_DEFAULT_FROM

    const verifiedDomain = await getVerifiedEmailDomain(data.organizationId)
    if (verifiedDomain) {
      // Use org's verified domain with app name for professional branding
      const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Mochi'
      fromAddress = `${appName} <noreply@${verifiedDomain.name}>`
    }

    /** Store generated HTML so we can return it for inbox recording */
    const html = generateContractEmailHtml(data)

    const { data: result, error } = await resend.emails.send({
      from: fromAddress,
      to: data.to,
      subject: `"${data.contractName}" — Ready for your review`,
      html,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    /**
     * Charge wallet for email usage
     *
     * WHY: PAYG email charging - organizations pay per email sent
     * HOW: Uses chargeForEmail which gets cost from feature-gates.ts
     *
     * NOTE: We charge AFTER successful send to avoid charging for failed emails
     */
    try {
      await chargeForEmail(
        data.organizationId,
        `Contract email to ${data.to}`,
        {
          type: 'contract-review',
          recipient: data.to,
          messageId: result?.id,
        }
      )
    } catch (chargeError) {
      // Log but don't fail the email send - email was already sent
      console.error('Failed to charge for contract email:', chargeError)
    }

    return { success: true, messageId: result?.id, html, fromAddress }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send contract email',
    }
  }
}

// ============================================================================
// CONTRACT SIGNED CONFIRMATION EMAIL
// ============================================================================

/**
 * Generate the "contract signed" confirmation email HTML
 *
 * DESIGN: Same minimal Apple-style template as the contract review email,
 * but messaging confirms the contract has been signed and provides a link
 * to view the completed contract at any time.
 */
function generateContractSignedEmailHtml(data: ContractEmailData): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const contractViewUrl = `${appUrl}/contract/view/${data.accessToken}`

  const greeting = data.recipientName ? `Hi ${data.recipientName},` : 'Hi,'

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>${data.contractName} — Signed</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #ffffff; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 60px 24px 48px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width: 460px; width: 100%;">

          <!-- Greeting + Message -->
          <tr>
            <td style="padding-bottom: 32px;">
              <p style="margin: 0 0 16px 0; color: #1d1d1f; font-size: 17px; line-height: 1.5; font-weight: 400;">
                ${greeting}
              </p>
              <p style="margin: 0; color: #1d1d1f; font-size: 17px; line-height: 1.5; font-weight: 400;">
                Your contract has been successfully signed and authorized. You can view the completed contract at any time using the link below.
              </p>
            </td>
          </tr>

          <!-- Contract name -->
          <tr>
            <td style="padding-bottom: 32px;">
              <p style="margin: 0; color: #86868b; font-size: 13px; line-height: 1.4; font-weight: 500; letter-spacing: 0.02em; text-transform: uppercase;">
                Contract
              </p>
              <p style="margin: 4px 0 0 0; color: #1d1d1f; font-size: 17px; line-height: 1.4; font-weight: 600;">
                ${data.contractName}
              </p>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding-bottom: 40px;">
              <a href="${contractViewUrl}"
                 style="display: inline-block; background-color: #34c759; color: #ffffff; font-size: 17px; font-weight: 400; padding: 12px 24px; text-decoration: none; border-radius: 980px; letter-spacing: -0.01em;">
                View Signed Contract
              </a>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding-bottom: 20px;">
              <div style="height: 1px; background-color: #d2d2d7;"></div>
            </td>
          </tr>

          <!-- Link fallback -->
          <tr>
            <td>
              <p style="margin: 0 0 4px 0; color: #86868b; font-size: 12px; line-height: 1.5;">
                Or copy this link into your browser:
              </p>
              <p style="margin: 0; color: #86868b; font-size: 12px; line-height: 1.5; word-break: break-all;">
                ${contractViewUrl}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

/**
 * Send contract signed confirmation email to the recipient
 *
 * WHY: Notify the signer that their contract has been authorized and provide
 * a link to access the completed contract for their records.
 *
 * SENDER PRIORITY: Same as sendContractEmail —
 * 1. Organization's verified email domain (if exists)
 * 2. Platform default sender from ENV (RESEND_FROM_EMAIL)
 *
 * WALLET CHARGING: Charges the organization's wallet after successful send.
 */
export async function sendContractSignedEmail(
  data: ContractEmailData
): Promise<{ success: boolean; messageId?: string; error?: string; html?: string; fromAddress?: string }> {
  try {
    /* Determine sender: try org's verified domain first, then fall back to default */
    let fromAddress = RESEND_DEFAULT_FROM

    const verifiedDomain = await getVerifiedEmailDomain(data.organizationId)
    if (verifiedDomain) {
      const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Mochi'
      fromAddress = `${appName} <noreply@${verifiedDomain.name}>`
    }

    /** Store generated HTML so we can return it for inbox recording */
    const html = generateContractSignedEmailHtml(data)

    const { data: result, error } = await resend.emails.send({
      from: fromAddress,
      to: data.to,
      subject: `"${data.contractName}" — Signed & Authorized`,
      html,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    /**
     * Charge wallet for email usage
     * NOTE: We charge AFTER successful send to avoid charging for failed emails
     */
    try {
      await chargeForEmail(
        data.organizationId,
        `Contract signed confirmation to ${data.to}`,
        {
          type: 'contract-signed',
          recipient: data.to,
          messageId: result?.id,
        }
      )
    } catch (chargeError) {
      // Log but don't fail — email was already sent
      console.error('Failed to charge for contract signed email:', chargeError)
    }

    return { success: true, messageId: result?.id, html, fromAddress }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send contract signed email',
    }
  }
}

// ============================================================================
// INVOICE EMAILS
// ============================================================================

/**
 * Data required to send an invoice email to a recipient.
 *
 * SOURCE OF TRUTH: InvoiceEmailData — defines the shape for all invoice email payloads.
 * Used when notifying a lead that an invoice is ready for payment.
 */
export interface InvoiceEmailData {
  /** Recipient email address */
  to: string
  /** Display name of the invoice */
  invoiceName: string
  /** Auto-generated invoice number (e.g. "INV-0001") */
  invoiceNumber: string
  /** Formatted total amount string (e.g. "$250.00") */
  totalAmount: string
  /** Currency code (e.g. "usd") */
  currency: string
  /** Formatted due date string or null if no due date set */
  dueDate: string | null
  /** Access token for the public invoice payment link */
  accessToken: string
  /** Organization ID — used to resolve verified domain and charge wallet */
  organizationId: string
  /** Optional recipient name for personalized greeting */
  recipientName?: string
}

/**
 * Generate invoice email HTML using the same minimal Apple-style template
 * as the contract emails.
 *
 * DESIGN: Ultra-minimal, clean, table-based layout for email client compatibility.
 * Shows invoice details (name, number, amount, due date) with a single CTA button
 * linking to the public invoice payment page.
 *
 * SOURCE OF TRUTH KEYWORDS: InvoiceEmailHtml, InvoiceEmailTemplate
 */
function generateInvoiceEmailHtml(data: InvoiceEmailData): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const invoiceViewUrl = `${appUrl}/invoice/${data.accessToken}`

  const greeting = data.recipientName ? `Hi ${data.recipientName},` : 'Hi,'

  /**
   * Build the invoice details block — shows key info at a glance.
   * Due date row is only included if a due date is set.
   */
  const dueDateRow = data.dueDate
    ? `
          <tr>
            <td style="padding-bottom: 12px;">
              <p style="margin: 0; color: #86868b; font-size: 13px; line-height: 1.4; font-weight: 500; letter-spacing: 0.02em; text-transform: uppercase;">
                Due Date
              </p>
              <p style="margin: 4px 0 0 0; color: #1d1d1f; font-size: 17px; line-height: 1.4; font-weight: 600;">
                ${data.dueDate}
              </p>
            </td>
          </tr>`
    : ''

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>Invoice ${data.invoiceNumber}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #ffffff; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 60px 24px 48px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="max-width: 460px; width: 100%;">

          <!-- Greeting + Message -->
          <tr>
            <td style="padding-bottom: 32px;">
              <p style="margin: 0 0 16px 0; color: #1d1d1f; font-size: 17px; line-height: 1.5; font-weight: 400;">
                ${greeting}
              </p>
              <p style="margin: 0; color: #1d1d1f; font-size: 17px; line-height: 1.5; font-weight: 400;">
                An invoice has been shared with you for review and payment.
              </p>
            </td>
          </tr>

          <!-- Invoice details block -->
          <tr>
            <td style="padding-bottom: 12px;">
              <p style="margin: 0; color: #86868b; font-size: 13px; line-height: 1.4; font-weight: 500; letter-spacing: 0.02em; text-transform: uppercase;">
                Invoice
              </p>
              <p style="margin: 4px 0 0 0; color: #1d1d1f; font-size: 17px; line-height: 1.4; font-weight: 600;">
                ${data.invoiceName}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom: 12px;">
              <p style="margin: 0; color: #86868b; font-size: 13px; line-height: 1.4; font-weight: 500; letter-spacing: 0.02em; text-transform: uppercase;">
                Invoice #
              </p>
              <p style="margin: 4px 0 0 0; color: #1d1d1f; font-size: 17px; line-height: 1.4; font-weight: 600;">
                ${data.invoiceNumber}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom: 12px;">
              <p style="margin: 0; color: #86868b; font-size: 13px; line-height: 1.4; font-weight: 500; letter-spacing: 0.02em; text-transform: uppercase;">
                Amount Due
              </p>
              <p style="margin: 4px 0 0 0; color: #1d1d1f; font-size: 17px; line-height: 1.4; font-weight: 600;">
                ${data.totalAmount}
              </p>
            </td>
          </tr>

          ${dueDateRow}

          <!-- Spacer before CTA -->
          <tr><td style="padding-bottom: 20px;"></td></tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding-bottom: 40px;">
              <a href="${invoiceViewUrl}"
                 style="display: inline-block; background-color: #0071e3; color: #ffffff; font-size: 17px; font-weight: 400; padding: 12px 24px; text-decoration: none; border-radius: 980px; letter-spacing: -0.01em;">
                View &amp; Pay Invoice
              </a>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding-bottom: 20px;">
              <div style="height: 1px; background-color: #d2d2d7;"></div>
            </td>
          </tr>

          <!-- Link fallback -->
          <tr>
            <td>
              <p style="margin: 0 0 4px 0; color: #86868b; font-size: 12px; line-height: 1.5;">
                Or copy this link into your browser:
              </p>
              <p style="margin: 0; color: #86868b; font-size: 12px; line-height: 1.5; word-break: break-all;">
                ${invoiceViewUrl}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

/**
 * Send invoice email to a recipient.
 *
 * Follows the exact same pattern as sendContractEmail():
 * 1. Determine sender (org verified domain > platform default)
 * 2. Send via Resend
 * 3. Charge wallet after successful send
 * 4. Fire-and-forget (don't fail if email fails)
 *
 * SENDER PRIORITY:
 * 1. Organization's verified email domain (if domain exists and is verified)
 * 2. Platform default sender from ENV (RESEND_FROM_EMAIL)
 *
 * WALLET CHARGING: Charges the organization's wallet after successful send.
 *
 * SOURCE OF TRUTH KEYWORDS: SendInvoiceEmail, InvoiceEmailSender
 */
export async function sendInvoiceEmail(
  data: InvoiceEmailData
): Promise<{ success: boolean; messageId?: string; error?: string; html?: string; fromAddress?: string }> {
  try {
    /* Determine sender: try org's verified domain first, then fall back to default */
    let fromAddress = RESEND_DEFAULT_FROM

    const verifiedDomain = await getVerifiedEmailDomain(data.organizationId)
    if (verifiedDomain) {
      const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Mochi'
      fromAddress = `${appName} <noreply@${verifiedDomain.name}>`
    }

    /** Store generated HTML so we can return it for inbox recording */
    const html = generateInvoiceEmailHtml(data)

    const { data: result, error } = await resend.emails.send({
      from: fromAddress,
      to: data.to,
      subject: `Invoice ${data.invoiceNumber} — Ready for payment`,
      html,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    /**
     * Charge wallet for email usage.
     * NOTE: We charge AFTER successful send to avoid charging for failed emails.
     */
    try {
      await chargeForEmail(
        data.organizationId,
        `Invoice email to ${data.to}`,
        {
          type: 'invoice-sent',
          recipient: data.to,
          messageId: result?.id,
        }
      )
    } catch (chargeError) {
      /* Log but don't fail — email was already sent */
      console.error('Failed to charge for invoice email:', chargeError)
    }

    return { success: true, messageId: result?.id, html, fromAddress }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send invoice email',
    }
  }
}
