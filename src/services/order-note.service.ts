/**
 * Order Note Service (DAL)
 *
 * Data Access Layer for order notes/timeline operations.
 * Allows merchants to add notes and track order timeline.
 *
 * SOURCE OF TRUTH: OrderNote
 *
 * tRPC routers call these functions after security checks.
 */

import 'server-only'
import { prisma } from '@/lib/config'
import { Prisma } from '@/generated/prisma'
import { logActivity } from './activity-log.service'

// ============================================================================
// TYPES
// ============================================================================

/**
 * SOURCE OF TRUTH: OrderNoteCreateInput
 * Input type for creating an order note
 */
export type OrderNoteCreateInput = {
  organizationId: string
  orderId: string
  content: string
  isInternal?: boolean
  createdBy: string // userId
}

/**
 * SOURCE OF TRUTH: OrderNoteEntry
 * Transformed order note for API responses
 */
export type OrderNoteEntry = {
  id: string
  orderId: string
  content: string
  isInternal: boolean
  createdBy: string
  createdAt: string
}

// ============================================================================
// NOTE CRUD OPERATIONS
// ============================================================================

/**
 * Add a note to an order
 *
 * @param input - Note creation parameters
 * @returns The created note
 */
export async function addNote(input: OrderNoteCreateInput): Promise<OrderNoteEntry> {
  const { organizationId, orderId, content, isInternal = true, createdBy } = input

  // Verify order belongs to organization
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      organizationId,
    },
    select: { id: true },
  })

  if (!order) {
    throw new Error('Order not found')
  }

  // Create the note
  const note = await prisma.orderNote.create({
    data: {
      orderId,
      content,
      isInternal,
      createdBy,
    },
  })

  // Log activity
  logActivity({
    userId: createdBy,
    organizationId,
    action: 'create',
    entity: 'order',
    entityId: orderId,
  })

  return transformNote(note)
}

/**
 * List all notes for an order
 *
 * @param organizationId - Organization that owns the order
 * @param orderId - Order to get notes for
 * @param includeInternal - Whether to include internal notes (default: true)
 * @returns List of notes ordered by creation date (newest first)
 */
export async function listNotes(
  organizationId: string,
  orderId: string,
  includeInternal = true
): Promise<OrderNoteEntry[]> {
  // Verify order belongs to organization
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      organizationId,
    },
    select: { id: true },
  })

  if (!order) {
    throw new Error('Order not found')
  }

  // Build where clause
  const where: Prisma.OrderNoteWhereInput = {
    orderId,
    ...(includeInternal ? {} : { isInternal: false }),
  }

  // Get notes
  const notes = await prisma.orderNote.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })

  return notes.map(transformNote)
}

/**
 * Get a single note by ID
 *
 * @param organizationId - Organization that owns the order
 * @param noteId - Note ID to retrieve
 * @returns The note or null if not found
 */
export async function getNote(
  organizationId: string,
  noteId: string
): Promise<OrderNoteEntry | null> {
  const note = await prisma.orderNote.findFirst({
    where: {
      id: noteId,
      order: {
        organizationId,
      },
    },
  })

  return note ? transformNote(note) : null
}

/**
 * Delete a note from an order
 *
 * @param organizationId - Organization that owns the order
 * @param noteId - Note ID to delete
 * @param userId - User ID deleting the note (for activity logging)
 * @returns The deleted note
 */
export async function deleteNote(
  organizationId: string,
  noteId: string,
  userId: string
): Promise<OrderNoteEntry> {
  // Verify note belongs to organization's order
  const note = await prisma.orderNote.findFirst({
    where: {
      id: noteId,
      order: {
        organizationId,
      },
    },
    include: {
      order: {
        select: { id: true },
      },
    },
  })

  if (!note) {
    throw new Error('Note not found')
  }

  // Delete the note
  await prisma.orderNote.delete({
    where: { id: noteId },
  })

  // Log activity
  logActivity({
    userId,
    organizationId,
    action: 'delete',
    entity: 'order',
    entityId: note.order.id,
  })

  return transformNote(note)
}

/**
 * Update a note's content
 *
 * @param organizationId - Organization that owns the order
 * @param noteId - Note ID to update
 * @param content - New content for the note
 * @param userId - User ID updating the note (for activity logging)
 * @returns The updated note
 */
export async function updateNote(
  organizationId: string,
  noteId: string,
  content: string,
  userId: string
): Promise<OrderNoteEntry> {
  // Verify note belongs to organization's order
  const existing = await prisma.orderNote.findFirst({
    where: {
      id: noteId,
      order: {
        organizationId,
      },
    },
  })

  if (!existing) {
    throw new Error('Note not found')
  }

  // Update the note
  const note = await prisma.orderNote.update({
    where: { id: noteId },
    data: { content },
  })

  // Log activity
  logActivity({
    userId,
    organizationId,
    action: 'update',
    entity: 'order',
    entityId: existing.orderId,
  })

  return transformNote(note)
}

// ============================================================================
// TRANSFORM HELPERS
// ============================================================================

type OrderNoteRecord = Prisma.OrderNoteGetPayload<object>

/**
 * Transform order note record to API-safe format
 */
function transformNote(note: OrderNoteRecord): OrderNoteEntry {
  return {
    id: note.id,
    orderId: note.orderId,
    content: note.content,
    isInternal: note.isInternal,
    createdBy: note.createdBy,
    createdAt: note.createdAt.toISOString(),
  }
}
