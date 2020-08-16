/* exported onEdit */

function onEdit(event) {
  time();
  try {
    time("bla");SpreadsheetApp.getActiveSheet();timeEnd("bla");
    time("1");
    const range = event.range;
    timeEnd("1");
    
    time("2");
    const sheet = range.getSheet();
    UTIL.setSheet(sheet);
    timeEnd("2");
    
    
    if (!UTIL.getHeaderRow()) return; // Non checklist
    
    time("3");
    const columns = UTIL.getColumns();
    timeEnd("3");
    time("4");
    const rows = UTIL.getRows();
    timeEnd("4");
    time("5");
    Logger.log("edit: ", range.getA1Notation());
    timeEnd("5");
    
    //QUICK DEBUG:  try { SETTINGS.resetSettings(sheet); } catch (e) { sheet.getRange("F1").setValue(e.message);} finally { return;  }
    
    if (UTIL.isRowInRange(rows.quickFilter,range)) {
      QUICK_FILTER.onChange(sheet, range, event);
    }

    if ((event.value == "reset" || event.value == "meta") && range.getA1Notation() == "A1") {
      event.value == "reset" ? RESET.reset() : META.ProcessMeta();
      TOTALS.updateTotals(sheet);
      return;
    }

    time("2.5");
    const filter = sheet.getFilter();
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
    if (UTIL.isColumnInRange([columns.preReq, columns.missed, columns.available], range)) {
      AVAILABLE.populateAvailable(sheet, event);
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
    if (UTIL.isColumnInRange(columns.check,range) || UTIL.isColumnInRange(columns.item,range)) {
      TOTALS.updateTotals(sheet);
    }
    timeEnd("10");
  } finally {
    UTIL.clearSheet();
    timeEnd();
  }
}