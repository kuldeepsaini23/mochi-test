'use client'

/**
 * Inline Reply Composer Component
 *
 * WHY: Lightweight reply interface that appears inline within message threads
 * HOW: Simple textarea with Send/Cancel - no email headers since we're replying
 *      to an existing conversation with known context
 *
 * USAGE: Appears when user clicks reply icon on a message, positioned inline
 *        in the thread flow for seamless UX
 *
 * SOURCE OF TRUTH KEYWORDS: InlineReplyComposer, ThreadReply
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, X, Loader2, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { MessageChannel } from './types'

interface InlineReplyComposerProps {
  /** Channel for the reply (email, instagram, etc.) */
  channel: MessageChannel
  /** Subject from the email being replied to (for email threading) */
  replyToSubject?: string
  /** Callback when message is sent */
  onSend: (data: {
    channel: MessageChannel
    subject?: string
    body: string
  }) => void
  /** Callback when user cancels the reply */
  onCancel: () => void
  /** Show loading state while sending */
  isSending?: boolean
  /** Additional className */
  className?: string
}

export function InlineReplyComposer({
  channel,
  replyToSubject,
  onSend,
  onCancel,
  isSending = false,
  className,
}: InlineReplyComposerProps) {
  const [body, setBody] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  /**
   * Auto-focus textarea when component mounts
   * WHY: User clicked reply, so they want to type immediately
   */
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [])

  /**
   * Handle send action
   * WHY: Send reply with Re: prefix for proper email threading
   */
  const handleSend = useCallback(() => {
    if (!body.trim() || isSending) return

    // Add "Re: " prefix to subject if it's an email reply and doesn't already have it
    let subject: string | undefined
    if (channel === 'email' && replyToSubject) {
      const normalizedSubject = replyToSubject.replace(/^(Re:|Fwd:)\s*/i, '').trim()
      subject = `Re: ${normalizedSubject}`
    }

    onSend({
      channel,
      subject,
      body: body.trim(),
    })

    // Reset form
    setBody('')
  }, [body, channel, replyToSubject, onSend, isSending])

  /**
   * Handle keyboard shortcuts
   * WHY: Ctrl/Cmd + Enter to send, Escape to cancel
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend, onCancel]
  )

  const canSend = body.trim().length > 0

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-background shadow-sm',
        'animate-in fade-in-0 slide-in-from-top-2 duration-200',
        className
      )}
    >
      {/* Reply indicator */}
      <div className="px-3 py-2 border-b border-border/50 bg-muted/30">
        <span className="text-xs text-muted-foreground">
          Replying to thread
          {replyToSubject && (
            <>
              : <span className="font-medium text-foreground">{replyToSubject}</span>
            </>
          )}
        </span>
      </div>

      {/* Message body */}
      <Textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Write your reply..."
        className={cn(
          'border-0 resize-none focus-visible:ring-0',
          'text-sm placeholder:text-muted-foreground/60',
          'min-h-[80px]'
        )}
        disabled={isSending}
      />

      {/* Action bar */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border/50 bg-muted/20">
        <span className="text-[10px] text-muted-foreground">
          <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">Ctrl</kbd>+
          <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">Enter</kbd> to send
        </span>

        <div className="flex items-center gap-2">
          {/* Cancel button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={onCancel}
            disabled={isSending}
          >
            Cancel
          </Button>

          {/* Send button */}
          <Button
            type="button"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            disabled={!canSend || isSending}
            onClick={handleSend}
          >
            {isSending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Send className="size-3" />
            )}
            {isSending ? 'Sending...' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  )
}
