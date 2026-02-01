import type { IStatusFormulaTranslator } from "../../interfaces";
import type { row } from "../../types";
import type { BlockedArgs } from "../shared";
import { AND, NOT, OR } from "../../utilities";
import { FormulaNode } from "../base";
import { BooleanFormulaNode } from "../boolean";

const untilRegExp = /^(?:(.*?) +)?UNTIL +(.*?)$/;

/**
 * BlockedUntilFormulaNode - Item is blocked until a condition is met
 * Example: "BLOCKED Boss UNTIL Key" - Boss is unavailable until Key is obtained
 */
export class BlockedUntilFormulaNode extends FormulaNode<boolean> {
  static create({ text, blockedText, untilText, translator, row }: BlockedArgs) {
    const match = text?.match(untilRegExp) || [];
    return new BlockedUntilFormulaNode(blockedText || match[1], untilText || match[2], translator, row);
  }

  constructor(blockedText: string, untilText: string, translator: IStatusFormulaTranslator, row: row) {
    super(`!(${blockedText}) || (${untilText})`, translator, row);
    this.children[0] = BooleanFormulaNode.create({ text: blockedText, translator: this.translator, row: this.row });
    this.children[1] = BooleanFormulaNode.create({ text: untilText, translator: this.translator, row: this.row });
    this.formulaType = AND;
  }

  protected get blockedChild() {
    return this.children[0];
  }

  protected set blockedChild(child) {
    this.children[0] = child;
  }

  protected get untilChild() {
    return this.children[1];
  }

  protected set untilChild(child) {
    this.children[1] = child;
  }

  toPreReqsMetFormula(): string {
    return OR(
      NOT(this.blockedChild.toPreReqsMetFormula()),
      this.untilChild.toPreReqsMetFormula(),
    );
  }

  toPRUsedFormula(): string {
    return AND(this.blockedChild.toPreReqsMetFormula(), this.untilChild.toPRUsedFormula());
  }

  toRawMissedFormula(): string {
    return AND(this.blockedChild.toPreReqsMetFormula(), this.untilChild.toRawMissedFormula());
  }

  toMissedFormula(): string {
    return AND(this.blockedChild.toPreReqsMetFormula(), this.untilChild.toMissedFormula());
  }

  toUnknownFormula(): string {
    return AND(this.blockedChild.toPreReqsMetFormula(), this.untilChild.toUnknownFormula());
  }
}
