/**
 * ============================================================================
 * ICON LIBRARY - Main Entry Point
 * ============================================================================
 *
 * Modular, performant icon library for the application.
 *
 * FEATURES:
 * - ~100 commonly used icons
 * - Tree-shakeable - only imported icons are bundled
 * - Consistent API across all icons
 * - Search and categorization support
 * - TypeScript support with proper types
 *
 * USAGE:
 *
 * 1. Direct import (best for tree-shaking):
 *    import { HomeIcon, SettingsIcon } from '@/lib/icons'
 *    <HomeIcon size={24} />
 *
 * 2. Dynamic lookup (when icon name is a variable):
 *    import { getIcon, getIconOrFallback } from '@/lib/icons'
 *    const Icon = getIconOrFallback(iconName)
 *    <Icon size={24} />
 *
 * 3. Search and browse:
 *    import { searchIcons, iconCategories } from '@/lib/icons'
 *    const results = searchIcons('home')
 *
 * ============================================================================
 */

// Export all icon components for direct import (tree-shakeable)
export * from './icons'

// Export types
export type { IconProps, IconComponent, IconMeta, IconCategory, IconRegistryEntry } from './types'

// Export utilities for dynamic icon lookup
export { getIcon, getIconOrFallback, hasIcon, iconMap } from './get-icon'

// Export the IconRenderer component for rendering icons by name
export { IconRenderer } from './icon-renderer'

// Export icon factory for creating custom icons
export { createIcon } from './create-icon'

// Export registry and search utilities
export {
  iconRegistry,
  iconCategories,
  getIconsByCategory,
  searchIcons,
  getAllIconNames,
} from './registry'
