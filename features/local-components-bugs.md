# Local Components - Critical Bugs

## Bug #1: Components Not Persisted to Website Level
**Status:** Not Fixed
**Severity:** Critical

Components are currently stored only in Redux state (page-level memory). They need to be:
- Saved to the database at the WEBSITE level (not page, not domain)
- Loaded when any page of that website is opened
- Available across all pages within the same website

**Current Behavior:** Component disappears on page refresh or navigation
**Expected Behavior:** Component persists and is available on all pages of the website

---

## Bug #2: Component Creation Added to Undo/Redo History
**Status:** Not Fixed
**Severity:** High

Creating a component adds it to the canvas undo/redo stack. This is wrong because:
- Components live at website level, not canvas level
- Undoing on canvas should NOT undo component creation
- Component creation is a website-level operation, not a canvas operation

**Solution:** Bypass undo/redo when creating/deleting components. Component operations should be immediate and permanent (with their own delete confirmation).

---

## Bug #3: Child Element Styles Are Lost on Conversion
**Status:** Not Fixed
**Severity:** Critical

When converting a frame to a component:
- Only the root frame's styles are preserved
- Text element styles (font, color, size) are wiped
- Button element styles are wiped
- Image element settings are wiped
- All nested children lose their styles

**Root Cause:** The sourceTree is storing elements but styles are not being deep-cloned or are being overwritten somewhere in the conversion process.

**Expected Behavior:** All child elements retain their exact styles and properties when converted to a component.

---

## Bug #4: Instance Rendering Architecture Confusion
**Status:** Needs Clarification
**Severity:** High

Current confusion between Master vs Instance:
- **Master Component:** The actual LocalComponent definition stored at website level. Contains the sourceTree with all elements and their styles. Editing the master updates ALL instances.
- **Instance:** A ComponentInstanceElement on the canvas that REFERENCES the master. Only stores: position, size, componentId, and propValues for exposed properties.

**Key Principle:**
- Instances do NOT duplicate the master's data
- Instances only store overrides (exposed prop values)
- Rendering an instance = render master's sourceTree + apply instance's propValues

---

## Bug #5: Properties Panel Shows Wrong Controls for Instances
**Status:** Not Fixed
**Severity:** Medium

Non-master component instances should:
- NOT show Design tab (styles are controlled by master)
- ONLY show Settings tab with exposed prop controls
- Show which component they reference
- Provide "Edit Component" button to enter master editing mode

---

## Fix Priority Order

1. **Bug #3** - Fix style preservation (blocking all testing)
2. **Bug #1** - Persist to database (components useless without this)
3. **Bug #2** - Bypass undo/redo (prevents accidental data loss)
4. **Bug #5** - Fix properties panel for instances
5. **Bug #4** - Ensure rendering architecture is correct

---

## Database Schema Required

```prisma
model LocalComponent {
  id          String   @id @default(cuid())
  websiteId   String
  name        String
  description String?

  // The complete element tree (root + all children with their styles)
  sourceTree  Json

  // Exposed properties for instance customization
  exposedProps Json    @default("[]")

  // Metadata
  tags        String[] @default([])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  website     Website  @relation(fields: [websiteId], references: [id], onDelete: Cascade)

  @@index([websiteId])
}
```

Note: instanceIds are NOT stored in the database - they're computed by querying canvas elements with matching componentId.




## Use can drop an instance of a component within its parent -> this causes circular bugs. Prevent this