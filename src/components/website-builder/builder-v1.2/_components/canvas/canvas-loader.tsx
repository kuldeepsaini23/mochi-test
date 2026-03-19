/**
 * ============================================================================
 * CANVAS LOADER - Real-time Progress Bar with Mochi Logo
 * ============================================================================
 *
 * Premium loading experience with:
 * - Mochi logo displayed prominently
 * - Real-time progress bar that fills smoothly
 * - Bright glow effect at the leading edge of progress
 *
 * PROGRESS SIMULATION:
 * Since we can't track actual server-side data fetching, we simulate realistic
 * progress that starts fast and slows as it approaches completion.
 * This creates the perception of real progress tracking.
 *
 * ============================================================================
 */

'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ============================================================================
// TYPES
// ============================================================================

interface CanvasLoaderProps {
  /** Whether the loader is visible */
  isVisible: boolean
  /** Optional loading progress (0-100). If not provided, simulates progress */
  progress?: number
  /** Callback when exit animation completes */
  onExitComplete?: () => void
}

// ============================================================================
// PROGRESS SIMULATION HOOK
// ============================================================================

/**
 * Simulates realistic loading progress.
 * Starts fast, slows in the middle, and pauses near the end.
 */
function useSimulatedProgress(isVisible: boolean, externalProgress?: number) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    // If external progress is provided, use that instead
    if (externalProgress !== undefined) {
      setProgress(externalProgress)
      return
    }

    if (!isVisible) {
      setProgress(0)
      return
    }

    // Reset progress when becoming visible
    setProgress(0)

    // Simulate progress with realistic timing
    const intervals: { timeout: number; increment: number }[] = [
      // Fast start: 0-30% in ~500ms
      { timeout: 50, increment: 6 },
      { timeout: 50, increment: 6 },
      { timeout: 50, increment: 6 },
      { timeout: 50, increment: 6 },
      { timeout: 50, increment: 6 },
      // Medium: 30-60% in ~600ms
      { timeout: 100, increment: 5 },
      { timeout: 100, increment: 5 },
      { timeout: 100, increment: 5 },
      { timeout: 100, increment: 5 },
      { timeout: 100, increment: 5 },
      { timeout: 100, increment: 5 },
      // Slower: 60-80% in ~800ms
      { timeout: 200, increment: 4 },
      { timeout: 200, increment: 4 },
      { timeout: 200, increment: 4 },
      { timeout: 200, increment: 4 },
      { timeout: 200, increment: 4 },
      // Very slow: 80-90% in ~1000ms
      { timeout: 250, increment: 2 },
      { timeout: 250, increment: 2 },
      { timeout: 250, increment: 2 },
      { timeout: 250, increment: 2 },
      // Pause at 90% - waits for actual load
    ]

    let currentProgress = 0
    let index = 0

    const runNextStep = () => {
      if (index >= intervals.length || currentProgress >= 90) {
        return
      }

      const step = intervals[index]
      currentProgress = Math.min(currentProgress + step.increment, 90)
      setProgress(currentProgress)
      index++

      setTimeout(runNextStep, step.timeout)
    }

    // Start the simulation
    const startTimer = setTimeout(runNextStep, 100)

    return () => {
      clearTimeout(startTimer)
    }
  }, [isVisible, externalProgress])

  // Jump to 100% when becoming invisible (loading complete)
  useEffect(() => {
    if (!isVisible && progress > 0) {
      setProgress(100)
    }
  }, [isVisible, progress])

  return progress
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Canvas Loader - Mochi Logo + Real-time Progress Bar
 */
export function CanvasLoader({
  isVisible,
  progress: externalProgress,
  onExitComplete,
}: CanvasLoaderProps) {
  const progress = useSimulatedProgress(isVisible, externalProgress)

  return (
    <AnimatePresence mode="wait" onExitComplete={onExitComplete}>
      {isVisible && (
        <motion.div
          key="canvas-loader"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          /* Use shadcn bg-background so the loader adapts to light/dark theme */
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-background"
        >
          {/* Center content */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
            className="flex flex-col items-center gap-8"
          >
            {/* Mochi Logo */}
            <div className="flex items-center gap-3">
              {/* Logo icon: bg-foreground/text-background inverts correctly in both themes */}
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-5"
                >
                  <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
                </svg>
              </div>
              {/* Logo text adapts to theme via text-foreground */}
              <span className="text-xl font-semibold text-foreground tracking-tight">
                Mochi
              </span>
            </div>

            {/* Progress Bar Container */}
            <div className="w-64 flex flex-col items-center gap-3">
              {/* Progress bar track */}
              {/* Progress track: foreground at 10% opacity for subtle contrast in both themes */}
              <div className="relative w-full h-1 bg-foreground/10 rounded-full overflow-hidden">
                {/* Progress fill with glow */}
                {/* Progress fill: gradient from foreground/60 to foreground/90 for theme-adaptive contrast */}
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-foreground/60 to-foreground/90"
                  initial={{ width: '0%' }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                >
                  {/* Bright glow at the leading edge */}
                  <div
                    className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2"
                    style={{
                      width: 24,
                      height: 24,
                      background: 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.4) 30%, transparent 70%)',
                      filter: 'blur(4px)',
                    }}
                  />
                  {/* Core bright point */}
                  <div
                    className="absolute right-0 top-1/2 -translate-y-1/2"
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: '#fff',
                      boxShadow: '0 0 12px 4px rgba(255,255,255,0.8), 0 0 24px 8px rgba(255,255,255,0.4)',
                    }}
                  />
                </motion.div>
              </div>

              {/* Progress percentage */}
              {/* Progress percentage: muted foreground at 40% opacity */}
              <span className="text-xs font-medium text-foreground/40 tabular-nums">
                {Math.round(progress)}%
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default CanvasLoader
