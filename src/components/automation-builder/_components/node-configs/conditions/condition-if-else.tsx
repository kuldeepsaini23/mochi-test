/**
 * ============================================================================
 * IF/ELSE CONDITION CONFIG
 * ============================================================================
 *
 * Configuration form for the "If/Else" condition node.
 * Allows defining conditions that determine workflow branching.
 *
 * SOURCE OF TRUTH: IfElseConditionConfig, ConditionRule
 */

'use client'

import { useState } from 'react'
import { PlusIcon, TrashIcon } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  IfElseConditionConfig as IfElseConfig,
  ConditionRule,
  ConditionOperator,
} from '../../../_lib/types'
import type { FieldErrors } from '../../../_lib/config-schemas'

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Available fields for conditions.
 */
const CONDITION_FIELDS = [
  { value: 'lead.email', label: 'Lead Email' },
  { value: 'lead.name', label: 'Lead Name' },
  { value: 'lead.phone', label: 'Lead Phone' },
  { value: 'lead.status', label: 'Lead Status' },
  { value: 'lead.company', label: 'Lead Company' },
  { value: 'lead.source', label: 'Lead Source' },
  { value: 'formData.email', label: 'Form: Email' },
  { value: 'formData.name', label: 'Form: Name' },
  { value: 'tag.name', label: 'Tag Name' },
]

/**
 * Available operators for conditions.
 */
const OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Does not equal' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Does not contain' },
  { value: 'starts_with', label: 'Starts with' },
  { value: 'ends_with', label: 'Ends with' },
  { value: 'is_empty', label: 'Is empty' },
  { value: 'is_not_empty', label: 'Is not empty' },
  { value: 'greater_than', label: 'Greater than' },
  { value: 'less_than', label: 'Less than' },
]

// ============================================================================
// TYPES
// ============================================================================

interface ConditionIfElseConfigProps {
  config: IfElseConfig
  onChange: (config: IfElseConfig) => void
  /** Field-level validation errors from the properties drawer */
  errors?: FieldErrors
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ConditionIfElseConfig({
  config,
  onChange,
  errors,
}: ConditionIfElseConfigProps) {
  /**
   * Generate a unique ID for new rules.
   */
  const generateRuleId = () => `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  /**
   * Add a new condition rule.
   */
  const handleAddRule = () => {
    const newRule: ConditionRule = {
      id: generateRuleId(),
      field: '',
      fieldLabel: '',
      operator: 'equals',
      value: '',
    }
    onChange({
      ...config,
      conditions: [...config.conditions, newRule],
    })
  }

  /**
   * Update a condition rule.
   */
  const handleUpdateRule = (ruleId: string, updates: Partial<ConditionRule>) => {
    onChange({
      ...config,
      conditions: config.conditions.map((rule) =>
        rule.id === ruleId ? { ...rule, ...updates } : rule
      ),
    })
  }

  /**
   * Remove a condition rule.
   */
  const handleRemoveRule = (ruleId: string) => {
    onChange({
      ...config,
      conditions: config.conditions.filter((rule) => rule.id !== ruleId),
    })
  }

  /**
   * Handle field selection for a rule.
   */
  const handleFieldChange = (ruleId: string, field: string) => {
    const fieldInfo = CONDITION_FIELDS.find((f) => f.value === field)
    handleUpdateRule(ruleId, {
      field,
      fieldLabel: fieldInfo?.label ?? field,
    })
  }

  /**
   * Check if operator requires a value input.
   */
  const operatorRequiresValue = (operator: ConditionOperator) => {
    return !['is_empty', 'is_not_empty'].includes(operator)
  }

  return (
    <div className="space-y-4">
      {/* Logical operator selection */}
      {config.conditions.length > 1 && (
        <div className="space-y-2">
          <Label>Match</Label>
          <RadioGroup
            value={config.logicalOperator}
            onValueChange={(value) =>
              onChange({ ...config, logicalOperator: value as 'and' | 'or' })
            }
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="and" id="and" />
              <Label htmlFor="and" className="font-normal">
                All conditions (AND)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="or" id="or" />
              <Label htmlFor="or" className="font-normal">
                Any condition (OR)
              </Label>
            </div>
          </RadioGroup>
        </div>
      )}

      {/* Condition rules */}
      <div className="space-y-3">
        <Label>Conditions</Label>
        {config.conditions.map((rule, index) => (
          <div key={rule.id} className="space-y-2 p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {index > 0 && (
                  <span className="text-xs uppercase">
                    {config.logicalOperator === 'and' ? 'AND' : 'OR'}
                  </span>
                )}
                {index === 0 && 'IF'}
              </span>
              {config.conditions.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveRule(rule.id)}
                  className="h-6 w-6"
                >
                  <TrashIcon className="h-3 w-3 text-destructive" />
                </Button>
              )}
            </div>

            <div className="grid gap-2">
              {/* Field selection */}
              <Select
                value={rule.field}
                onValueChange={(value) => handleFieldChange(rule.id, value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a field" />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_FIELDS.map((field) => (
                    <SelectItem key={field.value} value={field.value}>
                      {field.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Operator selection */}
              <Select
                value={rule.operator}
                onValueChange={(value) =>
                  handleUpdateRule(rule.id, { operator: value as ConditionOperator })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select operator" />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS.map((op) => (
                    <SelectItem key={op.value} value={op.value}>
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Value input */}
              {operatorRequiresValue(rule.operator) && (
                <Input
                  value={String(rule.value)}
                  onChange={(e) => handleUpdateRule(rule.id, { value: e.target.value })}
                  placeholder="Enter a value"
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add rule button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAddRule}
        className="w-full"
      >
        <PlusIcon className="h-4 w-4 mr-1" />
        Add Condition
      </Button>

      {/* Empty state or validation error */}
      {config.conditions.length === 0 && (
        errors?.conditions ? (
          <p className="text-xs text-red-500 text-center py-4">{errors.conditions}</p>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Add at least one condition to define when the &quot;True&quot; path should be taken.
          </p>
        )
      )}

      {/* Available data — shows users what variables can be used in conditions */}
      <div className="p-3 bg-muted/50 rounded-lg">
        <p className="text-xs font-medium mb-2">Available data for conditions:</p>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li><code className="bg-muted px-1 rounded">{'lead.*'}</code> - Lead fields (email, name, phone, status, company, source)</li>
          <li><code className="bg-muted px-1 rounded">{'formData.*'}</code> - Form submission data (if form trigger)</li>
          <li><code className="bg-muted px-1 rounded">{'tag.*'}</code> - Tag data (if tag trigger)</li>
          <li><code className="bg-muted px-1 rounded">{'ticket.*'}</code> - Ticket data (if pipeline trigger)</li>
        </ul>
      </div>

      {/* Branch preview */}
      <div className="p-3 bg-muted/50 rounded-lg">
        <p className="text-xs font-medium mb-2">Branching:</p>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            <span className="text-green-600 font-medium">True path:</span> Taken when
            {config.conditions.length === 0 && ' conditions are met'}
            {config.conditions.length === 1 && ' the condition is met'}
            {config.conditions.length > 1 &&
              ` ${config.logicalOperator === 'and' ? 'all' : 'any'} conditions are met`}
          </p>
          <p>
            <span className="text-red-600 font-medium">False path:</span> Taken when conditions are not met
          </p>
        </div>
      </div>
    </div>
  )
}
