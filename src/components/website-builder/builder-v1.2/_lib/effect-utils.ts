/**
 * ========================================
 * EFFECT UTILITIES
 * ========================================
 *
 * Utility functions for managing element effects like:
 * - Drop Shadow / Box Shadow
 * - Inner Shadow
 * - Layer Blur (blurs the element itself)
 * - Background Blur (frosted glass effect)
 *
 * These utilities handle:
 * - Creating default effect configurations
 * - Converting effect configs to CSS properties
 * - Generating unique IDs for effects
 */

import type { ShadowEffect, BlurEffect, EffectsConfig } from './types'

// ============================================================================
// ID GENERATION
// ============================================================================

/**
 * Generate a unique ID for an effect.
 * Uses timestamp + random string for uniqueness.
 */
export function generateEffectId(): string {
  return `effect-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

// ============================================================================
// DEFAULT EFFECT FACTORIES
// ============================================================================

/**
 * Create a default drop shadow (outer shadow) effect.
 *
 * Default values create a subtle, natural-looking shadow:
 * - Offset: 0px horizontal, 4px vertical (light from above)
 * - Blur: 8px for soft edges
 * - Spread: 0px (no expansion)
 * - Color: Semi-transparent black
 */
export function createDefaultDropShadow(): ShadowEffect {
  return {
    id: generateEffectId(),
    enabled: true,
    type: 'outer',
    x: 0,
    y: 4,
    blur: 8,
    spread: 0,
    color: 'rgba(0, 0, 0, 0.25)',
  }
}

/**
 * Create a default inner shadow effect.
 *
 * Inner shadows create an inset/embossed look.
 * Default values create a subtle inset effect.
 */
export function createDefaultInnerShadow(): ShadowEffect {
  return {
    id: generateEffectId(),
    enabled: true,
    type: 'inner',
    x: 0,
    y: 2,
    blur: 4,
    spread: 0,
    color: 'rgba(0, 0, 0, 0.15)',
  }
}

/**
 * Create a default layer blur effect.
 *
 * Layer blur applies a Gaussian blur to the element itself,
 * making it appear out of focus.
 */
export function createDefaultLayerBlur(): BlurEffect {
  return {
    id: generateEffectId(),
    enabled: true,
    type: 'layer',
    amount: 4,
  }
}

/**
 * Create a default background blur effect.
 *
 * Background blur (backdrop-filter) creates a frosted glass effect
 * by blurring content behind the element.
 */
export function createDefaultBackgroundBlur(): BlurEffect {
  return {
    id: generateEffectId(),
    enabled: true,
    type: 'background',
    amount: 8,
  }
}

/**
 * Create an empty effects configuration.
 * No shadows or blurs applied.
 */
export function createEmptyEffectsConfig(): EffectsConfig {
  return {
    shadows: [],
    blurs: [],
  }
}

// ============================================================================
// CSS CONVERSION
// ============================================================================

/**
 * Convert a single shadow effect to CSS box-shadow value.
 *
 * CSS box-shadow syntax:
 * - Outer: x y blur spread color
 * - Inner: inset x y blur spread color
 *
 * @param shadow - The shadow effect configuration
 * @returns CSS box-shadow value string, or empty string if disabled
 */
export function shadowToCSS(shadow: ShadowEffect): string {
  if (!shadow.enabled) return ''

  const inset = shadow.type === 'inner' ? 'inset ' : ''
  return `${inset}${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.spread}px ${shadow.color}`
}

/**
 * Convert an effects configuration to CSS properties.
 *
 * This handles:
 * - Multiple shadows combined with commas
 * - Layer blur via filter property
 * - Background blur via backdrop-filter property
 *
 * @param effects - The full effects configuration
 * @returns Object with CSS properties to apply
 */
export function effectsConfigToCSS(effects: EffectsConfig | undefined): {
  boxShadow?: string
  filter?: string
  backdropFilter?: string
  WebkitBackdropFilter?: string
} {
  if (!effects) return {}

  const result: {
    boxShadow?: string
    filter?: string
    backdropFilter?: string
    WebkitBackdropFilter?: string
  } = {}

  // ========================================
  // SHADOWS (box-shadow)
  // ========================================
  // Combine all enabled shadows into a comma-separated list
  const shadowStrings = effects.shadows
    .map(shadowToCSS)
    .filter((s) => s.length > 0)

  if (shadowStrings.length > 0) {
    result.boxShadow = shadowStrings.join(', ')
  }

  // ========================================
  // BLURS (filter / backdrop-filter)
  // ========================================
  // Process each blur effect based on type
  const filterEffects: string[] = []
  const backdropEffects: string[] = []

  for (const blur of effects.blurs) {
    if (!blur.enabled) continue

    if (blur.type === 'layer') {
      // Layer blur uses CSS filter property
      filterEffects.push(`blur(${blur.amount}px)`)
    } else if (blur.type === 'background') {
      // Background blur uses backdrop-filter property
      backdropEffects.push(`blur(${blur.amount}px)`)
    }
  }

  if (filterEffects.length > 0) {
    result.filter = filterEffects.join(' ')
  }

  if (backdropEffects.length > 0) {
    const backdropValue = backdropEffects.join(' ')
    result.backdropFilter = backdropValue
    // Safari requires webkit prefix for backdrop-filter
    result.WebkitBackdropFilter = backdropValue
  }

  return result
}

// ============================================================================
// EFFECT MANIPULATION
// ============================================================================

/**
 * Add a shadow effect to an effects configuration.
 *
 * @param effects - Current effects config (or undefined for new)
 * @param shadow - The shadow effect to add
 * @returns New effects config with the shadow added
 */
export function addShadowEffect(
  effects: EffectsConfig | undefined,
  shadow: ShadowEffect
): EffectsConfig {
  const current = effects ?? createEmptyEffectsConfig()
  return {
    ...current,
    shadows: [...current.shadows, shadow],
  }
}

/**
 * Add a blur effect to an effects configuration.
 *
 * @param effects - Current effects config (or undefined for new)
 * @param blur - The blur effect to add
 * @returns New effects config with the blur added
 */
export function addBlurEffect(
  effects: EffectsConfig | undefined,
  blur: BlurEffect
): EffectsConfig {
  const current = effects ?? createEmptyEffectsConfig()
  return {
    ...current,
    blurs: [...current.blurs, blur],
  }
}

/**
 * Update a shadow effect by ID.
 *
 * @param effects - Current effects config
 * @param shadowId - ID of the shadow to update
 * @param updates - Partial shadow properties to update
 * @returns New effects config with the shadow updated
 */
export function updateShadowEffect(
  effects: EffectsConfig,
  shadowId: string,
  updates: Partial<Omit<ShadowEffect, 'id'>>
): EffectsConfig {
  return {
    ...effects,
    shadows: effects.shadows.map((shadow) =>
      shadow.id === shadowId ? { ...shadow, ...updates } : shadow
    ),
  }
}

/**
 * Update a blur effect by ID.
 *
 * @param effects - Current effects config
 * @param blurId - ID of the blur to update
 * @param updates - Partial blur properties to update
 * @returns New effects config with the blur updated
 */
export function updateBlurEffect(
  effects: EffectsConfig,
  blurId: string,
  updates: Partial<Omit<BlurEffect, 'id'>>
): EffectsConfig {
  return {
    ...effects,
    blurs: effects.blurs.map((blur) =>
      blur.id === blurId ? { ...blur, ...updates } : blur
    ),
  }
}

/**
 * Remove a shadow effect by ID.
 *
 * @param effects - Current effects config
 * @param shadowId - ID of the shadow to remove
 * @returns New effects config with the shadow removed
 */
export function removeShadowEffect(
  effects: EffectsConfig,
  shadowId: string
): EffectsConfig {
  return {
    ...effects,
    shadows: effects.shadows.filter((shadow) => shadow.id !== shadowId),
  }
}

/**
 * Remove a blur effect by ID.
 *
 * @param effects - Current effects config
 * @param blurId - ID of the blur to remove
 * @returns New effects config with the blur removed
 */
export function removeBlurEffect(
  effects: EffectsConfig,
  blurId: string
): EffectsConfig {
  return {
    ...effects,
    blurs: effects.blurs.filter((blur) => blur.id !== blurId),
  }
}

/**
 * Toggle the enabled state of a shadow effect.
 *
 * @param effects - Current effects config
 * @param shadowId - ID of the shadow to toggle
 * @returns New effects config with the shadow toggled
 */
export function toggleShadowEffect(
  effects: EffectsConfig,
  shadowId: string
): EffectsConfig {
  return {
    ...effects,
    shadows: effects.shadows.map((shadow) =>
      shadow.id === shadowId ? { ...shadow, enabled: !shadow.enabled } : shadow
    ),
  }
}

/**
 * Toggle the enabled state of a blur effect.
 *
 * @param effects - Current effects config
 * @param blurId - ID of the blur to toggle
 * @returns New effects config with the blur toggled
 */
export function toggleBlurEffect(
  effects: EffectsConfig,
  blurId: string
): EffectsConfig {
  return {
    ...effects,
    blurs: effects.blurs.map((blur) =>
      blur.id === blurId ? { ...blur, enabled: !blur.enabled } : blur
    ),
  }
}

/**
 * Check if an effects config has any active effects.
 * Useful for determining if effects section should show as "active".
 *
 * @param effects - Effects config to check
 * @returns True if there are any enabled effects
 */
export function hasActiveEffects(effects: EffectsConfig | undefined): boolean {
  if (!effects) return false

  const hasActiveShadows = effects.shadows.some((s) => s.enabled)
  const hasActiveBlurs = effects.blurs.some((b) => b.enabled)

  return hasActiveShadows || hasActiveBlurs
}

/**
 * Get a human-readable label for an effect type.
 * Uses user-friendly terminology as requested.
 *
 * @param effect - The effect to get a label for
 * @returns Human-readable label
 */
export function getEffectLabel(effect: ShadowEffect | BlurEffect): string {
  if ('type' in effect && (effect.type === 'outer' || effect.type === 'inner')) {
    // Shadow effect
    return effect.type === 'outer' ? 'Drop Shadow' : 'Inner Shadow'
  }

  // Blur effect
  const blurEffect = effect as BlurEffect
  return blurEffect.type === 'layer' ? 'Layer Blur' : 'Background Blur'
}
