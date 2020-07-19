function ResetChecklist() {
  promptReset();
}

function promptReset() {
  functionTime();
  var ui = SpreadsheetApp.getUi();
  
  var response;

  var resetData = false;  
  var sheet = SpreadsheetApp.getActiveSheet();
  var headerRow = _getHeaderRow(sheet);
  var specialReset;
  if (!_getHeaderRow(sheet) || sheet.getRange(headerRow,1).getValue() !== COLUMN_TITLES.check) {
    var response = ui.alert("Checklist not found", "This does not appear to be a checklist. Would you like to turn it into one?", ui.ButtonSet.YES_NO);
    if (response !== ui.Button.YES) return;
    sheet.insertRowBefore(1);
    sheet.getRange(1,1).setValue(COLUMN_TITLES.check);
  } else {
    response = ui.prompt("Reset Checklist",
                           "This will reset filters and columns.\n\nIf you want to reset the checklist as well, " +
                           "type \"FULL RESET\" in the box.", ui.ButtonSet.OK_CANCEL);
    if (response.getSelectedButton() != ui.Button.OK) return;
    var responseText = response.getResponseText();
    if (responseText == "FULL RESET" || responseText == '"FULL RESET"') {
      response = ui.alert("Verify Reset","Are you sure you want to reset all progress on this list?", ui.ButtonSet.YES_NO);
      if (response != ui.Button.YES) return;
      resetData = true;
      console.time("promptReset full");
    } else {
      // Hidden special flags
      specialReset = responseText;
    }
  }

  ui.alert("Resetting", (resetData ? "The checklist" : "The view ") + " will reset when you close this message.\n\nThis may take up to a minute, you will get a confirmation message when it has finished.", ui.ButtonSet.OK);
  console.time("promptReset nonUI");
  
  var filter = sheet.getFilter();
  var columns = getColumns(sheet);
  var rows = _getRows(sheet);
  var previousMode = getSetting(sheet,"Mode"); // Preserve mode
  
  Logger.log("Reseting checklist ", sheet.getName());
  
  // Remove filter first to ensure data is available to write
  if (filter) {
    filter.remove();
  }
  
  // Show all rows/columns
  if (sheet.getLastRow() > 1)
    sheet.showRows(1,sheet.getLastRow());
  if (sheet.getLastColumn() > 1)
    sheet.showColumns(1,sheet.getLastColumn());
  
  // Ensure existence of columns/rows
  if (!columns.check) {
    sheet.insertColumnBefore(1);
    sheet.getRange(rows.header,1).setValue(COLUMN_TITLES.check);
    _resetCache()
    columns = getColumns(sheet);
  }
  if (!columns.item) {
    sheet.insertColumnAfter(columns.check);
    sheet.getRange(rows.header,columns.check+1).setValue(COLUMN_TITLES.item);
    _resetCache();
    columns = getColumns(sheet);
  }
  if (!columns.notes) {
    var lastCol = sheet.getLastColumn();
    sheet.insertColumnAfter(lastCol);
    sheet.getRange(rows.header, lastCol+1).setValue(COLUMN_TITLES.notes);
    _resetCache();
    columns = getColumns(sheet);
  }
  if (!columns.preReq) {
    var lastCol = sheet.getLastColumn();
    sheet.insertColumnAfter(lastCol);
    sheet.getRange(rows.header, lastCol+1).setValue(COLUMN_TITLES.preReq);
    _resetCache();
    columns = getColumns(sheet);
  }
  if (!columns.CONFIG) {
    var lastCol = sheet.getLastColumn();
    sheet.insertColumnAfter(lastCol);
    sheet.getRange(rows.header, lastCol+1).setValue(COLUMN_TITLES.CONFIG);
    _resetCache();
    columns = getColumns(sheet);
  }
  if (!columns.available) {
    var lastCol = sheet.getLastColumn();
    sheet.insertColumnAfter(lastCol);
    sheet.getRange(rows.header, lastCol+1).setValue(COLUMN_TITLES.available);
    _resetCache();
    columns = getColumns(sheet);
  }
  /* Handled by settings
  if (!rows.quickFilter) {
    sheet.insertRowBefore(rows.header);
    sheet.getRange(rows.header,1).setValue(ROW_TITLES.quickFilter);
    _resetCache();
    rows = _getRows(sheet);
  }
  */
  if (!rows.settings) {
    sheet.insertRowBefore(rows.quickFilter);
    sheet.getRange(rows.quickFilter,1).setValue(ROW_TITLES.settings);
    sheet.getRange(rows.quickFilter,2).setValue("Mode");
    previousMode = "Create";
    _resetCache();
    rows = _getRows(sheet);
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
    moveNotes(_getColumnDataRange(sheet, columns.notes));
  }
  
  // Set Item validation
  var itemDataRange = sheet.getRange("R" + (rows.header+1) + "C" + columns.item + ":C" + columns.item);
  var itemDataRangeA1 = itemDataRange.getA1Notation();
  var itemDataCellA1 = itemDataRange.getCell(1,1).getA1Notation();
  var itemDataValidationFormula = "=COUNTIF(" + a1ToAbsolute(itemDataRangeA1,true,true,true,false) + ",\"=\"&"+ a1ToAbsolute(itemDataCellA1,false,false) +") < 2";
  var itemDataValidation = SpreadsheetApp.newDataValidation();
  itemDataValidation.setAllowInvalid(true);
  itemDataValidation.requireFormulaSatisfied(itemDataValidationFormula);
  itemDataRange.setDataValidation(itemDataValidation);
  //console.log("R" + (rows.header+1) + "C" + columns.item + ":C" + columns.item, itemDataValidationFormula);
  
  var preReqData = _getColumnDataRange(sheet, columns.preReq);
  var availableData = _getColumnDataRange(sheet, columns.available);
  var checkboxData = _getColumnDataRange(sheet, columns.check);
  availableData.setDataValidation(null);
  
  var allDataRange = sheet.getRange("R" + (rows.header+1) + "C1:C" + sheet.getLastColumn());
  
  populateAvailable(sheet);
  
  // Add conditional formatting rules
  var availableDataCellA1 = (availableData.getCell(1,1).getA1Notation())
  var checkboxDataCellA1 = checkboxData.getCell(1,1).getA1Notation();
  var notAvailableFormula = "=NOT(OR(ISBLANK($" + availableDataCellA1 + "),$" + availableDataCellA1 + "))";
  var availableErrorFormula = "=ERROR.TYPE($" + availableDataCellA1 + ")=8";
  var checkboxDisableFormula = "=OR(ISBLANK($"+ itemDataCellA1 +"),$" + availableDataCellA1 + "=FALSE)";
  var crossthroughCheckedFormula = "=$" + checkboxDataCellA1 + "=TRUE";
  var hasNotAvailableRule = false;
  var hasAvailableErrorRule = false;
  var hasCheckboxDisableRule = false;
  var hasCrossthroughCheckedRule = false;
  
  console.time("promptReset available rules");
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
      if (_isColumnInRange(columns.check, ranges[j])) {
        if (values[0] == checkboxDisableFormula) {
          remove = true;
        }  else if (values[0] == crossthroughCheckedFormula) {
          remove = true;
        }
      }
      if (!remove && _isColumnInRange(columns.preReq, ranges[j])) {
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
  availableErrorRule.setBackground(COLORS.error);
  availableErrorRule.whenFormulaSatisfied(availableErrorFormula);
  availableErrorRule.setRanges([preReqData,availableData]);

  var notAvailableRule = SpreadsheetApp.newConditionalFormatRule();
  notAvailableRule.setBackground(COLORS.notAvailable);
  notAvailableRule.whenFormulaSatisfied(notAvailableFormula);
  notAvailableRule.setRanges([preReqData,availableData]);
  
  var crossthroughCheckedRule = SpreadsheetApp.newConditionalFormatRule();
  crossthroughCheckedRule.setStrikethrough(true);
  crossthroughCheckedRule.setBackground(COLORS.checkedBackground);
  crossthroughCheckedRule.setFontColor(COLORS.checkedText);
  crossthroughCheckedRule.whenFormulaSatisfied(crossthroughCheckedFormula);
  crossthroughCheckedRule.setRanges([allDataRange]);
  
  
  var checkboxDisableRule = SpreadsheetApp.newConditionalFormatRule();
  checkboxDisableRule.setBackground(COLORS.disabled);
  checkboxDisableRule.setFontColor(COLORS.disabled);
  checkboxDisableRule.whenFormulaSatisfied(checkboxDisableFormula);
  checkboxDisableRule.setRanges([checkboxData]);
  
  sheet.setConditionalFormatRules([crossthroughCheckedRule,checkboxDisableRule].concat(existingRules,[availableErrorRule,notAvailableRule]));
  
  console.timeEnd("promptReset available rules");
  console.timeEnd("promptReset available");
  
  
  console.time("promptReset quickFilter")
  if (rows.quickFilter) {
    sheet.getRange(rows.quickFilter,2,1,sheet.getLastColumn()-1).clearContent();
  }
  console.timeEnd("promptReset quickFilter")  
  
  if (getConfig(sheet).metaSheet) {
    ProcessMeta();
  }
  
  console.time("promptReset filterCreate");
  // Create new filter
  var headerRow = _getHeaderRow(sheet);
  var filterRange = sheet.getRange(headerRow,1,sheet.getMaxRows()-headerRow+1,sheet.getLastColumn());
  filter = filterRange.createFilter();
  
  for (var i = 1; i <= sheet.getLastColumn(); i++) {
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
  console.timeEnd("promptReset filterCreate");
  
  updateTotals(sheet);
  resetSettings(sheet, previousMode || "Dynamic");
  
  console.timeEnd("promptReset nonUI");
  console.timeEnd("promptReset full");
  ui.alert("Reset Complete!","You may now use this checklist again.",ui.ButtonSet.OK);
  
  functionTimeEnd();
}
