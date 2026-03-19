/**
 * ============================================================================
 * MOCHI WIDGET - TYPES
 * ============================================================================
 *
 * Widget-specific types for the Mochi AI floating chat widget.
 * WidgetState and WidgetDimensions are re-exported from the shared
 * widget-shell module for backward compatibility.
 *
 * SOURCE OF TRUTH KEYWORDS: MochiWidgetTypes, MochiWidgetState, MochiConversationTurn
 * ============================================================================
 */

import type { MochiMessage, MochiToolCall, MochiImageAttachment } from '@/lib/ai/mochi/types'

// ============================================================================
// RE-EXPORTS — shared shell types for backward compat
// ============================================================================

export type { WidgetState, WidgetDimensions } from '@/components/ai/widget-shell'

// ============================================================================
// CONVERSATION TURN
// ============================================================================

/**
 * A conversation turn groups a user prompt with the AI's response.
 * This adapts MochiMessage[] (flat messages) into the builder AI widget's
 * collapsible turn-based UI pattern.
 */
export interface MochiConversationTurn {
  /** Unique turn ID */
  id: string
  /** The user's original prompt text */
  userPrompt: string
  /** Tool calls executed during this turn (from the assistant message) */
  toolCalls: MochiToolCall[]
  /** The assistant's text response */
  aiResponse?: string
  /** Whether this turn is currently being streamed */
  isActive: boolean
  /** Timestamp of the user message */
  timestamp: Date
  /** Image attachments from the user message (for display in conversation) */
  imageAttachments?: MochiImageAttachment[]
}

// ============================================================================
// SUGGESTED PROMPTS
// ============================================================================

/**
 * A suggested prompt shown in the empty state
 */
export type SuggestedPrompt = {
  /** Short label shown on the button */
  label: string
  /** Full prompt text inserted into the input */
  prompt: string
}

/**
 * Default suggested prompts for new users (dashboard context)
 */
export const DEFAULT_SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  {
    label: 'Add a new lead',
    prompt: 'Add a new lead named John Smith with email john@example.com',
  },
  {
    label: 'Show my leads',
    prompt: 'Show me all my leads',
  },
  {
    label: 'Create a dataset',
    prompt: 'Create a new dataset called Q4 Prospects',
  },
]

/**
 * Suggested prompts for the website builder context.
 * Shown when user is editing a page in the builder so they
 * know what kind of sections the AI can generate.
 *
 * SOURCE OF TRUTH KEYWORDS: WebsiteBuilderSuggestedPrompts, BuilderPrompts
 */
export const WEBSITE_BUILDER_SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  {
    label: '🎯 Hero section',
    prompt: 'Build a hero section with a bold headline, subtitle, and two CTA buttons',
  },
  {
    label: '✨ Feature grid',
    prompt: 'Create a 3-column feature grid with icons, titles, and descriptions',
  },
  {
    label: '💰 Pricing cards',
    prompt: 'Build a pricing section with 3 plans — Basic, Pro, and Enterprise with features list',
  },
  {
    label: '💬 Testimonials',
    prompt: 'Create a testimonial section with 3 customer quotes in a grid',
  },
  {
    label: '📄 Full landing page',
    prompt: 'Build a complete landing page with hero, features, testimonials, and CTA footer',
  },
  {
    label: '🌙 Dark hero',
    prompt: 'Create a dark hero section with navy background, white text, and a bright CTA button',
  },
]

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Groups flat MochiMessage[] into MochiConversationTurn[] for the UI.
 *
 * Each user message paired with the following assistant message forms one turn.
 * If a user message has no matching assistant response yet, the turn has no
 * aiResponse and isActive=true (still streaming).
 */
export function groupMessagesIntoTurns(
  messages: MochiMessage[]
): MochiConversationTurn[] {
  const turns: MochiConversationTurn[] = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]

    if (msg.role === 'user') {
      // Look for the next assistant message
      const nextMsg = messages[i + 1]
      const hasAssistant = nextMsg?.role === 'assistant'

      turns.push({
        id: `turn-${msg.id}`,
        userPrompt: msg.content,
        toolCalls: hasAssistant ? nextMsg.toolCalls || [] : [],
        aiResponse: hasAssistant && nextMsg.content ? nextMsg.content : undefined,
        isActive: hasAssistant ? !!nextMsg.isStreaming : true,
        timestamp: msg.timestamp,
        imageAttachments: msg.imageAttachments,
      })

      // Skip the assistant message since we consumed it
      if (hasAssistant) i++
    }
  }

  return turns
}
