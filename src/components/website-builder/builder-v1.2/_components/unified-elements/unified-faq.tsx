/**
 * ============================================================================
 * UNIFIED FAQ ELEMENT - Single Component for Canvas + Preview Rendering
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedFaq, unified-faq, faq-element-unified, faq-accordion
 *
 * Renders an FAQ accordion element in BOTH canvas (editor) and preview
 * (published) modes. Apple-like minimal design with smooth expand/collapse
 * animations, clean typography, and subtle dividers.
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * The component renders CONTENT ONLY in canvas mode -- the parent
 * `ElementWrapper` handles all editor chrome (selection ring, hover ring,
 * resize handles, labels, dimensions pill, pointer events).
 *
 * In preview mode, this component wraps content in a positioned container
 * with its own size/position styles for published page layout.
 *
 * ============================================================================
 * KEY BEHAVIORS BY MODE
 * ============================================================================
 *
 * BOTH MODES:
 *   - FAQ items rendered as collapsible accordion sections
 *   - Smooth height animation on expand/collapse (CSS transition)
 *   - Separator styles: line, none, or card
 *   - Icon styles: chevron, plus, or none
 *   - Google Font loading for question/answer typography
 *   - Gradient border support via useGradientBorder
 *
 * CANVAS MODE (mode='canvas'):
 *   - All items rendered expanded by default for content visibility
 *   - No click interaction (editor handles pointer events)
 *   - Static display for design purposes
 *
 * PREVIEW MODE (mode='preview'):
 *   - Interactive accordion with click-to-expand/collapse
 *   - Single or multi-open behavior via allowMultipleOpen
 *   - Smooth CSS transitions on expand/collapse
 *   - Self-positioned wrapper for page layout
 *
 * ============================================================================
 */

'use client'

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { ChevronDown, Plus, Minus } from 'lucide-react'
import type { FaqElement, FaqItem, BorderConfig, Breakpoint } from '../../_lib/types'
import { getStyleValue, useRenderMode } from '../../_lib'
import {
  computeElementPositionStyles,
  useElementSizeStyles,
} from '../../_lib/shared-element-styles'
import { GoogleFontsService } from '../../_lib/google-fonts-service'
import { GradientBorderOverlay, useGradientBorder } from '../overlay'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the UnifiedFaq component.
 *
 * SOURCE OF TRUTH: UnifiedFaqProps
 *
 * In canvas mode, rendered INSIDE an ElementWrapper — only needs element data.
 * In preview mode, handles its own wrapper for published page layout.
 */
export interface UnifiedFaqProps {
  /** The FAQ element data — SOURCE OF TRUTH: FaqElement from types.ts */
  element: FaqElement
}

// ============================================================================
// SIZE META HOOK — Bridge for canvas wrapper sizing
// ============================================================================

/**
 * Computes FAQ-specific size styles for the canvas wrapper.
 *
 * SOURCE OF TRUTH: useUnifiedFaqMeta, faq-meta-hook
 *
 * FAQ elements default to autoWidth=true (fill parent) and
 * autoHeight=true (grow with content) since content length varies.
 */
export function useUnifiedFaqMeta(element: FaqElement) {
  const baseSizeStyles = useElementSizeStyles(element, 'desktop', {
    autoWidthDefault: true,
    autoHeightDefault: true,
  })

  /**
   * Merge base size styles with FAQ-specific constraints:
   * - minWidth: 280px prevents collapse on narrow parents
   * - maxWidth: When autoWidth, use element.width as the max so it doesn't
   *   stretch edge-to-edge on the canvas. When fixed width, no max needed.
   */
  const hasAutoWidth = element.autoWidth ?? true
  const sizeStyles = {
    ...baseSizeStyles,
    minWidth: baseSizeStyles.minWidth ?? 280,
    maxWidth: hasAutoWidth ? element.width : undefined,
  }

  return { sizeStyles }
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Unified FAQ element that renders in both canvas and preview modes.
 *
 * CONTENT-ONLY in canvas mode — ElementWrapper handles chrome.
 * SELF-WRAPPING in preview mode — includes positioned container.
 *
 * Renders a vertical list of collapsible Q&A items with a clean,
 * Apple-inspired aesthetic: Inter font, subtle borders, smooth animations.
 */
export function UnifiedFaq({ element }: UnifiedFaqProps) {
  const { mode, breakpoint } = useRenderMode()
  const isPreview = mode === 'preview'

  /** Resolve active breakpoint — canvas always uses desktop */
  const activeBreakpoint: Breakpoint = isPreview ? breakpoint : 'desktop'

  // ==========================================================================
  // GOOGLE FONT LOADING
  // ==========================================================================

  const fontFamily = getStyleValue<string>(
    element,
    'fontFamily',
    activeBreakpoint,
    'Inter'
  )

  useEffect(() => {
    if (fontFamily) {
      GoogleFontsService.loadFont(fontFamily)
    }
  }, [fontFamily])

  // ==========================================================================
  // GRADIENT BORDER SUPPORT
  // ==========================================================================

  const borderConfig = (element.styles as Record<string, unknown>)?.__borderConfig as BorderConfig | undefined
  const gradientBorder = useGradientBorder(element.id, borderConfig)

  // ==========================================================================
  // STYLE COMPUTATION
  // ==========================================================================

  /** Resolve responsive style values for the FAQ container */
  const backgroundColor = getStyleValue<string>(element, 'backgroundColor', activeBreakpoint, 'transparent')
  const borderRadius = getStyleValue<string>(element, 'borderRadius', activeBreakpoint, '12px')
  const padding = getStyleValue<string>(element, 'padding', activeBreakpoint, '0')
  const margin = getStyleValue<string>(element, 'margin', activeBreakpoint, '0')
  const gap = getStyleValue<number>(element, 'gap', activeBreakpoint, 0)

  /** Resolve text styling */
  const questionColor = getStyleValue<string>(element, 'color', activeBreakpoint, '#111111')
  const questionFontSize = getStyleValue<string>(element, 'fontSize', activeBreakpoint, '18px')
  const questionFontWeight = getStyleValue<string | number>(element, 'fontWeight', activeBreakpoint, 600)
  const answerColor = getStyleValue<string>(
    element,
    '__answerColor' as keyof React.CSSProperties,
    activeBreakpoint,
    '#6b7280'
  )
  const answerFontSize = getStyleValue<string>(
    element,
    '__answerFontSize' as keyof React.CSSProperties,
    activeBreakpoint,
    '16px'
  )

  /** Per-accordion item background color (applied to each item wrapper) */
  const itemBackgroundColor = getStyleValue<string>(
    element,
    '__itemBackgroundColor' as keyof React.CSSProperties,
    activeBreakpoint,
    'transparent'
  )

  /** Divider color for separator lines */
  const dividerColor = getStyleValue<string>(element, 'borderColor', activeBreakpoint, '#e5e7eb')

  /** Container styles for the outer FAQ wrapper */
  const containerStyle: React.CSSProperties = useMemo(() => ({
    display: 'flex',
    flexDirection: 'column',
    gap: gap,
    backgroundColor,
    borderRadius,
    padding,
    margin,
    fontFamily: fontFamily || 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    width: '100%',
    overflow: 'hidden',
    /* Kill transition in canvas to prevent lag during drag/resize */
    ...(!isPreview ? { transition: 'none' } : {}),
  }), [gap, backgroundColor, borderRadius, padding, margin, fontFamily, isPreview])

  // ==========================================================================
  // FAQ ITEMS DATA — Fall back to placeholder items for empty state
  // ==========================================================================

  const items: FaqItem[] = element.items?.length > 0 ? element.items : [
    { id: 'placeholder-1', question: 'What is your product?', answer: 'Our product helps you build beautiful websites with ease. No coding required.' },
    { id: 'placeholder-2', question: 'How does pricing work?', answer: 'We offer flexible plans starting from free. Upgrade anytime as you grow.' },
    { id: 'placeholder-3', question: 'Can I cancel anytime?', answer: 'Yes, you can cancel your subscription at any time. No questions asked.' },
  ]

  const separatorStyle = element.separatorStyle ?? 'line'
  const iconStyle = element.iconStyle ?? 'chevron'

  // ==========================================================================
  // FAQ CONTENT RENDERER — Shared between canvas and preview modes
  // ==========================================================================

  const renderFaqContent = () => (
    <div
      data-element-content={element.id}
      className={gradientBorder.className || undefined}
      style={containerStyle}
    >
      {/* Gradient border overlay if active */}
      {gradientBorder.isActive && (
        <GradientBorderOverlay
          elementId={element.id}
          borderConfig={borderConfig}
          borderRadius={borderRadius}
        />
      )}

      {items.map((item, index) => (
        <FaqItemRenderer
          key={item.id}
          item={item}
          index={index}
          isLast={index === items.length - 1}
          isPreview={isPreview}
          allowMultipleOpen={element.allowMultipleOpen ?? false}
          separatorStyle={separatorStyle}
          iconStyle={iconStyle}
          questionColor={questionColor}
          questionFontSize={questionFontSize}
          questionFontWeight={questionFontWeight}
          answerColor={answerColor}
          answerFontSize={answerFontSize}
          dividerColor={dividerColor}
          itemBackgroundColor={itemBackgroundColor}
          fontFamily={fontFamily || 'Inter'}
        />
      ))}
    </div>
  )

  // ==========================================================================
  // CANVAS MODE — Return content only (ElementWrapper handles chrome)
  // ==========================================================================

  if (!isPreview) {
    return renderFaqContent()
  }

  // ==========================================================================
  // PREVIEW MODE — Positioned wrapper for page layout
  // ==========================================================================

  const isRoot = element.parentId === null
  const positionStyles = computeElementPositionStyles(element, isRoot, activeBreakpoint)
  const sizeStyles = useElementSizeStyles(element, activeBreakpoint, {
    autoWidthDefault: true,
    autoHeightDefault: true,
  })

  /**
   * RESPONSIVE CONSTRAINTS:
   * - maxWidth: When autoWidth is on, use the element's configured width as the
   *   max so it doesn't stretch edge-to-edge on wide screens. This gives a
   *   centered, readable column. When autoWidth is off, no max needed (fixed).
   * - minWidth: Prevents the FAQ from collapsing too narrow to read on small
   *   containers. 280px is roughly the narrowest a Q&A list stays usable.
   */
  const hasAutoWidth = element.autoWidth ?? true
  const resolvedWidth = getStyleValue<number>(element, 'width' as keyof React.CSSProperties, activeBreakpoint) ?? element.width

  return (
    <div
      data-faq-renderer
      data-element-id={element.id}
      style={{
        ...positionStyles,
        ...sizeStyles,
        maxWidth: hasAutoWidth ? resolvedWidth : undefined,
        minWidth: 280,
      }}
    >
      {renderFaqContent()}
    </div>
  )
}

// ============================================================================
// FAQ ITEM RENDERER — Individual collapsible Q&A item
// ============================================================================

/**
 * Props for the FaqItemRenderer sub-component.
 *
 * Extracted as a separate component so each item can manage its own
 * expanded state and animation refs independently.
 */
interface FaqItemRendererProps {
  /** The FAQ item data */
  item: FaqItem
  /** Index in the items array (used for canvas default-open logic) */
  index: number
  /** Whether this is the last item (controls bottom border) */
  isLast: boolean
  /** Whether we're in preview mode (enables interactivity) */
  isPreview: boolean
  /** Whether multiple items can be open at once */
  allowMultipleOpen: boolean
  /** Visual separator between items */
  separatorStyle: 'line' | 'none' | 'card'
  /** Expand/collapse icon style */
  iconStyle: 'chevron' | 'plus' | 'none'
  /** Question text color */
  questionColor: string | undefined
  /** Question font size */
  questionFontSize: string | undefined
  /** Question font weight */
  questionFontWeight: string | number | undefined
  /** Answer text color */
  answerColor: string | undefined
  /** Answer font size */
  answerFontSize: string | undefined
  /** Divider line color */
  dividerColor: string | undefined
  /** Background color for each accordion item */
  itemBackgroundColor: string | undefined
  /** Font family */
  fontFamily: string
}

/**
 * Renders a single FAQ item with expand/collapse functionality.
 *
 * ANIMATION APPROACH:
 * Uses a measured content height with CSS max-height transition for smooth
 * expand/collapse. This avoids layout thrashing and produces a clean Apple-like
 * animation without JavaScript animation frames.
 *
 * CANVAS vs PREVIEW:
 * - Canvas: First item is expanded by default so designers can see content
 * - Preview: All items start collapsed, users click to expand
 */
function FaqItemRenderer({
  item,
  index,
  isLast,
  isPreview,
  separatorStyle,
  iconStyle,
  questionColor,
  questionFontSize,
  questionFontWeight,
  answerColor,
  answerFontSize,
  dividerColor,
  itemBackgroundColor,
  fontFamily,
}: FaqItemRendererProps) {
  /**
   * Expanded state — canvas mode opens the first item by default
   * so the designer can see what the answer content looks like.
   * Preview mode starts everything collapsed for the end user.
   */
  const [isExpanded, setIsExpanded] = useState(!isPreview && index === 0)

  /** Ref to the answer content div for measuring height */
  const contentRef = useRef<HTMLDivElement>(null)

  /** Measured height of the answer content for smooth animation */
  const [contentHeight, setContentHeight] = useState<number>(0)

  /** Measure content height when expanded or content changes */
  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight)
    }
  }, [isExpanded, item.answer])

  /** Toggle expanded state — only works in preview mode */
  const handleToggle = useCallback(() => {
    if (!isPreview) return
    setIsExpanded((prev) => !prev)
  }, [isPreview])

  // Card separator wraps each item in a bordered container
  const isCard = separatorStyle === 'card'

  /** Styles for the item wrapper — includes per-item background color */
  const itemWrapperStyle: React.CSSProperties = {
    /* Per-accordion item background color */
    ...(itemBackgroundColor && itemBackgroundColor !== 'transparent' ? {
      backgroundColor: itemBackgroundColor,
    } : {}),
    /* Card mode: bordered container with padding */
    ...(isCard ? {
      border: `1px solid ${dividerColor}`,
      borderRadius: '12px',
      padding: '0',
      overflow: 'hidden',
    } : {}),
    /* Line mode: bottom border as divider */
    ...(separatorStyle === 'line' && !isLast ? {
      borderBottom: `1px solid ${dividerColor}`,
    } : {}),
  }

  /** Styles for the question header row */
  const questionStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: isCard ? '20px 24px' : '20px 0',
    cursor: isPreview ? 'pointer' : 'default',
    userSelect: 'none',
    gap: '16px',
    /* Smooth color transitions on hover */
    transition: 'opacity 0.15s ease',
  }

  /** Styles for the question text */
  const questionTextStyle: React.CSSProperties = {
    color: questionColor,
    fontSize: questionFontSize,
    fontWeight: questionFontWeight,
    fontFamily: `${fontFamily}, -apple-system, BlinkMacSystemFont, sans-serif`,
    lineHeight: 1.4,
    flex: 1,
    margin: 0,
  }

  /** Styles for the expand/collapse icon */
  const iconWrapperStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: 24,
    height: 24,
    color: questionColor,
    opacity: 0.5,
    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease',
    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
  }

  /** For plus icon, no rotation — swap icons instead */
  const plusIconStyle: React.CSSProperties = {
    ...iconWrapperStyle,
    transform: 'none',
  }

  /** Styles for the collapsible answer container */
  const answerContainerStyle: React.CSSProperties = {
    maxHeight: isExpanded ? `${contentHeight}px` : '0px',
    overflow: 'hidden',
    transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
  }

  /** Styles for the answer text */
  const answerTextStyle: React.CSSProperties = {
    color: answerColor,
    fontSize: answerFontSize,
    fontFamily: `${fontFamily}, -apple-system, BlinkMacSystemFont, sans-serif`,
    lineHeight: 1.7,
    padding: isCard ? '0 24px 20px 24px' : '0 0 20px 0',
    margin: 0,
  }

  /** Render the appropriate expand/collapse icon */
  const renderIcon = () => {
    if (iconStyle === 'none') return null

    if (iconStyle === 'plus') {
      return (
        <div style={plusIconStyle}>
          {isExpanded ? (
            <Minus size={18} strokeWidth={2} />
          ) : (
            <Plus size={18} strokeWidth={2} />
          )}
        </div>
      )
    }

    /* Default: chevron icon with rotation animation */
    return (
      <div style={iconWrapperStyle}>
        <ChevronDown size={18} strokeWidth={2} />
      </div>
    )
  }

  return (
    <div style={itemWrapperStyle}>
      {/* Question header — clickable in preview mode */}
      <div
        style={questionStyle}
        onClick={handleToggle}
        role={isPreview ? 'button' : undefined}
        aria-expanded={isPreview ? isExpanded : undefined}
        tabIndex={isPreview ? 0 : undefined}
        onKeyDown={isPreview ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleToggle()
          }
        } : undefined}
      >
        <span style={questionTextStyle}>{item.question}</span>
        {renderIcon()}
      </div>

      {/* Collapsible answer content */}
      <div style={answerContainerStyle}>
        <div ref={contentRef}>
          <p style={answerTextStyle}>{item.answer}</p>
        </div>
      </div>
    </div>
  )
}
