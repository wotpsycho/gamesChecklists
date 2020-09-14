// eslint-disable-next-line @typescript-eslint/no-unused-vars
namespace Formula {
  export type formula = ((...value: unknown[]) => string) & {
    identify: (text:string) => boolean;
    parseOperands: (text:string) => string[];
    generateFormula: (...value: unknown[]) => string;
  } & {[x:string]: string};
  type Range = GoogleAppsScript.Spreadsheet.Range;
  
  
  let prettyPrint = true;
  export const togglePrettyPrint = (value = !prettyPrint): boolean => {
    const oldValue = prettyPrint;
    prettyPrint = value;
    return oldValue;
  };
  // FORMULA ENUM DEFINIOTNS
  class FormulaTranslationHelper {
    readonly regEx: RegExp;
    readonly formulaName: string;
    constructor(regEx: RegExp, formulaName: string) {
      this.regEx = regEx;
      this.formulaName = formulaName;
    }
    
    identify(text: string): boolean {
      return !!(text && this.regEx && text.match(this.regEx));
    }
    
    parseOperands(text: string): string[] {
      if (!text || !this.regEx) return;
      const match = text.match(this.regEx);
      return (match && match.slice(1));
    }
    _shouldPrettyPrint(values: unknown[]): boolean {
      // TODO pull from config
      return prettyPrint && values.length > 1;
    }
    _deepFlat(values: unknown[]): unknown[] {
      let oldLength: number;
      do {
        oldLength = values.length;
        values = values.flat();
      } while (oldLength != values.length);
      return values;
    }
    
    generateFormula(...values: unknown[]): string {
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
    parseOperands(text: string): string[] {
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
    generateFormula(...values: unknown[]): string {
      values = this._deepFlat(values);
      if (values.length == 1) return values[0].toString();
      else return super.generateFormula(...values);
    }
  }
  
  class SimpleFormulaHelper extends FormulaTranslationHelper {
    constructor(formulaName: string = "") {
      super(undefined, formulaName);
    }
  }
  
  class InlineFormulaTranslationHelper extends FormulaTranslationHelper {
    generateFormula(...values: unknown[]): string {
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
  
  const isNumber = (value: unknown): boolean => {
    return typeof value == "number" || Number(value) > 0 || Number(value) < 0 || value === "0";
  };
  
  
  class ValueFormulaTranslationHelper extends SimpleFormulaHelper {
    generateFormula(...values: unknown[]): string {
      const value = values[0];
      if (typeof value == "boolean" || value.toString().toUpperCase() == "TRUE" || value.toString().toUpperCase() == "FALSE") {
        return value.toString().toUpperCase();
      } else if (isNumber(value)) {
        return Number(value).toString();
      } else {
        return `"${value.toString()}"`;
      }
      
    }
  }
  
  abstract class RangeTranslationHelper extends SimpleFormulaHelper {
    abstract _rowColumnToRangeFormula(row: number, column: number, isRowRelative: boolean, isColumnRelative: boolean): string
    // Assumes absolute unless settings object passed
    // Arguments: range|startRow, column, [endColumn], [endRow], [startRowRelative], [startColumnRelative],[]
    generateFormula(rangeOrRow: Range|number, ...rest: (number|boolean)[]): string {
      const booleanStart = [rest.indexOf(true),rest.indexOf(false)].filter(index => index >= 0).reduce((a,b) => Math.min(a,b),rest.length);
      const [rowRelative,columnRelative,endRowRelative,endColumnRelative] = Object.assign([false,false,false,false],rest.splice(booleanStart));
      let [column,endRow,endColumn]: number[] = rest as number[];
      let row: number;
      if (typeof rangeOrRow == "object") {
        const range = rangeOrRow;
        
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
      return range;
    }
  }
  
  class RangeR1C1TranslationHelper extends RangeTranslationHelper {
    _rowColumnToRangeFormula(row: number, column: number, isRowRelative: boolean = false, isColumnRelative: boolean = false): string {
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
  
  const columnToA1 = (column: number): string => {
    column--;
    const rest = Math.floor(column / 26);
    if (rest < 0)
      return "";
    const leastSig = column % 26;
    const leastSigLet = String.fromCharCode("A".charCodeAt(0) + leastSig);
    return columnToA1(rest) + leastSigLet;
  };
  
  class RangeA1TranslationHelper extends RangeTranslationHelper {
    _rowColumnToRangeFormula(row: number, column: number, isRowRelative: boolean = false, isColumnRelative: boolean = false): string {
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
  
  const _helpersToGenerateFunctions = (helpers: {[x:string]: FormulaTranslationHelper|{formula:FormulaTranslationHelper,consts: {[x:string]: unknown}}}): {[x:string]:formula}  => {
    const toFuncs = {};
    Object.entries(helpers).forEach(([key,helperOrMap]) => {
      let helper: FormulaTranslationHelper;
      let consts: { [x: string]: unknown; };
      if (helperOrMap instanceof FormulaTranslationHelper) {
        helper = helperOrMap;
      } else {
        helper = helperOrMap.formula;
        consts = helperOrMap.consts;
      }
      const generate = Object.assign((...args) => helper.generateFormula(...args),helper);
      generate.identify = (...args) => helper.identify(...args);
      generate.parseOperands = (...args) => helper.parseOperands(...args);
      generate.generateFormula = generate;
      if (consts) {
        Object.entries(consts).forEach(([constName,value]) => {
          generate[constName] = generate(value);
        });
      }
      toFuncs[key] = generate;
    });
    return toFuncs;
  };
  
  
  export const FORMULA = Object.assign((value: string): string => "=" + value,_helpersToGenerateFunctions({
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
    CHAR: {
      formula: new SimpleFormulaHelper("CHAR"),
      consts: {
        NEWLINE: 10,
      }
    },
    
    R1C1: new RangeR1C1TranslationHelper(),
    A1: new RangeA1TranslationHelper(),
    VALUE: {
      formula: new ValueFormulaTranslationHelper(),
      consts: {
        TRUE: true,
        FALSE: false,
        ZERO: 0,
        ONE: 1,
        EMPTYSTRING: "",
        EMPTYSTR: "",
      },
    },
  }));
  
  
  
  
}