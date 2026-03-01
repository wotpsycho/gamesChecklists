import { buildAndFinalize, setupFormulaTests } from "../../test-helpers/setup";
import { BlockedUntilFormulaNode } from "./BlockedUntilFormulaNode";

describe("blockedUntilFormulaNode", () => {
  setupFormulaTests();

  describe("create / parsing", () => {
    it("parses 'Boss UNTIL Key' text format", () => {
      const { node } = buildAndFinalize(
        t => BlockedUntilFormulaNode.create({ text: "Boss UNTIL Key", translator: t, row: 5 }),
        { items: { Boss: [10], Key: [11] } },
      );
      // OR(NOT(blocked), until) = OR(NOT($A$10), $A$11)
      // NOT($A$10) is not TRUE/FALSE constant, so OR keeps both
      expect(node.toPreReqsMetFormula()).toBe("OR(NOT($A$10),$A$11)");
    });

    it("accepts explicit blockedText/untilText", () => {
      const { node } = buildAndFinalize(
        t => BlockedUntilFormulaNode.create({ blockedText: "Boss", untilText: "Key", translator: t, row: 5 }),
        { items: { Boss: [10], Key: [11] } },
      );
      expect(node.toPreReqsMetFormula()).toBe("OR(NOT($A$10),$A$11)");
    });
  });

  describe("toPreReqsMetFormula", () => {
    it("returns OR(NOT(blocked), until)", () => {
      const { node } = buildAndFinalize(
        t => BlockedUntilFormulaNode.create({ blockedText: "Boss", untilText: "Key", translator: t, row: 5 }),
        { items: { Boss: [10], Key: [11] } },
      );
      expect(node.toPreReqsMetFormula()).toBe("OR(NOT($A$10),$A$11)");
    });

    it("short-circuits when both resolve to constants", () => {
      // Both TRUE → OR(NOT(TRUE), TRUE) → OR(FALSE, TRUE) → TRUE
      const { node } = buildAndFinalize(
        t => BlockedUntilFormulaNode.create({ blockedText: "TRUE", untilText: "TRUE", translator: t, row: 5 }),
      );
      expect(node.toPreReqsMetFormula()).toBe("TRUE");
    });
  });

  describe("toPRUsedFormula", () => {
    it("returns AND(blocked, until.prUsed)", () => {
      const { node } = buildAndFinalize(
        t => BlockedUntilFormulaNode.create({ blockedText: "Boss", untilText: "Key", translator: t, row: 5 }),
        { items: { Boss: [10], Key: [11] } },
      );
      const formula = node.toPRUsedFormula();
      // AND(blocked.prereqsMet, until.prUsed)
      // blocked.prereqsMet = $A$10, until.prUsed for single item is complex
      expect(formula).toContain("$A$10");
    });
  });

  describe("toRawMissedFormula", () => {
    it("returns AND(blocked, until.rawMissed)", () => {
      const { node } = buildAndFinalize(
        t => BlockedUntilFormulaNode.create({ blockedText: "Boss", untilText: "Key", translator: t, row: 5 }),
        { items: { Boss: [10], Key: [11] } },
      );
      const formula = node.toRawMissedFormula();
      expect(formula).toContain("$A$10");
    });
  });

  describe("toMissedFormula", () => {
    it("returns AND(blocked, until.missed)", () => {
      const { node } = buildAndFinalize(
        t => BlockedUntilFormulaNode.create({ blockedText: "Boss", untilText: "Key", translator: t, row: 5 }),
        { items: { Boss: [10], Key: [11] } },
      );
      const formula = node.toMissedFormula();
      expect(formula).toContain("$A$10");
    });
  });

  describe("toUnknownFormula", () => {
    it("returns AND(blocked, until.unknown)", () => {
      const { node } = buildAndFinalize(
        t => BlockedUntilFormulaNode.create({ blockedText: "Boss", untilText: "Key", translator: t, row: 5 }),
        { items: { Boss: [10], Key: [11] } },
      );
      const formula = node.toUnknownFormula();
      // until.unknown for a single item includes AND(NOT(missed), LT(...))
      // blocked = $A$10, AND($A$10, unknown) - if unknown is FALSE, entire AND is FALSE
      expect(formula).toContain("$A$10");
    });

    it("short-circuits when until unknown is FALSE", () => {
      // Both TRUE constants → until.unknown = FALSE, blocked = TRUE
      // AND(TRUE, FALSE) = FALSE
      const { node } = buildAndFinalize(
        t => BlockedUntilFormulaNode.create({ blockedText: "TRUE", untilText: "TRUE", translator: t, row: 5 }),
      );
      expect(node.toUnknownFormula()).toBe("FALSE");
    });
  });
});
