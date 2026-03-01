import type { IStatusFormulaTranslator } from "../interfaces";
import type { FormulaNode } from "../nodes/base/FormulaNode";
import type { MockTranslatorConfig } from "./mock-translator";
import { togglePrettyPrint } from "../../Formulas";
import { CellFormulaParser } from "../CellFormulaParser";
import { PHASE } from "../constants";
import { usesInfo, virtualItems } from "../nodes/shared/registries";
import { parentheticalMapping, quoteMapping } from "../utilities/parser-utilities";
import { createMockTranslator } from "./mock-translator";

/**
 * Registers beforeEach/afterEach hooks for formula node tests.
 * - Disables pretty printing for deterministic output
 * - Clears global state after each test
 */
export function setupFormulaTests() {
  beforeEach(() => {
    togglePrettyPrint(false);
  });

  afterEach(() => {
    togglePrettyPrint(true);
    // Clear global registries
    for (const key of Object.keys(virtualItems)) delete virtualItems[key];
    for (const key of Object.keys(usesInfo)) delete usesInfo[key];
    for (const key of Object.keys(parentheticalMapping)) delete parentheticalMapping[key];
    for (const key of Object.keys(quoteMapping)) delete quoteMapping[key];
  });
}

/**
 * Builds a node via factory, finalizes it, and returns the node + translator.
 * Handles phase transitions: BUILDING -> factory() -> FINALIZING -> finalize() -> FINALIZED
 */
export function buildAndFinalize<T extends FormulaNode<any>>(
  nodeFactory: (translator: IStatusFormulaTranslator) => T,
  config: MockTranslatorConfig = {},
): { node: T; translator: ReturnType<typeof createMockTranslator> } {
  const translator = createMockTranslator(config);
  // BUILDING phase - construct the node
  const node = nodeFactory(translator);
  // Transition to FINALIZING
  translator.setPhase(PHASE.FINALIZING);
  node.finalize();
  // Transition to FINALIZED
  translator.setPhase(PHASE.FINALIZED);
  return { node, translator };
}

/**
 * Integration test helper: simulates StatusFormulaTranslator.initializeParsers().
 * Creates CellFormulaParser instances for all rows, finalizes them together
 * (allowing cross-parser interactions like BLOCKS injection and OPTION registration),
 * then transitions to FINALIZED for formula generation.
 */
export interface BuildParsersConfig extends MockTranslatorConfig {
  /** row number -> prereq text */
  prereqs: Record<number, string>;
}

export function buildParsers(config: BuildParsersConfig): {
  parsers: Record<number, CellFormulaParser>;
  translator: ReturnType<typeof createMockTranslator>;
} {
  const translator = createMockTranslator({
    items: config.items,
    columns: config.columns,
    columnIndices: config.columnIndices,
  });

  // Override getParserForRow to delegate to the real CellFormulaParser cache.
  // Mirrors StatusFormulaTranslator.getParserForRow behavior.
  // Critical for cross-parser interactions (BLOCKS injection, OPTION registration).
  (translator as any).getParserForRow = (row: number) =>
    CellFormulaParser.getParserForChecklistRow(translator, row);

  // Collect all rows that need parsers:
  // 1. All rows from config.prereqs (explicit prereqs)
  // 2. All rows from config.items (items referenced as prereqs need parsers too)
  const allRows = new Set<number>();
  for (const rows of Object.values(config.items ?? {})) {
    for (const r of rows) allRows.add(r);
  }
  for (const rowStr of Object.keys(config.prereqs)) {
    allRows.add(Number(rowStr));
  }

  const parsers: Record<number, CellFormulaParser> = {};

  // Phase 1: BUILDING — create parsers for all rows
  for (const row of [...allRows].sort((a, b) => a - b)) {
    const prereqText = config.prereqs[row] ?? "";
    parsers[row] = CellFormulaParser.getParserForChecklistRow(translator, row, prereqText);
  }

  // Phase 2: FINALIZING — finalize all parsers (cross-parser interactions happen here)
  translator.setPhase(PHASE.FINALIZING);
  for (const parser of Object.values(parsers)) {
    parser.finalize();
  }

  // Phase 3: FINALIZED — formulas can now be generated
  translator.setPhase(PHASE.FINALIZED);

  return { parsers, translator };
}
