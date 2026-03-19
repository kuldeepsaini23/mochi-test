'use client'

/**
 * Channel Badge Component
 *
 * WHY: Minimal indicator for message channel type
 * HOW: Small icon-only badge with subtle styling
 */

import { Mail, MessageSquare, Bell, FileText, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MessageChannel } from './types'

/**
 * Custom Instagram icon (avoiding deprecated lucide icon)
 */
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
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
 * Channel icon mapping - minimal approach
 */
const channelIcons: Record<MessageChannel, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  instagram: InstagramIcon,
  sms: MessageSquare,
  internal: Bell,
  form: FileText,
  chatbot: MessageCircle,
}

interface ChannelBadgeProps {
  channel: MessageChannel
  className?: string
}

/**
 * Renders a minimal channel indicator icon
 */
export function ChannelBadge({ channel, className }: ChannelBadgeProps) {
  const Icon = channelIcons[channel]
  return <Icon className={cn('size-3.5 text-muted-foreground', className)} />
}
