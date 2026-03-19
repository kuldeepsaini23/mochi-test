'use client'

/**
 * React Hook for Lead Session Management
 *
 * Provides a simple interface for identifying and managing lead sessions
 * in React components (forms, chat widgets, etc.).
 *
 * SOURCE OF TRUTH KEYWORDS: useLeadSession, StickyFormHook
 *
 * @example
 * ```tsx
 * function ContactForm({ organizationId }: { organizationId: string }) {
 *   const { isIdentified, lead, identify, isLoading } = useLeadSession(organizationId)
 *
 *   // Prefill form if already identified
 *   useEffect(() => {
 *     if (lead) {
 *       setFormData({
 *         firstName: lead.firstName || '',
 *         email: lead.email,
 *       })
 *     }
 *   }, [lead])
 *
 *   const handleSubmit = async (data: FormData) => {
 *     await identify(data.email, { firstName: data.firstName })
 *   }
 * }
 * ```
 */

import { useState, useEffect, useCallback } from 'react'
import { trpc } from '@/trpc/react-provider'
import {
  getSessionTokenAny,
  setSessionTokenAll,
  clearSessionTokenAll,
} from '@/lib/lead-session/client'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Lead data returned from session validation
 */
export interface LeadSessionData {
  firstName: string | null
  lastName: string | null
  email: string
  phone: string | null
}

/**
 * Options for identifying a lead
 */
export interface IdentifyOptions {
  firstName?: string
  lastName?: string
  phone?: string
  source?: string
}

/**
 * Options for updating lead data
 */
export interface UpdateLeadOptions {
  firstName?: string
  lastName?: string
  phone?: string
}

/**
 * Result of identify operation
 * WHY: Returns both success status and leadId for use in bookings, forms, etc.
 */
export interface IdentifyResult {
  /** Whether the operation succeeded */
  success: boolean
  /** The lead's ID (available on success) */
  leadId?: string
  /** Error message if failed */
  error?: string
}

/**
 * Return type for useLeadSession hook
 */
export interface UseLeadSessionReturn {
  /** Whether the initial validation is loading */
  isLoading: boolean
  /** Whether a lead is currently identified */
  isIdentified: boolean
  /** The identified lead's data (null if not identified) */
  lead: LeadSessionData | null
  /** The lead's ID (null if not identified) */
  leadId: string | null
  /** Function to identify a lead by email - returns leadId on success */
  identify: (email: string, options?: IdentifyOptions) => Promise<IdentifyResult>
  /** Function to update the identified lead's data */
  updateLead: (updates: UpdateLeadOptions) => Promise<boolean>
  /** Function to clear the current session */
  clearSession: () => void
  /** Whether an identify operation is in progress */
  isIdentifying: boolean
  /** Whether an update operation is in progress */
  isUpdating: boolean
  /** Error message if any operation failed */
  error: string | null
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * React hook for managing lead sessions
 *
 * @param organizationId - The organization ID for the session
 * @returns Lead session state and actions
 */
export function useLeadSession(organizationId: string): UseLeadSessionReturn {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const [token, setToken] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // -------------------------------------------------------------------------
  // tRPC Mutations
  // -------------------------------------------------------------------------

  const createMutation = trpc.leadSession.create.useMutation()
  const updateMutation = trpc.leadSession.updateLead.useMutation()

  // -------------------------------------------------------------------------
  // tRPC Query (only run when we have a token)
  // -------------------------------------------------------------------------

  const validationQuery = trpc.leadSession.validate.useQuery(
    { organizationId, token: token || '' },
    {
      enabled: !!token && !!organizationId,
      retry: false,
      refetchOnWindowFocus: false,
    }
  )

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  // Initialize token from storage on mount
  useEffect(() => {
    const storedToken = getSessionTokenAny()
    if (storedToken) {
      setToken(storedToken)
    }
    setIsInitialized(true)
  }, [])

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  /**
   * Identify a lead by email
   *
   * Creates or retrieves a session for the lead.
   * Returns IdentifyResult with success status and leadId.
   *
   * WHY: The leadId is needed to link the lead to bookings, form submissions, etc.
   * USAGE: Call this BEFORE creating a booking to get the leadId to pass to the booking.
   */
  const identify = useCallback(
    async (email: string, options?: IdentifyOptions): Promise<IdentifyResult> => {
      setError(null)

      try {
        const result = await createMutation.mutateAsync({
          organizationId,
          email,
          firstName: options?.firstName,
          lastName: options?.lastName,
          phone: options?.phone,
          source: options?.source,
        })

        if (result.success) {
          // Store new token if provided
          if (result.token) {
            setToken(result.token)
            setSessionTokenAll(result.token)
          }
          return { success: true, leadId: result.leadId }
        } else {
          setError(result.error || 'Failed to identify lead')
          return { success: false, error: result.error }
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to identify lead'
        setError(message)
        return { success: false, error: message }
      }
    },
    [organizationId, createMutation]
  )

  /**
   * Update the identified lead's data
   *
   * Returns true if successful, false otherwise.
   */
  const updateLead = useCallback(
    async (updates: UpdateLeadOptions): Promise<boolean> => {
      if (!token) {
        setError('No active session')
        return false
      }

      setError(null)

      try {
        const result = await updateMutation.mutateAsync({
          organizationId,
          token,
          updates,
        })

        if (result.success) {
          // Refetch validation to get updated lead data
          validationQuery.refetch()
          return true
        } else {
          setError(result.error || 'Failed to update lead')
          return false
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to update lead'
        setError(message)
        return false
      }
    },
    [organizationId, token, updateMutation, validationQuery]
  )

  /**
   * Clear the current session
   */
  const clearSession = useCallback(() => {
    setToken(null)
    clearSessionTokenAll()
    setError(null)
  }, [])

  // -------------------------------------------------------------------------
  // Computed Values
  // -------------------------------------------------------------------------

  const isLoading = !isInitialized || (!!token && validationQuery.isLoading)
  const isIdentified = validationQuery.data?.valid === true
  const lead = validationQuery.data?.lead || null
  const leadId = validationQuery.data?.leadId || null

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    isLoading,
    isIdentified,
    lead,
    leadId,
    identify,
    updateLead,
    clearSession,
    isIdentifying: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    error,
  }
}

// ============================================================================
// UTILITY HOOKS
// ============================================================================

/**
 * Simple hook to just check if a session exists
 *
 * Use this when you just need to know if a lead is identified,
 * without needing the full session management.
 *
 * @param organizationId - The organization ID
 * @returns Whether a valid session exists
 */
export function useHasLeadSession(organizationId: string): {
  hasSession: boolean
  isLoading: boolean
} {
  const [token, setToken] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  // Get token from storage on mount
  useEffect(() => {
    const storedToken = getSessionTokenAny()
    setToken(storedToken)
    setIsInitialized(true)
  }, [])

  // Validate token
  const validationQuery = trpc.leadSession.validate.useQuery(
    { organizationId, token: token || '' },
    {
      enabled: !!token && !!organizationId,
      retry: false,
      refetchOnWindowFocus: false,
    }
  )

  const isLoading = !isInitialized || (!!token && validationQuery.isLoading)
  const hasSession = validationQuery.data?.valid === true

  return { hasSession, isLoading }
}
