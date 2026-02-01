import type { CellFormulaParser } from "../../CellFormulaParser";
import type { IStatusFormulaTranslator, NodeArgs } from "../../interfaces";
import type { row } from "../../types";
import type { FormulaValueNode } from "../value";
import { COLUMN, STATUS } from "../../../shared-types";
import { SPECIAL_PREFIXES, USAGES } from "../../constants";
import { AND, EQ, NOT, OR, VALUE } from "../../utilities";
import { virtualItems } from "../shared";
import { BooleanFormulaValueNode } from "../value";

/**
 * OptionFormulaNode handles OPTION prefix for choice-based items
 * Options are mutually exclusive - selecting one marks others as PR_USED
 */
export class OptionFormulaNode extends BooleanFormulaValueNode {
  static create({ text, translator, row }: NodeArgs): FormulaValueNode<boolean> {
    return new OptionFormulaNode(text, translator, row);
  }

  protected constructor(text: string, translator: IStatusFormulaTranslator, row: row) {
    super(text, translator, row);
    if (this.valueInfo.rows.length === 0) {
      if (!virtualItems[this.text]) {
        virtualItems[this.text] = {
          rowCounts: {},
          numNeeded: 1,
        };
      }
      virtualItems[this.text].rowCounts[this.row] = 1;
    }
    this.numNeeded = 1;
  }

  finalize(): OptionFormulaNode {
    if (this.finalized)
      return this;
    super.finalize();
    this.choiceParser?.addOption(this.row);
    this.finalized = true;
    return this;
  }

  get choiceRow(): row {
    return this.valueInfo.isVirtual ? undefined : this.valueInfo.rows[0];
  }

  get choiceParser(): CellFormulaParser {
    return this.valueInfo.isVirtual ? undefined : this.translator.getParserForRow(this.choiceRow);
  }

  get choiceOptions(): row[] {
    if (this.valueInfo.isVirtual) {
      return Object.keys(virtualItems[this.text].rowCounts).map(row => Number(row));
    } else {
      return this.choiceParser.getOptions();
    }
  }

  checkErrors(): boolean {
    let hasError = false;
    if (this.choiceOptions.length < 2) {
      this.addError(`This is the only OPTION for Choice "${this.text}"\n\n${USAGES[SPECIAL_PREFIXES.OPTION]}`);
      hasError = true;
    }
    if (!this.valueInfo.isVirtual) {
      if (this.valueInfo.rows.length !== 1) {
        this.addError(`"${this.text}" refers to ${this.valueInfo.rows.length} Items\n\n${USAGES[SPECIAL_PREFIXES.OPTION]}`);
        hasError = true;
      }
      hasError = super.checkErrors() || hasError;
    }
    return hasError;
  }

  toPreReqsMetFormula() {
    return this.valueInfo.isVirtual
      ? NOT(this.toPRUsedFormula())
      : AND(
          NOT(OR(...this.translator.rowsToA1Ranges(this.choiceOptions, COLUMN.CHECK))),
          this.translator.getParserForRow(this.choiceRow).toRawPreReqsMetFormula(),
        );
  }

  toPRUsedFormula(): string {
    return this._determineFormula(
      OR(...this.translator.rowsToA1Ranges(this.choiceOptions, COLUMN.CHECK)),
      STATUS.PR_USED,
      STATUS.CHECKED,
    );
  }

  toRawMissedFormula(): string {
    return VALUE.FALSE;
  }

  toMissedFormula(): string {
    return this._determineFormula(VALUE.FALSE, STATUS.MISSED);
  }

  toUnknownFormula(): string {
    return this._determineFormula(VALUE.FALSE, STATUS.UNKNOWN);
  }

  private _determineFormula(virtualChoiceFormula: string, ...statuses: STATUS[]): string {
    return this.valueInfo.isVirtual ? virtualChoiceFormula : this._getChoiceRowStatusFormula(...statuses);
  }

  private _getChoiceRowStatusFormula(...statuses: STATUS[]) {
    return OR(...statuses.map(status => EQ(this.translator.cellA1(this.choiceRow, COLUMN.STATUS), VALUE(status))));
  }

  getAllPossiblePreReqRows(): ReadonlySet<row> {
    if (this.valueInfo.isVirtual) {
      return new Set<row>();
    } else {
      return super.getAllPossiblePreReqRows();
    }
  }

  getCircularDependencies(previous: row[]): ReadonlySet<row> {
    if (this.valueInfo.isVirtual) {
      return new Set<row>();
    } else {
      return super.getCircularDependencies(previous);
    }
  }

  isDirectlyMissable(): boolean {
    return this.valueInfo.isVirtual ? false : super.isDirectlyMissable();
  }
}
