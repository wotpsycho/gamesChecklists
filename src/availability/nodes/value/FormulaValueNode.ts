import type { row } from '../../types';
import type { IStatusFormulaTranslator } from '../../interfaces';
import { FormulaNode } from '../base';
import { PHASE } from '../../constants';
// Import CellFormulaParser from local module (circular dependency resolved at runtime)
import { CellFormulaParser } from '../../CellFormulaParser';
import { virtualItems } from '../shared';
import { ValueNode } from './ValueNode';

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
