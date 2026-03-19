/**
 * Lead Helper Utilities
 * Reusable functions for lead display and formatting
 */

import { getConsistentColor } from '@/constants/colors'

/**
 * Get avatar initials from lead name
 * Returns "?" if no name available
 */
export function getLeadInitials(fullName: string | null | undefined): string {
  if (!fullName || fullName.trim() === '') {
    return '?'
  }

  const nameParts = fullName.trim().split(' ')
  if (nameParts.length === 0) {
    return '?'
  }

  const initials = nameParts
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return initials || '?'
}

/**
 * Get display name for lead
 * Returns "Unknown" if no name available
 */
export function getLeadDisplayName(fullName: string | null | undefined): string {
  if (!fullName || fullName.trim() === '') {
    return 'Unknown'
  }
  return fullName
}

/**
 * Format CLTV amount
 */
export function formatCLTV(cltv: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cltv)
}

/**
 * Ensure string value for input (convert null/undefined to empty string)
 */
export function safeStringValue(value: string | null | undefined): string {
  return value || ''
}

/**
 * Get consistent avatar background color for a lead
 * Uses lead ID for consistency (same lead always gets same color)
 */
export function getLeadAvatarColor(leadId: string, fallbackName?: string | null): string {
  return getConsistentColor(leadId || fallbackName || 'unknown')
}

/**
 * Format relative time without date-fns (lightweight alternative)
 * Reduces bundle size and improves performance
 */
export function formatRelativeTime(dateString: string | Date | null | undefined): string {
  if (!dateString) return 'Never'

  const date = typeof dateString === 'string' ? new Date(dateString) : dateString
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return 'Just now'
  if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60)
    return `${minutes}m ago`
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600)
    return `${hours}h ago`
  }
  if (diffInSeconds < 604800) {
    const days = Math.floor(diffInSeconds / 86400)
    return `${days}d ago`
  }
  if (diffInSeconds < 2592000) {
    const weeks = Math.floor(diffInSeconds / 604800)
    return `${weeks}w ago`
  }
  if (diffInSeconds < 31536000) {
    const months = Math.floor(diffInSeconds / 2592000)
    return `${months}mo ago`
  }
  const years = Math.floor(diffInSeconds / 31536000)
  return `${years}y ago`
}

/**
 * Format status for display (convert LEAD to Lead, etc.)
 */
export function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
}

/**
 * Format a MessageChannel enum value to a human-readable display string.
 * WHY: Used by the Activity Timeline to show which channel a message was sent/received on.
 *
 * SOURCE OF TRUTH KEYWORDS: FormatChannel, MessageChannelDisplay
 */
export function formatChannel(channel: string): string {
  const channelMap: Record<string, string> = {
    EMAIL: 'Email',
    SMS: 'SMS',
    INSTAGRAM: 'Instagram',
    INTERNAL: 'Internal Note',
    FORM: 'Form',
    CHATBOT: 'Chat',
  }
  return channelMap[channel] || channel
}

/**
 * Strip HTML tags from a string for plain text preview.
 * WHY: Message bodies may contain HTML; activity timeline shows plain text previews.
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

/**
 * Truncate text to a maximum length with ellipsis.
 * WHY: Activity body previews and descriptions need to be kept short for the timeline.
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trimEnd() + '...'
}
