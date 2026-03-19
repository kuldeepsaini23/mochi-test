/**
 * ============================================================================
 * PROPERTIES PANEL - Horizontal icon bar with single controlled panel below
 * ============================================================================
 *
 * Matches the sidebar design pattern:
 * - Horizontal icon bar at top (Design & Settings icons)
 * - Single panel expands BELOW on hover (no animations)
 * - Click icon to pin the panel open
 * - Hover any tab to preview its content (even when another is pinned)
 * - When mouse leaves, reverts to pinned tab or hides if nothing pinned
 *
 * SINGLE PANEL DESIGN:
 * - Only ONE panel ever visible at a time (no overlapping panels)
 * - When hovering different tabs, the panel content switches instantly
 * - When pinned, leaving the sidebar reverts to pinned tab content
 * - No animations for instant, clean feel
 *
 * ============================================================================
 * TAB STRUCTURE
 * ============================================================================
 *
 * DESIGN TAB:
 * - Dimensions (position, size, responsive mode)
 * - Layout (direction, justify, align, container, wrap)
 * - Background (color, image)
 * - Spacing & Borders (gap, padding, margin, radius, border)
 * - Position (sticky)
 * - Options (visible, locked)
 *
 * SETTINGS TAB:
 * - Element info (name, type) - Future
 * - SEO settings - Future
 * - Accessibility - Future
 *
 * ============================================================================
 * SPACING & BORDERS - Box Model Controls
 * ============================================================================
 *
 * The SpacingControl component provides an intuitive way to edit padding/margin:
 *
 * LINKED MODE (default):
 * - Single input + Link icon button
 * - Value applies to all 4 sides
 * - Click the link button to unlock individual sides
 *
 * UNLINKED MODE:
 * - Four inputs arranged as: Top, Left/Right, Bottom
 * - Each side can have a different value
 * - Click the unlink button to re-link all sides
 *
 * ============================================================================
 * THREE PROPERTY CATEGORIES
 * ============================================================================
 *
 * 1. BASIC PROPERTIES - Universal properties for all elements
 * 2. SPECIALTY PROPERTIES - Element-specific (text, image, etc.)
 * 3. CUSTOM PROPERTIES (Future) - User-defined component properties
 *
 * ============================================================================
 */

'use client'

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { MousePointer2, Paintbrush, Settings, Pin, PinOff, Component, Unlink, Pencil, ArrowUpToLine, ArrowDownToLine, ChevronDown } from 'lucide-react'

// Control components (matching mochi-webprodigies design)
import {
  PropertySection,
  ColorPickerControl,
  ToggleControl,
  DropdownControl,
  ImageBackgroundControl,
  ImageSourceControl,
  VideoSourceControl,
  SizeInputControl,
  IconToggleControl,
  DirectionIcons,
  JustifyIcons,
  AlignIcons,
  InputGroupControl,
  FontFamilyControl,
  FitToContentButton,
  FitFrameToContentButton,
  SliderInputControl,
  SpacingControl,
  parseSpacingValue,
  formatSpacingValue,
  BorderRadiusControl,
  parseBorderRadiusValue,
  formatBorderRadiusValue,
  HeaderBreakpointToggle,
  MobileEditingBanner,
  GradientControl,
  EffectsControl,
  BorderControl,
  RotationKnobControl,
  SizingModeControl,
  ButtonGroupControl,
  type WidthMode,
  type HeightMode,
  type OverflowMode,
} from './controls'
import { AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react'

// Settings Panels for PreBuilt elements
import { NavbarSettingsPanel } from './navbar-settings'
import { SidebarSettingsPanel } from './sidebar-settings'
import { TotalMembersSettingsPanel } from './total-members-settings'
import { LogoCarouselSettingsPanel } from './logo-carousel-settings'

// SmartCMS List settings panel
import { SmartCmsListSettingsSection } from './smartcms-list-settings'

// Form settings panel
import { FormSettingsPanel } from './form-settings'

// Payment settings panel
import { PaymentSettingsPanel } from './payment-settings'

// Button settings panel
import { ButtonSettingsSection } from './button-settings'

// Add to Cart button settings panel
import { AddToCartButtonSettingsSection } from './add-to-cart-button-settings'

// Checkout element settings panel
import { CheckoutSettingsSection } from './checkout-settings'

// Receipt element settings panel
import { ReceiptSettingsSection } from './receipt-settings'

// Cart button settings panel
import { CartSettingsSection } from './cart-settings'

// Ecommerce carousel settings panel
import { EcommerceCarouselSettingsSection } from './ecommerce-carousel-settings'

// FAQ settings panel
import { FaqSettingsSection } from './faq-settings'

// Sticky note settings panel (color presets + content)
import { StickyNoteSettingsSection } from './sticky-note-settings'

// Timer settings panel (mode, segments, expiry actions)
import { TimerSettingsSection } from './timer-settings'

// List settings panel (items management, icon config, layout)
import { ListSettingsSection } from './list-settings'

// Animation settings panel for frames
import { AnimationSettingsSection } from './animation-settings'

// Icon picker for button icons
import { IconPicker } from '@/components/ui/icon-picker'

// Feature gate for local components limit — FeatureGate wraps the convert button
// and handles the upgrade modal internally when the limit is reached
import { FeatureGate } from '@/components/feature-gate'

// Component editing - Expose as Prop UI
import { ExposeAsPropSection } from './expose-as-prop-section'
import { ExposedPropsEditor } from './exposed-props-editor'
import { CmsColumnBindingsEditor } from './cms-column-bindings-editor'

// Builder state management
import {
  useAppDispatch,
  useAppSelector,
  selectSelectedIds,
  selectActivePage,
  selectEditingBreakpoint,
  selectViewport,
  updateElement,
  updateElementResponsiveStyle,
  updateElementResponsiveProperty,
  clearSingleResponsiveStyle,
  clearSingleResponsiveProperty,
  // Component-related imports
  selectLocalComponentById,
  selectLocalComponents,
  useLocalComponents,
  updateLocalComponent,
  deleteLocalComponent,
  detachComponentInstanceAction,
  enterComponentEditMode,
  exitComponentEditMode,
  selectEditingComponent,
} from '../../_lib'
import {
  canConvertToComponent,
  convertFrameToComponent,
  detachComponentInstance,
} from '../../_lib/component-utils'
import { useBuilderContext } from '../../_lib/builder-context'
import {
  getStyleValue,
  hasPropertyOverride,
  getPropertyValue,
  hasBasePropertyOverride,
} from '../../_lib/style-utils'
import type { ResponsivePropertyOverrides, GradientConfig, EffectsConfig, BorderConfig, BackgroundVideoConfig, BackgroundMediaMode } from '../../_lib/types'
import { createUniformBorderConfig } from '../../_lib/border-utils'
import type {
  TextElement as TextElementType,
  FrameElement,
  ImageElement as ImageElementType,
  VideoElement as VideoElementType,
  FormElement as FormElementType,
  PaymentElement as PaymentElementType,
  SmartCmsListElement as SmartCmsListElementType,
  LinkElement as LinkElementType,
  ButtonElement,
  AddToCartButtonElement,
  CheckoutElement,
  CartElement,
  EcommerceCarouselElement,
  FaqElement,
  ListElement,
  StickyNoteElement,
  TimerElement,
  ReceiptElement,
} from '../../_lib/types'
import { DEFAULT_IMAGE_PROPS, DEFAULT_SKELETON_STYLES } from '../../_lib/types'
import type { PreBuiltNavbarElement, NavbarSettings, PreBuiltSidebarElement, SidebarSettings, PreBuiltTotalMembersElement, TotalMembersSettings, PreBuiltLogoCarouselElement, LogoCarouselSettings } from '../../_lib/prebuilt'
import { isPreBuiltNavbar, isPreBuiltSidebar, isPreBuiltTotalMembers, isPreBuiltLogoCarousel } from '../../_lib/prebuilt'
import type { ComponentInstanceElement, GroupActionContext } from '../../_lib/types'
import { executeAction as executeRegisteredAction } from '../../_lib/action-registry'
import { store } from '../../_lib/store'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// ============================================================================
// TYPES
// ============================================================================

type PropertiesTabId = 'design' | 'settings'

interface PropertiesTabConfig {
  id: PropertiesTabId
  label: string
  icon: React.ReactNode
}

// ============================================================================
// TAB CONFIGURATION
// ============================================================================

const PROPERTIES_TABS: PropertiesTabConfig[] = [
  { id: 'design', label: 'Design', icon: <Paintbrush className="h-5 w-5" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="h-5 w-5" /> },
]

// ============================================================================
// EMPTY STATE
// ============================================================================

function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center px-6 py-16">
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center mb-4 bg-accent"
      >
        <MousePointer2 className="w-6 h-6 text-muted-foreground/30" />
      </div>
      <p className="text-sm font-medium text-foreground/80 mb-1">No Selection</p>
      <p className="text-xs text-muted-foreground text-center max-w-[180px]">
        Select an element to edit its properties
      </p>
    </div>
  )
}

// ============================================================================
// FRAME SETTINGS SECTION - Convert to Component
// ============================================================================
/**
 * Settings section for frame elements.
 * Provides the "Convert to Component" functionality.
 *
 * A frame can be converted to a component if:
 * 1. It's a frame element (not page, text, image, etc.)
 * 2. It's not already inside a component instance
 *
 * When converted:
 * - The frame and all its children become a LocalComponent definition
 * - The original frame is replaced with a ComponentInstanceElement
 * - Children are removed from the canvas (they live in the component's sourceTree)
 */
interface FrameSettingsSectionProps {
  frameElement: FrameElement
  elements: Record<string, import('../../_lib/types').CanvasElement>
  childrenMap: Record<string, string[]>
}

function FrameSettingsSection({
  frameElement,
  elements,
  childrenMap,
}: FrameSettingsSectionProps) {
  const dispatch = useAppDispatch()
  const { websiteId } = useBuilderContext()

  // Hook for database-backed component operations
  // updateComponent persists changes to both Redux AND the database
  const { createComponent, updateComponent } = useLocalComponents()

  // Check if this frame is a master component
  const isMasterComponent = Boolean(frameElement.masterOfComponentId)

  // Get the component info if this is a master
  const masterComponent = useAppSelector((state) =>
    frameElement.masterOfComponentId
      ? selectLocalComponentById(state, frameElement.masterOfComponentId)
      : null
  )

  // Get all local components for skeleton component selector dropdown
  const localComponents = useAppSelector(selectLocalComponents)

  // Dialog state for naming the component
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [componentName, setComponentName] = useState('')
  const [isConverting, setIsConverting] = useState(false)

  // Dialog state for detaching master component
  const [isDetachMasterDialogOpen, setIsDetachMasterDialogOpen] = useState(false)

  // Check if this frame can be converted to a component
  const conversionCheck = useMemo(
    () => canConvertToComponent(frameElement, elements),
    [frameElement, elements]
  )

  /**
   * Handle the Convert to Component button click.
   * The <FeatureGate> wrapper intercepts the click and shows an upgrade modal
   * if the local components limit is reached — no manual gate check needed here.
   */
  const handleConvertClick = useCallback(() => {
    // Pre-fill with the frame's current name or a default
    setComponentName(frameElement.name || 'New Component')
    setIsDialogOpen(true)
  }, [frameElement.name])

  /**
   * Execute the conversion after user confirms the name.
   * This creates a LocalComponent in the database and replaces the frame with an instance.
   *
   * IMPORTANT: Component creation is persisted to the database via the useLocalComponents hook.
   * This ensures the component is available across all pages of the website.
   */
  const handleConfirmConvert = useCallback(async () => {
    if (!componentName.trim() || isConverting) return

    setIsConverting(true)

    try {
      // Convert the frame to a component (prepares the data)
      const result = convertFrameToComponent({
        frameElement,
        elements,
        childrenMap,
        name: componentName.trim(),
        websiteId,
      })

      // Create the component in the database (and Redux)
      // This uses the useLocalComponents hook which handles persistence
      const createdComponent = await createComponent({
        name: result.component.name,
        description: result.component.description,
        sourceTree: result.component.sourceTree,
        exposedProps: result.component.exposedProps,
        tags: result.component.tags,
        primaryInstanceId: frameElement.id, // Points to the master frame
      })

      if (!createdComponent) {
        throw new Error('Failed to create component')
      }

      // Mark the frame as the master of this component
      // The frame stays as type: 'frame' - it's NOT converted to a component instance
      // This allows the master to remain fully editable with real canvas children
      dispatch(
        updateElement({
          id: frameElement.id,
          updates: {
            masterOfComponentId: createdComponent.id,
            name: result.frameUpdates.name,
          },
        })
      )

      // Close the dialog
      setIsDialogOpen(false)
      setComponentName('')
    } catch (error) {
      console.error('Failed to create component:', error)
      // TODO: Show error toast
    } finally {
      setIsConverting(false)
    }
  }, [
    componentName,
    isConverting,
    frameElement,
    elements,
    childrenMap,
    websiteId,
    createComponent,
    dispatch,
  ])

  /**
   * Handle dialog cancel.
   */
  const handleCancelDialog = useCallback(() => {
    setIsDialogOpen(false)
    setComponentName('')
  }, [])

  /**
   * Handle detaching a master component.
   * This converts the master frame back to a regular frame and deletes the component definition.
   * Useful when a component gets corrupted and needs to be re-saved.
   */
  const handleDetachMasterComponent = useCallback(() => {
    if (!frameElement.masterOfComponentId) return

    const componentId = frameElement.masterOfComponentId

    // 1. Remove masterOfComponentId from the frame to convert it back to a regular frame
    dispatch(
      updateElement({
        id: frameElement.id,
        updates: {
          masterOfComponentId: undefined,
        },
      })
    )

    // 2. Delete the local component definition
    dispatch(deleteLocalComponent(componentId))

    setIsDetachMasterDialogOpen(false)
  }, [frameElement.id, frameElement.masterOfComponentId, dispatch])

  return (
    <>
      <PropertySection title="Component" defaultOpen>
        {/* Master Component Banner - shown when this frame IS a master component */}
        {isMasterComponent ? (
          <div className="px-3 py-3">
            {/* Purple master component indicator */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <div className="shrink-0 w-8 h-8 rounded-md bg-purple-500/20 flex items-center justify-center">
                <Component className="w-4 h-4 text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-purple-300 truncate">
                  Master Component
                </p>
                <p className="text-xs text-purple-400/70 truncate">
                  {masterComponent?.name || 'Unknown Component'}
                </p>
              </div>
            </div>

            {/* Edit Component Button - Enter edit mode to expose properties */}
            {masterComponent && (
              <button
                onClick={() => dispatch(enterComponentEditMode(masterComponent.id))}
                className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 font-medium text-sm transition-colors border border-purple-500/30"
              >
                <Pencil className="w-4 h-4" />
                Edit Component Props
              </button>
            )}

            {/* Detach Master Component Button - Converts back to regular frame */}
            <button
              onClick={() => setIsDetachMasterDialogOpen(true)}
              className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive font-medium text-xs transition-colors border border-destructive/20"
            >
              <Unlink className="w-3.5 h-3.5" />
              Detach Master Component
            </button>

            <p className="mt-2 text-xs text-muted-foreground text-center">
              This frame is the source for all instances of this component.
              Click &quot;Edit Component Props&quot; to expose customizable properties.
            </p>
          </div>
        ) : !conversionCheck.canConvert ? (
          /* Conversion not possible - show reason */
          <div className="px-3 py-2 text-xs text-muted-foreground">
            {conversionCheck.reason}
          </div>
        ) : (
          /* Conversion possible — FeatureGate intercepts the click and shows
             an upgrade modal when the local components limit is reached */
          <div className="px-3 py-2">
            <FeatureGate feature="local_components.limit">
              <button
                onClick={handleConvertClick}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-medium text-sm transition-colors"
              >
                <Component className="w-4 h-4" />
                Convert to Component
              </button>
            </FeatureGate>
            <p className="mt-2 text-xs text-muted-foreground text-center">
              Create a reusable component from this frame
            </p>
          </div>
        )}
      </PropertySection>

      {/* ================================================================
          LOADING SKELETON STYLES - Theme-aware skeleton colors
          Only shows for master components. Allows customizing the skeleton
          placeholder colors used when this component is in a SmartCMS List.
          ================================================================ */}
      {isMasterComponent && masterComponent && (
        <PropertySection title="Loading Skeleton" defaultOpen={false}>
          <div className="px-3 py-3 space-y-4">
            <p className="text-xs text-muted-foreground">
              Customize the loading state when this component is used in a SmartCMS List.
            </p>

            {/* ================================================================
                SKELETON COMPONENT SELECTOR
                Allow users to select another component as the loading skeleton.
                If no skeleton selected, a centered spinner is shown instead.
                ================================================================ */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Skeleton Component
              </label>
              <div className="relative">
                <select
                  value={masterComponent.loadingSkeletonComponentId ?? ''}
                  onChange={(e) => {
                    const newValue = e.target.value || null
                    // Use updateComponent from hook to persist to BOTH Redux AND database
                    updateComponent(masterComponent.id, {
                      loadingSkeletonComponentId: newValue,
                    })
                  }}
                  className="w-full h-9 px-3 pr-8 rounded-md text-sm bg-muted/50 border border-border appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">None (centered spinner)</option>
                  {Object.values(localComponents)
                    .filter((comp) => comp.id !== masterComponent.id) // Exclude self
                    .map((comp) => (
                      <option key={comp.id} value={comp.id}>
                        {comp.name}
                      </option>
                    ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
              <p className="text-[10px] text-muted-foreground/70">
                Component to display while CMS data loads. If none selected, shows a minimal spinner.
              </p>
            </div>

            {/* Divider between skeleton component and color settings */}
            <div className="border-t border-border/50 pt-4">
              <p className="text-xs text-muted-foreground mb-3">
                If no skeleton component is selected, customize the default shimmer colors:
              </p>
            </div>

            {/* Primary Color - Card/container background */}
            <div className="space-y-1">
              <ColorPickerControl
                label="Card Background"
                value={masterComponent.skeletonStyles?.primaryColor ?? DEFAULT_SKELETON_STYLES.primaryColor}
                onChange={(color) => {
                  dispatch(
                    updateLocalComponent({
                      id: masterComponent.id,
                      updates: {
                        skeletonStyles: {
                          ...masterComponent.skeletonStyles,
                          primaryColor: color,
                        },
                      },
                    })
                  )
                }}
              />
              <p className="text-[10px] text-muted-foreground/70 pl-0.5">
                Subtle background for the skeleton card container
              </p>
            </div>

            {/* Accent Color - Content placeholders */}
            <div className="space-y-1">
              <ColorPickerControl
                label="Content Placeholder"
                value={masterComponent.skeletonStyles?.accentColor ?? DEFAULT_SKELETON_STYLES.accentColor}
                onChange={(color) => {
                  dispatch(
                    updateLocalComponent({
                      id: masterComponent.id,
                      updates: {
                        skeletonStyles: {
                          ...masterComponent.skeletonStyles,
                          accentColor: color,
                        },
                      },
                    })
                  )
                }}
              />
              <p className="text-[10px] text-muted-foreground/70 pl-0.5">
                Shimmer effect color for text lines, images & buttons
              </p>
            </div>

            {/* Reset to defaults button */}
            <button
              onClick={() => {
                dispatch(
                  updateLocalComponent({
                    id: masterComponent.id,
                    updates: {
                      skeletonStyles: {
                        primaryColor: DEFAULT_SKELETON_STYLES.primaryColor,
                        accentColor: DEFAULT_SKELETON_STYLES.accentColor,
                      },
                    },
                  })
                )
              }}
              className="w-full py-2 px-3 text-xs font-medium rounded-md border border-border hover:bg-muted/50 transition-colors text-muted-foreground"
            >
              Reset to Default Colors
            </button>
          </div>
        </PropertySection>
      )}

      {/* Convert to Component Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Component className="w-5 h-5 text-primary" />
              Create Component
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="component-name" className="text-sm font-medium">
              Component Name
            </Label>
            <Input
              id="component-name"
              value={componentName}
              onChange={(e) => setComponentName(e.target.value)}
              placeholder="Enter component name..."
              className="mt-2"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleConfirmConvert()
                }
              }}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              This frame and all its children will be converted to a reusable
              component. You can use this component across your website.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelDialog} disabled={isConverting}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmConvert}
              disabled={!componentName.trim() || isConverting}
            >
              {isConverting ? 'Creating...' : 'Create Component'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detach Master Component Confirmation Dialog */}
      <Dialog open={isDetachMasterDialogOpen} onOpenChange={setIsDetachMasterDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Unlink className="w-5 h-5" />
              Detach Master Component
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              This will convert the master component back to a regular frame and
              <strong className="text-foreground"> delete the component definition</strong>.
            </p>
            <p className="mt-3 text-sm text-destructive/80">
              ⚠️ All instances of this component on other pages will become broken.
              Use this only if the component is corrupted and needs to be re-saved.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetachMasterDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDetachMasterComponent}>
              Detach Component
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  )
}

// ============================================================================
// COMPONENT INSTANCE SETTINGS SECTION - Prop Values & Detach
// ============================================================================
/**
 * Settings section for component instances.
 * Allows viewing/editing prop values and detaching the instance.
 *
 * IMPORTANT: Component instances have NON-EDITABLE children.
 * Users can only modify exposed prop values, not the component structure.
 * To edit the structure, they must enter "Edit Component" mode.
 */
interface ComponentInstanceSettingsSectionProps {
  instanceElement: ComponentInstanceElement
}

function ComponentInstanceSettingsSection({
  instanceElement,
}: ComponentInstanceSettingsSectionProps) {
  const dispatch = useAppDispatch()

  // Get the component definition for this instance
  const component = useAppSelector((state) =>
    selectLocalComponentById(state, instanceElement.componentId)
  )

  // Get ALL local components for recursive detachment of nested instances
  // When detaching a composed component, nested component instances must also be
  // recursively detached to avoid "Component not found" errors
  const localComponents = useAppSelector(selectLocalComponents)

  // State for detach confirmation
  const [isDetachDialogOpen, setIsDetachDialogOpen] = useState(false)

  /**
   * Check if this instance is the PRIMARY (master) instance.
   * The primary instance is the one that was created when the component was converted.
   * It has special status and cannot be detached without special handling.
   */
  const isPrimaryInstance = component?.primaryInstanceId === instanceElement.id

  /**
   * Handle detaching the component instance.
   *
   * This converts the component instance back to a regular frame with
   * editable children. Uses a single Redux action to:
   * 1. Replace the instance with a frame element (same ID, preserves tree position)
   * 2. Add all child elements from the component's sourceTree
   * 3. Rebuild childrenMap for proper parent-child relationships
   * 4. Unregister the instance from the component
   *
   * All operations happen in a SINGLE history entry, so Cmd+Z undoes the
   * entire detach and restores the component instance perfectly.
   *
   * NOTE: Primary/master instances cannot be detached (they are the source of truth).
   */
  const handleDetach = useCallback(() => {
    if (!component) return

    // Use the utility function to prepare the frame and child elements
    // This applies prop values and creates new IDs for children
    // Pass localComponents for RECURSIVE detachment of nested component instances
    // Without this, nested instances would have type:'component' but no valid componentId
    const result = detachComponentInstance(instanceElement, component, localComponents)

    // Dispatch the single action that handles everything atomically
    // This ensures undo/redo works correctly as one operation
    dispatch(
      detachComponentInstanceAction({
        instanceId: instanceElement.id,
        frameElement: result.frameElement,
        childElements: result.childElements,
        componentId: result.componentId,
      })
    )

    setIsDetachDialogOpen(false)
  }, [component, instanceElement, dispatch, localComponents])

  // If component not found, show error state
  if (!component) {
    return (
      <PropertySection title="Component" defaultOpen>
        <div className="px-3 py-4 text-center">
          <p className="text-sm text-destructive">Component not found</p>
          <p className="text-xs text-muted-foreground mt-1">
            The linked component may have been deleted.
          </p>
        </div>
      </PropertySection>
    )
  }

  return (
    <>
      <PropertySection title="Component" defaultOpen>
        {/* ============================================================================
            MASTER VS INSTANCE BADGE
            ============================================================================
            Shows whether this is the primary (master) instance or a regular instance.
            - Master: Created during conversion, editing updates the component definition
            - Instance: Dragged from sidebar, references the master */}
        <div className="px-3 py-2 border-b border-border">
          {isPrimaryInstance ? (
            // Master Component UI - Special styling
            <div className="flex items-center gap-2 p-2 rounded-lg bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/20">
              <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
                <Component className="w-4 h-4 text-violet-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{component.name}</p>
                  <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-violet-500/20 text-violet-400 uppercase tracking-wide">
                    Master
                  </span>
                </div>
                <p className="text-xs text-violet-300/70">
                  Primary component definition
                </p>
              </div>
            </div>
          ) : (
            // Regular Instance UI
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Component className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{component.name}</p>
                  <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-muted text-muted-foreground">
                    Instance
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  References master component
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================================
            MASTER COMPONENT INFO
            ============================================================================
            For master components, show additional information about how they work */}
        {isPrimaryInstance && (
          <div className="px-3 py-3 bg-violet-500/5 border-b border-border">
            <p className="text-xs text-violet-300/80 leading-relaxed">
              This is the <strong>master component</strong>. Changes to this element&apos;s
              exposed props will be reflected in all instances. To modify the component
              structure, use &quot;Edit Component&quot; mode.
            </p>
          </div>
        )}

        {/* No exposed props message (if empty) */}
        {component.exposedProps.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            No exposed props yet. Edit the component to expose properties.
          </div>
        )}

        {/* ============================================================================
            DETACH BUTTON - Only for non-master instances
            ============================================================================
            Master components cannot be detached because:
            1. They are the source of truth for all instances
            2. Detaching would orphan all other instances
            3. To "detach" a master, user should delete the component entirely */}
        {!isPrimaryInstance && (
          <div className="px-3 py-2 border-t border-border">
            <button
              onClick={() => setIsDetachDialogOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground text-sm transition-colors"
            >
              <Unlink className="w-4 h-4" />
              Detach Instance
            </button>
            <p className="mt-2 text-xs text-muted-foreground text-center">
              Convert back to a regular frame
            </p>
          </div>
        )}
      </PropertySection>

      {/* ============================================================================
          CUSTOM COMPONENT FIELDS - Exposed props editor
          ============================================================================
          Renders the exposed properties as editable fields for this instance.
          Each field uses the same control type as in the Design/Settings tab. */}
      {component.exposedProps.length > 0 && (
        <ExposedPropsEditor
          instanceElement={instanceElement}
          component={component}
        />
      )}

      {/* ============================================================================
          CMS COLUMN BINDINGS - Bind exposed props to CMS data on dynamic pages
          ============================================================================
          Only renders when the current page has a cmsTableId (is a dynamic page).
          Allows users to bind component props to CMS columns for dynamic data injection. */}
      {component.exposedProps.length > 0 && (
        <CmsColumnBindingsEditor
          instanceElement={instanceElement}
          component={component}
        />
      )}

      {/* Detach Confirmation Dialog */}
      <Dialog open={isDetachDialogOpen} onOpenChange={setIsDetachDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Unlink className="w-5 h-5" />
              Detach Component
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              This will convert the component instance back to a regular frame.
              The frame and its children will be fully editable, but changes
              will no longer sync with other instances.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDetachDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDetach}>
              Detach
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ============================================================================
// MAIN PROPERTIES PANEL
// ============================================================================

export function PropertiesPanel() {
  const dispatch = useAppDispatch()

  // The pinned tab (persists when not hovering)
  const [pinnedTab, setPinnedTab] = useState<PropertiesTabId | null>(null)

  // The currently displayed tab (changes on hover)
  const [displayedTab, setDisplayedTab] = useState<PropertiesTabId>('design')

  // Whether the panel is visible (from hover or pin)
  const [isPanelVisible, setIsPanelVisible] = useState(false)

  // Ref for close timeout (to add small delay when leaving)
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Get selected IDs using proper selector (reactive!)
  const selectedIds = useAppSelector(selectSelectedIds)

  /**
   * Auto-open the Design tab when an element is selected, auto-close when deselected.
   * WHY: Users expect the properties panel to appear immediately when they click an element
   * so they can start editing without an extra click to open the panel.
   */
  useEffect(() => {
    if (selectedIds.length > 0) {
      setPinnedTab('design')
      setDisplayedTab('design')
      setIsPanelVisible(true)
    } else {
      setPinnedTab(null)
      setIsPanelVisible(false)
    }
  }, [selectedIds])

  // Get the active page to access elements (reactive!)
  const activePage = useAppSelector(selectActivePage)

  // Get the current breakpoint being edited (desktop or mobile)
  // This affects which style source we read from and write to
  const editingBreakpoint = useAppSelector(selectEditingBreakpoint)

  // Get viewport for zoom (needed for absolute position calculations)
  const viewport = useAppSelector(selectViewport)

  // ============================================================================
  // SCOPED ID RESOLUTION FOR NESTED COMPONENT INSTANCES
  // ============================================================================
  //
  // Scoped IDs have the format: `${parentInstanceId}::${nestedElementId}`
  // These represent nested component instances within composed components.
  //
  // Example: A carousel component contains card component instances.
  // When a card is selected inside a carousel instance, the selection ID is:
  // `carousel_instance_123::card_element_456`
  //
  // These IDs DON'T exist in canvas.elements - they're VIRTUAL elements
  // rendered from the parent component's sourceTree. To edit them, we need to:
  // 1. Parse the scoped ID to get parent instance and nested element IDs
  // 2. Get the parent instance from canvas.elements
  // 3. Get the component definition from local components
  // 4. Find the nested element in the component's sourceTree
  // 5. Create a virtual element with the scoped ID for the properties panel
  // ============================================================================

  const SCOPE_DELIMITER = '::'

  // Parse the selected ID to check if it's a scoped ID (for nested instances)
  const scopedIdInfo = useMemo(() => {
    if (selectedIds.length === 0) return null
    const lastId = selectedIds[selectedIds.length - 1]

    if (!lastId.includes(SCOPE_DELIMITER)) return null

    const [parentInstanceId, nestedElementId] = lastId.split(SCOPE_DELIMITER)
    return { scopedId: lastId, parentInstanceId, nestedElementId }
  }, [selectedIds])

  // Get the parent instance for scoped IDs (if applicable)
  const parentInstanceForNested = useMemo(() => {
    if (!scopedIdInfo || !activePage) return null
    const parentInstance = activePage.canvas.elements[scopedIdInfo.parentInstanceId]
    if (!parentInstance || parentInstance.type !== 'component') return null
    return parentInstance as ComponentInstanceElement
  }, [scopedIdInfo, activePage])

  // Get the component definition for the parent instance (for scoped IDs)
  // This uses the selector to properly get the component from Redux state
  const parentComponentDef = useAppSelector((state) =>
    parentInstanceForNested
      ? selectLocalComponentById(state, parentInstanceForNested.componentId)
      : null
  )

  // Get the selected element from the active page
  // REACTIVE - updates when element changes in Redux
  // HANDLES SCOPED IDs - resolves nested instances to virtual elements
  const selectedElement = useMemo(() => {
    if (!activePage || selectedIds.length === 0) return null
    const lastId = selectedIds[selectedIds.length - 1]

    // =========================================================================
    // SCOPED ID RESOLUTION - Create virtual element for nested instances
    // =========================================================================
    if (scopedIdInfo && parentInstanceForNested && parentComponentDef) {
      const { nestedElementId, scopedId } = scopedIdInfo

      // Find the nested element in the component's sourceTree
      // It could be the root element or one of the child elements
      let nestedElement: import('../../_lib/types').CanvasElement | null = null

      if (parentComponentDef.sourceTree.rootElement.id === nestedElementId) {
        nestedElement = parentComponentDef.sourceTree.rootElement
      } else {
        nestedElement =
          parentComponentDef.sourceTree.childElements.find(
            (el) => el.id === nestedElementId
          ) ?? null
      }

      if (!nestedElement) {
        console.warn(
          `[PropertiesPanel] Nested element not found in sourceTree: ${nestedElementId}`
        )
        return null
      }

      // Verify this nested element is actually a component instance
      // Only component instances can be edited via the ExposedPropsEditor
      if (nestedElement.type !== 'component') {
        console.warn(
          `[PropertiesPanel] Nested element is not a component instance: ${nestedElementId}`
        )
        return null
      }

      // Cast to ComponentInstanceElement now that we've verified the type
      const nestedInstance = nestedElement as ComponentInstanceElement

      // Get the nested prop values for this specific nested element from the parent
      const nestedPropValues =
        parentInstanceForNested.nestedPropValues?.[nestedElementId] ?? {}

      // Create a VIRTUAL element by merging the source element with:
      // 1. The scoped ID so updates go through the nested action
      // 2. The parent's nestedPropValues for this nested element
      // This makes the properties panel think it's a real element
      const virtualElement: ComponentInstanceElement = {
        ...nestedInstance,
        id: scopedId, // Use scoped ID so updates route through updateNestedInstancePropValue
        propValues: {
          ...(nestedInstance.propValues ?? {}),
          ...nestedPropValues, // Apply parent's overrides on top
        },
        // Nested instances don't have their own nested values (only top-level instances do)
        nestedPropValues: undefined,
      }

      return virtualElement
    }

    // Regular element - look up directly
    return activePage.canvas.elements[lastId] ?? null
  }, [activePage, selectedIds, scopedIdInfo, parentInstanceForNested, parentComponentDef])

  // Check if we're in component edit mode
  // When editing a component, the ExposeAsPropSection becomes active
  const editingComponent = useAppSelector(selectEditingComponent)
  const isEditingComponent = Boolean(editingComponent)

  // =========================================================================
  // PROPERTY UPDATE HANDLERS
  // =========================================================================
  // Updates Redux state - auto-save is debounced, so rapid changes are safe

  /**
   * Update a BASE property on the element (width, height, visible, locked, etc.)
   * These are properties directly on the element object, NOT in styles.
   */
  const handleChange = useCallback(
    (property: string, value: string | number | boolean) => {
      const lastId = selectedIds[selectedIds.length - 1]
      if (!lastId) return

      dispatch(
        updateElement({
          id: lastId,
          updates: { [property]: value },
        })
      )
    },
    [dispatch, selectedIds]
  )

  /**
   * Update a STYLE property on the element (backgroundColor, borderRadius, flexDirection, etc.)
   * These are CSS properties stored in element.styles object.
   *
   * RESPONSIVE-AWARE: Dispatches to different actions based on editingBreakpoint:
   * - Desktop: Updates element.styles (base styles)
   * - Mobile: Updates element.responsiveStyles.mobile (override styles)
   *
   * MIGRATION NOTE: Uses fallback for backwards compatibility with old data
   * that doesn't have the styles object yet.
   */
  const handleStyleChange = useCallback(
    (styleProperty: string, value: string | number | boolean | GradientConfig | BorderConfig | undefined) => {
      const lastId = selectedIds[selectedIds.length - 1]
      if (!lastId || !selectedElement) return

      // If editing mobile breakpoint, update responsiveStyles.mobile
      if (editingBreakpoint === 'mobile') {
        dispatch(
          updateElementResponsiveStyle({
            id: lastId,
            breakpoint: 'mobile',
            styleUpdates: { [styleProperty]: value },
          })
        )
        return
      }

      // Desktop: Update base styles as before
      const existingStyles = selectedElement.styles ?? {}

      dispatch(
        updateElement({
          id: lastId,
          updates: {
            styles: {
              ...existingStyles,
              [styleProperty]: value,
            },
          },
        })
      )
    },
    [dispatch, selectedIds, selectedElement, editingBreakpoint]
  )

  /**
   * Update multiple STYLE properties at once (atomic update).
   *
   * IMPORTANT: This function dispatches a single Redux action that updates
   * multiple style properties atomically. This avoids race conditions that
   * occur when calling handleStyleChange multiple times in succession.
   *
   * Use this when you need to update multiple related properties together,
   * like when switching from solid color to gradient (need to update both
   * backgroundColor AND __backgroundGradient at the same time).
   */
  const handleMultipleStyleChanges = useCallback(
    (styleUpdates: Record<string, string | number | boolean | GradientConfig | EffectsConfig | BackgroundVideoConfig | BackgroundMediaMode | undefined>) => {
      const lastId = selectedIds[selectedIds.length - 1]
      if (!lastId || !selectedElement) return

      // If editing mobile breakpoint, update responsiveStyles.mobile
      if (editingBreakpoint === 'mobile') {
        dispatch(
          updateElementResponsiveStyle({
            id: lastId,
            breakpoint: 'mobile',
            styleUpdates,
          })
        )
        return
      }

      // Desktop: Update base styles with all changes at once
      const existingStyles = selectedElement.styles ?? {}

      dispatch(
        updateElement({
          id: lastId,
          updates: {
            styles: {
              ...existingStyles,
              ...styleUpdates,
            },
          },
        })
      )
    },
    [dispatch, selectedIds, selectedElement, editingBreakpoint]
  )

  /**
   * Helper to safely get a style value with fallback.
   *
   * RESPONSIVE-AWARE: Uses getStyleValue utility to read from the correct
   * style source based on editingBreakpoint:
   * - Desktop: Reads from element.styles
   * - Mobile: Reads from element.responsiveStyles.mobile, falls back to styles
   */
  const getStyle = useCallback(
    <T,>(property: string, fallback: T): T => {
      if (!selectedElement) return fallback
      // Use the responsive-aware getStyleValue utility
      return getStyleValue(
        selectedElement,
        property as any,
        editingBreakpoint,
        fallback
      ) as T
    },
    [selectedElement, editingBreakpoint]
  )

  /**
   * Helper to check if a style property has a mobile override.
   * Used to show blue dot indicators on controls.
   */
  const checkMobileOverride = useCallback(
    (property: string): boolean => {
      if (!selectedElement) return false
      return hasPropertyOverride(selectedElement, property as any)
    },
    [selectedElement]
  )

  /**
   * Update a BASE property on the element (width, height, visible, locked, etc.)
   * RESPONSIVE-AWARE: Dispatches to different actions based on editingBreakpoint:
   * - Desktop: Updates the property directly on the element
   * - Mobile: Updates element.responsiveProperties.mobile (override properties)
   *
   * This is for NON-CSS properties like autoWidth, responsive, sticky, fontSize (text),
   * fontFamily, fontWeight, visible, locked, etc.
   */
  const handlePropertyChange = useCallback(
    (
      property: keyof ResponsivePropertyOverrides,
      value: string | number | boolean
    ) => {
      const lastId = selectedIds[selectedIds.length - 1]
      if (!lastId) return

      // If editing mobile breakpoint, update responsiveProperties.mobile
      if (editingBreakpoint === 'mobile') {
        dispatch(
          updateElementResponsiveProperty({
            id: lastId,
            breakpoint: 'mobile',
            propertyUpdates: { [property]: value },
          })
        )
        return
      }

      // Desktop: Update base property directly on element
      dispatch(
        updateElement({
          id: lastId,
          updates: { [property]: value },
        })
      )
    },
    [dispatch, selectedIds, editingBreakpoint]
  )

  /**
   * Helper to safely get a base property value with fallback.
   *
   * RESPONSIVE-AWARE: Uses getPropertyValue utility to read from the correct
   * source based on editingBreakpoint:
   * - Desktop: Reads from element directly
   * - Mobile: Reads from element.responsiveProperties.mobile, falls back to element
   */
  const getProperty = useCallback(
    <T,>(property: keyof ResponsivePropertyOverrides, fallback: T): T => {
      if (!selectedElement) return fallback
      // Use the responsive-aware getPropertyValue utility
      return getPropertyValue(
        selectedElement,
        property,
        editingBreakpoint,
        fallback
      ) as T
    },
    [selectedElement, editingBreakpoint]
  )

  /**
   * Helper to check if a base property has a mobile override.
   * Used to show blue dot indicators on controls for non-CSS properties.
   */
  const checkPropertyMobileOverride = useCallback(
    (property: keyof ResponsivePropertyOverrides): boolean => {
      if (!selectedElement) return false
      return hasBasePropertyOverride(selectedElement, property)
    },
    [selectedElement]
  )

  /**
   * Reset a single CSS style's mobile override to use desktop value.
   * Called when clicking the reset button on a style control.
   */
  const resetStyleMobileOverride = useCallback(
    (styleKey: string) => {
      const lastId = selectedIds[selectedIds.length - 1]
      if (!lastId) return

      dispatch(
        clearSingleResponsiveStyle({
          id: lastId,
          breakpoint: 'mobile',
          styleKey,
        })
      )
    },
    [dispatch, selectedIds]
  )

  /**
   * Reset a single base property's mobile override to use desktop value.
   * Called when clicking the reset button on a property control.
   */
  const resetPropertyMobileOverride = useCallback(
    (propertyKey: keyof ResponsivePropertyOverrides) => {
      const lastId = selectedIds[selectedIds.length - 1]
      if (!lastId) return

      dispatch(
        clearSingleResponsiveProperty({
          id: lastId,
          breakpoint: 'mobile',
          propertyKey,
        })
      )
    },
    [dispatch, selectedIds]
  )

  // =========================================================================
  // LAYER ORDERING HANDLER
  // =========================================================================

  /**
   * Execute a layer ordering action (bring to front, send to back).
   *
   * This builds the required context from the store and executes the action
   * through the action registry system. The result (element order updates)
   * is then dispatched to Redux.
   */
  const executeLayerAction = useCallback(
    (actionType: 'bring-to-front' | 'send-to-back') => {
      // Build context from current store state
      const state = store.getState()
      const activePageId = state.canvas.pages.activePageId
      const activePage = state.canvas.pages.pages[activePageId]
      const { elements, childrenMap } = activePage.canvas

      const context: GroupActionContext = {
        selectedIds: activePage.selection.selectedIds,
        elements,
        childrenMap,
        clipboard: { items: [], isCut: false, originalBounds: null },
        viewport: activePage.viewport,
        mousePosition: null,
        localComponents: state.canvas.localComponents,
      }

      // Execute the action
      const result = executeRegisteredAction(actionType, context)

      // Apply results - update element orders
      if (result?.elementsToUpdate) {
        Object.entries(result.elementsToUpdate).forEach(([id, updates]) => {
          dispatch(updateElement({ id, updates }))
        })
      }
    },
    [dispatch]
  )

  // =========================================================================
  // PREBUILT NAVBAR SETTINGS HANDLER
  // =========================================================================

  /**
   * Update settings for a PreBuilt navbar element.
   * This updates the entire settings object at once.
   */
  const handleNavbarSettingsChange = useCallback(
    (newSettings: NavbarSettings) => {
      const lastId = selectedIds[selectedIds.length - 1]
      if (!lastId || !selectedElement) return

      dispatch(
        updateElement({
          id: lastId,
          updates: { settings: newSettings },
        })
      )
    },
    [dispatch, selectedIds, selectedElement]
  )

  // =========================================================================
  // PREBUILT SIDEBAR SETTINGS HANDLER
  // =========================================================================

  /**
   * Update settings for a PreBuilt sidebar element.
   * Also syncs the inset frame's backgroundColor when it changes,
   * since the inset frame is a separate element in the canvas.
   */
  const handleSidebarSettingsChange = useCallback(
    (newSettings: SidebarSettings) => {
      const lastId = selectedIds[selectedIds.length - 1]
      if (!lastId || !selectedElement) return

      // Update the sidebar element's settings
      dispatch(
        updateElement({
          id: lastId,
          updates: { settings: newSettings },
        })
      )

      // Sync inset frame backgroundColor when it changes.
      // The inset frame is a separate FrameElement — its styles.backgroundColor
      // must be explicitly updated to match settings.inset.backgroundColor.
      const sidebarElement = selectedElement as PreBuiltSidebarElement
      const insetFrameId = sidebarElement.insetFrameId
      if (insetFrameId && activePage) {
        const currentInsetBg = (selectedElement as PreBuiltSidebarElement).settings?.inset?.backgroundColor
        const newInsetBg = newSettings.inset?.backgroundColor
        if (newInsetBg !== currentInsetBg) {
          const insetFrame = activePage.canvas.elements[insetFrameId]
          if (insetFrame && 'styles' in insetFrame) {
            dispatch(
              updateElement({
                id: insetFrameId,
                updates: {
                  styles: {
                    ...(insetFrame as FrameElement).styles,
                    backgroundColor: newInsetBg || '#f5f5f5',
                  },
                },
              })
            )
          }
        }
      }
    },
    [dispatch, selectedIds, selectedElement, activePage]
  )

  /**
   * Update settings for a PreBuilt total members element.
   * This updates the entire settings object at once.
   */
  const handleTotalMembersSettingsChange = useCallback(
    (newSettings: TotalMembersSettings) => {
      const lastId = selectedIds[selectedIds.length - 1]
      if (!lastId || !selectedElement) return

      dispatch(
        updateElement({
          id: lastId,
          updates: { settings: newSettings },
        })
      )
    },
    [dispatch, selectedIds, selectedElement]
  )

  /**
   * Update settings for a PreBuilt logo carousel element.
   * This updates the entire settings object at once.
   */
  const handleLogoCarouselSettingsChange = useCallback(
    (newSettings: LogoCarouselSettings) => {
      const lastId = selectedIds[selectedIds.length - 1]
      if (!lastId || !selectedElement) return

      dispatch(
        updateElement({
          id: lastId,
          updates: { settings: newSettings },
        })
      )
    },
    [dispatch, selectedIds, selectedElement]
  )

  // =========================================================================
  // TAB HANDLERS
  // =========================================================================

  /**
   * Handle clicking a tab icon - toggles pin state for that tab.
   */
  const handleTabClick = useCallback(
    (tabId: PropertiesTabId) => {
      if (tabId === pinnedTab) {
        // Clicking the pinned tab unpins it
        setPinnedTab(null)
        setIsPanelVisible(false)
      } else {
        // Pin this tab
        setPinnedTab(tabId)
        setDisplayedTab(tabId)
        setIsPanelVisible(true)
      }
    },
    [pinnedTab]
  )

  /**
   * Handle hovering over a tab - show panel with that tab's content.
   * Always shows the hovered tab's content (even if another tab is pinned).
   */
  const handleTabHover = useCallback((tabId: PropertiesTabId) => {
    // Clear any pending close timeout
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }

    // Show panel and display this tab's content
    setIsPanelVisible(true)
    setDisplayedTab(tabId)
  }, [])

  /**
   * Handle mouse leaving the icon bar.
   * If pinned, revert to pinned tab. If not pinned, hide panel.
   * Uses a small delay to allow moving to the panel without closing.
   */
  const handleIconBarMouseLeave = useCallback(() => {
    // Add small delay before closing/reverting to allow moving to panel
    closeTimeoutRef.current = setTimeout(() => {
      if (pinnedTab) {
        // Revert to pinned tab content
        setDisplayedTab(pinnedTab)
      } else {
        // No pinned tab, hide panel
        setIsPanelVisible(false)
      }
    }, 150)
  }, [pinnedTab])

  /**
   * Handle mouse entering the icon bar.
   * Cancel any pending close timeout.
   */
  const handleIconBarMouseEnter = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }, [])

  /**
   * Handle mouse entering the panel content.
   * Cancel any pending close timeout so panel stays open while interacting.
   */
  const handlePanelMouseEnter = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }, [])

  /**
   * Handle mouse leaving the panel content.
   * If pinned, keep panel visible. If not pinned, hide panel.
   */
  const handlePanelMouseLeave = useCallback(() => {
    // If pinned, panel stays open - just revert to pinned tab content
    if (pinnedTab) {
      setDisplayedTab(pinnedTab)
    } else {
      // Not pinned, hide panel when leaving
      setIsPanelVisible(false)
    }
  }, [pinnedTab])

  /**
   * Toggle pin state for the currently displayed tab.
   */
  const handlePinToggle = useCallback(() => {
    if (pinnedTab) {
      // Unpin
      setPinnedTab(null)
      setIsPanelVisible(false)
    } else {
      // Pin the currently displayed tab
      setPinnedTab(displayedTab)
    }
  }, [pinnedTab, displayedTab])

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div className="absolute right-4 top-20 z-[9999] flex flex-col items-end gap-2">
      {/* ================================================================
          ICON RAIL - Horizontal bar at top with tab icons
          Hovering shows the panel, clicking pins it
          Mouse events are on this element to detect when user leaves icons
          ================================================================ */}
      <div
        onMouseEnter={handleIconBarMouseEnter}
        onMouseLeave={handleIconBarMouseLeave}
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          padding: '8px 10px',
          backgroundColor: 'var(--background)',
          borderRadius: 16,
          border: '1px solid var(--border)',
          boxShadow:
            '0 8px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2)',
        }}
      >
        {PROPERTIES_TABS.map((tab) => {
          const isDisplayed = displayedTab === tab.id && isPanelVisible
          const isPinned = pinnedTab === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              onMouseEnter={() => handleTabHover(tab.id)}
              title={
                isPinned ? `${tab.label} (pinned - click to unpin)` : tab.label
              }
              style={{
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isDisplayed
                  ? 'var(--accent)'
                  : 'transparent',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                color: isDisplayed ? 'var(--foreground)' : 'var(--muted-foreground)',
                transition: 'all 0.15s ease',
                position: 'relative',
              }}
              onMouseOver={(e) => {
                if (!isDisplayed) {
                  e.currentTarget.style.backgroundColor =
                    'var(--accent)'
                  e.currentTarget.style.color = 'var(--foreground)'
                }
              }}
              onMouseOut={(e) => {
                if (!isDisplayed) {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = 'var(--muted-foreground)'
                }
              }}
            >
              {tab.icon}
              {/* Small pin dot indicator when this tab is pinned */}
              {isPinned && (
                <div
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: '#3b82f6',
                  }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* ================================================================
          CONTENT PANEL - Single panel that shows active tab content
          Only visible when hovering or pinned
          Has its own mouse handlers to keep panel open while interacting
          ================================================================ */}
      {isPanelVisible && (
        <div
          className="w-72 max-h-[calc(100vh-200px)] p-0 bg-background/95 backdrop-blur-sm border border-border rounded-xl shadow-xl flex flex-col overflow-hidden"
          onMouseEnter={handlePanelMouseEnter}
          onMouseLeave={handlePanelMouseLeave}
        >
          {/* Panel Header with Breakpoint Toggle and Pin Button */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
            <span className="font-medium text-sm">
              {PROPERTIES_TABS.find((t) => t.id === displayedTab)?.label}
            </span>
            <div className="flex items-center gap-2">
              {/* Desktop/Mobile toggle - only show on Design tab */}
              {displayedTab === 'design' && <HeaderBreakpointToggle />}
              <button
                onClick={handlePinToggle}
                className={cn(
                  'w-7 h-7 rounded flex items-center justify-center transition-colors',
                  pinnedTab !== null
                    ? 'bg-primary/20 text-primary'
                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                )}
                title={pinnedTab !== null ? 'Unpin panel' : 'Pin panel'}
              >
                {pinnedTab !== null ? (
                  <PinOff className="h-3.5 w-3.5" />
                ) : (
                  <Pin className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Panel Content - scrollable area (hidden scrollbar for cleaner look) */}
          <div className="flex-1 overflow-y-auto min-h-0 bg-muted/30 text-foreground scrollbar-hide">
            {/* ================================================================
                COMPONENT EDIT MODE BANNER
                Shows when editing a component's props. Provides exit button.
                ================================================================ */}
            {isEditingComponent && editingComponent && (
              <div className="px-3 py-2 bg-purple-500/10 border-b border-purple-500/20">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-purple-500/20 flex items-center justify-center shrink-0">
                    <Component className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-purple-300 truncate">
                      Editing: {editingComponent.name}
                    </p>
                  </div>
                  <button
                    onClick={() => dispatch(exitComponentEditMode())}
                    className="px-2 py-1 text-xs font-medium rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 transition-colors"
                  >
                    Done
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-purple-400/70">
                  Go to Settings tab → select element → expose properties
                </p>
              </div>
            )}

            {/* DESIGN TAB */}
            {displayedTab === 'design' &&
              (selectedElement ? (
                <div className="pt-2">
                  {/* ================================================================
                      COMPONENT INSTANCE - No Design Controls
                      Component instances have non-editable styles. Their appearance
                      is controlled by the master component definition. Users should
                      use the Settings tab to view/edit exposed prop values, or
                      enter Edit Component mode to modify the master component.
                      ================================================================ */}
                  {selectedElement.type === 'component' && (
                    <div className="px-4 py-8 text-center">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                        <Component className="w-6 h-6 text-primary" />
                      </div>
                      <p className="text-sm font-medium text-foreground mb-2">
                        Component Instance
                      </p>
                      <p className="text-xs text-muted-foreground max-w-[200px] mx-auto">
                        Styles are controlled by the master component. Use the{' '}
                        <span className="font-medium">Settings</span> tab to
                        customize exposed properties.
                      </p>
                    </div>
                  )}

                  {/* ================================================================
                      REGULAR ELEMENTS - Full Design Controls
                      All non-component elements get the full design panel
                      ================================================================ */}
                  {selectedElement.type !== 'component' && (
                    <>
                  {/* ================================================================
                      MOBILE EDITING BANNER - Warning and Clear Overrides
                      Shows when editing mobile styles or when element has mobile overrides.
                      Provides a button to clear all mobile-specific overrides.
                      ================================================================ */}
                  <MobileEditingBanner selectedElement={selectedElement} />

                  {/* ================================================================
                      WIDTH MODE - Universal fill/fixed toggle for elements
                      that don't have their own Dimensions section.

                      Elements already covered by other Dimensions sections:
                        - frame, page, image, video, form, prebuilt, smartcms-list,
                          ecommerce-carousel → shared Dimensions section
                        - button, cart, add-to-cart-button → button Dimensions section
                        - text → text Dimensions section

                      Remaining elements that need this:
                        - link, payment, checkout, faq, timer, sticky-note, pencil
                      ================================================================ */}
                  {(selectedElement.type === 'link' ||
                    selectedElement.type === 'payment' ||
                    selectedElement.type === 'checkout' ||
                    selectedElement.type === 'faq' ||
                    selectedElement.type === 'list' ||
                    selectedElement.type === 'timer' ||
                    selectedElement.type === 'sticky-note' ||
                    selectedElement.type === 'pencil') &&
                    selectedElement.parentId !== null && (
                      <PropertySection
                        title="Dimensions"
                        defaultOpen
                      >
                        <SizingModeControl
                          widthMode={getProperty('autoWidth', false) ? 'fill' : 'fixed'}
                          onWidthModeChange={(mode: WidthMode) => {
                            handlePropertyChange('autoWidth', mode === 'fill')
                          }}
                          hasWidthMobileOverride={checkPropertyMobileOverride('autoWidth')}
                          onResetWidthMobileOverride={() => resetPropertyMobileOverride('autoWidth')}
                        />
                      </PropertySection>
                    )}

                  {/* ================================================================
                      STICKY NOTE COLOR PRESETS - Quick color selection in Design tab
                      Shows for sticky-note elements only
                      ================================================================ */}
                  {selectedElement.type === 'sticky-note' && (
                    <StickyNoteSettingsSection
                      element={selectedElement as StickyNoteElement}
                    />
                  )}

                  {/* ================================================================
                      TIMER DESIGN CONTROLS - Typography, colors, spacing for countdown timer
                      Shows for timer elements only. Timer has unique styling needs:
                      digit typography, label colors, separator color, spacing, background.
                      ================================================================ */}
                  {selectedElement.type === 'timer' && (
                    <>
                      {/* Timer Typography — controls for digit font, size, weight, and color */}
                      <PropertySection title="Typography" defaultOpen>
                        {/* Digit Font Family — Google Fonts selector */}
                        <FontFamilyControl
                          label="Font"
                          value={getStyle('fontFamily', 'Inter')}
                          onChange={(val) => handleStyleChange('fontFamily', val)}
                          hasMobileOverride={checkMobileOverride('fontFamily')}
                          onResetMobileOverride={() => resetStyleMobileOverride('fontFamily')}
                        />
                        {/* Digit Font Size — controls the size of countdown numbers */}
                        <SliderInputControl
                          label="Digit Size"
                          value={getStyle('fontSize', 48) as number}
                          onChange={(val) => handleStyleChange('fontSize', val)}
                          min={16}
                          max={120}
                          unit="px"
                          hasMobileOverride={checkMobileOverride('fontSize')}
                          onResetMobileOverride={() => resetStyleMobileOverride('fontSize')}
                        />
                        {/* Digit Font Weight */}
                        <DropdownControl
                          label="Weight"
                          value={String(getStyle('fontWeight', 700))}
                          options={[
                            { value: '300', label: 'Light' },
                            { value: '400', label: 'Regular' },
                            { value: '500', label: 'Medium' },
                            { value: '600', label: 'Semi Bold' },
                            { value: '700', label: 'Bold' },
                            { value: '800', label: 'Extra Bold' },
                            { value: '900', label: 'Black' },
                          ]}
                          onChange={(val) => handleStyleChange('fontWeight', parseInt(val, 10))}
                          hasMobileOverride={checkMobileOverride('fontWeight')}
                          onResetMobileOverride={() => resetStyleMobileOverride('fontWeight')}
                        />
                        {/* Digit Color — the color of the countdown numbers */}
                        <ColorPickerControl
                          label="Digit Color"
                          value={getStyle('color', '#111111')}
                          onChange={(val) => handleStyleChange('color', val)}
                          hasMobileOverride={checkMobileOverride('color')}
                          onResetMobileOverride={() => resetStyleMobileOverride('color')}
                        />
                      </PropertySection>

                      {/* Timer Labels & Separator — colors for label text and colon separators */}
                      <PropertySection title="Labels & Separator" defaultOpen={false}>
                        {/* Label Color — the color of "Days", "Hours", etc. text below digits */}
                        <ColorPickerControl
                          label="Label Color"
                          value={getStyle('__labelColor' as keyof React.CSSProperties, '#888888')}
                          onChange={(val) => handleStyleChange('__labelColor' as keyof React.CSSProperties, val)}
                        />
                        {/* Label Font Size — controls the size of label text */}
                        <SliderInputControl
                          label="Label Size"
                          value={getStyle('__labelFontSize' as keyof React.CSSProperties, 12) as number}
                          onChange={(val) => handleStyleChange('__labelFontSize' as keyof React.CSSProperties, val)}
                          min={8}
                          max={24}
                          unit="px"
                        />
                        {/* Separator Color — the color of ":" between segments */}
                        <ColorPickerControl
                          label="Separator Color"
                          value={getStyle('__separatorColor' as keyof React.CSSProperties, '#888888')}
                          onChange={(val) => handleStyleChange('__separatorColor' as keyof React.CSSProperties, val)}
                        />
                      </PropertySection>

                      {/* Timer Spacing — padding, gap between segments, margin */}
                      <PropertySection title="Spacing" defaultOpen={false}>
                        {/* Gap — space between timer segments (Days, Hours, etc.) */}
                        <InputGroupControl
                          label="Gap"
                          value={getStyle('gap', 24)}
                          onChange={(val) => handleStyleChange('gap', val)}
                          type="number"
                          unit="px"
                          hasMobileOverride={checkMobileOverride('gap')}
                          onResetMobileOverride={() => resetStyleMobileOverride('gap')}
                        />
                        {/* Padding — inner spacing around the timer content */}
                        <SpacingControl
                          label="Padding"
                          values={parseSpacingValue(getStyle('padding', 24))}
                          onChange={(values) => {
                            handleStyleChange('padding', formatSpacingValue(values))
                          }}
                          hasMobileOverride={checkMobileOverride('padding')}
                          onResetMobileOverride={() => resetStyleMobileOverride('padding')}
                        />
                        {/* Margin — outer spacing around the timer element */}
                        <SpacingControl
                          label="Margin"
                          values={parseSpacingValue(getStyle('margin', 0))}
                          onChange={(values) => {
                            handleStyleChange('margin', formatSpacingValue(values))
                          }}
                          hasMobileOverride={checkMobileOverride('margin')}
                          onResetMobileOverride={() => resetStyleMobileOverride('margin')}
                        />
                      </PropertySection>

                      {/* Timer Background & Corners — solid/gradient fill and border radius */}
                      <PropertySection title="Background" defaultOpen={false}>
                        {/* Background color or gradient for the timer container */}
                        <GradientControl
                          label="Fill"
                          solidColor={getStyle('backgroundColor', 'transparent')}
                          gradient={getStyle('__backgroundGradient', undefined) as GradientConfig | undefined}
                          onSolidColorChange={(val: string) => {
                            handleMultipleStyleChanges({
                              backgroundColor: val,
                              __backgroundGradient: undefined,
                            })
                          }}
                          onGradientChange={(gradient: GradientConfig | undefined) => {
                            handleMultipleStyleChanges({
                              __backgroundGradient: gradient,
                              backgroundColor: gradient ? 'transparent' : undefined,
                            })
                          }}
                          hasMobileOverride={
                            checkMobileOverride('backgroundColor') ||
                            checkMobileOverride('__backgroundGradient')
                          }
                          onResetMobileOverride={() => {
                            resetStyleMobileOverride('backgroundColor')
                            resetStyleMobileOverride('__backgroundGradient')
                          }}
                        />
                        {/* Rounded Corners */}
                        <BorderRadiusControl
                          label="Corners"
                          values={parseBorderRadiusValue(getStyle('borderRadius', 12))}
                          onChange={(values) => {
                            handleStyleChange('borderRadius', formatBorderRadiusValue(values))
                          }}
                          hasMobileOverride={checkMobileOverride('borderRadius')}
                          onResetMobileOverride={() => resetStyleMobileOverride('borderRadius')}
                        />
                      </PropertySection>

                      {/* Timer Border — stroke styling around the timer */}
                      <PropertySection title="Border" defaultOpen={false}>
                        <BorderControl
                          value={getStyle('__borderConfig', undefined) as BorderConfig | undefined}
                          onChange={(config: BorderConfig | undefined) => {
                            handleStyleChange('__borderConfig', config)
                          }}
                          hasMobileOverride={checkMobileOverride('__borderConfig')}
                          onResetMobileOverride={() => resetStyleMobileOverride('__borderConfig')}
                        />
                      </PropertySection>
                    </>
                  )}

                  {/* -------------------------------------------------------------
                    DIMENSIONS SECTION (Frame, Image, Video, PreBuilt, SmartCMS List)
                    Text elements have their own dedicated Dimensions section below.
                    Page elements and prebuilt-sidebar are excluded — their dimensions
                    are managed automatically (page fills viewport, sidebar fills page).
                    ------------------------------------------------------------- */}
                  {(selectedElement.type === 'frame' ||
                    selectedElement.type === 'image' ||
                    selectedElement.type === 'video' ||
                    selectedElement.type === 'form' ||
                    (selectedElement.type === 'prebuilt' && !isPreBuiltSidebar(selectedElement)) ||
                    selectedElement.type === 'smartcms-list' ||
                    selectedElement.type === 'ecommerce-carousel') && (
                    <PropertySection
                      title="Dimensions"
                      defaultOpen
                    >
                      {/* =============================================================
                          UNIFIED SIZING CONTROL
                          Width Mode: Fixed (pixels) vs Fill (100%)
                          Height Mode: Fixed (pixels) vs Fit Content (wrap)
                            — only for frames, forms, smartcms-list
                          Overflow Mode: Visible vs Scroll
                            — only for frames, forms, smartcms-list

                          All other elements (image, video, ecommerce-carousel, prebuilt)
                          get width-only mode so they can switch between fixed and fill
                          after being dropped on canvas root.
                          ============================================================= */}
                      {selectedElement.parentId !== null && (
                        (() => {
                          /** Frame-like elements get full sizing control (width + height + overflow) */
                          const isFrameLike =
                            selectedElement.type === 'frame' ||
                            selectedElement.type === 'form' ||
                            selectedElement.type === 'smartcms-list'

                          return (
                            <SizingModeControl
                              widthMode={getProperty('autoWidth', false) ? 'fill' : 'fixed'}
                              onWidthModeChange={(mode: WidthMode) => {
                                handlePropertyChange('autoWidth', mode === 'fill')
                              }}
                              hasWidthMobileOverride={checkPropertyMobileOverride('autoWidth')}
                              onResetWidthMobileOverride={() => resetPropertyMobileOverride('autoWidth')}
                              /* Height + overflow only for frame-like elements */
                              {...(isFrameLike ? {
                                heightMode: (
                                  selectedElement.type === 'smartcms-list'
                                    ? (getProperty('autoHeight', true) ? 'wrap' : 'fixed')
                                    : (getStyle<string>('flexWrap', 'nowrap') === 'wrap' ? 'wrap' : 'fixed')
                                ) as HeightMode,
                                onHeightModeChange: (mode: HeightMode) => {
                                  handleStyleChange('flexWrap', mode === 'wrap' ? 'wrap' : 'nowrap')
                                  if (selectedElement.type === 'smartcms-list') {
                                    handlePropertyChange('autoHeight', mode === 'wrap')
                                  }
                                },
                                overflowMode: (
                                  (getProperty('scrollEnabled', false) || getProperty('responsive', false))
                                    ? 'scroll'
                                    : 'visible'
                                ) as OverflowMode,
                                onOverflowModeChange: (mode: OverflowMode) => {
                                  handlePropertyChange('scrollEnabled', mode === 'scroll')
                                },
                                hasHeightMobileOverride: checkMobileOverride('flexWrap'),
                                hasOverflowMobileOverride:
                                  checkPropertyMobileOverride('scrollEnabled') ||
                                  checkPropertyMobileOverride('responsive'),
                                onResetHeightMobileOverride: () => resetStyleMobileOverride('flexWrap'),
                                onResetOverflowMobileOverride: () => {
                                  resetPropertyMobileOverride('scrollEnabled')
                                  resetPropertyMobileOverride('responsive')
                                },
                              } : {})}
                            />
                          )
                        })()
                      )}

                      {/* Size - Combined Width/Height with link button */}
                      <SizeInputControl
                        label="Size"
                        width={getProperty('width', selectedElement.width)}
                        height={getProperty('height', selectedElement.height)}
                        onWidthChange={(val) =>
                          handlePropertyChange('width', val)
                        }
                        onHeightChange={(val) =>
                          handlePropertyChange('height', val)
                        }
                        widthDisabled={
                          /* Disable width input when autoWidth (fill) is enabled.
                             Applies to ALL element types that support autoWidth. */
                          getProperty('autoWidth', false)
                        }
                        heightDisabled={
                          // Disable height input when Fit Content mode is enabled.
                          // CMS lists use autoHeight property; frames/forms use flexWrap.
                          (selectedElement.type === 'smartcms-list' && getProperty('autoHeight', true)) ||
                          ((selectedElement.type === 'frame' || selectedElement.type === 'form') &&
                            getStyle<string>('flexWrap', 'nowrap') === 'wrap')
                        }
                        hasMobileOverride={
                          checkPropertyMobileOverride('width') ||
                          checkPropertyMobileOverride('height')
                        }
                        onResetMobileOverride={() => {
                          resetPropertyMobileOverride('width')
                          resetPropertyMobileOverride('height')
                        }}
                      />

                      {/* Fit to Content - Snaps frame dimensions to children content (frames only) */}
                      {selectedElement.type === 'frame' && (
                        <FitFrameToContentButton
                          element={selectedElement as FrameElement}
                          onFit={(width, height) => {
                            handleChange('width', width)
                            handleChange('height', height)
                          }}
                        />
                      )}

                    </PropertySection>
                  )}

                  {/* -------------------------------------------------------------
                    LAYOUT SECTION (Frames and SmartCMS List)
                    ------------------------------------------------------------- */}
                  {(selectedElement.type === 'frame' ||
                    selectedElement.type === 'smartcms-list') && (
                    <PropertySection
                      title="Layout"
                      defaultOpen
                    >
                      {/* Direction - horizontal or vertical */}
                      <IconToggleControl
                        label="Direction"
                        value={getStyle('flexDirection', 'column')}
                        options={[
                          {
                            value: 'row',
                            icon: DirectionIcons.horizontal,
                            title: 'Horizontal',
                          },
                          {
                            value: 'column',
                            icon: DirectionIcons.vertical,
                            title: 'Vertical',
                          },
                        ]}
                        onChange={(val) =>
                          handleStyleChange('flexDirection', val)
                        }
                        hasMobileOverride={checkMobileOverride('flexDirection')}
                        onResetMobileOverride={() =>
                          resetStyleMobileOverride('flexDirection')
                        }
                      />

                      {/* Justify - distribution along main axis */}
                      <IconToggleControl
                        label="Justify"
                        value={getStyle('justifyContent', 'flex-start')}
                        options={[
                          {
                            value: 'flex-start',
                            icon: JustifyIcons.start,
                            title: 'Start',
                          },
                          {
                            value: 'center',
                            icon: JustifyIcons.center,
                            title: 'Center',
                          },
                          {
                            value: 'flex-end',
                            icon: JustifyIcons.end,
                            title: 'End',
                          },
                          {
                            value: 'space-between',
                            icon: JustifyIcons.between,
                            title: 'Space Between',
                          },
                          {
                            value: 'space-evenly',
                            icon: JustifyIcons.evenly,
                            title: 'Space Evenly',
                          },
                        ]}
                        onChange={(val) =>
                          handleStyleChange('justifyContent', val)
                        }
                        hasMobileOverride={checkMobileOverride(
                          'justifyContent'
                        )}
                        onResetMobileOverride={() =>
                          resetStyleMobileOverride('justifyContent')
                        }
                      />

                      {/* Align - alignment along cross axis */}
                      <IconToggleControl
                        label="Align"
                        value={getStyle('alignItems', 'flex-start')}
                        options={[
                          {
                            value: 'flex-start',
                            icon: AlignIcons.start,
                            title: 'Start',
                          },
                          {
                            value: 'center',
                            icon: AlignIcons.center,
                            title: 'Center',
                          },
                          {
                            value: 'flex-end',
                            icon: AlignIcons.end,
                            title: 'End',
                          },
                        ]}
                        onChange={(val) => handleStyleChange('alignItems', val)}
                        hasMobileOverride={checkMobileOverride('alignItems')}
                        onResetMobileOverride={() =>
                          resetStyleMobileOverride('alignItems')
                        }
                      />

                      {/* Container - constrains children to centered max-width */}
                      <ToggleControl
                        label="Container"
                        checked={getProperty('container', false)}
                        onChange={(val) =>
                          handlePropertyChange('container', val)
                        }
                        hasMobileOverride={checkPropertyMobileOverride(
                          'container'
                        )}
                        onResetMobileOverride={() =>
                          resetPropertyMobileOverride('container')
                        }
                      />

                      {/* NOTE: Wrap toggle has been moved to the unified SizingModeControl
                        in the Dimensions section (Height: Fit Content mode).
                        This keeps all sizing-related options in one place for better UX. */}

                      {/* Smart Grid - auto-responsive CSS grid layout.
                         When toggled ON, children arrange into a responsive grid
                         using CSS Grid auto-fill + minmax(). The minimum column width
                         is auto-computed from the first child's width. */}
                      <ToggleControl
                        label="Smart Grid"
                        checked={getProperty('smartGrid', false)}
                        onChange={(val) => {
                          if (val) {
                            /* Auto-compute smartGridMinWidth from first child's width */
                            const state = store.getState()
                            const activePageId = state.canvas.pages.activePageId
                            const page = state.canvas.pages.pages[activePageId]
                            const { elements, childrenMap } = page.canvas
                            const lastId = selectedIds[selectedIds.length - 1]
                            const children = lastId ? childrenMap[lastId] : undefined
                            let minWidth = 200 // sensible fallback

                            if (children && children.length > 0) {
                              const firstChild = elements[children[0]]
                              if (firstChild && typeof firstChild.width === 'number' && firstChild.width > 0) {
                                minWidth = firstChild.width
                              }
                            }

                            handlePropertyChange('smartGrid', true)
                            handlePropertyChange('smartGridMinWidth', minWidth)
                          } else {
                            handlePropertyChange('smartGrid', false)
                          }
                        }}
                        hasMobileOverride={checkPropertyMobileOverride(
                          'smartGrid'
                        )}
                        onResetMobileOverride={() =>
                          resetPropertyMobileOverride('smartGrid')
                        }
                      />

                      {/* Smart Grid Min Width - only visible when smart grid is enabled.
                         Controls the minimum column width for the CSS Grid minmax() formula. */}
                      {getProperty('smartGrid', false) && (
                        <SliderInputControl
                          label="Min Column"
                          value={getProperty('smartGridMinWidth', 200)}
                          onChange={(val) =>
                            handlePropertyChange('smartGridMinWidth', val)
                          }
                          min={50}
                          max={800}
                          step={10}
                          unit="px"
                          hasMobileOverride={checkPropertyMobileOverride(
                            'smartGridMinWidth'
                          )}
                          onResetMobileOverride={() =>
                            resetPropertyMobileOverride('smartGridMinWidth')
                          }
                        />
                      )}

                      {/* Rotation - rotate the element using a knob dial control */}
                      <RotationKnobControl
                        value={getProperty('rotation', 0) as number}
                        onChange={(val) => handlePropertyChange('rotation', val)}
                        hasMobileOverride={checkPropertyMobileOverride('rotation')}
                        onResetMobileOverride={() =>
                          resetPropertyMobileOverride('rotation')
                        }
                      />
                    </PropertySection>
                  )}

                  {/* -------------------------------------------------------------
                    LAYOUT SECTION (Pages only - frames have separate Layout section)
                    ------------------------------------------------------------- */}
                  {selectedElement.type === 'page' && (
                    <PropertySection
                      title="Layout"
                      defaultOpen
                    >
                      {/* Direction - horizontal or vertical layout for page children */}
                      <IconToggleControl
                        label="Direction"
                        value={getStyle('flexDirection', 'column')}
                        options={[
                          {
                            value: 'row',
                            icon: DirectionIcons.horizontal,
                            title: 'Horizontal',
                          },
                          {
                            value: 'column',
                            icon: DirectionIcons.vertical,
                            title: 'Vertical',
                          },
                        ]}
                        onChange={(val) =>
                          handleStyleChange('flexDirection', val)
                        }
                        hasMobileOverride={checkMobileOverride('flexDirection')}
                        onResetMobileOverride={() =>
                          resetStyleMobileOverride('flexDirection')
                        }
                      />

                      {/* Justify - distribution along main axis */}
                      <IconToggleControl
                        label="Justify"
                        value={getStyle('justifyContent', 'flex-start')}
                        options={[
                          {
                            value: 'flex-start',
                            icon: JustifyIcons.start,
                            title: 'Start',
                          },
                          {
                            value: 'center',
                            icon: JustifyIcons.center,
                            title: 'Center',
                          },
                          {
                            value: 'flex-end',
                            icon: JustifyIcons.end,
                            title: 'End',
                          },
                          {
                            value: 'space-between',
                            icon: JustifyIcons.between,
                            title: 'Space Between',
                          },
                          {
                            value: 'space-evenly',
                            icon: JustifyIcons.evenly,
                            title: 'Space Evenly',
                          },
                        ]}
                        onChange={(val) =>
                          handleStyleChange('justifyContent', val)
                        }
                        hasMobileOverride={checkMobileOverride(
                          'justifyContent'
                        )}
                        onResetMobileOverride={() =>
                          resetStyleMobileOverride('justifyContent')
                        }
                      />

                      {/* Align - alignment along cross axis */}
                      <IconToggleControl
                        label="Align"
                        value={getStyle('alignItems', 'flex-start')}
                        options={[
                          {
                            value: 'flex-start',
                            icon: AlignIcons.start,
                            title: 'Start',
                          },
                          {
                            value: 'center',
                            icon: AlignIcons.center,
                            title: 'Center',
                          },
                          {
                            value: 'flex-end',
                            icon: AlignIcons.end,
                            title: 'End',
                          },
                        ]}
                        onChange={(val) => handleStyleChange('alignItems', val)}
                        hasMobileOverride={checkMobileOverride('alignItems')}
                        onResetMobileOverride={() =>
                          resetStyleMobileOverride('alignItems')
                        }
                      />

                      {/* Container - constrains children to centered max-width */}
                      <ToggleControl
                        label="Container"
                        checked={getProperty('container', true)}
                        onChange={(val) =>
                          handlePropertyChange('container', val)
                        }
                        hasMobileOverride={checkPropertyMobileOverride(
                          'container'
                        )}
                        onResetMobileOverride={() =>
                          resetPropertyMobileOverride('container')
                        }
                      />
                    </PropertySection>
                  )}

                  {/* -------------------------------------------------------------
                    IMAGE SECTION (Image elements only)
                    Shows image source control and object fit options.
                    Image elements use `src` property directly, not backgroundImage.
                    ------------------------------------------------------------- */}
                  {selectedElement.type === 'image' &&
                    (() => {
                      const imageElement = selectedElement as ImageElementType
                      return (
                        <PropertySection
                          title="Image"
                          defaultOpen
                        >
                          {/* Image source with storage browser or URL input
                          User can select from storage or paste an external URL.
                          When cleared (empty string), falls back to placeholder */}
                          <ImageSourceControl
                            label="Source"
                            value={
                              imageElement.src === DEFAULT_IMAGE_PROPS.src
                                ? ''
                                : imageElement.src
                            }
                            onChange={(val) => {
                              // If cleared, use the default placeholder image
                              const newSrc = val || DEFAULT_IMAGE_PROPS.src
                              handleChange('src', newSrc)
                            }}
                          />

                          {/*
                        Auto Width toggle - only for images that are INSIDE a frame.
                        Root-level images (parentId === null) can't use 100% width since
                        there's no parent container to fill.
                        When enabled, image stretches to fill parent container width.
                      */}
                          {selectedElement.parentId !== null && (
                            <ToggleControl
                              label="Auto Width"
                              checked={getProperty('autoWidth', false)}
                              onChange={(val) =>
                                handlePropertyChange('autoWidth', val)
                              }
                              hasMobileOverride={checkPropertyMobileOverride(
                                'autoWidth'
                              )}
                              onResetMobileOverride={() =>
                                resetPropertyMobileOverride('autoWidth')
                              }
                            />
                          )}

                          {/* Object Fit - how image fills the container */}
                          <DropdownControl
                            label="Fit"
                            value={getProperty('objectFit', 'cover') as string}
                            options={[
                              { value: 'cover', label: 'Cover' },
                              { value: 'contain', label: 'Contain' },
                              { value: 'fill', label: 'Fill' },
                            ]}
                            onChange={(val) =>
                              handlePropertyChange('objectFit', val)
                            }
                            hasMobileOverride={checkPropertyMobileOverride(
                              'objectFit'
                            )}
                            onResetMobileOverride={() =>
                              resetPropertyMobileOverride('objectFit')
                            }
                          />

                          {/* Color Mask - applies color filter to image
                          'regular' shows original colors (default)
                          'grayscale' converts image to black and white */}
                          <DropdownControl
                            label="Color"
                            value={getProperty('colorMask', 'regular') as string}
                            options={[
                              { value: 'regular', label: 'Regular' },
                              { value: 'grayscale', label: 'Grayscale' },
                            ]}
                            onChange={(val) =>
                              handlePropertyChange('colorMask', val)
                            }
                            hasMobileOverride={checkPropertyMobileOverride(
                              'colorMask'
                            )}
                            onResetMobileOverride={() =>
                              resetPropertyMobileOverride('colorMask')
                            }
                          />

                          {/* Rounded Corners - Figma-style linked/unlinked toggle
                          In linked mode: single value for all corners
                          In unlinked mode: individual values for each corner (TL, TR, BR, BL) */}
                          <BorderRadiusControl
                            label="Corners"
                            values={parseBorderRadiusValue(
                              getStyle('borderRadius', 0)
                            )}
                            onChange={(values) => {
                              handleStyleChange(
                                'borderRadius',
                                formatBorderRadiusValue(values)
                              )
                            }}
                            hasMobileOverride={checkMobileOverride(
                              'borderRadius'
                            )}
                            onResetMobileOverride={() =>
                              resetStyleMobileOverride('borderRadius')
                            }
                          />
                        </PropertySection>
                      )
                    })()}

                  {/* -------------------------------------------------------------
                    VIDEO SECTION (Video elements only)
                    Shows video source control (storage/loom), playback options, and fit.
                    ------------------------------------------------------------- */}
                  {selectedElement.type === 'video' &&
                    (() => {
                      const videoElement = selectedElement as VideoElementType
                      return (
                        <PropertySection
                          title="Video"
                          defaultOpen
                        >
                          {/* Source Type toggle - Storage or Loom */}
                          <DropdownControl
                            label="Source Type"
                            value={videoElement.sourceType || 'storage'}
                            options={[
                              { value: 'storage', label: 'From Storage' },
                              { value: 'loom', label: 'Loom Video' },
                            ]}
                            onChange={(val) => handleChange('sourceType', val)}
                          />

                          {/* Storage video source - shows when sourceType is 'storage' */}
                          {videoElement.sourceType === 'storage' && (
                            <>
                              <VideoSourceControl
                                label="Video"
                                value={videoElement.src || ''}
                                onChange={(val) => {
                                  /**
                                   * When selecting a video from storage, we need to:
                                   * 1. Set the video source (src)
                                   * 2. Auto-set the poster/thumbnail from the HLS path
                                   *
                                   * We dispatch BOTH updates together in a single action
                                   * so they're applied atomically to Redux state.
                                   */
                                  const lastId = selectedIds[selectedIds.length - 1]
                                  if (!lastId) return

                                  // Build the updates object
                                  const updates: Record<string, string> = { src: val }

                                  // Auto-derive poster from HLS path for storage videos
                                  if (val && val.includes('/hls/') && val.includes('/master.m3u8')) {
                                    updates.poster = val.replace('/master.m3u8', '/poster.jpg')
                                  } else if (!val) {
                                    // Clear poster when video is cleared
                                    updates.poster = ''
                                  }

                                  // Dispatch both updates together
                                  dispatch(updateElement({ id: lastId, updates }))
                                }}
                              />

                              {/* Custom thumbnail for storage videos (user can override default) */}
                              {/* Show derived poster URL if no explicit one is set */}
                              <ImageSourceControl
                                label="Thumbnail"
                                value={
                                  videoElement.poster ||
                                  (videoElement.src?.includes('/hls/') && videoElement.src?.includes('/master.m3u8')
                                    ? videoElement.src.replace('/master.m3u8', '/poster.jpg')
                                    : '')
                                }
                                onChange={(val) => handleChange('poster', val)}
                              />
                            </>
                          )}

                          {/* Loom URL input - shows when sourceType is 'loom' */}
                          {videoElement.sourceType === 'loom' && (
                            <InputGroupControl
                              label="Loom URL"
                              value={videoElement.loomUrl || ''}
                              onChange={(val) => handleChange('loomUrl', val)}
                              type="text"
                            />
                          )}

                          {/* Auto Width toggle - only for videos INSIDE a frame */}
                          {selectedElement.parentId !== null && (
                            <ToggleControl
                              label="Auto Width"
                              checked={getProperty('autoWidth', false)}
                              onChange={(val) =>
                                handlePropertyChange('autoWidth', val)
                              }
                              hasMobileOverride={checkPropertyMobileOverride(
                                'autoWidth'
                              )}
                              onResetMobileOverride={() =>
                                resetPropertyMobileOverride('autoWidth')
                              }
                            />
                          )}

                          {/* Video Fit - how the actual video fills the container */}
                          <DropdownControl
                            label="Video Fit"
                            value={getProperty('objectFit', 'contain') as string}
                            options={[
                              { value: 'cover', label: 'Cover' },
                              { value: 'contain', label: 'Contain' },
                              { value: 'fill', label: 'Fill' },
                            ]}
                            onChange={(val) =>
                              handlePropertyChange('objectFit', val)
                            }
                            hasMobileOverride={checkPropertyMobileOverride(
                              'objectFit'
                            )}
                            onResetMobileOverride={() =>
                              resetPropertyMobileOverride('objectFit')
                            }
                          />

                          {/* Thumbnail Fit - how the poster/thumbnail fills the container */}
                          <DropdownControl
                            label="Thumbnail Fit"
                            value={getProperty('posterFit', 'cover') as string}
                            options={[
                              { value: 'cover', label: 'Cover' },
                              { value: 'contain', label: 'Contain' },
                              { value: 'fill', label: 'Fill' },
                            ]}
                            onChange={(val) =>
                              handlePropertyChange('posterFit', val)
                            }
                            hasMobileOverride={checkPropertyMobileOverride(
                              'posterFit'
                            )}
                            onResetMobileOverride={() =>
                              resetPropertyMobileOverride('posterFit')
                            }
                          />

                          {/* Rounded Corners */}
                          <BorderRadiusControl
                            label="Corners"
                            values={parseBorderRadiusValue(
                              getStyle('borderRadius', 0)
                            )}
                            onChange={(values) => {
                              handleStyleChange(
                                'borderRadius',
                                formatBorderRadiusValue(values)
                              )
                            }}
                            hasMobileOverride={checkMobileOverride(
                              'borderRadius'
                            )}
                            onResetMobileOverride={() =>
                              resetStyleMobileOverride('borderRadius')
                            }
                          />
                        </PropertySection>
                      )
                    })()}

                  {/* -------------------------------------------------------------
                    PLAYBACK SECTION (Video elements only)
                    Controls for video playback behavior.
                    ------------------------------------------------------------- */}
                  {selectedElement.type === 'video' && (
                    <PropertySection
                      title="Playback"
                      defaultOpen={false}
                    >
                      <ToggleControl
                        label="Show Controls"
                        checked={getProperty('controls', true)}
                        onChange={(val) => handlePropertyChange('controls', val)}
                        hasMobileOverride={checkPropertyMobileOverride('controls')}
                        onResetMobileOverride={() => resetPropertyMobileOverride('controls')}
                      />
                      <ToggleControl
                        label="Autoplay"
                        checked={getProperty('autoplay', false)}
                        onChange={(val) => handlePropertyChange('autoplay', val)}
                        hasMobileOverride={checkPropertyMobileOverride('autoplay')}
                        onResetMobileOverride={() => resetPropertyMobileOverride('autoplay')}
                      />
                      <ToggleControl
                        label="Loop"
                        checked={getProperty('loop', false)}
                        onChange={(val) => handlePropertyChange('loop', val)}
                        hasMobileOverride={checkPropertyMobileOverride('loop')}
                        onResetMobileOverride={() => resetPropertyMobileOverride('loop')}
                      />
                      <ToggleControl
                        label="Muted"
                        checked={getProperty('muted', false)}
                        onChange={(val) => handlePropertyChange('muted', val)}
                        hasMobileOverride={checkPropertyMobileOverride('muted')}
                        onResetMobileOverride={() => resetPropertyMobileOverride('muted')}
                      />
                    </PropertySection>
                  )}

                  {/* -------------------------------------------------------------
                    BACKGROUND SECTION (Color + Image/Video media toggle)
                    Shown for frame, page, prebuilt, and smartcms-list elements.
                    Frame elements get the full Image/Video toggle; all others
                    retain the original image-only background control.
                    ------------------------------------------------------------- */}
                  {(selectedElement.type === 'frame' ||
                    selectedElement.type === 'page' ||
                    selectedElement.type === 'prebuilt' ||
                    selectedElement.type === 'smartcms-list') && (() => {
                    /**
                     * Derive background media mode and video config from element styles.
                     * __backgroundMode tracks the active media type (image or video).
                     * __backgroundVideo holds the HLS video config (src, poster, objectFit).
                     * Data for BOTH modes is retained locally in Redux — only the active
                     * mode renders. On save/persist, inactive data is stripped.
                     *
                     * SOURCE OF TRUTH: BackgroundMediaMode, BackgroundVideoConfig from types.ts
                     */
                    const bgVideoConfig = getStyle('__backgroundVideo', undefined) as BackgroundVideoConfig | undefined
                    const backgroundMediaMode: BackgroundMediaMode =
                      (getStyle('__backgroundMode', 'image') as BackgroundMediaMode) || 'image'
                    const isFrameElement = selectedElement.type === 'frame'

                    return (
                      <PropertySection
                        title="Background"
                        defaultOpen
                      >
                        {/* Gradient/Solid Color picker — always visible, acts as overlay on video */}
                        <GradientControl
                          label="Fill"
                          solidColor={getStyle('backgroundColor', '#ffffff')}
                          gradient={getStyle('__backgroundGradient', undefined) as GradientConfig | undefined}
                          onSolidColorChange={(val) => {
                            handleMultipleStyleChanges({
                              backgroundColor: val,
                              __backgroundGradient: undefined,
                            })
                          }}
                          onGradientChange={(gradient) => {
                            handleMultipleStyleChanges({
                              __backgroundGradient: gradient,
                              backgroundColor: gradient ? 'transparent' : undefined,
                            })
                          }}
                          hasMobileOverride={
                            checkMobileOverride('backgroundColor') ||
                            checkMobileOverride('__backgroundGradient')
                          }
                          onResetMobileOverride={() => {
                            resetStyleMobileOverride('backgroundColor')
                            resetStyleMobileOverride('__backgroundGradient')
                          }}
                        />

                        {/* Media type toggle — only for frame elements (pages/prebuilt stay image-only) */}
                        {isFrameElement && (
                          <ButtonGroupControl
                            label="Media"
                            value={backgroundMediaMode}
                            columns={2}
                            options={[
                              { value: 'image', label: 'Image' },
                              { value: 'video', label: 'Video' },
                            ]}
                            onChange={(val) => {
                              /**
                               * Toggle between image and video background modes.
                               * Only updates the __backgroundMode flag — does NOT clear
                               * any data for the inactive mode. This lets users switch
                               * back and forth without losing their image or video URL.
                               */
                              handleMultipleStyleChanges({
                                __backgroundMode: val as BackgroundMediaMode,
                              })
                            }}
                          />
                        )}

                        {/* Image background — shown when media mode is 'image' (or for non-frame elements) */}
                        {(!isFrameElement || backgroundMediaMode === 'image') && (
                          <ImageBackgroundControl
                            label="Image"
                            value={getStyle('backgroundImage', '')}
                            onChange={(val) =>
                              handleStyleChange('backgroundImage', val)
                            }
                            hasMobileOverride={checkMobileOverride('backgroundImage')}
                            onResetMobileOverride={() =>
                              resetStyleMobileOverride('backgroundImage')
                            }
                          />
                        )}

                        {/* Background Image Fit — how the background image fills the frame.
                            Only shown for frames in image mode when an image is set.
                            NOTE: "Contain" removed — it causes tiling artifacts. Only Cover and Fill. */}
                        {isFrameElement && backgroundMediaMode === 'image' && getStyle('backgroundImage', '') && (
                          <DropdownControl
                            label="Image Fit"
                            value={getStyle('__backgroundFit', 'cover')}
                            options={[
                              { value: 'cover', label: 'Cover' },
                              { value: 'fill', label: 'Fill' },
                            ]}
                            onChange={(val) =>
                              handleStyleChange('__backgroundFit', val)
                            }
                            hasMobileOverride={checkMobileOverride('__backgroundFit')}
                            onResetMobileOverride={() =>
                              resetStyleMobileOverride('__backgroundFit')
                            }
                          />
                        )}

                        {/* Video background — shown when media mode is 'video' (frame only) */}
                        {isFrameElement && backgroundMediaMode === 'video' && (
                          <>
                            {/* Video source picker — reuses the existing VideoSourceControl */}
                            <VideoSourceControl
                              label="Video"
                              value={bgVideoConfig?.src || ''}
                              onChange={(val) => {
                                /**
                                 * When a video is selected from storage:
                                 * 1. Set the video src (HLS master.m3u8 URL)
                                 * 2. Auto-derive poster thumbnail from the HLS path
                                 * 3. Default objectFit to 'cover' for background video
                                 * 4. Ensure __backgroundMode is set to 'video'
                                 *
                                 * When cleared: remove __backgroundVideo and fall back to image mode.
                                 */
                                if (val) {
                                  const poster = (val.includes('/hls/') && val.includes('/master.m3u8'))
                                    ? val.replace('/master.m3u8', '/poster.jpg')
                                    : undefined
                                  handleMultipleStyleChanges({
                                    __backgroundVideo: { src: val, poster, objectFit: bgVideoConfig?.objectFit ?? 'cover' },
                                    __backgroundMode: 'video',
                                  })
                                } else {
                                  /* Clear video and revert to image mode */
                                  handleMultipleStyleChanges({
                                    __backgroundVideo: undefined,
                                    __backgroundMode: 'image',
                                  })
                                }
                              }}
                            />

                            {/* Thumbnail picker — lets user override the auto-derived poster */}
                            {bgVideoConfig?.src && (
                              <ImageSourceControl
                                label="Thumbnail"
                                value={bgVideoConfig?.poster || ''}
                                onChange={(val) => {
                                  /**
                                   * Override the auto-derived poster with a custom thumbnail.
                                   * Spreads existing config to preserve src and objectFit.
                                   */
                                  handleMultipleStyleChanges({
                                    __backgroundVideo: {
                                      ...bgVideoConfig,
                                      poster: val || undefined,
                                    },
                                  })
                                }}
                              />
                            )}

                            {/* Video fit toggle — how the background video fills the frame.
                                Writes to both __backgroundVideo.objectFit (legacy) and
                                __backgroundVideoFit (new style property read by unified-frame). */}
                            {bgVideoConfig?.src && (
                              <ButtonGroupControl
                                label="Fit"
                                value={getStyle('__backgroundVideoFit', bgVideoConfig?.objectFit ?? 'cover')}
                                columns={2}
                                options={[
                                  { value: 'cover', label: 'Cover' },
                                  { value: 'contain', label: 'Contain' },
                                ]}
                                onChange={(val) => {
                                  /**
                                   * Update video fit in two places for compatibility:
                                   * 1. __backgroundVideo.objectFit — legacy config (existing templates)
                                   * 2. __backgroundVideoFit — new standalone style property
                                   */
                                  handleMultipleStyleChanges({
                                    __backgroundVideo: {
                                      ...bgVideoConfig,
                                      objectFit: val as 'cover' | 'contain',
                                    },
                                    __backgroundVideoFit: val,
                                  })
                                }}
                              />
                            )}
                          </>
                        )}
                      </PropertySection>
                    )
                  })()}

                  {/* -------------------------------------------------------------
                    SPACING & BORDERS SECTION (Frame, Page, PreBuilt, SmartCMS List)
                    Box model controls: Gap, Padding, Margin + Border styling
                    Text and Button elements don't need these controls.
                    ------------------------------------------------------------- */}
                  {(selectedElement.type === 'frame' ||
                    selectedElement.type === 'page' ||
                    selectedElement.type === 'prebuilt' ||
                    selectedElement.type === 'smartcms-list') && (
                    <PropertySection
                      title="Spacing & Borders"
                      defaultOpen
                    >
                      {/* Gap - Space between children (frames, pages, prebuilt, smartcms-list) */}
                      {(selectedElement.type === 'frame' ||
                        selectedElement.type === 'page' ||
                        selectedElement.type === 'prebuilt' ||
                        selectedElement.type === 'smartcms-list') && (
                        <InputGroupControl
                          label="Gap"
                          value={getStyle('gap', 0)}
                          onChange={(val) => handleStyleChange('gap', val)}
                          type="number"
                          unit="px"
                          hasMobileOverride={checkMobileOverride('gap')}
                          onResetMobileOverride={() =>
                            resetStyleMobileOverride('gap')
                          }
                        />
                      )}

                      {/* Padding - Inner spacing (frames, pages, prebuilt, smartcms-list)
                      Uses SpacingControl for compact multi-mode editing */}
                      {(selectedElement.type === 'frame' ||
                        selectedElement.type === 'page' ||
                        selectedElement.type === 'prebuilt' ||
                        selectedElement.type === 'smartcms-list') && (
                        <SpacingControl
                          label="Padding"
                          values={parseSpacingValue(getStyle('padding', 0))}
                          onChange={(values) => {
                            handleStyleChange(
                              'padding',
                              formatSpacingValue(values)
                            )
                          }}
                          hasMobileOverride={checkMobileOverride('padding')}
                          onResetMobileOverride={() =>
                            resetStyleMobileOverride('padding')
                          }
                        />
                      )}

                      {/* Margin - Outer spacing (frames, prebuilt, smartcms-list - not pages)
                      Pages don't need margin since they're the root container */}
                      {(selectedElement.type === 'frame' ||
                        selectedElement.type === 'prebuilt' ||
                        selectedElement.type === 'smartcms-list') && (
                        <SpacingControl
                          label="Margin"
                          values={parseSpacingValue(getStyle('margin', 0))}
                          onChange={(values) => {
                            handleStyleChange(
                              'margin',
                              formatSpacingValue(values)
                            )
                          }}
                          hasMobileOverride={checkMobileOverride('margin')}
                          onResetMobileOverride={() =>
                            resetStyleMobileOverride('margin')
                          }
                        />
                      )}

                      {/* Rounded Corners (frame, prebuilt, smartcms-list) - Figma-style linked/unlinked toggle
                      In linked mode: single value for all corners
                      In unlinked mode: individual values for each corner (TL, TR, BR, BL) */}
                      {(selectedElement.type === 'frame' ||
                        selectedElement.type === 'prebuilt' ||
                        selectedElement.type === 'smartcms-list') && (
                        <BorderRadiusControl
                          label="Corners"
                          values={parseBorderRadiusValue(
                            getStyle('borderRadius', 0)
                          )}
                          onChange={(values) => {
                            handleStyleChange(
                              'borderRadius',
                              formatBorderRadiusValue(values)
                            )
                          }}
                          hasMobileOverride={checkMobileOverride(
                            'borderRadius'
                          )}
                          onResetMobileOverride={() =>
                            resetStyleMobileOverride('borderRadius')
                          }
                        />
                      )}

                      {/* Border Control - Full-featured per-side border editor with gradient support */}
                      {/* Available for ALL element types: frame, page, text, image, button, prebuilt, component, smartcms-list */}
                      <BorderControl
                        value={getStyle('__borderConfig', undefined) as BorderConfig | undefined}
                        onChange={(config) => {
                          handleStyleChange('__borderConfig', config)
                        }}
                        hasMobileOverride={checkMobileOverride('__borderConfig')}
                        onResetMobileOverride={() =>
                          resetStyleMobileOverride('__borderConfig')
                        }
                      />
                    </PropertySection>
                  )}

                  {/* -------------------------------------------------------------
                    SPACING SECTION (Text and Rich Text elements)
                    Box-model spacing: Padding (inner) and Margin (outer).
                    Text/rich-text elements don't share the frame "Spacing & Borders"
                    section (which also includes Gap and Rounded Corners), so they get
                    their own lightweight section with just padding + margin.
                    ------------------------------------------------------------- */}
                  {(selectedElement.type === 'text' ||
                    selectedElement.type === 'rich-text') && (
                    <PropertySection
                      title="Spacing"
                      defaultOpen={false}
                    >
                      {/* Padding — inner spacing between element edge and content */}
                      <SpacingControl
                        label="Padding"
                        values={parseSpacingValue(getStyle('padding', 0))}
                        onChange={(values) => {
                          handleStyleChange(
                            'padding',
                            formatSpacingValue(values)
                          )
                        }}
                        hasMobileOverride={checkMobileOverride('padding')}
                        onResetMobileOverride={() =>
                          resetStyleMobileOverride('padding')
                        }
                      />

                      {/* Margin — outer spacing between element and its siblings */}
                      <SpacingControl
                        label="Margin"
                        values={parseSpacingValue(getStyle('margin', 0))}
                        onChange={(values) => {
                          handleStyleChange(
                            'margin',
                            formatSpacingValue(values)
                          )
                        }}
                        hasMobileOverride={checkMobileOverride('margin')}
                        onResetMobileOverride={() =>
                          resetStyleMobileOverride('margin')
                        }
                      />
                    </PropertySection>
                  )}

                  {/* -------------------------------------------------------------
                    PLACEMENT SECTION (Frames and Text elements)
                    - Free Position: Lets element move freely within its parent container
                    - Center buttons: Quick-center horizontally/vertically within parent
                    - Sticky: Makes element stick to edge when scrolling (preview only)
                    ------------------------------------------------------------- */}
                  {(selectedElement.type === 'frame' || selectedElement.type === 'text') &&
                    (() => {
                      const stickyEnabled = getProperty('sticky', false)
                      const isFreePosition = getProperty('isAbsolute', false)
                      const hasParent = selectedElement.parentId !== null
                      // Get current centering state
                      const isCenteredHorizontal = selectedElement.centerHorizontal === true
                      const isCenteredVertical = selectedElement.centerVertical === true

                      return (
                        <PropertySection
                          title="Placement"
                          defaultOpen={false}
                        >
                          {/* Free Position Toggle - Lets element move freely within parent */}
                          {hasParent && (
                            <ToggleControl
                              label="Free Position"
                              checked={isFreePosition}
                              onChange={(val) => {
                                if (val && !isFreePosition) {
                                  // Enabling free position - capture current visual position
                                  // so element stays where it is visually
                                  const elementDom = document.querySelector(
                                    `[data-element-id="${selectedElement.id}"]`
                                  ) as HTMLElement
                                  const parentDom = document.querySelector(
                                    `[data-element-id="${selectedElement.parentId}"]`
                                  ) as HTMLElement

                                  if (elementDom && parentDom) {
                                    // Get the parent's content div (where children are positioned)
                                    // Excludes label divs (data-frame-label for legacy, data-element-label for unified)
                                    // and dimensions pill overlay to find the actual content area
                                    const parentContent = parentDom.querySelector(
                                      ':scope > div:not([data-frame-label]):not([data-element-label]):not([data-dimensions-pill])'
                                    ) as HTMLElement

                                    const elementRect = elementDom.getBoundingClientRect()
                                    const parentRect = (parentContent || parentDom).getBoundingClientRect()

                                    // Calculate position relative to parent content area
                                    // Screen coords are scaled by zoom, so divide to get canvas coords
                                    const relativeX = (elementRect.left - parentRect.left) / viewport.zoom
                                    const relativeY = (elementRect.top - parentRect.top) / viewport.zoom

                                    // Update x, y, and isAbsolute together
                                    dispatch(
                                      updateElement({
                                        id: selectedElement.id,
                                        updates: {
                                          x: Math.round(relativeX),
                                          y: Math.round(relativeY),
                                          isAbsolute: true,
                                        },
                                      })
                                    )
                                  } else {
                                    // Fallback: just enable free position (element will be at 0,0)
                                    handlePropertyChange('isAbsolute', true)
                                  }
                                } else {
                                  // Disabling free position - reset to normal layout flow
                                  // Also reset centering flags
                                  dispatch(
                                    updateElement({
                                      id: selectedElement.id,
                                      updates: {
                                        x: 0,
                                        y: 0,
                                        isAbsolute: false,
                                        centerHorizontal: false,
                                        centerVertical: false,
                                      },
                                    })
                                  )
                                }
                              }}
                              hasMobileOverride={checkPropertyMobileOverride(
                                'isAbsolute'
                              )}
                              onResetMobileOverride={() =>
                                resetPropertyMobileOverride('isAbsolute')
                              }
                            />
                          )}

                          {/* Center Toggles - CSS-based centering that stays centered on resize */}
                          {hasParent && isFreePosition && (
                            <>
                              <ToggleControl
                                label="Center Horizontal"
                                checked={isCenteredHorizontal}
                                onChange={(val) => {
                                  // When enabling centering, we use CSS left:50% + translateX(-50%)
                                  // which automatically stays centered even if sizes change
                                  dispatch(
                                    updateElement({
                                      id: selectedElement.id,
                                      updates: { centerHorizontal: val },
                                    })
                                  )
                                }}
                              />
                              <ToggleControl
                                label="Center Vertical"
                                checked={isCenteredVertical}
                                onChange={(val) => {
                                  // When enabling centering, we use CSS top:50% + translateY(-50%)
                                  // which automatically stays centered even if sizes change
                                  dispatch(
                                    updateElement({
                                      id: selectedElement.id,
                                      updates: { centerVertical: val },
                                    })
                                  )
                                }}
                              />
                            </>
                          )}

                          {/* Sticky Toggle - Makes element stick when scrolling (frames only) */}
                          {selectedElement.type === 'frame' && (
                            <ToggleControl
                              label="Sticky"
                              checked={stickyEnabled}
                              onChange={(val) =>
                                handlePropertyChange('sticky', val)
                              }
                              hasMobileOverride={checkPropertyMobileOverride(
                                'sticky'
                              )}
                              onResetMobileOverride={() =>
                                resetPropertyMobileOverride('sticky')
                              }
                            />
                          )}

                          {/* Sticky Position - only shown when sticky is enabled */}
                          {selectedElement.type === 'frame' && stickyEnabled && (
                            <DropdownControl
                              label="Stick To"
                              value={
                                getProperty('stickyPosition', 'top') as string
                              }
                              options={[
                                { value: 'top', label: 'Top' },
                                { value: 'bottom', label: 'Bottom' },
                                { value: 'left', label: 'Left' },
                                { value: 'right', label: 'Right' },
                              ]}
                              onChange={(val) =>
                                handlePropertyChange('stickyPosition', val)
                              }
                              hasMobileOverride={checkPropertyMobileOverride(
                                'stickyPosition'
                              )}
                              onResetMobileOverride={() =>
                                resetPropertyMobileOverride('stickyPosition')
                              }
                            />
                          )}
                        </PropertySection>
                      )
                    })()}

                  {/* -------------------------------------------------------------
                    TRANSFORM SECTION - Rotation control for elements
                    For non-frame elements that don't have a Layout section
                    Frames have rotation in their Layout section already
                    Note: 'component' type excluded as components use Settings tab
                    ------------------------------------------------------------- */}
                  {(selectedElement.type === 'text' ||
                    selectedElement.type === 'image' ||
                    selectedElement.type === 'video' ||
                    selectedElement.type === 'button' ||
                    selectedElement.type === 'cart' ||
                    selectedElement.type === 'add-to-cart-button' ||
                    selectedElement.type === 'link' ||
                    selectedElement.type === 'smartcms-list' ||
                    selectedElement.type === 'ecommerce-carousel' ||
                    selectedElement.type === 'faq' ||
                    selectedElement.type === 'list' ||
                    selectedElement.type === 'timer') && (
                    <PropertySection
                      title="Transform"
                      defaultOpen={false}
                    >
                      {/* Rotation - rotate the element using a knob dial control */}
                      <RotationKnobControl
                        value={getProperty('rotation', 0) as number}
                        onChange={(val) => handlePropertyChange('rotation', val)}
                        hasMobileOverride={checkPropertyMobileOverride('rotation')}
                        onResetMobileOverride={() =>
                          resetPropertyMobileOverride('rotation')
                        }
                      />
                    </PropertySection>
                  )}

                  {/* -------------------------------------------------------------
                    EFFECTS SECTION - Unified control for all visual effects
                    Includes: Drop Shadow, Inner Shadow, Layer Blur, Background Blur, Fade Edges
                    Available for frames, images, videos, buttons, text, page, and smartcms-list elements
                    ------------------------------------------------------------- */}
                  {(selectedElement.type === 'frame' ||
                    selectedElement.type === 'page' ||
                    selectedElement.type === 'image' ||
                    selectedElement.type === 'video' ||
                    selectedElement.type === 'button' ||
                    selectedElement.type === 'cart' ||
                    selectedElement.type === 'add-to-cart-button' ||
                    selectedElement.type === 'text' ||
                    selectedElement.type === 'prebuilt' ||
                    selectedElement.type === 'smartcms-list' ||
                    selectedElement.type === 'ecommerce-carousel' ||
                    selectedElement.type === 'faq' ||
                    selectedElement.type === 'list' ||
                    selectedElement.type === 'timer') && (
                    <PropertySection
                      title="Effects"
                      defaultOpen={false}
                    >
                      {/* Unified effects control - single "Add Effect" button with all effects in one list */}
                      {(() => {
                        const effectsConfig = (getStyle('__effects', undefined) as EffectsConfig | undefined) ?? { shadows: [], blurs: [] }
                        // Fade edges effect is now available for all element types (text, image, button, frame, etc.)
                        const supportsFadeEdges = true

                        return (
                          <EffectsControl
                            effectsConfig={effectsConfig}
                            onEffectsChange={(newConfig) => {
                              handleMultipleStyleChanges({
                                __effects: newConfig,
                              })
                            }}
                            fadeEdges={supportsFadeEdges ? getProperty('fadeEdges', 'none') as 'none' | 'top' | 'bottom' | 'left' | 'right' | 'top-bottom' | 'left-right' | 'all' : undefined}
                            onFadeEdgesChange={supportsFadeEdges ? (val) => handlePropertyChange('fadeEdges', val) : undefined}
                            fadeEdgesHeight={supportsFadeEdges ? (getProperty('fadeEdgesHeight', 10) as number) : undefined}
                            onFadeEdgesHeightChange={supportsFadeEdges ? (val) => handlePropertyChange('fadeEdgesHeight', val) : undefined}
                            supportsFadeEdges={supportsFadeEdges}
                            hasMobileOverride={checkMobileOverride('__effects')}
                            onResetMobileOverride={() => resetStyleMobileOverride('__effects')}
                          />
                        )
                      })()}
                    </PropertySection>
                  )}

                  {/* -------------------------------------------------------------
                    LAYER SECTION - Bring to Front / Send to Back controls
                    Available for all non-page elements that can be reordered
                    ------------------------------------------------------------- */}
                  {selectedElement.type !== 'page' && (
                    <PropertySection
                      title="Layer"
                      defaultOpen={false}
                    >
                      {/* Layer ordering buttons - reorder element in the z-stack */}
                      <div className="flex gap-2">
                        <button
                          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded border border-[#3a3a3a] text-[#e0e0e0] transition-colors"
                          onClick={() => executeLayerAction('bring-to-front')}
                          title="Bring to Front (⌘⇧])"
                        >
                          <ArrowUpToLine className="w-3.5 h-3.5" />
                          <span>Bring to Front</span>
                        </button>
                        <button
                          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded border border-[#3a3a3a] text-[#e0e0e0] transition-colors"
                          onClick={() => executeLayerAction('send-to-back')}
                          title="Send to Back (⌘⇧[)"
                        >
                          <ArrowDownToLine className="w-3.5 h-3.5" />
                          <span>Send to Back</span>
                        </button>
                      </div>
                    </PropertySection>
                  )}

                  {/* -------------------------------------------------------------
                    OPTIONS SECTION (Frames, Images, Videos, PreBuilt, SmartCMS List - pages can't be locked)
                    ------------------------------------------------------------- */}
                  {(selectedElement.type === 'frame' ||
                    selectedElement.type === 'image' ||
                    selectedElement.type === 'video' ||
                    selectedElement.type === 'prebuilt' ||
                    selectedElement.type === 'smartcms-list' ||
                    selectedElement.type === 'faq' ||
                    selectedElement.type === 'list' ||
                    selectedElement.type === 'timer') && (
                    <PropertySection
                      title="Options"
                      defaultOpen={false}
                    >
                      <ToggleControl
                        label="Visible"
                        checked={getProperty('visible', true)}
                        onChange={(val) => handlePropertyChange('visible', val)}
                        hasMobileOverride={checkPropertyMobileOverride(
                          'visible'
                        )}
                        onResetMobileOverride={() =>
                          resetPropertyMobileOverride('visible')
                        }
                      />
                      <ToggleControl
                        label="Locked"
                        checked={getProperty('locked', false)}
                        onChange={(val) => handlePropertyChange('locked', val)}
                        hasMobileOverride={checkPropertyMobileOverride(
                          'locked'
                        )}
                        onResetMobileOverride={() =>
                          resetPropertyMobileOverride('locked')
                        }
                      />
                    </PropertySection>
                  )}

                  {/* -------------------------------------------------------------
                    BUTTON SECTION (Button, Cart, and Add to Cart elements)
                    Shows button label, variant, and typography controls.
                    Cart element uses same controls as button (minus action config).
                    Add to Cart button uses the same design controls as regular buttons.
                    ------------------------------------------------------------- */}
                  {(selectedElement.type === 'button' || selectedElement.type === 'cart' || selectedElement.type === 'add-to-cart-button') && (
                        <>
                          {/* -------------------------------------------------------------
                            DIMENSIONS SECTION (Button, Cart, Add to Cart)
                            Width mode toggle so buttons can switch between fixed and fill.
                            ------------------------------------------------------------- */}
                          {selectedElement.parentId !== null && (
                            <PropertySection
                              title="Dimensions"
                              defaultOpen
                            >
                              <SizingModeControl
                                widthMode={getProperty('autoWidth', false) ? 'fill' : 'fixed'}
                                onWidthModeChange={(mode: WidthMode) => {
                                  handlePropertyChange('autoWidth', mode === 'fill')
                                }}
                                hasWidthMobileOverride={checkPropertyMobileOverride('autoWidth')}
                                onResetWidthMobileOverride={() => resetPropertyMobileOverride('autoWidth')}
                              />
                            </PropertySection>
                          )}

                          <PropertySection
                            title="Button"
                            defaultOpen
                          >
                            {/* Button Label - the text shown on the button */}
                            <InputGroupControl
                              label="Label"
                              value={getProperty('label', 'Button') as string}
                              onChange={(val) =>
                                handlePropertyChange('label', val)
                              }
                              type="text"
                            />

                            {/* Button Icon - optional icon from the icon picker */}
                            <div className="space-y-1.5">
                              <label className="text-xs text-muted-foreground font-medium">
                                Icon
                              </label>
                              <div className="flex gap-2">
                                {/* Icon Picker - shows selected icon or placeholder */}
                                <div className="flex-1">
                                  <IconPicker
                                    value={(getProperty('icon', '') as string) || undefined}
                                    onValueChange={(val) =>
                                      handlePropertyChange('icon', val)
                                    }
                                    placeholder="No icon"
                                    className="w-full h-8 text-xs"
                                  />
                                </div>
                                {/* Clear Icon button - only show when icon is set */}
                                {getProperty('icon', '') && (
                                  <button
                                    type="button"
                                    onClick={() => handlePropertyChange('icon', '')}
                                    className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-accent"
                                    title="Remove icon"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Icon Position - before or after the label (only show if icon is set) */}
                            {getProperty('icon', '') && (
                              <DropdownControl
                                label="Icon Position"
                                value={
                                  getProperty('iconPosition', 'before') as string
                                }
                                options={[
                                  { value: 'before', label: 'Before text' },
                                  { value: 'after', label: 'After text' },
                                ]}
                                onChange={(val) =>
                                  handlePropertyChange('iconPosition', val)
                                }
                              />
                            )}

                            {/* Icon Size - in pixels (only show if icon is set) */}
                            {getProperty('icon', '') && (
                              <SliderInputControl
                                label="Icon Size"
                                value={getProperty('iconSize', 16) as number}
                                onChange={(val) =>
                                  handlePropertyChange('iconSize', val)
                                }
                                min={8}
                                max={48}
                                step={1}
                              />
                            )}

                            {/* Button Variant - visual style preset */}
                            <DropdownControl
                              label="Variant"
                              value={
                                getProperty('variant', 'primary') as string
                              }
                              options={[
                                { value: 'primary', label: 'Primary' },
                                { value: 'secondary', label: 'Secondary' },
                                { value: 'outline', label: 'Outline' },
                                { value: 'ghost', label: 'Ghost' },
                              ]}
                              onChange={(val) =>
                                handlePropertyChange('variant', val)
                              }
                              hasMobileOverride={checkPropertyMobileOverride(
                                'variant'
                              )}
                              onResetMobileOverride={() =>
                                resetPropertyMobileOverride('variant')
                              }
                            />

                            {/* Rounded Corners - Figma-style linked/unlinked toggle
                            In linked mode: single value for all corners
                            In unlinked mode: individual values for each corner (TL, TR, BR, BL) */}
                            <BorderRadiusControl
                              label="Corners"
                              values={parseBorderRadiusValue(
                                getStyle('borderRadius', 8)
                              )}
                              onChange={(values) => {
                                handleStyleChange(
                                  'borderRadius',
                                  formatBorderRadiusValue(values)
                                )
                              }}
                              hasMobileOverride={checkMobileOverride(
                                'borderRadius'
                              )}
                              onResetMobileOverride={() =>
                                resetStyleMobileOverride('borderRadius')
                              }
                            />
                          </PropertySection>

                          {/* -------------------------------------------------------------
                            FILL SECTION (Button Colors)
                            Background color/gradient and text color for buttons.
                            Overrides the variant's default colors when set.
                            ------------------------------------------------------------- */}
                          <PropertySection
                            title="Fill"
                            defaultOpen
                          >
                            {/* Background Fill - Solid color or gradient
                                Overrides the variant's default background color */}
                            <GradientControl
                              label="Background"
                              solidColor={getStyle('backgroundColor', '#3b82f6')}
                              gradient={getStyle('__backgroundGradient', undefined) as GradientConfig | undefined}
                              onSolidColorChange={(val) => {
                                // Update both properties at once to avoid stale state issues
                                handleMultipleStyleChanges({
                                  backgroundColor: val,
                                  __backgroundGradient: undefined,
                                })
                              }}
                              onGradientChange={(gradient) => {
                                // Update both properties at once to avoid stale state issues
                                handleMultipleStyleChanges({
                                  __backgroundGradient: gradient,
                                  backgroundColor: gradient ? 'transparent' : undefined,
                                })
                              }}
                              hasMobileOverride={
                                checkMobileOverride('backgroundColor') ||
                                checkMobileOverride('__backgroundGradient')
                              }
                              onResetMobileOverride={() => {
                                resetStyleMobileOverride('backgroundColor')
                                resetStyleMobileOverride('__backgroundGradient')
                              }}
                            />

                            {/* Text Color - Overrides the variant's default text color */}
                            <ColorPickerControl
                              label="Text"
                              value={getStyle('color', '#ffffff')}
                              onChange={(val) => handleStyleChange('color', val)}
                              hasMobileOverride={checkMobileOverride('color')}
                              onResetMobileOverride={() =>
                                resetStyleMobileOverride('color')
                              }
                            />
                          </PropertySection>

                          <PropertySection
                            title="Typography"
                            defaultOpen
                          >
                            {/* Font Family
                            MIGRATED: Now stored in element.styles.fontFamily (CSS style property) */}
                            <FontFamilyControl
                              label="Font"
                              value={getStyle('fontFamily', 'Inter')}
                              onChange={(val) =>
                                handleStyleChange('fontFamily', val)
                              }
                              hasMobileOverride={checkMobileOverride(
                                'fontFamily'
                              )}
                              onResetMobileOverride={() =>
                                resetStyleMobileOverride('fontFamily')
                              }
                            />

                            {/* Font Size - Minimal slider with text input
                            MIGRATED: Now stored in element.styles.fontSize (CSS style property) */}
                            <SliderInputControl
                              label="Size"
                              value={getStyle('fontSize', 14) as number}
                              onChange={(val) =>
                                handleStyleChange('fontSize', val)
                              }
                              min={8}
                              max={72}
                              unit="px"
                              hasMobileOverride={checkMobileOverride(
                                'fontSize'
                              )}
                              onResetMobileOverride={() =>
                                resetStyleMobileOverride('fontSize')
                              }
                            />

                            {/* Font Weight
                            MIGRATED: Now stored in element.styles.fontWeight (CSS style property) */}
                            <DropdownControl
                              label="Weight"
                              value={String(getStyle('fontWeight', 500))}
                              options={[
                                { value: '400', label: 'Regular' },
                                { value: '500', label: 'Medium' },
                                { value: '600', label: 'Semi Bold' },
                                { value: '700', label: 'Bold' },
                              ]}
                              onChange={(val) =>
                                handleStyleChange(
                                  'fontWeight',
                                  parseInt(val, 10)
                                )
                              }
                              hasMobileOverride={checkMobileOverride(
                                'fontWeight'
                              )}
                              onResetMobileOverride={() =>
                                resetStyleMobileOverride('fontWeight')
                              }
                            />
                          </PropertySection>

                          {/* -------------------------------------------------------------
                          SPACING SECTION (Buttons)
                          Padding controls for button inner spacing.
                          Margin for outer spacing when inside a parent frame.
                          ------------------------------------------------------------- */}
                          <PropertySection
                            title="Spacing"
                            defaultOpen
                          >
                            {/* Padding - Inner spacing for buttons
                            Uses SpacingControl for compact multi-mode editing */}
                            <SpacingControl
                              label="Padding"
                              values={parseSpacingValue(
                                getStyle('padding', '12px 24px')
                              )}
                              onChange={(values) => {
                                handleStyleChange(
                                  'padding',
                                  formatSpacingValue(values)
                                )
                              }}
                              hasMobileOverride={checkMobileOverride('padding')}
                              onResetMobileOverride={() =>
                                resetStyleMobileOverride('padding')
                              }
                            />

                            {/* Margin - Outer spacing (only useful when button is inside a frame) */}
                            <SpacingControl
                              label="Margin"
                              values={parseSpacingValue(getStyle('margin', 0))}
                              onChange={(values) => {
                                handleStyleChange(
                                  'margin',
                                  formatSpacingValue(values)
                                )
                              }}
                              hasMobileOverride={checkMobileOverride('margin')}
                              onResetMobileOverride={() =>
                                resetStyleMobileOverride('margin')
                              }
                            />
                          </PropertySection>

                          {/* -------------------------------------------------------------
                            BORDER SECTION (Button, Cart, Add to Cart)
                            Full border control with per-side editing and gradient support.
                            Same BorderControl used by frames, timers, etc.
                            ------------------------------------------------------------- */}
                          <PropertySection
                            title="Border"
                            defaultOpen={false}
                          >
                            <BorderControl
                              value={getStyle('__borderConfig', undefined) as BorderConfig | undefined}
                              onChange={(config: BorderConfig | undefined) => {
                                handleStyleChange('__borderConfig', config)
                              }}
                              hasMobileOverride={checkMobileOverride('__borderConfig')}
                              onResetMobileOverride={() =>
                                resetStyleMobileOverride('__borderConfig')
                              }
                            />
                          </PropertySection>

                          <PropertySection
                            title="Options"
                            defaultOpen={false}
                          >
                            <ToggleControl
                              label="Visible"
                              checked={getProperty('visible', true)}
                              onChange={(val) =>
                                handlePropertyChange('visible', val)
                              }
                              hasMobileOverride={checkPropertyMobileOverride(
                                'visible'
                              )}
                              onResetMobileOverride={() =>
                                resetPropertyMobileOverride('visible')
                              }
                            />
                            <ToggleControl
                              label="Locked"
                              checked={getProperty('locked', false)}
                              onChange={(val) =>
                                handlePropertyChange('locked', val)
                              }
                              hasMobileOverride={checkPropertyMobileOverride(
                                'locked'
                              )}
                              onResetMobileOverride={() =>
                                resetPropertyMobileOverride('locked')
                              }
                            />
                          </PropertySection>
                        </>
                      )}

                  {/* -------------------------------------------------------------
                    PAYMENT THEME SECTION (Payment elements only)
                    Allows switching between light and dark mode themes
                    for the payment form appearance.
                    ------------------------------------------------------------- */}
                  {selectedElement.type === 'payment' && (
                    <PropertySection title="Theme" defaultOpen>
                      {/* Theme - Light or Dark mode for the payment form */}
                      <DropdownControl
                        label="Theme"
                        value={getProperty('theme', 'dark') as string}
                        options={[
                          { value: 'dark', label: 'Dark' },
                          { value: 'light', label: 'Light' },
                        ]}
                        onChange={(val) => handlePropertyChange('theme', val)}
                      />
                    </PropertySection>
                  )}

                  {/* -------------------------------------------------------------
                    BORDER SECTION (Payment, Checkout)
                    Full border control — same as frames and buttons.
                    Replaces the previously hardcoded 1px solid border.
                    ------------------------------------------------------------- */}
                  {(selectedElement.type === 'payment' || selectedElement.type === 'checkout') && (
                    <PropertySection
                      title="Border"
                      defaultOpen={false}
                    >
                      <BorderControl
                        value={
                          /**
                           * Fall back to the original hardcoded border values (1px solid #27272a)
                           * when __borderConfig hasn't been set yet (legacy/existing elements).
                           * This ensures the swatch shows the correct active border state.
                           *
                           * SOURCE OF TRUTH: CheckoutPaymentDefaultBorderConfig
                           */
                          (getStyle('__borderConfig', undefined) as BorderConfig | undefined)
                            ?? createUniformBorderConfig('solid', 1, '#27272a')
                        }
                        onChange={(config: BorderConfig | undefined) => {
                          handleStyleChange('__borderConfig', config)
                        }}
                        hasMobileOverride={checkMobileOverride('__borderConfig')}
                        onResetMobileOverride={() =>
                          resetStyleMobileOverride('__borderConfig')
                        }
                      />
                    </PropertySection>
                  )}

                  {/* -------------------------------------------------------------
                    TYPOGRAPHY SECTION (Text elements only)

                    Typography controls for text elements:
                    - Font Family: Google Fonts selector with search
                    - Font Size: Numeric input in pixels
                    - Font Weight: Weight selector based on available weights
                    - Line Height: Multiplier input
                    - Letter Spacing: Pixel input
                    - Text Align: Icon buttons for alignment
                    - Text Color: Color picker
                    ------------------------------------------------------------- */}
                  {selectedElement.type === 'text' &&
                    (() => {
                      // Cast to TextElement for proper type access
                      const textElement = selectedElement as TextElementType
                      return (
                        <>
                          {/* -------------------------------------------------------------
                          DIMENSIONS SECTION (Text elements)
                          Includes size controls and Fit to Content helper
                          ------------------------------------------------------------- */}
                          <PropertySection
                            title="Dimensions"
                            defaultOpen
                          >
                            {/* Width Mode - Fixed vs Fill (only inside a parent frame) */}
                            {selectedElement.parentId !== null && (
                              <SizingModeControl
                                widthMode={getProperty('autoWidth', false) ? 'fill' : 'fixed'}
                                onWidthModeChange={(mode: WidthMode) => {
                                  handlePropertyChange('autoWidth', mode === 'fill')
                                }}
                                hasWidthMobileOverride={checkPropertyMobileOverride('autoWidth')}
                                onResetWidthMobileOverride={() => resetPropertyMobileOverride('autoWidth')}
                              />
                            )}

                            {/* Size - Combined Width/Height with link button */}
                            <SizeInputControl
                              label="Size"
                              width={getProperty('width', textElement.width)}
                              height={getProperty('height', textElement.height)}
                              onWidthChange={(val) =>
                                handlePropertyChange('width', val)
                              }
                              onHeightChange={(val) =>
                                handlePropertyChange('height', val)
                              }
                              widthDisabled={getProperty('autoWidth', false)}
                              heightDisabled={getProperty('autoHeight', true)}
                              hasMobileOverride={
                                checkPropertyMobileOverride('width') ||
                                checkPropertyMobileOverride('height')
                              }
                              onResetMobileOverride={() => {
                                resetPropertyMobileOverride('width')
                                resetPropertyMobileOverride('height')
                              }}
                            />

                            {/* Fit to Content - Snaps dimensions to text content */}
                            <FitToContentButton
                              element={textElement}
                              onFit={(width, height) => {
                                handlePropertyChange('width', width)
                                handlePropertyChange('height', height)
                              }}
                            />

                            {/* Auto Height - When enabled, text wraps and height adapts to content.
                            This makes text elements responsive to container width changes.
                            When disabled, text is constrained to fixed height with hidden overflow. */}
                            <ToggleControl
                              label="Auto Height"
                              checked={getProperty('autoHeight', true)}
                              onChange={(val) =>
                                handlePropertyChange('autoHeight', val)
                              }
                              hasMobileOverride={checkPropertyMobileOverride(
                                'autoHeight'
                              )}
                              onResetMobileOverride={() =>
                                resetPropertyMobileOverride('autoHeight')
                              }
                            />

                            {/* Auto Width - When enabled, text uses 100% width of its container.
                            Combined with autoHeight, this makes the text fully responsive.
                            When disabled, uses the fixed pixel width set above. */}
                            <ToggleControl
                              label="Auto Width"
                              checked={getProperty('autoWidth', true)}
                              onChange={(val) =>
                                handlePropertyChange('autoWidth', val)
                              }
                              hasMobileOverride={checkPropertyMobileOverride(
                                'autoWidth'
                              )}
                              onResetMobileOverride={() =>
                                resetPropertyMobileOverride('autoWidth')
                              }
                            />
                          </PropertySection>

                          <PropertySection
                            title="Typography"
                            defaultOpen
                          >
                            {/* Font Family - Google Fonts searchable selector
                            MIGRATED: Now stored in element.styles.fontFamily (CSS style property) */}
                            <FontFamilyControl
                              label="Font"
                              value={getStyle('fontFamily', 'Inter')}
                              onChange={(val) =>
                                handleStyleChange('fontFamily', val)
                              }
                              hasMobileOverride={checkMobileOverride(
                                'fontFamily'
                              )}
                              onResetMobileOverride={() =>
                                resetStyleMobileOverride('fontFamily')
                              }
                            />

                            {/* Font Size - Minimal slider with text input
                            MIGRATED: Now stored in element.styles.fontSize (CSS style property) */}
                            <SliderInputControl
                              label="Size"
                              value={getStyle('fontSize', 16) as number}
                              onChange={(val) =>
                                handleStyleChange('fontSize', val)
                              }
                              min={8}
                              max={120}
                              unit="px"
                              hasMobileOverride={checkMobileOverride(
                                'fontSize'
                              )}
                              onResetMobileOverride={() =>
                                resetStyleMobileOverride('fontSize')
                              }
                            />

                            {/* Font Weight - Common weight options
                            MIGRATED: Now stored in element.styles.fontWeight (CSS style property) */}
                            <DropdownControl
                              label="Weight"
                              value={String(getStyle('fontWeight', 400))}
                              options={[
                                { value: '100', label: 'Thin' },
                                { value: '200', label: 'Extra Light' },
                                { value: '300', label: 'Light' },
                                { value: '400', label: 'Regular' },
                                { value: '500', label: 'Medium' },
                                { value: '600', label: 'Semi Bold' },
                                { value: '700', label: 'Bold' },
                                { value: '800', label: 'Extra Bold' },
                                { value: '900', label: 'Black' },
                              ]}
                              onChange={(val) =>
                                handleStyleChange(
                                  'fontWeight',
                                  parseInt(val, 10)
                                )
                              }
                              hasMobileOverride={checkMobileOverride(
                                'fontWeight'
                              )}
                              onResetMobileOverride={() =>
                                resetStyleMobileOverride('fontWeight')
                              }
                            />

                            {/* Line Height - Multiplier
                            MIGRATED: Now stored in element.styles.lineHeight (CSS style property) */}
                            <InputGroupControl
                              label="Line H."
                              value={getStyle('lineHeight', 1.5) as number}
                              onChange={(val) =>
                                handleStyleChange('lineHeight', Number(val))
                              }
                              type="number"
                              hasMobileOverride={checkMobileOverride(
                                'lineHeight'
                              )}
                              onResetMobileOverride={() =>
                                resetStyleMobileOverride('lineHeight')
                              }
                            />

                            {/* Letter Spacing - Pixel input
                            MIGRATED: Now stored in element.styles.letterSpacing (CSS style property) */}
                            <InputGroupControl
                              label="Spacing"
                              value={getStyle('letterSpacing', 0) as number}
                              onChange={(val) =>
                                handleStyleChange('letterSpacing', Number(val))
                              }
                              unit="px"
                              type="number"
                              hasMobileOverride={checkMobileOverride(
                                'letterSpacing'
                              )}
                              onResetMobileOverride={() =>
                                resetStyleMobileOverride('letterSpacing')
                              }
                            />

                            {/* Text Alignment - Icon toggle buttons
                            MIGRATED: Now stored in element.styles.textAlign (CSS style property) */}
                            <IconToggleControl
                              label="Align"
                              value={getStyle('textAlign', 'left') as string}
                              options={[
                                {
                                  value: 'left',
                                  icon: <AlignLeft className="w-4 h-4" />,
                                  title: 'Left',
                                },
                                {
                                  value: 'center',
                                  icon: <AlignCenter className="w-4 h-4" />,
                                  title: 'Center',
                                },
                                {
                                  value: 'right',
                                  icon: <AlignRight className="w-4 h-4" />,
                                  title: 'Right',
                                },
                                {
                                  value: 'justify',
                                  icon: <AlignJustify className="w-4 h-4" />,
                                  title: 'Justify',
                                },
                              ]}
                              onChange={(val) =>
                                handleStyleChange('textAlign', val)
                              }
                              hasMobileOverride={checkMobileOverride(
                                'textAlign'
                              )}
                              onResetMobileOverride={() =>
                                resetStyleMobileOverride('textAlign')
                              }
                            />

                            {/* Text Transform - uppercase, lowercase, capitalize, none
                            Stored in element.styles.textTransform (CSS style property) */}
                            <DropdownControl
                              label="Transform"
                              value={String(
                                getStyle('textTransform', 'none')
                              )}
                              options={[
                                { value: 'none', label: 'None' },
                                { value: 'uppercase', label: 'Uppercase' },
                                { value: 'lowercase', label: 'Lowercase' },
                                { value: 'capitalize', label: 'Capitalize' },
                              ]}
                              onChange={(val) =>
                                handleStyleChange('textTransform', val)
                              }
                              hasMobileOverride={checkMobileOverride(
                                'textTransform'
                              )}
                              onResetMobileOverride={() =>
                                resetStyleMobileOverride('textTransform')
                              }
                            />

                            {/* Text Color - Gradient/Solid color control */}
                            <GradientControl
                              label="Color"
                              solidColor={getStyle('color', '#1a1a1a')}
                              gradient={getStyle('__textGradient', undefined) as GradientConfig | undefined}
                              onSolidColorChange={(val) => {
                                // Update both properties at once to avoid stale state issues
                                handleMultipleStyleChanges({
                                  color: val,
                                  __textGradient: undefined,
                                })
                              }}
                              onGradientChange={(gradient) => {
                                // Update both properties at once to avoid stale state issues
                                handleMultipleStyleChanges({
                                  __textGradient: gradient,
                                  color: gradient ? 'transparent' : undefined,
                                })
                              }}
                              isTextFill
                              hasMobileOverride={
                                checkMobileOverride('color') ||
                                checkMobileOverride('__textGradient')
                              }
                              onResetMobileOverride={() => {
                                resetStyleMobileOverride('color')
                                resetStyleMobileOverride('__textGradient')
                              }}
                            />
                          </PropertySection>

                          {/* Background Section for Text */}
                          <PropertySection
                            title="Background"
                            defaultOpen={false}
                          >
                            <ColorPickerControl
                              label="Color"
                              value={getStyle('backgroundColor', 'transparent')}
                              onChange={(val) =>
                                handleStyleChange('backgroundColor', val)
                              }
                              hasMobileOverride={checkMobileOverride(
                                'backgroundColor'
                              )}
                              onResetMobileOverride={() =>
                                resetStyleMobileOverride('backgroundColor')
                              }
                            />
                          </PropertySection>

                          {/* Options Section for Text */}
                          <PropertySection
                            title="Options"
                            defaultOpen={false}
                          >
                            <ToggleControl
                              label="Visible"
                              checked={getProperty('visible', true)}
                              onChange={(val) =>
                                handlePropertyChange('visible', val)
                              }
                              hasMobileOverride={checkPropertyMobileOverride(
                                'visible'
                              )}
                              onResetMobileOverride={() =>
                                resetPropertyMobileOverride('visible')
                              }
                            />
                            <ToggleControl
                              label="Locked"
                              checked={getProperty('locked', false)}
                              onChange={(val) =>
                                handlePropertyChange('locked', val)
                              }
                              hasMobileOverride={checkPropertyMobileOverride(
                                'locked'
                              )}
                              onResetMobileOverride={() =>
                                resetPropertyMobileOverride('locked')
                              }
                            />
                          </PropertySection>
                        </>
                      )
                    })()}

                  {/*
                  =============================================================
                  SPECIALTY PROPERTIES (Future - Element-Specific)
                  =============================================================

                  CONTAINER ELEMENTS:
                  {selectedElement.type === 'container' && (
                    <PropertySection title="Layout" defaultOpen>
                      <ButtonGroupControl label="Direction" ... />
                      <ButtonGroupControl label="Align" ... />
                      <ToggleControl label="Wrap" />
                      <InputGroupControl label="Gap" />
                    </PropertySection>
                  )}

                  IMAGE ELEMENTS:
                  {selectedElement.type === 'image' && (
                    <PropertySection title="Image" defaultOpen>
                      <ImageUploadControl label="Source" />
                      <DropdownControl label="Fit" ... />
                    </PropertySection>
                  )}
                */}

                  {/*
                          =============================================================
                          CUSTOM PROPERTIES (Future Implementation)
                          =============================================================

                          ⚠️ FUTURE FEATURE - DO NOT IMPLEMENT YET

                          User-defined properties for reusable components:
                          - Component variants
                          - Dynamic text content
                          - Design tokens
                          - Conditional visibility
                */}
                    </>
                  )}
                </div>
              ) : (
                <EmptyState />
              ))}

            {/* SETTINGS TAB */}
            {displayedTab === 'settings' &&
              (selectedElement ? (
                <div className="pt-2">
                  {/* ================================================================
                      EXPOSE AS PROP SECTION - Component Editing Mode
                      Shows when editing a component and an element inside it is selected.
                      Allows exposing element properties as component props for customization.
                      The component internally checks if we're in edit mode.
                      ================================================================ */}
                  <ExposeAsPropSection selectedElement={selectedElement} />

                  {/* PreBuilt Navbar Settings - Full settings panel */}
                  {isPreBuiltNavbar(selectedElement) && (
                    <NavbarSettingsPanel
                      element={selectedElement as PreBuiltNavbarElement}
                      onSettingsChange={handleNavbarSettingsChange}
                    />
                  )}

                  {/* PreBuilt Sidebar Settings - Full settings panel for sidebar layout */}
                  {isPreBuiltSidebar(selectedElement) && (
                    <SidebarSettingsPanel
                      element={selectedElement as PreBuiltSidebarElement}
                      onSettingsChange={handleSidebarSettingsChange}
                    />
                  )}

                  {/* PreBuilt Total Members Settings - Social proof element settings */}
                  {isPreBuiltTotalMembers(selectedElement) && (
                    <TotalMembersSettingsPanel
                      element={selectedElement as PreBuiltTotalMembersElement}
                      onSettingsChange={handleTotalMembersSettingsChange}
                    />
                  )}

                  {/* PreBuilt Logo Carousel Settings - Logo management and animation */}
                  {isPreBuiltLogoCarousel(selectedElement) && (
                    <LogoCarouselSettingsPanel
                      element={selectedElement as PreBuiltLogoCarouselElement}
                      onSettingsChange={handleLogoCarouselSettingsChange}
                    />
                  )}

                  {/* ================================================================
                      FRAME SETTINGS - Component conversion and advanced options
                      Shows for frame elements only, not for prebuilt or other types
                      ================================================================ */}
                  {selectedElement.type === 'frame' && (
                    <FrameSettingsSection
                      frameElement={selectedElement as FrameElement}
                      elements={activePage?.canvas.elements ?? {}}
                      childrenMap={activePage?.canvas.childrenMap ?? {}}
                    />
                  )}

                  {/* ================================================================
                      ANIMATION SETTINGS - Auto-scroll and other animations
                      Shows for frame elements only, NOT for SmartCMS List frames
                      ================================================================ */}
                  {selectedElement.type === 'frame' && (
                    <AnimationSettingsSection
                      element={selectedElement as FrameElement}
                    />
                  )}

                  {/* ================================================================
                      COMPONENT INSTANCE SETTINGS - Prop values and detach option
                      Shows for component instances (non-editable children)
                      ================================================================ */}
                  {selectedElement.type === 'component' && (
                    <ComponentInstanceSettingsSection
                      instanceElement={selectedElement as ComponentInstanceElement}
                    />
                  )}

                  {/* ================================================================
                      SMARTCMS LIST SETTINGS - CMS configuration and slot management
                      Shows for SmartCMS List elements only
                      ================================================================ */}
                  {selectedElement.type === 'smartcms-list' && (
                    <SmartCmsListSettingsSection
                      element={selectedElement as SmartCmsListElementType}
                    />
                  )}

                  {/* ================================================================
                      FORM SETTINGS - Form selection and configuration
                      Shows for Form elements only
                      ================================================================ */}
                  {selectedElement.type === 'form' && (
                    <FormSettingsPanel
                      element={selectedElement as FormElementType}
                    />
                  )}

                  {/* ================================================================
                      PAYMENT SETTINGS - Product/Price selection
                      Shows for Payment elements only
                      ================================================================ */}
                  {selectedElement.type === 'payment' && (
                    <PaymentSettingsPanel
                      element={selectedElement as PaymentElementType}
                    />
                  )}

                  {/* ================================================================
                      TEXT SETTINGS - Semantic HTML tag selection for SEO
                      Shows for Text elements only
                      ================================================================ */}
                  {selectedElement.type === 'text' && (
                    <PropertySection title="SEO" defaultOpen>
                      {/* HTML Tag — controls the semantic tag used in published pages.
                          Search engines use heading hierarchy (h1-h6) to understand content structure. */}
                      <DropdownControl
                        label="HTML Tag"
                        value={(selectedElement as TextElementType).htmlTag || 'p'}
                        options={[
                          { value: 'h1', label: 'H1 — Main Heading' },
                          { value: 'h2', label: 'H2 — Section Heading' },
                          { value: 'h3', label: 'H3 — Subsection' },
                          { value: 'h4', label: 'H4 — Sub-subsection' },
                          { value: 'h5', label: 'H5 — Minor Heading' },
                          { value: 'h6', label: 'H6 — Smallest Heading' },
                          { value: 'p', label: 'P — Paragraph' },
                          { value: 'span', label: 'Span — Inline' },
                          { value: 'div', label: 'Div — Block' },
                        ]}
                        onChange={(val) => {
                          const lastId = selectedIds[selectedIds.length - 1]
                          if (!lastId) return
                          dispatch(updateElement({ id: lastId, updates: { htmlTag: val as TextElementType['htmlTag'] } }))
                        }}
                      />
                    </PropertySection>
                  )}

                  {/* ================================================================
                      IMAGE SEO SETTINGS - Alt text for accessibility and SEO
                      Shows for Image elements only
                      ================================================================ */}
                  {selectedElement.type === 'image' && (
                    <PropertySection title="SEO" defaultOpen>
                      {/* Alt Text — describes the image for screen readers and search engines.
                          Google uses alt text to understand image content for image search results. */}
                      <InputGroupControl
                        label="Alt Text"
                        value={(selectedElement as ImageElementType).alt || ''}
                        type="text"
                        onChange={(val) => {
                          const lastId = selectedIds[selectedIds.length - 1]
                          if (!lastId) return
                          dispatch(updateElement({ id: lastId, updates: { alt: String(val) } }))
                        }}
                      />
                    </PropertySection>
                  )}

                  {/* ================================================================
                      LINK SEO SETTINGS - Aria label for accessibility and SEO
                      Shows for Link elements only
                      ================================================================ */}
                  {selectedElement.type === 'link' && (
                    <PropertySection title="SEO" defaultOpen>
                      {/* Aria Label — describes the link for screen readers when
                          the link's visible content (children) doesn't describe the destination. */}
                      <InputGroupControl
                        label="Aria Label"
                        value={(selectedElement as LinkElementType).ariaLabel || ''}
                        type="text"
                        onChange={(val) => {
                          const lastId = selectedIds[selectedIds.length - 1]
                          if (!lastId) return
                          dispatch(updateElement({ id: lastId, updates: { ariaLabel: String(val) } }))
                        }}
                      />
                    </PropertySection>
                  )}

                  {/* ================================================================
                      BUTTON SETTINGS - Action configuration (link, dynamic link, etc.)
                      Shows for Button elements only
                      ================================================================ */}
                  {selectedElement.type === 'button' && (
                    <ButtonSettingsSection
                      element={selectedElement as ButtonElement}
                    />
                  )}

                  {/* ================================================================
                      ADD TO CART BUTTON SETTINGS - Label, variant, icon config
                      Shows for Add to Cart Button elements only
                      ================================================================ */}
                  {selectedElement.type === 'add-to-cart-button' && (
                    <AddToCartButtonSettingsSection
                      element={selectedElement as AddToCartButtonElement}
                    />
                  )}

                  {/* ================================================================
                      CHECKOUT ELEMENT SETTINGS - Layout, headings, text content
                      Shows for Checkout elements only
                      ================================================================ */}
                  {selectedElement.type === 'checkout' && (
                    <CheckoutSettingsSection
                      element={selectedElement as CheckoutElement}
                    />
                  )}

                  {/* ================================================================
                      RECEIPT ELEMENT SETTINGS - Theme toggle (light/dark)
                      Shows for Receipt elements only
                      ================================================================ */}
                  {selectedElement.type === 'receipt' && (
                    <ReceiptSettingsSection
                      element={selectedElement as ReceiptElement}
                    />
                  )}

                  {/* ================================================================
                      CART BUTTON SETTINGS - Label, variant, icon config
                      Shows for Cart button elements only
                      ================================================================ */}
                  {selectedElement.type === 'cart' && (
                    <CartSettingsSection
                      element={selectedElement as CartElement}
                    />
                  )}

                  {/* ================================================================
                      ECOMMERCE CAROUSEL SETTINGS - Image management and display options
                      Shows for EcommerceCarousel elements only
                      ================================================================ */}
                  {selectedElement.type === 'ecommerce-carousel' && (
                    <EcommerceCarouselSettingsSection
                      element={selectedElement as EcommerceCarouselElement}
                    />
                  )}

                  {/* ================================================================
                      FAQ SETTINGS - Q&A items management and accordion behavior
                      Shows for FAQ elements only
                      ================================================================ */}
                  {selectedElement.type === 'faq' && (
                    <FaqSettingsSection
                      element={selectedElement as FaqElement}
                    />
                  )}

                  {/* ================================================================
                      LIST SETTINGS - Item management, icon config, layout spacing
                      Shows for List elements only
                      ================================================================ */}
                  {selectedElement.type === 'list' && (
                    <ListSettingsSection
                      element={selectedElement as ListElement}
                    />
                  )}

                  {/* ================================================================
                      TIMER SETTINGS - Countdown mode, segments, expiry actions
                      Shows for Timer elements only
                      ================================================================ */}
                  {selectedElement.type === 'timer' && (
                    <TimerSettingsSection
                      element={selectedElement as TimerElement}
                    />
                  )}

                  {/* Default Settings content for elements without custom settings */}
                  {!isPreBuiltNavbar(selectedElement) &&
                    !isPreBuiltSidebar(selectedElement) &&
                    !isPreBuiltTotalMembers(selectedElement) &&
                    selectedElement.type !== 'frame' &&
                    selectedElement.type !== 'component' &&
                    selectedElement.type !== 'text' &&
                    selectedElement.type !== 'image' &&
                    selectedElement.type !== 'link' &&
                    selectedElement.type !== 'smartcms-list' &&
                    selectedElement.type !== 'form' &&
                    selectedElement.type !== 'button' &&
                    selectedElement.type !== 'add-to-cart-button' &&
                    selectedElement.type !== 'checkout' &&
                    selectedElement.type !== 'cart' &&
                    selectedElement.type !== 'ecommerce-carousel' &&
                    selectedElement.type !== 'faq' &&
                    selectedElement.type !== 'list' &&
                    selectedElement.type !== 'sticky-note' &&
                    selectedElement.type !== 'timer' &&
                    selectedElement.type !== 'payment' && (
                    <div className="px-3 py-6 text-center">
                      <p className="text-sm text-muted-foreground">
                        No settings available for this element.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState />
              ))}

            {/* Multi-selection footer inside panel */}
            {selectedIds.length > 1 && (
              <div
                className="px-3 py-2 mt-auto"
                style={{ borderTop: '1px solid var(--border)' }}
              >
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {selectedIds.length}
                  </span>{' '}
                  elements selected · Editing last
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
