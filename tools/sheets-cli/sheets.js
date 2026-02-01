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

/**
 * Execute batch requests (for sheet operations like duplicate, delete, rename)
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {Array} requests - Array of batch request objects
 * @returns {Promise<Object>} Batch update response
 */
export async function batchUpdateSpreadsheet(spreadsheetId, requests) {
  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    resource: {
      requests,
    },
  });

  return response.data;
}

/**
 * Duplicate an existing sheet
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {number} sourceSheetId - The ID of the sheet to duplicate
 * @param {string} newSheetName - Name for the duplicated sheet
 * @param {number} insertSheetIndex - Optional index where the new sheet should be inserted
 * @returns {Promise<Object>} New sheet info
 */
export async function duplicateSheet(spreadsheetId, sourceSheetId, newSheetName, insertSheetIndex) {
  const request = {
    duplicateSheet: {
      sourceSheetId,
      newSheetName,
    },
  };

  if (insertSheetIndex !== undefined) {
    request.duplicateSheet.insertSheetIndex = insertSheetIndex;
  }

  const response = await batchUpdateSpreadsheet(spreadsheetId, [request]);

  return response.replies[0].duplicateSheet.properties;
}

/**
 * Delete rows from a sheet
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {number} sheetId - The ID of the sheet
 * @param {number} startIndex - Start row index (0-based, inclusive)
 * @param {number} endIndex - End row index (0-based, exclusive)
 * @returns {Promise<Object>} Delete response
 */
export async function deleteRows(spreadsheetId, sheetId, startIndex, endIndex) {
  return await batchUpdateSpreadsheet(spreadsheetId, [
    {
      deleteDimension: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex,
          endIndex,
        },
      },
    },
  ]);
}

/**
 * Update sheet properties (name, etc.)
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {number} sheetId - The ID of the sheet
 * @param {Object} properties - Properties to update
 * @returns {Promise<Object>} Update response
 */
export async function updateSheetProperties(spreadsheetId, sheetId, properties) {
  return await batchUpdateSpreadsheet(spreadsheetId, [
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          ...properties,
        },
        fields: Object.keys(properties).join(','),
      },
    },
  ]);
}