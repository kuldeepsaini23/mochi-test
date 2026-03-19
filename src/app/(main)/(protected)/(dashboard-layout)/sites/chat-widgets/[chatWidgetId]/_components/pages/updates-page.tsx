'use client'

/**
 * Updates Page Component
 *
 * WHY: Show product updates and announcements in the chat widget
 * HOW: Card-style list with large featured image, title, and description
 *      Click to expand for full Lexical content
 *      Controlled by parent - parent manages selected update state
 *
 * SOURCE OF TRUTH: ChatWidgetPreview, ChatWidgetThemeContext
 */

import Image from 'next/image'
import { AnimatePresence, motion } from 'framer-motion'
import { ContentPreview, RichTextEditor } from '@/components/editor'
import type { ChatWidgetThemeColors, UpdateItem } from '../chat-widget-theme-context'

// ============================================================================
// ANIMATION VARIANTS
// Same as parent page transitions for consistency
// ============================================================================

const pageVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 20 : -20,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -20 : 20,
    opacity: 0,
  }),
}

// ============================================================================
// TYPES
// ============================================================================

interface UpdatesPageProps {
  /** Theme colors from context */
  theme: ChatWidgetThemeColors
  /** List of updates to display */
  updates: UpdateItem[]
  /** Currently selected update (controlled by parent) */
  selectedUpdate: UpdateItem | null
  /** Called when user selects/deselects an update */
  onSelectUpdate: (update: UpdateItem | null) => void
}

// ============================================================================
// UPDATE CARD
// ============================================================================

interface UpdateCardProps {
  update: UpdateItem
  theme: ChatWidgetThemeColors
  onClick: () => void
}

/**
 * Derive a readable link color based on widget theme mode.
 *
 * WHY: The widget's accent color is designed for button backgrounds (e.g. #2a2a2a),
 * NOT for text. Using it as link text color makes links unreadable — especially in
 * dark mode where #2a2a2a is invisible against #171717 background. Standard blue
 * provides universal link recognition and guaranteed readability on any background.
 */
function getLinkColor(mode: string): string {
  return mode === 'dark' ? '#60a5fa' : '#2563eb'
}

/**
 * Card-style update item matching the reference design
 * Large image on top, category/date, title, description
 */
function UpdateCard({ update, theme, onClick }: UpdateCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-xl overflow-hidden border"
      style={{ backgroundColor: theme.secondaryBackground, borderColor: theme.border }}
    >
      {/* Featured image - large, takes full width */}
      {update.featuredImage ? (
        <div className="relative w-full aspect-16/6">
          <Image
            src={update.featuredImage}
            alt=""
            fill
            className="object-cover"
          />
        </div>
      ) : (
        <div
          className="w-full aspect-16/6"
          style={{ backgroundColor: theme.border }}
        />
      )}

      {/* Content area */}
      <div className="p-4">
        {/* Category/Label + Date */}
        <div
          className="flex items-center gap-2 text-xs mb-2"
          style={{ color: theme.secondaryText }}
        >
          <span>Update</span>
          <span>•</span>
          <span>{update.createdAt.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
          })}</span>
        </div>

        {/* Title */}
        <h3
          className="font-semibold text-base leading-tight line-clamp-2"
          style={{ color: theme.primaryText }}
        >
          {update.title}
        </h3>

        {/* Description preview - uses ContentPreview for Lexical content
            CSS variable overrides: Lexical uses shadcn classes (text-foreground,
            text-muted-foreground, etc.) which resolve to the app's global CSS vars.
            We override them here so the preview text matches the widget theme. */}
        {update.content && (
          <div
            className="mt-2"
            style={{
              '--foreground': theme.primaryText,
              '--muted-foreground': theme.secondaryText,
              '--primary': getLinkColor(theme.mode),
            } as React.CSSProperties}
          >
            <ContentPreview
              content={update.content}
              maxHeight={100}
              className="text-sm opacity-80"
            />
          </div>
        )}
      </div>
    </button>
  )
}

// ============================================================================
// UPDATE DETAIL VIEW (no header - parent handles it)
// ============================================================================

interface UpdateDetailProps {
  update: UpdateItem
  theme: ChatWidgetThemeColors
}

/**
 * Full detail view - renders the complete post using the real Lexical editor
 * in read-only mode for proper styling, links, and full content display
 */
function UpdateDetail({ update, theme }: UpdateDetailProps) {
  return (
    <>
      {update.featuredImage && (
        <div className="relative w-full aspect-16/10">
          <Image src={update.featuredImage} alt="" fill className="object-cover" />
        </div>
      )}
      <div className="p-4">
        <p className="text-xs mb-2" style={{ color: theme.secondaryText }}>
          {update.createdAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>
        <h2 className="text-lg font-semibold leading-tight mb-4" style={{ color: theme.primaryText }}>
          {update.title}
        </h2>
        {/* CSS variable overrides for Lexical editor: The RichTextEditor uses shadcn
            Tailwind classes (text-foreground, text-muted-foreground, bg-muted, etc.)
            which resolve to the app's global CSS variables. We override them at this
            wrapper level so all Lexical text/elements inherit the widget theme colors
            instead of the app's dark/light mode colors. */}
        {update.content && (
          <div
            style={{
              '--foreground': theme.primaryText,
              '--muted-foreground': theme.secondaryText,
              '--primary': getLinkColor(theme.mode),
              '--muted': theme.secondaryBackground,
              '--border': theme.border,
              '--background': theme.background,
            } as React.CSSProperties}
          >
            <RichTextEditor
              initialContent={update.content}
              readOnly
              className="text-sm !bg-transparent"
              contentClassName="min-h-0"
            />
          </div>
        )}
      </div>
    </>
  )
}

// ============================================================================
// UPDATES LIST VIEW
// ============================================================================

interface UpdatesListProps {
  updates: UpdateItem[]
  theme: ChatWidgetThemeColors
  onSelect: (update: UpdateItem) => void
}

function UpdatesList({ updates, theme, onSelect }: UpdatesListProps) {
  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {updates.map((update) => (
        <UpdateCard
          key={update.id}
          update={update}
          theme={theme}
          onClick={() => onSelect(update)}
        />
      ))}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function UpdatesPage({ theme, updates, selectedUpdate, onSelectUpdate }: UpdatesPageProps) {
  // Show empty state if no updates
  if (updates.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <p className="text-sm" style={{ color: theme.secondaryText }}>
          No updates yet
        </p>
      </div>
    )
  }

  // Direction: 1 = forward (list -> detail), -1 = backward (detail -> list)
  const direction = selectedUpdate ? 1 : -1

  return (
    <div className="h-full relative overflow-hidden">
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        {selectedUpdate ? (
          <motion.div
            key="detail"
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="absolute inset-0 overflow-y-auto"
          >
            <UpdateDetail update={selectedUpdate} theme={theme} />
          </motion.div>
        ) : (
          <motion.div
            key="list"
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="absolute inset-0"
          >
            <UpdatesList updates={updates} theme={theme} onSelect={onSelectUpdate} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
