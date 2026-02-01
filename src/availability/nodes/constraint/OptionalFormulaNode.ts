import type { row } from '../../types';
import type { IStatusFormulaTranslator, NodeArgs } from '../../interfaces';
import { NOT, VALUE } from '../../formula-helpers';
import { FormulaNode } from '../base-nodes';
import { BooleanFormulaNode } from '../boolean-number-nodes';

/**
 * OptionalFormulaNode - Marks prerequisites as optional
 * Example: "OPTIONAL Bonus Item" - this item is not required for completion
 */
export class OptionalFormulaNode extends FormulaNode<boolean> {
  static create({ text, translator, row }: NodeArgs) {
    return new OptionalFormulaNode(text,translator,row);
  }
  protected constructor(text:string, translator:IStatusFormulaTranslator,row:row) {
    super(text,translator,row);
    this.formulaType = NOT;
    this.child = BooleanFormulaNode.create({ text: this.text, translator: this.translator, row: this.row });
  }
  toMissedFormula():string {
    return VALUE.FALSE;
  }
  toRawMissedFormula():string {
    return VALUE.FALSE;
  }
  toPRUsedFormula():string {
    return this.child.toPreReqsMetFormula();
  }
  toUnknownFormula():string {
    return VALUE.FALSE;
  }
  isDirectlyMissable(): boolean {
    return true;
  }
}
