import { createMockParser } from "../../test-helpers/mock-translator";
import { buildAndFinalize, setupFormulaTests } from "../../test-helpers/setup";
import { GeneratedBlockedUntilFormulaNode } from "./GeneratedBlockedUntilFormulaNode";

describe("GeneratedBlockedUntilFormulaNode", () => {
  setupFormulaTests();

  describe("uncontrolled row", () => {
    it("toPreReqsMetFormula delegates to super (BlockedUntilFormulaNode)", () => {
      const { node } = buildAndFinalize(
        t => GeneratedBlockedUntilFormulaNode.create({ blockedText: "Boss", untilText: "Key", translator: t, row: 5 }),
        { items: { "Boss": [10], "Key": [11] } },
      );
      expect(node.toPreReqsMetFormula()).toBe("OR(NOT($A$10),$A$11)");
    });

    it("toPRUsedFormula delegates to super", () => {
      const { node } = buildAndFinalize(
        t => GeneratedBlockedUntilFormulaNode.create({ blockedText: "Boss", untilText: "Key", translator: t, row: 5 }),
        { items: { "Boss": [10], "Key": [11] } },
      );
      const formula = node.toPRUsedFormula();
      expect(formula).toContain("$A$10");
    });

    it("toMissedFormula delegates to super", () => {
      const { node } = buildAndFinalize(
        t => GeneratedBlockedUntilFormulaNode.create({ blockedText: "Boss", untilText: "Key", translator: t, row: 5 }),
        { items: { "Boss": [10], "Key": [11] } },
      );
      const formula = node.toMissedFormula();
      expect(formula).toContain("$A$10");
    });

    it("toUnknownFormula delegates to super", () => {
      const { node } = buildAndFinalize(
        t => GeneratedBlockedUntilFormulaNode.create({ blockedText: "Boss", untilText: "Key", translator: t, row: 5 }),
        { items: { "Boss": [10], "Key": [11] } },
      );
      const formula = node.toUnknownFormula();
      expect(formula).toContain("$A$10");
    });
  });

  describe("controlled row", () => {
    it("toPreReqsMetFormula returns TRUE", () => {
      const { node, translator } = buildAndFinalize(
        t => GeneratedBlockedUntilFormulaNode.create({ blockedText: "Boss", untilText: "Key", translator: t, row: 5 }),
        { items: { "Boss": [10], "Key": [11] } },
      );
      // Register a controlled parser for this node's row
      translator.registerParser(5, createMockParser({ isControlled: () => true }));
      expect(node.toPreReqsMetFormula()).toBe("TRUE");
    });

    it("toPRUsedFormula returns FALSE", () => {
      const { node, translator } = buildAndFinalize(
        t => GeneratedBlockedUntilFormulaNode.create({ blockedText: "Boss", untilText: "Key", translator: t, row: 5 }),
        { items: { "Boss": [10], "Key": [11] } },
      );
      translator.registerParser(5, createMockParser({ isControlled: () => true }));
      expect(node.toPRUsedFormula()).toBe("FALSE");
    });

    it("toMissedFormula returns FALSE", () => {
      const { node, translator } = buildAndFinalize(
        t => GeneratedBlockedUntilFormulaNode.create({ blockedText: "Boss", untilText: "Key", translator: t, row: 5 }),
        { items: { "Boss": [10], "Key": [11] } },
      );
      translator.registerParser(5, createMockParser({ isControlled: () => true }));
      expect(node.toMissedFormula()).toBe("FALSE");
    });

    it("toUnknownFormula returns FALSE", () => {
      const { node, translator } = buildAndFinalize(
        t => GeneratedBlockedUntilFormulaNode.create({ blockedText: "Boss", untilText: "Key", translator: t, row: 5 }),
        { items: { "Boss": [10], "Key": [11] } },
      );
      translator.registerParser(5, createMockParser({ isControlled: () => true }));
      expect(node.toUnknownFormula()).toBe("FALSE");
    });
  });

  describe("dependency tracking", () => {
    it("getAllPossiblePreReqRows returns empty set", () => {
      const { node } = buildAndFinalize(
        t => GeneratedBlockedUntilFormulaNode.create({ blockedText: "Boss", untilText: "Key", translator: t, row: 5 }),
        { items: { "Boss": [10], "Key": [11] } },
      );
      expect(node.getAllPossiblePreReqRows().size).toBe(0);
    });

    it("getDirectPreReqRows returns empty set", () => {
      const { node } = buildAndFinalize(
        t => GeneratedBlockedUntilFormulaNode.create({ blockedText: "Boss", untilText: "Key", translator: t, row: 5 }),
        { items: { "Boss": [10], "Key": [11] } },
      );
      expect(node.getDirectPreReqRows().size).toBe(0);
    });
  });
});
