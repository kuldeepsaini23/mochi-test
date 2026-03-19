/**
 * ============================================================================
 * GRADIENT UTILITIES - Figma-style gradient system
 * ============================================================================
 *
 * Utility functions for working with gradients in the website builder.
 * Handles conversion between GradientConfig objects and CSS gradient strings,
 * color interpolation, and gradient manipulation (add/remove/update stops).
 *
 * ============================================================================
 * CSS GRADIENT FORMAT
 * ============================================================================
 *
 * LINEAR: linear-gradient(180deg, #000000 0%, #ffffff 100%)
 * - Angle in degrees (0 = to top, 90 = to right, 180 = to bottom)
 * - Color stops with position percentages
 *
 * RADIAL: radial-gradient(circle at 50% 50%, #000000 0%, #ffffff 100%)
 * - Shape: circle or ellipse
 * - Position: at X% Y%
 * - Color stops with position percentages
 *
 * ============================================================================
 * COLOR INTERPOLATION
 * ============================================================================
 *
 * When adding a new stop, we interpolate the color from adjacent stops.
 * This provides a natural color for the new stop based on its position.
 * Uses linear interpolation in RGB space for simplicity.
 *
 * ============================================================================
 */

import type { GradientConfig, GradientStop } from './types'

// ============================================================================
// ID GENERATION
// ============================================================================

/**
 * Generate a unique ID for a gradient stop.
 * Uses a combination of timestamp and random string for uniqueness.
 */
export function generateStopId(): string {
  return `stop_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

// ============================================================================
// DEFAULT GRADIENTS
// ============================================================================

/**
 * Create a default linear gradient.
 * Black to white, top to bottom (180 degrees).
 */
export function createDefaultLinearGradient(): GradientConfig {
  return {
    type: 'linear',
    angle: 180,
    stops: [
      { id: generateStopId(), color: '#000000', position: 0 },
      { id: generateStopId(), color: '#ffffff', position: 100 },
    ],
  }
}

/**
 * Create a default radial gradient.
 * Black center to white edge, circular, centered.
 */
export function createDefaultRadialGradient(): GradientConfig {
  return {
    type: 'radial',
    radialShape: 'circle',
    radialPosition: { x: 50, y: 50 },
    stops: [
      { id: generateStopId(), color: '#000000', position: 0 },
      { id: generateStopId(), color: '#ffffff', position: 100 },
    ],
  }
}

// ============================================================================
// CSS CONVERSION
// ============================================================================

/**
 * Convert a GradientConfig to a CSS gradient string.
 *
 * @param config - The gradient configuration object
 * @returns CSS gradient string (e.g., "linear-gradient(180deg, #000 0%, #fff 100%)")
 *
 * @example
 * gradientConfigToCSS({
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
 * Sanitize a CSS color value to prevent CSS injection via dangerouslySetInnerHTML.
 * Strips characters that could break out of CSS context (<, >, {, }, ;, ", ', \).
 */
function sanitizeCSSColor(color: string): string {
  return color.replace(/[<>{};"'\\]/g, '')
}

export function gradientConfigToCSS(config: GradientConfig): string {
  // Sort stops by position to ensure correct rendering
  const sortedStops = [...config.stops].sort((a, b) => a.position - b.position)

  // Build color stops string — sanitize colors to prevent CSS injection
  // when the result is used in dangerouslySetInnerHTML style tags.
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
 * Parse a CSS gradient string into a GradientConfig.
 * Useful for importing gradients from CSS or pasting values.
 *
 * @param css - CSS gradient string to parse
 * @returns GradientConfig if valid, null if parsing fails
 *
 * NOTE: This is a simplified parser. Complex gradients with
 * color hints, multiple position values, or advanced syntax
 * may not parse correctly.
 */
export function parseGradientCSS(css: string): GradientConfig | null {
  const trimmed = css.trim()

  try {
    // Check if it's a linear gradient
    if (trimmed.startsWith('linear-gradient(')) {
      return parseLinearGradient(trimmed)
    }

    // Check if it's a radial gradient
    if (trimmed.startsWith('radial-gradient(')) {
      return parseRadialGradient(trimmed)
    }

    return null
  } catch {
    return null
  }
}

/**
 * Parse a linear-gradient CSS string.
 */
function parseLinearGradient(css: string): GradientConfig | null {
  // Remove "linear-gradient(" and trailing ")"
  const content = css.slice(16, -1).trim()

  // Split by comma, but be careful with colors that have commas (rgba)
  const parts = splitGradientParts(content)
  if (parts.length < 2) return null

  // First part might be angle or direction
  let angle = 180 // Default: to bottom
  let startIndex = 0

  const firstPart = parts[0].trim()
  if (firstPart.endsWith('deg')) {
    // Numeric angle
    angle = parseFloat(firstPart)
    startIndex = 1
  } else if (firstPart.startsWith('to ')) {
    // Direction keyword (to top, to right, etc.)
    angle = directionToAngle(firstPart)
    startIndex = 1
  }

  // Parse color stops
  const stops = parseColorStops(parts.slice(startIndex))
  if (stops.length < 2) return null

  return {
    type: 'linear',
    angle,
    stops,
  }
}

/**
 * Parse a radial-gradient CSS string.
 */
function parseRadialGradient(css: string): GradientConfig | null {
  // Remove "radial-gradient(" and trailing ")"
  const content = css.slice(16, -1).trim()

  const parts = splitGradientParts(content)
  if (parts.length < 2) return null

  let shape: 'circle' | 'ellipse' = 'ellipse'
  let position = { x: 50, y: 50 }
  let startIndex = 0

  // Check first part for shape/position
  const firstPart = parts[0].trim().toLowerCase()
  if (firstPart.includes('circle') || firstPart.includes('ellipse') || firstPart.includes('at')) {
    // Parse shape
    if (firstPart.includes('circle')) shape = 'circle'
    else if (firstPart.includes('ellipse')) shape = 'ellipse'

    // Parse position (at X% Y%)
    const atMatch = firstPart.match(/at\s+([\d.]+)%?\s*([\d.]+)?%?/)
    if (atMatch) {
      position.x = parseFloat(atMatch[1]) || 50
      position.y = parseFloat(atMatch[2]) || position.x
    }

    startIndex = 1
  }

  // Parse color stops
  const stops = parseColorStops(parts.slice(startIndex))
  if (stops.length < 2) return null

  return {
    type: 'radial',
    radialShape: shape,
    radialPosition: position,
    stops,
  }
}

/**
 * Split gradient content by comma, respecting nested parentheses.
 * This handles rgba(r, g, b, a) colors correctly.
 */
function splitGradientParts(content: string): string[] {
  const parts: string[] = []
  let current = ''
  let depth = 0

  for (const char of content) {
    if (char === '(') depth++
    else if (char === ')') depth--

    if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  if (current.trim()) {
    parts.push(current.trim())
  }

  return parts
}

/**
 * Convert direction keyword to angle.
 */
function directionToAngle(direction: string): number {
  const dir = direction.toLowerCase().replace('to ', '').trim()
  const angleMap: Record<string, number> = {
    'top': 0,
    'right': 90,
    'bottom': 180,
    'left': 270,
    'top right': 45,
    'right top': 45,
    'bottom right': 135,
    'right bottom': 135,
    'bottom left': 225,
    'left bottom': 225,
    'top left': 315,
    'left top': 315,
  }
  return angleMap[dir] ?? 180
}

/**
 * Parse color stop strings into GradientStop objects.
 */
function parseColorStops(parts: string[]): GradientStop[] {
  const stops: GradientStop[] = []

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim()

    // Try to extract color and position
    // Format: "color position" or just "color"
    const match = part.match(/^(.+?)(?:\s+([\d.]+)%?)?$/)
    if (!match) continue

    const color = match[1].trim()
    let position: number

    if (match[2]) {
      position = parseFloat(match[2])
    } else {
      // Auto-calculate position based on index
      position = parts.length > 1 ? (i / (parts.length - 1)) * 100 : 0
    }

    stops.push({
      id: generateStopId(),
      color,
      position,
    })
  }

  return stops
}

// ============================================================================
// GRADIENT MANIPULATION
// ============================================================================

/**
 * Sort gradient stops by position (ascending).
 * Useful for ensuring stops are in correct order before rendering.
 *
 * @param stops - Array of gradient stops
 * @returns New array sorted by position
 */
export function sortStopsByPosition(stops: GradientStop[]): GradientStop[] {
  return [...stops].sort((a, b) => a.position - b.position)
}

/**
 * Add a new color stop to a gradient at the specified position.
 * The color is interpolated from adjacent stops.
 *
 * @param config - Current gradient configuration
 * @param position - Position (0-100) to add the new stop
 * @returns New gradient config with the stop added
 */
export function addGradientStop(
  config: GradientConfig,
  position: number
): GradientConfig {
  // Clamp position to valid range
  const clampedPosition = Math.max(0, Math.min(100, position))

  // Interpolate color from adjacent stops
  const interpolatedColor = interpolateColor(config.stops, clampedPosition)

  // Create new stop
  const newStop: GradientStop = {
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
 * Minimum 2 stops are always kept - removal fails if trying to go below 2.
 *
 * @param config - Current gradient configuration
 * @param stopId - ID of the stop to remove
 * @returns New gradient config with the stop removed, or original if can't remove
 */
export function removeGradientStop(
  config: GradientConfig,
  stopId: string
): GradientConfig {
  // Can't remove if only 2 stops remain
  if (config.stops.length <= 2) {
    return config
  }

  const newStops = config.stops.filter((stop) => stop.id !== stopId)

  // Safety check - ensure we still have at least 2 stops
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
  config: GradientConfig,
  stopId: string,
  updates: Partial<Pick<GradientStop, 'color' | 'position'>>
): GradientConfig {
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
 * @param stops - Array of gradient stops (should be sorted by position)
 * @param position - Position (0-100) to interpolate at
 * @returns Interpolated color as hex string
 */
export function interpolateColor(stops: GradientStop[], position: number): string {
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
 * Handles 3-digit and 6-digit hex, with or without #.
 */
function hexToRGB(hex: string): { r: number; g: number; b: number } {
  // Remove # if present
  let h = hex.replace(/^#/, '')

  // Expand 3-digit hex to 6-digit
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  }

  // Parse as integer and extract RGB
  const num = parseInt(h, 16)

  // Handle invalid hex
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
// ANGLE UTILITIES
// ============================================================================

/**
 * Calculate gradient angle from start and end points.
 * Used for canvas overlay interactions.
 *
 * @param startX - Start X coordinate
 * @param startY - Start Y coordinate
 * @param endX - End X coordinate
 * @param endY - End Y coordinate
 * @returns Angle in degrees (0-360)
 */
export function calculateAngleFromPoints(
  startX: number,
  startY: number,
  endX: number,
  endY: number
): number {
  const dx = endX - startX
  const dy = endY - startY

  // Calculate angle in radians, then convert to degrees
  // atan2 gives angle from positive X axis, we need from positive Y axis (CSS gradient convention)
  let angle = Math.atan2(dx, -dy) * (180 / Math.PI)

  // Normalize to 0-360
  if (angle < 0) angle += 360

  return Math.round(angle)
}

/**
 * Calculate start and end points for gradient line overlay.
 * Given element dimensions and gradient angle, returns points for visual line.
 *
 * @param width - Element width
 * @param height - Element height
 * @param angle - Gradient angle in degrees
 * @returns Start and end points as percentages (0-100)
 */
export function calculateGradientLinePoints(
  width: number,
  height: number,
  angle: number
): { start: { x: number; y: number }; end: { x: number; y: number } } {
  // Convert angle to radians
  // CSS gradient angle: 0deg = to top, 90deg = to right
  const rad = ((angle - 90) * Math.PI) / 180

  // Calculate direction vector
  const dirX = Math.cos(rad)
  const dirY = Math.sin(rad)

  // Calculate length needed to cover the entire element
  // We need the line to extend beyond element bounds
  const diagLength = Math.sqrt(width * width + height * height)

  // Calculate start and end points (from center)
  const centerX = width / 2
  const centerY = height / 2

  const halfLength = diagLength / 2

  return {
    start: {
      x: ((centerX - dirX * halfLength) / width) * 100,
      y: ((centerY - dirY * halfLength) / height) * 100,
    },
    end: {
      x: ((centerX + dirX * halfLength) / width) * 100,
      y: ((centerY + dirY * halfLength) / height) * 100,
    },
  }
}
