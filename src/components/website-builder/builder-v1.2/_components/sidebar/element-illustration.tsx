/**
 * ============================================================================
 * ELEMENT ILLUSTRATION - SVG Icons for Sidebar Elements
 * ============================================================================
 *
 * Provides visual SVG icons for different element types in the sidebar.
 * Uses currentColor for theme compatibility (dark/light mode).
 *
 * SUPPORTED TYPES:
 * - Frames: frame, frame-h (horizontal), frame-v (vertical), frame-grid, circle-frame
 * - Elements: text, image, video, button, icon, form, smartcms-list
 * - Interactive: faq, sticky-note, timer, ecommerce-carousel
 * - Ecommerce: cart, add-to-cart, checkout, payment
 * - Navigation: navbar, sidebar, total-members, logo-carousel
 * - Footer: footer-simple-dark, footer-simple-light, footer-columns-dark, footer-columns-light
 *
 * USAGE:
 * <ElementIllustration type="frame" />
 * ============================================================================
 */

'use client'

interface ElementIllustrationProps {
  /** Type of element to display illustration for */
  type: string
  /** Additional CSS classes */
  className?: string
}

export function ElementIllustration({ type, className = '' }: ElementIllustrationProps) {
  // Base classes applied to all SVGs
  const baseClasses = 'w-full h-full'

  switch (type) {
    // Basic frame container
    case 'frame':
      return (
        <svg viewBox="0 0 120 80" className={`${baseClasses} ${className}`} fill="none" preserveAspectRatio="xMidYMid meet">
          <rect x="10" y="10" width="100" height="60" rx="4" stroke="currentColor" strokeWidth="2" opacity="0.4" />
          <rect x="15" y="15" width="90" height="50" rx="2" fill="currentColor" opacity="0.1" />
        </svg>
      )

    // Circle frame — dashed circle container
    case 'circle-frame':
      return (
        <svg viewBox="0 0 100 100" className={`${baseClasses} ${className}`} fill="none">
          <circle cx="50" cy="50" r="38" stroke="currentColor" strokeWidth="2" strokeDasharray="5 3" opacity="0.4" />
          <circle cx="50" cy="50" r="32" fill="currentColor" opacity="0.08" />
        </svg>
      )

    // Horizontal stacked frame
    case 'frame-h':
      return (
        <svg viewBox="0 0 120 80" className={`${baseClasses} ${className}`} fill="none" preserveAspectRatio="xMidYMid meet">
          <rect x="8" y="10" width="104" height="60" rx="4" stroke="currentColor" strokeWidth="2" opacity="0.4" />
          <rect x="13" y="15" width="28" height="50" rx="2" fill="currentColor" opacity="0.15" />
          <rect x="45" y="15" width="28" height="50" rx="2" fill="currentColor" opacity="0.15" />
          <rect x="77" y="15" width="30" height="50" rx="2" fill="currentColor" opacity="0.15" />
        </svg>
      )

    // Vertical stacked frame
    case 'frame-v':
      return (
        <svg viewBox="0 0 120 80" className={`${baseClasses} ${className}`} fill="none" preserveAspectRatio="xMidYMid meet">
          <rect x="10" y="8" width="100" height="64" rx="4" stroke="currentColor" strokeWidth="2" opacity="0.4" />
          <rect x="15" y="13" width="90" height="14" rx="2" fill="currentColor" opacity="0.15" />
          <rect x="15" y="30" width="90" height="14" rx="2" fill="currentColor" opacity="0.15" />
          <rect x="15" y="47" width="90" height="20" rx="2" fill="currentColor" opacity="0.15" />
        </svg>
      )

    // Grid layout frame
    case 'frame-grid':
      return (
        <svg viewBox="0 0 120 80" className={`${baseClasses} ${className}`} fill="none" preserveAspectRatio="xMidYMid meet">
          <rect x="8" y="8" width="104" height="64" rx="4" stroke="currentColor" strokeWidth="2" opacity="0.4" />
          <rect x="13" y="13" width="28" height="18" rx="2" fill="currentColor" opacity="0.15" />
          <rect x="45" y="13" width="28" height="18" rx="2" fill="currentColor" opacity="0.15" />
          <rect x="77" y="13" width="30" height="18" rx="2" fill="currentColor" opacity="0.15" />
          <rect x="13" y="34" width="28" height="18" rx="2" fill="currentColor" opacity="0.15" />
          <rect x="45" y="34" width="28" height="18" rx="2" fill="currentColor" opacity="0.15" />
          <rect x="77" y="34" width="30" height="18" rx="2" fill="currentColor" opacity="0.15" />
          <rect x="13" y="55" width="28" height="14" rx="2" fill="currentColor" opacity="0.15" />
          <rect x="45" y="55" width="28" height="14" rx="2" fill="currentColor" opacity="0.15" />
          <rect x="77" y="55" width="30" height="14" rx="2" fill="currentColor" opacity="0.15" />
        </svg>
      )

    // Text element with lines
    case 'text':
      return (
        <svg viewBox="0 0 100 100" className={`${baseClasses} ${className}`} fill="none">
          <line x1="20" y1="30" x2="80" y2="30" stroke="currentColor" strokeWidth="3" opacity="0.3" strokeLinecap="round" />
          <line x1="20" y1="45" x2="65" y2="45" stroke="currentColor" strokeWidth="2" opacity="0.2" strokeLinecap="round" />
          <line x1="20" y1="57" x2="75" y2="57" stroke="currentColor" strokeWidth="2" opacity="0.2" strokeLinecap="round" />
          <line x1="20" y1="69" x2="55" y2="69" stroke="currentColor" strokeWidth="2" opacity="0.2" strokeLinecap="round" />
        </svg>
      )

    // Image element with photo icon
    case 'image':
      return (
        <svg viewBox="0 0 100 100" className={`${baseClasses} ${className}`} fill="none">
          <rect x="15" y="15" width="70" height="70" rx="4" stroke="currentColor" strokeWidth="2" opacity="0.4" />
          <circle cx="35" cy="35" r="8" fill="currentColor" opacity="0.2" />
          <path d="M20 70 L35 55 L50 65 L70 45 L85 60 L85 80 L20 80 Z" fill="currentColor" opacity="0.15" />
        </svg>
      )

    // Video element with play button
    case 'video':
      return (
        <svg viewBox="0 0 100 100" className={`${baseClasses} ${className}`} fill="none">
          {/* Video frame */}
          <rect x="15" y="20" width="70" height="45" rx="4" stroke="currentColor" strokeWidth="2" opacity="0.4" />
          <rect x="18" y="23" width="64" height="39" rx="2" fill="currentColor" opacity="0.1" />
          {/* Play button circle */}
          <circle cx="50" cy="42" r="12" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2" strokeOpacity="0.4" />
          {/* Play triangle */}
          <path d="M47 36 L47 48 L56 42 Z" fill="currentColor" opacity="0.4" />
          {/* Progress bar */}
          <rect x="20" y="70" width="60" height="4" rx="2" fill="currentColor" opacity="0.15" />
          <rect x="20" y="70" width="25" height="4" rx="2" fill="currentColor" opacity="0.3" />
        </svg>
      )

    // Button element
    case 'button':
      return (
        <svg viewBox="0 0 100 100" className={`${baseClasses} ${className}`} fill="none">
          <rect x="20" y="35" width="60" height="30" rx="6" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2" strokeOpacity="0.4" />
          <line x1="38" y1="50" x2="62" y2="50" stroke="currentColor" strokeWidth="2" opacity="0.3" strokeLinecap="round" />
        </svg>
      )

    // Add to Cart button element - button with shopping cart icon
    case 'add-to-cart':
      return (
        <svg viewBox="0 0 100 100" className={`${baseClasses} ${className}`} fill="none">
          {/* Button background */}
          <rect x="15" y="35" width="70" height="30" rx="6" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2" strokeOpacity="0.4" />
          {/* Shopping cart icon */}
          <path d="M35 42 L38 42 L42 55 L60 55 L63 45 L40 45" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
          <circle cx="44" cy="60" r="2" fill="currentColor" opacity="0.4" />
          <circle cx="58" cy="60" r="2" fill="currentColor" opacity="0.4" />
          {/* Plus sign */}
          <line x1="67" y1="48" x2="73" y2="48" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
          <line x1="70" y1="45" x2="70" y2="51" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
        </svg>
      )

    // Checkout element - cart summary and payment form
    case 'checkout':
      return (
        <svg viewBox="0 0 100 100" className={`${baseClasses} ${className}`} fill="none">
          {/* Main container */}
          <rect x="10" y="15" width="80" height="70" rx="4" stroke="currentColor" strokeWidth="2" opacity="0.4" />
          {/* Cart section */}
          <rect x="15" y="20" width="35" height="60" rx="2" fill="currentColor" opacity="0.1" />
          {/* Cart items */}
          <rect x="18" y="25" width="29" height="8" rx="1" fill="currentColor" opacity="0.2" />
          <rect x="18" y="36" width="29" height="8" rx="1" fill="currentColor" opacity="0.2" />
          <rect x="18" y="47" width="29" height="8" rx="1" fill="currentColor" opacity="0.2" />
          {/* Total line */}
          <line x1="18" y1="62" x2="47" y2="62" stroke="currentColor" strokeWidth="1" opacity="0.3" />
          <rect x="18" y="66" width="29" height="6" rx="1" fill="currentColor" opacity="0.25" />
          {/* Payment section */}
          <rect x="55" y="20" width="30" height="60" rx="2" fill="currentColor" opacity="0.05" />
          {/* Credit card icon */}
          <rect x="60" y="28" width="20" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
          <line x1="60" y1="34" x2="80" y2="34" stroke="currentColor" strokeWidth="1" opacity="0.3" />
          {/* Pay button */}
          <rect x="58" y="62" width="24" height="10" rx="3" fill="currentColor" opacity="0.3" />
        </svg>
      )

    // Icon element with checkmark
    case 'icon':
      return (
        <svg viewBox="0 0 100 100" className={`${baseClasses} ${className}`} fill="none">
          <circle cx="50" cy="50" r="25" stroke="currentColor" strokeWidth="2" opacity="0.4" />
          <path d="M40 45 L48 53 L62 39" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.3" />
        </svg>
      )

    // SmartCMS List - Dynamic list connected to CMS data
    // Shows a database icon with repeating list items
    case 'smartcms-list':
      return (
        <svg viewBox="0 0 120 80" className={`${baseClasses} ${className}`} fill="none" preserveAspectRatio="xMidYMid meet">
          {/* Container outline */}
          <rect x="8" y="8" width="104" height="64" rx="4" stroke="currentColor" strokeWidth="2" opacity="0.4" />
          {/* Database icon indicator */}
          <ellipse cx="20" cy="18" rx="6" ry="3" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
          <path d="M14 18 v6 a6 3 0 0 0 12 0 v-6" stroke="currentColor" strokeWidth="1.5" opacity="0.5" fill="none" />
          <ellipse cx="20" cy="24" rx="6" ry="3" stroke="currentColor" strokeWidth="1.5" opacity="0.5" fill="none" />
          {/* List items - repeating pattern */}
          <rect x="13" y="32" width="94" height="10" rx="2" fill="currentColor" opacity="0.15" />
          <rect x="13" y="45" width="94" height="10" rx="2" fill="currentColor" opacity="0.12" />
          <rect x="13" y="58" width="94" height="10" rx="2" fill="currentColor" opacity="0.09" />
          {/* Repeat indicator dots */}
          <circle cx="60" cy="37" r="1" fill="currentColor" opacity="0.4" />
          <circle cx="60" cy="50" r="1" fill="currentColor" opacity="0.4" />
          <circle cx="60" cy="63" r="1" fill="currentColor" opacity="0.4" />
        </svg>
      )

    // Form element - Embedded form from Form Builder
    // Shows a form with input fields and submit button
    case 'form':
      return (
        <svg viewBox="0 0 100 100" className={`${baseClasses} ${className}`} fill="none">
          {/* Form container */}
          <rect x="15" y="10" width="70" height="80" rx="4" stroke="currentColor" strokeWidth="2" opacity="0.4" />
          {/* Form title */}
          <rect x="22" y="18" width="35" height="6" rx="1" fill="currentColor" opacity="0.3" />
          {/* Input field 1 - Label */}
          <rect x="22" y="30" width="20" height="3" rx="1" fill="currentColor" opacity="0.2" />
          {/* Input field 1 - Input box */}
          <rect x="22" y="35" width="56" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
          {/* Input field 2 - Label */}
          <rect x="22" y="50" width="25" height="3" rx="1" fill="currentColor" opacity="0.2" />
          {/* Input field 2 - Input box */}
          <rect x="22" y="55" width="56" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
          {/* Submit button */}
          <rect x="22" y="72" width="30" height="10" rx="3" fill="currentColor" opacity="0.2" />
          <rect x="27" y="75" width="20" height="4" rx="1" fill="currentColor" opacity="0.3" />
        </svg>
      )

    // Cart button element - compact cart icon
    case 'cart':
      return (
        <svg viewBox="0 0 100 100" className={`${baseClasses} ${className}`} fill="none">
          {/* Cart icon */}
          <path d="M25 30 L30 30 L40 60 L70 60 L78 38 L35 38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
          {/* Cart wheels */}
          <circle cx="45" cy="70" r="5" stroke="currentColor" strokeWidth="2" opacity="0.3" />
          <circle cx="65" cy="70" r="5" stroke="currentColor" strokeWidth="2" opacity="0.3" />
          {/* Badge/count indicator */}
          <circle cx="72" cy="28" r="8" fill="currentColor" opacity="0.2" />
          <text x="72" y="32" fontSize="10" fill="currentColor" opacity="0.5" textAnchor="middle">3</text>
        </svg>
      )

    // Payment form element - Single product payment embed
    case 'payment':
      return (
        <svg viewBox="0 0 100 100" className={`${baseClasses} ${className}`} fill="none">
          {/* Card outline */}
          <rect x="18" y="20" width="64" height="38" rx="4" stroke="currentColor" strokeWidth="2" opacity="0.4" />
          {/* Magnetic stripe */}
          <rect x="18" y="32" width="64" height="6" fill="currentColor" opacity="0.12" />
          {/* Chip */}
          <rect x="25" y="26" width="10" height="8" rx="1.5" fill="currentColor" opacity="0.2" />
          {/* Pay button */}
          <rect x="25" y="68" width="50" height="12" rx="4" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
          <rect x="37" y="72" width="26" height="4" rx="1" fill="currentColor" opacity="0.25" />
        </svg>
      )

    // Navbar prebuilt illustration - Horizontal nav with logo + links + CTA
    case 'navbar':
    case 'navbar-minimal':
      return (
        <svg viewBox="0 0 120 80" className={`${baseClasses} ${className}`} fill="none" preserveAspectRatio="xMidYMid meet">
          {/* Nav bar background */}
          <rect x="5" y="20" width="110" height="40" rx="4" stroke="currentColor" strokeWidth="2" opacity="0.4" />
          {/* Logo placeholder */}
          <rect x="12" y="30" width="20" height="12" rx="2" fill="currentColor" opacity="0.5" />
          <rect x="14" y="44" width="16" height="3" rx="1" fill="currentColor" opacity="0.2" />
          {/* Nav links */}
          <rect x="44" y="34" width="12" height="5" rx="1" fill="currentColor" opacity="0.25" />
          <rect x="60" y="34" width="12" height="5" rx="1" fill="currentColor" opacity="0.25" />
          <rect x="76" y="34" width="12" height="5" rx="1" fill="currentColor" opacity="0.25" />
          {/* CTA button */}
          <rect x="94" y="30" width="16" height="12" rx="4" fill="currentColor" opacity="0.35" />
        </svg>
      )

    // Sidebar prebuilt illustration - Vertical side nav with content area
    case 'sidebar':
    case 'sidebar-default':
    case 'sidebar-dark':
      return (
        <svg viewBox="0 0 120 80" className={`${baseClasses} ${className}`} fill="none" preserveAspectRatio="xMidYMid meet">
          {/* Outer container */}
          <rect x="5" y="5" width="110" height="70" rx="4" stroke="currentColor" strokeWidth="2" opacity="0.4" />
          {/* Sidebar panel */}
          <rect x="5" y="5" width="30" height="70" rx="4" fill="currentColor" opacity="0.12" />
          {/* Sidebar logo */}
          <rect x="10" y="12" width="18" height="6" rx="1" fill="currentColor" opacity="0.4" />
          {/* Sidebar nav links */}
          <rect x="10" y="24" width="20" height="4" rx="1" fill="currentColor" opacity="0.3" />
          <rect x="10" y="32" width="16" height="4" rx="1" fill="currentColor" opacity="0.2" />
          <rect x="10" y="40" width="18" height="4" rx="1" fill="currentColor" opacity="0.2" />
          <rect x="10" y="48" width="14" height="4" rx="1" fill="currentColor" opacity="0.15" />
          {/* Content area */}
          <rect x="42" y="12" width="66" height="10" rx="2" fill="currentColor" opacity="0.1" />
          <rect x="42" y="28" width="30" height="38" rx="2" fill="currentColor" opacity="0.08" />
          <rect x="76" y="28" width="32" height="38" rx="2" fill="currentColor" opacity="0.08" />
        </svg>
      )

    // Total Members prebuilt illustration - Stacked avatars + count
    case 'total-members':
    case 'total-members-default':
      return (
        <svg viewBox="0 0 120 80" className={`${baseClasses} ${className}`} fill="none" preserveAspectRatio="xMidYMid meet">
          {/* Stacked avatar circles */}
          <circle cx="26" cy="36" r="12" fill="currentColor" opacity="0.25" stroke="currentColor" strokeWidth="2" strokeOpacity="0.15" />
          <circle cx="40" cy="36" r="12" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="2" strokeOpacity="0.15" />
          <circle cx="54" cy="36" r="12" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2" strokeOpacity="0.15" />
          <circle cx="68" cy="36" r="12" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="2" strokeOpacity="0.15" />
          {/* +N badge */}
          <circle cx="82" cy="36" r="12" fill="currentColor" opacity="0.3" />
          <text x="82" y="40" fontSize="10" fill="currentColor" opacity="0.6" textAnchor="middle" fontWeight="600">+5</text>
          {/* Member count text line */}
          <rect x="22" y="56" width="65" height="5" rx="1.5" fill="currentColor" opacity="0.2" />
        </svg>
      )

    // Logo Carousel - Horizontal scrolling logo strip
    // Shows multiple logo placeholders in a horizontal frame
    case 'logo-carousel':
      return (
        <svg viewBox="0 0 120 80" className={`${baseClasses} ${className}`} fill="none" preserveAspectRatio="xMidYMid meet">
          {/* Container with scroll indicator */}
          <rect x="5" y="15" width="110" height="50" rx="4" stroke="currentColor" strokeWidth="2" opacity="0.4" />
          {/* Logo placeholder squares */}
          <rect x="10" y="22" width="22" height="22" rx="3" fill="currentColor" opacity="0.2" />
          <rect x="36" y="22" width="22" height="22" rx="3" fill="currentColor" opacity="0.15" />
          <rect x="62" y="22" width="22" height="22" rx="3" fill="currentColor" opacity="0.12" />
          <rect x="88" y="22" width="22" height="22" rx="3" fill="currentColor" opacity="0.09" />
          {/* Scroll indicator arrows */}
          <path d="M8 40 L3 40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
          <path d="M112 40 L117 40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
          {/* Scroll dots at bottom */}
          <circle cx="50" cy="52" r="1.5" fill="currentColor" opacity="0.4" />
          <circle cx="57" cy="52" r="1.5" fill="currentColor" opacity="0.25" />
          <circle cx="64" cy="52" r="1.5" fill="currentColor" opacity="0.15" />
        </svg>
      )

    // Ecommerce carousel - Featured image with thumbnail row below
    case 'ecommerce-carousel':
      return (
        <svg viewBox="0 0 120 80" className={`${baseClasses} ${className}`} fill="none" preserveAspectRatio="xMidYMid meet">
          {/* Featured image area */}
          <rect x="10" y="6" width="100" height="48" rx="4" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
          <rect x="14" y="10" width="92" height="40" rx="2" fill="currentColor" opacity="0.1" />
          {/* Mountain/image icon inside featured area */}
          <path d="M40 38 L52 24 L60 32 L72 20 L84 38" stroke="currentColor" strokeWidth="1.5" opacity="0.3" fill="none" />
          <circle cx="44" cy="22" r="4" fill="currentColor" opacity="0.2" />
          {/* Thumbnail row */}
          <rect x="10" y="58" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
          <rect x="32" y="58" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1" opacity="0.25" />
          <rect x="54" y="58" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1" opacity="0.25" />
          <rect x="76" y="58" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1" opacity="0.25" />
          {/* +more indicator */}
          <text x="103" y="70" fontSize="8" fill="currentColor" opacity="0.3" textAnchor="middle">+</text>
        </svg>
      )

    // FAQ - Collapsible accordion with question rows and chevrons
    case 'faq':
      return (
        <svg viewBox="0 0 120 80" className={`${baseClasses} ${className}`} fill="none" preserveAspectRatio="xMidYMid meet">
          {/* First item - expanded */}
          <rect x="10" y="6" width="100" height="20" rx="3" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
          <line x1="18" y1="16" x2="60" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
          <path d="M100 13 L103 17 L106 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
          {/* Answer text lines */}
          <line x1="18" y1="32" x2="80" y2="32" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.2" />
          <line x1="18" y1="37" x2="65" y2="37" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.15" />
          {/* Second item - collapsed */}
          <rect x="10" y="44" width="100" height="14" rx="3" stroke="currentColor" strokeWidth="1" opacity="0.3" />
          <line x1="18" y1="51" x2="55" y2="51" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
          <path d="M100 49 L103 52 L106 49" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.25" />
          {/* Third item - collapsed */}
          <rect x="10" y="62" width="100" height="14" rx="3" stroke="currentColor" strokeWidth="1" opacity="0.2" />
          <line x1="18" y1="69" x2="50" y2="69" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
          <path d="M100 67 L103 70 L106 67" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.15" />
        </svg>
      )

    // List — bulleted list with icon dots and text lines
    case 'list':
      return (
        <svg viewBox="0 0 120 80" className={`${baseClasses} ${className}`} fill="none" preserveAspectRatio="xMidYMid meet">
          {/* First item — bullet dot + text line */}
          <circle cx="20" cy="16" r="4" fill="currentColor" opacity="0.5" />
          <line x1="30" y1="16" x2="100" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
          {/* Second item — bullet dot + text line */}
          <circle cx="20" cy="34" r="4" fill="currentColor" opacity="0.4" />
          <line x1="30" y1="34" x2="85" y2="34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
          {/* Third item — bullet dot + text line */}
          <circle cx="20" cy="52" r="4" fill="currentColor" opacity="0.3" />
          <line x1="30" y1="52" x2="92" y2="52" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
          {/* Fourth item — bullet dot + text line */}
          <circle cx="20" cy="70" r="4" fill="currentColor" opacity="0.2" />
          <line x1="30" y1="70" x2="75" y2="70" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.2" />
        </svg>
      )

    // Sticky Note — post-it note with corner curl and text lines
    case 'sticky-note':
      return (
        <svg viewBox="0 0 100 100" className={`${baseClasses} ${className}`} fill="none">
          {/* Note body — slightly rounded rectangle */}
          <rect x="15" y="12" width="70" height="70" rx="2" fill="currentColor" opacity="0.15" />
          {/* Top sticky edge — darker strip simulating the gum strip */}
          <rect x="15" y="12" width="70" height="5" rx="1" fill="currentColor" opacity="0.25" />
          {/* Text lines on the note */}
          <line x1="22" y1="28" x2="68" y2="28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.2" />
          <line x1="22" y1="38" x2="60" y2="38" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.17" />
          <line x1="22" y1="48" x2="52" y2="48" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.13" />
          {/* Corner curl triangle at bottom-right */}
          <path d="M85 62 L85 82 L65 82 Z" fill="currentColor" opacity="0.08" />
          <path d="M85 62 L65 82" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
          {/* Shadow line under the curl */}
          <path d="M63 84 L87 60" stroke="currentColor" strokeWidth="2" opacity="0.08" />
        </svg>
      )

    // Timer / Countdown — digit boxes with colon separators and labels
    case 'timer':
      return (
        <svg viewBox="0 0 120 80" className={`${baseClasses} ${className}`} fill="none" preserveAspectRatio="xMidYMid meet">
          {/* Hours digit box */}
          <rect x="8" y="12" width="22" height="30" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.35" />
          <text x="19" y="33" fontSize="16" fontWeight="700" fill="currentColor" opacity="0.5" textAnchor="middle" fontFamily="monospace">12</text>
          {/* "Hrs" label */}
          <text x="19" y="52" fontSize="6" fill="currentColor" opacity="0.3" textAnchor="middle">HRS</text>

          {/* Colon separator */}
          <circle cx="35" cy="22" r="1.5" fill="currentColor" opacity="0.35" />
          <circle cx="35" cy="30" r="1.5" fill="currentColor" opacity="0.35" />

          {/* Minutes digit box */}
          <rect x="40" y="12" width="22" height="30" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.35" />
          <text x="51" y="33" fontSize="16" fontWeight="700" fill="currentColor" opacity="0.5" textAnchor="middle" fontFamily="monospace">05</text>
          {/* "Min" label */}
          <text x="51" y="52" fontSize="6" fill="currentColor" opacity="0.3" textAnchor="middle">MIN</text>

          {/* Colon separator */}
          <circle cx="67" cy="22" r="1.5" fill="currentColor" opacity="0.35" />
          <circle cx="67" cy="30" r="1.5" fill="currentColor" opacity="0.35" />

          {/* Seconds digit box */}
          <rect x="72" y="12" width="22" height="30" rx="3" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.35" />
          <text x="83" y="33" fontSize="16" fontWeight="700" fill="currentColor" opacity="0.5" textAnchor="middle" fontFamily="monospace">30</text>
          {/* "Sec" label */}
          <text x="83" y="52" fontSize="6" fill="currentColor" opacity="0.3" textAnchor="middle">SEC</text>

          {/* Small clock icon in top-right corner */}
          <circle cx="105" cy="18" r="7" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
          <line x1="105" y1="18" x2="105" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
          <line x1="105" y1="18" x2="108" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />

          {/* Subtle progress bar at bottom — time running down */}
          <rect x="8" y="60" width="86" height="3" rx="1.5" fill="currentColor" opacity="0.1" />
          <rect x="8" y="60" width="52" height="3" rx="1.5" fill="currentColor" opacity="0.25" />
        </svg>
      )

    // Footer Simple — full-width bar with centered copyright text (dark + light share same SVG)
    case 'footer-simple-dark':
    case 'footer-simple-light':
      return (
        <svg viewBox="0 0 120 80" className={`${baseClasses} ${className}`} fill="none" preserveAspectRatio="xMidYMid meet">
          {/* Footer background bar */}
          <rect x="5" y="40" width="110" height="35" rx="4" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
          {/* Centered copyright text line */}
          <rect x="30" y="54" width="60" height="5" rx="1.5" fill="currentColor" opacity="0.3" />
          {/* Small decorative line above */}
          <line x1="45" y1="47" x2="75" y2="47" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.2" />
        </svg>
      )

    // Footer Columns — multi-column footer with links and copyright bar (dark + light share same SVG)
    case 'footer-columns-dark':
    case 'footer-columns-light':
      return (
        <svg viewBox="0 0 120 80" className={`${baseClasses} ${className}`} fill="none" preserveAspectRatio="xMidYMid meet">
          {/* Footer background */}
          <rect x="5" y="8" width="110" height="67" rx="4" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
          {/* Column 1 — Brand */}
          <rect x="10" y="14" width="18" height="5" rx="1" fill="currentColor" opacity="0.4" />
          <rect x="10" y="22" width="22" height="3" rx="1" fill="currentColor" opacity="0.15" />
          <rect x="10" y="27" width="20" height="3" rx="1" fill="currentColor" opacity="0.12" />
          {/* Column 2 — Links */}
          <rect x="40" y="14" width="16" height="4" rx="1" fill="currentColor" opacity="0.35" />
          <rect x="40" y="21" width="14" height="3" rx="1" fill="currentColor" opacity="0.15" />
          <rect x="40" y="26" width="12" height="3" rx="1" fill="currentColor" opacity="0.12" />
          <rect x="40" y="31" width="14" height="3" rx="1" fill="currentColor" opacity="0.1" />
          {/* Column 3 — Links */}
          <rect x="65" y="14" width="16" height="4" rx="1" fill="currentColor" opacity="0.35" />
          <rect x="65" y="21" width="14" height="3" rx="1" fill="currentColor" opacity="0.15" />
          <rect x="65" y="26" width="12" height="3" rx="1" fill="currentColor" opacity="0.12" />
          <rect x="65" y="31" width="14" height="3" rx="1" fill="currentColor" opacity="0.1" />
          {/* Column 4 — Contact */}
          <rect x="90" y="14" width="16" height="4" rx="1" fill="currentColor" opacity="0.35" />
          <rect x="90" y="21" width="18" height="3" rx="1" fill="currentColor" opacity="0.15" />
          <rect x="90" y="26" width="16" height="3" rx="1" fill="currentColor" opacity="0.12" />
          {/* Divider line */}
          <line x1="10" y1="56" x2="110" y2="56" stroke="currentColor" strokeWidth="1" opacity="0.2" />
          {/* Bottom copyright bar */}
          <rect x="10" y="62" width="40" height="4" rx="1" fill="currentColor" opacity="0.2" />
          <rect x="80" y="62" width="30" height="4" rx="1" fill="currentColor" opacity="0.15" />
        </svg>
      )

    // Receipt — Card with checkmark, amount line, item rows
    case 'receipt':
      return (
        <svg viewBox="0 0 100 100" className={`${baseClasses} ${className}`} fill="none">
          {/* Receipt card outline */}
          <rect x="18" y="12" width="64" height="76" rx="4" stroke="currentColor" strokeWidth="2" opacity="0.4" />
          {/* Checkmark circle at top */}
          <circle cx="50" cy="28" r="9" stroke="currentColor" strokeWidth="2" opacity="0.4" />
          <path d="M45 28 L48 31 L55 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
          {/* Amount line (thick) */}
          <rect x="35" y="42" width="30" height="5" rx="1.5" fill="currentColor" opacity="0.3" />
          {/* Date line (thin) */}
          <rect x="38" y="50" width="24" height="3" rx="1" fill="currentColor" opacity="0.15" />
          {/* Divider */}
          <line x1="26" y1="58" x2="74" y2="58" stroke="currentColor" strokeWidth="1" opacity="0.2" />
          {/* Item row 1 */}
          <rect x="26" y="63" width="30" height="4" rx="1" fill="currentColor" opacity="0.2" />
          <rect x="62" y="63" width="12" height="4" rx="1" fill="currentColor" opacity="0.2" />
          {/* Item row 2 */}
          <rect x="26" y="71" width="24" height="4" rx="1" fill="currentColor" opacity="0.15" />
          <rect x="62" y="71" width="12" height="4" rx="1" fill="currentColor" opacity="0.15" />
          {/* Item row 3 */}
          <rect x="26" y="79" width="28" height="4" rx="1" fill="currentColor" opacity="0.1" />
          <rect x="62" y="79" width="12" height="4" rx="1" fill="currentColor" opacity="0.1" />
        </svg>
      )

    // Rich Text — Document icon with heading, paragraph lines, and list bullet
    case 'rich-text':
      return (
        <svg viewBox="0 0 100 100" className={`${baseClasses} ${className}`} fill="none">
          {/* Document outline */}
          <rect x="18" y="12" width="64" height="76" rx="4" stroke="currentColor" strokeWidth="2" opacity="0.4" />
          {/* Heading line — thick and bold to represent H1 */}
          <rect x="26" y="22" width="40" height="6" rx="2" fill="currentColor" opacity="0.4" />
          {/* Paragraph lines — thinner to represent body text */}
          <rect x="26" y="36" width="48" height="3" rx="1" fill="currentColor" opacity="0.2" />
          <rect x="26" y="43" width="44" height="3" rx="1" fill="currentColor" opacity="0.2" />
          <rect x="26" y="50" width="38" height="3" rx="1" fill="currentColor" opacity="0.15" />
          {/* List bullet + line — represents formatting */}
          <circle cx="30" cy="62" r="2" fill="currentColor" opacity="0.3" />
          <rect x="36" y="60" width="32" height="3" rx="1" fill="currentColor" opacity="0.2" />
          {/* Another bullet */}
          <circle cx="30" cy="72" r="2" fill="currentColor" opacity="0.25" />
          <rect x="36" y="70" width="28" height="3" rx="1" fill="currentColor" opacity="0.15" />
        </svg>
      )

    // Default fallback
    default:
      return (
        <svg viewBox="0 0 100 100" className={`${baseClasses} ${className}`} fill="none">
          <rect x="20" y="20" width="60" height="60" rx="4" stroke="currentColor" strokeWidth="2" opacity="0.3" />
        </svg>
      )
  }
}
