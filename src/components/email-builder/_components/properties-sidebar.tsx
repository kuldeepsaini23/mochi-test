'use client'

/**
 * Properties Sidebar
 *
 * Right panel for editing properties of the selected email block.
 * Shows contextual editing options based on block type.
 * Includes variable insertion for dynamic content.
 * Supports color/gradient and border customization.
 *
 * SOURCE OF TRUTH KEYWORDS: PropertiesSidebar, BlockProperties
 */

import {
  Heading1,
  Type,
  MousePointerClick,
  Image,
  Minus,
  MoveVertical,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link,
  Columns2,
  Sparkles,
  Mail,
  Palette,
  List,
  CreditCard,
  Quote,
  BarChart3,
  Bell,
  Plus,
  Trash2,
  Timer,
  Users,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Separator } from '@/components/ui/separator'
import { useEmailBuilder, type EmailSettings } from '../_lib/email-builder-context'
import { VariablePicker, VariablePreview } from './variable-picker'
import { GradientControl } from './gradient-control'
import { BorderControl } from './border-control'
import { ImageSourceControl, BackgroundImageControl, AvatarImageControl } from './image-source-control'
import type {
  EmailBlock,
  HeadingLevel,
  TextAlign,
  ColumnsBlock,
  ColumnContainer,
  EmailGradientConfig,
  EmailBorderConfig,
  ListBlock,
  ListItem,
  PricingCardBlock,
  TestimonialCardBlock,
  FeatureCardBlock,
  StatsCardBlock,
  AlertCardBlock,
  AlertType,
  CountdownTimerBlock,
  CountdownTimerStyle,
  CountdownSeparatorStyle,
  SocialProofBlock,
} from '@/types/email-templates'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

/**
 * Empty state when no block is selected
 * Clean design with small illustration
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6">
      {/* Small illustration */}
      <div className="relative mb-4">
        <div className="w-14 h-14 rounded-2xl bg-muted/50 border border-border/60 flex items-center justify-center">
          <MousePointerClick className="h-6 w-6 text-muted-foreground/60" />
        </div>
        {/* Small sparkle */}
        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-2.5 w-2.5 text-primary/60" />
        </div>
      </div>

      <h4 className="text-sm font-medium text-foreground mb-1">
        No element selected
      </h4>
      <p className="text-xs text-muted-foreground">
        Select an element to edit
      </p>
    </div>
  )
}

/**
 * Alignment toggle group component
 */
function AlignmentToggle({
  value,
  onChange,
}: {
  value: TextAlign
  onChange: (value: TextAlign) => void
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as TextAlign)}
      className="justify-start"
    >
      <ToggleGroupItem value="left" aria-label="Align left" className="h-8 w-8 p-0">
        <AlignLeft className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="center" aria-label="Align center" className="h-8 w-8 p-0">
        <AlignCenter className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="right" aria-label="Align right" className="h-8 w-8 p-0">
        <AlignRight className="h-4 w-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

/**
 * Property group wrapper
 * Clean section with subtle header styling
 */
function PropertyGroup({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </h4>
      {children}
    </div>
  )
}

/**
 * Heading block properties
 */
function HeadingProperties({ block }: { block: EmailBlock & { type: 'heading' } }) {
  const { actions } = useEmailBuilder()

  /**
   * Update property with immediate history save.
   * Used for discrete actions like dropdown/alignment changes.
   */
  const updateProp = <K extends keyof typeof block.props>(
    key: K,
    value: (typeof block.props)[K]
  ) => {
    actions.flushHistory() // Flush any pending text changes first
    actions.saveHistory('Update heading')
    actions.updateBlock(block.id, {
      props: { ...block.props, [key]: value },
    })
  }

  /**
   * Update property with debounced history save.
   * Used for text inputs where rapid changes should be batched.
   */
  const updateTextProp = <K extends keyof typeof block.props>(
    key: K,
    value: (typeof block.props)[K]
  ) => {
    actions.updateBlock(block.id, {
      props: { ...block.props, [key]: value },
    })
    actions.saveHistoryDebounced('Update heading text')
  }

  const hasVariables = block.props.text.includes('{{')

  return (
    <>
      <PropertyGroup title="Content">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="heading-text" className="text-xs">Text</Label>
            <VariablePicker
              onInsert={(v) => updateTextProp('text', block.props.text + v)}
            />
          </div>
          <Input
            id="heading-text"
            value={block.props.text}
            onChange={(e) => updateTextProp('text', e.target.value)}
            placeholder="Heading text..."
            className="h-9"
          />
          {hasVariables && (
            <div className="p-2 rounded bg-muted/50 text-sm">
              <VariablePreview text={block.props.text} />
            </div>
          )}
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Style">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Level</Label>
            <Select
              value={block.props.level}
              onValueChange={(v) => updateProp('level', v as HeadingLevel)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="h1">H1 - Large</SelectItem>
                <SelectItem value="h2">H2 - Medium</SelectItem>
                <SelectItem value="h3">H3 - Small</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Alignment</Label>
            <AlignmentToggle
              value={block.props.align}
              onChange={(v) => updateProp('align', v)}
            />
          </div>

          {/* Font Size Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Font Size</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.fontSize ?? (block.props.level === 'h1' ? 32 : block.props.level === 'h2' ? 24 : 20)}px
              </span>
            </div>
            <Slider
              value={[block.props.fontSize ?? (block.props.level === 'h1' ? 32 : block.props.level === 'h2' ? 24 : 20)]}
              onValueChange={([v]) => updateProp('fontSize', v)}
              min={12}
              max={72}
              step={1}
              className="py-2"
            />
          </div>
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Colors">
        <div className="space-y-3">
          {/* Text Color */}
          <GradientControl
            label="Text"
            solidColor={block.props.color ?? '#1a1a1a'}
            gradient={block.props.gradient}
            onSolidColorChange={(color) => updateProp('color', color)}
            onGradientChange={(gradient) => updateProp('gradient', gradient)}
            allowTransparent={false}
          />

          {/* Background Color */}
          <GradientControl
            label="Background"
            solidColor={block.props.backgroundColor ?? 'transparent'}
            gradient={block.props.backgroundGradient}
            onSolidColorChange={(color) => updateProp('backgroundColor', color)}
            onGradientChange={(gradient) => updateProp('backgroundGradient', gradient)}
          />

          {/* Background Image */}
          <BackgroundImageControl
            value={block.props.backgroundImage}
            onChange={(url) => updateProp('backgroundImage', url)}
          />
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Border">
        <BorderControl
          value={block.props.border}
          onChange={(border) => updateProp('border', border)}
        />
      </PropertyGroup>
    </>
  )
}

/**
 * Text block properties
 */
function TextProperties({ block }: { block: EmailBlock & { type: 'text' } }) {
  const { actions } = useEmailBuilder()

  /**
   * Update property with immediate history save.
   * Used for discrete actions like alignment changes.
   */
  const updateProp = <K extends keyof typeof block.props>(
    key: K,
    value: (typeof block.props)[K]
  ) => {
    actions.flushHistory() // Flush any pending text changes first
    actions.saveHistory('Update text')
    actions.updateBlock(block.id, {
      props: { ...block.props, [key]: value },
    })
  }

  /**
   * Update property with debounced history save.
   * Used for text inputs where rapid changes should be batched.
   */
  const updateTextProp = <K extends keyof typeof block.props>(
    key: K,
    value: (typeof block.props)[K]
  ) => {
    actions.updateBlock(block.id, {
      props: { ...block.props, [key]: value },
    })
    actions.saveHistoryDebounced('Update text content')
  }

  const hasVariables = block.props.text.includes('{{')

  return (
    <>
      <PropertyGroup title="Content">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="text-content" className="text-xs">Text</Label>
            <VariablePicker
              onInsert={(v) => updateTextProp('text', block.props.text + v)}
            />
          </div>
          <Textarea
            id="text-content"
            value={block.props.text}
            onChange={(e) => updateTextProp('text', e.target.value)}
            placeholder="Enter text..."
            className="min-h-[100px] resize-none text-sm"
          />
          {hasVariables && (
            <div className="p-2 rounded bg-muted/50 text-sm">
              <VariablePreview text={block.props.text} />
            </div>
          )}
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Style">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Alignment</Label>
            <AlignmentToggle
              value={block.props.align}
              onChange={(v) => updateProp('align', v)}
            />
          </div>

          {/* Font Size Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Font Size</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.fontSize ?? 16}px
              </span>
            </div>
            <Slider
              value={[block.props.fontSize ?? 16]}
              onValueChange={([v]) => updateProp('fontSize', v)}
              min={10}
              max={32}
              step={1}
              className="py-2"
            />
          </div>
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Colors">
        <div className="space-y-3">
          {/* Text Color */}
          <GradientControl
            label="Text"
            solidColor={block.props.color ?? '#374151'}
            gradient={block.props.gradient}
            onSolidColorChange={(color) => updateProp('color', color)}
            onGradientChange={(gradient) => updateProp('gradient', gradient)}
            allowTransparent={false}
          />

          {/* Background Color */}
          <GradientControl
            label="Background"
            solidColor={block.props.backgroundColor ?? 'transparent'}
            gradient={block.props.backgroundGradient}
            onSolidColorChange={(color) => updateProp('backgroundColor', color)}
            onGradientChange={(gradient) => updateProp('backgroundGradient', gradient)}
          />

          {/* Background Image */}
          <BackgroundImageControl
            value={block.props.backgroundImage}
            onChange={(url) => updateProp('backgroundImage', url)}
          />
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Border">
        <BorderControl
          value={block.props.border}
          onChange={(border) => updateProp('border', border)}
        />
      </PropertyGroup>
    </>
  )
}

/**
 * Button block properties
 */
function ButtonProperties({ block }: { block: EmailBlock & { type: 'button' } }) {
  const { actions } = useEmailBuilder()

  /**
   * Update property with immediate history save.
   * Used for discrete actions like alignment, color changes.
   */
  const updateProp = <K extends keyof typeof block.props>(
    key: K,
    value: (typeof block.props)[K]
  ) => {
    actions.flushHistory() // Flush any pending text changes first
    actions.saveHistory('Update button')
    actions.updateBlock(block.id, {
      props: { ...block.props, [key]: value },
    })
  }

  /**
   * Update property with debounced history save.
   * Used for text inputs where rapid changes should be batched.
   */
  const updateTextProp = <K extends keyof typeof block.props>(
    key: K,
    value: (typeof block.props)[K]
  ) => {
    actions.updateBlock(block.id, {
      props: { ...block.props, [key]: value },
    })
    actions.saveHistoryDebounced('Update button text')
  }

  const hasVariables = block.props.text.includes('{{')

  return (
    <>
      <PropertyGroup title="Content">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="button-text" className="text-xs">Button Text</Label>
              <VariablePicker
                onInsert={(v) => updateTextProp('text', block.props.text + v)}
              />
            </div>
            <Input
              id="button-text"
              value={block.props.text}
              onChange={(e) => updateTextProp('text', e.target.value)}
              placeholder="Click here"
              className="h-9"
            />
            {hasVariables && (
              <div className="p-2 rounded bg-muted/50 text-sm">
                <VariablePreview text={block.props.text} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="button-href" className="text-xs flex items-center gap-1">
                <Link className="h-3 w-3" />
                Link URL
              </Label>
              <VariablePicker
                onInsert={(v) => updateTextProp('href', block.props.href + v)}
              />
            </div>
            <Input
              id="button-href"
              value={block.props.href}
              onChange={(e) => updateTextProp('href', e.target.value)}
              placeholder="https://"
              className="h-9"
            />
            {block.props.href.includes('{{') && (
              <div className="p-2 rounded bg-muted/50 text-xs">
                <VariablePreview text={block.props.href} />
              </div>
            )}
          </div>
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Style">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Alignment</Label>
            <AlignmentToggle
              value={block.props.align}
              onChange={(v) => updateProp('align', v)}
            />
          </div>

          {/* Font Size Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Font Size</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.fontSize ?? 16}px
              </span>
            </div>
            <Slider
              value={[block.props.fontSize ?? 16]}
              onValueChange={([v]) => updateProp('fontSize', v)}
              min={10}
              max={24}
              step={1}
              className="py-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label className="text-xs">Radius</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={block.props.borderRadius ?? 6}
                  onChange={(e) => updateProp('borderRadius', parseInt(e.target.value, 10) || 0)}
                  className="h-8 text-xs"
                  min={0}
                  max={50}
                />
                <span className="text-xs text-muted-foreground">px</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Padding</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={block.props.paddingY ?? 12}
                  onChange={(e) => updateProp('paddingY', parseInt(e.target.value, 10) || 0)}
                  className="h-8 text-xs"
                  min={0}
                  max={50}
                />
                <span className="text-xs text-muted-foreground">px</span>
              </div>
            </div>
          </div>
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Colors">
        <div className="space-y-3">
          {/* Text Color - supports solid color or gradient for fancy button text */}
          <GradientControl
            label="Text"
            solidColor={block.props.textColor ?? '#ffffff'}
            gradient={block.props.textGradient}
            onSolidColorChange={(color) => updateProp('textColor', color)}
            onGradientChange={(gradient) => updateProp('textGradient', gradient)}
            allowTransparent={false}
          />

          {/* Background Color */}
          <GradientControl
            label="Background"
            solidColor={block.props.backgroundColor ?? '#2563eb'}
            gradient={block.props.backgroundGradient}
            onSolidColorChange={(color) => updateProp('backgroundColor', color)}
            onGradientChange={(gradient) => updateProp('backgroundGradient', gradient)}
            allowTransparent={false}
          />
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Border">
        <BorderControl
          value={block.props.border}
          onChange={(border) => updateProp('border', border)}
        />
      </PropertyGroup>
    </>
  )
}

/**
 * Image block properties
 */
function ImageProperties({ block }: { block: EmailBlock & { type: 'image' } }) {
  const { actions } = useEmailBuilder()

  /**
   * Update property with immediate history save.
   * Used for discrete actions like alignment, number changes.
   */
  const updateProp = <K extends keyof typeof block.props>(
    key: K,
    value: (typeof block.props)[K]
  ) => {
    actions.flushHistory() // Flush any pending text changes first
    actions.saveHistory('Update image')
    actions.updateBlock(block.id, {
      props: { ...block.props, [key]: value },
    })
  }

  /**
   * Update property with debounced history save.
   * Used for text inputs where rapid changes should be batched.
   */
  const updateTextProp = <K extends keyof typeof block.props>(
    key: K,
    value: (typeof block.props)[K]
  ) => {
    actions.updateBlock(block.id, {
      props: { ...block.props, [key]: value },
    })
    actions.saveHistoryDebounced('Update image')
  }

  return (
    <>
      <PropertyGroup title="Image">
        <div className="space-y-3">
          {/* Image source control - allows selection from storage or URL input */}
          <ImageSourceControl
            value={block.props.src}
            onChange={(url) => updateProp('src', url)}
            label="Source"
            placeholder="Enter image URL..."
            showPreview={true}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="image-alt" className="text-xs">Alt Text</Label>
              <VariablePicker
                onInsert={(v) => updateTextProp('alt', block.props.alt + v)}
              />
            </div>
            <Input
              id="image-alt"
              value={block.props.alt}
              onChange={(e) => updateTextProp('alt', e.target.value)}
              placeholder="Image description"
              className="h-9"
            />
            {block.props.alt.includes('{{') && (
              <div className="p-2 rounded bg-muted/50 text-xs">
                <VariablePreview text={block.props.alt} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="image-width" className="text-xs">Width (px)</Label>
              <Input
                id="image-width"
                type="number"
                value={block.props.width || ''}
                onChange={(e) => {
                  const value = e.target.value
                  updateProp('width', value ? parseInt(value, 10) : undefined)
                }}
                placeholder="Auto"
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Radius (px)</Label>
              <Input
                type="number"
                value={block.props.borderRadius ?? 4}
                onChange={(e) => updateProp('borderRadius', parseInt(e.target.value, 10) || 0)}
                className="h-9"
                min={0}
                max={50}
              />
            </div>
          </div>
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Style">
        <div className="space-y-2">
          <Label className="text-xs">Alignment</Label>
          <AlignmentToggle
            value={block.props.align}
            onChange={(v) => updateProp('align', v)}
          />
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Border">
        <BorderControl
          value={block.props.border}
          onChange={(border) => updateProp('border', border)}
        />
      </PropertyGroup>
    </>
  )
}

/**
 * Spacer block properties
 */
function SpacerProperties({ block }: { block: EmailBlock & { type: 'spacer' } }) {
  const { actions } = useEmailBuilder()

  /**
   * Update spacer height with immediate history save.
   * Flushes any pending text history from other blocks first.
   */
  const updateHeight = (value: number[]) => {
    actions.flushHistory()
    actions.saveHistory('Update spacer')
    actions.updateBlock(block.id, {
      props: { height: value[0] },
    })
  }

  return (
    <PropertyGroup title="Spacing">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Height</Label>
          <span className="text-xs text-muted-foreground font-mono">{block.props.height}px</span>
        </div>
        <Slider
          value={[block.props.height]}
          onValueChange={updateHeight}
          min={8}
          max={128}
          step={8}
          className="py-2"
        />
      </div>
    </PropertyGroup>
  )
}

/**
 * Divider block properties
 * Includes color and thickness options
 */
function DividerProperties({ block }: { block: EmailBlock & { type: 'divider' } }) {
  const { actions } = useEmailBuilder()

  // Initialize props if undefined
  const props = block.props ?? { color: '#e5e7eb', thickness: 1, style: 'solid' as const }

  /**
   * Update property with immediate history save.
   * Flushes any pending text history from other blocks first.
   */
  const updateProp = <K extends keyof NonNullable<typeof block.props>>(
    key: K,
    value: NonNullable<typeof block.props>[K]
  ) => {
    actions.flushHistory()
    actions.saveHistory('Update divider')
    actions.updateBlock(block.id, {
      props: { ...props, [key]: value },
    })
  }

  return (
    <>
      <PropertyGroup title="Style">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Style</Label>
            <Select
              value={props.style ?? 'solid'}
              onValueChange={(v) => updateProp('style', v as 'solid' | 'dashed' | 'dotted')}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="solid">Solid</SelectItem>
                <SelectItem value="dashed">Dashed</SelectItem>
                <SelectItem value="dotted">Dotted</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Thickness</Label>
              <span className="text-xs text-muted-foreground font-mono">{props.thickness ?? 1}px</span>
            </div>
            <Slider
              value={[props.thickness ?? 1]}
              onValueChange={([v]) => updateProp('thickness', v)}
              min={1}
              max={8}
              step={1}
              className="py-2"
            />
          </div>
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Color">
        <GradientControl
          label="Color"
          solidColor={props.color ?? '#e5e7eb'}
          gradient={props.gradient}
          onSolidColorChange={(color) => updateProp('color', color)}
          onGradientChange={(gradient) => updateProp('gradient', gradient)}
          allowTransparent={false}
        />
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Spacing">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Top Margin</Label>
              <span className="text-xs text-muted-foreground font-mono">{props.marginTop ?? 24}px</span>
            </div>
            <Slider
              value={[props.marginTop ?? 24]}
              onValueChange={([v]) => updateProp('marginTop', v)}
              min={0}
              max={64}
              step={4}
              className="py-2"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Bottom Margin</Label>
              <span className="text-xs text-muted-foreground font-mono">{props.marginBottom ?? 24}px</span>
            </div>
            <Slider
              value={[props.marginBottom ?? 24]}
              onValueChange={([v]) => updateProp('marginBottom', v)}
              min={0}
              max={64}
              step={4}
              className="py-2"
            />
          </div>
        </div>
      </PropertyGroup>
    </>
  )
}

/**
 * Columns block properties
 * Each column is a container where users can drag and drop any blocks.
 * This panel edits layout settings and column container styling.
 */
function ColumnsProperties({ block }: { block: ColumnsBlock }) {
  const { actions } = useEmailBuilder()

  /**
   * Update a specific column container's property.
   * Flushes any pending text history from other blocks first.
   */
  const updateColumn = (
    columnKey: 'leftColumn' | 'rightColumn',
    updates: Partial<ColumnContainer>
  ) => {
    actions.flushHistory()
    actions.saveHistory('Update column')
    actions.updateBlock(block.id, {
      props: {
        ...block.props,
        [columnKey]: { ...block.props[columnKey], ...updates },
      },
    })
  }

  /**
   * Update gap between columns.
   * Flushes any pending text history from other blocks first.
   */
  const updateGap = (value: number[]) => {
    actions.flushHistory()
    actions.saveHistory('Update column gap')
    actions.updateBlock(block.id, {
      props: { ...block.props, gap: value[0] },
    })
  }

  /**
   * Update left column width.
   * Flushes any pending text history from other blocks first.
   */
  const updateLeftWidth = (value: number[]) => {
    actions.flushHistory()
    actions.saveHistory('Update column width')
    actions.updateBlock(block.id, {
      props: { ...block.props, leftWidth: value[0] },
    })
  }

  const leftWidth = block.props.leftWidth ?? 50

  return (
    <>
      {/* Layout Settings */}
      <PropertyGroup title="Layout">
        <div className="space-y-4">
          {/* Column Width Ratio */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Column Width</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {leftWidth}% / {100 - leftWidth}%
              </span>
            </div>
            <Slider
              value={[leftWidth]}
              onValueChange={updateLeftWidth}
              min={20}
              max={80}
              step={5}
              className="py-2"
            />
          </div>

          {/* Gap */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Gap</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.gap ?? 24}px
              </span>
            </div>
            <Slider
              value={[block.props.gap ?? 24]}
              onValueChange={updateGap}
              min={8}
              max={48}
              step={4}
              className="py-2"
            />
          </div>
        </div>
      </PropertyGroup>

      <Separator />

      {/* Left Column Styling */}
      <PropertyGroup title="Left Column Style">
        <div className="space-y-3">
          {/* Background */}
          <GradientControl
            label="Background"
            solidColor={block.props.leftColumn.backgroundColor ?? 'transparent'}
            gradient={block.props.leftColumn.backgroundGradient}
            onSolidColorChange={(color) => updateColumn('leftColumn', { backgroundColor: color })}
            onGradientChange={(gradient) => updateColumn('leftColumn', { backgroundGradient: gradient })}
          />

          {/* Background Image */}
          <BackgroundImageControl
            value={block.props.leftColumn.backgroundImage}
            onChange={(url) => updateColumn('leftColumn', { backgroundImage: url })}
          />

          {/* Border */}
          <BorderControl
            value={block.props.leftColumn.border}
            onChange={(border) => updateColumn('leftColumn', { border })}
          />

          {/* Padding */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Padding</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.leftColumn.padding ?? 12}px
              </span>
            </div>
            <Slider
              value={[block.props.leftColumn.padding ?? 12]}
              onValueChange={([v]) => updateColumn('leftColumn', { padding: v })}
              min={0}
              max={48}
              step={4}
              className="py-2"
            />
          </div>

          {/* Block count info */}
          <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
            {block.props.leftColumn.blocks.length} block(s)
          </div>
        </div>
      </PropertyGroup>

      <Separator />

      {/* Right Column Styling */}
      <PropertyGroup title="Right Column Style">
        <div className="space-y-3">
          {/* Background */}
          <GradientControl
            label="Background"
            solidColor={block.props.rightColumn.backgroundColor ?? 'transparent'}
            gradient={block.props.rightColumn.backgroundGradient}
            onSolidColorChange={(color) => updateColumn('rightColumn', { backgroundColor: color })}
            onGradientChange={(gradient) => updateColumn('rightColumn', { backgroundGradient: gradient })}
          />

          {/* Background Image */}
          <BackgroundImageControl
            value={block.props.rightColumn.backgroundImage}
            onChange={(url) => updateColumn('rightColumn', { backgroundImage: url })}
          />

          {/* Border */}
          <BorderControl
            value={block.props.rightColumn.border}
            onChange={(border) => updateColumn('rightColumn', { border })}
          />

          {/* Padding */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Padding</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.rightColumn.padding ?? 12}px
              </span>
            </div>
            <Slider
              value={[block.props.rightColumn.padding ?? 12]}
              onValueChange={([v]) => updateColumn('rightColumn', { padding: v })}
              min={0}
              max={48}
              step={4}
              className="py-2"
            />
          </div>

          {/* Block count info */}
          <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
            {block.props.rightColumn.blocks.length} block(s)
          </div>
        </div>
      </PropertyGroup>

      <Separator />

      {/* Tip for editing blocks inside columns */}
      <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">Tip:</strong> Drag blocks from the sidebar into each column. Click on blocks inside columns to edit their properties.
        </p>
      </div>
    </>
  )
}

/**
 * Email Settings Properties
 * Shown when the canvas/container is selected.
 * Allows editing of background colors, padding, border radius, and max width.
 *
 * SOURCE OF TRUTH KEYWORDS: EmailSettingsProperties, CanvasProperties
 */
function EmailSettingsProperties() {
  const { state, actions } = useEmailBuilder()
  const { emailSettings } = state

  /**
   * Update setting with immediate history save.
   * Flushes any pending text history from blocks first.
   */
  const updateSetting = <K extends keyof EmailSettings>(key: K, value: EmailSettings[K]) => {
    actions.flushHistory()
    actions.saveHistory('Update email settings')
    actions.updateEmailSettings({ [key]: value })
  }

  return (
    <>
      {/* Subject Line - Moved from navbar for cleaner header */}
      <PropertyGroup title="Email Settings">
        <div className="space-y-2">
          <Label className="text-xs">Subject Line</Label>
          <Input
            value={state.subject}
            onChange={(e) => actions.setSubject(e.target.value)}
            placeholder="Enter email subject..."
            className="h-9 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            The subject line recipients will see in their inbox
          </p>
        </div>
      </PropertyGroup>

      <Separator />

      {/* Body Background - Uses GradientControl for consistency with block colors */}
      <PropertyGroup title="Email Body">
        <GradientControl
          label="Background"
          solidColor={emailSettings.bodyBackgroundColor}
          gradient={emailSettings.bodyBackgroundGradient}
          onSolidColorChange={(color) => updateSetting('bodyBackgroundColor', color)}
          onGradientChange={(gradient) => updateSetting('bodyBackgroundGradient', gradient)}
          allowTransparent={true}
        />
      </PropertyGroup>

      <Separator />

      {/* Container Settings */}
      <PropertyGroup title="Container">
        <div className="space-y-4">
          {/* Container Background - Uses GradientControl for consistency with block colors */}
          <GradientControl
            label="Background"
            solidColor={emailSettings.containerBackgroundColor}
            gradient={emailSettings.containerBackgroundGradient}
            onSolidColorChange={(color) => updateSetting('containerBackgroundColor', color)}
            onGradientChange={(gradient) => updateSetting('containerBackgroundGradient', gradient)}
            allowTransparent={true}
          />

          {/* Max Width */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Max Width</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {emailSettings.containerMaxWidth}px
              </span>
            </div>
            <Slider
              value={[emailSettings.containerMaxWidth]}
              onValueChange={([v]) => updateSetting('containerMaxWidth', v)}
              min={400}
              max={800}
              step={10}
              className="py-2"
            />
          </div>

          {/* Padding */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Padding</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {emailSettings.containerPadding}px
              </span>
            </div>
            <Slider
              value={[emailSettings.containerPadding]}
              onValueChange={([v]) => updateSetting('containerPadding', v)}
              min={0}
              max={64}
              step={4}
              className="py-2"
            />
          </div>

          {/* Border Radius */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Border Radius</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {emailSettings.containerBorderRadius}px
              </span>
            </div>
            <Slider
              value={[emailSettings.containerBorderRadius]}
              onValueChange={([v]) => updateSetting('containerBorderRadius', v)}
              min={0}
              max={24}
              step={2}
              className="py-2"
            />
          </div>
        </div>
      </PropertyGroup>

      <Separator />

      {/* Info */}
      <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">Tip:</strong> Click on any block in the canvas to edit its properties. These settings apply to the email container.
        </p>
      </div>
    </>
  )
}

// ============================================================================
// COMPOSITE BLOCK PROPERTY EDITORS
// Property editors for self-contained professional components
// ============================================================================

/**
 * List block properties
 * Edits list items, icon type, and styling
 */
function ListProperties({ block }: { block: ListBlock }) {
  const { actions } = useEmailBuilder()

  const updateProp = <K extends keyof typeof block.props>(
    key: K,
    value: (typeof block.props)[K]
  ) => {
    actions.flushHistory()
    actions.saveHistory('Update list')
    actions.updateBlock(block.id, {
      props: { ...block.props, [key]: value },
    })
  }

  /** Add a new list item */
  const addItem = () => {
    const newItem: ListItem = {
      id: `item-${Date.now()}`,
      text: 'New item',
    }
    updateProp('items', [...block.props.items, newItem])
  }

  /** Update a specific list item */
  const updateItem = (itemId: string, text: string) => {
    const updatedItems = block.props.items.map((item) =>
      item.id === itemId ? { ...item, text } : item
    )
    actions.updateBlock(block.id, {
      props: { ...block.props, items: updatedItems },
    })
    actions.saveHistoryDebounced('Update list item')
  }

  /** Remove a list item */
  const removeItem = (itemId: string) => {
    updateProp('items', block.props.items.filter((item) => item.id !== itemId))
  }

  return (
    <>
      <PropertyGroup title="Items">
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground">List items support variables</p>
            <VariablePicker
              onInsert={(v) => {
                // Add variable to the last item or create new item
                if (block.props.items.length > 0) {
                  const lastItem = block.props.items[block.props.items.length - 1]
                  updateItem(lastItem.id, lastItem.text + v)
                } else {
                  addItem()
                }
              }}
            />
          </div>
          {block.props.items.map((item) => (
            <div key={item.id} className="space-y-1">
              <div className="flex gap-2">
                <Input
                  value={item.text}
                  onChange={(e) => updateItem(item.id, e.target.value)}
                  className="flex-1 h-9"
                  placeholder="List item..."
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => removeItem(item.id)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
              {item.text.includes('{{') && (
                <div className="p-2 rounded bg-muted/50 text-xs ml-0">
                  <VariablePreview text={item.text} />
                </div>
              )}
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={addItem}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Item
          </Button>
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Style">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Icon Type</Label>
            <Select
              value={block.props.iconType}
              onValueChange={(v) => updateProp('iconType', v as 'check' | 'bullet' | 'x' | 'arrow' | 'star')}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="check">✓ Check</SelectItem>
                <SelectItem value="bullet">• Bullet</SelectItem>
                <SelectItem value="x">✗ X</SelectItem>
                <SelectItem value="arrow">→ Arrow</SelectItem>
                <SelectItem value="star">★ Star</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Icon color with gradient support */}
          <GradientControl
            label="Icon Color"
            solidColor={block.props.iconColor ?? '#22c55e'}
            gradient={block.props.iconGradient}
            onSolidColorChange={(color) => updateProp('iconColor', color)}
            onGradientChange={(gradient) => updateProp('iconGradient', gradient)}
            allowTransparent={false}
          />

          {/* Text color with gradient support */}
          <GradientControl
            label="Text Color"
            solidColor={block.props.textColor ?? '#374151'}
            gradient={block.props.textGradient}
            onSolidColorChange={(color) => updateProp('textColor', color)}
            onGradientChange={(gradient) => updateProp('textGradient', gradient)}
            allowTransparent={false}
          />
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Spacing">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Margin Top</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.marginTop ?? 0}px
              </span>
            </div>
            <Slider
              value={[block.props.marginTop ?? 0]}
              onValueChange={([v]) => updateProp('marginTop', v)}
              min={0}
              max={64}
              step={4}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Margin Bottom</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.marginBottom ?? 0}px
              </span>
            </div>
            <Slider
              value={[block.props.marginBottom ?? 0]}
              onValueChange={([v]) => updateProp('marginBottom', v)}
              min={0}
              max={64}
              step={4}
            />
          </div>
        </div>
      </PropertyGroup>
    </>
  )
}

/**
 * Pricing card properties
 */
function PricingCardProperties({ block }: { block: PricingCardBlock }) {
  const { actions } = useEmailBuilder()

  const updateProp = <K extends keyof typeof block.props>(
    key: K,
    value: (typeof block.props)[K]
  ) => {
    actions.flushHistory()
    actions.saveHistory('Update pricing card')
    actions.updateBlock(block.id, {
      props: { ...block.props, [key]: value },
    })
  }

  const updateTextProp = <K extends keyof typeof block.props>(
    key: K,
    value: (typeof block.props)[K]
  ) => {
    actions.updateBlock(block.id, {
      props: { ...block.props, [key]: value },
    })
    actions.saveHistoryDebounced('Update pricing card')
  }

  /** Add a feature to the list */
  const addFeature = () => {
    updateProp('features', [...block.props.features, 'New feature'])
  }

  /** Update a specific feature */
  const updateFeature = (index: number, text: string) => {
    const updated = [...block.props.features]
    updated[index] = text
    actions.updateBlock(block.id, {
      props: { ...block.props, features: updated },
    })
    actions.saveHistoryDebounced('Update feature')
  }

  /** Remove a feature */
  const removeFeature = (index: number) => {
    updateProp('features', block.props.features.filter((_, i) => i !== index))
  }

  const hasPlanNameVariables = block.props.planName.includes('{{')
  const hasDescriptionVariables = block.props.description?.includes('{{')
  const hasButtonTextVariables = block.props.buttonText.includes('{{')

  return (
    <>
      <PropertyGroup title="Plan Details">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Plan Name</Label>
              <VariablePicker
                onInsert={(v) => updateTextProp('planName', block.props.planName + v)}
              />
            </div>
            <Input
              value={block.props.planName}
              onChange={(e) => updateTextProp('planName', e.target.value)}
              className="h-9"
            />
            {hasPlanNameVariables && (
              <div className="p-2 rounded bg-muted/50 text-sm">
                <VariablePreview text={block.props.planName} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label className="text-xs">Price</Label>
              <Input
                value={block.props.price}
                onChange={(e) => updateTextProp('price', e.target.value)}
                className="h-9"
                placeholder="$29"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Period</Label>
              <Input
                value={block.props.billingPeriod ?? '/month'}
                onChange={(e) => updateTextProp('billingPeriod', e.target.value)}
                className="h-9"
                placeholder="/month"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Description</Label>
              <VariablePicker
                onInsert={(v) => updateTextProp('description', (block.props.description ?? '') + v)}
              />
            </div>
            <Textarea
              value={block.props.description ?? ''}
              onChange={(e) => updateTextProp('description', e.target.value)}
              className="min-h-[60px] resize-none text-sm"
              placeholder="Optional description..."
            />
            {hasDescriptionVariables && (
              <div className="p-2 rounded bg-muted/50 text-sm">
                <VariablePreview text={block.props.description ?? ''} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={block.props.isPopular ?? false}
              onCheckedChange={(checked) => updateProp('isPopular', checked)}
            />
            <Label className="text-xs">Mark as Popular</Label>
          </div>
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Features">
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground">Features support variables</p>
            <VariablePicker
              onInsert={(v) => {
                if (block.props.features.length > 0) {
                  const lastFeature = block.props.features[block.props.features.length - 1]
                  updateFeature(block.props.features.length - 1, lastFeature + v)
                } else {
                  addFeature()
                }
              }}
            />
          </div>
          {block.props.features.map((feature, idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex gap-2">
                <Input
                  value={feature}
                  onChange={(e) => updateFeature(idx, e.target.value)}
                  className="flex-1 h-9"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => removeFeature(idx)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
              {feature.includes('{{') && (
                <div className="p-2 rounded bg-muted/50 text-xs">
                  <VariablePreview text={feature} />
                </div>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" className="w-full" onClick={addFeature}>
            <Plus className="h-4 w-4 mr-1" />
            Add Feature
          </Button>
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Button">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Button Text</Label>
              <VariablePicker
                onInsert={(v) => updateTextProp('buttonText', block.props.buttonText + v)}
              />
            </div>
            <Input
              value={block.props.buttonText}
              onChange={(e) => updateTextProp('buttonText', e.target.value)}
              className="h-9"
            />
            {hasButtonTextVariables && (
              <div className="p-2 rounded bg-muted/50 text-sm">
                <VariablePreview text={block.props.buttonText} />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1">
                <Link className="h-3 w-3" />
                Button Link
              </Label>
              <VariablePicker
                onInsert={(v) => updateTextProp('buttonHref', block.props.buttonHref + v)}
              />
            </div>
            <Input
              value={block.props.buttonHref}
              onChange={(e) => updateTextProp('buttonHref', e.target.value)}
              className="h-9"
              placeholder="https://"
            />
            {block.props.buttonHref.includes('{{') && (
              <div className="p-2 rounded bg-muted/50 text-xs">
                <VariablePreview text={block.props.buttonHref} />
              </div>
            )}
          </div>
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Colors">
        <div className="space-y-3">
          {/* Accent color with gradient support - used for price, badge, buttons, checkmarks */}
          <GradientControl
            label="Accent Color"
            solidColor={block.props.accentColor ?? '#2563eb'}
            gradient={block.props.accentGradient}
            onSolidColorChange={(color) => updateProp('accentColor', color)}
            onGradientChange={(gradient) => updateProp('accentGradient', gradient)}
            allowTransparent={false}
          />

          {/* Text color with gradient support - used for plan name and feature text */}
          <GradientControl
            label="Text Color"
            solidColor={block.props.textColor ?? '#1f2937'}
            gradient={block.props.textGradient}
            onSolidColorChange={(color) => updateProp('textColor', color)}
            onGradientChange={(gradient) => updateProp('textGradient', gradient)}
            allowTransparent={false}
          />
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Spacing">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Margin Top</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.marginTop ?? 0}px
              </span>
            </div>
            <Slider
              value={[block.props.marginTop ?? 0]}
              onValueChange={([v]) => updateProp('marginTop', v)}
              min={0}
              max={64}
              step={4}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Margin Bottom</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.marginBottom ?? 0}px
              </span>
            </div>
            <Slider
              value={[block.props.marginBottom ?? 0]}
              onValueChange={([v]) => updateProp('marginBottom', v)}
              min={0}
              max={64}
              step={4}
            />
          </div>
        </div>
      </PropertyGroup>
    </>
  )
}

/**
 * Testimonial card properties
 */
function TestimonialCardProperties({ block }: { block: TestimonialCardBlock }) {
  const { actions } = useEmailBuilder()

  const updateProp = <K extends keyof typeof block.props>(
    key: K,
    value: (typeof block.props)[K]
  ) => {
    actions.flushHistory()
    actions.saveHistory('Update testimonial')
    actions.updateBlock(block.id, {
      props: { ...block.props, [key]: value },
    })
  }

  const updateTextProp = <K extends keyof typeof block.props>(
    key: K,
    value: (typeof block.props)[K]
  ) => {
    actions.updateBlock(block.id, {
      props: { ...block.props, [key]: value },
    })
    actions.saveHistoryDebounced('Update testimonial')
  }

  const hasQuoteVariables = block.props.quote.includes('{{')
  const hasNameVariables = block.props.authorName.includes('{{')
  const hasRoleVariables = block.props.authorRole?.includes('{{')
  const hasCompanyVariables = block.props.companyName?.includes('{{')

  return (
    <>
      <PropertyGroup title="Quote">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Quote Text</Label>
            <VariablePicker
              onInsert={(v) => updateTextProp('quote', block.props.quote + v)}
            />
          </div>
          <Textarea
            value={block.props.quote}
            onChange={(e) => updateTextProp('quote', e.target.value)}
            className="min-h-[80px] resize-none text-sm"
            placeholder="Customer quote..."
          />
          {hasQuoteVariables && (
            <div className="p-2 rounded bg-muted/50 text-sm">
              <VariablePreview text={block.props.quote} />
            </div>
          )}
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Author">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Name</Label>
              <VariablePicker
                onInsert={(v) => updateTextProp('authorName', block.props.authorName + v)}
              />
            </div>
            <Input
              value={block.props.authorName}
              onChange={(e) => updateTextProp('authorName', e.target.value)}
              className="h-9"
            />
            {hasNameVariables && (
              <div className="p-2 rounded bg-muted/50 text-sm">
                <VariablePreview text={block.props.authorName} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Role</Label>
              <VariablePicker
                onInsert={(v) => updateTextProp('authorRole', (block.props.authorRole ?? '') + v)}
              />
            </div>
            <Input
              value={block.props.authorRole ?? ''}
              onChange={(e) => updateTextProp('authorRole', e.target.value)}
              className="h-9"
              placeholder="CEO, Marketing Director..."
            />
            {hasRoleVariables && (
              <div className="p-2 rounded bg-muted/50 text-sm">
                <VariablePreview text={block.props.authorRole ?? ''} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Company</Label>
              <VariablePicker
                onInsert={(v) => updateTextProp('companyName', (block.props.companyName ?? '') + v)}
              />
            </div>
            <Input
              value={block.props.companyName ?? ''}
              onChange={(e) => updateTextProp('companyName', e.target.value)}
              className="h-9"
              placeholder="Company name..."
            />
            {hasCompanyVariables && (
              <div className="p-2 rounded bg-muted/50 text-sm">
                <VariablePreview text={block.props.companyName ?? ''} />
              </div>
            )}
          </div>

          <ImageSourceControl
            value={block.props.avatarSrc ?? ''}
            onChange={(url) => updateProp('avatarSrc', url)}
            label="Avatar"
            placeholder="Avatar URL..."
            showPreview={true}
          />
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Rating">
        <div className="space-y-2">
          <Label className="text-xs">Stars (0-5)</Label>
          <Slider
            value={[block.props.rating ?? 5]}
            onValueChange={([v]) => updateProp('rating', v)}
            min={0}
            max={5}
            step={1}
          />
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Colors">
        <div className="space-y-3">
          {/* Accent color with gradient support - used for stars and quote marks */}
          <GradientControl
            label="Accent Color"
            solidColor={block.props.accentColor ?? '#f59e0b'}
            gradient={block.props.accentGradient}
            onSolidColorChange={(color) => updateProp('accentColor', color)}
            onGradientChange={(gradient) => updateProp('accentGradient', gradient)}
            allowTransparent={false}
          />

          {/* Text color with gradient support - used for quote text and author name */}
          <GradientControl
            label="Text Color"
            solidColor={block.props.textColor ?? '#374151'}
            gradient={block.props.textGradient}
            onSolidColorChange={(color) => updateProp('textColor', color)}
            onGradientChange={(gradient) => updateProp('textGradient', gradient)}
            allowTransparent={false}
          />
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Spacing">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Margin Top</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.marginTop ?? 0}px
              </span>
            </div>
            <Slider
              value={[block.props.marginTop ?? 0]}
              onValueChange={([v]) => updateProp('marginTop', v)}
              min={0}
              max={64}
              step={4}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Margin Bottom</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.marginBottom ?? 0}px
              </span>
            </div>
            <Slider
              value={[block.props.marginBottom ?? 0]}
              onValueChange={([v]) => updateProp('marginBottom', v)}
              min={0}
              max={64}
              step={4}
            />
          </div>
        </div>
      </PropertyGroup>
    </>
  )
}

/**
 * Feature card properties
 */
function FeatureCardProperties({ block }: { block: FeatureCardBlock }) {
  const { actions } = useEmailBuilder()

  const updateProp = <K extends keyof typeof block.props>(
    key: K,
    value: (typeof block.props)[K]
  ) => {
    actions.flushHistory()
    actions.saveHistory('Update feature card')
    actions.updateBlock(block.id, {
      props: { ...block.props, [key]: value },
    })
  }

  const updateTextProp = <K extends keyof typeof block.props>(
    key: K,
    value: (typeof block.props)[K]
  ) => {
    actions.updateBlock(block.id, {
      props: { ...block.props, [key]: value },
    })
    actions.saveHistoryDebounced('Update feature card')
  }

  const hasTitleVariables = block.props.title.includes('{{')
  const hasDescriptionVariables = block.props.description.includes('{{')

  return (
    <>
      <PropertyGroup title="Content">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Icon (Emoji)</Label>
            <Input
              value={block.props.icon}
              onChange={(e) => updateTextProp('icon', e.target.value)}
              className="h-9"
              placeholder="🚀"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Title</Label>
              <VariablePicker
                onInsert={(v) => updateTextProp('title', block.props.title + v)}
              />
            </div>
            <Input
              value={block.props.title}
              onChange={(e) => updateTextProp('title', e.target.value)}
              className="h-9"
            />
            {hasTitleVariables && (
              <div className="p-2 rounded bg-muted/50 text-sm">
                <VariablePreview text={block.props.title} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Description</Label>
              <VariablePicker
                onInsert={(v) => updateTextProp('description', block.props.description + v)}
              />
            </div>
            <Textarea
              value={block.props.description}
              onChange={(e) => updateTextProp('description', e.target.value)}
              className="min-h-[60px] resize-none text-sm"
            />
            {hasDescriptionVariables && (
              <div className="p-2 rounded bg-muted/50 text-sm">
                <VariablePreview text={block.props.description} />
              </div>
            )}
          </div>
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Layout">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Layout</Label>
            <Select
              value={block.props.layout ?? 'vertical'}
              onValueChange={(v) => updateProp('layout', v as 'vertical' | 'horizontal')}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vertical">Vertical</SelectItem>
                <SelectItem value="horizontal">Horizontal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Alignment</Label>
            <AlignmentToggle
              value={block.props.align ?? 'center'}
              onChange={(v) => updateProp('align', v)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Icon Size</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.iconSize ?? 48}px
              </span>
            </div>
            <Slider
              value={[block.props.iconSize ?? 48]}
              onValueChange={([v]) => updateProp('iconSize', v)}
              min={24}
              max={72}
              step={4}
            />
          </div>
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Colors">
        <div className="space-y-3">
          {/* Title color with gradient support */}
          <GradientControl
            label="Title Color"
            solidColor={block.props.titleColor ?? '#1f2937'}
            gradient={block.props.titleGradient}
            onSolidColorChange={(color) => updateProp('titleColor', color)}
            onGradientChange={(gradient) => updateProp('titleGradient', gradient)}
            allowTransparent={false}
          />

          {/* Description color with gradient support */}
          <GradientControl
            label="Description Color"
            solidColor={block.props.descriptionColor ?? '#6b7280'}
            gradient={block.props.descriptionGradient}
            onSolidColorChange={(color) => updateProp('descriptionColor', color)}
            onGradientChange={(gradient) => updateProp('descriptionGradient', gradient)}
            allowTransparent={false}
          />
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Spacing">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Margin Top</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.marginTop ?? 0}px
              </span>
            </div>
            <Slider
              value={[block.props.marginTop ?? 0]}
              onValueChange={([v]) => updateProp('marginTop', v)}
              min={0}
              max={64}
              step={4}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Margin Bottom</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.marginBottom ?? 0}px
              </span>
            </div>
            <Slider
              value={[block.props.marginBottom ?? 0]}
              onValueChange={([v]) => updateProp('marginBottom', v)}
              min={0}
              max={64}
              step={4}
            />
          </div>
        </div>
      </PropertyGroup>
    </>
  )
}

/**
 * Stats card properties
 */
function StatsCardProperties({ block }: { block: StatsCardBlock }) {
  const { actions } = useEmailBuilder()

  const updateProp = <K extends keyof typeof block.props>(
    key: K,
    value: (typeof block.props)[K]
  ) => {
    actions.flushHistory()
    actions.saveHistory('Update stats card')
    actions.updateBlock(block.id, {
      props: { ...block.props, [key]: value },
    })
  }

  const updateTextProp = <K extends keyof typeof block.props>(
    key: K,
    value: (typeof block.props)[K]
  ) => {
    actions.updateBlock(block.id, {
      props: { ...block.props, [key]: value },
    })
    actions.saveHistoryDebounced('Update stats card')
  }

  const hasValueVariables = block.props.value.includes('{{')
  const hasLabelVariables = block.props.label.includes('{{')

  return (
    <>
      <PropertyGroup title="Content">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Value</Label>
              <VariablePicker
                onInsert={(v) => updateTextProp('value', block.props.value + v)}
              />
            </div>
            <Input
              value={block.props.value}
              onChange={(e) => updateTextProp('value', e.target.value)}
              className="h-9"
              placeholder="10,000+"
            />
            {hasValueVariables && (
              <div className="p-2 rounded bg-muted/50 text-sm">
                <VariablePreview text={block.props.value} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Label</Label>
              <VariablePicker
                onInsert={(v) => updateTextProp('label', block.props.label + v)}
              />
            </div>
            <Input
              value={block.props.label}
              onChange={(e) => updateTextProp('label', e.target.value)}
              className="h-9"
              placeholder="Happy Customers"
            />
            {hasLabelVariables && (
              <div className="p-2 rounded bg-muted/50 text-sm">
                <VariablePreview text={block.props.label} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Icon (Emoji, optional)</Label>
            <Input
              value={block.props.icon ?? ''}
              onChange={(e) => updateTextProp('icon', e.target.value || undefined)}
              className="h-9"
              placeholder="📊"
            />
          </div>
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Style">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Alignment</Label>
            <AlignmentToggle
              value={block.props.align ?? 'center'}
              onChange={(v) => updateProp('align', v)}
            />
          </div>
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Colors">
        <div className="space-y-3">
          <GradientControl
            label="Value"
            solidColor={block.props.valueColor ?? '#1f2937'}
            gradient={block.props.valueGradient}
            onSolidColorChange={(color) => updateProp('valueColor', color)}
            onGradientChange={(gradient) => updateProp('valueGradient', gradient)}
            allowTransparent={false}
          />

          <GradientControl
            label="Label"
            solidColor={block.props.labelColor ?? '#6b7280'}
            gradient={block.props.labelGradient}
            onSolidColorChange={(color) => updateProp('labelColor', color)}
            onGradientChange={(gradient) => updateProp('labelGradient', gradient)}
            allowTransparent={false}
          />
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Spacing">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Margin Top</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.marginTop ?? 0}px
              </span>
            </div>
            <Slider
              value={[block.props.marginTop ?? 0]}
              onValueChange={([v]) => updateProp('marginTop', v)}
              min={0}
              max={64}
              step={4}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Margin Bottom</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.marginBottom ?? 0}px
              </span>
            </div>
            <Slider
              value={[block.props.marginBottom ?? 0]}
              onValueChange={([v]) => updateProp('marginBottom', v)}
              min={0}
              max={64}
              step={4}
            />
          </div>
        </div>
      </PropertyGroup>
    </>
  )
}

/**
 * Alert card properties
 */
function AlertCardProperties({ block }: { block: AlertCardBlock }) {
  const { actions } = useEmailBuilder()

  const updateProp = <K extends keyof typeof block.props>(
    key: K,
    value: (typeof block.props)[K]
  ) => {
    actions.flushHistory()
    actions.saveHistory('Update alert card')
    actions.updateBlock(block.id, {
      props: { ...block.props, [key]: value },
    })
  }

  const updateTextProp = <K extends keyof typeof block.props>(
    key: K,
    value: (typeof block.props)[K]
  ) => {
    actions.updateBlock(block.id, {
      props: { ...block.props, [key]: value },
    })
    actions.saveHistoryDebounced('Update alert card')
  }

  const hasTitleVariables = block.props.title?.includes('{{')
  const hasMessageVariables = block.props.message.includes('{{')

  return (
    <>
      <PropertyGroup title="Content">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Alert Type</Label>
            <Select
              value={block.props.alertType}
              onValueChange={(v) => updateProp('alertType', v as AlertType)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="info">ℹ️ Info</SelectItem>
                <SelectItem value="success">✅ Success</SelectItem>
                <SelectItem value="warning">⚠️ Warning</SelectItem>
                <SelectItem value="error">❌ Error</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Title</Label>
              <VariablePicker
                onInsert={(v) => updateTextProp('title', (block.props.title ?? '') + v)}
              />
            </div>
            <Input
              value={block.props.title ?? ''}
              onChange={(e) => updateTextProp('title', e.target.value || undefined)}
              className="h-9"
              placeholder="Optional title..."
            />
            {hasTitleVariables && (
              <div className="p-2 rounded bg-muted/50 text-sm">
                <VariablePreview text={block.props.title ?? ''} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Message</Label>
              <VariablePicker
                onInsert={(v) => updateTextProp('message', block.props.message + v)}
              />
            </div>
            <Textarea
              value={block.props.message}
              onChange={(e) => updateTextProp('message', e.target.value)}
              className="min-h-[60px] resize-none text-sm"
            />
            {hasMessageVariables && (
              <div className="p-2 rounded bg-muted/50 text-sm">
                <VariablePreview text={block.props.message} />
              </div>
            )}
          </div>
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Button (Optional)">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Button Text</Label>
            <Input
              value={block.props.buttonText ?? ''}
              onChange={(e) => updateTextProp('buttonText', e.target.value || undefined)}
              className="h-9"
              placeholder="Learn more..."
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1">
                <Link className="h-3 w-3" />
                Button Link
              </Label>
              <VariablePicker
                onInsert={(v) =>
                  updateTextProp('buttonHref', (block.props.buttonHref ?? '') + v)
                }
              />
            </div>
            <Input
              value={block.props.buttonHref ?? ''}
              onChange={(e) => updateTextProp('buttonHref', e.target.value || undefined)}
              className="h-9"
              placeholder="https://"
            />
            {(block.props.buttonHref ?? '').includes('{{') && (
              <div className="p-2 rounded bg-muted/50 text-xs">
                <VariablePreview text={block.props.buttonHref ?? ''} />
              </div>
            )}
          </div>
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Colors">
        <div className="space-y-3">
          <GradientControl
            label="Text"
            solidColor={block.props.textColor ?? '#1f2937'}
            gradient={block.props.textGradient}
            onSolidColorChange={(color) => updateProp('textColor', color)}
            onGradientChange={(gradient) => updateProp('textGradient', gradient)}
            allowTransparent={false}
          />
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Spacing">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Margin Top</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.marginTop ?? 0}px
              </span>
            </div>
            <Slider
              value={[block.props.marginTop ?? 0]}
              onValueChange={([v]) => updateProp('marginTop', v)}
              min={0}
              max={64}
              step={4}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Margin Bottom</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.marginBottom ?? 0}px
              </span>
            </div>
            <Slider
              value={[block.props.marginBottom ?? 0]}
              onValueChange={([v]) => updateProp('marginBottom', v)}
              min={0}
              max={64}
              step={4}
            />
          </div>
        </div>
      </PropertyGroup>
    </>
  )
}

/**
 * Countdown Timer Properties Panel
 * Allows editing all countdown timer settings including target date,
 * visible time units, visual style, and colors.
 *
 * SOURCE OF TRUTH KEYWORDS: CountdownTimerProperties
 */
function CountdownTimerProperties({ block }: { block: CountdownTimerBlock }) {
  const { actions } = useEmailBuilder()

  /** Check if expired message contains variable placeholders for preview */
  const hasExpiredMessageVariables = block.props.expiredMessage.includes('{{')

  /**
   * Update a property with history tracking for undo/redo support
   */
  const updateProp = <K extends keyof typeof block.props>(
    key: K,
    value: (typeof block.props)[K]
  ) => {
    actions.flushHistory()
    actions.saveHistory('Update countdown timer')
    actions.updateBlock(block.id, {
      props: { ...block.props, [key]: value },
    })
  }

  /**
   * Update text properties with debounced history for smooth typing
   */
  const updateTextProp = <K extends keyof typeof block.props>(
    key: K,
    value: (typeof block.props)[K]
  ) => {
    actions.updateBlock(block.id, {
      props: { ...block.props, [key]: value },
    })
    actions.saveHistoryDebounced('Update countdown timer')
  }

  /**
   * Format ISO date string for datetime-local input
   */
  const formatDateForInput = (isoDate: string): string => {
    try {
      const date = new Date(isoDate)
      return date.toISOString().slice(0, 16)
    } catch {
      return new Date().toISOString().slice(0, 16)
    }
  }

  /**
   * Convert datetime-local input value back to ISO string
   */
  const handleDateChange = (value: string) => {
    try {
      const date = new Date(value)
      updateProp('targetDate', date.toISOString())
    } catch {
      // Invalid date, ignore
    }
  }

  return (
    <>
      <PropertyGroup title="Target Date">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Countdown To</Label>
            <Input
              type="datetime-local"
              value={formatDateForInput(block.props.targetDate)}
              onChange={(e) => handleDateChange(e.target.value)}
              className="h-9"
            />
            <p className="text-xs text-muted-foreground">
              Timer counts down to this date
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Expired Message</Label>
              <VariablePicker
                onInsert={(variable) =>
                  updateTextProp('expiredMessage', block.props.expiredMessage + variable)
                }
              />
            </div>
            <Input
              value={block.props.expiredMessage}
              onChange={(e) => updateTextProp('expiredMessage', e.target.value)}
              className="h-9"
              placeholder="This offer has expired"
            />
            {hasExpiredMessageVariables && (
              <div className="p-2 rounded bg-muted/50 text-sm">
                <VariablePreview text={block.props.expiredMessage} />
              </div>
            )}
          </div>
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Display Units">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Show Days</Label>
            <Switch
              checked={block.props.showDays}
              onCheckedChange={(checked) => updateProp('showDays', checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Show Hours</Label>
            <Switch
              checked={block.props.showHours}
              onCheckedChange={(checked) => updateProp('showHours', checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Show Minutes</Label>
            <Switch
              checked={block.props.showMinutes}
              onCheckedChange={(checked) => updateProp('showMinutes', checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Show Seconds</Label>
            <Switch
              checked={block.props.showSeconds}
              onCheckedChange={(checked) => updateProp('showSeconds', checked)}
            />
          </div>
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Style">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Timer Style</Label>
            <Select
              value={block.props.style}
              onValueChange={(v) => updateProp('style', v as CountdownTimerStyle)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="boxes">Boxes (D:H:M:S)</SelectItem>
                <SelectItem value="inline">Inline Text</SelectItem>
                <SelectItem value="minimal">Minimal Numbers</SelectItem>
                <SelectItem value="circular">Circular</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Separator Style</Label>
            <Select
              value={block.props.separatorStyle}
              onValueChange={(v) => updateProp('separatorStyle', v as CountdownSeparatorStyle)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="colon">Colon (:)</SelectItem>
                <SelectItem value="text">Text (e.g. "days")</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Alignment</Label>
            <ToggleGroup
              type="single"
              value={block.props.align ?? 'center'}
              onValueChange={(v) => v && updateProp('align', v as TextAlign)}
              className="w-full"
            >
              <ToggleGroupItem value="left" className="flex-1">
                <AlignLeft className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="center" className="flex-1">
                <AlignCenter className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="right" className="flex-1">
                <AlignRight className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Colors">
        <div className="space-y-3">
          <GradientControl
            label="Digit"
            solidColor={block.props.digitColor}
            gradient={block.props.digitGradient}
            onSolidColorChange={(color) => updateProp('digitColor', color)}
            onGradientChange={(gradient) => updateProp('digitGradient', gradient)}
            allowTransparent={false}
          />

          <GradientControl
            label="Label"
            solidColor={block.props.labelColor}
            gradient={block.props.labelGradient}
            onSolidColorChange={(color) => updateProp('labelColor', color)}
            onGradientChange={(gradient) => updateProp('labelGradient', gradient)}
            allowTransparent={false}
          />

          <GradientControl
            label="Background"
            solidColor={block.props.backgroundColor}
            gradient={undefined}
            onSolidColorChange={(color) => updateProp('backgroundColor', color)}
            onGradientChange={() => {}}
          />

          {block.props.separatorStyle === 'colon' && (
            <GradientControl
              label="Separator"
              solidColor={block.props.separatorColor ?? block.props.digitColor}
              gradient={block.props.separatorGradient}
              onSolidColorChange={(color) => updateProp('separatorColor', color)}
              onGradientChange={(gradient) => updateProp('separatorGradient', gradient)}
              allowTransparent={false}
            />
          )}
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Spacing & Border">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Border Radius</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.borderRadius ?? 8}px
              </span>
            </div>
            <Slider
              value={[block.props.borderRadius ?? 8]}
              onValueChange={([v]) => updateProp('borderRadius', v)}
              min={0}
              max={32}
              step={2}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Padding</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.padding ?? 24}px
              </span>
            </div>
            <Slider
              value={[block.props.padding ?? 24]}
              onValueChange={([v]) => updateProp('padding', v)}
              min={0}
              max={64}
              step={4}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Margin Top</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.marginTop ?? 0}px
              </span>
            </div>
            <Slider
              value={[block.props.marginTop ?? 0]}
              onValueChange={([v]) => updateProp('marginTop', v)}
              min={0}
              max={64}
              step={4}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Margin Bottom</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.marginBottom ?? 0}px
              </span>
            </div>
            <Slider
              value={[block.props.marginBottom ?? 0]}
              onValueChange={([v]) => updateProp('marginBottom', v)}
              min={0}
              max={64}
              step={4}
            />
          </div>
        </div>
      </PropertyGroup>
    </>
  )
}

/**
 * Social Proof Block Properties
 * Allows editing avatar stack, metrics, text fields with variable support,
 * layout options, and styling.
 *
 * SOURCE OF TRUTH KEYWORDS: SocialProofProperties, AvatarStackProperties
 */
function SocialProofProperties({ block }: { block: SocialProofBlock }) {
  const { actions } = useEmailBuilder()

  /**
   * Update property with immediate history save.
   */
  const updateProp = <K extends keyof typeof block.props>(
    key: K,
    value: (typeof block.props)[K]
  ) => {
    actions.flushHistory()
    actions.saveHistory('Update social proof')
    actions.updateBlock(block.id, {
      props: { ...block.props, [key]: value },
    })
  }

  /**
   * Update text property with debounced history for smooth typing.
   */
  const updateTextProp = <K extends keyof typeof block.props>(
    key: K,
    value: (typeof block.props)[K]
  ) => {
    actions.updateBlock(block.id, {
      props: { ...block.props, [key]: value },
    })
    actions.saveHistoryDebounced('Update social proof')
  }

  /** Add a new avatar URL */
  const addAvatar = () => {
    updateProp('avatars', [...block.props.avatars, ''])
  }

  /** Update a specific avatar URL */
  const updateAvatar = (index: number, url: string) => {
    const updated = [...block.props.avatars]
    updated[index] = url
    actions.updateBlock(block.id, {
      props: { ...block.props, avatars: updated },
    })
    actions.saveHistoryDebounced('Update avatar')
  }

  /** Remove an avatar */
  const removeAvatar = (index: number) => {
    updateProp('avatars', block.props.avatars.filter((_, i) => i !== index))
  }

  const hasMetricVariables = block.props.metric.includes('{{')
  const hasLabelVariables = block.props.metricLabel.includes('{{')
  const hasHeadingVariables = block.props.heading?.includes('{{')
  const hasSubheadingVariables = block.props.subheading?.includes('{{')

  return (
    <>
      <PropertyGroup title="Avatars">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground mb-2">
            Add avatar images for the stack display
          </p>
          {block.props.avatars.map((avatar, idx) => (
            <AvatarImageControl
              key={idx}
              value={avatar}
              onChange={(url) => updateAvatar(idx, url)}
              onRemove={() => removeAvatar(idx)}
              placeholder="Avatar URL..."
            />
          ))}
          <Button variant="outline" size="sm" className="w-full" onClick={addAvatar}>
            <Plus className="h-4 w-4 mr-1" />
            Add Avatar
          </Button>
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Content">
        <div className="space-y-3">
          {/* Metric - supports variables */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Metric (Number)</Label>
              <VariablePicker
                onInsert={(v) => updateTextProp('metric', block.props.metric + v)}
              />
            </div>
            <Input
              value={block.props.metric}
              onChange={(e) => updateTextProp('metric', e.target.value)}
              className="h-9"
              placeholder="7,000+"
            />
            {hasMetricVariables && (
              <div className="p-2 rounded bg-muted/50 text-sm">
                <VariablePreview text={block.props.metric} />
              </div>
            )}
          </div>

          {/* Metric Label - supports variables */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Metric Label</Label>
              <VariablePicker
                onInsert={(v) => updateTextProp('metricLabel', block.props.metricLabel + v)}
              />
            </div>
            <Input
              value={block.props.metricLabel}
              onChange={(e) => updateTextProp('metricLabel', e.target.value)}
              className="h-9"
              placeholder="creators worldwide"
            />
            {hasLabelVariables && (
              <div className="p-2 rounded bg-muted/50 text-sm">
                <VariablePreview text={block.props.metricLabel} />
              </div>
            )}
          </div>

          {/* Optional Heading - supports variables */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Heading (Optional)</Label>
              <VariablePicker
                onInsert={(v) => updateTextProp('heading', (block.props.heading ?? '') + v)}
              />
            </div>
            <Input
              value={block.props.heading ?? ''}
              onChange={(e) => updateTextProp('heading', e.target.value || undefined)}
              className="h-9"
              placeholder="Join our community"
            />
            {hasHeadingVariables && (
              <div className="p-2 rounded bg-muted/50 text-sm">
                <VariablePreview text={block.props.heading ?? ''} />
              </div>
            )}
          </div>

          {/* Optional Subheading - supports variables */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Subheading (Optional)</Label>
              <VariablePicker
                onInsert={(v) => updateTextProp('subheading', (block.props.subheading ?? '') + v)}
              />
            </div>
            <Input
              value={block.props.subheading ?? ''}
              onChange={(e) => updateTextProp('subheading', e.target.value || undefined)}
              className="h-9"
              placeholder="Trusted by teams at..."
            />
            {hasSubheadingVariables && (
              <div className="p-2 rounded bg-muted/50 text-sm">
                <VariablePreview text={block.props.subheading ?? ''} />
              </div>
            )}
          </div>
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Layout">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs">Layout Style</Label>
            <Select
              value={block.props.layout ?? 'horizontal'}
              onValueChange={(v) => updateProp('layout', v as 'horizontal' | 'vertical' | 'centered')}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="horizontal">Horizontal</SelectItem>
                <SelectItem value="vertical">Vertical (Stacked)</SelectItem>
                <SelectItem value="centered">Centered</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Avatar Style">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Avatar Size</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.avatarSize ?? 40}px
              </span>
            </div>
            <Slider
              value={[block.props.avatarSize ?? 40]}
              onValueChange={([v]) => updateProp('avatarSize', v)}
              min={24}
              max={64}
              step={4}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Avatar Overlap</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.avatarOverlap ?? 12}px
              </span>
            </div>
            <Slider
              value={[block.props.avatarOverlap ?? 12]}
              onValueChange={([v]) => updateProp('avatarOverlap', v)}
              min={0}
              max={32}
              step={2}
            />
          </div>

          <GradientControl
            label="Avatar Border"
            solidColor={block.props.avatarBorderColor ?? '#ffffff'}
            gradient={undefined}
            onSolidColorChange={(color) => updateProp('avatarBorderColor', color)}
            onGradientChange={() => {}}
          />
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Colors">
        <div className="space-y-3">
          <GradientControl
            label="Metric"
            solidColor={block.props.metricColor ?? '#1f2937'}
            gradient={block.props.metricGradient}
            onSolidColorChange={(color) => updateProp('metricColor', color)}
            onGradientChange={(gradient) => updateProp('metricGradient', gradient)}
            allowTransparent={false}
          />

          <GradientControl
            label="Label"
            solidColor={block.props.labelColor ?? '#6b7280'}
            gradient={block.props.labelGradient}
            onSolidColorChange={(color) => updateProp('labelColor', color)}
            onGradientChange={(gradient) => updateProp('labelGradient', gradient)}
            allowTransparent={false}
          />

          {block.props.heading && (
            <GradientControl
              label="Heading"
              solidColor={block.props.headingColor ?? '#1f2937'}
              gradient={block.props.headingGradient}
              onSolidColorChange={(color) => updateProp('headingColor', color)}
              onGradientChange={(gradient) => updateProp('headingGradient', gradient)}
              allowTransparent={false}
            />
          )}

          {block.props.subheading && (
            <GradientControl
              label="Subheading"
              solidColor={block.props.subheadingColor ?? '#6b7280'}
              gradient={block.props.subheadingGradient}
              onSolidColorChange={(color) => updateProp('subheadingColor', color)}
              onGradientChange={(gradient) => updateProp('subheadingGradient', gradient)}
              allowTransparent={false}
            />
          )}

          <GradientControl
            label="Background"
            solidColor={block.props.backgroundColor ?? 'transparent'}
            gradient={undefined}
            onSolidColorChange={(color) => updateProp('backgroundColor', color)}
            onGradientChange={() => {}}
          />
        </div>
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Border">
        <BorderControl
          value={block.props.border}
          onChange={(border) => updateProp('border', border)}
        />
      </PropertyGroup>

      <Separator />

      <PropertyGroup title="Spacing">
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Padding</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.padding ?? 16}px
              </span>
            </div>
            <Slider
              value={[block.props.padding ?? 16]}
              onValueChange={([v]) => updateProp('padding', v)}
              min={0}
              max={48}
              step={4}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Border Radius</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.borderRadius ?? 8}px
              </span>
            </div>
            <Slider
              value={[block.props.borderRadius ?? 8]}
              onValueChange={([v]) => updateProp('borderRadius', v)}
              min={0}
              max={32}
              step={2}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Margin Top</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.marginTop ?? 0}px
              </span>
            </div>
            <Slider
              value={[block.props.marginTop ?? 0]}
              onValueChange={([v]) => updateProp('marginTop', v)}
              min={0}
              max={64}
              step={4}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Margin Bottom</Label>
              <span className="text-xs text-muted-foreground font-mono">
                {block.props.marginBottom ?? 0}px
              </span>
            </div>
            <Slider
              value={[block.props.marginBottom ?? 0]}
              onValueChange={([v]) => updateProp('marginBottom', v)}
              min={0}
              max={64}
              step={4}
            />
          </div>
        </div>
      </PropertyGroup>
    </>
  )
}

/**
 * Get block type icon and label
 */
function getBlockInfo(type: string) {
  switch (type) {
    case 'heading':
      return { icon: Heading1, label: 'Heading' }
    case 'text':
      return { icon: Type, label: 'Text' }
    case 'button':
      return { icon: MousePointerClick, label: 'Button' }
    case 'image':
      return { icon: Image, label: 'Image' }
    case 'divider':
      return { icon: Minus, label: 'Divider' }
    case 'spacer':
      return { icon: MoveVertical, label: 'Spacer' }
    case 'columns':
      return { icon: Columns2, label: 'Columns' }
    case 'list':
      return { icon: List, label: 'List' }
    case 'pricing-card':
      return { icon: CreditCard, label: 'Pricing' }
    case 'testimonial-card':
      return { icon: Quote, label: 'Testimonial' }
    case 'feature-card':
      return { icon: Sparkles, label: 'Feature' }
    case 'stats-card':
      return { icon: BarChart3, label: 'Stats' }
    case 'alert-card':
      return { icon: Bell, label: 'Alert' }
    case 'countdown-timer':
      return { icon: Timer, label: 'Timer' }
    case 'social-proof':
      return { icon: Users, label: 'Social Proof' }
    default:
      return { icon: Type, label: 'Block' }
  }
}

/**
 * Properties Sidebar Component
 * Responsive design: Hidden on mobile, visible on larger screens
 * Shows email settings when canvas is selected, block properties otherwise.
 *
 * SOURCE OF TRUTH KEYWORDS: PropertiesSidebar
 */
export function PropertiesSidebar() {
  const { selectedBlock, isCanvasSelected } = useEmailBuilder()

  // Show email settings when canvas is selected
  if (isCanvasSelected) {
    return (
      <div className="hidden lg:flex w-64 xl:w-72 border-l border-border/60 bg-sidebar shrink-0 flex-col">
        {/* Header for email settings */}
        <div className="p-4 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center shadow-sm">
              <Palette className="h-4 w-4 text-primary" />
            </div>
            <div>
              <span className="text-sm font-semibold text-foreground">Email Settings</span>
              <p className="text-xs text-muted-foreground">Container & background</p>
            </div>
          </div>
        </div>

        {/* Email settings content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <EmailSettingsProperties />
        </div>
      </div>
    )
  }

  // Show empty state when nothing is selected
  if (!selectedBlock) {
    return (
      <div className="hidden lg:flex w-64 xl:w-72 border-l border-border/60 bg-sidebar shrink-0 flex-col">
        <EmptyState />
      </div>
    )
  }

  const { icon: Icon, label } = getBlockInfo(selectedBlock.type)

  return (
    <div className="hidden lg:flex w-64 xl:w-72 border-l border-border/60 bg-sidebar shrink-0 flex-col">
      {/* Header with premium styling */}
      <div className="p-4 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center shadow-sm">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <span className="text-sm font-semibold text-foreground">{label}</span>
            <p className="text-xs text-muted-foreground">Edit properties</p>
          </div>
        </div>
      </div>

      {/* Properties content with better spacing */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {selectedBlock.type === 'heading' && (
          <HeadingProperties block={selectedBlock as EmailBlock & { type: 'heading' }} />
        )}
        {selectedBlock.type === 'text' && (
          <TextProperties block={selectedBlock as EmailBlock & { type: 'text' }} />
        )}
        {selectedBlock.type === 'button' && (
          <ButtonProperties block={selectedBlock as EmailBlock & { type: 'button' }} />
        )}
        {selectedBlock.type === 'image' && (
          <ImageProperties block={selectedBlock as EmailBlock & { type: 'image' }} />
        )}
        {selectedBlock.type === 'divider' && (
          <DividerProperties block={selectedBlock as EmailBlock & { type: 'divider' }} />
        )}
        {selectedBlock.type === 'spacer' && (
          <SpacerProperties block={selectedBlock as EmailBlock & { type: 'spacer' }} />
        )}
        {selectedBlock.type === 'columns' && (
          <ColumnsProperties block={selectedBlock as ColumnsBlock} />
        )}
        {selectedBlock.type === 'list' && (
          <ListProperties block={selectedBlock as ListBlock} />
        )}
        {selectedBlock.type === 'pricing-card' && (
          <PricingCardProperties block={selectedBlock as PricingCardBlock} />
        )}
        {selectedBlock.type === 'testimonial-card' && (
          <TestimonialCardProperties block={selectedBlock as TestimonialCardBlock} />
        )}
        {selectedBlock.type === 'feature-card' && (
          <FeatureCardProperties block={selectedBlock as FeatureCardBlock} />
        )}
        {selectedBlock.type === 'stats-card' && (
          <StatsCardProperties block={selectedBlock as StatsCardBlock} />
        )}
        {selectedBlock.type === 'alert-card' && (
          <AlertCardProperties block={selectedBlock as AlertCardBlock} />
        )}
        {selectedBlock.type === 'countdown-timer' && (
          <CountdownTimerProperties block={selectedBlock as CountdownTimerBlock} />
        )}
        {selectedBlock.type === 'social-proof' && (
          <SocialProofProperties block={selectedBlock as SocialProofBlock} />
        )}
      </div>
    </div>
  )
}
