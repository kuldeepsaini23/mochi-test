'use client'

/**
 * Lead Conversation Component
 *
 * WHY: Reusable component for displaying and managing a conversation with a specific lead
 * HOW: Fetches conversations for a lead, allows viewing and sending messages
 *
 * USAGE:
 * - Lead Sheet Communications Tab: Shows all communications with this lead
 * - Pipeline Ticket Sheet: View/send messages in ticket context
 *
 * This component wraps the existing inbox components (MessageView, etc.) with
 * data fetching logic specific to a single lead.
 *
 * SOURCE OF TRUTH KEYWORDS: LeadConversation, LeadInbox, ReusableInbox
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { MessageSquare, Mail, Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/trpc/react-provider'
import { Button } from '@/components/ui/button'
import {
  Conversation,
  InboxMessage,
  mapSerializedConversationToInboxMessage,
  mapSerializedConversationToUI,
  mapUIChannelToPrisma,
  MessageChannel,
  SerializedConversation,
} from '@/app/(main)/(protected)/(dashboard-layout)/inbox/_components/types'
import { MessageView } from '@/app/(main)/(protected)/(dashboard-layout)/inbox/_components/message-view'
import { NewEmailComposer } from '@/app/(main)/(protected)/(dashboard-layout)/inbox/_components/new-email-composer'

interface LeadConversationProps {
  /** The organization ID for context */
  organizationId: string
  /** The lead ID to fetch conversations for */
  leadId: string
  /** The lead's name for display in empty state */
  leadName?: string
  /** The lead's email for composing new messages */
  leadEmail?: string
  /** Custom class name for the container */
  className?: string
}

/**
 * Empty state when no conversation exists with this lead
 * Shows a call to action to start a conversation
 */
function EmptyConversationState({
  leadName,
  onCompose,
}: {
  leadName?: string
  onCompose: () => void
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-sm">
        <div className="mx-auto w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
          <MessageSquare className="size-8 text-muted-foreground/40" />
        </div>
        <div className="space-y-2">
          <h3 className="font-medium text-foreground">No conversations yet</h3>
          <p className="text-sm text-muted-foreground">
            {leadName
              ? `Start a conversation with ${leadName} to see messages here.`
              : 'Start a conversation to see messages here.'}
          </p>
        </div>
        <Button onClick={onCompose} size="sm" className="gap-2">
          <Mail className="size-4" />
          Send Email
        </Button>
      </div>
    </div>
  )
}

/**
 * Loading state while fetching conversations
 */
function LoadingState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

export function LeadConversation({
  organizationId,
  leadId,
  leadName,
  leadEmail,
  className,
}: LeadConversationProps) {
  const queryClient = useQueryClient()

  // Track selected conversation (if multiple exist for this lead)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)

  // Compose mode state - when true, show new email composer
  const [isComposing, setIsComposing] = useState(false)

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  /**
   * Fetch conversations for this specific lead
   * Using the leadId filter we added to listConversations
   */
  const {
    data: conversationsData,
    isLoading: isLoadingConversations,
  } = trpc.inbox.list.useQuery({
    organizationId,
    leadId, // Filter to only get conversations for this lead
    filter: 'all',
    limit: 50,
  })

  /**
   * Fetch the selected conversation with full message history
   */
  const {
    data: selectedConversationData,
    isLoading: isLoadingConversation,
  } = trpc.inbox.getConversation.useQuery(
    {
      organizationId,
      conversationId: selectedConversationId || '',
    },
    {
      enabled: !!selectedConversationId,
    }
  )

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  /**
   * Mark conversation as read when selected
   */
  const markAsReadMutation = trpc.inbox.markAsRead.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [['inbox', 'list']],
      })
    },
  })

  /**
   * Send message in a conversation
   * WHY: Resend errors (e.g., domain not found, domain not verified) are returned
   * as { success: false, error: "..." } instead of throwing, so we check explicitly.
   */
  const sendMessageMutation = trpc.inbox.sendMessage.useMutation({
    onSuccess: (data: { success: boolean; emailSent?: boolean; error?: string }) => {
      if (!data.success) {
        const errorMsg = data.error || 'The email could not be delivered. Please check your sender domain is verified.'
        toast.error('Email failed to send', { description: errorMsg })
      }

      // Invalidate conversation to show new message
      if (selectedConversationId) {
        queryClient.invalidateQueries({
          queryKey: [['inbox', 'getConversation']],
        })
      }
      // Also refresh the list
      queryClient.invalidateQueries({
        queryKey: [['inbox', 'list']],
      })
    },
  })

  // ============================================================================
  // DERIVED STATE
  // ============================================================================

  /**
   * Transform conversations from API to UI format
   */
  const messages: InboxMessage[] = useMemo(() => {
    if (!conversationsData?.conversations) return []
    return conversationsData.conversations
      .map((conv) => mapSerializedConversationToInboxMessage(conv as SerializedConversation))
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
  }, [conversationsData?.conversations])

  /**
   * Get the selected message for highlighting
   */
  const selectedMessage = useMemo(() => {
    if (!selectedConversationId) return null
    return messages.find((m) => m.id === selectedConversationId) ?? null
  }, [selectedConversationId, messages])

  /**
   * Transform selected conversation to UI format
   */
  const selectedConversation: Conversation | null = useMemo(() => {
    if (!selectedConversationData) return null
    return mapSerializedConversationToUI(selectedConversationData as SerializedConversation)
  }, [selectedConversationData])

  // ============================================================================
  // AUTO-SELECT FIRST CONVERSATION
  // ============================================================================

  /**
   * Automatically select the first/most recent conversation when data loads
   */
  useEffect(() => {
    if (messages.length > 0 && !selectedConversationId && !isComposing) {
      setSelectedConversationId(messages[0].conversationId)
    }
  }, [messages, selectedConversationId, isComposing])

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /**
   * Handle sending a reply
   */
  const handleSendReply = useCallback((data: {
    channel: MessageChannel
    fromName?: string
    fromEmail?: string
    subject?: string
    body: string
    attachments: File[]
  }) => {
    if (!selectedConversationId) return

    sendMessageMutation.mutate({
      organizationId,
      conversationId: selectedConversationId,
      channel: mapUIChannelToPrisma(data.channel),
      body: data.body,
      subject: data.subject,
      fromName: data.fromName || undefined,
      fromEmail: data.fromEmail || undefined,
    })
  }, [organizationId, selectedConversationId, sendMessageMutation])

  /**
   * Handle compose button click - enter compose mode
   */
  const handleCompose = useCallback(() => {
    setIsComposing(true)
    setSelectedConversationId(null)
  }, [])

  /**
   * Handle compose cancel - exit compose mode
   */
  const handleCancelCompose = useCallback(() => {
    setIsComposing(false)
    // Re-select first conversation if any exist
    if (messages.length > 0) {
      setSelectedConversationId(messages[0].conversationId)
    }
  }, [messages])

  /**
   * Handle email sent - switch to the new conversation
   */
  const handleEmailSent = useCallback((conversationId: string) => {
    setIsComposing(false)
    setSelectedConversationId(conversationId)
    // Refresh the conversation list
    queryClient.invalidateQueries({
      queryKey: [['inbox', 'list']],
    })
  }, [queryClient])

  /**
   * Mark conversation as read when selected
   */
  useEffect(() => {
    if (selectedConversationId && selectedMessage && !selectedMessage.isRead) {
      markAsReadMutation.mutate({
        organizationId,
        conversationId: selectedConversationId,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversationId])

  // ============================================================================
  // RENDER
  // ============================================================================

  // Show loading state while fetching conversations
  if (isLoadingConversations) {
    return (
      <div className={className}>
        <LoadingState />
      </div>
    )
  }

  // Show compose mode if composing
  if (isComposing) {
    return (
      <div className={className}>
        <NewEmailComposer
          organizationId={organizationId}
          defaultLeadId={leadId}
          onSent={handleEmailSent}
          onCancel={handleCancelCompose}
        />
      </div>
    )
  }

  // Show empty state if no conversations exist for this lead
  if (messages.length === 0) {
    return (
      <div className={className}>
        <EmptyConversationState
          leadName={leadName}
          onCompose={handleCompose}
        />
      </div>
    )
  }

  // Show the conversation with the newest first (already selected automatically)
  return (
    <div className={className}>
      {/* If multiple conversations exist, show a mini selector */}
      {messages.length > 1 && (
        <div className="border-b px-3 py-2 flex items-center justify-between bg-muted/30">
          <span className="text-xs text-muted-foreground">
            {messages.length} conversations
          </span>
          <div className="flex gap-1">
            {messages.slice(0, 3).map((msg) => (
              <Button
                key={msg.id}
                variant={selectedConversationId === msg.conversationId ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => setSelectedConversationId(msg.conversationId)}
              >
                {msg.subject?.slice(0, 15) || 'Conversation'}
                {msg.subject && msg.subject.length > 15 && '...'}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Message View - the main conversation display (no delete - view/send only) */}
      <MessageView
        message={selectedMessage}
        conversation={selectedConversation}
        onSendReply={handleSendReply}
        isLoading={isLoadingConversation}
        isSending={sendMessageMutation.isPending}
      />
    </div>
  )
}
