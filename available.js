/* exported AVAILABLE */
// eslint-disable-next-line no-redeclare
const AVAILABLE = (function(){
// 12x item
// x12 item
// 12x column!value
  const MULTI_REGEX = /^((\d+)[*x]|[*x](\d+)) +(((.*)!)?(.+))$/;

  function populateAvailable(sheet = SpreadsheetApp.getActiveSheet(), range) {
    time();
    const columns = UTIL.getColumns(sheet);
    const rows = UTIL.getRows(sheet);
  
    if (!columns.available || !columns.check || !columns.item || !columns.preReq) return;
    let rangeRow;
    if (range) {
      if (range.getLastRow()  <= rows.header) return;
      rangeRow = range.getRow();
    } else {
      rangeRow = rows.header+1;
    }
  
    const itemDataRange = UTIL.getColumnDataRange(sheet,columns.item);
    const itemRowsByColumn = {
      item: {}
    };
  
    itemRowsByColumn.item = _getRowsByValue(itemDataRange);
    const lastItemRow = itemRowsByColumn.item._lastRow;
  
    if (!lastItemRow || rangeRow > lastItemRow) return;  
  
    const preReqRange = UTIL.getColumnRangeFromRow(sheet, columns.preReq, rangeRow, lastItemRow-rangeRow+1);
    const availableDataRange = UTIL.getColumnRangeFromRow(sheet, columns.available, rangeRow, lastItemRow-rangeRow+1);

    const preReqValues = preReqRange.getValues();
    const preReqFormulas = preReqRange.getFormulas();
    // TODO
    //const preReqValidations = preReqRange.getDataValidations(); 
  
    // will be overwriting these
    const availables = availableDataRange.getValues();
  
    // cache!
    const formulaCache = {};

    for (let i = 0; i < preReqValues.length; i++) {
      const andFormulas = [];
      if (preReqFormulas[i][0]) {
      // Allow direct formulas, just use reference
        availables[i][0] = "=R" + (i+rangeRow) + "C" + columns.preReq;
        continue;
      }
      if (preReqValues[i][0]) {
        const preReqAnds = preReqValues[i][0].toString().trim().split(/ *[\n;] */);
        for (let j = 0; j < preReqAnds.length; j++) {
          let preReq = preReqAnds[j].trim();
          if (!preReq) continue;
        
          const preReqOrs = preReq.split(/ *\| */);
        
          const orFormulas = [];        
          for (let k = 0; k < preReqOrs.length; k++) {
            preReq = preReqOrs[k];
            const multipleCheck = MULTI_REGEX.exec(preReq);
            if (multipleCheck) {
              const numNeeded = multipleCheck[2] || multipleCheck[3];
              const key = multipleCheck[4];
              const altColumnName = multipleCheck[6];
              preReq = multipleCheck[7];
            
              let formula;
              if (formulaCache[key]) {
                formula = formulaCache[key];
              } else {
                let column = "item";
                let doPrefixMatch = true;
                if (altColumnName) {
                  column = altColumnName;
                  if (!itemRowsByColumn[column]) {
                    const altColumn = UTIL.getColumns(sheet, [altColumnName])[altColumnName];
                    if (!(altColumn >= 0)) {
                      orFormulas.push("ERROR: Cannot find column " + altColumnName);
                      continue;
                    } else {
                      const altColumnDataRange = UTIL.getColumnDataRange(sheet,altColumn);
                      itemRowsByColumn[altColumnName] = _getRowsByValue(altColumnDataRange);
                      doPrefixMatch = preReq.charAt(preReq.length-1) == "*";
                    }
                  }
                }
                if (preReq.charAt(preReq.length-1) == "*") {
                // is only useful in altColumn format (since it is implied otherwise), but include here so the preReq can be more verbose
                  preReq = preReq.substring(0,preReq.length-1);
                }
              
                const multiRows = [];
                Object.entries(itemRowsByColumn[column]).forEach(([itemName, itemRows]) => {
                  if (doPrefixMatch ? itemName.match("^" + preReq) : (itemName === preReq)) {
                    multiRows.push(...itemRows);
                  }
                });
                if (multiRows.length < numNeeded) {
                  formula = "ERROR: There are only " + multiRows.length + " of " + preReq;
                } else {
                  formula = "SUM(IF(R" + multiRows.join("C" + columns.check + ", 1), IF(R") + "C" + columns.check + ", 1)) >= ";
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
    
      let cellFormula;
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
    const column = range.getColumn();
    time(column);
  
    const values = range.getValues();
    const rows = {
      _duplicates: [],
      _lastRow: 0,
      _values: values,
    };
  
    const firstRow = range.getRow();
    const lastRow = firstRow + values.length - 1;
  
    for (let row = firstRow; row <= lastRow; row++) {
      const value = values[row-firstRow].toString() || "";
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