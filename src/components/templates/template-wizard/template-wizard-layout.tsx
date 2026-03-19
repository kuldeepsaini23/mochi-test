'use client'

/**
 * ============================================================================
 * TEMPLATE WIZARD LAYOUT — Full-Page Create/Edit Orchestrator
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: TemplateWizardLayout, TemplateWizardLayoutProps,
 * FullPageWizard
 *
 * WHY: Full-screen overlay for the template creation/editing wizard. Uses the
 * same AnimatePresence + motion.div pattern as the email template builder
 * (template-editor-dialog.tsx) for a premium entrance animation.
 *
 * HOW: Two-layer animation: backdrop fades at 0.2s, content slides up from
 * y:20 with a 0.05s stagger delay. Split layout with a sleek full-height
 * preview panel on the left and settings + header on the right.
 *
 * COLOR SCHEME: Follows the contract builder pattern:
 * - Left panel: dark:bg-sidebar bg-muted (same as contract editor area)
 * - Right panel: bg-background (clean, high contrast against left)
 *
 * MODES:
 * - Create: 4 onboarding-style step screens with progressive navigation
 * - Edit: Single metadata form screen
 */

import { useEffect, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

import type { TemplateDetail } from '@/lib/templates/types'
import { TemplateLibraryProvider } from '../template-library-context'
import { WizardPreviewPanel } from './wizard-preview-panel'
import { WizardSettingsPanel } from './wizard-settings-panel'
import type { WizardFormValues } from './wizard-settings-panel'
import { NavigationGate } from '@/components/global/navigation-gate'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// ============================================================================
// PROPS
// ============================================================================

/**
 * Props for the TemplateWizardLayout component.
 *
 * SOURCE OF TRUTH KEYWORDS: TemplateWizardLayoutProps
 */
export interface TemplateWizardLayoutProps {
  /** Controls visibility — AnimatePresence uses this for enter/exit animations */
  open: boolean
  /** Whether this is a new template or editing an existing one */
  mode: 'create' | 'edit'
  /** Existing template data for edit mode — pre-populates the metadata form */
  editTemplate?: TemplateDetail
  /** Organization ID for data fetching and mutations */
  organizationId: string
  /** Callback to close the wizard overlay and return to the previous view */
  onClose: () => void
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Full-screen overlay layout for the template creation/editing wizard.
 * Uses the EXACT same AnimatePresence + motion.div pattern as the email
 * template builder (template-editor-dialog.tsx) — the `open` prop controls
 * visibility so AnimatePresence can animate both entry and exit.
 *
 * Layout structure:
 * - Left panel (55%): Sleek full-height preview with max-w-xl inner content.
 *   Contract builder color scheme (dark:bg-sidebar bg-muted).
 * - Right panel (45%): Header (title + close) + scrollable step content.
 *   Clean bg-background for readability.
 *
 * Body scroll is locked while the wizard is open. ESC key closes the wizard.
 */
export function TemplateWizardLayout({
  open,
  mode,
  editTemplate,
  organizationId,
  onClose,
}: TemplateWizardLayoutProps) {
  /**
   * Lifted form state — settings panel writes via onFormChange,
   * preview panel reads for realtime updates.
   */
  const [formValues, setFormValues] = useState<WizardFormValues>({
    name: editTemplate?.name ?? '',
    description: editTemplate?.description ?? '',
    thumbnailUrl: editTemplate?.thumbnailUrl ?? '',
    tags: editTemplate?.tags ?? [],
    category: editTemplate?.category ?? null,
    organizationName: '',
    price: editTemplate?.price ?? null,
  })

  /** Whether the close confirmation dialog is open */
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)

  /**
   * Detect if the user has any progress worth protecting.
   * True if any form value has been filled in (name, description, thumbnail,
   * tags, or a category was selected). Prevents accidental data loss from
   * ESC key, X button, or browser navigation.
   */
  const hasProgress =
    formValues.name.trim().length > 0 ||
    (formValues.description ?? '').trim().length > 0 ||
    (formValues.thumbnailUrl ?? '').trim().length > 0 ||
    formValues.tags.length > 0 ||
    formValues.category !== null

  /**
   * Attempt to close the wizard — if the user has progress, show
   * the confirmation dialog instead of closing immediately.
   */
  const handleCloseAttempt = useCallback(() => {
    if (hasProgress) {
      setShowCloseConfirm(true)
    } else {
      onClose()
    }
  }, [hasProgress, onClose])

  /** User confirmed they want to discard — close for real */
  const handleConfirmClose = useCallback(() => {
    setShowCloseConfirm(false)
    onClose()
  }, [onClose])

  /** Close on ESC key — routes through the confirmation gate */
  const handleEscKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleCloseAttempt()
      }
    },
    [handleCloseAttempt]
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleEscKey)
    return () => document.removeEventListener('keydown', handleEscKey)
  }, [open, handleEscKey])

  /** Lock body scroll while wizard is open (same as email template editor) */
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  /**
   * Portal renders the overlay at document.body — guarantees `fixed inset-0`
   * is relative to the viewport, not clipped by any parent container
   * (sidebar, layout wrappers, etc.).
   * SSR guard: typeof document check — same pattern as layers-panel.tsx
   */
  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        /* Layer 1: Backdrop — fades in. Exact same pattern as email builder. */
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-background"
        >
          {/* NavigationGate — protects against browser back/refresh/link clicks */}
          <NavigationGate
            isPending={hasProgress}
            title="Discard template?"
            description="You have unsaved changes in the template wizard. If you leave now, all your progress will be lost."
            stayButtonText="Keep editing"
            leaveButtonText="Discard & leave"
          />

          {/* Close confirmation dialog — shown when X button or ESC is pressed */}
          <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Discard template?</AlertDialogTitle>
                <AlertDialogDescription>
                  You have unsaved changes. If you close now, all your progress will be lost.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep editing</AlertDialogCancel>
                <AlertDialogAction onClick={handleConfirmClose}>
                  Discard & close
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {/* Layer 2: Content — slides up with stagger delay */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.2, delay: 0.05 }}
            className="h-full w-full"
          >
            {/*
             * Split panel — preview left (wider), settings right (narrower).
             * overflow-hidden on the grid prevents content from leaking past
             * the viewport — forces children to respect their overflow-y-auto.
             */}
            <div className="grid h-full overflow-hidden grid-cols-1 lg:grid-cols-[55%_45%]">
              {/*
               * Left — Sleek full-height preview panel.
               * Contract builder color scheme: bg-muted (light) / bg-sidebar (dark).
               * min-h-0 overrides grid's default min-height:auto so the panel
               * stays within the viewport and scrolls instead of leaking out.
               */}
              <div className="hidden lg:flex min-h-0 overflow-y-auto dark:bg-sidebar bg-muted justify-center">
                <div className="w-full max-w-xl py-6">
                  <WizardPreviewPanel
                    name={formValues.name}
                    description={formValues.description}
                    thumbnailUrl={formValues.thumbnailUrl}
                    category={formValues.category}
                    organizationName={formValues.organizationName}
                    tags={formValues.tags}
                    price={formValues.price}
                  />
                </div>
              </div>

              {/* Right — Header + step content */}
              <div className="flex min-h-0 flex-col bg-background">
                {/* Header — title and close button, scoped to right panel */}
                <header className="flex h-14 shrink-0 items-center justify-between px-6">
                  <h1 className="text-lg font-semibold">
                    {mode === 'create' ? 'Create Template' : 'Edit Template'}
                  </h1>
                  <button
                    type="button"
                    onClick={handleCloseAttempt}
                    className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </header>

                {/* Scrollable step content */}
                <div className="flex-1 overflow-y-auto">
                  <div className="mx-auto max-w-2xl px-6 py-6">
                    {mode === 'create' ? (
                      <TemplateLibraryProvider organizationId={organizationId}>
                        <WizardSettingsPanel
                          mode="create"
                          organizationId={organizationId}
                          onComplete={onClose}
                          onFormChange={setFormValues}
                        />
                      </TemplateLibraryProvider>
                    ) : (
                      <WizardSettingsPanel
                        mode="edit"
                        editTemplate={editTemplate}
                        organizationId={organizationId}
                        onComplete={onClose}
                        onFormChange={setFormValues}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
