/* exported AVAILABLE */
// eslint-disable-next-line no-redeclare
const AVAILABLE = (function(){
// 12x item
// x12 item
// 12x column!value
  var MULTI_REGEX = /^((\d+)[*x]|[*x](\d+)) +(((.*)!)?(.+))$/;

  function populateAvailable(sheet = SpreadsheetApp.getActiveSheet(), range) {
    time();
    var columns = UTIL.getColumns(sheet);
    var rows = UTIL.getRows(sheet);
  
    if (!columns.available || !columns.check || !columns.item || !columns.preReq) return;
    var rangeRow;
    if (range) {
      if (range.getLastRow()  <= rows.header) return;
      rangeRow = range.getRow();
    } else {
      rangeRow = rows.header+1;
    }
  
    var itemDataRange = UTIL.getColumnDataRange(sheet,columns.item);
    var itemRowsByColumn = {
      item: {}
    };
  
    itemRowsByColumn.item = _getRowsByValue(itemDataRange);
    var lastItemRow = itemRowsByColumn.item._lastRow;
  
    if (!lastItemRow || rangeRow > lastItemRow) return;  
  
    var preReqRange = UTIL.getColumnRangeFromRow(sheet, columns.preReq, rangeRow, lastItemRow-rangeRow+1);
    var availableDataRange = UTIL.getColumnRangeFromRow(sheet, columns.available, rangeRow, lastItemRow-rangeRow+1);

    var preReqValues = preReqRange.getValues();
    var preReqFormulas = preReqRange.getFormulas();
    // TODO
    //var preReqValidations = preReqRange.getDataValidations(); 
  
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
              var key = multipleCheck[4];
              var altColumnName = multipleCheck[6];
              preReq = multipleCheck[7];
            
              let formula;
              if (formulaCache[key]) {
                formula = formulaCache[key];
              } else {
                var column = "item";
                var doPrefixMatch = true;
                if (altColumnName) {
                  column = altColumnName;
                  if (!itemRowsByColumn[column]) {
                    var altColumn = UTIL.getColumns(sheet, [altColumnName])[altColumnName];
                    if (!altColumn) {
                      orFormulas.push("ERROR: Cannot find column " + altColumnName);
                      continue;
                    } else {
                      var altColumnDataRange = UTIL.getColumnDataRange(sheet,altColumn);
                      itemRowsByColumn[altColumnName] = _getRowsByValue(altColumnDataRange);
                      doPrefixMatch = preReq.charAt(preReq.length-1) == "*";
                    }
                  }
                }
                if (preReq.charAt(preReq.length-1) == "*") {
                // is only useful in altColumn format (since it is implied otherwise), but include here so the preReq can be more verbose
                  preReq = preReq.substring(0,preReq.length-1);
                }
              
                var multiCellRows = [];
                for (var itemName in itemRowsByColumn[column]) {
                  if (doPrefixMatch ? itemName.match("^" + preReq) : (itemName === preReq)) {
                    for (let cellIndex = 0; cellIndex < itemRowsByColumn[column][itemName].length; cellIndex++) {
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
                for (let cellIndex = 0; cellIndex < itemRowsByColumn.item[preReq].length; cellIndex++) {
                  orFormulas.push("R" + itemRowsByColumn.item[preReq][cellIndex] + "C" + columns.check);
                }
              } else {
                orFormulas.push("ERROR: Cannot find item " + preReq);
              }
            }
          }
          let formula = orFormulas.join(", ");
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
    }
  
    //Logger.log(availables);
    availableDataRange.setFormulasR1C1(availables);
    timeEnd();
  }


  function _getRowsByValue(range) {
    time();
    var column = range.getColumn();
    time(column);
  
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
      if (!Object.prototype.hasOwnProperty.call(rows,value)) {
        rows[value] = [row];
      } else {
        rows[value].push(row);
      }
    }
    timeEnd(column,true);
    return rows;
  }

  return {
    populateAvailable: populateAvailable
  };
})();