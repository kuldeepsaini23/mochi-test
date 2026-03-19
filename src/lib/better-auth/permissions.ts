/**
 * Permission Definitions for Better Auth Organization Plugin
 *
 * B2B Model: Platform → Organizations
 * Users subscribe directly to the platform and become organization owners/members.
 *
 * CRITICAL: We import and merge Better Auth's defaultStatements to prevent
 * overriding built-in permissions required for dynamic access control.
 */

import { createAccessControl } from 'better-auth/plugins/access'
import {
  defaultStatements,
  ownerAc,
} from 'better-auth/plugins/organization/access'

// ============================================================================
// ORGANIZATION STATEMENT
// ============================================================================

/**
 * Permission statement for Organizations
 * These permissions apply to organization members
 *
 * CRITICAL: Merges with Better Auth's defaultStatements to preserve built-in
 * permissions required for dynamic access control (like ac:read for roles).
 */
export const organizationStatement = {
  ...defaultStatements, // CRITICAL: Include Better Auth's built-in permissions

  // Member management
  member: ['create', 'read', 'update', 'delete'],
  invitation: ['create', 'cancel'],

  // Billing & Subscriptions
  billing: ['read', 'update', 'create', 'delete'],

  // Settings & Configuration
  'organization-settings': ['read', 'update'],
  domains: ['create', 'read', 'update', 'delete'],

  // Integrations
  integrations: ['read', 'update'],

  // Analytics
  analytics: ['read'],

  // Affiliate program
  affiliate: ['read', 'update'],

  // Content management
  websites: ['create', 'read', 'update', 'delete', 'publish'],
  funnels: ['create', 'read', 'update', 'delete', 'publish'],
  products: ['create', 'read', 'update', 'delete'],

  // Marketing
  campaigns: ['create', 'read', 'update', 'delete', 'send'],
  'email-templates': ['create', 'read', 'update', 'delete'],

  // Forms & Data
  forms: ['create', 'read', 'update', 'delete'],
  submissions: ['read', 'delete'],
  leads: ['create', 'read', 'update', 'delete', 'import', 'export'],
  'custom-fields': ['create', 'read', 'update', 'delete'],

  // CMS (Content Management System)
  cms: ['create', 'read', 'update', 'delete'], // CMS tables, columns, and rows

  // Commerce
  orders: ['read', 'update', 'cancel'],
  customers: ['create', 'read', 'update', 'delete'],
  invoices: ['create', 'read', 'update', 'delete'],
  contracts: ['create', 'read', 'update', 'delete'],
  transactions: ['read', 'update', 'cancel', 'refund'],

  // Storage & Communication
  storage: ['create', 'read', 'delete'],
  email: ['send', 'read'],

  // AI Assistant
  ai: ['use'],

  // Pipelines (Kanban boards)
  pipelines: ['create', 'read', 'update', 'delete'],

  // Ecommerce Stores
  stores: ['create', 'read', 'update', 'delete'],

  // Calendar & Scheduling
  calendar: ['create', 'read', 'update', 'delete'],

  // Automations (Workflow Builder)
  automations: ['create', 'read', 'update', 'delete', 'execute'],

  // Templates (Template Library — create, publish, browse, install)
  templates: ['create', 'read', 'update', 'delete', 'publish', 'install'],
} as const

// ============================================================================
// ACCESS CONTROL INSTANCE
// ============================================================================

/**
 * Organization Access Control
 * Used by Better Auth's organization plugin
 */
export const ac = createAccessControl(organizationStatement)

// ============================================================================
// RESOURCE METADATA (TYPE-SAFE - MUST MATCH STATEMENTS)
// ============================================================================

/**
 * Type for resource metadata
 */
type ResourceMetadata = {
  label: string
  description: string
}

/**
 * Type helper to extract resource keys from a statement
 * This ensures metadata MUST have entries for ALL resources in the statement
 */
type ResourceMetadataMap<T extends Record<string, readonly string[]>> = {
  [K in keyof T]: ResourceMetadata
}

/**
 * Metadata for organization resources
 * THIS IS THE SOURCE OF TRUTH - All UI labels and descriptions come from here
 *
 * TYPE-SAFE: TypeScript will ERROR if you add a resource to organizationStatement
 * but forget to add metadata here!
 */
export const RESOURCE_METADATA: ResourceMetadataMap<
  typeof organizationStatement
> = {
  // Better Auth built-in (not shown in UI, filtered out in helpers)
  ac: {
    label: 'Access Control',
    description: 'Manage roles and permissions (internal)',
  },
  organization: {
    label: 'Organization',
    description: 'Manage organization (Better Auth internal)',
  },
  team: {
    label: 'Team',
    description: 'Manage teams (Better Auth internal)',
  },

  // Member management
  member: {
    label: 'Member Management',
    description: 'Manage organization members and permissions',
  },
  invitation: {
    label: 'Invitation Management',
    description: 'Send and cancel member invitations',
  },

  // Billing & Subscriptions
  billing: {
    label: 'Billing & Payments',
    description: 'Manage billing, subscriptions, and payment methods',
  },

  // Settings & Configuration
  'organization-settings': {
    label: 'Organization Settings',
    description: 'Configure organization settings and preferences',
  },
  domains: {
    label: 'Domain Management',
    description: 'Manage custom domains',
  },

  // Integrations
  integrations: {
    label: 'Integrations',
    description: 'Manage third-party integrations (Stripe, etc.)',
  },

  // Analytics
  analytics: {
    label: 'Analytics',
    description: 'View performance and analytics',
  },

  // Affiliate program
  affiliate: {
    label: 'Affiliate Program',
    description: 'Manage affiliate program settings',
  },

  // Content management
  websites: {
    label: 'Website Management',
    description: 'Create and manage websites',
  },
  funnels: {
    label: 'Funnel Management',
    description: 'Create and manage funnels',
  },
  products: {
    label: 'Product Management',
    description: 'Manage products and inventory',
  },

  // Marketing
  campaigns: {
    label: 'Marketing Campaigns',
    description: 'Create and manage marketing campaigns',
  },
  'email-templates': {
    label: 'Email Templates',
    description: 'Create and manage email templates',
  },

  // Forms & Data
  forms: {
    label: 'Form Management',
    description: 'Create and manage forms',
  },
  submissions: {
    label: 'Form Submissions',
    description: 'View and manage form submissions',
  },
  leads: {
    label: 'Lead Management (CRM)',
    description: 'Manage leads and CRM data',
  },
  'custom-fields': {
    label: 'Custom Fields',
    description: 'Create and manage custom fields',
  },

  // CMS
  cms: {
    label: 'CMS (Content Management)',
    description: 'Create and manage CMS tables, columns, and data',
  },

  // Commerce
  orders: {
    label: 'Order Management',
    description: 'View and manage customer orders',
  },
  customers: {
    label: 'Customer Management',
    description: 'Manage customer accounts',
  },
  invoices: {
    label: 'Invoice Management',
    description: 'Create and manage invoices',
  },
  contracts: {
    label: 'Contract Management',
    description: 'Create and manage contracts',
  },
  transactions: {
    label: 'Transaction Management',
    description: 'View and manage payment transactions',
  },

  // Storage & Communication
  storage: {
    label: 'File Storage',
    description: 'Upload and manage files',
  },
  email: {
    label: 'Email Management',
    description: 'Send emails and view analytics',
  },

  // AI Assistant
  ai: {
    label: 'Mochi AI Assistant',
    description: 'Use the AI assistant to manage your organization',
  },

  // Pipelines
  pipelines: {
    label: 'Pipeline Management',
    description: 'Create and manage kanban boards and pipelines',
  },

  // Ecommerce Stores
  stores: {
    label: 'Ecommerce Stores',
    description: 'Create and manage ecommerce stores and product catalogs',
  },

  // Calendar & Scheduling
  calendar: {
    label: 'Calendar & Scheduling',
    description: 'View and manage calendar events, meetings, and appointments',
  },

  // Automations
  automations: {
    label: 'Automation Builder',
    description: 'Create and manage workflow automations',
  },

  // Templates
  templates: {
    label: 'Template Library',
    description: 'Create, publish, browse, and install reusable templates',
  },
}

// ============================================================================
// ORGANIZATION ROLES
// ============================================================================

/**
 * Organization Owner - Full access to all resources
 * Uses organization access control (ac)
 *
 * This is the ONLY static role. All other members get
 * dynamic permissions stored as JSON arrays in Member.role field.
 *
 * CRITICAL: Merges with Better Auth's built-in ownerAc to preserve permissions
 * required for dynamic access control.
 */
export const organizationOwner = ac.newRole({
  ...ownerAc.statements, // CRITICAL: Include Better Auth's built-in owner permissions

  // Member management
  member: ['create', 'read', 'update', 'delete'],
  invitation: ['create', 'cancel'],

  // Billing & Subscriptions
  billing: ['read', 'update', 'create', 'delete'],

  // Settings & Configuration
  'organization-settings': ['read', 'update'],
  domains: ['create', 'read', 'update', 'delete'],

  // Integrations
  integrations: ['read', 'update'],

  // Analytics
  analytics: ['read'],

  // Affiliate program
  affiliate: ['read', 'update'],

  // Content management
  websites: ['create', 'read', 'update', 'delete', 'publish'],
  funnels: ['create', 'read', 'update', 'delete', 'publish'],
  products: ['create', 'read', 'update', 'delete'],

  // Marketing
  campaigns: ['create', 'read', 'update', 'delete', 'send'],
  'email-templates': ['create', 'read', 'update', 'delete'],

  // Forms & Data
  forms: ['create', 'read', 'update', 'delete'],
  submissions: ['read', 'delete'],
  leads: ['create', 'read', 'update', 'delete', 'import', 'export'],
  'custom-fields': ['create', 'read', 'update', 'delete'],

  // CMS
  cms: ['create', 'read', 'update', 'delete'],

  // Commerce
  orders: ['read', 'update', 'cancel'],
  customers: ['create', 'read', 'update', 'delete'],
  invoices: ['create', 'read', 'update', 'delete'],
  contracts: ['create', 'read', 'update', 'delete'],
  transactions: ['read', 'update', 'cancel', 'refund'],

  // Storage & Communication
  storage: ['create', 'read', 'delete'],
  email: ['send', 'read'],

  // AI Assistant
  ai: ['use'],

  // Pipelines
  pipelines: ['create', 'read', 'update', 'delete'],

  // Ecommerce Stores
  stores: ['create', 'read', 'update', 'delete'],

  // Calendar & Scheduling
  calendar: ['create', 'read', 'update', 'delete'],

  // Automations
  automations: ['create', 'read', 'update', 'delete', 'execute'],

  // Templates
  templates: ['create', 'read', 'update', 'delete', 'publish', 'install'],
})

// ============================================================================
// ROLE COLLECTIONS
// ============================================================================

/**
 * Organization roles for Better Auth organization plugin
 * Only contains owner. All other members use dynamic JSON permissions.
 */
export const roles = {
  owner: organizationOwner,
} as const

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type RoleName = keyof typeof roles

// ============================================================================
// TYPESCRIPT PERMISSION TYPES (FOR TYPE-SAFE PERMISSION CHECKS)
// ============================================================================

/**
 * Organization resource names
 */
export type OrganizationResource = keyof typeof organizationStatement

/**
 * All possible actions across all resources
 */
export type PermissionAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'cancel'
  | 'publish'
  | 'send'
  | 'import'
  | 'export'
  | 'install'

/**
 * Type-safe permission string builder
 * Usage: permission('websites', 'read') -> 'websites:read'
 */
export function permission<R extends OrganizationResource>(
  resource: R,
  action: (typeof organizationStatement)[R][number]
): `${R}:${string}` {
  return `${resource}:${action}` as `${R}:${string}`
}

/**
 * Type-safe permission constants
 * Usage: permissions.WEBSITES_READ -> 'websites:read'
 *
 * SOURCE OF TRUTH: All permissions defined here MUST match organizationStatement
 */
export const permissions = {
  // Members
  MEMBER_CREATE: permission('member', 'create'),
  MEMBER_READ: permission('member', 'read'),
  MEMBER_UPDATE: permission('member', 'update'),
  MEMBER_DELETE: permission('member', 'delete'),

  // Invitations
  INVITATION_CREATE: permission('invitation', 'create'),
  INVITATION_CANCEL: permission('invitation', 'cancel'),

  // Billing
  BILLING_CREATE: permission('billing', 'create'),
  BILLING_READ: permission('billing', 'read'),
  BILLING_UPDATE: permission('billing', 'update'),
  BILLING_DELETE: permission('billing', 'delete'),

  // Organization Settings
  ORGANIZATION_SETTINGS_READ: permission('organization-settings', 'read'),
  ORGANIZATION_SETTINGS_UPDATE: permission('organization-settings', 'update'),

  // Domains
  DOMAINS_CREATE: permission('domains', 'create'),
  DOMAINS_READ: permission('domains', 'read'),
  DOMAINS_UPDATE: permission('domains', 'update'),
  DOMAINS_DELETE: permission('domains', 'delete'),

  // Integrations
  INTEGRATIONS_READ: permission('integrations', 'read'),
  INTEGRATIONS_UPDATE: permission('integrations', 'update'),

  // Analytics
  ANALYTICS_READ: permission('analytics', 'read'),

  // Affiliate
  AFFILIATE_READ: permission('affiliate', 'read'),
  AFFILIATE_UPDATE: permission('affiliate', 'update'),

  // Websites
  WEBSITES_CREATE: permission('websites', 'create'),
  WEBSITES_READ: permission('websites', 'read'),
  WEBSITES_UPDATE: permission('websites', 'update'),
  WEBSITES_DELETE: permission('websites', 'delete'),
  WEBSITES_PUBLISH: permission('websites', 'publish'),

  // Funnels
  FUNNELS_CREATE: permission('funnels', 'create'),
  FUNNELS_READ: permission('funnels', 'read'),
  FUNNELS_UPDATE: permission('funnels', 'update'),
  FUNNELS_DELETE: permission('funnels', 'delete'),
  FUNNELS_PUBLISH: permission('funnels', 'publish'),

  // Products
  PRODUCTS_CREATE: permission('products', 'create'),
  PRODUCTS_READ: permission('products', 'read'),
  PRODUCTS_UPDATE: permission('products', 'update'),
  PRODUCTS_DELETE: permission('products', 'delete'),

  // Campaigns
  CAMPAIGNS_CREATE: permission('campaigns', 'create'),
  CAMPAIGNS_READ: permission('campaigns', 'read'),
  CAMPAIGNS_UPDATE: permission('campaigns', 'update'),
  CAMPAIGNS_DELETE: permission('campaigns', 'delete'),
  CAMPAIGNS_SEND: permission('campaigns', 'send'),

  // Email Templates
  EMAIL_TEMPLATES_CREATE: permission('email-templates', 'create'),
  EMAIL_TEMPLATES_READ: permission('email-templates', 'read'),
  EMAIL_TEMPLATES_UPDATE: permission('email-templates', 'update'),
  EMAIL_TEMPLATES_DELETE: permission('email-templates', 'delete'),

  // Forms
  FORMS_CREATE: permission('forms', 'create'),
  FORMS_READ: permission('forms', 'read'),
  FORMS_UPDATE: permission('forms', 'update'),
  FORMS_DELETE: permission('forms', 'delete'),

  // Submissions
  SUBMISSIONS_READ: permission('submissions', 'read'),
  SUBMISSIONS_DELETE: permission('submissions', 'delete'),

  // Leads
  LEADS_CREATE: permission('leads', 'create'),
  LEADS_READ: permission('leads', 'read'),
  LEADS_UPDATE: permission('leads', 'update'),
  LEADS_DELETE: permission('leads', 'delete'),
  LEADS_IMPORT: permission('leads', 'import'),
  LEADS_EXPORT: permission('leads', 'export'),

  // Custom Fields
  CUSTOM_FIELDS_CREATE: permission('custom-fields', 'create'),
  CUSTOM_FIELDS_READ: permission('custom-fields', 'read'),
  CUSTOM_FIELDS_UPDATE: permission('custom-fields', 'update'),
  CUSTOM_FIELDS_DELETE: permission('custom-fields', 'delete'),

  // CMS
  CMS_CREATE: permission('cms', 'create'),
  CMS_READ: permission('cms', 'read'),
  CMS_UPDATE: permission('cms', 'update'),
  CMS_DELETE: permission('cms', 'delete'),

  // Orders
  ORDERS_READ: permission('orders', 'read'),
  ORDERS_UPDATE: permission('orders', 'update'),
  ORDERS_CANCEL: permission('orders', 'cancel'),

  // Customers
  CUSTOMERS_CREATE: permission('customers', 'create'),
  CUSTOMERS_READ: permission('customers', 'read'),
  CUSTOMERS_UPDATE: permission('customers', 'update'),
  CUSTOMERS_DELETE: permission('customers', 'delete'),

  // Invoices
  INVOICES_CREATE: permission('invoices', 'create'),
  INVOICES_READ: permission('invoices', 'read'),
  INVOICES_UPDATE: permission('invoices', 'update'),
  INVOICES_DELETE: permission('invoices', 'delete'),

  // Contracts
  CONTRACTS_CREATE: permission('contracts', 'create'),
  CONTRACTS_READ: permission('contracts', 'read'),
  CONTRACTS_UPDATE: permission('contracts', 'update'),
  CONTRACTS_DELETE: permission('contracts', 'delete'),

  // Transactions
  TRANSACTIONS_READ: permission('transactions', 'read'),
  TRANSACTIONS_UPDATE: permission('transactions', 'update'),
  TRANSACTIONS_CANCEL: permission('transactions', 'cancel'),
  TRANSACTIONS_REFUND: permission('transactions', 'refund'),

  // Storage
  STORAGE_CREATE: permission('storage', 'create'),
  STORAGE_READ: permission('storage', 'read'),
  STORAGE_DELETE: permission('storage', 'delete'),

  // Email
  EMAIL_SEND: permission('email', 'send'),
  EMAIL_READ: permission('email', 'read'),

  // Access Control (Better Auth internal)
  AC_CREATE: permission('ac', 'create'),
  AC_READ: permission('ac', 'read'),
  AC_UPDATE: permission('ac', 'update'),
  AC_DELETE: permission('ac', 'delete'),

  // AI Assistant
  AI_USE: permission('ai', 'use'),

  // Pipelines
  PIPELINES_CREATE: permission('pipelines', 'create'),
  PIPELINES_READ: permission('pipelines', 'read'),
  PIPELINES_UPDATE: permission('pipelines', 'update'),
  PIPELINES_DELETE: permission('pipelines', 'delete'),

  // Ecommerce Stores
  STORES_CREATE: permission('stores', 'create'),
  STORES_READ: permission('stores', 'read'),
  STORES_UPDATE: permission('stores', 'update'),
  STORES_DELETE: permission('stores', 'delete'),

  // Calendar & Scheduling
  CALENDAR_CREATE: permission('calendar', 'create'),
  CALENDAR_READ: permission('calendar', 'read'),
  CALENDAR_UPDATE: permission('calendar', 'update'),
  CALENDAR_DELETE: permission('calendar', 'delete'),

  // Automations
  AUTOMATIONS_CREATE: permission('automations', 'create'),
  AUTOMATIONS_READ: permission('automations', 'read'),
  AUTOMATIONS_UPDATE: permission('automations', 'update'),
  AUTOMATIONS_DELETE: permission('automations', 'delete'),
  AUTOMATIONS_EXECUTE: permission('automations', 'execute'),

  // Templates
  TEMPLATES_CREATE: permission('templates', 'create'),
  TEMPLATES_READ: permission('templates', 'read'),
  TEMPLATES_UPDATE: permission('templates', 'update'),
  TEMPLATES_DELETE: permission('templates', 'delete'),
  TEMPLATES_PUBLISH: permission('templates', 'publish'),
  TEMPLATES_INSTALL: permission('templates', 'install'),
} as const

/**
 * Type for any valid permission string
 * Includes wildcard '*:*' for owner roles
 */
export type Permission =
  | (typeof permissions)[keyof typeof permissions]
  | '*:*'

// ============================================================================
// DEFAULT ROLES (CLIENT-SIDE PRESETS)
// ============================================================================

/**
 * Default "admin" role with comprehensive permissions
 * This is a client-side preset that users can select from the dropdown
 * Cannot be edited or customized - reserved role
 */
export const DEFAULT_ADMIN_PERMISSIONS = [
  // Member management
  permissions.MEMBER_CREATE,
  permissions.MEMBER_READ,

  // Invitation management
  permissions.INVITATION_CREATE,
  permissions.INVITATION_CANCEL,

  // Organization settings (read-only for admin)
  permissions.ORGANIZATION_SETTINGS_READ,

  // Analytics
  permissions.ANALYTICS_READ,

  // Domains
  permissions.DOMAINS_CREATE,
  permissions.DOMAINS_READ,
  permissions.DOMAINS_UPDATE,
  permissions.DOMAINS_DELETE,

  // Integrations (read-only for admin)
  permissions.INTEGRATIONS_READ,

  // Content management
  permissions.WEBSITES_CREATE,
  permissions.WEBSITES_READ,
  permissions.WEBSITES_UPDATE,
  permissions.WEBSITES_DELETE,
  permissions.WEBSITES_PUBLISH,

  permissions.FUNNELS_CREATE,
  permissions.FUNNELS_READ,
  permissions.FUNNELS_UPDATE,
  permissions.FUNNELS_DELETE,
  permissions.FUNNELS_PUBLISH,

  permissions.PRODUCTS_CREATE,
  permissions.PRODUCTS_READ,
  permissions.PRODUCTS_UPDATE,
  permissions.PRODUCTS_DELETE,

  // Marketing
  permissions.CAMPAIGNS_CREATE,
  permissions.CAMPAIGNS_READ,
  permissions.CAMPAIGNS_UPDATE,
  permissions.CAMPAIGNS_DELETE,
  permissions.CAMPAIGNS_SEND,

  permissions.EMAIL_TEMPLATES_CREATE,
  permissions.EMAIL_TEMPLATES_READ,
  permissions.EMAIL_TEMPLATES_UPDATE,
  permissions.EMAIL_TEMPLATES_DELETE,

  // Forms & Data
  permissions.FORMS_CREATE,
  permissions.FORMS_READ,
  permissions.FORMS_UPDATE,
  permissions.FORMS_DELETE,

  permissions.SUBMISSIONS_READ,
  permissions.SUBMISSIONS_DELETE,

  permissions.LEADS_CREATE,
  permissions.LEADS_READ,
  permissions.LEADS_UPDATE,
  permissions.LEADS_DELETE,
  permissions.LEADS_IMPORT,
  permissions.LEADS_EXPORT,

  permissions.CUSTOM_FIELDS_CREATE,
  permissions.CUSTOM_FIELDS_READ,
  permissions.CUSTOM_FIELDS_UPDATE,
  permissions.CUSTOM_FIELDS_DELETE,

  // CMS
  permissions.CMS_CREATE,
  permissions.CMS_READ,
  permissions.CMS_UPDATE,
  permissions.CMS_DELETE,

  // Commerce
  permissions.ORDERS_READ,
  permissions.ORDERS_UPDATE,

  permissions.CUSTOMERS_CREATE,
  permissions.CUSTOMERS_READ,
  permissions.CUSTOMERS_UPDATE,
  permissions.CUSTOMERS_DELETE,

  permissions.INVOICES_CREATE,
  permissions.INVOICES_READ,
  permissions.INVOICES_UPDATE,
  permissions.INVOICES_DELETE,

  permissions.CONTRACTS_CREATE,
  permissions.CONTRACTS_READ,
  permissions.CONTRACTS_UPDATE,
  permissions.CONTRACTS_DELETE,

  // Transactions
  permissions.TRANSACTIONS_READ,
  permissions.TRANSACTIONS_UPDATE,

  // Storage & Communication
  permissions.STORAGE_CREATE,
  permissions.STORAGE_READ,
  permissions.STORAGE_DELETE,

  permissions.EMAIL_SEND,
  permissions.EMAIL_READ,

  // AI Assistant
  permissions.AI_USE,

  // Pipelines
  permissions.PIPELINES_CREATE,
  permissions.PIPELINES_READ,
  permissions.PIPELINES_UPDATE,
  permissions.PIPELINES_DELETE,

  // Ecommerce Stores
  permissions.STORES_CREATE,
  permissions.STORES_READ,
  permissions.STORES_UPDATE,
  permissions.STORES_DELETE,

  // Calendar & Scheduling
  permissions.CALENDAR_CREATE,
  permissions.CALENDAR_READ,
  permissions.CALENDAR_UPDATE,
  permissions.CALENDAR_DELETE,

  // Automations
  permissions.AUTOMATIONS_CREATE,
  permissions.AUTOMATIONS_READ,
  permissions.AUTOMATIONS_UPDATE,
  permissions.AUTOMATIONS_DELETE,
  permissions.AUTOMATIONS_EXECUTE,

  // Templates
  permissions.TEMPLATES_CREATE,
  permissions.TEMPLATES_READ,
  permissions.TEMPLATES_UPDATE,
  permissions.TEMPLATES_DELETE,
  permissions.TEMPLATES_PUBLISH,
  permissions.TEMPLATES_INSTALL,

  // NOTE: Billing is excluded - reserved for owner only
  // NOTE: integrations:update is excluded - reserved for owner only
  // NOTE: Affiliate is excluded - reserved for owner only
] as const

/**
 * Reserved role names that cannot be used for custom roles
 */
export const RESERVED_ROLE_NAMES = ['admin', 'owner'] as const

/**
 * Reserved prefixes that cannot be used for custom roles
 */
export const RESERVED_ROLE_PREFIXES = ['custom-'] as const
