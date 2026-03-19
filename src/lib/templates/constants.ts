/**
 * ============================================================================
 * TEMPLATE SYSTEM — CONSTANTS
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: TEMPLATE_CATEGORY_META, SANITIZATION_CONFIG,
 * TEMPLATE_FEATURE_PERMISSIONS, TemplateCategoryConstants
 *
 * WHY: Centralized constants for template category display metadata, sanitization
 * rules, and feature permission mapping. Used by both the UI (sidebar, cards) and
 * the service layer (snapshot creation, permission checks).
 */

import {
  Globe,
  Mail,
  Zap,
  FileInput,
  FileSignature,
  Kanban,
  Calendar,
  MessageCircle,
  Database,
  Package,
  Layers,
} from 'lucide-react'

import type {
  TemplateCategory,
  TemplateCategoryMeta,
  TemplateSortOption,
} from './types'
import { permissions } from '@/lib/better-auth/permissions'

// ============================================================================
// CATEGORY METADATA — Display names, icons, and descriptions per category
// ============================================================================

/**
 * Maps each TemplateCategory to its display metadata.
 * Used by the sidebar, category badges, feature type selectors, and cards.
 */
export const TEMPLATE_CATEGORY_META: Record<TemplateCategory, TemplateCategoryMeta> = {
  WEBSITE: {
    label: 'Website',
    description: 'Full website with pages, components, and layout',
    icon: Globe,
  },
  EMAIL: {
    label: 'Email',
    description: 'Email template with content and styling',
    icon: Mail,
  },
  AUTOMATION: {
    label: 'Automation',
    description: 'Automation workflow with triggers and actions',
    icon: Zap,
  },
  FORM: {
    label: 'Form',
    description: 'Form with fields and validation rules',
    icon: FileInput,
  },
  CONTRACT: {
    label: 'Contract',
    description: 'Contract template with variables and content',
    icon: FileSignature,
  },
  PIPELINE: {
    label: 'Pipeline',
    description: 'Pipeline with stages and lane configuration',
    icon: Kanban,
  },
  BOOKING: {
    label: 'Booking',
    description: 'Booking calendar with availability settings',
    icon: Calendar,
  },
  CHAT_WIDGET: {
    label: 'Chat Widget',
    description: 'Chat widget with FAQs and configuration',
    icon: MessageCircle,
  },
  CMS_SCHEMA: {
    label: 'CMS Schema',
    description: 'CMS table structure with column definitions',
    icon: Database,
  },
  PRODUCT: {
    label: 'Product',
    description: 'Product with pricing and feature list',
    icon: Package,
  },
  BLUEPRINT: {
    label: 'Blueprint',
    description: 'Full organization blueprint with multiple features',
    icon: Layers,
  },
} as const

/**
 * Ordered list of all template categories for UI rendering.
 * Determines the display order in sidebars and selectors.
 */
export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  'WEBSITE',
  'EMAIL',
  'AUTOMATION',
  'FORM',
  'CONTRACT',
  'PIPELINE',
  'BOOKING',
  'CHAT_WIDGET',
  'CMS_SCHEMA',
  'PRODUCT',
  'BLUEPRINT',
]

// ============================================================================
// SORT OPTIONS — For template library grid
// ============================================================================

/** Available sort options with display labels */
export const TEMPLATE_SORT_OPTIONS: Array<{
  value: TemplateSortOption
  label: string
}> = [
  { value: 'newest', label: 'Newest' },
  { value: 'popular', label: 'Most Popular' },
  { value: 'name', label: 'Name (A-Z)' },
]

// ============================================================================
// SANITIZATION CONFIG — Per-feature field inclusion/exclusion rules
// ============================================================================

/**
 * Defines which fields are safe to include in snapshots per feature type.
 * Used by the snapshot sanitizer to strip PII and sensitive data.
 *
 * NEVER include: lead data, messages, Stripe IDs, team member info,
 * customer invoices, form submissions, CMS row data, pipeline tickets.
 */
export const SANITIZATION_CONFIG: Record<
  TemplateCategory,
  { include: string[]; exclude: string[] }
> = {
  WEBSITE: {
    include: ['name', 'description', 'pages', 'localComponents', 'settings'],
    exclude: ['domainId', 'folderId', 'organizationId'],
  },
  EMAIL: {
    include: ['name', 'subject', 'content', 'previewText'],
    exclude: ['organizationId', 'sentCount', 'lastSentAt'],
  },
  AUTOMATION: {
    include: ['name', 'description', 'triggerType', 'triggerConfig', 'schema'],
    exclude: ['organizationId', 'lastRunAt', 'runCount'],
  },
  FORM: {
    include: ['name', 'description', 'config'],
    exclude: ['organizationId', 'submissions'],
  },
  CONTRACT: {
    include: ['name', 'description', 'content', 'variables'],
    exclude: ['organizationId', 'recipientId', 'signedAt', 'sentAt'],
  },
  PIPELINE: {
    include: ['name', 'lanes'],
    exclude: ['organizationId', 'tickets'],
  },
  BOOKING: {
    include: ['name', 'description', 'availability', 'duration', 'bufferTime'],
    exclude: ['organizationId', 'assignees', 'appointments'],
  },
  CHAT_WIDGET: {
    include: ['name', 'config', 'faqs'],
    exclude: ['organizationId', 'conversations'],
  },
  CMS_SCHEMA: {
    include: ['name', 'columns'],
    exclude: ['organizationId', 'rows'],
  },
  PRODUCT: {
    include: ['name', 'description', 'image', 'prices', 'features'],
    exclude: ['organizationId', 'stripeProductId', 'stripePriceId'],
  },
  BLUEPRINT: {
    include: [],
    exclude: [],
  },
}

// ============================================================================
// FEATURE PERMISSIONS — Maps feature types to required read permissions
// ============================================================================

/**
 * Maps each template category to the permission required to snapshot that feature.
 * Used by the service layer to verify the user has access before creating a snapshot.
 *
 * Uses actual permission constants from the centralized permissions module to ensure
 * type safety and prevent typos.
 */
export const TEMPLATE_FEATURE_PERMISSIONS: Record<TemplateCategory, string> = {
  WEBSITE: permissions.WEBSITES_READ,
  EMAIL: permissions.EMAIL_TEMPLATES_READ,
  AUTOMATION: permissions.AUTOMATIONS_READ,
  FORM: permissions.FORMS_READ,
  CONTRACT: permissions.CONTRACTS_READ,
  PIPELINE: permissions.PIPELINES_READ,
  BOOKING: permissions.CALENDAR_READ,
  CHAT_WIDGET: permissions.WEBSITES_READ, // Chat widgets are part of the websites feature
  CMS_SCHEMA: permissions.CMS_READ,
  PRODUCT: permissions.PRODUCTS_READ,
  BLUEPRINT: permissions.TEMPLATES_READ,
}

// ============================================================================
// FEATURE GATE MAPPING — Links TemplateCategory to the feature gate system
// ============================================================================

/**
 * Maps each TemplateCategory to its corresponding feature gate key.
 * Uses the existing feature gate system (SOURCE OF TRUTH: feature-gates.ts).
 *
 * `null` = no gate exists yet for this category. When a new gate is added
 * to FEATURES.organization, just update this map — the rest is dynamic.
 *
 * Used by:
 * - Server-side install validation (checkFeatureGate per category)
 * - Client-side pre-flight warnings (useFeatureGates hook)
 * - Post-install usage increment (incrementUsage per category)
 *
 * SOURCE OF TRUTH KEYWORDS: TemplateCategoryGateMap, TemplateFeatureGateKey
 */
export const TEMPLATE_CATEGORY_GATE_KEY: Record<TemplateCategory, string | null> = {
  WEBSITE: 'websites.limit',
  EMAIL: 'email_templates.limit',
  AUTOMATION: null,    // No gate yet — will be added in future PR
  FORM: 'forms.limit',
  CONTRACT: null,      // No gate yet — will be added in future PR
  PIPELINE: 'pipelines.limit',
  BOOKING: null,       // No gate yet — will be added in future PR
  CHAT_WIDGET: 'chat_widgets.limit',
  CMS_SCHEMA: 'cms_tables.limit',
  PRODUCT: 'products.limit',
  BLUEPRINT: null,     // Meta-category — individual items are gated by their own types
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

/** Default page size for template library pagination */
export const TEMPLATE_PAGE_SIZE = 12

/** Maximum number of tags allowed per template */
export const TEMPLATE_MAX_TAGS = 10

/** Maximum template name length */
export const TEMPLATE_NAME_MAX_LENGTH = 100

/** Maximum template description length */
export const TEMPLATE_DESCRIPTION_MAX_LENGTH = 500
