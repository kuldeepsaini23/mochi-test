'use client'

/**
 * Powered by Mochi Badge — Branding badge for published websites
 *
 * SOURCE OF TRUTH KEYWORDS: PoweredByBadge, MochiBranding, CustomBrandingBadge
 *
 * WHY: When `custom_branding` is disabled (free tier), we show a subtle "Powered by Mochi"
 * badge on published websites. This encourages upgrades while being minimally invasive.
 *
 * DESIGN:
 * - Desktop: Fixed bottom-left corner, subtle text with hover effect
 * - Mobile: Fixed right side, small vertical handlebar badge saying "Mochi"
 *
 * HOW: This is a client component for hover interactions. The server-side check for
 * `custom_branding` happens in the page component — this only renders when needed.
 */

const PLATFORM_URL = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
  : 'https://mochi.com'

/**
 * PoweredByBadge — Shows "Powered by Mochi" on published websites for free tier users
 *
 * RESPONSIVE BEHAVIOR:
 * - Desktop (md+): Bottom-left corner, horizontal "Powered by Mochi" text
 * - Mobile (<md): Right edge, vertical handlebar badge with "Mochi" text
 */
export function PoweredByBadge() {
  return (
    <>
      {/* Desktop: Bottom-left subtle badge */}
      <a
        href={PLATFORM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="hidden md:flex fixed bottom-4 left-4 z-[9999] items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm text-white/80 text-[11px] font-medium tracking-wide transition-all duration-200 hover:bg-black/80 hover:text-white hover:scale-105 no-underline"
        style={{ textDecoration: 'none' }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-70"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
        Powered by Mochi
      </a>

      {/* Mobile: Right-side handlebar badge — minimal and non-invasive */}
      <a
        href={PLATFORM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="md:hidden fixed right-0 top-1/2 -translate-y-1/2 z-[9999] flex items-center no-underline"
        style={{ textDecoration: 'none' }}
      >
        <div className="bg-black/50 backdrop-blur-sm text-white/80 text-[9px] font-semibold tracking-widest uppercase py-3 px-1.5 rounded-l-md transition-all duration-200 active:bg-black/70"
          style={{
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
          }}
        >
          Mochi
        </div>
      </a>
    </>
  )
}
