'use client'

/**
 * Message Preview Component
 *
 * WHY: Compact preview of a message in the inbox list
 * HOW: Shows avatar, sender, subject, time, and channel indicator
 */

import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getLeadAvatarColor } from '@/lib/utils/lead-helpers'
import { getTextColorForBackground } from '@/constants/colors'
import { InboxMessage } from './types'
import { ChannelBadge } from './channel-badge'

interface MessagePreviewProps {
  message: InboxMessage
  isSelected: boolean
  onSelect: (message: InboxMessage) => void
}

/**
 * Format timestamp to short relative format
 */
function formatTime(date: Date): string {
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)

  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`

  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`

  return formatDistanceToNow(date, { addSuffix: false })
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

export function MessagePreview({ message, isSelected, onSelect }: MessagePreviewProps) {
  const isUnread = !message.isRead

  return (
    <button
      type="button"
      onClick={() => onSelect(message)}
      className={cn(
        'w-full text-left px-2 py-2.5 transition-colors',
        'hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/50',
        isSelected && 'bg-muted',
        isUnread && 'bg-blue-50/50 dark:bg-blue-950/20'
      )}
    >
      <div className="flex gap-2 w-full">
        {/* Avatar */}
        <Avatar className="size-8 shrink-0">
          <AvatarImage src={message.sender.avatar} alt={message.sender.name} />
          <AvatarFallback
            className="text-[10px] font-medium"
            style={{
              backgroundColor: getLeadAvatarColor(message.sender.id, message.sender.name),
              color: getTextColorForBackground(getLeadAvatarColor(message.sender.id, message.sender.name)),
            }}
          >
            {getInitials(message.sender.name)}
          </AvatarFallback>
        </Avatar>

        {/* Content - w-0 flex-1 forces proper shrinking */}
        <div className="w-0 flex-1">
          {/* Row 1: Sender + Time */}
          <div className="flex items-center gap-1">
            <div className="w-0 flex-1 flex items-center gap-1">
              {isUnread && (
                <span className="size-1.5 rounded-full bg-blue-500 shrink-0" />
              )}
              <span
                className={cn(
                  'text-sm truncate',
                  isUnread ? 'font-medium text-foreground' : 'text-muted-foreground'
                )}
              >
                {message.sender.name}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground/70 shrink-0 tabular-nums">
              {formatTime(message.receivedAt)}
            </span>
          </div>

          {/* Row 2: Channel + Subject */}
          <div className="flex items-center gap-1 mt-0.5">
            <ChannelBadge channel={message.channel} className="shrink-0" />
            <span
              className={cn(
                'text-[13px] truncate',
                isUnread ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {message.subject}
            </span>
          </div>

          {/* Row 3: Preview */}
          <p className="text-xs text-muted-foreground/60 truncate mt-0.5">
            {message.preview}
          </p>
        </div>
      </div>
    </button>
  )
}
