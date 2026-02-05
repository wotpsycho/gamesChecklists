import type { CellFormulaParser } from "../../CellFormulaParser";
import type { IStatusFormulaTranslator } from "../../interfaces";
import type { row } from "../../types";
import type { BlockedArgs } from "../shared/types";
import { VALUE } from "../../utilities/formula-helpers";
import { BlockedUntilFormulaNode } from "./BlockedUntilFormulaNode";

/**
 * GeneratedBlockedUntilFormulaNode - Auto-generated blocking constraint
 * Created by BlocksUntilFormulaNode during finalization
 */
export class GeneratedBlockedUntilFormulaNode extends BlockedUntilFormulaNode {
  static create({ blockedText, untilText, translator, row }: BlockedArgs): GeneratedBlockedUntilFormulaNode {
    return new GeneratedBlockedUntilFormulaNode(blockedText, untilText, translator, row);
  }

  protected get parser(): CellFormulaParser {
    return this.translator.getParserForRow(this.row);
  }

  constructor(blockedText: string, untilText: string, translator: IStatusFormulaTranslator, row: row) {
    super(blockedText, untilText, translator, row);
  }

  finalize(): GeneratedBlockedUntilFormulaNode {
    super.finalize();
    return this;
  }

  toPreReqsMetFormula(): string {
    // Since controlled isn't known until post-FINALIZED, have to do check here
    return this.parser.isControlled() ? VALUE.TRUE : super.toPreReqsMetFormula();
  }

  toPRUsedFormula(): string {
    // Since controlled isn't known until post-FINALIZED, have to do check here
    return this.parser.isControlled() ? VALUE.FALSE : super.toPRUsedFormula();
  }

  toRawMissedFormula(): string {
    // Since controlled isn't known until post-FINALIZED, have to do check here
    return this.parser.isControlled() ? VALUE.FALSE : super.toRawMissedFormula();
  }

  toMissedFormula(): string {
    // Since controlled isn't known until post-FINALIZED, have to do check here
    return this.parser.isControlled() ? VALUE.FALSE : super.toMissedFormula();
  }

  toUnknownFormula(): string {
    // Since controlled isn't known until post-FINALIZED, have to do check here
    return this.parser.isControlled() ? VALUE.FALSE : super.toUnknownFormula();
  }

  getAllPossiblePreReqRows(): ReadonlySet<number> {
    return new Set();
  }

  getDirectPreReqRows(): ReadonlySet<number> {
    return new Set();
  }
}
