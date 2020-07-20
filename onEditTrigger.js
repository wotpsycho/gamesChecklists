/* exported onEdit */

function onEdit(e) {
  functionTime();
  try {
    console.time("1");
    var range = e.range;
    console.timeEnd("1");
    
    console.time("2");
    var sheet = range.getSheet();
    console.timeEnd("2");
    
    
    if (!UTIL.getHeaderRow(sheet)) return; // Non checklist
    
    console.time("3");
    var columns = UTIL.getColumns(sheet);
    console.timeEnd("3");
    console.time("4");
    var rows = UTIL.getRows(sheet);
    console.timeEnd("4");
    console.time("5");
    Logger.log("edit: ", range.getA1Notation());
    console.timeEnd("5");
    
    //QUICK DEBUG:  try { SETTINGS.resetSettings(sheet); } catch (e) { sheet.getRange("F1").setValue(e.message);} finally { return;  }
    
    if (UTIL.isRowInRange(rows.quickFilter,range)) {
      QUICK_FILTER.onChange(sheet, range, e);
    }

    console.time("2.5");
    var filter = sheet.getFilter();
    console.timeEnd("2.5");
    
    console.time("6");
    if (UTIL.isRowInRange(rows.quickFilter,range) && range.getNumRows() == 1) {
      FILTER.reapplyFilter(filter);
      
      console.timeEnd("6");
      return;
    }
    console.timeEnd("6");
    
    console.time("6.5");
    Logger.log(rows);
    if (UTIL.isRowInRange(rows.settings, range)) {
      SETTINGS.updateSettings(sheet,range);
      if (range.getNumRows() == 1) {
        console.timeEnd("6.5");
        return;
      }
    }
    console.timeEnd("6.5");
    
    console.time("7");
    if (UTIL.isColumnInRange(columns.item, range)) {
      AVAILABLE.populateAvailable(sheet);
    } else if (UTIL.isColumnInRange(columns.preReq, range) || UTIL.isColumnInRange(columns.available, range)) {
      AVAILABLE.populateAvailable(sheet, range);
    }
    console.timeEnd("7");
    
    console.time("8");
    if (UTIL.isColumnInRange(columns.check, range) || UTIL.isColumnInRange(columns.preReq,range) || 
      UTIL.isRowInRange(rows.quickFilter,range)) {
      FILTER.reapplyFilter(filter);
    }
    console.timeEnd("8");
    
    console.time("9");
    if (UTIL.isColumnInRange(columns.notes,range)) {
      NOTES.moveNotes(range);
    }
    console.timeEnd("9");
    
    console.time("10");
    if (UTIL.isColumnInRange(columns.check,range)) {
      TOTALS.updateTotals(sheet);
    }
    console.timeEnd("10");
    
    //sheet.getRange("D2").setValue(sheet.getRange("B4:D").getLastRow());
  } finally {
    functionTimeEnd();
  }
}