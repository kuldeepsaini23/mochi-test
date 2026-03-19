/**
 * Email Builder Component Exports
 *
 * Production-grade email template builder with drag-and-drop.
 *
 * SOURCE OF TRUTH KEYWORDS: EmailBuilderExports
 */

export { EmailBuilder, type EmailBuilderProps } from './email-builder'
export { useEmailBuilder, EmailBuilderProvider, createEmailBlock, createPrebuiltBlocks } from './_lib/email-builder-context'
export type { EmailBuilderState } from './_lib/email-builder-context'
