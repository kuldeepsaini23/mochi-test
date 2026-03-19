/**
 * ============================================================================
 * UNIFIED TIMER ELEMENT - Single Component for Canvas + Preview Rendering
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedTimer, unified-timer, timer-element-unified,
 * countdown-timer-unified
 *
 * Renders a countdown timer element in BOTH canvas (editor) and preview
 * (published) modes. Features animated step-counter digits, configurable
 * segments (days/hours/minutes/seconds), labels, separators, and an
 * expiry system that can hide/reveal other page elements.
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * The component renders CONTENT ONLY in canvas mode -- the parent
 * `ElementWrapper` handles all editor chrome (selection ring, hover ring,
 * resize handles, labels, dimensions pill, pointer events).
 *
 * In preview mode, this component wraps content in a positioned container
 * with its own size/position styles for published page layout.
 *
 * ============================================================================
 * KEY BEHAVIORS BY MODE
 * ============================================================================
 *
 * BOTH MODES:
 *   - Segments rendered as 2-digit animated counter blocks
 *   - Optional labels below each segment (short: "d" / full: "Days")
 *   - Optional colon separators between segments
 *   - Google Font loading for digit typography
 *   - Full style parity: background gradient, effects, borders, margin
 *
 * CANVAS MODE (mode='canvas'):
 *   - Displays the REAL countdown values (not hardcoded samples)
 *   - No countdown interval running (static snapshot of time remaining)
 *   - All transitions/animations disabled
 *   - No expiry actions
 *
 * PREVIEW MODE (mode='preview'):
 *   - Live countdown interval (1s tick)
 *   - Step animation on digit changes (translateY transition)
 *   - Session-persistent duration mode (sessionStorage)
 *   - Expiry system: hide timer, hide elements, reveal elements
 *
 * ============================================================================
 * RESPONSIVENESS
 * ============================================================================
 *
 * Each separator is grouped WITH its following segment into a single flex
 * child. This way the container `gap` applies between segment groups, NOT
 * between a separator and its adjacent segment — preventing the separator
 * from drifting away from its numbers on narrow viewports.
 *
 * The container uses `flexWrap: 'nowrap'` so segments never break to a
 * second line. On very narrow widths the content overflows hidden.
 *
 * ============================================================================
 * EXPIRY SYSTEM (Preview Only)
 * ============================================================================
 *
 * On mount, a <style> tag is injected to hide all "reveal" target elements
 * (they should only appear AFTER the timer expires). When the timer reaches
 * zero:
 *   1. The style tag is removed, revealing previously hidden elements
 *   2. "hide" target elements are set to display: none
 *   3. If hideTimerOnExpiry is true, the timer itself returns null
 *
 * ============================================================================
 */

'use client'

import React, { memo, useState, useEffect, useRef, useMemo } from 'react'
import { motion, useSpring, useTransform } from 'framer-motion'
import type {
  TimerElement as TimerElementType,
  Breakpoint,
  GradientConfig,
  EffectsConfig,
  BorderConfig,
} from '../../_lib/types'
import {
  getStyleValue,
  useRenderMode,
} from '../../_lib'
import {
  computeElementPositionStyles,
  useElementSizeStyles,
} from '../../_lib/shared-element-styles'
import { GoogleFontsService } from '../../_lib/google-fonts-service'
import { gradientConfigToCSS } from '../../_lib/gradient-utils'
import { effectsConfigToCSS } from '../../_lib/effect-utils'
import { borderConfigToInlineStyles, hasGradientBorder } from '../../_lib/border-utils'
import { GradientBorderOverlay, useGradientBorder } from '../overlay'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the UnifiedTimer component.
 *
 * SOURCE OF TRUTH: UnifiedTimerProps
 *
 * In canvas mode, rendered INSIDE an ElementWrapper — only needs element data.
 * In preview mode, handles its own wrapper for published page layout.
 */
export interface UnifiedTimerProps {
  /** The timer element data — SOURCE OF TRUTH: TimerElement from types.ts */
  element: TimerElementType
}

/**
 * Represents the remaining time broken into segments.
 *
 * SOURCE OF TRUTH: TimeLeft, timer-time-remaining
 */
interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}

/**
 * Label text mappings for short and full label styles.
 *
 * SOURCE OF TRUTH: TIMER_LABELS, timer-label-text
 */
const TIMER_LABELS = {
  short: { days: 'd', hours: 'h', minutes: 'm', seconds: 's' },
  full: { days: 'Days', hours: 'Hours', minutes: 'Minutes', seconds: 'Seconds' },
} as const

// ============================================================================
// STATIC TIME COMPUTATION — Used by canvas mode for a real snapshot
// ============================================================================

/**
 * Computes the current countdown values without running an interval.
 * Used in canvas mode so designers see the REAL time remaining, not
 * hardcoded sample values.
 *
 * SOURCE OF TRUTH: computeStaticTimeLeft, timer-static-compute
 */
function computeStaticTimeLeft(element: TimerElementType): TimeLeft {
  let totalSecondsLeft = 0

  if (element.timerMode === 'date' && element.targetDate) {
    const target = new Date(element.targetDate).getTime()
    totalSecondsLeft = Math.max(0, Math.floor((target - Date.now()) / 1000))
  } else if (element.timerMode === 'duration' && element.durationSeconds) {
    /* Duration mode in canvas always shows the full duration (no persistent start) */
    totalSecondsLeft = element.durationSeconds
  }

  return {
    days: Math.floor(totalSecondsLeft / 86400),
    hours: Math.floor((totalSecondsLeft % 86400) / 3600),
    minutes: Math.floor((totalSecondsLeft % 3600) / 60),
    seconds: totalSecondsLeft % 60,
  }
}

// ============================================================================
// SIZE META HOOK — Bridge for canvas wrapper sizing
// ============================================================================

/**
 * Computes timer-specific size styles for the canvas wrapper.
 *
 * SOURCE OF TRUTH: useUnifiedTimerMeta, timer-meta-hook
 *
 * Timer elements default to autoWidth=true (fill parent) and
 * autoHeight=true (grow with content) since layout adapts to segment count.
 */
export function useUnifiedTimerMeta(element: TimerElementType) {
  const baseSizeStyles = useElementSizeStyles(element, 'desktop', {
    autoWidthDefault: true,
    autoHeightDefault: true,
  })

  return { sizeStyles: baseSizeStyles }
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

// ---- CounterDigit -----------------------------------------------------------

/**
 * Props for the CounterDigit sub-component.
 *
 * SOURCE OF TRUTH: CounterDigitProps
 */
interface CounterDigitProps {
  /** The digit to display (0-9) — controls the Y translation position */
  digit: number
  /** Height of each digit cell in pixels */
  digitHeight: number
  /** Width of each digit cell in pixels */
  digitWidth: number
  /** CSS styles applied to each digit cell (font, color, etc.) */
  style: React.CSSProperties
  /** When true, disables the slide animation (used in canvas mode) */
  disableAnimation: boolean
}

/**
 * Renders a single animated counter digit using a vertical strip technique
 * powered by Framer Motion for physics-based spring animation + gradual blur.
 *
 * HOW IT WORKS:
 * A vertical strip of digits 0-9 is stacked inside a fixed-height overflow
 * container. A Framer Motion spring drives the Y position so the target digit
 * is visible. On digit changes, the spring naturally accelerates and decelerates.
 *
 * GRADUAL MOTION BLUR (Framer Motion):
 * The blur is derived from the spring's VELOCITY — not a binary on/off toggle.
 * As the strip accelerates mid-slide the blur intensifies, then gradually
 * dissipates as the spring settles into its resting position. This produces
 * a natural, cinematic motion-blur that tracks the actual movement speed.
 *
 * IMPLEMENTATION:
 * 1. `useSpring` animates the Y offset (percentage-based) with spring physics
 * 2. `useTransform` maps the spring's velocity to a blur radius:
 *    - velocity 0 → blur 0px (stationary, perfectly sharp)
 *    - velocity peaks → blur up to 4px (fast motion, maximum streak)
 * 3. The blur value is applied as a CSS filter on the strip container
 *
 * CANVAS MODE:
 * Animations and blur are fully disabled — the digit snaps instantly.
 */
const CounterDigit = memo(function CounterDigit({
  digit,
  digitHeight,
  digitWidth,
  style,
  disableAnimation,
}: CounterDigitProps) {
  /** All 10 digits rendered vertically in the strip */
  const allDigits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

  /**
   * Spring-driven Y position in PIXELS (digit index * cell height).
   * Using pixels instead of percentages avoids fragile transformTemplate hacks.
   *
   * Spring config for a snappy but smooth feel:
   * - stiffness 80: responsive without being instant
   * - damping 18: enough resistance to prevent oscillation
   * - mass 0.8: lighter feel for quick digit changes
   */
  const targetY = digit * -digitHeight
  const ySpring = useSpring(targetY, {
    stiffness: 80,
    damping: 18,
    mass: 0.8,
  })

  /** Update the spring target whenever the digit or cell height changes */
  useEffect(() => {
    const target = digit * -digitHeight
    if (disableAnimation) {
      /* Canvas mode: jump instantly with no animation */
      ySpring.jump(target)
    } else {
      ySpring.set(target)
    }
  }, [digit, digitHeight, disableAnimation, ySpring])

  /**
   * GRADUAL BLUR: Derived from the spring's velocity.
   *
   * The blur is proportional to how fast the strip is currently moving.
   * This creates a natural, cinematic effect:
   * - Stationary (velocity ~0) → perfectly sharp (0px blur)
   * - Accelerating mid-slide → blur gradually ramps up
   * - Peak velocity → maximum blur (~4px)
   * - Decelerating into rest → blur gradually dissipates back to 0
   *
   * `useTransform` callback fires every animation frame while the spring
   * is active, so `getVelocity()` always returns the current frame's value.
   */
  const filterValue = useTransform(ySpring, () => {
    const absVelocity = Math.abs(ySpring.getVelocity())
    /* Smooth ramp: 0 velocity → 0 blur, 300+ velocity → 4px max */
    const blur = Math.min(absVelocity / 75, 4)
    return `blur(${blur.toFixed(1)}px)`
  })

  /**
   * CANVAS MODE: Skip Framer Motion entirely for zero overhead.
   * Renders the strip at a fixed translateY with no spring, no blur.
   */
  if (disableAnimation) {
    return (
      <div
        style={{
          position: 'relative',
          height: digitHeight,
          width: digitWidth,
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `translateY(-${digit * 100}%)`,
          }}
        >
          {allDigits.map((num) => (
            <div
              key={num}
              style={{
                height: digitHeight,
                width: digitWidth,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontVariantNumeric: 'tabular-nums',
                ...style,
              }}
            >
              {num}
            </div>
          ))}
        </div>
      </div>
    )
  }

  /**
   * PREVIEW MODE: Framer Motion spring slide + velocity-driven blur.
   * The motion.div reads `y` from the spring and `filter` from the
   * velocity-derived blur transform — both update every animation frame
   * for perfectly smooth, gradual motion blur.
   *
   * BLUR BLEED FIX:
   * `overflow: hidden` would clip the blur at the container edges, making
   * it look harsh and cut off. Instead we use `clip-path: inset(...)` with
   * negative horizontal/vertical insets so the blur can naturally bleed
   * beyond the digit boundaries while still hiding off-screen digit strips.
   * The 6px bleed matches the max blur radius (4px) plus a small buffer.
   */
  const BLUR_BLEED = 6

  return (
    <div
      style={{
        position: 'relative',
        height: digitHeight,
        width: digitWidth,
        /**
         * clip-path with negative HORIZONTAL insets lets the blur extend
         * past the left/right edges for a smooth glow effect.
         * Vertical insets are 0 to clip EXACTLY at top/bottom — this
         * prevents adjacent digits in the strip from peeking through,
         * which is especially visible at small font sizes where 6px
         * is a large fraction of the digit cell height.
         */
        clipPath: `inset(0px -${BLUR_BLEED}px)`,
        flexShrink: 0,
      }}
    >
      <motion.div
        style={{
          position: 'absolute',
          inset: 0,
          /**
           * `y` is driven by the spring in pixels (digit * -digitHeight).
           * Framer Motion applies this as translateY(Npx) automatically.
           */
          y: ySpring,
          /**
           * Gradual motion blur derived from the spring's velocity.
           * Updates every animation frame — blur ramps up mid-slide
           * and dissipates as the spring settles.
           */
          filter: filterValue,
        }}
      >
        {allDigits.map((num) => (
          <div
            key={num}
            style={{
              height: digitHeight,
              width: digitWidth,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontVariantNumeric: 'tabular-nums',
              ...style,
            }}
          >
            {num}
          </div>
        ))}
      </motion.div>
    </div>
  )
})

// ---- CounterNumber ----------------------------------------------------------

/**
 * Props for the CounterNumber sub-component.
 *
 * SOURCE OF TRUTH: CounterNumberProps
 */
interface CounterNumberProps {
  /** The numeric value to display (0-99, rendered as 2 digits) */
  value: number
  /** Height of each digit cell in pixels */
  digitHeight: number
  /** Width of each digit cell in pixels */
  digitWidth: number
  /** CSS styles applied to each digit cell */
  style: React.CSSProperties
  /** When true, disables animations (canvas mode) */
  disableAnimation: boolean
}

/**
 * Renders a 2-digit number (e.g., "05") as two side-by-side CounterDigit
 * components. Splits the value into tens and ones digits for independent
 * animation — when only the ones digit changes, the tens digit stays still.
 */
const CounterNumber = memo(function CounterNumber({
  value,
  digitHeight,
  digitWidth,
  style,
  disableAnimation,
}: CounterNumberProps) {
  /** Split value into tens and ones for independent digit animation */
  const tens = Math.floor(value / 10) % 10
  const ones = value % 10

  return (
    <div style={{ display: 'flex', flexDirection: 'row', flexShrink: 0 }}>
      <CounterDigit
        digit={tens}
        digitHeight={digitHeight}
        digitWidth={digitWidth}
        style={style}
        disableAnimation={disableAnimation}
      />
      <CounterDigit
        digit={ones}
        digitHeight={digitHeight}
        digitWidth={digitWidth}
        style={style}
        disableAnimation={disableAnimation}
      />
    </div>
  )
})

// ---- TimerSegmentDisplay ----------------------------------------------------

/**
 * Props for the TimerSegmentDisplay sub-component.
 *
 * SOURCE OF TRUTH: TimerSegmentDisplayProps
 */
interface TimerSegmentDisplayProps {
  /** The numeric value for this segment (e.g., 5 for hours) */
  value: number
  /** Label text to show below the number (e.g., "Hours") */
  label: string
  /** Whether to display the label */
  showLabel: boolean
  /** Height of each digit cell in pixels */
  digitHeight: number
  /** Width of each digit cell in pixels */
  digitWidth: number
  /** CSS styles for digit cells */
  digitStyle: React.CSSProperties
  /** Color for the label text */
  labelColor: string
  /** Font size for the label text */
  labelFontSize: string
  /** Font family for the label text */
  fontFamily: string
  /** Whether animations are disabled (canvas mode) */
  disableAnimation: boolean
}

/**
 * Renders one timer segment: a 2-digit animated counter with an optional
 * text label below it. Each segment is a vertical stack: number on top,
 * label on bottom, both centered.
 */
const TimerSegmentDisplay = memo(function TimerSegmentDisplay({
  value,
  label,
  showLabel,
  digitHeight,
  digitWidth,
  digitStyle,
  labelColor,
  labelFontSize,
  fontFamily,
  disableAnimation,
}: TimerSegmentDisplayProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
      }}
    >
      {/* Animated 2-digit counter */}
      <CounterNumber
        value={value}
        digitHeight={digitHeight}
        digitWidth={digitWidth}
        style={digitStyle}
        disableAnimation={disableAnimation}
      />

      {/* Optional label below the counter */}
      {showLabel && (
        <span
          style={{
            color: labelColor,
            fontSize: labelFontSize,
            fontFamily: `${fontFamily}, -apple-system, BlinkMacSystemFont, sans-serif`,
            lineHeight: 1.2,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            userSelect: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      )}
    </div>
  )
})

// ---- TimerSeparator ---------------------------------------------------------

/**
 * Props for the TimerSeparator sub-component.
 *
 * SOURCE OF TRUTH: TimerSeparatorProps
 */
interface TimerSeparatorProps {
  /** Color of the colon separator */
  color: string
  /** Height of the separator (matches digit height for vertical centering) */
  height: number
  /** Font size matching the digit font size */
  fontSize: string
  /** Font family matching the digit font */
  fontFamily: string
}

/**
 * Renders a colon ":" separator between timer segments.
 * Vertically centered to align with the digit counters.
 */
const TimerSeparator = memo(function TimerSeparator({
  color,
  height,
  fontSize,
  fontFamily,
}: TimerSeparatorProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height,
        color,
        fontSize,
        fontFamily: `${fontFamily}, -apple-system, BlinkMacSystemFont, sans-serif`,
        fontWeight: 700,
        lineHeight: 1,
        userSelect: 'none',
        flexShrink: 0,
        /**
         * Minimal horizontal spacing so the colon sits tight between
         * its adjacent segment digits. The parent `gap` handles the
         * spacing between segment GROUPS, not between colon and digits.
         */
        padding: '0 2px',
      }}
    >
      :
    </div>
  )
})

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Unified Timer element that renders in both canvas and preview modes.
 *
 * CONTENT-ONLY in canvas mode — ElementWrapper handles chrome.
 * SELF-WRAPPING in preview mode — includes positioned container.
 *
 * Renders a configurable countdown with animated step-counter digits,
 * optional labels, and an expiry system for hiding/revealing page elements.
 */
export const UnifiedTimer = memo(function UnifiedTimer({ element }: UnifiedTimerProps) {
  const { mode, breakpoint } = useRenderMode()
  const isPreview = mode === 'preview'

  /** Resolve active breakpoint — canvas always uses desktop */
  const activeBreakpoint: Breakpoint = isPreview ? breakpoint : 'desktop'

  // ==========================================================================
  // GOOGLE FONT LOADING
  // ==========================================================================

  const fontFamily = getStyleValue<string>(
    element,
    'fontFamily',
    activeBreakpoint,
    'Inter'
  )

  useEffect(() => {
    if (fontFamily) {
      GoogleFontsService.loadFont(fontFamily)
    }
  }, [fontFamily])

  // ==========================================================================
  // GRADIENT BORDER SUPPORT
  // ==========================================================================

  /**
   * Read the border config from element.styles for gradient border detection.
   * Gradient borders use a CSS pseudo-element overlay, while solid borders
   * use inline border styles directly.
   */
  const borderConfig = (element.styles as Record<string, unknown>)?.__borderConfig as BorderConfig | undefined
  const gradientBorder = useGradientBorder(element.id, borderConfig)

  // ==========================================================================
  // STYLE COMPUTATION
  // ==========================================================================

  /** Resolve responsive style values for the timer container */
  const backgroundColor = getStyleValue<string>(element, 'backgroundColor', activeBreakpoint, 'transparent')
  const borderRadius = getStyleValue<string>(element, 'borderRadius', activeBreakpoint, '12px')
  const padding = getStyleValue<string>(element, 'padding', activeBreakpoint, '16px')
  const gap = getStyleValue<number>(element, 'gap', activeBreakpoint, 16)

  /** Digit typography values */
  const digitColor = getStyleValue<string>(element, 'color', activeBreakpoint, '#111111')
  const digitFontSize = getStyleValue<string>(element, 'fontSize', activeBreakpoint, '48px')
  const digitFontWeight = getStyleValue<string | number>(element, 'fontWeight', activeBreakpoint, 700)

  /**
   * Custom style values prefixed with __ are stored in element.styles but are
   * not standard CSS properties. We cast through `keyof React.CSSProperties`
   * to satisfy the getStyleValue generic while keeping strict typing.
   */
  const labelColor = getStyleValue<string>(
    element,
    '__labelColor' as keyof React.CSSProperties,
    activeBreakpoint,
    '#6b7280'
  )
  const labelFontSize = getStyleValue<string>(
    element,
    '__labelFontSize' as keyof React.CSSProperties,
    activeBreakpoint,
    '12px'
  )
  const separatorColor = getStyleValue<string>(
    element,
    '__separatorColor' as keyof React.CSSProperties,
    activeBreakpoint,
    '#9ca3af'
  )

  // ==========================================================================
  // BACKGROUND GRADIENT SUPPORT
  // ==========================================================================

  /**
   * Read gradient config from styles.__backgroundGradient.
   * Gradients take priority over solid backgroundColor.
   */
  const gradientConfig = (element.styles as Record<string, unknown>)?.__backgroundGradient as GradientConfig | undefined
  const backgroundImageStyle = gradientConfig ? gradientConfigToCSS(gradientConfig) : undefined

  // ==========================================================================
  // EFFECTS SUPPORT (shadows, blurs)
  // ==========================================================================

  /** Read effects config and convert to inline CSS properties */
  const effectsConfig = (element.styles as Record<string, unknown>)?.__effects as EffectsConfig | undefined
  const effectsStyles = effectsConfigToCSS(effectsConfig)

  // ==========================================================================
  // BORDER SUPPORT (per-side borders)
  // ==========================================================================

  /** Convert border config to inline styles (solid borders only; gradient borders use overlay) */
  const borderStyles = borderConfig ? borderConfigToInlineStyles(borderConfig) : {}
  const hasGradientBorderActive = borderConfig && hasGradientBorder(borderConfig)

  // ==========================================================================
  // MARGIN (outer wrapper only, not on content div)
  // ==========================================================================

  const margin = getStyleValue<string>(element, 'margin', activeBreakpoint)

  // ==========================================================================
  // DIGIT DIMENSIONS
  // ==========================================================================

  /**
   * Compute digit dimensions from the font size.
   * We parse the numeric value from the fontSize string (e.g., "48px" -> 48)
   * and derive height/width so the digit cells are proportionally sized.
   */
  const digitDimensions = useMemo(() => {
    const sizeNum = parseInt(digitFontSize || '48', 10) || 48
    return {
      height: Math.round(sizeNum * 1.3),
      width: Math.round(sizeNum * 0.65),
    }
  }, [digitFontSize])

  /** CSS styles applied to each individual digit cell inside the counter strip */
  const digitStyle: React.CSSProperties = useMemo(() => ({
    color: digitColor,
    fontSize: digitFontSize,
    fontWeight: digitFontWeight,
    fontFamily: `${fontFamily || 'Inter'}, -apple-system, BlinkMacSystemFont, sans-serif`,
    lineHeight: 1,
  }), [digitColor, digitFontSize, digitFontWeight, fontFamily])

  /**
   * Container styles for the inner timer content div.
   *
   * RESPONSIVENESS FIX: `flexWrap: 'nowrap'` prevents segments from breaking
   * to a second line. Overflow is hidden to gracefully clip on very narrow widths.
   *
   * UNIFIED STYLE PARITY: Applies background gradient, effects, border styles
   * so they look identical in both canvas and preview modes.
   */
  const containerStyle: React.CSSProperties = useMemo(() => ({
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'flex-start',
    justifyContent: 'center',
    flexWrap: 'nowrap' as const,
    gap,
    backgroundColor: gradientConfig ? 'transparent' : backgroundColor,
    backgroundImage: backgroundImageStyle,
    borderRadius,
    padding,
    fontFamily: fontFamily || 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    /* Apply effects (box-shadow, filter, backdrop-filter) */
    ...effectsStyles,
    /* Apply border styles (solid borders; gradient handled by overlay) */
    ...borderStyles,
    ...(hasGradientBorderActive ? { position: 'relative' as const } : {}),
    /* Kill transition in canvas to prevent lag during drag/resize */
    ...(!isPreview ? { transition: 'none' } : {}),
  }), [
    gap, backgroundColor, backgroundImageStyle, gradientConfig,
    borderRadius, padding, fontFamily, isPreview,
    effectsStyles, borderStyles, hasGradientBorderActive,
  ])

  // ==========================================================================
  // COUNTDOWN LOGIC (Preview Mode Only)
  // ==========================================================================

  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => computeStaticTimeLeft(element))
  const [isExpired, setIsExpired] = useState(false)

  /**
   * Ref to track the expired state inside the interval callback.
   * This prevents stale closure issues where the interval keeps running
   * after expiry because `isExpired` in the closure is always `false`.
   */
  const isExpiredRef = useRef(false)

  useEffect(() => {
    /** Only run the countdown in preview mode */
    if (!isPreview) return

    /**
     * Calculates the remaining time and updates state.
     *
     * DATE MODE: Compares the target date against Date.now()
     * DURATION MODE: Uses sessionStorage to persist the start time across
     *   navigations within the same browser session, so the countdown
     *   doesn't restart when the user navigates between pages.
     */
    const calculateTimeLeft = () => {
      let totalSecondsLeft = 0

      if (element.timerMode === 'date' && element.targetDate) {
        const target = new Date(element.targetDate).getTime()
        totalSecondsLeft = Math.max(0, Math.floor((target - Date.now()) / 1000))
      } else if (element.timerMode === 'duration' && element.durationSeconds) {
        /** Persist the start time in sessionStorage so the countdown
         *  survives page navigations within the same session */
        const storageKey = `timer_${element.id}_start`
        let startTime = sessionStorage.getItem(storageKey)
        if (!startTime) {
          startTime = String(Date.now())
          sessionStorage.setItem(storageKey, startTime)
        }
        const elapsed = Math.floor((Date.now() - Number(startTime)) / 1000)
        totalSecondsLeft = Math.max(0, element.durationSeconds - elapsed)
      }

      /** Break total seconds into days, hours, minutes, seconds */
      const days = Math.floor(totalSecondsLeft / 86400)
      const hours = Math.floor((totalSecondsLeft % 86400) / 3600)
      const minutes = Math.floor((totalSecondsLeft % 3600) / 60)
      const seconds = totalSecondsLeft % 60

      setTimeLeft({ days, hours, minutes, seconds })

      /** Mark as expired once the countdown reaches zero */
      if (totalSecondsLeft <= 0 && !isExpiredRef.current) {
        isExpiredRef.current = true
        setIsExpired(true)
      }
    }

    /** Calculate immediately, then tick every second */
    calculateTimeLeft()
    const interval = setInterval(calculateTimeLeft, 1000)

    return () => clearInterval(interval)
  }, [
    isPreview,
    element.timerMode,
    element.targetDate,
    element.durationSeconds,
    element.id,
  ])

  // ==========================================================================
  // CANVAS MODE — Recompute static time when element config changes
  // ==========================================================================

  /**
   * In canvas mode, recompute the displayed time whenever the user changes
   * the timer mode, target date, or duration. This gives instant visual
   * feedback as the designer edits timer settings.
   */
  useEffect(() => {
    if (isPreview) return
    setTimeLeft(computeStaticTimeLeft(element))
  }, [isPreview, element.timerMode, element.targetDate, element.durationSeconds])

  // ==========================================================================
  // EXPIRY SYSTEM — Initial hide of reveal targets (Preview Only)
  // ==========================================================================

  useEffect(() => {
    /** Only manage DOM visibility in preview mode */
    if (!isPreview) return

    const revealIds = element.expiry?.revealElementIds ?? []
    if (revealIds.length === 0) return

    /**
     * Inject a <style> tag that hides all "reveal" target elements by default.
     * These elements should remain hidden until the timer expires, at which
     * point the style tag is removed and they become visible.
     *
     * Using a <style> tag instead of direct DOM manipulation ensures the
     * hiding is applied even if the target elements haven't mounted yet
     * (e.g., they're further down the page and lazy-loaded).
     */
    const styleTag = document.createElement('style')
    styleTag.id = `timer-reveal-${element.id}`
    styleTag.textContent = revealIds
      .map((id) => `[data-element-id="${id}"] { display: none !important; }`)
      .join('\n')
    document.head.appendChild(styleTag)

    /** Clean up the style tag when the timer unmounts */
    return () => {
      styleTag.remove()
    }
  }, [isPreview, element.id, element.expiry?.revealElementIds])

  // ==========================================================================
  // EXPIRY SYSTEM — Execute expiry actions (Preview Only)
  // ==========================================================================

  useEffect(() => {
    /** Only execute expiry actions in preview mode after the timer expires */
    if (!isExpired || !isPreview) return

    /**
     * REVEAL: Remove the style tag that was hiding reveal targets.
     * Once removed, those elements revert to their natural display value,
     * effectively "appearing" on the page.
     */
    const styleTag = document.getElementById(`timer-reveal-${element.id}`)
    if (styleTag) styleTag.remove()

    /**
     * HIDE: Set display: none on each hide target element.
     * We query by data-element-id attribute which is standard on all
     * rendered page elements in the website builder.
     */
    const hideIds = element.expiry?.hideElementIds ?? []
    hideIds.forEach((id) => {
      const el = document.querySelector(`[data-element-id="${id}"]`) as HTMLElement | null
      if (el) el.style.display = 'none'
    })
  }, [isExpired, isPreview, element.id, element.expiry])

  // ==========================================================================
  // HIDE TIMER ON EXPIRY
  // ==========================================================================

  /**
   * If the timer is configured to hide itself on expiry and the countdown
   * has reached zero, render nothing. This removes the timer from the page
   * entirely so it doesn't take up space after expiring.
   */
  if (isPreview && isExpired && element.expiry?.hideTimerOnExpiry) {
    return null
  }

  // ==========================================================================
  // RESOLVE DISPLAY VALUES
  // ==========================================================================

  /**
   * Both canvas and preview use the live `timeLeft` state.
   * Canvas initializes from computeStaticTimeLeft and updates when config changes.
   * Preview updates every second via the countdown interval.
   */
  const displayTime: TimeLeft = timeLeft

  /** Determine which segments are visible based on element configuration */
  const segments = element.segments ?? {
    showDays: true,
    showHours: true,
    showMinutes: true,
    showSeconds: true,
  }

  /** Build the list of visible segments with their values and labels */
  const labelStyle = element.labelStyle ?? 'full'
  const labels = TIMER_LABELS[labelStyle]

  const visibleSegments: Array<{ key: string; value: number; label: string }> = []
  if (segments.showDays) visibleSegments.push({ key: 'days', value: displayTime.days, label: labels.days })
  if (segments.showHours) visibleSegments.push({ key: 'hours', value: displayTime.hours, label: labels.hours })
  if (segments.showMinutes) visibleSegments.push({ key: 'minutes', value: displayTime.minutes, label: labels.minutes })
  if (segments.showSeconds) visibleSegments.push({ key: 'seconds', value: displayTime.seconds, label: labels.seconds })

  const showLabels = element.showLabels ?? true
  const showSeparators = (element.separatorStyle ?? 'colon') === 'colon'
  const disableAnimation = !isPreview

  // ==========================================================================
  // TIMER CONTENT RENDERER — Shared between canvas and preview modes
  // ==========================================================================

  /**
   * Renders the timer content: segments grouped with their preceding separators.
   *
   * RESPONSIVENESS KEY: Each separator is wrapped together with its following
   * segment into a single flex child. This ensures the container `gap` only
   * applies between segment groups — NOT between a colon and its adjacent
   * digits. This prevents the colon from drifting away on narrow viewports.
   */
  const renderTimerContent = () => (
    <div
      data-element-content={element.id}
      className={gradientBorder.className || undefined}
      style={containerStyle}
    >
      {/* Gradient border overlay for gradient-type borders */}
      {gradientBorder.isActive && (
        <GradientBorderOverlay
          elementId={element.id}
          borderConfig={borderConfig}
          borderRadius={borderRadius}
        />
      )}

      {visibleSegments.map((seg, index) => {
        const isFirst = index === 0

        /**
         * GROUPED RENDERING:
         * The first segment renders standalone. Every subsequent segment is
         * wrapped with its preceding colon separator into a single flex child.
         * This grouping keeps the colon tight to its segment regardless of
         * the container's gap value.
         */
        if (isFirst) {
          return (
            <TimerSegmentDisplay
              key={seg.key}
              value={seg.value}
              label={seg.label}
              showLabel={showLabels}
              digitHeight={digitDimensions.height}
              digitWidth={digitDimensions.width}
              digitStyle={digitStyle}
              labelColor={labelColor || '#6b7280'}
              labelFontSize={labelFontSize || '12px'}
              fontFamily={fontFamily || 'Inter'}
              disableAnimation={disableAnimation}
            />
          )
        }

        return (
          <div
            key={seg.key}
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-start',
              flexShrink: 0,
            }}
          >
            {/* Colon separator grouped with this segment */}
            {showSeparators && (
              <TimerSeparator
                color={separatorColor || '#9ca3af'}
                height={digitDimensions.height}
                fontSize={digitFontSize || '48px'}
                fontFamily={fontFamily || 'Inter'}
              />
            )}

            <TimerSegmentDisplay
              value={seg.value}
              label={seg.label}
              showLabel={showLabels}
              digitHeight={digitDimensions.height}
              digitWidth={digitDimensions.width}
              digitStyle={digitStyle}
              labelColor={labelColor || '#6b7280'}
              labelFontSize={labelFontSize || '12px'}
              fontFamily={fontFamily || 'Inter'}
              disableAnimation={disableAnimation}
            />
          </div>
        )
      })}
    </div>
  )

  // ==========================================================================
  // CANVAS MODE — Return content only (ElementWrapper handles chrome)
  // ==========================================================================

  if (!isPreview) {
    return renderTimerContent()
  }

  // ==========================================================================
  // PREVIEW MODE — Positioned wrapper for page layout
  // ==========================================================================

  const isRoot = element.parentId === null
  const positionStyles = computeElementPositionStyles(element, isRoot, activeBreakpoint)
  const sizeStyles = useElementSizeStyles(element, activeBreakpoint, {
    autoWidthDefault: true,
    autoHeightDefault: true,
  })

  /**
   * Preview wrapper matches canvas ElementWrapper behavior:
   * - No maxWidth constraint — the timer fills its parent width
   * - justifyContent: 'center' on the inner content div handles centering
   * - This ensures identical centering in both canvas and preview modes
   */
  return (
    <div
      data-timer-renderer
      data-element-id={element.id}
      style={{
        ...positionStyles,
        ...sizeStyles,
        margin: margin || undefined,
      }}
    >
      {renderTimerContent()}
    </div>
  )
})
