/**
 * CLOUDFLARE R2 STORAGE CLIENT
 *
 * S3-compatible object storage for file uploads.
 * Provides presigned URLs for secure client-side uploads.
 *
 * ARCHITECTURE:
 * - Client requests presigned URL from server
 * - Client uploads directly to R2 (no server bandwidth)
 * - Server stores file metadata in database
 *
 * BUCKET STRUCTURE:
 * - Private files: org-{organizationId}/{folder}/{filename}
 * - Public files: public/org-{organizationId}/{folder}/{filename}
 *
 * ENVIRONMENT VARIABLES REQUIRED:
 * - R2_ACCOUNT_ID: Cloudflare account ID
 * - R2_ACCESS_KEY_ID: R2 access key
 * - R2_SECRET_ACCESS_KEY: R2 secret key
 * - R2_BUCKET_NAME: R2 bucket name
 * - R2_PUBLIC_URL: Public URL for CDN access (for public files)
 */

import 'server-only'

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Environment variable validation
 *
 * WHY: Fail fast if R2 is not configured
 * HOW: Check for required env vars at module load time
 */
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL

/**
 * Check if R2 is configured
 * Returns false if any required env var is missing
 */
export function isR2Configured(): boolean {
  return !!(
    R2_ACCOUNT_ID &&
    R2_ACCESS_KEY_ID &&
    R2_SECRET_ACCESS_KEY &&
    R2_BUCKET_NAME
  )
}

/**
 * S3 Client configured for Cloudflare R2
 *
 * WHY: R2 is S3-compatible, so we use AWS SDK
 * HOW: Point endpoint to R2, use R2 credentials
 */
function createR2Client(): S3Client | null {
  if (!isR2Configured()) {
    console.warn('[R2] Storage not configured. File uploads will not work.')
    return null
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID!,
      secretAccessKey: R2_SECRET_ACCESS_KEY!,
    },
  })
}

// Singleton client instance
let r2Client: S3Client | null = null

/**
 * Get R2 client instance
 *
 * WHY: Lazy initialization for better error handling
 * HOW: Create client on first use
 */
export function getR2Client(): S3Client {
  if (!r2Client) {
    r2Client = createR2Client()
  }

  if (!r2Client) {
    throw new Error('R2 storage is not configured. Please set R2_* environment variables.')
  }

  return r2Client
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Options for generating upload URLs
 */
export type GenerateUploadUrlOptions = {
  organizationId: string
  filename: string
  contentType: string
  contentLength: number
  isPublic?: boolean
  folderId?: string | null
}

/**
 * Options for generating download URLs
 */
export type GenerateDownloadUrlOptions = {
  storageKey: string
  expiresIn?: number // seconds, default 3600 (1 hour)
  /** If true, forces download. If false (default), allows inline viewing (videos play, images display) */
  forceDownload?: boolean
  /** MIME type for proper content-type header */
  contentType?: string
}

/**
 * Result from generating an upload URL
 */
export type UploadUrlResult = {
  uploadUrl: string
  storageKey: string
  publicUrl: string | null
}

// ============================================================================
// STORAGE KEY GENERATION
// ============================================================================

/**
 * Generate a unique storage key for a file
 *
 * WHY: Organized structure, no collisions
 * HOW: Use org ID, optional folder, timestamp + random suffix
 *
 * PATTERN:
 * - Private: org-{orgId}/{folderId?}/{timestamp}-{random}-{filename}
 * - Public: public/org-{orgId}/{folderId?}/{timestamp}-{random}-{filename}
 */
export function generateStorageKey(options: {
  organizationId: string
  filename: string
  isPublic?: boolean
  folderId?: string | null
}): string {
  const { organizationId, filename, isPublic = false, folderId } = options

  // Sanitize filename - remove special chars, keep extension
  const sanitized = filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .toLowerCase()

  // Generate unique prefix
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)

  // Build path segments
  const segments: string[] = []

  // Add public prefix if public file
  if (isPublic) {
    segments.push('public')
  }

  // Add organization prefix
  segments.push(`org-${organizationId}`)

  // Add folder if specified
  if (folderId) {
    segments.push(`folder-${folderId}`)
  }

  // Add unique filename
  segments.push(`${timestamp}-${random}-${sanitized}`)

  return segments.join('/')
}

// ============================================================================
// PRESIGNED URL GENERATION
// ============================================================================

/**
 * Generate a presigned URL for uploading a file
 *
 * WHY: Client uploads directly to R2, no server bandwidth
 * HOW: Generate signed PUT URL with content-type and size limits
 *
 * SECURITY:
 * - URL expires after 15 minutes
 * - Content-Type and Content-Length are locked
 * - Organization-scoped paths prevent cross-org access
 */
export async function generateUploadUrl(
  options: GenerateUploadUrlOptions
): Promise<UploadUrlResult> {
  const client = getR2Client()

  const {
    organizationId,
    filename,
    contentType,
    contentLength,
    isPublic = false,
    folderId,
  } = options

  // Generate storage key
  const storageKey = generateStorageKey({
    organizationId,
    filename,
    isPublic,
    folderId,
  })

  // Create PUT command with metadata
  // NOTE: ContentDisposition cannot be set here for presigned URLs because
  // it becomes a signed header that the client must send. Instead, use
  // Cloudflare Transform Rules to set Content-Disposition: inline on responses.
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME!,
    Key: storageKey,
    ContentType: contentType,
    ContentLength: contentLength,
    Metadata: {
      'organization-id': organizationId,
      'original-filename': filename,
      visibility: isPublic ? 'public' : 'private',
    },
  })

  // Generate presigned URL (15 minute expiry)
  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: 900, // 15 minutes
  })

  // ALWAYS generate public URL for all files
  // The R2 bucket serves all files - visibility is application-level control
  // This enables fast CDN-backed image loading in the dashboard
  const publicUrl = R2_PUBLIC_URL
    ? `${R2_PUBLIC_URL}/${storageKey}`
    : null

  return {
    uploadUrl,
    storageKey,
    publicUrl,
  }
}

/**
 * Generate a presigned URL for downloading/viewing a file
 *
 * WHY: Private files need signed URLs for access
 * HOW: Generate signed GET URL with expiry
 *
 * NOTE: Public files should use publicUrl directly, not this method
 */
export async function generateDownloadUrl(
  options: GenerateDownloadUrlOptions
): Promise<string> {
  const client = getR2Client()

  const {
    storageKey,
    expiresIn = 3600,
    forceDownload = false,
    contentType,
  } = options

  /**
   * Build GetObjectCommand with optional response overrides
   *
   * WHY: Control how browser handles the file
   * - ResponseContentDisposition: 'inline' = view in browser, 'attachment' = download
   * - ResponseContentType: Ensures browser knows file type for proper handling
   */
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME!,
    Key: storageKey,
    // Set Content-Disposition to control browser behavior
    // 'inline' allows videos/images to play/display in browser
    // 'attachment' forces download dialog
    ResponseContentDisposition: forceDownload ? 'attachment' : 'inline',
    // Set Content-Type for proper MIME type handling
    // This helps browsers determine how to handle the file
    ...(contentType && { ResponseContentType: contentType }),
  })

  return await getSignedUrl(client, command, {
    expiresIn,
  })
}

// ============================================================================
// FILE OPERATIONS
// ============================================================================

/**
 * Delete a file from R2
 *
 * WHY: Clean up storage when files are deleted
 * HOW: Delete object by key
 */
export async function deleteFile(storageKey: string): Promise<void> {
  const client = getR2Client()

  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET_NAME!,
    Key: storageKey,
  })

  await client.send(command)
}

/**
 * Delete multiple files from R2
 *
 * WHY: Efficient batch deletion
 * HOW: Delete each file (R2 doesn't have bulk delete in free tier)
 */
export async function deleteFiles(storageKeys: string[]): Promise<void> {
  const client = getR2Client()

  // Delete files in parallel
  await Promise.all(
    storageKeys.map((key) =>
      client.send(
        new DeleteObjectCommand({
          Bucket: R2_BUCKET_NAME!,
          Key: key,
        })
      )
    )
  )
}

/**
 * Check if a file exists in R2
 */
export async function fileExists(storageKey: string): Promise<boolean> {
  const client = getR2Client()

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: R2_BUCKET_NAME!,
        Key: storageKey,
      })
    )
    return true
  } catch {
    return false
  }
}

/**
 * Set Content-Disposition to 'inline' on an existing file
 *
 * WHY: Enables videos/images to play/display in browser instead of downloading
 * HOW: Copy object to itself with MetadataDirective: 'REPLACE' to update headers
 *
 * NOTE: This must be called AFTER upload completes. Cannot set ContentDisposition
 * in presigned PUT URLs because it becomes a signed header the client must send.
 *
 * @param storageKey - The key of the file in R2
 * @param contentType - The MIME type (must be re-specified with REPLACE directive)
 */
export async function setFileInlineDisposition(
  storageKey: string,
  contentType: string
): Promise<void> {
  const client = getR2Client()

  // Copy object to itself with updated metadata
  // MetadataDirective: 'REPLACE' replaces all metadata, so we must specify ContentType too
  await client.send(
    new CopyObjectCommand({
      Bucket: R2_BUCKET_NAME!,
      CopySource: `${R2_BUCKET_NAME}/${storageKey}`,
      Key: storageKey,
      MetadataDirective: 'REPLACE',
      ContentType: contentType,
      ContentDisposition: 'inline',
    })
  )
}

/**
 * Copy a file to a new location (for making public/private)
 *
 * WHY: Change visibility requires moving to public/ prefix
 * HOW: Copy to new key, delete old
 */
export async function copyFile(
  sourceKey: string,
  destinationKey: string
): Promise<void> {
  const client = getR2Client()

  await client.send(
    new CopyObjectCommand({
      Bucket: R2_BUCKET_NAME!,
      CopySource: `${R2_BUCKET_NAME}/${sourceKey}`,
      Key: destinationKey,
    })
  )
}

/**
 * Move a file (copy + delete)
 */
export async function moveFile(
  sourceKey: string,
  destinationKey: string
): Promise<void> {
  await copyFile(sourceKey, destinationKey)
  await deleteFile(sourceKey)
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.')
  return parts.length > 1 ? parts.pop()!.toLowerCase() : ''
}

/**
 * Determine file category from MIME type
 *
 * WHY: Categorize files for filtering and display
 * HOW: Check MIME type prefix
 */
export function getFileCategoryFromMimeType(
  mimeType: string
): 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'ARCHIVE' | 'OTHER' {
  if (mimeType.startsWith('image/')) return 'IMAGE'
  if (mimeType.startsWith('video/')) return 'VIDEO'
  if (mimeType.startsWith('audio/')) return 'AUDIO'
  if (
    mimeType.startsWith('application/pdf') ||
    mimeType.startsWith('application/msword') ||
    mimeType.startsWith('application/vnd.openxmlformats') ||
    mimeType.startsWith('text/')
  ) {
    return 'DOCUMENT'
  }
  if (
    mimeType.startsWith('application/zip') ||
    mimeType.startsWith('application/x-rar') ||
    mimeType.startsWith('application/x-7z') ||
    mimeType.startsWith('application/gzip')
  ) {
    return 'ARCHIVE'
  }
  return 'OTHER'
}

/**
 * Format bytes to human-readable size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

/**
 * Get maximum file size allowed (in bytes)
 * Different limits for different file types
 */
export function getMaxFileSize(mimeType: string): number {
  const category = getFileCategoryFromMimeType(mimeType)

  switch (category) {
    case 'VIDEO':
      return 2 * 1024 * 1024 * 1024 // 2GB for videos (course videos can be long)
    case 'IMAGE':
      return 50 * 1024 * 1024 // 50MB for images
    case 'AUDIO':
      return 100 * 1024 * 1024 // 100MB for audio
    case 'ARCHIVE':
      return 200 * 1024 * 1024 // 200MB for archives
    case 'DOCUMENT':
      return 50 * 1024 * 1024 // 50MB for documents
    default:
      return 100 * 1024 * 1024 // 100MB default
  }
}
