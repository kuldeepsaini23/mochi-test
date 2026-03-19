/**
 * ============================================================================
 * LOCAL COMPONENTS ROUTER - Website-Scoped Component CRUD Operations
 * ============================================================================
 *
 * tRPC router for LocalComponent operations.
 * Enables frontend to create, read, update, and delete reusable components.
 *
 * ============================================================================
 * ARCHITECTURE: Website → LocalComponent[]
 * ============================================================================
 *
 * KEY CONCEPT: Components are stored at the WEBSITE level, not page level.
 * This means:
 * - Components are available across ALL pages within a website
 * - Creating a component on one page makes it available on all pages
 * - Deleting a component affects all pages that use it
 *
 * COMPONENT STRUCTURE:
 * - sourceTree: Complete element hierarchy with ALL styles (deep-cloned)
 * - exposedProps: Properties that can be customized per instance
 * - Instances on canvas reference the master component by ID
 *
 * IMPORTANT:
 * - Component operations should NOT go through undo/redo
 * - They are website-level operations, not canvas-level
 * - Changes to master component affect ALL instances immediately
 */

import { z } from 'zod'
import {
  createTRPCRouter,
  organizationProcedure,
  createStructuredError,
} from '../init'
import { ERROR_CODES } from '@/lib/errors'
import { permissions } from '@/lib/better-auth/permissions'
import {
  incrementUsageAndInvalidate,
  decrementUsageAndInvalidate,
} from '@/trpc/procedures/feature-gates'
import * as localComponentService from '@/services/local-component.service'
import { invalidateWebsitePageCache } from '@/lib/page-cache'

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * Schema for creating a new LocalComponent.
 * sourceTree contains the complete element tree with all styles.
 */
const createComponentSchema = z.object({
  organizationId: z.string(),
  websiteId: z.string(),
  name: z.string().min(1, 'Component name is required'),
  description: z.string().optional().nullable(),
  sourceTree: z.unknown(), // JSON containing element hierarchy
  exposedProps: z.unknown().optional(), // JSON array of ExposedProp objects
  tags: z.array(z.string()).optional(),
  /**
   * The ID of the first instance (the "master" instance on canvas).
   * This is the instance that replaced the original frame during conversion.
   * Used to distinguish master from regular instances in the UI.
   */
  primaryInstanceId: z.string().optional(),
})

/**
 * Schema for getting components by website.
 */
const getComponentsSchema = z.object({
  organizationId: z.string(),
  websiteId: z.string(),
  search: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

/**
 * Schema for getting a single component by ID.
 */
const getComponentByIdSchema = z.object({
  organizationId: z.string(),
  componentId: z.string(),
})

/**
 * Schema for updating a LocalComponent.
 */
const updateComponentSchema = z.object({
  organizationId: z.string(),
  componentId: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  sourceTree: z.unknown().optional(),
  exposedProps: z.unknown().optional(),
  tags: z.array(z.string()).optional(),
  skeletonStyles: z.unknown().optional(), // Loading skeleton theme colors
  loadingSkeletonComponentId: z.string().optional().nullable(), // ID of component to use as loading skeleton
})

/**
 * Schema for deleting a LocalComponent.
 */
const deleteComponentSchema = z.object({
  organizationId: z.string(),
  componentId: z.string(),
})

// ============================================================================
// ROUTER
// ============================================================================

export const localComponentsRouter = createTRPCRouter({
  /**
   * Create a new LocalComponent.
   *
   * WHY: Users need to save reusable components at the website level.
   * HOW: Takes the sourceTree (element hierarchy) and saves to database.
   * Feature-gated: local_components.limit checked at procedure level before handler runs.
   *
   * IMPORTANT: sourceTree should be deep-cloned before passing here
   * to preserve all nested styles.
   */
  create: organizationProcedure({
    requirePermission: permissions.WEBSITES_UPDATE,
    requireFeature: 'local_components.limit',
  })
    .input(createComponentSchema)
    .mutation(async ({ ctx, input }) => {
      const { organizationId, websiteId, name, description, sourceTree, exposedProps, tags, primaryInstanceId } = input

      // Verify the name is unique within the website
      const isUnique = await localComponentService.isComponentNameUnique(websiteId, name)
      if (!isUnique) {
        throw createStructuredError('BAD_REQUEST', 'Component name already exists', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: `A component named '${name}' already exists in this website`,
        })
      }

      // Create the component with primaryInstanceId (the "master" instance)
      const component = await localComponentService.createLocalComponent(
        organizationId,
        {
          websiteId,
          name,
          description: description ?? null,
          sourceTree: sourceTree as localComponentService.LocalComponentCreateInput['sourceTree'],
          exposedProps: exposedProps as localComponentService.LocalComponentCreateInput['exposedProps'],
          tags,
          primaryInstanceId: primaryInstanceId ?? null,
        },
        ctx.user.id
      )

      /* Invalidate cached pages — new component is now available for rendering */
      invalidateWebsitePageCache(websiteId)

      // Increment usage after successful creation
      await incrementUsageAndInvalidate(ctx, organizationId, 'local_components.limit')

      return {
        success: true,
        component,
      }
    }),

  /**
   * Get all LocalComponents for a website.
   *
   * WHY: Builder needs to load all components available for a website.
   * HOW: Queries by websiteId with optional search/tags filters.
   *
   * RETURNS: Array of components sorted by name.
   */
  getByWebsite: organizationProcedure({
    requirePermission: permissions.WEBSITES_READ,
  })
    .input(getComponentsSchema)
    .query(async ({ input }) => {
      const { websiteId, search, tags } = input

      const components = await localComponentService.getLocalComponentsByWebsite({
        websiteId,
        search,
        tags,
      })

      return {
        components,
      }
    }),

  /**
   * Get a single LocalComponent by ID.
   *
   * WHY: Need to fetch component details for editing or rendering.
   * HOW: Direct lookup by component ID.
   */
  getById: organizationProcedure({
    requirePermission: permissions.WEBSITES_READ,
  })
    .input(getComponentByIdSchema)
    .query(async ({ input }) => {
      const { componentId } = input

      const component = await localComponentService.getLocalComponentById(componentId)

      if (!component) {
        throw createStructuredError('NOT_FOUND', 'Component not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Component not found',
        })
      }

      return {
        component,
      }
    }),

  /**
   * Update a LocalComponent.
   *
   * WHY: Users need to edit component properties, sourceTree, or exposed props.
   * HOW: Partial update - only provided fields are changed.
   *
   * IMPORTANT: When updating sourceTree, ensure it's deep-cloned to preserve
   * all nested styles. Changes affect ALL instances immediately.
   */
  update: organizationProcedure({
    requirePermission: permissions.WEBSITES_UPDATE,
  })
    .input(updateComponentSchema)
    .mutation(async ({ ctx, input }) => {
      const { organizationId, componentId, name, description, sourceTree, exposedProps, tags, skeletonStyles, loadingSkeletonComponentId } = input

      // Get the component to verify it exists and get websiteId
      const existing = await localComponentService.getLocalComponentById(componentId)
      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Component not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Component not found',
        })
      }

      // If name is being changed, verify uniqueness
      if (name && name !== existing.name) {
        const isUnique = await localComponentService.isComponentNameUnique(
          existing.websiteId,
          name,
          componentId
        )
        if (!isUnique) {
          throw createStructuredError('BAD_REQUEST', 'Component name already exists', {
            errorCode: ERROR_CODES.VALIDATION_ERROR,
            message: `A component named '${name}' already exists in this website`,
          })
        }
      }

      // Update the component
      const component = await localComponentService.updateLocalComponent(
        organizationId,
        componentId,
        {
          name,
          description,
          sourceTree: sourceTree as localComponentService.LocalComponentUpdateInput['sourceTree'],
          exposedProps: exposedProps as localComponentService.LocalComponentUpdateInput['exposedProps'],
          tags,
          skeletonStyles: skeletonStyles as localComponentService.LocalComponentUpdateInput['skeletonStyles'],
          loadingSkeletonComponentId,
        },
        ctx.user.id
      )

      /* Invalidate cached pages — component content has changed */
      invalidateWebsitePageCache(existing.websiteId)

      return {
        success: true,
        component,
      }
    }),

  /**
   * Delete a LocalComponent.
   *
   * WHY: Users need to remove components they no longer need.
   * HOW: Deletes from database. Instances will show error state.
   *
   * WARNING: This does NOT automatically clean up instances on canvases.
   * Instances referencing the deleted component will show an error/placeholder.
   * Consider showing a warning to the user about existing instances.
   */
  delete: organizationProcedure({
    requirePermission: permissions.WEBSITES_UPDATE,
  })
    .input(deleteComponentSchema)
    .mutation(async ({ ctx, input }) => {
      const { organizationId, componentId } = input

      // Verify the component exists
      const existing = await localComponentService.getLocalComponentById(componentId)
      if (!existing) {
        throw createStructuredError('NOT_FOUND', 'Component not found', {
          errorCode: ERROR_CODES.VALIDATION_ERROR,
          message: 'Component not found',
        })
      }

      // Delete the component
      await localComponentService.deleteLocalComponent(organizationId, componentId, ctx.user.id)

      /* Invalidate cached pages — component is gone, instances show error */
      invalidateWebsitePageCache(existing.websiteId)

      // Decrement usage after successful deletion
      await decrementUsageAndInvalidate(ctx, organizationId, 'local_components.limit')

      return {
        success: true,
        deletedId: componentId,
      }
    }),
})
