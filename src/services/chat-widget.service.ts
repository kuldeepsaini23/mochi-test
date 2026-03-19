/**
 * Chat Widget Service (DAL)
 *
 * Data Access Layer for chat widget operations.
 * This is the ONLY place that should interact with Prisma for chat widgets.
 *
 * tRPC routers call these functions after security checks.
 *
 * SOURCE OF TRUTH: ChatWidget, ChatWidgetFAQ, ChatWidgetUpdate, Organization
 */

import 'server-only'
import { prisma } from '@/lib/config'
import { Prisma } from '@/generated/prisma'
import { logActivity, logActivities } from './activity-log.service'

// ============================================================================
// TYPES - SOURCE OF TRUTH
// ============================================================================

export type ChatWidgetCreateInput = {
  organizationId: string
  name: string
  description?: string | null
}

export type ChatWidgetUpdateInput = {
  name?: string
  description?: string | null
}

/**
 * Gradient config type matching zod schema (angle is optional)
 */
type GradientConfig = {
  type: string
  angle?: number
  stops: Array<{ color: string; position: number }>
} | null | undefined

/**
 * Chat widget config structure stored as JSON
 * Matches ChatWidgetConfig type from chat-widget-theme-context.tsx
 * SOURCE OF TRUTH: ChatWidgetConfigJson
 */
export type ChatWidgetConfigJson = {
  theme?: {
    mode: 'light' | 'dark'
    primaryText: string
    primaryTextGradient?: GradientConfig
    secondaryText: string
    secondaryTextGradient?: GradientConfig
    background: string
    backgroundGradient?: GradientConfig
    secondaryBackground: string
    accent: string
    accentGradient?: GradientConfig
    border: string
  }
  behavior?: {
    autoOpen: boolean
    enableSounds: boolean
    showBranding: boolean
  }
  toggle?: {
    type: 'image' | 'icon'
    image?: string | null
    icon?: string | null
  }
  welcomePage?: {
    title: string
    subtitle: string
  }
}

export type FAQItemCreateInput = {
  chatWidgetId: string
  question: string
  answer: string
  sortOrder?: number
}

export type FAQItemUpdateInput = {
  question?: string
  answer?: string
  sortOrder?: number
}

export type UpdateItemCreateInput = {
  chatWidgetId: string
  title: string
  content: string
  featuredImage?: string | null
  featuredImageFileId?: string | null
}

export type UpdateItemUpdateInput = {
  title?: string
  content?: string
  featuredImage?: string | null
  featuredImageFileId?: string | null
}

// ============================================================================
// CHAT WIDGET CRUD OPERATIONS
// ============================================================================

/**
 * List chat widgets with pagination and search
 * WHY: Main query for chat widget list page
 */
export async function listChatWidgets({
  organizationId,
  search,
  page = 1,
  pageSize = 10,
}: {
  organizationId: string
  search?: string
  page?: number
  pageSize?: number
}) {
  const skip = (page - 1) * pageSize

  const where: Prisma.ChatWidgetWhereInput = {
    organizationId,
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ],
    }),
  }

  const [chatWidgets, total] = await Promise.all([
    prisma.chatWidget.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.chatWidget.count({ where }),
  ])

  return {
    chatWidgets,
    total,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Get a chat widget by ID with all related data
 * WHY: For chat widget detail/edit page - loads everything needed
 */
export async function getChatWidgetById(
  organizationId: string,
  chatWidgetId: string
) {
  return prisma.chatWidget.findFirst({
    where: {
      id: chatWidgetId,
      organizationId,
    },
    include: {
      faqItems: {
        orderBy: { sortOrder: 'asc' },
      },
      updates: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })
}

/**
 * Create a new chat widget with default config
 * WHY: Users create chat widgets for customer support
 *
 * On creation, we fetch the org logo and set it as the initial toggle image.
 * This avoids runtime fallback logic - the logo is saved directly to config.
 *
 * @param input - Chat widget creation data
 * @param userId - Optional user ID for activity logging
 */
export async function createChatWidget(input: ChatWidgetCreateInput, userId?: string) {
  // Fetch organization to get logo for initial toggle config
  const organization = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { logo: true },
  })

  // Build initial config with toggle set to org logo (if available)
  // If no org logo, defaults to icon mode with 'message-circle'
  const initialConfig: ChatWidgetConfigJson = {
    toggle: organization?.logo
      ? { type: 'image', image: organization.logo, icon: 'message-circle' }
      : { type: 'icon', image: null, icon: 'message-circle' },
  }

  // Default FAQ items to bootstrap the help page
  const defaultFAQs = [
    {
      question: 'How do I get started?',
      answer: 'Simply click on "Start a conversation" from the home screen to begin chatting with our team.',
      sortOrder: 0,
    },
    {
      question: 'What are your support hours?',
      answer: 'Our team is available Monday to Friday, 9am to 6pm EST. We typically respond within a few hours.',
      sortOrder: 1,
    },
    {
      question: 'How can I track my request?',
      answer: 'All conversations are saved in your chat history. You can return anytime to check for updates.',
      sortOrder: 2,
    },
    {
      question: 'Can I speak to a human?',
      answer: 'Yes! Our AI assistant can connect you with a human agent whenever you need more personalized help.',
      sortOrder: 3,
    },
  ]

  const chatWidget = await prisma.chatWidget.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      description: input.description,
      config: initialConfig,
      faqItems: {
        create: defaultFAQs,
      },
    },
    include: {
      faqItems: {
        orderBy: { sortOrder: 'asc' },
      },
      updates: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  // Log activity for audit trail
  if (userId) {
    logActivity({
      userId,
      organizationId: input.organizationId,
      action: 'create',
      entity: 'chat_widget',
      entityId: chatWidget.id,
    })
  }

  return chatWidget
}

/**
 * Update a chat widget's basic info
 * WHY: Edit chat widget name or description
 *
 * @param organizationId - Organization ID for activity logging
 * @param chatWidgetId - Chat widget ID to update
 * @param data - Update data
 * @param userId - Optional user ID for activity logging
 */
export async function updateChatWidget(
  organizationId: string,
  chatWidgetId: string,
  data: ChatWidgetUpdateInput,
  userId?: string
) {
  const chatWidget = await prisma.chatWidget.update({
    where: { id: chatWidgetId },
    data,
  })

  // Log activity for audit trail
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'chat_widget',
      entityId: chatWidget.id,
    })
  }

  return chatWidget
}

/**
 * Update a chat widget's config (theme, behavior, welcome page)
 * WHY: Save customization settings as user makes changes
 *
 * @param organizationId - Organization ID for activity logging
 * @param chatWidgetId - Chat widget ID to update
 * @param config - New config data
 * @param userId - Optional user ID for activity logging
 */
export async function updateChatWidgetConfig(
  organizationId: string,
  chatWidgetId: string,
  config: ChatWidgetConfigJson,
  userId?: string
) {
  const chatWidget = await prisma.chatWidget.update({
    where: { id: chatWidgetId },
    data: { config },
  })

  // Log activity for audit trail
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'chat_widget',
      entityId: chatWidget.id,
    })
  }

  return chatWidget
}

/**
 * Update a chat widget's allowed domains for embed security
 *
 * WHY: Control which external websites can embed this chat widget
 * HOW: Stores array of domain patterns that are validated against referrer/origin
 *
 * Domain patterns:
 * - "example.com" - exact match
 * - "*.example.com" - wildcard subdomain match
 * - Empty array = not embeddable externally
 *
 * SOURCE OF TRUTH: ChatWidgetAllowedDomains, EmbedSecurity
 *
 * @param organizationId - Organization ID for activity logging
 * @param chatWidgetId - Chat widget ID to update
 * @param allowedDomains - Array of domain patterns
 * @param userId - Optional user ID for activity logging
 */
export async function updateAllowedDomains(
  organizationId: string,
  chatWidgetId: string,
  allowedDomains: string[],
  userId?: string
) {
  // NOTE: allowedDomains is a new field - run `npx prisma generate` if types are missing
  const chatWidget = await prisma.chatWidget.update({
    where: { id: chatWidgetId },
    data: { allowedDomains } as Prisma.ChatWidgetUpdateInput,
  })

  // Log activity for audit trail
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'chat_widget',
      entityId: chatWidget.id,
    })
  }

  return chatWidget
}

/**
 * Validate if an origin is allowed to embed this widget
 *
 * WHY: Security check before serving the embed script
 * HOW: Compare request origin against widget's allowedDomains list
 *
 * SOURCE OF TRUTH: EmbedOriginValidation, ChatWidgetSecurity
 */
export function isOriginAllowed(origin: string, allowedDomains: string[]): boolean {
  if (!origin || allowedDomains.length === 0) {
    return false
  }

  try {
    // Extract hostname from origin URL
    const url = new URL(origin)
    const hostname = url.hostname.toLowerCase()

    for (const pattern of allowedDomains) {
      const normalizedPattern = pattern.toLowerCase().trim()

      // Wildcard pattern: *.example.com
      if (normalizedPattern.startsWith('*.')) {
        const baseDomain = normalizedPattern.slice(2) // Remove "*."
        // Match the base domain itself or any subdomain
        if (hostname === baseDomain || hostname.endsWith('.' + baseDomain)) {
          return true
        }
      }
      // Exact match
      else if (hostname === normalizedPattern) {
        return true
      }
    }
  } catch {
    // Invalid origin URL
    return false
  }

  return false
}

/**
 * Get chat widget for embed validation
 *
 * WHY: Quick lookup for embed security validation
 * HOW: Fetches widget with allowedDomains and config for serving embed
 *
 * SOURCE OF TRUTH: ChatWidgetEmbedLookup
 */
export async function getWidgetForEmbed(organizationId: string, chatWidgetId: string) {
  // NOTE: allowedDomains is a new field - run `npx prisma generate` if types are missing
  const widget = await prisma.chatWidget.findFirst({
    where: {
      id: chatWidgetId,
      organizationId,
    },
  })

  if (!widget) return null

  // Return widget with allowedDomains typed as unknown for compatibility
  return {
    id: widget.id,
    organizationId: widget.organizationId,
    name: widget.name,
    config: widget.config,
    // Access allowedDomains via indexed access to avoid type error until prisma generate
    allowedDomains: (widget as Record<string, unknown>).allowedDomains as string[] | null,
  }
}

/**
 * Delete a chat widget (hard delete)
 * WHY: Remove chat widget completely - cascades to FAQ and updates
 *
 * @param organizationId - Organization ID for activity logging
 * @param chatWidgetId - Chat widget ID to delete
 * @param userId - Optional user ID for activity logging
 */
export async function deleteChatWidget(
  organizationId: string,
  chatWidgetId: string,
  userId?: string
) {
  const chatWidget = await prisma.chatWidget.delete({
    where: { id: chatWidgetId },
  })

  // Log activity for audit trail
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'delete',
      entity: 'chat_widget',
      entityId: chatWidgetId,
    })
  }

  return chatWidget
}

/**
 * Bulk delete chat widgets (hard delete)
 * WHY: Delete multiple chat widgets at once from list view
 *
 * @param organizationId - Organization ID for activity logging
 * @param chatWidgetIds - Array of chat widget IDs to delete
 * @param userId - Optional user ID for activity logging
 */
export async function bulkDeleteChatWidgets(
  organizationId: string,
  chatWidgetIds: string[],
  userId?: string
) {
  const result = await prisma.chatWidget.deleteMany({
    where: { id: { in: chatWidgetIds } },
  })

  // Log activities for each deleted chat widget
  if (userId && chatWidgetIds.length > 0) {
    logActivities(
      chatWidgetIds.map((id) => ({
        userId,
        organizationId,
        action: 'delete' as const,
        entity: 'chat_widget',
        entityId: id,
      }))
    )
  }

  return result
}

// ============================================================================
// FAQ ITEM CRUD OPERATIONS
// ============================================================================

/**
 * Create a new FAQ item
 * WHY: Add FAQ to help page
 */
export async function createFAQItem(input: FAQItemCreateInput) {
  // Get current max sortOrder
  const maxSort = await prisma.chatWidgetFAQ.aggregate({
    where: { chatWidgetId: input.chatWidgetId },
    _max: { sortOrder: true },
  })
  const nextSortOrder = input.sortOrder ?? (maxSort._max.sortOrder ?? -1) + 1

  return prisma.chatWidgetFAQ.create({
    data: {
      chatWidgetId: input.chatWidgetId,
      question: input.question,
      answer: input.answer,
      sortOrder: nextSortOrder,
    },
  })
}

/**
 * Update a FAQ item
 * WHY: Edit FAQ question or answer
 */
export async function updateFAQItem(faqId: string, data: FAQItemUpdateInput) {
  return prisma.chatWidgetFAQ.update({
    where: { id: faqId },
    data,
  })
}

/**
 * Delete a FAQ item
 * WHY: Remove FAQ from help page
 */
export async function deleteFAQItem(faqId: string) {
  return prisma.chatWidgetFAQ.delete({
    where: { id: faqId },
  })
}

/**
 * Reorder FAQ items
 * WHY: Allow drag-drop reordering in the editor
 */
export async function reorderFAQItems(
  chatWidgetId: string,
  orderedIds: string[]
) {
  const updates = orderedIds.map((id, index) =>
    prisma.chatWidgetFAQ.update({
      where: { id },
      data: { sortOrder: index },
    })
  )
  return prisma.$transaction(updates)
}

// ============================================================================
// UPDATE/ANNOUNCEMENT CRUD OPERATIONS
// ============================================================================

/**
 * Create a new update/announcement
 * WHY: Add update to updates page
 */
export async function createUpdateItem(input: UpdateItemCreateInput) {
  return prisma.chatWidgetUpdate.create({
    data: {
      chatWidgetId: input.chatWidgetId,
      title: input.title,
      content: input.content,
      featuredImage: input.featuredImage,
      featuredImageFileId: input.featuredImageFileId,
    },
  })
}

/**
 * Update an update/announcement
 * WHY: Edit update title, content, or image
 */
export async function updateUpdateItem(
  updateId: string,
  data: UpdateItemUpdateInput
) {
  return prisma.chatWidgetUpdate.update({
    where: { id: updateId },
    data,
  })
}

/**
 * Delete an update/announcement
 * WHY: Remove update from updates page
 */
export async function deleteUpdateItem(updateId: string) {
  return prisma.chatWidgetUpdate.delete({
    where: { id: updateId },
  })
}

/**
 * Get a single update by ID
 * WHY: For checking ownership before update/delete
 */
export async function getUpdateItemById(updateId: string) {
  return prisma.chatWidgetUpdate.findUnique({
    where: { id: updateId },
    include: { chatWidget: true },
  })
}

/**
 * Get a single FAQ item by ID
 * WHY: For checking ownership before update/delete
 */
export async function getFAQItemById(faqId: string) {
  return prisma.chatWidgetFAQ.findUnique({
    where: { id: faqId },
    include: { chatWidget: true },
  })
}
