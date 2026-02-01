import type { row } from '../types';
import type { IStatusFormulaTranslator, NodeArgs, RowCounts } from '../interfaces';
import { COLUMN } from '../../ChecklistApp';
import { OR, AND, NOT, IF, VALUE, MINUS, ADD } from '../formula-helpers';
import * as Formula from '../../Formulas';
import { time, timeEnd } from '../../util';
import { FormulaNode } from './base-nodes';
import { BooleanFormulaNode, BooleanFormulaValueNode, FormulaValueNode, virtualItems } from './boolean-number-nodes';
import { CellFormulaParser } from '../cell-formula-parser';

// Helper for parsing "x3" or "3x" item counts
const numItemsPostfixRegExp = /^ *(.*?) +x(\d+) *$/;
const numItemsPrefixRegExp = /^ *(\d+)x +(.*?) *$/;
const getNumItemInfo = (text: string, _defaultNum: number = undefined): { num?: number; item: string } => {
  let match = text.match(numItemsPrefixRegExp);
  if (match) {
    return { num: Number(match[1]), item: match[2] };
  } else if ((match = text.match(numItemsPostfixRegExp))) {
    return { num: Number(match[2]), item: match[1] };
  } else if (_defaultNum || _defaultNum === 0) {
    return { num: _defaultNum, item: text };
  } else {
    return { item: text };
  }
};

/**
 * UsesFormulaNode - Tracks consumable items that can be used multiple times
 * Example: "USES 3x Potion" - requires 3 potions, tracking total usage across rows
 */
type useInfo = RowCounts
type usesInfo = {[x:string]: useInfo}
const usesInfo:usesInfo = {}; // TODO make checklist-aware?
export class UsesFormulaNode extends BooleanFormulaValueNode {
  static create({ text, translator, row }: NodeArgs) {
    return new UsesFormulaNode(text,translator,row);
  }
  protected constructor(text:string, translator:IStatusFormulaTranslator,row:row) {
    const itemInfo = getNumItemInfo(text);
    super(itemInfo.item,translator,row,itemInfo.num >= 0);
    this.numNeeded = itemInfo.num ?? 1;
    this.useInfo[this.row] = this.numNeeded;
  }

  get useInfo():useInfo {
    if (!usesInfo[this.text]) {
      usesInfo[this.text] = {};
    }
    return usesInfo[this.text];
  }

  toPRUsedFormula():string {
    return OR(
      Formula.LT(
        MINUS(
          this.availableChild.valueInfo.isVirtual ? virtualItems[this.availableChild.text].numNeeded.toString() : this.availableChild.toTotalFormula(),
          this._getPRUsedAmountFormula()
        ),
        VALUE(this.numNeeded)
      ),
      super.toPRUsedFormula()
    );
  }

  private _getPRUsedAmountFormula():string {
    const usedAmoutArguments:string[] = Object.entries(this.useInfo).map(([row,numUsed]) => IF(this.translator.cellA1(row as unknown as number,COLUMN.CHECK),VALUE(numUsed),VALUE.ZERO));
    return ADD(...usedAmoutArguments);
  }

  toPreReqsMetFormula():string {
  // Parent => CHECKED >= NEEDED
  // This   => (CHECKED - USED) >= NEEDED
    const usedAmountFormula:string = this._getPRUsedAmountFormula();
    const checkedFormula:string = this.availableChild.toPreReqsMetFormula();
    const availableAmountFormula:string = MINUS(checkedFormula,usedAmountFormula);
    const numNeededFormula:string = this.neededChild.toPreReqsMetFormula();
    return this.formulaType.generateFormula(availableAmountFormula, numNeededFormula);
  }

  isDirectlyMissable():boolean {
    if (Object.values(usesInfo[this.text]).reduce((total,needed) => total+needed,0) > this.availableChild.getMaxValue()) {
    // if TOTAL_NEEDED > TOTAL_AVAILABLE
      return true;
    } else {
      return super.isDirectlyMissable();
    }
  }
}

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

/**
 * OptionalFormulaNode - Marks prerequisites as optional
 * Example: "OPTIONAL Bonus Item" - this item is not required for completion
 */
export class OptionalFormulaNode extends FormulaNode<boolean> {
  static create({ text, translator, row }: NodeArgs) {
    return new OptionalFormulaNode(text,translator,row);
  }
  protected constructor(text:string, translator:IStatusFormulaTranslator,row:row) {
    super(text,translator,row);
    this.formulaType = NOT;
    this.child = BooleanFormulaNode.create({ text: this.text, translator: this.translator, row: this.row });
  }
  toMissedFormula():string {
    return VALUE.FALSE;
  }
  toRawMissedFormula():string {
    return VALUE.FALSE;
  }
  toPRUsedFormula():string {
    return this.child.toPreReqsMetFormula();
  }
  toUnknownFormula():string {
    return VALUE.FALSE;
  }
  isDirectlyMissable(): boolean {
    return true;
  }
}

const untilRegExp = /^(?:(.*?) +)?UNTIL +(.*?)$/;
export type BlocksArgs = {
  text?:string,
  blocksText?: string,
  untilText?: string,
  translator: IStatusFormulaTranslator;
  row: row,
};

/**
 * BlocksUntilFormulaNode - Blocks other items from becoming available until a condition is met
 * Example: "BLOCKS * UNTIL Chapter 3" - all items blocked until Chapter 3 is complete
 */
export class BlocksUntilFormulaNode extends FormulaValueNode<boolean> {
  static create({ text, blocksText, untilText, translator, row }: BlocksArgs) {
    const match = text?.match(untilRegExp) || [];
    return new BlocksUntilFormulaNode(blocksText || match[1] || "*", untilText || match[2],translator,row);
  }

  protected get parser(): CellFormulaParser {
    return CellFormulaParser.getParserForChecklistRow(this.translator, this.row);
  }

  protected constructor(blocksText:string, untilText:string, translator:IStatusFormulaTranslator, row:row) {
    super(blocksText ?? "*",translator,row);
    if (!untilText) {
      this.addError("Missing UNTIL clause of BLOCKS");
    } else {
      this.child = BooleanFormulaNode.create({ text:untilText, translator: this.translator, row: this.row });
    }
  }
  finalize():BlocksUntilFormulaNode {
    if (this.finalized) return this;
    super.finalize();
    if (!this.hasErrors()) {
      time("blocksFinalize");
      const untilPreReqRows = this.child.getAllPossiblePreReqRows();
      // console.log("finalizeBlock row:%s, text:'%s', child.text: %s, untilPreReqRows:[%s], rows:[%s]", this.row, this.text, this.child.text, [...untilPreReqRows].join(","), [...this.getDirectPreReqRows()].join(","))
      this.valueInfo.rows // All rows matching the BLOCKS clause
        .filter(blockedRow => !untilPreReqRows.has(blockedRow)) // Don't block any preReq of UNTIL
        .forEach(blockedRow =>
          CellFormulaParser.getParserForChecklistRow(this.translator,blockedRow).addChild(
            GeneratedBlockedUntilFormulaNode.create({ blockedText: `$${this.row}`, untilText: this.child.text, translator: this.translator, row: blockedRow, calculated:true }).finalize()
          )
        );
      timeEnd("blocksFinalize");
    }
    this.finalized = true;
    return this;
  }
  getAllPossiblePreReqRows():Set<row>{
    return new Set<row>();
  }
  getDirectPreReqRows():Set<row>{
    return new Set<row>();
  }
  getCircularDependencies():Set<row>{
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
    } else if (!this.child.getAllPossiblePreReqRows().has(this.row)){
      this.addError("UNTIL clause must depend on this Item");
      console.error("UNTIL Clause Depends:: row: %s, childPreReqRows: [%s], child.loop:%s", this.row, [...this.child.getAllPossiblePreReqRows()].join(","),this.child.isInCircularDependency())
      return true;
    } else {
      // console.log("blocksUntil.checkErrors:checking missables")
      const preReqRows = this.parser.getAllPossiblePreReqRows();
      const childPreReqRows = this.child.getAllPossiblePreReqRows();
      const possiblyMissableRows = [...childPreReqRows].filter(row => !preReqRows.has(row) && CellFormulaParser.getParserForChecklistRow(this.translator,row).isDirectlyMissable());
      if (possiblyMissableRows.length) {
        const itemsByRow = this.translator.getColumnValues(COLUMN.ITEM).byRow;
        this.addError("UNTIL clause cannot be missible; remove Pre-Req dependencies on these Items: " +
          possiblyMissableRows.map<string[]>(row =>
            itemsByRow[row].map<string>(valueInfo =>
              `${valueInfo.value} (Row ${row})`
            )
          ).flat().join("\n")
        );
      }
    }
  }
}

export type BlockedArgs = {
  text?: string,
  blockedText?: string,
  untilText?: string,
  translator: IStatusFormulaTranslator;
  row: row,
  calculated?:boolean,
};

/**
 * BlockedUntilFormulaNode - Item is blocked until a condition is met
 * Example: "BLOCKED Boss UNTIL Key" - Boss is unavailable until Key is obtained
 */
export class BlockedUntilFormulaNode extends FormulaNode<boolean> {
  static create({ text, blockedText, untilText, translator, row}: BlockedArgs) {
    const match = text?.match(untilRegExp) || [];
    return new BlockedUntilFormulaNode(blockedText || match[1],untilText || match[2],translator,row);
  }
  constructor(blockedText:string, untilText:string, translator:IStatusFormulaTranslator, row:row) {
    super(`!(${blockedText}) || (${untilText})`,translator,row);
    this.children[0] = BooleanFormulaNode.create({text:blockedText,translator:this.translator,row:this.row});
    this.children[1] = BooleanFormulaNode.create({text:untilText,translator:this.translator,row:this.row});
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

  toPreReqsMetFormula():string {
    return OR(
      NOT(this.blockedChild.toPreReqsMetFormula()),
      this.untilChild.toPreReqsMetFormula()
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

/**
 * GeneratedBlockedUntilFormulaNode - Auto-generated blocking constraint
 * Created by BlocksUntilFormulaNode during finalization
 */
export class GeneratedBlockedUntilFormulaNode extends BlockedUntilFormulaNode {
  static create({ blockedText, untilText, translator, row}: BlockedArgs):GeneratedBlockedUntilFormulaNode {
    return new GeneratedBlockedUntilFormulaNode(blockedText,untilText,translator,row);
  }

  protected get parser(): CellFormulaParser {
    return CellFormulaParser.getParserForChecklistRow(this.translator, this.row);
  }

  constructor(blockedText:string, untilText:string, translator:IStatusFormulaTranslator, row:row) {
    super(blockedText,untilText,translator,row);
  }
  finalize():GeneratedBlockedUntilFormulaNode {
    super.finalize();
    return this;
  }

  toPreReqsMetFormula():string {
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
  getDirectPreReqRows():ReadonlySet<number> {
    return new Set();
  }
}
