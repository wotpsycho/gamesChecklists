/* exported AVAILABLE */
// eslint-disable-next-line no-redeclare
const AVAILABLE = (function(){

  const STATUS = Object.freeze({
    CHECKED: "CHECKED",
    AVAILABLE: "TRUE",
    MISSED: "MISSED",
    PR_USED: "PR_USED",
    PR_NOT_MET: "FALSE",
    UNKNOWN: "UNKNOWN",
    ERROR: "ERROR",
  });

  // CLASS DEFINITION
  function _getCellFormulaParser(checklist) {
    time();
    // static imports
    const {COLUMN} = Checklist;
    const {A1,VALUE,OR,AND,NOT,EQ,NE,GTE,GT,LTE,LT,ADD,MINUS,MULT,DIV,IFS,IF,COUNTIF} = FORMULA;

    const columnToValueToRows = {};
    // Essentially static defs
    let UID_Counter = 0;
    const getParenPlaceholder = () =>  `PPH_${UID_Counter++}_PPH`;
    const getQuotePlaeholder = () => `QPH_${UID_Counter++}_QPH`;
    const quoteMapping = {};
    const parentheticalMapping = {};

    const cellA1 = (row, column) => {
      column = checklist.toColumnIndex(column);
      return A1(row,column);
    };
    const rowsA1 = (rows, column) => {
      column = checklist.toColumnIndex(column);
      const ranges = [];
      if (rows.length === 0) return ranges;
      let firstRow = rows[0];
      let lastRow = rows[0];
      for (let i = 1; i < rows.length; i++) {
        if (rows[i] != lastRow+1) {
          ranges.push(A1(firstRow,column,lastRow,column));
          firstRow = lastRow = rows[i];
        } else {
          lastRow = rows[i];
        }
      }
      ranges.push(A1(firstRow,column,lastRow,column));
      return ranges;
    };
    const getColumnValues = (column) => {
      if (!checklist.hasColumn(column)) return;
      column = checklist.toColumnIndex(column);
      if (columnToValueToRows[column]) return columnToValueToRows[column];
      time(column);
      const valueToRows = {};
      
      const firstRow = checklist.firstDataRow;
      const values = checklist.getColumnDataValues(column);
      values.forEach((value,i) => {
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
    class CellFormulaParser {
      static getParserForRow(row) {
        if (parsersByRow[row]) {
          return parsersByRow[row];
        } else {
          return new CellFormulaParser(row);
        }
      }
      constructor(row, cellValue = checklist.getValue(row, COLUMN.PRE_REQS)) {
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
            quoteMapping[placeholder] = text;
            return placeholder;
          });
        
          let match;
          const parenMatcher = /\(([^()]*)\)/;
          // eslint-disable-next-line no-cond-assign
          while (match = line.match(parenMatcher)) {
            const placeholder = getParenPlaceholder();
            parentheticalMapping[placeholder] = match[1];
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
        return this.getErrors().size > 0;
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
        return FORMULA(this.rootNode.toAvailableFormula());
      }
      toRawMissedFormula() {
        return FORMULA(this.rootNode.toRawMissedFormula());
      }
      toMissedFormula() {
        return FORMULA(this.rootNode.toMissedFormula());
      }
      toPRUsedFormula() {
        return FORMULA(this.rootNode.toPRUsedFormula());
      }
      toUnknownFormula() {
        return FORMULA(this.rootNode.toUnknownFormula());
      }
      toErrorFormula() {
        return FORMULA(this.rootNode.toErrorFormula());
      }
      toStatusFormula() {
        return FORMULA(this.rootNode.toStatusFormula());
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

        if (parentheticalMapping[this.text]) {
          this.text = parentheticalMapping[this.text];
        }
        if (quoteMapping[text]) {
          this.text = quoteMapping[text];
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


      toErrorFormula() {
        return VALUE(this.hasErrors());
      }

      toCheckedFormula() {
        return A1(this.row, checklist.toColumnIndex(COLUMN.CHECK));
      }


      toAvailableFormula() {
        let formula;
        if (this.formulaType) {
          formula = this.formulaType.generateFormula(this.children.map(child => child.toAvailableFormula()));
        } else if (this.children.length === 1) {
          formula = this.children[0].toAvailableFormula();
        } else if (this.hasValue()) {
          formula = VALUE(this.value);
        } else {
          this.addError(`Could not determine formula for "${this.text}"`);
        }
        return formula;
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
            OR, 
            AND, 
            NOT
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
            EQ, 
            NE, 
            GTE,
            GT,
            LTE,
            LT
          ]) {
            // Recursively handle comparison operators
            if (comparisonFormulaTranslationHelper.identify(this.text)) {
              this.children.push(new CellFormulaParser.ComparisonFormulaNode(this.text,this.row,comparisonFormulaTranslationHelper));
              return;
            }
          } 
          this.children.push(new CellFormulaParser.BooleanFormulaValueNode(this.text,this.row));
        } else {
          this.value = true;
        }
      }

      toPRUsedFormula() {
        if (this.hasValue()) return VALUE.FALSE;
        if (this.isInCircularDependency()) return VALUE.FALSE;
        if (!this.formulaType) return this.children[0].toPRUsedFormula();
        switch (this.formulaType) {
          case AND: {
            return OR(
              this.children.map(child => AND(
                NOT(child.toRawMissedFormula()),
                child.toPRUsedFormula()
              )));
          }
          case OR: {
            return AND(
              this.children.map(child => AND(
                NOT(child.toRawMissedFormula()),
                child.toPRUsedFormula()
              )));
          }
          case NOT: {
            return this.children[0].toPRUsedFormula(); // TODO ???
          }
        }
      }

      toRawMissedFormula() {
        if (this.hasValue()) return VALUE.FALSE;
        if (this.isInCircularDependency()) return VALUE.FALSE;
        if (!this.formulaType) return this.children[0].toRawMissedFormula();
        switch (this.formulaType) {
          case AND: {
            return OR(this.children.map(child => child.toRawMissedFormula()));
          }
          case OR: {
            return AND(this.children.map(child => child.toRawMissedFormula()));
          }
          case NOT: {
            return this.children[0].toRawMissedFormula(); // TODO ???
          }
        }
      }

      toMissedFormula() {
        if (this.hasValue()) return VALUE.FALSE;
        if (this.isInCircularDependency()) return VALUE.FALSE;
        if (!this.formulaType) return this.children[0].toMissedFormula();
        switch (this.formulaType) {
          case AND: {
            return OR(this.children.map(child => child.toMissedFormula()));
          }
          case OR: {
            return AND(this.children.map(child => child.toMissedFormula()));
          }
          case NOT: {
            return this.children[0].toMissedFormula(); // TODO ???
          }
        }
      }

      toUnknownFormula() {
        if (this.hasValue()) return VALUE.FALSE;
        if (this.isInCircularDependency()) return VALUE.TRUE;
        if (!this.formulaType) return this.children[0].toUnknownFormula();
        switch (this.formulaType) {
          case AND: {
            return AND(
              this.children.map(child => NOT(child.toRawMissedFormula())),
              OR(this.children.map(child => child.toUnknownFormula()))
            );
          }
          case OR: {
            return AND(
              OR(this.children.map(child => child.toUnknownFormula())),
              this.children.map(child => OR(child.toUnknownFormula(),child.toMissedFormula()))
            );
          }
          case NOT: {
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
          this.formulaType = AND;
        } else {
          this.value = true;
        }
      }
      toStatusFormula() {
        const ifsArgs = [];
        const order = [
          [STATUS.ERROR,      this.toErrorFormula],
          [STATUS.CHECKED,    this.toCheckedFormula],
          [STATUS.AVAILABLE,  this.toAvailableFormula],
          [STATUS.UNKNOWN,    this.toUnknownFormula],
          [STATUS.PR_USED,    this.toPRUsedFormula],
          [STATUS.MISSED,     this.toMissedFormula],
          [STATUS.PR_NOT_MET, () => VALUE.TRUE],
        ];
        for (const [status,formulaFunction] of order) {
          const formula = formulaFunction.call(this);
          if (formula != VALUE.FALSE) {
            ifsArgs.push(formula,VALUE(status));
          }
          if (formula == VALUE.TRUE) {
            break;
          }
        }
        return IFS(ifsArgs);
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
          case EQ:
            isError = this.children[0].getMaxValue() < this.children[1].getMinValue() || this.children[0].getMinValue() > this.children[1].getMaxValue();
            break;
          case NE: {
            const lMax = this.children[0].getMaxValue();
            isError = lMax == this.children[0].getMinValue() && lMax == this.children[1].getMinValue() && lMax == this.children[1].getMaxValue();
            break;
          }
          case GTE:
            isError = !(this.children[0].getMaxValue() >= this.children[1].getMinValue());
            break;
          case GT:
            isError = !(this.children[0].getMaxValue() > this.children[1].getMinValue());
            break;
          case LTE:
            isError = !(this.children[0].getMinValue() <= this.children[1].getMaxValue());
            break;
          case LT:
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
        if (this.isInCircularDependency()) return VALUE.TRUE;
        return this._toFormulaByNotStatus(this.toUnknownFormula.name, STATUS.UNKNOWN);
      }
      _toFormulaByNotStatus(formulaTypeName,notStatusesForMax,statusesForMin = STATUS.CHECKED) {
        if (this.hasErrors()) return VALUE.FALSE;
        if (this.isInCircularDependency()) return VALUE.FALSE;
        if (this.hasValue()) return VALUE(this.value);
        if (!this.formulaType) return this.children[0][formulaTypeName]();
        
        switch (this.formulaType) {
          case LT: {
            return GTE(this.children[0].toFormulaByStatus(statusesForMin),this.children[1].toFormulaByNotStatus(notStatusesForMax));
          }
          case LTE: {
            return GT(this.children[0].toFormulaByStatus(statusesForMin),this.children[1].toFormulaByNotStatus(notStatusesForMax));
          }
          case GT: {
            return LTE(this.children[0].toFormulaByNotStatus(notStatusesForMax),this.children[1].toFormulaByStatus(statusesForMin));
          }
          case GTE: {
            return LT(this.children[0].toFormulaByNotStatus(notStatusesForMax),this.children[1].toFormulaByStatus(statusesForMin));
          }
          case EQ: {
            return OR([
              LT(this.children[0].toFormulaByNotStatus(notStatusesForMax),this.children[1].toFormulaByStatus(statusesForMin)),
              GT(this.children[0].toFormulaByStatus(statusesForMin),this.children[1].toFormulaByNotStatus(notStatusesForMax))
            ]);
          }
          case NE: {
            return AND([
              EQ(this.children[0].toFormulaByNotStatus(notStatusesForMax),this.children[0].toFormulaByStatus(statusesForMin)),
              EQ(this.children[0].toFormulaByNotStatus(notStatusesForMax),this.children[1].toFormulaByStatus(statusesForMin)),
              EQ(this.children[0].toFormulaByStatus(statusesForMin),this.children[1].toFormulaByNotStatus(notStatusesForMax))
            ]);
          }
        }
      }
    };

    CellFormulaParser.NumberFormulaNode = class NumberFormulaNode extends CellFormulaParser.FormulaNode {

      constructor(text,row) {
        super(text,row);
      
        for (const arithmeticFormulaTranslationHelper of [
          ADD,
          MINUS,
          MULT,
          DIV,
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
          case ADD: return this.children.map(child => child.getMinValue()).reduce((min, childMin) => min + childMin);
          case MINUS: return this.children[0].getMinValue() - this.children.slice(1).map(child => child.getMaxValue()).reduce((max, childMax) => max + childMax);
          case MULT: return this.children.map(child => child.getMinValue()).reduce((min, childMin) => min * childMin);
          case DIV: return this.children[0].getMinValue() / (this.children[1].getMaxValue() || 1);
        }
      }

      getMaxValue() {
        if (this.hasValue()) return this.value();
        if (!this.formulaType) {
          return this.children[0].getMaxValue();
        } else switch(this.formulaType) {
          case ADD: return this.children.map(child => child.getMaxValue()).reduce((max, childMax) => max + childMax);
          case MINUS: return this.children[0].getMaxValue() - this.children.map(child => child.getMinValue()).slice(1).reduce((min, childMin) => min + childMin);
          case MULT: return this.children.map(child => child.getMaxValue()).reduce((max, childMax) => max * childMax);
          case DIV: return this.children[0].getMaxValue() / (this.children[1].getMinValue() || 1);
        }
      }

      toFormulaByStatus(statuses) {
        if (this.hasValue()) return VALUE(this.value);
        if (!this.formulaType) return this.children[0].toFormulaByStatus(statuses);
        return this.formulaType.generateFormula(this.children.map(child => child.toFormulaByStatus(statuses)));
      }
      toFormulaByNotStatus(statuses) {
        if (this.hasValue()) return VALUE(this.value);
        if (!this.formulaType) return this.children[0].toFormulaByNotStatus(statuses);
        return this.formulaType.generateFormula(this.children.map(child => child.toFormulaByNotStatus(statuses)));
      }
      toRawNotMissedFormula() {
        if (this.hasValue()) return VALUE(this.value);
        if (!this.formulaType) return this.children[0].toRawNotMissedFormula();
        return this.formulaType.generateFormula(this.children.map(child => child.toRawNotMissedFormula()));
      }
      toRawMissedFormula() {
        if (this.hasValue()) return VALUE(this.value);
        if (!this.formulaType) return this.children[0].toRawMissedFormula();
        return this.formulaType.generateFormula(this.children.map(child => child.toRawMissedFormula()));
      }
      toUnknownFormula() {
        if (this.hasValue()) return VALUE(this.value);
        if (!this.formulaType) return this.children[0].toUnknownFormula();
        return this.formulaType.generateFormula(this.children.map(child => child.toUnknownFormula()));
      }
      
      toNotUnknownFormula() {
        if (this.hasValue()) return VALUE(this.value);
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
            if (quoteMapping[valueInfo.key]) {
              const rawParsedQuote = parseRegEx.exec(quoteMapping[valueInfo.key]);
              valueInfo.key = rawParsedQuote[3];
              valueInfo.altColumnName = rawParsedQuote[4];
              valueInfo.id = rawParsedQuote[5];
            }
            if (valueInfo.isMulti && !valueInfo.altColumnName && valueInfo.id.indexOf("*") < 0) {
            // Implicity prefix match on item for "[N]x [item]"
              valueInfo.id += "*";
            }
            const valuesToRows = getColumnValues(valueInfo.altColumnName || COLUMN.ITEM);
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
            CellFormulaParser.getParserForRow(row).getCircularDependencies([...previous]).forEach(circularDependencies.add, circularDependencies);
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
          this.value = this.text;
        } else if (this.hasErrors()) {
          this.value = false;
        } else {
          // CHECKED > NEEDED
          this.formulaType = GTE;
          this.children = [new CellFormulaParser.NumberFormulaValueNode(this.text,this.row), new CellFormulaParser.NumberFormulaValueNode(this.valueInfo.numNeeded,this.row)]; 
        }
      }
      toPRUsedFormula() {
        if (this.hasValue()) return VALUE.FALSE;
        return AND(
          GTE(
            MINUS(this.children[0].toTotalFormula(),this.children[0].toRawMissedFormula()),
            this.valueInfo.numNeeded
          ),
          LT(this.children[0].toPRNotUsedFormula(),this.valueInfo.numNeeded)
        );
      }
      toRawMissedFormula() {
        if (this.hasValue()) return VALUE.FALSE;
        return LT(this.children[0].toRawNotMissedFormula(),this.valueInfo.numNeeded);

      }
      toMissedFormula() {
        if (this.hasValue()) return VALUE.FALSE;
        return LT(this.children[0].toNotMissedFormula(),this.valueInfo.numNeeded);
      }
      toUnknownFormula() {
        if (this.hasValue()) return VALUE.FALSE;
        return AND(
          NOT(this.toMissedFormula()),
          LT(
            MINUS(this.children[0].toTotalFormula(),this.children[0].toMissedFormula(),this.children[0].toUnknownFormula()),
            this.valueInfo.numNeeded
          )
        );
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
        if (this.hasValue()) return VALUE(this.value);
        return this.valueInfo.rows.length;
      }

      toFormulaByStatus(...statuses) {
        return this._generateFormula(statuses.flat());
      }

      toFormulaByNotStatus(...statuses) {
        return MINUS(this.toTotalFormula(), this.toFormulaByStatus(statuses.flat()));
      }

      /**
       * Number that have been checked
       */
      toAvailableFormula() { 
        // Available should look directly at "check" column only to prevent circular references
        return this._generateFormula(true,COLUMN.CHECK);
      }

      /**
       * 
       */
      toPRNotMetFormula() {
        return MINUS(this.toTotalFormula(), this.toAvailableFormula());
      }


      /**
       * Number of dependencies that have been missed OR used
       */
      toMissedFormula() {
        return this.toFormulaByStatus(STATUS.MISSED,STATUS.PR_USED);
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
        return this.toFormulaByNotStatus(STATUS.MISSED,STATUS.PR_USED);
      }
      /**
       * Number of dependencies that have had their Pre-Reqs used
       */
      toPRUsedFormula() {
        if (this.hasValue()) return VALUE(this.value);
        return this._generateFormula(STATUS.PR_USED);
      }
      /**
       * Number of dependencies that have NOT had their Pre-Reqs used
       */
      toPRNotUsedFormula() {
        if (this.hasValue()) {
          return VALUE(this.value);
        }
        return MINUS(this.toTotalFormula(), this.toPRUsedFormula());
      }
      toMinCheckedFormula() {
        return this.toFormulaByStatus(STATUS.CHECKED);
      }
      toMaxCheckedFormula() {
        return this.toFormulaByNotStatus(STATUS.MISSED,STATUS.PR_USED);
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

      _generateFormula(statuses = [], column = COLUMN.STATUS) {
        if (this.hasValue()) {
          return VALUE(this.value);
        } else if (!statuses || statuses.length == 0) {
          return VALUE.ZERO;
        } else {
          if (!Array.isArray(statuses)) statuses = [statuses];
          const counts = rowsA1(this.valueInfo.rows, column).reduce((counts,range) => {
            statuses.forEach(status => counts.push(COUNTIF(range, VALUE(status))));
            return counts;
          },[]);
          return ADD(counts);
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
        return OR(
          LT(
            MINUS(
              this.children[0].toTotalFormula(),
              CellFormulaParser.UsesFormulaNode._getPRUsedAmountFormula(this.valueInfo.key)
            ),
            this.valueInfo.numNeeded
          ),
          this.children[0].toPRUsedFormula()
        );
      }

      static _getPRUsedAmountFormula(key) {
        const usedAmoutArguments = Object.entries(usesInfo[key]).map(([row,numUsed]) => IF(cellA1(row,COLUMN.CHECK),numUsed));
        return ADD(usedAmoutArguments);
      }

      toAvailableFormula() {
        // console.log(this.toAvailableFormula.name,"row,type,formulaType,numChildren,value,text",this.row,this.constructor.name,this.formulaType && this.formulaType.formulaName,this.children.length,this.value,this.text);

        // Parent => CHECKED >= NEEDED
        // This   => (CHECKED - USED) >= NEEDED
        const usedAmountFormula = CellFormulaParser.UsesFormulaNode._getPRUsedAmountFormula(this.valueInfo.key);
        const checkedFormula = this.children[0].toAvailableFormula();
        const availableAmountFormula = MINUS(checkedFormula,usedAmountFormula);
        const numNeededFormula = this.children[1].toAvailableFormula();
        return this.formulaType.generateFormula(availableAmountFormula, numNeededFormula);
      }

    };

    CellFormulaParser.MissedFormulaNode = class MissedFormulaNode extends CellFormulaParser.FormulaNode {
      constructor(text,row) {
        super(text,row);
        this.formulaType = NOT;
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
    const parsers = [];
    const statusFormulas = [];
    const notes = [];

    time("parseCells");
    for (let i = 0; i < preReqValues.length; i++) {
      if (preReqFormulas[i][0]) {
        // Allow direct formulas, just use reference
        statusFormulas[i] = FORMULA.A1(i+firstRow, checklist.toColumnIndex(COLUMN.PRE_REQS));//"R" + (i+firstRow) + "C" + checklist.toColumnIndex(COLUMN.PRE_REQS);
      } else {
        parsers[i] = new CellFormulaParser(i+firstRow,preReqValues[i][0]);
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
        formulaFunc: CellFormulaParser.prototype.toErrorFormula,
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
  
    availableDataRange.setFormulas(statusFormulas.map(formula => [formula]));
    preReqRange.setNotes(notes.map(note => [note]));
    
    Object.values(debugColumns).forEach(value => value.range.setFormulas(value.formulas));

    timeEnd();
    return;
  }


  return Object.freeze({
    populateAvailable,
    STATUS,
  });
})();