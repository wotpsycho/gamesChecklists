/* exported RESET, ResetChecklist */
// eslint-disable-next-line no-redeclare
const RESET = (function(){

  function promptReset() {
    time();
    const ui = SpreadsheetApp.getUi();
  
    let response;

    let resetData = false;  
    const sheet = SpreadsheetApp.getActiveSheet();
    const headerRow = UTIL.getHeaderRow(sheet);
    let specialReset;
    if (!UTIL.getHeaderRow(sheet) || sheet.getRange(headerRow,1).getValue() !== CONFIG.COLUMN_HEADERS.check) {
      response = ui.alert("Checklist not found", "This does not appear to be a checklist. Would you like to turn it into one?", ui.ButtonSet.YES_NO);
      if (response !== ui.Button.YES) return;
      sheet.insertRowBefore(1);
      sheet.getRange(1,1).setValue(CONFIG.COLUMN_HEADERS.check);
    } else {
      response = ui.prompt("Reset Checklist",
        "This will reset filters and columns.\n\nIf you want to reset the checklist as well, " +
                           "type \"FULL RESET\" in the box.", ui.ButtonSet.OK_CANCEL);
      if (response.getSelectedButton() != ui.Button.OK) return;
      const responseText = response.getResponseText();
      if (responseText == "FULL RESET" || responseText == "\"FULL RESET\"") {
        response = ui.alert("Verify Reset","Are you sure you want to reset all progress on this list?", ui.ButtonSet.YES_NO);
        if (response != ui.Button.YES) return;
        resetData = true;
        time("full");
      } else {
      // Hidden special flags
        specialReset = responseText;
      }
    }

    ui.alert("Resetting", (resetData ? "The checklist" : "The view ") + " will reset when you close this message.\n\nThis may take up to a minute, you will get a confirmation message when it has finished.", ui.ButtonSet.OK);
    time("nonUI");

    reset(sheet, resetData, specialReset);
    timeEnd("nonUI");
    timeEnd("full");
    ui.alert("Reset Complete!","You may now use this checklist again.",ui.ButtonSet.OK);
  
    timeEnd();
  }

  function reset(sheet = SpreadsheetApp.getActiveSheet(), _resetData, _specialReset) {
    time();
    let filter = sheet.getFilter();
    let columns = UTIL.getColumns(sheet);
    let lastSheetColumn = sheet.getLastColumn();
    let lastSheetRow = sheet.getLastRow();
    let rows = UTIL.getRows(sheet);
    let previousMode = SETTINGS.getSetting(sheet,"Mode"); // Preserve mode
  
    Logger.log("Reseting checklist ", sheet.getName());
  
    time("filter removal");
    // Remove filter first to ensure data is available to write
    if (filter) {
      filter.remove();
    }
    timeEnd("filter removal");
  
    time("row/column show");
    // Show all rows/columns
    if (lastSheetRow > 1) {
      sheet.showRows(1,lastSheetColumn);
    }
    if (lastSheetColumn > 1) {
      sheet.showColumns(1,lastSheetColumn);
    }
    timeEnd("row/column show");
  
    time("column existence");
    // Ensure existence of columns/rows
    if (!columns.check) {
      sheet.insertColumnBefore(1);
      sheet.getRange(rows.header,1).setValue(CONFIG.COLUMN_HEADERS.check);
      UTIL.resetCache();
      columns = UTIL.getColumns(sheet);
      lastSheetColumn = sheet.getLastColumn();
    }
    if (!columns.item) {
      sheet.insertColumnAfter(columns.check);
      sheet.getRange(rows.header,columns.check+1).setValue(CONFIG.COLUMN_HEADERS.item);
      UTIL.resetCache();
      columns = UTIL.getColumns(sheet);
      lastSheetColumn = sheet.getLastColumn();
    }
    if (!columns.notes) {
      sheet.insertColumnAfter(lastSheetColumn);
      sheet.getRange(rows.header, lastSheetColumn+1).setValue(CONFIG.COLUMN_HEADERS.notes);
      UTIL.resetCache();
      columns = UTIL.getColumns(sheet);
      lastSheetColumn = sheet.getLastColumn();
    }
    if (!columns.preReq) {
      sheet.insertColumnAfter(lastSheetColumn);
      sheet.getRange(rows.header, lastSheetColumn+1).setValue(CONFIG.COLUMN_HEADERS.preReq);
      UTIL.resetCache();
      columns = UTIL.getColumns(sheet);
      lastSheetColumn = sheet.getLastColumn();
    }
    // Missed is deprecated
    // if (!columns.missed) {
    //   sheet.insertColumnAfter(columns.preReq);
    //   sheet.getRange(rows.header, columns.preReq+1).setValue(CONFIG.COLUMN_HEADERS.missed);
    //   UTIL.resetCache();
    //   columns = UTIL.getColumns(sheet);
    //   lastSheetColumn = sheet.getLastColumn();
    // }
    if (!columns.CONFIG) {
      sheet.insertColumnAfter(lastSheetColumn);
      sheet.getRange(rows.header, lastSheetColumn+1).setValue(CONFIG.COLUMN_HEADERS.CONFIG);
      UTIL.resetCache();
      columns = UTIL.getColumns(sheet);
      lastSheetColumn = sheet.getLastColumn();
    }
    if (!columns.available) {
      sheet.insertColumnAfter(lastSheetColumn);
      sheet.getRange(rows.header, lastSheetColumn+1).setValue(CONFIG.COLUMN_HEADERS.available);
      UTIL.resetCache();
      columns = UTIL.getColumns(sheet);
      lastSheetColumn = sheet.getLastColumn();
    }
    sheet.hideColumns(columns.available);
    sheet.hideColumns(columns.CONFIG);
    timeEnd("column existence");

    if (!rows.settings) {
      const newSettingsRow = rows.quickFilter || rows.header;
      sheet.insertRowBefore(newSettingsRow);
      sheet.getRange(newSettingsRow,1).setValue(CONFIG.ROW_HEADERS.settings);
      sheet.getRange(newSettingsRow,2).setValue("Mode");
      previousMode = "Create";
      UTIL.resetCache();
      rows = UTIL.getRows(sheet);
      lastSheetRow = sheet.getLastRow();
    }
    // Get rid of ridiculously many rows
    if (sheet.getMaxRows() - sheet.getLastRow() > 100) {
      sheet.deleteRows(sheet.getLastRow() + 101, sheet.getMaxRows() - sheet.getLastColumn() - 100);
    }
    // Get rid of unnecessary empty columns
    if (sheet.getLastColumn() != sheet.getMaxColumns()) {
      sheet.deleteColumns(sheet.getLastColumn()+1, sheet.getMaxColumns() - sheet.getLastColumn());
    }
    // Ensure one data row 
    if (sheet.getMaxRows() == rows.header) {
      sheet.insertRowAfter(rows.header);
    }
  
    // Ensure checkboxes
    const checklist = sheet.getRange(rows.header+1, columns.check, sheet.getMaxRows() - rows.header);

    checklist.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  
    // Reset checkboxes
    if (_resetData) {
      checklist.uncheck();
    }
  
    // Update all notes
    if (columns.item && columns.notes) {
      NOTES.moveNotes(UTIL.getColumnDataRange(sheet, columns.notes));
    }
    
    if (columns.missed) {
      // Handle deprecated column
      const preReqData = UTIL.getColumnDataRange(sheet, columns.preReq);
      const missedDataValues = UTIL.getColumnDataRange(sheet, columns.missed).getValues();
      const preReqDataValues = preReqData.getValues();
      for (let i = 0; i < missedDataValues.length; i++) {
        missedDataValues[i][0].toString().split(/[\n\r]+/).forEach(line => {
          if (!line) return;
          preReqDataValues[i][0] = (preReqDataValues[i][0] || "") + "\nMISSED " + line;
          console.log("moving " + line);
        });
      }

      preReqData.setValues(preReqDataValues);
      sheet.deleteColumns(columns.missed);
      UTIL.resetCache();
      columns = UTIL.getColumns();
    }
  
    // Set Item validation
    const itemDataRange = sheet.getRange("R" + (rows.header+1) + "C" + columns.item + ":C" + columns.item);
    const itemDataRangeA1 = itemDataRange.getA1Notation();
    const itemDataCellA1 = itemDataRange.getCell(1,1).getA1Notation();
    const itemDataValidationFormula = "=COUNTIF(" + UTIL.a1ToAbsolute(itemDataRangeA1,true,true,true,false) + ",\"=\"&"+ UTIL.a1ToAbsolute(itemDataCellA1,false,false) +") < 2";
    const itemDataValidation = SpreadsheetApp.newDataValidation();
    itemDataValidation.setAllowInvalid(true);
    itemDataValidation.requireFormulaSatisfied(itemDataValidationFormula);
    itemDataRange.setDataValidation(itemDataValidation);
  
    const preReqData = UTIL.getColumnDataRange(sheet, columns.preReq);
    const availableData = UTIL.getColumnDataRange(sheet, columns.available);
    const checkboxData = UTIL.getColumnDataRange(sheet, columns.check);
    availableData.setDataValidation(null);
  
    const allDataRange = sheet.getRange("R" + (rows.header+1) + "C1:C" + sheet.getLastColumn());
  
    AVAILABLE.populateAvailable(sheet);
  
    // Add conditional formatting rules
    const availableDataCellA1 = (availableData.getCell(1,1).getA1Notation());
    const checkboxDataCellA1 = checkboxData.getCell(1,1).getA1Notation();
    const missedDataCellA1 = preReqData.getCell(1,1).getA1Notation();
    const notAvailableFormula = `=NOT(OR(ISBLANK($${availableDataCellA1}),$${availableDataCellA1}))`;
    const missedFormula = `=$${availableDataCellA1}="MISSED"`;
    const usedFormula = `=$${availableDataCellA1}="PR_USED"`;
    const availableErrorFormula = `=IF(ISERROR($${availableDataCellA1}),TRUE,REGEXMATCH(""&$${availableDataCellA1},"ERROR"))`;
    const checkboxDisableFormula = `=OR(ISBLANK($${itemDataCellA1}),NOT($${availableDataCellA1}=TRUE))`;
    const crossthroughCheckedFormula = `=$${checkboxDataCellA1}=TRUE`;
    const missableFormula = `=REGEXMATCH(${missedDataCellA1},"(^|\\n)MISSED ")`;
    
    time("available rules");
    let existingRules = sheet.getConditionalFormatRules();
    let removedRules = []; // not doing anything with these...yet!
  
    if (_specialReset == "Conditional Format") {
      removedRules = existingRules;
      existingRules = [];
    }
    for (let i = existingRules.length-1; i >= 0; i--) {
      const condition = existingRules[i].getBooleanCondition();
      if (condition.getCriteriaType() !== SpreadsheetApp.BooleanCriteria.CUSTOM_FORMULA) continue;

      const values = condition.getCriteriaValues();
      if (!values || values.length !== 1) continue;

      if (values[0].match("#REF!")) {
        Logger.log("Found conditional format rule with reference error, removing: ", values[0]);
        removedRules.push(existingRules.splice(i,1));
        continue;
      }

      const ranges = existingRules[i].getRanges();
      let remove = false;
      for (let j = 0; j < ranges.length && !remove; j++) {
        if (UTIL.isColumnInRange(columns.check, ranges[j])) {
          remove = values[0] == checkboxDisableFormula || values[0] == crossthroughCheckedFormula;
        }
        if (!remove && UTIL.isColumnInRange(columns.preReq, ranges[j])) {
          remove = values[0] == notAvailableFormula || values[0] == availableErrorFormula;
        }
        if (!remove && UTIL.isColumnInRange(columns.item, ranges[j])) {
          remove = values[0] == missableFormula;
        }
      }
      if (remove) {
        removedRules.push(existingRules.splice(i,1)[0]);
      }
    }
  
    const availableErrorRule = SpreadsheetApp.newConditionalFormatRule();
    availableErrorRule.setBackground(CONFIG.COLORS.error);
    availableErrorRule.whenFormulaSatisfied(availableErrorFormula);
    availableErrorRule.setRanges([preReqData,availableData]);

    const notAvailableRule = SpreadsheetApp.newConditionalFormatRule();
    notAvailableRule.setBackground(CONFIG.COLORS.notAvailable);
    notAvailableRule.whenFormulaSatisfied(notAvailableFormula);
    notAvailableRule.setRanges([preReqData,availableData]);

    const missedRule = SpreadsheetApp.newConditionalFormatRule();
    missedRule.setBackground(CONFIG.COLORS.missed);
    missedRule.whenFormulaSatisfied(missedFormula);
    missedRule.setRanges([preReqData,availableData]);
    notAvailableRule.setRanges([preReqData,availableData]);

    const usedRule = SpreadsheetApp.newConditionalFormatRule();
    usedRule.setBackground(CONFIG.COLORS.used);
    usedRule.whenFormulaSatisfied(usedFormula);
    usedRule.setRanges([preReqData,availableData]);
  
    const crossthroughCheckedRule = SpreadsheetApp.newConditionalFormatRule();
    crossthroughCheckedRule.setStrikethrough(true);
    crossthroughCheckedRule.setBackground(CONFIG.COLORS.checkedBackground);
    crossthroughCheckedRule.setFontColor(CONFIG.COLORS.checkedText);
    crossthroughCheckedRule.whenFormulaSatisfied(crossthroughCheckedFormula);
    crossthroughCheckedRule.setRanges([allDataRange]);
  
  
    const checkboxDisableRule = SpreadsheetApp.newConditionalFormatRule();
    checkboxDisableRule.setBackground(CONFIG.COLORS.disabled);
    checkboxDisableRule.setFontColor(CONFIG.COLORS.disabled);
    checkboxDisableRule.whenFormulaSatisfied(checkboxDisableFormula);
    checkboxDisableRule.setRanges([checkboxData]);

    const missableRule = SpreadsheetApp.newConditionalFormatRule();
    missableRule.setBackground(CONFIG.COLORS.missable);
    missableRule.setFontColor("white");
    missableRule.whenFormulaSatisfied(missableFormula);
    missableRule.setRanges([itemDataRange]);
  
    sheet.setConditionalFormatRules([availableErrorRule,crossthroughCheckedRule,checkboxDisableRule,missableRule,missedRule,usedRule,notAvailableRule]);//.concat(existingRules,[notAvailableRule]));
  
    timeEnd("available rules");
    timeEnd("available");
  
  
    time("quickFilter");
    if (rows.quickFilter) {
      const quickFilterCells = sheet.getRange(rows.quickFilter, 2, 1, sheet.getLastColumn() - 1);
      time("quickFilter clear");
      quickFilterCells.clearContent();
      timeEnd("quickFilter clear");
    }
    timeEnd("quickFilter");
  
    if (CONFIG.getConfig(sheet).metaSheet) {
      META.ProcessMeta();
    }
  
    // Create new filter
    time("filterCreate");
    const headerRow = UTIL.getHeaderRow(sheet);
    const filterRange = sheet.getRange(headerRow,1,sheet.getMaxRows()-headerRow+1,sheet.getLastColumn());
    filter = filterRange.createFilter();
    timeEnd("filterCreate");
  
    TOTALS.updateTotals(sheet);
    SETTINGS.resetSettings(sheet, previousMode || "Dynamic");
    timeEnd();
  }

  return {
    promptReset,
    reset,
  };
})();

function ResetChecklist() {
  RESET.promptReset();
}