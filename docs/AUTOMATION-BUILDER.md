# Automation Builder Documentation

This document provides a comprehensive overview of the Automation Builder feature for AI assistants and developers.

## Overview

The Automation Builder allows users to create visual workflow automations that trigger actions based on events. It uses a node-based canvas (React Flow) where users can:
- Add trigger nodes (what starts the automation)
- Add action nodes (what the automation does)
- Add condition nodes (branching logic)
- Connect nodes to create workflows

## File Structure

```
src/
├── app/(main)/(protected)/
│   ├── (dashboard-layout)/automations/
│   │   ├── page.tsx                          # Automations list page
│   │   └── _components/
│   │       ├── automations-page-content.tsx  # Main list component
│   │       ├── automations-table.tsx         # Table with pagination/selection
│   │       ├── automation-dialog.tsx         # Create automation dialog
│   │       └── bulk-delete-automations-dialog.tsx
│   │
│   └── (automation-builder)/automations/[slug]/edit/
│       ├── page.tsx                          # Builder page (uses slug for URL)
│       └── _components/
│           └── automation-builder-wrapper.tsx # Connects UI to tRPC
│
├── components/automation-builder/
│   ├── index.tsx                             # Main AutomationBuilder component
│   ├── _components/
│   │   ├── automation-builder-content.tsx    # Builder content layout
│   │   ├── automation-canvas.tsx             # React Flow canvas
│   │   ├── navbar.tsx                        # Header with save/status controls
│   │   ├── node-sidebar.tsx                  # Node palette (drag to add)
│   │   ├── properties-drawer.tsx             # Right panel for node config
│   │   ├── automation-variable-picker.tsx    # Context-aware variable picker (see Variable System)
│   │   ├── nodes/
│   │   │   ├── trigger-node.tsx              # Trigger node component
│   │   │   ├── action-node.tsx               # Action node component
│   │   │   └── condition-node.tsx            # Condition node component
│   │   ├── run-history/
│   │   │   ├── index.ts                      # Re-exports
│   │   │   ├── run-history-panel.tsx         # Activity tab - run history list
│   │   │   ├── run-history-helpers.ts        # Duration/status formatting helpers
│   │   │   ├── run-item.tsx                  # Individual run row component
│   │   │   └── step-item.tsx                 # Individual step row component
│   │   ├── edges/
│   │   │   └── add-node-edge.tsx             # Custom edge with + button
│   │   └── node-configs/
│   │       ├── index.ts                      # Re-exports all config forms
│   │       ├── triggers/
│   │       │   ├── trigger-form-submitted.tsx
│   │       │   ├── trigger-pipeline-ticket-moved.tsx
│   │       │   ├── trigger-payment-completed.tsx
│   │       │   ├── trigger-appointment-scheduled.tsx
│   │       │   └── trigger-appointment-started.tsx
│   │       ├── actions/
│   │       │   ├── action-send-email.tsx
│   │       │   ├── action-send-notification.tsx
│   │       │   ├── action-call-webhook.tsx
│   │       │   ├── action-add-tag.tsx
│   │       │   ├── action-remove-tag.tsx
│   │       │   ├── action-update-lead.tsx
│   │       │   ├── action-create-pipeline-ticket.tsx
│   │       │   └── action-update-pipeline-ticket.tsx
│   │       ├── conditions/
│   │       │   └── condition-if-else.tsx
│   │       └── control/
│   │           ├── action-wait-delay.tsx
│   │           └── action-wait-for-event.tsx
│   │
│   └── _lib/
│       ├── types.ts                          # All TypeScript types
│       ├── node-registry.ts                  # Node definitions & defaults
│       ├── config-schemas.ts                 # Zod schemas for node configs
│       ├── automation-builder-context.tsx    # React context for state
│       ├── use-automation-builder-data.ts    # Hook for fetching org data
│       └── utils.ts                          # Helper functions
│
├── lib/variables/
│   ├── variable-categories.ts               # Single source of truth for variable categories (see Variable System)
│   ├── types.ts                              # Variable types (VariableContext, etc.)
│   ├── context-builder.ts                    # Builds variable context from trigger data
│   ├── interpolate.ts                        # {{variable}} interpolation engine
│   ├── interpolate-block.ts                  # Block-level interpolation for emails
│   ├── format-utils.ts                       # Variable formatting utilities
│   ├── sample-context.ts                     # Sample data for variable previews
│   └── index.ts                              # Re-exports
│
├── trpc/routers/
│   └── automation.ts                         # tRPC router for automations
│
└── services/
    └── automation.service.ts                 # Business logic for execution
```

## Key Types (SOURCE OF TRUTH: types.ts)

### Automation Status
```typescript
type AutomationStatus = 'draft' | 'active' | 'paused' | 'archived'
```

### Trigger Types
```typescript
type AutomationTriggerType =
  | 'form_submitted'
  | 'pipeline_ticket_moved'
  | 'payment_completed'
  | 'appointment_scheduled'
  | 'appointment_started'
```

### Action Types
```typescript
type AutomationActionType =
  | 'send_email'
  | 'update_lead'
  | 'add_tag'
  | 'remove_tag'
  | 'create_pipeline_ticket'
  | 'update_pipeline_ticket'
  | 'wait_delay'
  | 'wait_for_event'
  | 'send_notification'
  | 'call_webhook'
```

### Condition Types
```typescript
type AutomationConditionType = 'if_else'
```

### Node Data Structure
```typescript
interface AutomationNode {
  id: string
  type: 'trigger' | 'action' | 'condition'
  position: { x: number; y: number }
  data: TriggerNodeData | ActionNodeData | ConditionNodeData
}
```

### Automation Schema (stored in DB as JSON)
```typescript
interface AutomationSchema {
  nodes: AutomationNode[]
  edges: AutomationEdge[]
}
```

## tRPC Endpoints (automation.ts)

### List Automations
```typescript
automation.list({
  organizationId: string
  page?: number        // default: 1
  pageSize?: number    // default: 20
  search?: string
  status?: AutomationStatus
  triggerType?: AutomationTriggerType
})
// Returns: { automations, total, page, pageSize, totalPages }
```

### Get Single Automation by ID
```typescript
automation.getById({
  organizationId: string
  automationId: string
})
// Returns: Full automation with schema
```

### Get Single Automation by Slug
```typescript
automation.getBySlug({
  organizationId: string
  slug: string
})
// Returns: Full automation with schema (used for URL routing)
```

### Create Automation
```typescript
automation.create({
  organizationId: string
  name: string
  description?: string
  triggerType: AutomationTriggerType  // Default: FORM_SUBMITTED
})
// Returns: Created automation
```

### Update Automation
```typescript
automation.update({
  organizationId: string
  automationId: string
  name?: string
  description?: string
  schema?: AutomationSchema
})
// Returns: Updated automation
```

### Update Status
```typescript
automation.updateStatus({
  organizationId: string
  automationId: string
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED'
})
// Returns: Updated automation
```

### Delete Automation
```typescript
automation.delete({
  organizationId: string
  automationId: string
})
// Returns: { success: true }
```

### Bulk Delete
```typescript
automation.bulkDelete({
  organizationId: string
  automationIds: string[]
})
// Returns: { count: number }
```

### Duplicate Automation
```typescript
automation.duplicate({
  organizationId: string
  automationId: string
})
// Returns: New automation (copy)
```

## Node Registry (node-registry.ts)

The node registry defines all available nodes with:
- `type`: Unique identifier (snake_case)
- `label`: Display name
- `description`: Help text
- `icon`: Lucide icon component
- `category`: 'trigger' | 'action' | 'condition'
- `defaultConfig`: Initial configuration values

### Adding a New Node Type

1. Add type to `types.ts`:
```typescript
// In AutomationActionType or other union
| 'my_new_action'

// Add config interface
interface MyNewActionConfig {
  type: 'my_new_action'
  // ... config fields
}
```

2. Add to node registry (`node-registry.ts`):
```typescript
{
  type: 'my_new_action',
  label: 'My New Action',
  description: 'Does something cool',
  icon: SparklesIcon,
  category: 'action',
}
```

3. Add default config:
```typescript
my_new_action: {
  type: 'my_new_action',
  // ... default values
}
```

4. Create config component in the appropriate subfolder:
   - Triggers → `node-configs/triggers/trigger-my-new.tsx`
   - Actions → `node-configs/actions/action-my-new.tsx`
   - Conditions → `node-configs/conditions/condition-my-new.tsx`
   - Control/Wait → `node-configs/control/action-my-new.tsx`

5. If the config has text inputs that support variables, add `AutomationVariablePicker`:
   - Import from `../../automation-variable-picker`
   - Add refs for cursor-position insertion
   - Add variable insert handlers (see Variable System section)

6. Add to properties-drawer.tsx switch statement

7. Export from node-configs/index.ts

## State Management

### AutomationBuilderContext

The builder uses React Context for state management:

```typescript
interface AutomationBuilderState {
  automation: Automation
  schema: AutomationSchema
  selection: {
    selectedNodeId: string | null
    selectedEdgeId: string | null
  }
  ui: {
    isDirty: boolean
    isSaving: boolean
  }
  // Undo/Redo history
  history: HistoryEntry[]
  historyIndex: number
}

interface HistoryEntry {
  schema: AutomationSchema
  timestamp: number
  description: string
}
```

### Actions (Reducer)
- `SET_AUTOMATION` - Load automation data
- `LOAD_AUTOMATION` - Load automation and reset history
- `UPDATE_SCHEMA` - Update nodes/edges
- `SET_NODES` - Set nodes directly (used by React Flow)
- `SET_EDGES` - Set edges directly (used by React Flow)
- `ADD_NODE` - Add new node
- `UPDATE_NODE` - Update node data
- `DELETE_NODE` - Remove node and connected edges
- `SELECT_NODE` - Select node for editing
- `CONNECT_NODES` - Create edge between nodes
- `SET_DIRTY` - Mark as having unsaved changes
- `SET_SAVING` - Toggle saving state
- `SAVE_HISTORY` - Save current state to history stack
- `UNDO` - Restore previous state from history
- `REDO` - Restore next state from history

### Undo/Redo System

The automation builder supports undo/redo with keyboard shortcuts (Ctrl+Z / Ctrl+Y).

**Key Implementation Details:**

1. **History is saved AFTER changes**: When a user performs an action (add node, delete node, etc.), the history is saved AFTER the state change. This allows undo to restore the previous state.

2. **History initialization**: When an automation is loaded, the initial state is saved as the first history entry at index 0.

3. **History trimming**: When a new action is performed after undoing, future history entries are discarded.

```typescript
// Example: Adding a node with history
dispatch({ type: 'ADD_NODE', payload: { node: newNode } })
actions.saveHistory('Add node')  // Save AFTER the change

// Undo/Redo keyboard shortcuts
if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
  dispatch({ type: 'UNDO' })
}
if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
  dispatch({ type: 'REDO' })
}
```

**History-tracked operations:**
- Add node (drag from toolbar)
- Delete node (keyboard Delete/Backspace)
- Add connection (drag between handles)
- Delete connection (select + Delete)

**Non-tracked operations:**
- Node position changes (too frequent)
- Node selection changes

## Automations List Page

### Features
- Server-side pagination (page, pageSize)
- Debounced search (300ms)
- Row selection for bulk operations
- Optimistic updates for mutations
- Bulk delete with confirmation
- Status toggle (pause/activate)
- Duplicate automation
- Archive automation

### UI Pattern (matches Forms page)
- No page header title
- Always shows table structure
- Empty state inside table row
- Loading shows skeleton rows in actual table
- No skeleton flash when switching tabs

## Data Flow

### Creating an Automation
1. User clicks "Create Automation"
2. Dialog opens (name + description only)
3. `automation.create` called with default trigger (auto-generates slug from name)
4. Redirects to `/automations/{slug}/edit` (URL-friendly slug, not cuid)
5. Builder loads with empty canvas + default trigger

### Editing in Builder
1. `AutomationBuilderWrapper` fetches automation via `getBySlug` tRPC endpoint
2. Transforms Prisma data to UI types (UPPER_CASE → lower_case)
3. Passes to `AutomationBuilder` component
4. User drags nodes from toolbar
5. Changes trigger `onSave` callback
6. Debounced save (500ms) calls `automation.update`

### Autosave
- Schema changes are debounced (500ms)
- Saves automatically via `automation.update`
- No manual save button needed

## Prisma Enum Mapping

Prisma uses UPPER_SNAKE_CASE, UI uses snake_case:

```typescript
// Prisma → UI
'FORM_SUBMITTED' → 'form_submitted'
'ACTIVE' → 'active'

// UI → Prisma
'form_submitted' → 'FORM_SUBMITTED'
'active' → 'ACTIVE'
```

Helper functions in `automation-builder-wrapper.tsx`:
- `prismaToUiStatus()`
- `uiToPrismaStatus()`
- `prismaToUiTriggerType()`

## Permissions

```typescript
// Required permissions (from permissions.ts)
AUTOMATIONS_READ    // View automations list
AUTOMATIONS_CREATE  // Create new automations
AUTOMATIONS_UPDATE  // Edit automations
AUTOMATIONS_DELETE  // Delete automations
AUTOMATIONS_EXECUTE // Activate/pause automations
```

## Available Data for Node Configs

The `useAutomationBuilderData` hook provides:
- `forms` - Organization's forms (for form_submitted trigger)
- `tags` - Organization's tags (for tag triggers/actions)
- `pipelines` - Pipelines with stages (for pipeline actions)
- `emailTemplates` - Email templates (for send_email action)
- `teamMembers` - Team members (for notifications)

## Variable System (SOURCE OF TRUTH: variable-categories.ts)

### Architecture Overview

The variable system allows users to insert dynamic values (like `{{lead.email}}`, `{{trigger.tag.name}}`) into text fields throughout the automation builder. The architecture ensures a **single source of truth** — all variable category definitions live in one shared file so both the email-builder and automation-builder pickers stay in sync.

```
src/lib/variables/variable-categories.ts    ← Single source of truth
        │
        ├── components/email-builder/_components/variable-picker.tsx
        │   (imports SHARED_CATEGORIES — always shows all shared categories)
        │
        └── components/automation-builder/_components/automation-variable-picker.tsx
            (imports SHARED_CATEGORIES + TRIGGER_CATEGORY_MAP — shows categories
             relevant to the current trigger type)
```

### variable-categories.ts

Defines all variable categories with their keys, labels, and icons:

```typescript
// Shared categories — always available regardless of trigger type
export const SHARED_CATEGORIES: VariableCategory[] = [
  LEAD_CATEGORY,           // lead.firstName, lead.email, lead.phone, etc.
  ORGANIZATION_CATEGORY,   // organization.name, organization.logo, etc.
  TRANSACTION_CATEGORY,    // lead.transaction.paidAmountFormatted, etc.
  DATETIME_CATEGORY,       // now.date, now.year, now.month, etc.
]

// Trigger-specific categories — only shown when matching trigger is active
FORM_DATA_CATEGORY         // trigger.form.name, trigger.submissionData.*
PIPELINE_TICKET_CATEGORY   // trigger.ticket.id, trigger.fromLane.name, etc.
PAYMENT_CATEGORY           // trigger.payment.amount, trigger.payment.currency
APPOINTMENT_CATEGORY       // trigger.appointment.title, trigger.appointment.startTime

// Maps each trigger type to which categories are available
export const TRIGGER_CATEGORY_MAP: Record<AutomationTriggerType, VariableCategory[]>
```

### Adding a New Variable

To add a new variable, update **only** `src/lib/variables/variable-categories.ts`:

1. Add to an existing category's `variables` array, or
2. Create a new `VariableCategory` and add it to the relevant entries in `TRIGGER_CATEGORY_MAP`

Both the email-builder and automation-builder pickers will automatically pick up the change.

### AutomationVariablePicker Component

Located at `_components/automation-variable-picker.tsx`. This is the context-aware picker used next to text inputs in action configs.

**Key behavior:**
- Reads the current trigger type from `useAutomationBuilder()` context
- Looks up `TRIGGER_CATEGORY_MAP[triggerType]` to show only relevant categories
- Falls back to `SHARED_CATEGORIES` if no trigger is configured
- Multi-level browser UI: Categories → Category Detail (with search)
- Also supports custom data fields via `trpc.customData.listCategories`
- Inserts `{{variable.key}}` at cursor position in the target field

**Usage in action configs:**
```tsx
import { AutomationVariablePicker } from '../../automation-variable-picker'

// Place next to any text input that supports variables
<div className="flex items-center justify-between">
  <Label>Field Label</Label>
  <AutomationVariablePicker onInsert={handleInsertVariable} />
</div>
<Input ref={inputRef} value={...} onChange={...} />
```

**Variable insert handler pattern:**
```typescript
const handleInsertVariable = (variable: string) => {
  const input = inputRef.current
  const currentValue = config.someField ?? ''
  if (input) {
    const start = input.selectionStart ?? currentValue.length
    const end = input.selectionEnd ?? currentValue.length
    const newValue = currentValue.slice(0, start) + variable + currentValue.slice(end)
    onChange({ ...config, someField: newValue })
    setTimeout(() => {
      input.focus()
      input.setSelectionRange(start + variable.length, start + variable.length)
    }, 0)
  } else {
    onChange({ ...config, someField: currentValue + variable })
  }
}
```

### Which Action Configs Use the Picker

| Config | Picker Fields |
|--------|--------------|
| `action-send-email.tsx` | Subject override |
| `action-send-notification.tsx` | Title, body |
| `action-call-webhook.tsx` | URL, body, header values |
| `action-create-pipeline-ticket.tsx` | Title, description, value |
| `action-update-lead.tsx` | Each field value row |

### Available Data Sections in Node Configs

Each trigger and action config also includes a static "Available data" reference section that lists the variables that node provides or can use. This helps users quickly see what data is available without opening the picker.

## Run History / Activity Tab

The Activity tab in the automation builder shows real-time run history for the automation.

### Run History Endpoint
```typescript
automation.getRunHistory({
  organizationId: string
  automationId: string
  limit?: number     // default: 50
  cursor?: string    // pagination cursor
})
// Returns: { runs, nextCursor }
```

### Run Data Structure
```typescript
interface AutomationRun {
  id: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  startedAt: Date
  completedAt?: Date
  error?: string
  triggerData: {
    type: string
    entityId?: string
    entityName?: string
  }
  steps: AutomationRunStep[]
}

interface AutomationRunStep {
  id: string
  nodeId: string
  nodeName: string
  actionType: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  startedAt?: Date
  completedAt?: Date
  durationMs?: number
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  error?: string
  branchTaken?: 'yes' | 'no'  // For condition nodes
}
```

### UI Components
- `RunHistoryPanel` - Main activity tab content
- Shows list of runs with status, trigger info, and timing
- Expandable to show individual step details
- Real-time updates via polling (5s interval)
- Empty state when no runs exist

### Features
- Status badges (running, completed, failed)
- Duration display (e.g., "2.3s", "1m 23s")
- Relative timestamps ("2 minutes ago")
- Step-by-step execution details
- Error messages for failed runs
- Branch path highlighting for conditions

## Key Patterns

### Optimistic Updates
All list mutations use optimistic updates:
```typescript
onMutate: async ({ automationId }) => {
  await utils.automation.list.cancel()
  const previousData = utils.automation.list.getData(queryKey)
  utils.automation.list.setData(queryKey, (old) => {
    // Update optimistically
  })
  return { previousData }
},
onError: (err, _input, context) => {
  // Rollback on error
  utils.automation.list.setData(queryKey, context.previousData)
}
```

### Loading States
- `isLoading` - Initial load, shows skeleton rows
- `isFetching` - Background refetch, shows opacity
- Never show full page skeleton if cached data exists

### Type Safety
- All node configs are strongly typed
- Discriminated unions for config types
- Zod validation on tRPC inputs

## Database Schema

### Automation Model
```prisma
model Automation {
  id             String @id @default(cuid())
  organizationId String
  name           String
  description    String?
  slug           String?           // URL-safe identifier
  status         AutomationStatus  @default(DRAFT)
  triggerType    AutomationTriggerType
  triggerConfig  Json?
  schema         Json              @default("{\"nodes\":[],\"edges\":[]}")
  totalRuns      Int               @default(0)
  successfulRuns Int               @default(0)
  failedRuns     Int               @default(0)
  lastRunAt      DateTime?
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt

  organization   Organization      @relation(...)
  runs           AutomationRun[]

  @@unique([organizationId, slug])
  @@index([organizationId])
  @@index([organizationId, status])
  @@index([organizationId, triggerType])
}
```

---

## Folder Organization (Implemented)

Automations support folder organization using the **Email Templates pattern** (URL-based state management) for consistency.

### Database Schema

```prisma
model AutomationFolder {
  id             String @id @default(cuid())
  organizationId String
  name           String    // Display name (e.g., "Lead Nurturing", "Onboarding")
  color          String?   // Hex color for UI (e.g., "#3b82f6")
  parentId       String?   // Self-referencing for nested folders
  parent         AutomationFolder?  @relation("AutomationFolderHierarchy", ...)
  children       AutomationFolder[] @relation("AutomationFolderHierarchy")
  automations    Automation[]
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  organization   Organization @relation(...)
  @@index([organizationId])
  @@index([organizationId, parentId])
  @@map("automation_folder")
}

// Automation model has:
model Automation {
  folderId String?
  folder   AutomationFolder? @relation(fields: [folderId], references: [id], onDelete: SetNull)
  @@index([organizationId, folderId])
}
```

### tRPC Folder Endpoints

All endpoints defined in `src/trpc/routers/automation.ts`, service logic in `src/services/automation-folder.service.ts`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `automation.listFolders` | Query | List folders at a level (parentId: null=root, undefined=all) |
| `automation.getAllFolders` | Query | Get all folders for the org (flat list) |
| `automation.getFolderBreadcrumb` | Query | Get breadcrumb path from root to folder |
| `automation.createFolder` | Mutation | Create folder (name, color, parentId) |
| `automation.updateFolder` | Mutation | Update folder name/color |
| `automation.deleteFolder` | Mutation | Hard delete folder, moves automations to root |
| `automation.moveToFolder` | Mutation | Move single automation to folder (null=root) |
| `automation.bulkMoveToFolder` | Mutation | Bulk move automations to folder |

### URL State Management

```typescript
// Folder navigation uses URL query params: ?folder=cuid
const currentFolderId = searchParams.get('folder') || null
// List endpoint filters by folderId (null=root, undefined=all)
```

---

## Email Sending (send_email Action)

The `send_email` action supports two modes: **template** and **body**.

### Two Modes

**Template Mode** — References an existing email template by ID:
```typescript
// Config: { mode: 'template', templateId: 'cuid...', fromEmail: '...', fromName: '...' }
// Flow: Renders template with lead data → applies trigger variables → sends via Resend
```

**Body Mode** — Inline plain text subject/body with `{{variable}}` interpolation:
```typescript
// Config: { mode: 'body', subject: '...', body: '...', fromEmail: '...', fromName: '...' }
// Flow: Interpolates subject/body with variable context → sends via Resend
```

### Required Fields

Both modes require:
- `fromEmail` — Sender email address (validated, throws if missing)
- `fromName` — Sender display name (validated, throws if missing)

### Execution Flow

```
executeSendEmail() (execution-task.ts)
   │
   ├── Template mode:
   │   ├─> renderTemplateForLead() (email-template.service.ts)
   │   │   └─> Fetches template, interpolates lead variables
   │   └─> sendMarketingEmail() with rendered HTML
   │
   └── Body mode:
       ├─> interpolate(subject, context)
       ├─> interpolate(body, context)
       └─> sendMarketingEmail() with interpolated text

Common → sendMarketingEmail() (email.service.ts)
   ├─> resend.emails.send()
   └─> chargeForEmail() for billing (tier-aware PAYG pricing)
```

### Reusable Code Reference

**Email Services:**
- `src/services/email-template.service.ts` — `renderTemplateForLead()`, `blocksToHtml()`
- `src/services/email.service.ts` — `sendMarketingEmail()`, `getVerifiedEmailDomain()`

**Variable System:**
- `src/lib/variables/variable-categories.ts` — Single source of truth for variable categories + TRIGGER_CATEGORY_MAP
- `src/lib/variables/context-builder.ts` — `buildVariableContext()` builds context from trigger data
- `src/lib/variables/interpolate.ts` — `{{variable}}` interpolation engine

---

## Automation Execution Architecture

### Trigger.dev Integration

Automations execute via Trigger.dev tasks for reliable async processing:

```
Trigger Event (webhook/form/etc)
        │
        ▼
automation.service.ts::triggerAutomation()
        │
        ├─> Creates AutomationRun (status: PENDING)
        ├─> dispatchToTriggerDev() → automationExecutionTask.trigger()
        │
        ▼
Trigger.dev Cloud → Routes to your dev worker
        │
        ▼
execution-task.ts::automationExecutionTask
        │
        ├─> Process trigger node (no-op)
        ├─> Walk graph using findNextNode(edges, nodeId)
        ├─> Execute action nodes sequentially
        ├─> Handle conditions (branch via findNextNodeByBranch)
        ├─> Handle wait_delay (Trigger.dev wait.for())
        ├─> Handle wait_for_event (pause with token, resume later)
        └─> Update AutomationRun steps and status
```

### Key Files

| File | Purpose |
|------|---------|
| `src/services/automation.service.ts` | `triggerAutomation()`, `resumeWaitingAutomationsByEvent()`, run management |
| `src/lib/trigger/automation/execution-task.ts` | Main Trigger.dev task, node execution, action executors |
| `src/lib/trigger/automation/appointment-started-scheduler.ts` | Event-driven delayed task for appointment start events |
| `src/lib/variables/context-builder.ts` | Builds variable context from trigger data |
| `src/trpc/routers/automation.ts` | CRUD operations, folder management, run history |
| `src/services/automation-folder.service.ts` | Folder CRUD operations |

### Action Execution Functions

Each action type has a dedicated execution function in `execution-task.ts`:

```typescript
switch (actionType) {
  case 'send_email':         return executeSendEmail(data, context, payload)      // Template or body mode
  case 'add_tag':            return executeAddTag(data, context, payload)
  case 'remove_tag':         return executeRemoveTag(data, context, payload)
  case 'create_pipeline_ticket': return executeCreatePipelineTicket(data, context, payload)
  case 'update_pipeline_ticket': return executeUpdatePipelineTicket(data, context, payload)
  case 'wait_delay':         return executeWaitDelay(data)                        // Trigger.dev wait.for()
  case 'wait_for_event':     return executeWaitForEvent(data, payload)            // Deterministic token
  case 'send_notification':  return executeSendNotification(data, context, payload)
  case 'call_webhook':       return executeCallWebhook(data, context)
}
```

### Wait-for-Event Pattern (Deterministic Tokens)

The `wait_for_event` node pauses automation execution until an external event fires (e.g., appointment started).

**Token format is deterministic** so external events can find waiting runs via prefix search:

```typescript
// Appointment events — token format: appt_start:{bookingId}:{runId}
// External event uses startsWith('appt_start:{bookingId}:') to find ALL waiting runs
waitTokenId = `appt_start:${appointmentId}:${payload.runId}`

// Email events — generic format
waitTokenId = `email_${eventType}:${payload.runId}_${Date.now()}`
```

**How resumption works:**
1. `wait_for_event` node returns `{ action: 'wait', waitTokenId }`
2. Main execution loop saves `waitTokenId` and `currentNodeId` (next node after wait) to the run
3. Run status set to `WAITING`
4. When external event fires, `resumeWaitingAutomationsByEvent(tokenPrefix, eventData)` finds matching runs
5. Matching runs are dispatched back to the execution task to continue from `currentNodeId`

### Appointment Started Task (Event-Driven)

**File:** `src/lib/trigger/automation/appointment-started-scheduler.ts`

Previously used a cron job polling every minute. Now uses an event-driven delayed task:

```
createBooking() in booking-calendar.service.ts
        │
        ├─> appointmentStartedTask.trigger({ delay: booking.startTime })
        │   (Fires at exactly the booking's start time)
        │
        ▼ (at start time)
appointmentStartedTask runs:
        │
        ├─> Verify booking still CONFIRMED (defense-in-depth)
        ├─> Look up lead by bookerEmail (may be created after booking)
        ├─> resumeWaitingAutomationsByEvent('appt_start:{bookingId}:', ...)
        │   (Resumes any waiting automations)
        └─> triggerAutomation('APPOINTMENT_STARTED', ...)
            (Legacy pattern for backwards compatibility)
```

**Cancellation:** When a booking is cancelled, the scheduled run is cancelled via `runs.cancel(scheduledStartRunId)`.

### Variable Interpolation

Variables use `{{variable}}` syntax with optional formatters and defaults:

```typescript
// Example: {{lead.firstName|upper|default:Customer}}
// 1. Get value: lead.firstName
// 2. Apply formatter: upper (uppercase)
// 3. Apply default if empty: "Customer"

const interpolate = (text: string, context: VariableContext): string => {
  return text.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const [varPath, ...modifiers] = path.split('|')
    let value = getNestedValue(context, varPath.trim())

    for (const mod of modifiers) {
      if (mod.startsWith('default:')) {
        if (!value) value = mod.slice(8)
      } else {
        value = applyFormatter(value, mod)
      }
    }

    return value ?? ''
  })
}
```

### Condition Evaluation

```typescript
// condition-evaluator.ts
interface Condition {
  field: string        // Variable path (e.g., "lead.tags")
  operator: ConditionOperator
  value: unknown       // Comparison value
}

type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | 'less_than'
  | 'is_empty'
  | 'is_not_empty'
  | 'starts_with'
  | 'ends_with'
```

### Trigger.dev Dev Environment

Each developer needs their **own** `TRIGGER_SECRET_KEY` (`tr_dev_...`) in `.env`. This key determines which dev worker receives task executions. If you share a key with another developer, tasks will route to their machine (wrong database, wrong code version).

Get your personal key from the Trigger.dev dashboard → your project → Development environment → API keys.
