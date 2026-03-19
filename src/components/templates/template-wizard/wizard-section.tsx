'use client'

/**
 * ============================================================================
 * WIZARD SECTION — Reusable Animated Collapsible Section
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: WizardSection, WizardSectionProps, ProgressiveReveal
 *
 * WHY: Provides a Stripe-like progressive reveal experience for the template
 * wizard. Each section expands/collapses with spring animations, showing
 * completion state and allowing navigation between completed steps.
 *
 * HOW: framer-motion motion.div with spring animations for height/opacity.
 * Collapsed sections show title + step badge + checkmark (if completed).
 * Active sections expand to show children content.
 */

import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Props for the WizardSection component.
 * SOURCE OF TRUTH KEYWORDS: WizardSectionProps
 */
export interface WizardSectionProps {
  /** Section title displayed in the header */
  title: string
  /** Optional description shown below title when collapsed */
  description?: string
  /** Step number displayed as a badge (1-indexed for display) */
  stepNumber: number
  /** Whether this section is currently expanded/active */
  isActive: boolean
  /** Whether this section has been completed */
  isCompleted: boolean
  /** Callback when a completed section is clicked to review */
  onActivate?: () => void
  /** Section content — only rendered when active */
  children: React.ReactNode
}

/**
 * Spring animation configuration for the expand/collapse transition.
 * Uses a snappy spring with high stiffness and moderate damping
 * to give a premium, Stripe-like feel.
 */
const SPRING_TRANSITION = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
}

/**
 * WizardSection — Animated collapsible section for progressive reveal wizards.
 *
 * Three visual states:
 * 1. ACTIVE — expanded with children visible, highlighted step badge
 * 2. COMPLETED — collapsed with green checkmark, clickable to re-activate
 * 3. PENDING — collapsed with muted step badge, not interactive
 */
export function WizardSection({
  title,
  description,
  stepNumber,
  isActive,
  isCompleted,
  onActivate,
  children,
}: WizardSectionProps) {
  /**
   * Determine if the collapsed header should be clickable.
   * Only completed (non-active) sections can be clicked to navigate back.
   */
  const isClickable = isCompleted && !isActive

  return (
    <div
      className={cn(
        'rounded-lg border transition-colors duration-200',
        isActive
          ? 'border-primary/20 bg-card shadow-sm'
          : 'border-border bg-card/50',
        isClickable && 'cursor-pointer hover:border-primary/30 hover:bg-card'
      )}
      onClick={isClickable ? onActivate : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onActivate?.()
              }
            }
          : undefined
      }
    >
      {/* Section header — always visible regardless of state */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Step badge — circle with step number or checkmark */}
        <StepBadge
          stepNumber={stepNumber}
          isActive={isActive}
          isCompleted={isCompleted}
        />

        {/* Title and optional description */}
        <div className="flex-1 min-w-0">
          <h3
            className={cn(
              'text-sm font-medium leading-tight',
              isActive
                ? 'text-foreground'
                : isCompleted
                  ? 'text-foreground'
                  : 'text-muted-foreground'
            )}
          >
            {title}
          </h3>
          {/* Show description only when collapsed */}
          {!isActive && description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {description}
            </p>
          )}
        </div>

        {/* Completed indicator — subtle "Edit" hint for clickable sections */}
        {isClickable && (
          <span className="text-xs text-muted-foreground">Edit</span>
        )}
      </div>

      {/* Expandable content area — animated with spring physics */}
      <AnimatePresence initial={false}>
        {isActive && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING_TRANSITION}
            style={{ overflow: 'hidden' }}
          >
            {/* Inner padding for the content, separated from the header */}
            <div className="px-4 pb-4 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * StepBadge — Small circular badge showing the step number or a checkmark.
 *
 * Visual states:
 * - Active: primary background with white number
 * - Completed: green background with white checkmark icon
 * - Pending: muted border with muted number
 */
function StepBadge({
  stepNumber,
  isActive,
  isCompleted,
}: {
  stepNumber: number
  isActive: boolean
  isCompleted: boolean
}) {
  return (
    <div
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-200',
        isCompleted && !isActive
          ? 'bg-emerald-500/15 text-emerald-600'
          : isActive
            ? 'bg-primary text-primary-foreground'
            : 'border border-border text-muted-foreground'
      )}
    >
      {isCompleted && !isActive ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : (
        stepNumber
      )}
    </div>
  )
}
