'use client'

/**
 * Inbox Sidebar Component
 *
 * WHY: Compact message list with search and minimal toggle filter
 * HOW: Search bar + simple switch between All/Unopened with scrollable message list
 *
 * PROPS:
 * - messages: Array of inbox messages to display
 * - selectedMessageId: Currently selected message ID for highlighting
 * - onSelectMessage: Callback when a message is clicked
 * - isLoading: Show loading skeleton while fetching
 * - filter: Current filter state ('all' | 'unopened')
 * - onFilterChange: Callback when filter changes
 */

import { useState, useMemo } from 'react'
import { Inbox, Search, Loader2, PenSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { InboxMessage, InboxFilterStatus } from './types'
import { MessagePreview } from './message-preview'

interface InboxSidebarProps {
  messages: InboxMessage[]
  selectedMessageId: string | null
  onSelectMessage: (message: InboxMessage) => void
  isLoading?: boolean
  filter?: InboxFilterStatus
  onFilterChange?: (filter: InboxFilterStatus) => void
  /** Callback to open compose mode for new email */
  onCompose?: () => void
  className?: string
}

/**
 * Empty state when no messages
 */
function EmptyState({ isFiltered }: { isFiltered: boolean }) {
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="text-center space-y-1">
        <Inbox className="size-8 text-muted-foreground/30 mx-auto" />
        <p className="text-sm text-muted-foreground">
          {isFiltered ? 'No messages found' : 'No messages yet'}
        </p>
        {!isFiltered && (
          <p className="text-xs text-muted-foreground/70">
            Start a conversation with a lead
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Loading skeleton for the sidebar
 */
function LoadingSkeleton() {
  return (
    <div className="flex-1 p-3 space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-2 w-32" />
            </div>
          </div>
          <Skeleton className="h-2 w-full" />
        </div>
      ))}
    </div>
  )
}

export function InboxSidebar({
  messages,
  selectedMessageId,
  onSelectMessage,
  isLoading = false,
  filter = 'all',
  onFilterChange,
  onCompose,
  className,
}: InboxSidebarProps) {
  // Local toggle state - synced with filter prop
  const showOnlyUnopened = filter === 'unopened'

  // Search query (local state for client-side filtering)
  const [searchQuery, setSearchQuery] = useState('')

  // Count unopened messages
  const unopenedCount = useMemo(
    () => messages.filter((m) => !m.isRead).length,
    [messages]
  )

  // Handle toggle change
  const handleToggleChange = (checked: boolean) => {
    onFilterChange?.(checked ? 'unopened' : 'all')
  }

  // Filter messages by search (filter by read status is done server-side)
  const filteredMessages = useMemo(() => {
    let result = messages

    // Filter by search query (client-side)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (m) =>
          m.sender.name.toLowerCase().includes(query) ||
          m.subject.toLowerCase().includes(query) ||
          m.preview.toLowerCase().includes(query)
      )
    }

    return result
  }, [messages, searchQuery])

  const hasActiveFilter = showOnlyUnopened || searchQuery.trim().length > 0

  return (
    <div className={cn('flex flex-col h-full bg-sidebar', className)}>
      {/* Header */}
      <div className="shrink-0 px-3 py-3 border-b space-y-2.5">
        {/* Title row with compose button and toggle */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">Inbox</span>
            {unopenedCount > 0 && (
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                {unopenedCount}
              </span>
            )}
            {isLoading && (
              <Loader2 className="size-3 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Actions: Compose button and toggle */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Compose new email button */}
            {onCompose && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={onCompose}
              >
                <PenSquare className="size-3.5" />
                <span className="hidden sm:inline">New</span>
              </Button>
            )}

            {/* Unopened toggle switch */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground hidden sm:inline">Unopened</span>
              <Switch
                checked={showOnlyUnopened}
                onCheckedChange={handleToggleChange}
                className="scale-[0.7] origin-right"
              />
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50" />
          <Input
            type="search"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 pl-7 text-xs bg-muted/50 border-transparent focus:border-border"
          />
        </div>
      </div>

      {/* Message list */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : filteredMessages.length === 0 ? (
        <EmptyState isFiltered={hasActiveFilter} />
      ) : (
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="divide-y divide-border/50">
            {filteredMessages.map((message) => (
              <MessagePreview
                key={message.id}
                message={message}
                isSelected={message.id === selectedMessageId}
                onSelect={onSelectMessage}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
