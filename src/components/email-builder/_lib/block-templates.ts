/**
 * STUNNING BLOCK TEMPLATES
 *
 * Pre-designed, production-ready email block templates organized by category.
 * Each category contains multiple stunning variants for different use cases.
 *
 * These templates use our COMPOSITE BLOCK TYPES for professional, self-contained
 * components rather than basic blocks glued together with spacers.
 *
 * ARCHITECTURE:
 * - Categories define groups of related templates
 * - Each template returns an array of EmailBlock[] when invoked
 * - Templates use marginTop/marginBottom instead of spacer blocks
 * - Composite blocks (pricing-card, testimonial-card, etc.) are used where appropriate
 *
 * SOURCE OF TRUTH KEYWORDS: BlockTemplates, BlockCategory, TemplateVariant
 */

import { v4 as uuid } from 'uuid'
import type {
  EmailBlock,
  ColumnsBlock,
  HeadingLevel,
  TextAlign,
  PricingCardBlock,
  TestimonialCardBlock,
  FeatureCardBlock,
  StatsCardBlock,
  AlertCardBlock,
  ListBlock,
  ListItem,
  CountdownTimerBlock,
  CountdownTimerStyle,
  CountdownSeparatorStyle,
  SocialProofBlock,
} from '@/types/email-templates'

// ============================================================================
// TYPES
// ============================================================================

/**
 * A single template variant within a category.
 * SOURCE OF TRUTH KEYWORDS: TemplateVariant
 */
export interface TemplateVariant {
  id: string
  label: string
  description: string
  /** Optional preview color for visual distinction */
  accentColor?: string
}

/**
 * A category containing multiple template variants.
 * SOURCE OF TRUTH KEYWORDS: BlockCategory
 */
export interface BlockCategory {
  id: string
  label: string
  icon: string
  description: string
  variants: TemplateVariant[]
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Generate unique block ID */
const blockId = () => `block_${uuid()}`

/**
 * Create a heading block with styling and margins
 */
const heading = (
  text: string,
  level: HeadingLevel = 'h1',
  align: TextAlign = 'center',
  options?: {
    color?: string
    backgroundColor?: string
    padding?: number
    marginTop?: number
    marginBottom?: number
  }
): EmailBlock => ({
  id: blockId(),
  type: 'heading',
  props: {
    text,
    level,
    align,
    color: options?.color,
    backgroundColor: options?.backgroundColor,
    padding: options?.padding,
    marginTop: options?.marginTop ?? 0,
    marginBottom: options?.marginBottom ?? 0,
  },
})

/**
 * Create a text block with styling and margins
 */
const text = (
  content: string,
  align: TextAlign = 'center',
  options?: {
    color?: string
    backgroundColor?: string
    padding?: number
    marginTop?: number
    marginBottom?: number
  }
): EmailBlock => ({
  id: blockId(),
  type: 'text',
  props: {
    text: content,
    align,
    color: options?.color,
    backgroundColor: options?.backgroundColor,
    padding: options?.padding,
    marginTop: options?.marginTop ?? 0,
    marginBottom: options?.marginBottom ?? 0,
  },
})

/**
 * Create a button block with styling and margins
 */
const button = (
  label: string,
  href: string = '#',
  align: TextAlign = 'center',
  options?: {
    backgroundColor?: string
    textColor?: string
    borderRadius?: number
    paddingX?: number
    paddingY?: number
    marginTop?: number
    marginBottom?: number
  }
): EmailBlock => ({
  id: blockId(),
  type: 'button',
  props: {
    text: label,
    href,
    align,
    backgroundColor: options?.backgroundColor ?? '#2563eb',
    textColor: options?.textColor ?? '#ffffff',
    borderRadius: options?.borderRadius ?? 8,
    paddingX: options?.paddingX ?? 32,
    paddingY: options?.paddingY ?? 14,
    marginTop: options?.marginTop ?? 0,
    marginBottom: options?.marginBottom ?? 0,
  },
})

/**
 * Create an image block with margins
 */
const image = (
  src: string = '',
  alt: string = 'Image',
  align: TextAlign = 'center',
  options?: {
    width?: number
    borderRadius?: number
    marginTop?: number
    marginBottom?: number
  }
): EmailBlock => ({
  id: blockId(),
  type: 'image',
  props: {
    src,
    alt,
    align,
    width: options?.width,
    borderRadius: options?.borderRadius ?? 8,
    marginTop: options?.marginTop ?? 0,
    marginBottom: options?.marginBottom ?? 0,
  },
})

/**
 * Create a divider block with margins
 */
const divider = (options?: {
  color?: string
  thickness?: number
  marginTop?: number
  marginBottom?: number
}): EmailBlock => ({
  id: blockId(),
  type: 'divider',
  props: {
    color: options?.color ?? '#e5e7eb',
    thickness: options?.thickness ?? 1,
    marginTop: options?.marginTop ?? 24,
    marginBottom: options?.marginBottom ?? 24,
  },
})

/**
 * Create a columns block
 */
const columns = (
  leftBlocks: EmailBlock[],
  rightBlocks: EmailBlock[],
  options?: {
    gap?: number
    leftWidth?: number
    leftBg?: string
    rightBg?: string
    leftPadding?: number
    rightPadding?: number
    marginTop?: number
    marginBottom?: number
  }
): ColumnsBlock => ({
  id: blockId(),
  type: 'columns',
  props: {
    leftColumn: {
      blocks: leftBlocks,
      backgroundColor: options?.leftBg,
      padding: options?.leftPadding,
    },
    rightColumn: {
      blocks: rightBlocks,
      backgroundColor: options?.rightBg,
      padding: options?.rightPadding,
    },
    gap: options?.gap ?? 24,
    leftWidth: options?.leftWidth ?? 50,
    marginTop: options?.marginTop ?? 0,
    marginBottom: options?.marginBottom ?? 0,
  },
})

/**
 * Create a pricing card block
 */
const pricingCard = (options: {
  planName: string
  price: string
  currency?: string
  billingPeriod?: string
  description?: string
  features: string[]
  buttonText: string
  buttonHref?: string
  isPopular?: boolean
  backgroundColor?: string
  accentColor?: string
  marginTop?: number
  marginBottom?: number
}): PricingCardBlock => ({
  id: blockId(),
  type: 'pricing-card',
  props: {
    planName: options.planName,
    price: options.price,
    currency: options.currency ?? '$',
    billingPeriod: options.billingPeriod ?? '/month',
    description: options.description,
    features: options.features,
    buttonText: options.buttonText,
    buttonHref: options.buttonHref ?? '#',
    isPopular: options.isPopular ?? false,
    backgroundColor: options.backgroundColor,
    accentColor: options.accentColor ?? '#2563eb',
    marginTop: options.marginTop ?? 0,
    marginBottom: options.marginBottom ?? 0,
  },
})

/**
 * Create a testimonial card block
 */
const testimonialCard = (options: {
  quote: string
  authorName: string
  authorRole?: string
  companyName?: string
  avatarSrc?: string
  rating?: number
  layout?: 'centered' | 'left-aligned' | 'card'
  backgroundColor?: string
  accentColor?: string
  marginTop?: number
  marginBottom?: number
}): TestimonialCardBlock => ({
  id: blockId(),
  type: 'testimonial-card',
  props: {
    quote: options.quote,
    authorName: options.authorName,
    authorRole: options.authorRole,
    companyName: options.companyName,
    avatarSrc: options.avatarSrc,
    rating: options.rating,
    layout: options.layout ?? 'centered',
    backgroundColor: options.backgroundColor,
    accentColor: options.accentColor ?? '#2563eb',
    marginTop: options.marginTop ?? 0,
    marginBottom: options.marginBottom ?? 0,
  },
})

/**
 * Create a feature card block
 */
const featureCard = (options: {
  icon: string
  title: string
  description: string
  layout?: 'vertical' | 'horizontal'
  align?: TextAlign
  backgroundColor?: string
  titleColor?: string
  descriptionColor?: string
  marginTop?: number
  marginBottom?: number
}): FeatureCardBlock => ({
  id: blockId(),
  type: 'feature-card',
  props: {
    icon: options.icon,
    title: options.title,
    description: options.description,
    layout: options.layout ?? 'vertical',
    align: options.align ?? 'center',
    backgroundColor: options.backgroundColor,
    titleColor: options.titleColor ?? '#111827',
    descriptionColor: options.descriptionColor ?? '#6b7280',
    marginTop: options.marginTop ?? 0,
    marginBottom: options.marginBottom ?? 0,
  },
})

/**
 * Create a stats card block
 */
const statsCard = (options: {
  value: string
  label: string
  icon?: string
  valueColor?: string
  labelColor?: string
  backgroundColor?: string
  align?: TextAlign
  marginTop?: number
  marginBottom?: number
}): StatsCardBlock => ({
  id: blockId(),
  type: 'stats-card',
  props: {
    value: options.value,
    label: options.label,
    icon: options.icon,
    valueColor: options.valueColor ?? '#2563eb',
    labelColor: options.labelColor ?? '#6b7280',
    backgroundColor: options.backgroundColor,
    align: options.align ?? 'center',
    marginTop: options.marginTop ?? 0,
    marginBottom: options.marginBottom ?? 0,
  },
})

/**
 * Create an alert card block
 */
const alertCard = (options: {
  alertType: 'info' | 'success' | 'warning' | 'error'
  title?: string
  message: string
  buttonText?: string
  buttonHref?: string
  marginTop?: number
  marginBottom?: number
}): AlertCardBlock => ({
  id: blockId(),
  type: 'alert-card',
  props: {
    alertType: options.alertType,
    title: options.title,
    message: options.message,
    buttonText: options.buttonText,
    buttonHref: options.buttonHref,
    marginTop: options.marginTop ?? 0,
    marginBottom: options.marginBottom ?? 0,
  },
})

/**
 * Create a list block
 */
const list = (options: {
  items: Array<{ text: string; icon?: ListItem['icon'] }>
  iconType?: 'check' | 'bullet' | 'x' | 'arrow' | 'star'
  iconColor?: string
  textColor?: string
  backgroundColor?: string
  padding?: number
  marginTop?: number
  marginBottom?: number
}): ListBlock => ({
  id: blockId(),
  type: 'list',
  props: {
    items: options.items.map((item) => ({
      id: uuid(),
      text: item.text,
      icon: item.icon,
    })),
    iconType: options.iconType ?? 'check',
    iconColor: options.iconColor ?? '#16a34a',
    textColor: options.textColor ?? '#374151',
    backgroundColor: options.backgroundColor,
    padding: options.padding,
    marginTop: options.marginTop ?? 0,
    marginBottom: options.marginBottom ?? 0,
  },
})

/**
 * Create a countdown timer block.
 * Returns a timer that counts down to the specified target date.
 *
 * WHY: Countdown timers create urgency in marketing emails for:
 * - Flash sales and limited-time offers
 * - Event countdowns
 * - Deadline reminders
 * - Product launches
 *
 * Note: Email timers show time remaining at render time since
 * emails are static. For live countdowns, consider timer image services.
 */
const countdownTimer = (options: {
  /** Target date in ISO format (defaults to 7 days from now) */
  targetDate?: string
  /** Show days unit */
  showDays?: boolean
  /** Show hours unit */
  showHours?: boolean
  /** Show minutes unit */
  showMinutes?: boolean
  /** Show seconds unit */
  showSeconds?: boolean
  /** Message when timer expires */
  expiredMessage?: string
  /** Visual style of the timer */
  style?: CountdownTimerStyle
  /** Color for the digit numbers */
  digitColor?: string
  /** Color for the unit labels */
  labelColor?: string
  /** Background color for the timer container */
  backgroundColor?: string
  /** Separator style between time units */
  separatorStyle?: CountdownSeparatorStyle
  /** Separator color (defaults to digitColor) */
  separatorColor?: string
  /** Text alignment */
  align?: TextAlign
  /** Border radius in pixels */
  borderRadius?: number
  /** Padding in pixels */
  padding?: number
  /** Margin top in pixels */
  marginTop?: number
  /** Margin bottom in pixels */
  marginBottom?: number
}): CountdownTimerBlock => {
  // Default target date is 7 days from now
  const defaultTargetDate = new Date()
  defaultTargetDate.setDate(defaultTargetDate.getDate() + 7)

  return {
    id: blockId(),
    type: 'countdown-timer',
    props: {
      targetDate: options.targetDate ?? defaultTargetDate.toISOString(),
      showDays: options.showDays ?? true,
      showHours: options.showHours ?? true,
      showMinutes: options.showMinutes ?? true,
      showSeconds: options.showSeconds ?? true,
      expiredMessage: options.expiredMessage ?? 'This offer has expired',
      style: options.style ?? 'boxes',
      digitColor: options.digitColor ?? '#1f2937',
      labelColor: options.labelColor ?? '#6b7280',
      backgroundColor: options.backgroundColor ?? '#f3f4f6',
      separatorStyle: options.separatorStyle ?? 'colon',
      separatorColor: options.separatorColor,
      align: options.align ?? 'center',
      borderRadius: options.borderRadius ?? 8,
      padding: options.padding ?? 24,
      marginTop: options.marginTop ?? 0,
      marginBottom: options.marginBottom ?? 0,
    },
  }
}

/**
 * Create a social proof block with avatar stack and metrics.
 * Perfect for "7000+ creators worldwide" style displays.
 */
const socialProof = (options: {
  /** Array of avatar URLs (renders as overlapping stack) */
  avatars: string[]
  /** Main number/metric (e.g., "7,000+") */
  metric: string
  /** Text below the metric (e.g., "creators worldwide") */
  metricLabel: string
  /** Optional heading text */
  heading?: string
  /** Optional subheading text */
  subheading?: string
  /** Layout style */
  layout?: 'horizontal' | 'vertical' | 'centered'
  /** Avatar size in pixels */
  avatarSize?: number
  /** Overlap amount for avatars */
  avatarOverlap?: number
  /** Border color for avatars */
  avatarBorderColor?: string
  /** Metric text color */
  metricColor?: string
  /** Label text color */
  labelColor?: string
  /** Heading color */
  headingColor?: string
  /** Subheading color */
  subheadingColor?: string
  /** Background color */
  backgroundColor?: string
  /** Border radius */
  borderRadius?: number
  /** Padding */
  padding?: number
  /** Margin top */
  marginTop?: number
  /** Margin bottom */
  marginBottom?: number
}): SocialProofBlock => ({
  id: blockId(),
  type: 'social-proof',
  props: {
    avatars: options.avatars,
    metric: options.metric,
    metricLabel: options.metricLabel,
    heading: options.heading,
    subheading: options.subheading,
    layout: options.layout ?? 'horizontal',
    avatarSize: options.avatarSize ?? 40,
    avatarOverlap: options.avatarOverlap ?? 12,
    avatarBorderColor: options.avatarBorderColor ?? '#ffffff',
    metricColor: options.metricColor ?? '#111827',
    labelColor: options.labelColor ?? '#6b7280',
    headingColor: options.headingColor ?? '#111827',
    subheadingColor: options.subheadingColor ?? '#6b7280',
    backgroundColor: options.backgroundColor,
    borderRadius: options.borderRadius ?? 0,
    padding: options.padding ?? 24,
    marginTop: options.marginTop ?? 0,
    marginBottom: options.marginBottom ?? 0,
  },
})

// ============================================================================
// CATEGORY DEFINITIONS
// ============================================================================

/**
 * All block template categories with their variants.
 * Streamlined to avoid redundancy - properties that can be configured
 * in the sidebar (like alert type) are NOT separate templates.
 *
 * SOURCE OF TRUTH KEYWORDS: BLOCK_CATEGORIES
 */
export const BLOCK_CATEGORIES: BlockCategory[] = [
  {
    id: 'heroes',
    label: 'Heroes',
    icon: 'LayoutGrid',
    description: 'Eye-catching header sections',
    variants: [
      { id: 'hero-centered', label: 'Centered Hero', description: 'Classic centered layout with image' },
      { id: 'hero-split', label: 'Split Layout', description: 'Image on one side, text on the other' },
      { id: 'hero-minimal', label: 'Minimal', description: 'Bold headline with subtle subtext' },
      { id: 'hero-social-proof', label: 'Social Proof', description: 'Avatar stack with testimonial count' },
    ],
  },
  {
    id: 'testimonials',
    label: 'Testimonials',
    icon: 'Quote',
    description: 'Customer quotes and reviews',
    variants: [
      { id: 'testimonial-quote-card', label: 'Quote Card', description: 'Clean card with large quote marks' },
      { id: 'testimonial-avatar-stack', label: 'Avatar Stack', description: 'Overlapping avatars with social proof' },
      { id: 'testimonial-twitter', label: 'Tweet Style', description: 'Social media post format' },
      { id: 'testimonial-spotlight', label: 'Spotlight', description: 'Featured customer with photo' },
    ],
  },
  {
    id: 'features',
    label: 'Features',
    icon: 'Star',
    description: 'Highlight product features',
    variants: [
      { id: 'features-checklist', label: 'Checklist', description: 'Clean vertical checklist' },
      { id: 'features-grid', label: 'Icon Grid', description: '2x2 grid with icons' },
      { id: 'features-steps', label: 'Steps', description: 'Numbered step-by-step guide' },
      { id: 'features-comparison', label: 'Comparison', description: 'Before vs After comparison' },
    ],
  },
  {
    id: 'pricing',
    label: 'Pricing',
    icon: 'CreditCard',
    description: 'Pricing tables and offers',
    variants: [
      { id: 'pricing-single', label: 'Single Plan', description: 'One featured pricing card' },
      { id: 'pricing-comparison', label: 'Plan Comparison', description: 'Side-by-side plans' },
      { id: 'pricing-discount', label: 'Discount Offer', description: 'Limited time offer with savings' },
    ],
  },
  {
    id: 'stats',
    label: 'Stats',
    icon: 'BarChart3',
    description: 'Showcase numbers and metrics',
    variants: [
      { id: 'stats-highlight', label: 'Highlight', description: 'One impressive number' },
      { id: 'stats-row', label: 'Stats Row', description: 'Multiple metrics in a row' },
      { id: 'stats-cards', label: 'Stat Cards', description: 'Stats in card format' },
    ],
  },
  {
    id: 'ctas',
    label: 'Call to Action',
    icon: 'MousePointerClick',
    description: 'Drive user engagement',
    variants: [
      { id: 'cta-simple', label: 'Simple CTA', description: 'Clean action section' },
      { id: 'cta-split', label: 'Split CTA', description: 'Image with CTA side by side' },
      { id: 'cta-banner', label: 'Banner CTA', description: 'Full-width bold banner' },
    ],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: 'Bell',
    description: 'Alerts and notifications',
    variants: [
      { id: 'notification-alert', label: 'Alert Box', description: 'Customizable alert (change type in properties)' },
      { id: 'notification-banner', label: 'Banner', description: 'Full-width announcement banner' },
    ],
  },
  {
    id: 'footers',
    label: 'Footers',
    icon: 'Mail',
    description: 'Professional email footers',
    variants: [
      { id: 'footer-simple', label: 'Simple', description: 'Clean minimal footer' },
      { id: 'footer-social', label: 'Social', description: 'With social media links' },
      { id: 'footer-full', label: 'Full Footer', description: 'Complete with multiple sections' },
    ],
  },
  {
    id: 'welcome',
    label: 'Welcome',
    icon: 'Sparkles',
    description: 'Onboarding emails',
    variants: [
      { id: 'welcome-personal', label: 'Personal', description: 'Warm personalized greeting' },
      { id: 'welcome-steps', label: 'Onboarding', description: 'Getting started steps' },
      { id: 'welcome-benefits', label: 'Benefits', description: 'What you get as a member' },
    ],
  },
  {
    id: 'timers',
    label: 'Timers',
    icon: 'Timer',
    description: 'Countdown timers for urgency',
    variants: [
      { id: 'timer-boxes', label: 'Box Timer', description: 'Classic countdown boxes' },
      { id: 'timer-minimal', label: 'Minimal Timer', description: 'Clean simple countdown' },
      { id: 'timer-urgent', label: 'Urgent', description: 'High urgency flash sale style' },
    ],
  },
]

// ============================================================================
// TEMPLATE FACTORY FUNCTIONS
// ============================================================================

/**
 * Create blocks for a specific template variant.
 * Returns an array of EmailBlock[] ready to be added to the canvas.
 *
 * DESIGN PHILOSOPHY:
 * - Clean, minimal, professional designs
 * - No unnecessary background colors
 * - Strong typography hierarchy
 * - Consistent spacing and alignment
 *
 * SOURCE OF TRUTH KEYWORDS: createTemplateBlocks
 */
export function createTemplateBlocks(templateId: string): EmailBlock[] {
  switch (templateId) {
    // ─────────────────────────────────────────────────────────────────────
    // HEROES - Eye-catching header sections
    // ─────────────────────────────────────────────────────────────────────

    /**
     * hero-centered: Classic centered layout
     * Clean image above, bold headline, supporting text, prominent CTA
     */
    case 'hero-centered':
      return [
        image('https://images.unsplash.com/photo-1551434678-e076c223a692?w=800&h=400&fit=crop', 'Hero Image', 'center', { borderRadius: 12, marginTop: 32, marginBottom: 32 }),
        heading('Welcome to the Future', 'h1', 'center', { color: '#111827', marginBottom: 16 }),
        text('Discover a new way to connect, create, and collaborate. Built for teams who want to do more.', 'center', { color: '#6b7280', marginBottom: 32 }),
        button('Get Started Free', '#', 'center', { backgroundColor: '#111827', borderRadius: 8, paddingX: 40, paddingY: 16, marginBottom: 32 }),
      ]

    /**
     * hero-split: Two-column layout with image and text
     * Professional asymmetric layout
     */
    case 'hero-split':
      return [
        columns(
          [
            heading('Build Something Amazing', 'h1', 'left', { color: '#111827', marginBottom: 16, marginTop: 16 }),
            text('The all-in-one platform that helps you create, launch, and scale your ideas. Join thousands of creators.', 'left', { color: '#6b7280', marginBottom: 24 }),
            button('Start Free Trial', '#', 'left', { backgroundColor: '#111827', borderRadius: 8, paddingX: 32, paddingY: 14 }),
          ],
          [
            image('https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=600&h=500&fit=crop', 'Product Image', 'center', { borderRadius: 16 }),
          ],
          { gap: 40, leftWidth: 55, marginTop: 32, marginBottom: 32 }
        ),
      ]

    /**
     * hero-minimal: Typography-focused hero
     * Bold headline, subtle subtext, no image - pure content focus
     */
    case 'hero-minimal':
      return [
        heading('The Future of Work', 'h1', 'center', { color: '#111827', marginTop: 64, marginBottom: 16 }),
        text('Streamline your workflow. Amplify your results.', 'center', { color: '#9ca3af', marginBottom: 32 }),
        button('Get Early Access', '#', 'center', { backgroundColor: '#111827', textColor: '#ffffff', borderRadius: 50, paddingX: 40, paddingY: 16, marginBottom: 64 }),
      ]

    /**
     * hero-social-proof: Avatar stack with impressive number
     * Shows overlapping avatars + "7000+ prodigies worldwide" style
     */
    case 'hero-social-proof':
      return [
        heading('Join 7,000+ Creators', 'h1', 'center', { color: '#111827', marginTop: 48, marginBottom: 16 }),
        text('Building the future of digital products', 'center', { color: '#6b7280', marginBottom: 24 }),
        socialProof({
          avatars: [
            'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face',
            'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
            'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=face',
            'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face',
          ],
          metric: '7,000+',
          metricLabel: 'creators worldwide',
          layout: 'centered',
          avatarSize: 44,
          avatarOverlap: 14,
          marginBottom: 24,
        }),
        text('Trusted by teams at top companies worldwide', 'center', { color: '#9ca3af', marginBottom: 32 }),
        button('Join the Community', '#', 'center', { backgroundColor: '#111827', borderRadius: 8, paddingX: 32, paddingY: 14, marginBottom: 48 }),
      ]

    // ─────────────────────────────────────────────────────────────────────
    // TESTIMONIALS - Customer quotes and reviews
    // ─────────────────────────────────────────────────────────────────────

    /**
     * testimonial-quote-card: Clean card with large quote marks
     * Like the example with big " marks, clean text, avatar at bottom
     */
    case 'testimonial-quote-card':
      return [
        testimonialCard({
          quote: 'Impressed by the professionalism and attention to detail.',
          authorName: 'Guy Hawkins',
          authorRole: '@guyhawkins',
          avatarSrc: 'https://images.unsplash.com/photo-1599566150163-29194dcabd36?w=100&h=100&fit=crop&crop=face',
          layout: 'centered',
          backgroundColor: '#f8f9fa',
          marginTop: 32,
          marginBottom: 32,
        }),
      ]

    /**
     * testimonial-avatar-stack: Overlapping avatars with social proof number
     * "7000+ prodigies worldwide" style with properly overlapping circular avatars
     * Uses the SocialProofBlock composite component for professional rendering
     */
    case 'testimonial-avatar-stack':
      return [
        socialProof({
          avatars: [
            'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=face',
            'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face',
            'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face',
            'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
          ],
          metric: '7,000+',
          metricLabel: 'prodigies worldwide',
          layout: 'horizontal',
          avatarSize: 40,
          avatarOverlap: 12,
          marginTop: 32,
          marginBottom: 32,
        }),
      ]

    /**
     * testimonial-twitter: Social media post format
     * Looks like an embedded tweet with avatar, handle, and quote
     */
    case 'testimonial-twitter':
      return [
        columns(
          [
            image('https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face', 'Profile Photo', 'center', { width: 56, borderRadius: 100 }),
          ],
          [
            heading('Sarah Chen', 'h3', 'left', { color: '#111827', marginBottom: 2 }),
            text('@sarahchen · 2h', 'left', { color: '#6b7280', marginBottom: 12 }),
            text('Just tried @yourproduct and wow. This is exactly what I needed. The attention to detail is incredible. 10/10 would recommend! 🔥', 'left', { color: '#111827', marginBottom: 12 }),
            text('♡ 247  ↻ 38  💬 12', 'left', { color: '#6b7280' }),
          ],
          { gap: 16, leftWidth: 20, marginTop: 32, marginBottom: 32 }
        ),
      ]

    /**
     * testimonial-spotlight: Featured customer with large photo
     * Clean professional spotlight on a single customer
     */
    case 'testimonial-spotlight':
      return [
        image('https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&crop=face', 'Customer Photo', 'center', { width: 120, borderRadius: 100, marginTop: 32, marginBottom: 24 }),
        text('"This product has completely transformed how our team collaborates. We\'ve seen a 40% increase in productivity since switching."', 'center', { color: '#374151', marginBottom: 24 }),
        heading('Michael Chen', 'h3', 'center', { color: '#111827', marginBottom: 4 }),
        text('VP of Operations, Acme Corp', 'center', { color: '#6b7280', marginBottom: 32 }),
      ]

    // ─────────────────────────────────────────────────────────────────────
    // FEATURES - Highlight product features
    // ─────────────────────────────────────────────────────────────────────

    /**
     * features-checklist: Clean vertical checklist
     * Simple, professional feature list with checkmarks
     */
    case 'features-checklist':
      return [
        heading("What's Included", 'h2', 'center', { color: '#111827', marginTop: 32, marginBottom: 24 }),
        list({
          items: [
            { text: 'Unlimited projects and collaborators' },
            { text: 'Real-time sync across all devices' },
            { text: 'Advanced analytics dashboard' },
            { text: 'Priority customer support' },
            { text: '99.9% uptime guarantee' },
          ],
          iconType: 'check',
          iconColor: '#10b981',
          marginBottom: 32,
        }),
      ]

    /**
     * features-grid: 2x2 grid with icons
     * Clean feature cards without colored backgrounds
     */
    case 'features-grid':
      return [
        heading('Everything You Need', 'h2', 'center', { color: '#111827', marginTop: 32, marginBottom: 32 }),
        columns(
          [
            featureCard({ icon: '⚡', title: 'Lightning Fast', description: 'Optimized for speed and performance.', titleColor: '#111827' }),
          ],
          [
            featureCard({ icon: '🔒', title: 'Secure', description: 'Enterprise-grade security built in.', titleColor: '#111827' }),
          ],
          { gap: 24, marginBottom: 24 }
        ),
        columns(
          [
            featureCard({ icon: '🎯', title: 'Easy to Use', description: 'Intuitive design for everyone.', titleColor: '#111827' }),
          ],
          [
            featureCard({ icon: '📊', title: 'Analytics', description: 'Insights to grow your business.', titleColor: '#111827' }),
          ],
          { gap: 24, marginBottom: 32 }
        ),
      ]

    /**
     * features-steps: Numbered step-by-step guide
     * Clean onboarding steps
     */
    case 'features-steps':
      return [
        heading('Getting Started', 'h2', 'center', { color: '#111827', marginTop: 32, marginBottom: 32 }),
        featureCard({ icon: '1', title: 'Create Account', description: 'Sign up in under 30 seconds.', layout: 'horizontal', align: 'left', marginBottom: 16 }),
        featureCard({ icon: '2', title: 'Set Up', description: 'Configure your workspace.', layout: 'horizontal', align: 'left', marginBottom: 16 }),
        featureCard({ icon: '3', title: 'Launch', description: 'Start seeing results.', layout: 'horizontal', align: 'left', marginBottom: 32 }),
        button('Get Started', '#', 'center', { backgroundColor: '#111827', borderRadius: 8, marginBottom: 32 }),
      ]

    /**
     * features-comparison: Before vs After comparison
     * Clean two-column comparison
     */
    case 'features-comparison':
      return [
        heading('See the Difference', 'h2', 'center', { color: '#111827', marginTop: 32, marginBottom: 24 }),
        columns(
          [
            heading('Before', 'h3', 'center', { color: '#dc2626', marginBottom: 16 }),
            list({
              items: [
                { text: 'Manual processes' },
                { text: 'Scattered data' },
                { text: 'Missed deadlines' },
              ],
              iconType: 'x',
              iconColor: '#dc2626',
              textColor: '#6b7280',
            }),
          ],
          [
            heading('After', 'h3', 'center', { color: '#10b981', marginBottom: 16 }),
            list({
              items: [
                { text: 'Automated workflows' },
                { text: 'Centralized data' },
                { text: 'On-time delivery' },
              ],
              iconType: 'check',
              iconColor: '#10b981',
              textColor: '#374151',
            }),
          ],
          { gap: 32, marginBottom: 32 }
        ),
        button('Make the Switch', '#', 'center', { backgroundColor: '#10b981', borderRadius: 8, marginBottom: 32 }),
      ]

    // ─────────────────────────────────────────────────────────────────────
    // PRICING - Pricing tables and offers
    // ─────────────────────────────────────────────────────────────────────

    /**
     * pricing-single: One featured pricing card
     * Clean, focused single plan presentation
     */
    case 'pricing-single':
      return [
        heading('Simple Pricing', 'h2', 'center', { color: '#111827', marginTop: 32, marginBottom: 24 }),
        pricingCard({
          planName: 'Pro',
          price: '29',
          currency: '$',
          billingPeriod: '/month',
          description: 'Everything you need',
          features: ['Unlimited projects', '50GB storage', 'Priority support', 'Advanced analytics'],
          buttonText: 'Get Started',
          accentColor: '#111827',
          marginBottom: 32,
        }),
      ]

    /**
     * pricing-comparison: Side-by-side plans
     * Clean Free vs Pro comparison
     */
    case 'pricing-comparison':
      return [
        heading('Choose Your Plan', 'h2', 'center', { color: '#111827', marginTop: 32, marginBottom: 24 }),
        columns(
          [
            pricingCard({
              planName: 'Free',
              price: '0',
              currency: '$',
              billingPeriod: '/month',
              features: ['1 project', '1GB storage', 'Email support'],
              buttonText: 'Start Free',
              accentColor: '#6b7280',
            }),
          ],
          [
            pricingCard({
              planName: 'Pro',
              price: '29',
              currency: '$',
              billingPeriod: '/month',
              features: ['Unlimited projects', '50GB storage', 'Priority support'],
              buttonText: 'Go Pro',
              isPopular: true,
              accentColor: '#111827',
            }),
          ],
          { gap: 24, marginBottom: 32 }
        ),
      ]

    /**
     * pricing-discount: Limited time offer with savings
     * Urgency-focused discount presentation
     */
    case 'pricing-discount':
      return [
        heading('Limited Time Offer', 'h2', 'center', { color: '#111827', marginTop: 32, marginBottom: 8 }),
        text('Save 50% for the next 48 hours', 'center', { color: '#dc2626', marginBottom: 24 }),
        heading('$99', 'h1', 'center', { color: '#111827', marginBottom: 4 }),
        text('$199', 'center', { color: '#9ca3af', marginBottom: 24 }),
        button('Claim Offer', '#', 'center', { backgroundColor: '#111827', borderRadius: 8, marginBottom: 32 }),
      ]

    // ─────────────────────────────────────────────────────────────────────
    // STATS - Showcase numbers and metrics
    // ─────────────────────────────────────────────────────────────────────

    /**
     * stats-highlight: One impressive number
     * Big bold stat that demands attention
     */
    case 'stats-highlight':
      return [
        statsCard({
          value: '10,000+',
          label: 'Happy customers worldwide',
          valueColor: '#111827',
          marginTop: 32,
          marginBottom: 32,
        }),
      ]

    /**
     * stats-row: Multiple metrics in a row
     * Clean horizontal display of key metrics
     */
    case 'stats-row':
      return [
        heading('By The Numbers', 'h2', 'center', { color: '#111827', marginTop: 32, marginBottom: 24 }),
        columns(
          [
            statsCard({ value: '50K+', label: 'Users', valueColor: '#111827' }),
          ],
          [
            statsCard({ value: '99.9%', label: 'Uptime', valueColor: '#111827' }),
          ],
          { gap: 24, marginBottom: 32 }
        ),
      ]

    /**
     * stats-cards: Stats in card format
     * Grid of stats with clean presentation
     */
    case 'stats-cards':
      return [
        heading('Our Impact', 'h2', 'center', { color: '#111827', marginTop: 32, marginBottom: 24 }),
        columns(
          [
            statsCard({ value: '500K+', label: 'Downloads', valueColor: '#111827' }),
          ],
          [
            statsCard({ value: '4.9★', label: 'Rating', valueColor: '#111827' }),
          ],
          { gap: 24, marginBottom: 16 }
        ),
        columns(
          [
            statsCard({ value: '180+', label: 'Countries', valueColor: '#111827' }),
          ],
          [
            statsCard({ value: '<1s', label: 'Load Time', valueColor: '#111827' }),
          ],
          { gap: 24, marginBottom: 32 }
        ),
      ]

    // ─────────────────────────────────────────────────────────────────────
    // CALL TO ACTION - Drive user engagement
    // ─────────────────────────────────────────────────────────────────────

    /**
     * cta-simple: Clean action section
     * Professional CTA with headline, text, and button
     */
    case 'cta-simple':
      return [
        heading('Ready to get started?', 'h2', 'center', { color: '#111827', marginTop: 32, marginBottom: 8 }),
        text('Join thousands of satisfied customers today.', 'center', { color: '#6b7280', marginBottom: 24 }),
        button('Start Free Trial', '#', 'center', { backgroundColor: '#111827', borderRadius: 8, marginBottom: 32 }),
      ]

    /**
     * cta-split: Image with CTA side by side
     * Two-column layout for visual CTAs
     */
    case 'cta-split':
      return [
        columns(
          [
            image('https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=500&h=400&fit=crop', 'CTA Image', 'center', { borderRadius: 12 }),
          ],
          [
            heading('Transform Your Workflow', 'h2', 'left', { color: '#111827', marginBottom: 12, marginTop: 16 }),
            text('Join over 10,000 teams who have already made the switch.', 'left', { color: '#6b7280', marginBottom: 20 }),
            button('Get Started', '#', 'left', { backgroundColor: '#111827', borderRadius: 8 }),
          ],
          { gap: 32, leftWidth: 40, marginTop: 32, marginBottom: 32 }
        ),
      ]

    /**
     * cta-banner: Full-width bold banner
     * High-impact banner for important CTAs
     */
    case 'cta-banner':
      return [
        heading('Ready to Level Up?', 'h1', 'center', { color: '#111827', marginTop: 48, marginBottom: 12 }),
        text('Join thousands of professionals who are already ahead of the curve.', 'center', { color: '#6b7280', marginBottom: 24 }),
        button('Start Free Trial', '#', 'center', { backgroundColor: '#111827', borderRadius: 8, paddingX: 48, paddingY: 16, marginBottom: 48 }),
      ]

    // ─────────────────────────────────────────────────────────────────────
    // NOTIFICATIONS - Alerts and notifications
    // Only 2 templates - alert type is a property users can change in sidebar
    // ─────────────────────────────────────────────────────────────────────

    /**
     * notification-alert: Customizable alert box
     * Users can change alertType (info, success, warning, error) in properties
     */
    case 'notification-alert':
      return [
        alertCard({
          alertType: 'info',
          title: 'Important Update',
          message: 'We have made some changes to your account. Review them to make sure everything is correct.',
          buttonText: 'Review Changes',
          buttonHref: '#',
          marginTop: 24,
          marginBottom: 24,
        }),
      ]

    /**
     * notification-banner: Full-width announcement banner
     * Clean banner for important announcements
     */
    case 'notification-banner':
      return [
        heading('🎉 New Feature Available', 'h3', 'center', { color: '#111827', marginTop: 24, marginBottom: 8 }),
        text('We just launched something amazing. Click below to check it out.', 'center', { color: '#6b7280', marginBottom: 16 }),
        button('Learn More', '#', 'center', { backgroundColor: '#111827', borderRadius: 8, marginBottom: 24 }),
      ]

    // ─────────────────────────────────────────────────────────────────────
    // FOOTERS - Professional email footers
    // ─────────────────────────────────────────────────────────────────────

    /**
     * footer-simple: Clean minimal footer
     * Basic footer with company name and unsubscribe
     */
    case 'footer-simple':
      return [
        divider({ color: '#e5e7eb', marginTop: 32, marginBottom: 24 }),
        text('{{organization.name}}', 'center', { color: '#9ca3af', marginBottom: 8 }),
        text('Unsubscribe • Privacy Policy', 'center', { color: '#6b7280', marginBottom: 24 }),
      ]

    /**
     * footer-social: With social media links
     * Footer with social links row
     */
    case 'footer-social':
      return [
        divider({ color: '#e5e7eb', marginTop: 32, marginBottom: 24 }),
        text('Follow us: Twitter • LinkedIn • Instagram', 'center', { color: '#6b7280', marginBottom: 16 }),
        text('{{organization.name}}', 'center', { color: '#9ca3af', marginBottom: 8 }),
        text('Unsubscribe', 'center', { color: '#6b7280', marginBottom: 24 }),
      ]

    /**
     * footer-full: Complete with multiple sections
     * Full footer with links and company info
     */
    case 'footer-full':
      return [
        divider({ color: '#e5e7eb', marginTop: 32, marginBottom: 24 }),
        columns(
          [
            heading('{{organization.name}}', 'h3', 'left', { color: '#111827', marginBottom: 8 }),
            text('Making the world better.', 'left', { color: '#6b7280' }),
          ],
          [
            text('Help • Contact • Privacy • Terms', 'right', { color: '#6b7280' }),
          ],
          { gap: 32, marginBottom: 24 }
        ),
        divider({ color: '#e5e7eb', marginTop: 0, marginBottom: 16 }),
        text('© 2024 {{organization.name}}. All rights reserved.', 'center', { color: '#9ca3af', marginBottom: 8 }),
        text('Unsubscribe from these emails', 'center', { color: '#6b7280', marginBottom: 24 }),
      ]

    // ─────────────────────────────────────────────────────────────────────
    // WELCOME - Onboarding emails
    // ─────────────────────────────────────────────────────────────────────

    /**
     * welcome-personal: Warm personalized greeting
     * Friendly welcome with personal touch
     */
    case 'welcome-personal':
      return [
        heading('Hey {{lead.firstName}}! 👋', 'h1', 'center', { color: '#111827', marginTop: 32, marginBottom: 12 }),
        text("We're thrilled to have you here. Your account is all set up and ready to go.", 'center', { color: '#6b7280', marginBottom: 24 }),
        button('Get Started', '#', 'center', { backgroundColor: '#111827', borderRadius: 8, marginBottom: 32 }),
      ]

    /**
     * welcome-steps: Getting started steps
     * Numbered onboarding guide
     */
    case 'welcome-steps':
      return [
        heading("Let's Get You Started", 'h1', 'center', { color: '#111827', marginTop: 32, marginBottom: 8 }),
        text('Complete these 3 steps to get the most out of your account.', 'center', { color: '#6b7280', marginBottom: 24 }),
        featureCard({ icon: '1', title: 'Complete Your Profile', description: 'Add your details.', layout: 'horizontal', align: 'left', marginBottom: 12 }),
        featureCard({ icon: '2', title: 'Connect Integrations', description: 'Link your tools.', layout: 'horizontal', align: 'left', marginBottom: 12 }),
        featureCard({ icon: '3', title: 'Invite Your Team', description: 'Collaborate together.', layout: 'horizontal', align: 'left', marginBottom: 24 }),
        button('Start Setup', '#', 'center', { backgroundColor: '#111827', borderRadius: 8, marginBottom: 32 }),
      ]

    /**
     * welcome-benefits: What you get as a member
     * Benefits list welcome
     */
    case 'welcome-benefits':
      return [
        heading('Welcome to {{organization.name}}!', 'h1', 'center', { color: '#111827', marginTop: 32, marginBottom: 12 }),
        text('Here is what you get as a member:', 'center', { color: '#6b7280', marginBottom: 24 }),
        list({
          items: [
            { text: 'Unlimited access to all features' },
            { text: 'Priority customer support' },
            { text: 'Exclusive member content' },
            { text: 'Early access to new features' },
          ],
          iconType: 'check',
          iconColor: '#10b981',
          marginBottom: 24,
        }),
        button('Start Exploring', '#', 'center', { backgroundColor: '#111827', borderRadius: 8, marginBottom: 32 }),
      ]

    // ─────────────────────────────────────────────────────────────────────
    // TIMERS - Countdown timers for urgency
    // ─────────────────────────────────────────────────────────────────────

    /**
     * timer-boxes: Classic countdown boxes
     * Professional D:H:M:S layout
     */
    case 'timer-boxes':
      return [
        heading('Sale Ends In:', 'h2', 'center', { color: '#111827', marginTop: 32, marginBottom: 16 }),
        countdownTimer({
          style: 'boxes',
          digitColor: '#111827',
          labelColor: '#6b7280',
          separatorStyle: 'colon',
          borderRadius: 8,
          padding: 24,
          marginBottom: 24,
        }),
        button('Shop Now', '#', 'center', { backgroundColor: '#111827', borderRadius: 8, marginBottom: 32 }),
      ]

    /**
     * timer-minimal: Clean simple countdown
     * Modern minimalist approach
     */
    case 'timer-minimal':
      return [
        text('Offer ends in', 'center', { color: '#9ca3af', marginTop: 32, marginBottom: 12 }),
        countdownTimer({
          style: 'minimal',
          digitColor: '#111827',
          labelColor: '#9ca3af',
          separatorStyle: 'colon',
          borderRadius: 8,
          padding: 24,
          marginBottom: 20,
        }),
        button('View Offer', '#', 'center', { backgroundColor: '#111827', borderRadius: 8, marginBottom: 32 }),
      ]

    /**
     * timer-urgent: High urgency flash sale style
     * Red urgent styling for last-chance offers
     */
    case 'timer-urgent':
      return [
        heading('HURRY! Time is Running Out!', 'h1', 'center', { color: '#dc2626', marginTop: 32, marginBottom: 8 }),
        text('This flash sale ends when the timer hits zero.', 'center', { color: '#6b7280', marginBottom: 16 }),
        countdownTimer({
          style: 'boxes',
          digitColor: '#dc2626',
          labelColor: '#6b7280',
          separatorStyle: 'colon',
          borderRadius: 8,
          padding: 24,
          marginBottom: 20,
        }),
        button('GET IT NOW', '#', 'center', { backgroundColor: '#dc2626', borderRadius: 8, paddingX: 48, marginBottom: 32 }),
      ]

    // ─────────────────────────────────────────────────────────────────────
    // DEFAULT
    // ─────────────────────────────────────────────────────────────────────
    default:
      return []
  }
}

/**
 * Get a flat list of all template IDs for quick lookup.
 */
export function getAllTemplateIds(): string[] {
  return BLOCK_CATEGORIES.flatMap((cat) => cat.variants.map((v) => v.id))
}

/**
 * Find a template by ID.
 */
export function findTemplateById(
  templateId: string
): { category: BlockCategory; variant: TemplateVariant } | null {
  for (const category of BLOCK_CATEGORIES) {
    const variant = category.variants.find((v) => v.id === templateId)
    if (variant) {
      return { category, variant }
    }
  }
  return null
}
