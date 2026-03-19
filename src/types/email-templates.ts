/**
 * Email Template Types
 *
 * SOURCE OF TRUTH: Defines the block types and structures for the email template builder.
 * These types are used by:
 * - email-template.service.ts (CRUD + rendering)
 * - render-blocks.tsx (React Email renderer)
 * - Template editor UI components
 *
 * SOURCE OF TRUTH KEYWORDS: EmailBlock, EmailBlockType, EmailTemplateBlock
 *
 * BLOCK TYPES:
 * - heading: H1/H2/H3 headings with alignment
 * - text: Paragraph text with alignment
 * - button: Clickable button with link
 * - image: Image with source and alt text
 * - divider: Horizontal line separator
 * - spacer: Vertical spacing
 *
 * STYLING:
 * - Colors use hex values (not Tailwind) for email client compatibility
 * - Gradients rendered as CSS gradient strings
 * - Borders support solid colors and gradients
 *
 * VARIABLES:
 * Templates support {{variable}} syntax that's interpolated at send time
 * using the existing variable system from src/lib/variables/
 */

import type { EmailTemplate as PrismaEmailTemplate } from '@/generated/prisma'

// ============================================================================
// COLOR & GRADIENT TYPES (for email-specific styling)
// ============================================================================

/**
 * Gradient stop for email gradients.
 * SOURCE OF TRUTH KEYWORDS: EmailGradientStop
 */
export interface EmailGradientStop {
  /** Unique ID for this stop */
  id: string
  /** Color value - hex (#ffffff) */
  color: string
  /** Position along gradient axis (0-100 percentage) */
  position: number
}

/**
 * Gradient configuration for email blocks.
 * Simpler than website builder - emails only support linear gradients reliably.
 * SOURCE OF TRUTH KEYWORDS: EmailGradientConfig
 */
export interface EmailGradientConfig {
  /** Type of gradient - linear only for email compatibility */
  type: 'linear' | 'radial'
  /** Gradient stops (minimum 2 required) */
  stops: EmailGradientStop[]
  /** Angle in degrees (0-360) for linear gradients */
  angle?: number
  /** Radial shape (circle/ellipse) */
  radialShape?: 'circle' | 'ellipse'
  /** Radial position (x, y percentage) */
  radialPosition?: { x: number; y: number }
}

/**
 * Color fill configuration - solid color OR gradient.
 * SOURCE OF TRUTH KEYWORDS: EmailColorFill
 */
export interface EmailColorFill {
  /** Type of fill */
  type: 'solid' | 'gradient'
  /** Solid color value (hex) */
  color?: string
  /** Gradient configuration */
  gradient?: EmailGradientConfig
}

/**
 * Border style options.
 */
export type EmailBorderStyle = 'none' | 'solid' | 'dashed' | 'dotted'

/**
 * Border configuration for email blocks.
 * SOURCE OF TRUTH KEYWORDS: EmailBorderConfig
 */
export interface EmailBorderConfig {
  /** Border style */
  style: EmailBorderStyle
  /** Border width in pixels */
  width: number
  /** Border color (hex) or gradient */
  color: string
  /** Optional gradient for border */
  gradient?: EmailGradientConfig
  /** Border radius in pixels */
  radius?: number
}

// ============================================================================
// BLOCK TYPES
// ============================================================================

/**
 * Available block types for the email template builder.
 * Each type maps to a React Email component.
 *
 * BASIC BLOCKS:
 * - heading, text, button, image, divider, spacer, columns
 *
 * COMPOSITE BLOCKS (professional pre-designed components):
 * - list: Bullet/check list with items
 * - pricing-card: Complete pricing component
 * - testimonial-card: Quote with avatar
 * - feature-card: Icon + title + description
 * - stats-card: Large number with label
 * - alert-card: Notification/alert box
 * - countdown-timer: Real countdown timer with target date
 */
export type EmailBlockType =
  | 'heading'
  | 'text'
  | 'button'
  | 'image'
  | 'divider'
  | 'spacer'
  | 'columns'
  | 'list'
  | 'pricing-card'
  | 'testimonial-card'
  | 'feature-card'
  | 'stats-card'
  | 'alert-card'
  | 'countdown-timer'
  | 'social-proof'

/**
 * Text alignment options used across multiple block types.
 */
export type TextAlign = 'left' | 'center' | 'right'

/**
 * Heading level options for the heading block.
 */
export type HeadingLevel = 'h1' | 'h2' | 'h3'

// ============================================================================
// BASE BLOCK INTERFACE
// ============================================================================

/**
 * Base interface all blocks extend from.
 * id: Unique identifier for the block (used for reordering, selection)
 * type: Discriminator for the block type
 */
interface BaseBlock<T extends EmailBlockType> {
  id: string
  type: T
}

// ============================================================================
// BLOCK DEFINITIONS
// ============================================================================

/**
 * Common spacing properties for all blocks.
 * Allows fine control over margins and padding.
 * SOURCE OF TRUTH KEYWORDS: BlockSpacing
 */
export interface BlockSpacing {
  /** Margin top in pixels */
  marginTop?: number
  /** Margin bottom in pixels */
  marginBottom?: number
  /** Padding in pixels (all sides) */
  padding?: number
}

/**
 * Heading Block
 * Renders as H1, H2, or H3 with configurable alignment and styling.
 *
 * Example:
 * { id: '1', type: 'heading', props: { text: 'Welcome!', level: 'h1', align: 'center' } }
 */
export interface HeadingBlock extends BaseBlock<'heading'> {
  props: {
    /** The heading text content (supports variables like {{lead.firstName}}) */
    text: string
    /** Heading level: h1, h2, or h3 */
    level: HeadingLevel
    /** Text alignment */
    align: TextAlign
    /** Font size in pixels - defaults based on level (h1: 32, h2: 24, h3: 20) */
    fontSize?: number
    /** Text color (hex) - defaults to #1a1a1a */
    color?: string
    /** Text gradient (overrides color if set) */
    gradient?: EmailGradientConfig
    /** Background color (hex) */
    backgroundColor?: string
    /** Background gradient */
    backgroundGradient?: EmailGradientConfig
    /** Background image URL (from storage or external) */
    backgroundImage?: string
    /** Border configuration */
    border?: EmailBorderConfig
    /** Padding in pixels */
    padding?: number
    /** Margin top in pixels */
    marginTop?: number
    /** Margin bottom in pixels */
    marginBottom?: number
  }
}

/**
 * Text Block
 * Renders as a paragraph with configurable alignment and styling.
 * Supports multi-line text with automatic line break handling.
 *
 * Example:
 * { id: '2', type: 'text', props: { text: 'Hello {{lead.firstName}}!', align: 'left' } }
 */
export interface TextBlock extends BaseBlock<'text'> {
  props: {
    /** The paragraph text content (supports variables and line breaks) */
    text: string
    /** Text alignment */
    align: TextAlign
    /** Font size in pixels - defaults to 16 */
    fontSize?: number
    /** Text color (hex) - defaults to #374151 */
    color?: string
    /** Text gradient (overrides color if set) */
    gradient?: EmailGradientConfig
    /** Background color (hex) */
    backgroundColor?: string
    /** Background gradient */
    backgroundGradient?: EmailGradientConfig
    /** Background image URL (from storage or external) */
    backgroundImage?: string
    /** Border configuration */
    border?: EmailBorderConfig
    /** Padding in pixels */
    padding?: number
    /** Margin top in pixels */
    marginTop?: number
    /** Margin bottom in pixels */
    marginBottom?: number
  }
}

/**
 * Button Block
 * Renders as a clickable button with configurable styling.
 *
 * Example:
 * { id: '3', type: 'button', props: { text: 'Get Started', href: 'https://...', align: 'center' } }
 */
export interface ButtonBlock extends BaseBlock<'button'> {
  props: {
    /** Button text label */
    text: string
    /** URL the button links to */
    href: string
    /** Button alignment within container */
    align: TextAlign
    /** Font size in pixels - defaults to 16 */
    fontSize?: number
    /** Text color (hex) - defaults to #ffffff */
    textColor?: string
    /** Text gradient (overrides textColor if set) */
    textGradient?: EmailGradientConfig
    /** Background color (hex) - defaults to #2563eb */
    backgroundColor?: string
    /** Background gradient (overrides backgroundColor if set) */
    backgroundGradient?: EmailGradientConfig
    /** Border configuration */
    border?: EmailBorderConfig
    /** Border radius in pixels - defaults to 6 */
    borderRadius?: number
    /** Padding horizontal in pixels - defaults to 24 */
    paddingX?: number
    /** Padding vertical in pixels - defaults to 12 */
    paddingY?: number
    /** Margin top in pixels */
    marginTop?: number
    /** Margin bottom in pixels */
    marginBottom?: number
  }
}

/**
 * Image Block
 * Renders an image with optional width constraint and border.
 *
 * Example:
 * { id: '4', type: 'image', props: { src: 'https://...', alt: 'Logo', align: 'center' } }
 */
export interface ImageBlock extends BaseBlock<'image'> {
  props: {
    /** Image source URL */
    src: string
    /** Alt text for accessibility */
    alt: string
    /** Optional max width in pixels */
    width?: number
    /** Image alignment within container */
    align: TextAlign
    /** Border configuration */
    border?: EmailBorderConfig
    /** Border radius in pixels - defaults to 4 */
    borderRadius?: number
    /** Margin top in pixels */
    marginTop?: number
    /** Margin bottom in pixels */
    marginBottom?: number
  }
}

/**
 * Divider Block
 * Renders a horizontal line separator with customizable styling.
 *
 * Example:
 * { id: '5', type: 'divider', props: { color: '#e5e7eb', thickness: 1 } }
 */
export interface DividerBlock extends BaseBlock<'divider'> {
  props?: {
    /** Divider color (hex) - defaults to #e5e7eb */
    color?: string
    /** Gradient for divider (overrides color) */
    gradient?: EmailGradientConfig
    /** Divider thickness in pixels - defaults to 1 */
    thickness?: number
    /** Divider style */
    style?: 'solid' | 'dashed' | 'dotted'
    /** Margin top in pixels - defaults to 24 */
    marginTop?: number
    /** Margin bottom in pixels - defaults to 24 */
    marginBottom?: number
  }
}

/**
 * Spacer Block
 * Adds vertical spacing between blocks with optional background.
 *
 * Example:
 * { id: '6', type: 'spacer', props: { height: 32 } }
 */
export interface SpacerBlock extends BaseBlock<'spacer'> {
  props: {
    /** Height in pixels */
    height: number
    /** Background color (hex) */
    backgroundColor?: string
    /** Background gradient */
    backgroundGradient?: EmailGradientConfig
  }
}

/**
 * Column Container - A container that can hold any email blocks
 * Each column acts like a mini-canvas where blocks can be dragged and dropped.
 * SOURCE OF TRUTH KEYWORDS: ColumnContainer
 */
export interface ColumnContainer {
  /** Array of blocks within this column */
  blocks: EmailBlock[]
  /** Background color for column */
  backgroundColor?: string
  /** Background gradient for column */
  backgroundGradient?: EmailGradientConfig
  /** Background image URL (from storage or external) */
  backgroundImage?: string
  /** Border configuration for column */
  border?: EmailBorderConfig
  /** Padding inside column in pixels */
  padding?: number
}

/**
 * Columns Block
 * Renders a two-column layout using tables (for email compatibility).
 * Each column is a container that can hold any combination of blocks.
 * Users can drag and drop blocks into either column, just like the main canvas.
 *
 * SOURCE OF TRUTH KEYWORDS: ColumnsBlock, TwoColumnLayout
 *
 * Example:
 * { id: '7', type: 'columns', props: {
 *   leftColumn: { blocks: [...], backgroundColor: '#f5f5f5' },
 *   rightColumn: { blocks: [...] },
 *   gap: 24
 * }}
 */
export interface ColumnsBlock extends BaseBlock<'columns'> {
  props: {
    /** Left column container */
    leftColumn: ColumnContainer
    /** Right column container */
    rightColumn: ColumnContainer
    /** Gap between columns in pixels - defaults to 24 */
    gap?: number
    /** Column width ratio - defaults to 50/50 */
    leftWidth?: number
    /** Margin top in pixels */
    marginTop?: number
    /** Margin bottom in pixels */
    marginBottom?: number
  }
}

// ============================================================================
// COMPOSITE BLOCK TYPES
// These are professional, self-contained components that look complete on their own
// ============================================================================

/**
 * List item for ListBlock.
 * SOURCE OF TRUTH KEYWORDS: ListItem
 */
export interface ListItem {
  /** Unique ID for the item */
  id: string
  /** Item text content */
  text: string
  /** Optional icon type (check, bullet, x, arrow) */
  icon?: 'check' | 'bullet' | 'x' | 'arrow' | 'star'
}

/**
 * List Block
 * Renders a styled list with icons (checkmarks, bullets, etc).
 * Perfect for feature lists, benefits, steps, etc.
 *
 * SOURCE OF TRUTH KEYWORDS: ListBlock, FeatureList
 */
export interface ListBlock extends BaseBlock<'list'> {
  props: {
    /** Array of list items */
    items: ListItem[]
    /** Icon type for all items (can be overridden per item) */
    iconType: 'check' | 'bullet' | 'x' | 'arrow' | 'star'
    /** Icon color (hex) */
    iconColor?: string
    /** Icon gradient (overrides iconColor if set) */
    iconGradient?: EmailGradientConfig
    /** Text color (hex) */
    textColor?: string
    /** Text gradient (overrides textColor if set) */
    textGradient?: EmailGradientConfig
    /** Background color for the list container */
    backgroundColor?: string
    /** Border configuration */
    border?: EmailBorderConfig
    /** Padding in pixels */
    padding?: number
    /** Spacing between items in pixels */
    itemSpacing?: number
    /** Margin top in pixels */
    marginTop?: number
    /** Margin bottom in pixels */
    marginBottom?: number
  }
}

/**
 * Pricing Card Block
 * A complete, professional pricing component with:
 * - Plan name/tier
 * - Price with currency and billing period
 * - Feature list with checkmarks
 * - CTA button
 * - Optional "popular" badge
 *
 * SOURCE OF TRUTH KEYWORDS: PricingCardBlock, PricingComponent
 */
export interface PricingCardBlock extends BaseBlock<'pricing-card'> {
  props: {
    /** Plan/tier name */
    planName: string
    /** Price amount (just the number, e.g., "29") */
    price: string
    /** Currency symbol (e.g., "$") */
    currency?: string
    /** Billing period (e.g., "/month", "/year") */
    billingPeriod?: string
    /** Optional description under price */
    description?: string
    /** Array of feature texts */
    features: string[]
    /** CTA button text */
    buttonText: string
    /** CTA button link */
    buttonHref: string
    /** Whether to show "Popular" badge */
    isPopular?: boolean
    /** Theme color for the card (accent color) */
    accentColor?: string
    /** Accent gradient (overrides accentColor if set) */
    accentGradient?: EmailGradientConfig
    /** Background color */
    backgroundColor?: string
    /** Text color */
    textColor?: string
    /** Text gradient (overrides textColor if set) */
    textGradient?: EmailGradientConfig
    /** Border configuration */
    border?: EmailBorderConfig
    /** Border radius in pixels */
    borderRadius?: number
    /** Padding in pixels */
    padding?: number
    /** Margin top in pixels */
    marginTop?: number
    /** Margin bottom in pixels */
    marginBottom?: number
  }
}

/**
 * Testimonial Card Block
 * A professional testimonial/quote component with:
 * - Quote text
 * - Avatar image
 * - Person's name
 * - Role/title and company
 * - Optional star rating
 *
 * SOURCE OF TRUTH KEYWORDS: TestimonialCardBlock, QuoteCard
 */
export interface TestimonialCardBlock extends BaseBlock<'testimonial-card'> {
  props: {
    /** Quote text */
    quote: string
    /** Avatar image URL */
    avatarSrc?: string
    /** Person's name */
    authorName: string
    /** Role/title */
    authorRole?: string
    /** Company name */
    companyName?: string
    /** Star rating (1-5) */
    rating?: number
    /** Layout style */
    layout?: 'centered' | 'left-aligned' | 'card'
    /** Background color */
    backgroundColor?: string
    /** Text color */
    textColor?: string
    /** Text gradient (overrides textColor if set) */
    textGradient?: EmailGradientConfig
    /** Accent color for quote marks and rating stars */
    accentColor?: string
    /** Accent gradient (overrides accentColor if set) */
    accentGradient?: EmailGradientConfig
    /** Border configuration */
    border?: EmailBorderConfig
    /** Border radius in pixels */
    borderRadius?: number
    /** Padding in pixels */
    padding?: number
    /** Margin top in pixels */
    marginTop?: number
    /** Margin bottom in pixels */
    marginBottom?: number
  }
}

/**
 * Feature Card Block
 * A feature highlight component with:
 * - Icon (emoji or icon name)
 * - Title
 * - Description
 *
 * SOURCE OF TRUTH KEYWORDS: FeatureCardBlock
 */
export interface FeatureCardBlock extends BaseBlock<'feature-card'> {
  props: {
    /** Icon (emoji like "🚀" or icon name) */
    icon: string
    /** Feature title */
    title: string
    /** Feature description */
    description: string
    /** Layout style */
    layout?: 'vertical' | 'horizontal'
    /** Text alignment */
    align?: TextAlign
    /** Background color */
    backgroundColor?: string
    /** Title color */
    titleColor?: string
    /** Title gradient (overrides titleColor if set) */
    titleGradient?: EmailGradientConfig
    /** Description color */
    descriptionColor?: string
    /** Description gradient (overrides descriptionColor if set) */
    descriptionGradient?: EmailGradientConfig
    /** Icon size in pixels */
    iconSize?: number
    /** Border configuration */
    border?: EmailBorderConfig
    /** Border radius in pixels */
    borderRadius?: number
    /** Padding in pixels */
    padding?: number
    /** Margin top in pixels */
    marginTop?: number
    /** Margin bottom in pixels */
    marginBottom?: number
  }
}

/**
 * Stats Card Block
 * Display a statistic/metric with:
 * - Large number/value
 * - Label/description
 * - Optional icon
 *
 * SOURCE OF TRUTH KEYWORDS: StatsCardBlock, MetricCard
 */
export interface StatsCardBlock extends BaseBlock<'stats-card'> {
  props: {
    /** The stat value (e.g., "10K+", "99.9%", "$1M") */
    value: string
    /** Label describing the stat */
    label: string
    /** Optional icon/emoji */
    icon?: string
    /** Value color */
    valueColor?: string
    /** Value gradient (overrides valueColor if set) */
    valueGradient?: EmailGradientConfig
    /** Label color */
    labelColor?: string
    /** Label gradient (overrides labelColor if set) */
    labelGradient?: EmailGradientConfig
    /** Background color */
    backgroundColor?: string
    /** Text alignment */
    align?: TextAlign
    /** Border configuration */
    border?: EmailBorderConfig
    /** Border radius in pixels */
    borderRadius?: number
    /** Padding in pixels */
    padding?: number
    /** Margin top in pixels */
    marginTop?: number
    /** Margin bottom in pixels */
    marginBottom?: number
  }
}

/**
 * Alert type for styling
 */
export type AlertType = 'info' | 'success' | 'warning' | 'error'

/**
 * Alert Card Block
 * A notification/alert component for:
 * - Info messages
 * - Success confirmations
 * - Warnings
 * - Error messages
 *
 * SOURCE OF TRUTH KEYWORDS: AlertCardBlock, NotificationBlock
 */
export interface AlertCardBlock extends BaseBlock<'alert-card'> {
  props: {
    /** Alert type determines icon and default colors */
    alertType: AlertType
    /** Alert title */
    title?: string
    /** Alert message */
    message: string
    /** Optional CTA button text */
    buttonText?: string
    /** Optional CTA button link */
    buttonHref?: string
    /** Override background color */
    backgroundColor?: string
    /** Override text color */
    textColor?: string
    /** Text gradient (overrides textColor if set) */
    textGradient?: EmailGradientConfig
    /** Border configuration */
    border?: EmailBorderConfig
    /** Border radius in pixels */
    borderRadius?: number
    /** Padding in pixels */
    padding?: number
    /** Margin top in pixels */
    marginTop?: number
    /** Margin bottom in pixels */
    marginBottom?: number
  }
}

/**
 * Countdown timer display style options.
 * SOURCE OF TRUTH KEYWORDS: CountdownTimerStyle
 */
export type CountdownTimerStyle = 'boxes' | 'inline' | 'minimal' | 'circular'

/**
 * Separator style between timer digits.
 * SOURCE OF TRUTH KEYWORDS: CountdownSeparatorStyle
 */
export type CountdownSeparatorStyle = 'colon' | 'none' | 'text'

/**
 * Countdown Timer Block
 * A real countdown timer component that calculates time remaining
 * until a target date. Perfect for:
 * - Flash sales and limited-time offers
 * - Event countdowns
 * - Deadline reminders
 * - Product launches
 *
 * Note: Since emails are static, the timer shows time remaining at the
 * moment the email is rendered. For dynamic countdowns, consider using
 * a timer image service or link to a live countdown page.
 *
 * SOURCE OF TRUTH KEYWORDS: CountdownTimerBlock, TimerBlock
 */
export interface CountdownTimerBlock extends BaseBlock<'countdown-timer'> {
  props: {
    /** Target date in ISO format (e.g., "2024-12-31T23:59:59Z") */
    targetDate: string
    /** Whether to show days in the countdown */
    showDays: boolean
    /** Whether to show hours in the countdown */
    showHours: boolean
    /** Whether to show minutes in the countdown */
    showMinutes: boolean
    /** Whether to show seconds in the countdown */
    showSeconds: boolean
    /** Message to display when countdown expires */
    expiredMessage: string
    /** Visual style of the timer */
    style: CountdownTimerStyle
    /** Color for the digit numbers (hex) */
    digitColor: string
    /** Digit gradient (overrides digitColor if set) */
    digitGradient?: EmailGradientConfig
    /** Color for the unit labels (hex) */
    labelColor: string
    /** Label gradient (overrides labelColor if set) */
    labelGradient?: EmailGradientConfig
    /** Background color for the timer container (hex) */
    backgroundColor: string
    /** Style of separator between time units */
    separatorStyle: CountdownSeparatorStyle
    /** Optional separator color (hex) - defaults to digitColor */
    separatorColor?: string
    /** Separator gradient (overrides separatorColor if set) */
    separatorGradient?: EmailGradientConfig
    /** Text alignment */
    align?: TextAlign
    /** Border configuration */
    border?: EmailBorderConfig
    /** Border radius in pixels */
    borderRadius?: number
    /** Padding in pixels */
    padding?: number
    /** Margin top in pixels */
    marginTop?: number
    /** Margin bottom in pixels */
    marginBottom?: number
  }
}

/**
 * Social Proof Block
 * A beautiful social proof component with:
 * - Overlapping avatar stack (up to 5 avatars)
 * - Large number/metric display
 * - Supporting text
 * - Optional CTA button
 *
 * Perfect for "7000+ creators worldwide" style displays.
 *
 * SOURCE OF TRUTH KEYWORDS: SocialProofBlock, AvatarStack
 */
export interface SocialProofBlock extends BaseBlock<'social-proof'> {
  props: {
    /** Array of avatar image URLs (renders as overlapping stack) */
    avatars: string[]
    /** The main number/metric to display (e.g., "7,000+", "10K+") */
    metric: string
    /** Text below the metric (e.g., "creators worldwide") */
    metricLabel: string
    /** Optional heading above the avatars */
    heading?: string
    /** Optional subheading below heading */
    subheading?: string
    /** Layout style */
    layout?: 'horizontal' | 'vertical' | 'centered'
    /** Size of avatars in pixels */
    avatarSize?: number
    /** Overlap amount for avatars (negative margin, in pixels) */
    avatarOverlap?: number
    /** Border color for avatars */
    avatarBorderColor?: string
    /** Metric text color */
    metricColor?: string
    /** Metric gradient (overrides metricColor if set) */
    metricGradient?: EmailGradientConfig
    /** Metric label text color */
    labelColor?: string
    /** Label gradient (overrides labelColor if set) */
    labelGradient?: EmailGradientConfig
    /** Heading color */
    headingColor?: string
    /** Heading gradient (overrides headingColor if set) */
    headingGradient?: EmailGradientConfig
    /** Subheading color */
    subheadingColor?: string
    /** Subheading gradient (overrides subheadingColor if set) */
    subheadingGradient?: EmailGradientConfig
    /** Background color */
    backgroundColor?: string
    /** Border configuration */
    border?: EmailBorderConfig
    /** Border radius in pixels */
    borderRadius?: number
    /** Padding in pixels */
    padding?: number
    /** Margin top in pixels */
    marginTop?: number
    /** Margin bottom in pixels */
    marginBottom?: number
  }
}

// ============================================================================
// UNION TYPE
// ============================================================================

/**
 * Union type of all possible email blocks.
 * Use this type when working with an array of blocks (template content).
 */
export type EmailBlock =
  | HeadingBlock
  | TextBlock
  | ButtonBlock
  | ImageBlock
  | DividerBlock
  | SpacerBlock
  | ColumnsBlock
  | ListBlock
  | PricingCardBlock
  | TestimonialCardBlock
  | FeatureCardBlock
  | StatsCardBlock
  | AlertCardBlock
  | CountdownTimerBlock
  | SocialProofBlock

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if a block is a heading block.
 */
export function isHeadingBlock(block: EmailBlock): block is HeadingBlock {
  return block.type === 'heading'
}

/**
 * Type guard to check if a block is a text block.
 */
export function isTextBlock(block: EmailBlock): block is TextBlock {
  return block.type === 'text'
}

/**
 * Type guard to check if a block is a button block.
 */
export function isButtonBlock(block: EmailBlock): block is ButtonBlock {
  return block.type === 'button'
}

/**
 * Type guard to check if a block is an image block.
 */
export function isImageBlock(block: EmailBlock): block is ImageBlock {
  return block.type === 'image'
}

/**
 * Type guard to check if a block is a divider block.
 */
export function isDividerBlock(block: EmailBlock): block is DividerBlock {
  return block.type === 'divider'
}

/**
 * Type guard to check if a block is a spacer block.
 */
export function isSpacerBlock(block: EmailBlock): block is SpacerBlock {
  return block.type === 'spacer'
}

/**
 * Type guard to check if a block is a columns block.
 */
export function isColumnsBlock(block: EmailBlock): block is ColumnsBlock {
  return block.type === 'columns'
}

/**
 * Type guard to check if a block is a list block.
 */
export function isListBlock(block: EmailBlock): block is ListBlock {
  return block.type === 'list'
}

/**
 * Type guard to check if a block is a pricing card block.
 */
export function isPricingCardBlock(block: EmailBlock): block is PricingCardBlock {
  return block.type === 'pricing-card'
}

/**
 * Type guard to check if a block is a testimonial card block.
 */
export function isTestimonialCardBlock(block: EmailBlock): block is TestimonialCardBlock {
  return block.type === 'testimonial-card'
}

/**
 * Type guard to check if a block is a feature card block.
 */
export function isFeatureCardBlock(block: EmailBlock): block is FeatureCardBlock {
  return block.type === 'feature-card'
}

/**
 * Type guard to check if a block is a stats card block.
 */
export function isStatsCardBlock(block: EmailBlock): block is StatsCardBlock {
  return block.type === 'stats-card'
}

/**
 * Type guard to check if a block is an alert card block.
 */
export function isAlertCardBlock(block: EmailBlock): block is AlertCardBlock {
  return block.type === 'alert-card'
}

/**
 * Type guard to check if a block is a countdown timer block.
 */
export function isCountdownTimerBlock(block: EmailBlock): block is CountdownTimerBlock {
  return block.type === 'countdown-timer'
}

// ============================================================================
// EMAIL SETTINGS (Canvas/Container Settings)
// ============================================================================

/**
 * Email canvas/container settings.
 * These apply to the email wrapper/container itself, not individual blocks.
 * Stored alongside blocks in the template content JSON.
 *
 * SOURCE OF TRUTH KEYWORDS: EmailSettings, CanvasSettings, EmailContainerSettings
 */
export interface EmailSettings {
  /** Background color for the email body (outside container) */
  bodyBackgroundColor: string
  /** Gradient config for email body background (takes precedence over solid color) */
  bodyBackgroundGradient?: EmailGradientConfig
  /** Background color for the email container */
  containerBackgroundColor: string
  /** Gradient config for container background (takes precedence over solid color) */
  containerBackgroundGradient?: EmailGradientConfig
  /** Container padding in pixels */
  containerPadding: number
  /** Container border radius in pixels */
  containerBorderRadius: number
  /** Container max width in pixels */
  containerMaxWidth: number
}

/**
 * Default email settings used when none are provided.
 */
export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  bodyBackgroundColor: '#f9fafb',
  containerBackgroundColor: '#ffffff',
  containerPadding: 32,
  containerBorderRadius: 12,
  containerMaxWidth: 600,
}

// ============================================================================
// TEMPLATE TYPES (Derived from Prisma)
// ============================================================================

/**
 * Email template with parsed content.
 * Extends Prisma type with properly typed content field.
 *
 * The content can be either:
 * - EmailBlock[] (legacy format - just blocks)
 * - { blocks: EmailBlock[], emailSettings?: EmailSettings } (new format)
 *
 * The service layer normalizes this to always provide both blocks and emailSettings.
 */
export interface EmailTemplateWithBlocks extends Omit<PrismaEmailTemplate, 'content'> {
  /** Parsed array of email blocks */
  content: EmailBlock[]
  /** Email container/canvas settings (parsed from content JSON) */
  emailSettings?: EmailSettings
}

/**
 * Input for creating a new email template.
 */
export interface CreateEmailTemplateInput {
  organizationId: string
  name: string
  description?: string
  subject: string
  content: EmailBlock[]
  /** Email container/canvas settings */
  emailSettings?: EmailSettings
  /** Folder to place template in (null = root) */
  folderId?: string | null
}

/**
 * Input for updating an email template.
 */
export interface UpdateEmailTemplateInput {
  organizationId: string
  templateId: string
  name?: string
  description?: string
  subject?: string
  content?: EmailBlock[]
  /** Email container/canvas settings */
  emailSettings?: EmailSettings
  /** Move template to a different folder (null = root) */
  folderId?: string | null
}

/**
 * Input for listing email templates with pagination.
 */
export interface ListEmailTemplatesInput {
  organizationId: string
  page?: number
  pageSize?: number
  search?: string
  /** Filter by folder (null = root, undefined = all) */
  folderId?: string | null
}

// ============================================================================
// DEFAULT BLOCK FACTORIES
// ============================================================================

/**
 * Generate a unique block ID.
 */
export function generateBlockId(): string {
  return `block_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Create a default heading block.
 */
export function createHeadingBlock(text = 'Heading'): HeadingBlock {
  return {
    id: generateBlockId(),
    type: 'heading',
    props: { text, level: 'h1', align: 'left' },
  }
}

/**
 * Create a default text block.
 */
export function createTextBlock(text = 'Enter your text here...'): TextBlock {
  return {
    id: generateBlockId(),
    type: 'text',
    props: { text, align: 'left' },
  }
}

/**
 * Create a default button block.
 */
export function createButtonBlock(text = 'Click Here', href = '#'): ButtonBlock {
  return {
    id: generateBlockId(),
    type: 'button',
    props: { text, href, align: 'center' },
  }
}

/**
 * Create a default image block.
 */
export function createImageBlock(src = '', alt = 'Image'): ImageBlock {
  return {
    id: generateBlockId(),
    type: 'image',
    props: { src, alt, align: 'center' },
  }
}

/**
 * Create a divider block.
 */
export function createDividerBlock(): DividerBlock {
  return {
    id: generateBlockId(),
    type: 'divider',
  }
}

/**
 * Create a spacer block.
 */
export function createSpacerBlock(height = 24): SpacerBlock {
  return {
    id: generateBlockId(),
    type: 'spacer',
    props: { height },
  }
}

/**
 * Create a columns block with empty containers.
 * Users can drag and drop any blocks into each column.
 */
export function createColumnsBlock(): ColumnsBlock {
  return {
    id: generateBlockId(),
    type: 'columns',
    props: {
      leftColumn: {
        blocks: [],
      },
      rightColumn: {
        blocks: [],
      },
      gap: 24,
      leftWidth: 50,
    },
  }
}

/**
 * Create a list block with sample items.
 */
export function createListBlock(): ListBlock {
  return {
    id: generateBlockId(),
    type: 'list',
    props: {
      items: [
        { id: generateBlockId(), text: 'First item' },
        { id: generateBlockId(), text: 'Second item' },
        { id: generateBlockId(), text: 'Third item' },
      ],
      iconType: 'check',
      iconColor: '#10b981',
      textColor: '#374151',
      padding: 16,
      itemSpacing: 12,
    },
  }
}

/**
 * Create a pricing card block with default values.
 */
export function createPricingCardBlock(): PricingCardBlock {
  return {
    id: generateBlockId(),
    type: 'pricing-card',
    props: {
      planName: 'Professional',
      price: '29',
      currency: '$',
      billingPeriod: '/month',
      description: 'Perfect for growing businesses',
      features: [
        'Unlimited projects',
        'Priority support',
        'Advanced analytics',
        'Custom integrations',
      ],
      buttonText: 'Get Started',
      buttonHref: '#',
      accentColor: '#2563eb',
      backgroundColor: '#ffffff',
      textColor: '#1f2937',
      borderRadius: 12,
      padding: 32,
    },
  }
}

/**
 * Create a testimonial card block with default values.
 */
export function createTestimonialCardBlock(): TestimonialCardBlock {
  return {
    id: generateBlockId(),
    type: 'testimonial-card',
    props: {
      quote: 'This product has completely transformed how we work. The results speak for themselves.',
      authorName: 'Sarah Johnson',
      authorRole: 'CEO',
      companyName: 'TechCorp',
      rating: 5,
      layout: 'centered',
      backgroundColor: '#f9fafb',
      textColor: '#1f2937',
      accentColor: '#f59e0b',
      borderRadius: 12,
      padding: 32,
    },
  }
}

/**
 * Create a feature card block with default values.
 */
export function createFeatureCardBlock(): FeatureCardBlock {
  return {
    id: generateBlockId(),
    type: 'feature-card',
    props: {
      icon: '🚀',
      title: 'Lightning Fast',
      description: 'Experience blazing fast performance with our optimized infrastructure.',
      layout: 'vertical',
      align: 'center',
      backgroundColor: '#ffffff',
      titleColor: '#1f2937',
      descriptionColor: '#6b7280',
      iconSize: 48,
      borderRadius: 12,
      padding: 24,
    },
  }
}

/**
 * Create a stats card block with default values.
 */
export function createStatsCardBlock(): StatsCardBlock {
  return {
    id: generateBlockId(),
    type: 'stats-card',
    props: {
      value: '10K+',
      label: 'Happy Customers',
      icon: '👥',
      valueColor: '#1f2937',
      labelColor: '#6b7280',
      backgroundColor: '#ffffff',
      align: 'center',
      borderRadius: 12,
      padding: 24,
    },
  }
}

/**
 * Create an alert card block with default values.
 */
export function createAlertCardBlock(alertType: AlertType = 'info'): AlertCardBlock {
  return {
    id: generateBlockId(),
    type: 'alert-card',
    props: {
      alertType,
      title: alertType === 'success' ? 'Success!' : alertType === 'warning' ? 'Warning' : alertType === 'error' ? 'Error' : 'Information',
      message: 'This is an important notification that requires your attention.',
      borderRadius: 8,
      padding: 16,
    },
  }
}

/**
 * Create a countdown timer block with default values.
 * Sets target date to 7 days from now by default.
 */
export function createCountdownTimerBlock(
  style: CountdownTimerStyle = 'boxes'
): CountdownTimerBlock {
  // Default target date is 7 days from now
  const targetDate = new Date()
  targetDate.setDate(targetDate.getDate() + 7)

  return {
    id: generateBlockId(),
    type: 'countdown-timer',
    props: {
      targetDate: targetDate.toISOString(),
      showDays: true,
      showHours: true,
      showMinutes: true,
      showSeconds: true,
      expiredMessage: 'This offer has expired',
      style,
      digitColor: '#1f2937',
      labelColor: '#6b7280',
      backgroundColor: '#f3f4f6',
      separatorStyle: 'colon',
      align: 'center',
      borderRadius: 8,
      padding: 24,
    },
  }
}

// ============================================================================
// BLOCK METADATA (for UI)
// ============================================================================

/**
 * Metadata for each block type, used in the UI for labels and icons.
 */
export const BLOCK_METADATA: Record<
  EmailBlockType,
  { label: string; description: string; icon: string }
> = {
  heading: {
    label: 'Heading',
    description: 'Add a title or section header',
    icon: 'Heading',
  },
  text: {
    label: 'Text',
    description: 'Add paragraph text',
    icon: 'AlignLeft',
  },
  button: {
    label: 'Button',
    description: 'Add a clickable button',
    icon: 'MousePointerClick',
  },
  image: {
    label: 'Image',
    description: 'Add an image',
    icon: 'Image',
  },
  divider: {
    label: 'Divider',
    description: 'Add a horizontal line',
    icon: 'Minus',
  },
  spacer: {
    label: 'Spacer',
    description: 'Add vertical spacing',
    icon: 'MoveVertical',
  },
  columns: {
    label: 'Columns',
    description: 'Two-column layout',
    icon: 'Columns2',
  },
  list: {
    label: 'List',
    description: 'Bullet or checklist',
    icon: 'List',
  },
  'pricing-card': {
    label: 'Pricing Card',
    description: 'Complete pricing component',
    icon: 'CreditCard',
  },
  'testimonial-card': {
    label: 'Testimonial',
    description: 'Customer quote card',
    icon: 'Quote',
  },
  'feature-card': {
    label: 'Feature Card',
    description: 'Feature highlight',
    icon: 'Star',
  },
  'stats-card': {
    label: 'Stats Card',
    description: 'Metric display',
    icon: 'BarChart3',
  },
  'alert-card': {
    label: 'Alert',
    description: 'Notification message',
    icon: 'Bell',
  },
  'countdown-timer': {
    label: 'Countdown Timer',
    description: 'Countdown to target date',
    icon: 'Timer',
  },
  'social-proof': {
    label: 'Social Proof',
    description: 'Avatar stack with metrics',
    icon: 'Users',
  },
}
