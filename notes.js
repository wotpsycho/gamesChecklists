// Update the Item hover notes with the data in the Item Notes column
function moveNotes(range) {
  console.time("moveNotes");
  var sheet = range.getSheet();
  var columns = getColumns(sheet);
  if (!columns.item || !columns.notes) {
    throw new Error("Cannot move notes on a sheet without both columns: ", COLUMNS_TITLES.item, COLUMN_TITLES.notes);
  }
  
  Logger.log("Updating notes for rows ", range.getRow(), " to ", range.getLastRow());
  
  var items = _getColumnRangeFromRow(sheet,columns.item, range.getRow(),range.getNumRows());
  var notes = _getColumnRangeFromRow(sheet,columns.notes,range.getRow(),range.getNumRows());

 /* var items = sheet.getRange(range.getRow(),columns.item,range.getNumRows());
  var notes = sheet.getRange(range.getRow(),columns.notes,range.getNumRows());
*/
  items.setNotes(notes.getValues());
  console.timeEnd("moveNotes");
}
