# Build System Documentation

## Overview

This project uses **Rollup** to bundle TypeScript ES6 modules into a single file that Google Apps Script can execute.

## Build Process

### Source Code Structure

```
src/
├── index.ts                      # Entry point (imports all modules, exports to global)
├── util.ts                       # Timing utilities
├── Formulas.ts                   # Formula builder with pretty-print
├── SheetBase.ts                  # Base class for sheet operations
├── ChecklistApp.ts               # Main checklist logic (Checklist class)
├── ChecklistMeta.ts              # Metadata system (MetaSheet class)
├── ChecklistSettings.ts          # Settings system
├── StatusFormulaTranslator.ts    # Pre-req formula generation
├── Triggers.ts                   # Event handlers (onOpen, onEdit, etc.)
├── Reset.ts                      # Reset/refresh functions
└── appsscript.json              # Apps Script manifest
```

### Build Output

```
build/
├── Code.js              # Bundled JavaScript (IIFE format)
└── appsscript.json     # Copied manifest
```

## Commands

### Build Once
```bash
npm run build
```
Compiles TypeScript and bundles into `build/Code.js`.

### Build and Deploy
```bash
npm run push
```
Builds the bundle and pushes to Google Apps Script using clasp.

### Watch Mode
```bash
npm run watch
```
Watches for file changes and rebuilds automatically.

## How It Works

### 1. Entry Point (`src/index.ts`)

The entry point imports all modules and exports them to the global scope:

```typescript
import * as ChecklistApp from './ChecklistApp';
import * as Formula from './Formulas';
// ... other imports

const g = typeof global !== 'undefined' ? global : globalThis;
g.ChecklistApp = ChecklistApp;
g.Formula = Formula;
g.onOpen = onOpen;
// ... other global exports
```

### 2. Rollup Configuration (`rollup.config.js`)

- **Input**: `src/index.ts`
- **Output**: `build/Code.js` (IIFE format)
- **Plugins**:
  - `@rollup/plugin-typescript`: Compiles TypeScript
  - `@rollup/plugin-node-resolve`: Resolves node_modules imports
  - `rollup-plugin-cleanup`: Removes comments
  - Custom plugin: Copies `appsscript.json` to build directory

### 3. TypeScript Configuration (`tsconfig.json`)

- **Module**: ES2015 (ES6 modules)
- **Target**: ES2019 (Google Apps Script V8 runtime)
- **Module Resolution**: Node

### 4. Clasp Configuration (`.clasp.json`)

- **Root Directory**: `./build` (not `./src`)
- Clasp pushes only the bundled output

## Module System

### Before (Namespaces)

```typescript
namespace ChecklistApp {
  export class Checklist { ... }
}
```

### After (ES6 Modules)

```typescript
export class Checklist { ... }
```

**Imports:**
```typescript
import { Checklist } from './ChecklistApp';
import * as Formula from './Formulas';
```

## Circular Dependencies

The codebase has several circular dependencies that are handled correctly by ES6 modules:

- `SheetBase ↔ ChecklistApp`
- `ChecklistApp ↔ ChecklistMeta`
- `ChecklistApp ↔ ChecklistSettings`
- `ChecklistApp ↔ StatusFormulaTranslator`

These are expected and cause no runtime issues.

## Global Exports

For Google Apps Script compatibility, the following are exported to global scope:

**Namespaces:**
- `ChecklistApp` (Checklist class, enums, helper functions)
- `ChecklistMeta` (MetaSheet class, helper functions)
- `Settings` (ChecklistSettings class, SETTING enum)
- `Status` (StatusFormulaTranslator)
- `Formula` (Formula builder functions)

**Utility Functions:**
- `time()`
- `timeEnd()`

**Event Handlers (GAS triggers):**
- `onOpen()`
- `onEdit()`
- `handleEdit()`
- `handleChange()`

**Menu Functions:**
- `AttachTriggers()`
- `CalculatePreReqs()`
- `LinkPreReqs()`
- `ResetChecklist()`
- `ProcessMeta()`
- `CreateMetaSheet()`

## Troubleshooting

### Build Fails

**Check TypeScript errors:**
```bash
npx tsc --noEmit
```

**Check Rollup errors:**
```bash
npm run build
```

### Missing Exports

If you add a new global function:

1. Export it from its source file
2. Import it in `src/index.ts`
3. Add `g.functionName = functionName;` to global exports

### Deployment Fails

**Check clasp configuration:**
```bash
clasp status
```

**View deployment errors:**
```bash
clasp logs
```

## Bundle Analysis

**Bundle size:**
```bash
ls -lh build/Code.js
```

**Line count:**
```bash
wc -l build/Code.js
```

**Check global exports:**
```bash
grep "g\." build/Code.js
```

## Development Tips

1. **Always run build before push**: Use `npm run push` instead of `clasp push`
2. **Watch mode for rapid development**: Use `npm run watch` while coding
3. **Check logs after deployment**: Use `clasp logs` to verify no runtime errors
4. **Test in a development spreadsheet first**: Don't deploy directly to production

## Differences from Old System

### Old (Direct TypeScript Push)
- clasp pushed TypeScript files directly
- Files executed in push order
- Namespaces used for organization
- Multiple files deployed

### New (Bundled Modules)
- Rollup bundles into single file
- ES6 modules for better tooling
- Single bundled file deployed
- Build step required before deploy

## Benefits

✅ Modern module system (ES6)
✅ Better IDE support (autocomplete, jump-to-definition)
✅ Build-time validation (catch errors before deploy)
✅ Smaller deployment (single file)
✅ Faster execution (single file load)
✅ Easier testing (can import modules directly)
✅ Standard JavaScript (not TypeScript-specific)

---

**For more details, see `MIGRATION-SUMMARY.md`**
