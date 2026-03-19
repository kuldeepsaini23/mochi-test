import { CustomDataFieldType } from '@/generated/prisma'

export interface FieldTypeConfig {
  type: CustomDataFieldType
  label: string
  description: string
  icon: string // lucide icon name
  hasOptions: boolean // for select/radio/checkbox
  hasValidation: boolean
  defaultValidation?: Record<string, unknown>
}

export const FIELD_TYPES: Record<CustomDataFieldType, FieldTypeConfig> = {
  TEXT: {
    type: 'TEXT',
    label: 'Text',
    description: 'Single line text input',
    icon: 'Type',
    hasOptions: false,
    hasValidation: true,
  },
  TEXTAREA: {
    type: 'TEXTAREA',
    label: 'Long Text',
    description: 'Multi-line text area',
    icon: 'AlignLeft',
    hasOptions: false,
    hasValidation: true,
  },
  NUMBER: {
    type: 'NUMBER',
    label: 'Number',
    description: 'Numeric input',
    icon: 'Hash',
    hasOptions: false,
    hasValidation: true,
    defaultValidation: { min: null, max: null },
  },
  CURRENCY: {
    type: 'CURRENCY',
    label: 'Currency',
    description: 'Dollar amount input',
    icon: 'DollarSign',
    hasOptions: false,
    hasValidation: true,
  },
  EMAIL: {
    type: 'EMAIL',
    label: 'Email',
    description: 'Email address input',
    icon: 'Mail',
    hasOptions: false,
    hasValidation: true,
  },
  PHONE: {
    type: 'PHONE',
    label: 'Phone',
    description: 'Phone number input',
    icon: 'Phone',
    hasOptions: false,
    hasValidation: true,
  },
  URL: {
    type: 'URL',
    label: 'URL',
    description: 'Website URL input',
    icon: 'Link',
    hasOptions: false,
    hasValidation: true,
  },
  DATE: {
    type: 'DATE',
    label: 'Date',
    description: 'Date picker',
    icon: 'Calendar',
    hasOptions: false,
    hasValidation: true,
  },
  DATETIME: {
    type: 'DATETIME',
    label: 'Date & Time',
    description: 'Date and time picker',
    icon: 'Clock',
    hasOptions: false,
    hasValidation: true,
  },
  CHECKBOX: {
    type: 'CHECKBOX',
    label: 'Checkbox',
    description: 'Single checkbox (yes/no)',
    icon: 'CheckSquare',
    hasOptions: false,
    hasValidation: false,
  },
  RADIO: {
    type: 'RADIO',
    label: 'Radio',
    description: 'Single choice from options',
    icon: 'Circle',
    hasOptions: true,
    hasValidation: false,
  },
  SELECT: {
    type: 'SELECT',
    label: 'Dropdown',
    description: 'Single select dropdown',
    icon: 'ChevronDown',
    hasOptions: true,
    hasValidation: false,
  },
  MULTISELECT: {
    type: 'MULTISELECT',
    label: 'Multi-Select',
    description: 'Multiple choice dropdown',
    icon: 'ListChecks',
    hasOptions: true,
    hasValidation: false,
  },
}

export const FIELD_TYPE_LIST = Object.values(FIELD_TYPES)
