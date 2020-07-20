/* exported onEdit */

function onEdit(e) {
  time();
  try {
    time("1");
    var range = e.range;
    timeEnd("1");
    
    time("2");
    var sheet = range.getSheet();
    timeEnd("2");
    
    
    if (!UTIL.getHeaderRow(sheet)) return; // Non checklist
    
    time("3");
    var columns = UTIL.getColumns(sheet);
    timeEnd("3");
    time("4");
    var rows = UTIL.getRows(sheet);
    timeEnd("4");
    time("5");
    Logger.log("edit: ", range.getA1Notation());
    timeEnd("5");
    
    //QUICK DEBUG:  try { SETTINGS.resetSettings(sheet); } catch (e) { sheet.getRange("F1").setValue(e.message);} finally { return;  }
    
    if (UTIL.isRowInRange(rows.quickFilter,range)) {
      QUICK_FILTER.onChange(sheet, range, e);
    }

    time("2.5");
    var filter = sheet.getFilter();
    timeEnd("2.5");
    
    time("6");
    if (UTIL.isRowInRange(rows.quickFilter,range) && range.getNumRows() == 1) {
      FILTER.reapplyFilter(filter);
      
      timeEnd("6");
      return;
    }
    timeEnd("6");
    
    time("6.5");
    Logger.log(rows);
    if (UTIL.isRowInRange(rows.settings, range)) {
      SETTINGS.updateSettings(sheet,range);
      if (range.getNumRows() == 1) {
        timeEnd("6.5");
        return;
      }
    }
    timeEnd("6.5");
    
    time("7");
    if (UTIL.isColumnInRange(columns.item, range)) {
      AVAILABLE.populateAvailable(sheet);
    } else if (UTIL.isColumnInRange(columns.preReq, range) || UTIL.isColumnInRange(columns.available, range)) {
      AVAILABLE.populateAvailable(sheet, range);
    }
    timeEnd("7");
    
    time("8");
    if (UTIL.isColumnInRange(columns.check, range) || UTIL.isColumnInRange(columns.preReq,range) || 
      UTIL.isRowInRange(rows.quickFilter,range)) {
      FILTER.reapplyFilter(filter);
    }
    timeEnd("8");
    
    time("9");
    if (UTIL.isColumnInRange(columns.notes,range)) {
      NOTES.moveNotes(range);
    }
    timeEnd("9");
    
    time("10");
    if (UTIL.isColumnInRange(columns.check,range)) {
      TOTALS.updateTotals(sheet);
    }
    timeEnd("10");
    
    //sheet.getRange("D2").setValue(sheet.getRange("B4:D").getLastRow());
  } finally {
    timeEnd();
  }
}