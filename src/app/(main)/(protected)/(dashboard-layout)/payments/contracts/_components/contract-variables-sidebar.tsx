'use client'

/**
 * ============================================================================
 * CONTRACT VARIABLES SIDEBAR
 * ============================================================================
 *
 * Always-visible left sidebar for managing contract variables and settings.
 * Follows the same visual pattern as the automation builder's NodeSidebar
 * (rounded-3xl, positioned absolute top-16 left-4).
 *
 * Uses shadcn Tabs (matching the automation builder's Build/Activity tabs)
 * with two tabs:
 *   - Variables: Simplified label + value inputs with insert button
 *   - Settings: Auto-save toggle and contract description
 *
 * SOURCE OF TRUTH KEYWORDS: ContractVariablesSidebar, ContractVariableSidebarProps,
 * ContractVariableRow
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, Trash2, Info, User, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { MarqueeFade } from '@/components/global/marquee-fade'
import { cn } from '@/lib/utils'
import { getLeadAvatarColor } from '@/lib/utils/lead-helpers'
import { getTextColorForBackground } from '@/constants/colors'
import type { LeadOption } from '@/components/leads/lead-search-command'
import type { ContractVariable } from '../_lib/types'
import { variableRegistry } from '@/lib/ai/variables'
import type { RegisteredVariable } from '@/lib/ai/variables'

// =============================================================================
// TYPES
// =============================================================================

/**
 * Props for the ContractVariablesSidebar component.
 *
 * SOURCE OF TRUTH KEYWORDS: ContractVariablesSidebarProps
 */
interface ContractVariablesSidebarProps {
  /** List of contract variables to display */
  variables: ContractVariable[]
  /** Callback to add a new blank variable */
  onAddVariable: () => void
  /** Callback to update a variable's name or value */
  onUpdateVariable: (id: string, updates: Partial<Pick<ContractVariable, 'name' | 'value'>>) => void
  /** Callback to remove a variable by id */
  onRemoveVariable: (id: string) => void
  /** Callback to insert a variable key into the Lexical editor */
  onInsertVariable: (variableKey: string) => void
  /** Currently selected recipient lead (null if none) */
  recipientLead: LeadOption | null
  /** Callback to open the lead search dialog */
  onSelectRecipient: () => void
  /** Callback to remove the selected recipient */
  onRemoveRecipient: () => void
}

// =============================================================================
// VARIABLE ROW — Simple label + field layout with debounced updates
// =============================================================================

/**
 * Simplified variable row: editable name as label, value as input field,
 * plus button to insert into contract and delete button on hover.
 *
 * Uses LOCAL state for editing to prevent the parent from re-rendering
 * the entire Lexical editor on every keystroke (which steals focus).
 * Changes propagate to the parent after a 500ms debounce.
 */
function VariableRow({
  variable,
  onUpdate,
  onRemove,
  onInsert,
}: {
  variable: ContractVariable
  onUpdate: (id: string, updates: Partial<Pick<ContractVariable, 'name' | 'value'>>) => void
  onRemove: (id: string) => void
  onInsert: (variableKey: string) => void
}) {
  /** Local editing state — decoupled from parent to avoid re-render cascades */
  const [localName, setLocalName] = useState(variable.name)
  const [localValue, setLocalValue] = useState(variable.value)
  const nameTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const valueTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  /** Sync from parent when variable data changes externally (e.g., initial load) */
  useEffect(() => { setLocalName(variable.name) }, [variable.name])
  useEffect(() => { setLocalValue(variable.value) }, [variable.value])

  /** Clean up debounce timers on unmount */
  useEffect(() => () => {
    clearTimeout(nameTimerRef.current)
    clearTimeout(valueTimerRef.current)
  }, [])

  /**
   * Handle name input — update local state immediately, debounce parent update.
   * WHY: Direct parent updates on every keystroke cause the Lexical editor
   * context providers to re-render, which steals focus from the sidebar input.
   */
  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setLocalName(value)
    clearTimeout(nameTimerRef.current)
    nameTimerRef.current = setTimeout(() => {
      onUpdate(variable.id, { name: value })
    }, 500)
  }, [variable.id, onUpdate])

  /** Handle value input — same debounce pattern as name */
  const handleValueChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setLocalValue(value)
    clearTimeout(valueTimerRef.current)
    valueTimerRef.current = setTimeout(() => {
      onUpdate(variable.id, { value })
    }, 500)
  }, [variable.id, onUpdate])

  /** Flush pending changes immediately on blur (don't wait for debounce) */
  const handleNameBlur = useCallback(() => {
    clearTimeout(nameTimerRef.current)
    if (localName !== variable.name) {
      onUpdate(variable.id, { name: localName })
    }
  }, [variable.id, variable.name, localName, onUpdate])

  const handleValueBlur = useCallback(() => {
    clearTimeout(valueTimerRef.current)
    if (localValue !== variable.value) {
      onUpdate(variable.id, { value: localValue })
    }
  }, [variable.id, variable.value, localValue, onUpdate])

  return (
    <div className="group space-y-1">
      {/* Label row: editable name + insert/delete actions */}
      <div className="flex items-center gap-1">
        <input
          value={localName}
          onChange={handleNameChange}
          onBlur={handleNameBlur}
          placeholder="Variable name"
          className={cn(
            'flex-1 min-w-0 text-[11px] font-medium bg-transparent',
            'border-none outline-none text-foreground/70 placeholder:text-muted-foreground/50',
          )}
        />

        {/* Insert into contract — always visible plus button with tooltip */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => localName.trim() && onInsert(`contract.${variable.id}`)}
              disabled={!localName.trim()}
              className={cn(
                'h-4 w-4 flex items-center justify-center rounded',
                'text-muted-foreground hover:text-primary hover:bg-primary/10',
                'transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
              )}
            >
              <Plus className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {localName.trim()
              ? `Insert "${localName}" into contract`
              : 'Name the variable first'}
          </TooltipContent>
        </Tooltip>

        {/* Delete button — visible on hover */}
        <button
          onClick={() => onRemove(variable.id)}
          className={cn(
            'h-4 w-4 flex items-center justify-center rounded',
            'text-muted-foreground/0 group-hover:text-destructive/70',
            'hover:!text-destructive transition-colors',
          )}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {/* Value input */}
      <Input
        value={localValue}
        onChange={handleValueChange}
        onBlur={handleValueBlur}
        placeholder="Enter value..."
        className="h-7 text-xs bg-background/50"
      />
    </div>
  )
}

// =============================================================================
// MAIN SIDEBAR COMPONENT
// =============================================================================

/**
 * Contract settings sidebar — always visible, positioned to the left of the editor.
 * Title "Settings" at top, two tabs matching the automation builder Tabs pattern.
 */
export function ContractVariablesSidebar({
  variables,
  onAddVariable,
  onUpdateVariable,
  onRemoveVariable,
  onInsertVariable,
  recipientLead,
  onSelectRecipient,
  onRemoveRecipient,
}: ContractVariablesSidebarProps) {
  /**
   * Subscribe to the global variable registry for contract variables.
   * When the AI generates new variables (via receiveComplete in use-contract-ai),
   * the registry notifies this sidebar to auto-update without prop drilling.
   *
   * Merges registry variables with local state, deduplicating by name.
   */
  useEffect(() => {
    return variableRegistry.subscribe('contract', (registryVars: RegisteredVariable[]) => {
      /**
       * Merge registry variables into the existing variable list.
       * Deduplicate by name — if a variable with the same name exists,
       * keep the existing one (preserves user edits).
       */
      const existingNames = new Set(variables.map((v) => v.name.toLowerCase()))
      const newVars = registryVars.filter(
        (rv) => !existingNames.has(rv.name.toLowerCase())
      )

      /** Only trigger update if there are genuinely new variables */
      if (newVars.length > 0) {
        for (const rv of newVars) {
          onUpdateVariable(rv.id, { name: rv.name, value: rv.value })
        }
      }
    })
  }, [variables, onUpdateVariable])

  /** Scroll state for MarqueeFade top/bottom indicators */
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(false)

  /**
   * Recalculate whether the scroll container has overflow at
   * the top or bottom — drives the MarqueeFade indicators.
   */
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setShowTopFade(el.scrollTop > 4)
    setShowBottomFade(el.scrollTop + el.clientHeight < el.scrollHeight - 4)
  }, [])

  return (
    <TooltipProvider delayDuration={200}>
      <motion.aside
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={cn(
          'absolute top-16 left-4 z-20',
          'w-58',
          'bg-white dark:bg-muted',
          'rounded-3xl',
          'flex flex-col overflow-hidden',
        )}
      >
        {/* Sidebar title */}
        <div className="px-5 pt-4 pb-1">
          <h3 className="text-xs font-semibold text-foreground tracking-wide uppercase">
            Settings
          </h3>
        </div>

        {/* Tabs — matching automation builder Build/Activity pattern */}
        <Tabs defaultValue="variables" className="flex flex-col flex-1 min-h-0">
          <div className="px-4 pb-1">
            <TabsList className="h-8 w-full">
              <TabsTrigger value="variables" className="text-xs px-3 h-6 flex-1">
                Variables
              </TabsTrigger>
              <TabsTrigger value="recipient" className="text-xs px-3 h-6 flex-1">
                Recipient
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ---- Variables tab ---- */}
          <TabsContent value="variables" className="flex-1 min-h-0 mt-0">
            <div className="p-4 space-y-3">
              {/* Description text explaining how to use variables */}
              <div className="flex items-start gap-1.5">
                <Info className="h-3 w-3 text-muted-foreground/60 shrink-0 mt-0.5" />
                <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                  Create variables below and click the <strong>+</strong> button to insert them
                  into your contract. They appear as yellow pills that show the variable value.
                </p>
              </div>

              {/* Add variable button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onAddVariable}
                    className="w-full h-7 text-xs gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    Add Variable
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Create a new contract variable with a name and value
                </TooltipContent>
              </Tooltip>

              {/* Scrollable variable list with fade indicators */}
              <MarqueeFade
                showTopFade={showTopFade}
                showBottomFade={showBottomFade}
                fadeHeight={40}
                className="flex-1 min-h-0"
              >
                <div
                  ref={scrollRef}
                  onScroll={handleScroll}
                  className="overflow-y-auto max-h-[50vh] space-y-3"
                >
                  {variables.length === 0 ? (
                    /* Empty state */
                    <div className="text-center py-4">
                      <p className="text-[10px] text-muted-foreground/50">
                        No variables yet
                      </p>
                    </div>
                  ) : (
                    variables.map((variable) => (
                      <VariableRow
                        key={variable.id}
                        variable={variable}
                        onUpdate={onUpdateVariable}
                        onRemove={onRemoveVariable}
                        onInsert={onInsertVariable}
                      />
                    ))
                  )}
                </div>
              </MarqueeFade>
            </div>
          </TabsContent>

          {/* ---- Recipient tab — lead selector only ---- */}
          <TabsContent value="recipient" className="flex-1 min-h-0 mt-0">
            <div className="p-4 space-y-4">
              {/* Recipient lead selector */}
              {recipientLead ? (
                /**
                 * Lead card — shows the selected recipient with avatar, name, email.
                 * X button removes the recipient and clears lead variable context.
                 */
                <div className="rounded-xl bg-accent/50 dark:bg-background/20 p-2.5 flex items-center gap-2.5">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage
                      src={recipientLead.avatarUrl ?? undefined}
                      alt={[recipientLead.firstName, recipientLead.lastName].filter(Boolean).join(' ') || recipientLead.email}
                    />
                    <AvatarFallback
                      className="text-[10px] font-medium"
                      style={{
                        backgroundColor: getLeadAvatarColor(recipientLead.id, recipientLead.firstName),
                        color: getTextColorForBackground(getLeadAvatarColor(recipientLead.id, recipientLead.firstName)),
                      }}
                    >
                      {[recipientLead.firstName, recipientLead.lastName]
                        .filter(Boolean)
                        .map((n) => n![0])
                        .join('')
                        .toUpperCase() || recipientLead.email[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">
                      {[recipientLead.firstName, recipientLead.lastName].filter(Boolean).join(' ') || recipientLead.email.split('@')[0]}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {recipientLead.email}
                    </p>
                  </div>
                  <button
                    onClick={onRemoveRecipient}
                    className="h-5 w-5 flex items-center justify-center rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                /** No recipient — show selection button */
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSelectRecipient}
                  className="w-full h-8 text-xs gap-1.5"
                >
                  <User className="h-3 w-3" />
                  Select Recipient
                </Button>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </motion.aside>
    </TooltipProvider>
  )
}
