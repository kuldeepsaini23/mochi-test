/**
 * ============================================================================
 * INTERNAL TEMPLATE MODULE — Barrel Export
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: InternalTemplateModule, InternalTemplateExports
 *
 * WHY: Single import point for the entire internal template system.
 * Consumers import from '@/lib/templates/internal' instead of reaching
 * into individual files.
 *
 * RE-EXPORTS:
 * - Types: InternalTemplate, InternalTemplateItem, InternalTemplateInstallOptions,
 *          InternalTemplateInstallResult
 * - Orchestrator: installInternalTemplate
 * - Registry: getInternalTemplate, listInternalTemplates
 */

/* Type definitions for internal templates */
export type {
  InternalTemplate,
  InternalTemplateItem,
  InternalTemplateInstallOptions,
  InternalTemplateInstallResult,
} from './types'

/* Install orchestrator — installs an internal template into a target org */
export { installInternalTemplate } from './install-internal-template'

/* Registry — lookup and listing of registered internal templates */
export { getInternalTemplate, listInternalTemplates } from './registry'
