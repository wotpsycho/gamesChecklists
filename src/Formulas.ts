// eslint-disable-next-line @typescript-eslint/no-unused-vars
namespace Formula {
  type Formula<T> = (...value:T[]) => string
  export type StringFormula = Formula<string>
  type Range = GoogleAppsScript.Spreadsheet.Range;
  
  // Helpers
  const isNumber = (value: unknown): boolean => {
    return typeof value == "number" || Number(value) > 0 || Number(value) < 0 || value === "0";
  };
  
  const rcToR1C1 = (row: number, column: number, isRowRelative: boolean = false, isColumnRelative: boolean = false): string => {
    let address = "";
    if (isNumber(row)) {
      address += "R" + (isRowRelative ? `[${row}]` : row);
    }
    if (isNumber(column)) {
      address += "C" + (isColumnRelative ? `[${column}]` : column);
    }
    return address;
  };
  
  const columnToA1 = (column: number): string => {
    column--;
    const rest = Math.floor(column / 26);
    if (rest < 0)
      return "";
    const leastSig = column % 26;
    const leastSigLet = String.fromCharCode("A".charCodeAt(0) + leastSig);
    return columnToA1(rest) + leastSigLet;
  };
  
  const rcToA1 = (row: number, column: number, isRowRelative: boolean = false, isColumnRelative: boolean = false): string => {
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
  };  
  
  // Factories
  const PrefixFormula = <T=string>(symbol:string):Formula<T> => 
    (...values: T[]): string => {
      const _prettyPrint = prettyPrint && values.length > 1;
    
      let result = symbol + "(";
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
    };
  
  const InlineFormula = <T=string>(symbol:string):Formula<T> => 
    (...values:T[]) => {
      const _prettyPrint = prettyPrint && values.length > 1;
    
      const joiner = _prettyPrint ? "\n" + symbol + "\n" : " " + symbol + " ";
      const innerResult = values.join(joiner);
      if (_prettyPrint && values.length > 1) {
        return "(\n  " + innerResult.replace(/\n/g,"\n  ") + "\n)";
      } else if (values.length > 1) {
        return "(" + innerResult  + ")";
      } else {
        return innerResult;
      }
    };
  
  const RangeFormula = (rcToAddress:(row:number,column:number,rowRelative:boolean,columnRelative:boolean) => string):Formula<boolean|number|Range> => 
    (rangeOrRow: Range|number, ...rest: (number|boolean)[]): string => {
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
      const startCell = rcToAddress(row,column,rowRelative,columnRelative);
      const endCell = rcToAddress(endRow,endColumn,endRowRelative,endColumnRelative);
      return startCell + (endCell && (endCell != startCell || !row || !column) ? `:${endCell}` : "");
    };
  
  // Mixin
  const withConstants = <T,U extends {[x:string]: T}>(formula:Formula<T>, consts:U):Formula<T>&{[key in keyof U]:string} => 
    Object.assign(
      (...args:T[]) => formula(...args), 
      formula, 
      Object.entries<T>(consts).reduce<{[x:string]:string}>((consts,[name,value]) => Object.assign(consts,{[name]:formula(value)}),{}) as {[key in keyof U]:string}
    );
    
  // Exports
  const prettyPrint = false;
  export const togglePrettyPrint = (value:boolean = !prettyPrint): boolean => {
    const oldValue = prettyPrint;
    //prettyPrint = value; // TODO Allow only in Debug options due to Max Formula Length
    return oldValue;
  };
  export const AND:StringFormula = (...values:string[]):string => {
    if (values.includes(Formula.VALUE.FALSE)) return Formula.VALUE.FALSE;
    if (values.includes(Formula.VALUE.TRUE)) {
      values = values.filter(value => value != Formula.VALUE.TRUE);
      if (values.length == 0) return Formula.VALUE.TRUE;
    }
    if (values.length == 1) return values[0];
    return PrefixFormula("AND")(...values);
  };
  export const OR:StringFormula = (...values:string[]):string => {
    if (values.includes(Formula.VALUE.TRUE)) return Formula.VALUE.TRUE;
    if (values.includes(Formula.VALUE.FALSE)) {
      values = values.filter(value => value != Formula.VALUE.FALSE);
      if (values.length == 0) return Formula.VALUE.FALSE;
    }
    if (values.length == 1) return values[0];
    return PrefixFormula("OR")(...values);
  };
  export const NOT:StringFormula = (value:string):string => {
    if (value == Formula.VALUE.TRUE) return Formula.VALUE.FALSE;
    if (value == Formula.VALUE.FALSE) return Formula.VALUE.TRUE;
    if (value && value.toString().match(/^NOT\(/)) return value.toString().substring(3); // NOT(NOT(...)) => (...)
    return PrefixFormula("NOT")(value);
  };
  export const IF:StringFormula = PrefixFormula("IF");
  export const IFS:StringFormula = PrefixFormula("IFS");
  export const IFERROR:StringFormula = PrefixFormula("IFERROR");
  
  export const EQ:StringFormula = PrefixFormula("EQ");
  export const NE:StringFormula = PrefixFormula("NE");
  export const GT:StringFormula = InlineFormula(">");
  export const GTE:StringFormula = InlineFormula(">=");
  export const LT:StringFormula = InlineFormula("<");
  export const LTE:StringFormula = InlineFormula("<=");
  
  export const MULT:StringFormula = InlineFormula("*");
  export const DIV:StringFormula = InlineFormula("/");
  export const MINUS:StringFormula = InlineFormula("-");
  export const ADD:StringFormula = InlineFormula("+");
  
  export const COUNTIF:StringFormula = PrefixFormula("COUNTIF");
  export const COUNTIFS:StringFormula = PrefixFormula("COUNTIFS");
  export const ERRORTYPE:StringFormula = PrefixFormula("ERROR.TYPE");
  export const ISERROR:StringFormula = PrefixFormula("ISERROR");
  export const ISBLANK:StringFormula = PrefixFormula("ISBLANK");
  export const REGEXMATCH:StringFormula = PrefixFormula("REGEXMATCH");
  
  export const CONCAT:StringFormula = PrefixFormula("CONCATENATE");
  export const CHAR = withConstants(PrefixFormula<number|string>("CHAR"),{
    NEWLINE: 10,
  });
    
  export const R1C1 = RangeFormula(rcToR1C1);
  export const A1 = RangeFormula(rcToA1);
  export const VALUE = withConstants(
    (...values: (boolean|string|number)[]): string => {
      const value = values[0];
      if (typeof value == "boolean" || value.toString().toUpperCase() == "TRUE" || value.toString().toUpperCase() == "FALSE") {
        return value.toString().toUpperCase();
      } else if (isNumber(value)) {
        return Number(value).toString();
      } else {
        return `"${value.toString()}"`;
      }
    }
    ,{
      TRUE: true,
      FALSE: false,
      ZERO: 0,
      ONE: 1,
      EMPTYSTRING: "",
      EMPTYSTR: "",
    });
  export const T = PrefixFormula("T");
  export const N = PrefixFormula("N");
  export const ROUND = PrefixFormula("ROUND");
  export const COMMENT:{
    BOOLEAN: StringFormula,
    NUMBER: StringFormula,
    STRING: StringFormula,
  } = {
    BOOLEAN:  (comment:string,...values):string => Formula.AND(Formula.T(Formula.VALUE(comment)),...values),
    NUMBER:   (comment:string,...values):string => Formula.ADD(Formula.N(Formula.VALUE(comment)),...values),
    STRING:   (comment:string,...values):string => Formula.CONCAT(Formula.T(Formula.N(Formula.VALUE(comment))),...values),
  };
  export const FORMULA:StringFormula = (value:string) => "=" + value;
}