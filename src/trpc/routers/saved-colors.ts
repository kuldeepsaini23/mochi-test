/**
 * ============================================================================
 * SAVED COLORS ROUTER — Organization Brand Color Management
 * ============================================================================
 *
 * tRPC router for managing saved/brand colors per organization.
 * Used by the website builder's color picker to store and retrieve
 * frequently used colors.
 *
 * ALL ENDPOINTS are protected via organizationProcedure (requires auth + org membership).
 * organizationId is required in every input schema (extracted by the procedure).
 * The validated org is available at ctx.organization.
 *
 * SOURCE OF TRUTH KEYWORDS: SavedColor, SavedColors, OrganizationColors, BrandColors
 */

import { z } from 'zod'
import { createTRPCRouter, organizationProcedure } from '../init'
import * as savedColorsService from '@/services/saved-colors.service'

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

/**
 * Schema for listing saved colors — only needs organizationId
 * (extracted by organizationProcedure from input).
 */
const listSavedColorsSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
})

/**
 * Schema for creating a new saved color.
 * Name must be non-empty (used as a label in the UI).
 * Color can be hex (#ff0000), rgba(r,g,b,a), or 'transparent'.
 */
const createSavedColorSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  name: z.string().min(1, 'Color name is required'),
  color: z.string().min(1, 'Color value is required'),
})

/**
 * Schema for deleting a saved color by its ID.
 */
const deleteSavedColorSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  id: z.string().min(1, 'Color ID is required'),
})

/**
 * Schema for updating a saved color.
 * At least one of name or color should be provided, but both are optional
 * to allow partial updates.
 */
const updateSavedColorSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  id: z.string().min(1, 'Color ID is required'),
  name: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
})

// ============================================================================
// ROUTER
// ============================================================================

export const savedColorsRouter = createTRPCRouter({
  /**
   * List all saved colors for the current organization.
   * Returns colors ordered by sortOrder ascending, then createdAt ascending.
   */
  list: organizationProcedure()
    .input(listSavedColorsSchema)
    .query(async ({ ctx }) => {
      return savedColorsService.getSavedColors(ctx.organization.id)
    }),

  /**
   * Create a new saved color.
   * Automatically assigns the next sort position so new colors
   * appear at the end of the list in the UI.
   *
   * NOTE: The [organizationId, name] unique constraint in the DB
   * will reject duplicate names within the same org.
   */
  create: organizationProcedure()
    .input(createSavedColorSchema)
    .mutation(async ({ ctx, input }) => {
      return savedColorsService.createSavedColor(
        ctx.organization.id,
        input.name,
        input.color
      )
    }),

  /**
   * Hard delete a saved color.
   * Permanently removes the color. Uses org-scoped deletion
   * to prevent cross-org access.
   */
  delete: organizationProcedure()
    .input(deleteSavedColorSchema)
    .mutation(async ({ ctx, input }) => {
      return savedColorsService.deleteSavedColor(input.id, ctx.organization.id)
    }),

  /**
   * Update a saved color's name and/or value.
   * Supports partial updates — only the provided fields are changed.
   * Org-scoped to prevent cross-org modifications.
   */
  update: organizationProcedure()
    .input(updateSavedColorSchema)
    .mutation(async ({ ctx, input }) => {
      return savedColorsService.updateSavedColor(
        input.id,
        ctx.organization.id,
        { name: input.name, color: input.color }
      )
    }),
})
