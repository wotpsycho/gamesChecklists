import type { IStatusFormulaTranslator } from "./interfaces";
// Import specialized node classes from nodes module

import type { FormulaNode } from "./nodes/base/FormulaNode";

import type { row } from "./types";
import type { sheetValueInfo,
} from "./utilities/parser-utilities";
import { COLUMN } from "../shared-types";
import { PHASE, SPECIAL_PREFIXES } from "./constants";
import { BlockedUntilFormulaNode } from "./nodes/blocking/BlockedUntilFormulaNode";
import { BlocksUntilFormulaNode } from "./nodes/blocking/BlocksUntilFormulaNode";
import { BooleanFormulaNode } from "./nodes/boolean/BooleanFormulaNode";
import { MissedFormulaNode } from "./nodes/constraint/MissedFormulaNode";
import { OptionalFormulaNode } from "./nodes/constraint/OptionalFormulaNode";
import { CheckedRootNode } from "./nodes/root/CheckedRootNode";
import { LinkedFormulaNode } from "./nodes/root/LinkedFormulaNode";
import { RootNode } from "./nodes/root/RootNode";
import { OptionFormulaNode } from "./nodes/special/OptionFormulaNode";
import { UsesFormulaNode } from "./nodes/special/UsesFormulaNode";
import {
  getParenPlaceholder,
  getQuotePlaceholder,
  parentheticalMapping,
  PREFIX_REG_EXP,
  quoteMapping,
} from "./utilities/parser-utilities";

/**
 * CellFormulaParser parses prerequisite text and creates formula node trees
 * Handles special prefixes: OPTION, MISSED, USES, BLOCKS, PERSIST, etc.
 * Singleton pattern: one parser per checklist row
 */
export class CellFormulaParser {
  private static readonly parsers: { [x: number]: CellFormulaParser } = {};
  static getParserForChecklistRow(translator: IStatusFormulaTranslator, row: row, _defaultValue: string = undefined): CellFormulaParser {
    const key: string = `${translator.checklist.id}:${row}`;
    if (!this.parsers[key]) {
      this.parsers[key] = new CellFormulaParser(translator, row, _defaultValue);
    }
    return this.parsers[key];
  }

  private readonly row: row;
  private readonly rootNode: RootNode;
  readonly translator: IStatusFormulaTranslator;
  readonly preReqText: string;
  private constructor(translator: IStatusFormulaTranslator, row: row, cellValue = translator.checklist.getValue(row, COLUMN.PRE_REQS)) {
    this.translator = translator;
    this.row = row;
    this.preReqText = cellValue.toString();

    const lines: string[] = [];
    this.preReqText.split(/[\n;]/).forEach((line: string, i: number) => {
      if (i > 0 && line.indexOf("...") === 0) {
        lines[lines.length - 1] += line.substring(3);
      } else {
        lines.push(line);
      }
    });

    const children: FormulaNode<boolean>[] = [];
    const linkedChildren: FormulaNode<boolean>[] = [];
    let linkedFlag: boolean = false;
    let checkedFlag: boolean = false;
    let persistFlag: boolean = false;
    for (let j: number = 0; j < lines.length; j++) {
      let line: string = lines[j].trim();
      let isLinked = linkedFlag;
      if (!line)
        continue;

      if (line.trim().toUpperCase() === SPECIAL_PREFIXES.LINKED.toUpperCase()) {
        linkedFlag = true;
        continue;
      }
      if (line.trim().toUpperCase() === SPECIAL_PREFIXES.CHECKED || line.trim().toUpperCase() === SPECIAL_PREFIXES.INITIAL) {
        checkedFlag = true;
        continue;
      }
      if (line.trim().toUpperCase() === SPECIAL_PREFIXES.PERSIST) {
        persistFlag = true;
        continue;
      }
      line = line.replace(/"(([^"]|\\")*)"/g, (_match, text: string) => {
        const placeholder: string = getQuotePlaceholder();
        quoteMapping[placeholder] = text;
        return placeholder;
      });

      let match: RegExpMatchArray;
      const parenMatcher: RegExp = /\((([^()]|\\\(|\\\))*)\)/;
      // eslint-disable-next-line no-cond-assign
      while (match = line.match(parenMatcher)) {
        const placeholder: string = getParenPlaceholder();
        parentheticalMapping[placeholder] = match[1];
        line = line.replace(parenMatcher, placeholder);
      }
      let childFormulaNode: FormulaNode<boolean>;
      const prefixCheck: RegExpMatchArray = line.match(PREFIX_REG_EXP);
      // specific Prefix node, or default to boolean node
      if (prefixCheck) {
        const text: string = prefixCheck[2].trim();
        switch (prefixCheck[1].toUpperCase()) {
          case SPECIAL_PREFIXES.USES.toUpperCase():
            childFormulaNode = UsesFormulaNode.create({ text, translator: this.translator, row });
            break;
          case SPECIAL_PREFIXES.MISSED.toUpperCase():
            childFormulaNode = MissedFormulaNode.create({ text, translator: this.translator, row });
            break;
          case SPECIAL_PREFIXES.CHOICE.toUpperCase():
          case SPECIAL_PREFIXES.OPTION.toUpperCase():
            childFormulaNode = OptionFormulaNode.create({ text, translator: this.translator, row });
            break;
          case SPECIAL_PREFIXES.OPTIONAL.toUpperCase():
            childFormulaNode = OptionalFormulaNode.create({ text, translator: this.translator, row });
            break;
          case SPECIAL_PREFIXES.BLOCKS.toUpperCase():
            childFormulaNode = BlocksUntilFormulaNode.create({ text, translator: this.translator, row });
            break;
          case SPECIAL_PREFIXES.BLOCKED.toUpperCase():
            childFormulaNode = BlockedUntilFormulaNode.create({ text, translator: this.translator, row });
            break;
          case SPECIAL_PREFIXES.LINKED.toUpperCase():
            isLinked = true;
            childFormulaNode = BooleanFormulaNode.create({ text, translator: this.translator, row });
            break;
        }
      } else {
        childFormulaNode = BooleanFormulaNode.create({ text: line, translator: this.translator, row });
      }
      if (isLinked)
        linkedChildren.push(childFormulaNode);
      else children.push(childFormulaNode);
    }
    if (checkedFlag) {
      this.rootNode = new CheckedRootNode(children, this.translator, row);
    } else if (linkedChildren.length) {
      this.rootNode = new LinkedFormulaNode(children, linkedChildren, this.translator, row);
    } else {
      this.rootNode = new RootNode(children, this.translator, row);
    }
    this.rootNode.persist = persistFlag;
  }

  /**
   * Mark as finalized so that no further changes are allowed
   */
  private finalized = false;
  finalize(): CellFormulaParser {
    if (this.finalized)
      return this;
    this.checkPhase(PHASE.FINALIZING);
    this.rootNode.finalize();
    this.finalized = true;
    return this;
  }

  private isPhase(phase: PHASE) {
    return this.translator.phase === phase;
  }

  private checkPhase(...phases: PHASE[]) {
    if (!phases.reduce((isPhase, requiredPhase) => isPhase || this.isPhase(requiredPhase), false)) {
      throw new Error(`Invalid operation: Requires PHASE "${phases.join("\"|\"")}" but is "${this.translator.phase}" (Row ${this.row})`);
    }
  }

  toFormula(): string {
    this.checkPhase(PHASE.FINALIZED);
    return this.toStatusFormula();
  }

  hasErrors(): boolean {
    return this.getErrors().size > 0;
  }

  getErrors(): ReadonlySet<string> {
    return this.rootNode.getErrors();
  }

  getAllPossiblePreReqs(): string[] {
    this.checkPhase(PHASE.FINALIZING, PHASE.FINALIZED);
    this.finalize();
    const itemValues: { [x: number]: sheetValueInfo[] } = this.translator.getColumnValues(COLUMN.ITEM).byRow;
    return [...this.getAllPossiblePreReqRows()].map(row => itemValues[row].map(info => info.value)).flat();
  }

  getAllDirectlyMissablePreReqs(): string[] {
    this.checkPhase(PHASE.FINALIZING, PHASE.FINALIZED);
    this.finalize();
    const allMissableRows: row[] = [...this.getAllPossiblePreReqRows()].filter(row => this.translator.getParserForRow(row).isDirectlyMissable());
    const itemValues: { [x: number]: sheetValueInfo[] } = this.translator.getColumnValues(COLUMN.ITEM).byRow;
    return [...allMissableRows].map(row => itemValues[row].map(info => info.value)).flat().filter(value => value);
  }

  getDirectPreReqInfos() {
    this.checkPhase(PHASE.FINALIZED);
    return this.rootNode.getDirectPreReqInfos();
  }

  getDirectPreReqRows(): ReadonlySet<number> {
    this.checkPhase(PHASE.FINALIZING, PHASE.FINALIZED);
    this.finalize();
    return this.rootNode.getDirectPreReqRows();
  }

  isControlled(): boolean {
    this.checkPhase(PHASE.FINALIZED);
    return this.rootNode.isControlled();
  }

  getControlledByInfos(): sheetValueInfo[] {
    this.checkPhase(PHASE.FINALIZED);
    return this.rootNode.getControlledByInfos();
  }

  toControlledFormula(): string {
    this.checkPhase(PHASE.FINALIZED);
    return this.rootNode.toControlledFormula();
  }

  addChild(child: FormulaNode<boolean>): void {
    this.checkPhase(PHASE.FINALIZING);
    this.rootNode.addChild(child);
  }

  addOption(row: row) {
    this.checkPhase(PHASE.FINALIZING);
    this.rootNode.addOption(row);
  }

  getOptions(): row[] {
    this.checkPhase(PHASE.FINALIZED);
    return this.rootNode.getOptions();
  }

  getAllPossiblePreReqRows(): ReadonlySet<row> {
    this.checkPhase(PHASE.FINALIZING, PHASE.FINALIZED);
    this.finalize();
    return this.rootNode.getAllPossiblePreReqRows();
  }

  isDirectlyMissable(): boolean {
    this.checkPhase(PHASE.FINALIZING, PHASE.FINALIZED);
    this.finalize();
    return this.rootNode.isDirectlyMissable();
  }

  isInCircularDependency(): boolean {
    this.checkPhase(PHASE.FINALIZING, PHASE.FINALIZED);
    this.finalize();
    return this.getCircularDependencies().has(this.row);
  }

  private _lockCircular: boolean;
  private _circularDependencies: ReadonlySet<row>;
  private _isCircular: boolean;
  getCircularDependencies(previous = []): ReadonlySet<row> {
    this.checkPhase(PHASE.FINALIZING, PHASE.FINALIZED);
    this.finalize();
    if (this._circularDependencies)
      return this._circularDependencies;
    const circularDependencies: Set<row> = new Set<row>();
    if (this._lockCircular) {
      previous.slice(previous.indexOf(this.row)).forEach(circularDependencies.add, circularDependencies);
    } else {
      previous.push(this.row);
      this._lockCircular = true;
      this.rootNode.getCircularDependencies([...previous]).forEach(circularDependencies.add, circularDependencies);
      this._lockCircular = false;
    }
    if (circularDependencies.has(this.row))
      this._isCircular = true;
    this._circularDependencies = circularDependencies;
    return this._circularDependencies;
  }

  toRawPreReqsMetFormula(): string {
    this.checkPhase(PHASE.FINALIZED);
    return this.rootNode.toRawPreReqsMetFormula();
  }

  toPreReqsMetFormula() {
    this.checkPhase(PHASE.FINALIZED);
    return this.rootNode.toPreReqsMetFormula();
  }

  toRawMissedFormula() {
    this.checkPhase(PHASE.FINALIZED);
    return this.rootNode.toRawMissedFormula();
  }

  toMissedFormula() {
    this.checkPhase(PHASE.FINALIZED);
    return this.rootNode.toMissedFormula();
  }

  toPRUsedFormula() {
    this.checkPhase(PHASE.FINALIZED);
    return this.rootNode.toPRUsedFormula();
  }

  toUnknownFormula() {
    this.checkPhase(PHASE.FINALIZED);
    return this.rootNode.toUnknownFormula();
  }

  toErrorFormula() {
    this.checkPhase(PHASE.FINALIZED);
    return this.rootNode.toErrorFormula();
  }

  toStatusFormula() {
    this.checkPhase(PHASE.FINALIZED);
    return this.rootNode.toStatusFormula();
  }
}
