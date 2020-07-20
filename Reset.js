/* exported RESET, ResetChecklist */
// eslint-disable-next-line no-redeclare
const RESET = (function(){

  function promptReset() {
    time();
    var ui = SpreadsheetApp.getUi();
  
    let response;

    var resetData = false;  
    var sheet = SpreadsheetApp.getActiveSheet();
    var headerRow = UTIL.getHeaderRow(sheet);
    var specialReset;
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
      var responseText = response.getResponseText();
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
  
    var filter = sheet.getFilter();
    var columns = UTIL.getColumns(sheet);
    let lastSheetColumn = sheet.getLastColumn();
    let lastSheetRow = sheet.getLastRow();
    var rows = UTIL.getRows(sheet);
    var previousMode = SETTINGS.getSetting(sheet,"Mode"); // Preserve mode
  
    Logger.log("Reseting checklist ", sheet.getName());
  
    // Remove filter first to ensure data is available to write
    if (filter) {
      filter.remove();
    }
  
    // Show all rows/columns
    if (lastSheetRow > 1) {
      sheet.showRows(1,lastSheetColumn);
    }
    if (lastSheetColumn > 1) {
      sheet.showColumns(1,lastSheetColumn);
    }
  
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
    /* Handled by settings
  if (!rows.quickFilter) {
    sheet.insertRowBefore(rows.header);
    sheet.getRange(rows.header,1).setValue(CONFIG.ROW_HEADERS.quickFilter);
    UTIL.resetCache();
    rows = UTIL.getRows(sheet);
  }
  */
    if (!rows.settings) {
      sheet.insertRowBefore(rows.quickFilter);
      sheet.getRange(rows.quickFilter,1).setValue(CONFIG.ROW_HEADERS.settings);
      sheet.getRange(rows.quickFilter,2).setValue("Mode");
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
    var checklist = sheet.getRange(rows.header+1, columns.check, sheet.getMaxRows() - rows.header);

    checklist.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  
    // Reset checkboxes
    if (resetData) {
      checklist.uncheck();
    }
  
    // Update all notes
    if (columns.item && columns.notes) {
      NOTES.moveNotes(UTIL.getColumnDataRange(sheet, columns.notes));
    }
  
    // Set Item validation
    var itemDataRange = sheet.getRange("R" + (rows.header+1) + "C" + columns.item + ":C" + columns.item);
    var itemDataRangeA1 = itemDataRange.getA1Notation();
    var itemDataCellA1 = itemDataRange.getCell(1,1).getA1Notation();
    var itemDataValidationFormula = "=COUNTIF(" + UTIL.a1ToAbsolute(itemDataRangeA1,true,true,true,false) + ",\"=\"&"+ UTIL.a1ToAbsolute(itemDataCellA1,false,false) +") < 2";
    var itemDataValidation = SpreadsheetApp.newDataValidation();
    itemDataValidation.setAllowInvalid(true);
    itemDataValidation.requireFormulaSatisfied(itemDataValidationFormula);
    itemDataRange.setDataValidation(itemDataValidation);
    //console.log("R" + (rows.header+1) + "C" + columns.item + ":C" + columns.item, itemDataValidationFormula);
  
    var preReqData = UTIL.getColumnDataRange(sheet, columns.preReq);
    var availableData = UTIL.getColumnDataRange(sheet, columns.available);
    var checkboxData = UTIL.getColumnDataRange(sheet, columns.check);
    availableData.setDataValidation(null);
  
    var allDataRange = sheet.getRange("R" + (rows.header+1) + "C1:C" + sheet.getLastColumn());
  
    AVAILABLE.populateAvailable(sheet);
  
    // Add conditional formatting rules
    var availableDataCellA1 = (availableData.getCell(1,1).getA1Notation());
    var checkboxDataCellA1 = checkboxData.getCell(1,1).getA1Notation();
    var notAvailableFormula = "=NOT(OR(ISBLANK($" + availableDataCellA1 + "),$" + availableDataCellA1 + "))";
    var availableErrorFormula = "=ERROR.TYPE($" + availableDataCellA1 + ")=8";
    var checkboxDisableFormula = "=OR(ISBLANK($"+ itemDataCellA1 +"),$" + availableDataCellA1 + "=FALSE)";
    var crossthroughCheckedFormula = "=$" + checkboxDataCellA1 + "=TRUE";
    
    time("available rules");
    var existingRules = sheet.getConditionalFormatRules();
    var removedRules = []; // not doing anything with these...yet!
  
    if (specialReset == "Conditional Format") {
      removedRules = existingRules;
      existingRules = [];
    }
    for (var i = existingRules.length-1; i >= 0; i--) {
      var condition = existingRules[i].getBooleanCondition();
      if (condition.getCriteriaType() !== SpreadsheetApp.BooleanCriteria.CUSTOM_FORMULA) continue;

      var values = condition.getCriteriaValues();
      if (!values || values.length !== 1) continue;

      if (values[0].match("#REF!")) {
        Logger.log("Found conditional format rule with reference error, removing: ", values[0]);
        removedRules.push(existingRules.splice(i,1));
        continue;
      }

      var ranges = existingRules[i].getRanges();
      var remove = false;
      for (var j = 0; j < ranges.length && !remove; j++) {
        if (UTIL.isColumnInRange(columns.check, ranges[j])) {
          if (values[0] == checkboxDisableFormula) {
            remove = true;
          }  else if (values[0] == crossthroughCheckedFormula) {
            remove = true;
          }
        }
        if (!remove && UTIL.isColumnInRange(columns.preReq, ranges[j])) {
          if (values[0] == notAvailableFormula) {
            remove = true;
          } else if (values[0] == availableErrorFormula) {
            remove = true;
          }
        }
      }
      if (remove) {
        removedRules.push(existingRules.splice(i,1)[0]);
      }
    }
  
    var availableErrorRule = SpreadsheetApp.newConditionalFormatRule();
    availableErrorRule.setBackground(CONFIG.COLORS.error);
    availableErrorRule.whenFormulaSatisfied(availableErrorFormula);
    availableErrorRule.setRanges([preReqData,availableData]);

    var notAvailableRule = SpreadsheetApp.newConditionalFormatRule();
    notAvailableRule.setBackground(CONFIG.COLORS.notAvailable);
    notAvailableRule.whenFormulaSatisfied(notAvailableFormula);
    notAvailableRule.setRanges([preReqData,availableData]);
  
    var crossthroughCheckedRule = SpreadsheetApp.newConditionalFormatRule();
    crossthroughCheckedRule.setStrikethrough(true);
    crossthroughCheckedRule.setBackground(CONFIG.COLORS.checkedBackground);
    crossthroughCheckedRule.setFontColor(CONFIG.COLORS.checkedText);
    crossthroughCheckedRule.whenFormulaSatisfied(crossthroughCheckedFormula);
    crossthroughCheckedRule.setRanges([allDataRange]);
  
  
    var checkboxDisableRule = SpreadsheetApp.newConditionalFormatRule();
    checkboxDisableRule.setBackground(CONFIG.COLORS.disabled);
    checkboxDisableRule.setFontColor(CONFIG.COLORS.disabled);
    checkboxDisableRule.whenFormulaSatisfied(checkboxDisableFormula);
    checkboxDisableRule.setRanges([checkboxData]);
  
    sheet.setConditionalFormatRules([crossthroughCheckedRule,checkboxDisableRule].concat(existingRules,[availableErrorRule,notAvailableRule]));
  
    timeEnd("available rules");
    timeEnd("available");
  
  
    time("quickFilter");
    if (rows.quickFilter) {
      sheet.getRange(rows.quickFilter,2,1,sheet.getLastColumn()-1).clearContent();
    }
    timeEnd("quickFilter");
  
    if (CONFIG.getConfig(sheet).metaSheet) {
      META.ProcessMeta();
    }
  
    time("filterCreate");
    // Create new filter
    headerRow = UTIL.getHeaderRow(sheet);
    var filterRange = sheet.getRange(headerRow,1,sheet.getMaxRows()-headerRow+1,sheet.getLastColumn());
    filter = filterRange.createFilter();
  
    for (let i = 1; i <= sheet.getLastColumn(); i++) {
    // Set filters
      if (i == columns.check) {
      // Settings mode should handle this
      /*
      var newCriteria = SpreadsheetApp.newFilterCriteria();
      newCriteria.setHiddenValues(["TRUE"]);
      filter.setColumnFilterCriteria(i, newCriteria);
      */
      } else if (i == columns.available) {
      // Settings mode should handle this
      /*
      var newCriteria = SpreadsheetApp.newFilterCriteria();
      newCriteria.setHiddenValues(["FALSE"]);
      filter.setColumnFilterCriteria(i, newCriteria);
      */
        sheet.hideColumns(i);
      } else if (i == columns.CONFIG){
        sheet.hideColumns(i);
      } else {
        if (i == columns.notes) {
          // Hide notes by default
        // Settings should handle this
        //sheet.hideColumns(i);
        }
      }
    }
    timeEnd("filterCreate");
  
    TOTALS.updateTotals(sheet);
    SETTINGS.resetSettings(sheet, previousMode || "Dynamic");
  
    timeEnd("nonUI");
    timeEnd("full");
    ui.alert("Reset Complete!","You may now use this checklist again.",ui.ButtonSet.OK);
  
    timeEnd();
  }

  return {
    promptReset: promptReset
  };
})();

function ResetChecklist() {
  RESET.promptReset();
}