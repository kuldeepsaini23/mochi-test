'use client'

/**
 * ============================================================================
 * WIZARD PREVIEW PANEL — Live Template Preview with Pill-Style Tab Toggle
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: WizardPreviewPanel, WizardPreviewPanelProps,
 * TemplatePreviewPanel
 *
 * WHY: Shows users a realtime preview of how their template will look in both
 * the marketplace grid (card view) and the template detail page. Updates
 * instantly as users fill in metadata in the settings panel.
 *
 * HOW: Pill-style tab toggle matching the form builder pattern (DesignTabToggle
 * in properties-sidebar.tsx). AnimatePresence fade transitions between
 * Marketplace and Details content. Panel fills full height of the left side
 * with no header — sleek edge-to-edge design.
 *
 * COLOR SCHEME: Inherits from parent (dark:bg-sidebar bg-muted via the layout).
 * Tab toggle uses contrasting bg-background colors to pop against the panel bg.
 */

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LayoutGrid, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TemplateCategory } from '@/lib/templates/types'
import { WizardPreviewCard } from './wizard-preview-card'
import { WizardPreviewDetail } from './wizard-preview-detail'

// ============================================================================
// TYPES
// ============================================================================

/** The two available preview tabs */
type PreviewTab = 'marketplace' | 'details'

// ============================================================================
// PROPS
// ============================================================================

export interface WizardPreviewPanelProps {
  /** Template name — live from form */
  name: string
  /** Rich text description — Lexical JSON string */
  description?: string
  /** Thumbnail image URL */
  thumbnailUrl?: string
  /** Selected template category */
  category: TemplateCategory | null
  /** Organization name for display */
  organizationName: string
  /** Tags list */
  tags: string[]
  /** Template version (default 1 for new) */
  version?: number
  /** Price in cents — null or 0 means free (badge shown on card preview) */
  price?: number | null
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Tab configuration — matches the form builder DesignTabToggle pattern.
 * Each tab has an id, label, and icon.
 */
const PREVIEW_TABS: Array<{ id: PreviewTab; label: string; icon: React.ReactNode }> = [
  { id: 'marketplace', label: 'Card', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
  { id: 'details', label: 'Details', icon: <FileText className="h-3.5 w-3.5" /> },
]

/**
 * Framer-motion variants for the tab content fade transition.
 * Short 0.2s opacity fade with mode="wait" for clean enter/exit.
 */
const TAB_CONTENT_VARIANTS = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
} as const

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Left-side preview panel in the template creation wizard.
 * Full-height, no header — sleek top-to-bottom design.
 *
 * 1. "Card" tab — shows the compact marketplace card (WizardPreviewCard)
 *    centered in the panel.
 * 2. "Details" tab — shows the full detail page layout (WizardPreviewDetail)
 *    in a scrollable container.
 *
 * Tab toggle uses the form builder pill-style pattern (DesignTabToggle).
 */
export function WizardPreviewPanel({
  name,
  description,
  thumbnailUrl,
  category,
  organizationName,
  tags,
  version = 1,
  price,
}: WizardPreviewPanelProps) {
  const [activeTab, setActiveTab] = useState<PreviewTab>('marketplace')

  return (
    <div className="flex h-full flex-col">
      {/* Pill-style tab toggle — matches form builder DesignTabToggle */}
      <div className="shrink-0 flex justify-center px-4 pt-5 pb-3">
        <div className="inline-flex rounded-lg bg-foreground/[0.06] dark:bg-muted/50 p-1 gap-0.5">
          {PREVIEW_TABS.map((tab) => {
            const isSelected = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all border-t border-transparent',
                  isSelected
                    ? 'bg-background dark:bg-muted border-t border-transparent dark:border-accent ring-1 ring-border dark:ring-background text-foreground shadow-sm dark:shadow-md'
                    : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] dark:hover:bg-muted/50'
                )}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content area — flex-1 to fill remaining height, scrollable */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'marketplace' ? (
            /**
             * Marketplace tab — card centered both vertically and horizontally.
             * Max width constrained to 220px to match marketplace card sizing.
             */
            <motion.div
              key="marketplace"
              variants={TAB_CONTENT_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2 }}
              className="flex h-full items-center justify-center p-6"
            >
              <div className="w-full max-w-[220px]">
                <WizardPreviewCard
                  name={name}
                  thumbnailUrl={thumbnailUrl}
                  category={category}
                  organizationName={organizationName}
                  tags={tags}
                  price={price}
                />
              </div>
            </motion.div>
          ) : (
            /**
             * Details tab — scrollable container for the full detail preview.
             */
            <motion.div
              key="details"
              variants={TAB_CONTENT_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.2 }}
              className="h-full overflow-y-auto p-6"
            >
              <WizardPreviewDetail
                name={name}
                description={description}
                thumbnailUrl={thumbnailUrl}
                category={category}
                organizationName={organizationName}
                tags={tags}
                version={version}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
