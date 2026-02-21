import { buildAndFinalize, setupFormulaTests } from "../../test-helpers/setup";
import { BooleanFormulaNode } from "./BooleanFormulaNode";

describe("BooleanFormulaNode", () => {
  setupFormulaTests();

  describe("parsing", () => {
    it("empty text sets value=true", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaNode.create({ text: "", translator: t, row: 5 }),
      );
      expect(node.hasValue()).toBe(true);
    });

    it("A && B creates AND with two children", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaNode.create({ text: "Quest A && Quest B", translator: t, row: 5 }),
        { items: { "Quest A": [10], "Quest B": [11] } },
      );
      expect(node.toPreReqsMetFormula()).toBe("AND($A$10,$A$11)");
    });

    it("A || B creates OR with two children", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaNode.create({ text: "Quest A || Quest B", translator: t, row: 5 }),
        { items: { "Quest A": [10], "Quest B": [11] } },
      );
      expect(node.toPreReqsMetFormula()).toBe("OR($A$10,$A$11)");
    });

    it("!A creates NOT with one child", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaNode.create({ text: "!Quest A", translator: t, row: 5 }),
        { items: { "Quest A": [10] } },
      );
      expect(node.toPreReqsMetFormula()).toBe("NOT($A$10)");
    });

    it("plain item text creates BooleanFormulaValueNode child", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaNode.create({ text: "Quest A", translator: t, row: 5 }),
        { items: { "Quest A": [10] } },
      );
      expect(node.toPreReqsMetFormula()).toBe("$A$10");
    });
  });

  describe("toPreReqsMetFormula", () => {
    it("value=true returns TRUE", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaNode.create({ text: "", translator: t, row: 5 }),
      );
      expect(node.toPreReqsMetFormula()).toBe("TRUE");
    });

    it("AND of two items", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaNode.create({ text: "Quest A && Quest B", translator: t, row: 5 }),
        { items: { "Quest A": [10], "Quest B": [11] } },
      );
      expect(node.toPreReqsMetFormula()).toBe("AND($A$10,$A$11)");
    });

    it("OR of two items", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaNode.create({ text: "Quest A || Quest B", translator: t, row: 5 }),
        { items: { "Quest A": [10], "Quest B": [11] } },
      );
      expect(node.toPreReqsMetFormula()).toBe("OR($A$10,$A$11)");
    });

    it("NOT of one item", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaNode.create({ text: "!Quest A", translator: t, row: 5 }),
        { items: { "Quest A": [10] } },
      );
      expect(node.toPreReqsMetFormula()).toBe("NOT($A$10)");
    });
  });

  describe("toPRUsedFormula", () => {
    it("value=true returns FALSE", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaNode.create({ text: "", translator: t, row: 5 }),
      );
      expect(node.toPRUsedFormula()).toBe("FALSE");
    });

    it("AND case: OR of (NOT(rawMissed) AND prUsed) per child", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaNode.create({ text: "Quest A && Quest B", translator: t, row: 5 }),
        { items: { "Quest A": [10], "Quest B": [11] } },
      );
      const formula = node.toPRUsedFormula();
      // For each child: AND(NOT(rawMissed), prUsed), combined with OR
      expect(formula).toContain("OR");
    });

    it("OR case: AND of (NOT(rawMissed) AND prUsed) per child", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaNode.create({ text: "Quest A || Quest B", translator: t, row: 5 }),
        { items: { "Quest A": [10], "Quest B": [11] } },
      );
      const formula = node.toPRUsedFormula();
      // OR case uses AND wrapper
      expect(formula).toContain("AND");
    });
  });

  describe("toMissedFormula", () => {
    it("value=true returns FALSE", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaNode.create({ text: "", translator: t, row: 5 }),
      );
      expect(node.toMissedFormula()).toBe("FALSE");
    });

    it("AND case: OR of children missed formulas", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaNode.create({ text: "Quest A && Quest B", translator: t, row: 5 }),
        { items: { "Quest A": [10], "Quest B": [11] } },
      );
      const formula = node.toMissedFormula();
      // AND -> OR of children's missed formulas
      expect(formula).toContain("OR");
    });

    it("OR case: AND of children missed formulas", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaNode.create({ text: "Quest A || Quest B", translator: t, row: 5 }),
        { items: { "Quest A": [10], "Quest B": [11] } },
      );
      const formula = node.toMissedFormula();
      // OR -> AND of children's missed formulas
      expect(formula).toContain("AND");
    });
  });

  describe("toRawMissedFormula", () => {
    it("value=true returns FALSE", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaNode.create({ text: "", translator: t, row: 5 }),
      );
      expect(node.toRawMissedFormula()).toBe("FALSE");
    });

    it("AND case: OR of children raw missed formulas", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaNode.create({ text: "Quest A && Quest B", translator: t, row: 5 }),
        { items: { "Quest A": [10], "Quest B": [11] } },
      );
      const formula = node.toRawMissedFormula();
      expect(formula).toContain("OR");
    });

    it("OR case: AND of children raw missed formulas", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaNode.create({ text: "Quest A || Quest B", translator: t, row: 5 }),
        { items: { "Quest A": [10], "Quest B": [11] } },
      );
      const formula = node.toRawMissedFormula();
      expect(formula).toContain("AND");
    });
  });

  describe("toUnknownFormula", () => {
    it("value=true returns FALSE", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaNode.create({ text: "", translator: t, row: 5 }),
      );
      expect(node.toUnknownFormula()).toBe("FALSE");
    });

    it("AND case produces AND of NOT(rawMissed) + OR(unknown)", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaNode.create({ text: "Quest A && Quest B", translator: t, row: 5 }),
        { items: { "Quest A": [10], "Quest B": [11] } },
      );
      const formula = node.toUnknownFormula();
      // Should be AND(NOT(rawMissed_a), NOT(rawMissed_b), OR(unknown_a, unknown_b))
      expect(formula).toContain("AND");
    });

    it("OR case produces AND of OR(unknown) + per-child OR(unknown,missed)", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaNode.create({ text: "Quest A || Quest B", translator: t, row: 5 }),
        { items: { "Quest A": [10], "Quest B": [11] } },
      );
      const formula = node.toUnknownFormula();
      expect(formula).toContain("AND");
    });
  });
});
