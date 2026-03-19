'use client'

/**
 * Email Builder Navbar
 *
 * Premium navbar with centered template name and actions.
 * Subject line has been moved to Email Settings panel.
 * Test button allows selecting a lead to preview variables with REAL data from DB.
 *
 * WORKFLOW:
 * 1. User clicks "Test" button
 * 2. Lead search dialog opens
 * 3. User selects a lead
 * 4. Navbar fetches REAL variable context (custom data, transactions, etc.)
 * 5. Context is stored in email builder state
 * 6. Preview mode uses the real context for interpolation
 *
 * SOURCE OF TRUTH KEYWORDS: EmailBuilderNavbar, BuilderHeader
 */

import { useState, useCallback, useEffect } from 'react'
import {
  Save,
  X,
  Eye,
  EyeOff,
  Undo2,
  Redo2,
  Loader2,
  FlaskConical,
  Send,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useEmailBuilder } from '../_lib/email-builder-context'
import {
  LeadSearchCommand,
  type LeadOption,
} from '@/components/leads/lead-search-command'
import { trpc } from '@/trpc/react-provider'

interface EmailBuilderNavbarProps {
  /** Organization ID for lead selection */
  organizationId?: string
  onSave?: () => void | Promise<void>
  onClose?: () => void
  isSaving?: boolean
}

export function EmailBuilderNavbar({
  organizationId,
  onSave,
  onClose,
  isSaving,
}: EmailBuilderNavbarProps) {
  const { state, actions } = useEmailBuilder()

  // Lead search dialog state for Test button
  const [showLeadSearch, setShowLeadSearch] = useState(false)

  // Get selected lead from context (not local state)
  const selectedLead = state.testLead

  const canUndo = state.historyIndex > 0
  const canRedo = state.historyIndex < state.history.length - 1
  // Subject is now in email settings, so we only need name and blocks to save
  const canSave = state.name.trim() && state.blocks.length > 0

  /**
   * Fetch REAL variable context for the selected test lead.
   * This fetches all lead data including custom fields, transactions, org info, etc.
   * The context is stored in email builder state and used for preview interpolation.
   *
   * SOURCE OF TRUTH KEYWORDS: FetchTestLeadContext, RealVariableData
   */
  const { data: variableContext, isLoading: isLoadingContext } =
    trpc.emailTemplates.getLeadVariableContext.useQuery(
      {
        organizationId: organizationId ?? '',
        leadId: selectedLead?.id ?? '',
      },
      {
        enabled: !!organizationId && !!selectedLead?.id,
        staleTime: 60000, // Cache for 1 minute
      }
    )

  /**
   * When variable context is fetched, store it in the email builder state.
   * This triggers a re-render of the preview with REAL lead data.
   */
  useEffect(() => {
    if (variableContext) {
      actions.setTestVariableContext(variableContext)
    }
  }, [variableContext, actions])

  /**
   * Mutation to send test email to the selected lead.
   * Uses the current template with real variable interpolation.
   */
  const sendTestMutation = trpc.emailTemplates.sendTestEmail.useMutation({
    onSuccess: () => {
      toast.success('Test email sent!', {
        description: `Email sent to ${selectedLead?.email}`,
      })
    },
    onError: (error) => {
      toast.error('Failed to send test email', {
        description: error.message,
      })
    },
  })

  /**
   * Handle lead selection from the command dialog.
   * Sets both the lead info (for UI) and triggers context fetch.
   */
  const handleLeadSelect = useCallback((lead: LeadOption) => {
    // Store lead info in context for UI display
    actions.setTestLead(lead)
    // Clear old variable context - new one will be fetched automatically
    actions.setTestVariableContext(null)
  }, [actions])

  /**
   * Handle Test button click - opens lead search dialog
   */
  const handleTestClick = useCallback(() => {
    setShowLeadSearch(true)
  }, [])

  /**
   * Handle Send Test button click.
   * Sends the current template to the selected test lead with real data interpolation.
   */
  const handleSendTest = useCallback(() => {
    if (!organizationId || !selectedLead) return

    sendTestMutation.mutate({
      organizationId,
      leadId: selectedLead.id,
      subject: state.subject,
      blocks: state.blocks,
      emailSettings: state.emailSettings,
    })
  }, [organizationId, selectedLead, state.subject, state.blocks, state.emailSettings, sendTestMutation])

  const canSendTest = selectedLead && state.blocks.length > 0 && state.subject.trim().length > 0
  const isSendingTest = sendTestMutation.isPending

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-14 border-b border-border/60 bg-sidebar flex items-center px-3 md:px-5 shrink-0">
        {/* Left side - Close button */}
        <div className="flex items-center gap-2 shrink-0">
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          )}

          <Separator orientation="vertical" className="h-6 hidden sm:block" />

          {/* Undo/Redo - moved to left side */}
          <div className="flex items-center bg-muted/50 rounded-md p-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-background"
                  onClick={() => actions.undo()}
                  disabled={!canUndo}
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo (Cmd+Z)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-background"
                  onClick={() => actions.redo()}
                  disabled={!canRedo}
                >
                  <Redo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Redo (Cmd+Shift+Z)</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Center - Template name (centered) */}
        <div className="flex-1 flex items-center justify-center px-4">
          <Input
            value={state.name}
            onChange={(e) => actions.setName(e.target.value)}
            placeholder="Template name..."
            className="h-9 max-w-sm text-sm font-medium text-center bg-background/50 border-border/50 hover:border-border focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Test button - only show if organizationId is provided */}
          {organizationId && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={selectedLead ? 'default' : 'outline'}
                    size="sm"
                    className="h-9 gap-2 px-3"
                    onClick={handleTestClick}
                  >
                    {isLoadingContext ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FlaskConical className="h-4 w-4" />
                    )}
                    <span className="text-sm hidden sm:inline">Test</span>
                    {selectedLead && (
                      <span className="text-xs opacity-70 hidden md:inline">
                        ({selectedLead.firstName || selectedLead.email.split('@')[0]})
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {selectedLead
                    ? `Testing with ${selectedLead.firstName || selectedLead.email.split('@')[0]}'s data`
                    : 'Test with a lead\'s real data'}
                </TooltipContent>
              </Tooltip>

              {/* Send Test Email button - only show when a test lead is selected */}
              {selectedLead && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 gap-2 px-3"
                      onClick={handleSendTest}
                      disabled={!canSendTest || isSendingTest}
                    >
                      {isSendingTest ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      <span className="text-sm hidden sm:inline">Send Test</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Send test email to {selectedLead.email}
                  </TooltipContent>
                </Tooltip>
              )}
            </>
          )}

          {/* Preview toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={state.isPreviewMode ? 'default' : 'outline'}
                size="sm"
                className="h-9 gap-2 px-4"
                onClick={() => actions.togglePreview()}
              >
                {state.isPreviewMode ? (
                  <>
                    <EyeOff className="h-4 w-4" />
                    <span className="text-sm">Edit</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4" />
                    <span className="text-sm">Preview</span>
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle Preview (Cmd+P)</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-6 mx-1" />

          {/* Dirty indicator */}
          {state.isDirty && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 mr-2 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded-md">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span className="font-medium">Unsaved</span>
            </div>
          )}

          {/* Save button */}
          <Button
            size="sm"
            className="h-9 gap-2 px-5 shadow-sm"
            onClick={onSave}
            disabled={isSaving || !canSave}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>Save Template</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Lead Search Command Dialog */}
      {organizationId && (
        <LeadSearchCommand
          organizationId={organizationId}
          open={showLeadSearch}
          onOpenChange={setShowLeadSearch}
          onSelect={handleLeadSelect}
          selectedLeadId={selectedLead?.id}
          title="Select Lead for Testing"
          placeholder="Search leads to test variables..."
        />
      )}
    </TooltipProvider>
  )
}
