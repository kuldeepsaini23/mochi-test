/**
 * ============================================================================
 * UNIFIED PREBUILT TOTAL MEMBERS - Single Component for Canvas + Preview
 * ============================================================================
 *
 * SOURCE OF TRUTH: UnifiedPrebuiltTotalMembers, unified-prebuilt-total-members,
 * total-members-unified, prebuilt-total-members-unified
 *
 * This component replaces BOTH:
 *   - prebuilt-elements/prebuilt-total-members.tsx (canvas editor)
 *   - renderers/page-renderer/prebuilt-totalmembers-renderer.tsx (preview/published)
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * The component renders a social proof element: stacked avatar images with a
 * customizable message showing community/member count.
 *
 * CANVAS MODE (mode='canvas'):
 *   - Returns CONTENT ONLY (avatar stack + message text)
 *   - The parent ElementWrapper handles all editor chrome:
 *     selection ring, hover ring, resize handles, labels, drag handlers
 *   - No pointer events or interaction handlers needed
 *
 * PREVIEW MODE (mode='preview'):
 *   - Returns a SELF-CONTAINED wrapper with position/size styles
 *   - Uses computeElementPositionStyles() and useElementSizeStyles()
 *   - No interactive behavior (this is a static display element)
 *
 * ============================================================================
 * WHY THIS IS SIMPLE
 * ============================================================================
 *
 * Unlike navbar or sidebar prebuilts, total-members renders IDENTICAL visual
 * output in both modes. There are no links, buttons, mobile menus, or state.
 * The only difference is the outer wrapper (canvas has none, preview has one).
 *
 * ============================================================================
 * CUSTOMIZABLE SETTINGS
 * ============================================================================
 *
 * - message: Display text (e.g., "7000+ prodigies worldwide")
 * - textColor: Color of the message text (default: '#ffffff')
 * - fontSize: Font size in pixels (default: 16)
 * - fontWeight: Font weight (default: 500)
 * - avatarBorderColor: Border ring color for avatar cutout effect (default: '#000000')
 *
 * Avatar images are HARDCODED Unsplash profile pictures (not user-editable).
 *
 * ============================================================================
 */

'use client'

import React, { memo } from 'react'
import type { PreBuiltTotalMembersElement } from '../../_lib/prebuilt'
import { useRenderMode } from '../../_lib/render-mode-context'
import {
  computeElementPositionStyles,
  /** useElementSizeStyles replaces computeElementSizeStyles — reads ParentFlexDirectionContext automatically */
  useElementSizeStyles,
} from '../../_lib/shared-element-styles'

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Hardcoded avatar images for the social proof display.
 * These are 5 diverse profile pictures from Unsplash, cropped to face.
 * NOT user-editable -- keeps the component simple and consistent.
 */
const AVATAR_IMAGES = [
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face',
]

/**
 * Avatar diameter in pixels. Each avatar circle is this size.
 */
const AVATAR_SIZE = 36

/**
 * Negative margin for avatar overlap. Applied to all avatars except the first.
 * Creates the stacked/overlapping effect.
 */
const AVATAR_OVERLAP = -12

/**
 * Border width around each avatar in pixels.
 * Creates the "cutout" ring effect separating stacked avatars.
 */
const AVATAR_BORDER_WIDTH = 2

/**
 * Gap between the avatar stack and the message text in pixels.
 */
const CONTENT_GAP = 12

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the UnifiedPrebuiltTotalMembers component.
 *
 * SOURCE OF TRUTH: UnifiedPrebuiltTotalMembersProps
 *
 * Only requires the element data. Mode detection is handled internally
 * via useRenderMode() -- never passed as a prop.
 */
interface UnifiedPrebuiltTotalMembersProps {
  /** The total members prebuilt element data.
   * SOURCE OF TRUTH: PreBuiltTotalMembersElement from _lib/prebuilt/types.ts */
  element: PreBuiltTotalMembersElement
}

// ============================================================================
// AVATAR STACK - Reusable sub-component for the stacked avatar images
// ============================================================================

/**
 * Renders the stacked avatar images with overlap effect.
 *
 * Each avatar is a circular image with a colored border ring that creates
 * a "cutout" appearance when avatars overlap. The stacking order goes
 * left-to-right: the rightmost avatar renders on top (highest z-index).
 *
 * The border color is configurable via the avatarBorderColor setting,
 * typically matching the background color for a seamless cutout look.
 */
function AvatarStack({ borderColor }: { borderColor: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      {AVATAR_IMAGES.map((src, index) => (
        <div
          key={index}
          style={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            borderRadius: '50%',
            overflow: 'hidden',
            /* Negative margin creates the overlap. First avatar has no offset. */
            marginLeft: index === 0 ? 0 : AVATAR_OVERLAP,
            /* Border ring creates the cutout separation between stacked avatars */
            border: `${AVATAR_BORDER_WIDTH}px solid ${borderColor}`,
            /* Later avatars (higher index) render on top of earlier ones */
            zIndex: index,
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <img
            src={src}
            alt={`Member ${index + 1}`}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Unified PreBuilt Total Members component.
 *
 * Renders a social proof element with stacked avatar images and a customizable
 * message in both canvas and preview modes. This is the simplest prebuilt
 * element because:
 *
 * 1. Visual output is IDENTICAL in both modes (no interactive differences)
 * 2. No links, buttons, or stateful behavior
 * 3. Only the outer wrapper differs between modes
 *
 * Canvas mode: Returns content directly (ElementWrapper handles chrome)
 * Preview mode: Wraps content in a positioned div for page layout
 */
export const UnifiedPrebuiltTotalMembers = memo(function UnifiedPrebuiltTotalMembers({
  element,
}: UnifiedPrebuiltTotalMembersProps) {
  /**
   * Get the current rendering mode from context.
   * Canvas mode = inside the builder editor (ElementWrapper provides chrome).
   * Preview mode = published site or preview panel (self-contained positioning).
   */
  const { mode, breakpoint } = useRenderMode()
  const isPreview = mode === 'preview'

  const { settings, styles } = element

  /**
   * Extract customizable settings with defaults.
   * SOURCE OF TRUTH: TotalMembersSettings from _lib/prebuilt/types.ts
   */
  const avatarBorderColor = settings.avatarBorderColor || '#000000'
  const textColor = settings.textColor || '#ffffff'
  const fontSize = settings.fontSize || 16
  const fontWeight = settings.fontWeight || 500

  // ==========================================================================
  // SHARED CONTENT - Identical rendering for both canvas and preview modes
  // ==========================================================================

  /**
   * The shared visual content: avatar stack + message text.
   * This is the core rendering that is the same regardless of mode.
   *
   * Layout: horizontal flex with [AvatarStack] [MessageText]
   * The flex container is set to fit-content width to wrap tightly
   * around the avatars and text rather than stretching.
   */
  const content = (
    <>
      {/* Avatar Stack -- 5 overlapping circular profile images */}
      <AvatarStack borderColor={avatarBorderColor} />

      {/* Message Text -- customizable social proof message */}
      <span
        style={{
          color: textColor,
          fontSize,
          fontWeight,
          whiteSpace: 'nowrap',
          /* Prevent text selection and click-through in both modes.
           * In canvas mode, ElementWrapper handles pointer events for drag.
           * In preview mode, this is a static display element. */
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      >
        {settings.message}
      </span>
    </>
  )

  /**
   * Shared inner styles for the content container.
   * These flex styles create the horizontal avatar + text layout
   * and are identical in both modes.
   */
  const contentContainerStyles: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: CONTENT_GAP,
    /* Apply user-configured styles (padding, background, border-radius, etc.) */
    ...styles,
  }

  // ==========================================================================
  // CANVAS MODE -- Return content only (ElementWrapper handles chrome)
  // ==========================================================================

  /**
   * In canvas mode, we return ONLY the visual content.
   * The parent ElementWrapper component handles:
   *   - Selection ring and hover ring
   *   - Resize handles
   *   - Element name labels
   *   - Drag and hover pointer events
   *   - Position and size styling
   *
   * We use a plain div with flex layout to arrange avatars + text.
   */
  if (!isPreview) {
    return (
      <div
        data-element-content={element.id}
        data-prebuilt-type="total-members"
        style={contentContainerStyles}
      >
        {content}
      </div>
    )
  }

  // ==========================================================================
  // PREVIEW MODE -- Self-contained wrapper with position/size styles
  // ==========================================================================

  /**
   * In preview mode, each element is responsible for its own positioning
   * within the page layout. We compute position and size styles using the
   * shared utilities that are the SINGLE SOURCE OF TRUTH for element layout.
   */
  const isRoot = element.parentId === null
  const positionStyles = computeElementPositionStyles(element, isRoot, breakpoint)
  const sizeStyles = useElementSizeStyles(element, breakpoint, {
    /* Total members uses fit-content sizing by default:
     * autoWidth=false means we use the element's explicit width,
     * but the content container uses fit-content to wrap tightly. */
    autoWidthDefault: false,
    autoHeightDefault: false,
  })

  return (
    <div
      data-element-id={element.id}
      data-prebuilt-type="total-members"
      style={{
        ...positionStyles,
        ...sizeStyles,
        /* Visibility -- hidden elements are removed from published view */
        visibility: element.visible ? undefined : 'hidden',
      }}
    >
      {/* Inner content container with flex layout and user styles */}
      <div style={contentContainerStyles}>
        {content}
      </div>
    </div>
  )
})

// ============================================================================
// EXPORTS
// ============================================================================

export type { UnifiedPrebuiltTotalMembersProps }
