/**
 * Element Section Component
 *
 * WHY: Provides collapsible sections to organize elements in the sidebar
 * HOW: Uses local state to track open/closed state with smooth transitions
 *
 * FEATURES:
 * - Collapsible header with chevron icon animation
 * - Smooth transitions for expanding/collapsing
 * - Optional icon support for visual categorization
 * - Hover effects on header for better UX
 * - Defaults to open state for immediate access
 *
 * USAGE:
 * <ElementSection title="Layout" icon={<Box />} defaultOpen={true}>
 *   <ElementGrid>
 *     ... grid items ...
 *   </ElementGrid>
 * </ElementSection>
 */

'use client'

import React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ElementSectionProps {
  // Section title displayed in header
  title: string
  // Optional icon displayed before title
  icon?: React.ReactNode
  // Whether section starts expanded (default: true)
  defaultOpen?: boolean
  // Content to display when section is expanded
  children: React.ReactNode
}

export function ElementSection({
  title,
  icon,
  defaultOpen = true,
  children,
}: ElementSectionProps) {
  // Track whether section is expanded or collapsed
  const [isOpen, setIsOpen] = React.useState(defaultOpen)

  return (
    <div className="mb-4">
      {/* Section Header - Clickable to toggle open/closed */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-2 py-2 rounded-md hover:bg-accent/50 transition-colors"
      >
        {/* Left side: Icon + Title */}
        <div className="flex items-center gap-2">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <span className="text-sm font-medium">{title}</span>
        </div>

        {/* Right side: Chevron indicator */}
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Section Content - Shows/hides based on isOpen state */}
      <div
        className={cn(
          'mt-2 transition-all duration-200',
          isOpen ? 'block' : 'hidden'
        )}
      >
        {children}
      </div>
    </div>
  )
}
