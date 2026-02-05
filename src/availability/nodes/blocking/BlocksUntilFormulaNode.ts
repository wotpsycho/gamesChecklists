import type { CellFormulaParser } from "../../CellFormulaParser";
import type { IStatusFormulaTranslator } from "../../interfaces";
import type { row } from "../../types";
import type { BlocksArgs } from "../shared/types";
import { COLUMN } from "../../../shared-types";
import { time, timeEnd } from "../../../util";
import { VALUE } from "../../utilities/formula-helpers";
import { BooleanFormulaNode } from "../boolean/BooleanFormulaNode";
import { FormulaValueNode } from "../value/FormulaValueNode";
import { GeneratedBlockedUntilFormulaNode } from "./GeneratedBlockedUntilFormulaNode";

const untilRegExp = /^(?:(.*?) +)?UNTIL +(.*?)$/;

/**
 * BlocksUntilFormulaNode - Blocks other items from becoming available until a condition is met
 * Example: "BLOCKS * UNTIL Chapter 3" - all items blocked until Chapter 3 is complete
 */
export class BlocksUntilFormulaNode extends FormulaValueNode<boolean> {
  static create({ text, blocksText, untilText, translator, row }: BlocksArgs) {
    const match = text?.match(untilRegExp) || [];
    return new BlocksUntilFormulaNode(blocksText || match[1] || "*", untilText || match[2], translator, row);
  }

  protected get parser(): CellFormulaParser {
    return this.translator.getParserForRow(this.row);
  }

  protected constructor(blocksText: string, untilText: string, translator: IStatusFormulaTranslator, row: row) {
    super(blocksText ?? "*", translator, row);
    if (!untilText) {
      this.addError("Missing UNTIL clause of BLOCKS");
    } else {
      this.child = BooleanFormulaNode.create({ text: untilText, translator: this.translator, row: this.row });
    }
  }

  finalize(): BlocksUntilFormulaNode {
    if (this.finalized)
      return this;
    super.finalize();
    if (!this.hasErrors()) {
      time("blocksFinalize");
      const untilPreReqRows = this.child.getAllPossiblePreReqRows();
      // console.log("finalizeBlock row:%s, text:'%s', child.text: %s, untilPreReqRows:[%s], rows:[%s]", this.row, this.text, this.child.text, [...untilPreReqRows].join(","), [...this.getDirectPreReqRows()].join(","))
      this.valueInfo.rows // All rows matching the BLOCKS clause
        .filter(blockedRow => !untilPreReqRows.has(blockedRow)) // Don't block any preReq of UNTIL
        .forEach(blockedRow =>
          this.translator.getParserForRow(blockedRow).addChild(
            GeneratedBlockedUntilFormulaNode.create({ blockedText: `$${this.row}`, untilText: this.child.text, translator: this.translator, row: blockedRow, calculated: true }).finalize(),
          ),
        );
      timeEnd("blocksFinalize");
    }
    this.finalized = true;
    return this;
  }

  getAllPossiblePreReqRows(): Set<row> {
    return new Set<row>();
  }

  getDirectPreReqRows(): Set<row> {
    return new Set<row>();
  }

  getCircularDependencies(): Set<row> {
    return new Set<row>();
  }

  toPreReqsMetFormula(): string {
    return VALUE.TRUE;
  }

  toPRUsedFormula(): string {
    return VALUE.FALSE;
  }

  toRawMissedFormula(): string {
    return VALUE.FALSE;
  }

  toMissedFormula(): string {
    return VALUE.FALSE;
  }

  toUnknownFormula(): string {
    return VALUE.FALSE;
  }

  checkErrors() {
    if (super.checkErrors() || !this.child) {
      return true;
    } else if (!this.child.getAllPossiblePreReqRows().has(this.row)) {
      this.addError("UNTIL clause must depend on this Item");
      console.error("UNTIL Clause Depends:: row: %s, childPreReqRows: [%s], child.loop:%s", this.row, [...this.child.getAllPossiblePreReqRows()].join(","), this.child.isInCircularDependency());
      return true;
    } else {
      // console.log("blocksUntil.checkErrors:checking missables")
      const preReqRows = this.parser.getAllPossiblePreReqRows();
      const childPreReqRows = this.child.getAllPossiblePreReqRows();
      const possiblyMissableRows = [...childPreReqRows].filter(row => !preReqRows.has(row) && this.translator.getParserForRow(row).isDirectlyMissable());
      if (possiblyMissableRows.length) {
        const itemsByRow = this.translator.getColumnValues(COLUMN.ITEM).byRow;
        this.addError(`UNTIL clause cannot be missible; remove Pre-Req dependencies on these Items: ${
          possiblyMissableRows.map<string[]>(row =>
            itemsByRow[row].map<string>(valueInfo =>
              `${valueInfo.value} (Row ${row})`,
            ),
          ).flat().join("\n")}`,
        );
      }
    }
  }
}
