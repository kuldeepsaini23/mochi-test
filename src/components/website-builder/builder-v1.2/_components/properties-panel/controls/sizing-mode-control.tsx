/**
 * ============================================================================
 * SIZING MODE CONTROL - Unified UI for Frame Sizing Options
 * ============================================================================
 *
 * SOURCE OF TRUTH: Unified Sizing UI Control
 *
 * This component provides a clean, unified UI for all frame sizing options:
 * - Width: Fixed (pixels) vs Fill (100%)
 * - Height: Fixed (pixels) vs Fit Content (wrap mode)
 * - Overflow: Visible vs Scroll
 *
 * ARCHITECTURE:
 * The control maps user-friendly concepts to underlying properties:
 *
 * | UI Mode              | Underlying Property                    |
 * |----------------------|----------------------------------------|
 * | Width: Fixed         | autoWidth: false + width: number       |
 * | Width: Fill          | autoWidth: true                        |
 * | Height: Fixed        | flexWrap: 'nowrap' + height: number    |
 * | Height: Fit Content  | flexWrap: 'wrap'                       |
 * | Overflow: Visible    | scrollEnabled: false                   |
 * | Overflow: Scroll     | scrollEnabled: true                    |
 *
 * RESPONSIVE DESIGN:
 * - Each mode change respects the current breakpoint
 * - Shows mobile override indicators when applicable
 * - Provides reset functionality for mobile overrides
 *
 * ============================================================================
 */

'use client'

import { cn } from '@/lib/utils'
import {
  ArrowLeftRight,
  MoveHorizontal,
  MoveVertical,
  WrapText,
  ScrollText,
  Eye,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { MobileOverrideIndicator } from './mobile-override-indicator'

/**
 * Width mode: Fixed pixel width or Fill container (100%)
 */
export type WidthMode = 'fixed' | 'fill'

/**
 * Height mode: Fixed pixel height or Fit Content (wrap)
 */
export type HeightMode = 'fixed' | 'wrap'

/**
 * Overflow mode: Visible (content can overflow) or Scroll (scrollable)
 */
export type OverflowMode = 'visible' | 'scroll'

interface SizingModeControlProps {
  /**
   * Current width mode ('fixed' | 'fill')
   */
  widthMode: WidthMode

  /**
   * Current height mode ('fixed' | 'wrap').
   * Optional — when omitted, the height row is hidden (width-only mode).
   */
  heightMode?: HeightMode

  /**
   * Current overflow mode ('visible' | 'scroll').
   * Optional — when omitted, the overflow row is hidden.
   */
  overflowMode?: OverflowMode

  /**
   * Callback when width mode changes
   */
  onWidthModeChange: (mode: WidthMode) => void

  /**
   * Callback when height mode changes.
   * Optional — only needed when heightMode is provided.
   */
  onHeightModeChange?: (mode: HeightMode) => void

  /**
   * Callback when overflow mode changes.
   * Optional — only needed when overflowMode is provided.
   */
  onOverflowModeChange?: (mode: OverflowMode) => void

  /**
   * Whether width has a mobile override (shows blue indicator)
   */
  hasWidthMobileOverride?: boolean

  /**
   * Whether height/wrap has a mobile override (shows blue indicator)
   */
  hasHeightMobileOverride?: boolean

  /**
   * Whether overflow/scroll has a mobile override (shows blue indicator)
   */
  hasOverflowMobileOverride?: boolean

  /**
   * Callback to reset width mobile override
   */
  onResetWidthMobileOverride?: () => void

  /**
   * Callback to reset height mobile override
   */
  onResetHeightMobileOverride?: () => void

  /**
   * Callback to reset overflow mobile override
   */
  onResetOverflowMobileOverride?: () => void

  /**
   * Whether to show the overflow control (hidden when height mode is 'wrap')
   */
  showOverflow?: boolean
}

/**
 * Reusable button wrapper with tooltip for sizing mode toggles.
 * Provides consistent styling and accessible tooltip behavior.
 */
function SizingButton({
  isActive,
  onClick,
  tooltipText,
  children,
}: {
  isActive: boolean
  onClick: () => void
  tooltipText: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            'w-8 h-8 flex items-center justify-center rounded-md transition-colors',
            isActive
              ? 'bg-primary/20 text-primary'
              : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8}>
        <p>{tooltipText}</p>
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * SizingModeControl - Unified sizing options for frames
 *
 * Groups related sizing options into a single cohesive control:
 * 1. Width Mode: Fixed vs Fill
 * 2. Height Mode: Fixed vs Fit Content
 * 3. Overflow Mode: Visible vs Scroll (auto-hidden when height is Fit Content)
 */
export function SizingModeControl({
  widthMode,
  heightMode,
  overflowMode,
  onWidthModeChange,
  onHeightModeChange,
  onOverflowModeChange,
  hasWidthMobileOverride,
  hasHeightMobileOverride,
  hasOverflowMobileOverride,
  onResetWidthMobileOverride,
  onResetHeightMobileOverride,
  onResetOverflowMobileOverride,
  showOverflow = true,
}: SizingModeControlProps) {
  /**
   * Height and overflow rows are only shown when their props are provided.
   * This allows the control to be used in width-only mode for non-frame elements.
   */
  const showHeight = heightMode !== undefined && onHeightModeChange !== undefined
  const shouldShowOverflow = showOverflow && showHeight && heightMode !== 'wrap'
    && overflowMode !== undefined && onOverflowModeChange !== undefined

  return (
    <div className="space-y-3">
      {/* Width Mode Row */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 w-16 shrink-0">
          <p className="text-sm text-muted-foreground">Width</p>
          <MobileOverrideIndicator
            hasOverride={hasWidthMobileOverride ?? false}
            onReset={onResetWidthMobileOverride}
          />
        </div>

        <div className="flex-1 flex items-center justify-end gap-1">
          {/* Fixed Width - Uses horizontal line icon to represent fixed dimension */}
          <SizingButton
            isActive={widthMode === 'fixed'}
            onClick={() => onWidthModeChange('fixed')}
            tooltipText="Fixed Width - Set a specific pixel width"
          >
            <MoveHorizontal className="w-4 h-4" />
          </SizingButton>

          {/* Fill Width - Uses expand arrows to represent filling container */}
          <SizingButton
            isActive={widthMode === 'fill'}
            onClick={() => onWidthModeChange('fill')}
            tooltipText="Fill Container - Stretch to fill parent width (100%)"
          >
            <ArrowLeftRight className="w-4 h-4" />
          </SizingButton>
        </div>
      </div>

      {/* Height Mode Row — only shown when heightMode + handler are provided */}
      {showHeight && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 w-16 shrink-0">
            <p className="text-sm text-muted-foreground">Height</p>
            <MobileOverrideIndicator
              hasOverride={hasHeightMobileOverride ?? false}
              onReset={onResetHeightMobileOverride}
            />
          </div>

          <div className="flex-1 flex items-center justify-end gap-1">
            {/* Fixed Height - Uses vertical line icon to represent fixed dimension */}
            <SizingButton
              isActive={heightMode === 'fixed'}
              onClick={() => onHeightModeChange('fixed')}
              tooltipText="Fixed Height - Set a specific pixel height"
            >
              <MoveVertical className="w-4 h-4" />
            </SizingButton>

            {/* Fit Content (Wrap) - Uses wrap icon to represent content wrapping */}
            <SizingButton
              isActive={heightMode === 'wrap'}
              onClick={() => onHeightModeChange('wrap')}
              tooltipText="Fit Content - Height adjusts to fit children (enables wrapping)"
            >
              <WrapText className="w-4 h-4" />
            </SizingButton>
          </div>
        </div>
      )}

      {/* Overflow Mode Row - Auto-hidden when height is 'wrap' or not provided */}
      {shouldShowOverflow && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 w-16 shrink-0">
            <p className="text-sm text-muted-foreground">Overflow</p>
            <MobileOverrideIndicator
              hasOverride={hasOverflowMobileOverride ?? false}
              onReset={onResetOverflowMobileOverride}
            />
          </div>

          <div className="flex-1 flex items-center justify-end gap-1">
            {/* Visible (overflow allowed) */}
            <SizingButton
              isActive={overflowMode === 'visible'}
              onClick={() => onOverflowModeChange('visible')}
              tooltipText="Visible - Content can extend beyond frame bounds"
            >
              <Eye className="w-4 h-4" />
            </SizingButton>

            {/* Scroll (scrollable) */}
            <SizingButton
              isActive={overflowMode === 'scroll'}
              onClick={() => onOverflowModeChange('scroll')}
              tooltipText="Scroll - Add scrollbars when content exceeds frame size"
            >
              <ScrollText className="w-4 h-4" />
            </SizingButton>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Icons for sizing modes - exported for potential use in other components
 */
export const SizingIcons = {
  fixedWidth: <MoveHorizontal className="w-4 h-4" />,
  fillWidth: <ArrowLeftRight className="w-4 h-4" />,
  fixedHeight: <MoveVertical className="w-4 h-4" />,
  fitContent: <WrapText className="w-4 h-4" />,
  overflowVisible: <Eye className="w-4 h-4" />,
  overflowScroll: <ScrollText className="w-4 h-4" />,
}
