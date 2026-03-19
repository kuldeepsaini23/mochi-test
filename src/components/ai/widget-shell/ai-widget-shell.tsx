/**
 * ============================================================================
 * AI WIDGET SHELL - MAIN COMPOSITION SHELL
 * ============================================================================
 *
 * The shared UI container for AI floating widgets. Handles:
 * - Fixed positioning (bottom-right by default)
 * - Minimal/expanded state toggle
 * - Drag-to-resize in all 8 directions
 * - Header bar with title, icon, custom actions, minimize, and close
 * - Glass styling (backdrop-blur, theme-aware bg, border)
 *
 * Domain-specific content (conversation, inputs, submit handlers, etc.)
 * is injected via slot props. The shell does NOT contain any AI logic,
 * conversation state, or submit handlers.
 *
 * SOURCE OF TRUTH KEYWORDS: AIWidgetShell, SharedAIWidgetShell, AIWidgetContainer
 * ============================================================================
 */

'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X, Minimize2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MarqueeFade } from '@/components/global/marquee-fade'
import { useResize } from './use-resize'
import { ResizeHandles } from './resize-handles'
import { DEFAULT_DIMENSION_CONFIG } from './types'
import type { AIWidgetShellProps } from './types'

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * AIWidgetShell — Shared floating widget container.
 *
 * Renders a fixed-position floating panel that toggles between minimal (compact bar)
 * and expanded (resizable panel) states. All AI-specific content is passed in via props:
 * - `children` fills the scrollable conversation area
 * - `expandedInput` / `minimalInput` render the input in each mode
 * - `headerActions` adds extra buttons to the header
 * - `preInputContent` renders between conversation and input (e.g. suggested prompts)
 */
export function AIWidgetShell({
  title,
  icon,
  headerActions,
  children,
  preInputContent,
  expandedInput,
  minimalInput,
  widgetState,
  onWidgetStateChange,
  onClose,
  visible = true,
  dimensions: dimensionConfig = DEFAULT_DIMENSION_CONFIG,
  positionClassName = 'bottom-4 right-4',
  minimalClassName = 'w-fit',
  className,
  isGenerating = false,
}: AIWidgetShellProps) {
  // Resize hook for expanded mode
  const { dimensions, handleMouseDown } = useResize(
    dimensionConfig.default,
    dimensionConfig.min,
    dimensionConfig.max
  )

  const isExpanded = widgetState === 'expanded'
  const isMinimal = widgetState === 'minimal'

  // ========================================================================
  // SCROLL-AWARE MARQUEE FADES
  // ========================================================================

  /** Track scroll position to smartly show/hide top and bottom fades */
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(false)
  const conversationRef = useRef<HTMLDivElement>(null)

  /**
   * Attach a scroll listener to the conversation scroll container (the first
   * child with overflow-y-auto inside MarqueeFade). Updates fade visibility
   * based on whether there's content above/below the visible area.
   */
  const checkScroll = useCallback(() => {
    const el = conversationRef.current
    if (!el) return
    /** Find the actual scrollable child (FlatConversation's overflow div) */
    const scrollable = el.querySelector('[class*="overflow-y"]') as HTMLElement | null
    if (!scrollable) return
    const { scrollTop, scrollHeight, clientHeight } = scrollable
    setShowTopFade(scrollTop > 10)
    setShowBottomFade(scrollTop + clientHeight < scrollHeight - 10)
  }, [])

  useEffect(() => {
    const el = conversationRef.current
    if (!el || !isExpanded) return
    const scrollable = el.querySelector('[class*="overflow-y"]') as HTMLElement | null
    if (!scrollable) return

    checkScroll()
    scrollable.addEventListener('scroll', checkScroll, { passive: true })
    /** Re-check when content changes (MutationObserver catches new messages) */
    const observer = new MutationObserver(checkScroll)
    observer.observe(scrollable, { childList: true, subtree: true })

    return () => {
      scrollable.removeEventListener('scroll', checkScroll)
      observer.disconnect()
    }
  }, [isExpanded, checkScroll])

  /** Toggle between minimal and expanded */
  const toggleState = () => {
    onWidgetStateChange(isMinimal ? 'expanded' : 'minimal')
  }

  // Don't render if not visible
  if (!visible) return null

  /** The icon element — defaults to Sparkles if none provided */
  const iconElement = icon ?? <Sparkles className="h-4 w-4" />

  return (
    <div
      data-mochi-widget
      className={cn(
        /**
         * z-[9999] ensures the widget floats above full-screen builders
         * (contract builder z-50, invoice builder z-50) and modals.
         */
        'fixed z-[9999]',
        positionClassName,
        /** Expand to fill viewport width on mobile when panel is open */
        isExpanded && 'left-4 sm:left-auto',
        className
      )}
    >
      {/* Minimal Mode — Just the sparkle icon button, click to expand */}
      {isMinimal && (
        <div
          className={cn(
            'relative rounded-xl',
            isGenerating && 'p-[2px]',
            minimalClassName
          )}
        >
          {/* Dual-layer gradient border for minimal mode */}
          {isGenerating && (
            <>
              {/* Glow layer — very subtle diffused glow */}
              <div
                className="absolute inset-[-10px] rounded-2xl overflow-hidden pointer-events-none opacity-[0.2] blur-[24px]"
                aria-hidden="true"
              >
                <div
                  className="absolute inset-[-500%]"
                  style={{
                    background: 'conic-gradient(#8b5cf6, #c084fc, #ec4899, #3f3f46 30%, #3f3f46 50%, #f472b6, #c084fc, #8b5cf6)',
                    animation: 'spin 8s linear infinite',
                  }}
                />
              </div>
              {/* Sharp border layer — larger inset to prevent black spot on wide aspect ratios */}
              <div
                className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none"
                aria-hidden="true"
              >
                <div
                  className="absolute inset-[-500%]"
                  style={{
                    background: 'conic-gradient(#8b5cf6, #c084fc, #ec4899, #3f3f46 30%, #3f3f46 50%, #f472b6, #c084fc, #8b5cf6)',
                    animation: 'spin 8s linear infinite',
                  }}
                />
              </div>
            </>
          )}

          <div
            className={cn(
              'relative flex items-center p-2',
              isGenerating ? 'rounded-[10px] bg-background' : 'rounded-xl bg-background/70',
              'backdrop-blur-xl',
              !isGenerating && 'border border-border/50',
              'shadow-2xl shadow-black/20 dark:shadow-black/50'
            )}
          >
            {/* Sparkle icon button — clicking expands to full panel */}
            <button
              onClick={toggleState}
              className="p-2 rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              {iconElement}
            </button>
          </div>
        </div>
      )}

      {/* Expanded Mode — Full resizable panel */}
      {isExpanded && (
        <div
          className={cn(
            'relative rounded-xl',
            isGenerating && 'p-[2px]'
          )}
        >
          {/*
           * DUAL-LAYER GRADIENT BORDER — two spinning gradient layers:
           *
           * Layer 1 (back): Blurred + expanded — creates the soft glow effect
           * around the border using the same rainbow colors, slightly larger
           * and blurred so it diffuses outward.
           *
           * Layer 2 (front): Sharp conic-gradient — the crisp visible border
           * that sits in the 2px padding gap between wrapper and inner panel.
           *
           * The inner panel uses an OPAQUE background (bg-background) when
           * generating to prevent the gradient from bleeding through the
           * semi-transparent glass effect.
           */}
          {isGenerating && (
            <>
              {/* Glow layer — very subtle diffused glow */}
              <div
                className="absolute inset-[-10px] rounded-2xl overflow-hidden pointer-events-none opacity-[0.2] blur-[24px]"
                aria-hidden="true"
              >
                <div
                  className="absolute inset-[-100%]"
                  style={{
                    background: 'conic-gradient(#8b5cf6, #c084fc, #ec4899, #3f3f46 30%, #3f3f46 50%, #f472b6, #c084fc, #8b5cf6)',
                    animation: 'spin 8s linear infinite',
                  }}
                />
              </div>
              {/* Sharp border layer — crisp rotating gradient */}
              <div
                className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none"
                aria-hidden="true"
              >
                <div
                  className="absolute inset-[-100%]"
                  style={{
                    background: 'conic-gradient(#8b5cf6, #c084fc, #ec4899, #3f3f46 30%, #3f3f46 50%, #f472b6, #c084fc, #8b5cf6)',
                    animation: 'spin 8s linear infinite',
                  }}
                />
              </div>
            </>
          )}

          {/* Inner panel — opaque bg when generating to block gradient bleed-through */}
          <div
            className={cn(
              'relative flex flex-col overflow-hidden',
              isGenerating ? 'rounded-[10px] bg-background' : 'rounded-xl bg-background/70',
              'backdrop-blur-xl',
              !isGenerating && 'border border-border/50',
              'shadow-2xl shadow-black/20 dark:shadow-black/50',
              'max-w-full max-h-[calc(100dvh-2rem)]'
            )}
            style={{
              width: dimensions.width,
              height: dimensions.height,
            }}
          >
            {/* Resize Handles — 8 direction resize grips */}
            <ResizeHandles onMouseDown={handleMouseDown} />

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{iconElement}</span>
                <span className="text-sm font-medium text-foreground">{title}</span>
              </div>
              <div className="flex items-center gap-1">
                {/* Custom header actions (e.g. "Clear Chat") */}
                {headerActions}
                <button
                  onClick={toggleState}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Minimize"
                >
                  <Minimize2 className="h-4 w-4" />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Conversation Area — scroll-aware edge fades */}
            <MarqueeFade
              showTopFade={showTopFade}
              showBottomFade={showBottomFade}
              fadeHeight={39}
              className="flex-1 min-h-0 flex flex-col overflow-hidden"
            >
              <div ref={conversationRef} className="flex-1 min-h-0 flex flex-col">
                {children}
              </div>
            </MarqueeFade>

            {/* Pre-input content — e.g. suggested prompts, rendered below conversation */}
            {preInputContent}

            {/* Input Area — filled by consumer via expandedInput */}
            {expandedInput}
          </div>
        </div>
      )}
    </div>
  )
}
