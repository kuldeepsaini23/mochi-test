# Template System — Feature Checklist

> This document tracks ALL features for the Template System. Not technical requirements — just features. Check them off as they're built.

---

## 1. Template Library Modal (Single Source of Truth)

- [x] **Universal browse component** — works as public `/templates` page and authenticated `/marketplace` dashboard page using the same TemplateBrowseView
- [x] **Category navigation sidebar** — left panel with template categories (desktop sidebar + mobile dropdown):
  - [x] Websites
  - [x] Emails
  - [x] Automations
  - [x] Blueprints (full org systems)
- [x] **Template content area** — grid showing templates for selected category with sort options (newest, popular, name)
- [x] **Search & filter** — users can search templates within a category, URL-synced for shareability
- [x] **Template preview card** — portrait aspect-[3/4] cards with template name, thumbnail, org name
- [x] **Template detail view** — full-page detail with description (Lexical rich text), tags, "What's Included" item list, version info
- [x] **Install/download button** — 3-state smart button (Sign in / Install / Installed)
- [x] **Upload button** — create template wizard accessible from marketplace area

---

## 2. Template Categories

- [x] **Website templates** — single page or multi-page websites
- [x] **Website bundles** — websites packaged with their dependencies (CMS, products, forms, etc.) via dependency bundling
- [x] **Email templates** — single email designs
- [ ] **Email bundles** — email sets (e.g., a sequence of emails)
- [x] **Automation templates** — single automation workflows
- [x] **Automation bundles** — automations with their connected forms, emails, etc. via dependency bundling
- [x] **Blueprints** — full organization systems (multiple features bundled together) — category exists with install support

---

## 3. Template Upload / Publishing Flow

- [x] **"Create Template" entry point** — 4-step wizard: Select Feature → Review Dependencies → Add Metadata → Confirm & Publish
- [x] **Template metadata form** — name, description (Lexical rich text editor), tags (max 10), thumbnail (via StorageBrowserModal)
- [x] **Dependency detection** — system automatically scans via dependency-scanner.ts for connected/dependent features
- [x] **Dependency notification UI** — step showing total count of dependencies with human-readable messaging, auto-advances if none found
- [x] **Three bundling options:**
  - [x] **Yes, bundle all** — automatically includes all detected dependencies (PackageCheck icon)
  - [x] **No, just the main item** — only the selected item (PackageX icon)
  - [x] **Choose which to attach** — user sees a list and selects specific dependencies to include (ListChecks icon)
- [x] **Dependency selection UI** — recursive checkbox tree with indentation showing full dependency hierarchy
- [x] **Dependency type labels** — each dependency labeled with category icon + name from TEMPLATE_CATEGORY_META, reason text explaining the link
- [x] **Data safety filtering** — snapshot-sanitizer.ts automatically strips PII, Stripe IDs, leads, messages before bundling (see Section 7)
- [x] **Upload confirmation** — final review screen showing template summary, dependency choices, CMS data inclusion status
- [x] **Upload to template library** — "Save & Publish" sets status to PUBLISHED, "Save as Draft" keeps as DRAFT

---

## 4. Template Download / Install Flow

- [x] **Browse templates** — users can browse via public `/templates` or authenticated `/marketplace` with category filtering, search, and sort
- [x] **Template info display** — detail page shows everything included: main item + all bundled dependencies with names and types
- [x] **Install button** — 3-state button: "Sign in to Install" / "Install Template" / "Installed" (disabled)
- [x] **Dependency opt-out on install** — install dialog shows checkbox list of all template items:
  - [x] Install everything (all checked by default)
  - [x] Choose which dependencies to include (main item always required, deps toggleable)
- [x] **Clear labeling** — main item marked as "Required" and always checked, dependency items clearly differentiated
- [x] **Install progress indicator** — loading spinner with "Installing..." text, disabled buttons during install
- [x] **Install confirmation** — success dialog with green icon, "N items installed successfully" message, Done button
- [x] **Error handling** — error state with alert styling, error message display, "Retry Install" button

---

## 5. Dependency Detection System

- [ ] **Website dependencies detected:**
  - [x] Connected CMS tables (smartcms-list elements, component CMS bindings, dynamic pages)
  - [x] Connected products / prices (payment elements, add-to-cart buttons)
  - [x] Connected forms (form elements on canvas)
  - [ ] Connected automations (not detected from website side — only detected when scanning automations)
  - [ ] Connected email templates (not detected from website side — only via automation action scanning)
- [ ] **Automation dependencies detected:**
  - [x] Trigger-connected forms (formId in trigger config)
  - [x] Action-connected email templates (emailTemplateId in action config)
  - [x] Action-connected forms (formId in action config)
  - [ ] Other connected automations (sub-automations not detected)
- [ ] **Email dependencies detected:**
  - [ ] Connected template variables / dynamic content sources (emails treated as leaf nodes)
- [ ] **Blueprint dependencies detected:**
  - [ ] All websites and their sub-dependencies
  - [ ] All automations and their sub-dependencies
  - [ ] All email templates
  - [ ] All forms
  - [ ] All products / prices
  - [ ] All CMS tables and schemas (NOT data rows with confidential info)
  - [ ] All pipelines / pipeline stages (NOT tickets with lead data)
- [x] **Recursive dependency walking** — if A depends on B and B depends on C, all are detected via recursive tree traversal
- [x] **Circular dependency handling** — visited Set prevents infinite loops in cyclic references

---

## 6. Template Origin Tracking (Anti-Plagiarism)

- [x] **Origin hash/metadata on install** — SHA-256 fingerprint stored in TemplateOriginMarker model, linked per feature
- [x] **Marker persists on duplication** — propagateOriginMarker() copies markers when features are duplicated
- [x] **Block re-bundling** — checkOriginMarker() + templates.checkOrigin tRPC procedure blocks re-publishing
- [x] **Block re-bundling of duplicates** — propagated markers block duplicates from being bundled too
- [x] **Origin tracking across all item types** — all feature types supported via TemplateOriginMarker model
- [x] **Tamper resistance** — stored in separate TemplateOriginMarker table (not on the feature itself), linked by featureType + featureId
- [x] **Clear user messaging** — TemplateOriginBlocked component shows warning: "This item was installed from a template and cannot be re-published"

---

## 7. Data Safety & Security (Confidential Data Filtering)

- [x] **Lead data NEVER included** — no lead records, contact info, or personal data in any snapshot
- [x] **Message data NEVER included** — chat widget snapshots capture config & FAQs only, not conversations
- [x] **Invoice data NEVER included** — product/price snapshots exclude all Stripe payment IDs and invoice references
- [x] **Team member personal info NEVER included** — booking calendars strip assignees, pipelines strip ticket assignees
- [x] **Payment details NEVER included** — stripeProductId, stripePriceId removed (regenerated on install)
- [x] **Calendar team member assignments stripped** — booking snapshot excludes defaultAssigneeId and assignees array
- [x] **Pipeline tickets stripped** — pipeline stages/lanes included, individual tickets with lead data excluded
- [x] **CMS row data filtered** — schema/columns always included, row data only if user explicitly opts in via includeCmsRows flag
- [x] **Automation node user-specific config stripped** — node structure preserved, no user IDs or API keys
- [ ] **Audit trail** — stripping logic documented in code comments throughout snapshot-sanitizer.ts, but no formal log saved

---

## 8. UI/UX Requirements

- [x] **Consistent component across all entry points** — same TemplateBrowseView used on public and dashboard routes
- [x] **Entry point: Sidebar template library** — "Marketplace" link in main sidebar with LayoutTemplate icon
- [ ] **Entry point: Website builder "Create from template"** — not yet added to website builder
- [ ] **Entry point: Email builder "Create from template"** — not yet added to email builder
- [ ] **Entry point: Automation builder "Create from template"** — not yet added to automation builder
- [x] **Entry point: Any future builder** — architecture supports new entry points via TemplateBrowseView with basePath prop
- [x] **Responsive design** — 4-col (xl) → 3-col (lg) → 2-col (sm) → 1-col (mobile), sidebar collapses to dropdown
- [x] **Loading states** — animated skeleton cards matching portrait aspect-ratio layout
- [x] **Empty states** — per-view messaging: "No templates found", "You haven't created any templates yet", "No installed templates yet"
- [ ] **Error states** — install dialog has error UI with retry, but browse/grid views lack query error boundaries

---

## 9. Template Versioning & Management

- [x] **Template listing for org** — My Templates tab shows all templates created by the organization with search and pagination
- [x] **Delete template** — permanent hard delete from My Templates view
- [x] **Update template** — Republish button re-snapshots the source feature and bumps version number
- [x] **Template metadata editing** — Edit button on detail page opens wizard overlay for updating name, description, tags, thumbnail

---

## 10. Blueprint-Specific Features

- [ ] **Full org system bundling** — service layer supports multi-feature bundling but no dedicated blueprint creation UI
- [x] **Blueprint contents preview** — install dialog shows all items with names and feature type icons
- [x] **Selective blueprint install** — checkbox toggles for each item (main item required, dependencies optional)
- [x] **Cross-feature linking preserved** — remapInstalledFeatureData() updates all references (canvas form IDs, CMS table IDs, automation triggers)
- [x] **ID remapping on install** — full remap system with remapTable (oldId → newId), two-pass approach for nested references

---

## 11. Template Pricing

- [ ] **Pricing step in create wizard** — after metadata, user chooses "Free" or "Paid" for their template
- [ ] **Free by default** — templates are free unless the creator explicitly sets a price
- [ ] **Price input** — when "Paid" is selected, user enters a price amount
- [ ] **Currency from org's Stripe account** — price is always in the creator's connected Stripe account currency (no hardcoded USD)
- [ ] **Price displayed on template cards** — browse grid shows price badge on paid templates
- [ ] **Price displayed in template detail view** — full detail page shows the price prominently
- [ ] **Price shown in wizard preview card** — live preview updates as user sets pricing
- [ ] **Free templates unchanged** — free templates install exactly as before, no payment flow

---

## 12. Template Approval Workflow (Portal)

- [ ] **Paid templates require approval** — when a paid template is published, it goes to "Pending Approval" status instead of going live immediately
- [ ] **Free templates skip approval** — free templates publish instantly (no change to existing behavior)
- [ ] **Auto-approve toggle** — portal admin can toggle auto-approve ON so paid templates go live without manual review
- [ ] **Portal templates page** — new page at `/portal/templates` showing all templates awaiting approval
- [ ] **Approval review cards** — each pending template shows name, description, price, category, creator org, and submission date
- [ ] **Approve button** — portal admin approves a template, making it live in the marketplace
- [ ] **Reject button** — portal admin rejects a template, sending it back to draft with optional reason
- [ ] **Email notification on submission** — when a paid template is submitted for approval (and auto-approve is OFF), a transactional email is sent to the platform admin
- [ ] **Pending Approval status pill** — creator sees amber "Pending Approval" badge on their template in "My Templates"
- [ ] **Portal nav entry** — "Templates" link added to portal navigation under Management section

---

## 13. Template Purchasing

- [ ] **"Buy" button on paid templates** — replaces "Install" button when a template has a price
- [ ] **Buyers must be on a paid plan** — free-tier users see "Upgrade to Buy" instead of the buy button
- [ ] **Payment dialog** — card input form (same style as onboarding payment) for entering payment details
- [ ] **One-click purchase flow** — enter card → pay → template is automatically installed
- [ ] **Transaction recorded on owner's account** — payment creates a proper Transaction record on the template creator's org (appears in their dashboard)
- [ ] **Platform fees applied** — platform takes a tier-based fee from each sale (same fee structure as other payments)
- [ ] **Payment goes to creator's Stripe** — money is deposited into the template creator's connected Stripe account
- [ ] **Already purchased state** — if buyer already installed the template, button shows "Installed" (disabled)
- [ ] **Purchase error handling** — card declined, network errors, etc. shown inline with retry option

---

## 14. Future Considerations (Not Built Now)

- [ ] **Template ratings & reviews** — users can rate and review templates
- [ ] **Template analytics** — track how many times a template has been downloaded/installed
- [ ] **Template versioning with changelogs** — publish new versions with release notes
- [ ] **Template permissions** — control who can publish templates (role-based)
- [ ] **Multi-currency price display** — show converted prices for buyers in different currencies

---

## Progress Summary

| Section | Items | Completed | Status |
|---------|-------|-----------|--------|
| 1. Library Modal | 8 | 8 | Complete |
| 2. Categories | 7 | 6 | In Progress |
| 3. Upload Flow | 12 | 12 | Complete |
| 4. Download Flow | 8 | 8 | Complete |
| 5. Dependency Detection | 8 | 8 | Complete |
| 5a. Website Deps | 5 | 3 | In Progress |
| 5b. Automation Deps | 4 | 3 | In Progress |
| 5c. Email Deps | 1 | 0 | Not Started |
| 5d. Blueprint Deps | 7 | 0 | Not Started |
| 6. Origin Tracking | 7 | 7 | Complete |
| 7. Data Safety | 10 | 9 | In Progress |
| 8. UI/UX | 10 | 6 | In Progress |
| 9. Versioning & Management | 4 | 4 | Complete |
| 10. Blueprint-Specific | 5 | 4 | In Progress |
| 11. Template Pricing | 8 | 0 | Not Started |
| 12. Approval Workflow | 10 | 0 | Not Started |
| 13. Template Purchasing | 9 | 0 | Not Started |
| 14. Future (Not Now) | 5 | 0 | Deferred |
| **TOTAL** | **128** | **78** | **61% Complete** |
