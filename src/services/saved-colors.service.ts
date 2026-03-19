/**
 * Saved Colors Service (DAL)
 *
 * SOURCE OF TRUTH KEYWORDS: SavedColor, SavedColors, OrganizationColors, BrandColors
 *
 * WHY: Centralized service for managing saved/brand colors per organization.
 * This is the ONLY place that should interact with Prisma for SavedColor records.
 *
 * FEATURES:
 * - getSavedColors: List all saved colors for an organization, ordered by sortOrder
 * - createSavedColor: Add a new named color with auto-incrementing sort order
 * - updateSavedColor: Update the name or color value of an existing saved color
 * - deleteSavedColor: Hard delete a saved color (org-scoped for security)
 *
 * SECURITY:
 * All mutations require both `id` and `organizationId` to prevent cross-org access.
 * The organizationId is injected by the tRPC organizationProcedure — never from client input.
 */

import 'server-only'

import { prisma } from '@/lib/config'

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get all saved colors for an organization.
 *
 * Returns colors ordered by sortOrder ascending, then createdAt ascending
 * as a tiebreaker for colors with the same sortOrder.
 */
export async function getSavedColors(organizationId: string) {
  return prisma.savedColor.findMany({
    where: { organizationId },
    orderBy: [
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
    ],
  })
}

/**
 * Create a new saved color for an organization.
 *
 * Auto-assigns sortOrder based on the current count of existing colors
 * so newly added colors appear at the end of the list.
 *
 * WHY auto sort order: Users expect new colors to appear at the bottom.
 * Using count + 1 avoids needing a separate reorder operation on every add.
 */
export async function createSavedColor(
  organizationId: string,
  name: string,
  color: string
) {
  // Count existing colors to auto-assign the next sort position
  const existingCount = await prisma.savedColor.count({
    where: { organizationId },
  })

  return prisma.savedColor.create({
    data: {
      organizationId,
      name,
      color,
      sortOrder: existingCount + 1,
    },
  })
}

/**
 * Update an existing saved color's name and/or color value.
 *
 * SECURITY: Uses both `id` AND `organizationId` in the where clause
 * to prevent cross-org access — a user cannot update a color from another org
 * even if they somehow obtain the color's ID.
 */
export async function updateSavedColor(
  id: string,
  organizationId: string,
  data: { name?: string; color?: string }
) {
  return prisma.savedColor.update({
    where: {
      id,
      organizationId,
    },
    data,
  })
}

/**
 * Hard delete a saved color.
 *
 * SECURITY: Uses both `id` AND `organizationId` in the where clause
 * to prevent cross-org deletion. This is a hard delete — the record
 * is permanently removed from the database.
 */
export async function deleteSavedColor(id: string, organizationId: string) {
  return prisma.savedColor.delete({
    where: {
      id,
      organizationId,
    },
  })
}
