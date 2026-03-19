/**
 * FOLDER SHAPE COMPONENT
 *
 * Reusable SVG folder icon with customizable color.
 * Used across the application for folder organization features.
 *
 * SOURCE OF TRUTH KEYWORDS: FolderShapeIcon, FolderSVG
 */

import { cn } from '@/lib/utils'

// ============================================================================
// TYPES
// ============================================================================

interface FolderShapeProps {
  /** Hex color for the folder fill (default: #3f3f46) */
  color?: string
  /** Width of the icon in pixels (height scales proportionally) */
  size?: number
  /** Additional CSS classes */
  className?: string
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * SVG folder icon that matches the design used in folder organization features.
 * Proportions are 4:3 (width:height) for natural folder appearance.
 */
export function FolderShape({ color = '#3f3f46', size = 24, className }: FolderShapeProps) {
  return (
    <svg
      width={size}
      height={size * 0.75}
      viewBox="0 0 120 90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('flex-shrink-0', className)}
    >
      {/* Folder body with tab */}
      <path
        d="M8 20C8 15.5817 11.5817 12 16 12H38C40.1217 12 42.1566 12.8429 43.6569 14.3431L48 18.6863C49.5003 20.1866 51.5352 21.0294 53.6569 21.0294H104C108.418 21.0294 112 24.6111 112 29.0294V78C112 82.4183 108.418 86 104 86H16C11.5817 86 8 82.4183 8 78V20Z"
        fill={color}
      />
      {/* Inner shadow for depth */}
      <path
        d="M12 28H108V78C108 80.2091 106.209 82 104 82H16C13.7909 82 12 80.2091 12 78V28Z"
        fill="rgba(0,0,0,0.15)"
      />
    </svg>
  )
}

// ============================================================================
// LARGE PREVIEW VARIANT
// ============================================================================

interface FolderShapeLargeProps {
  /** Hex color for the folder fill */
  color?: string
  /** Additional CSS classes */
  className?: string
}

/**
 * Larger folder preview with enhanced visual details.
 * Used in folder creation/edit dialogs for preview.
 */
export function FolderShapeLarge({ color = '#3f3f46', className }: FolderShapeLargeProps) {
  return (
    <svg
      viewBox="0 0 120 90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('w-20 h-auto drop-shadow-lg', className)}
    >
      {/* Back part of folder (creates depth) */}
      <path
        d="M8 20C8 15.5817 11.5817 12 16 12H42C44.6522 12 47.1957 13.0536 49.0711 14.9289L54 20H104C108.418 20 112 23.5817 112 28V78C112 82.4183 108.418 86 104 86H16C11.5817 86 8 82.4183 8 78V20Z"
        fill={color}
        fillOpacity="0.9"
      />
      {/* Front part of folder with tab */}
      <path
        d="M8 20C8 15.5817 11.5817 12 16 12H38C40.1217 12 42.1566 12.8429 43.6569 14.3431L48 18.6863C49.5003 20.1866 51.5352 21.0294 53.6569 21.0294H104C108.418 21.0294 112 24.6111 112 29.0294V78C112 82.4183 108.418 86 104 86H16C11.5817 86 8 82.4183 8 78V20Z"
        fill={color}
      />
      {/* Highlight edge on tab */}
      <path
        d="M16 12H38C40.1217 12 42.1566 12.8429 43.6569 14.3431L48 18.6863C49.5003 20.1866 51.5352 21.0294 53.6569 21.0294H104C106.209 21.0294 108.209 22.0723 109.536 23.6863"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Inner shadow */}
      <path
        d="M12 28H108V78C108 80.2091 106.209 82 104 82H16C13.7909 82 12 80.2091 12 78V28Z"
        fill="rgba(0,0,0,0.15)"
      />
    </svg>
  )
}
