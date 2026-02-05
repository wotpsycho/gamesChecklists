import type { FormulaNode } from "../base/FormulaNode";

/**
 * Interface for number nodes with min/max value computation
 */
export interface NumberNode extends FormulaNode<number> {
  getMinValue: () => number;
  getMaxValue: () => number;
  toFormulaByStatus: (...status: string[]) => string;
  toFormulaByNotStatus: (...status: string[]) => string;
}
