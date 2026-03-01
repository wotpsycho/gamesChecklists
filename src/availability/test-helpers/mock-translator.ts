import type { CellFormulaParser } from "../CellFormulaParser";
import type { IStatusFormulaTranslator, RowCounts } from "../interfaces";
import type { column, row } from "../types";
import type { columnValues, sheetValueInfo } from "../utilities/parser-utilities";
import * as Formula from "../../Formulas";
import { COLUMN } from "../../shared-types";
import { PHASE } from "../constants";

/**
 * Column index mapping for tests - mirrors a standard checklist layout
 */
const COLUMN_INDICES: Record<string, number> = {
  [COLUMN.CHECK]: 1, // A
  [COLUMN.TYPE]: 2, // B
  [COLUMN.ITEM]: 3, // C
  [COLUMN.PRE_REQS]: 4, // D
  [COLUMN.NOTES]: 5, // E
  [COLUMN.STATUS]: 6, // F
};

export interface MockTranslatorConfig {
  /** Map of item name -> rows where that item exists. Each row has count 1 unless specified. */
  items?: Record<string, number[]>;
  /** Map of column name -> { value -> rows } for non-ITEM columns */
  columns?: Record<string, Record<string, number[]>>;
  /** Additional column index overrides */
  columnIndices?: Record<string, number>;
}

export interface MockParserStub {
  toPreReqsMetFormula: () => string;
  toRawPreReqsMetFormula?: () => string;
  toRawMissedFormula: () => string;
  toMissedFormula: () => string;
  toPRUsedFormula: () => string;
  toUnknownFormula: () => string;
  getAllPossiblePreReqRows: () => ReadonlySet<row>;
  getCircularDependencies: (previous?: row[]) => ReadonlySet<row>;
  isDirectlyMissable: () => boolean;
  isInCircularDependency: () => boolean;
  addChild?: (child: unknown) => void;
  addOption?: (row: row) => void;
  isControlled?: () => boolean;
  getOptions?: () => row[];
  finalize?: () => unknown;
}

/**
 * Creates a mock parser stub with sensible defaults, allowing overrides.
 */
export function createMockParser(overrides: Partial<MockParserStub> = {}): MockParserStub {
  return {
    toPreReqsMetFormula: () => Formula.VALUE.TRUE,
    toRawPreReqsMetFormula: () => Formula.VALUE.TRUE,
    toRawMissedFormula: () => Formula.VALUE.FALSE,
    toMissedFormula: () => Formula.VALUE.FALSE,
    toPRUsedFormula: () => Formula.VALUE.FALSE,
    toUnknownFormula: () => Formula.VALUE.FALSE,
    getAllPossiblePreReqRows: () => new Set<row>(),
    getCircularDependencies: () => new Set<row>(),
    isDirectlyMissable: () => false,
    isInCircularDependency: () => false,
    addChild: () => {},
    addOption: () => {},
    isControlled: () => false,
    getOptions: () => [],
    finalize: () => {},
    ...overrides,
  };
}

let mockIdCounter = 0;

/**
 * Creates a mock IStatusFormulaTranslator for testing formula nodes
 */
export function createMockTranslator(config: MockTranslatorConfig = {}): IStatusFormulaTranslator & {
  setPhase: (phase: PHASE) => void;
  registerParser: (row: row, parser: MockParserStub) => void;
} {
  const items = config.items ?? {};
  const columns = config.columns ?? {};
  const extraIndices = config.columnIndices ?? {};
  const columnIndices: Record<string, number> = { ...COLUMN_INDICES, ...extraIndices };

  let currentPhase: PHASE = PHASE.BUILDING;
  const registeredParsers: Record<number, MockParserStub> = {};

  const checklistId = ++mockIdCounter;

  function toColumnIndex(col: column): number {
    if (typeof col === "number")
      return col;
    return columnIndices[col] ?? 0;
  }

  function getRowCounts(col: column, id: string, _implicitPrefix: boolean = false): RowCounts {
    const counts: RowCounts = {};
    let source: Record<string, number[]>;

    if (col === COLUMN.ITEM || col === toColumnIndex(COLUMN.ITEM)) {
      source = items;
    } else {
      const colName = typeof col === "string" ? col : Object.entries(columnIndices).find(([, v]) => v === col)?.[0];
      source = columns[colName] ?? {};
    }

    // Handle $[row] references (e.g., "$10" references item at row 10)
    const rowIdMatch = id.match(/^\$(\d+)$/);
    if (rowIdMatch) {
      const targetRow = Number(rowIdMatch[1]);
      for (const [, rows] of Object.entries(source)) {
        if (rows.includes(targetRow)) {
          counts[targetRow] = (counts[targetRow] || 0) + 1;
        }
      }
      return counts;
    }

    // Support wildcards
    const hasStar = id.includes("*");
    if (_implicitPrefix && !hasStar) {
      id += "*";
    }

    if (hasStar || (_implicitPrefix && id.includes("*"))) {
      const pattern = new RegExp(`^(${id.replace(/\*/g, ".*")})$`);
      for (const [name, rows] of Object.entries(source)) {
        if (pattern.test(name)) {
          for (const r of rows) {
            counts[r] = (counts[r] || 0) + 1;
          }
        }
      }
    } else if (source[id]) {
      for (const r of source[id]) {
        counts[r] = (counts[r] || 0) + 1;
      }
    }

    return counts;
  }

  function cellA1(r: row, col: column): string {
    const colIdx = toColumnIndex(col);
    return Formula.A1(r, colIdx);
  }

  function rowsToA1Ranges(rows: row[], col?: column): string[] {
    if (!rows || rows.length === 0)
      return [];
    const colIdx = col ? toColumnIndex(col) : undefined;
    const sorted = [...rows].sort((a, b) => (a as number) - (b as number));
    const ranges: string[] = [];
    let first = sorted[0] as number;
    let last = sorted[0] as number;
    for (let i = 1; i < sorted.length; i++) {
      const r = sorted[i] as number;
      if (r === last + 1) {
        last = r;
      } else {
        ranges.push(Formula.A1(first, colIdx, last, colIdx));
        first = last = r;
      }
    }
    ranges.push(Formula.A1(first, colIdx, last, colIdx));
    return ranges;
  }

  function rowCountsToA1Counts(rowCounts: Readonly<RowCounts>, col: column): Record<string, number> {
    const colIdx = toColumnIndex(col);
    const rangeCounts: Record<string, number> = {};
    const rows = Object.keys(rowCounts).map(Number).sort((a, b) => a - b);
    if (rows.length === 0)
      return rangeCounts;
    let first = rows[0];
    let last = rows[0];
    let num = rowCounts[rows[0]];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i] !== last + 1 || rowCounts[rows[i]] !== num) {
        rangeCounts[Formula.A1(first, colIdx, last, colIdx)] = num;
        first = last = rows[i];
        num = rowCounts[rows[i]];
      } else {
        last = rows[i];
      }
    }
    rangeCounts[Formula.A1(first, colIdx, last, colIdx)] = num;
    return rangeCounts;
  }

  function getColumnValues(col: column): columnValues {
    const byRow: Record<number, sheetValueInfo[]> = {};
    const byValue: Record<string, sheetValueInfo[]> = {};
    const colIdx = toColumnIndex(col);

    let source: Record<string, number[]>;
    if (col === COLUMN.ITEM || (col === colIdx && colIdx === toColumnIndex(COLUMN.ITEM))) {
      source = items;
    } else {
      const colName = typeof col === "string" ? col : Object.entries(columnIndices).find(([, v]) => v === col)?.[0];
      source = columns[colName] ?? {};
    }

    for (const [value, rows] of Object.entries(source)) {
      for (const r of rows) {
        const info: sheetValueInfo = { num: 1, value, row: r, column: colIdx };
        if (!byRow[r])
          byRow[r] = [];
        byRow[r].push(info);
        if (!byValue[value])
          byValue[value] = [];
        byValue[value].push(info);
      }
    }

    return { byRow, byValue };
  }

  function getParserForRow(r: row): CellFormulaParser {
    if (registeredParsers[r as number]) {
      return registeredParsers[r as number] as unknown as CellFormulaParser;
    }
    // Return a default stub that represents a simple no-prereq row
    return createMockParser() as unknown as CellFormulaParser;
  }

  const checklist = {
    id: checklistId,
    hasColumn: (...cols: column[]) => cols.every(c => toColumnIndex(c) > 0),
    toColumnIndex,
  };

  const translator = {
    get phase() { return currentPhase; },
    checklist: checklist as any,
    getColumnValues,
    getRowCounts,
    cellA1,
    rowsToA1Ranges,
    rowCountsToA1Counts,
    getParserForRow,
    setPhase(phase: PHASE) { currentPhase = phase; },
    registerParser(r: row, parser: MockParserStub) { registeredParsers[r as number] = parser; },
  };

  return translator;
}
