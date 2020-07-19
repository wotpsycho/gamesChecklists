// Save as Note to A1
function updateTotals(sheet) {
  console.time("totals");
  var columns = getColumns(sheet);
  var rows = _getRows(sheet);
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
  sheet.getRange("A1").setNote(notes.join('\n'));
  console.timeEnd("totals");
}

function _countByType(sheet, _typeColumn) {
  console.time("_countByType");
  var columns = getColumns(sheet);
  var counts = {
    _total: {
      checked: 0,
      total: 0,
    },
    _order: []
  };
  if (!_typeColumn) _typeColumn = columns.type;
  if (!_typeColumn || !columns.check) return;
  
  console.time("_countByType data");
  var checkData = _getColumnDataRange(sheet, columns.check).getValues();
  var typeData = _getColumnDataRange(sheet, _typeColumn).getValues();
    console.timeEnd("_countByType data");
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
  console.timeEnd("_countByType");
  return counts;
}