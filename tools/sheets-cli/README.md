# Games Checklists - Sheets CLI Tool

CLI tool for programmatically managing Games Checklists data via the Google Sheets API.

## Setup

### 1. Enable Google Sheets API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the **Google Sheets API**:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Sheets API"
   - Click "Enable"

### 2. Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. If prompted, configure the OAuth consent screen:
   - User Type: External (or Internal if workspace)
   - App name: "Games Checklists CLI"
   - Add your email as developer contact
   - Scopes: Add `../auth/spreadsheets` scope
4. Application type: **Desktop app**
5. Name: "Sheets CLI"
6. Click "Create"
7. Download the credentials JSON file
8. Save it as `credentials.json` in this directory (`tools/sheets-cli/`)

### 3. First Run - Authenticate

```bash
npm run export -- --sheet-id YOUR_SHEET_ID
```

On first run, the tool will:
1. Open a browser for authentication
2. Ask you to grant permissions
3. Save a `token.json` for future use

## Usage

### Export Checklist Data

```bash
npm run export -- --sheet-id YOUR_SHEET_ID --output data.json
```

### Import/Update Checklist Data

```bash
npm run import -- --sheet-id YOUR_SHEET_ID --input data.json
```

### Create New Checklist

```bash
npm run create -- --sheet-id YOUR_SHEET_ID --name "New Game" --input data.json
```

## File Structure

```
tools/sheets-cli/
├── credentials.json    (you create this - OAuth credentials)
├── token.json          (auto-generated on first auth)
├── cli.js              (main CLI interface)
├── auth.js             (authentication helper)
├── sheets.js           (Google Sheets operations)
└── checklist.js        (checklist-specific logic)
```

## Data Format

The tool works with JSON data in this format:

```json
{
  "title": "Game Name",
  "items": [
    {
      "type": "Quest",
      "item": "Chapter 1 - Tutorial",
      "preReqs": ["Game Start"],
      "notes": "INFO: First chapter"
    }
  ]
}
```

## Security

- `credentials.json` and `token.json` contain sensitive data
- Both are git-ignored
- Never commit these files to version control