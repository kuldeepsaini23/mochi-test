'use client'

/**
 * ============================================================================
 * JSON RENDER PANEL
 * ============================================================================
 *
 * Renders json-render specs inline in the Mochi chat widget.
 * Displays AI-generated UI components (cards, tables, metrics, etc.)
 * using the pre-configured MochiRenderer which maps catalog definitions
 * to shadcn components.
 *
 * Shown when the AI outputs a ```ui-spec code fence — the spec is
 * progressively built from streaming JSONL patches and rendered live.
 *
 * SOURCE OF TRUTH KEYWORDS: JsonRenderPanel, UISpecPanel, MochiUIPanel
 * ============================================================================
 */

import type { Spec } from '@json-render/core'
import { MochiRenderer } from '@/lib/ai/ui-render/registry'

// ============================================================================
// TYPES
// ============================================================================

interface JsonRenderPanelProps {
  /** The json-render spec to render (null = nothing to show) */
  spec: Spec | null
  /** Whether the spec is still being streamed (shows loading indicator) */
  isStreaming?: boolean
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Renders a json-render spec inline in the chat widget.
 * Uses MochiRenderer which wraps the Renderer with state/visibility providers.
 *
 * Returns null when no spec is available (before streaming starts or after reset).
 */
export function JsonRenderPanel({ spec, isStreaming }: JsonRenderPanelProps) {
  if (!spec) return null

  return (
    <div className="rounded-xl border border-border/50 bg-background/50 p-3 my-2 overflow-hidden">
      <MochiRenderer
        spec={spec}
        loading={isStreaming}
      />
    </div>
  )
}
