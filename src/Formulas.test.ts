import { A1, AND, IF, IFS, NOT, OR, togglePrettyPrint, VALUE } from "./Formulas";

describe("Formulas", () => {
  beforeEach(() => {
    togglePrettyPrint(false);
  });
  afterEach(() => {
    togglePrettyPrint(true);
  });

  describe("VALUE", () => {
    it("converts true to TRUE", () => {
      expect(VALUE(true)).toBe("TRUE");
    });

    it("converts false to FALSE", () => {
      expect(VALUE(false)).toBe("FALSE");
    });

    it("converts string 'TRUE' to TRUE", () => {
      expect(VALUE("TRUE")).toBe("TRUE");
    });

    it("converts string 'FALSE' to FALSE", () => {
      expect(VALUE("FALSE")).toBe("FALSE");
    });

    it("converts numbers to string", () => {
      expect(VALUE(42)).toBe("42");
      expect(VALUE(0)).toBe("0");
    });

    it("wraps strings in quotes", () => {
      expect(VALUE("text")).toBe('"text"');
    });

    it("has constants", () => {
      expect(VALUE.TRUE).toBe("TRUE");
      expect(VALUE.FALSE).toBe("FALSE");
      expect(VALUE.ZERO).toBe("0");
      expect(VALUE.ONE).toBe("1");
    });
  });

  describe("AND", () => {
    it("unwraps single arg", () => {
      expect(AND("x")).toBe("x");
    });

    it("combines multiple args", () => {
      expect(AND("x", "y")).toBe("AND(x,y)");
    });

    it("removes TRUE args", () => {
      expect(AND("TRUE", "x")).toBe("x");
    });

    it("all TRUE args returns TRUE", () => {
      expect(AND("TRUE", "TRUE")).toBe("TRUE");
    });

    it("short-circuits on FALSE", () => {
      expect(AND("FALSE", "x")).toBe("FALSE");
    });

    it("deduplicates args", () => {
      expect(AND("x", "x", "y")).toBe("AND(x,y)");
    });
  });

  describe("OR", () => {
    it("unwraps single arg", () => {
      expect(OR("x")).toBe("x");
    });

    it("combines multiple args", () => {
      expect(OR("x", "y")).toBe("OR(x,y)");
    });

    it("removes FALSE args", () => {
      expect(OR("FALSE", "x")).toBe("x");
    });

    it("all FALSE args returns FALSE", () => {
      expect(OR("FALSE", "FALSE")).toBe("FALSE");
    });

    it("short-circuits on TRUE", () => {
      expect(OR("TRUE", "x")).toBe("TRUE");
    });
  });

  describe("NOT", () => {
    it("NOT(TRUE) returns FALSE", () => {
      expect(NOT("TRUE")).toBe("FALSE");
    });

    it("NOT(FALSE) returns TRUE", () => {
      expect(NOT("FALSE")).toBe("TRUE");
    });

    it("double negation collapses", () => {
      expect(NOT("NOT(x)")).toBe("(x)");
    });

    it("wraps non-constant in NOT()", () => {
      expect(NOT("$A$5")).toBe("NOT($A$5)");
    });
  });

  describe("IFS", () => {
    it("drops FALSE conditions", () => {
      expect(IFS("FALSE", "a", "x", "b")).toBe("IFS(x,b)");
    });

    it("short-circuits on TRUE condition", () => {
      expect(IFS("TRUE", "a", "x", "b")).toBe("a");
    });

    it("combined: drops FALSE then short-circuits on TRUE", () => {
      expect(IFS("FALSE", "a", "TRUE", "b", "x", "c")).toBe("b");
    });

    it("keeps non-constant conditions", () => {
      expect(IFS("$A$5", "a", "$A$6", "b")).toBe("IFS($A$5,a,$A$6,b)");
    });
  });

  describe("IF", () => {
    it("IF(TRUE, a, b) returns a", () => {
      expect(IF("TRUE", "a", "b")).toBe("a");
    });

    it("IF(FALSE, a, b) returns b", () => {
      expect(IF("FALSE", "a", "b")).toBe("b");
    });

    it("non-constant condition preserved", () => {
      expect(IF("$A$5", "a", "b")).toBe("IF($A$5,a,b)");
    });
  });

  describe("A1", () => {
    it("single cell reference", () => {
      expect(A1(5, 1)).toBe("$A$5");
    });

    it("range reference", () => {
      expect(A1(5, 1, 7, 1)).toBe("$A$5:$A$7");
    });

    it("single cell when start equals end", () => {
      expect(A1(5, 1, 5, 1)).toBe("$A$5");
    });

    it("column A = 1", () => {
      expect(A1(1, 1)).toBe("$A$1");
    });

    it("column F = 6", () => {
      expect(A1(1, 6)).toBe("$F$1");
    });

    it("column Z = 26", () => {
      expect(A1(1, 26)).toBe("$Z$1");
    });

    it("column AA = 27", () => {
      expect(A1(1, 27)).toBe("$AA$1");
    });
  });

  describe("togglePrettyPrint", () => {
    it("disabling produces compact output", () => {
      togglePrettyPrint(false);
      // Long formula that would normally pretty-print
      const args = Array.from({ length: 10 }, (_, i) => `$A$${i + 1}`);
      const result = AND(...args);
      expect(result).not.toContain("\n");
    });

    it("enabling produces formatted output for long formulas", () => {
      togglePrettyPrint(true);
      const args = Array.from({ length: 10 }, (_, i) => `$A$${i + 1}`);
      const result = AND(...args);
      expect(result).toContain("\n");
    });
  });
});
