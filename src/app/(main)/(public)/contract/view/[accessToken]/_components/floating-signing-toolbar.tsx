'use client'

/**
 * ============================================================================
 * FLOATING SIGNING TOOLBAR — Impersonation Banner Style
 * ============================================================================
 *
 * Fixed bottom-center pill toolbar on the public contract view.
 * Design matches the ImpersonationBanner component exactly:
 * centered, rounded-full, bg-muted backdrop-blur, border, shadow.
 *
 * THREE STATES:
 * 1. SIGNING (isCompleted=false): Tracks fields + submit button
 * 2. JUST SUBMITTED (isSubmitted=true): "Contract signed successfully"
 * 3. COMPLETED (isCompleted=true): "Completed" text + download button
 *
 * SOURCE OF TRUTH KEYWORDS: FloatingSigningToolbar, SigningToolbar
 */

import { useCallback, useMemo, useState } from 'react'
import { ChevronRight, CheckCircle2, Loader2, Send, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import { useSigningContext } from '../_lib/signing-context'
import { trackEvent, CLARITY_EVENTS } from '@/lib/clarity/events'

// ============================================================================
// TYPES
// ============================================================================

interface FloatingSigningToolbarProps {
  /** Access token for submitting the signature */
  accessToken: string
  /**
   * Current resolved variable values — baked into signeeData at submit time.
   * WHY: Dates, lead data, org data, and contract variables must be frozen
   * at signing time so they never change when the contract is re-viewed.
   */
  variableValues: Record<string, string>
  /**
   * Whether the contract is already COMPLETED (signed + submitted).
   * WHY: When true, the toolbar shows "Completed" text + download button
   * instead of the signing flow (field tracking + submit).
   */
  isCompleted: boolean
}

// ============================================================================
// HIGHLIGHT UTILITY
// ============================================================================

/**
 * Temporarily highlight an element with a pulsing ring effect.
 * WHY: Gives visual feedback when "Next" scrolls to an unfilled field.
 */
function highlightElement(el: Element) {
  el.classList.add(
    'ring-2',
    'ring-primary',
    'ring-offset-2',
    'rounded-lg',
    'transition-all',
    'duration-300'
  )
  setTimeout(() => {
    el.classList.remove(
      'ring-2',
      'ring-primary',
      'ring-offset-2',
      'rounded-lg',
      'transition-all',
      'duration-300'
    )
  }, 2000)
}

// ============================================================================
// COMPONENT
// ============================================================================

export function FloatingSigningToolbar({ accessToken, variableValues, isCompleted }: FloatingSigningToolbarProps) {
  const {
    fieldValues,
    signatureStates,
    registeredFields,
    registeredSignatures,
  } = useSigningContext()
  const [isSubmitted, setIsSubmitted] = useState(false)

  /**
   * Count filled vs total fields using the registration system.
   * WHY: Each InputFieldNode and SignatureNode registers itself on mount
   * via the signing context, so we always know the exact count — no DOM scanning needed.
   */
  const fieldKeys = useMemo(() => Array.from(registeredFields), [registeredFields])
  const signatureKeys = useMemo(() => Array.from(registeredSignatures), [registeredSignatures])

  const filledInputCount = useMemo(() => {
    return fieldKeys.filter((key) => {
      const value = fieldValues[key]
      return value && value.trim().length > 0
    }).length
  }, [fieldKeys, fieldValues])

  const filledSignatureCount = useMemo(() => {
    return signatureKeys.filter((key) => signatureStates[key]).length
  }, [signatureKeys, signatureStates])

  const totalRequired = fieldKeys.length + signatureKeys.length
  const totalFilled = filledInputCount + filledSignatureCount
  const remaining = totalRequired - totalFilled
  const allComplete = totalRequired > 0 && remaining === 0

  /** Submit mutation — stores signee data and marks contract as COMPLETED */
  const submitMutation = trpc.contracts.submitSignature.useMutation({
    onSuccess: () => {
      setIsSubmitted(true)
      trackEvent(CLARITY_EVENTS.CONTRACT_SIGNED)
      toast.success('Contract signed successfully!')
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to submit signature')
    },
  })

  /**
   * Handle submit — gather all field values, signature states, and bake
   * in ALL dynamic variable values so they're frozen at signing time.
   */
  const handleSubmit = useCallback(() => {
    if (submitMutation.isPending) return
    submitMutation.mutate({
      accessToken,
      signeeData: {
        fieldValues,
        signatureStates,
        submittedAt: new Date().toISOString(),
        bakedVariableValues: variableValues,
      },
    })
  }, [accessToken, fieldValues, signatureStates, variableValues, submitMutation])

  /**
   * Handle download — triggers the browser's print dialog.
   * WHY: window.print() opens Chrome's "Save as PDF" dialog, which is the
   * simplest and most reliable way to generate a PDF. The contract view page
   * has @media print styles that remove UI chrome and enable multi-page flow.
   */
  const handleDownload = useCallback(() => {
    window.print()
  }, [])

  /**
   * Scroll to the next unfilled field and highlight + focus it.
   * WHY: Guides the user through form completion in document order.
   *
   * Uses .editor-input-field and .editor-signature DOM classes to locate
   * the actual DOM elements (these classes are always present from createDOM()).
   */
  const handleNext = useCallback(() => {
    /** Find first unfilled input — scan DOM elements in document order */
    const inputEls = document.querySelectorAll('.editor-input-field')
    for (const el of inputEls) {
      const input = el.querySelector('input')
      if (input && (!input.value || input.value.trim().length === 0)) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => {
          input.focus()
          highlightElement(el)
        }, 400)
        return
      }
    }

    /** Find first unsigned signature — scan DOM elements in document order */
    const sigEls = document.querySelectorAll('.editor-signature')
    for (const el of sigEls) {
      const hasSignedText = el.querySelector('[style*="Licorice"]')
      if (!hasSignedText) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => {
          highlightElement(el)
        }, 400)
        return
      }
    }
  }, [])

  /**
   * COMPLETED state — show "Completed" status text + download button.
   * WHY: A completed contract is fully signed and frozen. The toolbar
   * becomes a status indicator with a download action instead of signing controls.
   */
  if (isCompleted) {
    return (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 print:hidden">
        <div className="flex items-center gap-3 bg-muted backdrop-blur-sm border border-border rounded-full shadow-lg px-5 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium text-foreground">
            Completed
          </span>

          {/* Divider */}
          <div className="h-4 w-px bg-border" />

          {/* Download button — triggers browser print dialog (Save as PDF) */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            className="h-7 text-xs gap-1.5 rounded-full px-3"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
        </div>
      </div>
    )
  }

  /** Just-submitted success state — impersonation-style centered pill */
  if (isSubmitted) {
    return (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 print:hidden">
        <div className="flex items-center gap-3 bg-muted backdrop-blur-sm border border-border rounded-full shadow-lg px-5 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium text-foreground">
            Contract signed successfully
          </span>
        </div>
      </div>
    )
  }

  /**
   * SIGNING state — show field tracking + Next/Submit buttons.
   * If no fields exist at all, just show a simple submit button.
   */
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 print:hidden">
      <div className="flex items-center gap-3 bg-muted backdrop-blur-sm border border-border rounded-full shadow-lg px-4 py-2">
        {totalRequired > 0 ? (
          <>
            {/* Progress counter */}
            <span className="text-sm font-medium whitespace-nowrap text-foreground">
              {allComplete
                ? 'All fields complete'
                : `${remaining} field${remaining !== 1 ? 's' : ''} remaining`}
            </span>

            {/* Divider */}
            <div className="h-4 w-px bg-border" />

            {/* Next / Submit button */}
            {!allComplete ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNext}
                className="h-7 text-xs gap-1 rounded-full px-3"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={submitMutation.isPending}
                className="h-7 text-xs gap-1.5 rounded-full px-4"
              >
                {submitMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Submit
              </Button>
            )}
          </>
        ) : (
          /* No fillable fields — just a submit button */
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitMutation.isPending}
            className="h-7 text-xs gap-1.5 rounded-full px-4"
          >
            {submitMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Submit
          </Button>
        )}
      </div>
    </div>
  )
}
