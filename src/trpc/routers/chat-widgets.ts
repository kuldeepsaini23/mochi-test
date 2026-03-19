/**
 * Chat Widgets Router
 *
 * tRPC router for chat widget management.
 * Chat widgets enable 2-way realtime chat and AI chatbot functionality.
 *
 * SOURCE OF TRUTH: ChatWidget, ChatWidgetFAQ, ChatWidgetUpdate, Organization
 */

import { z } from 'zod'
import {
  createTRPCRouter,
  organizationProcedure,
  createStructuredError,
} from '../init'
import { ERROR_CODES } from '@/lib/errors'
import { permissions } from '@/lib/better-auth/permissions'
import * as chatWidgetService from '@/services/chat-widget.service'
import {
  incrementUsageAndInvalidate,
  decrementUsageAndInvalidate,
} from '@/trpc/procedures/feature-gates'

// ============================================================================
// INPUT SCHEMAS - Exported for type safety
// ============================================================================

export const listChatWidgetsSchema = z.object({
  organizationId: z.string(),
  search: z.string().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(10),
})

export const getChatWidgetSchema = z.object({
  organizationId: z.string(),
  chatWidgetId: z.string(),
})

export const createChatWidgetSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional().nullable(),
})

export const updateChatWidgetSchema = z.object({
  organizationId: z.string(),
  chatWidgetId: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
})

export const deleteChatWidgetSchema = z.object({
  organizationId: z.string(),
  chatWidgetId: z.string(),
})

export const bulkDeleteChatWidgetsSchema = z.object({
  organizationId: z.string(),
  chatWidgetIds: z.array(z.string()).min(1),
})

// Config update schema - for theme, behavior, welcome page
const gradientConfigSchema = z.object({
  type: z.string(),
  angle: z.number().optional(),
  stops: z.array(z.object({
    color: z.string(),
    position: z.number(),
  })),
}).optional().nullable()

export const updateConfigSchema = z.object({
  organizationId: z.string(),
  chatWidgetId: z.string(),
  config: z.object({
    theme: z.object({
      mode: z.enum(['light', 'dark']),
      primaryText: z.string(),
      primaryTextGradient: gradientConfigSchema,
      secondaryText: z.string(),
      secondaryTextGradient: gradientConfigSchema,
      background: z.string(),
      backgroundGradient: gradientConfigSchema,
      secondaryBackground: z.string(),
      accent: z.string(),
      accentGradient: gradientConfigSchema,
      border: z.string(),
    }).optional(),
    behavior: z.object({
      autoOpen: z.boolean(),
      enableSounds: z.boolean(),
      showBranding: z.boolean(),
    }).optional(),
    toggle: z.object({
      type: z.enum(['image', 'icon']),
      image: z.string().optional().nullable(),
      icon: z.string().optional().nullable(),
    }).optional(),
    welcomePage: z.object({
      title: z.string(),
      subtitle: z.string(),
    }).optional(),
  }),
})

// FAQ schemas
export const createFAQSchema = z.object({
  organizationId: z.string(),
  chatWidgetId: z.string(),
  question: z.string().min(1, 'Question is required'),
  answer: z.string().min(1, 'Answer is required'),
})

export const updateFAQSchema = z.object({
  organizationId: z.string(),
  chatWidgetId: z.string(),
  faqId: z.string(),
  question: z.string().min(1).optional(),
  answer: z.string().min(1).optional(),
})

export const deleteFAQSchema = z.object({
  organizationId: z.string(),
  chatWidgetId: z.string(),
  faqId: z.string(),
})

export const reorderFAQsSchema = z.object({
  organizationId: z.string(),
  chatWidgetId: z.string(),
  orderedIds: z.array(z.string()),
})

// Update/announcement schemas
export const createUpdateSchema = z.object({
  organizationId: z.string(),
  chatWidgetId: z.string(),
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(1, 'Content is required'),
  featuredImage: z.string().optional().nullable(),
  featuredImageFileId: z.string().optional().nullable(),
})

export const updateUpdateSchema = z.object({
  organizationId: z.string(),
  chatWidgetId: z.string(),
  updateId: z.string(),
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  featuredImage: z.string().optional().nullable(),
  featuredImageFileId: z.string().optional().nullable(),
})

export const deleteUpdateSchema = z.object({
  organizationId: z.string(),
  chatWidgetId: z.string(),
  updateId: z.string(),
})

/**
 * Schema for updating allowed domains (embed security)
 *
 * WHY: Control which external websites can embed this chat widget
 * HOW: Array of domain patterns validated against Origin/Referer headers
 *
 * Domain patterns:
 * - "example.com" - exact match
 * - "*.example.com" - wildcard subdomain match
 *
 * SOURCE OF TRUTH: UpdateAllowedDomainsSchema, EmbedSecurity
 */
export const updateAllowedDomainsSchema = z.object({
  organizationId: z.string(),
  chatWidgetId: z.string(),
  /** Array of domain patterns. Empty array = not embeddable externally */
  allowedDomains: z.array(
    z.string()
      .min(1)
      .regex(/^(\*\.)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/, {
        message: 'Invalid domain format. Use "example.com" or "*.example.com"',
      })
  ),
})

// ============================================================================
// ROUTER
// ============================================================================

export const chatWidgetsRouter = createTRPCRouter({
  /**
   * List chat widgets with pagination and search
   */
  list: organizationProcedure({ requirePermission: permissions.STORES_READ })
    .input(listChatWidgetsSchema)
    .query(async ({ input }) => {
      return chatWidgetService.listChatWidgets(input)
    }),

  /**
   * Get a single chat widget with all related data
   */
  getById: organizationProcedure({ requirePermission: permissions.STORES_READ })
    .input(getChatWidgetSchema)
    .query(async ({ input }) => {
      const chatWidget = await chatWidgetService.getChatWidgetById(
        input.organizationId,
        input.chatWidgetId
      )

      if (!chatWidget) {
        throw createStructuredError('NOT_FOUND', 'Chat widget not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Chat widget not found',
        })
      }

      return chatWidget
    }),

  /**
   * Create a new chat widget
   *
   * FEATURE GATE: chat_widgets.limit
   * Checks organization's chat widget limit before creating
   */
  /** Feature-gated: chat_widgets.limit checked at procedure level before handler runs */
  create: organizationProcedure({
    requirePermission: permissions.STORES_CREATE,
    requireFeature: 'chat_widgets.limit',
  })
    .input(createChatWidgetSchema)
    .mutation(async ({ ctx, input }) => {
      const chatWidget = await chatWidgetService.createChatWidget(input)

      // Increment usage after successful creation
      await incrementUsageAndInvalidate(ctx, input.organizationId, 'chat_widgets.limit')

      return chatWidget
    }),

  /**
   * Update a chat widget's basic info
   */
  update: organizationProcedure({ requirePermission: permissions.STORES_UPDATE })
    .input(updateChatWidgetSchema)
    .mutation(async ({ ctx, input }) => {
      const { chatWidgetId, organizationId, ...data } = input

      // Verify chat widget exists and belongs to organization
      const existing = await chatWidgetService.getChatWidgetById(
        organizationId,
        chatWidgetId
      )
      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Chat widget not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Chat widget not found',
        })
      }

      return chatWidgetService.updateChatWidget(organizationId, chatWidgetId, data, ctx.user.id)
    }),

  /**
   * Update a chat widget's config (theme, behavior, welcome page)
   * WHY: Save customization settings - debounced on frontend
   */
  updateConfig: organizationProcedure({ requirePermission: permissions.STORES_UPDATE })
    .input(updateConfigSchema)
    .mutation(async ({ ctx, input }) => {
      const { chatWidgetId, organizationId, config } = input

      // Verify ownership
      const existing = await chatWidgetService.getChatWidgetById(
        organizationId,
        chatWidgetId
      )
      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Chat widget not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Chat widget not found',
        })
      }

      return chatWidgetService.updateChatWidgetConfig(organizationId, chatWidgetId, config, ctx.user.id)
    }),

  /**
   * Update allowed domains for embed security
   *
   * WHY: Control which external websites can embed this chat widget
   * HOW: Validates and stores domain patterns for referrer/origin validation
   *
   * SOURCE OF TRUTH: UpdateAllowedDomains, EmbedSecurity
   */
  updateAllowedDomains: organizationProcedure({ requirePermission: permissions.STORES_UPDATE })
    .input(updateAllowedDomainsSchema)
    .mutation(async ({ ctx, input }) => {
      const { organizationId, chatWidgetId, allowedDomains } = input

      // Verify chat widget exists and belongs to organization
      const existing = await chatWidgetService.getChatWidgetById(
        organizationId,
        chatWidgetId
      )
      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Chat widget not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Chat widget not found',
        })
      }

      return chatWidgetService.updateAllowedDomains(organizationId, chatWidgetId, allowedDomains, ctx.user.id)
    }),

  /**
   * Delete a chat widget
   *
   * FEATURE GATE: chat_widgets.limit
   * Decrements usage after successful deletion to free up quota
   */
  delete: organizationProcedure({ requirePermission: permissions.STORES_DELETE })
    .input(deleteChatWidgetSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify chat widget exists and belongs to organization
      const existing = await chatWidgetService.getChatWidgetById(
        input.organizationId,
        input.chatWidgetId
      )
      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Chat widget not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Chat widget not found',
        })
      }

      await chatWidgetService.deleteChatWidget(input.organizationId, input.chatWidgetId, ctx.user.id)

      // Decrement usage after successful deletion
      await decrementUsageAndInvalidate(ctx, input.organizationId, 'chat_widgets.limit')

      return { success: true }
    }),

  /**
   * Bulk delete chat widgets
   *
   * FEATURE GATE: chat_widgets.limit
   * Decrements usage by count of deleted widgets
   */
  bulkDelete: organizationProcedure({ requirePermission: permissions.STORES_DELETE })
    .input(bulkDeleteChatWidgetsSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await chatWidgetService.bulkDeleteChatWidgets(
        input.organizationId,
        input.chatWidgetIds,
        ctx.user.id
      )

      // Decrement usage by count of deleted widgets
      if (result.count > 0) {
        await decrementUsageAndInvalidate(
          ctx,
          input.organizationId,
          'chat_widgets.limit',
          result.count
        )
      }

      return { count: result.count }
    }),

  // ==========================================================================
  // FAQ ENDPOINTS
  // ==========================================================================

  /**
   * Create a new FAQ item
   */
  createFAQ: organizationProcedure({ requirePermission: permissions.STORES_UPDATE })
    .input(createFAQSchema)
    .mutation(async ({ input }) => {
      const { organizationId, chatWidgetId, ...data } = input

      // Verify ownership
      const existing = await chatWidgetService.getChatWidgetById(
        organizationId,
        chatWidgetId
      )
      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Chat widget not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Chat widget not found',
        })
      }

      return chatWidgetService.createFAQItem({ chatWidgetId, ...data })
    }),

  /**
   * Update a FAQ item
   */
  updateFAQ: organizationProcedure({ requirePermission: permissions.STORES_UPDATE })
    .input(updateFAQSchema)
    .mutation(async ({ input }) => {
      const { organizationId, chatWidgetId, faqId, ...data } = input

      // Verify FAQ belongs to this widget
      const faq = await chatWidgetService.getFAQItemById(faqId)
      if (!faq || faq.chatWidgetId !== chatWidgetId) {
        throw createStructuredError('NOT_FOUND', 'FAQ item not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'FAQ item not found',
        })
      }

      // Verify widget ownership
      if (faq.chatWidget.organizationId !== organizationId) {
        throw createStructuredError('FORBIDDEN', 'Access denied', {
          errorCode: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
          required: ['STORES_UPDATE'],
          current: 'none',
          message: 'Access denied',
        })
      }

      return chatWidgetService.updateFAQItem(faqId, data)
    }),

  /**
   * Delete a FAQ item
   */
  deleteFAQ: organizationProcedure({ requirePermission: permissions.STORES_UPDATE })
    .input(deleteFAQSchema)
    .mutation(async ({ input }) => {
      const { organizationId, chatWidgetId, faqId } = input

      // Verify FAQ belongs to this widget
      const faq = await chatWidgetService.getFAQItemById(faqId)
      if (!faq || faq.chatWidgetId !== chatWidgetId) {
        throw createStructuredError('NOT_FOUND', 'FAQ item not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'FAQ item not found',
        })
      }

      // Verify widget ownership
      if (faq.chatWidget.organizationId !== organizationId) {
        throw createStructuredError('FORBIDDEN', 'Access denied', {
          errorCode: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
          required: ['STORES_DELETE'],
          current: 'none',
          message: 'Access denied',
        })
      }

      await chatWidgetService.deleteFAQItem(faqId)
      return { success: true }
    }),

  /**
   * Reorder FAQ items
   */
  reorderFAQs: organizationProcedure({ requirePermission: permissions.STORES_UPDATE })
    .input(reorderFAQsSchema)
    .mutation(async ({ input }) => {
      const { organizationId, chatWidgetId, orderedIds } = input

      // Verify ownership
      const existing = await chatWidgetService.getChatWidgetById(
        organizationId,
        chatWidgetId
      )
      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Chat widget not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Chat widget not found',
        })
      }

      await chatWidgetService.reorderFAQItems(chatWidgetId, orderedIds)
      return { success: true }
    }),

  // ==========================================================================
  // UPDATE/ANNOUNCEMENT ENDPOINTS
  // ==========================================================================

  /**
   * Create a new update/announcement
   */
  createUpdate: organizationProcedure({ requirePermission: permissions.STORES_UPDATE })
    .input(createUpdateSchema)
    .mutation(async ({ input }) => {
      const { organizationId, chatWidgetId, ...data } = input

      // Verify ownership
      const existing = await chatWidgetService.getChatWidgetById(
        organizationId,
        chatWidgetId
      )
      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Chat widget not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Chat widget not found',
        })
      }

      return chatWidgetService.createUpdateItem({ chatWidgetId, ...data })
    }),

  /**
   * Update an update/announcement
   */
  updateUpdate: organizationProcedure({ requirePermission: permissions.STORES_UPDATE })
    .input(updateUpdateSchema)
    .mutation(async ({ input }) => {
      const { organizationId, chatWidgetId, updateId, ...data } = input

      // Verify update belongs to this widget
      const update = await chatWidgetService.getUpdateItemById(updateId)
      if (!update || update.chatWidgetId !== chatWidgetId) {
        throw createStructuredError('NOT_FOUND', 'Update not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Update not found',
        })
      }

      // Verify widget ownership
      if (update.chatWidget.organizationId !== organizationId) {
        throw createStructuredError('FORBIDDEN', 'Access denied', {
          errorCode: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
          required: ['STORES_UPDATE'],
          current: 'none',
          message: 'Access denied',
        })
      }

      return chatWidgetService.updateUpdateItem(updateId, data)
    }),

  /**
   * Delete an update/announcement
   */
  deleteUpdate: organizationProcedure({ requirePermission: permissions.STORES_UPDATE })
    .input(deleteUpdateSchema)
    .mutation(async ({ input }) => {
      const { organizationId, chatWidgetId, updateId } = input

      // Verify update belongs to this widget
      const update = await chatWidgetService.getUpdateItemById(updateId)
      if (!update || update.chatWidgetId !== chatWidgetId) {
        throw createStructuredError('NOT_FOUND', 'Update not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Update not found',
        })
      }

      // Verify widget ownership
      if (update.chatWidget.organizationId !== organizationId) {
        throw createStructuredError('FORBIDDEN', 'Access denied', {
          errorCode: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
          required: ['STORES_DELETE'],
          current: 'none',
          message: 'Access denied',
        })
      }

      await chatWidgetService.deleteUpdateItem(updateId)
      return { success: true }
    }),
})
