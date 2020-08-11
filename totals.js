/* exported TOTALS */
// eslint-disable-next-line no-redeclare
const TOTALS = (function(){
// Save as Note to A1
  function updateTotals(sheet) {
    time();
    const columns = UTIL.getColumns(sheet);
    const rows = UTIL.getRows(sheet);
    if (columns.item === columns.check+1) return; // No type/category to break down
    const counts = _countByType(sheet, columns.check+1);
    Logger.log("counts",counts);
    if (!counts) return;
    const notes = [];
    counts._order.forEach((type) => {
      notes.push(counts[type].checked + "/" + counts[type].total + " " + type);
    });

    notes.push(counts._total.checked + "/" + counts._total.total + " Total");
    const totalCell = sheet.getRange("A1");
    totalCell.setNote(notes.join("\n"));
    totalCell.setFormulaR1C1(`=CONCATENATE(COUNTIF(R${rows.header + 1}C${columns.check}:C${columns.check},TRUE), "/", COUNTA(R${rows.header+1}C${columns.item}:C${columns.item}))`);
    timeEnd();
  }

  function _countByType(sheet, _typeColumn) {
    time();
    const columns = UTIL.getColumns(sheet);
    const counts = {
      _total: {
        checked: 0,
        total: 0,
      },
      _order: []
    };
    if (!_typeColumn) _typeColumn = columns.type;
    if (!_typeColumn || !columns.check) return;
  
    time("data");
    const checkData = UTIL.getColumnDataRange(sheet, columns.check).getValues().map((row) => row[0]);
    const typeData = UTIL.getColumnDataRange(sheet, _typeColumn).getValues().map((row) => row[0]);
    timeEnd("data");
    typeData.forEach((type, i) => {
      if (!type || !type.trim()) return;
      if (!counts[type]) {
        counts[type] = {
          checked: 0,
          total: 0,
        };
        counts._order.push(type);
      }
      counts[type].total++;
      counts._total.total++;
      if (checkData[i]) {
        counts[type].checked++;
        counts._total.checked++;
      }
    });
    timeEnd();
    return counts;
  }

  return {
    updateTotals: updateTotals,
  };
})();