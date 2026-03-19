/**
 * ============================================================================
 * UNIFIED VIDEO ELEMENT - Single Component for Canvas + Preview Rendering
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedVideo, unified-video, video-element, video-renderer
 *
 * Renders a video element in BOTH canvas (editor) and preview (published) modes.
 * This replaces the old split pattern of separate video-element.tsx (canvas) and
 * video-element-renderer.tsx (preview), eliminating duplicated logic.
 *
 * ============================================================================
 * HOW IT WORKS
 * ============================================================================
 *
 * Uses `useRenderMode()` from RenderModeContext to determine the active mode:
 *
 *   - "canvas": Static preview only — shows poster/thumbnail with play icon
 *     overlay. No actual video playback in the editor. The ElementWrapper
 *     handles all editor chrome (selection ring, resize handles, label, etc.).
 *
 *   - "preview": Full video player with thumbnail-first pattern (click to play),
 *     custom minimal controls (play/pause, volume, fullscreen), Loom iframe
 *     embed support, and autoplay/loop/muted settings.
 *
 * SHARED BEHAVIOR (both modes):
 *   - Loom URL detection and iframe rendering
 *   - Poster/thumbnail display with play button overlay
 *   - Border-radius, background color, gradient borders
 *   - Fade edges effect via computeVideoContentStyles
 *   - Responsive breakpoint support
 *
 * ============================================================================
 * ARCHITECTURE NOTES
 * ============================================================================
 *
 * - Content styles are computed via `computeVideoContentStyles()` from
 *   `_lib/style-utils.ts` — the SINGLE SOURCE OF TRUTH for video appearance.
 * - Position/size in canvas mode is handled by `ElementWrapper` using
 *   `computeElementPositionStyles` and `useElementSizeStyles`.
 * - In preview mode, the component computes its own outer wrapper position/size
 *   using the same shared utilities.
 * - The preview video player is organized as internal sub-components:
 *   `VideoThumbnail` (shared) and `VideoPlayer` (preview-only).
 *
 * ============================================================================
 */

'use client'

import React, { memo, useMemo } from 'react'
import { Video, Play } from 'lucide-react'
import type { VideoElement, BorderConfig, Breakpoint } from '../../_lib/types'
import {
  computeVideoContentStyles,
  getPropertyValue,
  useRenderMode,
} from '../../_lib'
import {
  computeElementPositionStyles,
  /** useElementSizeStyles replaces computeElementSizeStyles — reads ParentFlexDirectionContext automatically */
  useElementSizeStyles,
} from '../../_lib/shared-element-styles'
import { GradientBorderOverlay, useGradientBorder } from '../overlay'

// ============================================================================
// LOOM HELPERS
// ============================================================================

/**
 * Extract Loom video ID from various Loom URL formats.
 * Supports:
 * - https://www.loom.com/share/abc123
 * - https://loom.com/share/abc123
 * - https://www.loom.com/embed/abc123
 */
function extractLoomId(url: string): string | null {
  if (!url) return null
  const match = url.match(/loom\.com\/(share|embed)\/([a-zA-Z0-9]+)/)
  return match ? match[2] : null
}

/**
 * Get Loom embed URL from a Loom share URL.
 * Returns null if the URL is not a valid Loom URL.
 */
function getLoomEmbedUrl(url: string): string | null {
  const loomId = extractLoomId(url)
  if (!loomId) return null
  return `https://www.loom.com/embed/${loomId}?hide_owner=true&hide_share=true&hide_title=true`
}

/**
 * Derive poster URL from the HLS video source path.
 * HLS videos store the poster as poster.jpg alongside master.m3u8.
 */
function derivePosterUrl(element: VideoElement): string | undefined {
  if (element.poster) return element.poster
  if (element.src?.includes('/hls/') && element.src?.includes('/master.m3u8')) {
    return element.src.replace('/master.m3u8', '/poster.jpg')
  }
  return undefined
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the UnifiedVideo component.
 *
 * SOURCE OF TRUTH: UnifiedVideoProps
 *
 * In canvas mode, the ElementWrapper provides editor chrome — the video
 * component only needs to render its CONTENT. The canvas-specific interaction
 * props (onDragStart, onResizeStart, etc.) are handled by ElementWrapper.
 */
interface UnifiedVideoProps {
  /** The video element data from the canvas store */
  element: VideoElement
}

// ============================================================================
// PREVIEW-ONLY: MINIMAL CONTROLS COMPONENT
// ============================================================================

/**
 * Props for the MinimalControls overlay that replaces native video controls.
 * Provides play/pause, volume, and fullscreen — no progress bar.
 */
interface MinimalControlsProps {
  /** Whether the video is currently paused */
  isPaused: boolean
  /** Whether the volume is muted */
  isMuted: boolean
  /** Current volume level (0-1) */
  volume: number
  /** Whether controls are fully visible (on hover) vs dimmed */
  isVisible: boolean
  /** Toggle play/pause callback */
  onTogglePlay: () => void
  /** Toggle mute callback */
  onToggleMute: () => void
  /** Volume change callback */
  onVolumeChange: (vol: number) => void
  /** Toggle fullscreen callback */
  onToggleFullscreen: () => void
}

/**
 * Custom minimal video controls overlay — used when native controls are off.
 * Renders play/pause, volume slider, and fullscreen button over the video.
 * Does NOT include a progress bar for a cleaner, minimal look.
 */
function MinimalControls({
  isPaused,
  isMuted,
  volume,
  isVisible,
  onTogglePlay,
  onToggleMute,
  onVolumeChange,
  onToggleFullscreen,
}: MinimalControlsProps) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '12px 16px',
        background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        opacity: isVisible ? 1 : 0.6,
        transition: 'opacity 0.2s ease',
        zIndex: 2,
      }}
    >
      {/* Play/Pause button */}
      <button
        onClick={onTogglePlay}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-label={isPaused ? 'Play' : 'Pause'}
      >
        {isPaused ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
            <path d="M8 5v14l11-7z" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        )}
      </button>

      {/* Volume controls — mute button + slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={onToggleMute}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted || volume === 0 ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
            </svg>
          ) : volume < 0.5 ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M5 9v6h4l5 5V4L9 9H5zm11.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            </svg>
          )}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={isMuted ? 0 : volume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          style={{
            width: 60,
            height: 4,
            accentColor: 'white',
            cursor: 'pointer',
          }}
          aria-label="Volume"
        />
      </div>

      {/* Spacer pushes fullscreen to the right */}
      <div style={{ flex: 1 }} />

      {/* Fullscreen button */}
      <button
        onClick={onToggleFullscreen}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-label="Fullscreen"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
        </svg>
      </button>
    </div>
  )
}

// ============================================================================
// PREVIEW-ONLY: VIDEO PLAYER COMPONENT
// ============================================================================

/**
 * Props for the VideoPlayer sub-component (preview mode only).
 * Handles full video playback with custom controls or native controls.
 */
interface VideoPlayerProps {
  /** The video element data */
  element: VideoElement
  /** Poster/thumbnail URL */
  posterUrl: string | undefined
  /** Video object-fit mode for the <video> tag */
  objectFit: 'cover' | 'contain' | 'fill'
  /** Whether to show native browser controls */
  showNativeControls: boolean
  /** Whether to loop video playback */
  loop: boolean
  /** Whether to start muted */
  muted: boolean
}

/**
 * Full video player component — only rendered in preview mode AFTER the user
 * clicks the play button on the thumbnail. Supports two control modes:
 *
 * 1. Native controls (showNativeControls=true): Browser's built-in controls
 *    with download/fullscreen/remoteplayback disabled.
 *
 * 2. Custom minimal controls (showNativeControls=false): Our overlay with
 *    play/pause, volume, and fullscreen. Native controls are force-hidden
 *    via CSS pseudo-element selectors for WebKit and Firefox.
 *
 * FULLSCREEN NOTE: We fullscreen the CONTAINER div (not the video element)
 * to keep our custom controls visible and prevent native download options.
 */
function VideoPlayer({
  element,
  posterUrl,
  objectFit,
  showNativeControls,
  loop,
  muted,
}: VideoPlayerProps) {
  const [isPaused, setIsPaused] = React.useState(false)
  const [showMinimalControls, setShowMinimalControls] = React.useState(false)
  const [volume, setVolume] = React.useState(1)
  const [isMuted, setIsMuted] = React.useState(false)
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)

  /** Toggle play/pause on the video element. */
  const handleTogglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play()
        setIsPaused(false)
      } else {
        videoRef.current.pause()
        setIsPaused(true)
      }
    }
  }

  /** Toggle mute on the video element. */
  const handleToggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted
      setIsMuted(videoRef.current.muted)
    }
  }

  /** Update the volume level and sync muted state. */
  const handleVolumeChange = (newVolume: number) => {
    if (videoRef.current) {
      videoRef.current.volume = newVolume
      setVolume(newVolume)
      if (newVolume === 0) {
        setIsMuted(true)
        videoRef.current.muted = true
      } else if (isMuted) {
        setIsMuted(false)
        videoRef.current.muted = false
      }
    }
  }

  /**
   * Toggle fullscreen on the CONTAINER (not the video).
   * This preserves our custom controls and prevents native download options.
   */
  const handleToggleFullscreen = () => {
    if (containerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen()
      } else {
        containerRef.current.requestFullscreen()
      }
    }
  }

  return (
    <div
      ref={containerRef}
      data-video-container={element.id}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: '#000',
      }}
      onMouseEnter={() => !showNativeControls && setShowMinimalControls(true)}
      onMouseLeave={() => !showNativeControls && setShowMinimalControls(false)}
    >
      {/* The actual <video> element */}
      <video
        ref={videoRef}
        src={element.src}
        poster={posterUrl}
        controls={showNativeControls}
        controlsList="nodownload nofullscreen noremoteplayback"
        disablePictureInPicture
        autoPlay
        loop={loop}
        muted={muted}
        playsInline
        onPlay={() => setIsPaused(false)}
        onPause={() => setIsPaused(true)}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          width: '100%',
          height: '100%',
          objectFit: objectFit,
        }}
      />

      {/*
        CSS to force-hide native controls when using custom controls.
        Covers WebKit (Chrome/Safari) and Firefox pseudo-element selectors.
      */}
      {!showNativeControls && (
        <style>{`
          [data-video-container="${element.id}"] video::-webkit-media-controls {
            display: none !important;
            opacity: 0 !important;
            pointer-events: none !important;
          }
          [data-video-container="${element.id}"] video::-webkit-media-controls-enclosure {
            display: none !important;
            opacity: 0 !important;
          }
          [data-video-container="${element.id}"] video::-webkit-media-controls-panel {
            display: none !important;
            opacity: 0 !important;
          }
          [data-video-container="${element.id}"] video::-webkit-media-controls-overlay-play-button {
            display: none !important;
          }
          [data-video-container="${element.id}"] video::-webkit-media-controls-start-playback-button {
            display: none !important;
          }
          [data-video-container="${element.id}"] video::-webkit-media-controls-timeline {
            display: none !important;
          }
          [data-video-container="${element.id}"] video::-webkit-media-controls-current-time-display {
            display: none !important;
          }
          [data-video-container="${element.id}"] video::-webkit-media-controls-time-remaining-display {
            display: none !important;
          }
          [data-video-container="${element.id}"] video::-moz-media-controls {
            display: none !important;
          }
        `}</style>
      )}

      {/*
        Interaction blocker — prevents native video click behavior when using
        custom controls. Clicks on this div toggle play/pause instead.
      */}
      {!showNativeControls && (
        <div
          onClick={handleTogglePlay}
          style={{
            position: 'absolute',
            inset: 0,
            cursor: 'pointer',
            zIndex: 1,
          }}
        />
      )}

      {/* Custom minimal controls overlay (play/pause, volume, fullscreen) */}
      {!showNativeControls && (
        <MinimalControls
          isPaused={isPaused}
          isMuted={isMuted}
          volume={volume}
          isVisible={showMinimalControls}
          onTogglePlay={handleTogglePlay}
          onToggleMute={handleToggleMute}
          onVolumeChange={handleVolumeChange}
          onToggleFullscreen={handleToggleFullscreen}
        />
      )}
    </div>
  )
}

// ============================================================================
// SHARED: VIDEO THUMBNAIL COMPONENT
// ============================================================================

/**
 * Props for the VideoThumbnail sub-component.
 * Used in canvas mode (static display) and preview mode (before play).
 */
interface VideoThumbnailProps {
  /** Poster/thumbnail URL to display */
  posterUrl: string | undefined
  /** How the poster fills the container */
  posterFit: 'cover' | 'contain' | 'fill'
  /** Element name for alt text */
  name: string
  /** Whether to enable click-to-play behavior (preview mode only) */
  interactive: boolean
  /** Callback when play is clicked (preview mode only) */
  onPlay?: () => void
}

/**
 * Renders the video poster/thumbnail with a play button overlay.
 * Shared between canvas mode (static) and preview mode (click to play).
 *
 * In canvas mode: Static display with no click interaction.
 * In preview mode: Clickable with hover darkening effect on the overlay.
 */
function VideoThumbnail({
  posterUrl,
  posterFit,
  name,
  interactive,
  onPlay,
}: VideoThumbnailProps) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        cursor: interactive ? 'pointer' : 'default',
      }}
      onClick={interactive ? onPlay : undefined}
    >
      {/* Poster image or dark placeholder background */}
      {posterUrl ? (
        interactive ? (
          // Preview mode: use <img> for better click handling and hover effects
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterUrl}
            alt={name || 'Video thumbnail'}
            style={{
              width: '100%',
              height: '100%',
              objectFit: posterFit,
            }}
          />
        ) : (
          // Canvas mode: use background-image for static display
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${posterUrl})`,
              backgroundSize: posterFit === 'fill' ? '100% 100%' : posterFit,
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
          />
        )
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            /* Use CSS variable so poster bg adapts to light/dark canvas theme */
            backgroundColor: 'var(--muted)',
          }}
        />
      )}

      {/* Play button overlay — circle with triangle icon */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: interactive ? 'rgba(0, 0, 0, 0.2)' : 'transparent',
          transition: interactive ? 'background-color 0.2s' : undefined,
        }}
        onMouseEnter={interactive ? (e) => {
          e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.3)'
        } : undefined}
        onMouseLeave={interactive ? (e) => {
          e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.2)'
        } : undefined}
      >
        {interactive ? (
          // Preview mode: SVG play icon matching the original renderer
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(4px)',
            }}
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="white"
              style={{ marginLeft: 4 }}
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        ) : (
          // Canvas mode: Lucide Play icon with backdrop blur
          <div className="w-16 h-16 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
            <Play className="w-8 h-8 text-white ml-1" fill="white" />
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT: UNIFIED VIDEO
// ============================================================================

/**
 * Unified video element — renders video content for both canvas and preview modes.
 *
 * CANVAS MODE:
 * - Renders inside an ElementWrapper (which handles selection, resize, drag, etc.)
 * - Shows a static poster/thumbnail with play icon overlay — no actual playback
 * - Loom embeds render as iframes (with pointer events disabled when selected)
 *
 * PREVIEW MODE:
 * - Computes its own positioning and sizing via shared utilities
 * - Thumbnail-first pattern: shows poster, plays video on click
 * - Full custom video player with minimal controls when native controls are off
 * - Supports autoplay, loop, muted settings
 * - Loom embeds render as responsive iframes
 *
 * USAGE (canvas mode — inside ElementWrapper):
 * ```tsx
 * <ElementWrapper element={element} {...canvasProps}>
 *   <UnifiedVideo element={element} />
 * </ElementWrapper>
 * ```
 *
 * USAGE (preview mode — standalone):
 * ```tsx
 * <UnifiedVideo element={element} />
 * ```
 */
export const UnifiedVideo = memo(function UnifiedVideo({ element }: UnifiedVideoProps) {
  const { mode, breakpoint } = useRenderMode()
  const isCanvas = mode === 'canvas'

  // ==========================================================================
  // CONTENT STYLE COMPUTATION
  // ==========================================================================

  /**
   * Compute visual styles for the inner content container (border-radius,
   * background color, overflow, effects, fade edges, borders).
   * This is the SINGLE SOURCE OF TRUTH for video appearance across both modes.
   */
  const contentStyle = computeVideoContentStyles(element, { breakpoint })

  // ==========================================================================
  // GRADIENT BORDER SUPPORT
  // ==========================================================================

  /**
   * Extract border config from element styles and determine if a gradient
   * border is active. The GradientBorderOverlay renders the animated gradient.
   */
  const borderConfig = (element.styles as Record<string, unknown>)?.__borderConfig as BorderConfig | undefined
  const gradientBorder = useGradientBorder(element.id, borderConfig)

  // ==========================================================================
  // LOOM EMBED URL
  // ==========================================================================

  /**
   * Memoize Loom embed URL extraction to avoid recomputing on every render.
   * Returns null for non-Loom sources or invalid URLs.
   */
  const loomEmbedUrl = useMemo(() => {
    if (element.sourceType === 'loom' && element.loomUrl) {
      return getLoomEmbedUrl(element.loomUrl)
    }
    return null
  }, [element.sourceType, element.loomUrl])

  // ==========================================================================
  // POSTER URL
  // ==========================================================================

  /** Derive poster URL from explicit poster or HLS source path */
  const posterUrl = derivePosterUrl(element)

  // ==========================================================================
  // RESPONSIVE PROPERTY VALUES (preview mode needs these for the video player)
  // ==========================================================================

  const objectFit = getPropertyValue<'cover' | 'contain' | 'fill'>(
    element, 'objectFit', breakpoint, element.objectFit || 'contain'
  ) ?? 'contain'
  const posterFit = getPropertyValue<'cover' | 'contain' | 'fill'>(
    element, 'posterFit', breakpoint, element.posterFit || 'cover'
  ) ?? 'cover'
  const showNativeControls = getPropertyValue<boolean>(
    element, 'controls', breakpoint, element.controls ?? true
  ) === true
  const loop = getPropertyValue<boolean>(
    element, 'loop', breakpoint, element.loop ?? false
  ) ?? false
  const muted = getPropertyValue<boolean>(
    element, 'muted', breakpoint, element.muted ?? false
  ) ?? false

  // ==========================================================================
  // CANVAS MODE — Static content rendered inside ElementWrapper
  // ==========================================================================

  if (isCanvas) {
    return (
      <div className={gradientBorder.className || undefined} style={{
        ...contentStyle,
        /* Kill transition in canvas — prevents content lagging behind
           handles/selection ring during drag and resize at any zoom level. */
        transition: 'none',
      }}>
        {/* Gradient border overlay if active */}
        {gradientBorder.isActive && (
          <GradientBorderOverlay
            elementId={element.id}
            borderConfig={borderConfig}
            borderRadius={contentStyle.borderRadius}
          />
        )}

        {/* Storage video: show poster or placeholder */}
        {element.sourceType === 'storage' && (
          element.src ? (
            <VideoThumbnail
              posterUrl={posterUrl}
              posterFit={posterFit}
              name={element.name}
              interactive={false}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/10">
              <Video className="w-12 h-12 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground/60">No video selected</p>
            </div>
          )
        )}

        {/* Loom video: show iframe or placeholder */}
        {element.sourceType === 'loom' && (
          loomEmbedUrl ? (
            <iframe
              src={loomEmbedUrl}
              frameBorder="0"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
              style={{ pointerEvents: 'none' }}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/10">
              <Video className="w-12 h-12 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground/60">Paste Loom URL</p>
            </div>
          )
        )}
      </div>
    )
  }

  // ==========================================================================
  // PREVIEW MODE — Full video player with own position/size
  // ==========================================================================

  return (
    <PreviewVideoWrapper
      element={element}
      breakpoint={breakpoint}
      contentStyle={contentStyle}
      gradientBorder={gradientBorder}
      borderConfig={borderConfig}
      loomEmbedUrl={loomEmbedUrl}
      posterUrl={posterUrl}
      posterFit={posterFit}
      objectFit={objectFit}
      showNativeControls={showNativeControls}
      loop={loop}
      muted={muted}
    />
  )
})

// ============================================================================
// PREVIEW MODE WRAPPER — Manages video playback state
// ============================================================================

/**
 * Props for the PreviewVideoWrapper sub-component.
 * Separated to isolate preview-only state (isStarted) from the main component.
 */
interface PreviewVideoWrapperProps {
  element: VideoElement
  breakpoint: Breakpoint
  contentStyle: React.CSSProperties
  gradientBorder: ReturnType<typeof useGradientBorder>
  borderConfig: BorderConfig | undefined
  loomEmbedUrl: string | null
  posterUrl: string | undefined
  posterFit: 'cover' | 'contain' | 'fill'
  objectFit: 'cover' | 'contain' | 'fill'
  showNativeControls: boolean
  loop: boolean
  muted: boolean
}

/**
 * Preview mode wrapper — computes its own positioning and manages the
 * thumbnail-first playback pattern (poster -> click -> video player).
 *
 * This is separated from the main component to prevent the `isStarted`
 * useState from being allocated in canvas mode where it is never needed.
 */
function PreviewVideoWrapper({
  element,
  breakpoint,
  contentStyle,
  gradientBorder,
  borderConfig,
  loomEmbedUrl,
  posterUrl,
  posterFit,
  objectFit,
  showNativeControls,
  loop,
  muted,
}: PreviewVideoWrapperProps) {
  /**
   * Track whether the user has clicked play to start video playback.
   * When false, show the thumbnail with play button overlay.
   */
  const [isStarted, setIsStarted] = React.useState(false)

  const isRoot = element.parentId === null

  /**
   * Compute positioning styles (absolute/relative, left/top, transform, zIndex)
   * and sizing styles (width/height with autoWidth support).
   */
  const positionStyles = computeElementPositionStyles(element, isRoot, breakpoint)
  const sizeStyles = useElementSizeStyles(element, breakpoint, {
    autoWidthDefault: false,
    autoHeightDefault: false,
  })

  return (
    <div
      data-video-renderer
      data-element-id={element.id}
      className={gradientBorder.className || undefined}
      style={{
        ...positionStyles,
        width: sizeStyles.width,
        height: sizeStyles.height,
        minHeight: sizeStyles.minHeight,
        borderRadius: contentStyle.borderRadius,
        /* Fall back to theme-aware muted color instead of hardcoded dark */
        backgroundColor: contentStyle.backgroundColor || 'var(--muted)',
        overflow: 'hidden',
        transform: element.rotation
          ? `rotate(${element.rotation}deg)`
          : positionStyles.transform,
        maskImage: contentStyle.maskImage,
        WebkitMaskImage: contentStyle.WebkitMaskImage,
      }}
    >
      {/* Gradient border overlay */}
      {gradientBorder.isActive && (
        <GradientBorderOverlay
          elementId={element.id}
          borderConfig={borderConfig}
          borderRadius={contentStyle.borderRadius}
        />
      )}

      {/* Storage video — thumbnail-first pattern with full player */}
      {element.sourceType === 'storage' ? (
        element.src ? (
          isStarted ? (
            <VideoPlayer
              element={element}
              posterUrl={posterUrl}
              objectFit={objectFit}
              showNativeControls={showNativeControls}
              loop={loop}
              muted={muted}
            />
          ) : (
            <VideoThumbnail
              posterUrl={posterUrl}
              posterFit={posterFit}
              name={element.name}
              interactive={true}
              onPlay={() => setIsStarted(true)}
            />
          )
        ) : (
          // No video selected — show placeholder (theme-aware colors)
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'var(--muted)',
              color: 'var(--muted-foreground)',
              fontSize: 14,
            }}
          >
            No video selected
          </div>
        )
      ) : (
        // Loom video — iframe embed or placeholder
        loomEmbedUrl ? (
          <iframe
            src={loomEmbedUrl}
            frameBorder="0"
            allowFullScreen
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              /* Theme-aware placeholder colors for Loom URL prompt */
              backgroundColor: 'var(--muted)',
              color: 'var(--muted-foreground)',
              fontSize: 14,
            }}
          >
            Paste Loom URL
          </div>
        )
      )}
    </div>
  )
}
