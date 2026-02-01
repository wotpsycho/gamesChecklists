import type { row } from '../../types';
import type { IStatusFormulaTranslator, NodeArgs } from '../../interfaces';
import { FormulaNode } from '../base';
import {
  OR,
  AND,
  NOT,
  EQ,
  NE,
  GT,
  GTE,
  X_ITEMS,
  VALUE,
} from '../../formula-helpers';
import { ComparisonFormulaNode } from './ComparisonFormulaNode';
import { BooleanFormulaValueNode } from '../value';

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
