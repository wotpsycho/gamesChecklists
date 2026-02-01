import type { column, row } from '../types';
import { SPECIAL_PREFIXES } from '../constants';
import type { IStatusFormulaTranslator } from "../interfaces";
import type { StatusFormulaTranslator } from "../StatusFormulaTranslator";
import { CellFormulaParser } from "../CellFormulaParser";

/**
 * Information about a sheet value including its position and content
 */
export type sheetValueInfo = {
  num: number;
  value: string;
  row: row;
  column: column;
};

/**
 * Column values organized by row and by value
 */
export type columnValues = {
  byRow: {
    [x: number]: sheetValueInfo[];
  };
  byValue: {
    [x: string]: sheetValueInfo[];
  };
};

// Placeholder system for managing parentheses and quotes during parsing
let UID_Counter: number = 0;
const [parenIdentifier, quoteIdentifier] = ["PPH", "QPH"];

export const getParenPlaceholder = (): string => `${parenIdentifier}_${UID_Counter++}_${parenIdentifier}`;
export const getQuotePlaceholder = (): string => `${quoteIdentifier}_${UID_Counter++}_${quoteIdentifier}`;

export const quoteRegExp: RegExp = RegExp(`${quoteIdentifier}_\\d+_${quoteIdentifier}`);
export const parenRegExp: RegExp = RegExp(`${parenIdentifier}_\\d+_${parenIdentifier}`);

export const quoteMapping: {[x: string]: string} = {};
export const parentheticalMapping: {[x: string]: string} = {};

/**
 * Regular expression to match special prefix patterns in prerequisites
 */
export const PREFIX_REG_EXP: RegExp = new RegExp(`^(${Object.values(SPECIAL_PREFIXES).join("|")}) (.+)$`, "i");
