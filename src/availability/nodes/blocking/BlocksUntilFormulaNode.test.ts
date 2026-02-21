import { PHASE } from "../../constants";
import { createMockParser, createMockTranslator } from "../../test-helpers/mock-translator";
import { setupFormulaTests } from "../../test-helpers/setup";
import { BlocksUntilFormulaNode } from "./BlocksUntilFormulaNode";

describe("BlocksUntilFormulaNode", () => {
  setupFormulaTests();

  // Helper: BLOCKS row at row 5, "Key" at row 15 (not self-referential).
  // Parser for row 15 reports row 5 in prereqs so UNTIL validation passes.
  function createValidBlocksNode(translator: ReturnType<typeof createMockTranslator>, text = "Boss UNTIL Key") {
    return BlocksUntilFormulaNode.create({ text, translator, row: 5 });
  }

  function validConfig() {
    return createMockTranslator({
      items: { "Boss": [10, 12], "Key": [15] },
    });
  }

  function setupValidTranslator() {
    const translator = validConfig();
    // Key at row 15 — its parser must report row 5 as a possible prereq
    // so the UNTIL validation ("UNTIL clause must depend on this Item") passes
    translator.registerParser(15, createMockParser({
      getAllPossiblePreReqRows: () => new Set([5]),
    }));
    return translator;
  }

  describe("self formulas (BLOCKS row itself is always transparent)", () => {
    it("toPreReqsMetFormula always returns TRUE", () => {
      const translator = setupValidTranslator();
      const node = createValidBlocksNode(translator);
      translator.setPhase(PHASE.FINALIZING);
      node.finalize();
      translator.setPhase(PHASE.FINALIZED);
      expect(node.toPreReqsMetFormula()).toBe("TRUE");
    });

    it("toPRUsedFormula always returns FALSE", () => {
      const translator = setupValidTranslator();
      const node = createValidBlocksNode(translator);
      translator.setPhase(PHASE.FINALIZING);
      node.finalize();
      translator.setPhase(PHASE.FINALIZED);
      expect(node.toPRUsedFormula()).toBe("FALSE");
    });

    it("toMissedFormula always returns FALSE", () => {
      const translator = setupValidTranslator();
      const node = createValidBlocksNode(translator);
      translator.setPhase(PHASE.FINALIZING);
      node.finalize();
      translator.setPhase(PHASE.FINALIZED);
      expect(node.toMissedFormula()).toBe("FALSE");
    });

    it("toUnknownFormula always returns FALSE", () => {
      const translator = setupValidTranslator();
      const node = createValidBlocksNode(translator);
      translator.setPhase(PHASE.FINALIZING);
      node.finalize();
      translator.setPhase(PHASE.FINALIZED);
      expect(node.toUnknownFormula()).toBe("FALSE");
    });
  });

  describe("dependency tracking", () => {
    it("getAllPossiblePreReqRows always returns empty set", () => {
      const translator = setupValidTranslator();
      const node = createValidBlocksNode(translator);
      translator.setPhase(PHASE.FINALIZING);
      node.finalize();
      translator.setPhase(PHASE.FINALIZED);
      expect(node.getAllPossiblePreReqRows().size).toBe(0);
    });

    it("getDirectPreReqRows always returns empty set", () => {
      const translator = setupValidTranslator();
      const node = createValidBlocksNode(translator);
      translator.setPhase(PHASE.FINALIZING);
      node.finalize();
      translator.setPhase(PHASE.FINALIZED);
      expect(node.getDirectPreReqRows().size).toBe(0);
    });
  });

  describe("parsing", () => {
    it("splits 'blocksPattern UNTIL untilPattern' from text", () => {
      const translator = setupValidTranslator();
      const node = createValidBlocksNode(translator);
      translator.setPhase(PHASE.FINALIZING);
      node.finalize();
      translator.setPhase(PHASE.FINALIZED);
      expect(node.hasErrors()).toBe(false);
    });

    it("accepts explicit blocksText/untilText", () => {
      const translator = setupValidTranslator();
      const node = BlocksUntilFormulaNode.create({
        blocksText: "Boss", untilText: "Key", translator, row: 5,
      });
      translator.setPhase(PHASE.FINALIZING);
      node.finalize();
      translator.setPhase(PHASE.FINALIZED);
      expect(node.hasErrors()).toBe(false);
    });
  });

  describe("errors", () => {
    it("reports error when UNTIL clause is missing", () => {
      const translator = createMockTranslator({ items: { "Boss": [10] } });
      const node = BlocksUntilFormulaNode.create({ text: "Boss", translator, row: 5 });
      translator.setPhase(PHASE.FINALIZING);
      node.finalize();
      translator.setPhase(PHASE.FINALIZED);
      expect(node.hasErrors()).toBe(true);
      expect([...node.getErrors()].join()).toContain("Missing UNTIL");
    });

    it("reports error when UNTIL clause doesn't depend on this item", () => {
      // "Key" at row 11, but parser for row 11 returns empty prereqs
      // So UNTIL child's getAllPossiblePreReqRows won't include row 5
      const translator = createMockTranslator({
        items: { "Boss": [10], "Key": [11] },
      });
      const node = BlocksUntilFormulaNode.create({
        text: "Boss UNTIL Key", translator, row: 5,
      });
      translator.setPhase(PHASE.FINALIZING);
      node.finalize();
      translator.setPhase(PHASE.FINALIZED);
      expect(node.hasErrors()).toBe(true);
      expect([...node.getErrors()].join()).toContain("UNTIL clause must depend on this Item");
    });
  });

  describe("finalize (injection of blocking constraints)", () => {
    it("injects GeneratedBlockedUntilFormulaNode into matched blocked rows", () => {
      const translator = createMockTranslator({
        items: { "Boss": [10, 12], "Key": [15] },
      });

      const addChildCalls: Record<number, unknown[]> = { 10: [], 12: [] };
      // Key at row 15 — parser reports row 5 in prereqs
      translator.registerParser(15, createMockParser({
        getAllPossiblePreReqRows: () => new Set([5]),
      }));
      translator.registerParser(10, createMockParser({
        addChild: (child: unknown) => addChildCalls[10].push(child),
      }));
      translator.registerParser(12, createMockParser({
        addChild: (child: unknown) => addChildCalls[12].push(child),
      }));

      const node = BlocksUntilFormulaNode.create({
        text: "Boss UNTIL Key", translator, row: 5,
      });

      translator.setPhase(PHASE.FINALIZING);
      node.finalize();

      // Both rows 10 and 12 should have had addChild called
      expect(addChildCalls[10].length).toBe(1);
      expect(addChildCalls[12].length).toBe(1);
    });

    it("does not block UNTIL's own prereq rows", () => {
      const translator = createMockTranslator({
        // "Boss" matches rows 10, 11. "Key" at row 15.
        items: { "Boss": [10, 11], "Key": [15] },
      });

      const addChildCalls: Record<number, unknown[]> = { 10: [], 11: [] };
      // Key at row 15 — parser reports rows 5 and 11 as prereqs
      // Row 11 is in UNTIL's prereqs, so it should NOT be blocked
      translator.registerParser(15, createMockParser({
        getAllPossiblePreReqRows: () => new Set([5, 11]),
      }));
      translator.registerParser(10, createMockParser({
        addChild: (child: unknown) => addChildCalls[10].push(child),
      }));
      translator.registerParser(11, createMockParser({
        addChild: (child: unknown) => addChildCalls[11].push(child),
      }));

      const node = BlocksUntilFormulaNode.create({
        text: "Boss UNTIL Key", translator, row: 5,
      });

      translator.setPhase(PHASE.FINALIZING);
      node.finalize();

      // Row 10 should be blocked (not in UNTIL's prereqs)
      expect(addChildCalls[10].length).toBe(1);
      // Row 11 should NOT be blocked (is a prereq of UNTIL)
      expect(addChildCalls[11].length).toBe(0);
    });
  });
});
