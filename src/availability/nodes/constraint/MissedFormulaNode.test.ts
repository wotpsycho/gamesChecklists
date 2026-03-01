import { buildAndFinalize, setupFormulaTests } from "../../test-helpers/setup";
import { MissedFormulaNode } from "./MissedFormulaNode";

describe("missedFormulaNode", () => {
  setupFormulaTests();

  const config = { items: { "Kill Boss": [10] } };

  it("toPreReqsMetFormula returns NOT(child.prereqsMet)", () => {
    const { node } = buildAndFinalize(
      t => MissedFormulaNode.create({ text: "Kill Boss", translator: t, row: 5 }),
      config,
    );
    expect(node.toPreReqsMetFormula()).toBe("NOT($A$10)");
  });

  it("toMissedFormula returns child.toPreReqsMetFormula", () => {
    const { node } = buildAndFinalize(
      t => MissedFormulaNode.create({ text: "Kill Boss", translator: t, row: 5 }),
      config,
    );
    // If Kill Boss is checked ($A$10=TRUE), then THIS item is missed
    expect(node.toMissedFormula()).toBe("$A$10");
  });

  it("toRawMissedFormula same as toMissedFormula", () => {
    const { node } = buildAndFinalize(
      t => MissedFormulaNode.create({ text: "Kill Boss", translator: t, row: 5 }),
      config,
    );
    expect(node.toRawMissedFormula()).toBe("$A$10");
  });

  it("toPRUsedFormula always returns FALSE", () => {
    const { node } = buildAndFinalize(
      t => MissedFormulaNode.create({ text: "Kill Boss", translator: t, row: 5 }),
      config,
    );
    expect(node.toPRUsedFormula()).toBe("FALSE");
  });

  it("toUnknownFormula always returns FALSE", () => {
    const { node } = buildAndFinalize(
      t => MissedFormulaNode.create({ text: "Kill Boss", translator: t, row: 5 }),
      config,
    );
    expect(node.toUnknownFormula()).toBe("FALSE");
  });

  it("isDirectlyMissable returns true", () => {
    const { node } = buildAndFinalize(
      t => MissedFormulaNode.create({ text: "Kill Boss", translator: t, row: 5 }),
      config,
    );
    expect(node.isDirectlyMissable()).toBe(true);
  });

  it("creates BooleanFormulaNode as child (internal structure)", () => {
    const { node } = buildAndFinalize(
      t => MissedFormulaNode.create({ text: "Kill Boss", translator: t, row: 5 }),
      config,
    );
    // The fact that toPreReqsMetFormula works with NOT($A$10) proves
    // the child is a BooleanFormulaNode that resolved "Kill Boss" to row 10
    expect(node.toPreReqsMetFormula()).toBe("NOT($A$10)");
    expect(node.toMissedFormula()).toBe("$A$10");
  });
});
