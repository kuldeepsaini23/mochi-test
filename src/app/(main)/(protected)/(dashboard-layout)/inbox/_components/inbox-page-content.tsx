'use client'

/**
 * Inbox Page Content - Active Organization Pattern
 *
 * WHY: Main client component orchestrating the inbox UI with real data
 * HOW: Desktop uses 3-panel layout (message list | conversation | lead sheet)
 *      Each panel has rounded corners and fits within the container
 *      Mobile shows single panel at a time with navigation
 *
 * DATA: Uses tRPC to fetch conversations and messages from the database
 *
 * REALTIME: Uses @upstash/realtime for TRUE pub/sub - events fire INSTANTLY
 *           via Redis Streams + SSE, eliminating need for polling
 *
 * OPTIMISTIC UI: Messages appear instantly when sent. Following pattern from
 *                lead-viewer.tsx - local state for immediate updates, server syncs.
 *
 * PAGINATION: MessageView supports bi-directional infinite scroll
 *             - Load messages around focused message (for notification clicks)
 *             - Scroll up for older, scroll down for newer
 *             - Jump to bottom FAB button
 *             Infrastructure is in place via usePaginatedMessages hook.
 *
 * ARCHITECTURE:
 * - Uses useActiveOrganization hook (single source of truth for active org)
 * - Respects domain-first approach (subdomain, custom domain, session)
 * - Permission-based access control via hasPermission helper
 *
 * PERMISSIONS:
 * - submissions:read - Required to view inbox
 *
 * SOURCE OF TRUTH KEYWORDS: InboxPageContent, InboxOrchestrator, ActiveOrganization
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { Button } from '@/components/ui/button'
import { ArrowLeft, AlertCircle, Mail } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { trpc } from '@/trpc/react-provider'
import { useRealtime } from '@/lib/realtime-client'
import { usePaginatedMessages } from '@/hooks/use-paginated-messages'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { permissions } from '@/lib/better-auth/permissions'
import { Skeleton } from '@/components/ui/skeleton'
import {
  InboxMessage,
  Conversation,
  ConversationMessage,
  InboxFilterStatus,
  mapSerializedConversationToInboxMessage,
  mapUIChannelToPrisma,
  MessageChannel,
  SerializedConversation,
} from './types'
import { InboxSidebar } from './inbox-sidebar'
import { MessageView } from './message-view'
import { LeadSheet } from './lead-sheet'
import { NewEmailComposer } from './new-email-composer'

// ============================================================================
// INBOX LOADING SKELETON
// ============================================================================

/**
 * Loading skeleton that matches the inbox 3-panel layout
 * WHY: Provides visual feedback during initial load only
 */
function InboxSkeleton() {
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header skeleton */}
      <div className="border-b px-4 py-3">
        <Skeleton className="h-6 w-32" />
      </div>

      {/* 3-panel layout skeleton */}
      <div className="flex flex-1 min-h-0 p-3 gap-2">
        {/* Left panel - message list */}
        <div className="w-[30%] h-full rounded-xl border p-3 space-y-3">
          <Skeleton className="h-8 w-full" />
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        </div>

        {/* Center panel - conversation */}
        <div className="flex-1 h-full rounded-xl border p-3 space-y-3">
          <div className="flex items-center gap-3 pb-3 border-b">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="flex-1 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                <Skeleton className={`h-20 ${i % 2 === 0 ? 'w-[60%]' : 'w-[50%]'} rounded-lg`} />
              </div>
            ))}
          </div>
        </div>

        {/* Right panel - lead sheet */}
        <div className="w-[25%] h-full rounded-xl border p-3 space-y-3">
          <div className="flex items-center gap-3 pb-3 border-b">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN INBOX PAGE CONTENT COMPONENT
// ============================================================================

export function InboxPageContent() {
  const queryClient = useQueryClient()

  // ============================================================================
  // ORGANIZATION DATA - Using active organization hook
  // ============================================================================

  /**
   * Get active organization from the hook
   * This respects domain-first approach and session activeOrganizationId
   */
  const { activeOrganization, isLoading: isLoadingOrg, hasPermission } = useActiveOrganization()
  const organizationId = activeOrganization?.id ?? ''

  /**
   * Check permission using hook's hasPermission helper
   * Owners have full access, members need explicit permission
   */
  const hasInboxAccess = hasPermission(permissions.SUBMISSIONS_READ)

  // Selected message/conversation state
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [filter, setFilter] = useState<InboxFilterStatus>('all')

  // Compose mode state - when true, show new email composer instead of conversation
  const [isComposing, setIsComposing] = useState(false)

  // Mobile lead sheet visibility - shows lead sheet as overlay on mobile
  const [showMobileLeadSheet, setShowMobileLeadSheet] = useState(false)

  /**
   * Visitor typing indicator state
   * WHY: Show "..." when visitor is typing in chat widget
   * HOW: Track per-conversation, auto-clear after timeout
   */
  const [isVisitorTyping, setIsVisitorTyping] = useState(false)
  const visitorTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  /**
   * Fetch conversations list for sidebar
   * Maps tRPC filter to our InboxFilterStatus
   */
  const {
    data: conversationsData,
    isLoading: isLoadingConversations,
  } = trpc.inbox.list.useQuery({
    organizationId,
    filter: filter === 'unopened' ? 'unread' : 'all',
    limit: 50,
  })

  /**
   * Fetch conversation metadata (lead info, etc.) - needed for MessageView header
   * This is separate from messages because pagination hook handles messages
   */
  const {
    data: conversationMetadata,
  } = trpc.inbox.getConversation.useQuery(
    {
      organizationId,
      conversationId: selectedMessageId || '',
    },
    {
      enabled: !!selectedMessageId,
    }
  )

  /**
   * Fetch email domains to check if any are verified and enabled for sending
   * WHY: Show alert if no email domain is configured for outbound email communication
   * HOW: Query email domains list and check for at least one with VERIFIED status and sendingEnabled
   */
  const { data: emailDomainsData, isLoading: isLoadingEmailDomains } = trpc.emailDomains.list.useQuery(
    { organizationId, pageSize: 50 },
    { enabled: !!organizationId }
  )

  /**
   * Determine if user has a verified email domain for sending
   * WHY: Required to send outbound emails to leads from the inbox
   * NOTE: Returns true during loading to prevent flash of warning banner
   */
  const hasVerifiedEmailDomain = useMemo(() => {
    // During loading, assume true to prevent flash of warning banner
    if (isLoadingEmailDomains || !emailDomainsData?.domains) return true
    return emailDomainsData.domains.some(
      (domain) => domain.status === 'VERIFIED' && domain.sendingEnabled
    )
  }, [isLoadingEmailDomains, emailDomainsData?.domains])

  /**
   * Bi-directional paginated messages using usePaginatedMessages hook
   *
   * WHY: WhatsApp/Messenger-style UX - load messages around focus, scroll for more
   * HOW: Hook manages cursor-based pagination, optimistic UI via tRPC callbacks
   *
   * OPTIMISTIC UI: Uses tRPC onMutate/onError/onSuccess - NO manual state
   */
  const {
    messages: paginatedMessages,
    pagination,
    isLoading: isLoadingMessages,
    isLoadingPrevious,
    isLoadingNext,
    loadPrevious,
    loadNext,
    jumpToLatest,
    sendMessage,
    isSending,
    isAtBottom,
    refetch: refetchMessages,
  } = usePaginatedMessages({
    organizationId,
    conversationId: selectedMessageId || '',
    enabled: !!selectedMessageId,
  })

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  /**
   * Mark conversation as read
   */
  const markAsReadMutation = trpc.inbox.markAsRead.useMutation({
    onSuccess: () => {
      // Invalidate conversations list to update unread status
      queryClient.invalidateQueries({
        queryKey: [['inbox', 'list']],
      })
    },
  })

  /**
   * Toggle star status (unused for now but available)
   */
  // const toggleStarMutation = trpc.inbox.toggleStar.useMutation({
  //   onSuccess: () => {
  //     queryClient.invalidateQueries({
  //       queryKey: [['inbox', 'list']],
  //     })
  //   },
  // })

  /**
   * Team typing indicator mutation
   * WHY: Emit typing event when team member types in reply composer
   * PERFORMANCE: Lightweight mutation - just emits realtime event
   */
  const emitTeamTypingMutation = trpc.inbox.emitTeamTyping.useMutation()

  // ============================================================================
  // REALTIME SUBSCRIPTION - Instant updates via true pub/sub (NO POLLING!)
  // ============================================================================

  /**
   * Subscribe to realtime events for instant inbox updates
   *
   * WHY: True pub/sub via @upstash/realtime - events fire INSTANTLY
   * HOW: Server emits → Redis Streams → SSE → client receives immediately
   *
   * EVENTS SUBSCRIBED:
   * - inbox.emailReceived: New email from a lead
   * - inbox.chatReceived: New chat message from widget visitor
   * - inbox.emailStatusChanged: Email status update (delivered, opened, etc.)
   * - inbox.conversationUpdated: Conversation metadata changed
   * - inbox.sessionMerged: Guest session merged into existing lead
   * - inbox.leadIdentified: Guest provided their info (converted to named lead)
   * - chat.visitorTyping: Visitor is typing in chat widget
   */
  useRealtime({
    events: [
      'inbox.emailReceived',
      'inbox.chatReceived',
      'inbox.emailStatusChanged',
      'inbox.conversationUpdated',
      'inbox.sessionMerged',
      'inbox.leadIdentified',
      'chat.visitorTyping',
    ],
    onData({ event, data }) {
      // Filter events by organization - only process events for this organization
      if (data.organizationId !== organizationId) return

      switch (event) {
        /**
         * Handle incoming email - refresh paginated messages
         * WHY: New email arrived via webhook, need to show it immediately
         */
        case 'inbox.emailReceived':
          queryClient.invalidateQueries({ queryKey: [['inbox', 'list']] })
          if (selectedMessageId === data.conversationId) {
            refetchMessages()
          }
          break

        /**
         * Handle incoming chatbot message from chat widget visitors
         * WHY: Visitor sent message via chat widget, need to show it immediately in inbox
         */
        case 'inbox.chatReceived':
          queryClient.invalidateQueries({ queryKey: [['inbox', 'list']] })
          if (selectedMessageId === data.conversationId) {
            refetchMessages()
          }
          break

        /**
         * Handle email status changes (sent, delivered, opened, failed, bounced)
         * WHY: Webhook fired with status update, need to refresh UI to show new indicator
         */
        case 'inbox.emailStatusChanged':
          if (selectedMessageId === data.conversationId) {
            refetchMessages()
          }
          break

        /**
         * Handle conversation updates (read status, star, etc.)
         */
        case 'inbox.conversationUpdated':
          queryClient.invalidateQueries({ queryKey: [['inbox', 'list']] })
          break

        /**
         * Handle session merge - guest merged into existing lead
         *
         * WHY: When a guest provides email that matches an existing lead,
         *      the anonymous conversation is deleted and messages are merged.
         *      UI needs to:
         *      1. Remove the deleted guest conversation from sidebar
         *      2. Show the merged messages in the target lead's conversation
         *      3. If viewing the deleted conversation, switch to target
         */
        case 'inbox.sessionMerged':
          // Refresh conversation list to remove deleted and update target
          queryClient.invalidateQueries({ queryKey: [['inbox', 'list']] })

          // If user was viewing the deleted conversation, switch to target
          if (selectedMessageId === data.deletedConversationId) {
            setSelectedMessageId(data.targetConversationId)
          } else if (selectedMessageId === data.targetConversationId) {
            // Already viewing target - just refresh to show merged messages
            refetchMessages()
          }
          break

        /**
         * Handle lead identification - guest converted to named lead
         *
         * WHY: When a guest provides their info but email is NEW (not existing),
         *      the anonymous lead is updated with real info.
         *      UI needs to show the updated lead name in sidebar.
         */
        case 'inbox.leadIdentified':
          // Refresh conversation list to show updated lead name
          queryClient.invalidateQueries({ queryKey: [['inbox', 'list']] })

          // If viewing this conversation, refresh to show updated lead info
          if (selectedMessageId === data.conversationId) {
            queryClient.invalidateQueries({ queryKey: [['inbox', 'getConversation']] })
          }
          break

        /**
         * Handle visitor typing indicator
         *
         * WHY: Show "..." when visitor is typing in chat widget
         * HOW: Only show for the currently selected conversation
         *      Auto-clear after 3 seconds if no update
         */
        case 'chat.visitorTyping':
          // Only show typing for the currently selected conversation
          if (selectedMessageId === data.conversationId) {
            if (data.isTyping) {
              setIsVisitorTyping(true)
              // Auto-clear after 3 seconds if no update
              if (visitorTypingTimeoutRef.current) {
                clearTimeout(visitorTypingTimeoutRef.current)
              }
              visitorTypingTimeoutRef.current = setTimeout(() => {
                setIsVisitorTyping(false)
              }, 3000)
            } else {
              setIsVisitorTyping(false)
              if (visitorTypingTimeoutRef.current) {
                clearTimeout(visitorTypingTimeoutRef.current)
              }
            }
          }
          break
      }
    },
  })

  /**
   * Reset typing indicator when switching conversations
   */
  useEffect(() => {
    setIsVisitorTyping(false)
    if (visitorTypingTimeoutRef.current) {
      clearTimeout(visitorTypingTimeoutRef.current)
    }
  }, [selectedMessageId])

  // ============================================================================
  // DERIVED STATE - Transform API data to UI format
  // ============================================================================

  /**
   * Transform conversations from API to InboxMessage format for sidebar
   * WHY: tRPC returns serialized data with string dates, need to convert to UI format
   */
  const messages: InboxMessage[] = useMemo(() => {
    if (!conversationsData?.conversations) return []
    return conversationsData.conversations
      .map((conv) => mapSerializedConversationToInboxMessage(conv as SerializedConversation))
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
  }, [conversationsData?.conversations])

  /**
   * Get currently selected message for sidebar highlighting
   */
  const selectedMessage = useMemo(() => {
    if (!selectedMessageId) return null
    return messages.find((m) => m.id === selectedMessageId) ?? null
  }, [selectedMessageId, messages])

  /**
   * Build selected conversation using paginated messages from hook
   *
   * WHY: paginatedMessages contains both server messages AND optimistic messages
   * HOW: Use pagination hook's messages, sorted chronologically
   */
  const selectedConversation: Conversation | null = useMemo(() => {
    if (!conversationMetadata) return null

    // Map paginated messages to UI format
    const conversationMessages: ConversationMessage[] = paginatedMessages.map((msg) => ({
      id: msg.id,
      channel: msg.channel.toLowerCase() as ConversationMessage['channel'],
      direction: msg.direction.toLowerCase() as 'inbound' | 'outbound',
      body: msg.body,
      bodyHtml: msg.bodyHtml || undefined,
      subject: msg.subject || undefined,
      fromName: msg.fromName || undefined,
      fromEmail: msg.fromEmail || undefined,
      timestamp: typeof msg.sentAt === 'string' ? new Date(msg.sentAt) : msg.sentAt,
      status: msg.status.toLowerCase() as ConversationMessage['status'],
      isRead: msg.isRead,
      attachments: (msg.attachments as Array<{ id: string; filename: string; mimeType: string; size: number; url: string }>) || [],
      isOptimistic: msg.isOptimistic,
    }))

    // Build conversation from metadata + paginated messages
    const conversation: Conversation = {
      id: conversationMetadata.id,
      lead: {
        id: conversationMetadata.lead.id,
        name: conversationMetadata.lead.firstName
          ? `${conversationMetadata.lead.firstName}${conversationMetadata.lead.lastName ? ' ' + conversationMetadata.lead.lastName : ''}`
          : conversationMetadata.lead.email || 'Unknown',
        email: conversationMetadata.lead.email,
        handle: undefined,
        avatar: conversationMetadata.lead.avatarUrl || undefined,
      },
      messages: conversationMessages,
      lastMessage: conversationMessages[conversationMessages.length - 1] || {
        id: '',
        channel: 'email' as const,
        direction: 'inbound' as const,
        body: '',
        timestamp: new Date(),
        isRead: true,
      },
      hasUnread: conversationMessages.some((m) => !m.isRead && m.direction === 'inbound'),
      isStarred: false,
    }

    return conversation
  }, [conversationMetadata, paginatedMessages])

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /**
   * Handle message selection from sidebar
   */
  const handleSelectMessage = useCallback((message: InboxMessage) => {
    setSelectedMessageId(message.conversationId)

    // Mark as read if unread
    if (!message.isRead) {
      markAsReadMutation.mutate({
        organizationId,
        conversationId: message.conversationId,
      })
    }
  }, [organizationId, markAsReadMutation])

  /**
   * Handle sending a reply - OPTIMISTIC UI via tRPC callbacks
   *
   * WHY: Messages appear instantly without waiting for server
   * HOW: sendMessage uses onMutate/onError/onSuccess for proper optimistic UI
   *
   * NO MANUAL STATE - all optimistic updates go through tRPC cache
   */
  const handleSendReply = useCallback((data: {
    channel: MessageChannel
    fromName?: string
    fromEmail?: string
    subject?: string
    body: string
    attachments: File[]
  }) => {
    if (!selectedMessageId) return

    // Call sendMessage from pagination hook - handles optimistic UI via tRPC callbacks
    sendMessage({
      channel: mapUIChannelToPrisma(data.channel),
      body: data.body,
      subject: data.subject,
      fromName: data.fromName,
      fromEmail: data.fromEmail,
    })
  }, [selectedMessageId, sendMessage])

  /**
   * Handle team typing indicator emission
   *
   * WHY: Let visitor know team is typing a response
   * HOW: Emit realtime event when team member types
   * PERFORMANCE: Debouncing handled by caller (ReplyComposer)
   */
  const handleTeamTyping = useCallback((isTyping: boolean) => {
    if (!selectedMessageId) return

    emitTeamTypingMutation.mutate({
      organizationId,
      conversationId: selectedMessageId,
      isTyping,
    })
  }, [organizationId, selectedMessageId, emitTeamTypingMutation])

  /**
   * Handle back button (mobile)
   */
  const handleBack = useCallback(() => {
    setSelectedMessageId(null)
    setShowMobileLeadSheet(false) // Also close lead sheet if open
  }, [])

  /**
   * Handle showing lead sheet on mobile
   * WHY: Mobile only shows one panel at a time, need overlay for lead sheet
   */
  const handleShowMobileLeadSheet = useCallback(() => {
    setShowMobileLeadSheet(true)
  }, [])

  /**
   * Handle closing mobile lead sheet overlay
   */
  const handleCloseMobileLeadSheet = useCallback(() => {
    setShowMobileLeadSheet(false)
  }, [])

  /**
   * Handle filter change
   */
  const handleFilterChange = useCallback((newFilter: InboxFilterStatus) => {
    setFilter(newFilter)
  }, [])

  /**
   * Handle compose button click - enter compose mode
   */
  const handleCompose = useCallback(() => {
    setIsComposing(true)
    setSelectedMessageId(null) // Deselect any conversation
  }, [])

  /**
   * Handle compose cancel - exit compose mode
   */
  const handleCancelCompose = useCallback(() => {
    setIsComposing(false)
  }, [])

  /**
   * Handle email sent - switch to the new conversation
   */
  const handleEmailSent = useCallback((conversationId: string) => {
    setIsComposing(false)
    setSelectedMessageId(conversationId)
    // Refresh the conversation list to show the new one
    queryClient.invalidateQueries({
      queryKey: [['inbox', 'list']],
    })
  }, [queryClient])

  // Auto-mark conversation as read when selected
  useEffect(() => {
    if (selectedMessageId && selectedMessage && !selectedMessage.isRead) {
      markAsReadMutation.mutate({
        organizationId,
        conversationId: selectedMessageId,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMessageId])

  // ============================================================================
  // EARLY RETURNS - Loading state and permission checks
  // ============================================================================

  /**
   * Show skeleton only on initial load
   * WHY: After initial load, cache is populated and isLoadingOrg is false
   * This means re-navigation renders instantly without skeleton
   */
  if (isLoadingOrg && !activeOrganization) {
    return <InboxSkeleton />
  }

  /**
   * No organization found - show error state
   */
  if (!activeOrganization) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2 p-6">
          <p className="text-sm text-muted-foreground">
            No organization found. Please contact your administrator.
          </p>
        </div>
      </div>
    )
  }

  /**
   * Permission denied - show access denied message
   */
  if (!hasInboxAccess) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="max-w-md text-center space-y-2">
          <p className="text-sm text-destructive font-medium">
            You don&apos;t have permission to view the inbox
          </p>
          <p className="text-xs text-muted-foreground">
            Contact your organization owner to grant you the{' '}
            <code className="px-1 py-0.5 bg-muted rounded text-xs">
              submissions:read
            </code>{' '}
            permission.
          </p>
        </div>
      </div>
    )
  }

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Global header with breadcrumbs and theme toggle */}
      <div className="border-b">
        <PageHeader />
      </div>

      {/* Email Domain Setup Alert - shown when no verified email domain exists */}
      {!hasVerifiedEmailDomain && (
        <div className="mx-3 mt-3">
          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-200">
            <Mail className="h-4 w-4 shrink-0" />
            <p>
              Connect your email domain to send emails to leads.{' '}
              <Link
                href="/domains"
                className="font-medium underline underline-offset-4 hover:no-underline"
              >
                Set up Email Domain
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* Desktop layout: 3-panel resizable layout (hidden on mobile) */}
      <div className="hidden md:flex flex-1 min-h-0 p-3">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Left panel - message list */}
          <ResizablePanel defaultSize={30} minSize={5} maxSize={35} className="overflow-hidden">
            <div className="h-full rounded-xl border overflow-hidden">
              <InboxSidebar
                messages={messages}
                selectedMessageId={selectedMessage?.id ?? null}
                onSelectMessage={handleSelectMessage}
                isLoading={isLoadingConversations}
                filter={filter}
                onFilterChange={handleFilterChange}
                onCompose={handleCompose}
              />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className="bg-transparent w-2 mx-0.5" />

          {/* Center panel - conversation view or compose mode */}
          <ResizablePanel defaultSize={50} minSize={30}>
            <div className="h-full rounded-xl border overflow-hidden">
              {isComposing ? (
                <NewEmailComposer
                  organizationId={organizationId}
                  onSent={handleEmailSent}
                  onCancel={handleCancelCompose}
                />
              ) : (
                <MessageView
                  message={selectedMessage}
                  conversation={selectedConversation}
                  onSendReply={handleSendReply}
                  isLoading={isLoadingMessages}
                  isSending={isSending}
                  isVisitorTyping={isVisitorTyping}
                  onTeamTyping={handleTeamTyping}
                  // Pagination props for bi-directional infinite scroll
                  hasPrevious={pagination.hasPrevious}
                  hasNext={pagination.hasNext}
                  isLoadingPrevious={isLoadingPrevious}
                  isLoadingNext={isLoadingNext}
                  loadPrevious={loadPrevious}
                  loadNext={loadNext}
                  jumpToLatest={jumpToLatest}
                  isAtBottom={isAtBottom}
                  // Focus message for scroll positioning (notification clicks, etc.)
                  focusMessageId={pagination.focusMessageId}
                />
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className="bg-transparent w-2 mx-0.5" />

          {/* Right panel - lead sheet */}
          <ResizablePanel defaultSize={30} minSize={15} maxSize={40}>
            <div className="h-full rounded-xl border overflow-hidden">
              <LeadSheet
                leadId={selectedMessage?.sender.id ?? null}
                organizationId={organizationId}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Mobile layout: Show either list, compose, message, or lead sheet (visible only on mobile) */}
      <div className="flex md:hidden flex-1 min-h-0 p-3">
        <div className="w-full h-full rounded-xl border bg-background overflow-hidden">
          {showMobileLeadSheet && selectedMessage ? (
            // Show lead sheet when user taps lead icon
            <div className="flex flex-col h-full bg-sidebar">
              {/* Header with back button - matches message view header style */}
              <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 -ml-2"
                  onClick={handleCloseMobileLeadSheet}
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <span className="text-sm font-medium">Lead Info</span>
              </div>
              {/* Lead sheet content */}
              <div className="flex-1 overflow-hidden">
                <LeadSheet
                  leadId={selectedMessage.sender.id}
                  organizationId={organizationId}
                />
              </div>
            </div>
          ) : isComposing ? (
            // Show compose view
            <NewEmailComposer
              organizationId={organizationId}
              onSent={handleEmailSent}
              onCancel={handleCancelCompose}
            />
          ) : selectedMessage ? (
            // Show conversation view with back button when message selected
            <MessageView
              message={selectedMessage}
              conversation={selectedConversation}
              onSendReply={handleSendReply}
              onBack={handleBack}
              showBackButton
              isLoading={isLoadingMessages}
              isSending={isSending}
              onShowLeadSheet={handleShowMobileLeadSheet}
              isVisitorTyping={isVisitorTyping}
              onTeamTyping={handleTeamTyping}
              // Pagination props for bi-directional infinite scroll
              hasPrevious={pagination.hasPrevious}
              hasNext={pagination.hasNext}
              isLoadingPrevious={isLoadingPrevious}
              isLoadingNext={isLoadingNext}
              loadPrevious={loadPrevious}
              loadNext={loadNext}
              jumpToLatest={jumpToLatest}
              isAtBottom={isAtBottom}
              // Focus message for scroll positioning (notification clicks, etc.)
              focusMessageId={pagination.focusMessageId}
            />
          ) : (
            // Show inbox list when no message selected
            <InboxSidebar
              messages={messages}
              selectedMessageId={null}
              onSelectMessage={handleSelectMessage}
              isLoading={isLoadingConversations}
              filter={filter}
              onFilterChange={handleFilterChange}
              onCompose={handleCompose}
              className="w-full"
            />
          )}
        </div>
      </div>
    </div>
  )
}
