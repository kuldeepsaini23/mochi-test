/**
 * ============================================================================
 * FLAT CONVERSATION - SHARED UI TYPES
 * ============================================================================
 *
 * Normalized turn type that both Mochi and Builder AI widgets map into.
 * Each consumer maps its domain-specific turn (MochiConversationTurn,
 * AIConversationTurn) into FlatConversationTurn before passing to the
 * shared FlatConversation component.
 *
 * SOURCE OF TRUTH KEYWORDS: FlatConversationTurn, FlatConversationTypes, SharedConversation
 * ============================================================================
 */

import type { ReactNode } from 'react'

/**
 * A single conversation turn in the flat chat layout.
 * Domain-agnostic — each widget pre-renders its own task cards into `taskItems`.
 */
export interface FlatConversationTurn {
  /** Unique turn identifier */
  id: string
  /** The user's original prompt text (displayed as a right-aligned bubble) */
  userPrompt: string
  /** Image attachments from the user message (displayed as thumbnails in the bubble) */
  userImages?: Array<{ id: string; base64: string; mediaType: string }>
  /** Pre-rendered task cards — each consumer renders its own TaskItem components */
  taskItems: ReactNode
  /** The AI's markdown response (displayed as left-aligned prose) */
  aiResponse?: string
  /** Whether the streaming/thinking indicator should be shown */
  isStreaming: boolean
  /** Whether this turn represents an error state (red-tinted styling) */
  isError?: boolean
  /** Optional human-in-the-loop input (Mochi only) — question + quick-select options */
  humanInput?: {
    question: string
    options?: string[]
  }
}

/**
 * Props for the shared FlatConversation component
 */
export interface FlatConversationProps {
  /** Normalized conversation turns to display */
  turns: FlatConversationTurn[]
  /** Callback when user responds to a human-in-the-loop question (Mochi only) */
  onSendResponse?: (response: string) => void
  /** Custom empty state message — defaults to a generic AI assistant message */
  emptyStateMessage?: string
  /** Optional className for the scroll container */
  className?: string
}
