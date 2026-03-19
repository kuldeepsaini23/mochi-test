/**
 * ============================================================================
 * CONTRACT BUILDER TYPES
 * ============================================================================
 *
 * Shared types for the contract builder feature.
 * Used by the sidebar, context, slash commands, and builder components.
 *
 * SOURCE OF TRUTH KEYWORDS: ContractVariable, ContractVariableType,
 * ContractBuilderTypes
 */

// ============================================================================
// CONTRACT VARIABLE
// ============================================================================

/**
 * A user-defined contract variable — name/value pair rendered as
 * inline pills in the Lexical editor.
 *
 * - `id`: Stable nanoid used in Lexical node keys (e.g., `contract.{id}`)
 * - `name`: Human-readable label shown as the pill text (e.g., "Client Name")
 * - `value`: Runtime interpolation value (e.g., "John Doe")
 *
 * Stored as JSON array on the Contract model (`variables Json?`).
 *
 * SOURCE OF TRUTH KEYWORDS: ContractVariable, ContractVariableDefinition
 */
export interface ContractVariable {
  id: string
  name: string
  value: string
}
