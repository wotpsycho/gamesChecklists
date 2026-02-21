import { PHASE } from "../../constants";
import { createMockTranslator } from "../../test-helpers/mock-translator";
import { buildAndFinalize, setupFormulaTests } from "../../test-helpers/setup";
import { BooleanFormulaValueNode } from "./BooleanFormulaValueNode";

describe("BooleanFormulaValueNode", () => {
  setupFormulaTests();

  describe("value detection", () => {
    it("\"TRUE\" text sets value=true", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaValueNode.create({ text: "TRUE", translator: t, row: 5 }),
      );
      expect(node.hasValue()).toBe(true);
    });

    it("\"FALSE\" text sets value=false", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaValueNode.create({ text: "FALSE", translator: t, row: 5 }),
      );
      expect(node.hasValue()).toBe(true);
    });

    it("\"true\" (lowercase) sets value=true", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaValueNode.create({ text: "true", translator: t, row: 5 }),
      );
      expect(node.hasValue()).toBe(true);
    });

    it("item text does not set a value", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaValueNode.create({ text: "Quest A", translator: t, row: 5 }),
        { items: { "Quest A": [10] } },
      );
      expect(node.hasValue()).toBe(false);
    });
  });

  describe("phase requirements", () => {
    it("toPreReqsMetFormula requires FINALIZED phase", () => {
      const translator = createMockTranslator({ items: { "Quest A": [10] } });
      const node = BooleanFormulaValueNode.create({ text: "Quest A", translator, row: 5 });

      // Still in BUILDING phase
      expect(() => node.toPreReqsMetFormula()).toThrow(/FINALIZED/);
    });
  });

  describe("toPreReqsMetFormula", () => {
    it("boolean constant TRUE returns TRUE", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaValueNode.create({ text: "TRUE", translator: t, row: 5 }),
      );
      expect(node.toPreReqsMetFormula()).toBe("TRUE");
    });

    it("boolean constant FALSE returns FALSE", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaValueNode.create({ text: "FALSE", translator: t, row: 5 }),
      );
      expect(node.toPreReqsMetFormula()).toBe("FALSE");
    });

    it("single item (numNeeded==numPossible) returns check cell", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaValueNode.create({ text: "Quest A", translator: t, row: 5 }),
        { items: { "Quest A": [10] } },
      );
      expect(node.toPreReqsMetFormula()).toBe("$A$10");
    });

    it("multiple items, all needed, returns AND of check cells", () => {
      // Use non-consecutive rows so they don't merge into a range
      const { node } = buildAndFinalize(
        t => BooleanFormulaValueNode.create({ text: "Quest A", translator: t, row: 5 }),
        { items: { "Quest A": [10, 12] } },
      );
      expect(node.toPreReqsMetFormula()).toBe("AND($A$10,$A$12)");
    });

    it("consecutive rows get merged into range", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaValueNode.create({ text: "Quest A", translator: t, row: 5 }),
        { items: { "Quest A": [10, 11, 12] } },
      );
      expect(node.toPreReqsMetFormula()).toBe("AND($A$10:$A$12)");
    });
  });

  describe("toPRUsedFormula", () => {
    it("boolean constant returns FALSE", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaValueNode.create({ text: "TRUE", translator: t, row: 5 }),
      );
      expect(node.toPRUsedFormula()).toBe("FALSE");
    });

    it("single item formula uses GTE and LT", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaValueNode.create({ text: "Quest A", translator: t, row: 5 }),
        { items: { "Quest A": [10] } },
      );
      const formula = node.toPRUsedFormula();
      // AND(GTE(total-rawMissed, needed), LT(notUsed, needed))
      expect(formula).toContain("AND");
    });
  });

  describe("toMissedFormula", () => {
    it("boolean constant returns FALSE", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaValueNode.create({ text: "TRUE", translator: t, row: 5 }),
      );
      expect(node.toMissedFormula()).toBe("FALSE");
    });

    it("single item uses LT(notMissed, needed)", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaValueNode.create({ text: "Quest A", translator: t, row: 5 }),
        { items: { "Quest A": [10] } },
      );
      const formula = node.toMissedFormula();
      // LT(notMissed, needed) -> for numPossible=1, needed=1
      expect(formula).toContain("<");
    });
  });

  describe("toUnknownFormula", () => {
    it("boolean constant returns FALSE", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaValueNode.create({ text: "TRUE", translator: t, row: 5 }),
      );
      expect(node.toUnknownFormula()).toBe("FALSE");
    });

    it("single item uses AND(NOT(missed), LT(...))", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaValueNode.create({ text: "Quest A", translator: t, row: 5 }),
        { items: { "Quest A": [10] } },
      );
      const formula = node.toUnknownFormula();
      expect(formula).toContain("AND");
    });
  });

  describe("finalize", () => {
    it("sets numNeeded = numPossible by default", () => {
      // Use non-consecutive rows to avoid range merging
      const { node } = buildAndFinalize(
        t => BooleanFormulaValueNode.create({ text: "Quest A", translator: t, row: 5 }),
        { items: { "Quest A": [10, 12] } },
      );
      // numNeeded = numPossible = 2 -> AND of both check cells required
      expect(node.toPreReqsMetFormula()).toBe("AND($A$10,$A$12)");
    });

    it("is idempotent (second finalize is no-op)", () => {
      const translator = createMockTranslator({ items: { "Quest A": [10] } });
      const node = BooleanFormulaValueNode.create({ text: "Quest A", translator, row: 5 });
      translator.setPhase(PHASE.FINALIZING);
      node.finalize();
      // Calling finalize again should not throw
      node.finalize();
      translator.setPhase(PHASE.FINALIZED);
      expect(node.toPreReqsMetFormula()).toBe("$A$10");
    });
  });

  describe("checkErrors", () => {
    it("errors when numPossible < numNeeded (no items found)", () => {
      const { node } = buildAndFinalize(
        t => BooleanFormulaValueNode.create({ text: "Nonexistent Item", translator: t, row: 5 }),
        { items: {} },
      );
      expect(node.hasErrors()).toBe(true);
    });
  });

  describe("self-referential exclusion", () => {
    it("row is excluded from own rowCounts", () => {
      // Item at row 10, node also at row 10 - should exclude self
      const { node } = buildAndFinalize(
        t => BooleanFormulaValueNode.create({ text: "Quest A", translator: t, row: 10 }),
        { items: { "Quest A": [10, 11] } },
      );
      // Only row 11 should remain (row 10 excluded as self-referential)
      expect(node.toPreReqsMetFormula()).toBe("$A$11");
    });
  });
});
