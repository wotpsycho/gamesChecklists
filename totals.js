/* exported TOTALS */
// eslint-disable-next-line no-redeclare
const TOTALS = (function(){
// Save as Note to A1
  function updateTotals(sheet) {
    time();
    var columns = UTIL.getColumns(sheet);
    if (columns.item === columns.check+1) return; // No type/category to break down
    var counts = _countByType(sheet, columns.check+1);
    Logger.log("counts",counts);
    if (!counts) return;
    var notes = [];
    for (var i = 0; i < counts._order.length; i++) {
      var type = counts._order[i];
      notes.push(counts[type].checked + "/" + counts[type].total + " " + type);
    }
    notes.push(counts._total.checked + "/" + counts._total.total + " Total");
    sheet.getRange("A1").setNote(notes.join("\n"));
    timeEnd();
  }

  function _countByType(sheet, _typeColumn) {
    time();
    var columns = UTIL.getColumns(sheet);
    var counts = {
      _total: {
        checked: 0,
        total: 0,
      },
      _order: []
    };
    if (!_typeColumn) _typeColumn = columns.type;
    if (!_typeColumn || !columns.check) return;
  
    time("data");
    var checkData = UTIL.getColumnDataRange(sheet, columns.check).getValues();
    var typeData = UTIL.getColumnDataRange(sheet, _typeColumn).getValues();
    timeEnd("data");
    for (var i = 0; i < typeData.length; i++) {
      var type = typeData[i][0];
      if (!type || !type.trim()) continue;
      if (!counts[type]) {
        counts[type] = {
          checked: 0,
          total: 0,
        };
        counts._order.push(type);
      }
      counts[type].total++;
      counts._total.total++;
      if (checkData[i][0]) {
        counts[type].checked++;
        counts._total.checked++;
      }
    }
    timeEnd();
    return counts;
  }

  return {
    updateTotals: updateTotals,
  };
})();