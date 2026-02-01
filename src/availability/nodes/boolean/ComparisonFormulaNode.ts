import type { row, FormulaHelper } from '../../types';
import type { IStatusFormulaTranslator, NodeArgs } from '../../interfaces';
import { FormulaNode } from '../base';
import {
  OR,
  AND,
  EQ,
  NE,
  GT,
  GTE,
  X_ITEMS,
  VALUE,
  formulaTypeToString,
} from '../../utilities/formula-helpers';
import * as Formula from '../../../Formulas';
import { STATUS } from '../../../ChecklistApp';
import type { NumberNode } from '../shared';
import { NumberFormulaNode } from '../number';

/**
 * Comparison formula node for comparing two number nodes
 * Handles ==, !=, >, >=, and X_ITEMS operators
 */
export class ComparisonFormulaNode extends FormulaNode<boolean> {
  static create({
    text,
    translator,
    row,
    formulaType,
  }: NodeArgs & { formulaType: FormulaHelper }): ComparisonFormulaNode {
    return new ComparisonFormulaNode(text, translator, row, formulaType);
  }
  protected children: NumberNode[];
  protected constructor(
    text: string,
    translator: IStatusFormulaTranslator,
    row: row,
    formulaType: FormulaHelper
  ) {
    super(text, translator, row);

    this.formulaType = formulaType;
    const operands: string[] = formulaType.parseOperands(this.text);
    this.children.push(
      ...operands.map((operand) =>
        NumberFormulaNode.create({
          text: operand,
          translator: this.translator,
          row: this.row,
          _implicitPrefix: formulaType == X_ITEMS,
        })
      )
    );
  }

  checkErrors(): boolean {
    let isError: boolean;
    const lMin: number = this.children[0].getMinValue();
    const lMax: number = this.children[0].getMaxValue();
    const rMin: number = this.children[1].getMinValue();
    const rMax: number = this.children[1].getMaxValue();
    switch (this.formulaType) {
      case EQ:
        isError = lMax < rMin || lMin > rMax;
        break;
      case NE: {
        isError = lMax == lMin && lMax == rMin && lMax == rMax;
        break;
      }
      case GTE:
      case X_ITEMS:
        isError = lMax < rMin;
        break;
      case GT:
        isError = lMax <= rMin;
        break;
    }
    if (isError) {
      const lRange = lMin == lMax ? lMin : `[${lMin}..${lMax}]`;
      const rRange = rMin == rMax ? rMin : `[${rMin}..${rMax}]`;
      this.addError(
        `Formula cannot be satisfied: "${this.text} ${this.formulaType.name}" cannot be satisfied: ${lRange} cannot be ${formulaTypeToString(this.formulaType)} ${rRange}`
      );
      return true;
    }
  }
  toPRUsedFormula(): string {
    return this._toFormulaByNotStatus(this.toUnknownFormula.name, STATUS.PR_USED);
  }
  toRawMissedFormula(): string {
    return this._toFormulaByNotStatus(this.toUnknownFormula.name, STATUS.MISSED);
  }
  toMissedFormula(): string {
    return this._toFormulaByNotStatus(this.toUnknownFormula.name, [STATUS.MISSED, STATUS.PR_USED]);
  }
  toUnknownFormula(): string {
    if (this.isInCircularDependency()) return VALUE.TRUE;
    // ComparisonFormulaNode doesn't add MISSED check - that's handled by BooleanFormulaNode
    return this._toFormulaByNotStatus(this.toUnknownFormula.name, STATUS.UNKNOWN);
  }
  private _toFormulaByNotStatus(
    formulaTypeName: string,
    notStatusesForMax: STATUS | STATUS[],
    statusesForMin: STATUS | STATUS[] = STATUS.CHECKED
  ): string {
    if (this.hasErrors()) return VALUE.FALSE;
    if (this.isInCircularDependency()) return VALUE.FALSE;
    if (this.hasValue()) return VALUE(this.value);
    if (!this.formulaType) return this.child[formulaTypeName]();

    if (notStatusesForMax && !Array.isArray(notStatusesForMax)) notStatusesForMax = [notStatusesForMax];
    const minStatuses: string[] =
      statusesForMin && !Array.isArray(statusesForMin)
        ? [statusesForMin]
        : ((statusesForMin as string[]) || []);
    const maxNotStatuses: string[] =
      notStatusesForMax && !Array.isArray(notStatusesForMax)
        ? [notStatusesForMax]
        : ((notStatusesForMax as string[]) || []);
    switch (this.formulaType) {
      case GT: {
        return Formula.LTE(
          this.children[0].toFormulaByNotStatus(...maxNotStatuses),
          this.children[1].toFormulaByStatus(...minStatuses)
        );
      }
      case GTE:
      case X_ITEMS: {
        return Formula.LT(
          this.children[0].toFormulaByNotStatus(...maxNotStatuses),
          this.children[1].toFormulaByStatus(...minStatuses)
        );
      }
      case EQ: {
        return OR(
          Formula.LT(
            this.children[0].toFormulaByNotStatus(...maxNotStatuses),
            this.children[1].toFormulaByStatus(...minStatuses)
          ),
          GT(
            this.children[0].toFormulaByStatus(...minStatuses),
            this.children[1].toFormulaByNotStatus(...maxNotStatuses)
          )
        );
      }
      case NE: {
        return AND(
          EQ(
            this.children[0].toFormulaByNotStatus(...maxNotStatuses),
            this.children[0].toFormulaByStatus(...minStatuses)
          ),
          EQ(
            this.children[0].toFormulaByNotStatus(...maxNotStatuses),
            this.children[1].toFormulaByStatus(...minStatuses)
          ),
          EQ(
            this.children[0].toFormulaByStatus(...minStatuses),
            this.children[1].toFormulaByNotStatus(...maxNotStatuses)
          )
        );
      }
    }
  }
}
