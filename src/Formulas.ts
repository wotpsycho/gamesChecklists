type Formula<T> = (...value: T[]) => string;
export type StringFormula = Formula<string>;
type Range = GoogleAppsScript.Spreadsheet.Range;

let prettyPrint = true;
// Helpers
const isNumber = (value: unknown): boolean => {
  return typeof value === "number" || Number(value) > 0 || Number(value) < 0 || value === "0";
};
const removeDuplicates = <T>(arr: T[]): T[] => arr.filter((val, i) => !arr.includes(val, i + 1));

const rcToR1C1 = (row: number, column: number, isRowRelative: boolean = false, isColumnRelative: boolean = false): string => {
  let address = "";
  if (isNumber(row)) {
    address += `R${isRowRelative ? `[${row}]` : row}`;
  }
  if (isNumber(column)) {
    address += `C${isColumnRelative ? `[${column}]` : column}`;
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
    if (!isColumnRelative)
      address += "$";
    address += columnToA1(column);
  }
  if (isNumber(row)) {
    if (!isRowRelative)
      address += "$";
    address += row;
  }
  return address;
};

// Factories
const PrefixFormula = <T = string>(symbol: string): Formula<T> =>
  (...values: T[]): string => {
    const _prettyPrint = prettyPrint && values.length > 1 && values.join().length > 40;

    let result = `${symbol}(`;
    if (values.length !== 0) {
      const joiner = _prettyPrint ? ",\n" : ",";
      const innerResult = values.join(joiner);
      // Indent every line by 2
      if (_prettyPrint && values.length > 1) {
        result += `\n  ${innerResult.replace(/\n/g, "\n  ")}\n`;
      } else {
        result += innerResult;
      }
    }
    result += ")";
    return result;
  };

const InlineFormula = <T = string>(symbol: string): Formula<T> =>
  (...values: T[]) => {
    const _prettyPrint = prettyPrint && values.length > 1 && values.join().length > 40;

    const joiner = _prettyPrint ? `\n${symbol}\n` : symbol;
    const innerResult = values.join(joiner);
    if (_prettyPrint && values.length > 1) {
      return `(\n  ${innerResult.replace(/\n/g, "\n  ")}\n)`;
    } else if (values.length > 1) {
      return `(${innerResult})`;
    } else {
      return innerResult;
    }
  };

const RangeFormula = (rcToAddress: (row: number, column: number, rowRelative: boolean, columnRelative: boolean) => string): Formula<boolean | number | Range> =>
  (rangeOrRow: Range | number, ...rest: (number | boolean)[]): string => {
    const booleanStart = [rest.indexOf(true), rest.indexOf(false)].filter(index => index >= 0).reduce((a, b) => Math.min(a, b), rest.length);
    const [rowRelative, columnRelative, endRowRelative, endColumnRelative] = Object.assign([false, false, false, false], rest.splice(booleanStart));
    let [column, endRow, endColumn]: number[] = rest as number[];
    let row: number;
    if (typeof rangeOrRow === "object") {
      const range = rangeOrRow;

      // A1:A => not end row bounded
      // A:A => not end/start row bounded
      if (range.isStartRowBounded())
        row = range.getRow();
      if (range.isStartColumnBounded())
        column = range.getColumn();
      if (range.getNumRows() > 1 || range.getNumColumns() > 1) {
        if (range.isEndRowBounded())
          endRow = range.getLastRow();
        if (range.isEndColumnBounded())
          endColumn = range.getLastColumn();
      }
    } else {
      if (isNumber(rangeOrRow))
        row = rangeOrRow;
    }
    const startCell = rcToAddress(row, column, rowRelative, columnRelative);
    const endCell = rcToAddress(endRow, endColumn, endRowRelative, endColumnRelative);
    return startCell + (endCell && (endCell !== startCell || !row || !column) ? `:${endCell}` : "");
  };

// Mixin
const withConstants = <T, U extends { [x: string]: T }>(formula: Formula<T>, consts: U): Formula<T> & { [key in keyof U]: string } =>
  Object.assign(
    (...args: T[]) => formula(...args),
    formula,
    Object.entries<T>(consts).reduce<{ [x: string]: string }>((consts, [name, value]) => Object.assign(consts, { [name]: formula(value) }), {}) as { [key in keyof U]: string },
  );
const withArgsTransform = <T>(formula: Formula<T>, transform: (...args: T[]) => T[]): Formula<T> =>
  (...args: T[]) =>
    formula(...transform(...args));
const withArgsShortCircuit = <T>(formula: Formula<T>, shortCircuit: (...args: T[]) => string) =>
  (...args: T[]) => {
    const shortCircuitValue = shortCircuit(...args);
    return typeof shortCircuitValue !== "undefined" ? shortCircuitValue : formula(...args);
  };

// Exports
export const VALUE = withConstants(
  (...values: (boolean | string | number)[]): string => {
    const value = values[0];
    if (typeof value === "boolean" || value?.toString().toUpperCase() === "TRUE" || value?.toString().toUpperCase() === "FALSE") {
      return value.toString().toUpperCase();
    } else if (isNumber(value)) {
      return Number(value).toString();
    } else {
      return `"${value.toString()}"`;
    }
  },
  {
    TRUE: true,
    FALSE: false,
    ZERO: 0,
    ONE: 1,
    EMPTYSTRING: "",
    EMPTYSTR: "",
  },
);
export const togglePrettyPrint = (shouldPrettyPrint: boolean = !prettyPrint): boolean => {
  const oldValue = prettyPrint;
  prettyPrint = shouldPrettyPrint; // TODO Allow only in Debug options due to Max Formula Length
  return oldValue;
};
const rangeRegExp = /^\(*(\$?[A-Z]+)?(\$?[1-9]\d*):(\$?[A-Z]+)?(\$?[1-9]\d*)\)*$/;
export const AND: StringFormula = withArgsTransform(
  withArgsShortCircuit(
    PrefixFormula("AND"),
    (...values: string[]): string => {
      if (values.includes(VALUE.FALSE))
        return VALUE.FALSE;
      if (values.length === 1 && !values[0].match(rangeRegExp))
        return values[0];
    },
  ),
  (...args: string[]): string[] => {
    const newArgs = removeDuplicates(args).filter(arg => arg !== VALUE.TRUE);
    if (newArgs.length === 0 && args.length > 0)
      return [VALUE.TRUE];
    return newArgs;
  },
);
export const OR: StringFormula = withArgsTransform(
  withArgsShortCircuit(
    PrefixFormula("OR"),
    (...values: string[]): string => {
      if (values.includes(VALUE.TRUE))
        return VALUE.TRUE;
      if (values.length === 1 && !values[0].match(rangeRegExp))
        return values[0];
    },
  ),
  (...args: string[]): string[] => {
    const newArgs = removeDuplicates(args).filter(arg => arg !== VALUE.FALSE);
    if (newArgs.length === 0 && args.length > 0)
      return [VALUE.FALSE];
    return newArgs;
  },
);
export const NOT: StringFormula = withArgsShortCircuit(
  PrefixFormula("NOT"),
  (value: string): string => {
    if (value === VALUE.TRUE)
      return VALUE.FALSE;
    if (value === VALUE.FALSE)
      return VALUE.TRUE;
    if (value && value.toString().match(/^NOT\(/))
      return value.toString().substring(3); // NOT("NOT(...)") => "(...)"
  },
);
export const IF: StringFormula = withArgsShortCircuit(
  PrefixFormula("IF"),
  (...args: string[]): string => {
    if (args[0] === VALUE.TRUE)
      return args[1];
    else if (args[0] === VALUE.FALSE)
      return args[2];
  },
);
export const IFS: StringFormula = withArgsTransform(
  withArgsShortCircuit(
    PrefixFormula("IFS"),
    (...args: string[]): string => {
      if (args[0] === VALUE.TRUE)
        return args[1];
    },
  ),
  (...args: string[]): string[] => {
    const newArgs = [];
    for (let i = 0; i < args.length; i += 2) {
      if (args[i] !== VALUE.FALSE) { // Take out any FALSE arguments
        newArgs.push(args[i], args[i + 1]);
      }
      if (args[i] === VALUE.TRUE)
        break; // Short circuit if you reach a TRUE since all further can't be reached
    }
    return newArgs;
  },
);
export const IFERROR: StringFormula = PrefixFormula("IFERROR");

export const EQ: StringFormula = withArgsShortCircuit(
  PrefixFormula("EQ"),
  (...args: string[]): string => {
    if (args[0] === args[1])
      return VALUE.TRUE;
  },
);
export const NE: StringFormula = withArgsShortCircuit(
  PrefixFormula("NE"),
  (...args: string[]): string => {
    if (args[0] === args[1])
      return VALUE.FALSE;
  },
);
export const GT: StringFormula = withArgsShortCircuit(
  InlineFormula(">"),
  (...args: string[]): string => {
    if (isNumber(args[0]) && isNumber(args[1]))
      return Number(args[0]) > Number(args[1]) ? VALUE.TRUE : VALUE.FALSE;
  },
);
export const GTE: StringFormula = withArgsShortCircuit(
  InlineFormula(">="),
  (...args: string[]): string => {
    if (isNumber(args[0]) && isNumber(args[1]))
      return Number(args[0]) >= Number(args[1]) ? VALUE.TRUE : VALUE.FALSE;
  },
);
export const LT: StringFormula = withArgsShortCircuit(
  InlineFormula("<"),
  (...args: string[]): string => {
    if (isNumber(args[0]) && isNumber(args[1]))
      return Number(args[0]) < Number(args[1]) ? VALUE.TRUE : VALUE.FALSE;
  },
);
export const LTE: StringFormula = withArgsShortCircuit(
  InlineFormula("<="),
  (...args: string[]): string => {
    if (isNumber(args[0]) && isNumber(args[1]))
      return Number(args[0]) <= Number(args[1]) ? VALUE.TRUE : VALUE.FALSE;
  },
);

export const MULT: StringFormula = withArgsTransform(
  InlineFormula("*"),
  (...args: string[]): string[] => {
    const newArgs = args.filter(arg => arg !== VALUE.ONE); // Remove 1s
    if (args.length > 0 && newArgs.length === 0)
      return [VALUE.ONE]; // If all 1s, return 1
    if (newArgs.includes(VALUE.ZERO))
      return [VALUE.ZERO]; // If has 0, is 0
    return newArgs;
  },
);
export const DIV: StringFormula = withArgsTransform(
  InlineFormula("/"),
  (...args: string[]): string[] => {
    if (args.length > 0 && args[0] === VALUE.ZERO)
      return [VALUE.ZERO]; // "0 /..."  === 0
    return args.filter((arg, i) => i === 0 || arg !== VALUE.ONE); // Remove ..."/ 1"
  },
);
export const MINUS: StringFormula = withArgsTransform(
  InlineFormula("-"),
  (...args: string[]): string[] =>
    args.filter((arg, i) => i === 0 || arg !== VALUE.ZERO), // remove ..."- 0"
);
export const ADD: StringFormula = withArgsTransform(
  InlineFormula("+"),
  (...args: string[]): string[] => {
    const newArgs = args.filter(arg => arg !== VALUE.ZERO); // Remove 0s
    if (args.length > 0 && newArgs.length === 0)
      return [VALUE.ZERO]; // If all 0s, return 0
    return newArgs;
  },
);

export const COUNTIF: StringFormula = PrefixFormula("COUNTIF");
export const COUNTIFS: StringFormula = PrefixFormula("COUNTIFS");
export const ERRORTYPE: StringFormula = PrefixFormula("ERROR.TYPE");
export const ISERROR: StringFormula = PrefixFormula("ISERROR");
export const ISBLANK: StringFormula = PrefixFormula("ISBLANK");
export const REGEXMATCH: StringFormula = PrefixFormula("REGEXMATCH");
export const HYPERLINK: StringFormula = PrefixFormula("HYPERLINK");
export const TEXT: StringFormula = PrefixFormula("TEXT");

export const CONCAT: StringFormula = PrefixFormula("CONCATENATE");
export const CHAR = withConstants(PrefixFormula<number | string>("CHAR"), {
  NEWLINE: 10,
});

export const R1C1 = RangeFormula(rcToR1C1);
export const A1 = RangeFormula(rcToA1);

export const T = PrefixFormula("T");
export const N = PrefixFormula("N");
export const ROUND = PrefixFormula("ROUND");
export const ISFORMULA = PrefixFormula("ISFORMULA");
export const COMMENT: {
  BOOLEAN: StringFormula;
  NUMBER: StringFormula;
  STRING: StringFormula;
} = {
  BOOLEAN: (comment: string, ...values): string => AND(T(VALUE(comment)), ...values),
  NUMBER: (comment: string, ...values): string => ADD(N(VALUE(comment)), ...values),
  STRING: (comment: string, ...values): string => CONCAT(T(N(VALUE(comment))), ...values),
};

export const urlToSheet: (sheetId: number, rowOrRange?: Range | number, ...a1RestArgs: (number | boolean)[]) => string = (sheetId: number, a1FirstArg?: (Range | number), ...a1RestArgs: (number | boolean)[]) => {
  let link = `#gid=${sheetId}`;
  if (a1FirstArg || a1RestArgs.length) {
    link += `&range=${A1(a1FirstArg, ...a1RestArgs).replace(/\$/g, "")}`;
  }
  return link;
};

// HYPERLINK_TO_SHEET_A1([text],[sheetId],[argsForA1]...)
export const HYPERLINK_TO_SHEET: (sheetId: number, text: string, rowOrRange?: Range | number, ...a1RestArgs: (number | boolean)[]) => string = (sheetId: number, text: string, a1FirstArg?: (Range | number), ...a1RestArgs: (number | boolean)[]) => {
  return HYPERLINK(VALUE(urlToSheet(sheetId, a1FirstArg, ...a1RestArgs)), VALUE(text));
};

export const FORMULA: StringFormula = (value: string) => `=${value}`;
