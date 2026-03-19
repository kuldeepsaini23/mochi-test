/**
 * ============================================================================
 * PREBUILT ELEMENTS - Public API
 * ============================================================================
 *
 * This file exports the public API for the PreBuilt elements system.
 * Import from here to access types, registry, and utilities.
 *
 * Usage:
 * ```ts
 * import {
 *   // Types
 *   PreBuiltElement,
 *   PreBuiltNavbarElement,
 *   NavbarSettings,
 *
 *   // Registry
 *   PREBUILT_REGISTRY,
 *   getPreBuiltDefinition,
 *   getPreBuiltVariant,
 *
 *   // Utilities
 *   isPreBuiltElement,
 *   generatePreBuiltId,
 * } from './_lib/prebuilt'
 * ```
 */

// ============================================================================
// TYPES - All type definitions
// ============================================================================

export type {
  // Element types
  PreBuiltElementType,
  PreBuiltCategory,
  PreBuiltCategoryInfo,
  BasePreBuiltElement,
  PreBuiltElement,
  PreBuiltNavbarElement,
  PreBuiltSidebarElement,
  PreBuiltTotalMembersElement,
  PreBuiltLogoCarouselElement,

  // Settings types
  PreBuiltSettings,
  NavbarSettings,
  NavbarLink,
  NavbarChildStyles,
  SidebarSettings,
  SidebarLink,
  SidebarLinkType,
  TotalMembersSettings,
  LogoCarouselSettings,
  LogoCarouselLogo,

  // Registry types
  PreBuiltVariant,
  PreBuiltDefinition,
} from './types'

// Default settings
export {
  DEFAULT_NAVBAR_SETTINGS,
  DEFAULT_SIDEBAR_SETTINGS,
  DEFAULT_TOTAL_MEMBERS_SETTINGS,
  DEFAULT_LOGO_CAROUSEL_SETTINGS,
} from './types'

// ============================================================================
// UTILITIES - Helper functions
// ============================================================================

export {
  // ID generation
  generatePreBuiltId,
  generateLinkId,
  generateSidebarLinkId,
  generateLogoId,

  // Type guards
  isPreBuiltElement,
  isPreBuiltNavbar,
  isPreBuiltSidebar,
  isPreBuiltTotalMembers,
  isPreBuiltLogoCarousel,
} from './types'

// ============================================================================
// REGISTRY - PreBuilt elements registry and helpers
// ============================================================================

export {
  // Registry data
  PREBUILT_REGISTRY,
  PREBUILT_CATEGORIES,

  // Query functions
  getAllPreBuiltDefinitions,
  getPreBuiltDefinition,
  getPreBuiltByCategory,
  getPreBuiltVariant,
  getActiveCategories,
  searchPreBuiltElements,
  getPreBuiltSidebarItems,
  getAllowedResizeHandles,
} from './registry'
