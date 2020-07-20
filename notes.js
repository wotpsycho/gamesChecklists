/* exported NOTES */
// eslint-disable-next-line no-redeclare
const NOTES = (function(){
// Update the Item hover notes with the data in the Item Notes column
  function moveNotes(range) {
    time();
    var sheet = range.getSheet();
    var columns = UTIL.getColumns(sheet);
    if (!columns.item || !columns.notes) {
      throw new Error("Cannot move notes on a sheet without both columns: ", CONFIG.COLUMN_HEADERS.item, CONFIG.COLUMN_HEADERS.notes);
    }
  
    Logger.log("Updating notes for rows ", range.getRow(), " to ", range.getLastRow());
  
    var items = UTIL.getColumnRangeFromRow(sheet,columns.item, range.getRow(),range.getNumRows());
    var notes = UTIL.getColumnRangeFromRow(sheet,columns.notes,range.getRow(),range.getNumRows());

    items.setNotes(notes.getValues());
    timeEnd();
  }


  return {
    moveNotes: moveNotes
  };
})();