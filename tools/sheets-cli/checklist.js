import { appendSheet, batchUpdateSpreadsheet, clearSheet, duplicateSheet, readSheet, writeSheet } from "./sheets.js";

// Standard checklist column headers
const COLUMNS = {
  CHECK: "✓",
  TYPE: "Type",
  ITEM: "Item",
  PRE_REQS: "Pre-Reqs",
  NOTES: "Notes",
  STATUS: "Available", // Hidden formula column
};

// Default custom columns (appear between Item and Pre-Reqs)
const DEFAULT_CUSTOM_COLUMNS = ["Area", "Location"];

// Special row types
const ROW_TYPES = {
  TITLE: "TITLE",
  SETTINGS: "SETTINGS",
  QUICK_FILTER: "QUICK_FILTER",
  HEADERS: "HEADERS",
};

/**
 * Parse checklist data from sheet rows
 * @param {Array} rows - Raw 2D array from sheet
 * @returns {object} Parsed checklist data
 */
export function parseChecklist(rows) {
  if (!rows || rows.length === 0) {
    throw new Error("No data found in sheet");
  }

  const checklist = {
    title: "",
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
  const columnIndices = {};
  const customColumnIndices = []; // Track custom columns between Item and Pre-Reqs

  // Find special rows and header row
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0)
      continue;

    const firstCell = row[0];

    // Identify special rows
    if (firstCell === ROW_TYPES.TITLE) {
      checklist.metadata.titleRow = i + 1;
      checklist.title = row.find((cell, idx) => idx > 0 && cell) || "";
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
        if (!header)
          return;

        const headerName = Object.keys(COLUMNS).find(key => COLUMNS[key] === header);
        if (headerName) {
          columnIndices[headerName] = idx;
        } else if (columnIndices.ITEM && !columnIndices.PRE_REQS) {
          // Custom column between Item and Pre-Reqs
          customColumnIndices.push({ name: header, index: idx });
          checklist.customColumns.push(header);
        }
      });

      // Validate required columns exist
      if (columnIndices.CHECK === undefined) {
        throw new Error(`Missing required column: "${COLUMNS.CHECK}" (checkbox column)`);
      }
      if (columnIndices.ITEM === undefined) {
        throw new Error(`Missing required column: "${COLUMNS.ITEM}"`);
      }
      // TYPE, PRE_REQS, and NOTES are optional but warn if missing
      if (columnIndices.TYPE === undefined) {
        console.warn(`⚠️  Warning: "${COLUMNS.TYPE}" column not found`);
      }
      if (columnIndices.PRE_REQS === undefined) {
        console.warn(`⚠️  Warning: "${COLUMNS.PRE_REQS}" column not found`);
      }
    } else if (headerRowIndex >= 0 && i > headerRowIndex) {
      // This is a data row
      if (checklist.metadata.firstDataRow === null) {
        checklist.metadata.firstDataRow = i + 1;
      }

      const item = {
        row: i + 1,
        checked: row[columnIndices.CHECK] || "",
        type: row[columnIndices.TYPE] || "",
        item: row[columnIndices.ITEM] || "",
        preReqs: row[columnIndices.PRE_REQS] || "",
        notes: row[columnIndices.NOTES] || "",
      };

      // Add custom column values
      customColumnIndices.forEach((col) => {
        item[col.name] = row[col.index] || "";
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
 * @param {object} checklistData - Structured checklist data
 * @returns {Array} 2D array ready for sheet
 */
export function formatChecklistForSheet(checklistData) {
  const rows = [];

  // Determine custom columns (use defaults if not specified)
  const customColumns = checklistData.customColumns || DEFAULT_CUSTOM_COLUMNS;

  // Title row
  rows.push([ROW_TYPES.TITLE, "", checklistData.title || "Checklist"]);

  // Settings row (placeholder)
  rows.push([ROW_TYPES.SETTINGS, ""]);

  // Quick Filter row (if included)
  if (checklistData.includeQuickFilter) {
    rows.push([ROW_TYPES.QUICK_FILTER, ""]);
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
      item.checked || "", // Checkbox (usually empty for new items)
      item.type || "",
      item.item || "",
    ];

    // Add custom column values
    customColumns.forEach((colName) => {
      row.push(item[colName] || "");
    });

    // Add standard columns
    row.push(item.preReqs || "");
    row.push(item.notes || "");

    rows.push(row);
  }

  return rows;
}

/**
 * Export checklist from sheet to JSON
 * @param {string} spreadsheetId - Sheet ID
 * @param {string} sheetName - Name of the sheet tab (default: first sheet)
 * @returns {Promise<object>} Checklist data
 */
export async function exportChecklist(spreadsheetId, sheetName = "") {
  // Use A:Z to get all columns (handles custom columns)
  const range = sheetName ? `${sheetName}!A:Z` : "A:Z";
  const rows = await readSheet(spreadsheetId, range);
  return parseChecklist(rows);
}

/**
 * Import checklist data into existing sheet
 * @param {string} spreadsheetId - Sheet ID
 * @param {object} checklistData - Checklist data to import
 * @param {string} sheetName - Name of the sheet tab
 * @param {object} options - Import options (merge, overwrite, etc.)
 * @returns {Promise<object>} Import result
 */
export async function importChecklist(spreadsheetId, checklistData, sheetName = "", options = {}) {
  const { mode = "append" } = options;

  const formattedData = formatChecklistForSheet(checklistData);

  if (mode === "overwrite") {
    // Overwrite entire sheet
    const range = sheetName ? `${sheetName}!A1` : "A1";
    return await writeSheet(spreadsheetId, range, formattedData);
  } else if (mode === "append") {
    // Append to existing data
    const range = sheetName ? `${sheetName}!A:F` : "A:F";
    return await appendSheet(spreadsheetId, range, formattedData.slice(4)); // Skip header rows
  } else {
    throw new Error(`Unknown import mode: ${mode}`);
  }
}

/**
 * Validate checklist data
 * @param {object} checklistData - Checklist data to validate
 * @returns {object} Validation result with errors
 */
export function validateChecklist(checklistData) {
  const errors = [];
  const warnings = [];
  const itemNames = new Set();

  // Check for required fields
  if (!checklistData.items || checklistData.items.length === 0) {
    errors.push("No items found in checklist");
  }

  // Validate each item
  for (const [idx, item] of checklistData.items.entries()) {
    const itemNum = idx + 1;

    // Check for required item name
    if (!item.item || item.item.trim() === "") {
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
      const preReqs = item.preReqs.split("\n").filter(pr => pr.trim());
      for (const preReq of preReqs) {
        // Simple validation - check if pre-req looks like an item name
        // More complex validation would parse MISSED, AND/OR, etc.
        const cleanPreReq = preReq.replace(/^(MISSED|USES|OPTION|OPTIONAL|BLOCKS|BLOCKED|LINKED)\s+/i, "").trim();
        if (cleanPreReq && !itemNames.has(cleanPreReq) && cleanPreReq !== "*") {
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

/**
 * Create a new checklist by duplicating an existing template
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {string} newName - Name for the new checklist
 * @param {object} templateSheet - Template sheet info {name, sheetId, metaSheet, index}
 * @param {object} templateMetaSheetInfo - Template meta sheet info {sheetId, index}
 * @returns {Promise<object>} Created sheet info
 */
export async function createChecklist(spreadsheetId, newName, templateSheet, templateMetaSheetInfo) {
  console.log(`📋 Creating new checklist "${newName}" from template "${templateSheet.name}"...`);

  // Calculate target indices: new checklist right after template meta, new meta after checklist
  const targetChecklistIndex = templateMetaSheetInfo.index + 1;
  const targetMetaIndex = targetChecklistIndex + 1;

  // Step 1: Duplicate the template checklist sheet at the target position
  console.log(`  1️⃣  Duplicating checklist sheet at index ${targetChecklistIndex}...`);
  const newSheet = await duplicateSheet(spreadsheetId, templateSheet.sheetId, newName, targetChecklistIndex);
  console.log(`     ✓ Created sheet with ID ${newSheet.sheetId}`);

  // Step 2: Duplicate the template meta sheet at the target position
  console.log(`  2️⃣  Duplicating meta sheet at index ${targetMetaIndex}...`);
  const metaSheetName = `${newName} Meta`;
  const newMetaSheet = await duplicateSheet(spreadsheetId, templateMetaSheetInfo.sheetId, metaSheetName, targetMetaIndex);
  console.log(`     ✓ Created meta sheet with ID ${newMetaSheet.sheetId}`);

  // Step 3: Read the new checklist sheet to find where data rows start
  console.log(`  3️⃣  Finding checklist header row...`);
  const range = `${newName}!A:A`;
  const rows = await readSheet(spreadsheetId, range);

  let headerRowIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i][0] === COLUMNS.CHECK) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error("Could not find header row (✓) in template sheet");
  }

  const firstDataRow = headerRowIndex + 1;
  const totalRows = rows.length;

  console.log(`     ✓ Header at row ${headerRowIndex + 1}, data starts at row ${firstDataRow + 1}`);

  // Step 4: Clear all checklist data rows if there are any
  if (totalRows > firstDataRow) {
    console.log(`  4️⃣  Clearing ${totalRows - firstDataRow} checklist data rows...`);
    // Clear the data instead of deleting rows (Google Sheets doesn't allow deleting all rows)
    const clearRange = `${newName}!A${firstDataRow + 1}:Z`;
    await clearSheet(spreadsheetId, clearRange);
    console.log(`     ✓ Checklist data rows cleared`);
  } else {
    console.log(`  4️⃣  No checklist data rows to clear`);
  }

  // Step 5: Clear meta sheet data (keep only header row)
  console.log(`  5️⃣  Clearing meta sheet data...`);
  const metaRange = `${metaSheetName}!A:A`;
  const metaRows = await readSheet(spreadsheetId, metaRange);

  if (metaRows.length > 1) {
    // Clear everything after row 1 (the header row)
    const metaClearRange = `${metaSheetName}!A2:Z`;
    await clearSheet(spreadsheetId, metaClearRange);
    console.log(`     ✓ Cleared ${metaRows.length - 1} meta data rows`);
  } else {
    console.log(`     ✓ No meta data rows to clear`);
  }

  // Step 6: Update the title in cell B1
  console.log(`  6️⃣  Updating title...`);
  const titleUpdateRange = `${newName}!B1`;
  await writeSheet(spreadsheetId, titleUpdateRange, [[` ${newName}`]]);
  console.log(`     ✓ Title updated to " ${newName}"`);

  // Step 7: Link the sheets with developer metadata
  console.log(`  7️⃣  Linking checklist and meta sheets...`);
  await batchUpdateSpreadsheet(spreadsheetId, [
    {
      createDeveloperMetadata: {
        developerMetadata: {
          metadataKey: "metaForSheet",
          metadataValue: newName,
          location: {
            sheetId: newMetaSheet.sheetId,
          },
          visibility: "PROJECT",
        },
      },
    },
  ]);
  console.log(`     ✓ Sheets linked with developer metadata`);

  console.log(`\n✨ Successfully created checklist "${newName}"!`);
  console.log(`   Checklist sheet: ${newName}`);
  console.log(`   Meta sheet: ${metaSheetName}`);

  return {
    checklist: newSheet,
    meta: newMetaSheet,
  };
}
