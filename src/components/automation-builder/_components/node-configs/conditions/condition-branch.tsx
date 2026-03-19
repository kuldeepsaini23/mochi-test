/**
 * ============================================================================
 * BRANCH CONDITION CONFIG
 * ============================================================================
 *
 * Configuration form for the "Branch" condition node.
 * Supports N dynamic branches with compound conditions and context-aware
 * value pickers based on connected trigger types.
 *
 * FEATURES:
 * - N dynamic branches (add/remove/rename)
 * - Per-rule AND/OR connectors (each rule chooses how it connects to the previous)
 * - Context-aware field dropdowns (populated from connected triggers' variables)
 * - Dynamic value pickers (form, pipeline, tag, lead_status, billing_type, etc.)
 * - Special '_triggerType' meta-field for "which trigger fired" conditions
 * - Default branch always exists (catches everything unmatched)
 *
 * SOURCE OF TRUTH: BranchConditionConfig, BranchDefinition, BranchConditionRule
 */

'use client'

import { useCallback, useMemo, useState } from 'react'
import { PlusIcon, TrashIcon, GripVertical, ChevronDown, ChevronRight, Loader2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  BranchConditionConfig as BranchConfig,
  BranchDefinition,
  BranchConditionRule,
  ConditionOperator,
  AutomationTriggerType,
} from '../../../_lib/types'
import type { FieldErrors } from '../../../_lib/config-schemas'
import { useAutomationVariables } from '../../../_lib/use-automation-variables'
import { useAutomationBuilder } from '../../../_lib/automation-builder-context'
import { useAutomationBuilderData } from '../../../_lib/use-automation-builder-data'
import {
  getConditionFieldsForTriggers,
  getPickerTypeForField,
  type ConditionFieldEntry,
} from '../../../_lib/condition-field-registry'
import { TRIGGER_REGISTRY } from '../../../_lib/node-registry'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Prisma LeadStatus enum values for lead_status picker */
const LEAD_STATUS_OPTIONS = [
  { value: 'LEAD', label: 'Lead' },
  { value: 'PROSPECT', label: 'Prospect' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
]

/** Prisma BillingType enum values for billing_type picker */
const BILLING_TYPE_OPTIONS = [
  { value: 'ONE_TIME', label: 'One Time' },
  { value: 'RECURRING', label: 'Recurring' },
  { value: 'SPLIT_PAYMENT', label: 'Split Payment' },
]

/** Prisma TransactionPaymentStatus enum values for payment_status picker */
const PAYMENT_STATUS_OPTIONS = [
  { value: 'AWAITING_PAYMENT', label: 'Awaiting Payment' },
  { value: 'PARTIALLY_PAID', label: 'Partially Paid' },
  { value: 'PAID', label: 'Paid' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELED', label: 'Canceled' },
  { value: 'DISPUTED', label: 'Disputed' },
]

/** Maximum number of branches allowed per Branch node */
const MAX_BRANCHES = 5

/** Available operators for conditions */
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
  { value: 'greater_or_equal', label: 'Greater or equal' },
  { value: 'less_or_equal', label: 'Less or equal' },
]

/** Operators that don't need a value input */
const NO_VALUE_OPERATORS: ConditionOperator[] = ['is_empty', 'is_not_empty']

// ============================================================================
// TYPES
// ============================================================================

interface ConditionBranchConfigProps {
  config: BranchConfig
  onChange: (config: BranchConfig) => void
  /** Field-level validation errors from the properties drawer */
  errors?: FieldErrors
}

// ============================================================================
// UTILITY
// ============================================================================

/** Generate a unique ID for branches and rules */
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ConditionBranchConfig({
  config,
  onChange,
  errors,
}: ConditionBranchConfigProps) {
  /** Track which branches are expanded/collapsed */
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(
    () => new Set(config.branches.map((b) => b.id))
  )

  /** Get trigger types from the automation context for context-aware fields */
  const { triggerTypes } = useAutomationVariables()
  const { organizationId } = useAutomationBuilder()

  /** Fetch entity data for dynamic value pickers */
  const builderData = useAutomationBuilderData(organizationId)

  /** Build condition fields based on connected trigger types */
  const conditionFields = useMemo(
    () => getConditionFieldsForTriggers(triggerTypes),
    [triggerTypes]
  )

  /** Group condition fields by category for the dropdown */
  const groupedFields = useMemo(() => {
    const groups = new Map<string, ConditionFieldEntry[]>()
    for (const field of conditionFields) {
      const existing = groups.get(field.category) ?? []
      existing.push(field)
      groups.set(field.category, existing)
    }
    return groups
  }, [conditionFields])

  /** Toggle branch expand/collapse */
  const toggleBranch = useCallback((branchId: string) => {
    setExpandedBranches((prev) => {
      const next = new Set(prev)
      if (next.has(branchId)) {
        next.delete(branchId)
      } else {
        next.add(branchId)
      }
      return next
    })
  }, [])

  /** Add a new branch */
  const handleAddBranch = useCallback(() => {
    const newBranchId = generateId('branch')
    const newBranch: BranchDefinition = {
      id: newBranchId,
      label: `Branch ${config.branches.length + 1}`,
      conditions: [],
      logicalOperator: 'and',
    }
    onChange({
      ...config,
      branches: [...config.branches, newBranch],
    })
    setExpandedBranches((prev) => new Set([...prev, newBranchId]))
  }, [config, onChange])

  /** Remove a branch */
  const handleRemoveBranch = useCallback(
    (branchId: string) => {
      onChange({
        ...config,
        branches: config.branches.filter((b) => b.id !== branchId),
      })
    },
    [config, onChange]
  )

  /** Update a branch's properties */
  const handleUpdateBranch = useCallback(
    (branchId: string, updates: Partial<BranchDefinition>) => {
      onChange({
        ...config,
        branches: config.branches.map((b) =>
          b.id === branchId ? { ...b, ...updates } : b
        ),
      })
    },
    [config, onChange]
  )

  /** Add a condition rule to a branch — defaults new rule's logicalOperator to 'and' */
  const handleAddRule = useCallback(
    (branchId: string) => {
      const branch = config.branches.find((b) => b.id === branchId)
      if (!branch) return

      const newRule: BranchConditionRule = {
        id: generateId('rule'),
        field: '',
        fieldLabel: '',
        operator: 'equals',
        value: '',
        logicalOperator: branch.conditions.length > 0 ? 'and' : undefined,
      }

      handleUpdateBranch(branchId, {
        conditions: [...branch.conditions, newRule],
      })
    },
    [config.branches, handleUpdateBranch]
  )

  /** Update a condition rule within a branch */
  const handleUpdateRule = useCallback(
    (branchId: string, ruleId: string, updates: Partial<BranchConditionRule>) => {
      const branch = config.branches.find((b) => b.id === branchId)
      if (!branch) return

      handleUpdateBranch(branchId, {
        conditions: branch.conditions.map((r) =>
          r.id === ruleId ? { ...r, ...updates } : r
        ),
      })
    },
    [config.branches, handleUpdateBranch]
  )

  /** Remove a condition rule from a branch */
  const handleRemoveRule = useCallback(
    (branchId: string, ruleId: string) => {
      const branch = config.branches.find((b) => b.id === branchId)
      if (!branch) return

      const updated = branch.conditions.filter((r) => r.id !== ruleId)
      // If first rule was removed, clear the logicalOperator of the new first rule
      if (updated.length > 0 && updated[0].logicalOperator) {
        updated[0] = { ...updated[0], logicalOperator: undefined }
      }

      handleUpdateBranch(branchId, { conditions: updated })
    },
    [config.branches, handleUpdateBranch]
  )

  /**
   * Handle field selection for a rule — auto-determines pickerType
   * and clears the value when the field changes (since picker type may differ).
   */
  const handleFieldChange = useCallback(
    (branchId: string, ruleId: string, fieldKey: string) => {
      const fieldEntry = conditionFields.find((f) => f.key === fieldKey)
      const pickerType = getPickerTypeForField(fieldKey)

      handleUpdateRule(branchId, ruleId, {
        field: fieldKey,
        fieldLabel: fieldEntry?.label ?? fieldKey,
        pickerType,
        value: '', // Reset value when field changes
      })
    },
    [conditionFields, handleUpdateRule]
  )

  /** Toggle a rule's logicalOperator between 'and' and 'or' */
  const handleToggleRuleOperator = useCallback(
    (branchId: string, ruleId: string, currentOp: 'and' | 'or') => {
      handleUpdateRule(branchId, ruleId, {
        logicalOperator: currentOp === 'and' ? 'or' : 'and',
      })
    },
    [handleUpdateRule]
  )

  // ---- Drag-and-drop reorder state ----
  /** Index of the branch currently being dragged */
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  /** Index the dragged branch is currently hovering over */
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  /** Reorder branches by moving the dragged branch to the drop target index */
  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return
      const reordered = [...config.branches]
      const [moved] = reordered.splice(fromIndex, 1)
      reordered.splice(toIndex, 0, moved)
      onChange({ ...config, branches: reordered })
    },
    [config, onChange]
  )

  return (
    <div className="space-y-3">
      {/* Branch list */}
      {config.branches.map((branch, branchIndex) => {
        const isExpanded = expandedBranches.has(branch.id)
        const branchErrorPrefix = `branches.${branchIndex}`

        return (
          <div
            key={branch.id}
            draggable
            onDragStart={() => setDragIndex(branchIndex)}
            onDragEnd={() => {
              if (dragIndex !== null && dragOverIndex !== null) {
                handleReorder(dragIndex, dragOverIndex)
              }
              setDragIndex(null)
              setDragOverIndex(null)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOverIndex(branchIndex)
            }}
            className={cn(
              'border border-border/50 rounded-lg overflow-hidden transition-opacity',
              dragIndex === branchIndex && 'opacity-40',
              dragOverIndex === branchIndex && dragIndex !== branchIndex && 'ring-2 ring-primary/30'
            )}
          >
            {/* Branch header — click to expand/collapse, grip to drag */}
            <div
              className="flex items-center gap-2 px-3 py-2 bg-muted/40 cursor-pointer hover:bg-muted/60 transition-colors"
              onClick={() => toggleBranch(branch.id)}
            >
              {/* Drag handle — cursor changes to grab */}
              <GripVertical
                className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 cursor-grab active:cursor-grabbing"
                onMouseDown={(e) => e.stopPropagation()}
              />
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}

              {/* Branch label — editable inline */}
              <Input
                value={branch.label}
                onChange={(e) => {
                  e.stopPropagation()
                  handleUpdateBranch(branch.id, { label: e.target.value })
                }}
                onClick={(e) => e.stopPropagation()}
                onDragStart={(e) => e.preventDefault()}
                draggable={false}
                className="h-7 p-3! text-xs font-medium border-0 bg-transparent px-1 focus-visible:ring-0 focus-visible:ring-offset-0"
                placeholder="Branch name"
              />

              {/* Branch condition count badge */}
              <span className="text-xs text-muted-foreground bg-background/60 px-1.5 py-0.5 rounded shrink-0">
                {branch.conditions.length} rule{branch.conditions.length !== 1 ? 's' : ''}
              </span>

              {/* Remove branch button — only show if more than 1 branch */}
              {config.branches.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveBranch(branch.id)
                  }}
                  className="h-5 w-5 ml-auto shrink-0 hover:bg-destructive/10"
                >
                  <TrashIcon className="h-3 w-3 text-destructive/70" />
                </Button>
              )}
            </div>

            {/* Branch body — expanded */}
            {isExpanded && (
              <div className="px-3 py-2.5 space-y-0">
                {/* Condition rules with inline AND/OR connectors */}
                {branch.conditions.map((rule, ruleIndex) => (
                  <div key={rule.id}>
                    {/* AND/OR connector pill between rules — clickable to toggle */}
                    {ruleIndex > 0 && (
                      <div className="flex justify-center py-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleToggleRuleOperator(
                              branch.id,
                              rule.id,
                              rule.logicalOperator ?? branch.logicalOperator
                            )
                          }
                          className={cn(
                            'px-3 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-colors',
                            'border cursor-pointer select-none',
                            (rule.logicalOperator ?? branch.logicalOperator) === 'and'
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
                          )}
                        >
                          {(rule.logicalOperator ?? branch.logicalOperator) === 'and' ? 'AND' : 'OR'}
                        </button>
                      </div>
                    )}

                    {/* Condition rule card */}
                    <BranchConditionRuleRow
                      rule={rule}
                      ruleIndex={ruleIndex}
                      branchId={branch.id}
                      conditionCount={branch.conditions.length}
                      groupedFields={groupedFields}
                      triggerTypes={triggerTypes}
                      builderData={builderData}
                      onFieldChange={handleFieldChange}
                      onUpdateRule={handleUpdateRule}
                      onRemoveRule={handleRemoveRule}
                      errors={errors}
                      errorPrefix={`${branchErrorPrefix}.conditions.${ruleIndex}`}
                    />
                  </div>
                ))}

                {/* Validation error for empty branch */}
                {branch.conditions.length === 0 && errors?.[`${branchErrorPrefix}.conditions`] && (
                  <p className="text-xs text-red-500 text-center py-2">
                    {errors[`${branchErrorPrefix}.conditions`]}
                  </p>
                )}

                {/* Add rule button */}
                <div className="pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAddRule(branch.id)}
                    className="w-full h-7 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border/50"
                  >
                    <PlusIcon className="h-3 w-3 mr-1" />
                    Add Condition
                  </Button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Default branch indicator */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border/40">
        <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
        <span className="text-xs text-muted-foreground font-medium">Else (Default)</span>
        <span className="text-xs text-muted-foreground/50 ml-auto">
          Catches everything else
        </span>
      </div>

      {/* Add branch button — limited to MAX_BRANCHES */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleAddBranch}
        disabled={config.branches.length >= MAX_BRANCHES}
        className="w-full h-8 text-xs"
      >
        <PlusIcon className="h-3.5 w-3.5 mr-1" />
        {config.branches.length >= MAX_BRANCHES
          ? `Max ${MAX_BRANCHES} branches reached`
          : 'Add Branch'}
      </Button>

      {/* Branch evaluation info */}
      <p className="text-xs text-muted-foreground/60 text-center">
        Branches evaluate top-to-bottom. First match wins.
      </p>
    </div>
  )
}

// ============================================================================
// BRANCH CONDITION RULE ROW
// ============================================================================

interface BranchConditionRuleRowProps {
  rule: BranchConditionRule
  ruleIndex: number
  branchId: string
  conditionCount: number
  groupedFields: Map<string, ConditionFieldEntry[]>
  triggerTypes: AutomationTriggerType[]
  builderData: ReturnType<typeof useAutomationBuilderData>
  onFieldChange: (branchId: string, ruleId: string, fieldKey: string) => void
  onUpdateRule: (branchId: string, ruleId: string, updates: Partial<BranchConditionRule>) => void
  onRemoveRule: (branchId: string, ruleId: string) => void
  errors?: FieldErrors
  errorPrefix: string
}

/**
 * Single condition rule row within a branch.
 * Renders field dropdown, operator dropdown, and dynamic value picker
 * in a compact card layout.
 */
function BranchConditionRuleRow({
  rule,
  ruleIndex,
  branchId,
  conditionCount,
  groupedFields,
  triggerTypes,
  builderData,
  onFieldChange,
  onUpdateRule,
  onRemoveRule,
  errors,
  errorPrefix,
}: BranchConditionRuleRowProps) {
  /** Whether the selected operator requires a value input */
  const needsValue = !NO_VALUE_OPERATORS.includes(rule.operator)

  return (
    <div className="relative p-2 rounded-md bg-muted/20 border border-border/30 space-y-1.5">
      {/* Row header — "IF" label for first rule + delete button */}
      <div className="flex items-center justify-between">
        {ruleIndex === 0 && (
          <span className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
            If
          </span>
        )}
        {ruleIndex > 0 && <span />}

        {/* Delete rule — always show, but only allow if more than 1 rule */}
        {conditionCount > 1 && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onRemoveRule(branchId, rule.id)}
            className="h-5 w-5 hover:bg-destructive/10"
          >
            <TrashIcon className="h-2.5 w-2.5 text-destructive/60" />
          </Button>
        )}
      </div>

      {/* Field → Operator → Value stacked layout */}
      <div className="grid gap-1.5">
        {/* Field selection — grouped by category. !h-8 overrides base data-[size=default]:h-9 */}
        <Select
          value={rule.field}
          onValueChange={(value) => onFieldChange(branchId, rule.id, value)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Select field..." />
          </SelectTrigger>
          <SelectContent>
            {Array.from(groupedFields.entries()).map(([category, fields]) => (
              <SelectGroup key={category}>
                <SelectLabel className="text-xs uppercase tracking-wider text-muted-foreground/60">
                  {category}
                </SelectLabel>
                {fields.map((field) => (
                  <SelectItem key={field.key} value={field.key} className="text-xs">
                    {field.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        {errors?.[`${errorPrefix}.field`] && (
          <p className="text-xs text-red-500">{errors[`${errorPrefix}.field`]}</p>
        )}

        {/* Operator selection */}
        <Select
          value={rule.operator}
          onValueChange={(value) =>
            onUpdateRule(branchId, rule.id, { operator: value as ConditionOperator })
          }
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Operator..." />
          </SelectTrigger>
          <SelectContent>
            {OPERATORS.map((op) => (
              <SelectItem key={op.value} value={op.value} className="text-xs">
                {op.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Dynamic value input — switches based on pickerType */}
        {needsValue && (
          <DynamicValuePicker
            rule={rule}
            branchId={branchId}
            triggerTypes={triggerTypes}
            builderData={builderData}
            onUpdateRule={onUpdateRule}
          />
        )}
      </div>
    </div>
  )
}

// ============================================================================
// DYNAMIC VALUE PICKER
// ============================================================================

interface DynamicValuePickerProps {
  rule: BranchConditionRule
  branchId: string
  triggerTypes: AutomationTriggerType[]
  builderData: ReturnType<typeof useAutomationBuilderData>
  onUpdateRule: (branchId: string, ruleId: string, updates: Partial<BranchConditionRule>) => void
}

/**
 * Renders the appropriate value picker based on the rule's pickerType.
 * When the user selects a field (e.g., 'trigger.form.id'), the pickerType
 * is auto-determined, and this component renders the matching picker.
 *
 * Entity pickers (form, pipeline, pipeline_stage, calendar) store IDs as values
 * so they match the VariableContext at runtime (which also holds IDs).
 * Tag picker stores names since lead.tags is a string[] of tag names.
 */
function DynamicValuePicker({
  rule,
  branchId,
  triggerTypes,
  builderData,
  onUpdateRule,
}: DynamicValuePickerProps) {
  const pickerType = rule.pickerType ?? 'text'

  /** Common handler for select-based pickers */
  const handleSelectChange = (value: string) => {
    onUpdateRule(branchId, rule.id, { value })
  }

  /** Common handler for text input */
  const handleTextChange = (value: string) => {
    onUpdateRule(branchId, rule.id, { value })
  }

  /** Shared select trigger styling */
  const selectTriggerClass = 'h-8 text-xs'

  /** Loading indicator for entity pickers while data is being fetched */
  const loadingFallback = (
    <div className="flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs text-muted-foreground">
      <Loader2Icon className="h-3 w-3 animate-spin" />
      Loading...
    </div>
  )

  switch (pickerType) {
    case 'form':
      if (builderData.isLoading) return loadingFallback
      return (
        <Select value={String(rule.value)} onValueChange={handleSelectChange}>
          <SelectTrigger className={selectTriggerClass}>
            <SelectValue placeholder="Select a form" />
          </SelectTrigger>
          <SelectContent>
            {builderData.forms.map((form) => (
              <SelectItem key={form.id} value={form.id} className="text-xs">
                {form.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )

    case 'pipeline':
      if (builderData.isLoading) return loadingFallback
      return (
        <Select value={String(rule.value)} onValueChange={handleSelectChange}>
          <SelectTrigger className={selectTriggerClass}>
            <SelectValue placeholder="Select a pipeline" />
          </SelectTrigger>
          <SelectContent>
            {builderData.pipelines.map((pipeline) => (
              <SelectItem key={pipeline.id} value={pipeline.id} className="text-xs">
                {pipeline.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )

    case 'pipeline_stage':
      if (builderData.isLoading) return loadingFallback
      return (
        <Select value={String(rule.value)} onValueChange={handleSelectChange}>
          <SelectTrigger className={selectTriggerClass}>
            <SelectValue placeholder="Select a stage" />
          </SelectTrigger>
          <SelectContent>
            {builderData.pipelines.flatMap((pipeline) =>
              pipeline.lanes.map((lane) => (
                <SelectItem key={lane.id} value={lane.id} className="text-xs">
                  {pipeline.name} / {lane.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      )

    case 'product':
      if (builderData.isLoading) return loadingFallback
      return (
        <Select value={String(rule.value)} onValueChange={handleSelectChange}>
          <SelectTrigger className={selectTriggerClass}>
            <SelectValue placeholder="Select a product" />
          </SelectTrigger>
          <SelectContent>
            {builderData.products.map((product) => (
              <SelectItem key={product.id} value={product.id} className="text-xs">
                {product.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )

    case 'calendar':
      if (builderData.isLoading) return loadingFallback
      return (
        <Select value={String(rule.value)} onValueChange={handleSelectChange}>
          <SelectTrigger className={selectTriggerClass}>
            <SelectValue placeholder="Select a calendar" />
          </SelectTrigger>
          <SelectContent>
            {builderData.calendars.map((calendar) => (
              <SelectItem key={calendar.id} value={calendar.id} className="text-xs">
                {calendar.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )

    case 'tag':
      /* Tags store names (not IDs) because lead.tags is a string[] of tag names */
      if (builderData.isLoading) return loadingFallback
      return (
        <Select value={String(rule.value)} onValueChange={handleSelectChange}>
          <SelectTrigger className={selectTriggerClass}>
            <SelectValue placeholder="Select a tag" />
          </SelectTrigger>
          <SelectContent>
            {builderData.tags.map((tag) => (
              <SelectItem key={tag.id} value={tag.name} className="text-xs">
                {tag.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )

    case 'lead_status':
      return (
        <Select value={String(rule.value)} onValueChange={handleSelectChange}>
          <SelectTrigger className={selectTriggerClass}>
            <SelectValue placeholder="Select a status" />
          </SelectTrigger>
          <SelectContent>
            {LEAD_STATUS_OPTIONS.map((status) => (
              <SelectItem key={status.value} value={status.value} className="text-xs">
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )

    case 'billing_type':
      return (
        <Select value={String(rule.value)} onValueChange={handleSelectChange}>
          <SelectTrigger className={selectTriggerClass}>
            <SelectValue placeholder="Select billing type" />
          </SelectTrigger>
          <SelectContent>
            {BILLING_TYPE_OPTIONS.map((bt) => (
              <SelectItem key={bt.value} value={bt.value} className="text-xs">
                {bt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )

    case 'payment_status':
      return (
        <Select value={String(rule.value)} onValueChange={handleSelectChange}>
          <SelectTrigger className={selectTriggerClass}>
            <SelectValue placeholder="Select payment status" />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_STATUS_OPTIONS.map((ps) => (
              <SelectItem key={ps.value} value={ps.value} className="text-xs">
                {ps.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )

    case 'trigger_type':
      return (
        <Select value={String(rule.value)} onValueChange={handleSelectChange}>
          <SelectTrigger className={selectTriggerClass}>
            <SelectValue placeholder="Select trigger type" />
          </SelectTrigger>
          <SelectContent>
            {triggerTypes.map((tt) => {
              const entry = TRIGGER_REGISTRY.find((r) => r.type === tt)
              return (
                <SelectItem key={tt} value={tt} className="text-xs">
                  {entry?.label ?? tt}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      )

    case 'text':
    default:
      return (
        <Input
          value={String(rule.value)}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="Enter a value"
          className="h-7 text-xs"
        />
      )
  }
}
