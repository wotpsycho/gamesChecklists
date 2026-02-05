import type { Checklist } from "../ChecklistApp";
import type { CellFormulaParser } from "./CellFormulaParser";
import type { PHASE } from "./constants";
import type { column, row } from "./types";
import type { columnValues } from "./utilities/parser-utilities";

/**
 * Type representing row counts indexed by row number
 */
export interface RowCounts {
  [x: number]: number;
}

/**
 * Arguments for creating formula nodes
 */
export interface NodeArgs {
  text: string;
  translator: IStatusFormulaTranslator;
  row: row;
}

/**
 * Interface for StatusFormulaTranslator that nodes depend on.
 * This interface breaks circular dependencies by allowing nodes to depend
 * on this interface rather than the concrete StatusFormulaTranslator class.
 */
export interface IStatusFormulaTranslator {
  readonly checklist: Checklist;
  readonly phase: PHASE;

  /**
   * Get all values in a column organized by row and by value
   */
  getColumnValues: (column: column) => columnValues;

  /**
   * Get row counts for a given column and identifier
   */
  getRowCounts: (column: column, id: string, _implicitPrefix?: boolean) => RowCounts;

  /**
   * Convert row and column to A1 notation
   */
  cellA1: (row: row, column: column) => string;

  /**
   * Convert array of rows to A1 range notation
   */
  rowsToA1Ranges: (rows: row[], column?: column) => string[];

  /**
   * Convert row counts to A1 notation with counts
   */
  rowCountsToA1Counts: (rowCounts: Readonly<RowCounts>, column: column) => { [x: string]: number };

  /**
   * Get a CellFormulaParser instance for the specified row.
   * This method breaks circular dependencies by allowing nodes to access parsers
   * through the translator interface rather than directly importing CellFormulaParser.
   */
  getParserForRow: (row: row) => CellFormulaParser;
}
