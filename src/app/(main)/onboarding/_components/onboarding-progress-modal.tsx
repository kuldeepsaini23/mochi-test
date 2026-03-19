'use client'

/**
 * Onboarding Progress Modal
 *
 * Beautiful animated modal that shows account setup progress
 * Displays steps as they complete during webhook processing
 */

import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { CheckCircle2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface OnboardingProgressModalProps {
  open: boolean
  steps: {
    id: string
    label: string
    status: 'pending' | 'processing' | 'complete'
  }[]
}

export function OnboardingProgressModal({
  open,
  steps,
}: OnboardingProgressModalProps) {
  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-md"
        showCloseButton={false}
      >
        <div className="flex flex-col items-center justify-center space-y-6 py-8">
          {/* Main Spinner */}
          <div className="relative">
            <Spinner className="h-16 w-16 text-primary" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-12 w-12 rounded-full bg-primary/10 animate-pulse" />
            </div>
          </div>

          {/* Title */}
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              Setting up your account
            </h2>
            <p className="text-sm text-muted-foreground">
              Please wait while we prepare everything for you
            </p>
          </div>

          {/* Progress Steps */}
          <div className="w-full space-y-3 pt-4">
            {steps.map((step) => (
              <div
                key={step.id}
                className={cn(
                  'flex items-center gap-3 rounded-lg p-3 transition-all duration-300',
                  step.status === 'processing' && 'bg-primary/5',
                  step.status === 'complete' && 'bg-green-500/5'
                )}
              >
                {/* Icon */}
                <div className="flex-shrink-0">
                  {step.status === 'complete' ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 animate-in zoom-in duration-300" />
                  ) : step.status === 'processing' ? (
                    <Spinner className="h-5 w-5 text-primary" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground/40" />
                  )}
                </div>

                {/* Label */}
                <span
                  className={cn(
                    'text-sm font-medium transition-colors',
                    step.status === 'complete' && 'text-green-600 dark:text-green-400',
                    step.status === 'processing' && 'text-foreground',
                    step.status === 'pending' && 'text-muted-foreground/60'
                  )}
                >
                  {step.label}
                </span>
              </div>
            ))}
          </div>

          {/* Subtle animation hint */}
          <p className="text-xs text-muted-foreground/60 animate-pulse">
            This may take a few moments...
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
