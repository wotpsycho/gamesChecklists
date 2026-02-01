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
    name: name,
    title: '',
    sheets: [],
    lastUpdated: new Date().toISOString(),
  };

  if (refresh) {
    // Fetch metadata from Google Sheets
    const metadata = await getSheetMetadata(spreadsheetId);
    entry.title = metadata.properties.title;
    entry.sheets = metadata.sheets.map(sheet => ({
      name: sheet.properties.title,
      sheetId: sheet.properties.sheetId,
      index: sheet.properties.index,
    }));
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
    entry.sheets = metadata.sheets.map(sheet => ({
      name: sheet.properties.title,
      sheetId: sheet.properties.sheetId,
      index: sheet.properties.index,
    }));
    entry.lastUpdated = new Date().toISOString();

    config.spreadsheets[name] = entry;
    await saveConfig(config);
  }

  return entry;
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
