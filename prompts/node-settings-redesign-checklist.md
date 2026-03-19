# Node Settings Redesign Checklist

## Design Rules (Applied to ALL config components)

- **Inputs**: `h-9 rounded-xl bg-accent dark:bg-background/20 border-0 text-sm`
- **Selects**: borderless, muted bg, `rounded-xl bg-accent dark:bg-background/20 border-0`
- **Labels**: `text-xs text-muted-foreground`
- **Errors**: `text-destructive` (not hardcoded `text-red-500`)
- **Error rings**: `ring-1 ring-destructive/30` (not `border-red-500`)
- **Info boxes**: `bg-accent dark:bg-background/20 rounded-xl` (not `bg-muted/50 rounded-lg`)
- **Warning/tip boxes**: use `bg-accent` tones, no hardcoded blue/amber colors
- **Remove**: verbose helper descriptions under every input
- **Remove**: filler "use case" and "this action will:" sections
- **Remove**: Description field from properties drawer
- **Keep**: "Available data" sections (useful) but restyle to match theme

---

## Group 1 — Drawer + Simple Triggers

- [x] `properties-drawer.tsx` — remove Description field + separator clutter
- [x] `trigger-form-submitted.tsx` — restyle dropdown + info box
- [x] ~~`trigger-lead-created.tsx`~~ — **REMOVED** (trigger type deleted from app)
- [x] ~~`trigger-tag-added.tsx`~~ — **REMOVED** (trigger type deleted from app)
- [x] ~~`trigger-tag-removed.tsx`~~ — **REMOVED** (trigger type deleted from app)

## Group 2 — Remaining Triggers

- [x] `trigger-payment-completed.tsx` — restyle product/price cascading + amount/currency + info box
- [x] `trigger-pipeline-ticket-moved.tsx` — restyle pipeline/stage cascading
- [x] `trigger-appointment-scheduled.tsx` — restyle
- [x] `trigger-appointment-started.tsx` — restyle
- [x] ~~`trigger-email-clicked.tsx`~~ — **REMOVED** (trigger type deleted from app)

## Group 3 — Simple Actions

- [x] `action-add-tag.tsx` — restyled: removed Label, filler preview, verbose helper text, text-red-500 → text-destructive
- [x] `action-remove-tag.tsx` — restyled: same as add-tag
- [x] `action-wait-delay.tsx` — restyled: removed preview/use-cases boxes, applied rounded-xl bg-accent inputs/selects
- [x] `action-wait-for-event.tsx` — replaced with "Coming soon" placeholder

## Group 4 — Complex Actions

- [x] `action-send-email.tsx` — restyled: removed Label, verbose helpers, text-red-500 → text-destructive, ring-1 ring-destructive/30 errors, rounded-xl bg-accent inputs/selects
- [x] ~~`action-update-lead.tsx`~~ — **REMOVED** (action type deleted from app)
- [x] `action-send-notification.tsx` — restyled: removed Label, verbose helpers, hardcoded preview section, text-red-500 → text-destructive, rounded-xl bg-accent inputs/selects/textarea
- [x] `action-call-webhook.tsx` — restyled: removed Label, verbose helpers, hardcoded amber warning → bg-accent info box, text-red-500 → text-destructive, rounded-xl bg-accent all inputs/selects/textarea

## Group 5 — Conditions + Pipeline Actions

- [ ] `condition-if-else.tsx` — restyle dynamic rules, AND/OR, info boxes
- [ ] `action-create-pipeline-ticket.tsx` — restyle pipeline/stage selects
- [ ] `action-update-pipeline-ticket.tsx` — restyle pipeline/stage selects

---

## Trigger Types Cleanup (Completed)

6 trigger types were fully removed from the entire codebase (types, schemas, registry, UI, services, variable system, execution, docs):

**Removed:**
- `lead_created` / `LEAD_CREATED`
- `lead_updated` / `LEAD_UPDATED`
- `tag_added` / `TAG_ADDED`
- `tag_removed` / `TAG_REMOVED`
- `email_opened` / `EMAIL_OPENED`
- `email_clicked` / `EMAIL_CLICKED`

**Remaining trigger types (5 total):**
- `form_submitted` — Form submission trigger
- `pipeline_ticket_moved` — Pipeline stage change trigger
- `payment_completed` — Payment/checkout trigger
- `appointment_scheduled` — Calendar booking trigger
- `appointment_started` — Appointment start time trigger

**Files deleted:**
- `trigger-lead-created.tsx`
- `trigger-tag-added.tsx`
- `trigger-tag-removed.tsx`
- `trigger-email-clicked.tsx`

**Note:** `email_opened` / `email_clicked` still exist as event types inside the `wait_for_event` action — these are action-internal values, not trigger types.
