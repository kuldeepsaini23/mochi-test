'use client'

/**
 * New Email Composer Component
 *
 * WHY: Allow users to compose and send new emails to leads
 * HOW: Uses LeadSearchCommand for lead selection, email fields, and sends via tRPC
 *
 * FEATURES:
 * - Uses reusable LeadSearchCommand for lead selection
 * - Full email composition (from, to, subject, body)
 * - Template selection
 * - Attachment support (future)
 * - Creates conversation automatically if needed
 *
 * SOURCE OF TRUTH KEYWORDS: NewEmailComposer, ComposeEmail
 */

import { useState, useCallback } from 'react'
import {
  Mail,
  Send,
  X,
  Loader2,
  Search,
  FileText,
  ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { trpc } from '@/trpc/react-provider'
import { trackEvent, CLARITY_EVENTS } from '@/lib/clarity/events'
import {
  LeadSearchCommand,
  type LeadOption,
} from '@/components/leads/lead-search-command'
import type { EmailBlock } from '@/types/email-templates'

/**
 * Get initials from name for avatar fallback
 */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/**
 * Get display name from lead first/last name
 */
function getDisplayName(lead: LeadOption): string {
  const parts = [lead.firstName, lead.lastName].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : lead.email.split('@')[0]
}

/**
 * Selected lead display chip
 */
function SelectedLeadChip({
  lead,
  onRemove,
}: {
  lead: LeadOption
  onRemove: () => void
}) {
  const displayName = getDisplayName(lead)
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 text-primary text-sm">
      <Avatar className="size-5">
        <AvatarImage src={lead.avatarUrl ?? undefined} alt={displayName} />
        <AvatarFallback className="text-[8px] font-medium bg-primary/20">
          {getInitials(displayName)}
        </AvatarFallback>
      </Avatar>
      <span className="font-medium">{displayName}</span>
      <span className="text-muted-foreground text-xs">&lt;{lead.email}&gt;</span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 hover:text-destructive transition-colors"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

interface NewEmailComposerProps {
  organizationId: string
  /** Pre-select a specific lead (used when composing from lead sheet) */
  defaultLeadId?: string
  /** Callback when email is sent successfully */
  onSent?: (conversationId: string) => void
  /** Callback to close/cancel the composer */
  onCancel?: () => void
  /** Additional className */
  className?: string
}

export function NewEmailComposer({
  organizationId,
  defaultLeadId,
  onSent,
  onCancel,
  className,
}: NewEmailComposerProps) {
  // Lead selection state - now uses LeadSearchCommand
  const [selectedLead, setSelectedLead] = useState<LeadOption | null>(null)
  const [showLeadSearch, setShowLeadSearch] = useState(false)

  /**
   * Fetch the default lead if provided (used when composing from lead sheet)
   * WHY: Pre-select the lead when opening composer from a lead's context
   */
  const { data: defaultLeadData } = trpc.leads.getById.useQuery(
    { organizationId, leadId: defaultLeadId || '' },
    {
      enabled: !!defaultLeadId && !selectedLead,
    }
  )

  // Auto-select the default lead when data is loaded
  if (defaultLeadData && !selectedLead && defaultLeadId) {
    // Only set if we have valid data and haven't selected anything yet
    const leadOption: LeadOption = {
      id: defaultLeadData.id,
      firstName: defaultLeadData.firstName,
      lastName: defaultLeadData.lastName,
      email: defaultLeadData.email,
      phone: defaultLeadData.phone,
      avatarUrl: defaultLeadData.avatarUrl,
    }
    setSelectedLead(leadOption)
  }

  // Form state
  const [fromName, setFromName] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  // Send email mutation
  const sendEmailMutation = trpc.inbox.sendNewEmail.useMutation()

  // Fetch email templates
  const { data: templatesData } = trpc.emailTemplates.list.useQuery(
    {
      organizationId,
      page: 1,
      pageSize: 50,
    },
    {
      staleTime: 60000, // 1 minute
    }
  )

  /**
   * Reset the form to initial state
   */
  const resetForm = useCallback(() => {
    setSelectedLead(null)
    setFromName('')
    setFromEmail('')
    setSubject('')
    setBody('')
  }, [])

  /**
   * Handle lead selection from LeadSearchCommand
   */
  const handleLeadSelect = useCallback((lead: LeadOption) => {
    setSelectedLead(lead)
  }, [])

  /**
   * Handle template selection
   * WHY: Applies template subject and body to the composer
   * HOW: Extracts text from blocks and populates fields
   */
  const handleApplyTemplate = useCallback(
    (template: { subject: string; content: EmailBlock[] }) => {
      // Set subject from template
      setSubject(template.subject)

      // Extract plain text from blocks
      const textContent = template.content
        .map((block) => {
          switch (block.type) {
            case 'heading':
              return block.props.text
            case 'text':
              return block.props.text
            case 'button':
              return `[${block.props.text}](${block.props.href})`
            case 'divider':
              return '---'
            case 'spacer':
              return ''
            case 'image':
              return block.props.alt ? `[Image: ${block.props.alt}]` : ''
            default:
              return ''
          }
        })
        .filter(Boolean)
        .join('\n\n')

      setBody(textContent)
    },
    []
  )

  /**
   * Handle send email
   * WHY: Sends email and handles success/error states
   */
  const handleSend = useCallback(async () => {
    if (!selectedLead || !subject.trim() || !body.trim() || !fromName.trim() || !fromEmail.trim()) return

    try {
      const result = await sendEmailMutation.mutateAsync({
        organizationId,
        leadId: selectedLead.id,
        subject: subject.trim(),
        body: body.trim(),
        fromName: fromName.trim(),
        fromEmail: fromEmail.trim(),
      })

      /**
       * Check for email delivery failure returned from the server
       * WHY: Resend errors (e.g., domain not found, domain not verified) are returned
       * as { success: false, error: "..." } instead of throwing, so we must check explicitly.
       * Without this, domain-related failures silently appear to succeed.
       */
      if (!result.success || !result.emailSent) {
        const errorMsg =
          'error' in result && typeof result.error === 'string'
            ? result.error
            : 'The email could not be delivered. Please check your sender domain is verified.'
        toast.error('Email failed to send', {
          description: errorMsg,
        })
        return
      }

      // Handle success - navigate to conversation and reset form
      if (result.conversation) {
        trackEvent(CLARITY_EVENTS.EMAIL_SENT)
        onSent?.(result.conversation.id)
        resetForm()
      }
    } catch (error) {
      toast.error('Failed to send email', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      })
    }
  }, [
    organizationId,
    selectedLead,
    subject,
    body,
    fromName,
    fromEmail,
    sendEmailMutation,
    onSent,
    resetForm,
  ])

  /** All fields including sender name and email must be filled to send */
  const canSend =
    selectedLead &&
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    fromName.trim().length > 0 &&
    fromEmail.trim().length > 0
  const isSending = sendEmailMutation.isPending

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          <Mail className="size-5 text-primary" />
          <span className="text-sm font-medium">New Email</span>
        </div>
        {onCancel && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onCancel}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      {/* Email form */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* To field with lead search */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">To</label>
          {selectedLead ? (
            <SelectedLeadChip
              lead={selectedLead}
              onRemove={() => setSelectedLead(null)}
            />
          ) : (
            <Button
              variant="outline"
              className="w-full justify-start gap-2 h-10 text-muted-foreground font-normal"
              onClick={() => setShowLeadSearch(true)}
            >
              <Search className="size-4" />
              <span>Search leads by name or email...</span>
            </Button>
          )}
        </div>

        {/* From fields (required for outbound emails) */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              From Name <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="Your name"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              From Email <span className="text-destructive">*</span>
            </label>
            <Input
              type="email"
              placeholder="you@example.com"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
            />
          </div>
        </div>

        {/* Template Selector */}
        {templatesData?.templates && templatesData.templates.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Template (optional)
            </label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <FileText className="size-4" />
                    Choose a template...
                  </span>
                  <ChevronDown className="size-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[300px]" align="start">
                <DropdownMenuLabel>Email Templates</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {templatesData.templates.map((template) => (
                  <DropdownMenuItem
                    key={template.id}
                    onClick={() =>
                      handleApplyTemplate({
                        subject: template.subject,
                        content: template.content,
                      })
                    }
                    className="flex flex-col items-start gap-0.5"
                  >
                    <span className="font-medium">{template.name}</span>
                    <span className="text-xs text-muted-foreground line-clamp-1">
                      {template.subject}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Subject */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Subject
          </label>
          <Input
            placeholder="Email subject..."
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        {/* Body */}
        <div className="space-y-2 flex-1">
          <label className="text-sm font-medium text-muted-foreground">
            Message
          </label>
          <Textarea
            placeholder="Write your message..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-[200px] resize-none"
          />
        </div>
      </div>

      {/* Footer with actions */}
      <div className="flex items-center justify-between px-4 py-3 border-t shrink-0">
        <div className="text-xs text-muted-foreground">
          {selectedLead && (
            <span>
              Sending to: <span className="font-medium">{selectedLead.email}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={isSending}
            >
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!canSend || isSending}
            onClick={handleSend}
          >
            {isSending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {isSending ? 'Sending...' : 'Send Email'}
          </Button>
        </div>
      </div>

      {/* Error display */}
      {sendEmailMutation.error && (
        <div className="px-4 pb-3">
          <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
            Failed to send email. Please try again.
          </div>
        </div>
      )}

      {/* Lead Search Command Dialog */}
      <LeadSearchCommand
        organizationId={organizationId}
        open={showLeadSearch}
        onOpenChange={setShowLeadSearch}
        onSelect={handleLeadSelect}
        selectedLeadId={selectedLead?.id}
        title="Select Recipient"
        placeholder="Search leads by name or email..."
      />
    </div>
  )
}
