import { STATUS } from "../../../shared-types";
import { PHASE } from "../../constants";
import { createMockTranslator } from "../../test-helpers/mock-translator";
import { buildAndFinalize, setupFormulaTests } from "../../test-helpers/setup";
import { BooleanFormulaNode } from "../boolean/BooleanFormulaNode";
import { RootNode } from "./RootNode";

describe("rootNode", () => {
  setupFormulaTests();

  describe("no pre-reqs (empty children)", () => {
    it("initializes with value=true", () => {
      const { node } = buildAndFinalize(
        t => new RootNode([], t, 5),
      );
      expect(node.hasValue()).toBe(true);
    });

    it("toPreReqsMetFormula returns TRUE", () => {
      const { node } = buildAndFinalize(
        t => new RootNode([], t, 5),
      );
      expect(node.toPreReqsMetFormula()).toBe("TRUE");
    });

    it("toPRUsedFormula returns FALSE", () => {
      const { node } = buildAndFinalize(
        t => new RootNode([], t, 5),
      );
      expect(node.toPRUsedFormula()).toBe("FALSE");
    });

    it("toMissedFormula returns FALSE", () => {
      const { node } = buildAndFinalize(
        t => new RootNode([], t, 5),
      );
      expect(node.toMissedFormula()).toBe("FALSE");
    });

    it("toUnknownFormula returns FALSE", () => {
      const { node } = buildAndFinalize(
        t => new RootNode([], t, 5),
      );
      expect(node.toUnknownFormula()).toBe("FALSE");
    });

    it("toCheckedFormula returns check cell A1 reference", () => {
      const { node } = buildAndFinalize(
        t => new RootNode([], t, 5),
      );
      expect(node.toCheckedFormula()).toBe("$A$5");
    });

    it("toStatusFormula short-circuits via IFS optimization", () => {
      const { node } = buildAndFinalize(
        t => new RootNode([], t, 5),
      );
      const formula = node.toStatusFormula();
      // Error is FALSE (no errors), so dropped from IFS
      // Checked = $A$5, value = "CHECKED"
      // Available = TRUE (STATUS.AVAILABLE="TRUE" -> VALUE("TRUE") -> TRUE), so IFS short-circuits
      // STATUS.AVAILABLE's VALUE is also TRUE (boolean), so the IFS ends: TRUE,TRUE
      expect(formula).toBe("IFS($A$5,\"CHECKED\",TRUE,TRUE)");
    });
  });

  describe("addChild", () => {
    it("activates AND mode on first child (the 0508f88 fix)", () => {
      const translator = createMockTranslator({
        items: { "Quest A": [10] },
      });
      const root = new RootNode([], translator, 5);
      // Initially has value=true
      expect(root.hasValue()).toBe(true);

      translator.setPhase(PHASE.FINALIZING);
      const child = BooleanFormulaNode.create({ text: "Quest A", translator, row: 5 });
      root.addChild(child);
      root.finalize();

      // Now should NOT have value (cleared for AND mode)
      expect(root.hasValue()).toBe(false);

      translator.setPhase(PHASE.FINALIZED);
      // Should delegate to child
      expect(root.toPreReqsMetFormula()).toBe("$A$10");
    });

    it("requires FINALIZING phase", () => {
      const translator = createMockTranslator({
        items: { "Quest A": [10] },
      });
      const root = new RootNode([], translator, 5);
      const child = BooleanFormulaNode.create({ text: "Quest A", translator, row: 5 });

      // BUILDING phase - should throw
      expect(() => root.addChild(child)).toThrow(/FINALIZING/);

      translator.setPhase(PHASE.FINALIZING);
      root.addChild(child);
      root.finalize();

      // FINALIZED phase - should also throw
      translator.setPhase(PHASE.FINALIZED);
      expect(() => root.addChild(child)).toThrow(/FINALIZING/);
    });

    it("multiple children produce AND formula", () => {
      const translator = createMockTranslator({
        items: { "Quest A": [10], "Quest B": [11] },
      });
      const root = new RootNode([], translator, 5);

      translator.setPhase(PHASE.FINALIZING);
      root.addChild(BooleanFormulaNode.create({ text: "Quest A", translator, row: 5 }));
      root.addChild(BooleanFormulaNode.create({ text: "Quest B", translator, row: 5 }));
      root.finalize();

      translator.setPhase(PHASE.FINALIZED);
      expect(root.toPreReqsMetFormula()).toBe("AND($A$10,$A$11)");
    });
  });

  describe("with children (constructed with non-empty array)", () => {
    it("sets formulaType=AND and clears value", () => {
      const { node } = buildAndFinalize(
        t => new RootNode(
          [BooleanFormulaNode.create({ text: "Quest A", translator: t, row: 5 })],
          t,
          5,
        ),
        { items: { "Quest A": [10] } },
      );
      expect(node.hasValue()).toBe(false);
    });

    it("toPreReqsMetFormula delegates to AND of children for single item", () => {
      const { node } = buildAndFinalize(
        t => new RootNode(
          [BooleanFormulaNode.create({ text: "Quest A", translator: t, row: 5 })],
          t,
          5,
        ),
        { items: { "Quest A": [10] } },
      );
      expect(node.toPreReqsMetFormula()).toBe("$A$10");
    });

    it("toPreReqsMetFormula for multiple items", () => {
      const { node } = buildAndFinalize(
        t => new RootNode(
          [
            BooleanFormulaNode.create({ text: "Quest A", translator: t, row: 5 }),
            BooleanFormulaNode.create({ text: "Quest B", translator: t, row: 5 }),
          ],
          t,
          5,
        ),
        { items: { "Quest A": [10], "Quest B": [11] } },
      );
      expect(node.toPreReqsMetFormula()).toBe("AND($A$10,$A$11)");
    });

    it("toStatusFormula produces full IFS structure", () => {
      const { node } = buildAndFinalize(
        t => new RootNode(
          [BooleanFormulaNode.create({ text: "Quest A", translator: t, row: 5 })],
          t,
          5,
        ),
        { items: { "Quest A": [10] } },
      );
      const formula = node.toStatusFormula();
      expect(formula).toContain("IFS");
      expect(formula).toContain(`"${STATUS.CHECKED}"`);
    });
  });

  describe("options", () => {
    it("isControlled returns false by default", () => {
      const { node } = buildAndFinalize(
        t => new RootNode([], t, 5),
      );
      expect(node.isControlled()).toBe(false);
    });

    it("addOption/getOptions tracks option rows", () => {
      const translator = createMockTranslator();
      const root = new RootNode([], translator, 5);
      translator.setPhase(PHASE.FINALIZING);
      root.addOption(10);
      root.addOption(11);
      root.finalize();
      translator.setPhase(PHASE.FINALIZED);
      expect(root.isControlled()).toBe(true);
      expect(root.getOptions()).toEqual([10, 11]);
    });

    it("toPreReqsMetFormula with options delegates to option parsers", () => {
      const translator = createMockTranslator({
        items: { "Choice A": [10], "Choice B": [11] },
      });
      const root = new RootNode([], translator, 5);

      // Register parsers for option rows
      translator.registerParser(10, {
        toPreReqsMetFormula: () => "$A$20",
        toRawMissedFormula: () => "FALSE",
        toMissedFormula: () => "FALSE",
        toPRUsedFormula: () => "FALSE",
        toUnknownFormula: () => "FALSE",
        getAllPossiblePreReqRows: () => new Set(),
        getCircularDependencies: () => new Set(),
        isDirectlyMissable: () => false,
        isInCircularDependency: () => false,
      });
      translator.registerParser(11, {
        toPreReqsMetFormula: () => "$A$21",
        toRawMissedFormula: () => "FALSE",
        toMissedFormula: () => "FALSE",
        toPRUsedFormula: () => "FALSE",
        toUnknownFormula: () => "FALSE",
        getAllPossiblePreReqRows: () => new Set(),
        getCircularDependencies: () => new Set(),
        isDirectlyMissable: () => false,
        isInCircularDependency: () => false,
      });

      translator.setPhase(PHASE.FINALIZING);
      root.addOption(10);
      root.addOption(11);
      root.finalize();
      translator.setPhase(PHASE.FINALIZED);

      expect(root.toPreReqsMetFormula()).toBe("OR($A$20,$A$21)");
    });

    it("toControlledFormula returns OR of option check cells", () => {
      const translator = createMockTranslator();
      const root = new RootNode([], translator, 5);
      translator.setPhase(PHASE.FINALIZING);
      root.addOption(10);
      root.addOption(12); // Non-consecutive to avoid range merging
      root.finalize();
      translator.setPhase(PHASE.FINALIZED);

      expect(root.toControlledFormula()).toBe("OR($A$10,$A$12)");
    });
  });
});
