/**
 * PRIVATE FILE ACCESS API ROUTE
 *
 * WHY: Secure access to private files stored in R2
 * HOW: Authenticates user, verifies org membership, generates presigned URL
 *
 * SECURITY MODEL:
 * - Private files are NEVER accessible via direct CDN URLs
 * - This route generates short-lived presigned URLs (15 minutes)
 * - User must be authenticated AND belong to the file's organization
 * - Even if someone intercepts the presigned URL, it expires quickly
 *
 * FLOW:
 * 1. User requests /api/storage/[fileId]
 * 2. We verify authentication (session cookie)
 * 3. We verify user belongs to the file's organization
 * 4. We generate a presigned URL from R2
 * 5. We redirect to the presigned URL (or return JSON with URL)
 */

import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/better-auth/auth'
import { generateDownloadUrl } from '@/lib/r2'
import { getFileForAccess, checkMembershipForFileAccess } from '@/services/storage.service'

/**
 * Presigned URL expiry time in seconds
 * WHY: Short enough for security, long enough for viewing/downloading
 * 15 minutes = 900 seconds
 */
const PRESIGNED_URL_EXPIRY = 900

/**
 * GET /api/storage/[fileId]
 *
 * Serves private files with authentication check.
 * Redirects to a presigned R2 URL for actual file delivery.
 *
 * Query params:
 * - download=true: Forces download instead of inline viewing
 * - json=true: Returns JSON with URL instead of redirecting
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params
  const searchParams = request.nextUrl.searchParams
  const wantJson = searchParams.get('json') === 'true'
  // Check if user explicitly wants to download instead of view inline
  const forceDownload = searchParams.get('download') === 'true'

  try {
    // =========================================================================
    // STEP 1: Authenticate the user
    // =========================================================================
    const requestHeaders = await headers()
    const session = await auth.api.getSession({
      headers: requestHeaders,
    })

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    // =========================================================================
    // STEP 2: Fetch the file and verify it exists
    // =========================================================================
    const file = await getFileForAccess(fileId)

    if (!file) {
      return NextResponse.json(
        { error: 'File not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    // =========================================================================
    // STEP 3: Check if user belongs to the file's organization
    // =========================================================================
    const membership = await checkMembershipForFileAccess(session.user.id, file.organizationId)

    if (!membership) {
      // User is authenticated but not a member of this organization
      return NextResponse.json(
        { error: 'Access denied', code: 'FORBIDDEN' },
        { status: 403 }
      )
    }

    // =========================================================================
    // STEP 4: Generate presigned URL for secure access
    // =========================================================================
    // For PRIVATE files, we always use presigned URLs
    // For PUBLIC files being accessed through this API (rare), also use presigned
    // This ensures consistent, secure access patterns
    //
    // We pass contentType to ensure proper MIME type handling, which allows
    // browsers to play videos inline instead of triggering downloads

    const presignedUrl = await generateDownloadUrl({
      storageKey: file.storageKey,
      expiresIn: PRESIGNED_URL_EXPIRY,
      forceDownload, // Pass through the download preference
      contentType: file.mimeType, // Enables inline viewing for videos/images
    })

    // =========================================================================
    // STEP 5: Return or redirect to the presigned URL
    // =========================================================================

    // If client wants JSON response (e.g., for embedding in player)
    if (wantJson) {
      return NextResponse.json({
        url: presignedUrl,
        expiresIn: PRESIGNED_URL_EXPIRY,
        fileName: file.displayName || file.name,
        mimeType: file.mimeType,
      })
    }

    // Default: Redirect to presigned URL for direct browser access
    return NextResponse.redirect(presignedUrl)

  } catch (error) {
    console.error('[Storage API] Error serving file:', error)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
