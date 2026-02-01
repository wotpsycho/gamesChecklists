import type { CellFormulaParser } from "../../CellFormulaParser";
import type { IStatusFormulaTranslator, NodeArgs } from "../../interfaces";
import type { row } from "../../types";
import { COLUMN } from "../../../shared-types";
import { OR, VALUE } from "../../utilities";
import { FormulaValueNode } from "./FormulaValueNode";

/**
 * SameFormulaNode handles SAME/COPY syntax
 * Copies the formula logic from another item
 */
export class SameFormulaNode extends FormulaValueNode<boolean> {
  static create({ text, translator, row }: NodeArgs) {
    return new SameFormulaNode(text, translator, row);
  }

  private sameRow: row;
  private get sameRowParser(): CellFormulaParser {
    return this.sameRow && this.translator.getParserForRow(this.sameRow);
  }

  protected constructor(text: string, translator: IStatusFormulaTranslator, row: row) {
    super(text, translator, row);
  }

  finalize(): SameFormulaNode {
    if (this.finalized)
      return this;
    super.finalize();
    this.sameRow = this.valueInfo.rows[0];
    this.finalized = true;
    return this;
  }

  toPreReqsMetFormula() {
    return OR(this.translator.cellA1(this.sameRow, COLUMN.CHECK), this.sameRowParser?.toPreReqsMetFormula() || "");
  }

  toErrorFormula() {
    return this.sameRowParser?.toErrorFormula() || VALUE.TRUE;
  }

  toMissedFormula() {
    return this.sameRowParser?.toMissedFormula() || "";
  }

  toPRUsedFormula() {
    return this.sameRowParser?.toPRUsedFormula() || "";
  }

  toRawMissedFormula() {
    return this.sameRowParser?.toRawMissedFormula() || "";
  }

  toUnknownFormula() {
    return this.sameRowParser?.toUnknownFormula() || "";
  }

  checkErrors() {
    if (super.checkErrors()) {
      return true;
    } else if (this.valueInfo.rows.length !== 1) {
      this.addError("SAME must link to only 1 Item but an Item can have multiple SAME");
      return true;
    } else if (this.valueInfo.numPossible > 1) {
      this.addError("Cannot use SAME with Numerical Equations");
      return true;
    }
    return false;
  }
}
