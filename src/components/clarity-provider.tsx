'use client'

/**
 * Microsoft Clarity Analytics Provider
 *
 * WHY: Initializes Microsoft Clarity for session recordings, heatmaps, and
 *      behavioral analytics across the entire application.
 * HOW: Calls Clarity.init() once on mount with the project ID from env vars.
 *      Renders nothing — pure side-effect component placed in the root layout.
 *
 * SETUP:
 * 1. Go to https://clarity.microsoft.com → Settings → Overview
 * 2. Copy your project ID
 * 3. Add NEXT_PUBLIC_CLARITY_PROJECT_ID=<your-id> to .env
 *
 * API (available via import Clarity from '@microsoft/clarity'):
 * - Clarity.identify(customId, sessionId?, pageId?, friendlyName?)
 * - Clarity.setTag(key, value)
 * - Clarity.event(eventName)
 * - Clarity.upgrade(reason)
 * - Clarity.consent() / Clarity.consentV2()
 *
 * SOURCE OF TRUTH: ClarityProvider — Microsoft Clarity initialization
 */

import { useEffect } from 'react'
import Clarity from '@microsoft/clarity'

export function ClarityProvider() {
  useEffect(() => {
    const projectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID
    if (!projectId) return

    Clarity.init(projectId)
  }, [])

  return null
}
