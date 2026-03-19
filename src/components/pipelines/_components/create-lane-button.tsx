'use client'

/**
 * CreateLaneButton Component - Button to Add New Lane
 *
 * Renders a button that expands into a simple form for creating a new lane.
 * Just enter a name and create - no color picker needed.
 *
 * SOURCE OF TRUTH: Uses types from @/types/pipeline
 */

import { useState, useRef, useEffect } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { CreateLaneInput } from '@/types/pipeline'

interface CreateLaneButtonProps {
  onCreateLane: (input: CreateLaneInput) => Promise<unknown>
}

export function CreateLaneButton({ onCreateLane }: CreateLaneButtonProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [laneName, setLaneName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when form opens
  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isCreating])

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!laneName.trim()) return

    setIsSubmitting(true)
    try {
      await onCreateLane({
        pipelineId: '', // Will be filled by the parent
        name: laneName.trim(),
      })
      // Reset form on success
      setLaneName('')
      setIsCreating(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  /**
   * Handle cancel - close form without creating
   */
  const handleCancel = () => {
    setLaneName('')
    setIsCreating(false)
  }

  /**
   * Handle keyboard shortcuts
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel()
    }
  }

  // Collapsed state - just show button
  if (!isCreating) {
    return (
      <button
        onClick={() => setIsCreating(true)}
        className={cn(
          'shrink-0 w-80 h-fit',
          'flex items-center justify-center gap-2 p-4',
          'bg-muted/20 hover:bg-muted/40 rounded-xl',
          'border-2 border-dashed border-border/50 hover:border-border',
          'text-muted-foreground hover:text-foreground',
          'transition-all duration-200 cursor-pointer'
        )}
      >
        <Plus className="h-5 w-5" />
        <span className="text-sm font-medium">Add Lane</span>
      </button>
    )
  }

  // Expanded state - show simple form
  return (
    <div
      className={cn(
        'shrink-0 w-80 bg-muted/40 rounded-xl',
        'border border-border/50 p-4'
      )}
    >
      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
        {/* Lane Name Input */}
        <Input
          ref={inputRef}
          value={laneName}
          onChange={(e) => setLaneName(e.target.value)}
          placeholder="Enter lane name..."
          className="mb-3"
          disabled={isSubmitting}
        />

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            type="submit"
            size="sm"
            disabled={!laneName.trim() || isSubmitting}
            className="flex-1"
          >
            {isSubmitting ? 'Creating...' : 'Create Lane'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  )
}
