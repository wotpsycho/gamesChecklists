/* exported AVAILABLE */
// eslint-disable-next-line no-redeclare
const AVAILABLE = (function(){
  // 12x item
  // x12 item
  // 12x column!value
  const MULTI_REGEX = /^((\d+)[*x]|[*x](\d+)) +(((.*)!)?(.+))$/;
  const BOOLEAN_FORMULAS = {
    AND: {
      regEx: / *&& */,
      identifier: value => !!(value && value.match(BOOLEAN_FORMULAS.AND.regEx)),
      splitter: value => value.split(BOOLEAN_FORMULAS.AND.regEx),
      generator: values => {
        if (values.length == 1) return values[0];
        else if (values.length > 1) return "AND(" + values.join(",") + ")";
      },
    },
    OR: {
      regEx: / *\|\|? */, 
      identifier: value => !!(value && value.match(BOOLEAN_FORMULAS.OR.regEx)),
      splitter: value => value.split(BOOLEAN_FORMULAS.OR.regEx),
      generator: values => {
        if (values.length == 1) return values[0];
        else if (values.length > 1) return "OR(" + values.join(",") + ")";
      },
    },
    NOT: {
      regEx: /^ *! */,
      identifier: value => !!(value && value.match(BOOLEAN_FORMULAS.NOT.regEx)),
      splitter: value => BOOLEAN_FORMULAS.NOT.identifier(value) ? value.split(BOOLEAN_FORMULAS.NOT.regEx)[1] : value,
      generator: value => "NOT(" + value + ")",
    }
  };

  function populateAvailable(sheet = SpreadsheetApp.getActiveSheet(), range) {
    time();
    const columns = UTIL.getColumns(sheet);
    const rows = UTIL.getRows(sheet);
    const multiFormulaCache = {};
  
    // Must have required columns
    if (!columns.available || !columns.check || !columns.item || !columns.preReq) return;
  
    const itemDataRange = UTIL.getColumnDataRange(sheet,columns.item);
    const itemRowsByColumn = {
      item: _getRowsByValue(itemDataRange)
    };
    const lastItemRow = itemRowsByColumn.item._lastRow;

    let rangeRow = range ? range.getRow() : rows.header+1;
    let lastRangeRow = range ? range.getLastRow() : lastItemRow;
    if (rangeRow <= rows.header) rangeRow = rows.header+1;

    if (!lastItemRow || lastRangeRow <= rows.header) return;
    
    const preReqRange = UTIL.getColumnRangeFromRow(sheet, columns.preReq, rangeRow, lastRangeRow-rangeRow+1);
    const missedRange = columns.missed && UTIL.getColumnRangeFromRow(sheet, columns.missed, rangeRow, lastRangeRow-rangeRow+1);
    const availableDataRange = UTIL.getColumnRangeFromRow(sheet, columns.available, rangeRow, lastRangeRow-rangeRow+1);

    const preReqValues = preReqRange.getValues();
    const preReqFormulas = preReqRange.getFormulas();
    const missedValues = missedRange && missedRange.getValues();
    const missedFormulas = missedRange && missedRange.getFormulas();
    // TODO add interactive validation
    //const preReqValidations = preReqRange.getDataValidations(); 
  
    // will be overwriting these
    const availables = availableDataRange.getValues();

    for (let i = 0; i < preReqValues.length; i++) {
      const andFormulas = [];
      if (preReqFormulas[i][0]) {
        // Allow direct formulas, just use reference
        andFormulas.push("R" + (i+rangeRow) + "C" + columns.preReq);
      } else if (preReqValues[i][0]) {
        const calculatedPreReqFormulas = _determineCellLineFormulas(preReqValues[i][0], BOOLEAN_FORMULAS.OR);
        andFormulas.push(...calculatedPreReqFormulas);
      }
      if (missedFormulas && missedFormulas[i][0]) {
        andFormulas.push(BOOLEAN_FORMULAS.NOT.generator("R" + (i+rangeRow) + "C" + columns.missed));
      } else if (missedValues && missedValues[i][0]) {
        const calculatedMissedFormulas = _determineCellLineFormulas(missedValues[i][0], BOOLEAN_FORMULAS.AND);
        andFormulas.push(BOOLEAN_FORMULAS.NOT.generator(BOOLEAN_FORMULAS.OR.generator(calculatedMissedFormulas)));
      }
    
      let cellFormula;
      if (andFormulas.length == 0) {
        cellFormula = "TRUE";
      } else {
        cellFormula = "=" + BOOLEAN_FORMULAS.AND.generator(andFormulas);
      }
    
      availables[i][0] = cellFormula;
    }
  
    //Logger.log(availables);
    availableDataRange.setFormulasR1C1(availables);
    timeEnd();

    // SCOPED HELPER FUNCTIONS
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

    function _determineCellLineFormulas(cellValue, lineFormulaType) {
      time();
      const formulas = [];
      const cellLines = cellValue.toString().trim().split(/ *[\n;] */);
      for (let j = 0; j < cellLines.length; j++) {
        let line = cellLines[j].trim();
        if (!line) continue;
  
        const lineSplit = lineFormulaType.splitter(line);
  
        const lineFormulas = [];        
        for (let k = 0; k < lineSplit.length; k++) {
          line = lineSplit[k];
          const multipleCheck = MULTI_REGEX.exec(line);
          if (multipleCheck) {
            const multiFormula = _handleMulti(sheet, multipleCheck);
            lineFormulas.push(multiFormula);
          // end multi
          } else {
          // single item
            if (itemRowsByColumn.item[line]) {
              for (let cellIndex = 0; cellIndex < itemRowsByColumn.item[line].length; cellIndex++) {
                let formula = "R" + itemRowsByColumn.item[line][cellIndex] + "C" + columns.check;
                lineFormulas.push(formula);
              }
            } else {
              lineFormulas.push("ERROR: Cannot find item " + line);
            }
          }
        }
        let formula = lineFormulaType.generator(lineFormulas);
        formulas.push(formula);
      }
      timeEnd();
      return formulas;
    }

    function _handleMulti(multipleCheck) {
      time();
      const numNeeded = multipleCheck[2] || multipleCheck[3];
      const key = multipleCheck[4];
      const altColumnName = multipleCheck[6];
      let line = multipleCheck[7];
  
      let formula;
      if (multiFormulaCache[key]) {
        formula = multiFormulaCache[key].formula;
      } else {
        let column = "item";
        let doPrefixMatch = true;
        if (altColumnName) {
          column = altColumnName;
          if (!itemRowsByColumn[column]) {
            const altColumn = UTIL.getColumns(sheet, [altColumnName])[altColumnName];
            if (!(altColumn >= 0)) {
              formula = "ERROR: Cannot find column " + altColumnName;
              timeEnd();
              return formula;
            } else {
              const altColumnDataRange = UTIL.getColumnDataRange(sheet,altColumn);
              itemRowsByColumn[altColumnName] = _getRowsByValue(altColumnDataRange);
              doPrefixMatch = line.charAt(line.length-1) == "*";
            }
          }
        }
        if (line.charAt(line.length-1) == "*") {
          // is only useful in altColumn format (since it is implied otherwise), but include here so the preReq can be more verbose
          line = line.substring(0,line.length-1);
        }
    
        const multiRows = [];
        Object.entries(itemRowsByColumn[column]).forEach(([itemName, itemRows]) => {
          if (doPrefixMatch ? itemName.match("^" + line) : (itemName === line)) {
            multiRows.push(...itemRows);
          }
        });
        formula = "SUM(IF(R" + multiRows.join("C" + columns.check + ", 1), IF(R") + "C" + columns.check + ", 1)) >= ";
        multiFormulaCache[key] = {
          formula: formula,
          max: multiRows.length,
        };
      }
      if (multiFormulaCache[key].max < numNeeded) {
        formula = "ERROR: There are only " + multiFormulaCache[key].max + " of " + line;
      }

      timeEnd();
      return formula + numNeeded;
    }
  }

  return {
    populateAvailable: populateAvailable
  };
})();