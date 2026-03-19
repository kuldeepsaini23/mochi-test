'use client'

/**
 * Reply Composer Component
 *
 * WHY: Professional multi-channel reply interface for inbox
 * HOW: Context-aware composer that adapts to selected channel
 *      - Email: From Name, From Email, Subject, Body with attachments
 *      - Instagram/SMS: Simple message body
 *      - Attachment previews matching storage file icons
 *      - Channel toggle for multi-source communication
 */

import { useState, useRef, useCallback, useMemo } from 'react'
import {
  Mail,
  Phone,
  Send,
  Paperclip,
  X,
  Image as ImageIcon,
  FileText,
  FileArchive,
  File,
  MessageCircle,
} from 'lucide-react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { MessageChannel, Lead } from './types'

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
 * Attachment interface for tracking uploaded files
 */
interface Attachment {
  id: string
  name: string
  size: number
  type: string
  previewUrl?: string
  file: File
}

/**
 * Channel configuration for the selector
 */
interface ChannelConfig {
  id: MessageChannel
  label: string
  icon: React.ComponentType<{ className?: string }>
  supportsAttachments: boolean
  hasEmailFields: boolean
  placeholder: string
}

/**
 * Available channels for sending messages
 *
 * NOTE: Instagram and SMS are disabled for now due to platform restrictions.
 * Email and Chat (chatbot) are supported.
 */
const CHANNELS: ChannelConfig[] = [
  {
    id: 'email',
    label: 'Email',
    icon: Mail,
    supportsAttachments: true,
    hasEmailFields: true,
    placeholder: 'Write your email...',
  },
  {
    id: 'chatbot',
    label: 'Chat',
    icon: MessageCircle,
    supportsAttachments: false,
    hasEmailFields: false,
    placeholder: 'Reply to chat...',
  },
  // Instagram and SMS disabled for now - uncomment when integrations are ready
  // {
  //   id: 'instagram',
  //   label: 'Instagram',
  //   icon: InstagramIcon,
  //   supportsAttachments: true,
  //   hasEmailFields: false,
  //   placeholder: 'Send a message...',
  // },
  // {
  //   id: 'sms',
  //   label: 'SMS',
  //   icon: Phone,
  //   supportsAttachments: false,
  //   hasEmailFields: false,
  //   placeholder: 'Type a message...',
  // },
]

/**
 * Channel Toggle Component
 *
 * WHY: Toggle button group for channel selection
 * HOW: Each button has inner ring top border, border-background, shadow-sm
 */
function ChannelToggle({
  channels,
  selected,
  onSelect,
}: {
  channels: ChannelConfig[]
  selected: MessageChannel
  onSelect: (channel: MessageChannel) => void
}) {
  return (
    <div className="inline-flex rounded-lg bg-muted/50 p-1 gap-0.5">
      {channels.map((channel) => {
        const isSelected = selected === channel.id
        const Icon = channel.icon

        return (
          <button
            key={channel.id}
            type="button"
            onClick={() => onSelect(channel.id)}
            className={cn(
              'relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all border-t border-transparent',
              isSelected
                ? 'bg-muted border-t border-accent ring-1 ring-background text-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <Icon className="size-3.5" />
            <span>{channel.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * File Icon Component
 * WHY: Render appropriate icon based on file type
 * HOW: Defined as proper component to avoid React hooks warning
 */
function FileIconDisplay({
  type,
  className,
}: {
  type: string
  className?: string
}) {
  if (type.startsWith('image/')) return <ImageIcon className={className} />
  if (type === 'application/pdf') return <FileText className={className} />
  if (type.includes('zip') || type.includes('rar') || type.includes('7z'))
    return <FileArchive className={className} />
  return <File className={className} />
}

/**
 * Format file size to human-readable string
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`
}

/**
 * Get file extension from filename
 */
function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toUpperCase() || 'FILE'
}

/**
 * Attachment Preview Component
 *
 * WHY: Show attached files with visual previews matching storage design
 * HOW: Images show thumbnail, others show file icon with extension badge
 */
function AttachmentPreview({
  attachment,
  onRemove,
}: {
  attachment: Attachment
  onRemove: () => void
}) {
  const isImage = attachment.type.startsWith('image/')
  const extension = getFileExtension(attachment.name)

  return (
    <div
      className={cn(
        'group relative flex items-center gap-2 rounded-lg border border-border bg-muted/30',
        'p-2 pr-3 transition-colors hover:bg-muted/50',
        isImage ? 'w-20 flex-col p-1.5' : 'max-w-[200px]'
      )}
    >
      {/* Preview/Icon */}
      <div
        className={cn(
          'relative shrink-0 rounded overflow-hidden',
          isImage
            ? 'w-full aspect-square'
            : 'size-9 flex items-center justify-center bg-muted'
        )}
      >
        {isImage && attachment.previewUrl ? (
          <Image
            src={attachment.previewUrl}
            alt={attachment.name}
            fill
            className="object-cover"
          />
        ) : (
          <div className="relative w-full h-full flex items-center justify-center">
            <FileIconDisplay
              type={attachment.type}
              className="size-5 text-muted-foreground"
            />
            {/* Extension badge */}
            <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[6px] font-bold text-muted-foreground bg-background px-0.5 rounded">
              {extension}
            </span>
          </div>
        )}
      </div>

      {/* File info (non-image only) */}
      {!isImage && (
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{attachment.name}</p>
          <p className="text-[10px] text-muted-foreground">
            {formatFileSize(attachment.size)}
          </p>
        </div>
      )}

      {/* Remove button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className={cn(
          'absolute -top-1.5 -right-1.5 size-5 rounded-full',
          'bg-destructive text-destructive-foreground',
          'flex items-center justify-center',
          'opacity-0 group-hover:opacity-100 transition-opacity',
          'hover:bg-destructive/90'
        )}
      >
        <X className="size-3" />
      </button>
    </div>
  )
}

interface ReplyComposerProps {
  /** Lead to reply to - used for context */
  lead: Lead
  /** Currently active channel from conversation */
  activeChannel?: MessageChannel
  /** Callback when message is sent */
  onSend?: (data: {
    channel: MessageChannel
    fromName?: string
    fromEmail?: string
    subject?: string
    body: string
    attachments: File[]
  }) => void
  /** Show loading state while sending */
  isSending?: boolean
  /** Additional className */
  className?: string
  /**
   * Emit typing indicator
   * WHY: Let visitor know team is typing a response
   * PERFORMANCE: Should be debounced internally
   */
  onTyping?: (isTyping: boolean) => void
}

export function ReplyComposer({
  lead,
  activeChannel = 'email',
  onSend,
  isSending: _isSending = false, // Kept for backwards compatibility, not used with optimistic UI
  className,
  onTyping,
}: ReplyComposerProps) {
  // Channel state
  const [selectedChannel, setSelectedChannel] =
    useState<MessageChannel>(activeChannel)

  // Form state
  const [fromName, setFromName] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isExpanded, setIsExpanded] = useState(false)

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null)

  /**
   * Typing indicator state
   * WHY: Send periodic "still typing" signals while user is typing
   * HOW: Emit true every 1.5s while typing, emit false when stopped
   */
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const stopTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isCurrentlyTypingRef = useRef(false)

  // Get current channel config
  const channelConfig = useMemo(
    () => CHANNELS.find((c) => c.id === selectedChannel) || CHANNELS[0],
    [selectedChannel]
  )

  /**
   * Handle file selection for attachments
   */
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      const newAttachments: Attachment[] = files.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        size: file.size,
        type: file.type,
        previewUrl: file.type.startsWith('image/')
          ? URL.createObjectURL(file)
          : undefined,
        file,
      }))
      setAttachments((prev) => [...prev, ...newAttachments])
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    []
  )

  /**
   * Remove an attachment
   */
  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const attachment = prev.find((a) => a.id === id)
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl)
      }
      return prev.filter((a) => a.id !== id)
    })
  }, [])

  /**
   * Start typing - emit true immediately and every 1.5s while typing
   */
  const startTyping = useCallback(() => {
    if (!onTyping || isCurrentlyTypingRef.current) return

    isCurrentlyTypingRef.current = true
    onTyping(true)

    // Send periodic "still typing" signals every 1.5 seconds
    typingIntervalRef.current = setInterval(() => {
      onTyping(true)
    }, 1500)
  }, [onTyping])

  /**
   * Stop typing - clear interval and emit false
   */
  const stopTyping = useCallback(() => {
    if (!onTyping || !isCurrentlyTypingRef.current) return

    isCurrentlyTypingRef.current = false

    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current)
      typingIntervalRef.current = null
    }

    if (stopTypingTimeoutRef.current) {
      clearTimeout(stopTypingTimeoutRef.current)
      stopTypingTimeoutRef.current = null
    }

    onTyping(false)
  }, [onTyping])

  /**
   * Handle typing activity - start typing and reset stop timer
   */
  const emitTyping = useCallback(
    (isTyping: boolean) => {
      if (!onTyping) return

      if (isTyping) {
        // Start typing if not already
        startTyping()

        // Reset the auto-stop timer (stops 2s after last keystroke)
        if (stopTypingTimeoutRef.current) {
          clearTimeout(stopTypingTimeoutRef.current)
        }
        stopTypingTimeoutRef.current = setTimeout(() => {
          stopTyping()
        }, 2000)
      } else {
        // Explicit stop (blur, send, cancel)
        stopTyping()
      }
    },
    [onTyping, startTyping, stopTyping]
  )

  /**
   * Handle body text change with typing indicator
   */
  const handleBodyChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value
      setBody(newValue)

      // Only emit typing for chat channel (not email - too slow)
      if (selectedChannel === 'chatbot') {
        emitTyping(newValue.length > 0)
      }
    },
    [selectedChannel, emitTyping]
  )

  /**
   * Handle send action
   */
  const handleSend = useCallback(() => {
    if (!body.trim()) return

    // Stop typing indicator since we're sending
    emitTyping(false)

    onSend?.({
      channel: selectedChannel,
      fromName: channelConfig.hasEmailFields ? fromName : undefined,
      fromEmail: channelConfig.hasEmailFields ? fromEmail : undefined,
      subject: channelConfig.hasEmailFields ? subject : undefined,
      body: body.trim(),
      attachments: attachments.map((a) => a.file),
    })

    // Reset form
    setFromName('')
    setFromEmail('')
    setSubject('')
    setBody('')
    setAttachments([])
    setIsExpanded(false)
  }, [
    body,
    selectedChannel,
    fromName,
    fromEmail,
    subject,
    attachments,
    channelConfig,
    onSend,
    emitTyping,
  ])

  /**
   * Expand composer when focused
   */
  const handleFocus = useCallback(() => {
    setIsExpanded(true)
  }, [])

  /**
   * Reset and collapse
   */
  const handleCancel = useCallback(() => {
    // Stop typing indicator
    emitTyping(false)

    setIsExpanded(false)
    setBody('')
    setSubject('')
    setFromName('')
    setFromEmail('')
    setAttachments([])
  }, [emitTyping])

  /** For email channel, sender name and email are required in addition to body */
  const canSend = body.trim().length > 0 && (
    !channelConfig.hasEmailFields ||
    (fromName.trim().length > 0 && fromEmail.trim().length > 0)
  )

  return (
    <div className={cn('border-t bg-background', className)}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
        accept="*/*"
      />

      <div className="p-4 space-y-3">
        {/* Channel toggle - only show when expanded AND multiple channels available */}
        {isExpanded && CHANNELS.length > 1 && (
          <ChannelToggle
            channels={CHANNELS}
            selected={selectedChannel}
            onSelect={setSelectedChannel}
          />
        )}

        {/* Main compose area - unified container */}
        <div
          className={cn(
            'rounded-lg border transition-all',
            isExpanded
              ? 'border-border'
              : 'border-dashed border-border/60 hover:border-border cursor-text'
          )}
        >
          {/* Email header fields - all visible when composing email */}
          {isExpanded && channelConfig.hasEmailFields && (
            <div className="border-b border-border/50 p-3 space-y-3">
              {/* From row - name and email side by side (both required) */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground w-16 shrink-0">From <span className="text-destructive">*</span></span>
                <Input
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder="Your name (required)"
                  className="flex-1"
                />
                <Input
                  type="email"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  placeholder="you@example.com (required)"
                  className="flex-1"
                />
              </div>

              {/* To row - read only recipient */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground w-16 shrink-0">To</span>
                <div className="flex-1 h-9 px-3 flex items-center rounded-md border border-input bg-muted/50 text-sm text-muted-foreground">
                  {lead.name} &lt;{lead.email}&gt;
                </div>
              </div>

              {/* Subject row */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground w-16 shrink-0">Subject</span>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject..."
                  className="flex-1"
                />
              </div>
            </div>
          )}

          {/* Message body */}
          <Textarea
            value={body}
            onChange={handleBodyChange}
            onFocus={handleFocus}
            onBlur={() => {
              // Stop typing indicator when losing focus
              if (selectedChannel === 'chatbot') {
                emitTyping(false)
              }
            }}
            placeholder={
              isExpanded ? channelConfig.placeholder : `Reply to ${lead.name}...`
            }
            className={cn(
              'border-0 resize-none focus-visible:ring-0',
              'text-sm placeholder:text-muted-foreground/60',
              isExpanded ? 'min-h-[120px]' : 'min-h-11'
            )}
          />

          {/* Attachments preview */}
          {attachments.length > 0 && (
            <div className="px-3 pb-3">
              <div className="flex flex-wrap gap-2">
                {attachments.map((attachment) => (
                  <AttachmentPreview
                    key={attachment.id}
                    attachment={attachment}
                    onRemove={() => handleRemoveAttachment(attachment.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Action bar */}
          {isExpanded && (
            <div className="flex items-center justify-between px-3 py-2.5 border-t border-border/50 bg-muted/20">
              <div className="flex items-center gap-1">
                {/* Attachment button */}
                {channelConfig.supportsAttachments && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="size-4" />
                    <span>Attach</span>
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Cancel button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={handleCancel}
                >
                  Cancel
                </Button>

                {/* Send button - WhatsApp-style, never blocks user */}
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  disabled={!canSend}
                  onClick={handleSend}
                >
                  <Send className="size-3.5" />
                  Send
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
