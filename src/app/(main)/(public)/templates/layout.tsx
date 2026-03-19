/**
 * ============================================================================
 * PUBLIC TEMPLATE LIBRARY — LAYOUT
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: TemplateLibraryPublicLayout
 *
 * WHY: Minimal layout wrapper for the public template routes.
 * Sets background and minimum height for a clean full-page experience.
 */

export default function TemplatesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  )
}
