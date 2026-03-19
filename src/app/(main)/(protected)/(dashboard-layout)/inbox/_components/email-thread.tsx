'use client'

/**
 * Email Thread Component
 *
 * WHY: Group related emails into collapsible threads with nested card design
 * HOW: Outer container borderless, inner container with muted background
 *      Focus is only for scroll positioning - no visual highlighting
 */

import { useState } from 'react'
import { format } from 'date-fns'
import {
  Mail,
  MailOpen,
  MailX,
  MailWarning,
  ChevronDown,
  ChevronRight,
  Paperclip,
  Reply,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getLeadAvatarColor } from '@/lib/utils/lead-helpers'
import { getTextColorForBackground } from '@/constants/colors'
import { ConversationMessage, Lead, MessageChannel, MessageStatus } from './types'
import { InlineReplyComposer } from './inline-reply-composer'
import { HtmlEmailRenderer } from './html-email-renderer'

/**
 * Get initials from name for avatar fallback
 */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/**
 * Email Status Indicator Component
 *
 * WHY: Show delivery status for outbound emails (sent, delivered, opened, failed, bounced)
 * HOW: Uses intuitive email envelope metaphor for status icons
 *
 * STATUS ICONS (envelope metaphor):
 * - sent: Closed envelope (gray) - email sent to mail server
 * - delivered: Closed envelope (blue) - reached recipient's inbox
 * - opened: Open envelope (green) - recipient opened the email
 * - failed: Envelope with X (red) - failed to send
 * - bounced: Envelope with warning (orange) - bounced back
 *
 * SOURCE OF TRUTH KEYWORDS: EmailStatusIndicator, DeliveryStatus
 */
function EmailStatusIndicator({ status }: { status?: MessageStatus }) {
  if (!status) return null

  // Only show for delivery-relevant statuses
  if (status === 'draft' || status === 'queued') return null

  const config: Record<
    MessageStatus,
    { icon: typeof Mail; className: string; label: string } | null
  > = {
    draft: null,
    queued: null,
    sent: {
      icon: Mail,
      className: 'text-muted-foreground/60',
      label: 'Sent',
    },
    delivered: {
      icon: Mail,
      className: 'text-blue-500',
      label: 'Delivered',
    },
    opened: {
      icon: MailOpen,
      className: 'text-emerald-500',
      label: 'Opened',
    },
    failed: {
      icon: MailX,
      className: 'text-red-500',
      label: 'Failed to send',
    },
    bounced: {
      icon: MailWarning,
      className: 'text-amber-500',
      label: 'Bounced',
    },
  }

  const statusConfig = config[status]
  if (!statusConfig) return null

  const Icon = statusConfig.icon

  return (
    <div className="flex items-center" title={statusConfig.label}>
      <Icon className={cn('size-3', statusConfig.className)} />
    </div>
  )
}

interface EmailThreadProps {
  emails: ConversationMessage[]
  lead: Lead
  focusedMessageId?: string
  /**
   * Ref to attach to the focused email for scroll positioning
   * WHY: Parent component needs to scroll to this email on initial load
   * NOTE: Accepts nullable ref type since useRef(null) produces RefObject<T | null>
   */
  focusedMessageRef?: React.RefObject<HTMLDivElement | null>
  /** Callback when user clicks reply on an email */
  onReply?: (messageId: string) => void
  /** ID of message currently being replied to */
  activeReplyMessageId?: string | null
  /** Callback when inline reply is sent */
  onSendReply?: (data: {
    channel: MessageChannel
    subject?: string
    body: string
  }) => void
  /** Callback when inline reply is cancelled */
  onCancelReply?: () => void
  /** Whether reply is being sent */
  isSendingReply?: boolean
}

/**
 * Single email within thread - consistent styling with MessageBubble
 *
 * WHY: Display individual emails within a thread with reply capability
 * HOW: Shows email content with hover state for reply button
 */
function ThreadEmail({
  email,
  lead,
  onReply,
  isReplyActive,
  onSendReply,
  onCancelReply,
  isSendingReply,
}: {
  email: ConversationMessage
  lead: Lead
  onReply?: (messageId: string) => void
  isReplyActive?: boolean
  onSendReply?: (data: { channel: MessageChannel; subject?: string; body: string }) => void
  onCancelReply?: () => void
  isSendingReply?: boolean
}) {
  const isOutbound = email.direction === 'outbound'
  const formattedTime = format(email.timestamp, 'MMM d, h:mm a')

  return (
    <div className="border-b border-border last:border-b-0">
      {/* Email content - hoverable for reply */}
      <div className="group px-3 py-3">
        {/* Email header */}
        <div className="flex items-start gap-3 mb-2">
          {!isOutbound ? (
            <Avatar className="size-7 shrink-0">
              <AvatarImage src={lead.avatar} alt={lead.name} />
              <AvatarFallback
                className="text-[10px] font-medium"
                style={{
                  backgroundColor: getLeadAvatarColor(lead.id, lead.name),
                  color: getTextColorForBackground(getLeadAvatarColor(lead.id, lead.name)),
                }}
              >
                {getInitials(lead.name)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="size-7 shrink-0 rounded-full bg-muted flex items-center justify-center">
              <span className="text-[9px] text-muted-foreground font-medium">You</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {isOutbound ? 'You' : lead.name}
              </span>
              <div className="flex items-center gap-2">
                {/* Reply button - always visible, minimal icon-only design */}
                {onReply && !isReplyActive && (
                  <button
                    type="button"
                    onClick={() => onReply(email.id)}
                    className={cn(
                      'p-1 rounded-md transition-colors',
                      'text-muted-foreground/60 hover:text-foreground hover:bg-muted'
                    )}
                    title="Reply"
                  >
                    <Reply className="size-3.5" />
                  </button>
                )}
                {/* Status indicator for outbound emails */}
                {isOutbound && <EmailStatusIndicator status={email.status} />}
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {formattedTime}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {isOutbound ? `to ${lead.email}` : `to me`}
            </p>
          </div>
        </div>

        {/* Email body — render rich HTML for full documents, plain text otherwise */}
        <div className="pl-10">
          {email.bodyHtml && /<!DOCTYPE|<html/i.test(email.bodyHtml) ? (
            <HtmlEmailRenderer html={email.bodyHtml} />
          ) : (
            <p className="text-[13px] text-foreground/80 whitespace-pre-wrap leading-relaxed">
              {email.body}
            </p>
          )}
          {email.hasAttachment && (
            <div className="flex items-center gap-1.5 mt-3 text-[11px] text-muted-foreground">
              <Paperclip className="size-3" />
              <span>1 attachment</span>
            </div>
          )}
        </div>
      </div>

      {/* Inline reply composer - shows below this email when active */}
      {isReplyActive && onSendReply && onCancelReply && (
        <div className="px-3 pb-3">
          <InlineReplyComposer
            channel="email"
            replyToSubject={email.subject}
            onSend={onSendReply}
            onCancel={onCancelReply}
            isSending={isSendingReply}
          />
        </div>
      )}
    </div>
  )
}

export function EmailThread({
  emails,
  lead,
  focusedMessageId,
  focusedMessageRef,
  onReply,
  activeReplyMessageId,
  onSendReply,
  onCancelReply,
  isSendingReply,
}: EmailThreadProps) {
  const hasFocusedEmail = emails.some((e) => e.id === focusedMessageId)
  const [isExpanded, setIsExpanded] = useState(hasFocusedEmail || emails.length <= 2)

  const subject = emails[0]?.subject || 'No Subject'
  const latestEmail = emails[emails.length - 1]
  const hasAttachments = emails.some((e) => e.hasAttachment)

  return (
    <div className="rounded-xl dark:bg-background border overflow-hidden">
      {/* Header - always same layout */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2.5  transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          {/* Expand/collapse */}
          <div className="text-muted-foreground">
            {isExpanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </div>

          {/* Email icon */}
          <Mail className="size-3.5 text-muted-foreground shrink-0" />

          {/* Subject */}
          <span className="text-sm font-medium truncate flex-1">{subject}</span>

          {/* Count badge */}
          {emails.length > 1 && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md shrink-0">
              {emails.length}
            </span>
          )}

          {/* Attachment */}
          {hasAttachments && (
            <Paperclip className="size-3 text-muted-foreground shrink-0" />
          )}

          {/* Timestamp */}
          <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
            {format(latestEmail.timestamp, 'MMM d')}
          </span>
        </div>
      </button>

      {/* Inner container - consistent padding and colors */}
      {isExpanded && (
        <div className="p-1">
          <div className="rounded-lg dark:bg-muted/80 bg-muted overflow-hidden border-border border ring-background ring-1">
            {emails.map((email) => {
              // Check if this email is the focus target for scroll positioning
              const isFocused = focusedMessageId === email.id

              return (
                <div
                  key={email.id}
                  ref={isFocused && focusedMessageRef ? focusedMessageRef : undefined}
                >
                  <ThreadEmail
                    email={email}
                    lead={lead}
                    onReply={onReply}
                    isReplyActive={activeReplyMessageId === email.id}
                    onSendReply={onSendReply}
                    onCancelReply={onCancelReply}
                    isSendingReply={isSendingReply}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
