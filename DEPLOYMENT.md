# Deployment Guide

This project uses a custom deployment system to push code to multiple Google Sheets that use this Apps Script.

## Prerequisites

Make sure clasp is installed globally:
```bash
npm install -g @google/clasp
```

## Configuration

Your deployment targets are stored in `.clasp.local.json` (git-ignored):

```json
{
  "projectId": "wotpsychos-checklists", // Optional: default for all sheets
  "rootDir": "./build",
  "sheets": {
    "sheet-name": {
      "scriptId": "your-script-id",
      "description": "Optional description",
      "projectId": "optional-override" // Optional: override default projectId
    }
  }
}
```

### Listing Sheets

View all configured deployment targets:

```bash
npm run push:list
```

### Adding a New Sheet

**Interactive method (recommended):**

```bash
npm run push:add
```

This will prompt you for:
- Sheet name (identifier, letters/numbers/hyphens only)
- Script ID (validated format)
- Description (optional)
- Project ID override (optional)

**Manual method:**

1. Open your Google Sheet
2. Go to Extensions > Apps Script
3. Copy the Script ID from the URL or Project Settings
4. Add it to `.clasp.local.json`:

```json
"zelda-totk": {
  "scriptId": "abc123...",
  "description": "Zelda: Tears of the Kingdom checklist"
}
```

**Note**: The interactive method validates input and prevents duplicate scriptIds.

## Deployment Commands

### Build and Push

```bash
# Interactive selection
npm run push

# Push to specific sheet
npm run push zelda-totk

# Push to all configured sheets
npm run push:all
```

### Watch Mode with Auto-Push

```bash
# Interactive selection, then watch
npm run watch:push

# Watch specific sheet (pass sheet name as argument)
npm run watch:push -- claude-upgrades
```

**Note**: The `--` is required to pass arguments through npm to the script.

### Build Only (no push)

```bash
npm run build
npm run watch
```

## Advanced Usage

### Verbose Mode

Show detailed debug output:
```bash
node scripts/clasp-deploy.js push my-sheet --verbose
```

### Quiet Mode

Suppress non-error output:
```bash
node scripts/clasp-deploy.js push my-sheet --quiet
```

### Help

```bash
node scripts/clasp-deploy.js --help
```

## How It Works

1. The deployment script reads `.clasp.local.json`
2. Validates input (sheet names, script IDs)
3. Checks for duplicates and conflicts
4. Generates `.clasp.json` with the selected sheet's config
5. Runs `clasp push` to upload to Google Apps Script
6. For `--all`, repeats for each configured sheet

## Features

- ✅ **Input validation** - Prevents invalid sheet names and script IDs
- ✅ **Duplicate detection** - Warns if scriptId already exists
- ✅ **Interactive prompts** - Easy setup without editing JSON
- ✅ **Per-sheet projectId** - Override global projectId per sheet
- ✅ **Clasp check** - Verifies clasp is installed before operations
- ✅ **Help command** - Built-in usage documentation

Both `.clasp.json` and `.clasp.local.json` are git-ignored to keep your scriptIds private.

## Troubleshooting

**"clasp is not installed"**
- Run: `npm install -g @google/clasp`

**"Invalid Script ID format"**
- Script IDs should be 30+ alphanumeric characters with hyphens/underscores
- Find it in your Apps Script URL: `script.google.com/d/<SCRIPT_ID>/edit`

**"Sheet already exists"**
- Choose a different identifier
- Or edit `.clasp.local.json` to rename the existing sheet

**"Script ID already used"**
- Each sheet must have a unique Script ID
- Check with `npm run push:list` to see which sheet uses it
