/**
 * ============================================================================
 * FORM BUILDER MODAL
 * ============================================================================
 *
 * Modal wrapper for the FormBuilder component.
 * Allows the form builder to be opened from anywhere in the app.
 *
 * USAGE:
 * ```tsx
 * <FormBuilderModal
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   organizationId="..."
 *   formSlug="..."
 *   initialSchema={...}
 *   onSave={async (schema) => { ... }}
 * />
 * ```
 *
 * FEATURES:
 * - Full-screen modal with smooth animation
 * - Handles closing with unsaved changes warning
 * - Works from website builder, forms page, or anywhere
 */

'use client'

import React, { useState, useCallback } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
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
import { FormBuilder } from './form-builder'
import type { FormBuilderModalProps, FormSchema } from './_lib/types'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Modal wrapper for the FormBuilder.
 * Can be opened from anywhere in the application.
 */
export function FormBuilderModal({
  open,
  onOpenChange,
  organizationId,
  formId,
  formSlug,
  initialSchema,
  onSave,
}: FormBuilderModalProps) {
  // Track if there are unsaved changes (passed up from builder)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)

  // Handle close with unsaved changes check
  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowUnsavedDialog(true)
    } else {
      onOpenChange(false)
    }
  }, [hasUnsavedChanges, onOpenChange])

  // Force close (discard changes)
  const handleForceClose = useCallback(() => {
    setShowUnsavedDialog(false)
    setHasUnsavedChanges(false)
    onOpenChange(false)
  }, [onOpenChange])

  // Handle save from builder
  const handleSave = useCallback(
    async (schema: FormSchema) => {
      if (onSave) {
        await onSave(schema)
        setHasUnsavedChanges(false)
      }
    },
    [onSave]
  )

  return (
    <>
      {/* Main Form Builder Modal */}
      <Dialog open={open} onOpenChange={(value) => !value && handleClose()}>
        <DialogContent
          className="max-w-none w-screen h-screen p-0 gap-0 border-0 rounded-none"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            e.preventDefault()
            handleClose()
          }}
        >
          {/* Visually hidden title for accessibility */}
          <VisuallyHidden>
            <DialogTitle>Form Builder</DialogTitle>
          </VisuallyHidden>

          <FormBuilder
            organizationId={organizationId}
            formId={formId}
            formSlug={formSlug}
            initialSchema={initialSchema}
            onSave={handleSave}
            onClose={handleClose}
            onDirtyChange={setHasUnsavedChanges}
            isModal
          />
        </DialogContent>
      </Dialog>

      {/* Unsaved Changes Warning Dialog */}
      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to close the form
              builder? Your changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowUnsavedDialog(false)}>
              Continue Editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleForceClose}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
