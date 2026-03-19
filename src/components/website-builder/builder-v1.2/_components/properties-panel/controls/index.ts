/**
 * ========================================
 * PROPERTY CONTROLS - Exports
 * ========================================
 *
 * All reusable control components for the properties panel.
 * Each control follows the grid cols-3 layout pattern.
 */

export { PropertySection } from './property-section'
export { InputGroupControl } from './input-group-control'
export { ButtonGroupControl } from './button-group-control'
export { QuadInputControl } from './quad-input-control'
export { ColorPickerControl } from './color-picker-control'
export { ToggleControl } from './toggle-control'
export { DropdownControl } from './dropdown-control'
export { ImageBackgroundControl } from './image-background-control'
export { ImageSourceControl } from './image-source-control'
export { VideoSourceControl } from './video-source-control'
export { SizeInputControl } from './size-input-control'
export {
  IconToggleControl,
  DirectionIcons,
  JustifyIcons,
  AlignIcons,
} from './icon-toggle-control'
export { FontFamilyControl } from './font-family-control'
export { FontFamilyPicker } from './font-family-picker'
export { FitToContentButton } from './fit-to-content-button'
export { FitFrameToContentButton } from './fit-frame-to-content-button'
export { SliderInputControl } from './slider-input-control'
export { SpacingControl } from './spacing-control'
export { BorderRadiusControl, type BorderRadiusValues } from './border-radius-control'
export { BreakpointToggle, HeaderBreakpointToggle, MobileEditingBanner } from './breakpoint-toggle'
export { MobileOverrideIndicator } from './mobile-override-indicator'
export { PropertyRenderer, getPropertyDisplayValue } from './property-renderer'
export { GradientStopBar } from './gradient-stop-bar'
export { GradientControl } from './gradient-control'
export { ShadowControl } from './shadow-control'
export { BlurControl } from './blur-control'
export { EffectsControl } from './effects-control'
export { BorderControl } from './border-control'
export { RotationKnobControl } from './rotation-knob-control'
export {
  SizingModeControl,
  SizingIcons,
  type WidthMode,
  type HeightMode,
  type OverflowMode,
} from './sizing-mode-control'

// ============================================================================
// SPACING UTILITIES - Parse/format CSS spacing values
// ============================================================================

/**
 * Parse a CSS spacing value (padding/margin) into individual sides.
 *
 * Handles multiple formats:
 * - Number: 10 → { top: 10, right: 10, bottom: 10, left: 10 }
 * - String "10px" → { top: 10, right: 10, bottom: 10, left: 10 }
 * - String "10px 20px" → { top: 10, right: 20, bottom: 10, left: 20 }
 * - String "10px 20px 30px" → { top: 10, right: 20, bottom: 30, left: 20 }
 * - String "10px 20px 30px 40px" → { top: 10, right: 20, bottom: 30, left: 40 }
 */
export function parseSpacingValue(
  value: string | number | undefined
): { top: number; right: number; bottom: number; left: number } {
  // Default to 0 for all sides
  const defaults = { top: 0, right: 0, bottom: 0, left: 0 }

  if (value === undefined || value === null || value === '') {
    return defaults
  }

  // Number - uniform value
  if (typeof value === 'number') {
    return { top: value, right: value, bottom: value, left: value }
  }

  // String - parse CSS shorthand
  const parts = String(value)
    .split(/\s+/)
    .map((p) => parseFloat(p) || 0)

  if (parts.length === 1) {
    // "10px" - all sides same
    return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] }
  }
  if (parts.length === 2) {
    // "10px 20px" - top/bottom, left/right
    return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] }
  }
  if (parts.length === 3) {
    // "10px 20px 30px" - top, left/right, bottom
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] }
  }
  if (parts.length >= 4) {
    // "10px 20px 30px 40px" - top, right, bottom, left
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] }
  }

  return defaults
}

/**
 * Format spacing values back to the most efficient CSS format.
 *
 * IMPORTANT: When returning multiple values, we include 'px' units because
 * CSS requires units for shorthand values (e.g., "10px 20px" not "10 20").
 * Single numeric values work without units in React's style object.
 *
 * Outputs the shortest valid CSS:
 * - All same → single number (10) - works as inline style
 * - Top/bottom same AND left/right same → "10px 20px"
 * - All different → "10px 20px 30px 40px"
 */
export function formatSpacingValue(values: {
  top: number
  right: number
  bottom: number
  left: number
}): string | number {
  const { top, right, bottom, left } = values

  // All same - return single number (most common case)
  // React handles numeric values correctly for padding/margin
  if (top === right && right === bottom && bottom === left) {
    return top
  }

  // Top/bottom same, left/right same - return two values WITH px units
  if (top === bottom && left === right) {
    return `${top}px ${right}px`
  }

  // All different - return four values WITH px units
  return `${top}px ${right}px ${bottom}px ${left}px`
}

// ============================================================================
// BORDER RADIUS UTILITIES - Parse/format CSS border-radius values
// ============================================================================

/**
 * Parse a CSS border-radius value into individual corners.
 *
 * Handles multiple formats:
 * - Number: 10 → { topLeft: 10, topRight: 10, bottomRight: 10, bottomLeft: 10 }
 * - String "10px" → { topLeft: 10, topRight: 10, bottomRight: 10, bottomLeft: 10 }
 * - String "10px 20px" → { topLeft: 10, topRight: 20, bottomRight: 10, bottomLeft: 20 }
 * - String "10px 20px 30px" → { topLeft: 10, topRight: 20, bottomRight: 30, bottomLeft: 20 }
 * - String "10px 20px 30px 40px" → { topLeft: 10, topRight: 20, bottomRight: 30, bottomLeft: 40 }
 *
 * CSS border-radius order: top-left, top-right, bottom-right, bottom-left (clockwise)
 */
export function parseBorderRadiusValue(
  value: string | number | undefined
): { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number } {
  // Default to 0 for all corners
  const defaults = { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 }

  if (value === undefined || value === null || value === '') {
    return defaults
  }

  // Number - uniform value
  if (typeof value === 'number') {
    return { topLeft: value, topRight: value, bottomRight: value, bottomLeft: value }
  }

  // String - parse CSS shorthand
  const parts = String(value)
    .split(/\s+/)
    .map((p) => parseFloat(p) || 0)

  if (parts.length === 1) {
    // "10px" - all corners same
    return { topLeft: parts[0], topRight: parts[0], bottomRight: parts[0], bottomLeft: parts[0] }
  }
  if (parts.length === 2) {
    // "10px 20px" - top-left/bottom-right, top-right/bottom-left
    return { topLeft: parts[0], topRight: parts[1], bottomRight: parts[0], bottomLeft: parts[1] }
  }
  if (parts.length === 3) {
    // "10px 20px 30px" - top-left, top-right/bottom-left, bottom-right
    return { topLeft: parts[0], topRight: parts[1], bottomRight: parts[2], bottomLeft: parts[1] }
  }
  if (parts.length >= 4) {
    // "10px 20px 30px 40px" - top-left, top-right, bottom-right, bottom-left
    return { topLeft: parts[0], topRight: parts[1], bottomRight: parts[2], bottomLeft: parts[3] }
  }

  return defaults
}

/**
 * Format border-radius values back to the most efficient CSS format.
 *
 * IMPORTANT: When returning multiple values, we include 'px' units because
 * CSS requires units for shorthand values (e.g., "10px 20px" not "10 20").
 * Single numeric values work without units in React's style object.
 *
 * Outputs the shortest valid CSS:
 * - All same → single number (10) - works as inline style
 * - TL/BR same AND TR/BL same → "10px 20px"
 * - All different → "10px 20px 30px 40px"
 */
export function formatBorderRadiusValue(values: {
  topLeft: number
  topRight: number
  bottomRight: number
  bottomLeft: number
}): string | number {
  const { topLeft, topRight, bottomRight, bottomLeft } = values

  // All same - return single number (most common case)
  // React handles numeric values correctly for borderRadius
  if (topLeft === topRight && topRight === bottomRight && bottomRight === bottomLeft) {
    return topLeft
  }

  // TL/BR same, TR/BL same - return two values WITH px units
  if (topLeft === bottomRight && topRight === bottomLeft) {
    return `${topLeft}px ${topRight}px`
  }

  // All different - return four values WITH px units (clockwise: TL TR BR BL)
  return `${topLeft}px ${topRight}px ${bottomRight}px ${bottomLeft}px`
}
