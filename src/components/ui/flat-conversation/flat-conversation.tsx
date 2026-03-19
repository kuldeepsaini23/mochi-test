/**
 * ============================================================================
 * FLAT CONVERSATION - SHARED COMPONENT
 * ============================================================================
 *
 * A shared flat chat layout used by both Mochi and Builder AI widgets.
 * Renders conversation turns as:
 *   1. User bubble (right-aligned)
 *   2. Task items slot (left-aligned, pre-rendered by consumer)
 *   3. AI markdown prose (left-aligned)
 *   4. Streaming indicator (pulse dot)
 *   5. Human-in-the-loop UI (option buttons, Mochi only)
 *
 * SOURCE OF TRUTH KEYWORDS: FlatConversation, SharedConversation, FlatChat
 * ============================================================================
 */

'use client'

import React, { useRef, useEffect, useMemo } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FlatConversationTurn, FlatConversationProps } from './types'

// ============================================================================
// DEFAULT EMPTY STATE MESSAGE
// ============================================================================

const DEFAULT_EMPTY_MESSAGE = 'Ask me anything and I\'ll help you get things done.'

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Renders a single conversation turn in the flat chat layout:
 * user bubble -> task slot -> AI markdown -> streaming indicator -> human-in-the-loop
 */
function ConversationTurn({
  turn,
  onSendResponse,
}: {
  turn: FlatConversationTurn
  onSendResponse?: (response: string) => void
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {/* User message — right-aligned bubble */}
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-4 py-2.5">
          {/* Image thumbnails — shown above text when user attached images */}
          {turn.userImages && turn.userImages.length > 0 && (
            <div className="flex gap-1.5 mb-2 flex-wrap">
              {turn.userImages.map((img) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={img.id}
                  src={`data:${img.mediaType};base64,${img.base64}`}
                  alt="Attached image"
                  className="h-20 max-w-[120px] rounded-lg object-cover"
                />
              ))}
            </div>
          )}
          <p className="text-sm text-foreground leading-relaxed">
            {turn.userPrompt}
          </p>
        </div>
      </div>

      {/* Task items slot — pre-rendered by consumer, left-aligned */}
      {turn.taskItems}

      {/* AI response — left-aligned markdown prose, red-tinted when error */}
      {turn.aiResponse && (
        <div className={cn(
          'max-w-[90%] text-sm leading-relaxed prose dark:prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:text-foreground prose-strong:text-foreground prose-a:text-blue-500 dark:prose-a:text-blue-400 prose-table:w-full prose-th:text-foreground prose-th:text-left prose-th:border-b prose-th:border-border prose-th:pb-1.5 prose-td:border-b prose-td:border-border/50 prose-td:py-1.5 prose-tr:border-0',
          turn.isError
            ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 rounded-xl px-4 py-3'
            : 'text-muted-foreground'
        )}>
          <Markdown remarkPlugins={[remarkGfm]}>{turn.aiResponse}</Markdown>
        </div>
      )}

      {/* Streaming indicator — pulse dot shown while AI is thinking */}
      {turn.isStreaming && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-xs">Thinking...</span>
        </div>
      )}

      {/* Human-in-the-loop question UI (Mochi only) */}
      {turn.humanInput && onSendResponse && (
        <div className="mt-1">
          <p className="text-sm text-foreground leading-relaxed mb-2">
            {turn.humanInput.question}
          </p>
          {turn.humanInput.options && turn.humanInput.options.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {turn.humanInput.options.map((option, idx) => (
                <button
                  key={idx}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-xs font-medium transition-all',
                    'bg-muted/50 hover:bg-muted text-foreground border border-border/50'
                  )}
                  onClick={() => onSendResponse(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Empty state — Sparkles icon + customizable helper text
 */
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <div className="rounded-full bg-muted p-3 mb-4">
        <Sparkles className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground max-w-[240px]">
        {message}
      </p>
    </div>
  )
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * FlatConversation — Shared flat chat layout for AI widgets.
 * Auto-scrolls to bottom when new content arrives.
 * Renders normalized FlatConversationTurn[] with an optional human-in-the-loop handler.
 */
export function FlatConversation({
  turns,
  onSendResponse,
  emptyStateMessage = DEFAULT_EMPTY_MESSAGE,
  className,
}: FlatConversationProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  /**
   * Scroll trigger — reacts to BOTH new turns AND mid-stream text updates.
   * We track the last turn's aiResponse length + streaming state so the
   * scroll fires on every chunk the AI streams in, not just when the
   * turns array reference changes.
   */
  const lastTurn = turns[turns.length - 1]
  const scrollTrigger = useMemo(
    () => `${turns.length}-${lastTurn?.aiResponse?.length ?? 0}-${lastTurn?.isStreaming}`,
    [turns.length, lastTurn?.aiResponse?.length, lastTurn?.isStreaming]
  )

  /* Auto-scroll to bottom when new content arrives or streams in */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [scrollTrigger])

  if (turns.length === 0) {
    return <EmptyState message={emptyStateMessage} />
  }

  return (
    <div
      ref={scrollRef}
      className={cn(
        'flex-1 overflow-y-auto',
        'scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 scrollbar-track-transparent',
        className
      )}
    >
      {turns.map((turn) => (
        <ConversationTurn
          key={turn.id}
          turn={turn}
          onSendResponse={onSendResponse}
        />
      ))}
    </div>
  )
}
