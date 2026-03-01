import { buildAndFinalize, setupFormulaTests } from "../../test-helpers/setup";
import { EQ, GT, GTE, NE, X_ITEMS } from "../../utilities/formula-helpers";
import { ComparisonFormulaNode } from "./ComparisonFormulaNode";

describe("comparisonFormulaNode", () => {
  setupFormulaTests();

  describe("checkErrors — satisfiability analysis", () => {
    describe("gTE (>=)", () => {
      it("no error when lMax >= rMin (satisfiable)", () => {
        // 3 items exist (lMax=3), need >= 2 (rMin=2). 3 >= 2 is satisfiable.
        const { node } = buildAndFinalize(
          t => ComparisonFormulaNode.create({
            text: "Quest A >= 2",
            translator: t,
            row: 5,
            formulaType: GTE,
          }),
          { items: { "Quest A": [10, 12, 14] } },
        );
        expect(node.hasErrors()).toBe(false);
      });

      it("error when lMax < rMin (unsatisfiable)", () => {
        // Only 1 item exists (lMax=1), need >= 3 (rMin=3). 1 < 3, impossible.
        const { node } = buildAndFinalize(
          t => ComparisonFormulaNode.create({
            text: "Quest A >= 3",
            translator: t,
            row: 5,
            formulaType: GTE,
          }),
          { items: { "Quest A": [10] } },
        );
        expect(node.hasErrors()).toBe(true);
        expect([...node.getErrors()].join()).toContain("cannot be satisfied");
      });

      it("no error at boundary: lMax == rMin", () => {
        // 2 items exist (lMax=2), need >= 2. Exactly satisfiable.
        const { node } = buildAndFinalize(
          t => ComparisonFormulaNode.create({
            text: "Quest A >= 2",
            translator: t,
            row: 5,
            formulaType: GTE,
          }),
          { items: { "Quest A": [10, 12] } },
        );
        expect(node.hasErrors()).toBe(false);
      });
    });

    describe("gT (>)", () => {
      it("no error when lMax > rMin (satisfiable)", () => {
        // 3 items (lMax=3), need > 1 (rMin=1). 3 > 1 is true.
        const { node } = buildAndFinalize(
          t => ComparisonFormulaNode.create({
            text: "Quest A > 1",
            translator: t,
            row: 5,
            formulaType: GT,
          }),
          { items: { "Quest A": [10, 12, 14] } },
        );
        expect(node.hasErrors()).toBe(false);
      });

      it("error when lMax <= rMin (unsatisfiable)", () => {
        // 2 items (lMax=2), need > 2 (rMin=2). 2 <= 2, impossible.
        const { node } = buildAndFinalize(
          t => ComparisonFormulaNode.create({
            text: "Quest A > 2",
            translator: t,
            row: 5,
            formulaType: GT,
          }),
          { items: { "Quest A": [10, 12] } },
        );
        expect(node.hasErrors()).toBe(true);
      });

      it("error at boundary: lMax == rMin (strict inequality)", () => {
        // 1 item (lMax=1), need > 1. 1 is not > 1, unsatisfiable.
        const { node } = buildAndFinalize(
          t => ComparisonFormulaNode.create({
            text: "Quest A > 1",
            translator: t,
            row: 5,
            formulaType: GT,
          }),
          { items: { "Quest A": [10] } },
        );
        expect(node.hasErrors()).toBe(true);
      });
    });

    describe("eQ (==)", () => {
      it("no error when ranges overlap", () => {
        // Left: [0..3], Right: [2..2]. Overlap exists (2,3).
        const { node } = buildAndFinalize(
          t => ComparisonFormulaNode.create({
            text: "Quest A == 2",
            translator: t,
            row: 5,
            formulaType: EQ,
          }),
          { items: { "Quest A": [10, 12, 14] } },
        );
        expect(node.hasErrors()).toBe(false);
      });

      it("error when lMax < rMin (no overlap)", () => {
        // Left: [0..1], Right: [3..3]. No overlap.
        const { node } = buildAndFinalize(
          t => ComparisonFormulaNode.create({
            text: "Quest A == 3",
            translator: t,
            row: 5,
            formulaType: EQ,
          }),
          { items: { "Quest A": [10] } },
        );
        expect(node.hasErrors()).toBe(true);
      });

      it("error when lMin > rMax (no overlap, left above right)", () => {
        // Left is a constant 5, Right is a constant 3. 5 != 3.
        const { node } = buildAndFinalize(
          t => ComparisonFormulaNode.create({
            text: "5 == 3",
            translator: t,
            row: 5,
            formulaType: EQ,
          }),
        );
        expect(node.hasErrors()).toBe(true);
      });

      it("no error when both are same constant", () => {
        const { node } = buildAndFinalize(
          t => ComparisonFormulaNode.create({
            text: "3 == 3",
            translator: t,
            row: 5,
            formulaType: EQ,
          }),
        );
        expect(node.hasErrors()).toBe(false);
      });
    });

    describe("nE (!=)", () => {
      it("no error when ranges have more than one value", () => {
        // Left: [0..2], Right: [1..1]. Not always equal.
        const { node } = buildAndFinalize(
          t => ComparisonFormulaNode.create({
            text: "Quest A != 1",
            translator: t,
            row: 5,
            formulaType: NE,
          }),
          { items: { "Quest A": [10, 12] } },
        );
        expect(node.hasErrors()).toBe(false);
      });

      it("error when both are same single constant (always equal)", () => {
        // Left: [3..3], Right: [3..3]. Always equal, so != is never true.
        const { node } = buildAndFinalize(
          t => ComparisonFormulaNode.create({
            text: "3 != 3",
            translator: t,
            row: 5,
            formulaType: NE,
          }),
        );
        expect(node.hasErrors()).toBe(true);
      });

      it("no error when constants differ", () => {
        const { node } = buildAndFinalize(
          t => ComparisonFormulaNode.create({
            text: "3 != 5",
            translator: t,
            row: 5,
            formulaType: NE,
          }),
        );
        expect(node.hasErrors()).toBe(false);
      });
    });

    describe("x_ITEMS (count syntax)", () => {
      it("no error when enough items exist", () => {
        // "2x Quest A" means need >= 2, and 3 exist (lMax=3). Satisfiable.
        const { node } = buildAndFinalize(
          t => ComparisonFormulaNode.create({
            text: "Quest A x2",
            translator: t,
            row: 5,
            formulaType: X_ITEMS,
          }),
          { items: { "Quest A": [10, 12, 14] } },
        );
        expect(node.hasErrors()).toBe(false);
      });

      it("error when not enough items exist", () => {
        // "3x Quest A" means need >= 3, but only 1 exists (lMax=1).
        const { node } = buildAndFinalize(
          t => ComparisonFormulaNode.create({
            text: "Quest A x3",
            translator: t,
            row: 5,
            formulaType: X_ITEMS,
          }),
          { items: { "Quest A": [10] } },
        );
        expect(node.hasErrors()).toBe(true);
      });
    });
  });

  describe("toPreReqsMetFormula", () => {
    it("gTE generates >= formula", () => {
      const { node } = buildAndFinalize(
        t => ComparisonFormulaNode.create({
          text: "Quest A >= 2",
          translator: t,
          row: 5,
          formulaType: GTE,
        }),
        { items: { "Quest A": [10, 12, 14] } },
      );
      const formula = node.toPreReqsMetFormula();
      expect(formula).toContain(">=");
    });

    it("gT generates > formula", () => {
      const { node } = buildAndFinalize(
        t => ComparisonFormulaNode.create({
          text: "Quest A > 1",
          translator: t,
          row: 5,
          formulaType: GT,
        }),
        { items: { "Quest A": [10, 12, 14] } },
      );
      const formula = node.toPreReqsMetFormula();
      expect(formula).toContain(">");
    });

    it("eQ generates EQ formula", () => {
      const { node } = buildAndFinalize(
        t => ComparisonFormulaNode.create({
          text: "Quest A == 2",
          translator: t,
          row: 5,
          formulaType: EQ,
        }),
        { items: { "Quest A": [10, 12, 14] } },
      );
      const formula = node.toPreReqsMetFormula();
      expect(formula).toContain("EQ");
    });

    it("constant comparison short-circuits", () => {
      // 3 >= 2 is always true
      const { node } = buildAndFinalize(
        t => ComparisonFormulaNode.create({
          text: "3 >= 2",
          translator: t,
          row: 5,
          formulaType: GTE,
        }),
      );
      expect(node.toPreReqsMetFormula()).toBe("TRUE");
    });
  });

  describe("formula generation (_toFormulaByNotStatus)", () => {
    it("gTE/X_ITEMS: uses LT for unknown/missed/prUsed formulas", () => {
      const { node } = buildAndFinalize(
        t => ComparisonFormulaNode.create({
          text: "Quest A >= 2",
          translator: t,
          row: 5,
          formulaType: GTE,
        }),
        { items: { "Quest A": [10, 12, 14] } },
      );
      // toUnknownFormula uses LT(left.byNotStatus(UNKNOWN), right.byStatus(CHECKED))
      const formula = node.toUnknownFormula();
      expect(formula).toContain("<");
    });

    it("gT: uses LTE for formulas", () => {
      const { node } = buildAndFinalize(
        t => ComparisonFormulaNode.create({
          text: "Quest A > 1",
          translator: t,
          row: 5,
          formulaType: GT,
        }),
        { items: { "Quest A": [10, 12, 14] } },
      );
      const formula = node.toUnknownFormula();
      expect(formula).toContain("<=");
    });

    it("eQ: uses OR(LT, GT) for formulas", () => {
      const { node } = buildAndFinalize(
        t => ComparisonFormulaNode.create({
          text: "Quest A == 2",
          translator: t,
          row: 5,
          formulaType: EQ,
        }),
        { items: { "Quest A": [10, 12, 14] } },
      );
      const formula = node.toUnknownFormula();
      expect(formula).toContain("OR");
    });

    it("nE: uses AND(EQ, EQ, EQ) for formulas", () => {
      const { node } = buildAndFinalize(
        t => ComparisonFormulaNode.create({
          text: "Quest A != 1",
          translator: t,
          row: 5,
          formulaType: NE,
        }),
        { items: { "Quest A": [10, 12, 14] } },
      );
      const formula = node.toUnknownFormula();
      expect(formula).toContain("EQ");
    });

    it("returns FALSE when node has errors", () => {
      const { node } = buildAndFinalize(
        t => ComparisonFormulaNode.create({
          text: "Quest A >= 5",
          translator: t,
          row: 5,
          formulaType: GTE,
        }),
        { items: { "Quest A": [10] } }, // Only 1 item, need >= 5
      );
      expect(node.hasErrors()).toBe(true);
      expect(node.toPRUsedFormula()).toBe("FALSE");
      expect(node.toMissedFormula()).toBe("FALSE");
      expect(node.toUnknownFormula()).toBe("FALSE");
    });
  });
});
