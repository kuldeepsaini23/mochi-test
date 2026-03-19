/**
 * /sites → /sites/websites redirect
 *
 * The /sites route has no landing page — it's just a parent for sub-routes
 * (websites, forms, stores, cms, chat-widgets). Redirect to the default
 * sub-route so users don't hit a 404.
 */
import { redirect } from 'next/navigation'

export default function SitesPage() {
  redirect('/sites/websites')
}
