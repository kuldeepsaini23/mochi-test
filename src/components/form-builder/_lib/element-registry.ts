/**
 * ============================================================================
 * FORM ELEMENT REGISTRY
 * ============================================================================
 *
 * Central registry of all available form elements.
 * Used by the sidebar to display draggable elements and by the canvas
 * to render the correct component for each element type.
 *
 * STRUCTURE:
 * - Each element has metadata for display in sidebar
 * - Elements are grouped by category for organization
 * - Icons use Lucide React for consistency
 */

import type { FormElementType } from './types'
import {
  Type,
  Mail,
  Phone,
  Hash,
  Lock,
  Link,
  AlignLeft,
  ChevronDown,
  ListChecks,
  Circle,
  Square,
  CheckSquare,
  Calendar,
  Clock,
  CalendarClock,
  Heading1,
  Text,
  Minus,
  Space,
  EyeOff,
  Star,
  SlidersHorizontal,
  Send,
  // Name element icons
  User,
  UserCircle,
  // Address element icons
  MapPin,
  Home,
  Building2,
  Map as MapIcon,
  Navigation,
  Globe,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Element category for sidebar grouping.
 */
export type ElementCategory =
  | 'input'
  | 'address'
  | 'selection'
  | 'datetime'
  | 'layout'
  | 'special'

/**
 * Metadata for a single form element type.
 */
export interface ElementRegistryEntry {
  /** The element type identifier */
  type: FormElementType
  /** Display label in sidebar */
  label: string
  /** Short description for tooltip */
  description: string
  /** Icon component */
  icon: LucideIcon
  /** Category for grouping */
  category: ElementCategory
  /** Whether this element collects user data (vs layout) */
  isInput: boolean
}

/**
 * Category metadata for sidebar sections.
 */
export interface CategoryMeta {
  id: ElementCategory
  label: string
  description: string
}

// ============================================================================
// CATEGORY DEFINITIONS
// ============================================================================

/**
 * Category metadata for sidebar section headers.
 */
export const ELEMENT_CATEGORIES: CategoryMeta[] = [
  {
    id: 'input',
    label: 'Text Inputs',
    description: 'Text fields and text areas',
  },
  {
    id: 'address',
    label: 'Address',
    description: 'Address fields with browser autofill',
  },
  {
    id: 'selection',
    label: 'Selection',
    description: 'Dropdowns, checkboxes, and radio buttons',
  },
  {
    id: 'datetime',
    label: 'Date & Time',
    description: 'Date and time pickers',
  },
  {
    id: 'layout',
    label: 'Layout',
    description: 'Headings, text, and visual separators',
  },
  {
    id: 'special',
    label: 'Special',
    description: 'Ratings and sliders',
  },
]

// ============================================================================
// ELEMENT REGISTRY
// ============================================================================

/**
 * Complete registry of all form element types.
 * This is the source of truth for available elements.
 */
export const ELEMENT_REGISTRY: ElementRegistryEntry[] = [
  // ========================================
  // TEXT INPUTS
  // ========================================
  {
    type: 'text',
    label: 'Text',
    description: 'Single-line text input',
    icon: Type,
    category: 'input',
    isInput: true,
  },
  {
    type: 'firstName',
    label: 'First Name',
    description: 'First name with browser autofill',
    icon: User,
    category: 'input',
    isInput: true,
  },
  {
    type: 'lastName',
    label: 'Last Name',
    description: 'Last name with browser autofill',
    icon: UserCircle,
    category: 'input',
    isInput: true,
  },
  {
    type: 'email',
    label: 'Email',
    description: 'Email address with validation',
    icon: Mail,
    category: 'input',
    isInput: true,
  },
  {
    type: 'phone',
    label: 'Phone',
    description: 'Phone number input',
    icon: Phone,
    category: 'input',
    isInput: true,
  },
  {
    type: 'number',
    label: 'Number',
    description: 'Numeric input with min/max',
    icon: Hash,
    category: 'input',
    isInput: true,
  },
  {
    type: 'password',
    label: 'Password',
    description: 'Masked password field',
    icon: Lock,
    category: 'input',
    isInput: true,
  },
  {
    type: 'url',
    label: 'URL',
    description: 'Website URL with validation',
    icon: Link,
    category: 'input',
    isInput: true,
  },
  {
    type: 'textarea',
    label: 'Text Area',
    description: 'Multi-line text input',
    icon: AlignLeft,
    category: 'input',
    isInput: true,
  },

  // ========================================
  // ADDRESS ELEMENTS
  // These fields support browser autofill for seamless form completion.
  // Users can quickly fill addresses using saved browser data.
  // ========================================
  {
    type: 'address',
    label: 'Street Address',
    description: 'Street address line 1 (autofill)',
    icon: Home,
    category: 'address',
    isInput: true,
  },
  {
    type: 'address2',
    label: 'Address Line 2',
    description: 'Apt, suite, unit (autofill)',
    icon: Building2,
    category: 'address',
    isInput: true,
  },
  {
    type: 'city',
    label: 'City',
    description: 'City or town (autofill)',
    icon: MapPin,
    category: 'address',
    isInput: true,
  },
  {
    type: 'state',
    label: 'State/Province',
    description: 'State or province (autofill)',
    icon: MapIcon,
    category: 'address',
    isInput: true,
  },
  {
    type: 'zipCode',
    label: 'ZIP/Postal Code',
    description: 'ZIP or postal code (autofill)',
    icon: Navigation,
    category: 'address',
    isInput: true,
  },
  {
    type: 'country',
    label: 'Country',
    description: 'Country (autofill)',
    icon: Globe,
    category: 'address',
    isInput: true,
  },

  // ========================================
  // SELECTION ELEMENTS
  // ========================================
  {
    type: 'select',
    label: 'Dropdown',
    description: 'Single selection dropdown',
    icon: ChevronDown,
    category: 'selection',
    isInput: true,
  },
  {
    type: 'multiselect',
    label: 'Multi-Select',
    description: 'Multiple selection dropdown',
    icon: ListChecks,
    category: 'selection',
    isInput: true,
  },
  {
    type: 'radio',
    label: 'Radio',
    description: 'Single choice from options',
    icon: Circle,
    category: 'selection',
    isInput: true,
  },
  {
    type: 'checkbox',
    label: 'Checkbox',
    description: 'Single yes/no checkbox',
    icon: Square,
    category: 'selection',
    isInput: true,
  },
  {
    type: 'checkboxGroup',
    label: 'Checkbox Group',
    description: 'Multiple checkboxes',
    icon: CheckSquare,
    category: 'selection',
    isInput: true,
  },

  // ========================================
  // DATE & TIME ELEMENTS
  // ========================================
  {
    type: 'date',
    label: 'Date',
    description: 'Date picker',
    icon: Calendar,
    category: 'datetime',
    isInput: true,
  },
  {
    type: 'time',
    label: 'Time',
    description: 'Time picker',
    icon: Clock,
    category: 'datetime',
    isInput: true,
  },
  {
    type: 'datetime',
    label: 'Date & Time',
    description: 'Combined date and time',
    icon: CalendarClock,
    category: 'datetime',
    isInput: true,
  },


  // ========================================
  // LAYOUT ELEMENTS
  // ========================================
  {
    type: 'heading',
    label: 'Heading',
    description: 'Section title (H1-H6)',
    icon: Heading1,
    category: 'layout',
    isInput: false,
  },
  {
    type: 'paragraph',
    label: 'Paragraph',
    description: 'Descriptive text block',
    icon: Text,
    category: 'layout',
    isInput: false,
  },
  {
    type: 'divider',
    label: 'Divider',
    description: 'Horizontal line separator',
    icon: Minus,
    category: 'layout',
    isInput: false,
  },
  {
    type: 'spacer',
    label: 'Spacer',
    description: 'Empty vertical space',
    icon: Space,
    category: 'layout',
    isInput: false,
  },

  // ========================================
  // SPECIAL ELEMENTS
  // ========================================
  {
    type: 'hidden',
    label: 'Hidden',
    description: 'Hidden field for data',
    icon: EyeOff,
    category: 'special',
    isInput: true,
  },
  {
    type: 'rating',
    label: 'Rating',
    description: 'Star rating selector',
    icon: Star,
    category: 'special',
    isInput: true,
  },
  {
    type: 'slider',
    label: 'Slider',
    description: 'Range slider input',
    icon: SlidersHorizontal,
    category: 'special',
    isInput: true,
  },
  {
    type: 'submit',
    label: 'Submit Button',
    description: 'Form submit button',
    icon: Send,
    category: 'special',
    isInput: false,
  },
]

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get element registry entry by type.
 */
export function getElementEntry(type: FormElementType): ElementRegistryEntry | undefined {
  return ELEMENT_REGISTRY.find((entry) => entry.type === type)
}

/**
 * Get all elements in a category.
 */
export function getElementsByCategory(category: ElementCategory): ElementRegistryEntry[] {
  return ELEMENT_REGISTRY.filter((entry) => entry.category === category)
}

/**
 * Get elements grouped by category for sidebar display.
 */
export function getGroupedElements(): Map<ElementCategory, ElementRegistryEntry[]> {
  const grouped = new Map<ElementCategory, ElementRegistryEntry[]>()

  for (const category of ELEMENT_CATEGORIES) {
    const elements = getElementsByCategory(category.id)
    if (elements.length > 0) {
      grouped.set(category.id, elements)
    }
  }

  return grouped
}

/**
 * Check if an element type is a data-collecting input.
 */
export function isInputElement(type: FormElementType): boolean {
  const entry = getElementEntry(type)
  return entry?.isInput ?? false
}

/**
 * Check if an element type is a layout element.
 */
export function isLayoutElement(type: FormElementType): boolean {
  const entry = getElementEntry(type)
  return entry?.category === 'layout'
}

/**
 * Get the icon component for an element type.
 */
export function getElementIcon(type: FormElementType): LucideIcon | undefined {
  const entry = getElementEntry(type)
  return entry?.icon
}

