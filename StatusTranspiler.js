/* exported StatusTranspiler */
// eslint-disable-next-line no-redeclare
const StatusTranspiler = (function(){
  const SPECIAL_PREFIXES = {
    USES  : "USES",
    MISSED: "MISSED",
    CHOICE: "CHOICE",
  };

  let transpilerCreationLock = true;
  const checklistTranspilers = {};
  class StatusTranspiler {
    constructor(checklist) {
      if (transpilerCreationLock) throw new Error("Do not create transpiler direcly, use " + StatusTranspiler.getTranspilerForChecklist.name);
      Object.defineProperty(this,"checklist",{value: checklist});
      checklistTranspilers[checklist.sheetId] = this;
    }

    static getActiveChecklistTranspiler(){
      return StatusTranspiler.getTranspilerForChecklist(ChecklistApp.getActiveChecklist());
    }

    static getTranspilerForChecklist(checklist = ChecklistApp.getActiveChecklist()) {
      let transpiler = checklistTranspilers[checklist.sheetId];
      if (!transpiler) {
        transpilerCreationLock = false;
        transpiler = new StatusTranspiler(checklist);
        transpilerCreationLock = true;
      }
      return transpiler;
    }

    static validateAndGenerateStatusFormulasForChecklist(checklist = ChecklistApp.getActiveChecklist(), _event) {
      StatusTranspiler.getTranspilerForChecklist(checklist).validateAndGenerateStatusFormulas(_event);
    }

    // CLASS DEFINITION
    get CellFormulaParser() {
      if (this._CellFormulaParser) return this._CellFormulaParser;
      time("get CellFormulaParser");
      const checklist = this.checklist;
      // static imports
      const {COLUMN,STATUS} = ChecklistApp;
      const {A1,VALUE,OR,AND,NOT,EQ,NE,GTE,GT,LTE,LT,ADD,MINUS,MULT,DIV,IFS,IF,COUNTIF} = FORMULA;

      const columnInfo = {};
      // Essentially static defs
      const PARSE_REGEX = /^ *(?:(\d+)x|x(\d+) +)? *((?:(.*)!)?([^ ].*?)) *$/;
      let UID_Counter = 0;
      const getParenPlaceholder = () =>  `PPH_${UID_Counter++}_PPH`;
      const getQuotePlaeholder = () => `QPH_${UID_Counter++}_QPH`;
      const quoteMapping = {};
      const parentheticalMapping = {};

      const cellA1 = (row, column) => {
        column = this.checklist.toColumnIndex(column);
        return A1(row,column);
      };
      const rowInfosToA1Counts = (rowInfos, column) => {
        column = checklist.toColumnIndex(column);
        const rangeCounts = {};
        if (rowInfos.length === 0) return rangeCounts;
        let firstRow = rowInfos[0].row;
        let lastRow = rowInfos[0].row;
        let num = rowInfos[0].num;
        for (let i = 1; i < rowInfos.length; i++) {
          const rowInfo = rowInfos[i];
          if (rowInfo.row != lastRow+1 || rowInfo.num != num) {
            rangeCounts[A1(firstRow,column,lastRow,column)] = num;
            firstRow = lastRow = rowInfo.row;
            num = rowInfo.num;
          } else {
            lastRow = rowInfo.row;
          }
        }
        rangeCounts[A1(firstRow,column,lastRow,column)] = num;
        return rangeCounts;
      };
      const getColumnValues = (column) => {
        if (!checklist.hasColumn(column)) return;
        const columnIndex = checklist.toColumnIndex(column);
        if (columnInfo[columnIndex]) return columnInfo[columnIndex];
        time(`getColumnValues ${column}`);
        const byRow = {};
        const byValue = {};
      
        const firstRow = checklist.firstDataRow;
        const values = checklist.getColumnDataValues(columnIndex);
        values.forEach((value,i) => {
          const rawParsed = value.match(PARSE_REGEX) || [];
          const numReceived = Number(rawParsed[1] || rawParsed[2] || 1);
          const valueInfo = {
            num: numReceived,
            value: rawParsed[3],
            row: firstRow+i,
          };
          byRow[valueInfo.row] = valueInfo;
          
          if (byValue[valueInfo.value]) {
            byValue[valueInfo.value].push(valueInfo);
          } else {
            byValue[valueInfo.value] = [valueInfo];
          }
        });
        columnInfo[columnIndex] = {byRow,byValue};
        timeEnd(`getColumnValues ${column}`);
        return columnInfo[columnIndex];
      };

      const PREFIX_REGEX = new RegExp(`^(${Object.values(SPECIAL_PREFIXES).join("|")}) `, "i");
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

            let childFormulaNode;
            const prefixCheck = line.match(PREFIX_REGEX);
            if (prefixCheck) { 
              const content = line.substring(line.indexOf(" ")).trim();
              switch (prefixCheck[1].toUpperCase()) {
                case SPECIAL_PREFIXES.USES.toUpperCase():
                  childFormulaNode = new UsesFormulaNode(content,row);
                  break;
                case SPECIAL_PREFIXES.MISSED.toUpperCase():
                  childFormulaNode = new MissedFormulaNode(content,row);
                  break;
                case SPECIAL_PREFIXES.CHOICE.toUpperCase():
                  childFormulaNode = new ChoiceFormulaNode(content,row);
                  (this.choiceNodes || (this.choiceNodes = [])).push(childFormulaNode);
                  break;
              }
            } else {
              childFormulaNode = new BooleanFormulaNode(line,row);
            }
            children.push(childFormulaNode);
          }
          this.rootNode = new RootNode(children,row);
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

        getAllPossiblePreReqs() {
          const itemValues = getColumnValues(COLUMN.ITEM).byRow;
          return [...this.getAllPossiblePreReqRows()].map(row => itemValues[row].value);
        }

        getAllDirectlyMissablePreReqs() {
          const allMissableRows = [...this.getAllPossiblePreReqRows()].filter(row => parsersByRow[row].isDirectlyMissable());
          const itemValues = getColumnValues(COLUMN.ITEM).byRow;
          return [...allMissableRows].map(row => itemValues[row].value);
        }

        hasChoices() {
          return !!choiceRows[this.row];
        }

        getChoiceInfo() {
          if (this.hasChoices()) {
            const itemValues = getColumnValues(COLUMN.ITEM).byRow;
            const choiceInfo = {};
            choiceInfo.choiceCheckedFormula = OR(choiceRows[this.row].map(row => cellA1(row,COLUMN.CHECK)));
            choiceInfo.options = choiceRows[this.row].map(optionRow => itemValues[optionRow]);
            return choiceInfo;
          }
        }

        getAllPossiblePreReqRows() {
          return this.rootNode.getAllPossiblePreReqRows();
        }

        isDirectlyMissable() {
          return this.rootNode.isDirectlyMissable();
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
        toErrorFormula() {
          return this.rootNode.toErrorFormula();
        }
        toStatusFormula() {
          return this.rootNode.toStatusFormula();
        }
      }

      class FormulaNode {
    
        constructor(text,row) {
          this.errors = new Set();
          this.children = [];
          this.text = text.toString().trim();
          this.row = row;

          if (parentheticalMapping[this.text]) {
            this.text = parentheticalMapping[this.text];
          }
          if (quoteMapping[text]) {
            this.text = quoteMapping[text];
          }
        }

        get child() {
          return this.children.length == 1 ? this.children[0] : undefined;
        }

        set child(child) {
          if (!this.children.length > 1) throw new Error("Cannot set child for multi-child node");
          this.children[0] = child;
        }

        addError(message) {
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
          if (this.hasValue()) {
            return VALUE(this.value);
          } else if (this.formulaType) {
            formula = this.formulaType.generateFormula(this.children.map(child => child.toAvailableFormula()));
          } else if (this.child) {
            formula = this.child.toAvailableFormula();
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

        isDirectlyMissable() {
          return this.children.reduce((directlyMissable,child) => directlyMissable || child.isDirectlyMissable(), false);
        }

        getAllPossiblePreReqRows() {
          if (!this._allPossiblePreReqRows) {
            let allPossiblePreReqs;
            if (this.isInCircularDependency()) {
              allPossiblePreReqs = this.getCircularDependencies();
            } else {
              allPossiblePreReqs = new Set();
              this.children.forEach(child => 
                child.getAllPossiblePreReqRows().forEach(allPossiblePreReqs.add,allPossiblePreReqs)
              );
            }
            Object.defineProperty(this,"_allPossiblePreReqRows",{value: allPossiblePreReqs});
          }
          return this._allPossiblePreReqRows;
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
      }

      class BooleanFormulaNode extends FormulaNode {
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
                this.child = new ComparisonFormulaNode(this.text,this.row,comparisonFormulaTranslationHelper);
                return;
              }
            } 
            this.child = new BooleanFormulaValueNode(this.text,this.row);
          } else {
            this.value = true;
          }
        }

        toPRUsedFormula() {
          if (this.hasValue()) return VALUE.FALSE;
          if (this.isInCircularDependency()) return VALUE.FALSE;
          if (!this.formulaType) return this.child.toPRUsedFormula();
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
              return this.child.toPRUsedFormula(); // TODO ???
            }
          }
        }

        toRawMissedFormula() {
          if (this.hasValue()) return VALUE.FALSE;
          if (this.isInCircularDependency()) return VALUE.FALSE;
          if (!this.formulaType) return this.child.toRawMissedFormula();
          switch (this.formulaType) {
            case AND: {
              return OR(this.children.map(child => child.toRawMissedFormula()));
            }
            case OR: {
              return AND(this.children.map(child => child.toRawMissedFormula()));
            }
            case NOT: {
              return this.child.toRawMissedFormula(); // TODO ???
            }
          }
        }

        toMissedFormula() {
          if (this.hasValue()) return VALUE.FALSE;
          if (this.isInCircularDependency()) return VALUE.FALSE;
          if (!this.formulaType) return this.child.toMissedFormula();
          switch (this.formulaType) {
            case AND: {
              return OR(this.children.map(child => child.toMissedFormula()));
            }
            case OR: {
              return AND(this.children.map(child => child.toMissedFormula()));
            }
            case NOT: {
              return this.child.toMissedFormula(); // TODO ???
            }
          }
        }

        toUnknownFormula() {
          if (this.hasValue()) return VALUE.FALSE;
          if (this.isInCircularDependency()) return VALUE.TRUE;
          if (!this.formulaType) return this.child.toUnknownFormula();
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
              return this.child.toUnknownFormula(); // TODO ???
            }
          }
        }

        isDirectlyMissable() {
          if (this.type == NOT) return true;
          else return super.isDirectlyMissable();
        }
      }

      class RootNode extends BooleanFormulaNode {
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
        // Spike decided against, consider for future if running into cycles
        /* toChoiceStatusFormula() {
          // Choice rows become inverted, depending directly on option rows only, and option rows adoping these pre-reqs
          const ifsArgs = [];
          const order = [
            [STATUS.ERROR     , OR ]                , // Any error       => error
            [STATUS.CHECKED   , OR ]                , // Any checked     => checked
            [STATUS.AVAILABLE , OR ]                , // Any available   => available
            [STATUS.PR_NOT_MET, AND]                , // All unavailable => unavailable
            [STATUS.PR_USED   , AND]                , // All used        => used
            [STATUS.MISSED    , AND, STATUS.PR_USED], // All missed/used => missed
          ];
          const rowStatusA1s = choiceRows[this.row].map(row => cellA1(row,COLUMN.STATUS));
          order.forEach(([status,formulaType,...additionalStatuses]) => {
            additionalStatuses.push(status);
            const formula = formulaType(
              rowStatusA1s.map(a1 => 
                OR(additionalStatuses.map(
                  additionalStatus => EQ(a1,VALUE(additionalStatus))))
              )
            );
            ifsArgs.push(formula,VALUE(status));
          });
          ifsArgs.push(VALUE.TRUE,VALUE(STATUS.UNKNOWN));
          return IFS(ifsArgs);
        } */
      }

      class ComparisonFormulaNode extends FormulaNode {
        constructor(text,row,formulaType) {
          super(text,row);
        
          this.formulaType = formulaType;
          const operands = formulaType.parseOperands(this.text);
          this.children.push(...operands.map(operand => new NumberFormulaNode(operand,this.row)));
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
          if (!this.formulaType) return this.child[formulaTypeName]();
        
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
      }
      
      class NumberFormulaNode extends FormulaNode {

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
          this.child = new NumberFormulaValueNode(text,this.row);
        }

        getMinValue() {
          if (this.hasValue()) return this.value();
          if (!this.formulaType) {
            return this.child.getMinValue();
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
            return this.child.getMaxValue();
          } else switch(this.formulaType) {
            case ADD: return this.children.map(child => child.getMaxValue()).reduce((max, childMax) => max + childMax);
            case MINUS: return this.children[0].getMaxValue() - this.children.map(child => child.getMinValue()).slice(1).reduce((min, childMin) => min + childMin);
            case MULT: return this.children.map(child => child.getMaxValue()).reduce((max, childMax) => max * childMax);
            case DIV: return this.children[0].getMaxValue() / (this.children[1].getMinValue() || 1);
          }
        }

        toFormulaByStatus(statuses) {
          if (this.hasValue()) return VALUE(this.value);
          if (!this.formulaType) return this.child.toFormulaByStatus(statuses);
          return this.formulaType.generateFormula(this.children.map(child => child.toFormulaByStatus(statuses)));
        }
        toFormulaByNotStatus(statuses) {
          if (this.hasValue()) return VALUE(this.value);
          if (!this.formulaType) return this.child.toFormulaByNotStatus(statuses);
          return this.formulaType.generateFormula(this.children.map(child => child.toFormulaByNotStatus(statuses)));
        }
        toRawNotMissedFormula() {
          if (this.hasValue()) return VALUE(this.value);
          if (!this.formulaType) return this.child.toRawNotMissedFormula();
          return this.formulaType.generateFormula(this.children.map(child => child.toRawNotMissedFormula()));
        }
        toRawMissedFormula() {
          if (this.hasValue()) return VALUE(this.value);
          if (!this.formulaType) return this.child.toRawMissedFormula();
          return this.formulaType.generateFormula(this.children.map(child => child.toRawMissedFormula()));
        }
        toUnknownFormula() {
          if (this.hasValue()) return VALUE(this.value);
          if (!this.formulaType) return this.child.toUnknownFormula();
          return this.formulaType.generateFormula(this.children.map(child => child.toUnknownFormula()));
        }
      
        toNotUnknownFormula() {
          if (this.hasValue()) return VALUE(this.value);
          if (!this.formulaType) return this.child.toNotUnknownFormula();
          return this.formulaType.generateFormula(this.children.map(child => child.toNotUnknownFormula()));
        }
      
      }

      // Abstract intermediate class
      const valueInfoCache = {};
      class FormulaValueNode extends FormulaNode {
        constructor(text,row) {
          super(text,row);
        }

        get valueInfo() {
          const text = this.text;
          let valueInfo = valueInfoCache[text];
          if (!valueInfo) {
            const rawParsed = PARSE_REGEX.exec(text);
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
                const rawParsedQuote = PARSE_REGEX.exec(quoteMapping[valueInfo.key]);
                valueInfo.key = rawParsedQuote[3];
                valueInfo.altColumnName = rawParsedQuote[4];
                valueInfo.id = rawParsedQuote[5];
              }
              if (valueInfo.isMulti && !valueInfo.altColumnName && valueInfo.id.indexOf("*") < 0) {
                // Implicity prefix match on item for "[N]x [item]"
                valueInfo.id += "*";
              }
              const columnInfo = getColumnValues(valueInfo.altColumnName || COLUMN.ITEM);
              const rowInfos = [];
              if (columnInfo) {
                if (valueInfo.id.indexOf("*") < 0) {
                  if (columnInfo.byValue[valueInfo.id]) {
                    rowInfos.push(...(columnInfo.byValue[valueInfo.id]));
                  }
                } else {
                  const search = RegExp("^" + valueInfo.id.replace(/\*/g,".*") + "$");
                  Object.entries(columnInfo.byValue).forEach(([value,columnValueInfos]) => {
                    if (value.match(search)) {
                      rowInfos.push(...columnValueInfos);
                    }
                  });
                }
                
              } else {
                this.addError(`Could not find column "${valueInfo.altColumnName}"`);
              }
              const numPossible = rowInfos.reduce((total, rowInfo) => total + rowInfo.num, 0);
              valueInfo.rowInfos = rowInfos;
              valueInfo.numPossible = numPossible;
            
              valueInfoCache[text] = valueInfo;
            }
          }
          // Copy cached object
          if (valueInfo) {
            valueInfo = Object.assign({},valueInfo);
            if (valueInfo.rowInfos) {
              if (choiceInfos[valueInfo.key]) {
                valueInfo.isChoice = true;
                if (valueInfo.rowInfos.length == 0) {
                // Is a choice with no row, set rows to choice's rows
                //num vlaue row
                  const columnValues = getColumnValues(COLUMN.ITEM).byRow;
                  valueInfo.rowInfos = choiceInfos[valueInfo.key].options.map(optionRow => columnValues[optionRow]);
                  valueInfo.numPossible = 1;
                  valueInfo.isChoiceOnly = true;
                }
              }
              valueInfo.rowInfos = [...valueInfo.rowInfos.map(rowInfo => Object.assign({},rowInfo))];
              // Remove self reference (simplest dependency resolution, v0)
              const rowIndex = valueInfo.rowInfos.findIndex(rowInfo => rowInfo.row == this.row);
              if (rowIndex >= 0) {
                const removed = valueInfo.rowInfos.splice(rowIndex,1);
                valueInfo.wasSelfReferential = true;
                if (!valueInfo.isChoiceOnly) valueInfo.numPossible -= removed[0].num;
              }
            }
          }

          return valueInfo;
        }

        checkErrors() {
          if (!this.hasValue()) {
            if (!this.valueInfo) {
              this.addError(`Could not find "${this.text}"`);
            } else if (this.valueInfo.numPossible == 0) {
              this.addError(`Could not find ${this.valueInfo.isMulti ? "any of " : ""}${this.valueInfo.altColumnName || "Item"} "${this.valueInfo.id}"${this.valueInfo.wasSelfReferential ? " (except itself)" : ""}`);
            } else if (this.valueInfo.numPossible < this.valueInfo.numNeeded) {
              this.addError(`There are only ${this.valueInfo.numPossible}, not ${this.valueInfo.numNeeded}, of ${this.valueInfo.altColumnName || "Item"} "${this.valueInfo.id}"${this.valueInfo.wasSelfReferential ? " (when excluding itself)" : ""}`);
            }
          }
        }

        getAllPossiblePreReqRows() {
          if (!this._allPossiblePreReqRows) {
            let allPossiblePreReqs;
            if (this.isInCircularDependency()) {
              allPossiblePreReqs = this.getCircularDependencies();
            } else {
              allPossiblePreReqs = new Set(this.valueInfo.rowInfos.map(rowInfo => rowInfo.row));
              this.valueInfo.rowInfos.forEach(rowInfo => 
                CellFormulaParser.getParserForRow(rowInfo.row).getAllPossiblePreReqRows().forEach(allPossiblePreReqs.add,allPossiblePreReqs)
              );
            }
            Object.defineProperty(this,"_allPossiblePreReqRows",{value: allPossiblePreReqs});
          }
          return this._allPossiblePreReqRows;
        }
      
        getCircularDependencies(previous = []) {
          if (this._circularDependencies) return this._circularDependencies;
          const circularDependencies = new Set();
          if (this._lockCircular) {
            previous.slice(previous.indexOf(this.row)).forEach(circularDependencies.add,circularDependencies);
          } else {
            previous.push(this.row);
            this._lockCircular = true;
            this.valueInfo.rowInfos.forEach(rowInfo => {
              CellFormulaParser.getParserForRow(rowInfo.row).getCircularDependencies([...previous]).forEach(circularDependencies.add, circularDependencies);
            });
            this._lockCircular = false;
          }
          if (circularDependencies.has(this.row)) this._isCircular = true;
          this._circularDependencies = circularDependencies;
          return this._circularDependencies;
        }

        isDirectlyMissable() {
          if (this.valueInfo.isChoiceOnly) return false;
          return super.isDirectlyMissable(); 
        }

      }
      
      class BooleanFormulaValueNode extends FormulaValueNode {
        constructor(text,row) {
          super(text,row);
          if (typeof this.text == "boolean" || this.text.toString().toUpperCase() == "TRUE" || this.text.toString().toUpperCase() == "FALSE") {
            this.value = this.text;
          } else {
          // CHECKED > NEEDED
            this.availableChild = new NumberFormulaValueNode(this.text,this.row);
            this.neededChild = new NumberFormulaValueNode(this.valueInfo.numNeeded,this.row); 
          }
        }
        get availableChild() {
          return this.children[0];
        }
        set availableChild(child) {
          this.children[0] = child;
        }
        get neededChild() {
          return this.children[1];
        }
        set neededChild(child) {
          this.children[1] = child;
        }

        get formulaType() {
          return GTE;
        }
        toPRUsedFormula() {
          if (this.hasValue()) return VALUE.FALSE;
          return AND(
            GTE(
              MINUS(this.availableChild.toTotalFormula(),this.availableChild.toRawMissedFormula()),
              this.valueInfo.numNeeded
            ),
            LT(this.availableChild.toPRNotUsedFormula(),this.valueInfo.numNeeded)
          );
        }
        toRawMissedFormula() {
          if (this.hasValue()) return VALUE.FALSE;
          return LT(this.availableChild.toRawNotMissedFormula(),this.valueInfo.numNeeded);

        }
        toMissedFormula() {
          if (this.hasValue()) return VALUE.FALSE;
          return LT(this.availableChild.toNotMissedFormula(),this.valueInfo.numNeeded);
        }
        toUnknownFormula() {
          if (this.hasValue()) return VALUE.FALSE;
          return AND(
            NOT(this.toMissedFormula()),
            LT(
              MINUS(this.availableChild.toTotalFormula(),this.availableChild.toMissedFormula(),this.availableChild.toUnknownFormula()),
              this.valueInfo.numNeeded
            )
          );
        }
      }
  
      class NumberFormulaValueNode extends FormulaValueNode {
        constructor(text,row) {
          super(text,row);
          if (Number(this.text) || this.text === 0 || this.text === "0") {
            this.value = Number(this.text);
          }
        }

        /**
       * Total number of rows matching dependency
       */
        toTotalFormula() {
          if (this.hasValue()) return VALUE(this.value);
          return this.valueInfo.numPossible;
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
            const counts = Object.entries(rowInfosToA1Counts(this.valueInfo.rowInfos, column)).reduce((counts,[range,count]) => {
              statuses.forEach(status => {
                const countIf = COUNTIF(range, VALUE(status));
                counts.push(count == 1 ? countIf : MULT(countIf,count));
              });
              return counts;
            },[]);
            return ADD(counts);
          }
        }
      }

      const usesInfo = {}; // Treating as static value in containing class since it is reset each populateAvailable call
      class UsesFormulaNode extends BooleanFormulaValueNode {
        constructor(text,row) {
          super(text,row);
          if (!usesInfo[this.valueInfo.key]) {
            usesInfo[this.valueInfo.key] = {};
          }
          usesInfo[this.valueInfo.key][this.row] = this.valueInfo.numNeeded;
        }

        toPRUsedFormula() {
          return OR(
            LT(
              MINUS(
                this.availableChild.toTotalFormula(),
                UsesFormulaNode._getPRUsedAmountFormula(this.valueInfo.key)
              ),
              this.valueInfo.numNeeded
            ),
            super.toPRUsedFormula()
          );
        }

        static _getPRUsedAmountFormula(key) {
          const usedAmoutArguments = Object.entries(usesInfo[key]).map(([row,numUsed]) => IF(cellA1(row,COLUMN.CHECK),numUsed));
          return ADD(usedAmoutArguments);
        }

        toAvailableFormula() {
        // Parent => CHECKED >= NEEDED
        // This   => (CHECKED - USED) >= NEEDED
          const usedAmountFormula = UsesFormulaNode._getPRUsedAmountFormula(this.valueInfo.key);
          const checkedFormula = this.availableChild.toAvailableFormula();
          const availableAmountFormula = MINUS(checkedFormula,usedAmountFormula);
          const numNeededFormula = this.neededChild.toAvailableFormula();
          return this.formulaType.generateFormula(availableAmountFormula, numNeededFormula);
        }

        isDirectlyMissable() {
          if (Object.values(usesInfo[this.valueInfo.key]).reduce((total,needed) => total+needed,0) > this.availableChild.getMaxValue()) {
            // if TOTAL_NEEDED > TOTAL_AVAILABLE
            return true;
          } else {
            return super.isDirectlyMissable();
          }
        }
      }

      const choiceInfos = {};
      const choiceRows = {};
      class ChoiceFormulaNode extends FormulaValueNode {
        constructor(text,row) {
          super(text,row);

          this.choiceInfo.options.push(this.row);
        }

        get isChoiceOnly() {
          return this.valueInfo.isChoiceOnly || !this.valueInfo.rowInfos.length;
        }
        get choiceRow() {
          return this.isChoiceOnly ? undefined : this.valueInfo.rowInfos[0].row;
        }
        get choiceInfo() {
          if (!choiceInfos[this.valueInfo.key]) {
            // Handles cache
            const choiceInfo = {
              isChoiceOnly: this.isChoiceOnly,
              choiceRow: this.choiceRow,
              options: [],
            };
            choiceInfos[this.valueInfo.key] = choiceInfo;
            if (this.choiceRow) {
              choiceRows[this.choiceRow] = choiceInfo.options;
            }
          }
          return choiceInfos[this.valueInfo.key];
        }
        checkErrors() {
          if (this.choiceInfo.options.length < 2) {
            this.addError(`CHOICE "${this.valueInfo.key}" only has this option`);
          }
          if (!this.isChoiceOnly) {
            if (this.valueInfo.rowInfos.length != 1) {
              this.addError("CHOICE must match either a single item, or have an identifier that matches no items but ties the options together.");
            }
            super.checkErrors();
          }
        }

        toAvailableFormula() {
          return this._determineFormula(
            NOT(this.toPRUsedFormula()),
            STATUS.AVAILABLE
          );
        }

        toPRUsedFormula() {
          return this._determineFormula(
            OR(this.choiceInfo.options.map(row => cellA1(row, COLUMN.CHECK))),
            STATUS.PR_USED,STATUS.CHECKED
          );
        }

        toRawMissedFormula() {
          return VALUE.FALSE;
        }

        toMissedFormula() {
          return this._determineFormula(VALUE.FALSE,STATUS.MISSED);
        }

        toUnknownFormula() {
          return this._determineFormula(VALUE.FALSE,STATUS.UNKNOWN);
        }

        _determineFormula(choiceOnlyFormula,...statuses) {
          return this.isChoiceOnly ? choiceOnlyFormula : this._getChoiceRowStatusFormula(...statuses);
        }

        _getChoiceRowStatusFormula(...statuses) {
          return OR(statuses.map(status => EQ(cellA1(this.choiceRow,COLUMN.STATUS),VALUE(status))));
        }
        /* Part of spike reversing dependencies, currently obsolute but keeping until checkin so there is record
        toAvailableFormula() {
          const andArguments = [NOT(this._getChoiceUsedFormula())];
          if (!this.isChoiceOnly) {
            andArguments.push(this._getChoiceStatusFormula(this.toAvailableFormula));
          }
          return AND(andArguments);
        }
        toPRUsedFormula() {
          // If any of the others with the same choice ID are checked, this is PR_USED aka Missed By Choice
          return this._getChoiceUsedFormula(true);
        }
        toRawMissedFormula() {
          return AND(NOT(this._getChoiceUsedFormula()),this._getChoiceStatusFormula(this.toRawMissedFormula));
        }
        toMissedFormula() {
          return this._getChoiceStatusFormula(this.toMissedFormula);
        }
        toUnknownFormula() {
          return this._getChoiceStatusFormula(this.toUnknownFormula);
        }

        _getChoiceStatusFormula(formulaFunction, _choiceOnlyValue = VALUE.FALSE) {
          return this.isChoiceOnly ? _choiceOnlyValue : parsersByRow[this.choiceRow][formulaFunction.name || formulaFunction]();// EQ(cellA1(this.choiceInfo.choiceRow,COLUMN.STATUS),VALUE(status));
        }
        
        _getChoiceUsedFormula(_includePRUsed = false) {
          const orArguments = this.choiceInfo.options.filter(row => row != this.row).map(row => cellA1(row,COLUMN.CHECK));
          if (_includePRUsed) {
            orArguments.push(this._getChoiceStatusFormula(this.toPRUsedFormula));
          }
          return OR(...orArguments);
        } */

        getAllPossiblePreReqRows() {
          if (this.isChoiceOnly) {
            return new Set();
          } else {
            return super.getAllPossiblePreReqRows();
          }
        }

        getCircularDependencies(previous) {
          if (this.isChoiceOnly) {
            return new Set();
          } else {
            return super.getCircularDependencies(previous);
          }
        }

        isDirectlyMissable() {
          return true;
        }
      }
      
      class MissedFormulaNode extends FormulaNode {
        constructor(text,row) {
          super(text,row);
          this.formulaType = NOT;
          this.child = new BooleanFormulaNode(this.text,this.row);
        } 

        toMissedFormula() {
          return this.child.toAvailableFormula();
        }
        toRawMissedFormula() {
          return this.child.toAvailableFormula();
        }
        toPRUsedFormula() {
          return this.child.toPRUsedFormula();
        }
        toUnknownFormula() {
          return this.child.toUnknownFormula();
        }
        isDirectlyMissable() {
          return true;
        }
      }

      timeEnd("get CellFormulaParser");
      Object.defineProperty(this,"_CellFormulaParser",{value: CellFormulaParser}); // Prevents rewrite
      return this._CellFormulaParser;
    }
      
    // PUBLIC FUNCTIONS
    validateAndGenerateStatusFormulas() {
      time("validateAndGenerateStatusFormulas");
      const COLUMN = ChecklistApp.COLUMN; // static import
  
      // Must have required columns
      if (!this.checklist.hasColumn(COLUMN.STATUS, COLUMN.CHECK, COLUMN.ITEM, COLUMN.PRE_REQS)) return;
    
      time("getStatusRanges", "getStatusRanges preReqRange");
      const preReqRange = this.checklist.getColumnDataRange(COLUMN.PRE_REQS);
      timeEnd("getStatusRanges preReqRange");
      time("getStatusRanges statusRange");
      const availableDataRange = this.checklist.getColumnDataRange(COLUMN.STATUS);
      timeEnd("getStatusRanges statusRange");
      time("getStatusRanges checkRange");
      const checkRange = this.checklist.getColumnDataRange(COLUMN.CHECK);
      timeEnd("getStatusRanges checkRange", "getStatusRanges");

      time("getStatusValues", "getStatusValues preReqFirstRow");
      const firstRow = preReqRange.getRow();
      timeEnd("getStatusValues preReqFirstRow");
      time("getStatusValues preReqValues");
      const preReqValues = preReqRange.getValues();
      timeEnd("getStatusValues preReqValues");
      time("getStatusValues preReqFormulas");
      const preReqFormulas = preReqRange.getFormulas();
      timeEnd("getStatusValues preReqFormulas");
      time("getStatusValues checkFormulas");
      const checkFormulas = checkRange.getFormulas();
      timeEnd("getStatusValues checkFormulas", "getStatusValues");

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
          statusFormulas[i] = FORMULA.A1(i+firstRow, this.checklist.toColumnIndex(COLUMN.PRE_REQS));//"R" + (i+firstRow) + "C" + checklist.toColumnIndex(COLUMN.PRE_REQS);
        } else {
          parsers[i] = new this.CellFormulaParser(i+firstRow,preReqValues[i][0]);
        }
      }
      timeEnd("parseCells");
      time("getDebugColumns");
      const debugColumns = {
        "isAvailable": {
          formulaFunc: this.CellFormulaParser.prototype.toAvailableFormula,
        },
        "isRawMissed": {
          formulaFunc: this.CellFormulaParser.prototype.toRawMissedFormula,
        },
        "isMissed": {
          formulaFunc: this.CellFormulaParser.prototype.toMissedFormula,
        },
        "isUsed": {
          formulaFunc: this.CellFormulaParser.prototype.toPRUsedFormula,
        },
        "isUnknown": {
          formulaFunc: this.CellFormulaParser.prototype.toUnknownFormula,
        },
        "isError": {
          formulaFunc: this.CellFormulaParser.prototype.toErrorFormula,
        },
      };
      Object.keys(debugColumns).forEach(debugColumn =>{
        if (this.checklist.columnsByHeader[debugColumn]) {
          const range = this.checklist.getColumnDataRangeFromRange(this.checklist.columnsByHeader[debugColumn],preReqRange);
          debugColumns[debugColumn].range = range;
          debugColumns[debugColumn].formulas = [];
        } else {
          delete debugColumns[debugColumn];
        }
      });
      const hasDebugColumns = Object.keys(debugColumns).length > 0;
      timeEnd("getDebugColumns");
      time("generateFormulas");
      for (let i = 0; i < preReqValues.length; i++) {
        hasDebugColumns && time("debug generateFormula row"+(i+firstRow));
        const parser = parsers[i];
        let note = null;
        let checkChoiceInfos;
        if (parser) {
          statusFormulas[i] = parser.toFormula();
          if (parser.hasErrors()) {
            note = [...parser.getErrors()].map(error => `ERROR: ${error}`).join("\n");
          } else {
            const allMissablePreReqs = parser.getAllDirectlyMissablePreReqs();
            if (allMissablePreReqs.length) {
              note = "Possible to miss Pre-Reqs\n------------------------------\n" + allMissablePreReqs.join("\n");
            } 
          }
          if (parser.hasChoices()) {
            checkChoiceInfos = parser.getChoiceInfo();
          }
        }
        if (checkChoiceInfos) {
          const checkNotes = ["Check one of the following options to check this item:"];
          checkChoiceInfos.options.forEach(({row,value}) => {
            checkNotes.push(`•${value} (Row ${row})`);
          });
          const checkCell = checkRange.getCell(i+1,1);
          checkCell.setFormula(FORMULA(checkChoiceInfos.choiceCheckedFormula));
          checkCell.setNote(checkNotes.join("\n"));
        } else if (checkFormulas[i][0]) {
          const checkCell = checkRange.getCell(i+1,1);
          checkCell.setValue(checkCell.getValue()); // overwrites formula with existing value if it isn't a choice
          checkCell.clearNote();
        }
        if (hasDebugColumns) {
          timeEnd("debug generateFormula row"+(i+firstRow)); // Only report this timing if debug columns present
          time("debugColumnFormulas row" + (i+firstRow));
          Object.values(debugColumns).forEach(value => value.formulas.push([parser ? value.formulaFunc.call(parser) : null]));
          timeEnd("debugColumnFormulas row" + (i+firstRow));
        }
        notes[i] = note;
      }
      timeEnd("generateFormulas");
  
      availableDataRange.setFormulas(statusFormulas.map(formula => [formula]));
      preReqRange.setNotes(notes.map(note => [note]));
    
      time("debugColumnValues");
      Object.values(debugColumns).forEach(value => value.range.setFormulas(value.formulas));
      timeEnd("debugColumnValues");

      timeEnd("validateAndGenerateStatusFormulas");
      return;
    }
  }


  return StatusTranspiler;
})();