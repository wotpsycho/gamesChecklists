import type { row, FormulaHelper } from '../../types';
import type { IStatusFormulaTranslator, NodeArgs } from '../../interfaces';
import { PHASE } from '../../constants';
import { AND, GTE, NOT, VALUE, MINUS } from '../../utilities/formula-helpers';
import * as Formula from '../../../Formulas';
import { virtualItems } from '../shared';
import { FormulaValueNode } from './FormulaValueNode';
import { NumberFormulaValueNode } from './NumberFormulaValueNode';
import { SameFormulaNode } from './SameFormulaNode';
import { COLUMN } from "../../../shared-types";

/**
 * Boolean value node representing item existence/count checks
 * Evaluates to true when enough items are checked (CHECKED >= NEEDED)
 */
export class BooleanFormulaValueNode extends FormulaValueNode<boolean> {
  static create({ text, translator, row }: NodeArgs): FormulaValueNode<boolean> {
    const match = text.match(/^(SAME|COPY) +(.*?)$/);
    if (match) {
      return SameFormulaNode.create({ text: match[2], translator, row });
    } else {
      return new BooleanFormulaValueNode(text, translator, row);
    }
  }
  protected readonly formulaType: FormulaHelper = GTE;
  protected readonly children: NumberFormulaValueNode[];
  protected numNeeded: number;

  protected constructor(text: string, translator: IStatusFormulaTranslator, row: row, _implicitPrefix: boolean = false) {
    super(text, translator, row, _implicitPrefix);
    if (!this.hasValue()) {
      this.availableChild = NumberFormulaValueNode.create({
        text: this.text,
        translator: this.translator,
        row: this.row,
        _implicitPrefix,
      });
      this.neededChild = NumberFormulaValueNode.create({
        text: '1',
        translator: this.translator,
        row: this.row,
        _implicitPrefix,
      });
    }
  }

  protected determineValue(): void {
    if (
      typeof this.text == 'boolean' ||
      this.text.toString().toUpperCase() == 'TRUE' ||
      this.text.toString().toUpperCase() == 'FALSE'
    ) {
      this.value = typeof this.text == 'boolean' ? (this.text as boolean) : this.text.toString().toUpperCase() == 'TRUE';
    }
  }

  finalize(): BooleanFormulaValueNode {
    if (this.finalized) return this;
    super.finalize();
    if (!this.hasValue()) {
      if (this.valueInfo.isVirtual && virtualItems[this.text].numNeeded) {
        this.numNeeded = virtualItems[this.text].numNeeded;
      } else if (!this.numNeeded && this.numNeeded !== 0) {
        this.numNeeded = this.valueInfo.numPossible;
      }
      this.neededChild.updateValue(this.numNeeded);
    }
    this.finalized = true;
    return this;
  }

  protected get availableChild(): NumberFormulaValueNode {
    this.checkPhase(PHASE.FINALIZING, PHASE.FINALIZED);
    this.finalize();
    return this.children[0];
  }
  protected set availableChild(child: NumberFormulaValueNode) {
    this.checkPhase(PHASE.BUILDING, PHASE.FINALIZING);
    this.children[0] = child;
  }
  protected get neededChild(): NumberFormulaValueNode {
    this.checkPhase(PHASE.FINALIZING, PHASE.FINALIZED);
    this.finalize();
    return this.children[1];
  }
  protected set neededChild(child: NumberFormulaValueNode) {
    this.checkPhase(PHASE.BUILDING, PHASE.FINALIZING);
    this.children[1] = child;
  }

  toPreReqsMetFormula(): string {
    this.checkPhase(PHASE.FINALIZED);
    if (!this.hasValue() && this.numNeeded == this.valueInfo.numPossible) {
      return AND(...this.translator.rowsToA1Ranges(this.valueInfo.rows, COLUMN.CHECK));
    } else {
      return super.toPreReqsMetFormula();
    }
  }

  toPRUsedFormula(): string {
    if (this.hasValue()) return VALUE.FALSE;
    return AND(
      GTE(MINUS(this.availableChild.toTotalFormula(), this.availableChild.toRawMissedFormula()), VALUE(this.numNeeded)),
      Formula.LT(this.availableChild.toPRNotUsedFormula(), VALUE(this.numNeeded))
    );
  }

  toRawMissedFormula(): string {
    if (this.hasValue()) return VALUE.FALSE;
    return Formula.LT(this.availableChild.toRawNotMissedFormula(), VALUE(this.numNeeded));
  }

  toMissedFormula(): string {
    if (this.hasValue()) return VALUE.FALSE;
    return Formula.LT(this.availableChild.toNotMissedFormula(), VALUE(this.numNeeded));
  }

  toUnknownFormula(): string {
    if (this.hasValue()) return VALUE.FALSE;
    return AND(
      NOT(this.toMissedFormula()),
      Formula.LT(
        MINUS(
          this.availableChild.toTotalFormula(),
          this.availableChild.toMissedFormula(),
          this.availableChild.toUnknownFormula()
        ),
        VALUE(this.numNeeded)
      )
    );
  }

  checkErrors(): boolean {
    if (super.checkErrors()) {
      return true;
    } else if (this.valueInfo.numPossible < this.numNeeded) {
      this.addError(
        'There are only ' + this.valueInfo.numPossible + ', not ' + this.numNeeded + ', of ' + this.valueInfo.column + ' "' + this.valueInfo.id + '"' + (this.valueInfo.isSelfReferential ? ' (when excluding itself)' : '')
      );
      return true;
    }
  }
}
