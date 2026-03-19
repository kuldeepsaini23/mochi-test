'use client'

/**
 * Chat Widget Card Component
 *
 * WHY: Display individual chat widget in a minimal card format
 * HOW: Simple card with name, description, and action dropdown
 *      Shows toggle image/icon from widget config
 *      Clicking navigates to the widget editor page
 *
 * SOURCE OF TRUTH: ChatWidget
 */

import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { IconRenderer } from '@/lib/icons'

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

/**
 * Safely extract toggle config from widget config
 * Returns null if config is not properly structured
 */
function getToggleConfig(config: unknown): ToggleConfig | null {
  if (!config || typeof config !== 'object') return null
  const c = config as WidgetConfig
  return c.toggle ?? null
}

interface ChatWidgetCardProps {
  widget: ChatWidget
  onEdit?: () => void
  onDelete?: () => void
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ChatWidgetCard({ widget, onEdit, onDelete }: ChatWidgetCardProps) {
  const router = useRouter()

  const handleClick = () => {
    router.push(`/sites/chat-widgets/${widget.id}`)
  }

  // Extract toggle config safely from Prisma Json type
  const toggleConfig = getToggleConfig(widget.config)

  return (
    <div
      onClick={handleClick}
      className={cn(
        'group relative rounded-lg border bg-card p-4 cursor-pointer',
        'hover:bg-accent/50 hover:border-accent',
        'transition-colors duration-150'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Toggle Image/Icon from config */}
        <div className="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
          {toggleConfig?.type === 'image' && toggleConfig.image ? (
            <Image
              src={toggleConfig.image}
              alt={widget.name}
              width={40}
              height={40}
              className="w-full h-full object-cover"
            />
          ) : (
            <IconRenderer
              name={toggleConfig?.icon || 'message-circle'}
              size={20}
              className="text-muted-foreground"
            />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{widget.name}</p>
          {widget.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {widget.description}
            </p>
          )}
        </div>

        {/* Actions */}
        {(onEdit || onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'size-8 opacity-0 group-hover:opacity-100',
                  'transition-opacity duration-150'
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="mr-2 size-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={onDelete}
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// SKELETON
// ============================================================================

export function ChatWidgetCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-lg bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-24 bg-muted rounded" />
          <div className="h-3 w-40 bg-muted rounded" />
        </div>
      </div>
    </div>
  )
}
