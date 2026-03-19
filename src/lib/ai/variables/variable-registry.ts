/**
 * ============================================================================
 * VARIABLE REGISTRY - GLOBAL PUB-SUB FOR POST-STREAM VARIABLES
 * ============================================================================
 *
 * Centralized registry for variables detected after AI streaming completes.
 * Components can register variables (e.g., contract variables extracted from
 * markers) and other components can subscribe to changes (e.g., the Variables
 * sidebar auto-updates when AI creates new variables).
 *
 * This decouples variable extraction (in the AI hooks) from variable display
 * (in builder sidebars) — they communicate through the registry instead of
 * direct prop drilling or complex callback chains.
 *
 * SOURCE OF TRUTH KEYWORDS: VariableRegistry, RegisteredVariable,
 * VariableChangeListener
 * ============================================================================
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * A variable registered in the global registry.
 *
 * SOURCE OF TRUTH KEYWORDS: RegisteredVariable
 */
export interface RegisteredVariable {
  /** Unique ID for this variable instance */
  id: string
  /** Which feature registered this variable (e.g., 'contract', 'form') */
  feature: string
  /** Human-readable variable name */
  name: string
  /** Current variable value */
  value: string
  /** Lookup key for this variable (e.g., 'contract.abc123') */
  key: string
}

/** Listener function called when variables change for a feature */
type VariableChangeListener = (variables: RegisteredVariable[]) => void

// ============================================================================
// REGISTRY
// ============================================================================

/**
 * Global variable registry — stores variables per feature and notifies
 * subscribers when they change.
 *
 * Usage:
 * 1. AI hook extracts variables → variableRegistry.register('contract', [...])
 * 2. Sidebar subscribes → variableRegistry.subscribe('contract', listener)
 * 3. Sidebar auto-updates when new variables arrive
 */
class VariableRegistry {
  /** Per-feature variable storage */
  private variables = new Map<string, RegisteredVariable[]>()

  /** Per-feature subscriber lists */
  private listeners = new Map<string, Set<VariableChangeListener>>()

  /**
   * Register variables for a feature, replacing any previous set.
   * Notifies all subscribers of the feature.
   *
   * @param feature - The feature registering variables (e.g., 'contract')
   * @param variables - The new set of variables
   */
  register(feature: string, variables: RegisteredVariable[]): void {
    this.variables.set(feature, variables)
    this.notify(feature)
  }

  /**
   * Get all registered variables for a feature.
   *
   * @param feature - The feature to get variables for
   * @returns Array of registered variables (empty if none)
   */
  getByFeature(feature: string): RegisteredVariable[] {
    return this.variables.get(feature) || []
  }

  /**
   * Subscribe to variable changes for a feature.
   * The listener is called immediately with current state, then on every change.
   *
   * @param feature - The feature to subscribe to
   * @param listener - Callback fired with the updated variable list
   * @returns Unsubscribe function — call it in useEffect cleanup
   */
  subscribe(feature: string, listener: VariableChangeListener): () => void {
    if (!this.listeners.has(feature)) {
      this.listeners.set(feature, new Set())
    }
    this.listeners.get(feature)!.add(listener)

    /** Immediately call with current state so subscriber is up-to-date */
    const current = this.getByFeature(feature)
    if (current.length > 0) {
      listener(current)
    }

    return () => {
      this.listeners.get(feature)?.delete(listener)
    }
  }

  /**
   * Clear all variables for a feature and notify subscribers.
   *
   * @param feature - The feature to clear variables for
   */
  clear(feature: string): void {
    this.variables.delete(feature)
    this.notify(feature)
  }

  /** Notify all subscribers for a feature */
  private notify(feature: string): void {
    const current = this.getByFeature(feature)
    const featureListeners = this.listeners.get(feature)
    if (!featureListeners) return

    featureListeners.forEach((fn) => {
      try {
        fn(current)
      } catch (err) {
        console.warn('[VariableRegistry] Listener error:', err)
      }
    })
  }
}

/** Singleton variable registry — shared across the entire application */
export const variableRegistry = new VariableRegistry()
