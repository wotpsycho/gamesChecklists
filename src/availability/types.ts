import type * as Formula from "../Formulas";

export type Range = GoogleAppsScript.Spreadsheet.Range;
export type RichTextValue = GoogleAppsScript.Spreadsheet.RichTextValue;
export type column = number | string;
export type row = number;

export type FormulaHelper = Formula.StringFormula & {
  identify: (text: string) => boolean;
  parseOperands: (text: string) => string[];
  generateFormula: (...value: string[]) => string;
};
