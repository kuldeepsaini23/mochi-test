/**
 * Email Block Renderer
 *
 * Converts EmailBlock[] to HTML using React Email components.
 * This is the core rendering engine for email templates.
 *
 * SOURCE OF TRUTH KEYWORDS: RenderBlocks, EmailRenderer, BlockToHtml
 *
 * ARCHITECTURE:
 * 1. React components render blocks to React Email components
 * 2. render() from @react-email/render converts to HTML string
 * 3. Variables remain as {{variable}} - interpolation happens at send time
 *
 * STYLING:
 * - Colors use hex values for email client compatibility
 * - Gradients rendered as CSS gradient strings
 * - Borders support solid colors and gradients
 *
 * USAGE:
 * const html = await renderBlocksToHtml(blocks)
 */

import * as React from 'react'
import { render } from '@react-email/render'
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Heading,
  Button,
  Img,
  Hr,
  Preview,
} from '@react-email/components'

import type {
  EmailBlock,
  HeadingBlock,
  TextBlock,
  ButtonBlock,
  ImageBlock,
  DividerBlock,
  SpacerBlock,
  ColumnsBlock,
  ColumnContainer,
  TextAlign,
  EmailGradientConfig,
  EmailBorderConfig,
  ListBlock,
  PricingCardBlock,
  TestimonialCardBlock,
  FeatureCardBlock,
  StatsCardBlock,
  AlertCardBlock,
  AlertType,
  EmailSettings,
  CountdownTimerBlock,
  CountdownTimerStyle,
  CountdownSeparatorStyle,
  SocialProofBlock,
} from '@/types/email-templates'

import { DEFAULT_EMAIL_SETTINGS } from '@/types/email-templates'

// ============================================================================
// STYLE UTILITIES
// ============================================================================

/**
 * Convert gradient config to CSS string.
 * Returns the first color as fallback for Outlook.
 */
function gradientToCSS(config: EmailGradientConfig): string {
  const sortedStops = [...config.stops].sort((a, b) => a.position - b.position)
  const stopsString = sortedStops.map((stop) => `${stop.color} ${stop.position}%`).join(', ')

  if (config.type === 'linear') {
    const angle = config.angle ?? 180
    return `linear-gradient(${angle}deg, ${stopsString})`
  } else {
    const shape = config.radialShape ?? 'ellipse'
    const posX = config.radialPosition?.x ?? 50
    const posY = config.radialPosition?.y ?? 50
    return `radial-gradient(${shape} at ${posX}% ${posY}%, ${stopsString})`
  }
}

/**
 * Get fallback color from gradient (first stop).
 */
function getGradientFallback(config: EmailGradientConfig): string {
  if (config.stops.length === 0) return '#000000'
  const sorted = [...config.stops].sort((a, b) => a.position - b.position)
  return sorted[0].color
}

/**
 * Get border style for email blocks.
 */
function getBorderStyle(border?: EmailBorderConfig): React.CSSProperties {
  if (!border || border.style === 'none' || border.width === 0) {
    return {}
  }

  // For gradient borders, use the first color as fallback (gradient borders need JS)
  const color = border.gradient ? getGradientFallback(border.gradient) : border.color

  return {
    border: `${border.width}px ${border.style} ${color}`,
    borderRadius: border.radius ? `${border.radius}px` : undefined,
  }
}

/**
 * Get background style (solid, gradient, or image).
 * Background image takes precedence over gradient, which takes precedence over solid color.
 */
function getBackgroundStyle(
  color?: string,
  gradient?: EmailGradientConfig,
  backgroundImage?: string
): React.CSSProperties {
  const style: React.CSSProperties = {}

  // Base color (lowest priority)
  if (color && color !== 'transparent') {
    style.backgroundColor = color
  }

  // Gradient (medium priority)
  if (gradient) {
    style.background = gradientToCSS(gradient)
    // Fallback for Outlook
    style.backgroundColor = getGradientFallback(gradient)
  }

  // Background image (highest priority)
  if (backgroundImage) {
    style.backgroundImage = `url(${backgroundImage})`
    style.backgroundSize = 'cover'
    style.backgroundPosition = 'center'
    style.backgroundRepeat = 'no-repeat'
  }

  return style
}

// ============================================================================
// STYLE GENERATORS
// ============================================================================

/**
 * Generate container styles based on emailSettings.
 * Uses provided settings or falls back to defaults.
 *
 * WHY: Email templates need customizable styling for body and container
 * backgrounds, padding, border radius, and max width.
 *
 * SOURCE OF TRUTH KEYWORDS: EmailContainerStyle, EmailSettingsStyle
 */
function getContainerStyles(settings: EmailSettings): {
  bodyStyle: React.CSSProperties
  containerStyle: React.CSSProperties
} {
  // Body style (background for the entire email, outside container)
  const bodyStyle: React.CSSProperties = {
    margin: 0,
    padding: '40px 0',
  }

  // Apply body background color or gradient
  if (settings.bodyBackgroundGradient) {
    bodyStyle.background = gradientToCSS(settings.bodyBackgroundGradient)
    bodyStyle.backgroundColor = getGradientFallback(settings.bodyBackgroundGradient)
  } else {
    bodyStyle.backgroundColor = settings.bodyBackgroundColor
  }

  // Container style (the main content area)
  const containerStyle: React.CSSProperties = {
    maxWidth: `${settings.containerMaxWidth}px`,
    margin: '0 auto',
    padding: `${settings.containerPadding}px`,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    borderRadius: `${settings.containerBorderRadius}px`,
  }

  // Apply container background color or gradient
  if (settings.containerBackgroundGradient) {
    containerStyle.background = gradientToCSS(settings.containerBackgroundGradient)
    containerStyle.backgroundColor = getGradientFallback(settings.containerBackgroundGradient)
  } else {
    containerStyle.backgroundColor = settings.containerBackgroundColor
  }

  return { bodyStyle, containerStyle }
}

/**
 * Map text alignment to CSS property.
 */
function getAlignStyle(align: TextAlign): React.CSSProperties {
  return { textAlign: align }
}

// ============================================================================
// INDIVIDUAL BLOCK RENDERERS
// ============================================================================

/**
 * Render a heading block.
 * Applies custom colors, backgrounds, borders, and padding from block props.
 */
function renderHeading(block: HeadingBlock): React.ReactElement {
  const {
    text,
    level,
    align,
    color,
    gradient,
    backgroundColor,
    backgroundGradient,
    backgroundImage,
    border,
    padding,
  } = block.props

  // Map heading level to component prop
  const asTag = level

  // Get text color - gradients use first color as fallback (email clients don't support text gradients)
  const textColor = gradient ? getGradientFallback(gradient) : color ?? '#1a1a1a'

  // Build container style for background and border
  const containerStyle: React.CSSProperties = {
    ...getBackgroundStyle(backgroundColor, backgroundGradient, backgroundImage),
    ...getBorderStyle(border),
    ...(padding ? { padding: `${padding}px` } : {}),
  }

  // Check if we need a container wrapper (for background/border/image)
  const needsContainer = backgroundColor || backgroundGradient || backgroundImage || border || padding

  const headingElement = (
    <Heading
      key={block.id}
      as={asTag}
      style={{
        ...getAlignStyle(align),
        margin: needsContainer ? '0' : '0 0 16px 0',
        color: textColor,
        fontWeight: 600,
        ...(level === 'h1' && { fontSize: '32px', lineHeight: '40px' }),
        ...(level === 'h2' && { fontSize: '24px', lineHeight: '32px' }),
        ...(level === 'h3' && { fontSize: '20px', lineHeight: '28px' }),
      }}
    >
      {text}
    </Heading>
  )

  // Wrap in container if we have background/border styling
  if (needsContainer) {
    return (
      <Section key={block.id} style={{ margin: '0 0 16px 0', ...containerStyle }}>
        {headingElement}
      </Section>
    )
  }

  return headingElement
}

/**
 * Render a text block.
 * Handles newlines by converting them to <br /> tags.
 * Applies custom colors, backgrounds, borders, and padding from block props.
 */
function renderText(block: TextBlock): React.ReactElement {
  const {
    text,
    align,
    color,
    gradient,
    backgroundColor,
    backgroundGradient,
    backgroundImage,
    border,
    padding,
  } = block.props

  // Split by newlines and join with <br />
  const lines = text.split('\n')

  // Get text color - gradients use first color as fallback (email clients don't support text gradients)
  const textColor = gradient ? getGradientFallback(gradient) : color ?? '#374151'

  // Build container style for background and border
  const containerStyle: React.CSSProperties = {
    ...getBackgroundStyle(backgroundColor, backgroundGradient, backgroundImage),
    ...getBorderStyle(border),
    ...(padding ? { padding: `${padding}px` } : {}),
  }

  // Check if we need a container wrapper (for background/border/image)
  const needsContainer = backgroundColor || backgroundGradient || backgroundImage || border || padding

  const textElement = (
    <Text
      key={block.id}
      style={{
        ...getAlignStyle(align),
        margin: needsContainer ? '0' : '0 0 16px 0',
        fontSize: '16px',
        lineHeight: '24px',
        color: textColor,
      }}
    >
      {lines.map((line, index) => (
        <React.Fragment key={index}>
          {line}
          {index < lines.length - 1 && <br />}
        </React.Fragment>
      ))}
    </Text>
  )

  // Wrap in container if we have background/border styling
  if (needsContainer) {
    return (
      <Section key={block.id} style={{ margin: '0 0 16px 0', ...containerStyle }}>
        {textElement}
      </Section>
    )
  }

  return textElement
}

/**
 * Render a button block.
 * Applies custom colors, backgrounds, borders, and padding from block props.
 */
function renderButton(block: ButtonBlock): React.ReactElement {
  const {
    text,
    href,
    align,
    textColor,
    backgroundColor,
    backgroundGradient,
    border,
    borderRadius,
    paddingX,
    paddingY,
  } = block.props

  // Get background color - use gradient fallback if gradient is set
  const bgColor = backgroundGradient
    ? getGradientFallback(backgroundGradient)
    : backgroundColor ?? '#2563eb'

  // Build button style with customizations
  const buttonStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: `${paddingY ?? 12}px ${paddingX ?? 24}px`,
    backgroundColor: bgColor,
    color: textColor ?? '#ffffff',
    fontSize: '16px',
    fontWeight: 500,
    textDecoration: 'none',
    borderRadius: `${borderRadius ?? 6}px`,
    // Apply background gradient if set
    ...(backgroundGradient && { background: gradientToCSS(backgroundGradient) }),
    // Apply border if set (excluding the radius which we already handle)
    ...(border &&
      border.style !== 'none' &&
      border.width > 0 && {
        border: `${border.width}px ${border.style} ${
          border.gradient ? getGradientFallback(border.gradient) : border.color
        }`,
      }),
  }

  return (
    <Section key={block.id} style={{ margin: '0 0 16px 0' }}>
      <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
        <tr>
          <td align={align}>
            <Button href={href} style={buttonStyle}>
              {text}
            </Button>
          </td>
        </tr>
      </table>
    </Section>
  )
}

/**
 * Render an image block.
 * Applies custom borders and border radius from block props.
 */
function renderImage(block: ImageBlock): React.ReactElement {
  const { src, alt, width, align, border, borderRadius } = block.props

  // Skip rendering if no source
  if (!src) {
    return <React.Fragment key={block.id} />
  }

  // Build image style with custom border and radius
  const imageStyle: React.CSSProperties = {
    maxWidth: '100%',
    height: 'auto',
    borderRadius: `${borderRadius ?? 4}px`,
    ...getBorderStyle(border),
  }

  return (
    <Section key={block.id} style={{ margin: '0 0 16px 0' }}>
      <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
        <tr>
          <td align={align}>
            <Img src={src} alt={alt} width={width} style={imageStyle} />
          </td>
        </tr>
      </table>
    </Section>
  )
}

/**
 * Render a divider block.
 * Applies custom color, thickness, style, and spacing from block props.
 */
function renderDivider(block: DividerBlock): React.ReactElement {
  const props = block.props ?? {}
  const {
    color,
    gradient,
    thickness = 1,
    style = 'solid',
    marginTop = 24,
    marginBottom = 24,
  } = props

  // Get divider color - gradients use first color as fallback
  const dividerColor = gradient ? getGradientFallback(gradient) : color ?? '#e5e7eb'

  return (
    <Hr
      key={block.id}
      style={{
        margin: `${marginTop}px 0 ${marginBottom}px 0`,
        borderTop: `${thickness}px ${style} ${dividerColor}`,
        borderBottom: 'none',
        borderLeft: 'none',
        borderRight: 'none',
      }}
    />
  )
}

/**
 * Render a spacer block.
 * Applies optional background color from block props.
 */
function renderSpacer(block: SpacerBlock): React.ReactElement {
  const { height, backgroundColor, backgroundGradient } = block.props

  // Build spacer style with optional background
  const spacerStyle: React.CSSProperties = {
    height: `${height}px`,
    ...getBackgroundStyle(backgroundColor, backgroundGradient),
  }

  return (
    <Section key={block.id} style={spacerStyle}>
      {/* Empty section for spacing */}
    </Section>
  )
}

/**
 * Render blocks inside a column container.
 * Recursively renders each block using the main renderBlock function.
 *
 * Note: This is placed before renderColumns to avoid forward reference issues.
 */
function renderColumnBlocks(blocks: EmailBlock[]): React.ReactElement[] {
  return blocks.map((block) => renderBlock(block))
}

/**
 * Render a columns block with nested blocks inside each column.
 * Uses table-based layout for maximum email client compatibility.
 *
 * ARCHITECTURE:
 * - Each column (leftColumn, rightColumn) is a ColumnContainer with blocks array
 * - Blocks inside columns are rendered recursively using the same renderBlock function
 * - This allows any email block type to be placed inside columns
 *
 * SOURCE OF TRUTH KEYWORDS: RenderColumnsBlock, NestedColumnBlocks
 */
function renderColumns(block: ColumnsBlock): React.ReactElement {
  const { leftColumn, rightColumn, gap = 24, leftWidth = 50 } = block.props

  // Calculate column widths based on the leftWidth percentage
  const rightWidth = 100 - leftWidth

  /**
   * Build column cell style with background, border, and padding.
   * Applies gap between columns using padding.
   */
  const getColumnStyle = (
    column: ColumnContainer,
    isLeft: boolean
  ): React.CSSProperties => ({
    // Apply gap as padding between columns
    paddingRight: isLeft ? `${gap / 2}px` : undefined,
    paddingLeft: !isLeft ? `${gap / 2}px` : undefined,
    // Apply column container's own padding
    ...(column.padding ? { padding: `${column.padding}px` } : {}),
    // Apply column background if specified
    ...getBackgroundStyle(column.backgroundColor, column.backgroundGradient, column.backgroundImage),
    // Apply border
    ...getBorderStyle(column.border),
  })

  return (
    <Section key={block.id} style={{ margin: '0 0 16px 0' }}>
      <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
        <tr>
          {/* Left Column - renders nested blocks */}
          <td valign="top" width={`${leftWidth}%`} style={getColumnStyle(leftColumn, true)}>
            {leftColumn.blocks.length > 0 ? (
              renderColumnBlocks(leftColumn.blocks)
            ) : (
              // Empty column placeholder (invisible in email)
              <Text style={{ margin: 0, fontSize: '14px', color: '#9ca3af' }}>
                &nbsp;
              </Text>
            )}
          </td>
          {/* Right Column - renders nested blocks */}
          <td valign="top" width={`${rightWidth}%`} style={getColumnStyle(rightColumn, false)}>
            {rightColumn.blocks.length > 0 ? (
              renderColumnBlocks(rightColumn.blocks)
            ) : (
              // Empty column placeholder (invisible in email)
              <Text style={{ margin: 0, fontSize: '14px', color: '#9ca3af' }}>
                &nbsp;
              </Text>
            )}
          </td>
        </tr>
      </table>
    </Section>
  )
}

// ============================================================================
// COMPOSITE BLOCK RENDERERS
// These render professional, self-contained components
// ============================================================================

/**
 * Get icon character for list items.
 * Returns an emoji or character that renders well in email clients.
 */
function getListIconChar(iconType: string): string {
  switch (iconType) {
    case 'check':
      return '✓'
    case 'bullet':
      return '•'
    case 'x':
      return '✗'
    case 'arrow':
      return '→'
    case 'star':
      return '★'
    default:
      return '✓'
  }
}

/**
 * Render a list block with styled items.
 */
function renderList(block: ListBlock): React.ReactElement {
  const {
    items,
    iconType,
    iconColor = '#10b981',
    textColor = '#374151',
    backgroundColor,
    border,
    padding = 16,
    itemSpacing = 12,
    marginTop = 0,
    marginBottom = 0,
  } = block.props

  const containerStyle: React.CSSProperties = {
    margin: `${marginTop}px 0 ${marginBottom}px 0`,
    padding: `${padding}px`,
    ...getBackgroundStyle(backgroundColor),
    ...getBorderStyle(border),
  }

  return (
    <Section key={block.id} style={containerStyle}>
      <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
        {items.map((item, idx) => (
          <tr key={item.id}>
            <td
              valign="top"
              width="24"
              style={{
                paddingTop: idx > 0 ? `${itemSpacing}px` : 0,
                color: iconColor,
                fontSize: '16px',
                fontWeight: 600,
              }}
            >
              {getListIconChar(item.icon ?? iconType)}
            </td>
            <td
              valign="top"
              style={{
                paddingTop: idx > 0 ? `${itemSpacing}px` : 0,
                paddingLeft: '8px',
                color: textColor,
                fontSize: '14px',
                lineHeight: '20px',
              }}
            >
              {item.text}
            </td>
          </tr>
        ))}
      </table>
    </Section>
  )
}

/**
 * Render a pricing card block.
 */
function renderPricingCard(block: PricingCardBlock): React.ReactElement {
  const {
    planName,
    price,
    currency = '$',
    billingPeriod = '/month',
    description,
    features,
    buttonText,
    buttonHref,
    isPopular = false,
    accentColor = '#2563eb',
    backgroundColor = '#ffffff',
    textColor = '#1f2937',
    border,
    borderRadius = 12,
    padding = 24,
    marginTop = 0,
    marginBottom = 0,
  } = block.props

  // Secondary text color (slightly muted)
  const secondaryTextColor = '#6b7280'

  const containerStyle: React.CSSProperties = {
    margin: `${marginTop}px 0 ${marginBottom}px 0`,
    padding: `${padding}px`,
    backgroundColor,
    borderRadius: `${borderRadius}px`,
    border: border
      ? `${border.width}px ${border.style} ${border.color}`
      : '1px solid #e5e7eb',
  }

  return (
    <Section key={block.id} style={containerStyle}>
      {/* Popular badge */}
      {isPopular && (
        <Text
          style={{
            margin: '0 0 16px 0',
            display: 'inline-block',
            padding: '4px 12px',
            backgroundColor: accentColor,
            color: '#ffffff',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: '4px',
          }}
        >
          Most Popular
        </Text>
      )}

      {/* Plan name */}
      <Heading
        as="h3"
        style={{
          margin: '0 0 8px 0',
          fontSize: '20px',
          fontWeight: 600,
          color: textColor,
        }}
      >
        {planName}
      </Heading>

      {/* Price */}
      <Text style={{ margin: '0 0 12px 0' }}>
        <span style={{ fontSize: '14px', color: textColor }}>{currency}</span>
        <span style={{ fontSize: '36px', fontWeight: 700, color: accentColor }}>
          {price}
        </span>
        <span style={{ fontSize: '14px', color: secondaryTextColor }}>{billingPeriod}</span>
      </Text>

      {/* Description */}
      {description && (
        <Text
          style={{
            margin: '0 0 16px 0',
            fontSize: '14px',
            color: secondaryTextColor,
          }}
        >
          {description}
        </Text>
      )}

      {/* Features list */}
      {features.length > 0 && (
        <table
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          role="presentation"
          style={{ margin: '0 0 20px 0' }}
        >
          {features.map((feature, idx) => (
            <tr key={idx}>
              <td
                valign="top"
                width="20"
                style={{
                  paddingTop: idx > 0 ? '8px' : 0,
                  color: accentColor,
                  fontSize: '14px',
                }}
              >
                ✓
              </td>
              <td
                valign="top"
                style={{
                  paddingTop: idx > 0 ? '8px' : 0,
                  paddingLeft: '8px',
                  color: textColor,
                  fontSize: '14px',
                  lineHeight: '20px',
                }}
              >
                {feature}
              </td>
            </tr>
          ))}
        </table>
      )}

      {/* CTA Button */}
      <Button
        href={buttonHref}
        style={{
          display: 'block',
          width: '100%',
          padding: '12px 24px',
          backgroundColor: accentColor,
          color: '#ffffff',
          fontSize: '14px',
          fontWeight: 600,
          textAlign: 'center',
          textDecoration: 'none',
          borderRadius: '8px',
        }}
      >
        {buttonText}
      </Button>
    </Section>
  )
}

/**
 * Render a testimonial card block.
 */
function renderTestimonialCard(block: TestimonialCardBlock): React.ReactElement {
  const {
    quote,
    avatarSrc,
    authorName,
    authorRole,
    companyName,
    rating,
    backgroundColor = '#ffffff',
    textColor = '#374151',
    accentColor = '#f59e0b',
    border,
    borderRadius = 12,
    padding = 24,
    marginTop = 0,
    marginBottom = 0,
  } = block.props

  // Secondary text color (slightly muted)
  const secondaryTextColor = '#6b7280'
  // Empty star color
  const emptyStarColor = '#d1d5db'

  const containerStyle: React.CSSProperties = {
    margin: `${marginTop}px 0 ${marginBottom}px 0`,
    padding: `${padding}px`,
    backgroundColor,
    borderRadius: `${borderRadius}px`,
    border: border
      ? `${border.width}px ${border.style} ${border.color}`
      : '1px solid #e5e7eb',
  }

  const authorSubtitle = [authorRole, companyName].filter(Boolean).join(', ')

  return (
    <Section key={block.id} style={containerStyle}>
      {/* Rating stars */}
      {rating && rating > 0 && (
        <Text style={{ margin: '0 0 16px 0', fontSize: '16px' }}>
          {Array.from({ length: 5 })
            .map((_, idx) => (idx < rating ? '★' : '☆'))
            .join('')
            .split('')
            .map((star, idx) => (
              <span
                key={idx}
                style={{ color: idx < rating ? accentColor : emptyStarColor }}
              >
                {star}
              </span>
            ))}
        </Text>
      )}

      {/* Quote */}
      <Text
        style={{
          margin: '0 0 20px 0',
          fontSize: '16px',
          lineHeight: '24px',
          fontStyle: 'italic',
          color: textColor,
        }}
      >
        &ldquo;{quote}&rdquo;
      </Text>

      {/* Author info */}
      <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
        <tr>
          {/* Avatar */}
          <td width="48" valign="middle">
            {avatarSrc ? (
              <Img
                src={avatarSrc}
                alt={authorName}
                width={40}
                height={40}
                style={{ borderRadius: '50%' }}
              />
            ) : (
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: accentColor,
                  color: '#ffffff',
                  fontSize: '16px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {authorName.charAt(0).toUpperCase()}
              </div>
            )}
          </td>
          {/* Name and title */}
          <td valign="middle" style={{ paddingLeft: '12px' }}>
            <Text
              style={{
                margin: 0,
                fontSize: '14px',
                fontWeight: 600,
                color: textColor,
              }}
            >
              {authorName}
            </Text>
            {authorSubtitle && (
              <Text
                style={{
                  margin: '2px 0 0 0',
                  fontSize: '12px',
                  color: secondaryTextColor,
                }}
              >
                {authorSubtitle}
              </Text>
            )}
          </td>
        </tr>
      </table>
    </Section>
  )
}

/**
 * Render a feature card block.
 */
function renderFeatureCard(block: FeatureCardBlock): React.ReactElement {
  const {
    icon,
    title,
    description,
    layout = 'vertical',
    align = 'center',
    backgroundColor = '#ffffff',
    titleColor = '#1f2937',
    descriptionColor = '#6b7280',
    iconSize = 48,
    border,
    borderRadius = 12,
    padding = 24,
    marginTop = 0,
    marginBottom = 0,
  } = block.props

  const containerStyle: React.CSSProperties = {
    margin: `${marginTop}px 0 ${marginBottom}px 0`,
    padding: `${padding}px`,
    backgroundColor,
    borderRadius: `${borderRadius}px`,
    textAlign: align,
    border: border
      ? `${border.width}px ${border.style} ${border.color}`
      : '1px solid #e5e7eb',
  }

  if (layout === 'horizontal') {
    return (
      <Section key={block.id} style={{ ...containerStyle, textAlign: 'left' }}>
        <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
          <tr>
            <td
              width={iconSize + 16}
              valign="top"
              style={{ fontSize: `${iconSize}px`, lineHeight: 1 }}
            >
              {icon}
            </td>
            <td valign="top">
              <Heading
                as="h4"
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '16px',
                  fontWeight: 600,
                  color: titleColor,
                }}
              >
                {title}
              </Heading>
              <Text
                style={{
                  margin: 0,
                  fontSize: '14px',
                  lineHeight: '20px',
                  color: descriptionColor,
                }}
              >
                {description}
              </Text>
            </td>
          </tr>
        </table>
      </Section>
    )
  }

  // Vertical layout
  return (
    <Section key={block.id} style={containerStyle}>
      <Text
        style={{
          margin: '0 0 16px 0',
          fontSize: `${iconSize}px`,
          lineHeight: 1,
        }}
      >
        {icon}
      </Text>
      <Heading
        as="h4"
        style={{
          margin: '0 0 8px 0',
          fontSize: '16px',
          fontWeight: 600,
          color: titleColor,
        }}
      >
        {title}
      </Heading>
      <Text
        style={{
          margin: 0,
          fontSize: '14px',
          lineHeight: '20px',
          color: descriptionColor,
        }}
      >
        {description}
      </Text>
    </Section>
  )
}

/**
 * Render a stats card block.
 */
function renderStatsCard(block: StatsCardBlock): React.ReactElement {
  const {
    value,
    label,
    icon,
    valueColor = '#1f2937',
    labelColor = '#6b7280',
    backgroundColor = '#ffffff',
    align = 'center',
    border,
    borderRadius = 12,
    padding = 24,
    marginTop = 0,
    marginBottom = 0,
  } = block.props

  const containerStyle: React.CSSProperties = {
    margin: `${marginTop}px 0 ${marginBottom}px 0`,
    padding: `${padding}px`,
    backgroundColor,
    borderRadius: `${borderRadius}px`,
    textAlign: align,
    border: border
      ? `${border.width}px ${border.style} ${border.color}`
      : '1px solid #e5e7eb',
  }

  return (
    <Section key={block.id} style={containerStyle}>
      {icon && (
        <Text style={{ margin: '0 0 12px 0', fontSize: '32px', lineHeight: 1 }}>
          {icon}
        </Text>
      )}
      <Text
        style={{
          margin: '0 0 4px 0',
          fontSize: '32px',
          fontWeight: 700,
          color: valueColor,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          margin: 0,
          fontSize: '14px',
          fontWeight: 500,
          color: labelColor,
        }}
      >
        {label}
      </Text>
    </Section>
  )
}

/**
 * Get alert styling based on alert type.
 */
function getAlertStyles(
  type: AlertType,
  overrideBg?: string,
  overrideText?: string
) {
  const defaults = {
    info: { bg: '#eff6ff', text: '#1e40af', border: '#3b82f6', icon: 'ℹ️' },
    success: { bg: '#f0fdf4', text: '#166534', border: '#22c55e', icon: '✅' },
    warning: { bg: '#fffbeb', text: '#92400e', border: '#f59e0b', icon: '⚠️' },
    error: { bg: '#fef2f2', text: '#991b1b', border: '#ef4444', icon: '❌' },
  }
  const preset = defaults[type]
  return {
    bg: overrideBg ?? preset.bg,
    text: overrideText ?? preset.text,
    border: preset.border,
    icon: preset.icon,
  }
}

/**
 * Render an alert card block.
 * Uses alert-type-specific styling (info, success, warning, error).
 */
function renderAlertCard(block: AlertCardBlock): React.ReactElement {
  const {
    alertType,
    title,
    message,
    buttonText,
    buttonHref,
    backgroundColor,
    textColor,
    border,
    borderRadius = 8,
    padding = 16,
    marginTop = 0,
    marginBottom = 0,
  } = block.props

  const alertStyles = getAlertStyles(alertType, backgroundColor, textColor)

  const containerStyle: React.CSSProperties = {
    margin: `${marginTop}px 0 ${marginBottom}px 0`,
    padding: `${padding}px`,
    backgroundColor: alertStyles.bg,
    borderRadius: `${borderRadius}px`,
    borderLeft: `4px solid ${alertStyles.border}`,
    ...(border && {
      border: `${border.width}px ${border.style} ${border.color}`,
    }),
  }

  return (
    <Section key={block.id} style={containerStyle}>
      <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
        <tr>
          <td width="32" valign="top" style={{ fontSize: '16px', paddingTop: '2px' }}>
            {alertStyles.icon}
          </td>
          <td valign="top">
            {title && (
              <Heading
                as="h5"
                style={{
                  margin: '0 0 4px 0',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: alertStyles.text,
                }}
              >
                {title}
              </Heading>
            )}
            <Text
              style={{
                margin: 0,
                fontSize: '14px',
                lineHeight: '20px',
                color: alertStyles.text,
              }}
            >
              {message}
            </Text>
            {buttonText && buttonHref && (
              <Text style={{ margin: '12px 0 0 0' }}>
                <a
                  href={buttonHref}
                  style={{
                    color: alertStyles.text,
                    fontSize: '14px',
                    fontWeight: 500,
                    textDecoration: 'underline',
                  }}
                >
                  {buttonText}
                </a>
              </Text>
            )}
          </td>
        </tr>
      </table>
    </Section>
  )
}

/**
 * Calculate time remaining until target date.
 * Returns an object with days, hours, minutes, seconds.
 *
 * WHY: Countdown timers need precise time calculation from the target date.
 * Since emails are static, we calculate at render time.
 */
function calculateTimeRemaining(targetDate: string): {
  days: number
  hours: number
  minutes: number
  seconds: number
  isExpired: boolean
} {
  const target = new Date(targetDate).getTime()
  const now = Date.now()
  const diff = target - now

  // If target date has passed, timer is expired
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true }
  }

  // Calculate time units
  const seconds = Math.floor((diff / 1000) % 60)
  const minutes = Math.floor((diff / (1000 * 60)) % 60)
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  return { days, hours, minutes, seconds, isExpired: false }
}

/**
 * Format a number to always show two digits (e.g., 05 instead of 5).
 */
function padNumber(num: number): string {
  return num.toString().padStart(2, '0')
}

/**
 * Get separator character based on separator style.
 */
function getSeparator(style: CountdownSeparatorStyle): string {
  switch (style) {
    case 'colon':
      return ':'
    case 'text':
      return ' '
    case 'none':
    default:
      return ''
  }
}

/**
 * Render a countdown timer block.
 * Calculates time remaining until target date and displays it in the specified style.
 *
 * STYLES:
 * - boxes: Individual boxes for each time unit with labels below
 * - inline: Text-based "X days, Y hours remaining" format
 * - minimal: Just numbers with separators "03:12:45:30"
 * - circular: Circular design (falls back to boxes in email since CSS circles are limited)
 *
 * SOURCE OF TRUTH KEYWORDS: RenderCountdownTimer, TimerRenderer
 */
function renderCountdownTimer(block: CountdownTimerBlock): React.ReactElement {
  const {
    targetDate,
    showDays,
    showHours,
    showMinutes,
    showSeconds,
    expiredMessage,
    style,
    digitColor,
    labelColor,
    backgroundColor,
    separatorStyle,
    separatorColor,
    align = 'center',
    border,
    borderRadius = 8,
    padding = 24,
    marginTop = 0,
    marginBottom = 0,
  } = block.props

  // Calculate time remaining
  const time = calculateTimeRemaining(targetDate)
  const separator = getSeparator(separatorStyle)
  const sepColor = separatorColor ?? digitColor

  // Container style shared across all timer styles
  const containerStyle: React.CSSProperties = {
    margin: `${marginTop}px 0 ${marginBottom}px 0`,
    padding: `${padding}px`,
    backgroundColor,
    borderRadius: `${borderRadius}px`,
    textAlign: align,
    ...getBorderStyle(border),
  }

  // If timer has expired, show the expired message
  if (time.isExpired) {
    return (
      <Section key={block.id} style={containerStyle}>
        <Text
          style={{
            margin: 0,
            fontSize: '18px',
            fontWeight: 600,
            color: digitColor,
          }}
        >
          {expiredMessage}
        </Text>
      </Section>
    )
  }

  // Build time units array based on what's enabled
  const units: Array<{ value: number; label: string; short: string }> = []
  if (showDays) units.push({ value: time.days, label: 'Days', short: 'd' })
  if (showHours) units.push({ value: time.hours, label: 'Hours', short: 'h' })
  if (showMinutes) units.push({ value: time.minutes, label: 'Minutes', short: 'm' })
  if (showSeconds) units.push({ value: time.seconds, label: 'Seconds', short: 's' })

  // Render based on style
  switch (style) {
    case 'inline':
      // Text-based inline format: "3 days, 12 hours, 45 minutes remaining"
      const inlineParts = units.map((unit, idx) => {
        const unitLabel = unit.value === 1 ? unit.label.slice(0, -1) : unit.label
        return `${unit.value} ${unitLabel.toLowerCase()}`
      })
      return (
        <Section key={block.id} style={containerStyle}>
          <Text
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 500,
              color: digitColor,
            }}
          >
            {inlineParts.join(', ')} remaining
          </Text>
        </Section>
      )

    case 'minimal':
      // Just numbers with separators: "03:12:45:30"
      const minimalParts = units.map((unit) => padNumber(unit.value))
      return (
        <Section key={block.id} style={containerStyle}>
          <Text
            style={{
              margin: 0,
              fontSize: '32px',
              fontWeight: 700,
              fontFamily: 'monospace, Consolas, Monaco, "Courier New"',
              letterSpacing: '2px',
              color: digitColor,
            }}
          >
            {minimalParts.join(separator)}
          </Text>
        </Section>
      )

    case 'circular':
    case 'boxes':
    default:
      // Boxes style: Individual boxes for each time unit
      // (circular falls back to boxes since email CSS doesn't support complex shapes)
      return (
        <Section key={block.id} style={containerStyle}>
          <table
            width="100%"
            cellPadding={0}
            cellSpacing={0}
            role="presentation"
            style={{ margin: '0 auto' }}
          >
            <tr>
              {units.map((unit, idx) => (
                <React.Fragment key={unit.label}>
                  {/* Time unit box */}
                  <td
                    align="center"
                    valign="middle"
                    style={{
                      padding: '0 8px',
                    }}
                  >
                    {/* Digit box */}
                    <div
                      style={{
                        display: 'inline-block',
                        minWidth: '60px',
                        padding: '12px 8px',
                        backgroundColor: style === 'circular' ? 'transparent' : '#ffffff',
                        borderRadius: style === 'circular' ? '50%' : '8px',
                        border: style === 'circular' ? `3px solid ${digitColor}` : '1px solid #e5e7eb',
                      }}
                    >
                      <Text
                        style={{
                          margin: 0,
                          fontSize: '28px',
                          fontWeight: 700,
                          color: digitColor,
                          fontFamily: 'monospace, Consolas, Monaco, "Courier New"',
                        }}
                      >
                        {padNumber(unit.value)}
                      </Text>
                    </div>
                    {/* Label below */}
                    <Text
                      style={{
                        margin: '8px 0 0 0',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: labelColor,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {unit.label}
                    </Text>
                  </td>

                  {/* Separator between boxes (not after last) */}
                  {idx < units.length - 1 && separatorStyle === 'colon' && (
                    <td
                      align="center"
                      valign="top"
                      style={{
                        padding: '12px 4px 0 4px',
                      }}
                    >
                      <Text
                        style={{
                          margin: 0,
                          fontSize: '28px',
                          fontWeight: 700,
                          color: sepColor,
                        }}
                      >
                        :
                      </Text>
                    </td>
                  )}
                </React.Fragment>
              ))}
            </tr>
          </table>
        </Section>
      )
  }
}

/**
 * Render a Social Proof block.
 * Beautiful avatar stack with metric display - perfect for "7000+ creators" style.
 *
 * SOURCE OF TRUTH KEYWORDS: renderSocialProof, AvatarStackRenderer
 */
function renderSocialProof(block: SocialProofBlock): React.ReactElement {
  const {
    avatars,
    metric,
    metricLabel,
    heading,
    subheading,
    layout = 'horizontal',
    avatarSize = 40,
    avatarOverlap = 12,
    avatarBorderColor = '#ffffff',
    metricColor = '#111827',
    labelColor = '#6b7280',
    headingColor = '#111827',
    subheadingColor = '#6b7280',
    backgroundColor,
    border,
    borderRadius = 0,
    padding = 24,
    marginTop = 0,
    marginBottom = 0,
  } = block.props

  const containerStyle: React.CSSProperties = {
    margin: `${marginTop}px 0 ${marginBottom}px 0`,
    padding: `${padding}px`,
    backgroundColor: backgroundColor || 'transparent',
    borderRadius: `${borderRadius}px`,
    textAlign: layout === 'centered' ? 'center' : 'left',
    ...getBorderStyle(border),
  }

  // Avatar stack rendering - overlapping circles
  const renderAvatarStack = () => (
    <div style={{ display: 'inline-block' }}>
      {avatars.slice(0, 5).map((avatar, idx) => (
        <Img
          key={idx}
          src={avatar}
          alt={`User ${idx + 1}`}
          width={avatarSize}
          height={avatarSize}
          style={{
            borderRadius: '50%',
            border: `3px solid ${avatarBorderColor}`,
            marginLeft: idx === 0 ? 0 : `-${avatarOverlap}px`,
            display: 'inline-block',
            verticalAlign: 'middle',
          }}
        />
      ))}
    </div>
  )

  // Metric text rendering
  const renderMetric = () => (
    <div style={{ display: layout === 'horizontal' ? 'inline-block' : 'block', verticalAlign: 'middle' }}>
      <Text
        style={{
          margin: 0,
          fontSize: '24px',
          fontWeight: 700,
          color: metricColor,
          lineHeight: '1.2',
        }}
      >
        {metric}
      </Text>
      <Text
        style={{
          margin: 0,
          fontSize: '14px',
          color: labelColor,
        }}
      >
        {metricLabel}
      </Text>
    </div>
  )

  // Vertical layout (stacked)
  if (layout === 'vertical' || layout === 'centered') {
    return (
      <Section key={block.id} style={containerStyle}>
        {heading && (
          <Text
            style={{
              margin: '0 0 8px 0',
              fontSize: '28px',
              fontWeight: 700,
              color: headingColor,
              textAlign: layout === 'centered' ? 'center' : 'left',
            }}
          >
            {heading}
          </Text>
        )}
        {subheading && (
          <Text
            style={{
              margin: '0 0 16px 0',
              fontSize: '16px',
              color: subheadingColor,
              textAlign: layout === 'centered' ? 'center' : 'left',
            }}
          >
            {subheading}
          </Text>
        )}
        <div style={{ textAlign: layout === 'centered' ? 'center' : 'left', marginBottom: '12px' }}>
          {renderAvatarStack()}
        </div>
        <div style={{ textAlign: layout === 'centered' ? 'center' : 'left' }}>
          {renderMetric()}
        </div>
      </Section>
    )
  }

  // Horizontal layout (side by side)
  return (
    <Section key={block.id} style={containerStyle}>
      {heading && (
        <Text
          style={{
            margin: '0 0 8px 0',
            fontSize: '28px',
            fontWeight: 700,
            color: headingColor,
          }}
        >
          {heading}
        </Text>
      )}
      {subheading && (
        <Text
          style={{
            margin: '0 0 16px 0',
            fontSize: '16px',
            color: subheadingColor,
          }}
        >
          {subheading}
        </Text>
      )}
      <table cellPadding={0} cellSpacing={0} role="presentation">
        <tr>
          <td valign="middle" style={{ paddingRight: '16px' }}>
            {renderAvatarStack()}
          </td>
          <td valign="middle">
            {renderMetric()}
          </td>
        </tr>
      </table>
    </Section>
  )
}

// ============================================================================
// BLOCK DISPATCHER
// ============================================================================

/**
 * Render a single block based on its type.
 */
function renderBlock(block: EmailBlock): React.ReactElement {
  switch (block.type) {
    case 'heading':
      return renderHeading(block)
    case 'text':
      return renderText(block)
    case 'button':
      return renderButton(block)
    case 'image':
      return renderImage(block)
    case 'divider':
      return renderDivider(block)
    case 'spacer':
      return renderSpacer(block)
    case 'columns':
      return renderColumns(block)
    case 'list':
      return renderList(block)
    case 'pricing-card':
      return renderPricingCard(block)
    case 'testimonial-card':
      return renderTestimonialCard(block)
    case 'feature-card':
      return renderFeatureCard(block)
    case 'stats-card':
      return renderStatsCard(block)
    case 'alert-card':
      return renderAlertCard(block)
    case 'countdown-timer':
      return renderCountdownTimer(block)
    case 'social-proof':
      return renderSocialProof(block)
    default:
      // TypeScript exhaustive check
      const _exhaustive: never = block
      return <React.Fragment key={(block as EmailBlock).id} />
  }
}

// ============================================================================
// EMAIL TEMPLATE COMPONENT
// ============================================================================

/**
 * Props for the EmailTemplate component.
 */
interface EmailTemplateProps {
  /** Array of blocks to render */
  blocks: EmailBlock[]
  /** Optional preview text shown in inbox (hidden in email body) */
  previewText?: string
  /** Email settings for styling body and container */
  emailSettings: EmailSettings
}


/**
 * Main email template component.
 * Wraps blocks in proper HTML email structure.
 * Uses emailSettings to apply body/container backgrounds, padding, border radius.
 *
 * DARK MODE HANDLING:
 * - Body and container backgrounds are preserved by email clients
 * - Text and UI element colors are allowed to be inverted by email clients for dark mode
 * - This provides the best user experience across devices and color schemes
 *
 * SOURCE OF TRUTH KEYWORDS: EmailTemplateRenderer, HtmlEmailGenerator
 */
function EmailTemplate({ blocks, previewText, emailSettings }: EmailTemplateProps): React.ReactElement {
  // Generate body and container styles from settings
  const { bodyStyle, containerStyle } = getContainerStyles(emailSettings)

  return (
    <Html lang="en">
      <Head />

      {/* Preview text for inbox */}
      {previewText && <Preview>{previewText}</Preview>}

      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          {/* Render all blocks */}
          {blocks.map((block) => renderBlock(block))}
        </Container>
      </Body>
    </Html>
  )
}

// ============================================================================
// RENDER FUNCTION
// ============================================================================

/**
 * Render an array of email blocks to an HTML string.
 *
 * This is the main export used by the email template service.
 * Variables like {{lead.firstName}} are preserved - interpolation
 * happens at send time using the existing variable system.
 *
 * @param blocks - Array of email blocks to render
 * @param previewText - Optional preview text for inbox
 * @param emailSettings - Optional email settings for styling (uses defaults if not provided)
 * @returns HTML string ready for sending
 *
 * SOURCE OF TRUTH KEYWORDS: RenderBlocksToHtml, EmailHtmlGenerator
 *
 * @example
 * const blocks: EmailBlock[] = [
 *   { id: '1', type: 'heading', props: { text: 'Hello!', level: 'h1', align: 'center' } },
 *   { id: '2', type: 'text', props: { text: 'Welcome {{lead.firstName}}!', align: 'left' } },
 * ]
 * const html = await renderBlocksToHtml(blocks)
 *
 * @example
 * // With custom email settings
 * const html = await renderBlocksToHtml(blocks, undefined, {
 *   bodyBackgroundColor: '#1a1a1a',
 *   containerBackgroundColor: '#2d2d2d',
 *   containerPadding: 40,
 *   containerBorderRadius: 16,
 *   containerMaxWidth: 640,
 * })
 */
export async function renderBlocksToHtml(
  blocks: EmailBlock[],
  previewText?: string,
  emailSettings?: EmailSettings
): Promise<string> {
  // Merge provided settings with defaults
  const settings: EmailSettings = {
    ...DEFAULT_EMAIL_SETTINGS,
    ...emailSettings,
  }

  const html = await render(
    <EmailTemplate blocks={blocks} previewText={previewText} emailSettings={settings} />
  )
  return html
}

/**
 * Render blocks to HTML synchronously.
 * Use this version when you don't need async behavior.
 */
export function renderBlocksToHtmlSync(
  blocks: EmailBlock[],
  previewText?: string
): string {
  // Note: render() returns a Promise, but for simple templates
  // we can use the sync version if needed
  // For now, we'll just export the async version
  throw new Error('Use renderBlocksToHtml (async) instead')
}
