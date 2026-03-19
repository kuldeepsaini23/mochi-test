/**
 * HLS SEGMENT API ROUTE
 *
 * Serves HLS segments and playlists for PRIVATE videos.
 * Authenticates the user and verifies organization membership.
 *
 * WHY THIS EXISTS:
 * - PUBLIC videos can use CDN URLs directly
 * - PRIVATE videos need authenticated access to each segment
 * - HLS.js fetches segments via HTTP, so we need an API route
 *
 * URL PATTERN:
 * /api/storage/hls/[fileId]/[...path]
 *
 * Examples:
 * - /api/storage/hls/abc123/master.m3u8 → Master playlist
 * - /api/storage/hls/abc123/720p/playlist.m3u8 → Quality playlist
 * - /api/storage/hls/abc123/720p/segment-001.ts → Video segment
 * - /api/storage/hls/abc123/poster.jpg → Poster thumbnail
 *
 * SECURITY:
 * - Requires valid session (authenticated user)
 * - Verifies user is member of the organization that owns the file
 * - Only serves HLS files (m3u8, ts, jpg) - not original video
 *
 * PERFORMANCE:
 * - Returns redirect to presigned URL (no proxying)
 * - Presigned URLs expire in 1 hour (sufficient for HLS segments)
 * - Browser/CDN can cache segments during playback
 */

import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/better-auth/auth'
import { generateDownloadUrl } from '@/lib/r2'
import { getFileForHlsAccess, checkMembershipForFileAccess } from '@/services/storage.service'

/**
 * GET /api/storage/hls/[fileId]/[...path]
 *
 * Serves HLS files for private videos with authentication.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string; path: string[] }> }
) {
  try {
    // Get route params
    const { fileId, path: pathSegments } = await params

    // Validate path segments exist
    if (!pathSegments || pathSegments.length === 0) {
      return NextResponse.json(
        { error: 'Missing path segments' },
        { status: 400 }
      )
    }

    // Block path traversal attempts — ".." or "." segments could escape the
    // file's HLS directory and expose other orgs' files in R2 storage.
    if (pathSegments.some((seg) => seg === '..' || seg === '.')) {
      return NextResponse.json(
        { error: 'Invalid path' },
        { status: 400 }
      )
    }

    // Build the relative path (e.g., "720p/playlist.m3u8" or "master.m3u8")
    const relativePath = pathSegments.join('/')

    // Validate file extension - only allow HLS-related files
    const allowedExtensions = ['.m3u8', '.ts', '.jpg', '.jpeg']
    const hasValidExtension = allowedExtensions.some((ext) =>
      relativePath.toLowerCase().endsWith(ext)
    )
    if (!hasValidExtension) {
      return NextResponse.json(
        { error: 'Invalid file type' },
        { status: 400 }
      )
    }

    // Authenticate the user
    const session = await auth.api.getSession({
      headers: await headers(),
    })

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get the file from database via storage service
    const file = await getFileForHlsAccess(fileId)

    if (!file || file.deletedAt) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      )
    }

    // Verify it's a video with HLS processing
    if (file.fileCategory !== 'VIDEO') {
      return NextResponse.json(
        { error: 'Not a video file' },
        { status: 400 }
      )
    }

    if (file.videoProcessingStatus !== 'COMPLETED' || !file.hlsManifestKey) {
      return NextResponse.json(
        { error: 'Video processing not complete' },
        { status: 400 }
      )
    }

    // PUBLIC files should use CDN directly, not this API
    // But we still allow it for flexibility
    if (file.visibility === 'PUBLIC') {
      // For public files, redirect to CDN URL
      const publicUrl = process.env.R2_PUBLIC_URL
      if (publicUrl) {
        const hlsBaseKey = file.hlsManifestKey.replace('/master.m3u8', '')
        /** Use URL constructor to safely encode path segments and prevent URL injection */
        const fullUrl = new URL(`${hlsBaseKey}/${relativePath}`, publicUrl).toString()
        return NextResponse.redirect(fullUrl)
      }
    }

    // Verify user is member of the organization via storage service
    const membership = await checkMembershipForFileAccess(session.user.id, file.organizationId)

    if (!membership) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      )
    }

    // Build the full R2 storage key
    // hlsManifestKey is like: org-xxx/hls/fileId/master.m3u8
    // We need: org-xxx/hls/fileId/{relativePath}
    const hlsBaseKey = file.hlsManifestKey.replace('/master.m3u8', '')
    const storageKey = `${hlsBaseKey}/${relativePath}`

    // Determine content type for proper handling
    let contentType = 'application/octet-stream'
    if (relativePath.endsWith('.m3u8')) {
      contentType = 'application/vnd.apple.mpegurl'
    } else if (relativePath.endsWith('.ts')) {
      contentType = 'video/mp2t'
    } else if (relativePath.endsWith('.jpg') || relativePath.endsWith('.jpeg')) {
      contentType = 'image/jpeg'
    }

    // Generate presigned URL (1 hour expiry for segment caching)
    const presignedUrl = await generateDownloadUrl({
      storageKey,
      expiresIn: 3600, // 1 hour
      contentType,
    })

    // For .m3u8 playlist files, proxy the content to avoid CORS issues
    // These are small text files, so proxying is fine
    // HLS.js needs the manifest to be served from the same origin
    if (relativePath.endsWith('.m3u8')) {
      const response = await fetch(presignedUrl)
      if (!response.ok) {
        return NextResponse.json(
          { error: 'Failed to fetch playlist' },
          { status: response.status }
        )
      }
      const content = await response.text()
      return new NextResponse(content, {
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
        },
      })
    }

    // For images (poster.jpg), proxy the content
    // Next.js Image component doesn't follow redirects properly
    // Posters are small files so proxying is efficient
    if (relativePath.endsWith('.jpg') || relativePath.endsWith('.jpeg')) {
      const response = await fetch(presignedUrl)
      if (!response.ok) {
        return NextResponse.json(
          { error: 'Failed to fetch image' },
          { status: response.status }
        )
      }
      const imageBuffer = await response.arrayBuffer()
      return new NextResponse(imageBuffer, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        },
      })
    }

    // For .ts segments, redirect to presigned URL
    // These are larger files, so redirect is more efficient
    return NextResponse.redirect(presignedUrl)
  } catch (error) {
    console.error('[HLS API] Error serving HLS segment:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
