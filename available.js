/* exported AVAILABLE */
// eslint-disable-next-line no-redeclare
const AVAILABLE = (function(){

  // FORMULA ENUM DEFINIOTNS
  class FormulaTranslationHelper {
    constructor(regEx, formulaName) {
      this.regEx = regEx;
      this.formulaName = formulaName;
    }
    
    identify(text) {
      return !!(text && this.regEx && text.match(this.regEx));
    }

    parseOperands(text) {
      if (!text || !this.regEx) return;
      const match = text.match(this.regEx);
      return (match && match.slice(1));
    }

    generateFormula(values,_prettyPrint) {
      let result = this.formulaName + "(";
      if (typeof values != "undefined" && values !== "" && !(Array.isArray(values) && values.length == 0)) {
        let innerResult;
        const joiner = _prettyPrint ? ",\n" : ",";
        if (Array.isArray(values)) {
          innerResult = values.join(joiner);
        } else {
          innerResult = values;
        }
        // Indent every line by 2
        if (_prettyPrint) {
          result += "\n  " + innerResult.replace(/\n/g, "\n  ") + "\n";
        } else {
          result += innerResult;
        }
      }
      result += ")";
      return result;
    }
  }
  // Since certain formulas accept 0-N arguments, handle that instead of nested groups
  class FlexibleFormulaTranslationHelper extends FormulaTranslationHelper {
    parseOperands(text) {
      if (!text) return;

      const match = text.match(this.regEx);
      if (!match) return;

      const results = [];
      const lMatch = match[1];
      const lResult = this.parseOperands(lMatch);
      if (lResult) results.push(...lResult);
      else results.push(lMatch);

      const rMatch = match[2];
      const rResult = this.parseOperands(rMatch);
      if (rResult) results.push(...rResult);
      else results.push(rMatch);

      return results;
    }
    generateFormula(values,_prettyPrint) {
      if (!Array.isArray(values)) return values;
      else if (values.length == 1) return values[0];
      else return super.generateFormula(values,_prettyPrint);
    }
  }

  class SimpleFormulaHelper extends FormulaTranslationHelper {
    constructor(formulaName) {
      super(undefined, formulaName);
    }
  }

  class InlineFormulaTranslationHelper extends FormulaTranslationHelper {
    generateFormula(values, _prettyPrint) {
      const joiner = _prettyPrint ? "\n" + this.formulaName + "\n" : " " + this.formulaName + " ";
      const innerResult = values.join(joiner);
      if (_prettyPrint) {
        return "(\n  " + innerResult.replace(/\n/g,"\n  ") + "\n)";
      } else {
        return "(" + innerResult  + ")";
      }
    }
  }  

  const STATUS = Object.freeze({
    CHECKED: "CHECKED",
    AVAILABLE: "TRUE",
    MISSED: "MISSED",
    PR_USED: "PR_USED",
    PR_NOT_MET: "FALSE",
    UNKNOWN: "UNKNOWN",
    ERROR: "ERROR",
  });

  const FORMULA = Object.freeze(_helpersToGenerateFunctions({
    AND: new FlexibleFormulaTranslationHelper(/^ *(.+?) *&& *(.+?) *$/,"AND"),
    OR: new FlexibleFormulaTranslationHelper(/^ *(.+?) *\|\|? *(.+?) *$/,"OR"),
    NOT: new FormulaTranslationHelper(/^ *! *(.+?) *$/, "NOT"),
    IF: new SimpleFormulaHelper("IF"),
    IFS: new SimpleFormulaHelper("IFS"),
    IFERROR: new SimpleFormulaHelper("IFERROR"),
      
    EQ: new FormulaTranslationHelper(/^ *(.+?) *== *(.+?) *$/, "EQ"),
    NE: new FormulaTranslationHelper(/^ *(.+?) *!= *(.+?) *$/, "NE"),
    GT: new InlineFormulaTranslationHelper(/^ *(.+?) *> *(.+?) *$/, ">"),
    GTE: new InlineFormulaTranslationHelper(/^ *(.+?) *>= *(.+?) *$/, ">="),
    LT: new InlineFormulaTranslationHelper(/^ *(.+?) *< *(.+?) *$/, "<"),
    LTE: new InlineFormulaTranslationHelper(/^ *(.+?) *<= *(.+?) *$/, "<="),
      
    MULT: new InlineFormulaTranslationHelper(/^ *(.+?) +\* +(.+?) *$/, "*"),
    DIV: new FormulaTranslationHelper(/^ *(.+?) *\/ *(.+?) *$/, "DIVIDE"),
    MINUS: new InlineFormulaTranslationHelper(/^ *(.+?) +- +(.+?) *$/, "-"),
    ADD: new InlineFormulaTranslationHelper(/^ *(.+?) +\+ +(.+?) *$/, "+"),

    COUNTIF: new SimpleFormulaHelper("COUNTIF"),
    COUNTIFS: new SimpleFormulaHelper("COUNTIFS"),
    ERRORTYPE: new SimpleFormulaHelper("ERROR.TYPE"),

    CONCAT: new SimpleFormulaHelper("CONCATENATE"),
  }));
  

  function _helpersToGenerateFunctions(helpers) {
    const toFuncs = {};
    Object.entries(helpers).forEach(([key,helper]) => {
      const generate = Object.assign((...args) => helper.generateFormula(...args),helper);
      generate.identify = (...args) => helper.identify(...args);
      generate.parseOperands = (...args) => helper.parseOperands(...args);
      generate.generateFormula = generate;
      toFuncs[key] = generate;
    });
    return toFuncs;
  }

  // CLASS DEFINITION
  function _getCellFormulaParser(checklist) {
    time();
    const COLUMN = Checklist.COLUMN;
    const columnToValueToRows = {};
    const prettyPrint = true; // TODO extract to config/setting
    // Essentially static defs
    let UID_Counter = 0;
    const getParenPlaceholder = () =>  `PPH_${UID_Counter++}_PPH`;
    const getQuotePlaeholder = () => `QPH_${UID_Counter++}_QPH`;
    const _quoteMapping = {};
    const _parentheticalMapping = {};
    const cellR1C1 = (row, column) => {
      column = checklist.toColumnIndex(column);
      return `R${row}C${column}`;
    };
    const rowsR1C1 = (rows, column) => {
      column = checklist.toColumnIndex(column);
      const ranges = [];
      if (rows.length === 0) return ranges;
      let firstRow = rows[0];
      let lastRow = rows[0];
      for (let i = 1; i < rows.length; i++) {
        if (rows[i] != lastRow+1) {
          ranges.push(`R${firstRow}C${column}:R${lastRow}C${column}`);
          firstRow = lastRow = rows[i];
        } else {
          lastRow = rows[i];
        }
      }
      ranges.push(`R${firstRow}C${column}:R${lastRow}C${column}`);
      return ranges;
    };
    const getColumnValues = (column) => {
      if (columnToValueToRows[column]) return columnToValueToRows[column];
      time(column);
      if (!checklist.hasColumn(column)) return;
      const valueToRows = {};
      
      const firstRow = checklist.firstDataRow;
      const values = checklist.getColumnDataValues(column);
      values.forEach((value,i) => {
        // const value = valueArr[0];
        if (valueToRows[value]) {
          valueToRows[value].push(firstRow+i);
        } else {
          valueToRows[value] = [firstRow+i];
        }
      });
      columnToValueToRows[column] = valueToRows;
      valueToRows._entries = Object.entries(valueToRows);
      timeEnd(column);
      return valueToRows;
    };

    const parsersByRow = {};
    const getParserByRow = (row) =>{
      if (parsersByRow[row]) {
        return parsersByRow[row];
      } else {
        const cellValue = checklist.getRange(row,COLUMN.PRE_REQS).getValue();
        return new CellFormulaParser(cellValue,row);
      }
    };
    class CellFormulaParser {
      constructor(cellValue,row) {
        this.missed = [];
        this.uses = [];
        this.row = row;
        parsersByRow[row] = this;

        const lines = [];
        cellValue.toString().split(/ *[\n;] */).forEach((line,i) => {
          if (i > 0 && line.indexOf("...") === 0) {
            lines[lines.length-1] += line.substring(3);
          } else {
            lines.push(line);
          }
        });

        const children = [];
        for (let j = 0; j < lines.length; j++) {
          let line = lines[j].trim();
          if (!line) continue;

        
          line = line.replace(/"([^"]+)"/g, (_match,text) => {
            const placeholder = getQuotePlaeholder();
            _quoteMapping[placeholder] = text;
            return placeholder;
          });
        
          let match;
          const parenMatcher = /\(([^()]*)\)/;
          // eslint-disable-next-line no-cond-assign
          while (match = line.match(parenMatcher)) {
            const placeholder = getParenPlaceholder();
            _parentheticalMapping[placeholder] = match[1];
            line = line.replace(parenMatcher, placeholder);
          }

          let childFormula;
          const prefixCheck = line.match(/^(USES|MISSED) /i);
          if (prefixCheck) { 
            const content = line.substring(line.indexOf(" ")).trim();
            switch (prefixCheck[1].toUpperCase()) {
              case "USES":
                childFormula = new CellFormulaParser.UsesFormulaNode(content,row);
                break;
              case "MISSED":
                childFormula = new CellFormulaParser.MissedFormulaNode(content,row);
                break;
            }
          } else {
            childFormula = new CellFormulaParser.BooleanFormulaNode(line,row);
          }
          children.push(childFormula);
        }
        this.rootNode = new CellFormulaParser.RootNode(children,row);
      }

      toFormula() {
        return this.toStatusFormula();
      }

      hasErrors() {
        return this.getErrors().size > 0;//this.children.reduce((hasError, child) => hasError || child.hasErrors(), false);
      }

      getErrors() {
        return this.rootNode.getErrors();
      }
      isInCircularDependency() {
        return this.getCircularDependencies().has(this.row);
      }
      
      getCircularDependencies(previous = []) {
        if (this._circularDependencies) return this._circularDependencies;
        const circularDependencies = new Set();
        if (this._lockCircular) {
          previous.slice(previous.indexOf(this.row)).forEach(circularDependencies.add,circularDependencies);
        } else {
          previous.push(this.row);
          this._lockCircular = true;
          this.rootNode.getCircularDependencies([...previous]).forEach(circularDependencies.add, circularDependencies);
          this._lockCircular = false;
        }
        if (circularDependencies.has(this.row)) this._isCircular = true;
        this._circularDependencies = circularDependencies;
        return this._circularDependencies;
      }
      toAvailableFormula() {
        return this.rootNode.toAvailableFormula();
      }
      toRawMissedFormula() {
        return this.rootNode.toRawMissedFormula();
      }
      toMissedFormula() {
        return this.rootNode.toMissedFormula();
      }
      toPRUsedFormula() {
        return this.rootNode.toPRUsedFormula();
      }
      toUnknownFormula() {
        return this.rootNode.toUnknownFormula();
      }
      toStatusFormula() {
        return this.rootNode.toStatusFormula();
      }
    }

    CellFormulaParser.FormulaNode = class FormulaNode {
    
      constructor(text,row) {
        this.errors = new Set();
        this.children = [];
        this.value = undefined;
        this.formulaType = undefined;
        this.text = text.toString().trim();
        this.row = row;

        if (_parentheticalMapping[this.text]) {
          this.text = _parentheticalMapping[this.text];
        }
        if (_quoteMapping[text]) {
          this.text = _quoteMapping[text];
        }
      }

      addError(message) {
        // console.log("Adding error [text,error]", this.text, message);
        this.errors.add(message);
      }

      addErrors(errors) {
        for (const message of errors) {
          this.addError(message);
        }
      }

      checkErrors() {
      }

      getErrors() {
        this.checkErrors();
        this.children.forEach(child => this.addErrors(child.getErrors()));
        return this.errors;
      }

      hasErrors() {
        // console.log("hasErrors: [row,text,size]", this.row, this.text, this.getErrors().size);
        return this.getErrors().size > 0;
      }

      hasValue() {
        return typeof this.value !== "undefined";
      }

      _toFormula(formulaFunctionName) {
        // console.log(formulaFunctionName,"row,type,formulaType,numChildren,value,text",this.row,this.constructor.name,this.formulaType && this.formulaType.formulaName,this.children.length,this.value,this.text);
        let formula;
        if (this.formulaType) {
          formula = this.formulaType.generateFormula(this.children.map(child => child[formulaFunctionName]()),prettyPrint);
        } else if (this.children.length === 1) {
          formula = this.children[0][formulaFunctionName]();
        } else if (this.hasValue()) {
          formula = this.value;
        } else {
          this.addError("Could not determine formula");
        }
        return formula;
      }


      toAvailableFormula() {
        return this._toFormula(this.toAvailableFormula.name);
      }


      toPRUsedFormula() {
        throw new Error(`AbstractMethod ${this.constructor.name}.${this.toPRUsedFormula.name}`);
      }

      toRawMissedFormula() {
        throw new Error(`AbstractMethod ${this.constructor.name}.${this.toRawMissedFormula.name}`);
      }

      toMissedFormula() {
        throw new Error(`AbstractMethod ${this.constructor.name}.${this.toMissedFormula.name}`);
      }

      toUnknownFormula() {
        throw `${new Error("AbstractMethod " + this.constructor.name)}.${this.toUnknownFormula.name}`;
      }
      isInCircularDependency() {
        return this.getCircularDependencies().has(this.row);
      }

      getCircularDependencies(previous = []) {
        if (this._circularDependencies) return this._circularDependencies;
        const circularDependencies = new Set();
        if (this._lockCircular) {
          previous.slice(previous.indexOf(this.row)).forEach(circularDependencies.add,circularDependencies);
        } else {
          previous.push(this.row);
          this._lockCircular = true;
          this.children.forEach(child => {
            child.getCircularDependencies([...previous]).forEach(circularDependencies.add, circularDependencies);
          });
          this._lockCircular = false;
        }
        if (circularDependencies.has(this.row)) this._isCircular = true;
        this._circularDependencies = circularDependencies;
        return this._circularDependencies;
      }
    };

    CellFormulaParser.BooleanFormulaNode = class BooleanFormulaNode extends CellFormulaParser.FormulaNode {
      constructor(text,row) {
        super(text,row);
        if (this.text) {
          for (const booleanFormulaTranslationHelper of [
            FORMULA.OR, 
            FORMULA.AND, 
            FORMULA.NOT
          ]) {
            // Recursively handle boolean operators
            if (booleanFormulaTranslationHelper.identify(this.text)) {
              this.formulaType = booleanFormulaTranslationHelper;
              const operands = booleanFormulaTranslationHelper.parseOperands(this.text);
              this.children.push(...operands.map(operand => new BooleanFormulaNode(operand,this.row)));
              return;
            }
          }
          for (const comparisonFormulaTranslationHelper of [
            FORMULA.EQ, 
            FORMULA.NE, 
            FORMULA.GTE,
            FORMULA.GT,
            FORMULA.LTE,
            FORMULA.LT
          ]) {
            // Recursively handle comparison operators
            if (comparisonFormulaTranslationHelper.identify(this.text)) {
              this.children.push(new CellFormulaParser.ComparisonFormulaNode(this.text,this.row,comparisonFormulaTranslationHelper));
              return;
            }
          } 
          this.children.push(new CellFormulaParser.BooleanFormulaValueNode(this.text,this.row));
        } else {
          this.value = "TRUE";
        }
      }

      toPRUsedFormula() {
        if (this.hasValue()) return "FALSE";
        if (this.isInCircularDependency()) return "FALSE";
        if (!this.formulaType) return this.children[0].toPRUsedFormula();
        switch (this.formulaType) {
          case FORMULA.AND: {
            return FORMULA.OR(
              this.children.map(child => FORMULA.AND([
                FORMULA.NOT(child.toRawMissedFormula(),prettyPrint),
                child.toPRUsedFormula()
              ],prettyPrint)),prettyPrint);
          }
          case FORMULA.OR: {
            return FORMULA.AND(
              this.children.map(child => FORMULA.AND([
                FORMULA.NOT(child.toRawMissedFormula(),prettyPrint),
                child.toPRUsedFormula()
              ],prettyPrint)),prettyPrint);
          }
          case FORMULA.NOT: {
            return this.children[0].toPRUsedFormula(); // TODO ???
          }
        }
      }

      toRawMissedFormula() {
        if (this.hasValue()) return "FALSE";
        if (this.isInCircularDependency()) return "FALSE";
        if (!this.formulaType) return this.children[0].toRawMissedFormula();
        switch (this.formulaType) {
          case FORMULA.AND: {
            return FORMULA.OR(this.children.map(child => child.toRawMissedFormula()),prettyPrint);
          }
          case FORMULA.OR: {
            return FORMULA.AND(this.children.map(child => child.toRawMissedFormula()),prettyPrint);
          }
          case FORMULA.NOT: {
            return this.children[0].toRawMissedFormula(); // TODO ???
          }
        }
      }

      toMissedFormula() {
        if (this.hasValue()) return "FALSE";
        if (this.isInCircularDependency()) return "FALSE";
        if (!this.formulaType) return this.children[0].toMissedFormula();
        switch (this.formulaType) {
          case FORMULA.AND: {
            return FORMULA.OR(this.children.map(child => child.toMissedFormula()),prettyPrint);
          }
          case FORMULA.OR: {
            return FORMULA.AND(this.children.map(child => child.toMissedFormula()),prettyPrint);
          }
          case FORMULA.NOT: {
            return this.children[0].toMissedFormula(); // TODO ???
          }
        }
      }

      toUnknownFormula() {
        if (this.hasValue()) return "FALSE";
        if (this.isInCircularDependency()) return "TRUE";
        if (!this.formulaType) return this.children[0].toUnknownFormula();
        switch (this.formulaType) {
          case FORMULA.AND: {
            return FORMULA.AND(
              this.children.map(child => FORMULA.NOT(child.toRawMissedFormula()))
                .concat(
                  FORMULA.OR(this.children.map(child => child.toUnknownFormula()),prettyPrint)
                )
              ,prettyPrint);
          }
          case FORMULA.OR: {
            return FORMULA.AND([
              FORMULA.OR(this.children.map(child => child.toUnknownFormula()),prettyPrint),
              ...this.children.map(child => FORMULA.OR([child.toUnknownFormula(),child.toMissedFormula()],prettyPrint))
            ],prettyPrint);
          }
          case FORMULA.NOT: {
            return this.children[0].toUnknownFormula(); // TODO ???
          }
        }
      }
    };

    CellFormulaParser.RootNode = class RootNode extends CellFormulaParser.BooleanFormulaNode {
      constructor(children,row) {
        super("",row);
        if (children.length > 0) {
          this.children = children;
          this.value = undefined;
          this.formulaType = FORMULA.AND;
        } else {
          this.value = "TRUE";
        }
      }
      toStatusFormula() {
        let formula;
        if (this.hasErrors()) formula = `"${STATUS.ERROR}"`;
        else 
          formula = FORMULA.IFS([
            `R${this.row}C${checklist.toColumnIndex(COLUMN.CHECK)}`,`"${STATUS.CHECKED}"`,
            this.toAvailableFormula(),`${STATUS.AVAILABLE}`,
            this.toUnknownFormula(), `"${STATUS.UNKNOWN}"`,
            this.toRawMissedFormula(), `"${STATUS.MISSED}"`,
            this.toPRUsedFormula(), `"${STATUS.PR_USED}"`,
            this.toMissedFormula(), `"${STATUS.MISSED}"`,
            "TRUE", `${STATUS.PR_NOT_MET}`
          ]);
        
        return formula;
      }
    };

    CellFormulaParser.ComparisonFormulaNode = class ComparisonFormulaNode extends CellFormulaParser.FormulaNode {
      constructor(text,row,formulaType) {
        super(text,row);
        
        this.formulaType = formulaType;
        const operands = formulaType.parseOperands(this.text);
        this.children.push(...operands.map(operand => new CellFormulaParser.NumberFormulaNode(operand,this.row)));
      }

      checkErrors() {
        let isError;
        switch (this.formulaType) {
          case FORMULA.EQ:
            isError = this.children[0].getMaxValue() < this.children[1].getMinValue() || this.children[0].getMinValue() > this.children[1].getMaxValue();
            break;
          case FORMULA.NE: {
            const lMax = this.children[0].getMaxValue();
            isError = lMax == this.children[0].getMinValue() && lMax == this.children[1].getMinValue() && lMax == this.children[1].getMaxValue();
            break;
          }
          case FORMULA.GTE:
            isError = !(this.children[0].getMaxValue() >= this.children[1].getMinValue());
            break;
          case FORMULA.GT:
            isError = !(this.children[0].getMaxValue() > this.children[1].getMinValue());
            break;
          case FORMULA.LTE:
            isError = !(this.children[0].getMinValue() <= this.children[1].getMaxValue());
            break;
          case FORMULA.LT:
            isError = !(this.children[0].getMinValue() < this.children[1].getMaxValue());
            break;
        }
        if (isError) {
          this.addError("Formula cannot be satisfied: " + this.text);
        }
      }
      toPRUsedFormula() {
        return this._toFormulaByNotStatus(this.toUnknownFormula.name, STATUS.PR_USED);
      }
      toRawMissedFormula() {
        return this._toFormulaByNotStatus(this.toUnknownFormula.name, STATUS.MISSED);
      }
      toMissedFormula() {
        return this._toFormulaByNotStatus(this.toUnknownFormula.name, [STATUS.MISSED,STATUS.PR_USED]);
      }
      toUnknownFormula() {
        if (this.isInCircularDependency()) return "TRUE";
        return this._toFormulaByNotStatus(this.toUnknownFormula.name, STATUS.UNKNOWN);
      }
      _toFormulaByNotStatus(formulaTypeName,notStatusesForMax,statusesForMin = STATUS.CHECKED) {
        if (this.hasErrors()) return "FALSE";
        if (this.isInCircularDependency()) return "FALSE";
        if (this.hasValue()) return this.value;
        if (!this.formulaType) return this.children[0][formulaTypeName]();
        
        switch (this.formulaType) {
          case FORMULA.LT: {
            return FORMULA.GTE([this.children[0].toFormulaByStatus(statusesForMin),this.children[1].toFormulaByNotStatus(notStatusesForMax)],prettyPrint);
          }
          case FORMULA.LTE: {
            return FORMULA.GT([this.children[0].toFormulaByStatus(statusesForMin),this.children[1].toFormulaByNotStatus(notStatusesForMax)],prettyPrint);
          }
          case FORMULA.GT: {
            return FORMULA.LTE([this.children[0].toFormulaByNotStatus(notStatusesForMax),this.children[1].toFormulaByStatus(statusesForMin)],prettyPrint);
          }
          case FORMULA.GTE: {
            return FORMULA.LT([this.children[0].toFormulaByNotStatus(notStatusesForMax),this.children[1].toFormulaByStatus(statusesForMin)],prettyPrint);
          }
          case FORMULA.EQ: {
            return FORMULA.OR([
              FORMULA.LT([this.children[0].toFormulaByNotStatus(notStatusesForMax),this.children[1].toFormulaByStatus(statusesForMin)],prettyPrint),
              FORMULA.GT([this.children[0].toFormulaByStatus(statusesForMin),this.children[1].toFormulaByNotStatus(notStatusesForMax)],prettyPrint)
            ],prettyPrint);
          }
          case FORMULA.NE: {
            return FORMULA.AND([
              FORMULA.EQ([this.children[0].toFormulaByNotStatus(notStatusesForMax),this.children[0].toFormulaByStatus(statusesForMin)],prettyPrint),
              FORMULA.EQ([this.children[0].toFormulaByNotStatus(notStatusesForMax),this.children[1].toFormulaByStatus(statusesForMin)],prettyPrint),
              FORMULA.EQ([this.children[0].toFormulaByStatus(statusesForMin),this.children[1].toFormulaByNotStatus(notStatusesForMax)],prettyPrint)
            ],prettyPrint);
          }
        }
      }
    };

    CellFormulaParser.NumberFormulaNode = class NumberFormulaNode extends CellFormulaParser.FormulaNode {

      constructor(text,row) {
        super(text,row);
      
        for (const arithmeticFormulaTranslationHelper of [
          FORMULA.ADD,
          FORMULA.MINUS,
          FORMULA.MULT,
          FORMULA.DIV,
        ]) {
        // Recursively handle comparison operators
          if (arithmeticFormulaTranslationHelper.identify(this.text)) {
            this.formulaType = arithmeticFormulaTranslationHelper;
            const operands = arithmeticFormulaTranslationHelper.parseOperands(this.text);
            this.children.push(...operands.map(operand => new NumberFormulaNode(operand,this.row)));
            return;
          }
        }
        this.children.push(new CellFormulaParser.NumberFormulaValueNode(text,this.row));
      }

      getMinValue() {
        if (this.hasValue()) return this.value();
        if (!this.formulaType) {
          return this.children[0].getMinValue();
        } else switch(this.formulaType) {
          case FORMULA.ADD: return this.children.map(child => child.getMinValue()).reduce((min, childMin) => min + childMin);
          case FORMULA.MINUS: return this.children[0].getMinValue() - this.children.slice(1).map(child => child.getMaxValue()).reduce((max, childMax) => max + childMax);
          case FORMULA.MULT: return this.children.map(child => child.getMinValue()).reduce((min, childMin) => min * childMin);
          case FORMULA.DIV: return this.children[0].getMinValue() / (this.children[1].getMaxValue() || 1);
        }
      }

      getMaxValue() {
        if (this.hasValue()) return this.value();
        if (!this.formulaType) {
          return this.children[0].getMaxValue();
        } else switch(this.formulaType) {
          case FORMULA.ADD: return this.children.map(child => child.getMaxValue()).reduce((max, childMax) => max + childMax);
          case FORMULA.MINUS: return this.children[0].getMaxValue() - this.children.map(child => child.getMinValue()).slice(1).reduce((min, childMin) => min + childMin);
          case FORMULA.MULT: return this.children.map(child => child.getMaxValue()).reduce((max, childMax) => max * childMax);
          case FORMULA.DIV: return this.children[0].getMaxValue() / (this.children[1].getMinValue() || 1);
        }
      }

      toFormulaByStatus(statuses) {
        if (this.hasValue()) return this.value;
        if (!this.formulaType) return this.children[0].toFormulaByStatus(statuses);
        return this.formulaType.generateFormula(this.children.map(child => child.toFormulaByStatus(statuses)));
      }
      toFormulaByNotStatus(statuses) {
        if (this.hasValue()) return this.value;
        if (!this.formulaType) return this.children[0].toFormulaByNotStatus(statuses);
        return this.formulaType.generateFormula(this.children.map(child => child.toFormulaByNotStatus(statuses)));
      }
      toRawNotMissedFormula() {
        if (this.hasValue()) return this.value;
        if (!this.formulaType) return this.children[0].toRawNotMissedFormula();
        return this.formulaType.generateFormula(this.children.map(child => child.toRawNotMissedFormula()));
      }
      toRawMissedFormula() {
        if (this.hasValue()) return this.value;
        if (!this.formulaType) return this.children[0].toRawMissedFormula();
        return this.formulaType.generateFormula(this.children.map(child => child.toRawMissedFormula()));
      }
      toUnknownFormula() {
        if (this.hasValue()) return this.value;
        if (!this.formulaType) return this.children[0].toUnknownFormula();
        return this.formulaType.generateFormula(this.children.map(child => child.toUnknownFormula()));
      }
      
      toNotUnknownFormula() {
        if (this.hasValue()) return this.value;
        if (!this.formulaType) return this.children[0].toNotUnknownFormula();
        return this.formulaType.generateFormula(this.children.map(child => child.toNotUnknownFormula()));
      }
      
    };

    // Abstract intermediate class
    const valueInfoCache = {};
    CellFormulaParser.FormulaValueNode = class FormulaValueNode extends CellFormulaParser.FormulaNode {
      constructor(text,row) {
        super(text,row);
        this.parseValue(this.text);
        // console.log(this.valueInfo);
      }

      parseValue(text) {
        let valueInfo = valueInfoCache[text];
        if (!valueInfo) {
          const parseRegEx = /^ *(?:(\d+)x|x(\d+) +)? *((?:(.*)!)?([^ ].*?)) *$/;
          const rawParsed = parseRegEx.exec(text);
          if (rawParsed) {
            valueInfo = {
              numNeeded: rawParsed[1] || rawParsed[2] || 1,
              isMulti: !!(rawParsed[1] > 0 || rawParsed[2] > 0 || rawParsed[5].indexOf("*") >= 0),
              key: rawParsed[3],
              altColumnName: rawParsed[4],
              id: rawParsed[5],
              original: text,
            };
            if (_quoteMapping[valueInfo.key]) {
              const rawParsedQuote = parseRegEx.exec(_quoteMapping[valueInfo.key]);
              valueInfo.key = rawParsedQuote[3];
              valueInfo.altColumnName = rawParsedQuote[4];
              valueInfo.id = rawParsedQuote[5];
            }
            if (valueInfo.isMulti && !valueInfo.altColumnName && valueInfo.id.indexOf("*") < 0) {
            // Implicity prefix match on item for "[N]x [item]"
              valueInfo.id += "*";
            }
            const valuesToRows = getColumnValues(valueInfo.altColumnName || "item");
            const rows = [];
            if (valuesToRows) {
              if (valueInfo.id.indexOf("*") < 0) {
                if (valuesToRows[valueInfo.id]) {
                  rows.push(...(valuesToRows[valueInfo.id]));
                }
              } else {
                const search = RegExp("^" + valueInfo.id.replace(/\*/g,".*") + "$");
                valuesToRows._entries.forEach(([value,valueRows]) => {
                  if (value.match(search)) {
                    rows.push(...valueRows);
                  }
                });
              }
            } else {
              this.addError(`Could not find column "${valueInfo.altColumnName}"`);
            }
            valueInfo.rows = rows;
            
            valueInfoCache[text] = valueInfo;
          }
        }
        // Copy cached object
        if (valueInfo) {
          valueInfo = Object.assign({},valueInfo);
          if (valueInfo.rows) {
            valueInfo.rows = [...valueInfo.rows];
            // Remove self reference (simplest dependency resolution, v0)
            const rowIndex = valueInfo.rows.indexOf(this.row);
            if (rowIndex >= 0) {
              valueInfo.rows.splice(rowIndex,1);
              valueInfo.wasSelfReferential = true;
            }
          }
        }

        this.valueInfo = valueInfo;
      }

      checkErrors() {
        if (!this.hasValue()) {
          if (!this.valueInfo) {
            this.addError(`Could not find "${this.text}"`);
          } else if (this.valueInfo.rows.length == 0) {
            this.addError(`Could not find ${this.valueInfo.isMulti ? "any of " : ""}${this.valueInfo.altColumnName || "Item"} "${this.valueInfo.id}"${this.valueInfo.wasSelfReferential ? " (except itself)" : ""}`);
          } else if (this.valueInfo.rows.length < this.valueInfo.numNeeded) {
            this.addError(`There are only ${this.valueInfo.rows.length}, not ${this.valueInfo.numNeeded}, of ${this.valueInfo.altColumnName || "Item"} "${this.valueInfo.id}"${this.valueInfo.wasSelfReferential ? " (when excluding itself)" : ""}`);
          }
        }
      }
      
      getCircularDependencies(previous = []) {
        if (this._circularDependencies) return this._circularDependencies;
        const circularDependencies = new Set();
        if (this._lockCircular) {
          previous.slice(previous.indexOf(this.row)).forEach(circularDependencies.add,circularDependencies);
        } else {
          previous.push(this.row);
          this._lockCircular = true;
          this.valueInfo.rows.forEach(row => {
            getParserByRow(row).getCircularDependencies([...previous]).forEach(circularDependencies.add, circularDependencies);
          });
          this._lockCircular = false;
        }
        if (circularDependencies.has(this.row)) this._isCircular = true;
        this._circularDependencies = circularDependencies;
        return this._circularDependencies;
      }

    };

    CellFormulaParser.BooleanFormulaValueNode = class BooleanFormulaValueNode extends CellFormulaParser.FormulaValueNode {
      constructor(text,row) {
        super(text,row);
        if (typeof this.text == "boolean" || this.text.toString().toUpperCase() == "TRUE" || this.text.toString().toUpperCase() == "FALSE") {
          this.value = this.text.toString().toUpperCase();
        } else if (this.hasErrors()) {
          this.value = "FALSE";
        } else {
          // CHECKED > NEEDED
          this.formulaType = FORMULA.GTE;
          this.children = [new CellFormulaParser.NumberFormulaValueNode(this.text,this.row), new CellFormulaParser.NumberFormulaValueNode(this.valueInfo.numNeeded,this.row)]; 
        }
      }
      toPRUsedFormula() {
        if (this.hasValue()) return "FALSE";
        return FORMULA.AND([
          FORMULA.GTE([FORMULA.MINUS([this.children[0].toTotalFormula(),this.children[0].toRawMissedFormula()]),this.valueInfo.numNeeded],prettyPrint),
          FORMULA.LT([this.children[0].toPRNotUsedFormula(),this.valueInfo.numNeeded],prettyPrint)
        ],prettyPrint);
      }
      toRawMissedFormula() {
        if (this.hasValue()) return "FALSE";
        return FORMULA.LT([this.children[0].toRawNotMissedFormula(),this.valueInfo.numNeeded],prettyPrint);

      }
      toMissedFormula() {
        if (this.hasValue()) return "FALSE";
        return FORMULA.LT([this.children[0].toNotMissedFormula(),this.valueInfo.numNeeded],prettyPrint);
      }
      toUnknownFormula() {
        if (this.hasValue()) return "FALSE";
        return FORMULA.AND([
          FORMULA.NOT(this.toMissedFormula()),
          FORMULA.LT([FORMULA.MINUS([this.children[0].toTotalFormula(),this.children[0].toMissedFormula(),this.children[0].toUnknownFormula()]),this.valueInfo.numNeeded],prettyPrint)
        ], prettyPrint);
      }
    };
  
    CellFormulaParser.NumberFormulaValueNode = class NumberFormulaValueNode extends CellFormulaParser.FormulaValueNode {
      constructor(text,row) {
        super(text,row);
        if (Number(this.text) || this.text === 0 || this.text === "0") {
          this.value = Number(this.text);
        } else if (this.hasErrors()) {
          this.value = -1;
        }
      }

      /**
       * Total number of rows matching dependency
       */
      toTotalFormula() {
        if (this.hasValue()) return this.value;
        return this.valueInfo.rows.length;
      }

      toFormulaByStatus(statuses) {
        return this._generateFormula(statuses);
      }

      toFormulaByNotStatus(statuses) {
        return FORMULA.MINUS([this.toTotalFormula(), this.toFormulaByStatus(statuses)],prettyPrint);
      }

      /**
       * Number that have been checked
       */
      toAvailableFormula() { 
        // console.log(this.toAvailableFormula.name,"row,type,formulaType,numChildren,value,text",this.row,this.constructor.name,this.formulaType && this.formulaType.formulaName,this.children.length,this.value,this.text);

        // Available should look directly at "check" column only to prevent circular references
        return this._generateFormula("TRUE","check");
      }

      /**
       * 
       */
      toPRNotMetFormula() {
        return FORMULA.MINUS([this.toTotalFormula(), this.toAvailableFormula()],prettyPrint);
      }


      /**
       * Number of dependencies that have been missed OR used
       */
      toMissedFormula() {
        return this.toFormulaByStatus([STATUS.MISSED,STATUS.PR_USED]);
      }
      toRawMissedFormula() {
        return this.toFormulaByStatus(STATUS.MISSED);
      }
      toRawNotMissedFormula() {
        return this.toFormulaByNotStatus(STATUS.MISSED);
      }

      toUnknownFormula() {
        return this.toFormulaByStatus(STATUS.UNKNOWN);
      }
      toNotUnknownFormula() {
        return this.toFormulaByNotStatus(STATUS.UNKNOWN);
      }
      /**
       * Number that have NOT been MISSED or PR_USED
       */
      toNotMissedFormula() {
        // console.log("NMV text,value,valueInfo",this.text,this.value,this.valueInfo);
        return this.toFormulaByNotStatus([STATUS.MISSED,STATUS.PR_USED],prettyPrint);
      }
      /**
       * Number of dependencies that have had their Pre-Reqs used
       */
      toPRUsedFormula() {
        if (this.hasValue()) return this.value;
        return this._generateFormula(STATUS.PR_USED);
      }
      /**
       * Number of dependencies that have NOT had their Pre-Reqs used
       */
      toPRNotUsedFormula() {
        if (this.hasValue()) {
          return this.value;
        }
        return FORMULA.MINUS([this.toTotalFormula(), this.toPRUsedFormula()],prettyPrint);
      }
      toMinCheckedFormula() {
        return this.toFormulaByStatus(STATUS.CHECKED);
      }
      toMaxCheckedFormula() {
        return this.toFormulaByNotStatus([STATUS.MISSED,STATUS.PR_USED]);
      }

      /**
       * Minimum value, regardless of status
       */
      getMinValue() {
        if (this.hasValue()) return this.value;
        return 0;
      }

      /**
       * Maximum value, regardless of status
       */
      getMaxValue() {
        if (this.hasValue()) return this.value;
        return this.toTotalFormula();
      }

      _generateFormula(statuses = [], column = "available") {
        if (this.hasValue()) {
          return this.value;
        } else if (!statuses || statuses.length == 0) {
          return 0;
        } else {
          if (!Array.isArray(statuses)) statuses = [statuses];
          const counts = rowsR1C1(this.valueInfo.rows, column).reduce((counts,range) => {
            statuses.forEach(status => counts.push(FORMULA.COUNTIF([range, status === "TRUE" || status === "FALSE" ? status : `"${status}"`])));
            return counts;
          },[]);
          // NUM_CHECKED
          //const countIfsValues = this._getCountIfsArguments(additionalCountIfsValues);
          return FORMULA.ADD(counts, prettyPrint);
        }
      }
    };

    const usesInfo = {}; // Treating as value in containing class since it is reset each populateAvailable call
    CellFormulaParser.UsesFormulaNode = class UsesFormulaNode extends CellFormulaParser.BooleanFormulaValueNode {
      constructor(text,row) {
        super(text,row);
        if (!usesInfo[this.valueInfo.key]) {
          usesInfo[this.valueInfo.key] = {};
        }
        usesInfo[this.valueInfo.key][this.row] = this.valueInfo.numNeeded;
        // console.log("usesNode",this.text,this.children,this.value);
      }

      toPRUsedFormula() {
        return FORMULA.OR([
          FORMULA.LT([
            FORMULA.MINUS([
              this.children[0].toTotalFormula(),
              CellFormulaParser.UsesFormulaNode._getPRUsedAmountFormula(this.valueInfo.key)
            ],prettyPrint),
            this.valueInfo.numNeeded
          ],prettyPrint),
          this.children[0].toPRUsedFormula()
        ],prettyPrint);
      }

      static _getPRUsedAmountFormula(key) {
        const usedAmoutArguments = Object.entries(usesInfo[key]).map(([row,numUsed]) => FORMULA.IF([cellR1C1(row,"check"),numUsed]));
        return FORMULA.ADD(usedAmoutArguments, true);
      }

      toAvailableFormula() {
        // console.log(this.toAvailableFormula.name,"row,type,formulaType,numChildren,value,text",this.row,this.constructor.name,this.formulaType && this.formulaType.formulaName,this.children.length,this.value,this.text);

        // Parent => CHECKED >= NEEDED
        // This   => (CHECKED - USED) >= NEEDED
        const usedAmountFormula = CellFormulaParser.UsesFormulaNode._getPRUsedAmountFormula(this.valueInfo.key);
        const checkedFormula = this.children[0].toAvailableFormula();
        const availableAmountFormula = FORMULA.MINUS([checkedFormula,usedAmountFormula]);
        const numNeededFormula = this.children[1].toAvailableFormula();
        return this.formulaType.generateFormula([availableAmountFormula, numNeededFormula],true);
      }

    };

    CellFormulaParser.MissedFormulaNode = class MissedFormulaNode extends CellFormulaParser.FormulaNode {
      constructor(text,row) {
        super(text,row);
        this.formulaType = FORMULA.NOT;
        this.children.push(new CellFormulaParser.BooleanFormulaNode(this.text,this.row));
      } 

      toMissedFormula() {
        return this.children[0].toAvailableFormula();
      }
      toRawMissedFormula() {
        return this.children[0].toAvailableFormula();
      }
      toPRUsedFormula() {
        return this.children[0].toPRUsedFormula();
      }
      toUnknownFormula() {
        return this.children[0].toUnknownFormula();
      }
    };

    timeEnd();
    return CellFormulaParser;
  }

  // PUBLIC FUNCTIONS
  function populateAvailable(checklist = Checklist.getActiveChecklist(), event) {
    time();
    const COLUMN = Checklist.COLUMN; // static import
    let filteredRange;
    if (event
      && event.range
      && checklist.isColumnInRange([COLUMN.PRE_REQS,COLUMN.STATUS],event.range)
      && (event.value || event.oldValue) // Single cell update
      && event.range.getRow() >= checklist.firstDataRow // In data range
      && (!event.value || !event.value.toString().match(/USES/i))  // NOT uses
      && (!event.oldValue || !event.oldValue.toString().match(/USES/i)) // WASN'T uses
    ) {
      // If it's a single, non-"USES" cell, only update it
      filteredRange = event.range;
    }
  
    // Must have required columns
    if (!checklist.hasColumn(COLUMN.STATUS, COLUMN.CHECK, COLUMN.ITEM, COLUMN.PRE_REQS)) return;
    
    const preReqRange = checklist.getColumnDataRangeFromRange(COLUMN.PRE_REQS, filteredRange);
    const availableDataRange = checklist.getColumnDataRangeFromRange(COLUMN.STATUS, filteredRange);

    if (!preReqRange || !availableDataRange) return; // filteredRange had no data rows; shouldn't be hit
    const CellFormulaParser = _getCellFormulaParser(checklist);

    const firstRow = preReqRange.getRow();
    const preReqValues = preReqRange.getValues();
    // if (!filteredRange) _allPreReqValuesCache = preReqValues;
    const preReqFormulas = preReqRange.getFormulas();

    // TODO add interactive validation?
    //const preReqValidations = preReqRange.getDataValidations(); 
  
    // will be overwriting these
    // const availables = availableDataRange.getValues();
    const parsers = [];
    const statusFormulas = [];
    const notes = [];

    time("parseCells");
    for (let i = 0; i < preReqValues.length; i++) {
      if (preReqFormulas[i][0]) {
        // Allow direct formulas, just use reference
        statusFormulas[i] = "R" + (i+firstRow) + "C" + checklist.toColumnIndex(COLUMN.PRE_REQS);
      } else {
        parsers[i] = new CellFormulaParser(preReqValues[i][0],i+firstRow);
      }
    }
    timeEnd("parseCells");
    const debugColumns = {
      "isAvailable": {
        formulaFunc: CellFormulaParser.prototype.toAvailableFormula,
      },
      "isRawMissed": {
        formulaFunc: CellFormulaParser.prototype.toRawMissedFormula,
      },
      "isMissed": {
        formulaFunc: CellFormulaParser.prototype.toMissedFormula,
      },
      "isUsed": {
        formulaFunc: CellFormulaParser.prototype.toPRUsedFormula,
      },
      "isUnknown": {
        formulaFunc: CellFormulaParser.prototype.toUnknownFormula,
      },
      "isError": {
        formulaFunc: function(){ return this.hasErrors() ? "TRUE" : "FALSE";},
      },
    };
    Object.keys(debugColumns).forEach(debugColumn =>{
      if (checklist.columnsByHeader[debugColumn]) {
        const range = checklist.getColumnDataRangeFromRange(checklist.columnsByHeader[debugColumn],preReqRange);
        debugColumns[debugColumn].range = range;
        debugColumns[debugColumn].formulas = [];
      } else {
        delete debugColumns[debugColumn];
      }
    });
    time("generateFormulas");
    for (let i = 0; i < preReqValues.length; i++) {
      const parser = parsers[i];
      let errorNote = null;
      if (parser) {
        statusFormulas[i] = parser.toFormula();
        if (parser.hasErrors()) {
          errorNote = [...parser.getErrors()].map(error => `ERROR: ${error}`).join("\n");
        }
      }
      Object.values(debugColumns).forEach(value => value.formulas.push([parser ? value.formulaFunc.call(parser) : null]));
      notes[i] = errorNote;
    }
    timeEnd("generateFormulas");
  
    availableDataRange.setFormulasR1C1(statusFormulas.map(formula => [formula]));
    preReqRange.setNotes(notes.map(note => [note]));
    
    Object.values(debugColumns).forEach(value => value.range.setFormulasR1C1(value.formulas));

    timeEnd();
    return;
  }


  return Object.freeze({
    populateAvailable,
  });
})();