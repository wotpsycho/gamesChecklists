#!/usr/bin/env node

import fs from 'fs/promises';
import { exportChecklist, importChecklist, validateChecklist } from './checklist.js';
import { addSpreadsheet, listSpreadsheets, removeSpreadsheet, resolveSpreadsheet } from './config.js';

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1];
      options[key] = value;
      i++; // Skip next arg since we consumed it
    }
  }
  return options;
}

async function exportCommand(options) {
  const { spreadsheet, 'sheet-id': legacySheetId, sheet, output } = options;
  const nameOrId = spreadsheet || legacySheetId;

  if (!nameOrId) {
    console.error('Error: --spreadsheet name or --sheet-id is required');
    process.exit(1);
  }

  try {
    // Resolve spreadsheet (validates cache if it's a name)
    const resolved = await resolveSpreadsheet(nameOrId, true);
    const sheetId = resolved.id;

    console.log(`📥 Exporting checklist`);
    if (resolved.name) {
      console.log(`   Spreadsheet: ${resolved.name} (${resolved.entry.title})`);
      if (!sheet && resolved.entry.sheets.length > 0) {
        console.log(`   Available sheets: ${resolved.entry.sheets.map(s => s.name).join(', ')}`);
      }
    } else {
      console.log(`   Spreadsheet ID: ${sheetId}`);
    }
    if (sheet) {
      console.log(`   Sheet: ${sheet}`);
    }

    const checklist = await exportChecklist(sheetId, sheet || '');

    console.log(`✓ Found ${checklist.items.length} items`);
    if (checklist.title) {
      console.log(`  Title: ${checklist.title}`);
    }
    if (checklist.customColumns.length > 0) {
      console.log(`  Custom columns: ${checklist.customColumns.join(', ')}`);
    }

    if (output) {
      await fs.writeFile(output, JSON.stringify(checklist, null, 2));
      console.log(`✓ Saved to: ${output}`);
    } else {
      console.log('\nChecklist data:');
      console.log(JSON.stringify(checklist, null, 2));
    }
  } catch (error) {
    console.error('❌ Export failed:', error.message);
    process.exit(1);
  }
}

async function importCommand(options) {
  const { spreadsheet, 'sheet-id': legacySheetId, sheet, input, mode = 'append' } = options;
  const nameOrId = spreadsheet || legacySheetId;

  if (!nameOrId) {
    console.error('Error: --spreadsheet name or --sheet-id is required');
    process.exit(1);
  }

  if (!input) {
    console.error('Error: --input file is required');
    process.exit(1);
  }

  try {
    // Resolve spreadsheet
    const resolved = await resolveSpreadsheet(nameOrId, true);
    const sheetId = resolved.id;

    console.log(`📤 Importing checklist`);
    if (resolved.name) {
      console.log(`   Spreadsheet: ${resolved.name} (${resolved.entry.title})`);
    } else {
      console.log(`   Spreadsheet ID: ${sheetId}`);
    }
    console.log(`   Mode: ${mode}`);
    if (sheet) {
      console.log(`   Sheet: ${sheet}`);
    }

    // Read input file
    const data = await fs.readFile(input, 'utf-8');
    const checklistData = JSON.parse(data);

    console.log(`   Items to import: ${checklistData.items?.length || 0}`);

    // Validate data
    console.log('\n🔍 Validating data...');
    const validation = validateChecklist(checklistData);

    if (validation.warnings.length > 0) {
      console.warn('\n⚠️  Warnings:');
      validation.warnings.forEach(w => console.warn(`  - ${w}`));
    }

    if (!validation.valid) {
      console.error('\n❌ Validation failed:');
      validation.errors.forEach(e => console.error(`  - ${e}`));
      process.exit(1);
    }

    console.log('✓ Validation passed');

    // Import data
    console.log(`\n📝 Writing to sheet...`);
    const result = await importChecklist(sheetId, checklistData, sheet || '', { mode });

    console.log(`✓ Import complete!`);
    console.log(`  Updated ${result.updatedCells || 0} cells`);
  } catch (error) {
    console.error('❌ Import failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

async function validateCommand(options) {
  const { input } = options;

  if (!input) {
    console.error('Error: --input file is required');
    process.exit(1);
  }

  try {
    const data = await fs.readFile(input, 'utf-8');
    const checklistData = JSON.parse(data);

    console.log('🔍 Validating checklist data...\n');
    const validation = validateChecklist(checklistData);

    if (validation.warnings.length > 0) {
      console.warn('⚠️  Warnings:');
      validation.warnings.forEach(w => console.warn(`  - ${w}`));
      console.log('');
    }

    if (validation.valid) {
      console.log('✅ Validation passed!');
      console.log(`   ${checklistData.items.length} items validated`);
    } else {
      console.error('❌ Validation failed:\n');
      validation.errors.forEach(e => console.error(`  - ${e}`));
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    process.exit(1);
  }
}

async function addSheetCommand(options) {
  const { name, 'sheet-id': sheetId } = options;

  if (!name) {
    console.error('Error: --name is required');
    process.exit(1);
  }

  if (!sheetId) {
    console.error('Error: --sheet-id is required');
    process.exit(1);
  }

  try {
    console.log(`📝 Adding spreadsheet "${name}"...`);
    const entry = await addSpreadsheet(name, sheetId, true);

    console.log(`✓ Added spreadsheet: ${name}`);
    console.log(`  Title: ${entry.title}`);
    console.log(`  Sheets: ${entry.sheets.map(s => s.name).join(', ')}`);
    console.log(`  ID: ${entry.id}`);
  } catch (error) {
    console.error('❌ Failed to add spreadsheet:', error.message);
    process.exit(1);
  }
}

async function listSheetsCommand() {
  try {
    const config = await listSpreadsheets();
    const names = Object.keys(config.spreadsheets);

    if (names.length === 0) {
      console.log('No spreadsheets configured.');
      console.log('\nAdd one with: node cli.js add-sheet --name <name> --sheet-id <id>');
      return;
    }

    console.log(`📋 Configured Spreadsheets:\n`);
    for (const name of names) {
      const entry = config.spreadsheets[name];
      console.log(`  ${name}`);
      console.log(`    Title: ${entry.title}`);
      console.log(`    Sheets: ${entry.sheets.map(s => s.name).join(', ')}`);
      console.log(`    ID: ${entry.id}`);
      console.log(`    Last updated: ${new Date(entry.lastUpdated).toLocaleString()}`);
      console.log('');
    }
  } catch (error) {
    console.error('❌ Failed to list spreadsheets:', error.message);
    process.exit(1);
  }
}

async function removeSheetCommand(options) {
  const { name } = options;

  if (!name) {
    console.error('Error: --name is required');
    process.exit(1);
  }

  try {
    await removeSpreadsheet(name);
    console.log(`✓ Removed spreadsheet: ${name}`);
  } catch (error) {
    console.error('❌ Failed to remove spreadsheet:', error.message);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
Games Checklists - Sheets CLI Tool

Usage:
  node cli.js <command> [options]

Commands:
  export       Export checklist data from a Google Sheet
  import       Import checklist data into a Google Sheet
  validate     Validate a checklist JSON file
  add-sheet    Add a spreadsheet to config (with short name)
  list-sheets  List all configured spreadsheets
  remove-sheet Remove a spreadsheet from config

Export Options:
  --spreadsheet <name>  Short name from config (recommended)
  --sheet-id <id>       Google Sheet ID (alternative to --spreadsheet)
  --sheet <name>        Sheet tab name (optional, uses first sheet if omitted)
  --output <file>       Output JSON file (optional, prints to stdout if omitted)

Import Options:
  --spreadsheet <name>  Short name from config (recommended)
  --sheet-id <id>       Google Sheet ID (alternative to --spreadsheet)
  --sheet <name>        Sheet tab name (optional)
  --input <file>        Input JSON file (required)
  --mode <mode>         Import mode: 'append' or 'overwrite' (default: append)

Validate Options:
  --input <file>        Input JSON file to validate (required)

Config Options:
  add-sheet:
    --name <name>       Short name for the spreadsheet
    --sheet-id <id>     Google Sheet ID

  remove-sheet:
    --name <name>       Short name to remove

Examples:
  # Add a spreadsheet to config
  node cli.js add-sheet --name ni-no-kuni --sheet-id 1AbC...XyZ

  # List configured spreadsheets
  node cli.js list-sheets

  # Export using short name (recommended)
  node cli.js export --spreadsheet ni-no-kuni --output data.json

  # Export specific sheet
  node cli.js export --spreadsheet ni-no-kuni --sheet "Main Quests" --output main.json

  # Import data
  node cli.js import --spreadsheet ni-no-kuni --input new-data.json

  # Or use sheet ID directly (no config needed)
  node cli.js export --sheet-id 1AbC...XyZ --output data.json

Setup:
  See README.md for Google Sheets API setup instructions.
`);
}

// Main CLI handler
async function main() {
  const options = parseArgs(args.slice(1));

  switch (command) {
    case 'export':
      await exportCommand(options);
      break;
    case 'import':
      await importCommand(options);
      break;
    case 'validate':
      await validateCommand(options);
      break;
    case 'add-sheet':
      await addSheetCommand(options);
      break;
    case 'list-sheets':
      await listSheetsCommand();
      break;
    case 'remove-sheet':
      await removeSheetCommand(options);
      break;
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      printHelp();
      process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});