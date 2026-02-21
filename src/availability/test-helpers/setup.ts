import type { IStatusFormulaTranslator } from "../interfaces";
import type { FormulaNode } from "../nodes/base/FormulaNode";
import { togglePrettyPrint } from "../../Formulas";
import { PHASE } from "../constants";
import { virtualItems, usesInfo } from "../nodes/shared/registries";
import { parentheticalMapping, quoteMapping } from "../utilities/parser-utilities";
import { createMockTranslator, type MockTranslatorConfig } from "./mock-translator";

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
