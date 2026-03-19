'use client'

import { cn } from '@/lib/utils'
import { HTMLAttributes, CSSProperties, useRef, useCallback, useSyncExternalStore } from 'react'

export type MarqueeFadeProps = HTMLAttributes<HTMLDivElement> & {
  /**
   * Whether to show the top fade effect
   * Animates smoothly when toggled
   */
  showTopFade?: boolean
  /**
   * Whether to show the bottom fade effect
   * Animates smoothly when toggled
   */
  showBottomFade?: boolean
  /**
   * Height/size of the fade effect in pixels
   * @default 24
   */
  fadeHeight?: number
  /**
   * Content to render inside the fade container
   */
  children: React.ReactNode
}

/**
 * Builds CSS mask-image gradient for fade edge effects
 *
 * WHY: Creates smooth fade-to-transparent effects at container edges
 * HOW: Uses mask-image with linear gradients - black = visible, transparent = hidden
 *
 * This approach is COLOR-INDEPENDENT because it masks the content itself
 * rather than overlaying a colored gradient on top.
 */
function buildFadeMaskGradient(topHeight: number, bottomHeight: number): string {
  return `linear-gradient(
    to bottom,
    transparent 0px,
    rgba(0,0,0,0.3) ${topHeight * 0.3}px,
    rgba(0,0,0,0.7) ${topHeight * 0.6}px,
    black ${topHeight}px,
    black calc(100% - ${bottomHeight}px),
    rgba(0,0,0,0.7) calc(100% - ${bottomHeight * 0.6}px),
    rgba(0,0,0,0.3) calc(100% - ${bottomHeight * 0.3}px),
    transparent 100%
  )`
}

/**
 * Animation store - manages animated values without causing React state loops
 * WHY: Using useState inside animation loops can cause "Maximum update depth exceeded"
 * HOW: External store pattern with useSyncExternalStore for safe subscriptions
 */
function createAnimationStore(initialValue: number) {
  let value = initialValue
  let targetValue = initialValue
  let animationFrame: number | null = null
  const listeners = new Set<() => void>()

  const notify = () => {
    listeners.forEach((listener) => listener())
  }

  const animate = () => {
    const diff = targetValue - value
    if (Math.abs(diff) < 0.5) {
      value = targetValue
      notify()
      animationFrame = null
      return
    }

    // Smooth easing - move 15% of remaining distance each frame
    value += diff * 0.15
    notify()
    animationFrame = requestAnimationFrame(animate)
  }

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => value,
    setTarget: (newTarget: number) => {
      if (newTarget === targetValue) return
      targetValue = newTarget

      if (animationFrame === null) {
        animationFrame = requestAnimationFrame(animate)
      }
    },
    cleanup: () => {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame)
        animationFrame = null
      }
    },
  }
}

/**
 * Hook that creates and manages an animation store
 * Returns the current animated value
 */
function useAnimatedValue(target: number): number {
  const storeRef = useRef<ReturnType<typeof createAnimationStore> | null>(null)

  // Create store lazily
  if (!storeRef.current) {
    storeRef.current = createAnimationStore(target)
  }

  const store = storeRef.current

  // Update target when it changes
  store.setTarget(target)

  // Subscribe to store updates
  const subscribe = useCallback(
    (onStoreChange: () => void) => store.subscribe(onStoreChange),
    [store]
  )

  const getSnapshot = useCallback(() => store.getSnapshot(), [store])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * MarqueeFade Component - Color-Independent Fade Effect Container
 *
 * WHY: Creates smooth fade-to-transparent effects at container edges
 *      indicating more content exists beyond the visible area
 *
 * HOW: Uses CSS mask-image with linear gradients instead of color overlays.
 *      This makes the fade effect work regardless of background color.
 *      Smooth transitions are achieved via external animation store pattern.
 *
 * SOURCE OF TRUTH: Inspired by website-builder fadeEdges implementation
 */
export const MarqueeFade = ({
  className,
  showTopFade = false,
  showBottomFade = false,
  fadeHeight = 24,
  children,
  style,
  ...props
}: MarqueeFadeProps) => {
  /**
   * Animate the fade heights for smooth transitions
   */
  const animatedTopHeight = useAnimatedValue(showTopFade ? fadeHeight : 0)
  const animatedBottomHeight = useAnimatedValue(showBottomFade ? fadeHeight : 0)

  /**
   * Build the mask gradient CSS value with animated heights
   */
  const maskGradient = buildFadeMaskGradient(animatedTopHeight, animatedBottomHeight)

  const containerStyle: CSSProperties = {
    ...(style ?? {}),
    maskImage: maskGradient,
    WebkitMaskImage: maskGradient,
  }

  return (
    <div className={cn('relative', className)} style={containerStyle} {...props}>
      {children}
    </div>
  )
}

/**
 * Legacy FadeEdges type for backwards compatibility
 * @deprecated Use showTopFade/showBottomFade props instead
 */
export type FadeEdges =
  | 'none'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-bottom'
  | 'left-right'
  | 'all'

export default MarqueeFade
