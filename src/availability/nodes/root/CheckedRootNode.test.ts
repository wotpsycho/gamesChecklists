import { buildAndFinalize, setupFormulaTests } from "../../test-helpers/setup";
import { BooleanFormulaNode } from "../boolean/BooleanFormulaNode";
import { CheckedRootNode } from "./CheckedRootNode";

describe("CheckedRootNode", () => {
  setupFormulaTests();

  it("isControlled returns true", () => {
    const { node } = buildAndFinalize(
      t => new CheckedRootNode([], t, 5),
    );
    expect(node.isControlled()).toBe(true);
  });

  it("toControlledFormula returns TRUE", () => {
    const { node } = buildAndFinalize(
      t => new CheckedRootNode([], t, 5),
    );
    expect(node.toControlledFormula()).toBe("TRUE");
  });

  it("inherits toStatusFormula from RootNode", () => {
    const { node } = buildAndFinalize(
      t => new CheckedRootNode([], t, 5),
    );
    const formula = node.toStatusFormula();
    expect(formula).toContain("IFS");
    expect(formula).toContain("$A$5");
  });

  it("inherits toPreReqsMetFormula with children", () => {
    const { node } = buildAndFinalize(
      t => new CheckedRootNode(
        [BooleanFormulaNode.create({ text: "Quest A", translator: t, row: 5 })],
        t,
        5,
      ),
      { items: { "Quest A": [10] } },
    );
    expect(node.toPreReqsMetFormula()).toBe("$A$10");
  });
});
