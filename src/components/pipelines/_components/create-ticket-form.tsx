'use client'

/**
 * CreateTicketForm Component - Inline Form for Creating Tickets
 *
 * Renders a compact inline form within a lane for quickly adding tickets.
 * Supports title input with optional description expansion.
 *
 * SOURCE OF TRUTH: Uses types from @/types/pipeline
 */

import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface CreateTicketFormProps {
  onSubmit: (title: string, description?: string) => Promise<void>
  onCancel: () => void
}

export function CreateTicketForm({ onSubmit, onCancel }: CreateTicketFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [showDescription, setShowDescription] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setIsSubmitting(true)
    try {
      await onSubmit(title.trim(), description.trim() || undefined)
      // Parent will close the form on success
    } finally {
      setIsSubmitting(false)
    }
  }

  /**
   * Handle keyboard shortcuts
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel()
    }
    // Allow Enter to submit only if not in textarea or Shift+Enter in textarea
    if (e.key === 'Enter' && !e.shiftKey && e.target === inputRef.current) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div
      className={cn(
        'bg-background rounded-lg border border-primary/50 p-3',
        'shadow-sm ring-1 ring-primary/20'
      )}
    >
      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
        {/* Title Input */}
        <Input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter ticket title..."
          className="mb-2 border-none bg-transparent px-0 focus-visible:ring-0"
          disabled={isSubmitting}
        />

        {/* Description (expandable) */}
        {showDescription ? (
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description (optional)..."
            className="mb-2 min-h-[60px] resize-none border-none bg-muted/50 text-sm"
            disabled={isSubmitting}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowDescription(true)}
            className="text-xs text-muted-foreground hover:text-foreground mb-2 transition-colors"
          >
            + Add description
          </button>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-border/50">
          <Button
            type="submit"
            size="sm"
            disabled={!title.trim() || isSubmitting}
            className="flex-1"
          >
            {isSubmitting ? 'Adding...' : 'Add Ticket'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onCancel}
            disabled={isSubmitting}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  )
}
