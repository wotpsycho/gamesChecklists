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
    const checklist = Checklist.fromSheet(sheet);

    const rowValueIndex = checklist.toRowIndex(Checklist.ROW.QUICK_FILTER) - range.getRow();
    const firstChangedColumn = range.getColumn();
    const lastChangedColumn = range.getLastColumn();
    const changedValues = range.getValues()[rowValueIndex];
    for (let column = firstChangedColumn; column <= lastChangedColumn; column++) {
      if (column == 1) continue; // First column is header
      const changedValue = changedValues[column-firstChangedColumn];
      let criteria = checklist.filter.getColumnFilterCriteria(column);
      if (changedValue) {
        if (criteria) {
          criteria = criteria.copy();
        } else {
          criteria = SpreadsheetApp.newFilterCriteria();
        }
        const filterRange = checklist.getColumnDataRange(column);
        criteria.whenFormulaSatisfied("=REGEXMATCH(" + filterRange.getA1Notation() + ",\"(?mis:"+ changedValue +")\")");
        checklist.filter.setColumnFilterCriteria(column, criteria);
      } else {
        if (criteria && criteria.getCriteriaType() == SpreadsheetApp.BooleanCriteria.CUSTOM_FORMULA) {
        // Remove it, but don't remove the hiddenValues criteria
          if (criteria.getHiddenValues()) {
            checklist.filter.setColumnFilterCriteria(column, SpreadsheetApp.newFilterCriteria().setHiddenValues(criteria.getHiddenValues()));
          } else {
            checklist.filter.removeColumnFilterCriteria(column);
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
  //let sheet = Checklist.getActiveSheet();
}