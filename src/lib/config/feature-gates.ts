/**
 * FEATURE GATES - SINGLE SOURCE OF TRUTH
 *
 * ============================================================================
 * B2B MODEL - PLATFORM TO ORGANIZATION
 * ============================================================================
 *
 * Users subscribe directly to the platform and become organization owners.
 * All features are at the organization level - no client/team tier separation.
 *
 * ============================================================================
 * FEATURE TYPES:
 * ============================================================================
 *
 * LIMIT: Hard caps (10 websites max, 50 funnels max)
 * BOOLEAN: On/off toggles (white label, custom domain)
 * PAYG: Pay-per-use unlimited (emails, calls, AI)
 */

const UNLIMITED = -1

// ============================================================================
// SOURCE OF TRUTH TYPES - Feature Definitions
// ============================================================================

/**
 * SOURCE OF TRUTH: FeatureType
 * Defines the four types of features in the system
 *
 * - limit: Hard caps (e.g., 10 websites max)
 * - boolean: On/off toggles (e.g., custom domain enabled)
 * - payg: Pay-per-use unlimited (e.g., emails at $0.01 each)
 * - percentage: Percentage-based fees (e.g., 5% platform fee)
 */
type FeatureType = 'limit' | 'boolean' | 'payg' | 'percentage'

/**
 * SOURCE OF TRUTH: BaseFeatureDefinition
 * Common properties shared by all feature types
 */
interface BaseFeatureDefinition {
  /** Display name of the feature */
  name: string
  /** Feature type discriminator */
  type: FeatureType
  /** Whether available during free trial period */
  availableOnFreeTrial: boolean
}

/**
 * SOURCE OF TRUTH: LimitFeatureDefinition
 * For features with hard caps (e.g., 10 websites max)
 */
interface LimitFeatureDefinition extends BaseFeatureDefinition {
  type: 'limit'
  /** Description of the limit */
  description: string
  /** Upgrade message for tier 1 users */
  upgradeMessageTier1: string
  /** Upgrade message for tier 2+ users */
  upgradeMessageTier2Plus: string
}

/**
 * SOURCE OF TRUTH: BooleanFeatureDefinition
 * For on/off toggle features (e.g., custom domain enabled)
 */
interface BooleanFeatureDefinition extends BaseFeatureDefinition {
  type: 'boolean'
  /** Description of the feature */
  description: string
}

/**
 * SOURCE OF TRUTH: PaygFeatureDefinition
 * For pay-as-you-go unlimited features (e.g., emails at $0.01 each)
 */
interface PaygFeatureDefinition extends BaseFeatureDefinition {
  type: 'payg'
  /** Cost per unit in dollars (e.g., 0.01 = $0.01) */
  cost: number
}

/**
 * SOURCE OF TRUTH: PercentageFeatureDefinition
 * For percentage-based features (e.g., 5% platform transaction fee)
 *
 * WHY: Platform fees vary by tier and should be displayed in the upgrade modal
 * so users can compare costs across plans
 *
 * HOW: The percentage value is stored in the plan's features as a decimal
 * (e.g., 0.10 = 10%, 0.05 = 5%)
 */
interface PercentageFeatureDefinition extends BaseFeatureDefinition {
  type: 'percentage'
  /** Description of the percentage fee */
  description: string
  /**
   * Whether lower is better (true for fees, false for discounts)
   * WHY: Helps UI display comparison correctly (green for lower fee)
   */
  lowerIsBetter: boolean
}

/**
 * SOURCE OF TRUTH: FeatureDefinition
 * Union of all feature definition types
 */
type FeatureDefinition =
  | LimitFeatureDefinition
  | BooleanFeatureDefinition
  | PaygFeatureDefinition
  | PercentageFeatureDefinition

/**
 * SOURCE OF TRUTH: StripePriceConfig
 * Configuration for Stripe price IDs (monthly and yearly)
 */
interface StripePriceConfig {
  /** Stripe Price ID for monthly billing (undefined if not available) */
  monthly: string | undefined
  /** Stripe Price ID for yearly billing (undefined if not available) */
  yearly: string | undefined
}

/**
 * SOURCE OF TRUTH: LucideIconName
 * Valid Lucide icon names used for plan icons
 */
type LucideIconName = 'Package' | 'Rocket' | 'Zap' | 'Building' | 'Shield'

/**
 * SOURCE OF TRUTH: PlanDefinition
 * Complete structure for a subscription plan
 */
interface PlanDefinition<
  T extends Record<string, number | boolean> = Record<string, number | boolean>,
> {
  /** Display name of the plan */
  name: string
  /** Lucide icon name for the plan */
  icon: LucideIconName
  /** Whether to show this plan in the UI */
  showPlan: boolean
  /** Stripe price configuration */
  stripe: StripePriceConfig
  /** Number of trial days (0 = no trial) */
  trialDays: number
  /** Feature values for this plan */
  features: T
}

/**
 * SOURCE OF TRUTH: PlanKeyLiteral
 * Literal type for all plan keys - defined here to be used before PLANS is defined
 *
 * IMPORTANT: This MUST match the keys in the PLANS object.
 * If you add a new plan, add it here too.
 */
type PlanKeyLiteral = 'free' | 'starter' | 'pro' | 'enterprise' | 'portal'

/**
 * SOURCE OF TRUTH: TierPricingEntry
 * Pricing for a single PAYG feature across all tiers (in dollars)
 *
 * WHY: Ensures all tiers are defined for each PAYG feature
 */
type TierPricingEntry = Record<PlanKeyLiteral, number>

/**
 * SOURCE OF TRUTH: TransactionFeeEntry
 * Transaction fee configuration for a single tier
 */
interface TransactionFeeEntry {
  /** Platform fee as a decimal (0.10 = 10%) */
  percentage: number
  /** Fixed fee in cents */
  fixedCents: number
}

/**
 * SOURCE OF TRUTH: PaygFeatureKey
 * Keys for all pay-as-you-go features that support tier-based pricing
 *
 * WHY: Defined at the top to be used in type definitions
 * NOTE: Must match the '.payg' suffixed keys in FEATURES.organization
 */
type PaygFeatureKey = 'emails.payg' | 'ai_credits.payg'

// ============================================================================
// ENVIRONMENT VARIABLE VALIDATION
// ============================================================================

function validateEnvironmentVariables() {
  const missingVars: string[] = []

  // Required Stripe price IDs for paid plans
  // NOTE: Must use direct references for Next.js to properly inject env vars
  if (!process.env.NEXT_PUBLIC_STARTER_PRICE_MONTHLY)
    missingVars.push('NEXT_PUBLIC_STARTER_PRICE_MONTHLY')
  if (!process.env.NEXT_PUBLIC_STARTER_PRICE_YEARLY)
    missingVars.push('NEXT_PUBLIC_STARTER_PRICE_YEARLY')
  if (!process.env.NEXT_PUBLIC_PRO_PRICE_MONTHLY)
    missingVars.push('NEXT_PUBLIC_PRO_PRICE_MONTHLY')
  if (!process.env.NEXT_PUBLIC_PRO_PRICE_YEARLY)
    missingVars.push('NEXT_PUBLIC_PRO_PRICE_YEARLY')
  if (!process.env.NEXT_PUBLIC_ENTERPRISE_PRICE_MONTHLY)
    missingVars.push('NEXT_PUBLIC_ENTERPRISE_PRICE_MONTHLY')
  if (!process.env.NEXT_PUBLIC_ENTERPRISE_PRICE_YEARLY)
    missingVars.push('NEXT_PUBLIC_ENTERPRISE_PRICE_YEARLY')

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}\n` +
        `Please configure these variables in your .env file.`,
    )
  }
}

// Run validation immediately when module loads
validateEnvironmentVariables()

// ============================================================================
// DEFINE ALL FEATURES (single source of truth)
// ============================================================================
//
// HOW TO ADD A NEW FEATURE:
// 1. Add the feature definition below under the correct type section (LIMIT, BOOLEAN, PAYG, PERCENTAGE)
// 2. Add tier limits in each plan's `features` object (further down in this file)
//    - LIMIT features: set the numeric cap per tier (use UNLIMITED = -1 for no cap)
//    - BOOLEAN features: set true/false per tier
// 3. For LIMIT features enforced in tRPC routers:
//    a. Add `requireFeature: 'your_feature.limit'` to `organizationProcedure()` for simple create mutations
//    b. Call `incrementUsageAndInvalidate()` after successful creation in the handler
//    c. Call `decrementUsageAndInvalidate()` after successful deletion in the handler
//    d. Add mutation mappings in `src/lib/config/feature-gate-mutations.ts` for optimistic UI
// 4. The FeatureKey type is auto-derived from this object — no manual type updates needed
// ============================================================================

export const FEATURES = {
  /**
   * Organization Features - Single Source of Truth
   *
   * All feature gates are defined here and enforced at the organization level.
   * Features are categorized into four types:
   * - LIMIT: Hard caps that track usage (e.g., 10 websites max)
   * - BOOLEAN: On/off toggles (e.g., custom domain enabled)
   * - PAYG: Pay-as-you-go unlimited features (e.g., emails at $0.01 each)
   * - PERCENTAGE: Percentage-based fees (e.g., 5% platform fee)
   */
  organization: {
    // =========================================================================
    // LIMIT FEATURES - Hard caps with usage tracking
    // =========================================================================

    /**
     * Websites - Core limit for number of websites an organization can create
     */
    'websites.limit': {
      name: 'Websites',
      type: 'limit',
      description: 'Maximum number of websites you can create',
      upgradeMessageTier1: 'Upgrade to {nextPlan} to get more websites',
      upgradeMessageTier2Plus:
        'Upgrade to {nextPlan} for more websites and advanced features',
      availableOnFreeTrial: true,
    },

    /**
     * Pages Per Website - Limits pages within each website
     */
    'pages_per_website.limit': {
      name: 'Pages Per Website',
      type: 'limit',
      description: 'Maximum number of pages per website',
      upgradeMessageTier1: 'Upgrade to {nextPlan} to create more pages',
      upgradeMessageTier2Plus:
        'Upgrade to {nextPlan} for more pages and advanced builder features',
      availableOnFreeTrial: true,
    },

    /**
     * Forms - Lead capture forms created via form builder
     */
    'forms.limit': {
      name: 'Forms',
      type: 'limit',
      description: 'Maximum number of forms you can create',
      upgradeMessageTier1: 'Upgrade to {nextPlan} to get more forms',
      upgradeMessageTier2Plus:
        'Upgrade to {nextPlan} for more forms and lead capture features',
      availableOnFreeTrial: true,
    },

    /**
     * Products - Ecommerce products in the catalog
     */
    'products.limit': {
      name: 'Products',
      type: 'limit',
      description: 'Maximum number of products you can create',
      upgradeMessageTier1: 'Upgrade to {nextPlan} to add more products',
      upgradeMessageTier2Plus:
        'Upgrade to {nextPlan} for a larger product catalog',
      availableOnFreeTrial: true,
    },

    /**
     * Leads - CRM contacts/leads stored in the system
     */
    'leads.limit': {
      name: 'Leads',
      type: 'limit',
      description: 'Maximum number of leads you can store',
      upgradeMessageTier1: 'Upgrade to {nextPlan} to store more leads',
      upgradeMessageTier2Plus:
        'Upgrade to {nextPlan} for expanded CRM capacity',
      availableOnFreeTrial: true,
    },

    /**
     * CMS Tables - Dynamic content tables for websites
     */
    'cms_tables.limit': {
      name: 'CMS Tables',
      type: 'limit',
      description: 'Maximum number of CMS tables you can create',
      upgradeMessageTier1: 'Upgrade to {nextPlan} to create more CMS tables',
      upgradeMessageTier2Plus:
        'Upgrade to {nextPlan} for advanced content management',
      availableOnFreeTrial: true,
    },

    /**
     * Storage - File storage capacity in kilobytes for precise tracking
     */
    'storage_kb.limit': {
      name: 'Storage',
      type: 'limit',
      description: 'Maximum storage space in kilobytes',
      upgradeMessageTier1: 'Upgrade to {nextPlan} to get more storage',
      upgradeMessageTier2Plus:
        'Upgrade to {nextPlan} for expanded storage capacity',
      availableOnFreeTrial: true,
    },

    /**
     * Chat Widgets - AI chatbots for websites
     */
    'chat_widgets.limit': {
      name: 'Chat Widgets',
      type: 'limit',
      description: 'Maximum number of chat widgets you can create',
      upgradeMessageTier1: 'Upgrade to {nextPlan} to add more chat widgets',
      upgradeMessageTier2Plus:
        'Upgrade to {nextPlan} for more chatbots and AI features',
      availableOnFreeTrial: true,
    },

    /**
     * Pipelines - Sales/workflow pipelines (Kanban boards)
     */
    'pipelines.limit': {
      name: 'Pipelines',
      type: 'limit',
      description: 'Maximum number of pipelines you can create',
      upgradeMessageTier1: 'Upgrade to {nextPlan} to create more pipelines',
      upgradeMessageTier2Plus:
        'Upgrade to {nextPlan} for advanced sales workflows',
      availableOnFreeTrial: true,
    },

    /**
     * Tickets - Pipeline tickets/deals across all pipelines
     */
    'tickets.limit': {
      name: 'Tickets',
      type: 'limit',
      description: 'Maximum number of pipeline tickets you can create',
      upgradeMessageTier1: 'Upgrade to {nextPlan} to add more tickets',
      upgradeMessageTier2Plus:
        'Upgrade to {nextPlan} for unlimited deal tracking',
      availableOnFreeTrial: true,
    },

    /**
     * Team Seats - Number of team members that can be invited
     */
    'team_seats.limit': {
      name: 'Team Seats',
      type: 'limit',
      description: 'Maximum number of team members you can invite',
      upgradeMessageTier1: 'Upgrade to {nextPlan} to add more team members',
      upgradeMessageTier2Plus:
        'Upgrade to {nextPlan} for more team seats and collaboration features',
      availableOnFreeTrial: true,
    },

    /**
     * Email Templates - Reusable email templates for campaigns
     */
    'email_templates.limit': {
      name: 'Email Templates',
      type: 'limit',
      description: 'Maximum number of email templates you can create',
      upgradeMessageTier1: 'Upgrade to {nextPlan} to create more templates',
      upgradeMessageTier2Plus:
        'Upgrade to {nextPlan} for advanced email marketing',
      availableOnFreeTrial: true,
    },

    /**
     * Email Domains - Custom domains for sending emails via Resend
     */
    'email_domains.limit': {
      name: 'Email Domains',
      type: 'limit',
      description: 'Maximum number of custom email domains',
      upgradeMessageTier1: 'Upgrade to {nextPlan} to add custom email domains',
      upgradeMessageTier2Plus:
        'Upgrade to {nextPlan} for multi-brand email sending',
      availableOnFreeTrial: false,
    },

    /**
     * Automations - Workflow automation rules
     */
    'automations.limit': {
      name: 'Automations',
      type: 'limit',
      description: 'Maximum number of automation workflows',
      upgradeMessageTier1: 'Upgrade to {nextPlan} to create more automations',
      upgradeMessageTier2Plus:
        'Upgrade to {nextPlan} for unlimited automation workflows',
      availableOnFreeTrial: true,
    },

    /**
     * Contracts - Digital contracts and agreements
     */
    'contracts.limit': {
      name: 'Contracts',
      type: 'limit',
      description: 'Maximum number of contracts',
      upgradeMessageTier1: 'Upgrade to {nextPlan} to create more contracts',
      upgradeMessageTier2Plus:
        'Upgrade to {nextPlan} for unlimited contract management',
      availableOnFreeTrial: true,
    },

    /**
     * Invoices - Billing invoices sent to leads
     */
    'invoices.limit': {
      name: 'Invoices',
      type: 'limit',
      description: 'Maximum number of invoices',
      upgradeMessageTier1: 'Upgrade to {nextPlan} to send more invoices',
      upgradeMessageTier2Plus:
        'Upgrade to {nextPlan} for unlimited invoicing',
      availableOnFreeTrial: true,
    },

    /**
     * Stores - Ecommerce store catalogs
     */
    'stores.limit': {
      name: 'Stores',
      type: 'limit',
      description: 'Maximum number of stores',
      upgradeMessageTier1: 'Upgrade to {nextPlan} to create more stores',
      upgradeMessageTier2Plus:
        'Upgrade to {nextPlan} for unlimited ecommerce stores',
      availableOnFreeTrial: true,
    },

    /**
     * Calendars - Booking calendars for appointments
     */
    'calendars.limit': {
      name: 'Calendars',
      type: 'limit',
      description: 'Maximum number of booking calendars',
      upgradeMessageTier1: 'Upgrade to {nextPlan} to add more booking calendars',
      upgradeMessageTier2Plus:
        'Upgrade to {nextPlan} for unlimited scheduling',
      availableOnFreeTrial: true,
    },

    /**
     * Local Components - Saved reusable website components
     */
    'local_components.limit': {
      name: 'Saved Components',
      type: 'limit',
      description: 'Maximum number of saved local components',
      upgradeMessageTier1: 'Upgrade to {nextPlan} to save more components',
      upgradeMessageTier2Plus:
        'Upgrade to {nextPlan} for unlimited reusable components',
      availableOnFreeTrial: true,
    },

    // =========================================================================
    // BOOLEAN FEATURES - On/off toggles
    // =========================================================================

    /**
     * Custom Domain - Connect your own domain to websites
     */
    custom_domain: {
      name: 'Custom Domain',
      type: 'boolean',
      description: 'Connect your own domain to your websites',
      availableOnFreeTrial: false,
    },

    /**
     * Custom Branding - Remove "Powered by" badge from widgets/embeds
     * When false: Badge shows on chat widgets, forms, etc.
     * When true: Organization can remove/customize branding
     */
    custom_branding: {
      name: 'Custom Branding',
      type: 'boolean',
      description: 'Remove or customize platform branding on your assets',
      availableOnFreeTrial: false,
    },

    /**
     * Analytics - Access to analytics dashboard and insights
     */
    analytics: {
      name: 'Analytics',
      type: 'boolean',
      description: 'Access to analytics dashboard and performance insights',
      availableOnFreeTrial: true,
    },

    /**
     * Dynamic Pages - Create CMS-connected dynamic pages
     * WHY: Dynamic pages require CMS tables and advanced routing
     * Available on Starter+ tiers only (not free tier)
     */
    dynamic_pages: {
      name: 'Dynamic Pages',
      type: 'boolean',
      description: 'Create dynamic pages connected to CMS tables for data-driven content',
      availableOnFreeTrial: false,
    },

    // =========================================================================
    // PAYG FEATURES - Pay-as-you-go unlimited (available on ALL plans)
    // =========================================================================

    /**
     * Emails - Transactional and marketing emails via Resend
     * Cost varies by tier - see TIER_SPECIFIC_PRICING
     */
    'emails.payg': {
      name: 'Emails',
      type: 'payg',
      cost: 0.01, // Default cost, actual cost from TIER_SPECIFIC_PRICING
      availableOnFreeTrial: true,
    },

    /**
     * AI Credits - AI-powered features (chatbot responses, content generation)
     * Cost varies by tier - see TIER_SPECIFIC_PRICING
     */
    'ai_credits.payg': {
      name: 'AI Credits',
      type: 'payg',
      cost: 0.001, // Default cost, actual cost from TIER_SPECIFIC_PRICING
      availableOnFreeTrial: true,
    },

    // =========================================================================
    // PERCENTAGE FEATURES - Percentage-based fees/discounts
    // =========================================================================

    /**
     * Platform Transaction Fee - Fee charged on payment transactions
     *
     * SOURCE OF TRUTH: PlatformTransactionFee, platform_fee.percentage
     *
     * WHY: Users need to compare transaction fees across plans when upgrading
     * HOW: Value is a decimal (0.10 = 10%, 0.05 = 5%)
     *
     * NOTE: This is the PLATFORM fee, not the Stripe processing fee.
     * Stripe processing fees (2.9% + $0.30) are separate and always apply.
     */
    'platform_fee.percentage': {
      name: 'Platform Transaction Fee',
      type: 'percentage',
      description:
        'Fee charged on payment transactions processed through the platform',
      lowerIsBetter: true,
      availableOnFreeTrial: true,
    },
  },
} as const

// ============================================================================
// TYPESCRIPT MAGIC - Auto-derive types from FEATURES
// ============================================================================

type FeatureKey = keyof typeof FEATURES.organization
type FeatureValue = number | boolean

// TypeScript FORCES you to define ALL features (no missing keys allowed!)
type OrganizationFeatures = Record<FeatureKey, FeatureValue>

// ============================================================================
// PLATFORM CONFIGURATION
// ============================================================================

export const PLATFORM_CONFIG = {
  acceptPaymentForFreePlan:
    process.env.NEXT_PUBLIC_ACCEPT_PAYMENT_FOR_FREE_PLAN === 'true',
} as const

// ============================================================================
// DEFINE PLANS (TypeScript enforces all features defined)
// ============================================================================

export const PLANS = {
  /**
   * FREE TIER
   * Target: Solo entrepreneurs testing the platform
   * Limits are tight to encourage upgrade, but PAYG is enabled for revenue
   */
  free: {
    name: process.env.NEXT_PUBLIC_FREE_NAME || 'Free',
    icon: 'Package',
    showPlan: process.env.NEXT_PUBLIC_FREE_SHOW_PLAN === 'true',
    stripe: {
      monthly: undefined as string | undefined,
      yearly: undefined as string | undefined,
    },
    trialDays: parseInt(process.env.NEXT_PUBLIC_FREE_TRIAL_DAYS || '0', 10),

    features: {
      // Limit features - tight caps to encourage upgrade
      'websites.limit': 1,
      'pages_per_website.limit': 1,
      'forms.limit': 2,
      'products.limit': UNLIMITED,
      'leads.limit': 100,
      'cms_tables.limit': 0,
      'storage_kb.limit': 10240000, // 10 GB in KB
      'chat_widgets.limit': 1,
      'pipelines.limit': 1,
      'tickets.limit': 50,
      'team_seats.limit': 1,
      'email_templates.limit': 2,
      'email_domains.limit': 1,
      'automations.limit': UNLIMITED,
      'contracts.limit': UNLIMITED,
      'invoices.limit': UNLIMITED,
      'stores.limit': UNLIMITED,
      'calendars.limit': UNLIMITED,
      'local_components.limit': UNLIMITED,
      // Boolean features - basic only
      custom_domain: false,
      custom_branding: false, // Shows "Powered by" badge
      analytics: true,

      dynamic_pages: false, // Not available on free tier
      // PAYG features - ALL enabled for revenue
      'emails.payg': true,
      'ai_credits.payg': true,
      // Percentage features - Platform transaction fees
      'platform_fee.percentage': 0.1, // 10% platform fee
    } satisfies OrganizationFeatures,
  },

  /**
   * STARTER TIER (Freelancer)
   * Target: Growing businesses, solo agencies
   * Custom domain unlocked, expanded limits, analytics enabled
   */
  starter: {
    name: process.env.NEXT_PUBLIC_STARTER_NAME || 'Starter',
    icon: 'Rocket',
    showPlan: process.env.NEXT_PUBLIC_STARTER_SHOW_PLAN !== 'false',
    stripe: {
      monthly: process.env.NEXT_PUBLIC_STARTER_PRICE_MONTHLY as
        | string
        | undefined,
      yearly: process.env.NEXT_PUBLIC_STARTER_PRICE_YEARLY as
        | string
        | undefined,
    },
    trialDays: parseInt(process.env.NEXT_PUBLIC_STARTER_TRIAL_DAYS || '0', 10),

    features: {
      // Limit features - expanded for growing businesses
      'websites.limit': 3,
      'pages_per_website.limit': 20,
      'forms.limit': UNLIMITED,
      'products.limit': UNLIMITED,
      'leads.limit': UNLIMITED,
      'cms_tables.limit': 10,
      'storage_kb.limit': 10240000, // 10 GB in KB
      'chat_widgets.limit': 3,
      'pipelines.limit': 3,
      'tickets.limit': 100,
      'team_seats.limit': 3,
      'email_templates.limit': UNLIMITED,
      'email_domains.limit': 1,
      'automations.limit': UNLIMITED,
      'contracts.limit': UNLIMITED,
      'invoices.limit': UNLIMITED,
      'stores.limit': UNLIMITED,
      'calendars.limit': UNLIMITED,
      'local_components.limit': UNLIMITED,
      // Boolean features - custom domain unlocked
      custom_domain: true,
      custom_branding: true,
      analytics: true,

      dynamic_pages: true, // Available on Starter+
      // PAYG features - ALL enabled
      'emails.payg': true,
      'ai_credits.payg': true,
      // Percentage features - Platform transaction fees
      'platform_fee.percentage': 0.07, // 7% platform fee
    } satisfies OrganizationFeatures,
  },

  /**
   * PRO TIER (Agency)
   * Target: Agencies, growing teams, professional use
   * White label (remove branding), larger team, expanded limits
   */
  pro: {
    name: process.env.NEXT_PUBLIC_PRO_NAME || 'Professional',
    icon: 'Zap',
    showPlan: process.env.NEXT_PUBLIC_PRO_SHOW_PLAN !== 'false',
    stripe: {
      monthly: process.env.NEXT_PUBLIC_PRO_PRICE_MONTHLY as string | undefined,
      yearly: process.env.NEXT_PUBLIC_PRO_PRICE_YEARLY as string | undefined,
    },
    trialDays: parseInt(process.env.NEXT_PUBLIC_PRO_TRIAL_DAYS || '0', 10),

    features: {
      // Limit features - professional capacity (higher than Starter)
      'websites.limit': 15,
      'pages_per_website.limit': UNLIMITED,
      'forms.limit': UNLIMITED,
      'products.limit': UNLIMITED,
      'leads.limit': UNLIMITED,
      'cms_tables.limit': UNLIMITED,
      'storage_kb.limit': 25600000, // 25 GB in KB
      'chat_widgets.limit': 10,
      'pipelines.limit': 10,
      'tickets.limit': UNLIMITED,
      'team_seats.limit': 10,
      'email_templates.limit': UNLIMITED,
      'email_domains.limit': 5,
      'automations.limit': UNLIMITED,
      'contracts.limit': UNLIMITED,
      'invoices.limit': UNLIMITED,
      'stores.limit': UNLIMITED,
      'calendars.limit': UNLIMITED,
      'local_components.limit': UNLIMITED,
      // Boolean features - all unlocked
      custom_domain: true,
      custom_branding: true,
      analytics: true,

      dynamic_pages: true, // Available on Starter+
      // PAYG features - ALL enabled
      'emails.payg': true,
      'ai_credits.payg': true,
      // Percentage features - Platform transaction fees
      'platform_fee.percentage': 0.05, // 5% platform fee
    } satisfies OrganizationFeatures,
  },

  /**
   * ENTERPRISE TIER (SaaS)
   * Target: Large agencies, teams with custom needs
   * Unlimited everything, full white label, maximum capacity
   */
  enterprise: {
    name: process.env.NEXT_PUBLIC_ENTERPRISE_NAME || 'Enterprise',
    icon: 'Building',
    showPlan: process.env.NEXT_PUBLIC_ENTERPRISE_SHOW_PLAN !== 'false',
    stripe: {
      monthly: process.env.NEXT_PUBLIC_ENTERPRISE_PRICE_MONTHLY as
        | string
        | undefined,
      yearly: process.env.NEXT_PUBLIC_ENTERPRISE_PRICE_YEARLY as
        | string
        | undefined,
    },
    trialDays: parseInt(
      process.env.NEXT_PUBLIC_ENTERPRISE_TRIAL_DAYS || '0',
      10,
    ),

    features: {
      // Limit features - UNLIMITED (-1)
      'websites.limit': UNLIMITED,
      'pages_per_website.limit': UNLIMITED,
      'forms.limit': UNLIMITED,
      'products.limit': UNLIMITED,
      'leads.limit': UNLIMITED,
      'cms_tables.limit': UNLIMITED,
      'storage_kb.limit': UNLIMITED,
      'chat_widgets.limit': UNLIMITED,
      'pipelines.limit': UNLIMITED,
      'tickets.limit': UNLIMITED,
      'team_seats.limit': UNLIMITED,
      'email_templates.limit': UNLIMITED,
      'email_domains.limit': UNLIMITED,
      'automations.limit': UNLIMITED,
      'contracts.limit': UNLIMITED,
      'invoices.limit': UNLIMITED,
      'stores.limit': UNLIMITED,
      'calendars.limit': UNLIMITED,
      'local_components.limit': UNLIMITED,
      // Boolean features - ALL enabled
      custom_domain: true,
      custom_branding: true,
      analytics: true,

      dynamic_pages: true, // Available on Starter+
      // PAYG features - ALL enabled
      'emails.payg': true,
      'ai_credits.payg': true,
      // Percentage features - Platform transaction fees
      'platform_fee.percentage': 0.03, // 3% platform fee - best rate
    } satisfies OrganizationFeatures,
  },

  /**
   * PORTAL TIER - HIDDEN PLAN
   *
   * SOURCE OF TRUTH: Portal Organization Tier
   *
   * SECURITY: This plan is ONLY assigned to portal organizations.
   * It CANNOT be purchased, subscribed to, or upgraded to via any UI or API.
   * Portal organizations are identified by the isPortalOrganization flag in the database.
   *
   * WHY: Portal owners (platform administrators) need unrestricted access to all
   * features without being limited by any tier constraints. This ensures they can
   * test, demonstrate, and use all platform capabilities.
   *
   * HOW: When getOrganizationTier() detects isPortalOrganization=true, it returns
   * this plan's features directly, bypassing all subscription-based tier logic.
   *
   * CRITICAL: ALL features are set to UNLIMITED (-1) or TRUE.
   * This plan is completely independent from enterprise or any other tier.
   */
  portal: {
    name: 'Portal',
    icon: 'Shield',
    showPlan: false, // CRITICAL: Hidden from all UI - cannot be seen or purchased
    stripe: {
      monthly: undefined, // No Stripe price - cannot be purchased
      yearly: undefined,
    },
    trialDays: 0, // No trial concept for portal

    features: {
      // ALL LIMIT FEATURES = UNLIMITED (-1)
      // Portal owners have zero restrictions on any resource
      'websites.limit': UNLIMITED,
      'pages_per_website.limit': UNLIMITED,
      'forms.limit': UNLIMITED,
      'products.limit': UNLIMITED,
      'leads.limit': UNLIMITED,
      'cms_tables.limit': UNLIMITED,
      'storage_kb.limit': UNLIMITED,
      'chat_widgets.limit': UNLIMITED,
      'pipelines.limit': UNLIMITED,
      'tickets.limit': UNLIMITED,
      'team_seats.limit': UNLIMITED,
      'email_templates.limit': UNLIMITED,
      'email_domains.limit': UNLIMITED,
      'automations.limit': UNLIMITED,
      'contracts.limit': UNLIMITED,
      'invoices.limit': UNLIMITED,
      'stores.limit': UNLIMITED,
      'calendars.limit': UNLIMITED,
      'local_components.limit': UNLIMITED,
      // ALL BOOLEAN FEATURES = TRUE
      // Portal owners have access to every feature toggle
      custom_domain: true,
      custom_branding: true,
      analytics: true,

      dynamic_pages: true, // Full access for portal
      // ALL PAYG FEATURES = TRUE
      // Portal owners can use all pay-as-you-go features
      'emails.payg': true,
      'ai_credits.payg': true,
      // ALL PERCENTAGE FEATURES = 0 (no fees for portal)
      // Portal owners have zero platform transaction fees
      'platform_fee.percentage': 0, // 0% - no platform fee for portal
    } satisfies OrganizationFeatures,
  },
} as const

// ============================================================================
// TYPES
// ============================================================================

type PlanKey = keyof typeof PLANS
type Plan = (typeof PLANS)[PlanKey]

// ============================================================================
// TIER-SPECIFIC PRICING - SOURCE OF TRUTH
// ============================================================================

/**
 * Tier-Specific PAYG Pricing Configuration
 *
 * SOURCE OF TRUTH: TierSpecificPricing, TIER_SPECIFIC_PRICING
 *
 * WHY: Different tiers have different costs for pay-as-you-go features.
 * - Portal tier: $0 for everything (platform is paying)
 * - Free tier: Higher costs (covers overhead + incentive to upgrade)
 * - Enterprise tier: Lowest costs (volume discount)
 *
 * HOW: All costs are in DOLLARS. Convert to cents when charging wallet.
 * Example: 0.01 = $0.01 = 1 cent
 *
 * IMPORTANT: Portal tier is $0 because the platform (portal owner) is already
 * paying for the underlying costs (Resend, OpenAI, etc.)
 */
export const TIER_SPECIFIC_PRICING: Record<PaygFeatureKey, TierPricingEntry> = {
  /**
   * Email sending costs per email (in dollars)
   * Covers: Resend API costs + platform margin
   */
  'emails.payg': {
    free: 0.02, // $0.02 per email - higher to cover costs + encourage upgrade
    starter: 0.015, // $0.015 per email - moderate discount
    pro: 0.01, // $0.01 per email - standard pricing
    enterprise: 0.008, // $0.008 per email - volume discount
    portal: 0, // $0 - platform is already paying Resend costs
  },

  /**
   * AI Credits costs per credit (in dollars)
   * Covers: OpenAI/Anthropic API costs + platform margin
   */
  'ai_credits.payg': {
    free: 0.002, // $0.002 per credit
    starter: 0.0015, // $0.0015 per credit
    pro: 0.001, // $0.001 per credit
    enterprise: 0.0008, // $0.0008 per credit
    portal: 0, // $0 - platform is already paying AI costs
  },
} as const

/**
 * SOURCE OF TRUTH: TierSpecificPricing type
 */
export type TierSpecificPricing = typeof TIER_SPECIFIC_PRICING

// ============================================================================
// STRIPE TRANSACTION FEES - SOURCE OF TRUTH
// ============================================================================

/**
 * Stripe Platform Transaction Fee Configuration
 *
 * SOURCE OF TRUTH: StripeTransactionFees, STRIPE_TRANSACTION_FEES
 *
 * WHY: Different tiers have different platform transaction fee rates.
 * - Free tier: Higher fee (10%) - covers costs + incentive to upgrade
 * - Pro/Enterprise: Lower fees - reward for higher tier
 * - Portal: $0 - no platform fee for portal organizations
 *
 * NOTE: This is the PLATFORM fee, not the Stripe processing fee.
 * Stripe processing fees (2.9% + $0.30) are separate and always apply.
 *
 * HOW: percentage is a decimal (0.10 = 10%), fixedCents is in cents
 */
export const STRIPE_TRANSACTION_FEES: Record<
  PlanKeyLiteral,
  TransactionFeeEntry
> = {
  free: {
    percentage: 0.1, // 10% platform fee
    fixedCents: 0, // No additional fixed fee
  },
  starter: {
    percentage: 0.07, // 7% platform fee
    fixedCents: 0,
  },
  pro: {
    percentage: 0.05, // 5% platform fee
    fixedCents: 0,
  },
  enterprise: {
    percentage: 0.03, // 3% platform fee - best rate
    fixedCents: 0,
  },
  portal: {
    percentage: 0, // 0% - no platform fee for portal
    fixedCents: 0,
  },
} as const

/**
 * SOURCE OF TRUTH: StripeTransactionFees type
 */
export type StripeTransactionFees = typeof STRIPE_TRANSACTION_FEES

export type WalletBalance = {
  entityId: string
  balance: number // cents
  stripeCustomerId?: string
  autoRecharge: boolean
  minBalance: number
}

export type PaygTransaction = {
  id: string
  entityId: string
  featureKey: FeatureKey
  amount: number
  quantity: number
  timestamp: Date
}

// ============================================================================
// HELPERS
// ============================================================================

export const getPlan = (key: PlanKey) => PLANS[key]

export const isPayg = (key: FeatureKey) => key.endsWith('.payg')

export const getPaygCost = (key: FeatureKey): number | null => {
  const feature = FEATURES.organization[key]
  return 'cost' in feature ? feature.cost : null
}

/**
 * Get the next plan in the upgrade path
 *
 * NOTE: 'portal' is intentionally excluded from the upgrade path.
 * Portal is a hidden tier that cannot be purchased or upgraded to.
 * It is only assigned to portal organizations via the isPortalOrganization flag.
 */
export const getNextPlan = (currentPlan: PlanKey): PlanKey | null => {
  // Portal is excluded - it's a hidden tier that cannot be upgraded to
  const planOrder: PlanKey[] = ['free', 'starter', 'pro', 'enterprise']
  const currentIndex = planOrder.indexOf(currentPlan)

  // If current plan is 'portal' or not in order, or already at highest purchasable tier
  if (currentIndex === -1 || currentIndex === planOrder.length - 1) {
    return null // Already at highest tier or on portal (no upgrade path)
  }

  return planOrder[currentIndex + 1]
}

// ============================================================================
// TIER-SPECIFIC PRICING HELPERS - SOURCE OF TRUTH
// ============================================================================

/**
 * Get the tier-specific cost for a PAYG feature in DOLLARS
 *
 * SOURCE OF TRUTH: getTierSpecificCost, PaygTierPricing
 *
 * WHY: Different tiers pay different amounts for PAYG features
 * HOW: Looks up the cost from TIER_SPECIFIC_PRICING constant
 *
 * @param featureKey - The PAYG feature key (e.g., 'emails.payg')
 * @param tier - The organization's plan tier
 * @returns Cost in DOLLARS (e.g., 0.01 = $0.01)
 *
 * IMPORTANT: Returns 0 for portal tier since platform pays underlying costs
 */
export function getTierSpecificCost(
  featureKey: PaygFeatureKey,
  tier: PlanKey,
): number {
  const featurePricing = TIER_SPECIFIC_PRICING[featureKey]

  if (!featurePricing) {
    // Fallback to the default cost from FEATURES if feature key is unknown
    const feature = FEATURES.organization[featureKey]
    return 'cost' in feature ? feature.cost : 0
  }

  return featurePricing[tier] ?? 0
}

/**
 * Get the tier-specific cost for a PAYG feature in MILLICENTS (1/1000 of a dollar)
 *
 * SOURCE OF TRUTH: getTierSpecificCostMillicents, PaygTierPricingMillicents
 *
 * WHY: Sub-cent pricing (e.g., $0.015 starter, $0.008 enterprise) can't be represented
 *      as integer cents without precision loss. Millicents (1000 = $1.00) give us clean
 *      integers for all tiers: free=20, starter=15, pro=10, enterprise=8.
 * HOW: Multiplies dollar amount by 1000 and rounds
 *
 * @param featureKey - The PAYG feature key (e.g., 'emails.payg')
 * @param tier - The organization's plan tier
 * @returns Cost in MILLICENTS (e.g., 10 = $0.01, 15 = $0.015)
 */
export function getTierSpecificCostMillicents(
  featureKey: PaygFeatureKey,
  tier: PlanKey,
): number {
  const costInDollars = getTierSpecificCost(featureKey, tier)
  return Math.round(costInDollars * 1000)
}

/**
 * Get the Stripe platform transaction fee configuration for a tier
 *
 * SOURCE OF TRUTH: getStripeTransactionFee, PlatformTransactionFee
 *
 * WHY: Platform charges a fee on transactions, varying by tier
 * HOW: Returns fee configuration (percentage + fixed amount)
 *
 * @param tier - The organization's plan tier
 * @returns Fee configuration with percentage (decimal) and fixedCents
 *
 * EXAMPLE:
 *   const fee = getStripeTransactionFee('free')
 *   // { percentage: 0.10, fixedCents: 0 }
 *   // For a $100 transaction: $100 * 0.10 = $10 platform fee
 */
export function getStripeTransactionFee(tier: PlanKey): TransactionFeeEntry {
  return STRIPE_TRANSACTION_FEES[tier] ?? STRIPE_TRANSACTION_FEES.free
}

/**
 * Calculate the platform fee in cents for a transaction amount
 *
 * SOURCE OF TRUTH: calculatePlatformFeeCents, PlatformFeeCalculation
 *
 * @param transactionAmountCents - The transaction amount in cents
 * @param tier - The organization's plan tier
 * @returns Platform fee in CENTS
 *
 * EXAMPLE:
 *   calculatePlatformFeeCents(10000, 'free') // $100 * 10% = 1000 cents ($10)
 *   calculatePlatformFeeCents(10000, 'portal') // $0 - no platform fee
 */
export function calculatePlatformFeeCents(
  transactionAmountCents: number,
  tier: PlanKey,
): number {
  const feeConfig = getStripeTransactionFee(tier)
  const percentageFee = Math.round(
    transactionAmountCents * feeConfig.percentage,
  )
  return percentageFee + feeConfig.fixedCents
}

// ============================================================================
// KEY FEATURES — SOURCE OF TRUTH for pricing card highlights
// ============================================================================

/**
 * KEY_FEATURES — Ordered list of the most decision-changing features
 *
 * SOURCE OF TRUTH KEYWORDS: KeyFeatures, PricingCardHighlights, HighlightFeatures
 *
 * WHY: Pricing cards need to show only the top differentiators that drive
 * upgrade decisions. The full feature list is shown in a comparison table below.
 *
 * HOW: Features are listed in display priority order. These keys MUST exist
 * in FEATURES.organization. TypeScript enforces this via the FeatureKey type.
 *
 * RULES FOR INCLUSION:
 * - Features that DIFFER meaningfully across tiers (not the same on every plan)
 * - Features that directly affect the user's decision to upgrade
 * - Hard limits the user is most likely to hit first
 * - Boolean features that unlock major capabilities
 */
export const KEY_FEATURES: readonly FeatureKey[] = [
  'websites.limit',
  'leads.limit',
  'team_seats.limit',
  'forms.limit',
  'pipelines.limit',
  'custom_domain',
  'custom_branding',
  'platform_fee.percentage',
] as const

/**
 * PLAN_ORDER — Display order for plans in comparison tables and UI grids
 *
 * SOURCE OF TRUTH KEYWORDS: PlanOrder, PlanDisplayOrder
 *
 * WHY: Consistent left-to-right ordering across pricing cards and comparison table.
 * Portal is excluded (hidden tier, cannot be purchased).
 */
export const PLAN_ORDER: readonly PlanKeyLiteral[] = [
  'free',
  'starter',
  'pro',
  'enterprise',
] as const

// ============================================================================
// FEATURE CATEGORIES — SOURCE OF TRUTH for comparison table groupings
// ============================================================================

/**
 * FEATURE_CATEGORIES — Groups features into logical sections for the comparison table
 *
 * SOURCE OF TRUTH KEYWORDS: FeatureCategories, ComparisonTableCategories, FeatureGroups
 *
 * WHY: The comparison table needs to split features into meaningful categories
 * (like "Website Builder", "CRM & Leads", etc.) instead of showing a flat list.
 * Each category becomes its own section with a header row and feature rows.
 *
 * HOW: Each entry has a display name and an ordered list of feature keys.
 * The feature keys MUST exist in FEATURES.organization — TypeScript enforces this.
 *
 * RULES:
 * - Every feature should appear in exactly one category
 * - PAYG features go in their own category at the bottom (shown with per-unit pricing)
 * - Percentage features can live alongside related features
 * - Order categories from most important to least
 */
export const FEATURE_CATEGORIES: ReadonlyArray<{
  readonly name: string
  readonly features: readonly FeatureKey[]
}> = [
  {
    name: 'Website Builder',
    features: [
      'websites.limit',
      'pages_per_website.limit',
      'cms_tables.limit',
      'dynamic_pages',
      'custom_domain',
      'local_components.limit',
    ],
  },
  {
    name: 'CRM & Leads',
    features: [
      'leads.limit',
      'forms.limit',
      'pipelines.limit',
      'tickets.limit',
      'calendars.limit',
    ],
  },
  {
    name: 'Marketing & Email',
    features: [
      'email_templates.limit',
      'email_domains.limit',
      'automations.limit',
    ],
  },
  {
    name: 'Team & Workspace',
    features: [
      'team_seats.limit',
      'custom_branding',
      'analytics',
    ],
  },
  {
    name: 'Commerce & Billing',
    features: [
      'stores.limit',
      'products.limit',
      'invoices.limit',
      'contracts.limit',
    ],
  },
  {
    name: 'Storage & AI',
    features: [
      'storage_kb.limit',
      'chat_widgets.limit',
    ],
  },
  {
    name: 'Platform Fees',
    features: [
      'platform_fee.percentage',
    ],
  },
  {
    name: 'Pay As You Go',
    features: [
      'emails.payg',
      'ai_credits.payg',
    ],
  },
] as const

// ============================================================================
// EXPORTS
// ============================================================================

export { UNLIMITED }
export type {
  // Core feature types
  FeatureKey,
  FeatureValue,
  OrganizationFeatures,

  // Feature definition types - SOURCE OF TRUTH
  FeatureType,
  LimitFeatureDefinition,
  BooleanFeatureDefinition,
  PaygFeatureDefinition,
  PercentageFeatureDefinition,
  FeatureDefinition,

  // Plan types - SOURCE OF TRUTH
  PlanKey,
  PlanKeyLiteral,
  Plan,
  PlanDefinition,
  StripePriceConfig,
  LucideIconName,

  // Pricing types - SOURCE OF TRUTH
  PaygFeatureKey,
  TierPricingEntry,
  TransactionFeeEntry,
}
