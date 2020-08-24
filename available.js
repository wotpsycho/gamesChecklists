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
  

  const STATUS = {
    CHECKED: "\"CHECKED\"",
    AVAILABLE: "TRUE",
    MISSED: "\"MISSED\"",
    PR_USED: "\"PR_USED\"",
    PR_NOT_MET: "FALSE",
    UNKNOWN: "\"UNKNOWN\"",
    ERROR: "\"ERROR\"",
  };

  const FORMULA = _helpersToGenerateFunctions({
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
  });
  

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
  function _getCellFormulaParser(sheet) {
    
    time();
    const columns = UTIL.getColumns(sheet);
    const rows = UTIL.getRows(sheet);
    const columnToValueToRows = {};
    const prettyPrint = true; // TODO extract to config/setting
    // Essentially static defs
    let UID_Counter = 0;
    const getParenPlaceholder = () =>  `PPH_${UID_Counter++}_PPH`;
    const getQuotePlaeholder = () => `QPH_${UID_Counter++}_QPH`;
    const _quoteMapping = {};
    const _parentheticalMapping = {};
    const columnR1C1s = (column,_excludeRow) => {
      column = columns[column] || columns.byHeader[column] || column;
      const r1C1s = [];
      let startRow = rows.header + 1;
      if (_excludeRow) {
        if (_excludeRow == startRow) startRow++;
        else if (_excludeRow > startRow) {
          r1C1s.push(`R${startRow}C${column}:R${_excludeRow-1}C${column}`);
          startRow = _excludeRow+1;
        }
      }
      r1C1s.push(`R${startRow}C${column}:C${column}`);
      return r1C1s;
    };
    const columnR1C1 = column => columnR1C1s(column)[0];
    const cellR1C1 = (row, column) => {
      column = columns[column] || columns.byHeader[column] || column;
      return `R${row}C${column}`;
    };
    const rowsR1C1 = (rows, column) => {
      column = columns[column] || columns.byHeader[column] || column;
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
      time("getColumnValues " + column);
      const columnIndex = columns[column] || columns.byHeader[column];
      if (!columnIndex) return;
      const valueToRows = {};
      
      const range = UTIL.getColumnDataRange(sheet, columnIndex);
      const firstRow = range.getRow();
      const values = range.getValues();
      values.forEach((valueArr,i) => {
        const value = valueArr[0];
        if (valueToRows[value]) {
          valueToRows[value].push(firstRow+i);
        } else {
          valueToRows[value] = [firstRow+i];
        }
      });
      columnToValueToRows[column] = valueToRows;
      valueToRows._entries = Object.entries(valueToRows);
      timeEnd("getColumnValues " + column);
      return valueToRows;
    };

    const parsersByRow = {};
    class CellFormulaParser {
      constructor(cellValue,row) {
        this.missed = [];
        this.uses = [];
        this.children = [];
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
          this.children.push(childFormula);
        }
      }

      toFormula() {
        const availableFormula = this.children.length == 0 ? "TRUE" : FORMULA.AND(this.children.map(child => child.toAvailableFormula()),prettyPrint);
        const errorConditions  = this.children.reduce((errors, child) => {
          Object.entries(child.getErrors()).forEach(([errorFormula, errorMessages]) => {
            if (errors[errorFormula]) {
              errors[errorFormula].add(...errorMessages);
            } else {
              errors[errorFormula] = errorMessages;
            }
          });
          return errors;
        }, {});
        const ifsArguments = [];
        // ERRORs
        Object.entries(errorConditions).forEach(([errorFormula, errorMessages]) => {
          ifsArguments.push(errorFormula, "\"ERROR: " + [...errorMessages].map(message => message.replace(/"/g,"\"&CHAR(34)&\"")).join("; ") + "\"");
        });
        // STATUS.CHECKED
        const checkedFormula = cellR1C1(this.row,"check");
        ifsArguments.push(checkedFormula, STATUS.CHECKED);
        // STATUS.AVAILABLE
        ifsArguments.push(availableFormula,STATUS.AVAILABLE);
        
        // STATUS.UNKNOWN (circular dependence so MISSED/USED is unknown); also gives the actual formula errors if present
        // if (false) {
        if (this.hasCircularDependency()) {
          ifsArguments.push("TRUE",STATUS.UNKNOWN);
        } else {
          // STATUS.PR_USED (ignore errors)
          const prNotUsedFormulaArguments = this.children.map(child => child.toPRNotUsedFormula()).filter(value => value != "FALSE");
          if (prNotUsedFormulaArguments.length > 0) {
            const prUsedFormula = FORMULA.NOT(FORMULA.AND(prNotUsedFormulaArguments,prettyPrint),prettyPrint);
            ifsArguments.push(prUsedFormula, STATUS.PR_USED);
          }
          // STATUS.MISSED (ignore errors)
          const notMissedFormulaArguments = this.children.map(child => child.toNotMissedFormula()).filter(value => value != "FALSE");
          if (notMissedFormulaArguments.length > 0) {
            const missedFormula = FORMULA.NOT(FORMULA.AND(notMissedFormulaArguments,prettyPrint),prettyPrint);
            ifsArguments.push(missedFormula, STATUS.MISSED);
          }
          // STATUS.PR_NOT_MET (Fallback; we know it's not checked, available, missed or pre-reqs used, so just pre-reqs)
          ifsArguments.push("TRUE",STATUS.PR_NOT_MET);
        }

        
        //console.log([this.row,notMissedFormulaArguments,prNotUsedFormulaArguments]);
        return FORMULA.IFS(ifsArguments,prettyPrint);
      }

      

      hasCircularDependency() {
        if (this._isCircular === true || this._isCircular === false) return this._isCircular;
        if (this._lockCircular) {
          this._isCircular = true;
        } else {
          this._lockCircular = true;
          const result = this.children.reduce((v,child) => child.hasCircularDependency() || v,false);
          this._lockCircular = false;
          
          if (!this._isCircular) this._isCircular = result;
        }
        // console.log("row,ic,type,text",this.row,this._isCircular,this.constructor.name,this.text);
        return this._isCircular;
      }

    }

    CellFormulaParser.FormulaNode = class FormulaNode {
    
      constructor(text,row) {
        this.errors = {};
        this.children = [];
        this.value = undefined;
        this.type = undefined;
        this.text = text.toString().trim();
        this.row = row;

        if (_parentheticalMapping[this.text]) {
          this.text = _parentheticalMapping[this.text];
        }
        if (_quoteMapping[text]) {
          this.text = _quoteMapping[text];
        }
      }

      addError(conditionFormula, message) {
        if (!this.errors[conditionFormula]) {
          this.errors[conditionFormula] = new Set();
        }
        this.errors[conditionFormula].add(message);
      }

      addErrors(errors) {
        for (const errorFormula in errors) {
          for (const message of errors[errorFormula]) {
            this.addError(errorFormula, message);
          }
        }
      }

      getErrors() {
        this.children.forEach(childFormula => this.addErrors(childFormula.getErrors()));
        return this.errors;
      }

      toAvailableFormula() {
        let formula;
        if (this.type) {
          formula = this.type.generateFormula(this.children.map(childFormula => childFormula.toAvailableFormula()),prettyPrint);
        } else if (this.value !== undefined) {
          formula =  this.value;
        } else {
          formula = this.text;
        }
        // console.log(this);
        // console.log(`${this.constructor.name}.toAvailableFormula(${this.text}): ${formula}`);
        return formula;
      }

      toNotMissedFormula() {
        let formula;
        if (this.type) {
          formula = this.type.generateFormula(this.children.map(childFormula => childFormula.toNotMissedFormula()),prettyPrint);
        } else if (this.value !== undefined) {
          formula =  this.value;
        } else {
          formula = this.text;
        }
        return formula;
      }

      toPRNotUsedFormula() {
        let formula;
        if (this.type) {
          formula = this.type.generateFormula(this.children.map(childFormula => childFormula.toPRNotUsedFormula()),prettyPrint);
        } else if (this.value !== undefined) {
          formula =  this.value;
        } else {
          formula = this.text;
        }
        return formula;
      }

      hasCircularDependency() {
        if (this._isCircular === true || this._isCircular === false) return this._isCircular;
        if (this._lockCircular) {
          this._isCircular = true;
        } else {
          this._lockCircular = true;
          const result = this.children.reduce((v,child) => child.hasCircularDependency() || v,false);
          this._lockCircular = false;
          
          if (!this._isCircular) this._isCircular = result;
        }
        // console.log("row,ic,type,text",this.row,this._isCircular,this.constructor.name,this.text);
        return this._isCircular;
      }
    };

    CellFormulaParser.BooleanFormulaNode = class BooleanFormulaNode extends CellFormulaParser.FormulaNode {
      constructor(text,row) {
        super(text,row);
      
        for (const booleanFormulaTranslationHelper of [
          FORMULA.OR, 
          FORMULA.AND, 
          FORMULA.NOT
        ]) {
        // Recursively handle boolean operators
          if (booleanFormulaTranslationHelper.identify(this.text)) {
            this.type = booleanFormulaTranslationHelper;
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
            this.type = comparisonFormulaTranslationHelper;
            const operands = comparisonFormulaTranslationHelper.parseOperands(this.text);
            this.children.push(...operands.map(operand => new CellFormulaParser.NumberFormulaNode(operand,this.row)));
            return;
          }
        } 

        this.type = FORMULA.AND;
        this.children.push(new CellFormulaParser.BooleanFormulaValueNode(this.text,this.row));
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
            this.type = arithmeticFormulaTranslationHelper;
            const operands = arithmeticFormulaTranslationHelper.parseOperands(this.text);
            this.children.push(...operands.map(operand => new NumberFormulaNode(operand,this.row)));
            return;
          }
        }
        this.type = FORMULA.ADD;
        this.children.push(new CellFormulaParser.NumberFormulaValueNode(text,this.row));
      }
    };

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
                const search = RegExp(valueInfo.id.replace(/\*/g,".*"));
                valuesToRows._entries.forEach(([value,valueRows]) => {
                  if (value.match(search)) {
                    rows.push(...valueRows);
                  }
                });
              }
            } else {
              this.addError("TRUE",`Could not find column "${valueInfo.altColumnName}"`);
            }
            valueInfo.rows = rows;
            
            valueInfoCache[text] = valueInfo;
          }
        }
        valueInfo = Object.assign({},valueInfo);
        valueInfo.rows = [...valueInfo.rows];

        const rowIndex = valueInfo.rows.indexOf(this.row);
        if (rowIndex >= 0) {
          valueInfo.rows.splice(rowIndex,1);
          valueInfo.wasSelfReferential = true;
        }
        this.valueInfo = valueInfo;
      }
      _getCountIfsArguments(additionalArguments) {
        const countIfArguments = [columnR1C1(this.valueInfo.altColumnName || "item"),`"${this.valueInfo.id}"`];
        if (additionalArguments) {
          return [...countIfArguments,...additionalArguments];
        } else {
          return countIfArguments;
        }
      }

      hasCircularDependency() {
        if (this._isCircular === true || this._isCircular === false) return this._isCircular;
        if (this._lockCircular) {
          this._isCircular = true;
        } else {
          this._lockCircular = true;
          const result = this.valueInfo.rows.reduce((v,row) => parsersByRow[row].hasCircularDependency() || v,false);
          this._lockCircular = false;
          
          if (!this._isCircular) this._isCircular = result;
        }
        // console.log("row,ic,type,text",this.row,this._isCircular,this.constructor.name,this.text);
        return this._isCircular;
      }
    };

    CellFormulaParser.BooleanFormulaValueNode = class BooleanFormulaValueNode extends CellFormulaParser.FormulaValueNode {
      constructor(text,row) {
        super(text,row);
        if (typeof this.text == "boolean" || this.text.toString().toUpperCase() == "TRUE" || this.text.toString().toUpperCase() == "FALSE") {
          this.value = this.text.toString().toUpperCase();
        } else {
        // CHECKED > NEEDED
          this.type = FORMULA.GTE;
          this.children = [new CellFormulaParser.NumberFormulaValueNode(this.text,this.row), new CellFormulaParser.NumberFormulaValueNode(this.valueInfo.numNeeded,this.row)];
        }
      }

      getErrors() {
        if (this.valueInfo.isMulti) {
          const notEnoughFormula = FORMULA.LT([
            FORMULA.COUNTIF(this._getCountIfsArguments(),prettyPrint),
            this.valueInfo.numNeeded
          ],prettyPrint);
          this.addError(notEnoughFormula, `There are not ${this.valueInfo.numNeeded} of ${this.valueInfo.altColumnName || "Item"} "${this.valueInfo.id}"`);
          if (this.valueInfo.rows.length < this.valueInfo.numNeeded) {
            console.log("errRows<",this.valueInfo,valueInfoCache[this.text]);
            this.addError("TRUE", `There are not ${this.valueInfo.numNeeded} of ${this.valueInfo.altColumnName || "Item"} "${this.valueInfo.id}"${this.valueInfo.wasSelfReferential ? " (when excluding this row)" : ""}`);
          }
        }
        return super.getErrors();
      }
    };
  
    CellFormulaParser.NumberFormulaValueNode = class NumberFormulaValueNode extends CellFormulaParser.FormulaValueNode {
      constructor(text,row) {
        super(text,row);
        if (Number(this.text) || this.text === 0 || this.text === "0") {
          this.value = Number(this.text);
        }
      }

      getErrors() {
        if (!(typeof this.value == "number")) {
          const notFoundFormula = FORMULA.LT([
            FORMULA.COUNTIF(this._getCountIfsArguments(),prettyPrint),
            1
          ],prettyPrint);
          this.addError(notFoundFormula, `Could not find ${this.valueInfo.isMulti ? "any of " : ""}${this.valueInfo.altColumnName || "Item"} "${this.valueInfo.id}"`);
          if (this.valueInfo.rows.length == 0) {
            console.log("errRows0",this.valueInfo,valueInfoCache[this.text]);
            if (this.valueInfo.wasSelfReferential) {
              // If it is the only one and isMulti, will have a "Not Enough" error
              this.addError("TRUE", "Cannot have a pre-req of itself");
            } else {
              this.addError("TRUE",`Could not find ${this.valueInfo.isMulti ? "any of " : ""}${this.valueInfo.altColumnName || "Item"} "${this.valueInfo.id}"`);
            }
          }
        }
        return super.getErrors();
      }

      /**
       * Number that have been checked
       */
      toAvailableFormula() { 
        return this._generateFormula([
          columnR1C1("check")
          ,"TRUE"
        ]);
      }

      /**
       * Number that have NOT been MISSED or PR_USED
       */
      toNotMissedFormula() {
        // console.log("NMV text,value,valueInfo",this.text,this.value,this.valueInfo);
        if (typeof this.value == "number") {
          return this.value;
        }
        const rows = this.valueInfo.rows;
        if (!rows) return this.value;
        const missedCells = [];
        rowsR1C1(rows, "available").forEach(rangeR1C1 => {
          missedCells.push(FORMULA.COUNTIF([rangeR1C1,"\"MISSED\""]), FORMULA.COUNTIF([rangeR1C1,"\"PR_USED\""]));
        });
        return FORMULA.MINUS([rows.length,...missedCells],true);
      }
      toPRNotUsedFormula() {
        if (typeof this.value == "number") {
          return this.value;
        }
        const rows = this.valueInfo.rows;
        if (!rows) return this.value;
        const missedCells = [];
        rowsR1C1(rows, "available").forEach(rangeR1C1 => {
          missedCells.push(FORMULA.COUNTIF([rangeR1C1,"\"PR_USED\""]));
        });
        return FORMULA.MINUS([rows.length,...missedCells],true);     
      }

      _generateFormula(additionalCountIfsValues) {
        if (typeof this.value == "number") {
          return this.value;
        } else {
          // NUM_CHECKED
          if (this.valueInfo.altColumnName) {
            if (!UTIL.getColumns().byHeader[this.valueInfo.altColumnName]) {
              this.addError("TRUE", `Cannot find column ${this.valueInfo.altColumnName}`);
              return -1;
            }
          }
          const countIfsValues = this._getCountIfsArguments(additionalCountIfsValues);
          return FORMULA.COUNTIFS(countIfsValues, prettyPrint);
        }
      }

      // Total number matching
      toTotalFormula() {
        return this._generateFormula();
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
      }

      toPRNotUsedFormula() {
        // (TOTAL - USED) >= NEEDED
        const usedAmountFormula = CellFormulaParser.UsesFormulaNode._getPRUsedAmountFormula(this.valueInfo.key);
        const totalFormula = this.children[0].toTotalFormula();
        const amountLeftFormula = FORMULA.MINUS([totalFormula, usedAmountFormula], prettyPrint);
        const usedFormula =  FORMULA.GTE([amountLeftFormula,this.valueInfo.numNeeded],prettyPrint);
        return usedFormula;
      }

      static _getPRUsedAmountFormula(key) {
        const usedAmoutArguments = Object.entries(usesInfo[key]).map(([row,numUsed]) => FORMULA.IF([cellR1C1(row,"check"),numUsed]));
        return FORMULA.ADD(usedAmoutArguments, true);
      }

      toAvailableFormula() {
        // Parent => CHECKED >= NEEDED
        // This   => (CHECKED - USED) >= NEEDED
        const usedAmountFormula = CellFormulaParser.UsesFormulaNode._getPRUsedAmountFormula(this.valueInfo.key);
        const checkedFormula = this.children[0].toAvailableFormula();
        const availableAmountFormula = FORMULA.MINUS([checkedFormula,usedAmountFormula]);
        const numNeededFormula = this.children[1].toAvailableFormula();
        return this.type.generateFormula([availableAmountFormula, numNeededFormula],true);
      }

    };

    CellFormulaParser.MissedFormulaNode = class MissedFormulaNode extends CellFormulaParser.FormulaNode {
      constructor(text,row) {
        super(text,row);
        this.type = FORMULA.NOT;
        this.children.push(new CellFormulaParser.BooleanFormulaNode(this.text,this.row));
      }

      toNotMissedFormula() {
        return this.toAvailableFormula();
      }
      toPRNotUsedFormula() {
        return "FALSE";
      }
    };

    timeEnd();
    return CellFormulaParser;
  }

  // PUBLIC FUNCTIONS
  function populateAvailable(sheet = UTIL.getSheet(), event) {
    time();
    const columns = UTIL.getColumns(sheet);
    const rows = UTIL.getRows(sheet);
    let filteredRange;
    if (event
      && event.range
      && (event.value || event.oldValue) // Single cell update
      && event.range.getRow() > rows.header // In data range
      && (!event.value || !event.value.toString().match(/USES/i))  // NOT uses
      && (!event.oldValue || !event.oldValue.toString().match(/USES/i)) // WASN'T uses
    ) {
      // If it's a single, non-"USES" cell, only update it
      // filteredRange = event.range;
    }
  
    // Must have required columns
    if (!columns.available || !columns.check || !columns.item || !columns.preReq) return;
    
    const preReqRange = UTIL.getColumnDataRangeFromRange(sheet, columns.preReq, filteredRange);
    const availableDataRange = UTIL.getColumnDataRangeFromRange(sheet, columns.available, filteredRange);

    if (!preReqRange || !availableDataRange) return; // filteredRange had no data rows; shouldn't be hit
    const CellFormulaParser = _getCellFormulaParser(sheet);

    const firstRow = preReqRange.getRow();
    const preReqValues = preReqRange.getValues();
    // if (!filteredRange) _allPreReqValuesCache = preReqValues;
    const preReqFormulas = preReqRange.getFormulas();

    // TODO add interactive validation?
    //const preReqValidations = preReqRange.getDataValidations(); 
  
    // will be overwriting these
    const availables = availableDataRange.getValues();

    for (let i = 0; i < preReqValues.length; i++) {
      if (preReqFormulas[i][0]) {
        // Allow direct formulas, just use reference
        availables[i][0] = "R" + (i+firstRow) + "C" + columns.preReq;
      } else {
        availables[i][0] = new CellFormulaParser(preReqValues[i][0],i+firstRow);
      }
    }
    availables.forEach(availableArray => {
      if (availableArray[0].toFormula) {
        availableArray[0] = availableArray[0].toFormula();
      }
    });
  
    availableDataRange.setFormulasR1C1(availables);

    //checkErrors(availableDataRange);
    //console.log(availables);
    timeEnd();
    return;
  }

  function checkErrors(range) {
    time();
    const sheet = range && range.getSheet() || UTIL.getSheet();
    const columns = UTIL.getColumns(sheet);
    const preReqRange = UTIL.getColumnDataRangeFromRange(sheet, columns.preReq, range);
    const availableRange = UTIL.getColumnDataRangeFromRange(sheet, columns.available, range);
    const notes = [];
    if (!preReqRange || !availableRange) return;
    const availableValues = availableRange.getValues();
    availableValues.forEach((value,i) => {
      let note = null;
      // console.log("value",value);
      if (value[0] && value[0].toString().indexOf("ERROR:") == 0) {
        // Is Error, find the possible error messages
        note = value[0];
      } else if (value[0] && value[0][0] == "#") {
        note = "Resulted in a " + value[0] + " type error.";
        if (value[0] == "#REF!") {
          note += "\nThis is most likely due to a circular depandency. DO NOT TURN ON ITERATIVE CALCULATIONS, this can have unexpected side effects!";
        }
        note += "\nCheck the hidden \"Availability\" column for possibly more info.";
      }
      notes[i] = [note];
    });
    preReqRange.setNotes(notes);
    timeEnd();
  }

  return {
    populateAvailable,
    checkErrors,
  };
})();