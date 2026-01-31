# Games Checklists - Claude Context

## Overview

**Games Checklists** is a Google Apps Script-based interactive checklist application designed for tracking complex tasks with prerequisite dependencies. Originally created to track video game completions (achievements, side quests, collectibles), it features dynamic availability tracking, hierarchical metadata, conditional formatting, and customizable filtering.

**Live Demo**: https://docs.google.com/spreadsheets/d/1AwFklc_45IzYA6WjUxCa3H6QuOnpHbW_59fGcG8Sb9A/edit?usp=sharing

## Technology Stack

- **Language**: TypeScript (compiled to Google Apps Script)
- **Runtime**: Google Apps Script (JavaScript V8)
- **Platform**: Google Sheets
- **Build Tool**: clasp (Command Line Apps Script Projects)
- **Package Manager**: npm/yarn

## Core Concepts

### Checklist Structure

Each checklist is a Google Sheet with the following row types:

1. **TITLE** - Displays checklist title and aggregate statistics
2. **SETTINGS** - Interactive settings row with dropdowns for view modes and actions
3. **QUICK_FILTER** (optional) - Row for filtering columns with regex or dropdown selection
4. **HEADERS** - Column headers defining the checklist structure
5. **Data Rows** - Individual checklist items

### Standard Columns

- **✓ (CHECK)** - Checkbox column for marking items complete
- **Type** - Categorizes items (Quest, Achievement, Collectible, etc.)
- **Item** - The item name/description
- **Pre-Reqs** - Newline-separated list of prerequisite items that must be completed first
- **Notes** - Additional information or warnings
- **Available** (hidden) - Formula-calculated status column

### Item Status States

- **CHECKED** - Item completed (checked off)
- **AVAILABLE** - Item ready to complete (all pre-reqs met)
- **PR_NOT_MET** - Prerequisites not yet completed
- **MISSED** - Item permanently unavailable due to conflicting choice
- **PR_USED** - Item skipped/not chosen when alternative was selected
- **UNKNOWN** - Circular dependency, availability uncertain
- **ERROR** - Formula calculation error

### Metadata System

The **Meta Sheet** is a companion sheet that defines:

- **Value Lists**: Valid values for dropdown columns (Type, custom metadata)
- **Formatting Rules**: Cell colors, fonts, styles applied based on values
- **Parent Hierarchies**: Multi-level categorization using `PARENT(ColumnName)` syntax
- **Links & Notes**: Rich text links and hover notes for metadata values
- **Auto-sync**: New values in checklist automatically added to meta sheet

Meta columns can format multiple checklist columns using syntax: `ColumnName[AdditionalColumn1, AdditionalColumn2]`

### Prerequisites System

The Pre-Reqs column supports advanced dependency logic:

- **Basic**: List item names (newline-separated) that must be checked
- **MISSED {item}**: Creates mutual exclusivity - choosing one marks others as missed
- **AND/OR**: Logical operators for complex dependencies
- **Comparisons**: GT/LT operators for numeric comparisons
- **PERSIST**: Items remain checked even when checklist is reset
- **Pre-Req Links**: Hyperlinks to related items for easy navigation

The status formulas are automatically generated and dynamically update as items are checked.

## Architecture

### Namespace Organization

The codebase uses TypeScript namespaces for organization:

- **ChecklistApp** - Core checklist logic and Checklist class
- **ChecklistMeta** - Metadata sheet management
- **Settings** - Settings system and UI controls
- **Status** - Status formula generation and validation
- **Formula** - Formula building utilities with pretty-printing

### Key Classes

#### SheetBase (ChecklistApp.SheetBase)
Base class providing common sheet operations:
- Range manipulation (getRange, getColumnDataRange, etc.)
- Value read/write operations
- Filter management
- Row/column helpers
- Column-by-header lookup

#### Checklist (ChecklistApp.Checklist)
Main checklist controller extending SheetBase:
- Event handlers (onOpen, onEdit, onChange)
- Structure management (ensure columns/rows exist)
- Data validation setup
- Conditional formatting rules
- Filter operations
- Reset/refresh operations
- Settings integration
- Meta sheet synchronization

Singleton pattern: Retrieved via `Checklist.fromSheet(sheet)` or `Checklist.fromEvent(event)`

#### MetaSheet (ChecklistMeta.MetaSheet)
Metadata sheet manager:
- Parses meta columns and values
- Tracks parent/child hierarchies
- Syncs formatting to checklist
- Generates data validation dropdowns
- Manages conditional formatting rules
- Updates links and notes

Singleton pattern: Retrieved via `MetaSheet.fromChecklist(checklist)`

#### ChecklistSettings (Settings.ChecklistSettings)
Settings manager:
- View mode (All, Available, Condensed, Remaining, Completed, Missed)
- Column visibility (Notes, Pre-Reqs, Blanks)
- Editing mode toggle
- Quick Filter toggle
- Actions (Refresh, Reset, Sync Meta)

### Event Flow

**onOpen**:
1. Populate settings dropdowns
2. Ensure total formulas exist

**onEditSimple** (fires first, faster):
1. Check for quick checkbox toggle optimization
2. Handle quick filter changes
3. Handle settings changes (left side only)
4. Mark edited cells

**onEditInstallable** (fires second, more powerful):
1. Handle debug commands (A1 cell hacks)
2. Handle settings changes (right side)
3. Sync notes from Notes column to Item column
4. Handle meta sheet edits

**onChangeSimple**:
1. Ensure filter size matches sheet size after insertions

## File Structure

```
/src
├── appsscript.json          # Apps Script manifest
├── util.ts                  # Timing utilities
├── Formulas.ts              # Formula builder with pretty-print
├── SheetBase.ts             # Base class for sheet operations
├── ChecklistApp.ts          # Main checklist logic
├── ChecklistMeta.ts         # Metadata system
├── ChecklistSettings.ts     # Settings system
├── StatusFormulaTranslator.ts  # Pre-req formula generation
├── Triggers.ts              # Event trigger management
└── Reset.ts                 # Global reset functions
```

## Key Features

### Dynamic Filtering
- Filter by status (Available, Completed, Missed, etc.)
- Quick Filter row with regex or dropdown-based filtering
- Quick Filter supports parent/child hierarchy matching
- Hide completed items, blanks, or unavailable items

### Conditional Formatting
Color-coded visual feedback:
- Green: Checked/completed items
- Orange: Prerequisites not met
- Red: Missed items
- Purple: Not chosen (alternative selected)
- Gray: Disabled checkboxes
- Dark red background: Missable items (MISSED pre-req)
- Blue/Red text: INFO/WARN notes
- Custom colors from Meta sheet

### Formula Generation
Complex status formulas automatically generated from Pre-Reqs:
- Parses logical expressions (AND, OR, NOT)
- Handles mutual exclusivity (MISSED)
- Creates hyperlinks to prerequisite items
- Validates circular dependencies
- Updates dynamically as items are checked

### Metadata Hierarchy
PARENT() system allows multi-level categorization:
```
Type Column:        PARENT(Type):
Quest               (no parent)
Main Quest          Quest
Side Quest          Quest
Optional            (no parent)
```
Child values inherit parent formatting and are matched by Quick Filters.

### Performance Optimizations
- Caching system for frequently accessed data
- Request ID tracking to prevent stale operations
- Short-circuit evaluation for common edits
- Parallel formula evaluation where possible
- Timing instrumentation throughout

### Protection & Validation
- Sheet protection with editable ranges
- Data validation for dropdowns
- Duplicate item name detection
- Pre-req validation (items must exist)
- Formula validation to catch errors

### Reporting
Title cell displays real-time statistics:
```
R: 15/20      (Remaining: 15 available / 20 total remaining)
C: 45/50      (Completed: 45 checked / 50 total)
90%           (Completion percentage)
```

Pre-Reqs cell shows counts:
```
Missed: 2
Not Chosen: 3
Unknown: 1
```

## Development Workflow

### Setup
1. Install clasp: `npm install -g @google/clasp`
2. Login: `clasp login`
3. Clone project: `clasp clone <scriptId>`
4. Install dependencies: `npm install`

### Push Changes
```bash
clasp push
```

### Local Development
Edit TypeScript files in `/src`, then push to update the live script.

## Common Operations

### Initializing a New Checklist
1. Create data with Item column
2. Add Type, Pre-Reqs, Notes columns as needed
3. Type "reset" in A1 cell to initialize structure
4. Use Settings > Action > "Sync Meta" to create meta sheet

### Creating Meta Sheet
1. Settings > Action > "Toggle Quick Filter" (if desired)
2. Menu: Add-ons > Games Checklist > Create Meta Sheet
3. Add values to meta columns for each checklist column
4. Format meta values (colors, fonts) as desired
5. Use "Sync Meta" action to apply to checklist

### Adding Parent Hierarchies
1. In Meta sheet, add column header: `PARENT(ExistingColumn)`
2. Fill parent values for each child value
3. Sync meta to apply
4. Quick Filters will now match parent + all children

### Resetting Checklist
Type in A1:
- `refresh` - Refresh structure and formulas (keep checkboxes)
- `reset` - Reset structure (prompt to clear checkboxes)
- `FULL RESET` - Full reset including clearing all checkboxes
- `status` - Regenerate status formulas only
- `meta` - Sync meta sheet
- `link` - Regenerate pre-req hyperlinks

## Design Patterns

### Singleton Pattern
Checklists and MetaSheets are cached by sheet ID to prevent duplicate instances and state conflicts.

### Lazy Loading
Properties like `meta`, `filter`, `columnsByHeader` are computed on first access and cached.

### Builder Pattern
Formula class provides fluent API for building complex formulas with automatic pretty-printing.

### Observer Pattern
Event handlers propagate changes through the system (edit -> validation -> formatting -> filtering).

## Known Limitations

- **No ES6 module support** - Apps Script doesn't support import/export statements. This codebase uses TypeScript namespaces as a workaround instead of proper modules. Bundlers like webpack/rollup can be used if module syntax is needed.
- Google Apps Script execution time limits (6 minutes for triggers)
- Large checklists (1000+ rows) may be slow to initialize
- Formula recalculation happens on Google's servers (can lag)
- Must grant script permissions for full functionality
- Currently personal project, not production-ready for public use

## Future Considerations

- Better error handling and user feedback
- Performance optimization for large checklists
- Public release with simplified setup
- Documentation and usage guide
- Test coverage
- Migration to Google Sheets add-on format

## Tips for Working with This Codebase

1. **Read SheetBase first** - Understanding the base class is key to understanding Checklist
2. **Formula class is your friend** - Use it for any formula generation to ensure correctness
3. **Always check if filter exists** - Remove before bulk operations, recreate after
4. **Respect the singleton pattern** - Use `Checklist.fromSheet()`, don't call constructor
5. **Use timing functions** - `time(label)` and `timeEnd(label)` for performance tracking
6. **Metadata invalidates caches** - Many properties are cached, metadata changes require sync
7. **Test with small checklists first** - Apps Script timeout is real
8. **A1 cell is debug console** - Type commands for quick testing

## Example Use Cases

- **RPG Completion**: Track quests, achievements, collectibles with chapter-based filtering
- **Course Curriculum**: Prerequisites for courses, track completion
- **Project Dependencies**: Task tracking with dependency management
- **Recipe Book**: Ingredients as pre-reqs, categorize by meal type
- **Travel Planning**: Activities with seasonal/prerequisite constraints

---

**Status**: Personal project, actively maintained
**License**: Not specified
**Contact**: Via GitHub issues
