/**
 * Embed Configuration
 *
 * WHY: Centralized config for chat widget embedding
 * HOW: Validates and provides correct base URL for embed scripts
 *
 * Environment Variables:
 * - NEXT_PUBLIC_EMBED_URL: URL for local/dev testing (e.g., ngrok URL)
 * - NEXT_PUBLIC_APP_URL: Production app URL
 *
 * SOURCE OF TRUTH: EmbedConfig, ChatWidgetEmbed
 */

/**
 * Get the base URL for embedding chat widgets
 *
 * WHY: Ensure consistent URL across embed code display and script generation
 * HOW: Use EMBED_URL in dev, APP_URL in production
 *
 * @throws Error if required env vars are missing
 * @returns The base URL for embed scripts
 */
export function getEmbedBaseUrl(): string {
  // Not production = use NEXT_PUBLIC_EMBED_URL (for ngrok/local testing)
  if (process.env.NODE_ENV !== 'production') {
    const embedUrl = process.env.NEXT_PUBLIC_EMBED_URL
    if (!embedUrl) {
      throw new Error(
        '[Embed Config] NEXT_PUBLIC_EMBED_URL is required in development. ' +
        'Set this to your ngrok URL for testing external embeds.'
      )
    }
    return embedUrl.replace(/\/$/, '')
  }

  // Production = use NEXT_PUBLIC_APP_URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    throw new Error(
      '[Embed Config] NEXT_PUBLIC_APP_URL is required in production. ' +
      'Set this to your app domain.'
    )
  }
  return appUrl.replace(/\/$/, '')
}
