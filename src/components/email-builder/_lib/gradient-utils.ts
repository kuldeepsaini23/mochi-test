/**
 * ============================================================================
 * EMAIL BUILDER - Gradient Utilities
 * ============================================================================
 *
 * Utility functions for working with gradients in the email template builder.
 * Handles conversion between EmailGradientConfig objects and CSS gradient strings.
 *
 * SOURCE OF TRUTH KEYWORDS: EmailGradientUtils, EmailGradientCSS
 *
 * IMPORTANT: Email clients have limited CSS support. We use inline CSS gradients
 * which work in most modern email clients (Gmail, Apple Mail, Outlook 365).
 * Outlook desktop has limited gradient support - falls back to first color.
 *
 * ============================================================================
 */

import type { EmailGradientConfig, EmailGradientStop } from '@/types/email-templates'

// ============================================================================
// ID GENERATION
// ============================================================================

/**
 * Generate a unique ID for a gradient stop.
 * Uses timestamp + random string for uniqueness.
 */
export function generateStopId(): string {
  return `stop_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

// ============================================================================
// DEFAULT GRADIENTS
// ============================================================================

/**
 * Create a default linear gradient.
 * Uses primary blue colors for a professional look.
 */
export function createDefaultLinearGradient(): EmailGradientConfig {
  return {
    type: 'linear',
    angle: 135,
    stops: [
      { id: generateStopId(), color: '#3b82f6', position: 0 },
      { id: generateStopId(), color: '#8b5cf6', position: 100 },
    ],
  }
}

/**
 * Create a default radial gradient.
 * Blue center to purple edge, circular.
 */
export function createDefaultRadialGradient(): EmailGradientConfig {
  return {
    type: 'radial',
    radialShape: 'circle',
    radialPosition: { x: 50, y: 50 },
    stops: [
      { id: generateStopId(), color: '#3b82f6', position: 0 },
      { id: generateStopId(), color: '#8b5cf6', position: 100 },
    ],
  }
}

// ============================================================================
// CSS CONVERSION
// ============================================================================

/**
 * Convert an EmailGradientConfig to a CSS gradient string.
 *
 * @param config - The gradient configuration object
 * @returns CSS gradient string (e.g., "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)")
 *
 * @example
 * gradientToCSS({
 *   type: 'linear',
 *   angle: 90,
 *   stops: [
 *     { id: '1', color: '#ff0000', position: 0 },
 *     { id: '2', color: '#0000ff', position: 100 }
 *   ]
 * })
 * // Returns: "linear-gradient(90deg, #ff0000 0%, #0000ff 100%)"
 */
/**
 * Sanitize a CSS color value to prevent CSS injection.
 * Strips characters that could break out of CSS context (<, >, {, }, ;, ", ', \).
 */
function sanitizeCSSColor(color: string): string {
  return color.replace(/[<>{};"'\\]/g, '')
}

export function gradientToCSS(config: EmailGradientConfig): string {
  // Sort stops by position to ensure correct rendering
  const sortedStops = [...config.stops].sort((a, b) => a.position - b.position)

  // Build color stops string — sanitize to prevent CSS injection
  const stopsString = sortedStops
    .map((stop) => `${sanitizeCSSColor(stop.color)} ${stop.position}%`)
    .join(', ')

  if (config.type === 'linear') {
    // Linear gradient: angle + stops
    const angle = config.angle ?? 180
    return `linear-gradient(${angle}deg, ${stopsString})`
  } else {
    // Radial gradient: shape + position + stops
    const shape = ['circle', 'ellipse'].includes(config.radialShape ?? '') ? config.radialShape! : 'ellipse'
    const posX = config.radialPosition?.x ?? 50
    const posY = config.radialPosition?.y ?? 50
    return `radial-gradient(${shape} at ${posX}% ${posY}%, ${stopsString})`
  }
}

/**
 * Get the first color from a gradient (for fallback in Outlook).
 *
 * @param config - The gradient configuration
 * @returns First color hex value
 */
export function getGradientFallbackColor(config: EmailGradientConfig): string {
  if (config.stops.length === 0) return '#000000'
  const sorted = [...config.stops].sort((a, b) => a.position - b.position)
  return sorted[0].color
}

// ============================================================================
// GRADIENT MANIPULATION
// ============================================================================

/**
 * Add a new color stop to a gradient at the specified position.
 * The color is interpolated from adjacent stops.
 *
 * @param config - Current gradient configuration
 * @param position - Position (0-100) to add the new stop
 * @returns New gradient config with the stop added
 */
export function addGradientStop(
  config: EmailGradientConfig,
  position: number
): EmailGradientConfig {
  // Clamp position to valid range
  const clampedPosition = Math.max(0, Math.min(100, position))

  // Interpolate color from adjacent stops
  const interpolatedColor = interpolateColor(config.stops, clampedPosition)

  // Create new stop
  const newStop: EmailGradientStop = {
    id: generateStopId(),
    color: interpolatedColor,
    position: clampedPosition,
  }

  // Add to stops array and sort
  const newStops = [...config.stops, newStop].sort((a, b) => a.position - b.position)

  return {
    ...config,
    stops: newStops,
  }
}

/**
 * Remove a color stop from a gradient.
 * Minimum 2 stops are always kept.
 *
 * @param config - Current gradient configuration
 * @param stopId - ID of the stop to remove
 * @returns New gradient config with the stop removed
 */
export function removeGradientStop(
  config: EmailGradientConfig,
  stopId: string
): EmailGradientConfig {
  // Can't remove if only 2 stops remain
  if (config.stops.length <= 2) {
    return config
  }

  const newStops = config.stops.filter((stop) => stop.id !== stopId)

  // Safety check
  if (newStops.length < 2) {
    return config
  }

  return {
    ...config,
    stops: newStops,
  }
}

/**
 * Update a gradient stop's color and/or position.
 *
 * @param config - Current gradient configuration
 * @param stopId - ID of the stop to update
 * @param updates - New values for color and/or position
 * @returns New gradient config with the stop updated
 */
export function updateGradientStop(
  config: EmailGradientConfig,
  stopId: string,
  updates: Partial<Pick<EmailGradientStop, 'color' | 'position'>>
): EmailGradientConfig {
  const newStops = config.stops.map((stop) => {
    if (stop.id !== stopId) return stop

    return {
      ...stop,
      ...(updates.color !== undefined && { color: updates.color }),
      ...(updates.position !== undefined && {
        position: Math.max(0, Math.min(100, updates.position)),
      }),
    }
  })

  // Sort by position after update
  newStops.sort((a, b) => a.position - b.position)

  return {
    ...config,
    stops: newStops,
  }
}

// ============================================================================
// COLOR INTERPOLATION
// ============================================================================

/**
 * Interpolate a color at a given position between gradient stops.
 * Uses linear interpolation in RGB space.
 *
 * @param stops - Array of gradient stops
 * @param position - Position (0-100) to interpolate at
 * @returns Interpolated color as hex string
 */
export function interpolateColor(stops: EmailGradientStop[], position: number): string {
  if (stops.length === 0) return '#000000'
  if (stops.length === 1) return stops[0].color

  // Sort stops by position
  const sorted = [...stops].sort((a, b) => a.position - b.position)

  // Find the two stops that surround our position
  let leftStop = sorted[0]
  let rightStop = sorted[sorted.length - 1]

  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].position <= position && sorted[i + 1].position >= position) {
      leftStop = sorted[i]
      rightStop = sorted[i + 1]
      break
    }
  }

  // If position is outside the range, return the closest stop's color
  if (position <= leftStop.position) return leftStop.color
  if (position >= rightStop.position) return rightStop.color

  // Calculate interpolation factor (0-1)
  const range = rightStop.position - leftStop.position
  const factor = range > 0 ? (position - leftStop.position) / range : 0

  // Parse colors to RGB
  const leftRGB = hexToRGB(leftStop.color)
  const rightRGB = hexToRGB(rightStop.color)

  // Interpolate each channel
  const r = Math.round(leftRGB.r + (rightRGB.r - leftRGB.r) * factor)
  const g = Math.round(leftRGB.g + (rightRGB.g - leftRGB.g) * factor)
  const b = Math.round(leftRGB.b + (rightRGB.b - leftRGB.b) * factor)

  return rgbToHex(r, g, b)
}

/**
 * Convert a hex color to RGB components.
 */
function hexToRGB(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace(/^#/, '')

  // Expand 3-digit hex to 6-digit
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  }

  const num = parseInt(h, 16)

  if (isNaN(num)) {
    return { r: 0, g: 0, b: 0 }
  }

  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  }
}

/**
 * Convert RGB components to hex color string.
 */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.max(0, Math.min(255, n)).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// ============================================================================
// PREDEFINED COLOR PALETTE
// ============================================================================

/**
 * Predefined color palette for quick selection.
 * Professional colors suitable for email marketing.
 */
export const EMAIL_COLOR_PALETTE = [
  // Grayscale
  '#ffffff', '#f8fafc', '#e2e8f0', '#94a3b8', '#475569', '#1e293b', '#000000',
  // Blues
  '#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8', '#1e3a8a',
  // Greens
  '#dcfce7', '#86efac', '#22c55e', '#16a34a', '#166534',
  // Reds
  '#fee2e2', '#fca5a5', '#ef4444', '#dc2626', '#991b1b',
  // Yellows/Orange
  '#fef3c7', '#fcd34d', '#f59e0b', '#d97706', '#92400e',
  // Purples
  '#ede9fe', '#c4b5fd', '#8b5cf6', '#7c3aed', '#5b21b6',
  // Pinks
  '#fce7f3', '#f9a8d4', '#ec4899', '#db2777', '#9d174d',
  // Teals
  '#ccfbf1', '#5eead4', '#14b8a6', '#0d9488', '#115e59',
]

/**
 * Check if a color value is transparent.
 */
export function isTransparent(color: string): boolean {
  return color === 'transparent' || color === 'rgba(0,0,0,0)' || color === ''
}
