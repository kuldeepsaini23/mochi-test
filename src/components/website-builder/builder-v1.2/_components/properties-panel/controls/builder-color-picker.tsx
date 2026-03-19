/**
 * ========================================
 * BUILDER COLOR PICKER — Builder-aware wrapper for AdvancedColorPicker
 * ========================================
 *
 * Wraps the generic AdvancedColorPicker with builder-specific functionality:
 * - Injects hardcoded quick preset colors (including transparent)
 * - Fetches and injects saved/reusable colors from the organization's database
 * - Provides save and delete handlers wired to tRPC mutations
 *
 * WHY a wrapper: Keeps AdvancedColorPicker reusable outside the builder
 * (it has no tRPC or builder context dependency). This wrapper auto-injects
 * everything the builder needs through props.
 *
 * SOURCE OF TRUTH KEYWORDS: BuilderColorPicker, QuickColors, SavedColors
 */

'use client'

import { useCallback } from 'react'
import {
  AdvancedColorPicker,
  type AdvancedColorPickerProps,
} from '@/components/ui/advanced-color-picker'
import { useBuilderContext } from '../../../_lib/builder-context'
import { trpc } from '@/trpc/react-provider'
import { isSavedGradient } from '@/lib/saved-colors/saved-color-value'

// ============================================================================
// QUICK PRESET COLORS
// ============================================================================

/**
 * 12 common colors for quick selection. Displayed as a 6x2 grid of swatches.
 * Includes transparent as the first option for clearing a color.
 */
const QUICK_PRESET_COLORS = [
  'transparent',
  '#FFFFFF',
  '#000000',
  '#6B7280',
  '#EF4444',
  '#F97316',
  '#EAB308',
  '#22C55E',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
]

// ============================================================================
// PROPS — Same as AdvancedColorPicker minus the injected props
// ============================================================================

/**
 * BuilderColorPicker accepts the same value/onChange/showOpacity props
 * as AdvancedColorPicker but auto-injects quick colors, saved colors,
 * and save/delete handlers from the builder context.
 */
interface BuilderColorPickerProps {
  /** Current color value (hex, rgba, or 'transparent') */
  value: AdvancedColorPickerProps['value']
  /** Change handler — receives hex when opacity is 100%, rgba otherwise */
  onChange: AdvancedColorPickerProps['onChange']
  /** Show the opacity slider and input (default: true) */
  showOpacity?: AdvancedColorPickerProps['showOpacity']
  /**
   * When true, hides the saved colors section entirely.
   * Used by GradientControl which provides its own unified "Saved Fills" section
   * that includes both solid and gradient fills.
   */
  hideSavedColors?: boolean
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Builder-aware color picker that auto-injects quick preset colors and
 * organization-level saved colors from the database via tRPC.
 *
 * Use this instead of AdvancedColorPicker anywhere inside the builder
 * properties panel or gradient control.
 */
export function BuilderColorPicker({
  value,
  onChange,
  showOpacity,
  hideSavedColors = false,
}: BuilderColorPickerProps) {
  const { organizationId } = useBuilderContext()

  /**
   * Fetch saved colors for this organization.
   * Returns empty array while loading or if Prisma model isn't set up yet.
   */
  const savedColorsQuery = trpc.savedColors.list.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  )

  /** Mutation to create a new saved color */
  const createMutation = trpc.savedColors.create.useMutation({
    onSuccess: () => {
      /* Invalidate the list to refetch after saving */
      savedColorsQuery.refetch()
    },
  })

  /** Mutation to delete a saved color */
  const deleteMutation = trpc.savedColors.delete.useMutation({
    onSuccess: () => {
      /* Invalidate the list to refetch after deleting */
      savedColorsQuery.refetch()
    },
  })

  /**
   * Save the current color with a user-provided name.
   * Calls the tRPC create mutation, which auto-assigns sortOrder.
   */
  const handleSaveColor = useCallback(
    (name: string, color: string) => {
      if (!organizationId) return
      createMutation.mutate({ organizationId, name, color })
    },
    [organizationId, createMutation]
  )

  /**
   * Delete a saved color by its ID.
   * Org-scoped on the server to prevent cross-org access.
   */
  const handleDeleteSavedColor = useCallback(
    (id: string) => {
      if (!organizationId) return
      deleteMutation.mutate({ organizationId, id })
    },
    [organizationId, deleteMutation]
  )

  /**
   * Map saved colors from tRPC response to the format AdvancedColorPicker expects.
   * Filters out gradient JSON values — the solid color picker should only show
   * plain colors (gradients are handled at the GradientControl level).
   * When hideSavedColors is true, returns empty array (GradientControl manages its own fills section).
   */
  const savedColors = hideSavedColors
    ? []
    : (savedColorsQuery.data ?? [])
        .filter((c) => !isSavedGradient(c.color))
        .map((c) => ({ id: c.id, name: c.name, color: c.color }))

  return (
    <AdvancedColorPicker
      value={value}
      onChange={onChange}
      showOpacity={showOpacity}
      quickColors={QUICK_PRESET_COLORS}
      savedColors={savedColors}
      onSaveColor={hideSavedColors ? undefined : handleSaveColor}
      onDeleteSavedColor={hideSavedColors ? undefined : handleDeleteSavedColor}
    />
  )
}
