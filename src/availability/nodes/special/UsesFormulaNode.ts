import type { IStatusFormulaTranslator, NodeArgs } from "../../interfaces";
import type { row } from "../../types";
import type { useInfo } from "../shared/types";
import * as Formula from "../../../Formulas";
import { COLUMN } from "../../../shared-types";
import { ADD, getNumItemInfo, IF, MINUS, OR, VALUE } from "../../utilities/formula-helpers";
import { usesInfo, virtualItems } from "../shared/registries";
import { BooleanFormulaValueNode } from "../value/BooleanFormulaValueNode";

/**
 * UsesFormulaNode - Tracks consumable items that can be used multiple times
 * Example: "USES 3x Potion" - requires 3 potions, tracking total usage across rows
 */
export class UsesFormulaNode extends BooleanFormulaValueNode {
  static create({ text, translator, row }: NodeArgs) {
    return new UsesFormulaNode(text, translator, row);
  }

  protected constructor(text: string, translator: IStatusFormulaTranslator, row: row) {
    const itemInfo = getNumItemInfo(text);
    super(itemInfo.item, translator, row, itemInfo.num >= 0);
    this.numNeeded = itemInfo.num ?? 1;
    this.useInfo[this.row] = this.numNeeded;
  }

  get useInfo(): useInfo {
    if (!usesInfo[this.text]) {
      usesInfo[this.text] = {};
    }
    return usesInfo[this.text];
  }

  toPRUsedFormula(): string {
    return OR(
      Formula.LT(
        MINUS(
          this.availableChild.valueInfo.isVirtual ? virtualItems[this.availableChild.text].numNeeded.toString() : this.availableChild.toTotalFormula(),
          this._getPRUsedAmountFormula(),
        ),
        VALUE(this.numNeeded),
      ),
      super.toPRUsedFormula(),
    );
  }

  private _getPRUsedAmountFormula(): string {
    const usedAmoutArguments: string[] = Object.entries(this.useInfo).map(([row, numUsed]) => IF(this.translator.cellA1(row as unknown as number, COLUMN.CHECK), VALUE(numUsed), VALUE.ZERO));
    return ADD(...usedAmoutArguments);
  }

  toPreReqsMetFormula(): string {
  // Parent => CHECKED >= NEEDED
  // This   => (CHECKED - USED) >= NEEDED
    const usedAmountFormula: string = this._getPRUsedAmountFormula();
    const checkedFormula: string = this.availableChild.toPreReqsMetFormula();
    const availableAmountFormula: string = MINUS(checkedFormula, usedAmountFormula);
    const numNeededFormula: string = this.neededChild.toPreReqsMetFormula();
    return this.formulaType.generateFormula(availableAmountFormula, numNeededFormula);
  }

  isDirectlyMissable(): boolean {
    if (Object.values(usesInfo[this.text]).reduce((total, needed) => total + needed, 0) > this.availableChild.getMaxValue()) {
    // if TOTAL_NEEDED > TOTAL_AVAILABLE
      return true;
    } else {
      return super.isDirectlyMissable();
    }
  }
}
