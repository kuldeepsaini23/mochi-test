/**
 * ============================================================================
 * MOBILE OVERRIDE INDICATOR - Blue Dot + Reset Button
 * ============================================================================
 *
 * Shows a visual indicator when a property has a mobile-specific override.
 * Includes a reset button that appears on hover to clear just that property.
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 * Use inside any property control to show override status:
 *
 * ```tsx
 * <div className="flex items-center gap-1.5">
 *   <p className="text-sm text-muted-foreground">{label}</p>
 *   <MobileOverrideIndicator
 *     hasOverride={hasMobileOverride}
 *     onReset={() => handleResetProperty('fontSize')}
 *   />
 * </div>
 * ```
 *
 * ============================================================================
 */

'use client'

import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface MobileOverrideIndicatorProps {
  /** Whether this property has a mobile override */
  hasOverride: boolean
  /** Called when user clicks reset - should clear this specific property's override */
  onReset?: () => void
}

/**
 * MobileOverrideIndicator - Shows blue dot and reset button for mobile overrides
 *
 * When hasOverride is true:
 * - Shows a blue dot indicator
 * - On hover, shows a reset button with tooltip "Use desktop value"
 *
 * When hasOverride is false:
 * - Renders nothing (null)
 */
export function MobileOverrideIndicator({
  hasOverride,
  onReset,
}: MobileOverrideIndicatorProps) {
  const [isHovered, setIsHovered] = useState(false)

  // Don't render anything if no override exists
  if (!hasOverride) return null

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onReset?.()
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className={cn(
              'shrink-0 transition-all duration-150',
              isHovered
                ? 'w-4 h-4 rounded flex items-center justify-center bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                : 'w-1.5 h-1.5 rounded-full bg-blue-400'
            )}
            title="Use desktop value"
          >
            {isHovered && <RotateCcw className="w-2.5 h-2.5" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <p>Use desktop value</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
