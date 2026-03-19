/**
 * Better Auth API Route Handler
 *
 * WHY: Exposes Better Auth endpoints for authentication operations
 * HOW: Handles all auth-related HTTP requests (sign in, sign up, sign out, etc.)
 *      via the [...all] catch-all route
 */

import { auth } from '@/lib/better-auth/auth'
import { toNextJsHandler } from 'better-auth/next-js'

/**
 * Auth Route Handler
 * WHY: Makes Better Auth accessible over HTTP for client components
 * HOW: Handles all authentication routes at /api/auth/*
 */
export const { GET, POST } = toNextJsHandler(auth)
