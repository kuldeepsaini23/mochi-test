/**
 * ============================================================================
 * ICON LIBRARY - Icon Factory
 * ============================================================================
 *
 * Factory function to create consistent icon components.
 * All icons use this factory to ensure uniform sizing, styling, and behavior.
 *
 * WHY: Centralized icon creation ensures all icons behave identically
 * and makes it easy to add global features (animations, theming, etc.)
 *
 * ============================================================================
 */

import React, { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import type { IconProps } from './types'

/**
 * Default icon properties applied to all icons unless overridden.
 */
const defaultProps: Partial<IconProps> = {
  size: 24,
  strokeWidth: 2,
  color: 'currentColor',
}

/**
 * Creates an icon component from an SVG path or children.
 *
 * @param displayName - Name for React DevTools (e.g., 'HomeIcon')
 * @param pathOrChildren - SVG path data string OR React children for complex icons
 * @param options - Additional options like viewBox customization
 *
 * @example
 * // Simple path-based icon
 * const HomeIcon = createIcon('HomeIcon', 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z')
 *
 * @example
 * // Complex icon with multiple paths
 * const ComplexIcon = createIcon('ComplexIcon', (
 *   <>
 *     <path d="M..." />
 *     <circle cx="12" cy="12" r="3" />
 *   </>
 * ))
 */
export function createIcon(
  displayName: string,
  pathOrChildren: string | React.ReactNode,
  options?: {
    viewBox?: string
    fill?: 'none' | 'currentColor'
    strokeLinecap?: 'round' | 'butt' | 'square'
    strokeLinejoin?: 'round' | 'miter' | 'bevel'
  }
) {
  const {
    viewBox = '0 0 24 24',
    fill = 'none',
    strokeLinecap = 'round',
    strokeLinejoin = 'round',
  } = options || {}

  /**
   * The actual icon component created by the factory.
   * Uses forwardRef for compatibility with Radix UI and other libraries.
   */
  const Icon = forwardRef<SVGSVGElement, IconProps>(
    (
      {
        size = defaultProps.size,
        color = defaultProps.color,
        strokeWidth = defaultProps.strokeWidth,
        className,
        style,
        ...rest
      },
      ref
    ) => {
      // Determine the content to render inside the SVG
      const content =
        typeof pathOrChildren === 'string' ? (
          <path d={pathOrChildren} />
        ) : (
          pathOrChildren
        )

      return (
        <svg
          ref={ref}
          xmlns="http://www.w3.org/2000/svg"
          width={size}
          height={size}
          viewBox={viewBox}
          fill={fill}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap={strokeLinecap}
          strokeLinejoin={strokeLinejoin}
          className={cn('shrink-0', className)}
          style={style}
          {...rest}
        >
          {content}
        </svg>
      )
    }
  )

  // Set display name for React DevTools
  Icon.displayName = displayName

  return Icon
}
