import type { row, FormulaHelper } from '../types';
import type { IStatusFormulaTranslator } from '../interfaces';
import { PHASE } from '../constants';
import {
  parentheticalMapping,
  parenRegExp,
  quoteRegExp,
  quoteMapping,
} from '../parser-utilities';
import { VALUE } from '../formula-helpers';

/**
 * Abstract base class for all formula AST nodes.
 * Represents a parsed prerequisite expression with error checking,
 * circular dependency detection, and formula generation capabilities.
 */
export abstract class Node {
  protected readonly errors: Set<string> = new Set<string>();
  protected readonly children: Node[] = [];
  readonly text: string;
  readonly row: row;
  readonly translator: IStatusFormulaTranslator;

  protected constructor(text: string, translator: IStatusFormulaTranslator, row: row) {
    this.translator = translator;
    this.checkPhase(PHASE.BUILDING, PHASE.FINALIZING);
    this.text = text?.toString()?.trim();
    this.row = row;

    let match: RegExpMatchArray;
    if (parentheticalMapping[this.text]) {
      this.text = parentheticalMapping[this.text];
    } else if ((match = this.text.match(/^\(([^)(]*)\)$/))) {
      this.text = this.text.replace(match[0], match[1]);
    }
  }

  protected finalized = false;
  finalize(): Node {
    if (this.finalized) return this;
    this.checkPhase(PHASE.FINALIZING);
    this.children.forEach((child) => child.finalize());
    this.finalized = true;
    return this;
  }

  protected isPhase(phase: PHASE) {
    return this.translator.phase == phase;
  }

  protected checkPhase(...phases: PHASE[]) {
    if (
      !phases.reduce(
        (isPhase, requiredPhase) => isPhase || this.isPhase(requiredPhase),
        false
      )
    ) {
      throw new Error(
        `Invalid operation: Requires PHASE "${phases.join('"|"')}" but is "${
          this.translator.phase
        }" (Row: ${this.row}, Condition: ${this.text})`
      );
    }
  }

  protected get child(): Node {
    return this.children.length == 1 ? this.children[0] : undefined;
  }

  protected set child(child: Node) {
    this.checkPhase(PHASE.BUILDING, PHASE.FINALIZING);
    if (this.children.length > 1)
      throw new Error('Cannot set child for multi-child node');
    this.children[0] = child;
  }

  addError(message: string): void {
    this.errors.add(message);
  }

  addErrors(errors: Iterable<string>): void {
    for (const message of errors) {
      this.addError(message);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  checkErrors(): boolean {
    return false;
  }

  getErrors(): Set<string> {
    this.checkErrors();
    this.children.forEach((child) => this.addErrors(child.getErrors()));
    return this.errors;
  }

  hasErrors(): boolean {
    return this.getErrors().size > 0;
  }

  isDirectlyMissable(): boolean {
    return this.children.reduce(
      (directlyMissable, child) =>
        directlyMissable || child.isDirectlyMissable(),
      false
    );
  }

  protected _allPossiblePreReqRows: ReadonlySet<row>;
  getAllPossiblePreReqRows(): ReadonlySet<row> {
    if (!this._allPossiblePreReqRows) {
      if (this.isInCircularDependency()) {
        this._allPossiblePreReqRows = this.getCircularDependencies();
      } else {
        const allPossiblePreReqs: Set<row> = new Set<row>();
        this.children.forEach((child) =>
          child
            .getAllPossiblePreReqRows()
            .forEach(allPossiblePreReqs.add, allPossiblePreReqs)
        );
        this._allPossiblePreReqRows = allPossiblePreReqs;
      }
    }
    /*if (this.isInCircularDependency()) {
      console.warn("Circular Dependency:: type:%s, row:%s, text:%s, circular:[%s], this:%s", this.constructor.name, this.row, this.text, [...this.getCircularDependencies()].join(","),this);
    }*/
    return this._allPossiblePreReqRows;
  }

  getDirectPreReqInfos(): { [x: string]: row[] } {
    return this.children.reduce(
      (preReqInfos, child) => Object.assign(child.getDirectPreReqInfos(), preReqInfos),
      {}
    );
  }

  getDirectPreReqRows(): ReadonlySet<row> {
    const preReqRows = new Set<row>();
    this.children.forEach((child) =>
      child.getDirectPreReqRows().forEach(preReqRows.add, preReqRows)
    );
    return preReqRows;
  }

  isInCircularDependency(): boolean {
    return this.getCircularDependencies().has(this.row);
  }

  protected _circularDependencies: ReadonlySet<row>;
  protected _lockCircular: boolean;
  protected _isCircular: boolean;
  getCircularDependencies(previous: ReadonlyArray<row> = []): ReadonlySet<row> {
    if (this._circularDependencies) return this._circularDependencies;
    const circularDependencies: Set<row> = new Set();
    if (this._lockCircular) {
      previous
        .slice(previous.indexOf(this.row))
        .forEach(circularDependencies.add, circularDependencies);
    } else {
      const newChain: row[] = [...previous, this.row];
      this._lockCircular = true;
      this.children.forEach((child) => {
        child
          .getCircularDependencies(newChain)
          .forEach(circularDependencies.add, circularDependencies);
      });
      this._lockCircular = false;
    }
    if (circularDependencies.has(this.row)) this._isCircular = true;
    this._circularDependencies = circularDependencies;
    return this._circularDependencies;
  }

  toString(): string {
    let unescaped = this.text;
    let match: RegExpMatchArray;
    while ((match = unescaped.match(parenRegExp))) {
      unescaped = unescaped.replace(
        match[0],
        `(${parentheticalMapping[match[0]]})`
      );
    }
    while ((match = unescaped.match(quoteRegExp))) {
      unescaped = unescaped.replace(match[0], `"${quoteMapping[match[0]]}"`);
    }
    return unescaped;
  }
}

/**
 * Abstract base class for formula nodes that can generate various formula types.
 * Extends Node with formula generation capabilities for prerequisite status checking.
 */
export abstract class FormulaNode<T extends number | boolean | unknown> extends Node {
  protected readonly children: FormulaNode<unknown>[];
  protected formulaType: FormulaHelper;
  protected value: T;

  hasValue(): boolean {
    return typeof this.value !== 'undefined';
  }

  updateValue(value: T) {
    this.checkPhase(PHASE.BUILDING, PHASE.FINALIZING);
    if (!this.hasValue()) {
      throw new Error('Cannot update value on a non-value node');
    }
    this.value = value;
  }

  protected get child(): FormulaNode<unknown> {
    return super.child as FormulaNode<unknown>;
  }

  protected set child(child: FormulaNode<unknown>) {
    super.child = child;
  }

  toErrorFormula(): string {
    return VALUE(this.hasErrors());
  }

  toPreReqsMetFormula(): string {
    let formula: string;
    if (this.hasValue()) {
      return VALUE(this.value as string);
    } else if (this.formulaType) {
      formula = this.formulaType.generateFormula(
        ...this.children.map((child) => child.toPreReqsMetFormula())
      );
    } else if (this.child) {
      formula = this.child.toPreReqsMetFormula();
    } else {
      this.addError(`Could not determine formula for "${this.text}"`);
    }
    return formula;
  }

  abstract toPRUsedFormula(): string;

  abstract toRawMissedFormula(): string;

  abstract toMissedFormula(): string;

  abstract toUnknownFormula(): string;
}
