/**
 * UPLOAD DIALOG COMPONENT
 *
 * Modal dialog for uploading files with:
 * - Drag and drop support
 * - File type validation
 * - Privacy selection (PUBLIC/PRIVATE)
 * - Upload progress tracking
 * - Multiple file support
 */

'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { Upload, X, Check, AlertCircle, Lock, Globe, AlertTriangle, Play } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { FileIcon } from '@/components/storage/file-icons'
import { trpc } from '@/trpc/react-provider'
import { toast } from 'sonner'
import type { FileVisibility, FileCategory } from '@/generated/prisma'
import Image from 'next/image'

// ============================================================================
// TYPES
// ============================================================================

interface UploadFile {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error'
  progress: number
  error?: string
}

interface UploadDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Close handler */
  onClose: () => void
  /** Current folder ID (null for root) */
  folderId: string | null
  /** Organization ID */
  organizationId: string
  /** Upload complete handler */
  onUploadComplete: () => void
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get file extension from filename
 */
function getExtension(filename: string): string {
  const parts = filename.split('.')
  return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : ''
}

/**
 * Determine file category from MIME type and extension
 */
function getFileCategory(mimeType: string, extension: string): FileCategory {
  // Check by MIME type first
  if (mimeType.startsWith('image/')) return 'IMAGE'
  if (mimeType.startsWith('video/')) return 'VIDEO'
  if (mimeType.startsWith('audio/')) return 'AUDIO'

  // Check by extension for documents
  const docExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf']
  if (docExtensions.includes(extension)) return 'DOCUMENT'

  // Archives
  const archiveExtensions = ['zip', 'rar', '7z', 'tar', 'gz', 'bz2']
  if (archiveExtensions.includes(extension)) return 'ARCHIVE'

  return 'OTHER'
}

/**
 * Format file size to human readable
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return Math.random().toString(36).substring(2, 15)
}

// ============================================================================
// IMAGE PREVIEW THUMB (local blob URL for pre-upload preview)
// ============================================================================

/**
 * Image thumbnail for the upload queue.
 * Uses URL.createObjectURL to generate a local preview from the File blob
 * before any upload happens — no server round-trip needed.
 */
function ImagePreviewThumb({ file, name }: { file: File; name: string }) {
  const previewUrl = useMemo(() => URL.createObjectURL(file), [file])

  return (
    <div className="relative w-full h-24 rounded-md overflow-hidden bg-muted/30">
      {/* unoptimized required — blob: URLs can't go through Next.js image optimization */}
      <Image
        src={previewUrl}
        alt={name}
        fill
        unoptimized
        className="object-cover"
        onLoad={() => URL.revokeObjectURL(previewUrl)}
      />
    </div>
  )
}

// ============================================================================
// VIDEO PREVIEW THUMB (local blob URL for pre-upload preview)
// ============================================================================

/**
 * Video thumbnail for the upload queue.
 *
 * WHY canvas approach: <video preload="metadata"> and even the #t=0.1 media
 * fragment trick are unreliable across browsers — Chrome/Edge on Windows often
 * show a black rectangle because they don't decode a visible frame from metadata alone.
 *
 * HOW: Creates a hidden <video>, seeks to 0.5s (or first seekable point),
 * waits for the frame to decode, then paints it onto a <canvas> and extracts
 * a data URL. This works universally across all browsers.
 *
 * The canvas thumbnail is stored in state so the heavy <video> element
 * is only alive during extraction, not permanently mounted.
 */
function VideoPreviewThumb({ file }: { file: File }) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)

  useEffect(() => {
    let revoked = false
    const blobUrl = URL.createObjectURL(file)
    const video = document.createElement('video')

    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.crossOrigin = 'anonymous'
    video.src = blobUrl

    /**
     * Once metadata loads, seek to 0.5s to get a representative frame.
     * If the video is shorter than 0.5s, the browser clamps to the nearest frame.
     */
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.5, video.duration / 2)
    }

    /**
     * Once the browser has decoded the frame at the seeked position,
     * paint it onto a canvas and extract as JPEG data URL.
     */
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
          if (!revoked) {
            setThumbnailUrl(dataUrl)
          }
        }
      } catch {
        // Canvas capture failed (e.g., codec not supported) — leave as null
      }
      // Done with the video element — free the blob URL
      URL.revokeObjectURL(blobUrl)
    }

    /**
     * Fallback: if the video errors out (unsupported codec, corrupt file),
     * clean up and leave thumbnailUrl as null so the play icon fallback shows.
     */
    video.onerror = () => {
      URL.revokeObjectURL(blobUrl)
    }

    return () => {
      revoked = true
      video.src = ''
      video.load()
      URL.revokeObjectURL(blobUrl)
    }
  }, [file])

  return (
    <div className="relative w-full h-24 rounded-md overflow-hidden bg-black">
      {/* Show extracted thumbnail frame, or empty black bg as fallback */}
      {thumbnailUrl && (
        <img
          src={thumbnailUrl}
          alt="Video preview"
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      {/* Play icon overlay to distinguish from images */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
        <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
          <Play className="w-5 h-5 text-white fill-white ml-0.5" />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function UploadDialog({
  open,
  onClose,
  folderId,
  organizationId,
  onUploadComplete,
}: UploadDialogProps) {
  const [files, setFiles] = useState<UploadFile[]>([])
  const [visibility, setVisibility] = useState<FileVisibility>('PRIVATE')
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // tRPC mutations for upload workflow
  const getUploadUrlMutation = trpc.storage.getUploadUrl.useMutation()
  const createFileMutation = trpc.storage.createFile.useMutation()

  // Check if R2 storage is configured
  // NOTE: Must pass organizationId to satisfy organizationProcedure security
  const { data: storageConfig } = trpc.storage.isConfigured.useQuery(
    { organizationId },
    { staleTime: Infinity } // Only check once per session
  )

  // Add files to the upload queue
  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles)
    const uploadFiles: UploadFile[] = fileArray.map((file) => ({
      id: generateId(),
      file,
      status: 'pending',
      progress: 0,
    }))
    setFiles((prev) => [...prev, ...uploadFiles])
  }, [])

  // Remove a file from the queue
  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files)
    }
  }, [addFiles])

  // Handle file input change
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files)
    }
    // Reset input so same file can be selected again
    e.target.value = ''
  }, [addFiles])

  /**
   * Upload all files to R2
   *
   * FLOW:
   * 1. Get presigned upload URL from server
   * 2. Upload file directly to R2 using XMLHttpRequest (for progress tracking)
   * 3. Create file record in database
   */
  const handleUpload = async () => {
    if (files.length === 0) return

    // Check if storage is configured
    if (!storageConfig?.configured) {
      toast.error('Storage is not configured. Please contact your administrator.')
      return
    }

    setIsUploading(true)
    let successCount = 0

    for (const uploadFile of files) {
      try {
        // Update status to uploading
        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadFile.id ? { ...f, status: 'uploading' } : f
          )
        )

        // Step 1: Get presigned upload URL
        const uploadData = await getUploadUrlMutation.mutateAsync({
          organizationId,
          filename: uploadFile.file.name,
          contentType: uploadFile.file.type || 'application/octet-stream',
          contentLength: uploadFile.file.size,
          visibility,
          folderId,
        })

        // Step 2: Upload to R2 using XMLHttpRequest for progress tracking
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()

          // Track upload progress
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const progress = Math.round((event.loaded / event.total) * 100)
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === uploadFile.id ? { ...f, progress } : f
                )
              )
            }
          }

          // Handle completion
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve()
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`))
            }
          }

          // Handle errors
          xhr.onerror = () => reject(new Error('Network error during upload'))

          // Send the request
          xhr.open('PUT', uploadData.uploadUrl, true)
          xhr.setRequestHeader('Content-Type', uploadFile.file.type || 'application/octet-stream')
          xhr.send(uploadFile.file)
        })

        // Step 3: Create file record in database
        await createFileMutation.mutateAsync({
          organizationId,
          name: uploadFile.file.name,
          displayName: uploadFile.file.name,
          mimeType: uploadFile.file.type || 'application/octet-stream',
          size: uploadFile.file.size,
          extension: uploadData.extension,
          fileCategory: uploadData.fileCategory,
          storageKey: uploadData.storageKey,
          publicUrl: uploadData.publicUrl,
          visibility,
          folderId,
        })

        // Mark as success
        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadFile.id ? { ...f, status: 'success', progress: 100 } : f
          )
        )
        successCount++

      } catch (error) {
        // Mark as error
        const errorMessage = error instanceof Error ? error.message : 'Upload failed'
        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadFile.id ? { ...f, status: 'error', error: errorMessage } : f
          )
        )
        console.error(`[Upload] Failed to upload ${uploadFile.file.name}:`, error)
      }
    }

    setIsUploading(false)

    // Show toast notification
    if (successCount === files.length) {
      toast.success(`Successfully uploaded ${successCount} file${successCount !== 1 ? 's' : ''}`)
    } else if (successCount > 0) {
      toast.warning(`Uploaded ${successCount} of ${files.length} files`)
    } else {
      toast.error('All uploads failed')
    }

    // Wait a moment to show final state, then close if all succeeded
    setTimeout(() => {
      if (successCount > 0) {
        onUploadComplete()
      }
      if (successCount === files.length) {
        handleClose()
      }
    }, 500)
  }

  // Reset and close
  const handleClose = () => {
    if (!isUploading) {
      setFiles([])
      setVisibility('PRIVATE')
      onClose()
    }
  }

  const pendingFiles = files.filter((f) => f.status === 'pending')
  const hasFiles = files.length > 0

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Files</DialogTitle>
          <DialogDescription>
            Drag and drop files or click to browse. Choose visibility before uploading.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Storage not configured warning */}
          {storageConfig && !storageConfig.configured && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-700 dark:text-amber-400">
                  Storage not configured
                </p>
                <p className="text-muted-foreground">
                  R2 environment variables are missing. Uploads will not work until configured.
                </p>
              </div>
            </div>
          )}

          {/* Drop zone */}
          <div
            className={cn(
              'relative border-2 border-dashed rounded-lg p-8 text-center transition-colors',
              'hover:border-primary/50 hover:bg-muted/30',
              isDragging && 'border-primary bg-primary/5',
              !isDragging && 'border-border'
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />

            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Upload className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  Drop files here or{' '}
                  <span className="text-primary cursor-pointer">browse</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports images, videos, documents, and archives
                </p>
              </div>
            </div>
          </div>

          {/* File list — flex-col cards: preview on top, name + size below */}
          {hasFiles && (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {files.map((uploadFile) => {
                const ext = getExtension(uploadFile.file.name)
                const category = getFileCategory(uploadFile.file.type, ext)
                const isImage = category === 'IMAGE'
                const isVideo = category === 'VIDEO'

                return (
                  <div
                    key={uploadFile.id}
                    className="relative flex flex-col gap-2 p-3 rounded-lg bg-muted/30 overflow-hidden"
                  >
                    {/* Remove / status button — top-right corner */}
                    <div className="absolute top-2 right-2 z-10">
                      {uploadFile.status === 'pending' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 bg-background/80 backdrop-blur-sm hover:bg-background"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeFile(uploadFile.id)
                          }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {uploadFile.status === 'success' && (
                        <div className="h-6 w-6 rounded-full bg-green-500/90 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                      {uploadFile.status === 'error' && (
                        <div className="h-6 w-6 rounded-full bg-destructive/90 flex items-center justify-center">
                          <AlertCircle className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                    </div>

                    {/* Preview area — image/video thumbnail or file icon */}
                    {isImage ? (
                      <ImagePreviewThumb file={uploadFile.file} name={uploadFile.file.name} />
                    ) : isVideo ? (
                      <VideoPreviewThumb file={uploadFile.file} />
                    ) : (
                      <div className="w-full h-24 rounded-md bg-muted/50 flex items-center justify-center">
                        <FileIcon extension={ext} category={category} size="lg" />
                      </div>
                    )}

                    {/* File name + size */}
                    <div className="min-w-0">
                      <p className="text-sm font-medium line-clamp-1 break-all">
                        {uploadFile.file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(uploadFile.file.size)}
                      </p>
                    </div>

                    {/* Upload progress bar — shown only while uploading */}
                    {uploadFile.status === 'uploading' && (
                      <Progress value={uploadFile.progress} className="h-1.5" />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Visibility selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">File Visibility</Label>
            <RadioGroup
              value={visibility}
              onValueChange={(v) => setVisibility(v as FileVisibility)}
              className="grid grid-cols-2 gap-3"
            >
              <Label
                htmlFor="private"
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                  visibility === 'PRIVATE'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/30'
                )}
              >
                <RadioGroupItem value="PRIVATE" id="private" className="sr-only" />
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Private</p>
                  <p className="text-xs text-muted-foreground">
                    Only team members
                  </p>
                </div>
              </Label>

              <Label
                htmlFor="public"
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                  visibility === 'PUBLIC'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/30'
                )}
              >
                <RadioGroupItem value="PUBLIC" id="public" className="sr-only" />
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Public</p>
                  <p className="text-xs text-muted-foreground">
                    Anyone with link
                  </p>
                </div>
              </Label>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              {visibility === 'PRIVATE'
                ? 'Private files are only accessible to your organization members.'
                : 'Public files can be shared and used for digital products.'}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isUploading}>
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={pendingFiles.length === 0 || isUploading}
          >
            {isUploading ? 'Uploading...' : `Upload ${pendingFiles.length} file${pendingFiles.length !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
