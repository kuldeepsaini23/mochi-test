'use client'

/**
 * Block Preview Component
 *
 * SINGLE SOURCE OF TRUTH for rendering email block previews in the UI.
 * Used by both the email builder canvas and template preview cards.
 *
 * This component renders blocks visually using React/Tailwind,
 * NOT for email HTML generation (that's render-blocks.tsx).
 *
 * VARIABLE INTERPOLATION:
 * When isPreviewMode is true, variables like {{lead.firstName}} are replaced
 * with sample values using the SOURCE OF TRUTH system at @/lib/variables.
 *
 * SOURCE OF TRUTH KEYWORDS: BlockPreview, EmailBlockPreview, UIBlockRenderer
 */

import * as React from 'react'
import { useMemo } from 'react'
import {
  Check,
  Circle,
  X,
  ArrowRight,
  Star,
  Quote,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Timer,
} from 'lucide-react'
import { cn } from '@/lib/utils'
// Import only client-safe modules to avoid pulling in server-side dependencies (Prisma/Stripe)
import { interpolateBlock } from '@/lib/variables/interpolate-block'
import { getSampleVariableContext } from '@/lib/variables/sample-context'
import type { VariableContext } from '@/lib/variables/types'
import type {
  EmailBlock,
  EmailGradientConfig,
  EmailBorderConfig,
  ColumnContainer,
  AlertType,
} from '@/types/email-templates'

// ============================================================================
// PREVIEW CONTEXT - Shares preview mode state with nested components
// ============================================================================

/**
 * Context for sharing preview mode settings with nested block previews.
 * This allows ColumnPreview to access the same interpolation function.
 */
interface PreviewContextValue {
  isPreviewMode: boolean
  interpolateText: (text: string | undefined) => string
}

const PreviewContext = React.createContext<PreviewContextValue>({
  isPreviewMode: false,
  interpolateText: (text) => text ?? '',
})

/**
 * Hook to access preview context in nested components.
 */
function usePreviewContext() {
  return React.useContext(PreviewContext)
}

// ============================================================================
// STYLE UTILITIES - Shared across all block previews
// ============================================================================

/**
 * Sanitize a CSS color value to prevent CSS injection via dangerouslySetInnerHTML.
 * Strips characters that could break out of CSS context (<, >, {, }, ;, ", ', \).
 */
function sanitizeCSSColor(color: string): string {
  return color.replace(/[<>{};"'\\]/g, '')
}

/**
 * Convert gradient config to CSS gradient string.
 * Supports both linear and radial gradients with multiple color stops.
 * Colors are sanitized to prevent CSS injection when used in dangerouslySetInnerHTML.
 */
export function gradientToCSS(config: EmailGradientConfig): string {
  const sortedStops = [...config.stops].sort((a, b) => a.position - b.position)
  const stopsString = sortedStops.map((stop) => `${sanitizeCSSColor(stop.color)} ${stop.position}%`).join(', ')

  if (config.type === 'linear') {
    const angle = config.angle ?? 180
    return `linear-gradient(${angle}deg, ${stopsString})`
  } else {
    const shape = ['circle', 'ellipse'].includes(config.radialShape ?? '') ? config.radialShape! : 'ellipse'
    const posX = config.radialPosition?.x ?? 50
    const posY = config.radialPosition?.y ?? 50
    return `radial-gradient(${shape} at ${posX}% ${posY}%, ${stopsString})`
  }
}

/**
 * Get fallback color from gradient (first stop).
 * Used for email client compatibility since text gradients aren't supported.
 */
export function getGradientFallbackColor(config: EmailGradientConfig): string {
  if (config.stops.length === 0) return '#000000'
  const sorted = [...config.stops].sort((a, b) => a.position - b.position)
  return sorted[0].color
}

/**
 * Get text color style supporting both solid colors and gradients.
 * For gradients, uses CSS background-clip: text for visual effect.
 * Returns React.CSSProperties object to spread into style prop.
 *
 * IMPORTANT: Uses backgroundImage instead of background shorthand to avoid
 * conflicts with backgroundClip that cause styling bugs during re-renders.
 *
 * SOURCE OF TRUTH KEYWORDS: TextGradientStyle, GradientTextCSS
 */
export function getTextColorStyle(
  solidColor: string,
  gradient?: EmailGradientConfig
): React.CSSProperties {
  if (gradient && gradient.stops.length >= 2) {
    // Apply gradient text using background-clip technique
    // Use backgroundImage (not background shorthand) to avoid conflicts with backgroundClip
    return {
      backgroundImage: gradientToCSS(gradient),
      backgroundClip: 'text',
      WebkitBackgroundClip: 'text',
      color: 'transparent',
      WebkitTextFillColor: 'transparent',
    }
  }
  // Solid color fallback
  return { color: solidColor }
}

/**
 * Check if border has a gradient configuration.
 */
export function hasGradientBorder(border?: EmailBorderConfig): boolean {
  return !!(border && border.gradient && border.style !== 'none' && border.width > 0)
}

/**
 * Get border style for preview rendering (solid borders only).
 * Gradient borders are handled separately with CSS pseudo-elements.
 */
export function getBorderStyle(border?: EmailBorderConfig): React.CSSProperties {
  if (!border || border.style === 'none' || border.width === 0) {
    return {}
  }

  // Skip gradient borders - they're handled by gradient border wrapper
  if (border.gradient) {
    return {
      borderRadius: border.radius ? `${border.radius}px` : undefined,
    }
  }

  return {
    border: `${border.width}px ${border.style} ${border.color}`,
    borderRadius: border.radius ? `${border.radius}px` : undefined,
  }
}

/**
 * Get background style supporting solid colors, gradients, and images.
 * Priority: backgroundImage > gradient > solid color
 */
export function getBackgroundStyle(
  color?: string,
  gradient?: EmailGradientConfig,
  backgroundImage?: string
): React.CSSProperties {
  const style: React.CSSProperties = {}

  // Base color (lowest priority)
  if (color && color !== 'transparent') {
    style.backgroundColor = color
  }

  // Gradient (medium priority)
  if (gradient) {
    style.background = gradientToCSS(gradient)
    style.backgroundColor = getGradientFallbackColor(gradient)
  }

  // Background image (highest priority)
  if (backgroundImage) {
    style.backgroundImage = `url(${backgroundImage})`
    style.backgroundSize = 'cover'
    style.backgroundPosition = 'center'
    style.backgroundRepeat = 'no-repeat'
  }

  return style
}

/**
 * Generate unique class name for gradient border styling.
 */
export function getGradientBorderClassName(blockId: string): string {
  return `gradient-border-${blockId.replace(/[^a-zA-Z0-9]/g, '-')}`
}

// ============================================================================
// ICON HELPERS
// ============================================================================

/**
 * Get the appropriate icon component for list items.
 */
function getListIcon(type: string, iconColor: string) {
  switch (type) {
    case 'check':
      return <Check className="h-4 w-4" style={{ color: iconColor }} />
    case 'bullet':
      return <Circle className="h-2 w-2 fill-current" style={{ color: iconColor }} />
    case 'x':
      return <X className="h-4 w-4" style={{ color: iconColor }} />
    case 'arrow':
      return <ArrowRight className="h-4 w-4" style={{ color: iconColor }} />
    case 'star':
      return <Star className="h-4 w-4 fill-current" style={{ color: iconColor }} />
    default:
      return <Check className="h-4 w-4" style={{ color: iconColor }} />
  }
}

/**
 * Get alert styling based on alert type.
 */
function getAlertStyles(
  type: AlertType,
  overrideBg?: string,
  overrideText?: string
) {
  const defaults = {
    info: {
      bg: '#eff6ff',
      text: '#1e40af',
      border: '#3b82f6',
      icon: <Info className="h-5 w-5" style={{ color: '#3b82f6' }} />,
    },
    success: {
      bg: '#f0fdf4',
      text: '#166534',
      border: '#22c55e',
      icon: <CheckCircle2 className="h-5 w-5" style={{ color: '#22c55e' }} />,
    },
    warning: {
      bg: '#fffbeb',
      text: '#92400e',
      border: '#f59e0b',
      icon: <AlertTriangle className="h-5 w-5" style={{ color: '#f59e0b' }} />,
    },
    error: {
      bg: '#fef2f2',
      text: '#991b1b',
      border: '#ef4444',
      icon: <XCircle className="h-5 w-5" style={{ color: '#ef4444' }} />,
    },
  }
  const preset = defaults[type]
  return {
    bg: overrideBg ?? preset.bg,
    text: overrideText ?? preset.text,
    border: preset.border,
    icon: preset.icon,
  }
}

// ============================================================================
// BLOCK PREVIEW COMPONENT - SINGLE SOURCE OF TRUTH
// ============================================================================

/**
 * Props for BlockPreview component.
 */
interface BlockPreviewProps {
  /** The email block to render */
  block: EmailBlock
  /**
   * If true, renders a more compact version for thumbnail previews.
   * Currently has no effect but reserved for future optimization.
   */
  compact?: boolean
  /**
   * If true, replaces {{variable}} placeholders with sample values.
   * Uses the SOURCE OF TRUTH system at @/lib/variables.
   */
  isPreviewMode?: boolean
  /**
   * Optional custom variable context override.
   * If not provided, uses getSampleVariableContext() for sample data.
   */
  variableContext?: VariableContext
}

/**
 * BlockPreview - Renders a single email block for UI preview.
 *
 * This is the SINGLE SOURCE OF TRUTH for visual block rendering.
 * Used by:
 * - EmailCanvas (builder mode and preview mode)
 * - TemplatePreviewCard (template list thumbnails)
 * - Any other UI that needs to display email blocks
 *
 * When isPreviewMode is true, variables are replaced with sample values.
 *
 * NOTE: For HTML email generation, use render-blocks.tsx instead.
 */
export function BlockPreview({
  block,
  isPreviewMode = false,
  variableContext,
}: BlockPreviewProps) {
  /**
   * Get the variable context for interpolation.
   * Uses provided context or falls back to sample data.
   */
  const context = useMemo(() => {
    if (!isPreviewMode) return null
    return variableContext ?? getSampleVariableContext()
  }, [isPreviewMode, variableContext])

  /**
   * Pre-process the entire block with universal interpolation.
   * This automatically interpolates ALL string fields in the block,
   * including nested arrays (features, items, etc.).
   *
   * WHY: Instead of manually calling interpolateText on each field,
   * we process the entire block structure automatically.
   *
   * SOURCE OF TRUTH KEYWORDS: UniversalBlockInterpolation
   */
  const processedBlock = useMemo(() => {
    if (!isPreviewMode || !context) return block
    return interpolateBlock(block, context)
  }, [block, isPreviewMode, context])

  /**
   * Legacy interpolateText for backwards compatibility.
   * New blocks should rely on processedBlock having all text pre-interpolated.
   */
  const interpolateText = React.useCallback((text: string | undefined): string => {
    // With processedBlock, this is now mainly a passthrough
    // The text is already interpolated in processedBlock
    return text ?? ''
  }, [])

  /**
   * Preview context value for nested components.
   */
  const previewContextValue = useMemo<PreviewContextValue>(() => ({
    isPreviewMode,
    interpolateText,
  }), [isPreviewMode, interpolateText])

  /**
   * Use the processed block for rendering (all text already interpolated)
   */
  const renderBlock = processedBlock

  /**
   * Render block content with preview context.
   */
  const blockContent = (() => {
  switch (renderBlock.type) {
    // ========================================================================
    // BASIC BLOCKS
    // ========================================================================

    case 'heading': {
      // Get text color style (supports gradients via background-clip)
      const textColorStyle = getTextColorStyle(
        renderBlock.props.color ?? '#1f2937',
        renderBlock.props.gradient
      )

      const needsContainer =
        renderBlock.props.backgroundColor ||
        renderBlock.props.backgroundGradient ||
        renderBlock.props.backgroundImage ||
        renderBlock.props.border ||
        renderBlock.props.padding

      const headingBorderRadius = renderBlock.props.border?.radius ?? 0

      const containerStyle: React.CSSProperties = {
        ...getBackgroundStyle(renderBlock.props.backgroundColor, renderBlock.props.backgroundGradient, renderBlock.props.backgroundImage),
        ...getBorderStyle(renderBlock.props.border),
        ...(renderBlock.props.padding ? { padding: `${renderBlock.props.padding}px` } : {}),
      }

      // Calculate font size - use custom value or fall back to level defaults
      const headingFontSize = renderBlock.props.fontSize ?? (
        renderBlock.props.level === 'h1' ? 32 : renderBlock.props.level === 'h2' ? 24 : 20
      )

      const headingContent = (
        <div
          className="font-semibold"
          style={{
            textAlign: renderBlock.props.align,
            ...textColorStyle,
            fontSize: `${headingFontSize}px`,
            lineHeight: 1.3,
          }}
        >
          {renderBlock.props.text || 'Heading'}
        </div>
      )

      if (needsContainer) {
        if (hasGradientBorder(renderBlock.props.border) && renderBlock.props.border) {
          const className = getGradientBorderClassName(renderBlock.id)
          const gradientCSS = gradientToCSS(renderBlock.props.border.gradient!)
          const borderWidth = renderBlock.props.border.width

          const css = `
.${className} {
  position: relative;
}
.${className}::before {
  content: '';
  position: absolute;
  inset: 0;
  padding: ${borderWidth}px;
  background: ${gradientCSS};
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  pointer-events: none;
  border-radius: ${headingBorderRadius}px;
  z-index: 0;
}
`
          return (
            <>
              <style dangerouslySetInnerHTML={{ __html: css }} />
              <div className={className} style={containerStyle}>
                {headingContent}
              </div>
            </>
          )
        }
        return <div style={containerStyle}>{headingContent}</div>
      }
      return headingContent
    }

    case 'text': {
      // Get text color style (supports gradients via background-clip)
      const textColorStyle = getTextColorStyle(
        renderBlock.props.color ?? '#374151',
        renderBlock.props.gradient
      )

      const needsContainer =
        renderBlock.props.backgroundColor ||
        renderBlock.props.backgroundGradient ||
        renderBlock.props.backgroundImage ||
        renderBlock.props.border ||
        renderBlock.props.padding

      const textBorderRadius = renderBlock.props.border?.radius ?? 0

      const containerStyle: React.CSSProperties = {
        ...getBackgroundStyle(renderBlock.props.backgroundColor, renderBlock.props.backgroundGradient, renderBlock.props.backgroundImage),
        ...getBorderStyle(renderBlock.props.border),
        ...(renderBlock.props.padding ? { padding: `${renderBlock.props.padding}px` } : {}),
      }

      // Use custom font size or default to 16px
      const textFontSize = renderBlock.props.fontSize ?? 16

      const textContent = (
        <div
          className="whitespace-pre-wrap"
          style={{
            textAlign: renderBlock.props.align,
            ...textColorStyle,
            fontSize: `${textFontSize}px`,
            lineHeight: 1.6,
          }}
        >
          {renderBlock.props.text || 'Text content...'}
        </div>
      )

      if (needsContainer) {
        if (hasGradientBorder(renderBlock.props.border) && renderBlock.props.border) {
          const className = getGradientBorderClassName(renderBlock.id)
          const gradientCSS = gradientToCSS(renderBlock.props.border.gradient!)
          const borderWidth = renderBlock.props.border.width

          const css = `
.${className} {
  position: relative;
}
.${className}::before {
  content: '';
  position: absolute;
  inset: 0;
  padding: ${borderWidth}px;
  background: ${gradientCSS};
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  pointer-events: none;
  border-radius: ${textBorderRadius}px;
  z-index: 0;
}
`
          return (
            <>
              <style dangerouslySetInnerHTML={{ __html: css }} />
              <div className={className} style={containerStyle}>
                {textContent}
              </div>
            </>
          )
        }
        return <div style={containerStyle}>{textContent}</div>
      }
      return textContent
    }

    case 'button': {
      const bgColor = renderBlock.props.backgroundGradient
        ? getGradientFallbackColor(renderBlock.props.backgroundGradient)
        : renderBlock.props.backgroundColor ?? '#2563eb'

      const buttonHasGradientBorder = hasGradientBorder(renderBlock.props.border)

      // Get text color style (supports gradients via background-clip)
      const textColorStyle = getTextColorStyle(
        renderBlock.props.textColor ?? '#ffffff',
        renderBlock.props.textGradient
      )

      const borderStyle: React.CSSProperties =
        renderBlock.props.border &&
        renderBlock.props.border.style !== 'none' &&
        renderBlock.props.border.width > 0 &&
        !renderBlock.props.border.gradient
          ? {
              border: `${renderBlock.props.border.width}px ${renderBlock.props.border.style} ${renderBlock.props.border.color}`,
            }
          : {}

      const buttonRadius = renderBlock.props.borderRadius ?? 6

      // Use custom font size or default to 16px
      const buttonFontSize = renderBlock.props.fontSize ?? 16

      // Common button content with text gradient support
      const buttonText = renderBlock.props.textGradient ? (
        <span style={textColorStyle}>{renderBlock.props.text || 'Button'}</span>
      ) : (
        renderBlock.props.text || 'Button'
      )

      if (buttonHasGradientBorder && renderBlock.props.border) {
        const className = getGradientBorderClassName(renderBlock.id)
        const gradientCSS = gradientToCSS(renderBlock.props.border.gradient!)
        const borderWidth = renderBlock.props.border.width

        const css = `
.${className} {
  position: relative;
  display: inline-block;
}
.${className}::before {
  content: '';
  position: absolute;
  inset: 0;
  padding: ${borderWidth}px;
  background: ${gradientCSS};
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  pointer-events: none;
  border-radius: ${buttonRadius}px;
  z-index: 0;
}
`
        return (
          <div style={{ textAlign: renderBlock.props.align }}>
            <style dangerouslySetInnerHTML={{ __html: css }} />
            <span
              className={`${className} font-medium`}
              style={{
                padding: `${renderBlock.props.paddingY ?? 10}px ${renderBlock.props.paddingX ?? 24}px`,
                backgroundColor: bgColor,
                borderRadius: `${buttonRadius}px`,
                fontSize: `${buttonFontSize}px`,
                ...(!renderBlock.props.textGradient && { color: renderBlock.props.textColor ?? '#ffffff' }),
                ...(renderBlock.props.backgroundGradient && {
                  background: gradientToCSS(renderBlock.props.backgroundGradient),
                }),
              }}
            >
              {buttonText}
            </span>
          </div>
        )
      }

      return (
        <div style={{ textAlign: renderBlock.props.align }}>
          <span
            className="inline-block font-medium"
            style={{
              padding: `${renderBlock.props.paddingY ?? 10}px ${renderBlock.props.paddingX ?? 24}px`,
              backgroundColor: bgColor,
              borderRadius: `${buttonRadius}px`,
              fontSize: `${buttonFontSize}px`,
              ...(!renderBlock.props.textGradient && { color: renderBlock.props.textColor ?? '#ffffff' }),
              ...(renderBlock.props.backgroundGradient && {
                background: gradientToCSS(renderBlock.props.backgroundGradient),
              }),
              ...borderStyle,
            }}
          >
            {buttonText}
          </span>
        </div>
      )
    }

    case 'image': {
      const imageHasGradientBorder = hasGradientBorder(renderBlock.props.border)
      const imageRadius = renderBlock.props.borderRadius ?? 4

      const imageStyle: React.CSSProperties = {
        maxWidth: '100%',
        height: 'auto',
        borderRadius: `${imageRadius}px`,
        ...getBorderStyle(renderBlock.props.border),
      }

      if (!renderBlock.props.src) {
        return (
          <div style={{ textAlign: renderBlock.props.align }}>
            <div className="inline-flex items-center justify-center w-full h-24 bg-muted/50 rounded border border-dashed border-border">
              <div className="text-center">
                <p className="text-xs text-muted-foreground/60 mt-1">Add image URL</p>
              </div>
            </div>
          </div>
        )
      }

      if (imageHasGradientBorder && renderBlock.props.border) {
        const className = getGradientBorderClassName(renderBlock.id)
        const gradientCSS = gradientToCSS(renderBlock.props.border.gradient!)
        const borderWidth = renderBlock.props.border.width

        const css = `
.${className} {
  position: relative;
  display: inline-block;
}
.${className}::before {
  content: '';
  position: absolute;
  inset: 0;
  padding: ${borderWidth}px;
  background: ${gradientCSS};
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  pointer-events: none;
  border-radius: ${imageRadius}px;
  z-index: 1;
}
`
        return (
          <div style={{ textAlign: renderBlock.props.align }}>
            <style dangerouslySetInnerHTML={{ __html: css }} />
            <span className={className} style={{ display: 'inline-block', borderRadius: `${imageRadius}px` }}>
              <img
                src={renderBlock.props.src}
                alt={renderBlock.props.alt}
                style={{
                  display: 'block',
                  maxWidth: renderBlock.props.width ? `${renderBlock.props.width}px` : '100%',
                  height: 'auto',
                  borderRadius: `${imageRadius}px`,
                }}
              />
            </span>
          </div>
        )
      }

      return (
        <div style={{ textAlign: renderBlock.props.align }}>
          <img
            src={renderBlock.props.src}
            alt={renderBlock.props.alt}
            className="inline-block"
            style={{
              ...imageStyle,
              maxWidth: renderBlock.props.width ? `${renderBlock.props.width}px` : '100%',
            }}
          />
        </div>
      )
    }

    case 'divider': {
      const { color, gradient, thickness = 1, style = 'solid', marginTop = 24, marginBottom = 24 } = renderBlock.props ?? {}

      // For gradient dividers, use a div with background gradient
      if (gradient && gradient.stops.length >= 2) {
        return (
          <div
            style={{
              margin: `${marginTop}px 0 ${marginBottom}px 0`,
              height: `${thickness}px`,
              background: gradientToCSS(gradient),
              borderRadius: thickness > 1 ? `${thickness / 2}px` : undefined,
            }}
          />
        )
      }

      // Solid color divider
      const dividerColor = color ?? '#e5e7eb'
      return (
        <hr
          style={{
            margin: `${marginTop}px 0 ${marginBottom}px 0`,
            borderTop: `${thickness}px ${style} ${dividerColor}`,
            borderBottom: 'none',
            borderLeft: 'none',
            borderRight: 'none',
          }}
        />
      )
    }

    case 'spacer': {
      const spacerStyle: React.CSSProperties = {
        height: renderBlock.props.height,
        ...getBackgroundStyle(renderBlock.props.backgroundColor, renderBlock.props.backgroundGradient),
      }

      return (
        <div className="flex items-center justify-center" style={spacerStyle}>
          <span className="text-[10px] text-muted-foreground/40">{renderBlock.props.height}px</span>
        </div>
      )
    }

    case 'columns': {
      const { leftColumn, rightColumn, gap = 24, leftWidth = 50 } = renderBlock.props
      const rightWidth = 100 - leftWidth

      return (
        <div className="grid" style={{ gap, gridTemplateColumns: `${leftWidth}fr ${rightWidth}fr` }}>
          {/* Left column */}
          <ColumnPreview column={leftColumn} />
          {/* Right column */}
          <ColumnPreview column={rightColumn} />
        </div>
      )
    }

    // ========================================================================
    // COMPOSITE BLOCKS
    // ========================================================================

    case 'list': {
      const {
        items = [],
        iconType = 'check',
        iconColor = '#22c55e',
        iconGradient,
        textColor = '#374151',
        textGradient,
        backgroundColor,
        border,
        padding = 16,
        itemSpacing = 12,
        marginTop = 0,
        marginBottom = 0,
      } = renderBlock.props

      const containerStyle: React.CSSProperties = {
        ...getBackgroundStyle(backgroundColor),
        ...getBorderStyle(border),
        padding: `${padding}px`,
        marginTop: `${marginTop}px`,
        marginBottom: `${marginBottom}px`,
      }

      // Get text color style (supports gradients via background-clip)
      const listTextColorStyle = getTextColorStyle(textColor, textGradient)

      return (
        <div style={containerStyle}>
          <div className="flex flex-col" style={{ gap: `${itemSpacing}px` }}>
            {items.length === 0 ? (
              <div className="text-sm text-muted-foreground italic">
                Add list items in properties panel
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    {getListIcon(item.icon ?? iconType, iconGradient ? getGradientFallbackColor(iconGradient) : iconColor)}
                  </div>
                  <span className="text-sm" style={listTextColorStyle}>
                    {item.text}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )
    }

    case 'pricing-card': {
      const {
        planName = 'Pro Plan',
        price = '$29',
        currency = '',
        billingPeriod = '/month',
        description,
        features = [],
        buttonText = 'Get Started',
        isPopular = false,
        accentColor = '#2563eb',
        accentGradient,
        backgroundColor = '#ffffff',
        textColor = '#1f2937',
        textGradient,
        border,
        borderRadius = 12,
        padding = 24,
        marginTop = 0,
        marginBottom = 0,
      } = renderBlock.props

      const containerStyle: React.CSSProperties = {
        backgroundColor,
        ...getBorderStyle(border),
        borderRadius: `${borderRadius}px`,
        padding: `${padding}px`,
        marginTop: `${marginTop}px`,
        marginBottom: `${marginBottom}px`,
        position: 'relative' as const,
        overflow: 'hidden',
      }

      if (!border) {
        containerStyle.border = '1px solid #e5e7eb'
      }

      // Get text and accent color styles (supports gradients via background-clip)
      const pricingTextColorStyle = getTextColorStyle(textColor, textGradient)
      const pricingAccentColorStyle = getTextColorStyle(accentColor, accentGradient)
      const effectiveAccentColor = accentGradient ? getGradientFallbackColor(accentGradient) : accentColor

      return (
        <div style={containerStyle}>
          {isPopular && (
            <div
              className="absolute top-0 right-0 text-xs font-semibold px-3 py-1 rounded-bl-lg text-white"
              style={{ backgroundColor: effectiveAccentColor }}
            >
              Most Popular
            </div>
          )}

          <h3 className="text-lg font-semibold mb-2" style={pricingTextColorStyle}>
            {planName}
          </h3>

          <div className="flex items-baseline gap-1 mb-3">
            {currency && (
              <span className="text-lg" style={pricingTextColorStyle}>
                {currency}
              </span>
            )}
            <span className="text-4xl font-bold" style={pricingAccentColorStyle}>
              {price}
            </span>
            <span className="text-sm text-muted-foreground">{billingPeriod}</span>
          </div>

          {description && (
            <p className="text-sm text-muted-foreground mb-4">{description}</p>
          )}

          {features.length > 0 && (
            <ul className="space-y-2 mb-6">
              {features.map((feature, idx) => (
                <li key={idx} className="flex items-center gap-2 text-sm" style={pricingTextColorStyle}>
                  <Check className="h-4 w-4 flex-shrink-0" style={{ color: effectiveAccentColor }} />
                  {feature}
                </li>
              ))}
            </ul>
          )}

          <button
            className="w-full py-3 px-4 text-sm font-medium rounded-lg transition-colors text-white"
            style={{ backgroundColor: effectiveAccentColor }}
          >
            {buttonText}
          </button>
        </div>
      )
    }

    case 'testimonial-card': {
      const {
        quote = 'This product has completely transformed how we work. Highly recommended!',
        authorName = 'Jane Smith',
        authorRole,
        companyName,
        avatarSrc,
        rating,
        accentColor = '#f59e0b',
        accentGradient,
        backgroundColor = '#ffffff',
        textColor = '#374151',
        textGradient,
        border,
        borderRadius = 12,
        padding = 24,
        marginTop = 0,
        marginBottom = 0,
      } = renderBlock.props

      const authorSubtitle = [authorRole, companyName].filter(Boolean).join(', ')

      const containerStyle: React.CSSProperties = {
        backgroundColor,
        ...getBorderStyle(border),
        borderRadius: `${borderRadius}px`,
        padding: `${padding}px`,
        marginTop: `${marginTop}px`,
        marginBottom: `${marginBottom}px`,
      }

      if (!border) {
        containerStyle.border = '1px solid #e5e7eb'
      }

      // Get text and accent color styles (supports gradients via background-clip)
      const testimonialTextColorStyle = getTextColorStyle(textColor, textGradient)
      const effectiveAccentColor = accentGradient ? getGradientFallbackColor(accentGradient) : accentColor

      return (
        <div style={containerStyle}>
          {rating && rating > 0 && (
            <div className="flex items-center gap-0.5 mb-4">
              {Array.from({ length: 5 }).map((_, idx) => (
                <Star
                  key={idx}
                  className="h-4 w-4"
                  style={{
                    color: idx < rating ? effectiveAccentColor : '#d1d5db',
                    fill: idx < rating ? effectiveAccentColor : 'transparent',
                  }}
                />
              ))}
            </div>
          )}

          <Quote className="h-6 w-6 mb-3 opacity-30" style={{ color: effectiveAccentColor }} />

          <blockquote
            className="text-base italic leading-relaxed mb-5"
            style={testimonialTextColorStyle}
          >
            &ldquo;{quote}&rdquo;
          </blockquote>

          <div className="flex items-center gap-3">
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt={authorName}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white"
                style={{ backgroundColor: effectiveAccentColor }}
              >
                {authorName.charAt(0).toUpperCase()}
              </div>
            )}

            <div>
              <div className="font-semibold text-sm" style={testimonialTextColorStyle}>
                {authorName}
              </div>
              {authorSubtitle && (
                <div className="text-xs text-muted-foreground">{authorSubtitle}</div>
              )}
            </div>
          </div>
        </div>
      )
    }

    case 'feature-card': {
      const {
        icon = '🚀',
        title = 'Amazing Feature',
        description = 'This feature will help you accomplish more in less time.',
        layout = 'vertical',
        align = 'center',
        backgroundColor = '#ffffff',
        titleColor = '#1f2937',
        titleGradient,
        descriptionColor = '#6b7280',
        descriptionGradient,
        iconSize = 48,
        border,
        borderRadius = 12,
        padding = 24,
        marginTop = 0,
        marginBottom = 0,
      } = renderBlock.props

      const containerStyle: React.CSSProperties = {
        backgroundColor,
        ...getBorderStyle(border),
        borderRadius: `${borderRadius}px`,
        padding: `${padding}px`,
        marginTop: `${marginTop}px`,
        marginBottom: `${marginBottom}px`,
        textAlign: align,
      }

      if (!border) {
        containerStyle.border = '1px solid #e5e7eb'
      }

      // Get title and description color styles (supports gradients via background-clip)
      const featureTitleColorStyle = getTextColorStyle(titleColor, titleGradient)
      const featureDescColorStyle = getTextColorStyle(descriptionColor, descriptionGradient)

      const isHorizontal = layout === 'horizontal'

      return (
        <div style={containerStyle}>
          <div className={isHorizontal ? 'flex items-start gap-4' : ''}>
            <div
              className={isHorizontal ? 'shrink-0' : 'mb-4'}
              style={{
                fontSize: `${iconSize}px`,
                lineHeight: 1,
                ...(isHorizontal ? {} : { display: 'flex', justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start' }),
              }}
            >
              {icon}
            </div>

            <div>
              <h4 className="text-base font-semibold mb-2" style={featureTitleColorStyle}>
                {title}
              </h4>
              <p className="text-sm leading-relaxed" style={featureDescColorStyle}>
                {description}
              </p>
            </div>
          </div>
        </div>
      )
    }

    case 'stats-card': {
      const {
        value = '10,000+',
        label = 'Happy Customers',
        icon,
        valueColor = '#1f2937',
        valueGradient,
        labelColor = '#6b7280',
        labelGradient,
        backgroundColor = '#ffffff',
        align = 'center',
        border,
        borderRadius = 12,
        padding = 24,
        marginTop = 0,
        marginBottom = 0,
      } = renderBlock.props

      const containerStyle: React.CSSProperties = {
        backgroundColor,
        ...getBorderStyle(border),
        borderRadius: `${borderRadius}px`,
        padding: `${padding}px`,
        marginTop: `${marginTop}px`,
        marginBottom: `${marginBottom}px`,
        textAlign: align,
      }

      if (!border) {
        containerStyle.border = '1px solid #e5e7eb'
      }

      // Get value and label color styles (supports gradients via background-clip)
      const statsValueColorStyle = getTextColorStyle(valueColor, valueGradient)
      const statsLabelColorStyle = getTextColorStyle(labelColor, labelGradient)

      return (
        <div style={containerStyle}>
          {icon && (
            <div
              className="mb-3"
              style={{
                fontSize: '32px',
                lineHeight: 1,
                display: 'flex',
                justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
              }}
            >
              {icon}
            </div>
          )}

          <div className="text-3xl font-bold mb-1" style={statsValueColorStyle}>
            {value}
          </div>

          <div className="text-sm font-medium" style={statsLabelColorStyle}>
            {label}
          </div>
        </div>
      )
    }

    case 'alert-card': {
      const {
        alertType = 'info',
        title = 'Information',
        message = 'This is an important message for your attention.',
        buttonText,
        buttonHref,
        backgroundColor,
        textColor,
        textGradient,
        border,
        borderRadius = 8,
        padding = 16,
        marginTop = 0,
        marginBottom = 0,
      } = renderBlock.props

      const alertStyles = getAlertStyles(alertType, backgroundColor, textColor)

      const containerStyle: React.CSSProperties = {
        backgroundColor: alertStyles.bg,
        borderRadius: `${borderRadius}px`,
        padding: `${padding}px`,
        marginTop: `${marginTop}px`,
        marginBottom: `${marginBottom}px`,
        borderLeft: `4px solid ${alertStyles.border}`,
        ...getBorderStyle(border),
      }

      // Get text color style (supports gradients via background-clip)
      // Only apply gradient if textGradient is set, otherwise use alert preset color
      const alertTextColorStyle = textGradient
        ? getTextColorStyle(alertStyles.text, textGradient)
        : { color: alertStyles.text }

      return (
        <div style={containerStyle}>
          <div className="flex gap-3">
            <div className="shrink-0 mt-0.5">{alertStyles.icon}</div>

            <div className="flex-1">
              {title && (
                <h5
                  className="font-semibold text-sm mb-1"
                  style={alertTextColorStyle}
                >
                  {title}
                </h5>
              )}
              <p
                className="text-sm leading-relaxed"
                style={{ ...alertTextColorStyle, opacity: textGradient ? 1 : 0.9 }}
              >
                {message}
              </p>

              {buttonText && buttonHref && (
                <a
                  href={buttonHref}
                  className="inline-block mt-3 text-sm font-medium underline"
                  style={alertTextColorStyle}
                >
                  {buttonText}
                </a>
              )}
            </div>
          </div>
        </div>
      )
    }

    /**
     * COUNTDOWN TIMER PREVIEW
     * Renders a countdown timer with the specified style.
     * Calculates remaining time from the target date.
     */
    case 'countdown-timer': {
      const {
        // targetDate is not used in preview - we show static demo values
        showDays,
        showHours,
        showMinutes,
        showSeconds,
        expiredMessage,
        style,
        digitColor,
        digitGradient,
        labelColor,
        labelGradient,
        backgroundColor,
        separatorStyle,
        separatorColor,
        separatorGradient,
        align = 'center',
        borderRadius = 8,
        padding = 24,
        marginTop = 0,
        marginBottom = 0,
      } = renderBlock.props

      /**
       * For preview purposes, we show static demo values instead of real-time
       * countdown. This keeps the component pure (no Date.now() during render).
       * The actual timer rendering happens in render-blocks.tsx at send time.
       */
      const isExpired = false
      const days = 3
      const hours = 12
      const minutes = 45
      const seconds = 30

      // Format number with leading zero
      const padNum = (n: number) => n.toString().padStart(2, '0')

      // Build units array based on what's enabled
      const units: Array<{ value: number; label: string }> = []
      if (showDays) units.push({ value: days, label: 'Days' })
      if (showHours) units.push({ value: hours, label: 'Hours' })
      if (showMinutes) units.push({ value: minutes, label: 'Minutes' })
      if (showSeconds) units.push({ value: seconds, label: 'Seconds' })

      // Separator character
      const sep = separatorStyle === 'colon' ? ':' : ''

      // Alignment style
      const alignClass = align === 'left' ? 'text-left' : align === 'right' ? 'text-right' : 'text-center'

      // Get color styles (supports gradients via background-clip)
      const timerDigitColorStyle = getTextColorStyle(digitColor, digitGradient)
      const timerLabelColorStyle = getTextColorStyle(labelColor, labelGradient)
      const timerSeparatorColorStyle = getTextColorStyle(
        separatorColor ?? digitColor,
        separatorGradient ?? digitGradient
      )
      // Fallback color for border (gradients can't be used for borders directly)
      const effectiveDigitColor = digitGradient ? getGradientFallbackColor(digitGradient) : digitColor

      return (
        <div
          className={cn('rounded-lg', alignClass)}
          style={{
            backgroundColor,
            borderRadius: `${borderRadius}px`,
            padding: `${padding}px`,
            marginTop: `${marginTop}px`,
            marginBottom: `${marginBottom}px`,
          }}
        >
          {isExpired ? (
            // Show expired message
            <p className="text-lg font-semibold" style={timerDigitColorStyle}>
              {expiredMessage}
            </p>
          ) : style === 'inline' ? (
            // Inline text format: "3 days, 12 hours remaining"
            <p className="text-lg font-medium" style={timerDigitColorStyle}>
              {units
                .map((u) => `${u.value} ${u.value === 1 ? u.label.slice(0, -1) : u.label.toLowerCase()}`)
                .join(', ')}{' '}
              remaining
            </p>
          ) : style === 'minimal' ? (
            // Minimal format: "03:12:45:30"
            <p
              className="text-3xl font-bold font-mono tracking-wider"
              style={timerDigitColorStyle}
            >
              {units.map((u) => padNum(u.value)).join(sep)}
            </p>
          ) : (
            // Boxes or circular format
            <div className="flex items-center justify-center gap-2">
              {units.map((unit, idx) => (
                <React.Fragment key={unit.label}>
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        'flex items-center justify-center min-w-[50px] py-2 px-3',
                        style === 'circular' ? 'rounded-full border-2' : 'rounded-lg border'
                      )}
                      style={{
                        backgroundColor: style === 'circular' ? 'transparent' : '#ffffff',
                        borderColor: style === 'circular' ? effectiveDigitColor : '#e5e7eb',
                      }}
                    >
                      <span
                        className="text-2xl font-bold font-mono"
                        style={timerDigitColorStyle}
                      >
                        {padNum(unit.value)}
                      </span>
                    </div>
                    <span
                      className="text-xs mt-1.5 uppercase tracking-wide font-medium"
                      style={timerLabelColorStyle}
                    >
                      {unit.label}
                    </span>
                  </div>
                  {/* Separator between boxes */}
                  {idx < units.length - 1 && separatorStyle === 'colon' && (
                    <span
                      className="text-2xl font-bold mb-5"
                      style={timerSeparatorColorStyle}
                    >
                      :
                    </span>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      )
    }

    /**
     * SOCIAL PROOF BLOCK PREVIEW
     * Renders overlapping avatars with metric display.
     * Used for showing user counts, testimonial stacks, etc.
     *
     * SOURCE OF TRUTH KEYWORDS: SocialProofPreview, AvatarStackPreview
     */
    case 'social-proof': {
      const {
        avatars = [],
        metric = '10,000+',
        metricLabel = 'Happy customers',
        heading,
        subheading,
        layout = 'horizontal',
        avatarSize = 40,
        avatarOverlap = 12,
        avatarBorderColor = '#ffffff',
        metricColor = '#1f2937',
        metricGradient,
        labelColor = '#6b7280',
        labelGradient,
        headingColor = '#1f2937',
        headingGradient,
        subheadingColor = '#6b7280',
        subheadingGradient,
        backgroundColor,
        border,
        borderRadius = 8,
        padding = 16,
        marginTop = 0,
        marginBottom = 0,
      } = renderBlock.props

      /**
       * Container styles for the social proof block.
       */
      const containerStyle: React.CSSProperties = {
        ...getBackgroundStyle(backgroundColor),
        ...getBorderStyle(border),
        borderRadius: `${borderRadius}px`,
        padding: `${padding}px`,
        marginTop: `${marginTop}px`,
        marginBottom: `${marginBottom}px`,
      }

      // Get color styles (supports gradients via background-clip)
      const socialMetricColorStyle = getTextColorStyle(metricColor, metricGradient)
      const socialLabelColorStyle = getTextColorStyle(labelColor, labelGradient)
      const socialHeadingColorStyle = getTextColorStyle(headingColor ?? '#1f2937', headingGradient)
      const socialSubheadingColorStyle = getTextColorStyle(subheadingColor ?? '#6b7280', subheadingGradient)

      /**
       * Calculate the width needed for the avatar stack.
       * Each avatar overlaps the previous one by avatarOverlap pixels.
       */
      const avatarStackWidth = avatars.length > 0
        ? avatarSize + (avatars.length - 1) * (avatarSize - avatarOverlap)
        : 0

      /**
       * Avatar stack JSX - overlapping circular images.
       */
      const avatarStackElement = (
        <div
          className="relative flex shrink-0"
          style={{ width: `${avatarStackWidth}px`, height: `${avatarSize}px` }}
        >
          {avatars.map((src, idx) => (
            <div
              key={idx}
              className="absolute rounded-full overflow-hidden shadow-sm"
              style={{
                width: `${avatarSize}px`,
                height: `${avatarSize}px`,
                left: `${idx * (avatarSize - avatarOverlap)}px`,
                border: `2px solid ${avatarBorderColor}`,
                zIndex: avatars.length - idx,
              }}
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={src}
                  alt={`User ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full bg-linear-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold"
                >
                  {idx + 1}
                </div>
              )}
            </div>
          ))}
        </div>
      )

      /**
       * Metric display JSX (value + label)
       */
      const metricElement = (
        <div className={layout === 'centered' ? 'text-center' : ''}>
          <div
            className="text-xl font-bold leading-tight"
            style={socialMetricColorStyle}
          >
            {metric}
          </div>
          <div
            className="text-sm leading-tight"
            style={socialLabelColorStyle}
          >
            {metricLabel}
          </div>
        </div>
      )

      /**
       * Optional heading/subheading element
       */
      const headingElement = (heading || subheading) ? (
        <div className={layout === 'centered' ? 'text-center' : ''}>
          {heading && (
            <div className="text-lg font-semibold mb-1" style={socialHeadingColorStyle}>
              {heading}
            </div>
          )}
          {subheading && (
            <div className="text-sm mb-3" style={socialSubheadingColorStyle}>
              {subheading}
            </div>
          )}
        </div>
      ) : null

      /**
       * Layout variations:
       * - horizontal: avatars left, metric right
       * - vertical: avatars top, metric bottom
       * - centered: everything centered
       */
      if (layout === 'vertical' || layout === 'centered') {
        return (
          <div style={containerStyle}>
            {headingElement}
            <div className="flex flex-col items-center gap-3">
              {avatarStackElement}
              {metricElement}
            </div>
          </div>
        )
      }

      // Default: horizontal layout
      return (
        <div style={containerStyle}>
          {headingElement}
          <div className="flex items-center gap-4">
            {avatarStackElement}
            {metricElement}
          </div>
        </div>
      )
    }

    default: {
      // TypeScript exhaustive check - if we get here, we missed a block type
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _exhaustiveCheck: never = renderBlock
      return null
    }
  }
  })()

  // Wrap with preview context provider for nested components (like ColumnPreview)
  return (
    <PreviewContext.Provider value={previewContextValue}>
      {blockContent}
    </PreviewContext.Provider>
  )
}

// ============================================================================
// COLUMN PREVIEW - Helper for rendering column containers
// ============================================================================

/**
 * Renders blocks inside a column container.
 * Used by the columns block type.
 * Inherits preview mode from parent BlockPreview via context.
 */
function ColumnPreview({ column }: { column: ColumnContainer }) {
  const { isPreviewMode } = usePreviewContext()

  const hasCustomStyle = !!(
    column.backgroundColor ||
    column.backgroundGradient ||
    column.backgroundImage ||
    column.border
  )

  const containerStyle: React.CSSProperties = {
    ...getBackgroundStyle(column.backgroundColor, column.backgroundGradient, column.backgroundImage),
    ...getBorderStyle(column.border),
    padding: column.padding ? `${column.padding}px` : '12px',
  }

  /**
   * Only show placeholder styling (dashed border, muted bg) in edit mode.
   * In preview mode, columns should be transparent/clean for accurate email preview.
   */
  return (
    <div
      className={cn(
        'space-y-3 rounded-md min-h-20',
        !hasCustomStyle && !isPreviewMode && 'border border-dashed border-border/50'
      )}
      style={containerStyle}
    >
      {column.blocks.length === 0 ? (
        <div className="flex items-center justify-center h-full py-4">
          <p className="text-xs text-muted-foreground/50">Drag blocks here</p>
        </div>
      ) : (
        column.blocks.map((nestedBlock) => (
          <BlockPreview key={nestedBlock.id} block={nestedBlock} isPreviewMode={isPreviewMode} />
        ))
      )}
    </div>
  )
}
