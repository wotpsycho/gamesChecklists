import type { row, column } from '../../types';
import type { IStatusFormulaTranslator, NodeArgs, RowCounts } from '../../interfaces';
import { VALUE, COUNTIF, MULT, ADD, MINUS } from '../../utilities/formula-helpers';
import type { NumberNode } from '../shared';
import { FormulaValueNode } from './FormulaValueNode';
import { COLUMN, STATUS } from "../../../shared-types";

/**
 * Number value node representing counts of items in various states
 * Provides formulas for counting items by status
 */
export class NumberFormulaValueNode extends FormulaValueNode<number> implements NumberNode {
  protected readonly isNumber = true;
  static create({ text, translator, row, _implicitPrefix = false }: NodeArgs & { _implicitPrefix?: boolean }) {
    return new NumberFormulaValueNode(text, translator, row, _implicitPrefix);
  }
  protected readonly children: FormulaValueNode<never>[];
  protected constructor(text: string | number, translator: IStatusFormulaTranslator, row: row, _implicitPrefix: boolean = false) {
    super(text.toString(), translator, row, _implicitPrefix);
  }

  determineValue() {
    if (Number(this.text) || this.text === '0') {
      this.value = Number(this.text);
    }
  }

  toTotalFormula(): string {
    if (this.hasValue()) return VALUE(this.value);
    return this.valueInfo.numPossible.toString();
  }

  toFormulaByStatus(...statuses: STATUS[]) {
    return this._generateFormula(statuses.flat());
  }

  toFormulaByNotStatus(...statuses: STATUS[]) {
    if (this.hasValue()) return VALUE(this.value);
    return MINUS(this.toTotalFormula(), this.toFormulaByStatus(...statuses));
  }

  toPreReqsMetFormula(): string {
    return this._generateFormula(VALUE.TRUE, COLUMN.CHECK);
  }

  toPRNotMetFormula(): string {
    return MINUS(this.toTotalFormula(), this.toPreReqsMetFormula());
  }

  toMissedFormula(): string {
    return this.toFormulaByStatus(STATUS.MISSED, STATUS.PR_USED);
  }
  toRawMissedFormula(): string {
    return this.toFormulaByStatus(STATUS.MISSED);
  }
  toRawNotMissedFormula(): string {
    return this.toFormulaByNotStatus(STATUS.MISSED);
  }

  toUnknownFormula(): string {
    return this.toFormulaByStatus(STATUS.UNKNOWN);
  }
  toNotUnknownFormula(): string {
    return this.toFormulaByNotStatus(STATUS.UNKNOWN);
  }
  toNotMissedFormula(): string {
    return this.toFormulaByNotStatus(STATUS.MISSED, STATUS.PR_USED);
  }
  toPRUsedFormula(): string {
    if (this.hasValue()) return VALUE(this.value);
    return this._generateFormula(STATUS.PR_USED);
  }
  toPRNotUsedFormula(): string {
    if (this.hasValue()) {
      return VALUE(this.value);
    }
    return MINUS(this.toTotalFormula(), this.toPRUsedFormula());
  }
  toMinCheckedFormula(): string {
    return this.toFormulaByStatus(STATUS.CHECKED);
  }
  toMaxCheckedFormula(): string {
    return this.toFormulaByNotStatus(STATUS.MISSED, STATUS.PR_USED);
  }

  getMinValue(): number {
    if (this.hasValue()) return this.value;
    return 0;
  }

  getMaxValue(): number {
    if (this.hasValue()) return this.value;
    return this.valueInfo.numPossible;
  }

  private _generateFormula(values: (string | number | boolean) | (string | number | boolean)[] = [], column: column = COLUMN.STATUS): string {
    if (this.hasValue()) {
      return VALUE(this.value);
    } else if (!values || (Array.isArray(values) && values.length == 0)) {
      return VALUE.ZERO;
    } else {
      const vals: (string | number | boolean)[] = Array.isArray(values) ? values : [values];
      const counts: string[] = Object.entries(this.translator.rowCountsToA1Counts(this.valueInfo.rowCounts, column)).reduce(
        (counts, [range, count]) => {
          vals.forEach((value) => {
            const countIf: string = COUNTIF(range, VALUE(value));
            counts.push(count == 1 ? countIf : MULT(countIf, VALUE(count)));
          });
          return counts;
        },
        []
      );
      return ADD(...counts);
    }
  }

  checkErrors() {
    let hasError = super.checkErrors();
    if (this.text.match(/^SAME|COPY /)) {
      this.addError('Cannot use SAME with Numerical Equations');
      hasError = true;
    }
    return hasError;
  }
}
