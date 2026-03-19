/**
 * /marketing → /marketing/email-templates redirect
 *
 * The /marketing route has no landing page — redirect to the default
 * sub-route so users don't hit a 404.
 */
import { redirect } from 'next/navigation'

export default function MarketingPage() {
  redirect('/marketing/email-templates')
}
