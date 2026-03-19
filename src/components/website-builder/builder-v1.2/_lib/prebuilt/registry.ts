/**
 * ============================================================================
 * PREBUILT ELEMENTS REGISTRY
 * ============================================================================
 *
 * Central registry of all PreBuilt elements and their variants.
 * This is the SINGLE SOURCE OF TRUTH for PreBuilt element metadata.
 *
 * ============================================================================
 * AI INTEGRATION NOTES
 * ============================================================================
 *
 * This registry is designed to be AI-friendly. Each entry contains:
 *
 * 1. TAGS - Short categorization labels
 *    AI uses these for quick filtering (e.g., "minimal", "modern")
 *
 * 2. KEYWORDS - Search/intent matching phrases
 *    AI uses these to match user requests (e.g., "clean navbar")
 *
 * 3. USE CASES - Example scenarios
 *    AI uses these to understand appropriate contexts
 *
 * 4. NICHES - Industry/domain fit
 *    AI uses these to match design to user's business type
 *
 * 5. DESCRIPTION - Detailed explanation
 *    AI uses this for contextual understanding
 *
 * When AI needs to select a PreBuilt element, it can:
 * 1. Filter by category (e.g., navigation)
 * 2. Match keywords to user intent
 * 3. Check niche compatibility
 * 4. Read description for nuanced understanding
 * 5. Use default settings as starting point
 *
 * ============================================================================
 * EXTENDING THE REGISTRY
 * ============================================================================
 *
 * To add a new PreBuilt type:
 * 1. Add the definition to PREBUILT_REGISTRY
 * 2. Include at least one variant
 * 3. Fill in all metadata fields for AI compatibility
 * 4. Create the corresponding renderer component
 *
 * To add a new variant:
 * 1. Add to the variants array of the parent type
 * 2. Provide unique id, label, description
 * 3. Include rich tags, keywords, useCases, niches
 * 4. Set appropriate default styles and settings
 *
 * ============================================================================
 */

import type {
  PreBuiltCategory,
  PreBuiltCategoryInfo,
  PreBuiltDefinition,
  PreBuiltElementType,
} from './types'
import { DEFAULT_NAVBAR_SETTINGS, DEFAULT_SIDEBAR_SETTINGS, DEFAULT_TOTAL_MEMBERS_SETTINGS, DEFAULT_LOGO_CAROUSEL_SETTINGS } from './types'

// ============================================================================
// CATEGORY DEFINITIONS - For sidebar organization
// ============================================================================

/**
 * All PreBuilt categories with their metadata.
 * Used to organize PreBuilt elements in the sidebar.
 */
export const PREBUILT_CATEGORIES: Record<PreBuiltCategory, PreBuiltCategoryInfo> =
  {
    navigation: {
      id: 'navigation',
      label: 'Navigation',
      description: 'Headers, navbars, and navigation menus',
      icon: 'navigation',
    },
    layout: {
      id: 'layout',
      label: 'Layouts',
      description: 'Page layouts including sidebars, dashboards, and app shells',
      icon: 'layout-dashboard',
    },
    hero: {
      id: 'hero',
      label: 'Hero Sections',
      description: 'Hero sections, banners, and above-the-fold content',
      icon: 'layout-template',
    },
    content: {
      id: 'content',
      label: 'Content',
      description: 'Feature grids, about sections, and content blocks',
      icon: 'layout-grid',
    },
    'social-proof': {
      id: 'social-proof',
      label: 'Social Proof',
      description: 'Testimonials, reviews, and trust badges',
      icon: 'users',
    },
    cta: {
      id: 'cta',
      label: 'Call to Action',
      description: 'CTAs, signup forms, and conversion sections',
      icon: 'mouse-pointer-click',
    },
    footer: {
      id: 'footer',
      label: 'Footer',
      description: 'Footers, bottom navigation, and closing sections',
      icon: 'panel-bottom',
    },
  }

// ============================================================================
// PREBUILT REGISTRY - All PreBuilt elements and variants
// ============================================================================

/**
 * Complete registry of all PreBuilt elements.
 *
 * This is the SINGLE SOURCE OF TRUTH for:
 * - Available PreBuilt types
 * - All variants for each type
 * - Default settings and styles
 * - AI-friendly metadata
 */
export const PREBUILT_REGISTRY: Record<PreBuiltElementType, PreBuiltDefinition> =
  {
    'prebuilt-navbar': {
      type: 'prebuilt-navbar',
      category: 'navigation',
      label: 'Navigation Bar',
      description:
        'A responsive navigation bar with logo, links, and optional CTA button. Automatically shows a mobile menu (drawer) on smaller screens.',
      icon: 'navigation',
      defaultSettings: DEFAULT_NAVBAR_SETTINGS,
      variants: [
        {
          id: 'navbar-minimal',
          label: 'Minimal',
          description:
            'A clean, minimal navigation bar with transparent background. Logo on the left, centered links, and CTA button on the right. Perfect for modern landing pages and portfolios.',
          tags: [
            'minimal',
            'clean',
            'modern',
            'transparent',
            'simple',
            'elegant',
          ],
          keywords: [
            'simple navbar',
            'clean navigation',
            'minimal header',
            'transparent navbar',
            'modern nav',
            'simple menu',
            'light navbar',
            'basic navigation',
          ],
          useCases: [
            'SaaS landing page',
            'Portfolio website',
            'Startup homepage',
            'Agency site',
            'Product page',
            'Personal website',
            'Marketing page',
          ],
          niches: [
            'tech',
            'startup',
            'creative',
            'professional',
            'saas',
            'portfolio',
            'agency',
            'software',
          ],
          illustration: 'navbar-minimal',
          defaultWidth: 1440,
          defaultHeight: 72,
          /** Navbar dimensions are content-driven — no user resize allowed */
          allowedResizeHandles: [],
          defaultStyles: {
            backgroundColor: 'transparent',
            padding: '16px 48px',
            color: '#1a1a1a',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          },
          defaultSettings: {
            logo: {
              type: 'text',
              text: 'Brand',
              href: '/',
              textColor: '#1a1a1a',
            },
            linksTextColor: '#4b5563',
            sticky: {
              enabled: true,
              showShadowOnScroll: true,
            },
          },
        },
      ],
    },

    // ========================================================================
    // SIDEBAR - Dashboard/App layout with side navigation
    // ========================================================================
    'prebuilt-sidebar': {
      type: 'prebuilt-sidebar',
      category: 'navigation',
      label: 'Sidebar Layout',
      description:
        'A responsive sidebar layout with navigation on the left and a content area (inset) on the right. Perfect for dashboards, admin panels, and app interfaces.',
      icon: 'panel-left',
      defaultSettings: DEFAULT_SIDEBAR_SETTINGS,
      variants: [
        {
          id: 'sidebar-default',
          label: 'Default',
          description:
            'A clean sidebar layout with logo, navigation links, and a content inset. The sidebar can be collapsed and includes mobile responsive behavior with a sheet drawer.',
          tags: [
            'sidebar',
            'dashboard',
            'admin',
            'app',
            'navigation',
            'layout',
            'panel',
          ],
          keywords: [
            'sidebar layout',
            'dashboard layout',
            'admin panel',
            'side navigation',
            'app shell',
            'sidebar inset',
            'collapsible sidebar',
            'left navigation',
          ],
          useCases: [
            'Admin dashboard',
            'SaaS application',
            'Content management system',
            'Analytics dashboard',
            'User settings panel',
            'Project management',
            'File manager',
          ],
          niches: [
            'saas',
            'admin',
            'dashboard',
            'enterprise',
            'productivity',
            'management',
            'internal tools',
          ],
          illustration: 'sidebar-default',
          defaultWidth: 1440,
          defaultHeight: 800,
          /** Sidebar fills parent/viewport height — no user resize allowed */
          allowedResizeHandles: [],
          defaultStyles: {
            display: 'flex',
            flexDirection: 'row',
          },
          defaultSettings: {
            logo: {
              type: 'text',
              text: 'Dashboard',
              href: '/',
            },
            appearance: {
              backgroundColor: '#ffffff',
              textColor: '#1a1a1a',
              borderColor: '#e5e5e5',
              width: 256,
            },
            inset: {
              backgroundColor: '#f5f5f5',
            },
            collapsible: {
              enabled: true,
              defaultCollapsed: false,
              mode: 'offcanvas',
            },
          },
        },
        {
          id: 'sidebar-dark',
          label: 'Dark Theme',
          description:
            'A dark-themed sidebar layout perfect for modern dark mode applications and dashboards.',
          tags: [
            'sidebar',
            'dark',
            'dashboard',
            'admin',
            'app',
            'modern',
          ],
          keywords: [
            'dark sidebar',
            'dark theme layout',
            'dark dashboard',
            'modern sidebar',
            'dark navigation',
          ],
          useCases: [
            'Dark mode dashboard',
            'Developer tools',
            'Analytics platform',
            'Modern SaaS app',
            'Code editor layout',
          ],
          niches: [
            'saas',
            'developer',
            'tech',
            'modern',
            'dark-mode',
          ],
          illustration: 'sidebar-dark',
          defaultWidth: 1440,
          defaultHeight: 800,
          /** Sidebar fills parent/viewport height — no user resize allowed */
          allowedResizeHandles: [],
          defaultStyles: {
            display: 'flex',
            flexDirection: 'row',
          },
          defaultSettings: {
            logo: {
              type: 'text',
              text: 'Dashboard',
              href: '/',
              textColor: '#ffffff',
            },
            linksTextColor: '#a1a1aa',
            activeLinkColor: '#3b82f6',
            appearance: {
              backgroundColor: '#18181b',
              textColor: '#ffffff',
              borderColor: '#27272a',
              width: 256,
            },
            inset: {
              backgroundColor: '#09090b',
            },
            collapsible: {
              enabled: true,
              defaultCollapsed: false,
              mode: 'offcanvas',
            },
          },
        },
      ],
    },
    // ========================================================================
    // TOTAL MEMBERS - Social proof element showing community size
    // ========================================================================
    'prebuilt-total-members': {
      type: 'prebuilt-total-members',
      category: 'social-proof',
      label: 'Total Members',
      description:
        'A social proof element displaying stacked avatar images with a member count message. Shows community size to build trust and authority.',
      icon: 'users',
      defaultSettings: DEFAULT_TOTAL_MEMBERS_SETTINGS,
      variants: [
        {
          id: 'total-members-default',
          label: 'Default',
          description:
            'Stacked circular avatars with a customizable message like "7000+ prodigies worldwide". Perfect for showcasing community size.',
          tags: [
            'social-proof',
            'authority',
            'trust',
            'community',
            'members',
            'avatars',
          ],
          keywords: [
            'total members',
            'member count',
            'community size',
            'social proof',
            'trust badge',
            'user count',
            'subscriber count',
            'stacked avatars',
          ],
          useCases: [
            'Landing page hero section',
            'Below CTA buttons',
            'Testimonial sections',
            'Pricing page',
            'Sign up forms',
            'Product pages',
          ],
          niches: [
            'saas',
            'community',
            'education',
            'course',
            'membership',
            'startup',
            'tech',
          ],
          illustration: 'total-members-default',
          defaultWidth: 300,
          defaultHeight: 48,
          /** Total members has fixed content-driven height — no user resize */
          allowedResizeHandles: [],
          defaultStyles: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          },
          defaultSettings: {
            message: '7000+ prodigies worldwide',
            textColor: '#ffffff',
            fontSize: 16,
            fontWeight: 500,
          },
        },
      ],
    },

    'prebuilt-logo-carousel': {
      type: 'prebuilt-logo-carousel',
      category: 'social-proof',
      label: 'Logo Carousel',
      description:
        'A horizontal scrolling logo strip showcasing partner logos, client logos, or brand logos. Supports auto-scroll animation with optional grayscale styling.',
      icon: 'image',
      defaultSettings: DEFAULT_LOGO_CAROUSEL_SETTINGS,
      variants: [
        {
          id: 'logo-carousel-default',
          label: 'Logo Carousel',
          description:
            'Horizontal logo strip with grayscale styling and optional infinite scroll animation. Perfect for showcasing partners, clients, or integrations.',
          tags: [
            'social-proof',
            'logos',
            'partners',
            'clients',
            'brands',
            'carousel',
            'scroll',
          ],
          keywords: [
            'logo carousel',
            'logo strip',
            'partner logos',
            'client logos',
            'brand logos',
            'trusted by',
            'as seen on',
            'integrations',
            'scrolling logos',
            'marquee',
          ],
          useCases: [
            'Landing page social proof section',
            'Below hero section',
            'Partner showcase',
            'Client logos section',
            'Integration logos',
            'As seen on section',
          ],
          niches: [
            'saas',
            'agency',
            'startup',
            'enterprise',
            'tech',
            'marketing',
            'consulting',
            'ecommerce',
          ],
          illustration: 'logo-carousel',
          defaultWidth: 800,
          defaultHeight: 140,
          /** Logo carousel has fixed content-driven height — no user resize */
          allowedResizeHandles: [],
          defaultStyles: {
            backgroundColor: 'transparent',
          },
          defaultSettings: DEFAULT_LOGO_CAROUSEL_SETTINGS,
        },
      ],
    },

    // Future PreBuilt types can be added here:
    // 'prebuilt-hero': { ... },
    // 'prebuilt-footer': { ... },
  }

// ============================================================================
// HELPER FUNCTIONS - For working with the registry
// ============================================================================

/**
 * Get all PreBuilt definitions.
 */
export function getAllPreBuiltDefinitions(): PreBuiltDefinition[] {
  return Object.values(PREBUILT_REGISTRY)
}

/**
 * Get PreBuilt definition by type.
 */
export function getPreBuiltDefinition(
  type: PreBuiltElementType
): PreBuiltDefinition | undefined {
  return PREBUILT_REGISTRY[type]
}

/**
 * Get all PreBuilt definitions in a category.
 */
export function getPreBuiltByCategory(
  category: PreBuiltCategory
): PreBuiltDefinition[] {
  return Object.values(PREBUILT_REGISTRY).filter(
    (def) => def.category === category
  )
}

/**
 * Get a specific variant from a PreBuilt type.
 */
export function getPreBuiltVariant(
  type: PreBuiltElementType,
  variantId: string
) {
  const definition = PREBUILT_REGISTRY[type]
  return definition?.variants.find((v) => v.id === variantId)
}

/**
 * Get all categories that have at least one PreBuilt element.
 */
export function getActiveCategories(): PreBuiltCategoryInfo[] {
  const activeCategories = new Set<PreBuiltCategory>()

  Object.values(PREBUILT_REGISTRY).forEach((def) => {
    activeCategories.add(def.category)
  })

  return Array.from(activeCategories).map((cat) => PREBUILT_CATEGORIES[cat])
}

/**
 * Search PreBuilt elements by query.
 * Matches against labels, descriptions, tags, and keywords.
 *
 * This function is designed for AI to use when matching user intent.
 */
export function searchPreBuiltElements(query: string): PreBuiltDefinition[] {
  const lowerQuery = query.toLowerCase()

  return Object.values(PREBUILT_REGISTRY).filter((def) => {
    // Check type-level metadata
    if (def.label.toLowerCase().includes(lowerQuery)) return true
    if (def.description.toLowerCase().includes(lowerQuery)) return true

    // Check variant-level metadata
    return def.variants.some((variant) => {
      if (variant.label.toLowerCase().includes(lowerQuery)) return true
      if (variant.description.toLowerCase().includes(lowerQuery)) return true
      if (variant.tags.some((tag) => tag.includes(lowerQuery))) return true
      if (variant.keywords.some((kw) => kw.includes(lowerQuery))) return true
      if (variant.useCases.some((uc) => uc.toLowerCase().includes(lowerQuery)))
        return true
      if (
        variant.niches.some((niche) => niche.toLowerCase().includes(lowerQuery))
      )
        return true

      return false
    })
  })
}

/**
 * SOURCE OF TRUTH: PreBuiltResizeControl, getAllowedResizeHandles
 *
 * Get the allowed resize handles for a prebuilt element based on its variant.
 * Returns the handles array from the registry, or undefined (all handles) if not specified.
 *
 * Used by canvas wrappers to pass `allowedHandles` to ElementWrapper,
 * preventing users from resizing components with locked dimensions.
 */
export function getAllowedResizeHandles(
  prebuiltType: PreBuiltElementType,
  variantId: string
): ('n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw')[] | undefined {
  const variant = getPreBuiltVariant(prebuiltType, variantId)
  return variant?.allowedResizeHandles
}

/**
 * Get sidebar items for the Insert tab.
 * Groups PreBuilt elements by category with their variants.
 */
export function getPreBuiltSidebarItems() {
  const categories = getActiveCategories()

  return categories.map((category) => ({
    category,
    items: getPreBuiltByCategory(category.id).flatMap((def) =>
      def.variants.map((variant) => ({
        id: `prebuilt-${def.type}-${variant.id}`,
        type: def.type,
        variantId: variant.id,
        label: variant.label,
        description: variant.description,
        illustration: variant.illustration,
        parentLabel: def.label,
      }))
    ),
  }))
}
