/**
 * Clarity Session Identification Hook
 *
 * WHY: Identifies the authenticated user in Microsoft Clarity so sessions
 *      can be filtered by user and organization in the Clarity dashboard.
 *
 * HOW: Runs once when user and organization data become available.
 *      Calls Clarity.identify() with userId and sets org-level tags.
 *      All calls are non-blocking — uses the safe wrappers from clarity/events.
 *
 * PLACEMENT: Used inside RealtimeProviderWrapper so it runs on all
 *            protected routes where user/org context is available.
 *
 * SOURCE OF TRUTH: ClarityIdentify, ClaritySessionHook
 */

'use client'

import { useEffect, useRef } from 'react'
import { trpc } from '@/trpc/react-provider'
import { useActiveOrganization } from '@/hooks/use-active-organization'
import { identifyUser, setTag } from '@/lib/clarity/events'

export function useClarityIdentify(): void {
  const { data: user } = trpc.user.getProfile.useQuery(undefined, {
    staleTime: 1000 * 60 * 5,
  })
  const { activeOrganization } = useActiveOrganization()

  /** Track whether we've already identified to avoid redundant calls */
  const identifiedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!user?.id) return

    /** Only re-identify if user or org changed */
    const key = `${user.id}:${activeOrganization?.id ?? ''}`
    if (identifiedRef.current === key) return
    identifiedRef.current = key

    /** Link this session to the user in Clarity */
    identifyUser(user.id, user.name ?? undefined)

    /** Tag session with organization context for filtering */
    if (activeOrganization) {
      setTag('org_id', activeOrganization.id)
      setTag('org_name', activeOrganization.name)
      setTag('user_role', activeOrganization.role)
    }
  }, [user?.id, user?.name, activeOrganization?.id, activeOrganization?.name, activeOrganization?.role])
}
