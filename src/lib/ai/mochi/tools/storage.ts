/**
 * ============================================================================
 * MOCHI AI TOOLS - STORAGE (READ-ONLY)
 * ============================================================================
 *
 * Vercel AI SDK tool definitions for browsing storage buckets.
 * Provides READ-ONLY access — the AI can list folders, search files,
 * get file details, and retrieve accessible URLs for images/videos/documents.
 *
 * VISION: When getStorageFile is called on an image, the tool returns the
 * image URL in a _imageUrl field. The chat API route's prepareStep hook
 * injects this URL as a user message image part — so the model sees the
 * image through standard vision (same path as user-uploaded images).
 * Works with ANY vision-capable provider (Claude, GPT-4o, Gemini, Kimi, etc).
 *
 * NO write operations (upload, delete, move, rename) are exposed.
 *
 * SECURITY: All operations route through the tRPC caller instead of calling
 * service functions directly. This ensures every call passes through the
 * full middleware chain — permissions, feature gates, org scoping.
 *
 * SOURCE OF TRUTH KEYWORDS: MochiStorageTools, AIStorageBrowser, StorageReadOnly
 * ============================================================================
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { TRPCCaller } from '@/trpc/server'
import { handleToolError } from './tool-error'

/** Image MIME types the AI can view through vision */
const VIEWABLE_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

/**
 * Creates all storage-related tools bound to the given organization.
 * READ-ONLY — the AI can browse folders, search files, get URLs,
 * and view file metadata, but cannot upload, delete, or modify anything.
 *
 * @param organizationId - The org these tools operate on
 * @param caller - tRPC caller for secure procedure invocation
 */
export function createStorageTools(organizationId: string, caller: TRPCCaller) {
  return {
    /**
     * List folders in the storage bucket.
     * Pass parentId to navigate into a subfolder, or omit for root-level folders.
     */
    listStorageFolders: tool({
      description:
        'List folders in the storage bucket. Pass parentId to browse into a subfolder, or omit to see root folders. Use search to find folders by name across all levels.',
      inputSchema: z.object({
        parentId: z
          .string()
          .optional()
          .describe('Parent folder ID to browse into. Omit for root-level folders.'),
        search: z
          .string()
          .optional()
          .describe('Search folders by name across all levels'),
      }),
      execute: async (params) => {
        try {
          const folders = await caller.storage.listFolders({
            organizationId,
            parentId: params.parentId ?? null,
            search: params.search,
          })

          return {
            success: true as const,
            folders: folders.map((f) => ({
              id: f.id,
              name: f.name,
              path: f.path,
              fileCount: f._count.files,
              subfolderCount: f._count.children,
              color: f.color,
              icon: f.icon,
            })),
            count: folders.length,
            message: folders.length > 0
              ? `Found ${folders.length} folder(s)`
              : params.search
                ? `No folders found matching "${params.search}"`
                : 'This location has no folders',
          }
        } catch (err) {
          return handleToolError('listStorageFolders', err)
        }
      },
    }),

    /**
     * List files in a folder with optional filters for category and visibility.
     * Returns file metadata and accessible URLs.
     */
    listStorageFiles: tool({
      description:
        'List files in storage. Filter by folder, file type (IMAGE, VIDEO, AUDIO, DOCUMENT, OTHER), visibility (PUBLIC, PRIVATE), or search by name. Returns file metadata and URLs. To actually VIEW an image, use getStorageFile on a specific file.',
      inputSchema: z.object({
        folderId: z
          .string()
          .optional()
          .describe('Folder ID to list files from. Omit for root-level files.'),
        category: z
          .enum(['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'OTHER'])
          .optional()
          .describe('Filter by file type'),
        visibility: z
          .enum(['PUBLIC', 'PRIVATE'])
          .optional()
          .describe('Filter by visibility — PUBLIC files have direct CDN URLs'),
        search: z
          .string()
          .optional()
          .describe('Search files by name across all folders'),
        page: z.number().optional().describe('Page number (defaults to 1)'),
        pageSize: z.number().optional().describe('Files per page (defaults to 20, max 50)'),
      }),
      execute: async (params) => {
        try {
          const result = await caller.storage.listFiles({
            organizationId,
            folderId: params.folderId ?? null,
            category: params.category,
            visibility: params.visibility,
            search: params.search,
            page: params.page ?? 1,
            pageSize: Math.min(params.pageSize ?? 20, 50),
          })

          return {
            success: true as const,
            files: result.files.map((f) => ({
              id: f.id,
              name: f.displayName || f.name,
              mimeType: f.mimeType,
              category: f.fileCategory,
              size: f.size,
              sizeFormatted: formatFileSize(f.size),
              visibility: f.visibility,
              url: f.accessUrl,
              publicUrl: f.publicUrl,
              thumbnailUrl: f.thumbnailUrl,
              width: f.width,
              height: f.height,
              duration: f.duration,
              createdAt: f.createdAt,
            })),
            pagination: result.pagination,
            message: result.pagination.total > 0
              ? `Found ${result.pagination.total} file(s) (page ${result.pagination.page}/${result.pagination.totalPages})`
              : params.search
                ? `No files found matching "${params.search}"`
                : 'No files in this location',
          }
        } catch (err) {
          return handleToolError('listStorageFiles', err)
        }
      },
    }),

    /**
     * Get detailed info about a specific file. If it's an image, the AI will
     * be able to see it via the _imageUrl field (picked up by prepareStep in
     * the chat route and injected as a user message image part).
     */
    getStorageFile: tool({
      description:
        'Get full details of a file by ID. If the file is an image (PNG, JPEG, WebP, GIF), you will automatically be able to see and describe its visual contents. For videos, audio, and documents, you get the metadata and URL to share with the user.',
      inputSchema: z.object({
        fileId: z.string().describe('The file ID to look up'),
      }),
      execute: async (params) => {
        try {
          const file = await caller.storage.getFile({
            organizationId,
            fileId: params.fileId,
          })

          /* Resolve the accessible URL — CDN for public, signed for private */
          let accessUrl: string | null = null
          if (file.visibility === 'PUBLIC' && file.publicUrl) {
            accessUrl = file.publicUrl
          } else {
            const downloadResult = await caller.storage.getDownloadUrl({
              organizationId,
              fileId: params.fileId,
            })
            accessUrl = downloadResult.downloadUrl
          }

          /* If image is viewable, pass the URL for vision via _imageUrl.
           * The prepareStep hook in the chat route injects this as a user
           * message image part so the model can see it. */
          const isViewableImage =
            file.fileCategory === 'IMAGE' &&
            VIEWABLE_IMAGE_TYPES.has(file.mimeType) &&
            accessUrl !== null

          return {
            success: true as const,
            file: {
              id: file.id,
              name: file.displayName || file.name,
              originalName: file.name,
              mimeType: file.mimeType,
              category: file.fileCategory,
              extension: file.extension,
              size: file.size,
              sizeFormatted: formatFileSize(file.size),
              visibility: file.visibility,
              url: accessUrl,
              publicUrl: file.publicUrl,
              thumbnailUrl: file.thumbnailUrl,
              width: file.width,
              height: file.height,
              duration: file.duration,
              folderId: file.folderId,
              createdAt: file.createdAt,
              updatedAt: file.updatedAt,
            },
            /* URL for prepareStep hook to inject as a vision image part */
            _imageUrl: isViewableImage ? accessUrl : undefined,
            canSeeImage: isViewableImage,
            message: isViewableImage
              ? `Viewing image "${file.displayName || file.name}" (${formatFileSize(file.size)})`
              : `File "${file.displayName || file.name}" (${formatFileSize(file.size)}, ${file.visibility})`,
          }
        } catch (err) {
          return handleToolError('getStorageFile', err)
        }
      },
    }),

    /**
     * Get a download URL for a file. Public files return the CDN URL directly.
     * Private files get a temporary signed URL (valid for 1 hour).
     */
    getStorageFileUrl: tool({
      description:
        'Get the accessible URL for a file. Public files return a permanent CDN URL. Private files return a temporary signed URL valid for 1 hour. Use this when you need to reference or share a file URL.',
      inputSchema: z.object({
        fileId: z.string().describe('The file ID to get the URL for'),
      }),
      execute: async (params) => {
        try {
          const result = await caller.storage.getDownloadUrl({
            organizationId,
            fileId: params.fileId,
          })

          return {
            success: true as const,
            url: result.downloadUrl,
            expiresAt: result.expiresAt,
            isPermanent: result.expiresAt === null,
            message: result.expiresAt
              ? `Temporary URL generated (expires ${result.expiresAt})`
              : 'Permanent CDN URL retrieved',
          }
        } catch (err) {
          return handleToolError('getStorageFileUrl', err)
        }
      },
    }),

    /**
     * Get storage usage statistics for the organization.
     * Shows total files, size, breakdown by category, public vs private counts.
     */
    getStorageStats: tool({
      description:
        'Get storage usage statistics — total files, total size, breakdown by file type (IMAGE, VIDEO, AUDIO, DOCUMENT), and public vs private counts.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const stats = await caller.storage.getStats({
            organizationId,
          })

          return {
            success: true as const,
            stats: {
              totalFiles: stats.totalFiles,
              totalSize: stats.totalSize,
              totalSizeFormatted: formatFileSize(stats.totalSize),
              publicFiles: stats.publicFiles,
              privateFiles: stats.privateFiles,
              byCategory: stats.byCategory.map((c) => ({
                category: c.category,
                count: c.count,
                size: c.size,
                sizeFormatted: formatFileSize(c.size),
              })),
            },
            message: `Storage: ${stats.totalFiles} files, ${formatFileSize(stats.totalSize)} total (${stats.publicFiles} public, ${stats.privateFiles} private)`,
          }
        } catch (err) {
          return handleToolError('getStorageStats', err)
        }
      },
    }),

    /**
     * Get the breadcrumb path for a folder (its ancestors).
     * Helps the AI understand folder hierarchy and navigate between levels.
     */
    getStorageFolderPath: tool({
      description:
        'Get the full path (breadcrumb) for a folder — useful for understanding where a folder sits in the hierarchy.',
      inputSchema: z.object({
        folderId: z.string().describe('The folder ID to get the path for'),
      }),
      execute: async (params) => {
        try {
          const breadcrumb = await caller.storage.getFolderBreadcrumb({
            organizationId,
            folderId: params.folderId,
          })

          return {
            success: true as const,
            breadcrumb,
            path: breadcrumb.map((b) => b.name).join(' / '),
            message: `Path: ${breadcrumb.map((b) => b.name).join(' / ')}`,
          }
        } catch (err) {
          return handleToolError('getStorageFolderPath', err)
        }
      },
    }),
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Formats a file size in bytes to a human-readable string.
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const size = bytes / Math.pow(1024, i)
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}
