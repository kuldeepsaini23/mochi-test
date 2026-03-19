'use client'

/**
 * Placeholder Plugin for Lexical Editor
 *
 * Displays placeholder text when the editor is empty.
 * Styled to look like Notion's "Type '/' for commands" hint.
 *
 * SOURCE OF TRUTH: Lexical placeholder patterns
 * Keywords: PLACEHOLDER, EMPTY_STATE, LEXICAL_PLACEHOLDER
 */

import { cn } from '@/lib/utils'

// ============================================================================
// PLACEHOLDER COMPONENT
// ============================================================================

interface PlaceholderProps {
  /**
   * The placeholder text to display
   */
  text?: string

  /**
   * Additional CSS class names
   */
  className?: string
}

/**
 * Placeholder Component
 * WHY: Shows helpful hint text when editor is empty
 *
 * Positioned absolutely within the editor content area
 * and hidden when content is present.
 */
export function Placeholder({
  text = "Type '/' for commands...",
  className,
}: PlaceholderProps) {
  return (
    <div
      className={cn(
        'absolute top-0 left-0 pointer-events-none select-none',
        'text-muted-foreground/50 text-base',
        'overflow-hidden text-ellipsis whitespace-nowrap',
        className
      )}
    >
      {text}
    </div>
  )
}
