/**
 * Better Auth Client
 *
 * WHY: Client-side authentication utilities for React components
 * HOW: Provides hooks and functions to interact with Better Auth from the browser
 *
 * B2B MODEL: Platform → Organizations
 * Users subscribe directly to the platform and become organization owners/members.
 */

'use client'
import { createAuthClient } from 'better-auth/client'
import {
  organizationClient,
  twoFactorClient,
  emailOTPClient,
  magicLinkClient,
  adminClient,
} from 'better-auth/client/plugins'
import { ac, roles } from '@/lib/better-auth/permissions'

/**
 * Auth Client Instance
 * WHY: Type-safe client for authentication operations in React components
 * HOW: Use hooks like useSession(), signIn(), signUp() from this client
 *
 * IMPORTANT: Uses window.location.origin for baseURL to work with any domain
 */
export const authClient = createAuthClient({
  // Use current origin - works for localhost, production, and any custom domain
  baseURL: typeof window !== 'undefined' ? window.location.origin : '',

  plugins: [
    magicLinkClient(),
    emailOTPClient(),
    twoFactorClient(), // Optional: for 2FA support
    organizationClient({
      dynamicAccessControl: {
        enabled: true,
      },
      ac,
      roles,
    }),
    /**
     * Admin Client - User Impersonation Support
     * WHY: Enables portal admins to impersonate users from the client
     * HOW: Provides impersonateUser() and stopImpersonating() methods
     */
    adminClient(),
  ],
})

// /**
//  * Export commonly used hooks and functions
//  */
// export const { useSession, signIn, signUp, signOut, useActiveOrganization } =
//   authClient
