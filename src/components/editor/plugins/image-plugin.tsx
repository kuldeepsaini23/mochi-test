'use client'

/**
 * Image Plugin for Lexical Editor
 *
 * Handles image paste, upload to storage, and deletion cleanup.
 *
 * Features:
 * - Paste images directly from clipboard
 * - Optimistic rendering with local blob URL
 * - Background upload to storage
 * - Automatic cleanup when images are deleted
 *
 * SOURCE OF TRUTH: Lexical plugin pattern
 * Keywords: IMAGE_PLUGIN, PASTE_IMAGE, UPLOAD_IMAGE, LEXICAL_IMAGE_PASTE
 */

import { useEffect, useCallback, useRef } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  PASTE_COMMAND,
  createCommand,
  LexicalCommand,
  $insertNodes,
} from 'lexical'
import { trpc } from '@/trpc/react-provider'
import { $createImageNode, $isImageNode } from '../nodes/image-node'

// ============================================================================
// COMMANDS
// ============================================================================

/**
 * Command to insert an image from URL or storage
 * WHY: Allows slash commands and other sources to trigger image insertion
 */
export const INSERT_IMAGE_COMMAND: LexicalCommand<{
  src: string
  altText?: string
  storageFileId?: string
}> = createCommand('INSERT_IMAGE_COMMAND')

// ============================================================================
// TYPES
// ============================================================================

interface ImagePluginProps {
  /**
   * Organization ID for storage uploads
   * Required for uploading pasted images
   */
  organizationId?: string

  /**
   * Callback when an image upload starts
   */
  onUploadStart?: () => void

  /**
   * Callback when an image upload completes
   */
  onUploadComplete?: (fileId: string, url: string) => void

  /**
   * Callback when an image upload fails
   */
  onUploadError?: (error: Error) => void

  /**
   * Callback when an image is deleted from the editor
   * Provides the storageFileId so caller can clean up
   */
  onImageDelete?: (storageFileId: string) => void
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ACCEPTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]

const OTHER_FOLDER_NAME = 'Other'

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract file extension from filename
 */
function getExtension(filename: string): string {
  const parts = filename.split('.')
  return parts.length > 1 ? parts.pop()!.toLowerCase() : 'png'
}

/**
 * Generate a unique filename for uploaded images
 */
function generateFilename(file: File): string {
  const timestamp = Date.now()
  const randomStr = Math.random().toString(36).substring(2, 8)
  const ext = getExtension(file.name) || 'png'
  return `pasted-image-${timestamp}-${randomStr}.${ext}`
}

/**
 * Create a local blob URL for optimistic rendering
 */
function createBlobUrl(file: File): string {
  return URL.createObjectURL(file)
}

/**
 * Revoke a blob URL to free memory
 */
function revokeBlobUrl(url: string): void {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

// ============================================================================
// IMAGE UPLOAD HOOK
// ============================================================================

/**
 * Hook for handling image uploads to storage
 */
function useImageUpload(organizationId?: string) {
  const utils = trpc.useUtils()

  // Get upload URL mutation
  const getUploadUrl = trpc.storage.getUploadUrl.useMutation()

  // Create file record mutation
  const createFile = trpc.storage.createFile.useMutation({
    onSuccess: () => {
      // Invalidate storage cache
      utils.storage.listFiles.invalidate()
      utils.storage.listFolders.invalidate()
    },
  })

  // List folders to find/create "Other" folder
  const listFolders = trpc.storage.listFolders.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId }
  )

  // Create folder mutation
  const createFolder = trpc.storage.createFolder.useMutation({
    onSuccess: () => {
      utils.storage.listFolders.invalidate()
    },
  })

  /**
   * Find or create the "Other" folder for storing pasted images
   */
  const getOrCreateOtherFolder = useCallback(async (): Promise<string | null> => {
    if (!organizationId) return null

    // Check if "Other" folder exists
    const folders = listFolders.data || []
    const otherFolder = folders.find(
      (f) => f.name.toLowerCase() === OTHER_FOLDER_NAME.toLowerCase()
    )

    if (otherFolder) {
      return otherFolder.id
    }

    // Create "Other" folder
    try {
      const newFolder = await createFolder.mutateAsync({
        organizationId,
        name: OTHER_FOLDER_NAME,
      })
      return newFolder.id
    } catch (error) {
      console.error('Failed to create Other folder:', error)
      return null
    }
  }, [organizationId, listFolders.data, createFolder])

  /**
   * Upload an image file to storage
   * Returns the public URL and file ID
   */
  const uploadImage = useCallback(
    async (
      file: File
    ): Promise<{ url: string; fileId: string } | null> => {
      if (!organizationId) {
        console.warn('Cannot upload image: no organizationId provided')
        return null
      }

      try {
        // Get or create "Other" folder
        const folderId = await getOrCreateOtherFolder()

        // Generate filename
        const filename = generateFilename(file)
        const extension = getExtension(filename)

        // Get presigned upload URL
        const uploadData = await getUploadUrl.mutateAsync({
          organizationId,
          filename,
          contentType: file.type,
          contentLength: file.size,
          visibility: 'PUBLIC', // Images in editor should be public
          folderId,
        })

        // Upload file to R2
        const uploadResponse = await fetch(uploadData.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type,
          },
        })

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed: ${uploadResponse.statusText}`)
        }

        // Create file record in database
        // NOTE: Uses 'name' field as per storage router schema
        const fileRecord = await createFile.mutateAsync({
          organizationId,
          name: filename,
          mimeType: file.type,
          size: file.size,
          extension,
          fileCategory: 'IMAGE',
          storageKey: uploadData.storageKey,
          visibility: 'PUBLIC',
          folderId,
        })

        // Return the public URL and file ID
        // publicUrl is set for PUBLIC visibility files
        const publicUrl = fileRecord.publicUrl || ''
        return { url: publicUrl, fileId: fileRecord.id }
      } catch (error) {
        console.error('Image upload failed:', error)
        throw error
      }
    },
    [organizationId, getOrCreateOtherFolder, getUploadUrl, createFile]
  )

  return { uploadImage }
}

// ============================================================================
// PLUGIN COMPONENT
// ============================================================================

/**
 * ImagePlugin - Handles image paste and upload
 *
 * WHY: Provides seamless image insertion with optimistic updates
 * - Paste images directly from clipboard
 * - Shows image immediately using blob URL
 * - Uploads to storage in background
 * - Replaces blob URL with permanent URL when done
 */
export function ImagePlugin({
  organizationId,
  onUploadStart,
  onUploadComplete,
  onUploadError,
  onImageDelete,
}: ImagePluginProps) {
  const [editor] = useLexicalComposerContext()
  const { uploadImage } = useImageUpload(organizationId)

  // Track blob URLs for cleanup
  const blobUrlsRef = useRef<Map<string, string>>(new Map())

  // Track previous images for deletion detection
  const previousImagesRef = useRef<Map<string, string>>(new Map())

  // ============================================================================
  // PASTE HANDLER
  // ============================================================================

  const handlePaste = useCallback(
    (event: ClipboardEvent): boolean => {
      const clipboardData = event.clipboardData
      if (!clipboardData) return false

      // Check for image files in clipboard
      const files = Array.from(clipboardData.files)
      const imageFiles = files.filter((file) =>
        ACCEPTED_IMAGE_TYPES.includes(file.type)
      )

      if (imageFiles.length === 0) {
        // Check for image items (from screenshots, etc.)
        const items = Array.from(clipboardData.items)
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) {
              imageFiles.push(file)
            }
          }
        }
      }

      if (imageFiles.length === 0) return false

      // Prevent default paste
      event.preventDefault()

      // Process each image
      imageFiles.forEach((file) => {
        // Create blob URL for optimistic rendering
        const blobUrl = createBlobUrl(file)

        // Insert image node immediately with blob URL
        editor.update(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            const imageNode = $createImageNode({
              src: blobUrl,
              altText: file.name || 'Pasted image',
            })
            $insertNodes([imageNode])
          }
        })

        // Store blob URL for later cleanup
        const nodeKey = `pending-${Date.now()}-${Math.random()}`
        blobUrlsRef.current.set(nodeKey, blobUrl)

        // Notify upload start
        onUploadStart?.()

        // Upload in background
        if (organizationId) {
          uploadImage(file)
            .then((result) => {
              if (result) {
                // Update the image node with the real URL
                editor.update(() => {
                  // Find the image node with the blob URL and update it
                  const root = editor.getEditorState()._nodeMap
                  root.forEach((node) => {
                    if ($isImageNode(node) && node.getSrc() === blobUrl) {
                      node.setSrc(result.url)
                      node.setStorageFileId(result.fileId)
                    }
                  })
                })

                // Revoke blob URL
                revokeBlobUrl(blobUrl)
                blobUrlsRef.current.delete(nodeKey)

                // Notify completion
                onUploadComplete?.(result.fileId, result.url)
              }
            })
            .catch((error) => {
              console.error('Failed to upload pasted image:', error)
              onUploadError?.(error)
              // Keep the blob URL on error so user still sees the image
            })
        }
      })

      return true
    },
    [editor, organizationId, uploadImage, onUploadStart, onUploadComplete, onUploadError]
  )

  // ============================================================================
  // DELETION TRACKING
  // ============================================================================

  /**
   * Track image deletions to clean up storage
   * WHY: When users delete images, we need to remove them from storage too
   */
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        // Get current images
        const currentImages = new Map<string, string>()
        editorState._nodeMap.forEach((node) => {
          if ($isImageNode(node)) {
            const fileId = node.getStorageFileId()
            if (fileId) {
              currentImages.set(node.getKey(), fileId)
            }
          }
        })

        // Find deleted images
        previousImagesRef.current.forEach((fileId, nodeKey) => {
          if (!currentImages.has(nodeKey)) {
            // Image was deleted
            onImageDelete?.(fileId)
          }
        })

        // Update previous images
        previousImagesRef.current = currentImages
      })
    })
  }, [editor, onImageDelete])

  // ============================================================================
  // REGISTER PASTE COMMAND
  // ============================================================================

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) => {
        return handlePaste(event)
      },
      COMMAND_PRIORITY_HIGH
    )
  }, [editor, handlePaste])

  // ============================================================================
  // REGISTER INSERT IMAGE COMMAND
  // ============================================================================

  /**
   * Register the INSERT_IMAGE_COMMAND handler
   * WHY: Allows slash commands and other sources to insert images
   * Inserts image at current selection, or at end of document if no selection
   */
  useEffect(() => {
    return editor.registerCommand(
      INSERT_IMAGE_COMMAND,
      (payload) => {
        const { src, altText = '', storageFileId } = payload

        editor.update(() => {
          const imageNode = $createImageNode({
            src,
            altText,
            storageFileId,
          })

          // Try to get current selection
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            // Insert at current selection
            $insertNodes([imageNode])
          } else {
            // No selection - just insert at root level
            // This handles cases where editor lost focus
            $insertNodes([imageNode])
          }
        })

        return true
      },
      COMMAND_PRIORITY_HIGH
    )
  }, [editor])

  // Cleanup blob URLs on unmount
  // Store ref value in variable to avoid stale ref in cleanup
  useEffect(() => {
    const blobUrls = blobUrlsRef.current
    return () => {
      blobUrls.forEach((url) => {
        revokeBlobUrl(url)
      })
    }
  }, [])

  return null
}
