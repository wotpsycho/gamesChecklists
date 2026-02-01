#!/usr/bin/env node

import fs from 'fs/promises';
import { exportChecklist, importChecklist, validateChecklist } from './checklist.js';

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
  const { 'sheet-id': sheetId, sheet, output } = options;

  if (!sheetId) {
    console.error('Error: --sheet-id is required');
    process.exit(1);
  }

  console.log(`📥 Exporting checklist from sheet: ${sheetId}`);
  if (sheet) {
    console.log(`   Sheet name: ${sheet}`);
  }

  try {
    const checklist = await exportChecklist(sheetId, sheet || '');

    console.log(`✓ Found ${checklist.items.length} items`);
    console.log(`  Title: ${checklist.title}`);

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
  const { 'sheet-id': sheetId, sheet, input, mode = 'append' } = options;

  if (!sheetId) {
    console.error('Error: --sheet-id is required');
    process.exit(1);
  }

  if (!input) {
    console.error('Error: --input file is required');
    process.exit(1);
  }

  console.log(`📤 Importing checklist to sheet: ${sheetId}`);
  console.log(`   Mode: ${mode}`);
  if (sheet) {
    console.log(`   Sheet name: ${sheet}`);
  }

  try {
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

function printHelp() {
  console.log(`
Games Checklists - Sheets CLI Tool

Usage:
  node cli.js <command> [options]

Commands:
  export    Export checklist data from a Google Sheet
  import    Import checklist data into a Google Sheet
  validate  Validate a checklist JSON file

Export Options:
  --sheet-id <id>     Google Sheet ID (required)
  --sheet <name>      Sheet tab name (optional, uses first sheet if omitted)
  --output <file>     Output JSON file (optional, prints to stdout if omitted)

Import Options:
  --sheet-id <id>     Google Sheet ID (required)
  --sheet <name>      Sheet tab name (optional)
  --input <file>      Input JSON file (required)
  --mode <mode>       Import mode: 'append' or 'overwrite' (default: append)

Validate Options:
  --input <file>      Input JSON file to validate (required)

Examples:
  # Export a checklist
  node cli.js export --sheet-id 1AbC...XyZ --output elden-ring.json

  # Import data (append mode)
  node cli.js import --sheet-id 1AbC...XyZ --input new-data.json

  # Import data (overwrite mode)
  node cli.js import --sheet-id 1AbC...XyZ --input new-data.json --mode overwrite

  # Validate a JSON file
  node cli.js validate --input checklist.json

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