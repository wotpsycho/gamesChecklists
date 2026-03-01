import { PHASE } from "../../constants";
import { createMockTranslator } from "../../test-helpers/mock-translator";
import { buildAndFinalize, setupFormulaTests } from "../../test-helpers/setup";
import { usesInfo } from "../shared/registries";
import { UsesFormulaNode } from "./UsesFormulaNode";

describe("usesFormulaNode", () => {
  setupFormulaTests();

  describe("constructor / parsing", () => {
    it("parses '3x Potion' prefix syntax", () => {
      const translator = createMockTranslator({
        items: { Potion: [10, 12, 14] },
      });
      const _node = UsesFormulaNode.create({ text: "3x Potion", translator, row: 5 });

      // Should register in usesInfo
      expect(usesInfo.Potion).toBeDefined();
      expect(usesInfo.Potion[5]).toBe(3);
    });

    it("parses 'Potion x2' postfix syntax", () => {
      const translator = createMockTranslator({
        items: { Potion: [10, 12] },
      });
      const _node = UsesFormulaNode.create({ text: "Potion x2", translator, row: 5 });

      expect(usesInfo.Potion).toBeDefined();
      expect(usesInfo.Potion[5]).toBe(2);
    });

    it("defaults numNeeded to 1 when no count specified", () => {
      const translator = createMockTranslator({
        items: { Potion: [10] },
      });
      const _node = UsesFormulaNode.create({ text: "Potion", translator, row: 5 });

      expect(usesInfo.Potion[5]).toBe(1);
    });

    it("registers in global usesInfo", () => {
      const translator = createMockTranslator({
        items: { Potion: [10] },
      });
      UsesFormulaNode.create({ text: "Potion", translator, row: 5 });

      expect(usesInfo.Potion).toBeDefined();
      expect(Object.keys(usesInfo.Potion)).toContain("5");
    });
  });

  describe("toPreReqsMetFormula", () => {
    it("generates GTE(checked - used, needed) formula", () => {
      const { node } = buildAndFinalize(
        t => UsesFormulaNode.create({ text: "2x Potion", translator: t, row: 5 }),
        { items: { Potion: [10, 12] } },
      );

      const formula = node.toPreReqsMetFormula();
      // Should include subtraction (checked - used) and comparison with needed
      // The formula involves IF statements for each user and COUNTIF for checked
      expect(formula).toContain(">=");
    });
  });

  describe("toPRUsedFormula", () => {
    it("includes over-consumption check with LT", () => {
      const { node } = buildAndFinalize(
        t => UsesFormulaNode.create({ text: "Potion", translator: t, row: 5 }),
        { items: { Potion: [10] } },
      );

      const formula = node.toPRUsedFormula();
      // OR(LT(total - usedAmount, needed), super.toPRUsedFormula)
      expect(formula).toContain("OR");
    });
  });

  describe("multiple USES on same item", () => {
    it("usesInfo accumulates across rows", () => {
      const translator = createMockTranslator({
        items: { Potion: [10, 12, 14] },
      });
      UsesFormulaNode.create({ text: "2x Potion", translator, row: 5 });
      UsesFormulaNode.create({ text: "1x Potion", translator, row: 6 });

      expect(usesInfo.Potion[5]).toBe(2);
      expect(usesInfo.Potion[6]).toBe(1);
    });
  });

  describe("isDirectlyMissable", () => {
    it("returns true when total needed exceeds total available", () => {
      const translator = createMockTranslator({
        items: { Potion: [10] }, // Only 1 available
      });
      // Row 5 uses 1, row 6 uses 1 — total needed = 2, but only 1 Potion exists
      UsesFormulaNode.create({ text: "Potion", translator, row: 5 });
      const node2 = UsesFormulaNode.create({ text: "Potion", translator, row: 6 });

      translator.setPhase(PHASE.FINALIZING);
      node2.finalize();
      translator.setPhase(PHASE.FINALIZED);

      expect(node2.isDirectlyMissable()).toBe(true);
    });

    it("returns false when sufficient resources exist", () => {
      const translator = createMockTranslator({
        items: { Potion: [10, 12] }, // 2 available
      });
      // Only 1 needed total
      const node = UsesFormulaNode.create({ text: "Potion", translator, row: 5 });

      translator.setPhase(PHASE.FINALIZING);
      node.finalize();
      translator.setPhase(PHASE.FINALIZED);

      expect(node.isDirectlyMissable()).toBe(false);
    });
  });
});
