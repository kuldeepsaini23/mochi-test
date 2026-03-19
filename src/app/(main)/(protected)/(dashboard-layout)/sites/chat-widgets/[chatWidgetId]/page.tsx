/**
 * Chat Widget Editor Page - Blazing Fast Navigation with Client-Side Caching
 *
 * WHY: Minimal server component that only renders the client component
 * HOW: All data fetching and permission checks are done client-side with
 *      aggressive caching for instant navigation
 *
 * ARCHITECTURE:
 * - Server component = only extracts chatWidgetId from params (instant page load)
 * - Client component handles all data fetching with React Query caching
 * - Organizations are cached indefinitely for blazing fast access
 *
 * SOURCE OF TRUTH: ChatWidget, Organization
 */

import { ChatWidgetEditor } from './_components/chat-widget-editor'

interface ChatWidgetEditorPageProps {
  params: Promise<{
    chatWidgetId: string
  }>
}

export default async function ChatWidgetEditorPage({
  params,
}: ChatWidgetEditorPageProps) {
  const { chatWidgetId } = await params
  return <ChatWidgetEditor chatWidgetId={chatWidgetId} />
}
