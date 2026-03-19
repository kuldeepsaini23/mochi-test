/**
 * HLS VIDEO PROCESSING TASK
 *
 * Trigger.dev task that converts uploaded videos to HLS format with multiple
 * quality variants for adaptive bitrate streaming.
 *
 * WHY HLS:
 * - Adaptive bitrate: Automatically adjusts quality based on viewer's connection
 * - Chunked delivery: Videos start playing immediately, no full download needed
 * - Universal support: Works on all devices and browsers (with hls.js fallback)
 * - Cost efficient: R2 egress is free, and chunks cache well at the edge
 *
 * PROCESSING FLOW:
 * 1. Download original video from R2 to temp directory
 * 2. Probe video metadata (resolution, duration, codecs) with ffprobe
 * 3. Determine quality variants based on source resolution
 * 4. Run FFmpeg to generate HLS chunks + playlists
 * 5. Generate poster thumbnail at ~25% duration
 * 6. Upload all HLS files to R2
 * 7. Update database with HLS URLs and status
 *
 * QUALITY VARIANTS:
 * - 1080p: 1920x1080, 5000kbps (only if source >= 1080p)
 * - 720p:  1280x720,  2500kbps (only if source >= 720p)
 * - 480p:  854x480,   1200kbps (only if source >= 480p)
 * - 360p:  640x360,   600kbps  (always included as fallback)
 *
 * HLS SETTINGS:
 * - Segment duration: 4 seconds (good balance for seeking)
 * - Codec: H.264 for broad compatibility
 * - Audio: AAC
 *
 * STORAGE STRUCTURE:
 * org-{organizationId}/hls/{fileId}/
 *   ├── master.m3u8         # Master playlist (adaptive bitrate selector)
 *   ├── poster.jpg          # Thumbnail at ~25% duration
 *   ├── 1080p/
 *   │   ├── playlist.m3u8   # Quality-specific playlist
 *   │   └── segment-*.ts    # Video chunks (4s each)
 *   ├── 720p/...
 *   ├── 480p/...
 *   └── 360p/...
 */

import { schemaTask, logger } from '@trigger.dev/sdk'
import { z } from 'zod'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { getR2Client } from '@/lib/r2'
import {
  updateStorageFileProgress,
  markStorageFileProcessingStarted,
  markStorageFileProcessingCompleted,
  markStorageFileProcessingFailed,
  updateStorageFileVideoMetadata,
} from '@/services/storage.service'
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'

const execAsync = promisify(exec)

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * R2 bucket name from environment
 */
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!

/**
 * Public CDN URL for R2 bucket (for PUBLIC files)
 */
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL

/**
 * Quality variant configuration
 * Each variant defines resolution and bitrate settings
 */
interface QualityVariant {
  name: string
  width: number
  height: number
  videoBitrate: number // kbps
  audioBitrate: number // kbps
}

/**
 * Available quality variants (highest to lowest)
 * We filter these based on source resolution
 */
const QUALITY_VARIANTS: QualityVariant[] = [
  { name: '1080p', width: 1920, height: 1080, videoBitrate: 5000, audioBitrate: 192 },
  { name: '720p', width: 1280, height: 720, videoBitrate: 2500, audioBitrate: 128 },
  { name: '480p', width: 854, height: 480, videoBitrate: 1200, audioBitrate: 96 },
  { name: '360p', width: 640, height: 360, videoBitrate: 600, audioBitrate: 64 },
]

/**
 * HLS segment duration in seconds
 * 4 seconds is a good balance between:
 * - Small enough for quick seeking
 * - Large enough to avoid too many HTTP requests
 */
const HLS_SEGMENT_DURATION = 4

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Input schema for video processing task
 */
const videoProcessingSchema = z.object({
  fileId: z.string(),
  organizationId: z.string(),
  storageKey: z.string(),
  isPublic: z.boolean(),
})

/**
 * Video metadata from ffprobe
 */
interface VideoMetadata {
  width: number
  height: number
  duration: number
  videoCodec: string
  audioCodec: string
  videoBitrate: number
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Probe video to get metadata using ffprobe
 *
 * WHY: We need to know source resolution to determine which quality
 * variants to generate (no point upscaling 720p source to 1080p)
 */
async function probeVideo(inputPath: string): Promise<VideoMetadata> {
  const { stdout } = await execAsync(
    `ffprobe -v quiet -print_format json -show_format -show_streams "${inputPath}"`
  )
  const probe = JSON.parse(stdout)

  const videoStream = probe.streams?.find((s: any) => s.codec_type === 'video')
  const audioStream = probe.streams?.find((s: any) => s.codec_type === 'audio')

  return {
    width: videoStream?.width || 1920,
    height: videoStream?.height || 1080,
    duration: parseFloat(probe.format?.duration || '0'),
    videoCodec: videoStream?.codec_name || 'unknown',
    audioCodec: audioStream?.codec_name || 'unknown',
    videoBitrate: Math.round((videoStream?.bit_rate || 5000000) / 1000),
  }
}

/**
 * Determine which quality variants to generate based on source resolution
 *
 * WHY: Don't upscale - if source is 720p, we only generate 720p and below
 * Always include 360p as a fallback for poor connections
 */
function getTargetVariants(sourceHeight: number): QualityVariant[] {
  return QUALITY_VARIANTS.filter(
    (variant) => sourceHeight >= variant.height || variant.name === '360p'
  )
}

/**
 * Generate master HLS playlist content
 *
 * The master playlist tells the player about available quality levels
 * and lets it choose based on network conditions
 */
function generateMasterPlaylist(variants: QualityVariant[]): string {
  let content = '#EXTM3U\n#EXT-X-VERSION:3\n\n'

  for (const variant of variants) {
    const bandwidth = variant.videoBitrate * 1000 + variant.audioBitrate * 1000
    content += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${variant.width}x${variant.height}\n`
    content += `${variant.name}/playlist.m3u8\n\n`
  }

  return content
}

/**
 * Generate HLS using FFmpeg
 *
 * Creates all quality variants in a single FFmpeg command for efficiency
 * Each variant gets its own directory with playlist.m3u8 and segment-*.ts files
 */
async function generateHLS(
  inputPath: string,
  outputDir: string,
  variants: QualityVariant[]
): Promise<void> {
  // Create output directories for each variant
  for (const variant of variants) {
    await fs.mkdir(path.join(outputDir, variant.name), { recursive: true })
  }

  // Build FFmpeg command
  // We process all variants in one pass for efficiency
  const filterParts: string[] = []
  const mapParts: string[] = []

  variants.forEach((variant, i) => {
    // Scale filter for each variant
    // format=yuv420p converts 10-bit HDR (from iPhone, etc.) to 8-bit for compatibility
    filterParts.push(
      `[0:v]scale=${variant.width}:${variant.height}:force_original_aspect_ratio=decrease,pad=${variant.width}:${variant.height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v${i}]`
    )

    // Output mapping for each variant
    // Each output gets its own codec settings (no stream index needed - each output has one video/audio)
    const variantDir = path.join(outputDir, variant.name)
    mapParts.push(
      `-map "[v${i}]" -map 0:a?`,
      `-c:v libx264 -preset medium -profile:v main -level 4.0`,
      `-b:v ${variant.videoBitrate}k`,
      `-maxrate ${Math.round(variant.videoBitrate * 1.2)}k`,
      `-bufsize ${variant.videoBitrate * 2}k`,
      `-c:a aac -b:a ${variant.audioBitrate}k`,
      `-hls_time ${HLS_SEGMENT_DURATION}`,
      `-hls_playlist_type vod`,
      `-hls_segment_filename "${variantDir}/segment-%03d.ts"`,
      `"${variantDir}/playlist.m3u8"`
    )
  })

  const ffmpegCmd = [
    'ffmpeg -y',
    `-i "${inputPath}"`,
    `-filter_complex "${filterParts.join(';')}"`,
    ...mapParts,
  ].join(' ')

  logger.info('Running FFmpeg command', { variants: variants.map((v) => v.name) })

  // Execute FFmpeg - this can take a while for long videos
  const { stderr } = await execAsync(ffmpegCmd, {
    maxBuffer: 50 * 1024 * 1024, // 50MB buffer for FFmpeg output
  })

  // Log any warnings from FFmpeg
  if (stderr && stderr.includes('error')) {
    logger.warn('FFmpeg warnings', { stderr: stderr.slice(0, 1000) })
  }
}

/**
 * Generate poster thumbnail from video
 *
 * Captures a frame at ~25% of the video duration
 * This usually gives a representative frame (past intro, before ending)
 */
async function generatePoster(
  inputPath: string,
  outputPath: string,
  duration: number
): Promise<void> {
  // Capture frame at ~25% of video duration (but at least 1 second in)
  const timestamp = Math.max(1, Math.floor(duration * 0.25))

  await execAsync(
    `ffmpeg -y -ss ${timestamp} -i "${inputPath}" -vframes 1 -q:v 2 "${outputPath}"`
  )
}

/**
 * Upload directory contents to R2
 *
 * Recursively uploads all files in the output directory to R2
 * Sets appropriate content types for HLS files
 */
async function uploadDirectoryToR2(
  localDir: string,
  r2Prefix: string
): Promise<string[]> {
  const client = getR2Client()
  const uploadedKeys: string[] = []

  async function uploadRecursive(dir: string, prefix: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const localPath = path.join(dir, entry.name)
      const r2Key = `${prefix}/${entry.name}`

      if (entry.isDirectory()) {
        await uploadRecursive(localPath, r2Key)
      } else {
        const content = await fs.readFile(localPath)

        // Determine content type based on file extension
        let contentType = 'application/octet-stream'
        if (entry.name.endsWith('.m3u8')) {
          contentType = 'application/vnd.apple.mpegurl'
        } else if (entry.name.endsWith('.ts')) {
          contentType = 'video/mp2t'
        } else if (entry.name.endsWith('.jpg') || entry.name.endsWith('.jpeg')) {
          contentType = 'image/jpeg'
        }

        await client.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: r2Key,
            Body: content,
            ContentType: contentType,
            // Set inline disposition for browser playback
            ContentDisposition: 'inline',
          })
        )

        uploadedKeys.push(r2Key)
      }
    }
  }

  await uploadRecursive(localDir, r2Prefix)
  return uploadedKeys
}

/**
 * Update database with processing progress
 * Delegates to storage.service.ts for database access.
 */
async function updateProgress(fileId: string, progress: number, extra?: Record<string, unknown>) {
  await updateStorageFileProgress(fileId, progress, extra)
}

// ============================================================================
// MAIN TASK
// ============================================================================

/**
 * Video Processing Task
 *
 * Converts uploaded videos to HLS format with multiple quality variants.
 * Supports videos up to 6 hours long (course videos).
 *
 * IMPORTANT: This task has a 6-hour max duration override for long videos.
 * Most videos complete much faster, but 5-hour course videos need this buffer.
 */
export const videoProcessingTask = schemaTask({
  id: 'storage-video-processing',
  description: 'Convert video to HLS format with multiple quality variants',
  schema: videoProcessingSchema,

  // Override max duration for video processing
  // Long course videos (5+ hours) can take several hours to transcode
  maxDuration: 21600, // 6 hours

  // Custom retry for video processing
  // We want a few retries for transient failures, but not too many
  // since processing is expensive
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 10000,
    maxTimeoutInMs: 60000,
    factor: 2,
  },

  run: async (input, { ctx }) => {
    const { fileId, organizationId, storageKey, isPublic } = input

    logger.info('Starting video processing', { fileId, storageKey, isPublic })

    // Create temp directory for this job
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `hls-${fileId}-`))
    const inputPath = path.join(tempDir, 'input.mp4')
    const outputDir = path.join(tempDir, 'output')
    const posterPath = path.join(tempDir, 'poster.jpg')

    try {
      // =========================================================================
      // STEP 1: Update status to PROCESSING (via storage service)
      // =========================================================================
      await markStorageFileProcessingStarted(fileId, ctx.run.id)

      // =========================================================================
      // STEP 2: Download original video from R2
      // =========================================================================
      logger.info('Downloading original video from R2', { storageKey })

      const client = getR2Client()
      const response = await client.send(
        new GetObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: storageKey,
        })
      )

      // Stream to file
      const chunks: Buffer[] = []
      for await (const chunk of response.Body as AsyncIterable<Buffer>) {
        chunks.push(chunk)
      }
      await fs.writeFile(inputPath, Buffer.concat(chunks))

      await updateProgress(fileId, 10)
      logger.info('Downloaded video', {
        size: chunks.reduce((sum, c) => sum + c.length, 0),
      })

      // =========================================================================
      // STEP 3: Probe video metadata
      // =========================================================================
      logger.info('Probing video metadata')
      const metadata = await probeVideo(inputPath)
      logger.info('Video metadata', { ...metadata })

      // =========================================================================
      // STEP 4: Determine quality variants
      // =========================================================================
      const variants = getTargetVariants(metadata.height)
      logger.info('Target variants', { variants: variants.map((v) => v.name) })

      await updateStorageFileVideoMetadata(fileId, {
        videoCodec: metadata.videoCodec,
        audioCodec: metadata.audioCodec,
        videoBitrate: metadata.videoBitrate,
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
      })

      // =========================================================================
      // STEP 5: Generate HLS
      // =========================================================================
      logger.info('Generating HLS variants')
      await fs.mkdir(outputDir, { recursive: true })
      await generateHLS(inputPath, outputDir, variants)

      await updateProgress(fileId, 70)

      // =========================================================================
      // STEP 6: Generate master playlist
      // =========================================================================
      logger.info('Generating master playlist')
      const masterContent = generateMasterPlaylist(variants)
      await fs.writeFile(path.join(outputDir, 'master.m3u8'), masterContent)

      await updateProgress(fileId, 75)

      // =========================================================================
      // STEP 7: Generate poster thumbnail
      // =========================================================================
      logger.info('Generating poster thumbnail')
      await generatePoster(inputPath, posterPath, metadata.duration)

      await updateProgress(fileId, 80)

      // =========================================================================
      // STEP 8: Upload to R2
      // =========================================================================
      logger.info('Uploading HLS files to R2')

      // Build R2 prefix - public files go under public/ prefix
      const hlsPrefix = isPublic
        ? `public/org-${organizationId}/hls/${fileId}`
        : `org-${organizationId}/hls/${fileId}`

      // Upload HLS output directory
      const uploadedKeys = await uploadDirectoryToR2(outputDir, hlsPrefix)
      logger.info('Uploaded HLS files', { count: uploadedKeys.length })

      await updateProgress(fileId, 90)

      // Upload poster
      const posterKey = `${hlsPrefix}/poster.jpg`
      const posterContent = await fs.readFile(posterPath)
      await client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: posterKey,
          Body: posterContent,
          ContentType: 'image/jpeg',
          ContentDisposition: 'inline',
        })
      )

      await updateProgress(fileId, 95)

      // =========================================================================
      // STEP 9: Update database with results
      // =========================================================================
      const hlsManifestKey = `${hlsPrefix}/master.m3u8`

      // Only set public URLs for PUBLIC files
      // PRIVATE files use authenticated API routes for access
      const hlsManifestUrl = isPublic && R2_PUBLIC_URL
        ? `${R2_PUBLIC_URL}/${hlsManifestKey}`
        : null
      const posterUrl = isPublic && R2_PUBLIC_URL
        ? `${R2_PUBLIC_URL}/${posterKey}`
        : null

      await markStorageFileProcessingCompleted(fileId, {
        hlsManifestKey,
        hlsManifestUrl,
        posterKey,
        posterUrl,
        hlsQualities: variants.map((v) => v.name),
      })

      logger.info('Video processing completed successfully', {
        fileId,
        hlsManifestKey,
        qualities: variants.map((v) => v.name),
        duration: metadata.duration,
      })

      return {
        success: true,
        fileId,
        hlsManifestKey,
        posterKey,
        qualities: variants.map((v) => v.name),
        duration: metadata.duration,
      }
    } catch (error) {
      // =========================================================================
      // ERROR HANDLING
      // =========================================================================
      logger.error('Video processing failed', { fileId, error })

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error during processing'

      await markStorageFileProcessingFailed(fileId, errorMessage)

      // Re-throw to trigger retry if applicable
      throw error
    } finally {
      // =========================================================================
      // CLEANUP
      // =========================================================================
      // Always clean up temp directory, even on error
      try {
        await fs.rm(tempDir, { recursive: true, force: true })
        logger.info('Cleaned up temp directory', { tempDir })
      } catch (cleanupError) {
        logger.warn('Failed to cleanup temp directory', { tempDir, cleanupError })
      }
    }
  },
})
