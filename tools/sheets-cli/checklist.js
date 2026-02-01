import { readSheet, writeSheet, appendSheet, batchUpdate } from './sheets.js';

// Standard checklist column headers
const COLUMNS = {
  CHECK: '✓',
  TYPE: 'Type',
  ITEM: 'Item',
  PRE_REQS: 'Pre-Reqs',
  NOTES: 'Notes',
  STATUS: 'Available', // Hidden formula column
};

// Default custom columns (appear between Item and Pre-Reqs)
const DEFAULT_CUSTOM_COLUMNS = ['Area', 'Location'];

// Special row types
const ROW_TYPES = {
  TITLE: 'TITLE',
  SETTINGS: 'SETTINGS',
  QUICK_FILTER: 'QUICK_FILTER',
  HEADERS: 'HEADERS',
};

/**
 * Parse checklist data from sheet rows
 * @param {Array} rows - Raw 2D array from sheet
 * @returns {Object} Parsed checklist data
 */
export function parseChecklist(rows) {
  if (!rows || rows.length === 0) {
    throw new Error('No data found in sheet');
  }

  const checklist = {
    title: '',
    items: [],
    customColumns: [], // Store custom column names
    metadata: {
      titleRow: null,
      settingsRow: null,
      quickFilterRow: null,
      headerRow: null,
      firstDataRow: null,
    },
  };

  let headerRowIndex = -1;
  let columnIndices = {};
  let customColumnIndices = []; // Track custom columns between Item and Pre-Reqs

  // Find special rows and header row
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const firstCell = row[0];

    // Identify special rows
    if (firstCell === ROW_TYPES.TITLE) {
      checklist.metadata.titleRow = i + 1;
      checklist.title = row.find((cell, idx) => idx > 0 && cell) || '';
    } else if (firstCell === ROW_TYPES.SETTINGS) {
      checklist.metadata.settingsRow = i + 1;
    } else if (firstCell === ROW_TYPES.QUICK_FILTER) {
      checklist.metadata.quickFilterRow = i + 1;
    } else if (firstCell === COLUMNS.CHECK) {
      // This is the header row
      headerRowIndex = i;
      checklist.metadata.headerRow = i + 1;

      // Map column names to indices and detect custom columns
      row.forEach((header, idx) => {
        if (!header) return;

        const headerName = Object.keys(COLUMNS).find(key => COLUMNS[key] === header);
        if (headerName) {
          columnIndices[headerName] = idx;
        } else if (columnIndices.ITEM && !columnIndices.PRE_REQS) {
          // Custom column between Item and Pre-Reqs
          customColumnIndices.push({ name: header, index: idx });
          checklist.customColumns.push(header);
        }
      });
    } else if (headerRowIndex >= 0 && i > headerRowIndex) {
      // This is a data row
      if (checklist.metadata.firstDataRow === null) {
        checklist.metadata.firstDataRow = i + 1;
      }

      const item = {
        row: i + 1,
        checked: row[columnIndices.CHECK] || '',
        type: row[columnIndices.TYPE] || '',
        item: row[columnIndices.ITEM] || '',
        preReqs: row[columnIndices.PRE_REQS] || '',
        notes: row[columnIndices.NOTES] || '',
      };

      // Add custom column values
      customColumnIndices.forEach(col => {
        item[col.name] = row[col.index] || '';
      });

      // Only add non-empty items
      if (item.item) {
        checklist.items.push(item);
      }
    }
  }

  return checklist;
}

/**
 * Format checklist data for writing to sheet
 * @param {Object} checklistData - Structured checklist data
 * @returns {Array} 2D array ready for sheet
 */
export function formatChecklistForSheet(checklistData) {
  const rows = [];

  // Determine custom columns (use defaults if not specified)
  const customColumns = checklistData.customColumns || DEFAULT_CUSTOM_COLUMNS;

  // Title row
  rows.push([ROW_TYPES.TITLE, '', checklistData.title || 'Checklist']);

  // Settings row (placeholder)
  rows.push([ROW_TYPES.SETTINGS, '']);

  // Quick Filter row (if included)
  if (checklistData.includeQuickFilter) {
    rows.push([ROW_TYPES.QUICK_FILTER, '']);
  }

  // Header row - includes custom columns between Item and Pre-Reqs
  const headerRow = [
    COLUMNS.CHECK,
    COLUMNS.TYPE,
    COLUMNS.ITEM,
    ...customColumns,
    COLUMNS.PRE_REQS,
    COLUMNS.NOTES,
    // STATUS column will be added by Apps Script
  ];
  rows.push(headerRow);

  // Data rows
  for (const item of checklistData.items) {
    const row = [
      item.checked || '',  // Checkbox (usually empty for new items)
      item.type || '',
      item.item || '',
    ];

    // Add custom column values
    customColumns.forEach(colName => {
      row.push(item[colName] || '');
    });

    // Add standard columns
    row.push(item.preReqs || '');
    row.push(item.notes || '');

    rows.push(row);
  }

  return rows;
}

/**
 * Export checklist from sheet to JSON
 * @param {string} spreadsheetId - Sheet ID
 * @param {string} sheetName - Name of the sheet tab (default: first sheet)
 * @returns {Promise<Object>} Checklist data
 */
export async function exportChecklist(spreadsheetId, sheetName = '') {
  // Use A:Z to get all columns (handles custom columns)
  const range = sheetName ? `${sheetName}!A:Z` : 'A:Z';
  const rows = await readSheet(spreadsheetId, range);
  return parseChecklist(rows);
}

/**
 * Import checklist data into existing sheet
 * @param {string} spreadsheetId - Sheet ID
 * @param {Object} checklistData - Checklist data to import
 * @param {string} sheetName - Name of the sheet tab
 * @param {Object} options - Import options (merge, overwrite, etc.)
 * @returns {Promise<Object>} Import result
 */
export async function importChecklist(spreadsheetId, checklistData, sheetName = '', options = {}) {
  const { mode = 'append' } = options;

  const formattedData = formatChecklistForSheet(checklistData);

  if (mode === 'overwrite') {
    // Overwrite entire sheet
    const range = sheetName ? `${sheetName}!A1` : 'A1';
    return await writeSheet(spreadsheetId, range, formattedData);
  } else if (mode === 'append') {
    // Append to existing data
    const range = sheetName ? `${sheetName}!A:F` : 'A:F';
    return await appendSheet(spreadsheetId, range, formattedData.slice(4)); // Skip header rows
  } else {
    throw new Error(`Unknown import mode: ${mode}`);
  }
}

/**
 * Validate checklist data
 * @param {Object} checklistData - Checklist data to validate
 * @returns {Object} Validation result with errors
 */
export function validateChecklist(checklistData) {
  const errors = [];
  const warnings = [];
  const itemNames = new Set();

  // Check for required fields
  if (!checklistData.items || checklistData.items.length === 0) {
    errors.push('No items found in checklist');
  }

  // Validate each item
  for (const [idx, item] of checklistData.items.entries()) {
    const itemNum = idx + 1;

    // Check for required item name
    if (!item.item || item.item.trim() === '') {
      errors.push(`Item #${itemNum}: Missing item name`);
      continue;
    }

    // Check for duplicates
    if (itemNames.has(item.item)) {
      errors.push(`Item #${itemNum}: Duplicate item name "${item.item}"`);
    }
    itemNames.add(item.item);

    // Validate pre-reqs reference existing items
    if (item.preReqs) {
      const preReqs = item.preReqs.split('\n').filter(pr => pr.trim());
      for (const preReq of preReqs) {
        // Simple validation - check if pre-req looks like an item name
        // More complex validation would parse MISSED, AND/OR, etc.
        const cleanPreReq = preReq.replace(/^(MISSED|USES|OPTION|OPTIONAL|BLOCKS|BLOCKED|LINKED)\s+/i, '').trim();
        if (cleanPreReq && !itemNames.has(cleanPreReq) && cleanPreReq !== '*') {
          warnings.push(`Item #${itemNum} "${item.item}": Pre-req "${cleanPreReq}" not found in items list`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}