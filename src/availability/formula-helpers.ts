import * as Formula from '../Formulas';
import type { FormulaHelper } from './types';

const numItemsPostfixRegExp = /^ *(.*?) +x(\d+) *$/;
const numItemsPrefixRegExp = /^ *(\d+)x +(.*?) *$/;

export const getNumItemInfo = (text: string, _defaultNum: number = undefined): {num?: number, item: string} => {
  let match = text.match(numItemsPrefixRegExp);
  if (match) {
    return {num: Number(match[1]), item: match[2]};
  } else if ((match = text.match(numItemsPostfixRegExp))) {
    return {num: Number(match[2]), item: match[1]};
  } else if (_defaultNum || _defaultNum === 0) {
    return {num: _defaultNum, item: text};
  } else {
    return {item: text};
  }
};

const FormulaHelperFactory = (formula: Formula.StringFormula, regExp: RegExp, isFlexible: boolean = false): FormulaHelper => {
  const parseOperands = (text: string): string[] => {
    const match: RegExpMatchArray = text?.match(regExp);
    if (!match) return;
    if (!isFlexible) return match.slice(1);

    const results = [];
    const lMatch = match[1];
    const lResult = parseOperands(lMatch);
    if (lResult) results.push(...lResult);
    else results.push(lMatch);

    const rMatch = match[2];
    const rResult = parseOperands(rMatch);
    if (rResult) results.push(...rResult);
    else results.push(rMatch);

    return results;
  };
  return Object.assign(
    (...args: string[]) => formula(...args),
    formula, {
      generateFormula: formula,
      identify: (text: string): boolean => !!(text?.match(regExp)),
      parseOperands,
    });
};

const ReversibleFormulaHelper = (formula: Formula.StringFormula, regExp: RegExp, reversibleRegExp: RegExp): FormulaHelper => {
  const parseOperands = (text: string): string[] => {
    if (!text) return;
    let match = text.match(regExp);
    if (match) return match.slice(1);
    match = text.match(reversibleRegExp);
    if (match) return match.slice(1).reverse();
  };
  return Object.assign(
    (...args: string[]) => formula(...args),
    formula, {
      generateFormula: formula,
      identify: (text: string): boolean => !!(text?.match(regExp) || text?.match(reversibleRegExp)),
      parseOperands,
    });
};

export const OR = FormulaHelperFactory(Formula.OR, /^ *(.+?) *\|\| *(.+?) *$/, true);
export const AND = FormulaHelperFactory(Formula.AND, /^ *(.+?) *&& *(.+?) *$/, true);
export const NOT = FormulaHelperFactory(Formula.NOT, /^ *! *(.+?) *$/);
export const EQ = FormulaHelperFactory(Formula.EQ, /^ *(.+?) *== *(.+?) *$/);
export const NE = FormulaHelperFactory(Formula.NE, /^ *(.+?) *!= *(.+?) *$/);
export const GT = ReversibleFormulaHelper(Formula.GT, /^ *(.+?) +> +(.+?) *$/, /^ *(.+?) +< +(.+?) *$/);
export const GTE = ReversibleFormulaHelper(Formula.GTE, /^ *(.+?) *>= *(.+?) *$/, /^ *(.+?) *<= *(.+?) *$/);
export const X_ITEMS = ReversibleFormulaHelper(Formula.GTE, numItemsPostfixRegExp, numItemsPrefixRegExp);

export const MULT = FormulaHelperFactory(Formula.MULT, /^ *(.+?) +\* +(.+?) *$/, true);
export const DIV = FormulaHelperFactory(Formula.DIV, /^ *(.+?) +\/ +(.+?) *$/, true);
export const MINUS = FormulaHelperFactory(Formula.MINUS, /^ *(.+?) +- +(.+?) *$/, true);
export const ADD = FormulaHelperFactory(Formula.ADD, /^ *(.+?) +\+ +(.+?) *$/, true);

export const { FORMULA, VALUE, IFS, IF, COUNTIF } = Formula;

export const formulaTypeToString = (formulaType: FormulaHelper): string => {
  switch(formulaType) {
    case OR: return "||";
    case AND: return "&&";
    case NOT: return "!";
    case EQ: return "==";
    case NE: return "!=";
    case GT: return ">";
    case X_ITEMS:
    case GTE: return ">=";
    case MULT: return "*";
    case DIV: return "/";
    case MINUS: return "-";
    case ADD: return "+";
  }
};
