import { buildAndFinalize, setupFormulaTests } from "../../test-helpers/setup";
import { OptionalFormulaNode } from "./OptionalFormulaNode";

describe("OptionalFormulaNode", () => {
  setupFormulaTests();

  const config = { items: { "Bonus Item": [10] } };

  it("toPreReqsMetFormula returns NOT(child.prereqsMet)", () => {
    const { node } = buildAndFinalize(
      t => OptionalFormulaNode.create({ text: "Bonus Item", translator: t, row: 5 }),
      config,
    );
    expect(node.toPreReqsMetFormula()).toBe("NOT($A$10)");
  });

  it("toPRUsedFormula returns child.toPreReqsMetFormula (key difference from Missed)", () => {
    const { node } = buildAndFinalize(
      t => OptionalFormulaNode.create({ text: "Bonus Item", translator: t, row: 5 }),
      config,
    );
    // If Bonus Item is checked, this shows as PR_USED (not missed)
    expect(node.toPRUsedFormula()).toBe("$A$10");
  });

  it("toMissedFormula always returns FALSE (key difference from Missed)", () => {
    const { node } = buildAndFinalize(
      t => OptionalFormulaNode.create({ text: "Bonus Item", translator: t, row: 5 }),
      config,
    );
    expect(node.toMissedFormula()).toBe("FALSE");
  });

  it("toRawMissedFormula always returns FALSE", () => {
    const { node } = buildAndFinalize(
      t => OptionalFormulaNode.create({ text: "Bonus Item", translator: t, row: 5 }),
      config,
    );
    expect(node.toRawMissedFormula()).toBe("FALSE");
  });

  it("toUnknownFormula always returns FALSE", () => {
    const { node } = buildAndFinalize(
      t => OptionalFormulaNode.create({ text: "Bonus Item", translator: t, row: 5 }),
      config,
    );
    expect(node.toUnknownFormula()).toBe("FALSE");
  });

  it("isDirectlyMissable returns true", () => {
    const { node } = buildAndFinalize(
      t => OptionalFormulaNode.create({ text: "Bonus Item", translator: t, row: 5 }),
      config,
    );
    expect(node.isDirectlyMissable()).toBe(true);
  });

  it("creates BooleanFormulaNode as child (internal structure)", () => {
    const { node } = buildAndFinalize(
      t => OptionalFormulaNode.create({ text: "Bonus Item", translator: t, row: 5 }),
      config,
    );
    // Proves child resolved "Bonus Item" to row 10
    expect(node.toPreReqsMetFormula()).toBe("NOT($A$10)");
    expect(node.toPRUsedFormula()).toBe("$A$10");
  });
});
