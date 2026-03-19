'use client'

/**
 * Message Bubble Component
 *
 * WHY: Display individual messages in premium, minimal chat-style view
 * HOW: Clean design with subtle differentiation by direction
 *      - Inbound: Left-aligned with avatar
 *      - Outbound: Right-aligned, subtle background
 *      - Channel shown as small inline indicator (not colorful)
 *      - Emails expandable when content is long
 */

import { useState } from 'react'
import { format } from 'date-fns'
import {
  Mail,
  MessageSquare,
  Phone,
  FileText,
  Bell,
  ChevronDown,
  ChevronUp,
  Paperclip,
  Reply,
  MessageCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getLeadAvatarColor } from '@/lib/utils/lead-helpers'
import { getTextColorForBackground } from '@/constants/colors'
import { ConversationMessage, MessageChannel, Lead } from './types'
import { HtmlEmailRenderer } from './html-email-renderer'

/**
 * Custom Instagram icon (lucide deprecated theirs)
 */
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  )
}

/**
 * Channel icons - monochrome, minimal
 */
const channelIcons: Record<MessageChannel, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  instagram: InstagramIcon,
  sms: Phone,
  internal: Bell,
  form: FileText,
  chatbot: MessageCircle,
}

/**
 * Channel labels for display
 */
const channelLabels: Record<MessageChannel, string> = {
  email: 'Email',
  instagram: 'Instagram',
  sms: 'SMS',
  internal: 'Note',
  form: 'Form',
  chatbot: 'Chat',
}

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
 * Email content threshold for collapse
 */
const EMAIL_COLLAPSE_THRESHOLD = 300

interface MessageBubbleProps {
  message: ConversationMessage
  /** Lead info for avatar on inbound messages */
  lead: Lead
  /** Whether this message should be highlighted (focused) */
  isFocused?: boolean
  /** Ref for scrolling to this message */
  messageRef?: React.RefObject<HTMLDivElement | null>
  /** Callback when user clicks reply on this message */
  onReply?: (messageId: string) => void
  /** Whether inline reply is active for this message */
  isReplyActive?: boolean
}

export function MessageBubble({
  message,
  lead,
  isFocused,
  messageRef,
  onReply,
  isReplyActive,
}: MessageBubbleProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const Icon = channelIcons[message.channel]
  const channelLabel = channelLabels[message.channel]
  const isOutbound = message.direction === 'outbound'
  const isEmail = message.channel === 'email'
  /** Check if this message has a full HTML document (contract/invoice email) */
  const hasRichHtml = !!(message.bodyHtml && /<!DOCTYPE|<html/i.test(message.bodyHtml))
  const isLongContent = !hasRichHtml && message.body.length > EMAIL_COLLAPSE_THRESHOLD

  /** Format timestamp */
  const formattedTime = format(message.timestamp, 'MMM d, h:mm a')

  /** Get display body - truncated if collapsed */
  const displayBody =
    isLongContent && !isExpanded
      ? message.body.slice(0, EMAIL_COLLAPSE_THRESHOLD) + '...'
      : message.body

  return (
    <div
      ref={messageRef}
      className={cn(
        'group flex gap-3 w-full',
        isOutbound ? 'flex-row-reverse' : 'flex-row',
        isFocused && 'scroll-mt-4'
      )}
    >
      {/* Avatar - only for inbound messages */}
      {!isOutbound ? (
        <Avatar className="size-7 shrink-0 mt-1">
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
        <div className="size-7 shrink-0" /> // Spacer for alignment
      )}

      {/* Message content */}
      <div
        className={cn(
          'flex-1 max-w-[85%] space-y-1',
          isOutbound && 'flex flex-col items-end'
        )}
      >
        {/* Meta row: channel + timestamp + reply */}
        <div
          className={cn(
            'flex items-center gap-2 text-[11px] text-muted-foreground',
            isOutbound && 'flex-row-reverse'
          )}
        >
          <div className="flex items-center gap-1">
            <Icon className="size-3" />
            <span>{channelLabel}</span>
          </div>
          <span className="text-muted-foreground/60">·</span>
          <span className="tabular-nums">{formattedTime}</span>
          {message.hasAttachment && (
            <>
              <span className="text-muted-foreground/60">·</span>
              <Paperclip className="size-3" />
            </>
          )}
          {/* Reply button - appears on hover */}
          {onReply && !isReplyActive && (
            <button
              type="button"
              onClick={() => onReply(message.id)}
              className={cn(
                'flex items-center gap-1 px-1.5 py-0.5 rounded',
                'opacity-0 group-hover:opacity-100 transition-opacity',
                'hover:bg-muted hover:text-foreground'
              )}
            >
              <Reply className="size-3" />
              <span>Reply</span>
            </button>
          )}
        </div>

        {/* Message bubble */}
        <div
          className={cn(
            'rounded-lg px-3 py-2.5',
            isOutbound
              ? 'bg-muted/50 text-foreground'
              : 'bg-background border border-border/60'
          )}
        >
          {/* Subject line for emails */}
          {isEmail && message.subject && (
            <p className="text-[13px] font-medium text-foreground mb-1.5">
              {message.subject}
            </p>
          )}

          {/* Message body — render rich HTML for full documents, plain text otherwise */}
          {hasRichHtml ? (
            <HtmlEmailRenderer html={message.bodyHtml!} />
          ) : (
            <p className="text-[13px] text-foreground/80 whitespace-pre-wrap leading-relaxed">
              {displayBody}
            </p>
          )}

          {/* Expand/collapse for long content */}
          {isLongContent && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 mt-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="size-3" />
                  <span>Show less</span>
                </>
              ) : (
                <>
                  <ChevronDown className="size-3" />
                  <span>Show more</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Outbound indicator */}
        {isOutbound && (
          <span className="text-[10px] text-muted-foreground/50">You</span>
        )}
      </div>
    </div>
  )
}
