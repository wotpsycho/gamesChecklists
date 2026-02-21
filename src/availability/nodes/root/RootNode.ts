import type { IStatusFormulaTranslator } from "../../interfaces";
import type { row } from "../../types";
import type { sheetValueInfo } from "../../utilities/parser-utilities";
import type { FormulaNode } from "../base/FormulaNode";
import { COLUMN, STATUS } from "../../../shared-types";
import { PHASE } from "../../constants";
import { AND, IFS, OR, VALUE } from "../../utilities/formula-helpers";
import { BooleanFormulaNode } from "../boolean/BooleanFormulaNode";

/**
 * RootNode - The root of a formula node tree for a checklist row
 * Extends BooleanFormulaNode and handles status formula generation
 */
export class RootNode extends BooleanFormulaNode {
  persist: boolean = false;
  constructor(children: FormulaNode<boolean>[], translator: IStatusFormulaTranslator, row: row) {
    super("", translator, row);
    if (children.length > 0) {
      this.children.push(...children);
      this.value = undefined;
      this.formulaType = AND;
    } else {
      this.value = true;
    }
  }

  protected optionsRows: row[] = [];
  getOptions(): row[] {
    return [...this.optionsRows];
  }

  addOption(row: number) {
    this.optionsRows.push(row);
  }

  addChild(child: FormulaNode<boolean>) {
    this.checkPhase(PHASE.FINALIZING);
    // If no children yet (no pre-reqs), activate AND combination so added children
    // are included in formula generation instead of short-circuiting on value=true
    if (this.children.length === 0) {
      this.value = undefined;
      this.formulaType = AND;
    }
    this.children.push(child);
  }

  isControlled(): boolean {
    return this.optionsRows.length > 0;
  }

  getControlledByInfos(): sheetValueInfo[] {
    if (this.isControlled()) {
      const itemValues: { [x: number]: sheetValueInfo[] } = this.translator.getColumnValues(COLUMN.ITEM).byRow;
      return this.optionsRows.map(optionRow => itemValues[optionRow]).flat();
    }
    return [];
  }

  toControlledFormula(): string {
    if (this.isControlled()) {
      if (this.isInCircularDependency()) {
        this.addError("Controlled Rows cannot be in Pre-Req circular Dependency");
        return VALUE.FALSE;
      } else {
        return OR(...this.translator.rowsToA1Ranges(this.optionsRows, COLUMN.CHECK));
      }
    }
  }

  toCheckedFormula(): string {
    return this.translator.cellA1(this.row, COLUMN.CHECK);
  }

  /**
   * If this has options, only show this row if an Option is available
   */
  toPreReqsMetFormula(): string {
    if (this.optionsRows.length > 0) {
      return OR(...this.optionsRows.map(optionRow => this.translator.getParserForRow(optionRow).toPreReqsMetFormula()));
    } else {
      return this.toRawPreReqsMetFormula();
    }
  }

  toRawPreReqsMetFormula() {
    return BooleanFormulaNode.prototype.toPreReqsMetFormula.call(this);// super.toPreReqsMetFormula();
  }

  toUnknownFormula(): string {
    const unknownFormula = super.toUnknownFormula();
    if (unknownFormula !== VALUE.FALSE) {
      // console.log("hasUnknown, row:%s, form:%s",this.row,unknownFormula);
    }
    return unknownFormula;
  }

  toStatusFormula(): string {
    const ifsArgs: string[] = [];
    const order: Array<[string, (() => string)]> = [
      [STATUS.ERROR, this.toErrorFormula],
      [STATUS.CHECKED, this.toCheckedFormula],
      [STATUS.AVAILABLE, this.toPreReqsMetFormula],
      [STATUS.UNKNOWN, this.toUnknownFormula],
      [STATUS.PR_USED, this.toPRUsedFormula],
      [STATUS.MISSED, this.toMissedFormula],
      [STATUS.PR_NOT_MET, () => VALUE.TRUE],
    ];
    for (const [status, formulaFunction] of order) {
      const formula: string = formulaFunction.call(this);
      ifsArgs.push(formula, VALUE(status));
    }
    return IFS(...ifsArgs);
  }
}
