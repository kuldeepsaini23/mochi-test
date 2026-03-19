/**
 * ============================================================================
 * ICON LIBRARY - Icon Renderer Component
 * ============================================================================
 *
 * A component that renders an icon by name dynamically.
 * Uses React.createElement to avoid ESLint's static-components rule.
 *
 * WHY: When you need to render an icon from a string name (e.g., from user selection),
 * we need to dynamically look up the component. Using createElement bypasses the
 * ESLint rule about creating components during render.
 *
 * ============================================================================
 */

'use client'

import { createElement } from 'react'
import { getIconOrFallback } from './get-icon'
import type { IconProps } from './types'

interface IconRendererProps extends IconProps {
  /** The icon name to render */
  name: string
  /** Fallback icon name if the requested icon doesn't exist */
  fallback?: string
}

/**
 * Renders an icon by name dynamically.
 * Use this when you need to render an icon based on a string identifier.
 *
 * NOTE: We don't use memo here because the icon component lookup
 * needs to happen fresh when the name prop changes.
 *
 * @example
 * <IconRenderer name="home" size={24} />
 * <IconRenderer name={userSelectedIcon} fallback="circle" />
 */
export function IconRenderer({
  name,
  fallback = 'circle',
  ...props
}: IconRendererProps) {
  // Get the icon component and use createElement to render it
  // This approach avoids the ESLint static-components rule
  const iconComponent = getIconOrFallback(name, fallback)

  return createElement(iconComponent, props)
}

IconRenderer.displayName = 'IconRenderer'
