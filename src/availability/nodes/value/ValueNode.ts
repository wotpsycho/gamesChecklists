import type { IStatusFormulaTranslator, NodeArgs, RowCounts } from "../../interfaces";
import type { row } from "../../types";
import { COLUMN } from "../../../shared-types";
import { PHASE } from "../../constants";
import { parenRegExp, parentheticalMapping, quoteMapping, quoteRegExp } from "../../utilities";
import { Node } from "../base";
import { ValueNodeTypes, virtualItems } from "../shared";

/**
 * Regular expressions for parsing value node syntax
 */
const ValueNodeTypeRegExps: { [x in ValueNodeTypes]: RegExp } = {
  WITH: /^(?:(?<items>.+) +)?WITH +(?<filteredItems>.+?)$/,
  WITHOUT: /^(?:(?<items>.+) +)?(WITHOUT|UNLESS|EXCEPT) +(?<filteredItems>.+?)$/,
  VALUE: /^(?:(?<column>.*?\S)[!=])?(?<id>.*)$/,
};

/**
 * Unescapes column/id values by removing quotes
 */
const unescapeValue = (text: string): string => {
  if (typeof quoteMapping[text] == "string") {
    return quoteMapping[text];
  }
  let match: RegExpExecArray;
  while ((match = parenRegExp.exec(text))) {
    text = text.replace(match[0], `(${parentheticalMapping[match[0]]})`);
  }
  while ((match = quoteRegExp.exec(text))) {
    const content = quoteMapping[match[0]];
    text = text.replace(match[0], content === "" ? content : `"${content}"`);
  }
  return text?.trim();
};

/**
 * ValueNode handles item lookups and filtering
 * Supports three syntaxes:
 * - VALUE: "ItemName" or "Column!Value"
 * - WITH: "Items WITH Filter" (intersection)
 * - WITHOUT: "Items WITHOUT Filter" (difference)
 */
export class ValueNode extends Node {
  protected type: ValueNodeTypes;
  protected children: ValueNode[];
  readonly column: string;
  readonly id: string;
  protected readonly _rowCounts: RowCounts = {};
  protected _isVirtual: boolean;
  protected _isSelfReferential: boolean;

  protected get itemsChild(): ValueNode {
    return this.children[0];
  }

  protected set itemsChild(child: ValueNode) {
    this.checkPhase(PHASE.BUILDING, PHASE.FINALIZING);
    this.children[0] = child;
  }

  protected get filterChild(): ValueNode {
    return this.children[1];
  }

  protected set filterChild(child: ValueNode) {
    this.checkPhase(PHASE.BUILDING, PHASE.FINALIZING);
    this.children[1] = child;
  }

  get numPossible(): number {
    return (
      (this._isVirtual && virtualItems[this.text].numPossible)
      || Object.values(this._rowCounts).reduce((total, count) => total + count, 0)
    );
  }

  get rows(): number[] {
    return Object.keys(this._rowCounts)
      .map(row => Number(row))
      .sort((a, b) => a - b);
  }

  get isVirtual() {
    return this._isVirtual;
  }

  get isSelfReferential() {
    return this._isSelfReferential;
  }

  get rowCounts(): Readonly<RowCounts> {
    return { ...this._rowCounts };
  }

  static create({ text, translator, row, _implicitPrefix = false }: NodeArgs & { _implicitPrefix?: boolean }) {
    return new ValueNode(text, translator, row, _implicitPrefix);
  }

  protected constructor(text: string, translator: IStatusFormulaTranslator, row: row, _implicitPrefix: boolean = false) {
    super(text, translator, row);
    let { items, filteredItems } = ValueNodeTypeRegExps.WITH.exec(this.text)?.groups || {};
    if (items || filteredItems) {
      this.type = ValueNodeTypes.WITH;
      this.itemsChild = new ValueNode(items ?? "*", this.translator, this.row, _implicitPrefix);
      this.filterChild = new ValueNode(filteredItems, this.translator, this.row);
      [this.column, this.id, this._rowCounts] = [this.itemsChild.column, this.itemsChild.id, { ...this.itemsChild._rowCounts }];
      this.rows.forEach((row) => {
        if (!this.filterChild._rowCounts[row]) {
          delete this._rowCounts[row];
        }
      });
    } else if (
      (({ items, filteredItems } = ValueNodeTypeRegExps.WITHOUT.exec(this.text)?.groups || {}), items || filteredItems)
    ) {
      this.type = ValueNodeTypes.WITHOUT;
      this.itemsChild = new ValueNode(items ?? "*", this.translator, this.row, _implicitPrefix);
      this.filterChild = new ValueNode(filteredItems, this.translator, this.row);
      [this.column, this.id, this._rowCounts] = [this.itemsChild.column, this.itemsChild.id, { ...this.itemsChild._rowCounts }];
      this.rows.forEach((row) => {
        if (this.filterChild._rowCounts[row]) {
          delete this._rowCounts[row];
        }
      });
    } else {
      this.type = ValueNodeTypes.VALUE;
      let { column, id } = ValueNodeTypeRegExps.VALUE.exec(this.text).groups;
      column = column && unescapeValue(column);
      id = unescapeValue(id);
      this._rowCounts = this.translator.getRowCounts(
        column || COLUMN.ITEM,
        id,
        _implicitPrefix && (!column || column === COLUMN.ITEM),
      );
      if (column && this.rows.length === 0) {
        // Assume ! was part Item ID
        this._rowCounts = this.translator.getRowCounts(COLUMN.ITEM, unescapeValue(this.text), _implicitPrefix);
        if (this.rows.length) {
          column = COLUMN.ITEM;
          id = unescapeValue(this.text);
        }
      }
      this.column = column || COLUMN.ITEM;
      this.id = id;
    }
    if (this._rowCounts && this._rowCounts[this.row]) {
      delete this._rowCounts[this.row];
      this._isSelfReferential = true;
    }
    // if (row === 200) console.log("vn.con: text:%s, rowCounts:%s",text,Object.keys(this._rowCounts));
  }

  finalize(): ValueNode {
    if (this.finalized)
      return this;
    super.finalize();
    if (!this.rows.length && virtualItems[this.text]) {
      Object.keys(virtualItems[this.text].rowCounts).forEach(
        row => (this._rowCounts[row] = virtualItems[this.text].rowCounts[row]),
      );
      this._isVirtual = true;
    }
    this.finalized = true;
    return this;
  }

  toString(): string {
    // Remove the outer "" if present
    return super.toString().replace(/^"(([^"]|\\")*)"$/, "$1");
  }

  checkErrors(): boolean {
    if (super.checkErrors()) {
      return true;
    } else if (this.rows.length === 0) {
      switch (this.type) {
        case ValueNodeTypes.WITH:
          this.addError(`Could not find any of "${this.itemsChild.toString()}" WITH "${this.filterChild.toString()}"`);
          break;
        case ValueNodeTypes.WITHOUT:
          this.addError(
            `Could not find any of "${this.itemsChild.toString()}" WITHOUT "${this.filterChild.toString()}"`,
          );
          break;
        case ValueNodeTypes.VALUE:
          if (this.column !== COLUMN.ITEM) {
            if (!this.translator.checklist.hasColumn(this.column)) {
              this.addError(`Could not find column "${this.column}"`);
            } else {
              this.addError(`Could not find "${this.id}" in "${this.column}" column`);
            }
          } else {
            this.addError(`Could not find "${this.id}"`);
          }
          break;
      }
      return true;
    } else if (this.type === ValueNodeTypes.WITHOUT && this.rows.length === this.itemsChild.rows.length) {
      this.addError(
        `There are not any of "${this.itemsChild.toString()}" WITH "${this.filterChild.toString()}" (WITHOUT is unnecessary)`,
      );
      return true;
    }
  }

  getDirectPreReqInfos() {
    if (this.children.length) {
      return super.getDirectPreReqInfos();
    } else {
      return {
        [this.toString()]: this.rows,
      };
    }
  }
}
