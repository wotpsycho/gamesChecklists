/* exported FORMULA */
// eslint-disable-next-line no-redeclare
const FORMULA = (function initFormula(){

  let prettyPrint = true;
  const togglePrettyPrint = (value = !prettyPrint) => {
    const oldValue = prettyPrint;
    prettyPrint = value;
    return oldValue;
  };
  // FORMULA ENUM DEFINIOTNS
  class FormulaTranslationHelper {
    constructor(regEx, formulaName) {
      this.regEx = regEx;
      this.formulaName = formulaName;
    }
    
    identify(text) {
      return !!(text && this.regEx && text.match(this.regEx));
    }

    parseOperands(text) {
      if (!text || !this.regEx) return;
      const match = text.match(this.regEx);
      return (match && match.slice(1));
    }
    _shouldPrettyPrint(values) {
      // TODO pull from config
      return prettyPrint && values.length > 1;
    }
    _deepFlat(values) {
      let oldLength;
      do {
        oldLength = values.length;
        values = values.flat();
      } while (oldLength != values.length);
      return values;
    }

    generateFormula(...values) {
      values = this._deepFlat(values);
      const _prettyPrint = this._shouldPrettyPrint(values);

      let result = this.formulaName + "(";
      if (values.length != 0) {
        const joiner = _prettyPrint ? ",\n" : ",";
        const innerResult = values.join(joiner);
        // Indent every line by 2
        if (_prettyPrint && values.length > 1) {
          result += "\n  " + innerResult.replace(/\n/g, "\n  ") + "\n";
        } else {
          result += innerResult;
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
    generateFormula(...values) {
      values = this._deepFlat(values);
      if (values.length == 1) return values[0];
      else return super.generateFormula(values);
    }
  }

  class SimpleFormulaHelper extends FormulaTranslationHelper {
    constructor(formulaName) {
      super(undefined, formulaName);
    }
  }

  class InlineFormulaTranslationHelper extends FormulaTranslationHelper {
    generateFormula(...values) {
      values = this._deepFlat(values);
      const _prettyPrint = this._shouldPrettyPrint(values);

      const joiner = _prettyPrint ? "\n" + this.formulaName + "\n" : " " + this.formulaName + " ";
      const innerResult = values.join(joiner);
      if (_prettyPrint && values.length > 1) {
        return "(\n  " + innerResult.replace(/\n/g,"\n  ") + "\n)";
      } else if (values.length > 1) {
        return "(" + innerResult  + ")";
      } else {
        return innerResult;
      }
    }
  }

  const isNumber = value => typeof value == "number" || Number(value) || value === "0";
  

  class ValueFormulaTranslationHelper extends SimpleFormulaHelper {
    generateFormula(value) {
      if (typeof value == "boolean" || value.toString().toUpperCase() == "TRUE" || value.toString().toUpperCase() == "FALSE") {
        return value.toString().toUpperCase();
      } else if (isNumber(value)) {
        return Number(value);
      } else {
        return `"${value.toString()}"`;
      }

    }
  }

  class RangeTranslationHelper extends SimpleFormulaHelper {

    // eslint-disable-next-line no-unused-vars
    _rowColumnToRangeFormula(row, column, isRowRelative = false, isColumnRelative = false) {
      // abstract
    }
    // Assumes absolute unless settings object passed
    // Arguments: range|startRow, column, [endColumn], [endRow], [startRowRelative], [startColumnRelative],[]
    generateFormula(rangeOrRow, ...rest) {
      const booleanStart = [rest.indexOf(true),rest.indexOf(false)].filter(index => index >= 0).reduce((a,b) => Math.min(a,b),rest.length);
      const [rowRelative,columnRelative,endRowRelative,endColumnRelative] = Object.assign([false,false,false,false],rest.splice(booleanStart));
      let [column,endRow,endColumn] = rest;
      let row;
      if (typeof rangeOrRow == "object") {
        const range = rangeOrRow;
        console.log(range.getA1Notation(),range.isStartColumnBounded(),range.isStartRowBounded(),range.isEndColumnBounded(),range.isEndRowBounded(),range.getNumRows(),range.getNumColumns());

        // A1:A => not end row bounded
        // A:A => not end/start row bounded
        if (range.isStartRowBounded()) row = range.getRow();
        if (range.isStartColumnBounded()) column = range.getColumn();
        if (range.getNumRows() > 1 || range.getNumColumns() > 1) {
          if (range.isEndRowBounded()) endRow = range.getLastRow();
          if (range.isEndColumnBounded()) endColumn = range.getLastColumn();
        }
      } else {
        if (isNumber(rangeOrRow)) row = rangeOrRow;
      }
      const startCell = this._rowColumnToRangeFormula(row,column,rowRelative,columnRelative);
      let range = startCell;
      let endCell;
      if (isNumber(endRow) || isNumber(endColumn)) endCell = this._rowColumnToRangeFormula(endRow,endColumn,endRowRelative,endColumnRelative);
      if (endCell && endCell != startCell) range += ":" + endCell;
      console.log("r1c1",rangeOrRow,row,column,endRow,endColumn,rowRelative,columnRelative,endRowRelative,endColumnRelative,rest,range,booleanStart);
      return range;
    }
  }

  class RangeR1C1TranslationHelper extends RangeTranslationHelper {
    _rowColumnToRangeFormula(row, column, isRowRelative = false, isColumnRelative = false) {
      let address = "";
      if (isNumber(row)) {
        address += "R" + (isRowRelative ? `[${row}]` : row);
      }
      if (isNumber(column)) {
        address += "C" + (isColumnRelative ? `[${column}]` : column);
      }
      return address;
    }
  }

  const columnToA1 = column => {
    column--;
    const rest = Math.floor(column/26);
    if (rest < 0) return "";
    const leastSig = column % 26;
    const leastSigLet = String.fromCharCode("A".charCodeAt(0) + leastSig);
    return columnToA1(rest) + leastSigLet;
  };

  class RangeA1TranslationHelper extends RangeTranslationHelper {
    _rowColumnToRangeFormula(row, column, isRowRelative = false, isColumnRelative = false) {
      let address = "";
      if (isNumber(column)) {
        if (!isColumnRelative) address += "$";
        address += columnToA1(column);
      }
      if (isNumber(row)) {
        if (!isRowRelative) address += "$";
        address += row;
      }
      return address;
    }
  }
  
  function _helpersToGenerateFunctions(helpers) {
    const toFuncs = {};
    Object.entries(helpers).forEach(([key,helper]) => {
      const generate = Object.assign((...args) => helper.generateFormula(...args),helper);
      generate.identify = (...args) => helper.identify(...args);
      generate.parseOperands = (...args) => helper.parseOperands(...args);
      generate.generateFormula = generate;
      toFuncs[key] = generate;
    });
    return toFuncs;
  }
  

  const FORMULA = Object.assign((value) => "=" + value,_helpersToGenerateFunctions({
    AND: new FlexibleFormulaTranslationHelper(/^ *(.+?) *&& *(.+?) *$/, "AND"),
    OR: new FlexibleFormulaTranslationHelper(/^ *(.+?) *\|\|? *(.+?) *$/, "OR"),
    NOT: new FormulaTranslationHelper(/^ *! *(.+?) *$/, "NOT"),
    IF: new SimpleFormulaHelper("IF"),
    IFS: new SimpleFormulaHelper("IFS"),
    IFERROR: new SimpleFormulaHelper("IFERROR"),

    EQ: new FormulaTranslationHelper(/^ *(.+?) *== *(.+?) *$/, "EQ"),
    NE: new FormulaTranslationHelper(/^ *(.+?) *!= *(.+?) *$/, "NE"),
    GT: new InlineFormulaTranslationHelper(/^ *(.+?) *> *(.+?) *$/, ">"),
    GTE: new InlineFormulaTranslationHelper(/^ *(.+?) *>= *(.+?) *$/, ">="),
    LT: new InlineFormulaTranslationHelper(/^ *(.+?) *< *(.+?) *$/, "<"),
    LTE: new InlineFormulaTranslationHelper(/^ *(.+?) *<= *(.+?) *$/, "<="),

    MULT: new InlineFormulaTranslationHelper(/^ *(.+?) +\* +(.+?) *$/, "*"),
    DIV: new InlineFormulaTranslationHelper(/^ *(.+?) *\/ *(.+?) *$/, "/"),
    MINUS: new InlineFormulaTranslationHelper(/^ *(.+?) +- +(.+?) *$/, "-"),
    ADD: new InlineFormulaTranslationHelper(/^ *(.+?) +\+ +(.+?) *$/, "+"),

    COUNTIF: new SimpleFormulaHelper("COUNTIF"),
    COUNTIFS: new SimpleFormulaHelper("COUNTIFS"),
    ERRORTYPE: new SimpleFormulaHelper("ERROR.TYPE"),
    ISERROR: new SimpleFormulaHelper("ISERROR"),
    ISBLANK: new SimpleFormulaHelper("ISBLANK"),
    REGEXMATCH: new SimpleFormulaHelper("REGEXMATCH"),

    CONCAT: new SimpleFormulaHelper("CONCATENATE"),
    CHAR: new SimpleFormulaHelper("CHAR"),

    R1C1: new RangeR1C1TranslationHelper(),
    A1: new RangeA1TranslationHelper(),
    VALUE: new ValueFormulaTranslationHelper(),
  }));
  
  FORMULA.VALUE.TRUE = FORMULA.VALUE(true);
  FORMULA.VALUE.FALSE = FORMULA.VALUE(false);
  FORMULA.VALUE.ZERO = FORMULA.VALUE(0);
  FORMULA.VALUE.ONE = FORMULA.VALUE(1);
  FORMULA.VALUE.EMPTYSTRING = FORMULA.VALUE.EMPTYSTR = FORMULA.VALUE("");

  FORMULA.CHAR.NEWLINE = FORMULA.CHAR(10);
  FORMULA.togglePrettyPrint = togglePrettyPrint;

  Object.values(FORMULA).forEach(formula => Object.freeze(formula));
  return FORMULA;
})();

/* eslint-disable */
function columnToA1Test() {
  const results = {};
  for (var i = 1; i < 100; i++) {
    results[i] = columnToA1(i);
  }
  for (i = 650; i < 750; i++) {
    results[i] = columnToA1(i);
  }
  for (i = 18200; i < 18300; i++) {
    results[i] = columnToA1(i);
  }
  return results;
}

function columnToA1(column) {
  column--;
  const rest = Math.floor(column/26);
  if (rest < 0) return "";
  const charCodeA = "A".charCodeAt(0);
  const leastSig = column % 26;
  const leastSigLet = String.fromCharCode(charCodeA + leastSig);
  return columnToA1(rest) + leastSigLet;
}

function testA1Formula() {
  return [FORMULA.A1(14,37),
    FORMULA.A1(14,34,12),
    FORMULA.A1(13,null,14,true),
    FORMULA.A1(13,null,14,null,true),
   FORMULA.A1(1,4,43,341,false,true,true,true)];
}
function sizeTest() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sheet27");
    sheet.autoResizeRows(1,sheet.getMaxRows());
    sheet.setRowHeights(1,sheet.getMaxRows(),35);
}

