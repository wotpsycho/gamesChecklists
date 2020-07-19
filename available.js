
// 12x item
// x12 item
// 12x column!value
var MULTI_REGEX = /^((\d+)[\*x]|[\*x](\d+)) +(((.*)!)?(.+))$/;

function populateAvailable(sheet = SpreadsheetApp.getActiveSheet(), range) {
  functionTime();
  var columns = getColumns(sheet);
  var rows = _getRows(sheet);
  
  if (!columns.available || !columns.check || !columns.item || !columns.preReq) return;
  var rangeRow;
  if (range) {
    if (range.getLastRow()  <= rows.header) return;
    rangeRow = range.getRow();
  } else {
    rangeRow = rows.header+1;
  }
  
  var itemDataRange = _getColumnDataRange(sheet,columns.item);
  var itemRowsByColumn = {
    item: {}
  };
  
  itemRowsByColumn.item = _getRowsByValue(itemDataRange);
  var lastItemRow = itemRowsByColumn.item._lastRow;
  
  //Logger.log("LIR: ", lastItemRow,rangeRow,lastRangeRow);
  if (!lastItemRow || rangeRow > lastItemRow) return;  
  
  var preReqRange = _getColumnRangeFromRow(sheet, columns.preReq, rangeRow, lastItemRow-rangeRow+1);
  var availableDataRange = _getColumnRangeFromRow(sheet, columns.available, rangeRow, lastItemRow-rangeRow+1);

  var preReqValues = preReqRange.getValues();
  var preReqFormulas = preReqRange.getFormulas();
  //var preReqValidations = preReqRange.getDataValidations();

  //console.log("weirddebug", lastItemRow, rows.header, preReqValues.length, availableDataRange.getNumRows());
  
  // will be overwriting these
  var availables = availableDataRange.getValues();
  
  // cache!
  var formulaCache = {};

  for (var i = 0; i < preReqValues.length; i++) {
    var andFormulas = [];
    if (preReqFormulas[i][0]) {
      // Allow direct formulas, just use reference
      availables[i][0] = "=R" + (i+rangeRow) + "C" + columns.preReq;
      continue;
    }
    if (preReqValues[i][0]) {
      var preReqAnds = preReqValues[i][0].toString().trim().split(/ *[\n;] */);
      for (var j = 0; j < preReqAnds.length; j++) {
        var preReq = preReqAnds[j].trim();
        if (!preReq) continue;
        
        var preReqOrs = preReq.split(/ *\| */);
        
        var orFormulas = [];        
        for (var k = 0; k < preReqOrs.length; k++) {
          preReq = preReqOrs[k];
          var multipleCheck = MULTI_REGEX.exec(preReq);
          if (multipleCheck) {
            var numNeeded = multipleCheck[2] || multipleCheck[3];
            var key = multipleCheck[4]
            var altColumnName = multipleCheck[6];
            preReq = multipleCheck[7];
            //Logger.log("DEBUG AV2: [num, key, multiColumn, preReq]", [numNeeded, key, altColumnName, preReq]);            
            
            var formula;
            if (formulaCache[key]) {
              formula = formulaCache[key];
            } else {
              var column = "item";
              if (altColumnName) {
                column = altColumnName;
                if (!itemRowsByColumn[column]) {
                  var altColumn = getColumns(sheet, [altColumnName])[altColumnName];
                  if (!altColumn) {
                    orFormulas.push("ERROR: Cannot find column " + altColumnName);
                    continue;
                  } else {
                    var altColumnDataRange = _getColumnDataRange(sheet,altColumn);
                    itemRowsByColumn[altColumnName] = _getRowsByValue(altColumnDataRange);
                  }
                }
              }
              
              var multiCellRows = [];
              for (var itemName in itemRowsByColumn[column]) {
                if (itemName.match("^" + preReq)) {
                  for (var cellIndex = 0; cellIndex < itemRowsByColumn[column][itemName].length; cellIndex++) {
                    multiCellRows.push(itemRowsByColumn[column][itemName][cellIndex]);
                  }
                }
              }
              if (multiCellRows.length < numNeeded) {
                formula = "ERROR: There are only " + multiCellRows.length + " of " + preReq;
              } else {
                formula = "SUM(IF(R" + multiCellRows.join("C" + columns.check + ", 1), IF(R") + "C" + columns.check + ", 1)) >= ";
              }
             
              formulaCache[key] = formula;
            }
            orFormulas.push(formula + numNeeded);
            // end multi
          } else {
            // single item
            if (itemRowsByColumn.item[preReq]) {
              for (var cellIndex = 0; cellIndex < itemRowsByColumn.item[preReq].length; cellIndex++) {
                orFormulas.push("R" + itemRowsByColumn.item[preReq][cellIndex] + "C" + columns.check);
              }
            } else {
              orFormulas.push("ERROR: Cannot find item " + preReq);
            }
          }
        }
        var formula = orFormulas.join(", ");
        if (orFormulas.length > 1) {
          formula = "OR(" + formula + ")";
        }
        andFormulas.push(formula);
      }
    }
    
    var cellFormula;
    if (andFormulas.length == 0) {
      cellFormula = "TRUE";
    } else if (andFormulas.length == 1) {
      cellFormula = "=" + andFormulas[0];
    } else {
      cellFormula = "=AND(" + andFormulas.join(", ") + ")";
    }
    
    availables[i][0] = cellFormula;
    
    //Logger.log("DEBUG PA: ",i, available);
    //availables[i][0] = available;
  }
  
  //Logger.log(availables);
  availableDataRange.setFormulasR1C1(availables);
  functionTimeEnd();
}


function _getRowsByValue(range) {
  functionTime();
  var column = range.getColumn();
  functionTime(column);
  
  var values = range.getValues();
  var rows = {
    _duplicates: [],
    _lastRow: 0,
    _values: values,
  };
  
  var firstRow = range.getRow();
  var lastRow = firstRow + values.length - 1;
  
  for (var row = firstRow; row <= lastRow; row++) {
    var value = values[row-firstRow].toString() || "";
    if (!value || !value.trim()) continue;
    rows._lastRow = row;
    if (!rows.hasOwnProperty(value)) {
      rows[value] = [row];
    } else {
      rows[value].push(row);
    }
  }
  functionTimeEnd(column,true);
  return rows;
}

/*
// Due to sandboxing, resets for each trigger/customFunc/etc., but populateAvailable resets anyway
var _columnRanges = {
};

function _getCheckedRanges(sheet, _columnName) {
  var columns = getColumns(sheet, _columnName ? [_columnName] : []);
  if (!_columnName) _columnName = 'item';
  if (!columns.check || !columns[_columnName]) throw new Error("Missing the check or item/passed column");
  if (_columnCounts[_columnName]) return _columnCounts[_columnName];
  
  var checkData = _getColumnDataRange(sheet,columns.check).getValues();
  var itemData = _getColumnDataRange(sheet,columns[_columnName]).getValues();
  
  var counts = {};
  for (var i = 0; i < checkData.length; i++) {
    var item = itemData[i][0];
    if (!item) continue;
    item = item.trim();
    if (!counts[item]) counts[item] = 0;
    if (checkData[i][0]) counts[item]++;
  }
  return _columnCounts[_columnName] = counts;
}

function _getMultiRanges(sheet, itemCounts, prefix) {
  var multiCount = 0;
  var found = false;
  
  var altColumnCheck = /^(.+)!(.+)$/.exec(prefix);
  if (altColumnCheck) {
    try {
      Logger.log("DEBUG MC: ", altColumnCheck);
      prefix = altColumnCheck[2];
      itemCounts = _getCheckedCounts(sheet, altColumnCheck[1]);
      Logger.log("DEBUG MC2: ", itemCounts);
    } catch (e) {
      Logger.log("DEBUG MC3: ", _columnCounts);
      return undefined; // Invalid column
    }
  }
  for (var itemName in itemCounts) {
    if (!itemCounts.hasOwnProperty(itemName)) continue; // functions, etc.
    if (itemName.match("^"+prefix)) {
      found = true;
      multiCount += itemCounts[itemName];
    }
  }
  
  if (found) return multiCount;
}






function populateAvailableV1(sheet) {
  var columns = getColumns(sheet);
  
  if (!columns.available || !columns.check || !columns.item || !columns.preReq) return;
  _columnCounts = {};
  
  var preReqValues = _getColumnDataRange(sheet,columns.preReq).getValues();
  var availableDataRange = _getColumnDataRange(sheet,columns.available);
  
  var availables = availableDataRange.getValues();
  
  var itemCounts = _getCheckedCounts(sheet);
  
  Logger.log("DEBUG PA0: ", availableDataRange.getNumRows());

  for (var i = 0; i < preReqValues.length; i++) {
    var available = true;
    if (preReqValues[i][0]) {
      var preReqs = preReqValues[i][0].split('\n');
      for (var j = 0; j < preReqs.length; j++) {
        if (available !== true) break;
        var preReq = preReqs[j].trim();
        if (!preReq) continue;
        
        var numNeeded = 1;

        var multipleCheck = MULTI_REGEX.exec(preReq);
        if (multipleCheck) {
          numNeeded = multipleCheck[2] || multipleCheck[3];
          preReq = multipleCheck[4];
          if (!itemCounts.hasOwnProperty(preReq)) {
            // _getMultiCounts
            var multiCount = _getMultiCounts(sheet, itemCounts, preReq);
            Logger.log("DEBUG ??: ", preReq, multiCount);
            if (multiCount >= 0) itemCounts[preReq] = multiCount;
            // end _getMultiCounts
          }
          Logger.log("DEBUG ?!:", numNeeded, preReq, itemCounts[preReq]);
        }
        if (itemCounts.hasOwnProperty(preReq)) {
          available = itemCounts[preReq] >= numNeeded;
        } else {
          Logger.log("ERROR: Found error in preReq: (preReqs, preReq, numNeeded, multiCheck) ", preReqs, preReq, numNeeded, multipleCheck);
          available = "#ERROR!";
          break;
        }
      }
    }
    
    Logger.log("DEBUG PA: ",i, available);
    availables[i][0] = available;
  }
  
  availableDataRange.setValues(availables);
}


// Due to sandboxing, resets for each trigger/customFunc/etc., but populateAvailable resets anyway
var _columnCounts = {
};

function _getCheckedCounts(sheet, _columnName) {
  var columns = getColumns(sheet, _columnName ? [_columnName] : []);
  if (!_columnName) _columnName = 'item';
  if (!columns.check || !columns[_columnName]) throw new Error("Missing the check or item/passed column");
  if (_columnCounts[_columnName]) return _columnCounts[_columnName];
  
  var checkData = _getColumnDataRange(sheet,columns.check).getValues();
  var itemData = _getColumnDataRange(sheet,columns[_columnName]).getValues();
  
  var counts = {};
  for (var i = 0; i < checkData.length; i++) {
    var item = itemData[i][0];
    if (!item) continue;
    item = item.trim();
    if (!counts[item]) counts[item] = 0;
    if (checkData[i][0]) counts[item]++;
  }
  return _columnCounts[_columnName] = counts;
}

function _getMultiCounts(sheet, itemCounts, prefix) {
  var multiCount = 0;
  var found = false;
  
  var altColumnCheck = /^(.+)!(.+)$/.exec(prefix);
  if (altColumnCheck) {
    try {
      Logger.log("DEBUG MC: ", altColumnCheck);
      prefix = altColumnCheck[2];
      itemCounts = _getCheckedCounts(sheet, altColumnCheck[1]);
      Logger.log("DEBUG MC2: ", itemCounts);
    } catch (e) {
      Logger.log("DEBUG MC3: ", _columnCounts);
      return undefined; // Invalid column
    }
  }
  for (var itemName in itemCounts) {
    if (!itemCounts.hasOwnProperty(itemName)) continue; // functions, etc.
    if (itemName.match("^"+prefix)) {
      found = true;
      multiCount += itemCounts[itemName];
    }
  }
  
  if (found) return multiCount;
}*/

/*

function populateAvailable(sheet, range) {
  console.time("populateAvailable");
  var columns = getColumns(sheet);
  var rows = _getRows(sheet);
  
  if (!columns.available || !columns.check || !columns.item || !columns.preReq) return;
  var rangeRow;
  var lastRangeRow;
  if (range) {
    rangeRow = range.getRow();
    lastRangeRow = range.getLastRow();
  }
  if (range && lastRangeRow <= rows.header) return;
  _columnCounts = {};
  
  
  var itemDataRange = _getColumnDataRange(sheet,columns.item);
  var itemCellsByColumn = {
    item: {}
  };
  
  itemCellsByColumn.item = _getCellsByValue(itemDataRange);
  var lastItemRow = itemCellsByColumn.item._lastRow;
  //Logger.log("LIR: ", lastItemRow,rangeRow,lastRangeRow);
  if (!lastItemRow || (range && rangeRow > lastItemRow)) return;  
  var preReqValues;
  var availableDataRange;
  if (range) {
    var preReqValues = sheet.getRange(rangeRow, columns.preReq, lastItemRow-rangeRow+1).getValues();
    var availableDataRange = sheet.getRange(rangeRow, columns.available, lastItemRow-rangeRow+1);

  } else {
    var preReqValues = _getColumnRangeFromRow(sheet,columns.preReq,rows.header+1,lastItemRow-rows.header).getValues();
    var availableDataRange = _getColumnRangeFromRow(sheet,columns.available,rows.header+1,lastItemRow-rows.header);
  }
  //console.log("weirddebug", lastItemRow, rows.header, preReqValues.length, availableDataRange.getNumRows());
  
  // will be overwriting these
  var availables = availableDataRange.getValues();
  
  // cache!
  var formulaCache = {};
  
  

  for (var i = 0; i < preReqValues.length; i++) {
    var andFormulas = [];
    if (preReqValues[i][0]) {
switched/\      var preReqAnds = preReqValues[i][0].trim().split(/ *[\n;] *\);
      for (var j = 0; j < preReqAnds.length; j++) {
        var preReq = preReqAnds[j].trim();
        if (!preReq) continue;
        
switched /\        var preReqOrs = preReq.split(/ *\| *\);
        
        var orFormulas = [];        
        for (var k = 0; k < preReqOrs.length; k++) {
          preReq = preReqOrs[k];
          var multipleCheck = MULTI_REGEX.exec(preReq);
          if (multipleCheck) {
            var numNeeded = multipleCheck[2] || multipleCheck[3];
            var key = multipleCheck[4]
            var altColumnName = multipleCheck[6];
            preReq = multipleCheck[7];
            //Logger.log("DEBUG AV2: [num, key, multiColumn, preReq]", [numNeeded, key, altColumnName, preReq]);            
            
            var formula;
            if (formulaCache[key]) {
              formula = formulaCache[key];
            } else {
              var column = "item";
              if (altColumnName) {
                column = altColumnName;
                if (!itemCellsByColumn[column]) {
                  var altColumn = getColumns(sheet, [altColumnName])[altColumnName];
                  if (!altColumn) {
                    orFormulas.push("ERROR: Cannot find column " + altColumnName);
                    continue;
                  } else {
                    var altColumnDataRange = _getColumnDataRange(sheet,altColumn);
                    itemCellsByColumn[altColumnName] = _getCellsByValue(altColumnDataRange);
                  }
                }
              }
              
              var multiCellRows = [];
              for (var itemName in itemCellsByColumn[column]) {
                if (itemName.match("^" + preReq)) {
                  for (var cellIndex = 0; cellIndex < itemCellsByColumn[column][itemName].length; cellIndex++) {
                    multiCellRows.push(itemCellsByColumn[column][itemName][cellIndex].getRow());
                  }
                }
              }
              if (multiCellRows.length < numNeeded) {
                formula = "ERROR: There are only " + multiCellRows.length + " of " + preReq;
              } else {
                formula = "SUM(IF(R" + multiCellRows.join("C" + columns.check + ", 1), IF(R") + "C" + columns.check + ", 1)) >= ";
              }
             
              formulaCache[key] = formula;
            }
            orFormulas.push(formula + numNeeded);
            // end multi
          } else {
            // single item
            if (itemCellsByColumn.item[preReq]) {
              for (var cellIndex = 0; cellIndex < itemCellsByColumn.item[preReq].length; cellIndex++) {
                orFormulas.push("R" + itemCellsByColumn.item[preReq][cellIndex].getRow() + "C" + columns.check);
              }
            } else {
              orFormulas.push("ERROR: Cannot find item " + preReq);
            }
          }
        }
        var formula = orFormulas.join(", ");
        if (orFormulas.length > 1) {
          formula = "OR(" + formula + ")";
        }
        andFormulas.push(formula);
      }
    }
    
    var cellFormula;
    if (andFormulas.length == 0) {
      cellFormula = "TRUE";
    } else if (andFormulas.length == 1) {
      cellFormula = "=" + andFormulas[0];
    } else {
      cellFormula = "=AND(" + andFormulas.join(", ") + ")";
    }
    
    availables[i][0] = cellFormula;
    
    //Logger.log("DEBUG PA: ",i, available);
    //availables[i][0] = available;
  }
  
  //Logger.log(availables);
  availableDataRange.setFormulasR1C1(availables);
  console.timeEnd("populateAvailable");
}
*/