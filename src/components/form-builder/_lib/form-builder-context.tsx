/**
 * ============================================================================
 * FORM BUILDER CONTEXT
 * ============================================================================
 *
 * Central state management for the form builder.
 * Uses React Context + useReducer for predictable state updates.
 *
 * ARCHITECTURE:
 * - FormBuilderProvider: Wraps the entire form builder
 * - useFormBuilder: Hook to access state and actions
 * - Reducer pattern for complex state updates
 * - Built-in undo/redo support via history
 *
 * STATE STRUCTURE:
 * - schema: The form schema being edited
 * - selection: Currently selected element(s)
 * - drag: Drag and drop state
 * - history: Undo/redo history stack
 * - UI state: Active tabs, preview mode, etc.
 */

'use client'

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  ReactNode,
} from 'react'
import { v4 as uuid } from 'uuid'
import { arrayMove } from '@dnd-kit/sortable'
import type {
  FormSchema,
  FormElement,
  FormStyles,
  FormSettings,
  FormBuilderState,
  FormElementType,
  ElementStyles,
  ValidationRule,
  LogicRule,
  SelectOption,
  HistoryEntry,
  ViewportMode,
} from './types'
import {
  DEFAULT_FORM_SCHEMA,
  DEFAULT_FORM_STYLES,
  DEFAULT_FORM_SETTINGS,
} from './types'

// ============================================================================
// ACTION TYPES
// ============================================================================

type FormBuilderAction =
  // Element actions
  | { type: 'ADD_ELEMENT'; payload: { element: FormElement; index?: number } }
  | { type: 'UPDATE_ELEMENT'; payload: { id: string; updates: Partial<FormElement> } }
  | { type: 'DELETE_ELEMENT'; payload: { id: string } }
  | { type: 'DUPLICATE_ELEMENT'; payload: { id: string } }
  | { type: 'REORDER_ELEMENTS'; payload: { fromIndex: number; toIndex: number } }
  | { type: 'MOVE_ELEMENT'; payload: { id: string; toIndex: number } }
  // Selection actions
  | { type: 'SELECT_ELEMENT'; payload: { id: string | null } }
  | { type: 'SELECT_MULTIPLE'; payload: { ids: string[] } }
  | { type: 'CLEAR_SELECTION' }
  // Style actions
  | { type: 'UPDATE_FORM_STYLES'; payload: Partial<FormStyles> }
  | { type: 'UPDATE_ELEMENT_STYLES'; payload: { id: string; styles: Partial<ElementStyles> } }
  // Settings actions
  | { type: 'UPDATE_SETTINGS'; payload: Partial<FormSettings> }
  // Schema actions
  | { type: 'SET_SCHEMA'; payload: FormSchema }
  | { type: 'RESET_SCHEMA' }
  // Drag actions
  | { type: 'START_DRAG'; payload: { type: FormElementType | null; elementId: string | null } }
  | { type: 'UPDATE_DROP_INDEX'; payload: { index: number | null } }
  | { type: 'END_DRAG' }
  // History actions
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SAVE_HISTORY'; payload: { description: string } }
  // UI actions
  | { type: 'SET_SIDEBAR_TAB'; payload: 'elements' | 'styles' | 'settings' }
  | { type: 'SET_PROPERTIES_TAB'; payload: 'properties' | 'styles' | 'logic' }
  | { type: 'TOGGLE_PREVIEW_MODE' }
  | { type: 'SET_DIRTY'; payload: boolean }
  // Title action
  | { type: 'SET_TITLE'; payload: string }
  // Viewport action
  | { type: 'SET_VIEWPORT_MODE'; payload: ViewportMode }
  // Auto-save action
  | { type: 'SET_AUTO_SAVE'; payload: boolean }

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState: FormBuilderState = {
  schema: DEFAULT_FORM_SCHEMA,
  selection: {
    selectedElementId: null,
    selectedElementIds: [],
  },
  drag: {
    isDragging: false,
    draggedType: null,
    draggedElementId: null,
    dropIndex: null,
  },
  history: [],
  historyIndex: -1,
  isDirty: false,
  activeSidebarTab: 'elements',
  activePropertiesTab: 'properties',
  isPreviewMode: false,
  viewportMode: 'desktop',
  autoSaveEnabled: true,
}

// ============================================================================
// REDUCER
// ============================================================================

/**
 * Main reducer for form builder state.
 * Handles all state updates in a predictable way.
 */
function formBuilderReducer(
  state: FormBuilderState,
  action: FormBuilderAction
): FormBuilderState {
  switch (action.type) {
    // ========================================
    // ELEMENT ACTIONS
    // ========================================

    case 'ADD_ELEMENT': {
      const { element, index } = action.payload
      const newElements = [...state.schema.elements]

      // Insert at specific index or append to end
      if (index !== undefined && index >= 0) {
        newElements.splice(index, 0, element)
      } else {
        newElements.push(element)
      }

      return {
        ...state,
        schema: { ...state.schema, elements: newElements },
        selection: { selectedElementId: element.id, selectedElementIds: [element.id] },
        isDirty: true,
      }
    }

    case 'UPDATE_ELEMENT': {
      const { id, updates } = action.payload
      const newElements = state.schema.elements.map((el) =>
        el.id === id ? { ...el, ...updates } : el
      )

      return {
        ...state,
        schema: { ...state.schema, elements: newElements },
        isDirty: true,
      }
    }

    case 'DELETE_ELEMENT': {
      const { id } = action.payload
      const newElements = state.schema.elements.filter((el) => el.id !== id)

      // Clear selection if deleted element was selected
      const newSelection =
        state.selection.selectedElementId === id
          ? { selectedElementId: null, selectedElementIds: [] }
          : {
              ...state.selection,
              selectedElementIds: state.selection.selectedElementIds.filter(
                (eid) => eid !== id
              ),
            }

      return {
        ...state,
        schema: { ...state.schema, elements: newElements },
        selection: newSelection,
        isDirty: true,
      }
    }

    case 'DUPLICATE_ELEMENT': {
      const { id } = action.payload
      const sourceIndex = state.schema.elements.findIndex((el) => el.id === id)

      if (sourceIndex === -1) return state

      const sourceElement = state.schema.elements[sourceIndex]
      const newElement: FormElement = {
        ...sourceElement,
        id: uuid(),
        name: `${sourceElement.name}_copy`,
        label: `${sourceElement.label} (Copy)`,
      }

      const newElements = [...state.schema.elements]
      newElements.splice(sourceIndex + 1, 0, newElement)

      return {
        ...state,
        schema: { ...state.schema, elements: newElements },
        selection: { selectedElementId: newElement.id, selectedElementIds: [newElement.id] },
        isDirty: true,
      }
    }

    case 'REORDER_ELEMENTS': {
      const { fromIndex, toIndex } = action.payload

      // Use @dnd-kit's arrayMove for proper sorting behavior
      const newElements = arrayMove(state.schema.elements, fromIndex, toIndex)

      return {
        ...state,
        schema: { ...state.schema, elements: newElements },
        isDirty: true,
      }
    }

    case 'MOVE_ELEMENT': {
      const { id, toIndex } = action.payload
      const fromIndex = state.schema.elements.findIndex((el) => el.id === id)

      if (fromIndex === -1) return state

      // Use @dnd-kit's arrayMove for proper sorting behavior
      const newElements = arrayMove(state.schema.elements, fromIndex, toIndex)

      return {
        ...state,
        schema: { ...state.schema, elements: newElements },
        isDirty: true,
      }
    }

    // ========================================
    // SELECTION ACTIONS
    // ========================================

    case 'SELECT_ELEMENT': {
      const { id } = action.payload
      return {
        ...state,
        selection: {
          selectedElementId: id,
          selectedElementIds: id ? [id] : [],
        },
      }
    }

    case 'SELECT_MULTIPLE': {
      const { ids } = action.payload
      return {
        ...state,
        selection: {
          selectedElementId: ids[0] || null,
          selectedElementIds: ids,
        },
      }
    }

    case 'CLEAR_SELECTION': {
      return {
        ...state,
        selection: {
          selectedElementId: null,
          selectedElementIds: [],
        },
      }
    }

    // ========================================
    // STYLE ACTIONS
    // ========================================

    case 'UPDATE_FORM_STYLES': {
      return {
        ...state,
        schema: {
          ...state.schema,
          styles: { ...state.schema.styles, ...action.payload },
        },
        isDirty: true,
      }
    }

    case 'UPDATE_ELEMENT_STYLES': {
      const { id, styles } = action.payload
      const newElements = state.schema.elements.map((el) =>
        el.id === id ? { ...el, styles: { ...el.styles, ...styles } } : el
      )

      return {
        ...state,
        schema: { ...state.schema, elements: newElements },
        isDirty: true,
      }
    }

    // ========================================
    // SETTINGS ACTIONS
    // ========================================

    case 'UPDATE_SETTINGS': {
      return {
        ...state,
        schema: {
          ...state.schema,
          settings: { ...state.schema.settings, ...action.payload },
        },
        isDirty: true,
      }
    }

    // ========================================
    // SCHEMA ACTIONS
    // ========================================

    case 'SET_SCHEMA': {
      return {
        ...state,
        schema: action.payload,
        selection: { selectedElementId: null, selectedElementIds: [] },
        isDirty: false,
      }
    }

    case 'RESET_SCHEMA': {
      return {
        ...state,
        schema: DEFAULT_FORM_SCHEMA,
        selection: { selectedElementId: null, selectedElementIds: [] },
        isDirty: false,
      }
    }

    // ========================================
    // DRAG ACTIONS
    // ========================================

    case 'START_DRAG': {
      return {
        ...state,
        drag: {
          isDragging: true,
          draggedType: action.payload.type,
          draggedElementId: action.payload.elementId,
          dropIndex: null,
        },
      }
    }

    case 'UPDATE_DROP_INDEX': {
      return {
        ...state,
        drag: { ...state.drag, dropIndex: action.payload.index },
      }
    }

    case 'END_DRAG': {
      return {
        ...state,
        drag: {
          isDragging: false,
          draggedType: null,
          draggedElementId: null,
          dropIndex: null,
        },
      }
    }

    // ========================================
    // HISTORY ACTIONS
    // ========================================

    /**
     * SAVE_HISTORY: Saves the CURRENT state to history AFTER an action.
     *
     * UNDO/REDO MODEL:
     * - history[historyIndex] = current state (after latest action)
     * - On action: truncate redo history, push new state, increment index
     * - Undo: decrement index, restore history[newIndex]
     * - Redo: increment index, restore history[newIndex]
     *
     * IMPORTANT: This must be called AFTER the action has modified the schema,
     * not before. The provider initializes history with the initial schema.
     */
    case 'SAVE_HISTORY': {
      const newEntry: HistoryEntry = {
        schema: JSON.parse(JSON.stringify(state.schema)),
        timestamp: Date.now(),
        description: action.payload.description,
      }

      // Truncate any redo history when new action is taken
      const newHistory = state.history.slice(0, state.historyIndex + 1)
      newHistory.push(newEntry)

      // Limit history to 50 entries (remove oldest if exceeding)
      if (newHistory.length > 50) {
        newHistory.shift()
        // Adjust index since we removed from the start
        return {
          ...state,
          history: newHistory,
          historyIndex: newHistory.length - 1,
        }
      }

      return {
        ...state,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      }
    }

    /**
     * UNDO: Go back to the previous state in history.
     * Only possible when historyIndex > 0 (there's a previous state to restore).
     */
    case 'UNDO': {
      // Can only undo if we're not at the initial state
      if (state.historyIndex <= 0) return state

      const newIndex = state.historyIndex - 1
      const previousState = state.history[newIndex]
      if (!previousState) return state

      return {
        ...state,
        schema: JSON.parse(JSON.stringify(previousState.schema)),
        historyIndex: newIndex,
        isDirty: true,
      }
    }

    /**
     * REDO: Go forward to the next state in history.
     * Only possible when historyIndex < history.length - 1 (there's a next state).
     */
    case 'REDO': {
      if (state.historyIndex >= state.history.length - 1) return state

      const newIndex = state.historyIndex + 1
      const nextState = state.history[newIndex]
      if (!nextState) return state

      return {
        ...state,
        schema: JSON.parse(JSON.stringify(nextState.schema)),
        historyIndex: newIndex,
        isDirty: true,
      }
    }

    // ========================================
    // UI ACTIONS
    // ========================================

    case 'SET_SIDEBAR_TAB': {
      return { ...state, activeSidebarTab: action.payload }
    }

    case 'SET_PROPERTIES_TAB': {
      return { ...state, activePropertiesTab: action.payload }
    }

    case 'TOGGLE_PREVIEW_MODE': {
      return {
        ...state,
        isPreviewMode: !state.isPreviewMode,
        selection: { selectedElementId: null, selectedElementIds: [] },
      }
    }

    case 'SET_DIRTY': {
      return { ...state, isDirty: action.payload }
    }

    // ========================================
    // TITLE ACTION
    // ========================================

    case 'SET_TITLE': {
      return {
        ...state,
        schema: { ...state.schema, title: action.payload },
        isDirty: true,
      }
    }

    // ========================================
    // VIEWPORT ACTION
    // ========================================

    case 'SET_VIEWPORT_MODE': {
      return { ...state, viewportMode: action.payload }
    }

    // ========================================
    // AUTO-SAVE ACTION
    // ========================================

    case 'SET_AUTO_SAVE': {
      return { ...state, autoSaveEnabled: action.payload }
    }

    default:
      return state
  }
}

// ============================================================================
// CONTEXT
// ============================================================================

interface FormBuilderContextValue {
  state: FormBuilderState
  dispatch: React.Dispatch<FormBuilderAction>
  // Convenience getters
  selectedElement: FormElement | null
  canUndo: boolean
  canRedo: boolean
  // Action helpers (wrapped dispatch calls for cleaner API)
  actions: {
    addElement: (element: FormElement, index?: number) => void
    updateElement: (id: string, updates: Partial<FormElement>) => void
    deleteElement: (id: string) => void
    duplicateElement: (id: string) => void
    reorderElements: (fromIndex: number, toIndex: number) => void
    moveElement: (id: string, toIndex: number) => void
    selectElement: (id: string | null) => void
    selectMultiple: (ids: string[]) => void
    clearSelection: () => void
    updateFormStyles: (styles: Partial<FormStyles>) => void
    updateElementStyles: (id: string, styles: Partial<ElementStyles>) => void
    updateSettings: (settings: Partial<FormSettings>) => void
    setSchema: (schema: FormSchema) => void
    resetSchema: () => void
    startDrag: (type: FormElementType | null, elementId: string | null) => void
    updateDropIndex: (index: number | null) => void
    endDrag: () => void
    undo: () => void
    redo: () => void
    saveHistory: (description: string) => void
    setSidebarTab: (tab: 'elements' | 'styles' | 'settings') => void
    setPropertiesTab: (tab: 'properties' | 'styles' | 'logic') => void
    togglePreviewMode: () => void
    setDirty: (dirty: boolean) => void
    setTitle: (title: string) => void
    setViewportMode: (mode: ViewportMode) => void
    setAutoSave: (enabled: boolean) => void
  }
}

const FormBuilderContext = createContext<FormBuilderContextValue | null>(null)

// ============================================================================
// PROVIDER
// ============================================================================

interface FormBuilderProviderProps {
  children: ReactNode
  initialSchema?: FormSchema
}

/**
 * Provider component that wraps the form builder.
 * Manages all state and provides actions to children.
 *
 * UNDO/REDO INITIALIZATION:
 * History is initialized with the initial schema at index 0.
 * This enables undo from the very first action the user takes.
 */
export function FormBuilderProvider({
  children,
  initialSchema,
}: FormBuilderProviderProps) {
  // Determine the schema to use
  const schemaToUse = initialSchema || DEFAULT_FORM_SCHEMA

  // Initialize state with history containing the initial schema
  // This allows undo to work from the first action
  const [state, dispatch] = useReducer(formBuilderReducer, {
    ...initialState,
    schema: schemaToUse,
    // Initialize history with the starting state so undo works after first action
    history: [
      {
        schema: JSON.parse(JSON.stringify(schemaToUse)),
        timestamp: Date.now(),
        description: 'Initial state',
      },
    ],
    historyIndex: 0,
  })

  // ========================================
  // COMPUTED VALUES
  // ========================================

  const selectedElement = useMemo(() => {
    if (!state.selection.selectedElementId) return null
    return (
      state.schema.elements.find(
        (el) => el.id === state.selection.selectedElementId
      ) || null
    )
  }, [state.schema.elements, state.selection.selectedElementId])

  const canUndo = state.historyIndex > 0
  const canRedo = state.historyIndex < state.history.length - 1

  // ========================================
  // ACTION HELPERS
  // ========================================

  const actions = useMemo(
    () => ({
      addElement: (element: FormElement, index?: number) =>
        dispatch({ type: 'ADD_ELEMENT', payload: { element, index } }),

      updateElement: (id: string, updates: Partial<FormElement>) =>
        dispatch({ type: 'UPDATE_ELEMENT', payload: { id, updates } }),

      deleteElement: (id: string) =>
        dispatch({ type: 'DELETE_ELEMENT', payload: { id } }),

      duplicateElement: (id: string) =>
        dispatch({ type: 'DUPLICATE_ELEMENT', payload: { id } }),

      reorderElements: (fromIndex: number, toIndex: number) =>
        dispatch({ type: 'REORDER_ELEMENTS', payload: { fromIndex, toIndex } }),

      moveElement: (id: string, toIndex: number) =>
        dispatch({ type: 'MOVE_ELEMENT', payload: { id, toIndex } }),

      selectElement: (id: string | null) =>
        dispatch({ type: 'SELECT_ELEMENT', payload: { id } }),

      selectMultiple: (ids: string[]) =>
        dispatch({ type: 'SELECT_MULTIPLE', payload: { ids } }),

      clearSelection: () => dispatch({ type: 'CLEAR_SELECTION' }),

      updateFormStyles: (styles: Partial<FormStyles>) =>
        dispatch({ type: 'UPDATE_FORM_STYLES', payload: styles }),

      updateElementStyles: (id: string, styles: Partial<ElementStyles>) =>
        dispatch({ type: 'UPDATE_ELEMENT_STYLES', payload: { id, styles } }),

      updateSettings: (settings: Partial<FormSettings>) =>
        dispatch({ type: 'UPDATE_SETTINGS', payload: settings }),

      setSchema: (schema: FormSchema) =>
        dispatch({ type: 'SET_SCHEMA', payload: schema }),

      resetSchema: () => dispatch({ type: 'RESET_SCHEMA' }),

      startDrag: (type: FormElementType | null, elementId: string | null) =>
        dispatch({ type: 'START_DRAG', payload: { type, elementId } }),

      updateDropIndex: (index: number | null) =>
        dispatch({ type: 'UPDATE_DROP_INDEX', payload: { index } }),

      endDrag: () => dispatch({ type: 'END_DRAG' }),

      undo: () => dispatch({ type: 'UNDO' }),

      redo: () => dispatch({ type: 'REDO' }),

      saveHistory: (description: string) =>
        dispatch({ type: 'SAVE_HISTORY', payload: { description } }),

      setSidebarTab: (tab: 'elements' | 'styles' | 'settings') =>
        dispatch({ type: 'SET_SIDEBAR_TAB', payload: tab }),

      setPropertiesTab: (tab: 'properties' | 'styles' | 'logic') =>
        dispatch({ type: 'SET_PROPERTIES_TAB', payload: tab }),

      togglePreviewMode: () => dispatch({ type: 'TOGGLE_PREVIEW_MODE' }),

      setDirty: (dirty: boolean) =>
        dispatch({ type: 'SET_DIRTY', payload: dirty }),

      setTitle: (title: string) =>
        dispatch({ type: 'SET_TITLE', payload: title }),

      setViewportMode: (mode: ViewportMode) =>
        dispatch({ type: 'SET_VIEWPORT_MODE', payload: mode }),

      setAutoSave: (enabled: boolean) =>
        dispatch({ type: 'SET_AUTO_SAVE', payload: enabled }),
    }),
    []
  )

  // ========================================
  // CONTEXT VALUE
  // ========================================

  const value = useMemo(
    () => ({
      state,
      dispatch,
      selectedElement,
      canUndo,
      canRedo,
      actions,
    }),
    [state, selectedElement, canUndo, canRedo, actions]
  )

  return (
    <FormBuilderContext.Provider value={value}>
      {children}
    </FormBuilderContext.Provider>
  )
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook to access form builder context.
 * Must be used within FormBuilderProvider.
 */
export function useFormBuilder() {
  const context = useContext(FormBuilderContext)

  if (!context) {
    throw new Error('useFormBuilder must be used within FormBuilderProvider')
  }

  return context
}

// ============================================================================
// ELEMENT FACTORY
// ============================================================================

/**
 * Creates a new form element with default values based on type.
 * Use this when adding new elements from the sidebar.
 */
export function createFormElement(
  type: FormElementType,
  overrides?: Partial<FormElement>
): FormElement {
  const id = uuid()
  const baseName = type.replace(/([A-Z])/g, '_$1').toLowerCase()

  // Base element structure
  const baseElement: FormElement = {
    id,
    type,
    name: `${baseName}_${id.slice(0, 8)}`,
    label: getDefaultLabel(type),
    placeholder: getDefaultPlaceholder(type),
    helpText: '',
    defaultValue: undefined,
    required: false,
    validation: [],
    logicRules: [],
    options: type === 'select' || type === 'radio' || type === 'checkboxGroup' || type === 'multiselect'
      ? getDefaultOptions()
      : undefined,
    props: getDefaultProps(type),
    styles: {},
  }

  return { ...baseElement, ...overrides }
}

/**
 * Get default label based on element type.
 */
function getDefaultLabel(type: FormElementType): string {
  const labels: Record<FormElementType, string> = {
    text: 'Text Field',
    firstName: 'First Name',
    lastName: 'Last Name',
    email: 'Email Address',
    phone: 'Phone Number',
    number: 'Number',
    password: 'Password',
    url: 'Website URL',
    textarea: 'Message',
    // Address elements
    address: 'Street Address',
    address2: 'Address Line 2',
    city: 'City',
    state: 'State/Province',
    zipCode: 'ZIP/Postal Code',
    country: 'Country',
    // Selection elements
    select: 'Select Option',
    multiselect: 'Select Multiple',
    radio: 'Choose One',
    checkbox: 'I agree',
    checkboxGroup: 'Select All That Apply',
    date: 'Date',
    time: 'Time',
    datetime: 'Date & Time',
    file: 'Upload File',
    image: 'Upload Image',
    heading: 'Section Title',
    paragraph: 'Enter your description text here.',
    divider: '',
    spacer: '',
    hidden: 'Hidden Field',
    rating: 'Rating',
    slider: 'Range',
    signature: 'Signature',
    submit: 'Submit',
  }
  return labels[type] || 'Field'
}

/**
 * Get default placeholder based on element type.
 */
function getDefaultPlaceholder(type: FormElementType): string {
  const placeholders: Record<FormElementType, string> = {
    text: 'Enter text...',
    firstName: 'Enter first name',
    lastName: 'Enter last name',
    email: 'you@example.com',
    phone: '+1 (555) 000-0000',
    number: '0',
    password: '••••••••',
    url: 'https://example.com',
    textarea: 'Type your message here...',
    // Address elements
    address: '123 Main Street',
    address2: 'Apt, suite, unit, etc. (optional)',
    city: 'City',
    state: 'State/Province',
    zipCode: '12345',
    country: 'Country',
    // Selection elements
    select: 'Choose an option',
    multiselect: 'Select options',
    radio: '',
    checkbox: '',
    checkboxGroup: '',
    date: 'Select date',
    time: 'Select time',
    datetime: 'Select date and time',
    file: 'Click to upload or drag and drop',
    image: 'Click to upload image',
    heading: '',
    paragraph: '',
    divider: '',
    spacer: '',
    hidden: '',
    rating: '',
    slider: '',
    signature: 'Sign here',
    submit: '',
  }
  return placeholders[type] || ''
}

/**
 * Get default options for select/radio/checkbox elements.
 */
function getDefaultOptions(): SelectOption[] {
  return [
    { id: uuid(), label: 'Option 1', value: 'option_1', isDefault: false },
    { id: uuid(), label: 'Option 2', value: 'option_2', isDefault: false },
    { id: uuid(), label: 'Option 3', value: 'option_3', isDefault: false },
  ]
}

/**
 * Get default props based on element type.
 * Includes autocomplete attributes for browser autofill support.
 *
 * AUTOCOMPLETE VALUES (standard HTML autocomplete attribute values):
 * - 'name' for full name
 * - 'given-name' for first name
 * - 'family-name' for last name
 * - 'email' for email addresses
 * - 'tel' for phone numbers
 * - 'street-address' for street address
 * - 'address-line2' for apt/suite/unit
 * - 'address-level2' for city
 * - 'address-level1' for state/province
 * - 'postal-code' for ZIP/postal code
 * - 'country-name' for country
 * - 'organization' for company name
 * - 'url' for website URLs
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete
 */
function getDefaultProps(type: FormElementType): FormElement['props'] {
  switch (type) {
    // Text input types with autocomplete support
    case 'text':
      return { autocomplete: 'name' }
    case 'firstName':
      return { autocomplete: 'given-name' }
    case 'lastName':
      return { autocomplete: 'family-name' }
    case 'email':
      return { autocomplete: 'email' }
    case 'phone':
      return { autocomplete: 'tel' }
    case 'url':
      return { autocomplete: 'url' }
    case 'password':
      return { autocomplete: 'current-password' }

    // Address elements with specific autocomplete values
    case 'address':
      return { autocomplete: 'street-address' }
    case 'address2':
      return { autocomplete: 'address-line2' }
    case 'city':
      return { autocomplete: 'address-level2' }
    case 'state':
      return { autocomplete: 'address-level1' }
    case 'zipCode':
      return { autocomplete: 'postal-code' }
    case 'country':
      return { autocomplete: 'country-name' }

    // Other element types
    case 'textarea':
      return { rows: 4, resize: 'vertical' }
    case 'number':
      return { min: 0, max: 100, step: 1 }
    case 'file':
      return { accept: '*/*', maxSize: 10 * 1024 * 1024, multiple: false }
    case 'image':
      return { accept: 'image/*', maxSize: 5 * 1024 * 1024, multiple: false }
    case 'heading':
      return { headingLevel: 'h2' }
    case 'spacer':
      return { height: '24px' }
    case 'rating':
      return { maxRating: 5 }
    case 'slider':
      return { sliderMin: 0, sliderMax: 100, sliderStep: 1, showValue: true }
    case 'submit':
      return { buttonText: 'Submit', buttonVariant: 'default', buttonFullWidth: true }
    default:
      return {}
  }
}
