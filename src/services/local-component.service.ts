/**
 * ============================================================================
 * LOCAL COMPONENT SERVICE (DAL) - Website-Scoped Component Operations
 * ============================================================================
 *
 * Data Access Layer for LocalComponent operations.
 * This is the ONLY place that should interact with Prisma for local components.
 *
 * ============================================================================
 * ARCHITECTURE: Website → LocalComponent[]
 * ============================================================================
 *
 * LocalComponents are reusable element templates scoped to a specific website.
 * They enable consistent, repeatable UI patterns across multiple pages.
 *
 * KEY CONCEPTS:
 * - Master Component: The LocalComponent definition stored in the database
 * - Instance: A ComponentInstanceElement on a page canvas that references a master
 * - Exposed Props: Properties that can be customized per instance
 *
 * IMPORTANT:
 * - Components are stored at WEBSITE level (not page, not domain)
 * - sourceTree contains the COMPLETE element hierarchy with ALL styles
 * - Instance IDs are NOT stored in the database (computed from canvas data)
 * - Editing the master definition updates ALL instances automatically
 */

import 'server-only'
import { prisma } from '@/lib/config'
import type { LocalComponent } from '@/generated/prisma'
import type { Prisma } from '@/generated/prisma'
import { logActivity } from './activity-log.service'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Input for creating a new LocalComponent.
 * The sourceTree contains the complete element hierarchy with all styles.
 */
export type LocalComponentCreateInput = {
  websiteId: string
  name: string
  description?: string | null
  sourceTree: Prisma.InputJsonValue
  exposedProps?: Prisma.InputJsonValue
  tags?: string[]
  /**
   * The ID of the first instance (the "master" instance on canvas).
   * This is the instance that replaced the original frame during conversion.
   */
  primaryInstanceId?: string | null
}

/**
 * Input for updating a LocalComponent.
 * Any field can be updated except the websiteId (component stays in same website).
 */
export type LocalComponentUpdateInput = {
  name?: string
  description?: string | null
  sourceTree?: Prisma.InputJsonValue
  exposedProps?: Prisma.InputJsonValue
  tags?: string[]
  skeletonStyles?: Prisma.InputJsonValue
  /** ID of another LocalComponent to use as loading skeleton */
  loadingSkeletonComponentId?: string | null
}

/**
 * Input for listing LocalComponents.
 */
export type ListLocalComponentsInput = {
  websiteId: string
  search?: string
  tags?: string[]
}

// ============================================================================
// SELECT FIELDS - Consistent field selection
// ============================================================================

/**
 * Standard fields to select for LocalComponent queries.
 * Includes all fields needed for component rendering and management.
 */
const LOCAL_COMPONENT_SELECT = {
  id: true,
  websiteId: true,
  name: true,
  description: true,
  sourceTree: true,
  exposedProps: true,
  tags: true,
  skeletonStyles: true,
  primaryInstanceId: true,
  loadingSkeletonComponentId: true,
  createdAt: true,
  updatedAt: true,
} as const

// ============================================================================
// CREATE - Create a new LocalComponent
// ============================================================================

/**
 * Create a new LocalComponent for a website.
 *
 * @param organizationId - Organization ID for activity logging
 * @param input - Component creation data including sourceTree
 * @param userId - Optional user ID for activity logging
 * @returns The created LocalComponent
 *
 * IMPORTANT: The sourceTree must contain deep-cloned elements with ALL styles.
 * Shallow copies will lose nested style objects.
 */
export async function createLocalComponent(
  organizationId: string,
  input: LocalComponentCreateInput,
  userId?: string
): Promise<LocalComponent> {
  const component = await prisma.localComponent.create({
    data: {
      websiteId: input.websiteId,
      name: input.name,
      description: input.description ?? null,
      sourceTree: input.sourceTree,
      exposedProps: input.exposedProps ?? [],
      tags: input.tags ?? [],
      // primaryInstanceId tracks the "master" instance (created during conversion)
      primaryInstanceId: input.primaryInstanceId ?? null,
    },
    select: LOCAL_COMPONENT_SELECT,
  })

  // Log activity for audit trail
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'create',
      entity: 'local_component',
      entityId: component.id,
    })
  }

  return component
}

// ============================================================================
// READ - Get LocalComponents
// ============================================================================

/**
 * Get a single LocalComponent by ID.
 *
 * @param id - The component ID
 * @returns The LocalComponent or null if not found
 */
export async function getLocalComponentById(
  id: string
): Promise<LocalComponent | null> {
  const component = await prisma.localComponent.findUnique({
    where: { id },
    select: LOCAL_COMPONENT_SELECT,
  })

  return component
}

/**
 * Get all LocalComponents for a website.
 *
 * @param input - Filtering options (websiteId, search, tags)
 * @returns Array of LocalComponents sorted by name
 */
export async function getLocalComponentsByWebsite(
  input: ListLocalComponentsInput
): Promise<LocalComponent[]> {
  const { websiteId, search, tags } = input

  // Build where clause
  const where: Prisma.LocalComponentWhereInput = {
    websiteId,
  }

  // Add search filter if provided
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ]
  }

  // Add tags filter if provided
  if (tags && tags.length > 0) {
    where.tags = { hasSome: tags }
  }

  const components = await prisma.localComponent.findMany({
    where,
    select: LOCAL_COMPONENT_SELECT,
    orderBy: { name: 'asc' },
  })

  return components
}

// ============================================================================
// UPDATE - Update a LocalComponent
// ============================================================================

/**
 * Update a LocalComponent.
 *
 * @param organizationId - Organization ID for activity logging
 * @param id - The component ID
 * @param input - Fields to update
 * @param userId - Optional user ID for activity logging
 * @returns The updated LocalComponent
 *
 * IMPORTANT: When updating sourceTree, ensure you pass deep-cloned elements.
 */
export async function updateLocalComponent(
  organizationId: string,
  id: string,
  input: LocalComponentUpdateInput,
  userId?: string
): Promise<LocalComponent> {
  const component = await prisma.localComponent.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.sourceTree !== undefined && { sourceTree: input.sourceTree }),
      ...(input.exposedProps !== undefined && { exposedProps: input.exposedProps }),
      ...(input.tags !== undefined && { tags: input.tags }),
      ...(input.skeletonStyles !== undefined && { skeletonStyles: input.skeletonStyles }),
      ...(input.loadingSkeletonComponentId !== undefined && { loadingSkeletonComponentId: input.loadingSkeletonComponentId }),
    },
    select: LOCAL_COMPONENT_SELECT,
  })

  // Log activity for audit trail
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'update',
      entity: 'local_component',
      entityId: component.id,
    })
  }

  return component
}

// ============================================================================
// DELETE - Delete a LocalComponent
// ============================================================================

/**
 * Delete a LocalComponent.
 *
 * NOTE: This does NOT automatically remove instances from page canvases.
 * Instances referencing a deleted component will show an error state.
 * Consider adding a check for existing instances before allowing deletion.
 *
 * @param organizationId - Organization ID for activity logging
 * @param id - The component ID
 * @param userId - Optional user ID for activity logging
 * @returns The deleted LocalComponent
 */
export async function deleteLocalComponent(
  organizationId: string,
  id: string,
  userId?: string
): Promise<LocalComponent> {
  const component = await prisma.localComponent.delete({
    where: { id },
    select: LOCAL_COMPONENT_SELECT,
  })

  // Log activity for audit trail
  if (userId) {
    logActivity({
      userId,
      organizationId,
      action: 'delete',
      entity: 'local_component',
      entityId: id,
    })
  }

  return component
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Check if a LocalComponent exists and belongs to the specified website.
 *
 * @param id - The component ID
 * @param websiteId - The website ID to verify ownership
 * @returns True if the component exists and belongs to the website
 */
export async function verifyComponentOwnership(
  id: string,
  websiteId: string
): Promise<boolean> {
  const component = await prisma.localComponent.findFirst({
    where: { id, websiteId },
    select: { id: true },
  })

  return component !== null
}

/**
 * Check if a component name is unique within a website.
 *
 * @param websiteId - The website ID
 * @param name - The component name to check
 * @param excludeId - Optional ID to exclude (for updates)
 * @returns True if the name is unique
 */
export async function isComponentNameUnique(
  websiteId: string,
  name: string,
  excludeId?: string
): Promise<boolean> {
  const existing = await prisma.localComponent.findFirst({
    where: {
      websiteId,
      name,
      ...(excludeId && { id: { not: excludeId } }),
    },
    select: { id: true },
  })

  return existing === null
}
