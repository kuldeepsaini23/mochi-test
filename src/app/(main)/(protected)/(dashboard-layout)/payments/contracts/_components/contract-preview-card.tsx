'use client'

/**
 * Contract Preview Card Component
 *
 * Renders a visual preview of a contract as a card in either grid or list mode.
 * Uses ContentPreview from @/components/editor/content-preview.tsx for Lexical
 * content thumbnails — 100% reuse, no custom preview rendering.
 *
 * Features:
 * - Grid mode: Card with ContentPreview thumbnail, name, status badge, dropdown menu
 * - List mode: Horizontal row with small preview, name, status, date, dropdown
 * - Status badges: DRAFT=gray, ACTIVE=green, ARCHIVED=amber
 * - Actions: Open, Duplicate, Move, Delete
 *
 * SOURCE OF TRUTH: Contract model from Prisma, ContentPreview from editor
 * Keywords: CONTRACT_PREVIEW_CARD, CONTRACT_CARD, CONTRACT_THUMBNAIL
 */

import { useMemo } from 'react'
import { MoreHorizontal, Copy, Trash2, FolderInput, Clock, FileText, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getConsistentColor, getTextColorForBackground } from '@/constants/colors'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatDistanceToNow } from 'date-fns'
import { ContentPreview } from '@/components/editor/content-preview'
import { contractNodes } from '@/components/editor/nodes'
import type { ContractStatus } from '@/generated/prisma'

// ============================================================================
// STATUS BADGE CONFIG
// ============================================================================

/**
 * Maps ContractStatus to badge color classes
 * DRAFT=gray, ACTIVE=green, ARCHIVED=amber
 */
const STATUS_BADGE_CONFIG: Record<
  ContractStatus,
  { label: string; className: string }
> = {
  DRAFT: {
    label: 'Draft',
    className: 'bg-muted text-muted-foreground',
  },
  ACTIVE: {
    label: 'Active',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  SENT: {
    label: 'Sent',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  COMPLETED: {
    label: 'Completed',
    className: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  },
  ARCHIVED: {
    label: 'Archived',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
}

// ============================================================================
// TYPES
// ============================================================================

export interface ContractPreviewCardProps {
  /** Contract ID */
  id: string
  /** Contract display name */
  name: string
  /** Contract status */
  status: ContractStatus
  /** Lexical JSON content string for preview */
  content: string | null
  /** Last updated date (ISO string) */
  updatedAt: string
  /** View mode: grid card or list row */
  viewMode: 'grid' | 'list'
  /** Public access token for the signing link (only present for SENT/COMPLETED contracts) */
  accessToken?: string | null
  /** Recipient lead data for avatar display */
  recipient?: { id: string; firstName: string | null; lastName: string | null; email: string } | null
  /** Click handler to open the lead sheet when clicking the recipient avatar */
  onRecipientClick?: (leadId: string) => void
  /** Click handler to open the contract builder */
  onClick: () => void
  /** Duplicate handler */
  onDuplicate: () => void
  /** Move to folder handler */
  onMove: () => void
  /** Delete handler */
  onDelete: () => void
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ContractPreviewCard({
  id,
  name,
  status,
  content,
  updatedAt,
  viewMode,
  accessToken,
  recipient,
  onRecipientClick,
  onClick,
  onDuplicate,
  onMove,
  onDelete,
}: ContractPreviewCardProps) {
  const statusConfig = STATUS_BADGE_CONFIG[status]

  /** Recipient display info — mirrors invoice list pattern */
  const recipientName = recipient
    ? [recipient.firstName, recipient.lastName].filter(Boolean).join(' ') || recipient.email
    : 'No recipient'
  const recipientColor = recipient ? getConsistentColor(recipient.id) : undefined
  const recipientTextColor = recipientColor ? getTextColorForBackground(recipientColor) : undefined
  const recipientInitials = recipient
    ? [recipient.firstName?.[0], recipient.lastName?.[0]]
        .filter(Boolean)
        .join('')
        .toUpperCase() || '?'
    : '?'

  /** Whether this contract has a public signing link that can be copied */
  const hasCopyableLink = !!accessToken && (status === 'SENT' || status === 'COMPLETED')

  /**
   * Copy the public contract signing link to clipboard.
   * WHY: Users need a quick way to re-share the link without re-sending.
   */
  const handleCopyLink = async () => {
    if (!accessToken) return
    const url = `${window.location.origin}/contract/view/${accessToken}`
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        /** Fallback for non-secure contexts (HTTP in dev) — uses a hidden textarea */
        const textarea = document.createElement('textarea')
        textarea.value = url
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      toast.success('Contract link copied to clipboard')
    } catch {
      toast.error('Failed to copy link')
    }
  }

  /**
   * Serialize content for ContentPreview
   * WHY: ContentPreview expects a string (Lexical JSON), but the contract
   *      content may be stored as a parsed object from tRPC serialization
   */
  const contentString = useMemo(() => {
    if (!content) return null
    if (typeof content === 'string') return content
    return JSON.stringify(content)
  }, [content])

  // ==========================================================================
  // LIST VIEW
  // ==========================================================================

  if (viewMode === 'list') {
    return (
      <div
        className={cn(
          'group flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-colors',
          'hover:bg-muted/50'
        )}
        onClick={onClick}
      >
        {/* Contract icon */}
        <div className="w-10 h-10 flex-shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
          <FileText className="w-5 h-5 text-primary" />
        </div>

        {/* Contract info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge
              variant="secondary"
              className={cn('text-[10px] px-1.5 py-0 border-0', statusConfig.className)}
            >
              {statusConfig.label}
            </Badge>
          </div>
        </div>

        {/* Recipient avatar + name — clickable to open lead sheet */}
        <button
          type="button"
          className="hidden sm:flex items-center gap-2 min-w-0 rounded-md px-1.5 py-1 -my-1 transition-colors hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation()
            if (recipient?.id && onRecipientClick) onRecipientClick(recipient.id)
          }}
          title={recipient ? `View ${recipientName}` : undefined}
          disabled={!recipient}
        >
          <Avatar className="h-5 w-5 text-[10px]">
            <AvatarFallback
              style={{
                backgroundColor: recipientColor,
                color: recipientTextColor,
              }}
            >
              {recipientInitials}
            </AvatarFallback>
          </Avatar>
          <span className="text-xs text-muted-foreground truncate max-w-[120px]">
            {recipientName}
          </span>
        </button>

        {/* Date info */}
        <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatDistanceToNow(new Date(updatedAt))} ago
        </div>

        {/* Actions dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {hasCopyableLink && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  handleCopyLink()
                }}
              >
                <Link2 className="mr-2 h-4 w-4" />
                Copy Link
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onDuplicate()
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                onMove()
              }}
            >
              <FolderInput className="mr-2 h-4 w-4" />
              Move to...
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  // ==========================================================================
  // GRID VIEW
  // ==========================================================================

  return (
    <div
      className="group relative flex flex-col cursor-pointer"
      onClick={onClick}
    >
      {/* Preview container */}
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card transition-all duration-200 group-hover:border-primary/40 group-hover:shadow-lg">
        {/* Content preview area — uses ContentPreview for Lexical rendering */}
        <div className="relative aspect-[3/4] overflow-hidden bg-background p-4">
          {contentString ? (
            <ContentPreview
              content={contentString}
              maxHeight={300}
              className="text-xs"
              nodes={contractNodes}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <FileText className="h-8 w-8" />
                <span className="text-xs">Empty contract</span>
              </div>
            </div>
          )}

          {/* Bottom fade gradient */}
          <div className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none bg-gradient-to-t from-background to-transparent" />
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors pointer-events-none" />

        {/* Dropdown menu — top right on hover */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 bg-background/90 backdrop-blur-sm shadow-sm hover:bg-background"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {hasCopyableLink && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCopyLink()
                  }}
                >
                  <Link2 className="mr-2 h-4 w-4" />
                  Copy Link
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onDuplicate()
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onMove()
                }}
              >
                <FolderInput className="mr-2 h-4 w-4" />
                Move to...
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Contract info below preview */}
      <div className="mt-3 px-1">
        <h3 className="font-medium text-sm truncate group-hover:text-primary transition-colors">
          {name}
        </h3>
        <div className="flex items-center justify-between mt-1.5">
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className={cn('text-[10px] px-1.5 py-0 border-0', statusConfig.className)}
            >
              {statusConfig.label}
            </Badge>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDistanceToNow(new Date(updatedAt))} ago
            </span>
          </div>
          {/* Recipient avatar — clickable to open lead sheet */}
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 -my-0.5 transition-colors hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation()
              if (recipient?.id && onRecipientClick) onRecipientClick(recipient.id)
            }}
            title={recipient ? `View ${recipientName}` : undefined}
            disabled={!recipient}
          >
            <Avatar className="h-5 w-5 text-[10px]">
              <AvatarFallback
                style={{
                  backgroundColor: recipientColor,
                  color: recipientTextColor,
                }}
              >
                {recipientInitials}
              </AvatarFallback>
            </Avatar>
            <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
              {recipientName}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
