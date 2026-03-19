/**
 * Notification Category Icons
 *
 * SOURCE OF TRUTH KEYWORDS: NotificationCategoryIcons, CategoryIconMap,
 *   NotificationIcon, getCategoryIcon
 *
 * WHY: Maps each NotificationCategory to a lucide-react icon component
 * for consistent visual representation across the notification UI
 * (bell dropdown, notification list, notification detail).
 *
 * HOW: Uses a Record keyed by NotificationCategory so TypeScript enforces
 * that every category has an icon. The getCategoryIcon function provides
 * a safe runtime lookup with a fallback for any unrecognized categories.
 */

import {
  DollarSign,
  Users,
  Zap,
  FileText,
  CalendarDays,
  FileSignature,
  Receipt,
  Settings,
  Inbox,
  Kanban,
  Bell,
  type LucideIcon,
} from 'lucide-react'
import type { NotificationCategory } from './types'

// ============================================================================
// ICON MAP
// ============================================================================

/**
 * Maps every NotificationCategory to its corresponding lucide-react icon.
 *
 * The Record<NotificationCategory, LucideIcon> type ensures that if a new
 * category is added to the union, TypeScript will error here until an icon
 * is assigned — preventing missing icons at compile time.
 *
 * SOURCE OF TRUTH: CategoryIconMap, NotificationCategoryIconMapping
 */
const CATEGORY_ICON_MAP: Record<NotificationCategory, LucideIcon> = {
  payment: DollarSign,
  lead: Users,
  automation: Zap,
  form: FileText,
  appointment: CalendarDays,
  contract: FileSignature,
  invoice: Receipt,
  system: Settings,
  inbox: Inbox,
  pipeline: Kanban,
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get the lucide-react icon component for a notification category.
 *
 * WHY a function instead of direct map access: The `category` field comes
 * from the database as a string. This function provides a safe lookup with
 * a fallback icon (Bell) for any unrecognized category values, preventing
 * runtime crashes if a new category is added to the DB before the UI is updated.
 *
 * @param category - The notification category string from the database
 * @returns The corresponding LucideIcon component (defaults to Bell if unknown)
 *
 * @example
 * ```tsx
 * import { getCategoryIcon } from '@/lib/notifications/category-icons'
 *
 * const Icon = getCategoryIcon(notification.category)
 * return <Icon className="h-4 w-4" />
 * ```
 */
export function getCategoryIcon(category: string): LucideIcon {
  return CATEGORY_ICON_MAP[category as NotificationCategory] ?? Bell
}
