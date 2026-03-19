/**
 * Chat Widget Editor Layout
 *
 * WHY: Override default dashboard layout styling for the editor
 * HOW: Full height container without extra padding/background
 *
 * The parent dashboard layout has bg-background and rounded corners.
 * This editor needs a cleaner, full-bleed layout for the sidebar + preview.
 *
 * SOURCE OF TRUTH: ChatWidgetEditor
 */

export default function ChatWidgetEditorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="h-full w-full">{children}</div>
}
