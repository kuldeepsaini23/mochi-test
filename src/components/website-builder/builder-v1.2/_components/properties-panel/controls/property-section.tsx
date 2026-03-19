/**
 * ========================================
 * PROPERTY SECTION - Collapsible section
 * ========================================
 *
 * Collapsible section with ChevronDown icon that rotates 180° when open.
 * Uses grid-rows animation for smooth expand/collapse (like pay page accordion).
 * Clean, minimal design with consistent spacing.
 */

'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'

interface PropertySectionProps {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}

export function PropertySection({
  title,
  defaultOpen = true,
  children,
}: PropertySectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div>
      {/* Section header - click to toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-3 text-[15px] font-medium text-foreground hover:bg-muted/50 transition-colors"
      >
        <span>{title}</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-300 ease-out',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Section content - animated with grid-rows for smooth expand/collapse */}
      <div
        className={cn(
          'grid transition-all duration-300 ease-out',
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          <div
            className={cn(
              'px-4 py-3 space-y-3 transition-opacity duration-300 ease-out',
              isOpen ? 'opacity-100' : 'opacity-0'
            )}
          >
            {children}
          </div>
        </div>
      </div>

      <Separator className="bg-border/50" />
    </div>
  )
}
