import { google } from 'googleapis';
import { authorize } from './auth.js';

/**
 * Get authenticated Sheets API client
 */
async function getSheetsClient() {
  const auth = await authorize();
  return google.sheets({ version: 'v4', auth });
}

/**
 * Read data from a Google Sheet
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {string} range - A1 notation range (e.g., 'Sheet1!A1:Z1000')
 * @returns {Promise<Array>} 2D array of cell values
 */
export async function readSheet(spreadsheetId, range) {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return response.data.values || [];
}

/**
 * Write data to a Google Sheet
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {string} range - A1 notation range (e.g., 'Sheet1!A1')
 * @param {Array} values - 2D array of values to write
 * @param {string} valueInputOption - How to interpret input ('RAW' or 'USER_ENTERED')
 * @returns {Promise<Object>} Update response
 */
export async function writeSheet(spreadsheetId, range, values, valueInputOption = 'USER_ENTERED') {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption,
    resource: {
      values,
    },
  });

  return response.data;
}

/**
 * Append data to a Google Sheet
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {string} range - A1 notation range (e.g., 'Sheet1!A:E')
 * @param {Array} values - 2D array of values to append
 * @returns {Promise<Object>} Append response
 */
export async function appendSheet(spreadsheetId, range, values) {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    resource: {
      values,
    },
  });

  return response.data;
}

/**
 * Get sheet metadata (name, dimensions, etc.)
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @returns {Promise<Object>} Spreadsheet metadata
 */
export async function getSheetMetadata(spreadsheetId) {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
  });

  return response.data;
}

/**
 * Clear a range in a Google Sheet
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {string} range - A1 notation range to clear
 * @returns {Promise<Object>} Clear response
 */
export async function clearSheet(spreadsheetId, range) {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range,
  });

  return response.data;
}

/**
 * Batch update multiple ranges at once
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {Array} data - Array of {range, values} objects
 * @returns {Promise<Object>} Batch update response
 */
export async function batchUpdate(spreadsheetId, data) {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    resource: {
      valueInputOption: 'USER_ENTERED',
      data: data.map(item => ({
        range: item.range,
        values: item.values,
      })),
    },
  });

  return response.data;
}