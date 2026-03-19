/**
 * ============================================================================
 * BORDER UTILITIES - Per-side border and gradient border support
 * ============================================================================
 *
 * Utility functions for working with borders in the website builder.
 * Handles:
 * - Creation of default border configurations
 * - Conversion between BorderConfig and CSS properties
 * - Gradient border CSS generation using pseudo-element technique
 * - Border manipulation (update sides, toggle modes)
 *
 * ============================================================================
 * CSS GENERATION STRATEGIES
 * ============================================================================
 *
 * SOLID BORDERS:
 * Uses standard CSS border properties:
 * - border-top: 1px solid #000
 * - border-right: 2px dashed #333
 * - etc.
 *
 * GRADIENT BORDERS:
 * CSS doesn't support gradient borders natively, so we use a technique with:
 * 1. A ::before pseudo-element with gradient background
 * 2. CSS mask to create the "border" effect
 * 3. The pseudo-element inherits border-radius for curved corners
 *
 * ============================================================================
 */

import type {
  BorderConfig,
  BorderSideConfig,
  BorderStyle,
  BorderEditMode,
  GradientConfig,
} from './types'
import { gradientConfigToCSS, createDefaultLinearGradient } from './gradient-utils'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default border color when none is specified */
export const DEFAULT_BORDER_COLOR = 'rgba(255, 255, 255, 0.2)'

/** Default border width in pixels */
export const DEFAULT_BORDER_WIDTH = 1

/** Default border style */
export const DEFAULT_BORDER_STYLE: BorderStyle = 'solid'

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

/**
 * Create a default border side configuration.
 *
 * @param style - Border style (default: 'none')
 * @param width - Border width in pixels (default: 0)
 * @param color - Border color (default: DEFAULT_BORDER_COLOR)
 * @returns BorderSideConfig object
 */
export function createDefaultBorderSide(
  style: BorderStyle = 'none',
  width: number = 0,
  color: string = DEFAULT_BORDER_COLOR
): BorderSideConfig {
  return {
    style,
    width,
    color,
  }
}

/**
 * Create a default border configuration with all sides set to 'none'.
 *
 * @returns BorderConfig with no borders
 */
export function createEmptyBorderConfig(): BorderConfig {
  return {
    editMode: 'all',
    top: createDefaultBorderSide(),
    right: createDefaultBorderSide(),
    bottom: createDefaultBorderSide(),
    left: createDefaultBorderSide(),
  }
}

/**
 * Create a uniform border configuration (all sides the same).
 *
 * @param style - Border style for all sides
 * @param width - Border width for all sides
 * @param color - Border color for all sides
 * @returns BorderConfig with uniform borders
 */
export function createUniformBorderConfig(
  style: BorderStyle = 'solid',
  width: number = 1,
  color: string = DEFAULT_BORDER_COLOR
): BorderConfig {
  const side = createDefaultBorderSide(style, width, color)
  return {
    editMode: 'all',
    top: { ...side },
    right: { ...side },
    bottom: { ...side },
    left: { ...side },
  }
}

/**
 * Create a border configuration with a gradient.
 *
 * @param gradient - Gradient configuration
 * @param width - Border width for all sides
 * @returns BorderConfig with gradient border
 */
export function createGradientBorderConfig(
  gradient: GradientConfig = createDefaultLinearGradient(),
  width: number = 2
): BorderConfig {
  const side = createDefaultBorderSide('solid', width, 'transparent')
  return {
    editMode: 'all',
    top: { ...side },
    right: { ...side },
    bottom: { ...side },
    left: { ...side },
    gradient,
  }
}

// ============================================================================
// BORDER MANIPULATION
// ============================================================================

/**
 * Update a specific side of the border configuration.
 *
 * @param config - Current border configuration
 * @param side - Which side to update ('top', 'right', 'bottom', 'left')
 * @param updates - Partial updates to apply to the side
 * @returns New BorderConfig with the side updated
 */
export function updateBorderSide(
  config: BorderConfig,
  side: 'top' | 'right' | 'bottom' | 'left',
  updates: Partial<BorderSideConfig>
): BorderConfig {
  return {
    ...config,
    [side]: {
      ...config[side],
      ...updates,
    },
  }
}

/**
 * Update all sides of the border configuration at once.
 *
 * @param config - Current border configuration
 * @param updates - Partial updates to apply to all sides
 * @returns New BorderConfig with all sides updated
 */
export function updateAllBorderSides(
  config: BorderConfig,
  updates: Partial<BorderSideConfig>
): BorderConfig {
  return {
    ...config,
    top: { ...config.top, ...updates },
    right: { ...config.right, ...updates },
    bottom: { ...config.bottom, ...updates },
    left: { ...config.left, ...updates },
  }
}

/**
 * Update horizontal sides (left and right) of the border configuration.
 *
 * @param config - Current border configuration
 * @param updates - Partial updates to apply to left and right sides
 * @returns New BorderConfig with horizontal sides updated
 */
export function updateHorizontalBorderSides(
  config: BorderConfig,
  updates: Partial<BorderSideConfig>
): BorderConfig {
  return {
    ...config,
    left: { ...config.left, ...updates },
    right: { ...config.right, ...updates },
  }
}

/**
 * Update vertical sides (top and bottom) of the border configuration.
 *
 * @param config - Current border configuration
 * @param updates - Partial updates to apply to top and bottom sides
 * @returns New BorderConfig with vertical sides updated
 */
export function updateVerticalBorderSides(
  config: BorderConfig,
  updates: Partial<BorderSideConfig>
): BorderConfig {
  return {
    ...config,
    top: { ...config.top, ...updates },
    bottom: { ...config.bottom, ...updates },
  }
}

/**
 * Update borders based on the current edit mode.
 *
 * @param config - Current border configuration
 * @param updates - Partial updates to apply
 * @param primarySide - The side being edited (used for 'individual' mode)
 * @returns New BorderConfig with appropriate sides updated
 */
export function updateBordersByMode(
  config: BorderConfig,
  updates: Partial<BorderSideConfig>,
  primarySide: 'top' | 'right' | 'bottom' | 'left' = 'top'
): BorderConfig {
  switch (config.editMode) {
    case 'all':
      return updateAllBorderSides(config, updates)
    case 'horizontal':
      return updateHorizontalBorderSides(config, updates)
    case 'vertical':
      return updateVerticalBorderSides(config, updates)
    case 'individual':
      return updateBorderSide(config, primarySide, updates)
    default:
      return config
  }
}

/**
 * Set the border gradient.
 *
 * @param config - Current border configuration
 * @param gradient - New gradient configuration (or undefined to remove)
 * @returns New BorderConfig with gradient updated
 */
export function setBorderGradient(
  config: BorderConfig,
  gradient: GradientConfig | undefined
): BorderConfig {
  return {
    ...config,
    gradient,
  }
}

/**
 * Change the edit mode of the border configuration.
 *
 * @param config - Current border configuration
 * @param editMode - New edit mode
 * @returns New BorderConfig with edit mode changed
 */
export function setBorderEditMode(
  config: BorderConfig,
  editMode: BorderEditMode
): BorderConfig {
  return {
    ...config,
    editMode,
  }
}

// ============================================================================
// CSS CONVERSION
// ============================================================================

/**
 * Check if a border configuration has any visible borders.
 *
 * @param config - Border configuration to check
 * @returns true if any side has a visible border
 */
export function hasBorder(config: BorderConfig): boolean {
  const sides = [config.top, config.right, config.bottom, config.left]
  return sides.some((side) => side.style !== 'none' && side.width > 0)
}

/**
 * Check if a border configuration uses a gradient.
 *
 * @param config - Border configuration to check
 * @returns true if gradient is set and at least one side has a border
 */
export function hasGradientBorder(config: BorderConfig): boolean {
  return !!config.gradient && hasBorder(config)
}

/**
 * Check if all visible sides have the same configuration.
 *
 * @param config - Border configuration to check
 * @returns true if all sides with borders have identical settings
 */
export function isUniformBorder(config: BorderConfig): boolean {
  const sides = [config.top, config.right, config.bottom, config.left]
  const visibleSides = sides.filter((s) => s.style !== 'none' && s.width > 0)

  if (visibleSides.length === 0) return true

  const first = visibleSides[0]
  return visibleSides.every(
    (s) =>
      s.style === first.style &&
      s.width === first.width &&
      s.color === first.color
  )
}

/**
 * Convert a BorderConfig to inline CSS styles (for solid borders).
 *
 * NOTE: This only generates styles for solid color borders.
 * Gradient borders require pseudo-element CSS which can't be inline.
 *
 * @param config - Border configuration
 * @returns React.CSSProperties object with border styles
 */
export function borderConfigToInlineStyles(
  config: BorderConfig
): React.CSSProperties {
  // If gradient border, we handle it differently (pseudo-element)
  // Return empty styles here - gradient borders need special handling
  if (hasGradientBorder(config)) {
    return {}
  }

  const styles: React.CSSProperties = {}

  // Generate individual side styles
  if (config.top.style !== 'none' && config.top.width > 0) {
    styles.borderTop = `${config.top.width}px ${config.top.style} ${config.top.color}`
  }

  if (config.right.style !== 'none' && config.right.width > 0) {
    styles.borderRight = `${config.right.width}px ${config.right.style} ${config.right.color}`
  }

  if (config.bottom.style !== 'none' && config.bottom.width > 0) {
    styles.borderBottom = `${config.bottom.width}px ${config.bottom.style} ${config.bottom.color}`
  }

  if (config.left.style !== 'none' && config.left.width > 0) {
    styles.borderLeft = `${config.left.width}px ${config.left.style} ${config.left.color}`
  }

  return styles
}

/**
 * Get the maximum border width from all sides.
 * Used for gradient border pseudo-element padding.
 *
 * @param config - Border configuration
 * @returns Maximum border width in pixels
 */
export function getMaxBorderWidth(config: BorderConfig): number {
  return Math.max(
    config.top.width,
    config.right.width,
    config.bottom.width,
    config.left.width
  )
}

/**
 * Generate CSS class name for gradient border pseudo-element.
 * Used to inject CSS for gradient borders via <style> tag.
 *
 * @param elementId - The element's unique ID
 * @returns CSS class name for the gradient border
 */
export function getGradientBorderClassName(elementId: string): string {
  return `gradient-border-${elementId.replace(/[^a-zA-Z0-9]/g, '-')}`
}

/**
 * Generate CSS for gradient border pseudo-element.
 *
 * This creates CSS that uses the ::before pseudo-element technique
 * to render a gradient border that CSS doesn't natively support.
 *
 * @param config - Border configuration with gradient
 * @param className - CSS class name to target
 * @param borderRadius - Border radius value to inherit
 * @returns CSS string for the gradient border
 */
export function generateGradientBorderCSS(
  config: BorderConfig,
  className: string,
  borderRadius: string | number = 0
): string {
  if (!config.gradient) return ''

  const gradientCSS = gradientConfigToCSS(config.gradient)

  // Get border widths for each side (for asymmetric padding)
  const { top, right, bottom, left } = config
  const padding = `${top.width}px ${right.width}px ${bottom.width}px ${left.width}px`

  // Format border radius
  const radiusValue = typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius

  return `
.${className} {
  position: relative;
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
}

// ============================================================================
// PARSING / MIGRATION
// ============================================================================

/**
 * Convert legacy border styles to BorderConfig.
 *
 * This handles migration from the old simple border system
 * (borderStyle, borderWidth, borderColor) to the new BorderConfig.
 *
 * @param styles - Element styles object with legacy border properties
 * @returns BorderConfig if legacy borders exist, undefined otherwise
 */
export function migrateLegacyBorderStyles(styles: {
  borderStyle?: string
  borderWidth?: number | string
  borderColor?: string
}): BorderConfig | undefined {
  const { borderStyle, borderWidth, borderColor } = styles

  // No legacy borders
  if (!borderStyle || borderStyle === 'none') {
    return undefined
  }

  // Parse width (could be number or string with 'px')
  let width = 0
  if (typeof borderWidth === 'number') {
    width = borderWidth
  } else if (typeof borderWidth === 'string') {
    width = parseInt(borderWidth, 10) || 0
  }

  // Create uniform border from legacy values
  return createUniformBorderConfig(
    borderStyle as BorderStyle,
    width,
    borderColor || DEFAULT_BORDER_COLOR
  )
}

/**
 * Get the primary border side based on edit mode.
 *
 * @param config - Border configuration
 * @returns The side that should be shown as "primary" in the UI
 */
export function getPrimaryBorderSide(config: BorderConfig): BorderSideConfig {
  switch (config.editMode) {
    case 'all':
    case 'vertical':
      return config.top
    case 'horizontal':
      return config.left
    case 'individual':
      // Return the first side that has a border, or top if none
      if (config.top.style !== 'none') return config.top
      if (config.right.style !== 'none') return config.right
      if (config.bottom.style !== 'none') return config.bottom
      if (config.left.style !== 'none') return config.left
      return config.top
    default:
      return config.top
  }
}

/**
 * Get border style options for dropdown.
 *
 * @returns Array of { value, label } for dropdown options
 */
export function getBorderStyleOptions(): { value: BorderStyle; label: string }[] {
  return [
    { value: 'none', label: 'None' },
    { value: 'solid', label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
  ]
}

/**
 * Get border edit mode options for dropdown.
 *
 * @returns Array of { value, label, icon } for mode selection
 */
export function getBorderEditModeOptions(): { value: BorderEditMode; label: string }[] {
  return [
    { value: 'all', label: 'All Sides' },
    { value: 'individual', label: 'Individual' },
    { value: 'horizontal', label: 'Left & Right' },
    { value: 'vertical', label: 'Top & Bottom' },
  ]
}
