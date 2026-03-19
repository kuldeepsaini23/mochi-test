/**
 * ============================================================================
 * SIDEBAR SETTINGS PANEL
 * ============================================================================
 *
 * Settings panel for configuring PreBuilt sidebar elements.
 * This is the ONLY way users can modify sidebar content - direct manipulation
 * of the sidebar panel (left) is not allowed.
 *
 * ============================================================================
 * SECTIONS
 * ============================================================================
 *
 * 1. LOGO - Type, logo image (storage/URL), logo size slider, text, link
 * 2. NAVIGATION LINKS - Add, remove, reorder, link to pages, icons
 * 3. APPEARANCE - Sidebar background, text color, border, width
 * 4. INSET - Content area background color
 * 5. COLLAPSIBLE - Enable/disable, default state, collapse mode
 * 6. FOOTER - Optional footer text
 *
 * ============================================================================
 * PAGE LINKING
 * ============================================================================
 *
 * Links can be connected to internal pages from the website.
 * When a sidebar is dropped, it auto-populates with example links.
 * Users can switch between page links and custom URLs.
 *
 * ============================================================================
 */

'use client'

import React, { useCallback, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { useAppSelector } from '../../_lib/store'
import { selectPageInfos, selectElementById } from '../../_lib/canvas-slice'
import type { FrameElement } from '../../_lib/types'
import type { PreBuiltSidebarElement, SidebarLink, SidebarSettings } from '../../_lib/prebuilt'
import { generateSidebarLinkId } from '../../_lib/prebuilt'
import {
  PropertySection,
  InputGroupControl,
  ToggleControl,
  DropdownControl,
  GradientControl,
  SliderInputControl,
  ImageSourceControl,
} from './controls'
import {
  PlusIcon,
  TrashIcon,
  GripVerticalIcon,
  ExternalLinkIcon,
  IconRenderer,
  MinusIcon,
  ChevronDownIcon,
} from '@/lib/icons'
import { IconPicker } from '@/components/ui/icon-picker'

// ============================================================================
// TYPES
// ============================================================================

interface SidebarSettingsPanelProps {
  /** The sidebar element data */
  element: PreBuiltSidebarElement

  /** Callback to update settings */
  onSettingsChange: (settings: SidebarSettings) => void
}

// ============================================================================
// SEPARATOR ITEM COMPONENT
// ============================================================================

interface SeparatorItemProps {
  link: SidebarLink
  index: number
  onUpdate: (index: number, updates: Partial<SidebarLink>) => void
  onRemove: (index: number) => void
  /** DnD handle props - attributes and listeners for the drag handle */
  handleProps?: React.HTMLAttributes<HTMLDivElement>
  /** Whether this item is being dragged (ghost state) */
  isDragging?: boolean
  /** Style overrides (for transform during drag) */
  style?: React.CSSProperties
}

/**
 * Separator item in the navigation list.
 * Renders as a group title/divider - no icon or URL, just a label.
 * Used to visually organize navigation links into sections.
 */
function SeparatorItem({ link, index, onUpdate, onRemove, handleProps, isDragging, style }: SeparatorItemProps) {
  return (
    <div
      className={cn(
        'group rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 overflow-hidden',
        isDragging && 'opacity-50'
      )}
      style={style}
    >
      {/* Header row - drag handle, separator indicator, label, remove button */}
      <div className="flex items-center gap-2 px-2 py-1.5">
        {/* Drag handle - now receives DnD props */}
        <div
          {...handleProps}
          className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground transition-colors touch-none"
        >
          <GripVerticalIcon size={14} />
        </div>

        {/* Separator indicator - horizontal line icon */}
        <div className="text-muted-foreground/50">
          <MinusIcon size={14} />
        </div>

        {/* Label input - takes remaining space */}
        <input
          type="text"
          value={link.label}
          onChange={(e) => onUpdate(index, { label: e.target.value })}
          placeholder="Section Title"
          className="flex-1 min-w-0 px-2 py-1 text-xs font-semibold uppercase tracking-wider bg-transparent border-0 focus:outline-none focus:ring-0 text-muted-foreground"
        />

        {/* Remove button */}
        <button
          onClick={() => onRemove(index)}
          className="p-1 text-muted-foreground/50 hover:text-destructive transition-colors rounded"
          title="Remove separator"
        >
          <TrashIcon size={12} />
        </button>
      </div>
    </div>
  )
}

/**
 * Sortable wrapper for SeparatorItem using DnD Kit.
 * Handles the drag-and-drop sorting logic while delegating rendering to SeparatorItem.
 */
function SortableSeparatorItem(props: Omit<SeparatorItemProps, 'handleProps' | 'isDragging' | 'style'>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.link.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef}>
      <SeparatorItem
        {...props}
        handleProps={{ ...attributes, ...listeners }}
        isDragging={isDragging}
        style={style}
      />
    </div>
  )
}

// ============================================================================
// LINK ITEM COMPONENT
// ============================================================================

interface LinkItemProps {
  link: SidebarLink
  index: number
  onUpdate: (index: number, updates: Partial<SidebarLink>) => void
  onRemove: (index: number) => void
  /** Available pages for page linking dropdown */
  availablePages: Array<{ id: string; name: string; slug: string }>
  /** DnD handle props - attributes and listeners for the drag handle */
  handleProps?: React.HTMLAttributes<HTMLDivElement>
  /** Whether this item is being dragged (ghost state) */
  isDragging?: boolean
  /** Style overrides (for transform during drag) */
  style?: React.CSSProperties
}

/**
 * Single link item in the navigation links list.
 *
 * REDESIGNED UI - Clean, collapsible design:
 * - Collapsed: Shows icon, label, URL preview, and actions in one compact row
 * - Expanded: Shows full editing options (icon picker, link type, URL/page, new tab)
 * - Click chevron or the item to expand/collapse
 * - Much cleaner and more intuitive than the previous multi-row design
 */
function LinkItem({ link, index, onUpdate, onRemove, availablePages, handleProps, isDragging, style }: LinkItemProps) {
  // Track expanded/collapsed state for this link item
  const [isExpanded, setIsExpanded] = useState(false)

  /**
   * Whether this link is connected to an internal page.
   * When true, show page selector. When false, show URL input.
   */
  const isPageLink = !!link.pageId

  /**
   * Handle link type change from dropdown.
   * 'page' = internal page link, 'url' = custom URL
   */
  const handleLinkTypeChange = (type: 'page' | 'url') => {
    if (type === 'page' && !isPageLink) {
      // Switch to page link mode - select first page if available
      if (availablePages.length > 0) {
        const firstPage = availablePages[0]
        onUpdate(index, {
          pageId: firstPage.id,
          href: firstPage.slug,
          label: firstPage.name,
        })
      }
    } else if (type === 'url' && isPageLink) {
      // Switch to custom URL mode - clear pageId, keep current href
      onUpdate(index, { pageId: undefined })
    }
  }

  /**
   * Handle page selection from dropdown.
   */
  const handlePageChange = (pageId: string) => {
    const page = availablePages.find((p) => p.id === pageId)
    if (page) {
      onUpdate(index, {
        pageId: page.id,
        href: page.slug,
        label: page.name,
      })
    }
  }

  /**
   * Get a display-friendly URL preview.
   * Truncates long URLs and shows page name for page links.
   */
  const getUrlPreview = () => {
    if (isPageLink) {
      const page = availablePages.find((p) => p.id === link.pageId)
      return page ? `/${page.slug}` : link.href
    }
    return link.href || '#'
  }

  return (
    <div
      className={cn(
        'group rounded-lg border border-border bg-card overflow-hidden transition-all',
        isDragging && 'opacity-50'
      )}
      style={style}
    >
      {/* Main row - always visible, compact single-line design */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        {/* Drag handle */}
        <div
          {...handleProps}
          className="cursor-grab text-muted-foreground/30 hover:text-muted-foreground transition-colors touch-none"
        >
          <GripVerticalIcon size={14} />
        </div>

        {/* Expand/collapse chevron */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        >
          <ChevronDownIcon
            size={12}
            className={cn('transition-transform', isExpanded && 'rotate-180')}
          />
        </button>

        {/* Icon - clickable to expand for icon editing */}
        <button
          onClick={() => setIsExpanded(true)}
          className="p-1 rounded hover:bg-muted/50 transition-colors"
          title="Click to change icon"
        >
          <IconRenderer name={link.icon || 'home'} size={14} className="text-muted-foreground/70" />
        </button>

        {/* Label input - takes remaining space */}
        <input
          type="text"
          value={link.label}
          onChange={(e) => onUpdate(index, { label: e.target.value })}
          placeholder="Label"
          className="flex-1 min-w-0 px-1 py-0.5 text-xs font-medium bg-transparent border-0 focus:outline-none focus:ring-0"
        />

        {/* URL preview - shows current link destination, muted */}
        <span
          className="text-[10px] text-muted-foreground/50 font-mono truncate max-w-[80px] cursor-pointer hover:text-muted-foreground"
          onClick={() => setIsExpanded(true)}
          title={`${getUrlPreview()} (click to edit)`}
        >
          {getUrlPreview()}
        </span>

        {/* New tab indicator - only show if enabled */}
        {link.openInNewTab && (
          <ExternalLinkIcon size={10} className="text-muted-foreground/40 shrink-0" />
        )}

        {/* Remove button */}
        <button
          onClick={() => onRemove(index)}
          className="p-1 text-muted-foreground/30 hover:text-destructive transition-colors rounded opacity-0 group-hover:opacity-100"
          title="Remove link"
        >
          <TrashIcon size={12} />
        </button>
      </div>

      {/* Expanded content - editing options */}
      {isExpanded && (
        <div className="px-2 pb-2 pt-1 space-y-2 border-t border-border/50 bg-muted/20">
          {/* Icon picker */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground/70 w-12 shrink-0">Icon</span>
            <IconPicker
              value={link.icon || 'home'}
              onValueChange={(icon) => onUpdate(index, { icon })}
              placeholder="Select icon..."
              className="h-6 text-xs flex-1"
            />
          </div>

          {/* Link type selector + URL/Page input */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground/70 w-12 shrink-0">Link to</span>

            {/* Link type toggle - clear tabs instead of mysterious icon */}
            <div className="flex rounded overflow-hidden border border-border bg-background">
              <button
                type="button"
                onClick={() => handleLinkTypeChange('page')}
                className={cn(
                  'px-2 py-1 text-[10px] font-medium transition-colors',
                  isPageLink
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                Page
              </button>
              <button
                type="button"
                onClick={() => handleLinkTypeChange('url')}
                className={cn(
                  'px-2 py-1 text-[10px] font-medium transition-colors border-l border-border',
                  !isPageLink
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                URL
              </button>
            </div>

            {/* Page selector or URL input */}
            {isPageLink ? (
              <select
                value={link.pageId || ''}
                onChange={(e) => handlePageChange(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1 text-[11px] bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {availablePages.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={link.href}
                onChange={(e) => onUpdate(index, { href: e.target.value })}
                placeholder="/path or https://..."
                className="flex-1 min-w-0 px-2 py-1 text-[11px] bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
            )}
          </div>

          {/* Open in new tab toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-[10px] text-muted-foreground/70 w-12 shrink-0"></span>
            <input
              type="checkbox"
              checked={link.openInNewTab || false}
              onChange={(e) => onUpdate(index, { openInNewTab: e.target.checked })}
              className="h-3 w-3 rounded border-border"
            />
            <span className="text-[10px] text-muted-foreground">Open in new tab</span>
          </label>
        </div>
      )}
    </div>
  )
}

/**
 * Sortable wrapper for LinkItem using DnD Kit.
 * Handles the drag-and-drop sorting logic while delegating rendering to LinkItem.
 */
function SortableLinkItem(props: Omit<LinkItemProps, 'handleProps' | 'isDragging' | 'style'>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.link.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef}>
      <LinkItem
        {...props}
        handleProps={{ ...attributes, ...listeners }}
        isDragging={isDragging}
        style={style}
      />
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * Complete settings panel for PreBuilt sidebar elements.
 */
export function SidebarSettingsPanel({
  element,
  onSettingsChange,
}: SidebarSettingsPanelProps) {
  const { settings } = element

  // =========================================================================
  // GET AVAILABLE PAGES FROM REDUX
  // =========================================================================

  /**
   * Get all pages from the store.
   * These are used for the page link dropdown in each LinkItem.
   */
  const pageInfos = useAppSelector(selectPageInfos)

  /**
   * Read the inset frame's actual backgroundColor from Redux.
   * This is the source of truth — the inset frame is a separate FrameElement
   * whose styles may differ from settings.inset.backgroundColor if they got
   * out of sync (e.g., sidebar placed before the sync logic was added).
   */
  const insetFrame = useAppSelector((state) => selectElementById(state, element.insetFrameId))
  const insetBackgroundColor = insetFrame && 'styles' in insetFrame
    ? (insetFrame as FrameElement).styles.backgroundColor ?? '#f5f5f5'
    : settings.inset?.backgroundColor || '#f5f5f5'

  /**
   * Transform page infos to the format expected by LinkItem.
   */
  const availablePages = pageInfos.map((page) => ({
    id: page.id,
    name: page.name,
    slug: page.slug,
  }))

  // =========================================================================
  // SETTINGS UPDATE HELPERS
  // =========================================================================

  /**
   * Update a top-level settings value.
   */
  const updateSettings = useCallback(
    <K extends keyof SidebarSettings>(key: K, value: SidebarSettings[K]) => {
      const newSettings = {
        ...settings,
        [key]: value,
      }
      onSettingsChange(newSettings)
    },
    [settings, onSettingsChange]
  )

  /**
   * Update logo settings.
   */
  const updateLogo = useCallback(
    (updates: Partial<SidebarSettings['logo']>) => {
      updateSettings('logo', {
        ...settings.logo,
        ...updates,
      })
    },
    [settings.logo, updateSettings]
  )

  /**
   * Update appearance settings.
   */
  const updateAppearance = useCallback(
    (updates: Partial<SidebarSettings['appearance']>) => {
      updateSettings('appearance', {
        ...settings.appearance,
        ...updates,
      })
    },
    [settings.appearance, updateSettings]
  )

  /**
   * Update inset settings.
   */
  const updateInset = useCallback(
    (updates: Partial<SidebarSettings['inset']>) => {
      updateSettings('inset', {
        ...settings.inset,
        ...updates,
      })
    },
    [settings.inset, updateSettings]
  )

  /**
   * Update collapsible settings.
   */
  const updateCollapsible = useCallback(
    (updates: Partial<SidebarSettings['collapsible']>) => {
      updateSettings('collapsible', {
        ...settings.collapsible,
        ...updates,
      })
    },
    [settings.collapsible, updateSettings]
  )

  /**
   * Update footer settings.
   */
  const updateFooter = useCallback(
    (updates: Partial<NonNullable<SidebarSettings['footer']>> | null) => {
      if (updates === null) {
        // Remove footer
        const { footer: _, ...rest } = settings
        onSettingsChange(rest as SidebarSettings)
      } else if (settings.footer) {
        // Update existing footer
        updateSettings('footer', {
          ...settings.footer,
          ...updates,
        })
      } else {
        // Create new footer
        updateSettings('footer', {
          text: '',
          ...updates,
        })
      }
    },
    [settings, updateSettings, onSettingsChange]
  )

  // =========================================================================
  // DRAG AND DROP SORTING
  // =========================================================================

  /**
   * Track the currently dragged item ID for DragOverlay rendering.
   */
  const [activeId, setActiveId] = useState<string | null>(null)

  /**
   * Configure DnD sensors - pointer for mouse/touch, keyboard for accessibility.
   * Activation constraint prevents accidental drags on small movements.
   */
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4, // Require 4px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor)
  )

  /**
   * Get link IDs for SortableContext - must be stable array of unique identifiers.
   */
  const linkIds = useMemo(() => settings.links.map((link) => link.id), [settings.links])

  /**
   * Find the currently dragged link for DragOverlay rendering.
   */
  const activeLink = useMemo(() => {
    if (!activeId) return null
    return settings.links.find((link) => link.id === activeId) || null
  }, [activeId, settings.links])

  /**
   * Handle drag start - store the active ID for overlay rendering.
   */
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  /**
   * Handle drag end - reorder the links array using arrayMove from dnd-kit.
   */
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event

      // Reset active ID regardless of outcome
      setActiveId(null)

      // If dropped outside or on itself, do nothing
      if (!over || active.id === over.id) return

      // Find the old and new indices
      const oldIndex = settings.links.findIndex((link) => link.id === active.id)
      const newIndex = settings.links.findIndex((link) => link.id === over.id)

      if (oldIndex === -1 || newIndex === -1) return

      // Reorder using arrayMove from dnd-kit/sortable
      const reorderedLinks = arrayMove(settings.links, oldIndex, newIndex)
      updateSettings('links', reorderedLinks)
    },
    [settings.links, updateSettings]
  )

  // =========================================================================
  // LINK MANAGEMENT
  // =========================================================================

  /**
   * Add a new link to the navigation.
   */
  const handleAddLink = useCallback(() => {
    const newLink: SidebarLink = {
      id: generateSidebarLinkId(),
      type: 'link',
      label: 'New Link',
      href: '#',
      icon: 'home',
    }
    updateSettings('links', [...settings.links, newLink])
  }, [settings.links, updateSettings])

  /**
   * Add a new separator/group title to the navigation.
   * Separators are non-clickable items that act as section headers.
   */
  const handleAddSeparator = useCallback(() => {
    const newSeparator: SidebarLink = {
      id: generateSidebarLinkId(),
      type: 'separator',
      label: 'SECTION',
      href: '', // Not used for separators
    }
    updateSettings('links', [...settings.links, newSeparator])
  }, [settings.links, updateSettings])

  /**
   * Update a specific link.
   * NOTE: We use a functional update pattern to avoid stale closure issues.
   * The callback receives fresh settings from the parent via onSettingsChange.
   */
  const handleUpdateLink = useCallback(
    (index: number, updates: Partial<SidebarLink>) => {
      // Get the CURRENT links from settings at call time (not closure time)
      const currentLinks = settings.links
      const newLinks = [...currentLinks]
      newLinks[index] = { ...newLinks[index], ...updates }

      // Directly call onSettingsChange to bypass any stale closure in updateSettings
      onSettingsChange({
        ...settings,
        links: newLinks,
      })
    },
    [settings, onSettingsChange]
  )

  /**
   * Remove a link.
   */
  const handleRemoveLink = useCallback(
    (index: number) => {
      const newLinks = settings.links.filter((_, i) => i !== index)
      updateSettings('links', newLinks)
    },
    [settings.links, updateSettings]
  )

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div>
      {/* ================================================================
          LOGO SECTION
          ================================================================ */}
      <PropertySection title="Logo" defaultOpen>
        {/* Logo Type */}
        <DropdownControl
          label="Type"
          value={settings.logo.type}
          options={[
            { value: 'text', label: 'Text Only' },
            { value: 'image', label: 'Image Only' },
            { value: 'both', label: 'Image + Text' },
          ]}
          onChange={(val) => updateLogo({ type: val as 'text' | 'image' | 'both' })}
        />

        {/* Logo Text (if text or both) */}
        {(settings.logo.type === 'text' || settings.logo.type === 'both') && (
          <InputGroupControl
            label="Text"
            value={settings.logo.text || ''}
            onChange={(val) => updateLogo({ text: String(val) })}
            type="text"
          />
        )}

        {/* Logo Image — uses ImageSourceControl for storage/URL selection (if image or both) */}
        {(settings.logo.type === 'image' || settings.logo.type === 'both') && (
          <ImageSourceControl
            label="Logo Image"
            value={settings.logo.imageUrl || ''}
            onChange={(val) => updateLogo({ imageUrl: val })}
          />
        )}

        {/* Logo Size — slider to control the logo image height (if image or both) */}
        {(settings.logo.type === 'image' || settings.logo.type === 'both') && (
          <SliderInputControl
            label="Logo Size"
            value={settings.logo.logoSize ?? 28}
            onChange={(val) => updateLogo({ logoSize: val })}
            min={16}
            max={120}
            step={1}
            unit="px"
          />
        )}

        {/* Logo Link */}
        <InputGroupControl
          label="Link"
          value={settings.logo.href}
          onChange={(val) => updateLogo({ href: String(val) })}
          type="text"
        />
      </PropertySection>

      {/* ================================================================
          NAVIGATION LINKS SECTION
          ================================================================ */}
      <PropertySection title="Navigation Links" defaultOpen>
        {/* Links list - renders both links and separators with drag-and-drop sorting */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={linkIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-2 mb-3">
              {settings.links.map((link, index) => {
                // Render sortable separator or link based on type
                if (link.type === 'separator') {
                  return (
                    <SortableSeparatorItem
                      key={link.id}
                      link={link}
                      index={index}
                      onUpdate={handleUpdateLink}
                      onRemove={handleRemoveLink}
                    />
                  )
                }

                // Default: render as sortable link (for backwards compatibility with items without type)
                return (
                  <SortableLinkItem
                    key={link.id}
                    link={link}
                    index={index}
                    onUpdate={handleUpdateLink}
                    onRemove={handleRemoveLink}
                    availablePages={availablePages}
                  />
                )
              })}

              {settings.links.length === 0 && (
                <div className="text-center py-4 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                  No navigation links yet.
                </div>
              )}
            </div>
          </SortableContext>

          {/* DragOverlay - shows a floating preview of the dragged item */}
          {typeof document !== 'undefined' &&
            createPortal(
              <DragOverlay dropAnimation={null}>
                {activeLink ? (
                  activeLink.type === 'separator' ? (
                    <SeparatorItem
                      link={activeLink}
                      index={-1}
                      onUpdate={() => {}}
                      onRemove={() => {}}
                    />
                  ) : (
                    <LinkItem
                      link={activeLink}
                      index={-1}
                      onUpdate={() => {}}
                      onRemove={() => {}}
                      availablePages={availablePages}
                    />
                  )
                ) : null}
              </DragOverlay>,
              document.body
            )}
        </DndContext>

        {/* Add Link & Add Separator Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleAddLink}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2',
              'text-xs font-medium text-muted-foreground',
              'border border-dashed border-border rounded-lg',
              'hover:border-primary hover:text-primary transition-colors'
            )}
          >
            <PlusIcon size={14} />
            Add Link
          </button>
          <button
            onClick={handleAddSeparator}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2',
              'text-xs font-medium text-muted-foreground',
              'border border-dashed border-border rounded-lg',
              'hover:border-muted-foreground/50 hover:text-muted-foreground transition-colors'
            )}
            title="Add a section title/separator"
          >
            <MinusIcon size={14} />
            Add Separator
          </button>
        </div>

        {/* Links Spacing - Gap between navigation links */}
        <div className="mt-4 pt-4 border-t border-border space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
            Spacing
          </p>
          <InputGroupControl
            label="Link Gap"
            value={settings.linksGap ?? 4}
            onChange={(val) => {
              // Clamp gap between 0-32px for usability
              const numVal = Number(val)
              const clampedVal = Math.min(32, Math.max(0, numVal))
              updateSettings('linksGap', clampedVal)
            }}
            type="number"
            unit="px"
          />
        </div>

        {/* Links Colors - Normal, Active, and Hover states */}
        <div className="mt-4 pt-4 border-t border-border space-y-2">
          {/* Normal state colors */}
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
            Normal State
          </p>
          <GradientControl
            label="Link Color"
            solidColor={settings.linksTextColor || '#000000'}
            gradient={undefined}
            onSolidColorChange={(val) => updateSettings('linksTextColor', val)}
            onGradientChange={() => {}}
          />

          {/* Active state colors */}
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mt-3 mb-1">
            Active State
          </p>
          <GradientControl
            label="Active Color"
            solidColor={settings.activeLinkColor || '#3b82f6'}
            gradient={undefined}
            onSolidColorChange={(val) => updateSettings('activeLinkColor', val)}
            onGradientChange={() => {}}
          />
          <GradientControl
            label="Active Bg"
            solidColor={settings.activeLinkBackgroundColor || 'rgba(59, 130, 246, 0.1)'}
            gradient={undefined}
            onSolidColorChange={(val) => updateSettings('activeLinkBackgroundColor', val)}
            onGradientChange={() => {}}
          />

          {/* Hover state colors */}
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mt-3 mb-1">
            Hover State
          </p>
          <GradientControl
            label="Hover Color"
            solidColor={settings.hoverLinkColor || settings.linksTextColor || '#000000'}
            gradient={undefined}
            onSolidColorChange={(val) => updateSettings('hoverLinkColor', val)}
            onGradientChange={() => {}}
          />
          <GradientControl
            label="Hover Bg"
            solidColor={settings.hoverLinkBackgroundColor || 'rgba(0, 0, 0, 0.05)'}
            gradient={undefined}
            onSolidColorChange={(val) => updateSettings('hoverLinkBackgroundColor', val)}
            onGradientChange={() => {}}
          />
        </div>
      </PropertySection>

      {/* ================================================================
          APPEARANCE SECTION
          ================================================================ */}
      <PropertySection title="Sidebar Appearance" defaultOpen={false}>
        <GradientControl
          label="Background"
          solidColor={settings.appearance.backgroundColor || '#ffffff'}
          gradient={undefined}
          onSolidColorChange={(val) => updateAppearance({ backgroundColor: val })}
          onGradientChange={() => {}}
        />

        <GradientControl
          label="Text Color"
          solidColor={settings.appearance.textColor || '#1a1a1a'}
          gradient={undefined}
          onSolidColorChange={(val) => updateAppearance({ textColor: val })}
          onGradientChange={() => {}}
        />

        <GradientControl
          label="Border Color"
          solidColor={settings.appearance.borderColor || '#e5e5e5'}
          gradient={undefined}
          onSolidColorChange={(val) => updateAppearance({ borderColor: val })}
          onGradientChange={() => {}}
        />

        <InputGroupControl
          label="Width"
          value={settings.appearance.width || 256}
          onChange={(val) => {
            // Clamp width between 180-400px for usability
            const numVal = Number(val)
            const clampedVal = Math.min(400, Math.max(180, numVal))
            updateAppearance({ width: clampedVal })
          }}
          type="number"
          unit="px"
        />
      </PropertySection>

      {/* ================================================================
          INSET (CONTENT AREA) SECTION
          ================================================================ */}
      <PropertySection title="Content Area (Inset)" defaultOpen={false}>
        <GradientControl
          label="Background"
          solidColor={insetBackgroundColor}
          gradient={undefined}
          onSolidColorChange={(val) => updateInset({ backgroundColor: val })}
          onGradientChange={() => {}}
        />
      </PropertySection>

      {/* ================================================================
          COLLAPSIBLE SECTION
          ================================================================ */}
      <PropertySection title="Collapsible Behavior" defaultOpen={false}>
        <ToggleControl
          label="Collapsible"
          checked={settings.collapsible.enabled}
          onChange={(val) => updateCollapsible({ enabled: val })}
        />

        {settings.collapsible.enabled && (
          <>
            <ToggleControl
              label="Start Collapsed"
              checked={settings.collapsible.defaultCollapsed || false}
              onChange={(val) => updateCollapsible({ defaultCollapsed: val })}
            />

            <DropdownControl
              label="Collapse Mode"
              value={settings.collapsible.mode || 'offcanvas'}
              options={[
                { value: 'offcanvas', label: 'Slide Away' },
                { value: 'icon', label: 'Icons Only' },
              ]}
              onChange={(val) =>
                updateCollapsible({ mode: val as 'offcanvas' | 'icon' })
              }
            />
          </>
        )}
      </PropertySection>


      {/* ================================================================
          FOOTER SECTION
          ================================================================ */}
      <PropertySection title="Footer" defaultOpen={false}>
        <ToggleControl
          label="Show Footer"
          checked={!!settings.footer}
          onChange={(val) => {
            if (val) {
              updateFooter({ text: '' })
            } else {
              updateFooter(null)
            }
          }}
        />

        {settings.footer && (
          <>
            <InputGroupControl
              label="Text"
              value={settings.footer.text || ''}
              onChange={(val) => updateFooter({ text: String(val) })}
              type="text"
            />

            <GradientControl
              label="Text Color"
              solidColor={settings.footer.textColor || settings.appearance.textColor || '#1a1a1a'}
              gradient={undefined}
              onSolidColorChange={(val) => updateFooter({ textColor: val })}
              onGradientChange={() => {}}
            />
          </>
        )}
      </PropertySection>
    </div>
  )
}
