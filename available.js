/* exported AVAILABLE */
// eslint-disable-next-line no-redeclare
const AVAILABLE = (function(){

  class FormulaTranslationHelper {
    constructor(regEx, formulaName) {
      this.regEx = regEx;
      this.formulaName = formulaName;
    }
    
    identify(text) {
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
  // Since certain formulas accept 0-N arguments, handle that instead of nested groups
  class FlexibleFormulaTranslationHelper extends FormulaTranslationHelper {
    parseOperands(text) {
      if (!text) return;

      const match = text.match(this.regEx);
      if (!match) return;

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

  const PAREN_HELPER = new FormulaTranslationHelper(/^(.*)\(([^()]*)\)(.*)$/,"");

  const BOOLEAN_FORMULA_TRANSLATION_HELPERS = {
    AND: new FlexibleFormulaTranslationHelper(/^ *(.+?) *&& *(.+?) *$/,"AND"),
    OR: new FlexibleFormulaTranslationHelper(/^ *(.+?) *\|\|? *(.+?) *$/,"OR"),
    NOT: new FormulaTranslationHelper(/^ *! *(.+?) *$/, "NOT"),
  };
  const COMPARISON_FORMULA_TRANSLATION_HELPERS = {
    EQ: new FormulaTranslationHelper(/^ *(.+?) *== *(.+?) *$/, "EQ"),
    NE: new FormulaTranslationHelper(/^ *(.+?) *!= *(.+?) *$/, "NE"),
    GT: new FormulaTranslationHelper(/^ *(.+?) *> *(.+?) *$/, "GT"),
    GTE: new FormulaTranslationHelper(/^ *(.+?) *>= *(.+?) *$/, "GTE"),
    LT: new FormulaTranslationHelper(/^ *(.+?) *< *(.+?) *$/, "LT"),
    LTE: new FormulaTranslationHelper(/^ *(.+?) *<= *(.+?) *$/, "LTE"),
  };
  const ARITHMETIC_FORMULA_TRANSLATION_HELPERS = {
    MULT: new FormulaTranslationHelper(/^ *(.+?) +\* +(.+?) *$/, "MULTIPLY"),
    DIV: new FormulaTranslationHelper(/^ *(.+?) *\/ *(.+?) *$/, "DIVIDE"),
    MINUS: new FormulaTranslationHelper(/^ *(.+?) +- +(.+?) *$/, "MINUS"),
    ADD: new FlexibleFormulaTranslationHelper(/^ *(.+?) +\+ +(.+?) *$/, "SUM"),
  };

  function populateAvailable(sheet = SpreadsheetApp.getActiveSheet(), event) {
    time();
    const columns = UTIL.getColumns(sheet);
    const rows = UTIL.getRows(sheet);
    const formulaCache = {};
    const _parseValueCache = {};
    let useCache;
    let _allPreReqValues;
    let UID_Counter = 0;
    const getParenPlaceholder = () =>  `PPH_${UID_Counter++}_PPH`;
    const isParenPlaceholder = value => value.match(/^ *PPH_\d+_PPH *$/);

    const getR1C1DataRange = col => `R${rows.header+1}C${col}:C${col}`;
    const checkR1C1 = getR1C1DataRange(columns.check);
    const itemR1C1 = getR1C1DataRange(columns.item);

    let filteredRange;
    if (event
      && event.range
      && (event.value || event.oldValue)
      && event.range.getRow() > rows.header
      && _splitCellValue(event.value || "").map(_parseValue).filter(check => check && check.uses).length == 0 // NOT uses
      && _splitCellValue(event.oldValue || "").map(_parseValue).filter(check => check && check.uses).length == 0 // WASN'T uses
    ) {
      // If it's a single, non-"USES" cell, only update it
      filteredRange = event.range;
    }
  
    // Must have required columns
    if (!columns.available || !columns.check || !columns.item || !columns.preReq) return;
  
    let rangeRow = filteredRange ? filteredRange.getRow() : rows.header+1;
    const lastRangeRow = filteredRange ? filteredRange.getLastRow() : sheet.getLastRow();
    if (rangeRow <= rows.header) rangeRow = rows.header+1;

    if (lastRangeRow <= rows.header) return;
    
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
    function _determineCellLineFormulas(cellValue) {
      const formulas = [];
      const cellLines = _splitCellValue(cellValue);
      for (let j = 0; j < cellLines.length; j++) {
        const line = cellLines[j].trim();
        if (!line) continue;
        const formula = _determineBooleanFormula(line);
        formulas.push(formula);
      }
      return formulas;
    }

    function _splitCellValue(cellValue) {
      return cellValue.toString().trim().split(/ *[\n;] */);
    }

    function _parseValue(text) {
      const cacheValue = _parseValueCache[text];
      if (cacheValue) return cacheValue;
      const rawParsed = /^(USES? +)?(?:(\d+)[*x]|[*x](\d+) +)? *((?:(.*)!)?(.+))$/.exec(text);
      if (rawParsed) {
        return _parseValueCache[text] = {
          uses: !!rawParsed[1],
          numNeeded: rawParsed[2] || rawParsed[3] || 1,
          isMulti: !!(rawParsed[2] > 0 || rawParsed[3] > 0),
          key: rawParsed[4] + ":" + !!rawParsed[1],
          altColumnName: rawParsed[5],
          id: rawParsed[6],
        };
      }
    }
    function _determineBooleanFormula(text, _nonLeaf) {
      if (isParenPlaceholder(text)) return text;
      if (PAREN_HELPER.identify(text)) {
        const [lOuter, inner, rOuter] = PAREN_HELPER.parseOperands(text);
        const placeholder = getParenPlaceholder();
        let innerFormula = _determineBooleanFormula(inner, true);
        if (!innerFormula) innerFormula = _determineNumericFormula(inner, true);
        if (!innerFormula) innerFormula = "#ERROR!&\"Parentheses must contain operator inside\"";
        const outerFormula = _determineBooleanFormula(`${lOuter} ${placeholder} ${rOuter}`);
        const newInner = PAREN_HELPER.generateFormula(innerFormula);
        const formula = outerFormula.replace(placeholder, newInner);
        return formula;
      }
      for (const booleanFormulaTranslationHelper of [
        BOOLEAN_FORMULA_TRANSLATION_HELPERS.OR, 
        BOOLEAN_FORMULA_TRANSLATION_HELPERS.AND, 
        BOOLEAN_FORMULA_TRANSLATION_HELPERS.NOT
      ]) {
        // Recursively handle boolean operators
        if (booleanFormulaTranslationHelper.identify(text)) {
          const operands = booleanFormulaTranslationHelper.parseOperands(text);
          const operandFormulas = operands.map(operand => _determineBooleanFormula(operand));
          return booleanFormulaTranslationHelper.generateFormula(operandFormulas);
        }
      }
      for (const comparisonFormulaTranslationHelper of [
        COMPARISON_FORMULA_TRANSLATION_HELPERS.EQ, 
        COMPARISON_FORMULA_TRANSLATION_HELPERS.NE, 
        COMPARISON_FORMULA_TRANSLATION_HELPERS.GTE,
        COMPARISON_FORMULA_TRANSLATION_HELPERS.GT,
        COMPARISON_FORMULA_TRANSLATION_HELPERS.LTE,
        COMPARISON_FORMULA_TRANSLATION_HELPERS.LT
      ]) {
        // Recursively handle comparison operators
        if (comparisonFormulaTranslationHelper.identify(text)) {
          const operands = comparisonFormulaTranslationHelper.parseOperands(text);
          const operandValues = operands.map(operand => _determineNumericFormula(operand));
          return comparisonFormulaTranslationHelper.generateFormula(operandValues);
        }
      } 
      
      if (_nonLeaf) return;

      text = text.trim();

      const valueInfo = _parseValue(text);
      if (!valueInfo) {
        return `#VALUE!&"Not a valid formula: ${text}"`;
      }
      let formula = _determineNumericValueFormula(valueInfo);

      formula +=  " >= " + valueInfo.numNeeded;
      return formula;
    }

    function _determineNumericFormula(text,_nonLeaf) {
      if (isParenPlaceholder(text)) return text;
      for (const comparisonFormulaTranslationHelper of [
        ARITHMETIC_FORMULA_TRANSLATION_HELPERS.ADD,
        ARITHMETIC_FORMULA_TRANSLATION_HELPERS.MINUS,
        ARITHMETIC_FORMULA_TRANSLATION_HELPERS.MULT,
        ARITHMETIC_FORMULA_TRANSLATION_HELPERS.DIV,
      ]) {
        // Recursively handle comparison operators
        if (comparisonFormulaTranslationHelper.identify(text)) {
          const operands = comparisonFormulaTranslationHelper.parseOperands(text);
          const operandValues = operands.map(operand => _determineNumericFormula(operand));
          return comparisonFormulaTranslationHelper.generateFormula(operandValues);
        }
      }
      if (_nonLeaf) return;
      if (Number(text) || text === 0) return Number(text);
      return _determineNumericValueFormula(_parseValue(text));
    }

    function _determineNumericValueFormula(valueInfo) {
      let cacheResult = formulaCache[valueInfo.key];
      
      if (!cacheResult) {
        let id = valueInfo.id;
        let columnR1C1 = itemR1C1;
        let formula;
        if (valueInfo.altColumnName) {
          const altColumn = UTIL.getColumns(sheet, [valueInfo.altColumnName])[valueInfo.altColumnName];
          if (!(altColumn >= 0)) {
            formula = `#REF!&"Cannot find column ${valueInfo.altColumnName}"`;
            return formula;
          }
          columnR1C1 = getR1C1DataRange(altColumn);
        } else if (id.indexOf("*") < 0 && valueInfo.isMulti) {
          // If not alt-column and no wildcard, default to prefix if multi
          id += "*";
        }

        formula = `COUNTIFS(${checkR1C1},"=TRUE",${columnR1C1},"${id}")`;
        if (valueInfo.uses) {
          if (!useCache) {
            _determineUseCache();
          }
          formula += " - SUM(";
          formula += Object.entries(useCache[valueInfo.key]).map(([row,numUsed]) => 
            `IF(R${row}C${columns.check},${numUsed})`
          ).join(",");
          formula += ")";
        }
        formulaCache[valueInfo.key] = cacheResult = {
          formula,
          columnR1C1,
          id,
        };
      }
      return _addError(cacheResult.formula, `COUNTIF(${cacheResult.columnR1C1},"${cacheResult.id}") < ${valueInfo.numNeeded}`,valueInfo.isMulti ? "#NUM!" : "#NAME?", valueInfo.isMulti ? `Not enough ${cacheResult.id}` : `Could not find ${cacheResult.id}`);
    }

    function _addError(formula, errorCondition, errorType, errorMessage) {
      return `IF(${errorCondition},${errorType}&"${errorMessage}",${formula})`;
    }

    function _determineUseCache() {
      time();
      useCache = {};
      const preReqValues = _getAllPreReqValues();
      const firstRow = rows.header+1;
      for (let row = firstRow; row < firstRow + preReqValues.length; row++) {
        _splitCellValue(preReqValues[row-firstRow]).map(_parseValue).forEach(rowMultiInfo => {
          if (rowMultiInfo && rowMultiInfo.uses) {
            if (!useCache[rowMultiInfo.key]) useCache[rowMultiInfo.key] = {};
            useCache[rowMultiInfo.key][row] = rowMultiInfo.numNeeded;
          }
        });
      }
      timeEnd();
    }
  
    function _getAllPreReqValues() {
      if (_allPreReqValues) return _allPreReqValues;
      if (filteredRange) {
        _allPreReqValues = UTIL.getColumnDataRange(sheet, columns.preReq).getValues();
      } else {
        _allPreReqValues = preReqValues;
      }
      return _allPreReqValues;
    }
  }

  return {
    populateAvailable
  };
})();