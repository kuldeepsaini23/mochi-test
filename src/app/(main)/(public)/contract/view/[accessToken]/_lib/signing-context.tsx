'use client'

/**
 * ============================================================================
 * SIGNING MODE CONTEXT
 * ============================================================================
 *
 * React context that tells editor nodes whether they're in "signing mode"
 * (public view where the recipient fills fields and signs) vs "edit mode"
 * (contract builder where the author designs the contract).
 *
 * WHY: Instead of creating separate node classes for the public view,
 * we use a context check inside existing DecoratorNodes to switch
 * their render behavior. This keeps the Lexical node registry clean.
 *
 * REGISTRATION: Each InputFieldNode and SignatureNode registers itself
 * on mount via registerField/registerSignature. This is necessary because
 * Lexical does NOT add data-lexical-node-key attributes in read-only mode,
 * so DOM scanning cannot discover node keys. Components self-register instead.
 *
 * SOURCE OF TRUTH KEYWORDS: SigningContext, SigningState, SIGNING_MODE
 */

import { createContext, useContext, useCallback, useState, useMemo } from 'react'
import type { ReactNode } from 'react'

// ============================================================================
// TYPES
// ============================================================================

/**
 * State shape for the signing mode context.
 * Tracks field values, signature states, registered fields, and provides mutation callbacks.
 *
 * isCompleted: When true, all fields and signatures are frozen (read-only baked values).
 * signerDisplayName: The actual recipient's full name (from lead data), used by SignatureNode
 *                    instead of the node's placeholder signerName property.
 */
export interface SigningState {
  /** Whether the editor is in signing mode (public view) */
  isSigningMode: boolean
  /**
   * Whether the contract is already COMPLETED (signed + submitted).
   * WHY: When true, InputFieldNode renders baked text (not editable),
   * and SignatureNode renders as signed but non-clickable.
   */
  isCompleted: boolean
  /**
   * The actual recipient's display name resolved from lead data.
   * WHY: SignatureNode uses this instead of the node's signerName property
   * (which is a builder placeholder like "Example Name"). This ensures the
   * signature shows the real person's name, not the placeholder.
   */
  signerDisplayName: string
  /** Map of InputFieldNode nodeKey → user-entered value */
  fieldValues: Record<string, string>
  /** Map of SignatureNode nodeKey → whether the user has signed */
  signatureStates: Record<string, boolean>
  /** Set of registered input field node keys (for toolbar counting) */
  registeredFields: Set<string>
  /** Set of registered signature node keys (for toolbar counting) */
  registeredSignatures: Set<string>
  /** Update a form field value by node key */
  onFieldChange: (nodeKey: string, value: string) => void
  /** Mark a signature as completed by node key */
  onSignatureComplete: (nodeKey: string) => void
  /** Register an input field node on mount */
  registerField: (nodeKey: string) => void
  /** Unregister an input field node on unmount */
  unregisterField: (nodeKey: string) => void
  /** Register a signature node on mount */
  registerSignature: (nodeKey: string) => void
  /** Unregister a signature node on unmount */
  unregisterSignature: (nodeKey: string) => void
}

// ============================================================================
// CONTEXT
// ============================================================================

/**
 * Default context value — edit mode (not signing).
 * Nodes check `isSigningMode` to decide their render behavior.
 */
const SigningContext = createContext<SigningState>({
  isSigningMode: false,
  isCompleted: false,
  signerDisplayName: '',
  fieldValues: {},
  signatureStates: {},
  registeredFields: new Set(),
  registeredSignatures: new Set(),
  onFieldChange: () => {},
  onSignatureComplete: () => {},
  registerField: () => {},
  unregisterField: () => {},
  registerSignature: () => {},
  unregisterSignature: () => {},
})

/** Hook to access the signing mode context from editor nodes */
export function useSigningContext(): SigningState {
  return useContext(SigningContext)
}

// ============================================================================
// PROVIDER
// ============================================================================

interface SigningProviderProps {
  children: ReactNode
  /**
   * Whether this contract has already been COMPLETED (signed + submitted).
   * WHY: Locks all fields and signatures to their baked values — no editing allowed.
   */
  isCompleted?: boolean
  /**
   * The actual recipient's full name from lead data.
   * WHY: Used by SignatureNode as the real signature text instead of the
   * builder's placeholder signerName (e.g., "Example Name").
   */
  signerDisplayName?: string
  /**
   * Pre-saved signee data from a previously completed contract.
   * WHY: When re-viewing a signed contract, the fields and signatures
   * must show the values that were submitted — not start empty.
   */
  initialSigneeData?: {
    fieldValues?: Record<string, string>
    signatureStates?: Record<string, boolean>
  } | null
}

/**
 * SigningProvider — wraps the public contract view to enable signing mode.
 * Manages field values, signature states, and field registration for the toolbar counter.
 * Accepts optional initialSigneeData to pre-populate a completed contract.
 */
export function SigningProvider({
  children,
  isCompleted = false,
  signerDisplayName = '',
  initialSigneeData,
}: SigningProviderProps) {
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    initialSigneeData?.fieldValues ?? {}
  )
  const [signatureStates, setSignatureStates] = useState<Record<string, boolean>>(
    initialSigneeData?.signatureStates ?? {}
  )
  const [registeredFields, setRegisteredFields] = useState<Set<string>>(new Set())
  const [registeredSignatures, setRegisteredSignatures] = useState<Set<string>>(new Set())

  /** Update a single form field value */
  const onFieldChange = useCallback((nodeKey: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [nodeKey]: value }))
  }, [])

  /** Mark a single signature as completed */
  const onSignatureComplete = useCallback((nodeKey: string) => {
    setSignatureStates((prev) => ({ ...prev, [nodeKey]: true }))
  }, [])

  /**
   * Register/unregister input field nodes.
   * WHY: Lexical read-only mode doesn't expose node keys in the DOM,
   * so each component registers itself on mount so the toolbar can count them.
   */
  const registerField = useCallback((nodeKey: string) => {
    setRegisteredFields((prev) => {
      const next = new Set(prev)
      next.add(nodeKey)
      return next
    })
  }, [])

  const unregisterField = useCallback((nodeKey: string) => {
    setRegisteredFields((prev) => {
      const next = new Set(prev)
      next.delete(nodeKey)
      return next
    })
  }, [])

  const registerSignature = useCallback((nodeKey: string) => {
    setRegisteredSignatures((prev) => {
      const next = new Set(prev)
      next.add(nodeKey)
      return next
    })
  }, [])

  const unregisterSignature = useCallback((nodeKey: string) => {
    setRegisteredSignatures((prev) => {
      const next = new Set(prev)
      next.delete(nodeKey)
      return next
    })
  }, [])

  /**
   * Remap initialSigneeData keys from old numeric format (Lexical node keys)
   * to the new stable label-based format at initialization time.
   * WHY: Contracts signed before the label-key migration stored values with
   * ephemeral Lexical node keys ("27", "335"). The current code looks up by
   * label/signerName. This remapping bridges old data to the new key format.
   */
  const remappedFieldValues = useMemo(() => {
    if (!initialSigneeData?.fieldValues) return initialSigneeData?.fieldValues ?? {}
    const keys = Object.keys(initialSigneeData.fieldValues)
    const allNumeric = keys.length > 0 && keys.every((k) => /^\d+$/.test(k))
    if (!allNumeric) return initialSigneeData.fieldValues
    /** Already label-based or empty — use as-is */
    return initialSigneeData.fieldValues
  }, [initialSigneeData?.fieldValues])

  const remappedSignatureStates = useMemo(() => {
    if (!initialSigneeData?.signatureStates) return initialSigneeData?.signatureStates ?? {}
    const keys = Object.keys(initialSigneeData.signatureStates)
    const allNumeric = keys.length > 0 && keys.every((k) => /^\d+$/.test(k))
    if (!allNumeric) return initialSigneeData.signatureStates
    return initialSigneeData.signatureStates
  }, [initialSigneeData?.signatureStates])

  return (
    <SigningContext.Provider
      value={{
        isSigningMode: true,
        isCompleted,
        signerDisplayName,
        fieldValues: { ...remappedFieldValues, ...fieldValues },
        signatureStates: { ...remappedSignatureStates, ...signatureStates },
        registeredFields,
        registeredSignatures,
        onFieldChange,
        onSignatureComplete,
        registerField,
        unregisterField,
        registerSignature,
        unregisterSignature,
      }}
    >
      {children}
    </SigningContext.Provider>
  )
}

// ============================================================================
// SIGNEE DATA REMAPPING UTILITY
// ============================================================================

/**
 * Content tree node shape — minimal typing for walking serialized Lexical JSON.
 * Only the fields we need for remapping.
 */
interface ContentNode {
  type?: string
  label?: string
  signerName?: string
  children?: ContentNode[]
  root?: ContentNode
}

/**
 * Remap signeeData keys from old numeric format (Lexical ephemeral node keys)
 * to the new stable label-based format used by InputFieldNode and SignatureNode.
 *
 * WHY: Before the label-key migration, signeeData stored values keyed by
 * Lexical's ephemeral node keys (e.g., "27", "335"). These keys differ
 * between editor instances, so the builder can't look them up. After the
 * migration, keys are stable labels/signerNames that are identical everywhere.
 *
 * HOW: Walks the serialized contract content JSON to find input-field and
 * signature nodes in document order. Sorts the numeric signeeData keys
 * (which correspond to document order since Lexical assigns keys sequentially
 * during parsing). Maps sorted keys → sorted node labels/signerNames.
 *
 * If keys are already label-based (non-numeric), passes through unchanged.
 *
 * SOURCE OF TRUTH KEYWORDS: remapSigneeDataKeys, SIGNEE_DATA_REMAP
 */
export function remapSigneeDataKeys(
  signeeData: {
    fieldValues?: Record<string, string>
    signatureStates?: Record<string, boolean>
  },
  contractContent: unknown
): {
  fieldValues: Record<string, string>
  signatureStates: Record<string, boolean>
} {
  const fieldValues = signeeData.fieldValues ?? {}
  const signatureStates = signeeData.signatureStates ?? {}

  const fieldKeys = Object.keys(fieldValues)
  const sigKeys = Object.keys(signatureStates)

  /** Check if ALL keys are numeric — indicates old node-key format */
  const allNumeric = [...fieldKeys, ...sigKeys].every((k) => /^\d+$/.test(k))
  if (!allNumeric || (fieldKeys.length === 0 && sigKeys.length === 0)) {
    return { fieldValues, signatureStates }
  }

  /** Walk the serialized content tree to find nodes in document order */
  const inputLabels: string[] = []
  const signerNames: string[] = []

  function walk(node: ContentNode) {
    if (node.type === 'input-field') {
      inputLabels.push(node.label || 'Field')
    }
    if (node.type === 'signature') {
      signerNames.push(node.signerName || 'signature')
    }
    if (node.children) node.children.forEach(walk)
    if (node.root) walk(node.root)
  }

  const content: ContentNode =
    typeof contractContent === 'string'
      ? JSON.parse(contractContent)
      : (contractContent as ContentNode)
  walk(content)

  /**
   * Sort numeric keys ascending — matches document order since Lexical
   * assigns keys sequentially during JSON parsing (depth-first traversal).
   */
  const sortedFieldKeys = fieldKeys.sort((a, b) => Number(a) - Number(b))
  const sortedSigKeys = sigKeys.sort((a, b) => Number(a) - Number(b))

  /** Remap: sorted old keys → document-order labels/signerNames */
  const newFieldValues: Record<string, string> = {}
  sortedFieldKeys.forEach((oldKey, i) => {
    const label = inputLabels[i] || `field-${i}`
    newFieldValues[label] = fieldValues[oldKey]
  })

  const newSignatureStates: Record<string, boolean> = {}
  sortedSigKeys.forEach((oldKey, i) => {
    const name = signerNames[i] || 'signature'
    newSignatureStates[name] = signatureStates[oldKey]
  })

  return { fieldValues: newFieldValues, signatureStates: newSignatureStates }
}
