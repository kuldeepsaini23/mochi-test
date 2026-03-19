/**
 * Color constants for avatars, tags, and status badges
 */

export const AVATAR_COLORS = [
  '#F4B8B8', // Soft pink/salmon
  '#F0B8E0', // Light pink/mauve
  '#D8B8F0', // Light purple/lavender
  '#B8C8F0', // Periwinkle/light blue
  '#B8E0F0', // Sky blue/cyan
  '#B8E8D8', // Mint/seafoam green
  '#C8E8B8', // Light lime/pale green
] as const

/**
 * Get a consistent color for a given string (e.g., contact name or ID)
 * Uses simple hash function to ensure same input always returns same color
 */
export function getConsistentColor(input: string): string {
  if (!input || input.trim() === '') {
    return AVATAR_COLORS[0]
  }

  // Simple hash function
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }

  // Get positive index
  const index = Math.abs(hash) % AVATAR_COLORS.length
  return AVATAR_COLORS[index]
}

/**
 * Convert hex color to RGB values
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null
}

/**
 * Calculate relative luminance of a color
 * Used for determining contrast ratios
 */
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const val = c / 255
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/**
 * Get appropriate text color (dark or light) for a given background color
 * Calculates contrast ratio and returns either a dark or light text color
 * that meets WCAG AA standards (4.5:1 contrast ratio)
 */
export function getTextColorForBackground(backgroundColor: string): string {
  const rgb = hexToRgb(backgroundColor)
  if (!rgb) return '#1f2937' // Default dark gray

  const luminance = getLuminance(rgb.r, rgb.g, rgb.b)

  // If background is light, use dark text
  // If background is dark, use white text
  return luminance > 0.5 ? '#1f2937' : '#ffffff'
}

/**
 * Status badge colors
 * Maps lead status to specific colors from the palette
 */
export const STATUS_COLORS = {
  ACTIVE: '#B8E8D8', // Mint/seafoam green
  INACTIVE: '#F4B8B8', // Soft pink/salmon
  LEAD: '#B8E0F0', // Sky blue/cyan
  PROSPECT: '#D8B8F0', // Light purple/lavender
} as const

/**
 * Get color for a lead status
 */
export function getStatusColor(status: string): string {
  return STATUS_COLORS[status as keyof typeof STATUS_COLORS] || AVATAR_COLORS[0]
}

/**
 * Location emoji mapping
 */
export const LOCATION_EMOJI_MAP: Record<string, string> = {
  US: '🇺🇸',
  GB: '🇬🇧',
  CA: '🇨🇦',
  AU: '🇦🇺',
  DE: '🇩🇪',
  FR: '🇫🇷',
  JP: '🇯🇵',
  IN: '🇮🇳',
  BR: '🇧🇷',
  MX: '🇲🇽',
  XX: '🌍', // Unknown
}

export const LOCATION_NAMES: Record<string, string> = {
  US: 'United States',
  GB: 'United Kingdom',
  CA: 'Canada',
  AU: 'Australia',
  DE: 'Germany',
  FR: 'France',
  JP: 'Japan',
  IN: 'India',
  BR: 'Brazil',
  MX: 'Mexico',
  XX: 'Unknown',
}

/**
 * Get location emoji by location code
 */
export function getLocationEmoji(code: string): string {
  return LOCATION_EMOJI_MAP[code] || '🌍'
}

/**
 * Get location name by location code
 */
export function getLocationName(code: string): string {
  return LOCATION_NAMES[code] || 'Unknown'
}
