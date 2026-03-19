/**
 * ============================================================================
 * CANVAS BUILDER - Library Exports
 * ============================================================================
 *
 * Central export file for all library code.
 *
 * ============================================================================
 * ARCHITECTURE REMINDER (repeated for visibility)
 * ============================================================================
 *
 * This builder uses HYBRID STATE MANAGEMENT:
 *
 * 1. REDUX (Single Source of Truth) - for persistent data
 *    - Elements, selection, viewport, tool mode, history
 *    - Dispatch actions ONLY when interactions complete
 *
 * 2. REFS (60fps Performance) - for interaction state
 *    - Drag position, resize dimensions, sibling transforms
 *    - Updated via RAF, never cause re-renders
 *
 * 3. DIRECT DOM (Visual Feedback) - for real-time updates
 *    - Element transforms during drag
 *    - Opacity changes, cursor updates
 *
 * ============================================================================
 */

// Types - All type definitions
export * from './types'

// Google Fonts Service - Font loading and management
export {
  GoogleFontsService,
} from './google-fonts-service'
export type { FontItem } from './google-fonts-service'

// Store - Redux configuration and typed hooks
export { store, useAppDispatch, useAppSelector } from './store'
export type { RootState, AppDispatch } from './store'

// Slice - Actions and selectors
export {
  // ============================================================================
  // PAGE ACTIONS
  // ============================================================================
  createPage,
  switchPage,
  renamePage,
  updatePageSlug,
  updatePageDynamicSettings,
  deletePage,
  duplicatePage,
  loadPages,

  // ============================================================================
  // ELEMENT ACTIONS
  // ============================================================================
  addElement,
  updateElement,
  deleteElement,
  deleteElements,
  moveElement,
  moveElements,
  reorderElement,

  // ============================================================================
  // SELECTION ACTIONS
  // ============================================================================
  setSelection,
  setMultiSelection,
  toggleSelection,
  addToSelection,
  clearSelection,

  // ============================================================================
  // TOOL MODE
  // ============================================================================
  setToolMode,
  setPenStrokeColor,
  setPenBrushSize,
  setPenStrokeOpacity,

  // ============================================================================
  // PREVIEW MODE
  // ============================================================================
  togglePreviewMode,

  // ============================================================================
  // RESPONSIVE EDITING
  // ============================================================================
  setEditingBreakpoint,

  // ============================================================================
  // STYLE ACTIONS (CSS visual properties)
  // ============================================================================
  updateElementResponsiveStyle,
  clearElementResponsiveStyles,
  clearSingleResponsiveStyle,

  // ============================================================================
  // SETTING ACTIONS (Behavioral configs like autoWidth, sticky, etc.)
  // ============================================================================
  updateElementResponsiveSetting,
  clearElementResponsiveSettings,
  clearSingleResponsiveSetting,

  // ============================================================================
  // DEPRECATED PROPERTY ALIASES - Use Setting versions above
  // ============================================================================
  /** @deprecated Use updateElementResponsiveSetting instead. */
  updateElementResponsiveProperty,
  /** @deprecated Use clearElementResponsiveSettings instead. */
  clearElementResponsiveProperties,
  /** @deprecated Use clearSingleResponsiveSetting instead. */
  clearSingleResponsiveProperty,

  // ============================================================================
  // VIEWPORT
  // ============================================================================
  setViewport,

  // ============================================================================
  // HISTORY
  // ============================================================================
  undo,
  redo,

  // ============================================================================
  // SERIALIZATION
  // ============================================================================
  loadCanvas,

  // ============================================================================
  // PAGE SELECTORS
  // ============================================================================
  selectActivePageId,
  selectActivePage,
  selectPageInfos,
  selectAllPages,

  // ============================================================================
  // ELEMENT SELECTORS
  // ============================================================================
  selectElementById,
  selectRootElements,
  selectChildren,

  // ============================================================================
  // SELECTION SELECTORS
  // ============================================================================
  selectSelectedIds,
  selectIsSelected,
  selectSelectedId,

  // ============================================================================
  // TOOL MODE SELECTOR
  // ============================================================================
  selectToolMode,
  selectPenStrokeColor,
  selectPenBrushSize,
  selectPenStrokeOpacity,

  // ============================================================================
  // PREVIEW MODE SELECTOR
  // ============================================================================
  selectPreviewMode,

  // ============================================================================
  // RESPONSIVE EDITING SELECTOR
  // ============================================================================
  selectEditingBreakpoint,

  // ============================================================================
  // ERROR SELECTOR
  // ============================================================================
  selectCanvasError,

  // ============================================================================
  // VIEWPORT SELECTORS
  // ============================================================================
  selectViewport,

  // ============================================================================
  // HISTORY SELECTORS
  // ============================================================================
  selectCanUndo,
  selectCanRedo,

  // ============================================================================
  // CANVAS STATE SELECTORS
  // ============================================================================
  selectCanvasState,
  selectMainPage,

  // ============================================================================
  // LAYERS PANEL OPTIMIZED SELECTOR
  // ============================================================================
  selectLayersPanelData,

  // ============================================================================
  // LOCAL COMPONENTS
  // ============================================================================
  loadLocalComponents,
  addLocalComponent,
  updateLocalComponent,
  deleteLocalComponent,
  updateComponentSourceElement,
  addExposedProp,
  removeExposedProp,
  updateExposedProp,
  registerComponentInstance,
  unregisterComponentInstance,
  updateInstancePropValues,
  updateComponentInstancePropValue,
  updateNestedInstancePropValue,
  updateComponentInstanceCmsBindings,
  enterComponentEditMode,
  exitComponentEditMode,
  detachComponentInstance as detachComponentInstanceAction,
  // Component selectors
  selectLocalComponents,
  selectLocalComponentsLoaded,
  selectLocalComponentById,
  selectLocalComponentsList,
  selectLocalComponentsSorted,
  selectEditingComponentId,
  selectEditingComponent,
  selectIsEditingComponent,
  selectComponentForInstance,

  // ============================================================================
  // HELPERS
  // ============================================================================
  generateElementId,
  generatePageId,
} from './canvas-slice'

// Staging Slice - AI content staging for drag-and-drop transfer
export {
  createStagingGroup,
  addStagedElement,
  completeStagingGroup,
  removeStagingGroup,
  removeStagedElement,
  clearAllStaged,
  selectStagingGroups,
  selectStagingGroupById,
  selectStagingGroupCount,
  selectHasStagedContent,
} from './staging-slice'
export type {
  StagingGroup,
  StagingGroupStatus,
  StagingSliceState,
} from './staging-slice'

// Action Registry - Group actions system
export {
  registerAction,
  getAllActions,
  executeAction,
  calculateBounds,
  isSidebarInsetFrame,
} from './action-registry'

// Snap Service - Snap-to-grid and alignment detection
export {
  calculateDragSnap,
  calculateResizeSnap,
  detectAlignments,
  elementsToSnapTargets,
  createSnapState,
  updateSnapState,
} from './snap-service'
export type {
  SnapBounds,
  SnapTarget,
  SnapResult,
  SnapState,
  AlignmentGuide,
  AlignmentResult,
} from './snap-service'

// Builder Context - Provides domain name and navigation utilities
export { BuilderProvider, useBuilderContext, useBuilderContextSafe } from './builder-context'

// Style Utils - Single source of truth for element style computation
export {
  computeFrameContentStyles,
  computeTextContentStyles,
  computeImageContentStyles,
  computeVideoContentStyles,
  computeButtonContentStyles,
  computeAddToCartButtonContentStyles,
  computeCartContentStyles,
  computeResponsiveFrameStyles,
  // Responsive style utilities (CSS visual properties)
  mergeResponsiveStyles,
  getStyleValue,
  hasPropertyOverride,
  // Responsive setting utilities (behavioral configs like autoWidth, sticky, etc.)
  getSettingValue,
  hasResponsiveSettingOverrides,
  hasSettingOverride,
  hasAnyResponsiveOverrides,
  // Deprecated property aliases - use Setting versions above
  getPropertyValue,
  hasBasePropertyOverride,
  // Visibility state utilities
  getVisibilityState,
  // Unified frame sizing utilities (SINGLE SOURCE OF TRUTH)
  computeFrameSizing,
  getScrollEnabled,
} from './style-utils'
export type {
  ResponsiveFrameStyles,
  ComputeStyleOptions,
  VisibilityState,
  FrameSizingResult,
} from './style-utils'

// Slug Utils - Pathname sanitization and validation
export {
  sanitizeSlug,
  sanitizeSlugSegment,
} from './slug-utils'

// Published Data Types - Lightweight types for live website rendering
export type {
  PublishedPageInfo,
  PublishedPageData,
  PublishedCanvasData,
} from './types'

// Responsive CSS Generator - Container query CSS for published sites
export {
  generateElementResponsiveCSS,
  generatePageResponsiveCSS,
  hasAnyResponsiveStyles,
} from './responsive-css-generator'

// Component Utils - Operations for Local Components
export {
  generatePropId,
  convertFrameToComponent,
  createComponentInstance,
  applyPropValuesToElements,
  canConvertToComponent,
  detachComponentInstance,
  collectDescendantIds,
} from './component-utils'
export type {
  ConvertToComponentOptions,
  ConvertToComponentResult,
  CreateInstanceOptions,
  ExposePropertyOptions,
  DetachComponentResult,
} from './component-utils'

// Property Registry - Single source of truth for element properties
export {
  getExposableProperties,
  getPropertyById,
  getValueByPath,
} from './property-registry'
export type {
  PropertySchema,
  PropertyValueType,
  PropertyTab,
  PropertyOption,
  PropertyShowCondition,
  ElementSchema,
} from './property-registry'

// Local Components Hook - Database-backed component management
export {
  useLocalComponents,
  type CreateComponentInput,
  type UpdateComponentInput,
} from './use-local-components'

// Gradient Utils - Utility functions for gradient configuration and CSS generation
export {
  gradientConfigToCSS,
  parseGradientCSS,
  generateStopId,
  createDefaultLinearGradient,
  createDefaultRadialGradient,
  addGradientStop,
  removeGradientStop,
  updateGradientStop,
  interpolateColor,
  sortStopsByPosition,
  calculateAngleFromPoints,
  calculateGradientLinePoints,
} from './gradient-utils'

// Effect Utils - Utility functions for shadow and blur effects
export {
  generateEffectId,
  createDefaultDropShadow,
  createDefaultInnerShadow,
  createDefaultLayerBlur,
  createDefaultBackgroundBlur,
  createEmptyEffectsConfig,
  shadowToCSS,
  effectsConfigToCSS,
  addShadowEffect,
  addBlurEffect,
  updateShadowEffect,
  updateBlurEffect,
  removeShadowEffect,
  removeBlurEffect,
  toggleShadowEffect,
  toggleBlurEffect,
  hasActiveEffects,
  getEffectLabel,
} from './effect-utils'

// Element Overlay Context - Portal system for rendering overlays without clipping
export {
  ElementOverlayProvider,
  ElementOverlayPortal,
  PositionedOverlay,
  useElementOverlayContext,
} from './element-overlay-context'

// ============================================================================
// UNIFIED RENDERER ARCHITECTURE
// ============================================================================
// These modules support the unified element pattern where a single component
// handles both canvas (editor) and preview (published) rendering modes.
// RenderModeContext tells each element which mode it's in, and
// shared-element-styles provides common style computation used by both modes.
// ============================================================================

// Render Mode Context - Provides "canvas" | "preview" mode to unified elements
export { RenderModeProvider, useRenderMode, useIsCanvasMode, useIsPreviewMode } from './render-mode-context'
export type { RenderMode, RenderModeContextValue } from './render-mode-context'

// Parent Layout Context - Provides parent flex-direction and smart grid state to children
export { ParentFlexDirectionProvider, useParentFlexDirection, ParentSmartGridProvider, useParentSmartGrid } from './parent-layout-context'

// Shared Element Styles - Common position/size style computation for both modes
export { computeElementPositionStyles, computeElementSizeStyles, computeCanvasWrapperOverrides, useElementSizeStyles } from './shared-element-styles'
export type { ElementSizeStyles } from './shared-element-styles'
