import type { row, column, FormulaHelper } from '../types';
import type { IStatusFormulaTranslator, RowCounts, NodeArgs } from '../interfaces';
import { Node, FormulaNode } from './base-nodes';
import { PHASE, USAGES, SPECIAL_PREFIXES } from '../constants';
import {
  OR,
  AND,
  NOT,
  EQ,
  NE,
  GT,
  GTE,
  X_ITEMS,
  ADD,
  MINUS,
  MULT,
  DIV,
  VALUE,
  COUNTIF,
  formulaTypeToString,
} from '../formula-helpers';
import * as Formula from '../../Formulas';
import { STATUS, COLUMN } from '../../ChecklistApp';
// Import CellFormulaParser from local module (circular dependency resolved at runtime)
import { CellFormulaParser } from '../cell-formula-parser';

/**
 * Interface for number nodes with min/max value computation
 */
export interface NumberNode extends FormulaNode<number> {
  getMinValue: () => number;
  getMaxValue: () => number;
  toFormulaByStatus: (...status: string[]) => string;
  toFormulaByNotStatus: (...status: string[]) => string;
}

/**
 * Boolean formula node handling boolean operators (AND, OR, NOT)
 * and delegating to comparison or value nodes
 */
export class BooleanFormulaNode extends FormulaNode<boolean> {
  static create({ text, translator, row }: NodeArgs): BooleanFormulaNode {
    return new BooleanFormulaNode(text, translator, row);
  }
  protected readonly children: FormulaNode<boolean>[];
  protected constructor(text: string, translator: IStatusFormulaTranslator, row: row) {
    super(text, translator, row);
    if (this.text) {
      for (const booleanFormulaTranslationHelper of [OR, AND, NOT]) {
        // Recursively handle boolean operators
        if (booleanFormulaTranslationHelper.identify(this.text)) {
          this.formulaType = booleanFormulaTranslationHelper;
          const operands: string[] = booleanFormulaTranslationHelper.parseOperands(this.text);
          this.children.push(
            ...operands.map((operand) =>
              BooleanFormulaNode.create({ text: operand, translator: this.translator, row: this.row })
            )
          );
          return;
        }
      }
      for (const comparisonFormulaTranslationHelper of [EQ, NE, GTE, GT, X_ITEMS]) {
        // Recursively handle comparison operators
        if (comparisonFormulaTranslationHelper.identify(this.text)) {
          this.child = ComparisonFormulaNode.create({
            text: this.text,
            translator: this.translator,
            row: this.row,
            formulaType: comparisonFormulaTranslationHelper,
          });
          return;
        }
      }
      this.child = BooleanFormulaValueNode.create({ text: this.text, translator: this.translator, row: this.row });
    } else {
      this.value = true;
    }
  }

  toPRUsedFormula(): string {
    if (this.hasValue()) return VALUE.FALSE;
    if (this.isInCircularDependency()) return VALUE.FALSE;
    if (!this.formulaType) return this.child.toPRUsedFormula();
    switch (this.formulaType) {
      case AND: {
        return OR(
          ...this.children.map((child) => AND(NOT(child.toRawMissedFormula()), child.toPRUsedFormula()))
        );
      }
      case OR: {
        return AND(
          ...this.children.map((child) => AND(NOT(child.toRawMissedFormula()), child.toPRUsedFormula()))
        );
      }
      case NOT: {
        return this.child.toPRUsedFormula(); // TODO ???
      }
    }
  }

  toRawMissedFormula(): string {
    if (this.hasValue()) return VALUE.FALSE;
    if (this.isInCircularDependency()) return VALUE.FALSE;
    if (!this.formulaType) return this.child.toRawMissedFormula();
    switch (this.formulaType) {
      case AND: {
        return OR(...this.children.map((child) => child.toRawMissedFormula()));
      }
      case OR: {
        return AND(...this.children.map((child) => child.toRawMissedFormula()));
      }
      case NOT: {
        return this.child.toRawMissedFormula(); // TODO ???
      }
    }
  }

  toMissedFormula(): string {
    if (this.hasValue()) return VALUE.FALSE;
    if (this.isInCircularDependency()) return VALUE.FALSE;
    if (!this.formulaType) return this.child.toMissedFormula();
    switch (this.formulaType) {
      case AND: {
        return OR(...this.children.map((child) => child.toMissedFormula()));
      }
      case OR: {
        return AND(...this.children.map((child) => child.toMissedFormula()));
      }
      case NOT: {
        return this.child.toMissedFormula(); // TODO ???
      }
    }
  }

  toUnknownFormula(): string {
    if (this.hasValue()) return VALUE.FALSE;
    if (this.isInCircularDependency()) return VALUE.TRUE;
    if (!this.formulaType) return this.child.toUnknownFormula();
    switch (this.formulaType) {
      case AND: {
        // For AND: unknown if none are raw missed AND at least one is unknown
        return AND(
          ...this.children.map((child) => NOT(child.toRawMissedFormula())),
          OR(...this.children.map((child) => child.toUnknownFormula()))
        );
      }
      case OR: {
        // For OR: at least one unknown AND each child is either unknown or missed
        return AND(
          OR(...this.children.map((child) => child.toUnknownFormula())),
          ...this.children.map((child) => OR(child.toUnknownFormula(), child.toMissedFormula()))
        );
      }
      case NOT: {
        return this.child.toUnknownFormula(); // TODO ???
      }
    }
  }
}

/**
 * Comparison formula node for comparing two number nodes
 * Handles ==, !=, >, >=, and X_ITEMS operators
 */
export class ComparisonFormulaNode extends FormulaNode<boolean> {
  static create({
    text,
    translator,
    row,
    formulaType,
  }: NodeArgs & { formulaType: FormulaHelper }): ComparisonFormulaNode {
    return new ComparisonFormulaNode(text, translator, row, formulaType);
  }
  protected children: NumberNode[];
  protected constructor(
    text: string,
    translator: IStatusFormulaTranslator,
    row: row,
    formulaType: FormulaHelper
  ) {
    super(text, translator, row);

    this.formulaType = formulaType;
    const operands: string[] = formulaType.parseOperands(this.text);
    this.children.push(
      ...operands.map((operand) =>
        NumberFormulaNode.create({
          text: operand,
          translator: this.translator,
          row: this.row,
          _implicitPrefix: formulaType == X_ITEMS,
        })
      )
    );
  }

  checkErrors(): boolean {
    let isError: boolean;
    const lMin: number = this.children[0].getMinValue();
    const lMax: number = this.children[0].getMaxValue();
    const rMin: number = this.children[1].getMinValue();
    const rMax: number = this.children[1].getMaxValue();
    switch (this.formulaType) {
      case EQ:
        isError = lMax < rMin || lMin > rMax;
        break;
      case NE: {
        isError = lMax == lMin && lMax == rMin && lMax == rMax;
        break;
      }
      case GTE:
      case X_ITEMS:
        isError = lMax < rMin;
        break;
      case GT:
        isError = lMax <= rMin;
        break;
    }
    if (isError) {
      const lRange = lMin == lMax ? lMin : `[${lMin}..${lMax}]`;
      const rRange = rMin == rMax ? rMin : `[${rMin}..${rMax}]`;
      this.addError(
        `Formula cannot be satisfied: "${this.text} ${this.formulaType.name}" cannot be satisfied: ${lRange} cannot be ${formulaTypeToString(this.formulaType)} ${rRange}`
      );
      return true;
    }
  }
  toPRUsedFormula(): string {
    return this._toFormulaByNotStatus(this.toUnknownFormula.name, STATUS.PR_USED);
  }
  toRawMissedFormula(): string {
    return this._toFormulaByNotStatus(this.toUnknownFormula.name, STATUS.MISSED);
  }
  toMissedFormula(): string {
    return this._toFormulaByNotStatus(this.toUnknownFormula.name, [STATUS.MISSED, STATUS.PR_USED]);
  }
  toUnknownFormula(): string {
    if (this.isInCircularDependency()) return VALUE.TRUE;
    // ComparisonFormulaNode doesn't add MISSED check - that's handled by BooleanFormulaNode
    return this._toFormulaByNotStatus(this.toUnknownFormula.name, STATUS.UNKNOWN);
  }
  private _toFormulaByNotStatus(
    formulaTypeName: string,
    notStatusesForMax: STATUS | STATUS[],
    statusesForMin: STATUS | STATUS[] = STATUS.CHECKED
  ): string {
    if (this.hasErrors()) return VALUE.FALSE;
    if (this.isInCircularDependency()) return VALUE.FALSE;
    if (this.hasValue()) return VALUE(this.value);
    if (!this.formulaType) return this.child[formulaTypeName]();

    if (notStatusesForMax && !Array.isArray(notStatusesForMax)) notStatusesForMax = [notStatusesForMax];
    const minStatuses: string[] =
      statusesForMin && !Array.isArray(statusesForMin)
        ? [statusesForMin]
        : ((statusesForMin as string[]) || []);
    const maxNotStatuses: string[] =
      notStatusesForMax && !Array.isArray(notStatusesForMax)
        ? [notStatusesForMax]
        : ((notStatusesForMax as string[]) || []);
    switch (this.formulaType) {
      case GT: {
        return Formula.LTE(
          this.children[0].toFormulaByNotStatus(...maxNotStatuses),
          this.children[1].toFormulaByStatus(...minStatuses)
        );
      }
      case GTE:
      case X_ITEMS: {
        return Formula.LT(
          this.children[0].toFormulaByNotStatus(...maxNotStatuses),
          this.children[1].toFormulaByStatus(...minStatuses)
        );
      }
      case EQ: {
        return OR(
          Formula.LT(
            this.children[0].toFormulaByNotStatus(...maxNotStatuses),
            this.children[1].toFormulaByStatus(...minStatuses)
          ),
          GT(
            this.children[0].toFormulaByStatus(...minStatuses),
            this.children[1].toFormulaByNotStatus(...maxNotStatuses)
          )
        );
      }
      case NE: {
        return AND(
          EQ(
            this.children[0].toFormulaByNotStatus(...maxNotStatuses),
            this.children[0].toFormulaByStatus(...minStatuses)
          ),
          EQ(
            this.children[0].toFormulaByNotStatus(...maxNotStatuses),
            this.children[1].toFormulaByStatus(...minStatuses)
          ),
          EQ(
            this.children[0].toFormulaByStatus(...minStatuses),
            this.children[1].toFormulaByNotStatus(...maxNotStatuses)
          )
        );
      }
    }
  }
}

/**
 * Number formula node handling arithmetic operators (+, -, *, /)
 * and delegating to value nodes for actual values
 */
export class NumberFormulaNode extends FormulaNode<number> implements NumberNode {
  static create({
    text,
    translator,
    row,
    _implicitPrefix = false,
  }: NodeArgs & { _implicitPrefix?: boolean }): NumberFormulaNode {
    return new NumberFormulaNode(text, translator, row, _implicitPrefix);
  }
  protected readonly children: NumberNode[];
  protected constructor(text: string, translator: IStatusFormulaTranslator, row: row, _implicitPrefix) {
    super(text, translator, row);

    for (const arithmeticFormulaTranslationHelper of [ADD, MINUS, MULT, DIV]) {
      // Recursively handle comparison operators
      if (arithmeticFormulaTranslationHelper.identify(this.text)) {
        this.formulaType = arithmeticFormulaTranslationHelper;
        const operands: string[] = arithmeticFormulaTranslationHelper.parseOperands(this.text);
        this.children.push(
          ...operands.map((operand) =>
            NumberFormulaNode.create({
              text: operand,
              translator: this.translator,
              row: this.row,
              _implicitPrefix,
            })
          )
        );
        return;
      }
    }
    this.child = NumberFormulaValueNode.create({
      text,
      translator: this.translator,
      row: this.row,
      _implicitPrefix,
    });
  }

  protected get child(): NumberNode {
    return super.child as NumberNode;
  }

  protected set child(child: NumberNode) {
    super.child = child;
  }

  getMinValue(): number {
    if (this.hasValue()) return this.value;
    if (!this.formulaType) {
      return this.child.getMinValue();
    } else
      switch (this.formulaType) {
        case ADD:
          return this.children.map((child) => child.getMinValue()).reduce((min, childMin) => min + childMin);
        case MINUS:
          return (
            this.children[0].getMinValue() -
            this.children
              .slice(1)
              .map((child) => child.getMaxValue())
              .reduce((max, childMax) => max + childMax)
          );
        case MULT:
          return this.children.map((child) => child.getMinValue()).reduce((min, childMin) => min * childMin);
        case DIV:
          return this.children[0].getMinValue() / (this.children[1].getMaxValue() || 1);
      }
  }

  getMaxValue(): number {
    if (this.hasValue()) return this.value;
    if (!this.formulaType) {
      return this.child.getMaxValue();
    } else
      switch (this.formulaType) {
        case ADD:
          return this.children.map((child) => child.getMaxValue()).reduce((max, childMax) => max + childMax);
        case MINUS:
          return (
            this.children[0].getMaxValue() -
            this.children
              .map((child) => child.getMinValue())
              .slice(1)
              .reduce((min, childMin) => min + childMin)
          );
        case MULT:
          return this.children.map((child) => child.getMaxValue()).reduce((max, childMax) => max * childMax);
        case DIV:
          return this.children[0].getMaxValue() / (this.children[1].getMinValue() || 1);
      }
  }

  toPRUsedFormula(): string {
    return this.toFormulaByStatus(STATUS.PR_USED);
  }
  toMissedFormula(): string {
    return this.toFormulaByStatus(STATUS.PR_USED, STATUS.MISSED);
  }
  toFormulaByStatus(...statuses: STATUS[]): string {
    if (this.hasValue()) return VALUE(this.value);
    if (!this.formulaType) return this.child.toFormulaByStatus(...statuses);
    return this.formulaType.generateFormula(
      ...this.children.map((child) => child.toFormulaByStatus(...statuses))
    );
  }
  toFormulaByNotStatus(...statuses: STATUS[]): string {
    if (this.hasValue()) return VALUE(this.value);
    if (!this.formulaType) return this.child.toFormulaByNotStatus(...statuses);
    return this.formulaType.generateFormula(
      ...this.children.map((child) => child.toFormulaByNotStatus(...statuses))
    );
  }
  toRawMissedFormula(): string {
    if (this.hasValue()) return VALUE(this.value);
    if (!this.formulaType) return this.child.toRawMissedFormula();
    return this.formulaType.generateFormula(...this.children.map((child) => child.toRawMissedFormula()));
  }
  toUnknownFormula(): string {
    if (this.hasValue()) return VALUE(this.value);
    if (!this.formulaType) return this.child.toUnknownFormula();
    return this.formulaType.generateFormula(...this.children.map((child) => child.toUnknownFormula()));
  }
}

/**
 * Abstract intermediate class for value-based formula nodes
 * These nodes represent actual item values/counts rather than operators
 */
export abstract class FormulaValueNode<T> extends FormulaNode<T> {
  readonly valueInfo: ValueNode;

  protected constructor(text: string, translator: IStatusFormulaTranslator, row: row, _implicitPrefix: boolean = false) {
    super(text, translator, row);
    this.determineValue();
    if (!this.hasValue()) {
      this.valueInfo = ValueNode.create({ text, translator, row, _implicitPrefix });
    }
  }

  protected determineValue(): void {
    return;
  }

  finalize(): FormulaValueNode<T> {
    if (this.finalized) return this;
    super.finalize();
    this.valueInfo?.finalize();
    this.finalized = true;
    return this;
  }

  protected _allPossiblePreReqRows: ReadonlySet<row>;
  getAllPossiblePreReqRows(): ReadonlySet<row> {
    if (this.hasValue()) return new Set();
    if (!this._allPossiblePreReqRows) {
      if (this.isInCircularDependency()) {
        this._allPossiblePreReqRows = this.getCircularDependencies();
      } else {
        const allPossiblePreReqs: Set<row> = new Set(this.valueInfo.rows);
        this.valueInfo.rows.forEach((row) =>
          CellFormulaParser.getParserForChecklistRow(this.translator, Number(row))
            .getAllPossiblePreReqRows()
            .forEach(allPossiblePreReqs.add, allPossiblePreReqs)
        );
        this._allPossiblePreReqRows = allPossiblePreReqs;
      }
    }
    return this._allPossiblePreReqRows;
  }

  getDirectPreReqRows() {
    return new Set<row>(this.valueInfo?.rows);
  }

  getCircularDependencies(previous: row[] = []): ReadonlySet<row> {
    if (this.hasValue()) return new Set();
    if (this._circularDependencies) return this._circularDependencies;
    const circularDependencies: Set<row> = new Set();
    if (this._lockCircular) {
      previous.slice(previous.indexOf(this.row)).forEach(circularDependencies.add, circularDependencies);
    } else {
      previous.push(this.row);
      this._lockCircular = true;
      this.valueInfo.rows.forEach((row) => {
        CellFormulaParser.getParserForChecklistRow(this.translator, Number(row))
          .getCircularDependencies([...previous])
          .forEach(circularDependencies.add, circularDependencies);
      });
      this._lockCircular = false;
    }
    if (circularDependencies.has(this.row)) this._isCircular = true;
    this._circularDependencies = circularDependencies;
    return this._circularDependencies;
  }

  isDirectlyMissable(): boolean {
    if (virtualItems[this.text] || this.hasValue()) return false;
    return super.isDirectlyMissable();
  }

  checkErrors() {
    return super.checkErrors() || (!this.hasValue() && this.valueInfo.checkErrors());
  }
  getDirectPreReqInfos() {
    return {
      ...super.getDirectPreReqInfos(),
      ...this.valueInfo?.getDirectPreReqInfos(),
    };
  }
  getErrors() {
    this.checkErrors();
    if (!this.hasValue()) {
      this.addErrors(this.valueInfo.getErrors());
    }
    return super.getErrors();
  }
}

/**
 * Boolean value node representing item existence/count checks
 * Evaluates to true when enough items are checked (CHECKED >= NEEDED)
 */
export class BooleanFormulaValueNode extends FormulaValueNode<boolean> {
  static create({ text, translator, row }: NodeArgs): FormulaValueNode<boolean> {
    const match = text.match(/^(SAME|COPY) +(.*?)$/);
    if (match) {
      return SameFormulaNode.create({ text: match[2], translator, row });
    } else {
      return new BooleanFormulaValueNode(text, translator, row);
    }
  }
  protected readonly formulaType: FormulaHelper = GTE;
  protected readonly children: NumberFormulaValueNode[];
  protected numNeeded: number;

  protected constructor(text: string, translator: IStatusFormulaTranslator, row: row, _implicitPrefix: boolean = false) {
    super(text, translator, row, _implicitPrefix);
    if (!this.hasValue()) {
      this.availableChild = NumberFormulaValueNode.create({
        text: this.text,
        translator: this.translator,
        row: this.row,
        _implicitPrefix,
      });
      this.neededChild = NumberFormulaValueNode.create({
        text: '1',
        translator: this.translator,
        row: this.row,
        _implicitPrefix,
      });
    }
  }
  
  protected determineValue(): void {
    if (
      typeof this.text == 'boolean' ||
      this.text.toString().toUpperCase() == 'TRUE' ||
      this.text.toString().toUpperCase() == 'FALSE'
    ) {
      this.value = typeof this.text == 'boolean' ? (this.text as boolean) : this.text.toString().toUpperCase() == 'TRUE';
    }
  }

  finalize(): BooleanFormulaValueNode {
    if (this.finalized) return this;
    super.finalize();
    if (!this.hasValue()) {
      if (this.valueInfo.isVirtual && virtualItems[this.text].numNeeded) {
        this.numNeeded = virtualItems[this.text].numNeeded;
      } else if (!this.numNeeded && this.numNeeded !== 0) {
        this.numNeeded = this.valueInfo.numPossible;
      }
      this.neededChild.updateValue(this.numNeeded);
    }
    this.finalized = true;
    return this;
  }

  protected get availableChild(): NumberFormulaValueNode {
    this.checkPhase(PHASE.FINALIZING, PHASE.FINALIZED);
    this.finalize();
    return this.children[0];
  }
  protected set availableChild(child: NumberFormulaValueNode) {
    this.checkPhase(PHASE.BUILDING, PHASE.FINALIZING);
    this.children[0] = child;
  }
  protected get neededChild(): NumberFormulaValueNode {
    this.checkPhase(PHASE.FINALIZING, PHASE.FINALIZED);
    this.finalize();
    return this.children[1];
  }
  protected set neededChild(child: NumberFormulaValueNode) {
    this.checkPhase(PHASE.BUILDING, PHASE.FINALIZING);
    this.children[1] = child;
  }
  
  toPreReqsMetFormula(): string {
    this.checkPhase(PHASE.FINALIZED);
    if (!this.hasValue() && this.numNeeded == this.valueInfo.numPossible) {
      return AND(...this.translator.rowsToA1Ranges(this.valueInfo.rows, COLUMN.CHECK));
    } else {
      return super.toPreReqsMetFormula();
    }
  }
  
  toPRUsedFormula(): string {
    if (this.hasValue()) return VALUE.FALSE;
    return AND(
      GTE(MINUS(this.availableChild.toTotalFormula(), this.availableChild.toRawMissedFormula()), VALUE(this.numNeeded)),
      Formula.LT(this.availableChild.toPRNotUsedFormula(), VALUE(this.numNeeded))
    );
  }
  
  toRawMissedFormula(): string {
    if (this.hasValue()) return VALUE.FALSE;
    return Formula.LT(this.availableChild.toRawNotMissedFormula(), VALUE(this.numNeeded));
  }
  
  toMissedFormula(): string {
    if (this.hasValue()) return VALUE.FALSE;
    return Formula.LT(this.availableChild.toNotMissedFormula(), VALUE(this.numNeeded));
  }
  
  toUnknownFormula(): string {
    if (this.hasValue()) return VALUE.FALSE;
    return AND(
      NOT(this.toMissedFormula()),
      Formula.LT(
        MINUS(
          this.availableChild.toTotalFormula(),
          this.availableChild.toMissedFormula(),
          this.availableChild.toUnknownFormula()
        ),
        VALUE(this.numNeeded)
      )
    );
  }
  
  checkErrors(): boolean {
    if (super.checkErrors()) {
      return true;
    } else if (this.valueInfo.numPossible < this.numNeeded) {
      this.addError(
        'There are only ' + this.valueInfo.numPossible + ', not ' + this.numNeeded + ', of ' + this.valueInfo.column + ' "' + this.valueInfo.id + '"' + (this.valueInfo.isSelfReferential ? ' (when excluding itself)' : '')
      );
      return true;
    }
  }
}

/**
 * Number value node representing counts of items in various states
 * Provides formulas for counting items by status
 */
export class NumberFormulaValueNode extends FormulaValueNode<number> implements NumberNode {
  protected readonly isNumber = true;
  static create({ text, translator, row, _implicitPrefix = false }: NodeArgs & { _implicitPrefix?: boolean }) {
    return new NumberFormulaValueNode(text, translator, row, _implicitPrefix);
  }
  protected readonly children: FormulaValueNode<never>[];
  protected constructor(text: string | number, translator: IStatusFormulaTranslator, row: row, _implicitPrefix: boolean = false) {
    super(text.toString(), translator, row, _implicitPrefix);
  }

  determineValue() {
    if (Number(this.text) || this.text === '0') {
      this.value = Number(this.text);
    }
  }

  toTotalFormula(): string {
    if (this.hasValue()) return VALUE(this.value);
    return this.valueInfo.numPossible.toString();
  }

  toFormulaByStatus(...statuses: STATUS[]) {
    return this._generateFormula(statuses.flat());
  }

  toFormulaByNotStatus(...statuses: STATUS[]) {
    if (this.hasValue()) return VALUE(this.value);
    return MINUS(this.toTotalFormula(), this.toFormulaByStatus(...statuses));
  }

  toPreReqsMetFormula(): string {
    return this._generateFormula(VALUE.TRUE, COLUMN.CHECK);
  }

  toPRNotMetFormula(): string {
    return MINUS(this.toTotalFormula(), this.toPreReqsMetFormula());
  }

  toMissedFormula(): string {
    return this.toFormulaByStatus(STATUS.MISSED, STATUS.PR_USED);
  }
  toRawMissedFormula(): string {
    return this.toFormulaByStatus(STATUS.MISSED);
  }
  toRawNotMissedFormula(): string {
    return this.toFormulaByNotStatus(STATUS.MISSED);
  }

  toUnknownFormula(): string {
    return this.toFormulaByStatus(STATUS.UNKNOWN);
  }
  toNotUnknownFormula(): string {
    return this.toFormulaByNotStatus(STATUS.UNKNOWN);
  }
  toNotMissedFormula(): string {
    return this.toFormulaByNotStatus(STATUS.MISSED, STATUS.PR_USED);
  }
  toPRUsedFormula(): string {
    if (this.hasValue()) return VALUE(this.value);
    return this._generateFormula(STATUS.PR_USED);
  }
  toPRNotUsedFormula(): string {
    if (this.hasValue()) {
      return VALUE(this.value);
    }
    return MINUS(this.toTotalFormula(), this.toPRUsedFormula());
  }
  toMinCheckedFormula(): string {
    return this.toFormulaByStatus(STATUS.CHECKED);
  }
  toMaxCheckedFormula(): string {
    return this.toFormulaByNotStatus(STATUS.MISSED, STATUS.PR_USED);
  }

  getMinValue(): number {
    if (this.hasValue()) return this.value;
    return 0;
  }

  getMaxValue(): number {
    if (this.hasValue()) return this.value;
    return this.valueInfo.numPossible;
  }

  private _generateFormula(values: (string | number | boolean) | (string | number | boolean)[] = [], column: column = COLUMN.STATUS): string {
    if (this.hasValue()) {
      return VALUE(this.value);
    } else if (!values || (Array.isArray(values) && values.length == 0)) {
      return VALUE.ZERO;
    } else {
      const vals: (string | number | boolean)[] = Array.isArray(values) ? values : [values];
      const counts: string[] = Object.entries(this.translator.rowCountsToA1Counts(this.valueInfo.rowCounts, column)).reduce(
        (counts, [range, count]) => {
          vals.forEach((value) => {
            const countIf: string = COUNTIF(range, VALUE(value));
            counts.push(count == 1 ? countIf : MULT(countIf, VALUE(count)));
          });
          return counts;
        },
        []
      );
      return ADD(...counts);
    }
  }

  checkErrors() {
    let hasError = super.checkErrors();
    if (this.text.match(/^SAME|COPY /)) {
      this.addError('Cannot use SAME with Numerical Equations');
      hasError = true;
    }
    return hasError;
  }
}

/**
 * Virtual value information for items that don't exist in the sheet
 * (e.g., OPTION items for virtual choices)
 */
export type virtualValueInfo = {
  rowCounts: RowCounts;
  numPossible?: number;
  numNeeded?: number;
};

/**
 * Global registry of virtual items
 * Virtual items require rowCounts and can override numNeeded and numPossible
 * e.g., Virtual Choice has a numNeeded of 1, and rowCounts of {[optionRow]:1} for each OPTION
 */
export const virtualItems: { [x: string]: virtualValueInfo } = {};

/**
 * Types of value node syntax
 */
enum ValueNodeTypes {
  WITH = 'WITH',
  WITHOUT = 'WITHOUT',
  VALUE = 'VALUE',
}

/**
 * Regular expressions for parsing value node syntax
 */
const ValueNodeTypeRegExps: { [x in ValueNodeTypes]: RegExp } = {
  WITH: /^(?:(?<items>.+) +)?WITH +(?<filteredItems>.+?)$/,
  WITHOUT: /^(?:(?<items>.+) +)?(WITHOUT|UNLESS|EXCEPT) +(?<filteredItems>.+?)$/,
  VALUE: /^(?:(?<column>.*?[^\s])[!=])?(?<id>.*)$/,
};

/**
 * Unescapes column/id values by removing quotes
 */
const unescapeValue = (text: string): string => {
  return text?.replace(/^'(.*)'$/, '$1');
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
      (this._isVirtual && virtualItems[this.text].numPossible) ||
      Object.values(this._rowCounts).reduce((total, count) => total + count, 0)
    );
  }
  get rows(): number[] {
    return Object.keys(this._rowCounts)
      .map((row) => Number(row))
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
      this.itemsChild = new ValueNode(items ?? '*', this.translator, this.row, _implicitPrefix);
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
      this.itemsChild = new ValueNode(items ?? '*', this.translator, this.row, _implicitPrefix);
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
        _implicitPrefix && (!column || column == COLUMN.ITEM)
      );
      if (column && this.rows.length == 0) {
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
    // if (row == 200) console.log("vn.con: text:%s, rowCounts:%s",text,Object.keys(this._rowCounts));
  }

  finalize(): ValueNode {
    if (this.finalized) return this;
    super.finalize();
    if (!this.rows.length && virtualItems[this.text]) {
      Object.keys(virtualItems[this.text].rowCounts).forEach(
        (row) => (this._rowCounts[row] = virtualItems[this.text].rowCounts[row])
      );
      this._isVirtual = true;
    }
    this.finalized = true;
    return this;
  }

  toString(): string {
    // Remove the outer "" if present
    return super.toString().replace(/^"(([^"]|\\")*)"$/, '$1');
  }

  checkErrors(): boolean {
    if (super.checkErrors()) {
      return true;
    } else if (this.rows.length == 0) {
      switch (this.type) {
        case ValueNodeTypes.WITH:
          this.addError(`Could not find any of "${this.itemsChild.toString()}" WITH "${this.filterChild.toString()}"`);
          break;
        case ValueNodeTypes.WITHOUT:
          this.addError(
            `Could not find any of "${this.itemsChild.toString()}" WITHOUT "${this.filterChild.toString()}"`
          );
          break;
        case ValueNodeTypes.VALUE:
          if (this.column != COLUMN.ITEM) {
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
    } else if (this.type == ValueNodeTypes.WITHOUT && this.rows.length == this.itemsChild.rows.length) {
      this.addError(
        `There are not any of "${this.itemsChild.toString()}" WITH "${this.filterChild.toString()}" (WITHOUT is unnecessary)`
      );
      return true;
    }
  }
}

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
    if (this.valueInfo.rows.length == 0) {
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
    if (this.finalized) return this;
    super.finalize();
    this.choiceParser?.addOption(this.row);
    this.finalized = true;
    return this;
  }

  get choiceRow(): row {
    return this.valueInfo.isVirtual ? undefined : this.valueInfo.rows[0];
  }
  get choiceParser(): CellFormulaParser {
    return this.valueInfo.isVirtual ? undefined : CellFormulaParser.getParserForChecklistRow(this.translator, this.choiceRow);
  }
  get choiceOptions(): row[] {
    if (this.valueInfo.isVirtual) {
      return Object.keys(virtualItems[this.text].rowCounts).map((row) => Number(row));
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
      if (this.valueInfo.rows.length != 1) {
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
          CellFormulaParser.getParserForChecklistRow(this.translator, this.choiceRow).toRawPreReqsMetFormula()
        );
  }

  toPRUsedFormula(): string {
    return this._determineFormula(
      OR(...this.translator.rowsToA1Ranges(this.choiceOptions, COLUMN.CHECK)),
      STATUS.PR_USED,
      STATUS.CHECKED
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
    return OR(...statuses.map((status) => EQ(this.translator.cellA1(this.choiceRow, COLUMN.STATUS), VALUE(status))));
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

/**
 * SameFormulaNode handles SAME/COPY syntax
 * Copies the formula logic from another item
 */
export class SameFormulaNode extends FormulaValueNode<boolean> {
  static create({ text, translator, row }: NodeArgs) {
    return new SameFormulaNode(text, translator, row);
  }

  private sameRow: row;
  private get sameRowParser(): CellFormulaParser {
    return this.sameRow && CellFormulaParser.getParserForChecklistRow(this.translator, this.sameRow);
  }

  protected constructor(text: string, translator: IStatusFormulaTranslator, row: row) {
    super(text, translator, row);
  }

  finalize(): SameFormulaNode {
    if (this.finalized) return this;
    super.finalize();
    this.sameRow = this.valueInfo.rows[0];
    this.finalized = true;
    return this;
  }

  toPreReqsMetFormula() {
    return OR(this.translator.cellA1(this.sameRow, COLUMN.CHECK), this.sameRowParser?.toPreReqsMetFormula() || '');
  }

  toErrorFormula() {
    return this.sameRowParser?.toErrorFormula() || VALUE.TRUE;
  }

  toMissedFormula() {
    return this.sameRowParser?.toMissedFormula() || '';
  }

  toPRUsedFormula() {
    return this.sameRowParser?.toPRUsedFormula() || '';
  }

  toRawMissedFormula() {
    return this.sameRowParser?.toRawMissedFormula() || '';
  }

  toUnknownFormula() {
    return this.sameRowParser?.toUnknownFormula() || '';
  }

  checkErrors() {
    if (super.checkErrors()) {
      return true;
    } else if (this.valueInfo.rows.length != 1) {
      this.addError('SAME must link to only 1 Item but an Item can have multiple SAME');
      return true;
    } else if (this.valueInfo.numPossible > 1) {
      this.addError('Cannot use SAME with Numerical Equations');
      return true;
    }
    return false;
  }
}
