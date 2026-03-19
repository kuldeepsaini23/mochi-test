/**
 * ============================================================================
 * TEMPLATE WIZARD — Barrel Export
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: TemplateWizardExports
 *
 * WHY: Single entry point for importing the template wizard layout and its
 * associated types. Consumers import from this barrel rather than reaching
 * into individual files, keeping import paths clean and refactor-safe.
 */

export { TemplateWizardLayout } from './template-wizard-layout'
export type { TemplateWizardLayoutProps } from './template-wizard-layout'
export type { WizardFormValues } from './wizard-settings-panel'
