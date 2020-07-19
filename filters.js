// Forces filter to update
function reapplyFilter(filter) {
  console.time("reapplyFilter");
  if (filter) {
    Logger.log("Reapplying Filter");
    var range = filter.getRange();
    
    for (var i = range.getColumn(); i <= range.getLastColumn(); i++) {
      var criteria = filter.getColumnFilterCriteria(i);
      if (criteria) {
        filter.setColumnFilterCriteria(i,criteria);
        console.timeEnd("reapplyFilter");
        return; // Don't need to do more than one
      }
    }
  }
  console.timeEnd("reapplyFilter");
}