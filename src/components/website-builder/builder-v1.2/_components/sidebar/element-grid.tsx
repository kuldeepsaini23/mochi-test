/**
 * Element Grid Component
 *
 * WHY: Provides a flexible grid layout for displaying draggable elements in the sidebar
 * HOW: Uses CSS Grid with configurable columns and gap spacing
 *
 * FEATURES:
 * - Supports 2, 3, or 4 column layouts
 * - Configurable gap spacing (2, 3, or 4 Tailwind units)
 * - Responsive grid that maintains equal-width columns
 *
 * USAGE:
 * <ElementGrid columns={2} gap={3}>
 *   <SidebarItem ... />
 *   <SidebarItem ... />
 * </ElementGrid>
 */

'use client'

import { cn } from '@/lib/utils'

interface ElementGridProps {
  // Child elements to display in the grid
  children: React.ReactNode
  // Number of columns (2, 3, or 4)
  columns?: 2 | 3 | 4
  // Gap spacing between grid items (Tailwind units: 2, 3, or 4)
  gap?: number
}

export function ElementGrid({ children, columns = 2, gap = 3 }: ElementGridProps) {
  return (
    <div
      className={cn(
        'grid',
        // Apply column classes based on columns prop
        columns === 2 && 'grid-cols-2',
        columns === 3 && 'grid-cols-3',
        columns === 4 && 'grid-cols-4',
        // Apply gap classes based on gap prop
        gap === 2 && 'gap-2',
        gap === 3 && 'gap-3',
        gap === 4 && 'gap-4'
      )}
    >
      {children}
    </div>
  )
}
