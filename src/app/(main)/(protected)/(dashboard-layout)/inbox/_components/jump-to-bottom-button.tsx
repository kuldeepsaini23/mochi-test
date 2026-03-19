'use client'

/**
 * Jump to Bottom Button Component
 *
 * WHY: WhatsApp/Messenger-style FAB for quick navigation to latest messages
 * HOW: Floating action button that appears when user scrolls up from bottom
 *
 * FEATURES:
 * - Shows when user is NOT at the bottom of conversation
 * - Displays unread/new message count badge
 * - Smooth animation on appear/disappear
 * - Click triggers jumpToLatest() callback
 *
 * SOURCE OF TRUTH KEYWORDS: JumpToBottomButton, InboxFAB, ScrollToBottom
 */

import { ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface JumpToBottomButtonProps {
  /** Whether to show the button */
  visible: boolean
  /** Number of new/unread messages (optional badge) */
  newMessageCount?: number
  /** Callback when button is clicked */
  onClick: () => void
  /** Additional className */
  className?: string
}

export function JumpToBottomButton({
  visible,
  newMessageCount = 0,
  onClick,
  className,
}: JumpToBottomButtonProps) {
  if (!visible) return null

  return (
    <div
      className={cn(
        'absolute bottom-4 right-4 z-10',
        'animate-in fade-in slide-in-from-bottom-2 duration-200',
        className
      )}
    >
      <Button
        variant="secondary"
        size="icon"
        onClick={onClick}
        className={cn(
          'relative size-10 rounded-full shadow-lg',
          'bg-background/95 backdrop-blur-sm',
          'border border-border/50',
          'hover:bg-muted hover:shadow-xl',
          'transition-all duration-200'
        )}
      >
        <ArrowDown className="size-5" />

        {/* Unread count badge */}
        {newMessageCount > 0 && (
          <span
            className={cn(
              'absolute -top-1.5 -right-1.5',
              'min-w-5 h-5 px-1.5',
              'flex items-center justify-center',
              'rounded-full text-[10px] font-bold',
              'bg-primary text-primary-foreground',
              'animate-in zoom-in duration-200'
            )}
          >
            {newMessageCount > 99 ? '99+' : newMessageCount}
          </span>
        )}
      </Button>
    </div>
  )
}
