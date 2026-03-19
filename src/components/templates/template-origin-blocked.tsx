/**
 * ============================================================================
 * TEMPLATE LIBRARY — ORIGIN BLOCKED ALERT
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: TemplateOriginBlocked, AntiPlagiarismAlert
 *
 * WHY: Shown when a user tries to create a template from a feature that was
 * itself installed from another template. This prevents re-publishing of
 * installed content (anti-plagiarism protection).
 *
 * HOW: A warning alert banner with an icon and message explaining why the
 * feature cannot be published as a template. Optionally links to the source.
 */

'use client'

import { AlertTriangle } from 'lucide-react'

// ============================================================================
// PROPS
// ============================================================================

interface TemplateOriginBlockedProps {
  /** Name of the original template this feature was installed from */
  templateName: string
  /** Optional callback when clicking the source template link */
  onViewSource?: () => void
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Warning banner displayed when a feature has an origin marker (was installed
 * from a template) and therefore cannot be re-published.
 *
 * Shown in the create wizard's Step 1 when the origin check returns positive.
 */
export function TemplateOriginBlocked({
  templateName,
  onViewSource,
}: TemplateOriginBlockedProps) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
      <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-600 mt-0.5" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-yellow-700">
          Cannot create template from installed content
        </p>
        <p className="text-xs text-yellow-600/80">
          This item was installed from the template &ldquo;{templateName}&rdquo; and cannot
          be re-published as a new template. This protects the original creator&apos;s work.
        </p>
        {onViewSource && (
          <button
            onClick={onViewSource}
            className="text-xs text-yellow-700 underline underline-offset-2 hover:text-yellow-800"
          >
            View source template
          </button>
        )}
      </div>
    </div>
  )
}
