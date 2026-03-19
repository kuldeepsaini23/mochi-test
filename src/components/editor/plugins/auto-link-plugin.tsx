'use client'

/**
 * Auto Link Plugin for Lexical Editor
 *
 * Automatically detects URLs and email addresses and converts them to links.
 *
 * Features:
 * - Detects URLs (http, https, www)
 * - Detects email addresses
 * - Converts text to clickable links automatically
 *
 * SOURCE OF TRUTH: @lexical/link AutoLinkPlugin
 * Keywords: AUTO_LINK, URL_DETECTION, LEXICAL_AUTOLINK
 */

import { AutoLinkPlugin as LexicalAutoLinkPlugin } from '@lexical/react/LexicalAutoLinkPlugin'

// ============================================================================
// URL MATCHERS
// ============================================================================

/**
 * URL regex pattern
 * Matches: http://..., https://..., www....
 */
const URL_REGEX =
  /(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})/

/**
 * Email regex pattern
 * Matches: user@domain.com
 */
const EMAIL_REGEX =
  /(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))/

/**
 * Matchers for auto-link detection
 * WHY: Centralized patterns for consistent URL/email detection
 */
const MATCHERS = [
  /**
   * URL Matcher
   * Detects HTTP(S) URLs and www. prefixed URLs
   */
  (text: string) => {
    const match = URL_REGEX.exec(text)
    if (match === null) return null

    const fullMatch = match[0]
    return {
      index: match.index,
      length: fullMatch.length,
      text: fullMatch,
      url: fullMatch.startsWith('http') ? fullMatch : `https://${fullMatch}`,
    }
  },
  /**
   * Email Matcher
   * Detects email addresses and creates mailto: links
   */
  (text: string) => {
    const match = EMAIL_REGEX.exec(text)
    if (match === null) return null

    const fullMatch = match[0]
    return {
      index: match.index,
      length: fullMatch.length,
      text: fullMatch,
      url: `mailto:${fullMatch}`,
    }
  },
]

// ============================================================================
// PLUGIN EXPORT
// ============================================================================

/**
 * Auto Link Plugin
 * WHY: Automatically converts URLs and emails to clickable links
 *
 * This improves user experience by:
 * - Reducing manual link creation
 * - Making content more interactive
 * - Following user expectations from other editors
 */
export function AutoLinkPlugin() {
  return <LexicalAutoLinkPlugin matchers={MATCHERS} />
}
