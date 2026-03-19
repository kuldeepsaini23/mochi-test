/**
 * ============================================================================
 * COLOR OPACITY UTILS — Hex ↔ RGBA conversion with opacity support
 * ============================================================================
 *
 * Provides utility functions for managing color opacity across all color
 * pickers in the website builder. Colors are stored as either:
 *   - Hex (#ffffff) when opacity is 100%
 *   - RGBA (rgba(255,255,255,0.5)) when opacity < 100%
 *   - 'transparent' for fully transparent / no color
 *
 * SOURCE OF TRUTH KEYWORDS: ColorOpacity, parseColorOpacity, colorWithOpacity
 * ============================================================================
 */

/**
 * Parsed color result — hex base color + opacity percentage (0–100).
 */
export interface ParsedColor {
  /** The base color as a 6-digit hex string (e.g. '#ff0000') */
  hex: string
  /** Opacity from 0 (fully transparent) to 100 (fully opaque) */
  opacity: number
}

/**
 * Parse any supported color string into its hex base + opacity.
 * Handles: hex (#fff, #ffffff), rgba(r,g,b,a), 'transparent', empty string.
 */
export function parseColorOpacity(color: string): ParsedColor {
  if (!color || color === 'transparent' || color === 'rgba(0,0,0,0)') {
    return { hex: '#000000', opacity: 0 }
  }

  /* ---- RGBA format: rgba(r, g, b, a) ---- */
  const rgbaMatch = color.match(
    /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+))?\s*\)/
  )
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10)
    const g = parseInt(rgbaMatch[2], 10)
    const b = parseInt(rgbaMatch[3], 10)
    const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
    return { hex, opacity: Math.round(a * 100) }
  }

  /* ---- Shorthand hex: #abc → #aabbcc ---- */
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    const r = color[1]
    const g = color[2]
    const b = color[3]
    return { hex: `#${r}${r}${g}${g}${b}${b}`.toLowerCase(), opacity: 100 }
  }

  /* ---- 8-digit hex with alpha: #rrggbbaa ---- */
  if (/^#[0-9a-fA-F]{8}$/.test(color)) {
    const hex = color.slice(0, 7).toLowerCase()
    const alphaHex = color.slice(7, 9)
    const opacity = Math.round((parseInt(alphaHex, 16) / 255) * 100)
    return { hex, opacity }
  }

  /* ---- Standard 6-digit hex: #rrggbb ---- */
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return { hex: color.toLowerCase(), opacity: 100 }
  }

  /* Fallback — treat unknown strings as opaque black */
  return { hex: '#000000', opacity: 100 }
}

/**
 * Combine a hex color with an opacity percentage into a storable color string.
 * Returns hex when opacity is 100% (keeps storage clean), rgba otherwise.
 */
export function colorWithOpacity(hex: string, opacity: number): string {
  /* Fully opaque — just return the hex */
  if (opacity >= 100) return hex

  /* Fully transparent */
  if (opacity <= 0) return 'transparent'

  /* Convert hex → rgb components */
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  const a = Math.round(opacity) / 100

  return `rgba(${r},${g},${b},${a})`
}

/**
 * Convert hex to RGB components. Useful for display purposes.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  }
}

/**
 * Get a display string for the current color value.
 * Shows hex when fully opaque, or opacity percentage when semi-transparent.
 */
export function getColorDisplayText(color: string): string {
  if (!color || color === 'transparent' || color === 'rgba(0,0,0,0)') {
    return 'None'
  }

  const { hex, opacity } = parseColorOpacity(color)

  if (opacity >= 100) {
    return hex.toUpperCase()
  }

  return `${hex.toUpperCase()} ${opacity}%`
}
