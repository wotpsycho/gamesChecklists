// DEBUG
var lastEdit;

function onEdit(e) {
  functionTime();
  console.time("onEdit");
  try {
    console.time("1");
    var range = e.range;
    console.timeEnd("1");
    
    console.time("2");
    var sheet = range.getSheet();
    console.timeEnd("2");
    
    
    if (!_getHeaderRow(sheet)) return; // Non checklist
    
    console.time("3");
    var columns = getColumns(sheet);
    console.timeEnd("3");
    console.time("4");
    var rows = _getRows(sheet);
    console.timeEnd("4");
    console.time("5");
    Logger.log("edit: ",   lastEdit = range.getA1Notation());
    console.timeEnd("5");
    
    //QUICK DEBUG:  try { resetSettings(sheet); } catch (e) { sheet.getRange("F1").setValue(e.message);} finally { return;  }
    
    if (_isRowInRange(rows.quickFilter,range)) {
      quickFilterChange(sheet, range, e);
    }

    console.time("2.5")
    var filter = sheet.getFilter();
    console.timeEnd("2.5");
    
    console.time("6");
    if (_isRowInRange(rows.quickFilter,range) && range.getNumRows() == 1) {
      reapplyFilter(filter);
      
      console.timeEnd("6");
      console.timeEnd("onEdit")
      return;
    }
    console.timeEnd("6");
    
    console.time("6.5");
    Logger.log(rows);
    if (_isRowInRange(rows.settings, range)) {
      updateSettings(sheet,range);
      if (range.getNumRows() == 1) {
        console.timeEnd("6.5");
        console.timeEnd("onEdit")
        return;
      }
    }
    console.timeEnd("6.5");
    
    console.time("7");
    if (_isColumnInRange(columns.item, range)) {
      populateAvailable(sheet);
    } else if (_isColumnInRange(columns.preReq, range) || _isColumnInRange(columns.available, range)) {
      populateAvailable(sheet, range);
    }
    console.timeEnd("7");
    
    console.time("8");
    if (_isColumnInRange(columns.check, range) || _isColumnInRange(columns.preReq,range) || 
      _isRowInRange(rows.quickFilter,range)) {
        reapplyFilter(filter);
      }
    console.timeEnd("8");
    
    console.time("9");
    if (_isColumnInRange(columns.notes,range)) {
      moveNotes(range);
    }
    console.timeEnd("9");
    
    console.time("10");
    if (_isColumnInRange(columns.check,range)) {
      updateTotals(sheet);
    }
    console.timeEnd("10");
    
    //sheet.getRange("D2").setValue(sheet.getRange("B4:D").getLastRow());
  } finally {
    console.timeEnd("onEdit")
    functionTimeEnd();
  }
}