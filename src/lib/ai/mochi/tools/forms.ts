/**
 * ============================================================================
 * MOCHI AI TOOLS - FORMS
 * ============================================================================
 *
 * Vercel AI SDK tool definitions for form management.
 * Supports creating forms with inline field definitions using flat string format.
 *
 * Uses "Label:TYPE" flat string format (same pattern as dataset tools) because
 * nested z.object() arrays break AI model tool calling — models send empty [{}, {}].
 *
 * SECURITY: All operations route through tRPC caller to enforce permissions
 * (FORMS_READ, FORMS_CREATE, FORMS_UPDATE, FORMS_DELETE) and feature gates
 * (forms.limit) instead of calling service functions directly.
 *
 * SOURCE OF TRUTH KEYWORDS: MochiFormTools, AIFormManagement
 * ============================================================================
 */

import { tool } from 'ai'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import type { TRPCCaller } from '@/trpc/server'
import { handleToolError } from './tool-error'
import {
  DEFAULT_FORM_STYLES,
  DEFAULT_FORM_SETTINGS,
} from '@/components/form-builder/_lib/types'
import type { FormStyles } from '@/components/form-builder/_lib/types'

// ============================================================================
// ELEMENT TYPE ALIASES — normalize AI model output to canonical types
// ============================================================================

const ELEMENT_TYPE_ALIASES: Record<string, string> = {
  text: 'text',
  string: 'text',
  firstname: 'firstName',
  first_name: 'firstName',
  lastname: 'lastName',
  last_name: 'lastName',
  email: 'email',
  phone: 'phone',
  tel: 'phone',
  number: 'number',
  integer: 'number',
  url: 'url',
  link: 'url',
  textarea: 'textarea',
  longtext: 'textarea',
  select: 'select',
  dropdown: 'select',
  multiselect: 'multiselect',
  multi_select: 'multiselect',
  radio: 'radio',
  checkbox: 'checkbox',
  checkboxgroup: 'checkboxGroup',
  checkbox_group: 'checkboxGroup',
  date: 'date',
  time: 'time',
  datetime: 'datetime',
  file: 'file',
  image: 'image',
  rating: 'rating',
  slider: 'slider',
  hidden: 'hidden',
}

/**
 * Resolves an element type string to a canonical form element type.
 * Case-insensitive and supports common aliases.
 */
function resolveElementType(raw: string): string {
  const lower = raw.toLowerCase().trim()
  return ELEMENT_TYPE_ALIASES[lower] || lower
}

/**
 * Parses a flat "Label:TYPE" or "Label:TYPE:required" string into a form element config.
 * Generates a unique ID and slug-based name for each element.
 *
 * Format: "Label:TYPE" or "Label:TYPE:required"
 * Examples: "First Name:firstName:required", "Email:email:required", "Message:textarea"
 */
function parseElementString(str: string): {
  id: string
  type: string
  name: string
  label: string
  required: boolean
  placeholder: string
  helpText: string
  validation: never[]
  logicRules: never[]
  props: Record<string, never>
  styles: Record<string, never>
} {
  const parts = str.split(':').map((s) => s.trim())
  const label = parts[0] || 'Untitled'
  const rawType = parts[1] || 'text'
  const isRequired = parts.some((p) => p.toLowerCase() === 'required')
  const resolvedType = resolveElementType(rawType)
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

  return {
    id: randomUUID(),
    type: resolvedType,
    name: slug,
    label,
    required: isRequired,
    placeholder: '',
    helpText: '',
    validation: [],
    logicRules: [],
    props: {} as Record<string, never>,
    styles: {} as Record<string, never>,
  }
}

// ============================================================================
// THEME PRESETS — predefined style sets the AI can apply by name
// ============================================================================

/**
 * Built-in theme presets that override DEFAULT_FORM_STYLES.
 * Each preset only overrides the properties that differ from the default.
 * The AI can pass a theme name and/or individual style overrides.
 */
const THEME_PRESETS: Record<string, Partial<FormStyles>> = {
  /** Dark mode — dark backgrounds with light text and blue accents */
  dark: {
    canvasColor: '#0a0a0a',
    backgroundColor: '#171717',
    labelColor: '#e5e5e5',
    inputBackgroundColor: '#262626',
    inputBorderColor: '#404040',
    inputTextColor: '#f5f5f5',
    inputPlaceholderColor: '#737373',
    inputFocusBorderColor: '#3b82f6',
    inputFocusRingColor: 'rgba(59, 130, 246, 0.2)',
    buttonBackgroundColor: '#3b82f6',
    buttonTextColor: '#ffffff',
    buttonHoverBackgroundColor: '#2563eb',
    errorColor: '#f87171',
    helpTextColor: '#a3a3a3',
  },
  /** Minimal — subtle borders, no background separation */
  minimal: {
    canvasColor: '#ffffff',
    backgroundColor: '#ffffff',
    borderRadius: '0px',
    inputBorderColor: '#d4d4d4',
    inputBorderRadius: '4px',
    inputFocusBorderColor: '#171717',
    inputFocusRingColor: 'rgba(0, 0, 0, 0.05)',
    buttonBackgroundColor: '#171717',
    buttonTextColor: '#ffffff',
    buttonBorderRadius: '4px',
    buttonHoverBackgroundColor: '#404040',
  },
  /** Rounded — extra rounded corners with soft colors */
  rounded: {
    borderRadius: '20px',
    inputBorderRadius: '12px',
    buttonBorderRadius: '12px',
    inputBorderColor: '#d4d4d8',
    inputFocusBorderColor: '#8b5cf6',
    inputFocusRingColor: 'rgba(139, 92, 246, 0.1)',
    buttonBackgroundColor: '#8b5cf6',
    buttonTextColor: '#ffffff',
    buttonHoverBackgroundColor: '#7c3aed',
  },
  /** Blue professional — corporate blue theme */
  professional: {
    canvasColor: '#f0f4f8',
    backgroundColor: '#ffffff',
    labelColor: '#1e3a5f',
    inputBorderColor: '#cbd5e1',
    inputFocusBorderColor: '#2563eb',
    inputFocusRingColor: 'rgba(37, 99, 235, 0.1)',
    buttonBackgroundColor: '#2563eb',
    buttonTextColor: '#ffffff',
    buttonHoverBackgroundColor: '#1d4ed8',
  },
  /** Warm — warm tones with orange accent */
  warm: {
    canvasColor: '#fef7ed',
    backgroundColor: '#ffffff',
    labelColor: '#431407',
    inputBorderColor: '#fed7aa',
    inputFocusBorderColor: '#f97316',
    inputFocusRingColor: 'rgba(249, 115, 22, 0.1)',
    buttonBackgroundColor: '#f97316',
    buttonTextColor: '#ffffff',
    buttonHoverBackgroundColor: '#ea580c',
    errorColor: '#dc2626',
  },
}

/**
 * Merges DEFAULT_FORM_STYLES with an optional theme preset and
 * optional individual style overrides. Individual overrides take
 * priority over theme values, which take priority over defaults.
 */
function resolveFormStyles(
  theme?: string,
  styleOverrides?: Partial<FormStyles>
): FormStyles {
  const themeStyles = theme && THEME_PRESETS[theme] ? THEME_PRESETS[theme] : {}
  return {
    ...DEFAULT_FORM_STYLES,
    ...themeStyles,
    ...styleOverrides,
  }
}

/**
 * Builds a FormSchema config JSON from parsed form elements.
 * Always appends a submit button as the last element.
 * Always applies DEFAULT_FORM_STYLES and DEFAULT_FORM_SETTINGS as the
 * baseline, with optional theme and style overrides on top.
 */
function buildFormConfig(
  formName: string,
  elements: ReturnType<typeof parseElementString>[],
  options?: {
    theme?: string
    styleOverrides?: Partial<FormStyles>
    submitButtonText?: string
  }
) {
  const styles = resolveFormStyles(options?.theme, options?.styleOverrides)
  const buttonText = options?.submitButtonText || 'Submit'

  return {
    version: 1,
    title: formName,
    elements: [
      ...elements,
      /* Always append a submit button as the last element */
      {
        id: randomUUID(),
        type: 'submit',
        name: 'submit',
        label: buttonText,
        required: false,
        validation: [],
        logicRules: [],
        props: { buttonText, buttonVariant: 'default', buttonFullWidth: true },
        styles: {},
      },
    ],
    styles,
    settings: {
      ...DEFAULT_FORM_SETTINGS,
      submitButtonText: buttonText,
    },
  }
}

/**
 * Creates all form-related tools bound to the given organization.
 * Routes through tRPC caller for permission and feature gate enforcement.
 */
export function createFormTools(organizationId: string, caller: TRPCCaller) {
  return {
    /**
     * Create a new form, optionally with fields defined using flat string format.
     * A submit button is always added automatically.
     *
     * tRPC route: caller.forms.create — enforces FORMS_CREATE permission + forms.limit feature gate.
     * The tRPC procedure auto-generates a slug if not provided, so we don't need generateUniqueSlug.
     * After creation, we update the form with the built config if elements were provided.
     */
    createForm: tool({
      description:
        'Create a new form, optionally with fields and styling. ' +
        'Each field string must be in "Label:TYPE" or "Label:TYPE:required" format. ' +
        'Valid types: text, firstName, lastName, email, phone, number, url, textarea, select, radio, checkbox, date, time, rating. ' +
        'A submit button is added automatically. ' +
        'Default styling is always applied (clean modern design). Use "theme" for quick presets or individual style properties for custom looks. ' +
        'Example: createForm(name="Contact Us", elements=["Name:text:required", "Email:email:required"], theme="dark")',
      inputSchema: z.object({
        name: z.string().describe('Form name'),
        description: z.string().optional().describe('Form description'),
        elements: z
          .array(z.string())
          .optional()
          .describe(
            'Form fields in "Label:TYPE" or "Label:TYPE:required" format. ' +
            'Example: ["First Name:firstName:required", "Email:email:required", "Message:textarea", "Rating:rating"]'
          ),
        theme: z
          .enum(['dark', 'minimal', 'rounded', 'professional', 'warm'])
          .optional()
          .describe(
            'Optional theme preset. "dark" = dark backgrounds with blue accents, ' +
            '"minimal" = clean flat look with no background separation, ' +
            '"rounded" = extra rounded corners with purple accents, ' +
            '"professional" = corporate blue theme, ' +
            '"warm" = warm tones with orange accents. ' +
            'Omit for the default clean modern theme.'
          ),
        submitButtonText: z
          .string()
          .optional()
          .describe('Custom submit button text (default: "Submit")'),
        canvasColor: z.string().optional().describe('Page/canvas background color (hex). Default: #f5f5f5'),
        backgroundColor: z.string().optional().describe('Form container background color (hex). Default: #ffffff'),
        labelColor: z.string().optional().describe('Label text color (hex). Default: #1a1a1a'),
        inputBackgroundColor: z.string().optional().describe('Input field background color (hex). Default: #ffffff'),
        inputBorderColor: z.string().optional().describe('Input field border color (hex). Default: #e5e5e5'),
        inputTextColor: z.string().optional().describe('Input field text color (hex). Default: #1a1a1a'),
        buttonBackgroundColor: z.string().optional().describe('Submit button background color (hex). Default: #1a1a1a'),
        buttonTextColor: z.string().optional().describe('Submit button text color (hex). Default: #ffffff'),
        borderRadius: z.string().optional().describe('Form container border radius (e.g., "12px", "0px"). Default: 12px'),
        inputBorderRadius: z.string().optional().describe('Input field border radius (e.g., "8px"). Default: 8px'),
        fontFamily: z.string().optional().describe('Font family (e.g., "Inter, system-ui, sans-serif"). Default: Inter'),
      }),
      execute: async (params) => {
        try {
          /** Parse flat element strings into full form element configs */
          const parsedElements = params.elements?.map(parseElementString) ?? []

          /**
           * Create the form via tRPC — the router handles slug generation
           * and feature gate checks (forms.limit) automatically.
           */
          const form = await caller.forms.create({
            organizationId,
            name: params.name,
            description: params.description,
          })

          /**
           * Collect any individual style overrides from the params.
           * These override theme values, which override defaults.
           */
          const styleOverrides: Partial<FormStyles> = {}
          if (params.canvasColor) styleOverrides.canvasColor = params.canvasColor
          if (params.backgroundColor) styleOverrides.backgroundColor = params.backgroundColor
          if (params.labelColor) styleOverrides.labelColor = params.labelColor
          if (params.inputBackgroundColor) styleOverrides.inputBackgroundColor = params.inputBackgroundColor
          if (params.inputBorderColor) styleOverrides.inputBorderColor = params.inputBorderColor
          if (params.inputTextColor) styleOverrides.inputTextColor = params.inputTextColor
          if (params.buttonBackgroundColor) styleOverrides.buttonBackgroundColor = params.buttonBackgroundColor
          if (params.buttonTextColor) styleOverrides.buttonTextColor = params.buttonTextColor
          if (params.borderRadius) styleOverrides.borderRadius = params.borderRadius
          if (params.inputBorderRadius) styleOverrides.inputBorderRadius = params.inputBorderRadius
          if (params.fontFamily) styleOverrides.fontFamily = params.fontFamily

          /**
           * Always build and save the full config with proper defaults.
           * Even forms with no elements get DEFAULT_FORM_STYLES + DEFAULT_FORM_SETTINGS
           * so the builder renders correctly.
           */
          const config = buildFormConfig(params.name, parsedElements, {
            theme: params.theme,
            styleOverrides: Object.keys(styleOverrides).length > 0 ? styleOverrides : undefined,
            submitButtonText: params.submitButtonText,
          })

          await caller.forms.update({
            organizationId,
            formId: form.id,
            config,
          })

          return {
            success: true,
            formId: form.id,
            name: form.name,
            fieldsCreated: parsedElements.map((e) => e.label),
            theme: params.theme || 'default',
            message: parsedElements.length > 0
              ? `Created form "${params.name}" with ${parsedElements.length} fields${params.theme ? ` using "${params.theme}" theme` : ''} (ID: ${form.id})`
              : `Created form "${params.name}"${params.theme ? ` using "${params.theme}" theme` : ''} (ID: ${form.id})`,
            /** Event bus: notify that a new form was created */
            _event: { feature: 'form', action: 'created', entityId: form.id },
          }
        } catch (err) {
          return handleToolError('createForm', err)
        }
      },
    }),

    /**
     * Add fields/elements to an existing form.
     * Reads the current config via tRPC getById, merges new elements before
     * the submit button, and saves via tRPC update.
     *
     * tRPC routes: caller.forms.getById (FORMS_READ) + caller.forms.update (FORMS_UPDATE)
     */
    addFormElements: tool({
      description:
        'Add fields to an existing form. Use this when the user wants to add elements to a form that already exists. ' +
        'Each field string must be in "Label:TYPE" or "Label:TYPE:required" format. ' +
        'New fields are inserted before the submit button. ' +
        'Example: ["Company:text", "Phone:phone:required", "Notes:textarea"]',
      inputSchema: z.object({
        formId: z.string().describe('The form ID to add elements to (from createForm or listForms result)'),
        elements: z
          .array(z.string())
          .describe(
            'Fields to add in "Label:TYPE" or "Label:TYPE:required" format. ' +
            'Example: ["Company:text", "Phone:phone:required", "Notes:textarea"]'
          ),
      }),
      execute: async (params) => {
        try {
          /** Get the existing form via tRPC to read its current config */
          const form = await caller.forms.getById({
            organizationId,
            formId: params.formId,
          })

          /**
           * Parse existing config, falling back to full defaults if no config exists.
           * This ensures forms always have proper styles and settings even if they
           * were created without a config (e.g., via the tRPC create endpoint alone).
           */
          const existingConfig = (form.config as Record<string, unknown>) || {
            version: 1,
            title: form.name,
            elements: [],
            styles: { ...DEFAULT_FORM_STYLES },
            settings: { ...DEFAULT_FORM_SETTINGS },
          }

          const existingElements = (existingConfig.elements as Array<Record<string, unknown>>) || []

          /** Parse new elements from flat strings */
          const newElements = params.elements.map(parseElementString)

          /**
           * Insert new elements before the submit button.
           * If there's a submit button at the end, keep it last.
           */
          const submitIndex = existingElements.findIndex(
            (el) => el.type === 'submit'
          )

          let mergedElements: Array<Record<string, unknown>>
          if (submitIndex >= 0) {
            /* Insert before submit button */
            mergedElements = [
              ...existingElements.slice(0, submitIndex),
              ...newElements,
              ...existingElements.slice(submitIndex),
            ]
          } else {
            /* No submit button — append elements and add one */
            mergedElements = [
              ...existingElements,
              ...newElements,
              {
                id: randomUUID(),
                type: 'submit',
                name: 'submit',
                label: 'Submit',
                required: false,
                validation: [],
                logicRules: [],
                props: { buttonText: 'Submit', buttonVariant: 'default', buttonFullWidth: true },
                styles: {},
              },
            ]
          }

          /** Save updated config via tRPC update */
          const updatedConfig = { ...existingConfig, elements: mergedElements }
          await caller.forms.update({
            organizationId,
            formId: params.formId,
            config: updatedConfig,
          })

          return {
            success: true,
            formId: params.formId,
            fieldsAdded: newElements.map((e) => e.label),
            totalFields: mergedElements.filter((e) => e.type !== 'submit').length,
            message: `Added ${newElements.length} fields to form "${form.name}"`,
            /** Event bus: notify builders that form elements changed */
            _event: { feature: 'form', action: 'updated', entityId: params.formId },
          }
        } catch (err) {
          return handleToolError('addFormElements', err)
        }
      },
    }),

    /**
     * List forms with optional search.
     *
     * tRPC route: caller.forms.list — enforces FORMS_READ permission.
     */
    listForms: tool({
      description: 'List forms in the organization.',
      inputSchema: z.object({
        search: z.string().optional().describe('Search by name'),
      }),
      execute: async (params) => {
        try {
          const result = await caller.forms.list({
            organizationId,
            search: params.search,
            page: 1,
            pageSize: 20,
          })
          return {
            success: true,
            forms: result.forms.map((f) => ({
              id: f.id,
              name: f.name,
              description: f.description,
            })),
            total: result.total,
            message: `Found ${result.total} forms`,
          }
        } catch (err) {
          return handleToolError('listForms', err)
        }
      },
    }),

    /**
     * Update a form's name or description.
     *
     * tRPC route: caller.forms.update — enforces FORMS_UPDATE permission.
     */
    updateForm: tool({
      description: 'Update a form name or description. Only provide the fields you want to change.',
      inputSchema: z.object({
        formId: z.string().describe('The form ID to update'),
        name: z.string().optional().describe('New name'),
        description: z.string().optional().describe('New description'),
      }),
      execute: async (params) => {
        try {
          const { formId, ...data } = params
          const form = await caller.forms.update({
            organizationId,
            formId,
            ...data,
          })
          return {
            success: true,
            formId: form.id,
            message: `Updated form "${form.name}"`,
            /** Event bus: notify builders that form metadata changed */
            _event: { feature: 'form', action: 'updated', entityId: form.id },
          }
        } catch (err) {
          return handleToolError('updateForm', err)
        }
      },
    }),

    /**
     * Update a form's visual styles (colors, spacing, typography, etc.).
     * Reads the current config, merges the new styles on top, and saves.
     * Only pass the properties you want to change — everything else is preserved.
     *
     * tRPC routes: caller.forms.getById (FORMS_READ) + caller.forms.update (FORMS_UPDATE)
     */
    updateFormStyles: tool({
      description:
        'Update the visual styling of a form. Only pass properties you want to change. ' +
        'Use "theme" to apply a full preset, or pass individual style properties. ' +
        'Individual properties override theme values. ' +
        'Example: updateFormStyles(formId="xxx", theme="dark") or updateFormStyles(formId="xxx", buttonBackgroundColor="#ef4444")',
      inputSchema: z.object({
        formId: z.string().describe('The form ID to update styles for'),
        theme: z
          .enum(['dark', 'minimal', 'rounded', 'professional', 'warm'])
          .optional()
          .describe(
            'Apply a theme preset first, then apply any individual overrides on top. ' +
            '"dark" = dark backgrounds with blue accents, ' +
            '"minimal" = clean flat look, ' +
            '"rounded" = extra rounded corners with purple accents, ' +
            '"professional" = corporate blue, ' +
            '"warm" = warm tones with orange accents.'
          ),
        canvasColor: z.string().optional().describe('Page/canvas background color (hex)'),
        backgroundColor: z.string().optional().describe('Form container background color (hex)'),
        padding: z.string().optional().describe('Form container padding (e.g., "32px", "24px")'),
        borderRadius: z.string().optional().describe('Form container border radius (e.g., "12px", "0px")'),
        maxWidth: z.string().optional().describe('Form max width (e.g., "600px", "400px", "100%")'),
        fontFamily: z.string().optional().describe('Font family (e.g., "Inter, system-ui, sans-serif")'),
        labelColor: z.string().optional().describe('Label text color (hex)'),
        labelFontSize: z.string().optional().describe('Label font size (e.g., "14px")'),
        labelFontWeight: z.string().optional().describe('Label font weight (e.g., "400", "500", "600")'),
        inputBackgroundColor: z.string().optional().describe('Input background color (hex)'),
        inputBorderColor: z.string().optional().describe('Input border color (hex)'),
        inputBorderRadius: z.string().optional().describe('Input border radius (e.g., "8px")'),
        inputTextColor: z.string().optional().describe('Input text color (hex)'),
        inputPlaceholderColor: z.string().optional().describe('Input placeholder color (hex)'),
        inputFocusBorderColor: z.string().optional().describe('Input focus border color (hex)'),
        buttonBackgroundColor: z.string().optional().describe('Submit button background color (hex)'),
        buttonTextColor: z.string().optional().describe('Submit button text color (hex)'),
        buttonBorderRadius: z.string().optional().describe('Submit button border radius (e.g., "8px")'),
        buttonHoverBackgroundColor: z.string().optional().describe('Submit button hover background color (hex)'),
        elementSpacing: z.string().optional().describe('Spacing between elements (e.g., "24px", "16px")'),
        errorColor: z.string().optional().describe('Error message color (hex)'),
        helpTextColor: z.string().optional().describe('Help text color (hex)'),
      }),
      execute: async (params) => {
        try {
          const { formId, theme, ...styleParams } = params

          /** Get the existing form to read its current config */
          const form = await caller.forms.getById({
            organizationId,
            formId,
          })

          const existingConfig = (form.config as Record<string, unknown>) || {
            version: 1,
            title: form.name,
            elements: [],
            styles: { ...DEFAULT_FORM_STYLES },
            settings: { ...DEFAULT_FORM_SETTINGS },
          }

          /**
           * Start with existing styles (or defaults), layer theme on top,
           * then layer individual overrides on top of that.
           */
          const existingStyles = (existingConfig.styles as Record<string, unknown>) || {}
          const themeStyles = theme && THEME_PRESETS[theme] ? THEME_PRESETS[theme] : {}

          /** Collect only the non-undefined style params as overrides */
          const individualOverrides: Record<string, string> = {}
          for (const [key, val] of Object.entries(styleParams)) {
            if (val !== undefined) individualOverrides[key] = val
          }

          const mergedStyles = {
            ...DEFAULT_FORM_STYLES,
            ...existingStyles,
            ...themeStyles,
            ...individualOverrides,
          }

          /** Save updated config with merged styles */
          const updatedConfig = { ...existingConfig, styles: mergedStyles }
          await caller.forms.update({
            organizationId,
            formId,
            config: updatedConfig,
          })

          const changesApplied = [
            theme ? `theme "${theme}"` : null,
            ...Object.keys(individualOverrides),
          ].filter(Boolean)

          return {
            success: true,
            formId,
            stylesUpdated: changesApplied,
            message: `Updated form "${form.name}" styles: ${changesApplied.join(', ')}`,
            _event: { feature: 'form', action: 'updated', entityId: formId },
          }
        } catch (err) {
          return handleToolError('updateFormStyles', err)
        }
      },
    }),

    /**
     * Delete a form permanently — ALWAYS confirm with askUser first.
     *
     * tRPC route: caller.forms.delete — enforces FORMS_DELETE permission
     * and decrements forms.limit feature gate usage.
     */
    deleteForm: tool({
      description:
        'Permanently delete a form and all its submissions. ' +
        'IMPORTANT: Always use askUser to confirm with the user before calling this tool.',
      inputSchema: z.object({
        formId: z.string().describe('The form ID to delete'),
      }),
      execute: async (params) => {
        try {
          await caller.forms.delete({
            organizationId,
            formId: params.formId,
          })
          return {
            success: true,
            formId: params.formId,
            message: 'Deleted form',
            /** Event bus: notify that form was deleted */
            _event: { feature: 'form', action: 'deleted', entityId: params.formId },
          }
        } catch (err) {
          return handleToolError('deleteForm', err)
        }
      },
    }),
  }
}
