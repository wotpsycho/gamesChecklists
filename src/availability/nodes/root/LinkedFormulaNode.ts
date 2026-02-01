import type { row } from '../../types';
import type { IStatusFormulaTranslator } from '../../interfaces';
import type { sheetValueInfo } from '../../utilities/parser-utilities';
import { AND, OR, NOT, IFS, VALUE } from '../../utilities/formula-helpers';
import { FormulaNode } from '../base/FormulaNode';
import { BooleanFormulaNode } from '../boolean/BooleanFormulaNode';
import { OptionFormulaNode } from '../special/OptionFormulaNode';
import { CellFormulaParser } from '../../CellFormulaParser';
import { RootNode } from './RootNode';
import { COLUMN, STATUS } from "../../../shared-types";

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
