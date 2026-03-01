import { PHASE } from "../../constants";
import { createMockParser, createMockTranslator } from "../../test-helpers/mock-translator";
import { buildAndFinalize, setupFormulaTests } from "../../test-helpers/setup";
import { virtualItems } from "../shared/registries";
import { OptionFormulaNode } from "./OptionFormulaNode";

describe("optionFormulaNode", () => {
  setupFormulaTests();

  describe("real item option (choice ID refers to existing item)", () => {
    it("resolves to real row and sets numNeeded=1", () => {
      const { node } = buildAndFinalize(
        t => OptionFormulaNode.create({ text: "Choose Weapon", translator: t, row: 5 }),
        { items: { "Choose Weapon": [10] } },
      );
      // Should not error (item exists)
      // The prereqs formula involves the choice row
      const formula = node.toPreReqsMetFormula();
      expect(formula).toBeDefined();
    });

    it("finalize calls addOption on choice parser", () => {
      const translator = createMockTranslator({
        items: { "Choose Weapon": [10] },
      });
      const addOptionCalls: number[] = [];
      translator.registerParser(10, createMockParser({
        addOption: row => addOptionCalls.push(row as number),
        toRawPreReqsMetFormula: () => "TRUE",
        getOptions: () => [5, 6],
      }));

      const node = OptionFormulaNode.create({ text: "Choose Weapon", translator, row: 5 });
      translator.setPhase(PHASE.FINALIZING);
      node.finalize();

      expect(addOptionCalls).toContain(5);
    });

    it("toPreReqsMetFormula uses AND(NOT(OR(optionChecks)), choiceParser.rawPreReqsMet)", () => {
      const translator = createMockTranslator({
        items: { "Choose Weapon": [10] },
      });
      translator.registerParser(10, createMockParser({
        addOption: () => {},
        toRawPreReqsMetFormula: () => "$A$20",
        getOptions: () => [5, 7], // Two options: this row (5) and another (7)
      }));

      const node = OptionFormulaNode.create({ text: "Choose Weapon", translator, row: 5 });
      translator.setPhase(PHASE.FINALIZING);
      node.finalize();
      translator.setPhase(PHASE.FINALIZED);

      const formula = node.toPreReqsMetFormula();
      // AND(NOT(OR(check cells of options)), rawPreReqsMet of choice)
      expect(formula).toContain("NOT");
      expect(formula).toContain("$A$20");
    });

    it("toPRUsedFormula checks status of choice row", () => {
      const translator = createMockTranslator({
        items: { "Choose Weapon": [10] },
      });
      translator.registerParser(10, createMockParser({
        addOption: () => {},
        getOptions: () => [5, 7],
      }));

      const node = OptionFormulaNode.create({ text: "Choose Weapon", translator, row: 5 });
      translator.setPhase(PHASE.FINALIZING);
      node.finalize();
      translator.setPhase(PHASE.FINALIZED);

      const formula = node.toPRUsedFormula();
      // Should check status cell of choice row (10) for PR_USED or CHECKED
      expect(formula).toContain("$F$10"); // Status column = F
    });

    it("toRawMissedFormula always returns FALSE", () => {
      const translator = createMockTranslator({
        items: { "Choose Weapon": [10] },
      });
      translator.registerParser(10, createMockParser({
        addOption: () => {},
        getOptions: () => [5, 7],
      }));

      const node = OptionFormulaNode.create({ text: "Choose Weapon", translator, row: 5 });
      translator.setPhase(PHASE.FINALIZING);
      node.finalize();
      translator.setPhase(PHASE.FINALIZED);

      expect(node.toRawMissedFormula()).toBe("FALSE");
    });

    it("toMissedFormula checks status of choice row for MISSED", () => {
      const translator = createMockTranslator({
        items: { "Choose Weapon": [10] },
      });
      translator.registerParser(10, createMockParser({
        addOption: () => {},
        getOptions: () => [5, 7],
      }));

      const node = OptionFormulaNode.create({ text: "Choose Weapon", translator, row: 5 });
      translator.setPhase(PHASE.FINALIZING);
      node.finalize();
      translator.setPhase(PHASE.FINALIZED);

      const formula = node.toMissedFormula();
      expect(formula).toContain("$F$10"); // Status column
    });
  });

  describe("virtual option (choice ID is not an existing item)", () => {
    it("creates virtualItems entry", () => {
      const translator = createMockTranslator({ items: {} });
      OptionFormulaNode.create({ text: "Virtual Choice", translator, row: 5 });

      expect(virtualItems["Virtual Choice"]).toBeDefined();
      expect(virtualItems["Virtual Choice"].numNeeded).toBe(1);
      expect(virtualItems["Virtual Choice"].rowCounts[5]).toBe(1);
    });

    it("multiple options register on same virtual entry", () => {
      const translator = createMockTranslator({ items: {} });
      OptionFormulaNode.create({ text: "Virtual Choice", translator, row: 5 });
      OptionFormulaNode.create({ text: "Virtual Choice", translator, row: 6 });

      expect(virtualItems["Virtual Choice"].rowCounts[5]).toBe(1);
      expect(virtualItems["Virtual Choice"].rowCounts[6]).toBe(1);
    });

    it("toPreReqsMetFormula returns NOT(prUsed) for virtual", () => {
      const translator = createMockTranslator({ items: {} });
      const node1 = OptionFormulaNode.create({ text: "Virtual Choice", translator, row: 5 });
      OptionFormulaNode.create({ text: "Virtual Choice", translator, row: 7 });

      translator.setPhase(PHASE.FINALIZING);
      node1.finalize();
      translator.setPhase(PHASE.FINALIZED);

      const formula = node1.toPreReqsMetFormula();
      expect(formula).toContain("NOT");
    });

    it("toPRUsedFormula returns OR of option check cells for virtual", () => {
      const translator = createMockTranslator({ items: {} });
      const node1 = OptionFormulaNode.create({ text: "Virtual Choice", translator, row: 5 });
      OptionFormulaNode.create({ text: "Virtual Choice", translator, row: 7 });

      translator.setPhase(PHASE.FINALIZING);
      node1.finalize();
      translator.setPhase(PHASE.FINALIZED);

      const formula = node1.toPRUsedFormula();
      // OR of check cells for rows 5 and 7
      expect(formula).toContain("OR");
      expect(formula).toContain("$A$5");
      expect(formula).toContain("$A$7");
    });

    it("toMissedFormula returns FALSE for virtual", () => {
      const translator = createMockTranslator({ items: {} });
      const node1 = OptionFormulaNode.create({ text: "Virtual Choice", translator, row: 5 });
      OptionFormulaNode.create({ text: "Virtual Choice", translator, row: 7 });

      translator.setPhase(PHASE.FINALIZING);
      node1.finalize();
      translator.setPhase(PHASE.FINALIZED);

      expect(node1.toMissedFormula()).toBe("FALSE");
    });
  });

  describe("checkErrors", () => {
    it("reports error when only 1 option exists", () => {
      const translator = createMockTranslator({ items: {} });
      const node = OptionFormulaNode.create({ text: "Lonely Choice", translator, row: 5 });

      translator.setPhase(PHASE.FINALIZING);
      node.finalize();
      translator.setPhase(PHASE.FINALIZED);

      expect(node.hasErrors()).toBe(true);
      expect([...node.getErrors()].join()).toContain("only OPTION");
    });
  });
});
