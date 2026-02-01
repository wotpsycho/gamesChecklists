import fs from 'fs/promises';
import path from 'path';
import { getSheetMetadata } from './sheets.js';

const CONFIG_PATH = path.join(process.cwd(), '.sheets.local.json');

/**
 * Load the spreadsheet configuration
 * @returns {Promise<Object>} Configuration object
 */
export async function loadConfig() {
  try {
    const content = await fs.readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    // Config doesn't exist yet, return empty
    return { spreadsheets: {} };
  }
}

/**
 * Save the spreadsheet configuration
 * @param {Object} config - Configuration to save
 */
export async function saveConfig(config) {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Check if a sheet is a checklist by reading its header row
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} sheetName - Sheet name
 * @returns {Promise<boolean>} True if sheet has ✓ in header
 */
async function isChecklistSheet(spreadsheetId, sheetName) {
  try {
    const { readSheet } = await import('./sheets.js');
    const range = `${sheetName}!A1:A10`;
    const rows = await readSheet(spreadsheetId, range);

    // Look for ✓ in first column (checklist header marker)
    return rows.some(row => row[0] === '✓');
  } catch (err) {
    return false;
  }
}

/**
 * Add or update a spreadsheet in the config
 * @param {string} name - Short name/alias for the spreadsheet
 * @param {string} spreadsheetId - Google Sheets ID
 * @param {boolean} refresh - Whether to fetch latest metadata
 * @returns {Promise<Object>} Updated spreadsheet entry
 */
export async function addSpreadsheet(name, spreadsheetId, refresh = true) {
  const config = await loadConfig();

  let entry = {
    id: spreadsheetId,
    title: '',
    sheets: [],
    lastUpdated: new Date().toISOString(),
  };

  if (refresh) {
    // Fetch metadata from Google Sheets
    const metadata = await getSheetMetadata(spreadsheetId);
    entry.title = metadata.properties.title;

    // Filter for checklist sheets and detect their meta sheets
    const allSheets = metadata.sheets.map(sheet => ({
      name: sheet.properties.title,
      sheetId: sheet.properties.sheetId,
      index: sheet.properties.index,
    }));

    // Check each sheet to see if it's a checklist
    const checklistSheets = [];
    for (const sheet of allSheets) {
      // Skip sheets that end with " Meta"
      if (sheet.name.endsWith(' Meta')) {
        continue;
      }

      // Check if this is a checklist sheet
      const isChecklist = await isChecklistSheet(spreadsheetId, sheet.name);
      if (isChecklist) {
        // Look for associated meta sheet
        const metaSheetName = `${sheet.name} Meta`;
        const metaSheet = allSheets.find(s => s.name === metaSheetName);

        checklistSheets.push({
          name: sheet.name,
          sheetId: sheet.sheetId,
          index: sheet.index,
          metaSheet: metaSheet ? metaSheetName : null,
        });
      }
    }

    entry.sheets = checklistSheets;
  }

  config.spreadsheets[name] = entry;
  await saveConfig(config);

  return entry;
}

/**
 * Get a spreadsheet from config by name
 * @param {string} name - Short name/alias
 * @param {boolean} validate - Whether to validate and refresh cache
 * @returns {Promise<Object>} Spreadsheet entry
 */
export async function getSpreadsheet(name, validate = false) {
  const config = await loadConfig();
  const entry = config.spreadsheets[name];

  if (!entry) {
    throw new Error(`Spreadsheet "${name}" not found in config. Use 'add-sheet' command to add it.`);
  }

  if (validate) {
    // Refresh metadata to ensure cache is current
    const metadata = await getSheetMetadata(entry.id);
    entry.title = metadata.properties.title;

    // Re-filter for checklist sheets
    const allSheets = metadata.sheets.map(sheet => ({
      name: sheet.properties.title,
      sheetId: sheet.properties.sheetId,
      index: sheet.properties.index,
    }));

    const checklistSheets = [];
    for (const sheet of allSheets) {
      if (sheet.name.endsWith(' Meta')) {
        continue;
      }

      const isChecklist = await isChecklistSheet(entry.id, sheet.name);
      if (isChecklist) {
        const metaSheetName = `${sheet.name} Meta`;
        const metaSheet = allSheets.find(s => s.name === metaSheetName);

        checklistSheets.push({
          name: sheet.name,
          sheetId: sheet.sheetId,
          index: sheet.index,
          metaSheet: metaSheet ? metaSheetName : null,
        });
      }
    }

    entry.sheets = checklistSheets;
    entry.lastUpdated = new Date().toISOString();

    config.spreadsheets[name] = entry;
    await saveConfig(config);
  }

  return entry;
}

/**
 * Rename a spreadsheet in the config
 * @param {string} oldName - Current name
 * @param {string} newName - New name
 */
export async function renameSpreadsheet(oldName, newName) {
  const config = await loadConfig();

  if (!config.spreadsheets[oldName]) {
    throw new Error(`Spreadsheet "${oldName}" not found in config`);
  }

  if (config.spreadsheets[newName]) {
    throw new Error(`Spreadsheet "${newName}" already exists in config`);
  }

  config.spreadsheets[newName] = config.spreadsheets[oldName];
  delete config.spreadsheets[oldName];

  await saveConfig(config);
}

/**
 * List all configured spreadsheets
 * @returns {Promise<Object>} Config object
 */
export async function listSpreadsheets() {
  return await loadConfig();
}

/**
 * Remove a spreadsheet from config
 * @param {string} name - Short name to remove
 */
export async function removeSpreadsheet(name) {
  const config = await loadConfig();

  if (!config.spreadsheets[name]) {
    throw new Error(`Spreadsheet "${name}" not found in config`);
  }

  delete config.spreadsheets[name];
  await saveConfig(config);
}

/**
 * Get spreadsheet ID from name or return if already an ID
 * @param {string} nameOrId - Short name or spreadsheet ID
 * @param {boolean} validate - Whether to validate cache
 * @returns {Promise<Object>} Object with id and metadata
 */
export async function resolveSpreadsheet(nameOrId, validate = false) {
  // Check if it's already a spreadsheet ID (long string)
  if (nameOrId.length > 30) {
    // Looks like a spreadsheet ID, use it directly
    return { id: nameOrId, name: null, entry: null };
  }

  // Try to resolve from config
  const entry = await getSpreadsheet(nameOrId, validate);
  return { id: entry.id, name: nameOrId, entry };
}
