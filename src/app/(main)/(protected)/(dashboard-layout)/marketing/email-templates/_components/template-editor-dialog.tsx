'use client'

/**
 * Template Editor Dialog
 *
 * Full-screen overlay for creating/editing email templates.
 * Uses the premium EmailBuilder component with drag-and-drop.
 *
 * FEATURES:
 * - Full-screen email builder experience
 * - Drag and drop block editing
 * - Live preview mode
 * - Undo/redo support
 * - Keyboard shortcuts
 *
 * NOTE: Feature gating (email_templates.limit) is handled by the parent
 * via <FeatureGate> wrapping the "New Template" button. This dialog does
 * not manage its own upgrade modal.
 *
 * SOURCE OF TRUTH KEYWORDS: TemplateEditorDialog, EmailEditor
 */

import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { trpc } from '@/trpc/react-provider'
import { EmailBuilder } from '@/components/email-builder'
import type { EmailBlock, EmailTemplateWithBlocks, EmailSettings } from '@/types/email-templates'

/**
 * Serialized template type (dates are strings after tRPC serialization)
 */
type SerializedTemplate = Omit<
  EmailTemplateWithBlocks,
  'createdAt' | 'updatedAt' | 'deletedAt' | 'lastUsedAt'
> & {
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  lastUsedAt: string | null
}

interface TemplateEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: SerializedTemplate | null
  onSave: () => void
  onClose: () => void
  /** Current folder ID - used when creating new templates */
  currentFolderId?: string | null
}

export function TemplateEditorDialog({
  open,
  onOpenChange,
  template,
  onSave,
  onClose,
  currentFolderId,
}: TemplateEditorDialogProps) {
  // Track saving state
  const [isSaving, setIsSaving] = useState(false)

  // Get active organization
  const { data: organizations, isLoading: isLoadingOrg } = trpc.organization.getUserOrganizations.useQuery(undefined, {
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const activeOrg = organizations?.[0]

  // Mutations with error handling
  const createMutation = trpc.emailTemplates.create.useMutation({
    onSuccess: () => {
      setIsSaving(false)
      toast.success('Template created successfully')
      onSave()
    },
    onError: (error) => {
      setIsSaving(false)
      toast.error('Failed to create template', { description: error.message })
    },
  })

  const updateMutation = trpc.emailTemplates.update.useMutation({
    onSuccess: () => {
      setIsSaving(false)
      toast.success('Template saved successfully')
      onSave()
    },
    onError: (error) => {
      setIsSaving(false)
      toast.error('Failed to save template', { description: error.message })
    },
  })

  /**
   * Handle save from email builder.
   * Validates input and saves both blocks AND emailSettings.
   * EmailSettings contains canvas styling (background colors, padding, etc.)
   */
  const handleSave = useCallback(
    async (data: { name: string; subject: string; blocks: EmailBlock[]; emailSettings: EmailSettings }) => {
      // Validate organization is loaded
      if (isLoadingOrg) {
        toast.error('Please wait while loading...')
        return
      }

      if (!activeOrg) {
        toast.error('No organization found')
        return
      }

      // Validate required fields with user feedback
      if (!data.name.trim()) {
        toast.error('Please enter a template name')
        return
      }

      if (!data.subject.trim()) {
        toast.error('Please enter an email subject')
        return
      }

      if (data.blocks.length === 0) {
        toast.error('Please add at least one block to the template')
        return
      }

      setIsSaving(true)

      if (template) {
        // Update existing template (includes emailSettings)
        updateMutation.mutate({
          organizationId: activeOrg.id,
          templateId: template.id,
          name: data.name.trim(),
          subject: data.subject.trim(),
          content: data.blocks as Parameters<typeof updateMutation.mutate>[0]['content'],
          emailSettings: data.emailSettings,
        })
      } else {
        // Create new template in current folder (includes emailSettings)
        createMutation.mutate({
          organizationId: activeOrg.id,
          name: data.name.trim(),
          subject: data.subject.trim(),
          content: data.blocks as Parameters<typeof createMutation.mutate>[0]['content'],
          emailSettings: data.emailSettings,
          folderId: currentFolderId ?? undefined,
        })
      }
    },
    [activeOrg, isLoadingOrg, template, createMutation, updateMutation, currentFolderId]
  )

  /**
   * Handle close with unsaved changes check
   */
  const handleClose = useCallback(() => {
    onClose()
    onOpenChange(false)
  }, [onClose, onOpenChange])

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-background"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.2, delay: 0.05 }}
              className="h-full w-full"
            >
              <EmailBuilder
                organizationId={activeOrg?.id}
                initialName={template?.name || ''}
                initialSubject={template?.subject || ''}
                initialBlocks={template?.content || []}
                initialEmailSettings={template?.emailSettings}
                onSave={handleSave}
                onClose={handleClose}
                isSaving={isSaving}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
