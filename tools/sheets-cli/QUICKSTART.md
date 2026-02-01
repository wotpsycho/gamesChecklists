# Quick Start Guide

## ✅ What's Already Done

- ✅ Node.js project created
- ✅ Dependencies installed
- ✅ CLI tool built and tested
- ✅ Sample data provided

## 🔧 Next Steps

### 1. Set Up Google Sheets API (5-10 minutes)

Follow the detailed instructions in `README.md`, but here's the quick version:

1. **Go to Google Cloud Console**: https://console.cloud.google.com/
2. **Create/Select Project**: Create a new project or select existing
3. **Enable Google Sheets API**:
   - APIs & Services → Library
   - Search "Google Sheets API"
   - Click Enable
4. **Create OAuth Credentials**:
   - APIs & Services → Credentials
   - Create Credentials → OAuth client ID
   - Configure consent screen if needed (External, add your email)
   - Application type: **Desktop app**
   - Download JSON → Save as `credentials.json` in this directory

### 2. Test with Your Spreadsheet

Once you have `credentials.json`:

```bash
# Get your spreadsheet ID from the URL:
# https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID_HERE/edit
# Copy the YOUR_SHEET_ID_HERE part

# Export your current checklist
node cli.js export --sheet-id YOUR_SHEET_ID --output my-checklist.json
```

On first run, it will:
1. Open your browser
2. Ask you to log in with Google
3. Request permission to access Sheets
4. Save credentials to `token.json` for future use

### 3. Test Import

```bash
# Test with sample data (creates new rows)
node cli.js import --sheet-id YOUR_SHEET_ID --input sample-data.json --mode append
```

**⚠️ Use `--mode append` first to be safe!** This adds data without overwriting.

## 🎯 Common Workflows

### Export → Edit → Import Back

```bash
# 1. Export current data
node cli.js export --sheet-id ABC123 --output game.json

# 2. Edit game.json (or have Claude help you parse new data)

# 3. Validate before importing
node cli.js validate --input game.json

# 4. Import back (overwrite mode)
node cli.js import --sheet-id ABC123 --input game.json --mode overwrite
```

### Parse Data with Claude

You can share game guides/wikis with me and ask me to generate the JSON:

```
"Hey Claude, here's a wiki page for Elden Ring bosses.
Can you parse this and create a checklist JSON file?"
```

I'll generate properly formatted JSON that you can then import!

### Bulk Reorder

```bash
# Export, then ask Claude to reorder by criteria
node cli.js export --sheet-id ABC123 --output data.json

# "Claude, can you reorder these items by chapter, then type?"

# Import the reordered data
node cli.js import --sheet-id ABC123 --input data-reordered.json --mode overwrite
```

## 🐛 Troubleshooting

**"Error: credentials.json not found"**
- Make sure you downloaded OAuth credentials and saved as `credentials.json` in this directory

**"Error: invalid_grant"**
- Delete `token.json` and re-authenticate

**"Error: sheet-id is required"**
- Copy the sheet ID from the URL, not the entire URL

**"Validation warnings about pre-reqs"**
- This is normal! The validator checks if pre-req names match items
- Review warnings but they won't block import

## 📝 Notes

- `credentials.json` and `token.json` are git-ignored for security
- Never commit these files!
- The tool preserves your Apps Script formulas (Available column)
- Quick Filter and Settings rows are maintained

## 🚀 Ready to Go!

Once you have `credentials.json`, you're ready to start managing checklists programmatically!

Try the validation command first to see it working:
```bash
node cli.js validate --input sample-data.json
```