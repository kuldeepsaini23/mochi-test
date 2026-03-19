'use client'

/**
 * Chat Widgets Grid Component
 *
 * WHY: Display chat widgets in a responsive grid with search and pagination
 * HOW: Simple grid layout with centered pagination at bottom
 *
 * SOURCE OF TRUTH: ChatWidget
 */

import { Search, X, MessageSquare } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ChatWidgetCard, ChatWidgetCardSkeleton } from './chat-widget-card'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Toggle config structure from widget config JSON
 */
interface ToggleConfig {
  type: 'image' | 'icon'
  image?: string | null
  icon?: string | null
}

/**
 * Widget config structure (partial - only what we need for display)
 * Uses unknown to match Prisma's Json type
 */
interface WidgetConfig {
  toggle?: ToggleConfig
}

interface ChatWidget {
  id: string
  name: string
  description: string | null
  /** Config is Prisma Json type - cast to WidgetConfig when accessing */
  config: unknown
}

interface ChatWidgetsGridProps {
  widgets: ChatWidget[]
  totalWidgets: number
  searchQuery: string
  onSearchChange: (value: string) => void
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  onEdit?: (widget: ChatWidget) => void
  onDelete?: (id: string) => void
  isLoading?: boolean
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ChatWidgetsGrid({
  widgets,
  totalWidgets,
  searchQuery,
  onSearchChange,
  currentPage,
  totalPages,
  onPageChange,
  onEdit,
  onDelete,
  isLoading,
}: ChatWidgetsGridProps) {
  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search widgets..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 pr-8"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <ChatWidgetCardSkeleton key={i} />
          ))}
        </div>
      ) : widgets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <div className="rounded-full bg-muted p-3 mb-3">
            <MessageSquare className="size-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground text-center">
            {searchQuery
              ? 'No widgets match your search'
              : 'No chat widgets yet'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {widgets.map((widget) => (
            <ChatWidgetCard
              key={widget.id}
              widget={widget}
              onEdit={onEdit ? () => onEdit(widget) : undefined}
              onDelete={onDelete ? () => onDelete(widget.id) : undefined}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground px-2">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            Next
          </Button>
        </div>
      )}

      {/* Total count */}
      <div className="text-center">
        <p className="text-xs text-muted-foreground">
          {totalWidgets} widget{totalWidgets !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  )
}
