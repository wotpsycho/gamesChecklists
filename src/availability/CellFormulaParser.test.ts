import { buildParsers, setupFormulaTests } from "./test-helpers/setup";

describe("cellFormulaParser integration", () => {
  setupFormulaTests();

  describe("basic prerequisites", () => {
    it("empty prereq produces short IFS status formula", () => {
      const { parsers } = buildParsers({
        items: { "Quest A": [10] },
        prereqs: { 10: "" },
      });
      expect(parsers[10].toStatusFormula()).toBe("IFS($A$10,\"CHECKED\",TRUE,TRUE)");
    });

    it("single item prereq", () => {
      const { parsers } = buildParsers({
        items: { "Quest A": [10], "Target": [14] },
        prereqs: { 14: "Quest A" },
      });
      expect(parsers[14].toPreReqsMetFormula()).toBe("$A$10");
    });

    it("multiple items on separate lines produce AND", () => {
      const { parsers } = buildParsers({
        items: { "Quest A": [10], "Quest B": [14], "Target": [20] },
        prereqs: { 20: "Quest A\nQuest B" },
      });
      expect(parsers[20].toPreReqsMetFormula()).toBe("AND($A$10,$A$14)");
    });

    it("semicolons split like newlines", () => {
      const { parsers } = buildParsers({
        items: { "Quest A": [10], "Quest B": [14], "Target": [20] },
        prereqs: { 20: "Quest A;Quest B" },
      });
      expect(parsers[20].toPreReqsMetFormula()).toBe("AND($A$10,$A$14)");
    });

    it("line continuation with ... merges lines", () => {
      const { parsers } = buildParsers({
        items: { A: [10], B: [14], Target: [20] },
        prereqs: { 20: "A &&\n... B" },
      });
      expect(parsers[20].toPreReqsMetFormula()).toBe("AND($A$10,$A$14)");
    });

    it("quoted item name preserves special characters", () => {
      const { parsers } = buildParsers({
        items: { "A || B": [10], "Target": [20] },
        prereqs: { 20: "\"A || B\"" },
      });
      // The || inside quotes is NOT treated as OR operator
      expect(parsers[20].toPreReqsMetFormula()).toBe("$A$10");
    });
  });

  describe("boolean operators", () => {
    it("oR operator", () => {
      const { parsers } = buildParsers({
        items: { A: [10], B: [14], Target: [20] },
        prereqs: { 20: "A || B" },
      });
      expect(parsers[20].toPreReqsMetFormula()).toBe("OR($A$10,$A$14)");
    });

    it("explicit AND operator", () => {
      const { parsers } = buildParsers({
        items: { A: [10], B: [14], Target: [20] },
        prereqs: { 20: "A && B" },
      });
      expect(parsers[20].toPreReqsMetFormula()).toBe("AND($A$10,$A$14)");
    });

    it("nOT operator", () => {
      const { parsers } = buildParsers({
        items: { A: [10], Target: [20] },
        prereqs: { 20: "!A" },
      });
      expect(parsers[20].toPreReqsMetFormula()).toBe("NOT($A$10)");
    });

    it("parenthesized grouping: (A || B) && C", () => {
      const { parsers } = buildParsers({
        items: { A: [10], B: [14], C: [16], Target: [20] },
        prereqs: { 20: "(A || B) && C" },
      });
      expect(parsers[20].toPreReqsMetFormula()).toBe("AND(OR($A$10,$A$14),$A$16)");
    });
  });

  describe("special prefixes", () => {
    it("mISSED prefix", () => {
      const { parsers } = buildParsers({
        items: { "Kill Boss": [10], "Spare Boss": [14] },
        prereqs: { 14: "MISSED Kill Boss" },
      });
      expect(parsers[14].toPreReqsMetFormula()).toBe("NOT($A$10)");
      expect(parsers[14].toMissedFormula()).toBe("$A$10");
      expect(parsers[14].toPRUsedFormula()).toBe("FALSE");
    });

    it("oPTIONAL prefix", () => {
      const { parsers } = buildParsers({
        items: { Bonus: [10], Target: [14] },
        prereqs: { 14: "OPTIONAL Bonus" },
      });
      expect(parsers[14].toPreReqsMetFormula()).toBe("NOT($A$10)");
      expect(parsers[14].toPRUsedFormula()).toBe("$A$10");
      expect(parsers[14].toMissedFormula()).toBe("FALSE");
      expect(parsers[14].toUnknownFormula()).toBe("FALSE");
    });

    it("cHECKED flag creates controlled root", () => {
      const { parsers } = buildParsers({
        items: { Tutorial: [10] },
        prereqs: { 10: "CHECKED" },
      });
      expect(parsers[10].isControlled()).toBe(true);
      expect(parsers[10].toControlledFormula()).toBe("TRUE");
    });

    it("iNITIAL flag same as CHECKED", () => {
      const { parsers } = buildParsers({
        items: { Tutorial: [10] },
        prereqs: { 10: "INITIAL" },
      });
      expect(parsers[10].isControlled()).toBe(true);
      expect(parsers[10].toControlledFormula()).toBe("TRUE");
    });

    it("pERSIST flag does not break formula generation", () => {
      const { parsers } = buildParsers({
        items: { Unlockable: [10] },
        prereqs: { 10: "PERSIST" },
      });
      // PERSIST is a flag on the root node, doesn't change the formula itself
      expect(parsers[10].toStatusFormula()).toBe("IFS($A$10,\"CHECKED\",TRUE,TRUE)");
    });
  });

  describe("oPTION", () => {
    it("virtual choice: two options with no real item", () => {
      const { parsers } = buildParsers({
        items: { Sword: [10], Shield: [14] },
        prereqs: {
          10: "OPTION Pick Weapon",
          14: "OPTION Pick Weapon",
        },
      });
      // Virtual choice: toPRUsedFormula = OR of check cells
      expect(parsers[10].toPRUsedFormula()).toBe("OR($A$10,$A$14)");
      expect(parsers[14].toPRUsedFormula()).toBe("OR($A$10,$A$14)");
      expect(parsers[10].hasErrors()).toBe(false);
      expect(parsers[14].hasErrors()).toBe(false);
    });

    it("real item choice: options register on choice row", () => {
      const { parsers } = buildParsers({
        items: {
          "Gate": [8],
          "Pick Familiar": [10],
          "Cat": [14],
          "Dog": [16],
        },
        prereqs: {
          10: "Gate",
          14: "OPTION Pick Familiar",
          16: "OPTION Pick Familiar",
        },
      });
      expect(parsers[10].isControlled()).toBe(true);
      expect(parsers[10].getOptions()).toEqual([14, 16]);
    });

    it("single OPTION reports error", () => {
      const { parsers } = buildParsers({
        items: { Lonely: [10] },
        prereqs: { 10: "OPTION Lonely Choice" },
      });
      expect(parsers[10].hasErrors()).toBe(true);
      expect([...parsers[10].getErrors()].join()).toContain("only OPTION");
    });
  });

  describe("bLOCKS/UNTIL", () => {
    it("injects constraints into blocked rows, skips UNTIL prereq rows", () => {
      // Row 10: "Open Gate" — the BLOCKS row. Has prereq "Dungeon Key" and BLOCKS statement.
      // Row 14: "Dungeon Key" — prereq of Open Gate (and of UNTIL), should NOT be blocked
      // Row 18: "Dungeon Chest 1" — should be blocked
      // Row 22: "Dungeon Chest 2" — should be blocked
      // Row 26: "Open Gate Trigger" — the UNTIL target, at a different row than BLOCKS row
      const { parsers } = buildParsers({
        items: {
          "Open Gate": [10],
          "Dungeon Key": [14],
          "Dungeon Chest 1": [18],
          "Dungeon Chest 2": [22],
          "Open Gate Trigger": [26],
        },
        prereqs: {
          10: "Dungeon Key\nBLOCKS Dungeon* UNTIL Open Gate Trigger",
          14: "", // Dungeon Key has no prereqs
          18: "", // Should be blocked
          22: "", // Should be blocked
          26: "Open Gate", // Open Gate Trigger depends on Open Gate (row 10)
        },
      });
      // "BLOCKS Dungeon*" matches rows 14, 18, 22
      // "UNTIL Open Gate Trigger" resolves to row 26
      // UNTIL child's getAllPossiblePreReqRows: {26, 10, 14} (row 26 → row 10 → row 14)
      // So row 14 is NOT blocked (transitive prereq of UNTIL)
      // Rows 18 and 22 ARE blocked
      expect(parsers[14].toPreReqsMetFormula()).toBe("TRUE"); // No blocking, no prereqs
      // Blocked rows get GeneratedBlockedUntilFormulaNode injected via addChild
      expect(parsers[18].toStatusFormula()).toContain("IFS");
      expect(parsers[22].toStatusFormula()).toContain("IFS");
      // No errors on the BLOCKS row
      expect(parsers[10].hasErrors()).toBe(false);
    });

    it("bLOCKS without UNTIL reports error", () => {
      const { parsers } = buildParsers({
        items: { Blocker: [10], Boss: [14] },
        prereqs: { 10: "BLOCKS Boss" },
      });
      expect(parsers[10].hasErrors()).toBe(true);
      expect([...parsers[10].getErrors()].join()).toContain("Missing UNTIL");
    });
  });

  describe("uSES resource tracking", () => {
    it("single consumer", () => {
      const { parsers } = buildParsers({
        items: { Potion: [10, 14], Heal: [20] },
        prereqs: { 20: "USES 1x Potion" },
      });
      const formula = parsers[20].toPreReqsMetFormula();
      // (checked - used) >= needed
      expect(formula).toContain(">=");
      expect(formula).toContain("-");
    });

    it("multiple consumers share resource pool", () => {
      const { parsers } = buildParsers({
        items: { "Potion": [10, 14, 18], "Heal 1": [22], "Heal 2": [26] },
        prereqs: {
          22: "USES 2x Potion",
          26: "USES 1x Potion",
        },
      });
      // Total needed = 3, total available = 3 — no errors
      expect(parsers[22].hasErrors()).toBe(false);
      expect(parsers[26].hasErrors()).toBe(false);
      // Both formulas reference IF-based usage tracking
      expect(parsers[22].toPreReqsMetFormula()).toContain("IF");
      expect(parsers[26].toPreReqsMetFormula()).toContain("IF");
    });
  });

  describe("lINKED tasks", () => {
    it("lINKED creates controlled root with linked children", () => {
      const { parsers } = buildParsers({
        items: { "Main Quest": [10], "Step 1": [14], "Step 2": [18] },
        prereqs: {
          10: "LINKED\nStep 1\nStep 2",
        },
      });
      expect(parsers[10].isControlled()).toBe(true);
      // toControlledFormula: AND of all children's prereqsMet
      expect(parsers[10].toControlledFormula()).toBe("AND($A$14,$A$18)");
      // toPreReqsMetFormula: OR of linked children's (available AND unchecked)
      const formula = parsers[10].toPreReqsMetFormula();
      expect(formula).toContain("OR");
      expect(formula).toContain("NOT"); // NOT(checkCell) for unchecked
    });

    it("unlinked + linked children produce AND(unlinked, OR(linked))", () => {
      const { parsers } = buildParsers({
        items: { "Main": [10], "Gate": [8], "Step 1": [14], "Step 2": [18] },
        prereqs: {
          10: "Gate\nLINKED\nStep 1\nStep 2",
        },
      });
      const formula = parsers[10].toPreReqsMetFormula();
      expect(formula).toContain("AND");
      expect(formula).toContain("$A$8"); // Gate
      expect(formula).toContain("OR"); // linked availability
    });
  });

  describe("wildcards and comparisons", () => {
    it("wildcard pattern matches multiple items", () => {
      const { parsers } = buildParsers({
        items: { "Quest 1": [10], "Quest 2": [14], "Quest 3": [18], "Target": [22] },
        prereqs: { 22: "Quest*" },
      });
      // numNeeded = numPossible = 3, so AND of all check cells
      expect(parsers[22].toPreReqsMetFormula()).toBe("AND($A$10,$A$14,$A$18)");
    });

    it("x_ITEMS count syntax: 2x Quest* (fewer than total)", () => {
      const { parsers } = buildParsers({
        items: { "Quest 1": [10], "Quest 2": [14], "Quest 3": [18], "Target": [22] },
        prereqs: { 22: "2x Quest*" },
      });
      // 3 items match but only 2 needed → uses COUNTIF
      const formula = parsers[22].toPreReqsMetFormula();
      expect(formula).toContain("COUNTIF");
      expect(formula).toContain(">=");
    });

    it("constant comparison short-circuits", () => {
      const { parsers } = buildParsers({
        items: { Target: [10] },
        prereqs: { 10: "3 >= 2" },
      });
      // 3 >= 2 is always true
      expect(parsers[10].toPreReqsMetFormula()).toBe("TRUE");
    });
  });

  describe("combinations", () => {
    it("normal prereq + MISSED on same row", () => {
      const { parsers } = buildParsers({
        items: { "Quest A": [10], "Kill Boss": [14], "Target": [20] },
        prereqs: { 20: "Quest A\nMISSED Kill Boss" },
      });
      expect(parsers[20].toPreReqsMetFormula()).toBe("AND($A$10,NOT($A$14))");
      expect(parsers[20].toMissedFormula()).toContain("$A$14");
    });

    it("oPTION + additional prereqs", () => {
      const { parsers } = buildParsers({
        items: {
          "Pick Path": [10],
          "Gate": [8],
          "Path A": [14],
          "Path B": [18],
        },
        prereqs: {
          10: "Gate",
          14: "Gate\nOPTION Pick Path",
          18: "OPTION Pick Path",
        },
      });
      // Path A has both Gate prereq and OPTION
      const formula14 = parsers[14].toPreReqsMetFormula();
      expect(formula14).toContain("$A$8"); // Gate check
      expect(formula14).toContain("AND"); // combining prereq + option
    });

    it("full status formula for row with prereqs", () => {
      const { parsers } = buildParsers({
        items: { "Quest A": [10], "Target": [14] },
        prereqs: { 14: "Quest A" },
      });
      const formula = parsers[14].toStatusFormula();
      expect(formula).toMatch(/^IFS\(/);
      expect(formula).toContain("\"CHECKED\"");
      expect(formula).toContain("$A$14"); // toCheckedFormula
      expect(formula).toContain("$A$10"); // prereqsMet reference
    });
  });

  describe("error cases", () => {
    it("nonexistent item reports error", () => {
      const { parsers } = buildParsers({
        items: { Target: [10] },
        prereqs: { 10: "Nonexistent Item" },
      });
      expect(parsers[10].hasErrors()).toBe(true);
      expect([...parsers[10].getErrors()].join()).toContain("Could not find \"Nonexistent Item\"");
    });

    it("bLOCKS without UNTIL reports error", () => {
      const { parsers } = buildParsers({
        items: { Blocker: [10], Boss: [14] },
        prereqs: { 10: "BLOCKS Boss" },
      });
      expect(parsers[10].hasErrors()).toBe(true);
      expect([...parsers[10].getErrors()].join()).toContain("Missing UNTIL");
    });

    it("single OPTION reports error", () => {
      const { parsers } = buildParsers({
        items: { Choice: [10] },
        prereqs: { 10: "OPTION Lonely Choice" },
      });
      expect(parsers[10].hasErrors()).toBe(true);
      expect([...parsers[10].getErrors()].join()).toContain("only OPTION");
    });
  });
});
