import type { row } from '../../types';
import type { IStatusFormulaTranslator, NodeArgs } from '../../interfaces';
import { NOT, VALUE } from '../../formula-helpers';
import { FormulaNode } from '../base/FormulaNode';
import { BooleanFormulaNode } from '../boolean/BooleanFormulaNode';

/**
 * MissedFormulaNode - Marks mutual exclusivity with other items
 * Example: "MISSED Kill Boss" - choosing this path makes "Kill Boss" unavailable
 */
export class MissedFormulaNode extends FormulaNode<boolean> {
  static create({ text, translator, row }:NodeArgs) {
    return new MissedFormulaNode(text,translator,row);
  }
  protected constructor(text:string, translator:IStatusFormulaTranslator,row:row) {
    super(text,translator,row);
    this.formulaType = NOT;
    this.child = BooleanFormulaNode.create({ text: this.text, translator: this.translator, row: this.row });
  }

  toMissedFormula():string {
    return this.child.toPreReqsMetFormula();
  }
  toRawMissedFormula():string {
    return this.child.toPreReqsMetFormula();
  }
  toPRUsedFormula():string {
    return VALUE.FALSE;
  }
  toUnknownFormula():string {
    return VALUE.FALSE;
  }
  isDirectlyMissable(): boolean {
    return true;
  }
}
