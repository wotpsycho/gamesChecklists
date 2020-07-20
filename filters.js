/* exported FILTER */
// eslint-disable-next-line no-redeclare
const FILTER = (function(){
// Forces filter to update
  function reapplyFilter(filter) {
    time();
    if (filter) {
      Logger.log("Reapplying Filter");
      var range = filter.getRange();
    
      for (var i = range.getColumn(); i <= range.getLastColumn(); i++) {
        var criteria = filter.getColumnFilterCriteria(i);
        if (criteria) {
          filter.setColumnFilterCriteria(i,criteria);
          timeEnd();
          return; // Don't need to do more than one
        }
      }
    }
    timeEnd();
  }

  return {
    reapplyFilter: reapplyFilter
  };
})();