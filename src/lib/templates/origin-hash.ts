/**
 * ============================================================================
 * TEMPLATE SYSTEM — ORIGIN HASH & ANTI-PLAGIARISM UTILITIES
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: OriginHash, OriginMarker, AntiPlagiarism,
 * TemplateLineage, FeatureLineage, PropagateOriginMarker
 *
 * WHY: Provides cryptographic fingerprinting and lineage tracking for templates.
 * - generateOriginHash: Creates a unique SHA-256 hash to identify template origin.
 * - checkOriginMarker: Checks if a feature was installed from a template (blocks re-publishing).
 * - createOriginMarkers: Stamps newly installed features with their template lineage.
 * - propagateOriginMarker: Copies origin markers when duplicating features.
 *
 * SECURITY: Origin markers prevent users from installing a template and then
 * re-publishing the installed content as their own template.
 */

import { createHash } from 'crypto'
import { prisma } from '@/lib/config'
import type { TemplateCategory, OriginCheckResult } from './types'

// ============================================================================
// HASH GENERATION
// ============================================================================

/**
 * Generates a SHA-256 origin hash from the template's identifying data.
 * This hash uniquely fingerprints a template at creation time and is stored
 * on both the Template and its TemplateItems for lineage tracking.
 *
 * @param orgId - Organization that created the template
 * @param templateId - The template's CUID
 * @param createdAt - Template creation timestamp (ISO string or Date)
 * @returns Hex-encoded SHA-256 hash string
 */
export function generateOriginHash(
  orgId: string,
  templateId: string,
  createdAt: string | Date
): string {
  const timestamp =
    typeof createdAt === 'string' ? createdAt : createdAt.toISOString()
  const payload = `${orgId}:${templateId}:${timestamp}`

  return createHash('sha256').update(payload).digest('hex')
}

// ============================================================================
// ORIGIN MARKER QUERIES
// ============================================================================

/**
 * Checks whether a specific feature was installed from a template.
 * Used by the "Save as Template" wizard to block re-publishing installed content.
 *
 * @param featureType - The TemplateCategory of the feature to check
 * @param featureId - The feature's database ID
 * @returns OriginCheckResult indicating if the feature has a template origin
 */
export async function checkOriginMarker(
  featureType: TemplateCategory,
  featureId: string
): Promise<OriginCheckResult> {
  const marker = await prisma.templateOriginMarker.findUnique({
    where: {
      featureType_featureId: { featureType, featureId },
    },
    select: {
      templateId: true,
      installId: true,
      originHash: true,
    },
  })

  if (!marker) {
    return { isFromTemplate: false }
  }

  /** Look up the template name for display in the UI */
  const template = await prisma.template.findUnique({
    where: { id: marker.templateId },
    select: { name: true },
  })

  return {
    isFromTemplate: true,
    templateId: marker.templateId,
    templateName: template?.name ?? undefined,
    installId: marker.installId,
    originHash: marker.originHash,
  }
}

// ============================================================================
// ORIGIN MARKER CREATION
// ============================================================================

/**
 * Creates TemplateOriginMarker records for all features installed from a template.
 * Called at the end of the installation process after all features are created.
 *
 * @param items - Array of installed features with their type, new ID, and source origin hash
 * @param organizationId - Target org that installed the template
 * @param templateId - Source template ID
 * @param installId - The TemplateInstall record ID
 */
export async function createOriginMarkers(
  items: Array<{
    featureType: TemplateCategory
    featureId: string
    originHash: string
  }>,
  organizationId: string,
  templateId: string,
  installId: string
): Promise<void> {
  if (items.length === 0) return

  await prisma.templateOriginMarker.createMany({
    data: items.map((item) => ({
      organizationId,
      featureType: item.featureType,
      featureId: item.featureId,
      originHash: item.originHash,
      templateId,
      installId,
    })),
    /** Skip duplicates — a feature can only have one origin marker */
    skipDuplicates: true,
  })
}

// ============================================================================
// ORIGIN MARKER PROPAGATION (for duplicate functions)
// ============================================================================

/**
 * Propagates an origin marker from a source feature to its duplicate.
 * Called by duplicate functions (duplicateWebsite, duplicateAutomation, etc.)
 * so that copied template-installed features retain their lineage.
 *
 * If the source feature has no origin marker, this is a no-op.
 *
 * @param sourceFeatureId - The original feature's ID being duplicated
 * @param newFeatureId - The new duplicate's ID
 * @param featureType - The TemplateCategory of the feature
 * @param organizationId - Organization the duplicate belongs to
 */
export async function propagateOriginMarker(
  sourceFeatureId: string,
  newFeatureId: string,
  featureType: TemplateCategory,
  organizationId: string
): Promise<void> {
  /** Look up the source feature's origin marker */
  const sourceMarker = await prisma.templateOriginMarker.findUnique({
    where: {
      featureType_featureId: {
        featureType,
        featureId: sourceFeatureId,
      },
    },
  })

  /** No origin marker on source — nothing to propagate */
  if (!sourceMarker) return

  /** Create a matching origin marker for the duplicate */
  await prisma.templateOriginMarker.create({
    data: {
      organizationId,
      featureType,
      featureId: newFeatureId,
      originHash: sourceMarker.originHash,
      templateId: sourceMarker.templateId,
      installId: sourceMarker.installId,
    },
  })
}
