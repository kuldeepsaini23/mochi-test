/**
 * ============================================================================
 * PREBUILT ELEMENTS - Type Definitions
 * ============================================================================
 *
 * This file defines the type system for PreBuilt elements in the website builder.
 * PreBuilt elements are complex, pre-designed components that users can drop
 * onto the canvas with a single action.
 *
 * ============================================================================
 * KEY CONCEPTS
 * ============================================================================
 *
 * 1. NON-EDITABLE CHILDREN
 *    PreBuilt elements have children that users cannot freely edit (drag, delete,
 *    resize). Users can only modify these through the Settings panel.
 *
 * 2. SETTINGS-BASED CONFIGURATION
 *    Instead of direct manipulation, users configure PreBuilt elements through
 *    structured settings (e.g., adding nav links, changing logo, etc.).
 *
 * 3. AI-FRIENDLY METADATA
 *    Each PreBuilt element has rich metadata (tags, keywords, descriptions)
 *    that helps AI understand when and how to use these elements.
 *
 * 4. RESPONSIVE BY DEFAULT
 *    PreBuilt elements handle responsive behavior internally (e.g., navbar
 *    shows hamburger menu on mobile via Sheet/Drawer).
 *
 * ============================================================================
 * ARCHITECTURE FOR EXTENSIBILITY
 * ============================================================================
 *
 * When adding a new PreBuilt element type:
 * 1. Add type to PreBuiltElementType union
 * 2. Create specific element interface extending BasePreBuiltElement
 * 3. Create settings interface for that element type
 * 4. Add to PreBuiltElement union and PreBuiltSettings union
 * 5. Create renderer component in ../prebuilt-elements/
 * 6. Register in PREBUILT_REGISTRY with metadata
 *
 * ============================================================================
 */

import type {
  ElementStyles,
  ResponsiveStyles,
  ResponsiveSettings,
  ResponsiveProperties,
} from '../types'

// ============================================================================
// NAVBAR CHILD ELEMENT STYLES - Individual styling for navbar children
// ============================================================================

/**
 * Styles for a navbar child element.
 * Each child (logo, links, CTA) can have its own styles that users can customize.
 * These styles are selectable in the canvas but the elements cannot be
 * dragged out or deleted - they're locked to the navbar structure.
 */
export interface NavbarChildStyles {
  /** Unique identifier for this child element */
  id: string

  /** Type of child element for rendering */
  type: 'logo' | 'links-container' | 'link' | 'cta-button'

  /** Custom styles set by the user */
  styles: ElementStyles
}

// ============================================================================
// PREBUILT ELEMENT TYPES - All available PreBuilt component types
// ============================================================================

/**
 * All supported PreBuilt element types.
 *
 * EXTENDING: Add new types here when creating new PreBuilt elements.
 * Each type should have a corresponding interface, settings, and renderer.
 */
export type PreBuiltElementType = 'prebuilt-navbar' | 'prebuilt-sidebar' | 'prebuilt-total-members' | 'prebuilt-logo-carousel'
// Future types:
// | 'prebuilt-hero'
// | 'prebuilt-footer'
// | 'prebuilt-pricing-table'
// | 'prebuilt-testimonials'
// | 'prebuilt-faq'
// | 'prebuilt-cta'
// | 'prebuilt-feature-grid'

// ============================================================================
// PREBUILT CATEGORIES - For organizing in sidebar
// ============================================================================

/**
 * Categories for organizing PreBuilt elements in the sidebar.
 * Each category can have multiple variants.
 */
export type PreBuiltCategory =
  | 'navigation'
  | 'layout'
  | 'hero'
  | 'content'
  | 'social-proof'
  | 'cta'
  | 'footer'

/**
 * Category metadata for sidebar display.
 */
export interface PreBuiltCategoryInfo {
  /** Category identifier */
  id: PreBuiltCategory

  /** Display name shown in sidebar */
  label: string

  /** Description for tooltip/hover */
  description: string

  /** Icon name from lucide-react */
  icon: string
}

// ============================================================================
// BASE PREBUILT ELEMENT - Shared properties for all PreBuilt elements
// ============================================================================

/**
 * Base properties shared by ALL PreBuilt element types.
 *
 * PreBuilt elements extend BaseElement (like regular canvas elements)
 * but have additional properties for settings and AI metadata.
 */
export interface BasePreBuiltElement {
  /**
   * Unique identifier - used for O(1) lookups in Redux store.
   * Format: 'prebuilt_[timestamp]_[random]'
   */
  id: string

  /**
   * The specific PreBuilt element type.
   * Used for discriminated union type narrowing.
   */
  prebuiltType: PreBuiltElementType

  /**
   * Variant identifier within the type.
   * Example: 'minimal', 'with-cta', 'centered', etc.
   */
  variant: string

  /**
   * Display name shown in layers panel.
   * User-editable, defaults to the variant's label.
   */
  name: string

  /** X position in CANVAS coordinates */
  x: number

  /** Y position in CANVAS coordinates */
  y: number

  /** Width in canvas units (pixels at 100% zoom) */
  width: number

  /** Height in canvas units */
  height: number

  /**
   * Parent element ID - null means root level (directly on canvas).
   * PreBuilt elements are typically root-level or inside pages.
   */
  parentId: string | null

  /**
   * Order among siblings - determines z-index and render order.
   */
  order: number

  /** Whether element is visible */
  visible: boolean

  /** Whether element is locked (cannot be selected/modified) */
  locked: boolean

  /**
   * Whether element uses absolute positioning within its parent frame.
   * Same as BaseElement.isAbsolute - included for type compatibility.
   */
  isAbsolute?: boolean

  /**
   * Auto Width - when true, element uses 100% width of parent container.
   * Essential for responsive elements like navbars that need to fill their parent.
   */
  autoWidth?: boolean

  /**
   * DYNAMIC STYLES - All CSS-like visual/layout properties.
   * Same pattern as regular canvas elements.
   */
  styles: ElementStyles

  /**
   * RESPONSIVE STYLE OVERRIDES - Breakpoint-specific style modifications.
   */
  responsiveStyles?: ResponsiveStyles

  /**
   * RESPONSIVE SETTINGS - Breakpoint-specific setting modifications.
   */
  responsiveSettings?: ResponsiveSettings

  /**
   * @deprecated Use responsiveSettings instead.
   * Kept for backwards compatibility during migration.
   */
  responsiveProperties?: ResponsiveProperties
}

// ============================================================================
// NAVBAR LINK - Shared structure for navigation links
// ============================================================================

/**
 * A single navigation link in a navbar.
 * Used in navbar settings to define the navigation structure.
 * Each link can have its own custom styles.
 *
 * ============================================================================
 * PAGE LINKING
 * ============================================================================
 *
 * Links support two routing modes:
 *
 * 1. INTERNAL PAGE LINK (pageId is set):
 *    - Links to a page in the website builder
 *    - href is auto-generated from the page's slug
 *    - Updates automatically if the page slug changes
 *
 * 2. CUSTOM/EXTERNAL LINK (pageId is null/undefined):
 *    - href is a direct URL (external or custom route)
 *    - User can enter any URL they want
 */
export interface NavbarLink {
  /** Unique identifier for this link */
  id: string

  /** Display text for the link */
  label: string

  /** URL or route path for navigation */
  href: string

  /**
   * Internal page ID for page linking.
   * When set, this link points to an internal page.
   * The href is generated from the page's slug.
   */
  pageId?: string

  /**
   * Whether to open in new tab.
   * Default: false (same tab)
   */
  openInNewTab?: boolean

  /**
   * Optional icon name from lucide-react.
   * Displayed before the label on mobile drawer.
   */
  icon?: string

  /**
   * Custom styles for this individual link.
   * Users can select links on canvas and customize their appearance.
   */
  styles?: ElementStyles

  /**
   * Child links for dropdown menus.
   * If present, this link becomes a dropdown trigger.
   * Note: First implementation may not support dropdowns.
   */
  children?: NavbarLink[]
}

// ============================================================================
// NAVBAR SETTINGS - Configuration for navbar PreBuilt element
// ============================================================================

/**
 * Settings for configuring a PreBuilt navbar element.
 *
 * These settings are modified through the Settings panel in the properties
 * sidebar. Individual child elements (logo, links, CTA) can be selected
 * on the canvas to customize their styles, but cannot be dragged or deleted.
 *
 * ============================================================================
 * COLOR CUSTOMIZATION
 * ============================================================================
 *
 * Each child element section includes color properties that users can
 * customize via the Settings panel:
 *
 * - Logo: text color only (no background - it's part of the navbar)
 * - Links: text color only (no background - links are inline text)
 * - CTA Button: background color AND text color (it's a standalone button)
 *
 * ============================================================================
 * PAGE-LINKED NAVIGATION
 * ============================================================================
 *
 * Links can be connected to website pages in two ways:
 * 1. pageId: Links to an internal page (uses the page's slug for routing)
 * 2. href: Direct URL for external links or custom routes
 *
 * When a navbar is first dropped onto the canvas, it auto-populates with
 * links to all existing pages in the website for immediate usability.
 */
export interface NavbarSettings {
  /**
   * Navbar layout arrangement — controls the visual order of logo, links, and CTA.
   *
   * - 'logo-left' (default): Logo on the left, links in the center, CTA on the right.
   * - 'logo-center': Links on the left, logo centered, CTA on the right.
   *
   * SOURCE OF TRUTH KEYWORDS: NavbarLayout, navbar-layout-mode
   * @default 'logo-left'
   */
  layout?: 'logo-left' | 'logo-center'

  /**
   * Logo configuration.
   */
  logo: {
    /** Logo type: image, text, or both */
    type: 'image' | 'text' | 'both'

    /** Logo image URL (when type is 'image' or 'both') */
    imageUrl?: string

    /** Logo text (when type is 'text' or 'both') */
    text?: string

    /** Link when clicking the logo (usually home page) */
    href: string

    /**
     * Logo text color.
     * Default: 'inherit' (uses navbar's color)
     */
    textColor?: string

    /**
     * Logo image size (height in pixels).
     * The width scales proportionally via object-fit: contain.
     * Default: 32
     *
     * SOURCE OF TRUTH KEYWORDS: NavbarLogoSize, navbar-logo-size
     */
    logoSize?: number

    /**
     * Custom styles for the logo element.
     * Users can select the logo on canvas and customize its appearance.
     */
    styles?: ElementStyles
  }

  /**
   * Navigation links array.
   * Users can add, remove, reorder, and edit these through Settings.
   */
  links: NavbarLink[]

  /**
   * Link text color (applies to all navigation links).
   * Default: 'inherit' (uses navbar's color)
   */
  linksTextColor?: string

  /**
   * Styles for the links container (the nav element wrapping all links).
   * Controls gap, alignment, etc.
   */
  linksContainerStyles?: ElementStyles

  /**
   * Optional call-to-action button.
   * When defined, shows a prominent button at the end of the navbar.
   */
  ctaButton?: {
    /** Button label text */
    label: string

    /** Button destination URL */
    href: string

    /**
     * Internal page ID — when set, this CTA links to an internal page.
     * The href is auto-populated from the page's slug.
     */
    pageId?: string

    /** Whether to open in new tab */
    openInNewTab?: boolean

    /** Button variant (affects styling) */
    variant: 'primary' | 'secondary' | 'outline'

    /**
     * CTA button background color.
     * Default: '#3b82f6' (blue) for primary variant
     */
    backgroundColor?: string

    /**
     * CTA button text color.
     * Default: 'white' for primary variant
     */
    textColor?: string

    /**
     * Custom styles for the CTA button element.
     * Users can select the button on canvas and customize its appearance.
     */
    styles?: ElementStyles
  }

  /**
   * Sticky behavior settings.
   */
  sticky: {
    /** Whether navbar sticks to top when scrolling */
    enabled: boolean

    /** Add shadow when scrolled (enhances sticky effect) */
    showShadowOnScroll?: boolean
  }

  /**
   * Whether to show the Cart button in the navbar.
   * When enabled, displays a shopping bag icon button that opens the cart sheet.
   * Default: true (shown by default for e-commerce sites)
   */
  showCartButton?: boolean

  /**
   * Mobile menu configuration.
   *
   * ============================================================================
   * SOURCE OF TRUTH: Main navbar styles are used for mobile drawer
   * ============================================================================
   *
   * The mobile drawer automatically inherits colors from the main navbar:
   * - Drawer background = navbar styles.backgroundColor
   * - Drawer text = navbar linksTextColor or styles.color
   * - Hamburger icon = inherits from navbar (currentColor)
   *
   * This ensures visual consistency between desktop and mobile views.
   * Users only need to customize the main navbar - mobile follows automatically.
   */
  mobileMenu: {
    /**
     * Breakpoint at which to show mobile menu.
     * Default: 768 (switches at tablet width)
     */
    breakpoint?: number

    /**
     * Side from which the drawer slides in.
     * Default: 'right'
     */
    drawerSide?: 'left' | 'right'

    /**
     * Custom hamburger icon (lucide icon name).
     * Default: 'menu'
     */
    hamburgerIcon?: string

    /**
     * Preview the mobile menu in the editor.
     * When true, shows the mobile drawer in canvas mode so users can see how it looks.
     * Default: false
     */
    showPreview?: boolean

    /**
     * Custom background color for the mobile dropdown menu.
     * When set, overrides the inherited navbar backgroundColor.
     * Useful when the navbar has a transparent background but the dropdown
     * needs a solid color to remain readable.
     * SOURCE OF TRUTH: MobileMenuBackgroundColor, NavbarDropdownBg
     */
    backgroundColor?: string

    /**
     * Custom text color for the mobile dropdown menu links.
     * When set, overrides the inherited linksTextColor / navbar color.
     * SOURCE OF TRUTH: MobileMenuTextColor, NavbarDropdownText
     */
    textColor?: string
  }
}

/**
 * Default navbar settings for new navbar elements.
 */
export const DEFAULT_NAVBAR_SETTINGS: NavbarSettings = {
  logo: {
    type: 'text',
    text: 'Logo',
    href: '/',
  },
  links: [
    { id: 'link_1', label: 'Home', href: '/' },
    { id: 'link_2', label: 'About', href: '/about' },
    { id: 'link_3', label: 'Services', href: '/services' },
    { id: 'link_4', label: 'Contact', href: '/contact' },
  ],
  ctaButton: {
    label: 'Get Started',
    href: '/get-started',
    variant: 'primary',
  },
  sticky: {
    enabled: true,
    showShadowOnScroll: true,
  },
  // Show Cart button by default for e-commerce functionality
  showCartButton: true,
  mobileMenu: {
    breakpoint: 768,
    drawerSide: 'right',
    hamburgerIcon: 'menu',
  },
}

// ============================================================================
// NAVBAR PREBUILT ELEMENT - Complete navbar element type
// ============================================================================

/**
 * PreBuilt navbar element.
 *
 * A complete, responsive navigation bar that:
 * - Shows links horizontally on desktop
 * - Shows a hamburger menu + Sheet/Drawer on mobile
 * - Optionally sticks to top when scrolling
 * - Is configured through Settings, not direct manipulation
 *
 * IMPORTANT: Child elements are NOT user-editable.
 * The navbar generates its visual children internally based on settings.
 */
export interface PreBuiltNavbarElement extends BasePreBuiltElement {
  /** Discriminated union type */
  type: 'prebuilt'

  /** Specific PreBuilt element type */
  prebuiltType: 'prebuilt-navbar'

  /**
   * Navbar-specific settings.
   * All configuration happens through this object via the Settings panel.
   */
  settings: NavbarSettings
}

// ============================================================================
// SIDEBAR LINK - Shared structure for sidebar navigation links
// ============================================================================

/**
 * A single navigation link in a sidebar.
 * Used in sidebar settings to define the navigation structure.
 *
 * ============================================================================
 * PAGE LINKING
 * ============================================================================
 *
 * Links support two routing modes:
 *
 * 1. INTERNAL PAGE LINK (pageId is set):
 *    - Links to a page in the website builder
 *    - href is auto-generated from the page's slug
 *    - Updates automatically if the page slug changes
 *
 * 2. CUSTOM/EXTERNAL LINK (pageId is null/undefined):
 *    - href is a direct URL (external or custom route)
 *    - User can enter any URL they want
 */
/**
 * Type of sidebar navigation item.
 * - 'link': A clickable navigation link (default)
 * - 'separator': A non-clickable group title/separator
 */
export type SidebarLinkType = 'link' | 'separator'

export interface SidebarLink {
  /** Unique identifier for this link */
  id: string

  /**
   * Type of this navigation item.
   * - 'link': A clickable navigation link (default)
   * - 'separator': A non-clickable group title/separator
   * @default 'link'
   */
  type?: SidebarLinkType

  /** Display text for the link (or separator title) */
  label: string

  /**
   * URL or route path for navigation.
   * Only used when type is 'link' (or undefined).
   */
  href: string

  /**
   * Internal page ID for page linking.
   * When set, this link points to an internal page.
   * The href is generated from the page's slug.
   * Only used when type is 'link'.
   */
  pageId?: string

  /**
   * Whether to open in new tab.
   * Default: false (same tab)
   * Only used when type is 'link'.
   */
  openInNewTab?: boolean

  /**
   * Optional icon name from the icon library.
   * Displayed before the label in the sidebar.
   * Only used when type is 'link'.
   */
  icon?: string

  /**
   * Custom styles for this individual link.
   */
  styles?: ElementStyles
}

// ============================================================================
// SIDEBAR SETTINGS - Configuration for sidebar PreBuilt element
// ============================================================================

/**
 * Settings for configuring a PreBuilt sidebar element.
 *
 * These settings are modified through the Settings panel in the properties
 * sidebar. The sidebar element itself (left side) cannot be edited directly
 * on the canvas - users configure it through settings.
 *
 * ============================================================================
 * KEY ARCHITECTURE
 * ============================================================================
 *
 * The sidebar consists of TWO parts:
 *
 * 1. SIDEBAR (left side) - Fixed, non-editable template
 *    - Contains logo, navigation links, footer
 *    - Users configure via Settings panel only
 *    - Cannot be directly manipulated on canvas
 *
 * 2. SIDEBAR INSET (right side) - Editable content area
 *    - A frame where users can drop elements
 *    - Acts like a normal frame for element drops
 *    - Cannot be removed or deleted (protected)
 *
 * ============================================================================
 * COLOR CUSTOMIZATION
 * ============================================================================
 *
 * - Logo: text color
 * - Links: text color, active state color
 * - Sidebar background color
 * - Inset background color
 */
export interface SidebarSettings {
  /**
   * Logo configuration for the sidebar header.
   */
  logo: {
    /** Logo type: image, text, or both */
    type: 'image' | 'text' | 'both'

    /** Logo image URL (when type is 'image' or 'both') */
    imageUrl?: string

    /** Logo text (when type is 'text' or 'both') */
    text?: string

    /** Link when clicking the logo (usually home page) */
    href: string

    /**
     * Logo text color.
     * Default: 'inherit' (uses sidebar's color)
     */
    textColor?: string

    /**
     * Logo image size (height in pixels).
     * The width scales proportionally via object-fit: contain.
     * Default: 28
     *
     * SOURCE OF TRUTH KEYWORDS: SidebarLogoSize, sidebar-logo-size
     */
    logoSize?: number
  }

  /**
   * Navigation links array.
   * Users can add, remove, reorder, and edit these through Settings.
   */
  links: SidebarLink[]

  /**
   * Link text color (applies to all navigation links).
   * Default: 'inherit' (uses sidebar's color)
   */
  linksTextColor?: string

  /**
   * Gap between navigation links in pixels.
   * Controls the vertical spacing between link items.
   * Default: 4px
   */
  linksGap?: number

  /**
   * Active link highlight color (text/icon color when active).
   * Default: '#3b82f6' (blue)
   */
  activeLinkColor?: string

  /**
   * Active link background color.
   * Default: 'rgba(59, 130, 246, 0.1)' (light blue)
   */
  activeLinkBackgroundColor?: string

  /**
   * Hover link color (text/icon color on hover).
   * Default: inherits from linksTextColor with increased opacity
   */
  hoverLinkColor?: string

  /**
   * Hover link background color.
   * Default: 'rgba(0, 0, 0, 0.05)' (subtle gray)
   */
  hoverLinkBackgroundColor?: string

  /**
   * Sidebar appearance settings.
   */
  appearance: {
    /**
     * Sidebar background color.
     * Default: '#ffffff' for light theme
     */
    backgroundColor?: string

    /**
     * Sidebar text color (affects all text/icons).
     * Default: '#1a1a1a'
     */
    textColor?: string

    /**
     * Sidebar border color (right edge).
     * Default: '#e5e5e5'
     */
    borderColor?: string

    /**
     * Sidebar width in pixels.
     * Default: 256 (16rem)
     */
    width?: number
  }

  /**
   * Inset (content area) appearance settings.
   */
  inset: {
    /**
     * Inset background color.
     * Default: '#f5f5f5' (light gray)
     */
    backgroundColor?: string
  }

  /**
   * Collapsible behavior settings.
   */
  collapsible: {
    /**
     * Whether the sidebar can be collapsed.
     * Default: true
     */
    enabled: boolean

    /**
     * Default collapsed state.
     * Default: false (expanded)
     */
    defaultCollapsed?: boolean

    /**
     * Collapse mode: 'offcanvas' (slides away) or 'icon' (shows icons only).
     * Default: 'offcanvas'
     */
    mode?: 'offcanvas' | 'icon'
  }

  /**
   * Mobile behavior settings.
   *
   * ============================================================================
   * SOURCE OF TRUTH: Main sidebar appearance is used for mobile drawer
   * ============================================================================
   *
   * The mobile drawer automatically inherits colors from the main sidebar:
   * - Drawer background = sidebar appearance.backgroundColor
   * - Drawer text = sidebar appearance.textColor
   * - Drawer border = sidebar appearance.borderColor
   *
   * This ensures visual consistency between desktop and mobile views.
   * Users only need to customize the main sidebar - mobile follows automatically.
   */
  mobile: {
    /**
     * Breakpoint at which to switch to mobile layout.
     * Default: 768
     */
    breakpoint?: number

    /**
     * Preview the mobile menu in the editor.
     * When true, shows the mobile drawer in canvas mode so users can see how it looks.
     * Default: false
     */
    showPreview?: boolean

    // NOTE: drawerBackgroundColor has been removed. The mobile drawer now
    // inherits colors from the main sidebar appearance settings for visual
    // consistency (source of truth pattern).
  }

  /**
   * Footer content for the sidebar bottom.
   * Optional - if not provided, no footer is shown.
   */
  footer?: {
    /**
     * Footer text content.
     */
    text?: string

    /**
     * Footer text color.
     * Default: uses sidebar text color with reduced opacity
     */
    textColor?: string
  }
}

/**
 * Default sidebar settings for new sidebar elements.
 */
export const DEFAULT_SIDEBAR_SETTINGS: SidebarSettings = {
  logo: {
    type: 'text',
    text: 'Logo',
    href: '/',
  },
  links: [
    { id: 'link_1', label: 'Dashboard', href: '/dashboard', icon: 'home' },
    { id: 'link_2', label: 'Projects', href: '/projects', icon: 'folder' },
    { id: 'link_3', label: 'Settings', href: '/settings', icon: 'settings' },
  ],
  // Gap between navigation links (vertical spacing)
  linksGap: 4,
  // Active/hover state colors for navigation links
  activeLinkColor: '#3b82f6',
  activeLinkBackgroundColor: 'rgba(59, 130, 246, 0.1)',
  hoverLinkColor: undefined, // Inherits from linksTextColor
  hoverLinkBackgroundColor: 'rgba(0, 0, 0, 0.05)',
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
  mobile: {
    breakpoint: 768,
  },
}

// ============================================================================
// SIDEBAR PREBUILT ELEMENT - Complete sidebar element type
// ============================================================================

/**
 * PreBuilt sidebar element.
 *
 * A complete, responsive sidebar layout that:
 * - Has a fixed sidebar on the left with logo, links, and footer
 * - Has an inset content area on the right for user content
 * - Supports collapsing (offcanvas or icon mode)
 * - Shows a mobile drawer on smaller screens
 * - Is configured through Settings, not direct manipulation
 *
 * IMPORTANT:
 * - The sidebar (left) is NOT user-editable - configuration via Settings only
 * - The inset (right) is a protected frame where users CAN drop elements
 * - Neither the sidebar nor the inset can be removed/deleted
 */
export interface PreBuiltSidebarElement extends BasePreBuiltElement {
  /** Discriminated union type */
  type: 'prebuilt'

  /** Specific PreBuilt element type */
  prebuiltType: 'prebuilt-sidebar'

  /**
   * Sidebar-specific settings.
   * All configuration happens through this object via the Settings panel.
   */
  settings: SidebarSettings

  /**
   * ID of the inset frame element.
   * This is a child frame where users can drop their content.
   * The inset is auto-created when the sidebar is placed on canvas.
   */
  insetFrameId: string
}

// ============================================================================
// TOTAL MEMBERS SETTINGS - Configuration for total members PreBuilt element
// ============================================================================

/**
 * Settings for configuring a PreBuilt total members element.
 *
 * This is a social proof element that displays:
 * - Stacked avatar images (hardcoded Unsplash profile pictures)
 * - A message like "7000+ prodigies worldwide"
 *
 * Users can only customize the message text - avatars are fixed.
 */
export interface TotalMembersSettings {
  /**
   * The message displayed next to the avatars.
   * Example: "7000+ prodigies worldwide"
   */
  message: string

  /**
   * Text color for the message.
   * Default: '#ffffff' (white for dark backgrounds)
   */
  textColor?: string

  /**
   * Font size for the message in pixels.
   * Default: 16
   */
  fontSize?: number

  /**
   * Font weight for the message.
   * Default: 500
   */
  fontWeight?: number

  /**
   * Border color for the avatar images.
   * Creates the "cutout" effect around each avatar.
   * Default: '#000000' (black)
   */
  avatarBorderColor?: string
}

/**
 * Default total members settings for new elements.
 */
export const DEFAULT_TOTAL_MEMBERS_SETTINGS: TotalMembersSettings = {
  message: '7000+ prodigies worldwide',
  textColor: '#ffffff',
  fontSize: 16,
  fontWeight: 500,
  avatarBorderColor: '#000000',
}

// ============================================================================
// TOTAL MEMBERS PREBUILT ELEMENT - Complete total members element type
// ============================================================================

/**
 * PreBuilt total members element.
 *
 * A social proof component that shows:
 * - 5 stacked circular avatar images (from Unsplash)
 * - A customizable message (e.g., "7000+ prodigies worldwide")
 *
 * This creates trust and authority by showing community size.
 *
 * IMPORTANT:
 * - Avatar images are hardcoded (not user-editable)
 * - Only the message text can be customized via Settings
 */
export interface PreBuiltTotalMembersElement extends BasePreBuiltElement {
  /** Discriminated union type */
  type: 'prebuilt'

  /** Specific PreBuilt element type */
  prebuiltType: 'prebuilt-total-members'

  /**
   * Total members-specific settings.
   * Only the message is configurable.
   */
  settings: TotalMembersSettings
}

/**
 * Check if an element is a PreBuilt total members element.
 */
export function isPreBuiltTotalMembers(
  element: unknown
): element is PreBuiltTotalMembersElement {
  return (
    isPreBuiltElement(element) &&
    element.prebuiltType === 'prebuilt-total-members'
  )
}

// ============================================================================
// LOGO CAROUSEL - Settings, defaults, and element type
// ============================================================================

/**
 * A single logo entry in the carousel.
 *
 * SOURCE OF TRUTH KEYWORDS: LogoCarouselLogo, logo-carousel-logo-entry
 */
export interface LogoCarouselLogo {
  /** Unique ID for this logo entry */
  id: string

  /** Image URL (local path or uploaded URL) */
  src: string

  /** Alt text for accessibility */
  alt?: string

  /** Optional link URL — clicking the logo navigates here */
  href?: string

  /** Whether to open link in new tab */
  openInNewTab?: boolean
}

/**
 * Settings for configuring a PreBuilt logo carousel element.
 *
 * These settings are modified through the Settings panel in the properties
 * sidebar. Individual logos CANNOT be selected or deleted on the canvas —
 * all management happens through these settings.
 *
 * SOURCE OF TRUTH KEYWORDS: LogoCarouselSettings, logo-carousel-settings
 */
export interface LogoCarouselSettings {
  /** Array of logo images displayed in the carousel */
  logos: LogoCarouselLogo[]

  /** Size of each logo in pixels (width & height). Default: 100 */
  logoSize?: number

  /** Gap between logos in pixels. Default: 20 */
  gap?: number

  /** Apply grayscale filter to all logos for a professional look. Default: true */
  grayscale?: boolean

  /** How logo images fit within their container. Default: 'contain' */
  objectFit?: 'contain' | 'cover'

  /** Enable infinite auto-scroll marquee animation. Default: false */
  autoScroll?: boolean

  /** Auto-scroll speed in pixels per second. Default: 50 */
  autoScrollSpeed?: number

  /** Direction of auto-scroll animation. Default: 'left' */
  autoScrollDirection?: 'left' | 'right'

  /** Padding around the carousel container in pixels. Default: 20 */
  padding?: number
}

/**
 * Default logo carousel settings for new elements.
 * Pre-loaded with 10 placeholder logos from /public/free-logos/.
 */
export const DEFAULT_LOGO_CAROUSEL_SETTINGS: LogoCarouselSettings = {
  logos: [
    { id: 'logo_1', src: '/free-logos/acme-corp.png', alt: 'Acme Corp' },
    { id: 'logo_2', src: '/free-logos/alphawave.png', alt: 'Alphawave' },
    { id: 'logo_3', src: '/free-logos/alt-shift.png', alt: 'Alt Shift' },
    { id: 'logo_4', src: '/free-logos/biosynthesis.png', alt: 'Biosynthesis' },
    { id: 'logo_5', src: '/free-logos/codecraft.png', alt: 'Codecraft' },
    { id: 'logo_6', src: '/free-logos/constellation.png', alt: 'Constellation' },
    { id: 'logo_7', src: '/free-logos/convergence.png', alt: 'Convergence' },
    { id: 'logo_8', src: '/free-logos/elasticware.png', alt: 'Elasticware' },
    { id: 'logo_9', src: '/free-logos/foresight.png', alt: 'Foresight' },
    { id: 'logo_10', src: '/free-logos/hexahedron.png', alt: 'Hexahedron' },
  ],
  logoSize: 100,
  gap: 20,
  grayscale: true,
  objectFit: 'contain',
  autoScroll: false,
  autoScrollSpeed: 50,
  autoScrollDirection: 'left',
  padding: 20,
}

// ============================================================================
// LOGO CAROUSEL PREBUILT ELEMENT - Complete logo carousel element type
// ============================================================================

/**
 * PreBuilt logo carousel element.
 *
 * A social proof component that displays a horizontal strip of logos
 * with optional infinite scroll animation. Logos are managed entirely
 * through settings — users cannot select or delete individual logos on canvas.
 *
 * SOURCE OF TRUTH KEYWORDS: PreBuiltLogoCarouselElement, prebuilt-logo-carousel
 */
export interface PreBuiltLogoCarouselElement extends BasePreBuiltElement {
  /** Discriminated union type */
  type: 'prebuilt'

  /** Specific PreBuilt element type */
  prebuiltType: 'prebuilt-logo-carousel'

  /** Logo carousel-specific settings (logos, size, animation, etc.) */
  settings: LogoCarouselSettings

  /** Fade edges effect — CSS mask-image gradient at container edges */
  fadeEdges?: 'none' | 'top' | 'bottom' | 'left' | 'right' | 'top-bottom' | 'left-right' | 'all'

  /** Fade edges height/intensity as percentage of container (1-50, default 10) */
  fadeEdgesHeight?: number
}

/**
 * Check if an element is a PreBuilt logo carousel.
 */
export function isPreBuiltLogoCarousel(
  element: unknown
): element is PreBuiltLogoCarouselElement {
  return (
    isPreBuiltElement(element) &&
    element.prebuiltType === 'prebuilt-logo-carousel'
  )
}

/**
 * Generate unique ID for logo entries.
 * Format: logo_[timestamp]_[random]
 */
export function generateLogoId(): string {
  return `logo_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

// ============================================================================
// PREBUILT ELEMENT UNION - All PreBuilt element types
// ============================================================================

/**
 * Union of all PreBuilt element types.
 *
 * Add new PreBuilt element interfaces here as they're created.
 */
export type PreBuiltElement = PreBuiltNavbarElement | PreBuiltSidebarElement | PreBuiltTotalMembersElement | PreBuiltLogoCarouselElement
// Future:
// | PreBuiltHeroElement
// | PreBuiltFooterElement
// | etc.

// ============================================================================
// PREBUILT SETTINGS UNION - All PreBuilt settings types
// ============================================================================

/**
 * Union of all PreBuilt settings types.
 * Used for type-safe settings access and updates.
 */
export type PreBuiltSettings = NavbarSettings | SidebarSettings | TotalMembersSettings | LogoCarouselSettings
// Future: | HeroSettings | FooterSettings | etc.

// ============================================================================
// PREBUILT VARIANT - Defines a specific variant of a PreBuilt type
// ============================================================================

/**
 * Metadata for a specific variant of a PreBuilt element.
 *
 * ============================================================================
 * AI-FRIENDLY DESIGN
 * ============================================================================
 *
 * Each variant includes rich metadata that helps AI understand:
 * - WHEN to use this variant (tags, use cases)
 * - WHAT it looks like (description, preview)
 * - HOW to configure it (default settings)
 *
 * This makes it easy for AI to select the appropriate variant and
 * provide sensible default configurations.
 */
export interface PreBuiltVariant {
  /** Unique variant identifier within the type */
  id: string

  /** Human-readable variant name */
  label: string

  /**
   * Detailed description of this variant.
   * Should explain what makes this variant unique.
   */
  description: string

  /**
   * Tags for categorization and AI understanding.
   * Example: ['minimal', 'transparent', 'modern', 'startup']
   */
  tags: string[]

  /**
   * Keywords that help AI match user intent.
   * Example: ['clean navbar', 'simple navigation', 'no background']
   */
  keywords: string[]

  /**
   * Use case examples for AI context.
   * Example: ['SaaS landing page', 'portfolio site', 'startup homepage']
   */
  useCases: string[]

  /**
   * Niche/industry this variant fits well.
   * Example: ['tech', 'creative', 'professional', 'e-commerce']
   */
  niches: string[]

  /**
   * Preview illustration identifier for sidebar display.
   * Maps to an SVG illustration.
   */
  illustration: string

  /**
   * Default width for this variant.
   */
  defaultWidth: number

  /**
   * Default height for this variant.
   */
  defaultHeight: number

  /**
   * Default styles for this variant.
   */
  defaultStyles: ElementStyles

  /**
   * Default settings specific to the variant.
   * Merged with the PreBuilt type's default settings.
   */
  defaultSettings: Partial<PreBuiltSettings>

  /**
   * SOURCE OF TRUTH: PreBuiltResizeControl, LockedDimensions
   *
   * Which resize handles are allowed for this variant on the canvas.
   * Controls which edges/corners users can drag to resize.
   *
   * - Empty array [] = NO resize allowed (fully locked dimensions)
   * - ['e', 'w'] = horizontal only
   * - ['n', 's'] = vertical only
   * - undefined = all handles (default behavior)
   *
   * Components like sidebar, navbar, total-members have fixed/viewport-driven
   * dimensions and should NOT be user-resizable.
   */
  allowedResizeHandles?: ('n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw')[]
}

// ============================================================================
// PREBUILT DEFINITION - Complete definition for a PreBuilt element type
// ============================================================================

/**
 * Complete definition for a PreBuilt element type.
 *
 * This is the top-level entry in the PREBUILT_REGISTRY.
 * Contains all metadata and variants for one PreBuilt type.
 */
export interface PreBuiltDefinition {
  /** PreBuilt type identifier */
  type: PreBuiltElementType

  /** Category for sidebar organization */
  category: PreBuiltCategory

  /** Human-readable type name */
  label: string

  /** Description of this PreBuilt type */
  description: string

  /** Icon name from lucide-react for sidebar */
  icon: string

  /**
   * Available variants for this PreBuilt type.
   * At least one variant is required.
   */
  variants: PreBuiltVariant[]

  /**
   * Default settings for this PreBuilt type.
   * Variant-specific defaults are merged on top.
   */
  defaultSettings: PreBuiltSettings
}

// ============================================================================
// HELPER FUNCTION - Generate unique IDs for PreBuilt elements
// ============================================================================

/**
 * Generate unique ID for new PreBuilt elements.
 * Format: prebuilt_[timestamp]_[random]
 */
export function generatePreBuiltId(): string {
  return `prebuilt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Generate unique ID for navbar links.
 * Format: link_[timestamp]_[random]
 */
export function generateLinkId(): string {
  return `link_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

// ============================================================================
// TYPE GUARDS - For runtime type checking
// ============================================================================

/**
 * Check if an element is a PreBuilt element.
 */
export function isPreBuiltElement(element: unknown): element is PreBuiltElement {
  return (
    typeof element === 'object' &&
    element !== null &&
    'type' in element &&
    (element as { type: string }).type === 'prebuilt' &&
    'prebuiltType' in element
  )
}

/**
 * Check if an element is a PreBuilt navbar.
 */
export function isPreBuiltNavbar(
  element: unknown
): element is PreBuiltNavbarElement {
  return (
    isPreBuiltElement(element) &&
    element.prebuiltType === 'prebuilt-navbar'
  )
}

/**
 * Check if an element is a PreBuilt sidebar.
 */
export function isPreBuiltSidebar(
  element: unknown
): element is PreBuiltSidebarElement {
  return (
    isPreBuiltElement(element) &&
    element.prebuiltType === 'prebuilt-sidebar'
  )
}

/**
 * Generate unique ID for sidebar links.
 * Format: sidebar_link_[timestamp]_[random]
 */
export function generateSidebarLinkId(): string {
  return `sidebar_link_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}
