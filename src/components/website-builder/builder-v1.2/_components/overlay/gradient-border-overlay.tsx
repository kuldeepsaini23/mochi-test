/**
 * ============================================================================
 * GRADIENT BORDER OVERLAY - Renders gradient border CSS for elements
 * ============================================================================
 *
 * This component handles gradient border rendering by injecting CSS for the
 * ::before pseudo-element technique.
 *
 * WHY THIS EXISTS:
 * CSS doesn't support native gradient borders. We use a pseudo-element with:
 * 1. Gradient as background
 * 2. CSS mask to create the "border" effect
 * 3. Inherits border-radius for curved corners
 *
 * USAGE:
 * Place this component inside the element that needs a gradient border.
 * It renders a <style> tag with scoped CSS for the parent element.
 *
 * ```tsx
 * <div className={gradientBorderClassName}>
 *   <GradientBorderOverlay
 *     elementId={element.id}
 *     borderConfig={borderConfig}
 *     borderRadius={styles.borderRadius}
 *   />
 *   {children}
 * </div>
 * ```
 *
 * ============================================================================
 */

'use client'

import { memo, useMemo } from 'react'
import type { BorderConfig } from '../../_lib/types'
import { hasGradientBorder, getGradientBorderClassName } from '../../_lib/border-utils'
import { gradientConfigToCSS } from '../../_lib/gradient-utils'

interface GradientBorderOverlayProps {
  /** Unique element ID for scoping the CSS */
  elementId: string
  /** Border configuration with gradient */
  borderConfig: BorderConfig | undefined
  /** Border radius to apply to the pseudo-element */
  borderRadius?: number | string
}

/**
 * GradientBorderOverlay - Injects CSS for gradient borders.
 *
 * Renders a <style> tag with CSS that creates a gradient border using
 * the ::before pseudo-element technique.
 *
 * The CSS is scoped to the element using a generated className based on elementId.
 */
export const GradientBorderOverlay = memo(function GradientBorderOverlay({
  elementId,
  borderConfig,
  borderRadius = 0,
}: GradientBorderOverlayProps) {
  // Only render if gradient border is active
  if (!borderConfig || !hasGradientBorder(borderConfig) || !borderConfig.gradient) {
    return null
  }

  const className = getGradientBorderClassName(elementId)
  const gradientCSS = gradientConfigToCSS(borderConfig.gradient)

  // Get border widths for each side
  const { top, right, bottom, left } = borderConfig
  const padding = `${top.width}px ${right.width}px ${bottom.width}px ${left.width}px`

  // Format border radius
  const radiusValue = typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius

  // Generate the CSS for the gradient border
  // z-index: 0 ensures the border stays behind content but above background
  const css = `
.${className} {
  position: relative !important;
}
.${className}::before {
  content: '';
  position: absolute;
  inset: 0;
  padding: ${padding};
  background: ${gradientCSS};
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  pointer-events: none;
  border-radius: ${radiusValue};
  z-index: 0;
}
`

  return <style dangerouslySetInnerHTML={{ __html: css }} />
})

/**
 * Hook to get gradient border className and check if active.
 *
 * @param elementId - Element ID for generating scoped className
 * @param borderConfig - Border configuration to check
 * @returns Object with className (if gradient border active) and isActive flag
 */
export function useGradientBorder(
  elementId: string,
  borderConfig: BorderConfig | undefined
): { className: string | undefined; isActive: boolean } {
  return useMemo(() => {
    if (!borderConfig || !hasGradientBorder(borderConfig)) {
      return { className: undefined, isActive: false }
    }
    return {
      className: getGradientBorderClassName(elementId),
      isActive: true,
    }
  }, [elementId, borderConfig])
}

export default GradientBorderOverlay
