/* exported AVAILABLE */
// eslint-disable-next-line no-redeclare
const AVAILABLE = (function(){
  // 12x item
  // x12 item
  // 12x column!value
  const MULTI_REGEX = /^((\d+)[*x]|[*x](\d+)) +(((.*)!)?(.+))$/; 

  class BooleanFormulaTranslationHelper {
    constructor(regEx, formulaName) {
      this.regEx = regEx;
      this.formulaName = formulaName;
    }
    
    identify(text) {
      console.log("DEBUG: identify [this.regEx, this.formulaName, text]",[this.regEx, this.formulaName, text]);
      return !!(text && text.match(this.regEx));
    }

    parseOperands(text) {
      if (!text) return;
      const match = text.match(this.regEx);
      return (match && match.slice(1));
    }

    generateFormula(values) {
      let result = this.formulaName + "(";
      if (values) {
        if (Array.isArray(values)) {
          result += values.join(",");
        } else {
          result += values;
        }
      }
      result += ")";
      return result;
    }
  }
  // Since certain Boolean formulas accept 0-N arguments, handle that instead of nested groups
  class FlexibleBinaryBooleanFormulaTranslationHelper extends BooleanFormulaTranslationHelper {
    parseOperands(text) {
      if (!text) return;

      const match = text.match(this.regEx);
      if (!match) return;

      console.log("DoueoBUG: [text,match]",[text,match]);

      const results = [];
      const lMatch = match[1];
      const lResult = this.parseOperands(lMatch);
      if (lResult) results.push(...lResult);
      else results.push(lMatch);

      const rMatch = match[2];
      const rResult = this.parseOperands(rMatch);
      if (rResult) results.push(...rResult);
      else results.push(rMatch);

      return results;
    }
    generateFormula(values) {
      if (!Array.isArray(values)) return values;
      else if (values.length == 1) return values[0];
      else return super.generateFormula(values);
    }
  }

  const BOOLEAN_FORMULA_TRANSLATION_HELPERS = {
    AND: new FlexibleBinaryBooleanFormulaTranslationHelper(/ *(.+) *&& *(.+) */,"AND"),
    OR: new FlexibleBinaryBooleanFormulaTranslationHelper(/ *(.+) *\|\|? *(.+) */,"OR"),
    NOT: new BooleanFormulaTranslationHelper(/^ *! *(.+?) *$/, "NOT"),
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
    const lastRangeRow = range ? range.getLastRow() : lastItemRow;
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
        const calculatedPreReqFormulas = _determineCellLineFormulas(preReqValues[i][0], BOOLEAN_FORMULA_TRANSLATION_HELPERS.OR);
        andFormulas.push(...calculatedPreReqFormulas);
      }
      if (missedFormulas && missedFormulas[i][0]) {
        andFormulas.push(BOOLEAN_FORMULA_TRANSLATION_HELPERS.NOT.generateFormula("R" + (i+rangeRow) + "C" + columns.missed));
      } else if (missedValues && missedValues[i][0]) {
        const calculatedMissedFormulas = _determineCellLineFormulas(missedValues[i][0], BOOLEAN_FORMULA_TRANSLATION_HELPERS.AND);
        andFormulas.push(BOOLEAN_FORMULA_TRANSLATION_HELPERS.NOT.generateFormula(BOOLEAN_FORMULA_TRANSLATION_HELPERS.OR.generateFormula(calculatedMissedFormulas)));
      }
    
      let cellFormula;
      if (andFormulas.length == 0) {
        cellFormula = "TRUE";
      } else {
        cellFormula = "=" + BOOLEAN_FORMULA_TRANSLATION_HELPERS.AND.generateFormula(andFormulas);
      }
    
      availables[i][0] = cellFormula;
    }
  
    availableDataRange.setFormulasR1C1(availables);
    timeEnd();
    return;

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

    function _determineCellLineFormulas(cellValue) {
      const formulas = [];
      const cellLines = cellValue.toString().trim().split(/ *[\n;] */);
      for (let j = 0; j < cellLines.length; j++) {
        const line = cellLines[j].trim();
        if (!line) continue;
        const formula = _determineFormula(line);
        formulas.push(formula);
      }
      return formulas;
    }
    function _determineFormula(text) {
      for (const formulaTranslationHelper of [BOOLEAN_FORMULA_TRANSLATION_HELPERS.OR, BOOLEAN_FORMULA_TRANSLATION_HELPERS.AND, BOOLEAN_FORMULA_TRANSLATION_HELPERS.NOT]) {
        // Recursively handle boolean operators
        if (formulaTranslationHelper.identify(text)) {
          const operands = formulaTranslationHelper.parseOperands(text);
          const operandFormulas = operands.map(_determineFormula);
          return formulaTranslationHelper.generateFormula(operandFormulas);
        }
      }
      text = text.trim();
      const multipleCheck = MULTI_REGEX.exec(text);
      if (multipleCheck) {
        return _handleMulti(multipleCheck);
      } else if (itemRowsByColumn.item[text]) {
        // Should only have 1 since they should be unique; handles multiple, just in case
        const formulas = [];
        for (let cellIndex = 0; cellIndex < itemRowsByColumn.item[text].length; cellIndex++) {
          formulas.push( "R" + itemRowsByColumn.item[text][cellIndex] + "C" + columns.check);
        }
        return BOOLEAN_FORMULA_TRANSLATION_HELPERS.AND.generateFormula(formulas);
      } else {
        return "ERROR: Cannot find item " + text;
      }
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