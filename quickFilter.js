/* NOTE: Could just set one quick filter formula for each column and leave it, but that causes
*  significant client side slowness. This does make it slower on the actual edit, but since it won't have to
*  run the formula every time the filter updates (which is every check) it ends up being faster. Even
*  ISBLANK checks to short-circuit the filter formula doesn't improve client side performance, so this is the
*  most efficient way so far.
*/
/* exported QUICK_FILTER */

// eslint-disable-next-line no-redeclare
const QUICK_FILTER = (function(){

  // eslint-disable-next-line no-unused-vars
  function isQuickFilterFormula(formula) {
    // TODO if needed
    return true;
  }

  function quickFilterChange(sheet, range) {
    var rows = UTIL.getRows(sheet);
    var filter = sheet.getFilter();

    var firstChangedColumn = range.getColumn();
    var lastChangedColumn = range.getLastColumn();
    var changedValues = range.getValues()[rows.quickFilter - range.getRow()];
    for (var column = firstChangedColumn; column <= lastChangedColumn; column++) {
      if (column == 1) continue; // First column is header
      var changedValue = changedValues[column-firstChangedColumn];
      var criteria = filter.getColumnFilterCriteria(column);
      if (changedValue) {
        if (criteria) {
          criteria = criteria.copy();
        } else {
          criteria = SpreadsheetApp.newFilterCriteria();
        }
        var filterRange = UTIL.getColumnDataRange(sheet, column);
        criteria.whenFormulaSatisfied("=REGEXMATCH(" + filterRange.getA1Notation() + ",\"(?mis:"+ changedValue +")\")");
        filter.setColumnFilterCriteria(column, criteria);
      } else {
        if (criteria && criteria.getCriteriaType() == SpreadsheetApp.BooleanCriteria.CUSTOM_FORMULA) {
        // Remove it, but don't remove the hiddenValues criteria
          if (criteria.getHiddenValues()) {
            filter.setColumnFilterCriteria(column, SpreadsheetApp.newFilterCriteria().setHiddenValues(criteria.getHiddenValues()));
          } else {
            filter.removeColumnFilterCriteria(column);
          }
        }
      }
    }
  }

  return {
    onChange: quickFilterChange,

    isQuickFilterFormula: isQuickFilterFormula,
  };

})();

// eslint-disable-next-line no-unused-vars
function debug() {
  //var sheet = SpreadsheetApp.getActiveSheet();
}