/**
 * ============================================================================
 * ICON LIBRARY - Type Definitions
 * ============================================================================
 *
 * Core type definitions for the modular icon library.
 * These types ensure consistency across all icon components and utilities.
 *
 * ============================================================================
 */

import type { SVGProps } from 'react'

/**
 * Base props that all icons accept.
 * Extends standard SVG props for maximum flexibility.
 */
export interface IconProps extends SVGProps<SVGSVGElement> {
  /** Icon size - applies to both width and height */
  size?: number | string
  /** Icon color - defaults to currentColor for easy theming */
  color?: string
  /** Stroke width for outlined icons */
  strokeWidth?: number | string
  /** Additional CSS class names */
  className?: string
}

/**
 * Icon component type - all icons conform to this signature.
 */
export type IconComponent = React.FC<IconProps>

/**
 * Icon metadata for the picker and search functionality.
 */
export interface IconMeta {
  /** Unique identifier for the icon (e.g., 'home', 'settings') */
  name: string
  /** Human-readable label for display */
  label: string
  /** Category for grouping in the picker */
  category: IconCategory
  /** Search keywords for better discoverability */
  keywords: string[]
}

/**
 * Icon categories for organized browsing in the picker.
 */
export type IconCategory =
  | 'navigation'
  | 'actions'
  | 'communication'
  | 'media'
  | 'files'
  | 'commerce'
  | 'social'
  | 'weather'
  | 'arrows'
  | 'shapes'
  | 'misc'

/**
 * Registry entry combining the icon component with its metadata.
 * Used by the icon picker for rendering and search.
 */
export interface IconRegistryEntry {
  /** The icon component */
  component: IconComponent
  /** Icon metadata */
  meta: IconMeta
}

/**
 * Full icon registry type - maps icon names to their entries.
 */
export type IconRegistry = Record<string, IconRegistryEntry>
