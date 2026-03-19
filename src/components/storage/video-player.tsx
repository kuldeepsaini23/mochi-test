'use client'

/**
 * HLS VIDEO PLAYER COMPONENT
 *
 * Adaptive bitrate video player using hls.js for HLS playback.
 * Supports both public (CDN URL) and private (authenticated) videos.
 *
 * FEATURES:
 * - Adaptive bitrate streaming (auto quality adjustment)
 * - Quality selector for manual selection
 * - Processing status indicator for videos still transcoding
 * - Poster thumbnail support
 * - Error handling with retry option
 * - Safari native HLS support (doesn't need hls.js)
 *
 * USAGE:
 *
 * For dashboard/logged-in areas (any visibility):
 * ```tsx
 * <VideoPlayer
 *   fileId="file-id"
 *   organizationId="org-id"
 * />
 * ```
 *
 * For direct HLS URL (PUBLIC videos on website builder):
 * ```tsx
 * <VideoPlayer
 *   src="https://cdn.example.com/org-xxx/hls/file-id/master.m3u8"
 *   poster="https://cdn.example.com/org-xxx/hls/file-id/poster.jpg"
 * />
 * ```
 *
 * PRIVACY MODEL:
 * - PUBLIC videos: Use CDN URL directly via `src` prop
 * - PRIVATE videos: Use `fileId` + `organizationId` props (fetches via tRPC)
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'
import { cn } from '@/lib/utils'
import { trpc } from '@/trpc/react-provider'
import { Loader2, AlertCircle, RefreshCw, Settings } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

// ============================================================================
// TYPES
// ============================================================================

interface VideoPlayerProps {
  /**
   * Direct HLS manifest URL (for PUBLIC videos or external sources)
   * Use this for website builder embeds where video is already public
   */
  src?: string

  /**
   * Poster/thumbnail URL
   */
  poster?: string

  /**
   * File ID for fetching playback URL via tRPC
   * Use this for dashboard/logged-in areas
   */
  fileId?: string

  /**
   * Organization ID (required when using fileId)
   */
  organizationId?: string

  /**
   * Video controls visibility
   * @default true
   */
  controls?: boolean

  /**
   * Autoplay (usually muted required by browsers)
   * @default false
   */
  autoPlay?: boolean

  /**
   * Loop playback
   * @default false
   */
  loop?: boolean

  /**
   * Start muted
   * @default false
   */
  muted?: boolean

  /**
   * Additional class names for container
   */
  className?: string

  /**
   * Callback when video starts playing
   */
  onPlay?: () => void

  /**
   * Callback when video ends
   */
  onEnded?: () => void

  /**
   * Callback on error
   */
  onError?: (error: Error) => void
}

type ProcessingStatus = 'NONE' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'

// ============================================================================
// COMPONENT
// ============================================================================

export function VideoPlayer({
  src,
  poster,
  fileId,
  organizationId,
  controls = true,
  autoPlay = false,
  loop = false,
  muted = false,
  className,
  onPlay,
  onEnded,
  onError,
}: VideoPlayerProps) {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  // State
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentQuality, setCurrentQuality] = useState<number>(-1) // -1 = auto
  const [availableQualities, setAvailableQualities] = useState<Array<{ index: number; label: string }>>([])
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus | null>(null)
  const [processingProgress, setProcessingProgress] = useState<number | null>(null)

  // Fetch playback URL if using fileId
  const playbackQuery = trpc.storage.getVideoPlaybackUrl.useQuery(
    { organizationId: organizationId!, fileId: fileId! },
    {
      enabled: !!fileId && !!organizationId,
      refetchInterval: (query: { state: { data?: { status?: string } } }) => {
        // Poll while processing
        const status = query.state.data?.status
        if (status === 'PENDING' || status === 'PROCESSING') {
          return 5000 // Poll every 5 seconds
        }
        return false
      },
    }
  )

  // Mutation for manual retry
  const triggerProcessingMutation = trpc.storage.triggerVideoProcessing.useMutation()

  // Determine the actual playback URL
  const playbackUrl = src || playbackQuery.data?.playbackUrl
  const posterUrl = poster || playbackQuery.data?.posterUrl

  // Update processing status from query
  useEffect(() => {
    if (playbackQuery.data) {
      setProcessingStatus(playbackQuery.data.status as ProcessingStatus)
      setProcessingProgress(playbackQuery.data.progress)
    }
  }, [playbackQuery.data])

  /**
   * Initialize HLS.js player
   *
   * Handles browser compatibility:
   * - Safari: Native HLS support, use video src directly
   * - Other browsers: Use hls.js library
   */
  const initializePlayer = useCallback(() => {
    const video = videoRef.current
    if (!video || !playbackUrl) return

    // Cleanup previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    // Check if browser supports HLS natively (Safari)
    const nativeHls = video.canPlayType('application/vnd.apple.mpegurl')

    if (nativeHls) {
      // Safari: Use native HLS support
      video.src = playbackUrl
      video.addEventListener('loadedmetadata', () => {
        setIsLoading(false)
        if (autoPlay) video.play()
      })
      video.addEventListener('error', () => {
        setIsLoading(false)
        setError(`Video error: ${video.error?.message || 'Unknown error'}`)
      })
      return
    }

    // Chrome/Firefox/Edge: Use hls.js library
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
      })

      hlsRef.current = hls

      hls.loadSource(playbackUrl)
      hls.attachMedia(video)

      // Handle manifest parsed - extract quality levels
      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setIsLoading(false)

        // Build quality options
        const qualities = data.levels.map((level, index) => ({
          index,
          label: `${level.height}p`,
        }))
        setAvailableQualities([
          { index: -1, label: 'Auto' },
          ...qualities.sort((a, b) => {
            const aHeight = parseInt(a.label)
            const bHeight = parseInt(b.label)
            return bHeight - aHeight // Highest first
          }),
        ])

        if (autoPlay) video.play()
      })

      // Handle level switched
      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setCurrentQuality(data.level)
      })

      // Handle fatal errors
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setIsLoading(false)

          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setError('Network error - check your connection')
              hls.startLoad() // Try to recover
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              setError('Media error - trying to recover...')
              hls.recoverMediaError()
              break
            default:
              setError('Failed to load video')
              hls.destroy()
              onError?.(new Error(data.details))
          }
        }
      })
    } else {
      setError('Your browser does not support HLS playback')
      setIsLoading(false)
    }
  }, [playbackUrl, autoPlay, onError])

  // Initialize player when URL is available
  useEffect(() => {
    if (playbackUrl) {
      setIsLoading(true)
      setError(null)
      initializePlayer()
    }

    // Cleanup on unmount
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [playbackUrl, initializePlayer])

  /**
   * Change quality level
   * -1 = auto (ABR), >= 0 = specific level
   */
  const handleQualityChange = useCallback((levelIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex
      setCurrentQuality(levelIndex)
    }
  }, [])

  /**
   * Retry failed processing
   */
  const handleRetryProcessing = async () => {
    if (!fileId || !organizationId) return
    await triggerProcessingMutation.mutateAsync({ organizationId, fileId }).catch(() => {})
  }

  // ===========================================================================
  // RENDER: Processing Status
  // ===========================================================================
  if (processingStatus && processingStatus !== 'COMPLETED' && processingStatus !== 'NONE') {
    return (
      <div className={cn(
        'relative flex items-center justify-center bg-muted rounded-lg overflow-hidden',
        'aspect-video',
        className
      )}>
        {/* Poster background if available */}
        {posterUrl && (
          <img
            src={posterUrl}
            alt="Video thumbnail"
            className="absolute inset-0 w-full h-full object-cover opacity-30 blur-sm"
          />
        )}

        <div className="relative z-10 text-center p-6">
          {processingStatus === 'PENDING' && (
            <>
              <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Video queued for processing...</p>
            </>
          )}

          {processingStatus === 'PROCESSING' && (
            <>
              <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
              <p className="text-sm font-medium">Processing video...</p>
              {processingProgress !== null && (
                <div className="mt-3 w-48 mx-auto">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${processingProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{processingProgress}% complete</p>
                </div>
              )}
            </>
          )}

          {processingStatus === 'FAILED' && (
            <>
              <AlertCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
              <p className="text-sm font-medium text-destructive">Processing failed</p>
              {playbackQuery.data?.error && (
                <p className="text-xs text-muted-foreground mt-1">{playbackQuery.data.error}</p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={handleRetryProcessing}
                disabled={triggerProcessingMutation.isPending}
              >
                {triggerProcessingMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Retry Processing
              </Button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ===========================================================================
  // RENDER: No Source (before video element exists)
  // ===========================================================================
  if (!playbackUrl && !playbackQuery.isLoading) {
    return (
      <div className={cn(
        'relative flex items-center justify-center bg-muted rounded-lg overflow-hidden',
        'aspect-video',
        className
      )}>
        <p className="text-sm text-muted-foreground">No video source</p>
      </div>
    )
  }

  // ===========================================================================
  // RENDER: Video Player (always render video element so hls.js can attach)
  // ===========================================================================
  return (
    <div className={cn('relative group rounded-lg overflow-hidden aspect-video bg-black', className)}>
      {/* Video element - always exists so hls.js can attach to it */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        controls={controls && !isLoading && !error}
        loop={loop}
        muted={muted}
        poster={posterUrl || undefined}
        playsInline // Required for iOS
        onPlay={onPlay}
        onEnded={onEnded}
      />

      {/* Loading Overlay - subtle so poster shows through */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="p-4 rounded-full bg-black/60 backdrop-blur-sm">
            <Loader2 className="w-8 h-8 animate-spin text-white" />
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <div className="text-center p-6">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
            <p className="text-sm font-medium text-white">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={initializePlayer}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Quality Selector Overlay */}
      {controls && availableQualities.length > 1 && !isLoading && !error && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                className="h-8 px-2 bg-black/70 hover:bg-black/90 text-white border-0"
              >
                <Settings className="w-4 h-4 mr-1" />
                {currentQuality === -1 ? 'Auto' : `${availableQualities.find(q => q.index === currentQuality)?.label || 'Auto'}`}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {availableQualities.map((quality) => (
                <DropdownMenuItem
                  key={quality.index}
                  onClick={() => handleQualityChange(quality.index)}
                  className={cn(
                    currentQuality === quality.index && 'font-bold bg-accent'
                  )}
                >
                  {quality.label}
                  {quality.index === -1 && currentQuality >= 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({availableQualities.find(q => q.index === currentQuality)?.label})
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
}

export default VideoPlayer
