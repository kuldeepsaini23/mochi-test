'use client'

/**
 * ELEMENT SIDEBAR COMPONENT
 *
 * Left panel with two tabs:
 * - Elements: Basic building blocks with simple icon tiles
 * - Blocks: Pre-built reusable components with beautiful illustrated previews
 *
 * The Blocks tab features stunning pre-designed templates organized into
 * categories like Heroes, Testimonials, Features, CTAs, etc. Each category
 * can be expanded to reveal multiple stunning variants with visual illustrations.
 *
 * SOURCE OF TRUTH KEYWORDS: ElementSidebar, BlockPalette, BlockCategories
 */

import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import {
  LayoutGrid,
  Quote,
  Mail,
  Users,
  Star,
  BarChart3,
  FileText,
  CreditCard,
  ShoppingBag,
  Bell,
  Sparkles,
  Minus,
  Heading1,
  Type,
  MousePointerClick,
  Image,
  List,
  Columns2,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { BLOCK_CATEGORIES, type TemplateVariant } from '../_lib/block-templates'
import type { EmailBlockType } from '@/types/email-templates'

// ============================================================================
// ICON MAPPING
// ============================================================================

/**
 * Map icon string names to actual Lucide icon components.
 * This allows the block-templates.ts to use string identifiers
 * while we render the actual icons here.
 */
const ICON_MAP: Record<string, LucideIcon> = {
  LayoutGrid,
  Quote,
  Star,
  MousePointerClick: LayoutGrid,
  Mail,
  BarChart3,
  FileText,
  CreditCard,
  ShoppingBag,
  Bell,
  Users,
  Sparkles,
  Minus,
  Timer,
}

// ============================================================================
// ELEMENT ICON MAPPING
// ============================================================================

/**
 * Map of element types to their Lucide icons.
 * Simple icon representation for each basic element type.
 */
const ELEMENT_ICONS: Record<EmailBlockType, LucideIcon> = {
  heading: Heading1,
  text: Type,
  button: MousePointerClick,
  image: Image,
  list: List,
  columns: Columns2,
  divider: Minus,
  spacer: Minus,
  'pricing-card': CreditCard,
  'testimonial-card': Quote,
  'feature-card': Star,
  'stats-card': BarChart3,
  'alert-card': Bell,
  'countdown-timer': Timer,
  'social-proof': Users,
}

// ============================================================================
// BLOCK TEMPLATE ILLUSTRATIONS
// These are 1:1 visual representations of the actual email templates
// Clean, professional, minimal designs using muted grays with dark accents
// ============================================================================

/**
 * Hero Centered - Image + Heading + Text + Button (centered)
 */
function HeroCenteredIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-2 flex flex-col gap-1.5">
      <div className="w-full h-6 rounded bg-muted/50 flex items-center justify-center">
        <svg className="w-3 h-2.5 text-muted-foreground/30" viewBox="0 0 24 18" fill="currentColor">
          <path d="M4 16l4-5 3 3 5-7 4 9H4z" />
        </svg>
      </div>
      <div className="h-1 w-4/5 mx-auto rounded-full bg-muted-foreground/40" />
      <div className="space-y-0.5">
        <div className="h-0.5 w-full rounded-full bg-muted-foreground/20" />
        <div className="h-0.5 w-5/6 mx-auto rounded-full bg-muted-foreground/15" />
      </div>
      <div className="h-2 w-1/2 mx-auto rounded bg-muted-foreground/70" />
    </div>
  )
}

/**
 * Hero Split - Two columns: text left, image right
 */
function HeroSplitIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-1.5 flex gap-1.5">
      <div className="flex-1 flex flex-col justify-center gap-1">
        <div className="h-1 w-4/5 rounded-full bg-muted-foreground/40" />
        <div className="h-0.5 w-full rounded-full bg-muted-foreground/20" />
        <div className="h-0.5 w-3/4 rounded-full bg-muted-foreground/15" />
        <div className="h-1.5 w-1/2 rounded bg-muted-foreground/70 mt-0.5" />
      </div>
      <div className="w-2/5 h-12 rounded bg-muted/50 flex items-center justify-center">
        <svg className="w-3 h-2.5 text-muted-foreground/30" viewBox="0 0 24 18" fill="currentColor">
          <path d="M4 16l4-5 3 3 5-7 4 9H4z" />
        </svg>
      </div>
    </div>
  )
}

/**
 * Hero Minimal - Bold heading + subtext + button (no image)
 */
function HeroMinimalIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-3 flex flex-col items-center justify-center gap-1.5">
      <div className="h-1.5 w-4/5 rounded-full bg-muted-foreground/45" />
      <div className="h-0.5 w-3/5 rounded-full bg-muted-foreground/20" />
      <div className="h-2 w-2/5 rounded-full bg-muted-foreground/70 mt-1" />
    </div>
  )
}

/**
 * Hero Social Proof - Avatar stack + number + text
 */
function HeroSocialProofIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-2 flex flex-col items-center gap-1">
      <div className="h-1 w-3/5 rounded-full bg-muted-foreground/40" />
      <div className="h-0.5 w-2/5 rounded-full bg-muted-foreground/20" />
      <div className="flex -space-x-1 my-1">
        <div className="w-3 h-3 rounded-full bg-muted-foreground/30 border border-background" />
        <div className="w-3 h-3 rounded-full bg-muted-foreground/25 border border-background" />
        <div className="w-3 h-3 rounded-full bg-muted-foreground/20 border border-background" />
      </div>
      <div className="h-0.5 w-3/5 rounded-full bg-muted-foreground/15" />
      <div className="h-2 w-1/2 rounded bg-muted-foreground/70" />
    </div>
  )
}

/**
 * Testimonial Quote Card - Large quotes + text + avatar + name
 */
function TestimonialQuoteCardIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 bg-muted/30 p-2 flex flex-col">
      <svg className="w-3 h-3 text-muted-foreground/30 mb-1" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z" />
      </svg>
      <div className="space-y-0.5 flex-1 mb-2">
        <div className="h-0.5 w-full rounded-full bg-muted-foreground/25" />
        <div className="h-0.5 w-4/5 rounded-full bg-muted-foreground/20" />
      </div>
      <div className="flex items-center gap-1.5 pt-1.5 border-t border-border/30">
        <div className="w-4 h-4 rounded-full bg-muted-foreground/25" />
        <div className="flex-1">
          <div className="h-0.5 w-2/3 rounded-full bg-muted-foreground/35 mb-0.5" />
          <div className="h-0.5 w-1/2 rounded-full bg-muted-foreground/20" />
        </div>
      </div>
    </div>
  )
}

/**
 * Testimonial Avatar Stack - Overlapping avatars + "7000+" text
 */
function TestimonialAvatarStackIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-2 flex items-center gap-2">
      <div className="flex -space-x-1.5">
        <div className="w-4 h-4 rounded-full bg-muted-foreground/30 border-2 border-background" />
        <div className="w-4 h-4 rounded-full bg-muted-foreground/25 border-2 border-background" />
        <div className="w-4 h-4 rounded-full bg-muted-foreground/20 border-2 border-background" />
      </div>
      <div className="flex-1">
        <div className="h-1 w-1/2 rounded-full bg-muted-foreground/40 mb-0.5" />
        <div className="h-0.5 w-3/4 rounded-full bg-muted-foreground/20" />
      </div>
    </div>
  )
}

/**
 * Testimonial Twitter - Tweet-style with avatar + handle + text
 */
function TestimonialTwitterIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-2 flex gap-1.5">
      <div className="w-5 h-5 rounded-full bg-muted-foreground/25 shrink-0" />
      <div className="flex-1 space-y-0.5">
        <div className="flex items-center gap-1">
          <div className="h-0.5 w-1/3 rounded-full bg-muted-foreground/35" />
          <div className="h-0.5 w-1/4 rounded-full bg-muted-foreground/15" />
        </div>
        <div className="h-0.5 w-full rounded-full bg-muted-foreground/20" />
        <div className="h-0.5 w-4/5 rounded-full bg-muted-foreground/15" />
        <div className="h-0.5 w-1/3 rounded-full bg-muted-foreground/20 mt-1" />
      </div>
    </div>
  )
}

/**
 * Testimonial Spotlight - Large avatar + quote + name
 */
function TestimonialSpotlightIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-2 flex flex-col items-center gap-1">
      <div className="w-6 h-6 rounded-full bg-muted-foreground/25" />
      <div className="space-y-0.5 w-full text-center">
        <div className="h-0.5 w-4/5 mx-auto rounded-full bg-muted-foreground/20" />
        <div className="h-0.5 w-3/5 mx-auto rounded-full bg-muted-foreground/15" />
      </div>
      <div className="h-0.5 w-1/3 rounded-full bg-muted-foreground/35" />
      <div className="h-0.5 w-1/4 rounded-full bg-muted-foreground/20" />
    </div>
  )
}

/**
 * Features Checklist - Heading + checkmarks with text
 */
function FeaturesChecklistIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-2 flex flex-col">
      <div className="h-1 w-3/5 mx-auto rounded-full bg-muted-foreground/40 mb-1.5" />
      <div className="space-y-1">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 shrink-0" />
            <div className="h-0.5 flex-1 rounded-full bg-muted-foreground/20" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Features Grid - 2x2 with icons + titles
 */
function FeaturesGridIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-1.5">
      <div className="h-0.5 w-1/2 mx-auto rounded-full bg-muted-foreground/40 mb-1" />
      <div className="grid grid-cols-2 gap-1">
        {['⚡', '🔒', '🎯', '📊'].map((emoji, i) => (
          <div key={i} className="p-1 flex flex-col items-center">
            <span className="text-[6px]">{emoji}</span>
            <div className="h-0.5 w-3/4 rounded-full bg-muted-foreground/25 mt-0.5" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Features Steps - Numbered 1, 2, 3 steps
 */
function FeaturesStepsIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-2 flex flex-col gap-1">
      <div className="h-0.5 w-1/2 mx-auto rounded-full bg-muted-foreground/40 mb-1" />
      {[1, 2, 3].map((num) => (
        <div key={num} className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-muted-foreground/30 flex items-center justify-center text-[5px] text-muted-foreground font-bold shrink-0">
            {num}
          </div>
          <div className="h-0.5 flex-1 rounded-full bg-muted-foreground/20" />
        </div>
      ))}
      <div className="h-1.5 w-1/2 mx-auto rounded bg-muted-foreground/70 mt-0.5" />
    </div>
  )
}

/**
 * Features Comparison - Before vs After columns
 */
function FeaturesComparisonIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-1.5 flex gap-1">
      <div className="flex-1 p-1">
        <div className="h-0.5 w-3/4 mx-auto rounded-full bg-red-400/50 mb-1" />
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center gap-0.5 mb-0.5">
            <div className="w-1 h-1 rounded-full bg-red-400/40" />
            <div className="h-0.5 flex-1 rounded-full bg-muted-foreground/15" />
          </div>
        ))}
      </div>
      <div className="flex-1 p-1">
        <div className="h-0.5 w-3/4 mx-auto rounded-full bg-emerald-400/50 mb-1" />
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center gap-0.5 mb-0.5">
            <div className="w-1 h-1 rounded-full bg-emerald-400/50" />
            <div className="h-0.5 flex-1 rounded-full bg-muted-foreground/15" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Pricing Single - One pricing card
 */
function PricingSingleIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-2 flex flex-col items-center gap-1">
      <div className="h-0.5 w-1/2 rounded-full bg-muted-foreground/40" />
      <div className="h-2 w-1/3 rounded bg-muted-foreground/35" />
      <div className="space-y-0.5 w-full">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-1 justify-center">
            <div className="w-1 h-1 rounded-full bg-muted-foreground/25" />
            <div className="h-0.5 w-2/3 rounded-full bg-muted-foreground/15" />
          </div>
        ))}
      </div>
      <div className="h-1.5 w-3/5 rounded bg-muted-foreground/70" />
    </div>
  )
}

/**
 * Pricing Comparison - Free vs Pro side by side
 */
function PricingComparisonIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-1.5 flex gap-1">
      <div className="flex-1 rounded border border-border/40 p-1 flex flex-col items-center">
        <div className="h-0.5 w-1/2 rounded-full bg-muted-foreground/30 mb-0.5" />
        <div className="h-1.5 w-2/3 rounded bg-muted-foreground/20 mb-1" />
        <div className="h-1 w-full rounded bg-muted-foreground/25" />
      </div>
      <div className="flex-1 rounded border-2 border-muted-foreground/40 p-1 flex flex-col items-center">
        <div className="h-0.5 w-1/2 rounded-full bg-muted-foreground/40 mb-0.5" />
        <div className="h-1.5 w-2/3 rounded bg-muted-foreground/35 mb-1" />
        <div className="h-1 w-full rounded bg-muted-foreground/70" />
      </div>
    </div>
  )
}

/**
 * Pricing Discount - Limited time offer
 */
function PricingDiscountIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-2 flex flex-col items-center gap-1">
      <div className="h-0.5 w-3/5 rounded-full bg-muted-foreground/40" />
      <div className="h-0.5 w-2/5 rounded-full bg-red-400/50" />
      <div className="h-2 w-1/3 rounded bg-muted-foreground/40" />
      <div className="h-0.5 w-1/4 rounded-full bg-muted-foreground/20 line-through" />
      <div className="h-1.5 w-1/2 rounded bg-muted-foreground/70" />
    </div>
  )
}

/**
 * Stats Highlight - One big number
 */
function StatsHighlightIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-3 flex flex-col items-center justify-center">
      <div className="h-3 w-3/5 rounded bg-muted-foreground/40 mb-1" />
      <div className="h-0.5 w-4/5 rounded-full bg-muted-foreground/25" />
    </div>
  )
}

/**
 * Stats Row - Multiple stats side by side
 */
function StatsRowIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-2">
      <div className="h-0.5 w-1/2 mx-auto rounded-full bg-muted-foreground/40 mb-2" />
      <div className="flex justify-center gap-2">
        {[1, 2].map((i) => (
          <div key={i} className="flex flex-col items-center">
            <div className="h-1.5 w-5 rounded bg-muted-foreground/35" />
            <div className="h-0.5 w-4 rounded-full bg-muted-foreground/20 mt-0.5" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Stats Cards - Grid of stats
 */
function StatsCardsIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-1.5">
      <div className="h-0.5 w-1/2 mx-auto rounded-full bg-muted-foreground/40 mb-1" />
      <div className="grid grid-cols-2 gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-1 flex flex-col items-center">
            <div className="h-1 w-2/3 rounded bg-muted-foreground/30" />
            <div className="h-0.5 w-1/2 rounded-full bg-muted-foreground/15 mt-0.5" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * CTA Simple - Heading + text + button
 */
function CtaSimpleIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-2 flex flex-col items-center gap-1">
      <div className="h-1 w-4/5 rounded-full bg-muted-foreground/40" />
      <div className="h-0.5 w-full rounded-full bg-muted-foreground/20" />
      <div className="h-2 w-1/2 rounded bg-muted-foreground/70 mt-0.5" />
    </div>
  )
}

/**
 * CTA Split - Image + text + button side by side
 */
function CtaSplitIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-1.5 flex gap-1.5">
      <div className="w-2/5 h-10 rounded bg-muted/50 flex items-center justify-center">
        <svg className="w-3 h-2.5 text-muted-foreground/30" viewBox="0 0 24 18" fill="currentColor">
          <path d="M4 16l4-5 3 3 5-7 4 9H4z" />
        </svg>
      </div>
      <div className="flex-1 flex flex-col justify-center gap-1">
        <div className="h-0.5 w-4/5 rounded-full bg-muted-foreground/35" />
        <div className="h-0.5 w-full rounded-full bg-muted-foreground/20" />
        <div className="h-1.5 w-1/2 rounded bg-muted-foreground/70 mt-0.5" />
      </div>
    </div>
  )
}

/**
 * CTA Banner - Full-width bold CTA
 */
function CtaBannerIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-3 flex flex-col items-center gap-1.5">
      <div className="h-1.5 w-4/5 rounded-full bg-muted-foreground/45" />
      <div className="h-0.5 w-3/5 rounded-full bg-muted-foreground/20" />
      <div className="h-2 w-1/2 rounded bg-muted-foreground/70" />
    </div>
  )
}

/**
 * Notification Alert - Alert box with icon + text + button
 */
function NotificationAlertIllustration() {
  return (
    <div className="w-full rounded-md border border-blue-400/30 bg-blue-400/10 p-2 flex items-start gap-1.5">
      <div className="w-2.5 h-2.5 rounded-full bg-blue-400/40 shrink-0" />
      <div className="flex-1 space-y-0.5">
        <div className="h-0.5 w-3/5 rounded-full bg-muted-foreground/35" />
        <div className="h-0.5 w-full rounded-full bg-muted-foreground/20" />
        <div className="h-1 w-1/3 rounded bg-blue-400/50 mt-1" />
      </div>
    </div>
  )
}

/**
 * Notification Banner - Full-width announcement
 */
function NotificationBannerIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-2 flex flex-col items-center gap-1">
      <div className="h-0.5 w-3/5 rounded-full bg-muted-foreground/40" />
      <div className="h-0.5 w-4/5 rounded-full bg-muted-foreground/20" />
      <div className="h-1.5 w-1/3 rounded bg-muted-foreground/70" />
    </div>
  )
}

/**
 * Footer Simple - Divider + company + links
 */
function FooterSimpleIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-2 flex flex-col">
      <div className="h-px w-full bg-muted-foreground/15 mb-1.5" />
      <div className="h-0.5 w-1/3 mx-auto rounded-full bg-muted-foreground/25 mb-0.5" />
      <div className="h-0.5 w-2/5 mx-auto rounded-full bg-muted-foreground/15" />
    </div>
  )
}

/**
 * Footer Social - Social links row
 */
function FooterSocialIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-2 flex flex-col items-center">
      <div className="h-px w-full bg-muted-foreground/15 mb-1.5" />
      <div className="h-0.5 w-3/5 rounded-full bg-muted-foreground/20 mb-1" />
      <div className="h-0.5 w-1/3 rounded-full bg-muted-foreground/25 mb-0.5" />
      <div className="h-0.5 w-1/4 rounded-full bg-muted-foreground/15" />
    </div>
  )
}

/**
 * Footer Full - Complete footer with columns
 */
function FooterFullIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-1.5 flex flex-col">
      <div className="h-px w-full bg-muted-foreground/15 mb-1" />
      <div className="flex gap-2 mb-1">
        <div className="flex-1 space-y-0.5">
          <div className="h-0.5 w-2/3 rounded-full bg-muted-foreground/30" />
          <div className="h-0.5 w-full rounded-full bg-muted-foreground/15" />
        </div>
        <div className="flex-1 space-y-0.5">
          <div className="h-0.5 w-full rounded-full bg-muted-foreground/15" />
        </div>
      </div>
      <div className="h-px w-full bg-muted-foreground/10 mb-1" />
      <div className="h-0.5 w-2/3 mx-auto rounded-full bg-muted-foreground/20" />
    </div>
  )
}

/**
 * Welcome Personal - Greeting + text + button
 */
function WelcomePersonalIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-2 flex flex-col items-center gap-1">
      <div className="flex items-center gap-0.5">
        <div className="h-1 w-3/5 rounded-full bg-muted-foreground/40" />
        <span className="text-[6px]">👋</span>
      </div>
      <div className="space-y-0.5 w-full">
        <div className="h-0.5 w-full rounded-full bg-muted-foreground/20" />
        <div className="h-0.5 w-4/5 mx-auto rounded-full bg-muted-foreground/15" />
      </div>
      <div className="h-2 w-1/2 rounded bg-muted-foreground/70" />
    </div>
  )
}

/**
 * Welcome Steps - Numbered onboarding
 */
function WelcomeStepsIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-2 flex flex-col gap-1">
      <div className="h-1 w-3/5 mx-auto rounded-full bg-muted-foreground/40" />
      {[1, 2, 3].map((num) => (
        <div key={num} className="flex items-center gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/25 flex items-center justify-center text-[5px] font-bold shrink-0">
            {num}
          </div>
          <div className="h-0.5 flex-1 rounded-full bg-muted-foreground/15" />
        </div>
      ))}
      <div className="h-1.5 w-1/2 mx-auto rounded bg-muted-foreground/70 mt-0.5" />
    </div>
  )
}

/**
 * Welcome Benefits - Benefits list
 */
function WelcomeBenefitsIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-2 flex flex-col gap-1">
      <div className="h-1 w-3/5 mx-auto rounded-full bg-muted-foreground/40" />
      <div className="h-0.5 w-4/5 mx-auto rounded-full bg-muted-foreground/20" />
      <div className="space-y-0.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/50" />
            <div className="h-0.5 flex-1 rounded-full bg-muted-foreground/15" />
          </div>
        ))}
      </div>
      <div className="h-1.5 w-1/2 mx-auto rounded bg-muted-foreground/70" />
    </div>
  )
}

/**
 * Timer Boxes - D:H:M:S boxes
 */
function TimerBoxesIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-2 flex flex-col items-center gap-1">
      <div className="h-0.5 w-2/5 rounded-full bg-muted-foreground/35" />
      <div className="flex gap-0.5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="w-3 h-3 rounded bg-muted-foreground/30" />
        ))}
      </div>
      <div className="h-1.5 w-1/2 rounded bg-muted-foreground/70" />
    </div>
  )
}

/**
 * Timer Minimal - Clean simple countdown
 */
function TimerMinimalIllustration() {
  return (
    <div className="w-full rounded-md border border-border/50 p-3 flex flex-col items-center justify-center gap-1">
      <div className="h-0.5 w-1/3 rounded-full bg-muted-foreground/25" />
      <div className="h-2 w-3/5 rounded bg-muted-foreground/30" />
      <div className="h-1.5 w-1/2 rounded bg-muted-foreground/70" />
    </div>
  )
}

/**
 * Timer Urgent - Red urgent styling
 */
function TimerUrgentIllustration() {
  return (
    <div className="w-full rounded-md border border-red-400/30 p-2 flex flex-col items-center gap-1">
      <div className="h-0.5 w-3/5 rounded-full bg-red-400/50" />
      <div className="h-0.5 w-2/5 rounded-full bg-muted-foreground/20" />
      <div className="flex gap-0.5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="w-3 h-3 rounded bg-red-400/40" />
        ))}
      </div>
      <div className="h-1.5 w-1/2 rounded bg-red-400/60" />
    </div>
  )
}

/** Map template IDs to their illustration components */
const TEMPLATE_ILLUSTRATIONS: Record<string, React.ComponentType> = {
  // Heroes
  'hero-centered': HeroCenteredIllustration,
  'hero-split': HeroSplitIllustration,
  'hero-minimal': HeroMinimalIllustration,
  'hero-social-proof': HeroSocialProofIllustration,
  // Testimonials
  'testimonial-quote-card': TestimonialQuoteCardIllustration,
  'testimonial-avatar-stack': TestimonialAvatarStackIllustration,
  'testimonial-twitter': TestimonialTwitterIllustration,
  'testimonial-spotlight': TestimonialSpotlightIllustration,
  // Features
  'features-checklist': FeaturesChecklistIllustration,
  'features-grid': FeaturesGridIllustration,
  'features-steps': FeaturesStepsIllustration,
  'features-comparison': FeaturesComparisonIllustration,
  // Pricing
  'pricing-single': PricingSingleIllustration,
  'pricing-comparison': PricingComparisonIllustration,
  'pricing-discount': PricingDiscountIllustration,
  // Stats
  'stats-highlight': StatsHighlightIllustration,
  'stats-row': StatsRowIllustration,
  'stats-cards': StatsCardsIllustration,
  // CTAs
  'cta-simple': CtaSimpleIllustration,
  'cta-split': CtaSplitIllustration,
  'cta-banner': CtaBannerIllustration,
  // Notifications
  'notification-alert': NotificationAlertIllustration,
  'notification-banner': NotificationBannerIllustration,
  // Footers
  'footer-simple': FooterSimpleIllustration,
  'footer-social': FooterSocialIllustration,
  'footer-full': FooterFullIllustration,
  // Welcome
  'welcome-personal': WelcomePersonalIllustration,
  'welcome-steps': WelcomeStepsIllustration,
  'welcome-benefits': WelcomeBenefitsIllustration,
  // Timers
  'timer-boxes': TimerBoxesIllustration,
  'timer-minimal': TimerMinimalIllustration,
  'timer-urgent': TimerUrgentIllustration,
}

// ============================================================================
// BASIC ELEMENTS DEFINITIONS
// ============================================================================

/**
 * Element definition structure
 */
interface ElementDef {
  type: EmailBlockType
  label: string
}

/**
 * Basic element definitions - fundamental building blocks.
 * NOTE: Spacer is deprecated - all blocks now have marginTop/marginBottom properties.
 */
const BASIC_ELEMENTS: ElementDef[] = [
  { type: 'heading', label: 'Heading' },
  { type: 'text', label: 'Text' },
  { type: 'button', label: 'Button' },
  { type: 'image', label: 'Image' },
  { type: 'list', label: 'List' },
  { type: 'columns', label: 'Columns' },
  { type: 'divider', label: 'Divider' },
]

// ============================================================================
// DRAGGABLE COMPONENTS
// ============================================================================

/**
 * Draggable element tile with minimal icon.
 * Clean design with large muted icon and label.
 */
function DraggableElement({
  type,
  label,
}: {
  type: EmailBlockType
  label: string
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `sidebar-${type}`,
    data: {
      type: 'sidebar-block',
      blockType: type,
    },
  })

  const Icon = ELEMENT_ICONS[type]

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'group relative flex flex-col items-center gap-2 p-4 dark:bg-muted/70 bg-muted',
        'rounded-lg border border-border/30',
        'hover:bg-muted/40 hover:border-border/60',
        'cursor-grab active:cursor-grabbing',
        'transition-all duration-200',
        isDragging && 'opacity-50 scale-95'
      )}
    >
      {/* Large muted icon */}
      <Icon className="w-6 h-6 text-muted-foreground/70 group-hover:text-muted-foreground transition-colors" />

      {/* Label */}
      <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
        {label}
      </span>
    </div>
  )
}

/**
 * Draggable template variant tile.
 * Used inside accordion categories to display template options.
 * Features beautiful illustrated previews showing the template structure.
 * Designed for 2-column grid layout with stunning minimal illustrations.
 */
function DraggableTemplateVariant({
  variant,
  categoryId,
}: {
  variant: TemplateVariant
  categoryId: string
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `sidebar-template-${variant.id}`,
    data: {
      type: 'sidebar-template',
      templateId: variant.id,
      categoryId,
    },
  })

  // Get the illustration component for this variant
  const Illustration = TEMPLATE_ILLUSTRATIONS[variant.id]

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'group relative flex flex-col p-2 rounded-lg',
        'bg-muted/30 border border-border/20',
        'hover:bg-muted/50 hover:border-violet-500/30 hover:shadow-sm',
        'cursor-grab active:cursor-grabbing',
        'transition-all duration-200',
        isDragging && 'opacity-50 scale-95'
      )}
    >
      {/* Illustration preview */}
      {Illustration && (
        <div className="mb-1.5">
          <Illustration />
        </div>
      )}

      {/* Label only - clean and minimal */}
      <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground text-center truncate transition-colors">
        {variant.label}
      </span>
    </div>
  )
}

/**
 * Renders the appropriate icon for a category.
 * Separated into its own component to avoid creating components during render.
 * Uses muted colors instead of violet for a cleaner look.
 */
function CategoryIcon({ iconName }: { iconName: string }) {
  const Icon = ICON_MAP[iconName] || LayoutGrid
  return <Icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
}

/**
 * Category accordion section.
 * Displays a category header with icon and expands to show
 * all variants within that category. Has separator borders.
 */
function CategoryAccordion({
  category,
}: {
  category: (typeof BLOCK_CATEGORIES)[number]
}) {
  return (
    <AccordionItem
      value={category.id}
      className="border-b border-border/50"
    >
      <AccordionTrigger className="py-3 hover:no-underline group">
        <div className="flex items-center gap-3">
          {/* Category icon with subtle muted background */}
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted/60 group-hover:bg-muted transition-colors">
            <CategoryIcon iconName={category.icon} />
          </div>
          <div className="text-left">
            <span className="text-sm font-semibold text-foreground">
              {category.label}
            </span>
            <p className="text-xs text-muted-foreground font-normal">
              {category.variants.length} templates
            </p>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-3">
        {/* 2-column grid layout for block templates */}
        <div className="grid grid-cols-2 gap-2 pl-2">
          {category.variants.map((variant) => (
            <DraggableTemplateVariant
              key={variant.id}
              variant={variant}
              categoryId={category.id}
            />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Element Sidebar Component
 *
 * Responsive design: Hidden on mobile, visible on larger screens.
 * Premium design with proper contrast and visual hierarchy.
 *
 * Two tabs:
 * - Elements: Grid of basic draggable elements
 * - Blocks: Accordion categories with stunning pre-built templates
 */
export function ElementSidebar() {
  const [activeTab, setActiveTab] = useState('elements')

  return (
    <div className="hidden md:flex w-56 lg:w-64 xl:w-72 border-r border-border/60 bg-sidebar shrink-0 flex-col">
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex flex-col h-full"
      >
        {/* Tab headers with premium styling */}
        <div className="p-3 lg:p-4 border-b border-border/60">
          <TabsList className="w-full grid grid-cols-2 h-10 bg-muted/50">
            <TabsTrigger
              value="elements"
              className="text-sm font-medium data-[state=active]:shadow-sm"
            >
              Elements
            </TabsTrigger>
            <TabsTrigger
              value="blocks"
              className="text-sm font-medium data-[state=active]:shadow-sm"
            >
              Blocks
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Elements tab - Basic building blocks only */}
        <TabsContent
          value="elements"
          className="flex-1 overflow-y-auto p-3 lg:p-4 m-0"
        >
          <p className="text-xs text-muted-foreground mb-3 font-medium">
            Drag elements to canvas
          </p>
          <div className="grid grid-cols-2 gap-3">
            {BASIC_ELEMENTS.map((element) => (
              <DraggableElement
                key={element.type}
                type={element.type}
                label={element.label}
              />
            ))}
          </div>
        </TabsContent>

        {/* Blocks tab - Pre-built template categories */}
        <TabsContent
          value="blocks"
          className="flex-1 m-0 overflow-hidden"
        >
          <div className="p-3 lg:p-4 pb-2">
            <p className="text-xs text-muted-foreground font-medium">
              Stunning pre-built templates
            </p>
          </div>

          <ScrollArea className="flex-1 h-[calc(100%-48px)]">
            <div className="px-3 lg:px-4 pb-4">
              <Accordion
                type="multiple"
                defaultValue={['heroes']}
                className="space-y-1"
              >
                {BLOCK_CATEGORIES.map((category) => (
                  <CategoryAccordion
                    key={category.id}
                    category={category}
                  />
                ))}
              </Accordion>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}
