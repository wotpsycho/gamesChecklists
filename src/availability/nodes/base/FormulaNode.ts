import type { FormulaHelper } from '../../types';
import { PHASE } from '../../constants';
import { VALUE } from '../../utilities/formula-helpers';
import { Node } from './Node';

/**
 * Abstract base class for formula nodes that can generate various formula types.
 * Extends Node with formula generation capabilities for prerequisite status checking.
 */
export abstract class FormulaNode<T extends number | boolean | unknown> extends Node {
  protected readonly children: FormulaNode<unknown>[];
  protected formulaType: FormulaHelper;
  protected value: T;

  hasValue(): boolean {
    return typeof this.value !== 'undefined';
  }

  updateValue(value: T) {
    this.checkPhase(PHASE.BUILDING, PHASE.FINALIZING);
    if (!this.hasValue()) {
      throw new Error('Cannot update value on a non-value node');
    }
    this.value = value;
  }

  protected get child(): FormulaNode<unknown> {
    return super.child as FormulaNode<unknown>;
  }

  protected set child(child: FormulaNode<unknown>) {
    super.child = child;
  }

  toErrorFormula(): string {
    return VALUE(this.hasErrors());
  }

  toPreReqsMetFormula(): string {
    let formula: string;
    if (this.hasValue()) {
      return VALUE(this.value as string);
    } else if (this.formulaType) {
      formula = this.formulaType.generateFormula(
        ...this.children.map((child) => child.toPreReqsMetFormula())
      );
    } else if (this.child) {
      formula = this.child.toPreReqsMetFormula();
    } else {
      this.addError(`Could not determine formula for "${this.text}"`);
    }
    return formula;
  }

  abstract toPRUsedFormula(): string;

  abstract toRawMissedFormula(): string;

  abstract toMissedFormula(): string;

  abstract toUnknownFormula(): string;
}
