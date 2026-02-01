import type { row } from '../../types';
import type { IStatusFormulaTranslator, NodeArgs } from '../../interfaces';
import { FormulaNode } from '../base';
import {
  ADD,
  MINUS,
  MULT,
  DIV,
  VALUE,
} from '../../utilities/formula-helpers';
import { STATUS } from '../../../ChecklistApp';
import type { NumberNode } from '../shared';
import { NumberFormulaValueNode } from '../value';

/**
 * Number formula node handling arithmetic operators (+, -, *, /)
 * and delegating to value nodes for actual values
 */
export class NumberFormulaNode extends FormulaNode<number> implements NumberNode {
  static create({
    text,
    translator,
    row,
    _implicitPrefix = false,
  }: NodeArgs & { _implicitPrefix?: boolean }): NumberFormulaNode {
    return new NumberFormulaNode(text, translator, row, _implicitPrefix);
  }
  protected readonly children: NumberNode[];
  protected constructor(text: string, translator: IStatusFormulaTranslator, row: row, _implicitPrefix) {
    super(text, translator, row);

    for (const arithmeticFormulaTranslationHelper of [ADD, MINUS, MULT, DIV]) {
      // Recursively handle comparison operators
      if (arithmeticFormulaTranslationHelper.identify(this.text)) {
        this.formulaType = arithmeticFormulaTranslationHelper;
        const operands: string[] = arithmeticFormulaTranslationHelper.parseOperands(this.text);
        this.children.push(
          ...operands.map((operand) =>
            NumberFormulaNode.create({
              text: operand,
              translator: this.translator,
              row: this.row,
              _implicitPrefix,
            })
          )
        );
        return;
      }
    }
    this.child = NumberFormulaValueNode.create({
      text,
      translator: this.translator,
      row: this.row,
      _implicitPrefix,
    });
  }

  protected get child(): NumberNode {
    return super.child as NumberNode;
  }

  protected set child(child: NumberNode) {
    super.child = child;
  }

  getMinValue(): number {
    if (this.hasValue()) return this.value;
    if (!this.formulaType) {
      return this.child.getMinValue();
    } else
      switch (this.formulaType) {
        case ADD:
          return this.children.map((child) => child.getMinValue()).reduce((min, childMin) => min + childMin);
        case MINUS:
          return (
            this.children[0].getMinValue() -
            this.children
              .slice(1)
              .map((child) => child.getMaxValue())
              .reduce((max, childMax) => max + childMax)
          );
        case MULT:
          return this.children.map((child) => child.getMinValue()).reduce((min, childMin) => min * childMin);
        case DIV:
          return this.children[0].getMinValue() / (this.children[1].getMaxValue() || 1);
      }
  }

  getMaxValue(): number {
    if (this.hasValue()) return this.value;
    if (!this.formulaType) {
      return this.child.getMaxValue();
    } else
      switch (this.formulaType) {
        case ADD:
          return this.children.map((child) => child.getMaxValue()).reduce((max, childMax) => max + childMax);
        case MINUS:
          return (
            this.children[0].getMaxValue() -
            this.children
              .map((child) => child.getMinValue())
              .slice(1)
              .reduce((min, childMin) => min + childMin)
          );
        case MULT:
          return this.children.map((child) => child.getMaxValue()).reduce((max, childMax) => max * childMax);
        case DIV:
          return this.children[0].getMaxValue() / (this.children[1].getMinValue() || 1);
      }
  }

  toPRUsedFormula(): string {
    return this.toFormulaByStatus(STATUS.PR_USED);
  }
  toMissedFormula(): string {
    return this.toFormulaByStatus(STATUS.PR_USED, STATUS.MISSED);
  }
  toFormulaByStatus(...statuses: STATUS[]): string {
    if (this.hasValue()) return VALUE(this.value);
    if (!this.formulaType) return this.child.toFormulaByStatus(...statuses);
    return this.formulaType.generateFormula(
      ...this.children.map((child) => child.toFormulaByStatus(...statuses))
    );
  }
  toFormulaByNotStatus(...statuses: STATUS[]): string {
    if (this.hasValue()) return VALUE(this.value);
    if (!this.formulaType) return this.child.toFormulaByNotStatus(...statuses);
    return this.formulaType.generateFormula(
      ...this.children.map((child) => child.toFormulaByNotStatus(...statuses))
    );
  }
  toRawMissedFormula(): string {
    if (this.hasValue()) return VALUE(this.value);
    if (!this.formulaType) return this.child.toRawMissedFormula();
    return this.formulaType.generateFormula(...this.children.map((child) => child.toRawMissedFormula()));
  }
  toUnknownFormula(): string {
    if (this.hasValue()) return VALUE(this.value);
    if (!this.formulaType) return this.child.toUnknownFormula();
    return this.formulaType.generateFormula(...this.children.map((child) => child.toUnknownFormula()));
  }
}
