'use client'

/**
 * Mochi Provider Component
 *
 * Wraps the MochiWidget with the required organization context.
 * This is needed because the protected layout is a Server Component.
 */

import { MochiWidget } from './index'

type MochiProviderProps = {
  organizationId: string
}

export function MochiProvider({ organizationId }: MochiProviderProps) {
  return (
    <MochiWidget
      organizationId={organizationId}
    />
  )
}
