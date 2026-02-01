import type { row } from '../types';
import type { IStatusFormulaTranslator } from '../interfaces';
import type { sheetValueInfo } from '../parser-utilities';
import { COLUMN, STATUS } from '../../ChecklistApp';
import { PHASE } from '../constants';
import { AND, OR, NOT, IFS, VALUE } from '../formula-helpers';
import { FormulaNode } from './base-nodes';
import { BooleanFormulaNode, OptionFormulaNode } from './boolean-number-nodes';
import { CellFormulaParser } from '../cell-formula-parser';

/**
 * RootNode - The root of a formula node tree for a checklist row
 * Extends BooleanFormulaNode and handles status formula generation
 */
export class RootNode extends BooleanFormulaNode {
  persist: boolean = false;
  constructor(children:FormulaNode<boolean>[], translator:IStatusFormulaTranslator,row:row) {
    super("",translator,row);
    if (children.length > 0) {
      this.children.push(...children);
      this.value = undefined;
      this.formulaType = AND;
    } else {
      this.value = true;
    }
  }

  protected optionsRows:row[] = [];
  getOptions(): row[] {
    return [...this.optionsRows];
  }
  addOption(row: number) {
    this.optionsRows.push(row);
  }
  addChild(child: FormulaNode<boolean>) {
    this.checkPhase(PHASE.FINALIZING);
    this.children.push(child);
  }

  isControlled():boolean {
    return this.optionsRows.length > 0;
  }
  getControlledByInfos():sheetValueInfo[] {
    if (this.isControlled()) {
      const itemValues:{[x:number]:sheetValueInfo[]} = this.translator.getColumnValues(COLUMN.ITEM).byRow;
      return this.optionsRows.map(optionRow => itemValues[optionRow]).flat();
    }
  }
  toControlledFormula(): string {
    if (this.isControlled()) {
      if (this.isInCircularDependency()) {
        this.addError("Controlled Rows cannot be in Pre-Req circular Dependency");
        return VALUE.FALSE;
      } else {
        return OR(...this.translator.rowsToA1Ranges(this.optionsRows,COLUMN.CHECK));
      }
    }
  }
  toCheckedFormula(): string {
    return this.translator.cellA1(this.row, COLUMN.CHECK);
  }

  /**
   * If this has options, only show this row if an Option is available
   */
  toPreReqsMetFormula():string {
    if (this.optionsRows.length > 0) {
      return OR(...this.optionsRows.map(optionRow => CellFormulaParser.getParserForChecklistRow(this.translator,optionRow).toPreReqsMetFormula()));
    } else {
      return this.toRawPreReqsMetFormula();
    }
  }

  toRawPreReqsMetFormula() {
    return BooleanFormulaNode.prototype.toPreReqsMetFormula.call(this);//super.toPreReqsMetFormula();
  }

  toUnknownFormula(): string {
    let unknownFormula = super.toUnknownFormula();
    if (unknownFormula != VALUE.FALSE) {
      // console.log("hasUnknown, row:%s, form:%s",this.row,unknownFormula);
    }
    return unknownFormula;
  }

  toStatusFormula(): string {
    const ifsArgs:string[] = [];
    const order: Array<[string,(()=>string)]> = [
      [STATUS.ERROR,      this.toErrorFormula],
      [STATUS.CHECKED,    this.toCheckedFormula],
      [STATUS.AVAILABLE,  this.toPreReqsMetFormula],
      [STATUS.UNKNOWN,    this.toUnknownFormula],
      [STATUS.PR_USED,    this.toPRUsedFormula],
      [STATUS.MISSED,     this.toMissedFormula],
      [STATUS.PR_NOT_MET, () => VALUE.TRUE],
    ];
    for (const [status,formulaFunction] of order) {
      const formula:string = formulaFunction.call(this);
      ifsArgs.push(formula,VALUE(status));
    }
    return IFS(...ifsArgs);
  }
}

/**
 * LinkedFormulaNode - Special root node for LINKED prerequisites
 * Item becomes available when any linked prerequisite is available
 */
export class LinkedFormulaNode extends RootNode {
  private readonly linkedChildren: FormulaNode<boolean>[];
  private readonly unlinkedChildren: FormulaNode<boolean>[];
  constructor(unlinkedChildren:FormulaNode<boolean>[], linkedChildren:FormulaNode<boolean>[], translator:IStatusFormulaTranslator,row:row) {
    super([...unlinkedChildren,...linkedChildren],translator,row);
    this.unlinkedChildren = unlinkedChildren;
    this.linkedChildren = linkedChildren;
  }
  isControlled():boolean {
    return true;
  }
  getControlledByInfos():sheetValueInfo[] {
    const itemValues:{[x:number]:sheetValueInfo[]} = this.translator.getColumnValues(COLUMN.ITEM).byRow;
    const preReqInfos:sheetValueInfo[] = [];
    this.getDirectPreReqRows().forEach(row => preReqInfos.push(...itemValues[row]));
    return preReqInfos;
  }
  checkErrors() {
    if (this.isInCircularDependency()) {
      this.addError("LINKED Cannot be in Pre-Req circular dependency");
      return true;
    } else {
      return super.checkErrors();
    }
  }
  toStatusFormula():string {
    const ifsArgs:string[] = [];
    const order: Array<[string,(()=>string)]> = [
      [STATUS.ERROR,      this.toErrorFormula],
      [STATUS.CHECKED,    this.toCheckedFormula],
      [STATUS.PR_USED,    this.toPRUsedFormula],
      [STATUS.MISSED,     this.toMissedFormula],
      [STATUS.AVAILABLE,  this.toPreReqsMetFormula],
      [STATUS.PR_NOT_MET, () => VALUE.TRUE],
    ];
    for (const [status,formulaFunction] of order) {
      const formula:string = formulaFunction.call(this);
      ifsArgs.push(formula,VALUE(status));
    }
    return IFS(...ifsArgs);

  }
  toControlledFormula():string {
    if (this.isInCircularDependency()) {
      this.addError("LINKED Cannot be in Pre-Req circular dependency");
      return VALUE.FALSE;
    }
    return AND(...this.children.map(child => (child as OptionFormulaNode).choiceRow ? CellFormulaParser.getParserForChecklistRow(child.translator,(child as OptionFormulaNode).choiceRow).toPreReqsMetFormula() : child.toPreReqsMetFormula()));
  }
  toPreReqsMetFormula(): string {
    if (this.isInCircularDependency()) {
      this.addError("LINKED Cannot be in Pre-Req circular dependency");
      return VALUE.FALSE;
    }
    const linkedAvailableFormulas = [];
    this.linkedChildren
      .map(linkedChild => linkedChild.getDirectPreReqRows())
      .reduce((rows:Set<number>,childRows) => {
        childRows.forEach(rows.add,rows);
        return rows;
      }, new Set<number>())
      .forEach(row => linkedAvailableFormulas.push(
        AND(
          CellFormulaParser.getParserForChecklistRow(this.translator,row).toPreReqsMetFormula(),
          NOT(this.translator.cellA1(row,COLUMN.CHECK))
        ))
      );
    const preReqIsAvailableFormula = OR(...linkedAvailableFormulas);
    if (this.unlinkedChildren.length > 0) {
      return AND(
        ...this.unlinkedChildren.map(child => child.toPreReqsMetFormula()),
        preReqIsAvailableFormula
      );
    } else {
      return preReqIsAvailableFormula;
    }
  }
}

/**
 * CheckedRootNode - Root node for items that start as CHECKED/INITIAL
 * Always controlled and available
 */
export class CheckedRootNode extends RootNode {
  toControlledFormula() {
    return VALUE.TRUE;
  }
  isControlled() {
    return true;
  }
}
