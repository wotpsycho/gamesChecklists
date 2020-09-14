// eslint-disable-next-line @typescript-eslint/no-unused-vars
namespace Status {
  type Range = GoogleAppsScript.Spreadsheet.Range;

  const SPECIAL_PREFIXES = {
    USES  : "USES",
    MISSED: "MISSED",
    CHOICE: "CHOICE",
  };

  export function getActiveChecklistTranslator(): StatusFormulaTranslator {
    return getTranslatorForChecklist(ChecklistApp.getActiveChecklist());
  }

  export function getTranslatorForChecklist(checklist = ChecklistApp.getActiveChecklist()): StatusFormulaTranslator {
    return StatusFormulaTranslator.fromChecklist(checklist);
  }

  export function validateAndGenerateStatusFormulasForChecklist(checklist = ChecklistApp.getActiveChecklist()): void {
    StatusFormulaTranslator.fromChecklist(checklist).validateAndGenerateStatusFormulas();
  }

  export class StatusFormulaTranslator {
    readonly checklist: ChecklistApp.Checklist;
    private constructor(checklist: ChecklistApp.Checklist) {
      this.checklist = checklist;
    }

    private static readonly translators: {[x:number]: StatusFormulaTranslator} = {}
    static fromChecklist(checklist: ChecklistApp.Checklist): StatusFormulaTranslator {
      if (!this.translators[checklist.sheetId]) {
        this.translators[checklist.sheetId] = new StatusFormulaTranslator(checklist);
      }
      return this.translators[checklist.sheetId];
    }




    // PUBLIC FUNCTIONS
    validateAndGenerateStatusFormulas(): void {
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
          statusFormulas[i] = Formula.FORMULA.A1(i+firstRow, this.checklist.toColumnIndex(COLUMN.PRE_REQS));//"R" + (i+firstRow) + "C" + checklist.toColumnIndex(COLUMN.PRE_REQS);
        } else {
          parsers[i] = CellFormulaParser.getParserForChecklistRow(this,i+firstRow,preReqValues[i][0]);
        }
      }
      timeEnd("parseCells");
      time("getDebugColumns");
      const debugColumns: {[x:string]: {formulaFunc: ()=>string,range?: Range, formulas?: string[][]}} = {
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
          checkCell.setFormula(Formula.FORMULA(checkChoiceInfos.choiceCheckedFormula));
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


    getColumnValues (column: column): columnValues {
      if (!this.checklist.hasColumn(column)) return;
      const columnIndex: number = this.checklist.toColumnIndex(column);
      if (columnInfo[columnIndex]) return columnInfo[columnIndex];
      time(`getColumnValues ${column}`);
      const byRow = {};
      const byValue = {};

      const firstRow = this.checklist.firstDataRow;
      const values = this.checklist.getColumnDataValues(columnIndex);
      values.forEach((value,i) => {
        const rawParsed = value.toString().match(PARSE_REGEX) || [];
        const numReceived = Number(rawParsed[1] || rawParsed[2] || 1);
        const valueInfo: sheetValueInfo = {
          num: numReceived,
          value: rawParsed[3],
          row: firstRow+i,
          column: columnIndex,
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
    }

    cellA1 (row: number, column: column): string {
      column = this.checklist.toColumnIndex(column);
      return A1(row,column);
    }
    rowInfosToA1Counts(rowInfos: ReadonlyArray<rowInfo>, column: column): {[x:string]: number} {
      column = this.checklist.toColumnIndex(column);
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
    }
  }

  type column = ChecklistApp.column;
  type sheetValueInfo = {
    num: number;
    value: string;
    row: number;
    column: number;
  };
  type rowInfo = {
    num: number;
    row: number;
  };

  // static imports
  const {COLUMN,STATUS}= ChecklistApp;
  const {A1,VALUE,OR,AND,NOT,EQ,NE,GTE,GT,LTE,LT,ADD,MINUS,MULT,DIV,IFS,IF,COUNTIF} = Formula.FORMULA;


  const columnInfo: {[x:number]: columnValues} = {};
  // Essentially static defs
  const PARSE_REGEX = /^ *(?:(\d+)x|x(\d+) +)? *((?:(.*)!)?([^ ].*?)) *$/;
  let UID_Counter = 0;
  const getParenPlaceholder = () =>  `PPH_${UID_Counter++}_PPH`;
  const getQuotePlaeholder = () => `QPH_${UID_Counter++}_QPH`;
  const quoteMapping = {};
  const parentheticalMapping = {};
  type columnValues = {
    byRow: {
      [x:number]: sheetValueInfo;
    };
    byValue: {
      [x:string]: sheetValueInfo[];
    };
  };

  const PREFIX_REGEX = new RegExp(`^(${Object.values(SPECIAL_PREFIXES).join("|")}) `, "i");
  class CellFormulaParser {
    private static readonly parsers: {[x:number]: CellFormulaParser} = {};
    static getParserForChecklistRow(translator: StatusFormulaTranslator,row: number,_defaultValue: string = undefined) {
      const key = `${translator.checklist.sheetId}:${row}`;
      if (!this.parsers[key]) {
        this.parsers[key] = new CellFormulaParser(translator,row,_defaultValue);
      }
      return this.parsers[key];
    }
    private readonly row: number;
    private readonly rootNode: RootNode;
    readonly translator: StatusFormulaTranslator;
    private constructor(translator: StatusFormulaTranslator, row:number, cellValue = translator.checklist.getValue(row, COLUMN.PRE_REQS)) {
      this.translator = translator;
      this.row = row;

      const lines = [];
      cellValue.toString().split(/ *[\n;] */).forEach((line:string,i:number) => {
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


        line = line.replace(/"([^"]+)"/g, (_match,text:string) => {
          const placeholder = getQuotePlaeholder();
          quoteMapping[placeholder] = text;
          return placeholder;
        });

        let match: RegExpMatchArray;
        const parenMatcher = /\(([^()]*)\)/;
        // eslint-disable-next-line no-cond-assign
        while (match = line.match(parenMatcher)) {
          const placeholder = getParenPlaceholder();
          parentheticalMapping[placeholder] = match[1];
          line = line.replace(parenMatcher, placeholder);
        }

        let childFormulaNode: FormulaNode<unknown>;
        const prefixCheck = line.match(PREFIX_REGEX);
        if (prefixCheck) { 
          const content = line.substring(line.indexOf(" ")).trim();
          switch (prefixCheck[1].toUpperCase()) {
            case SPECIAL_PREFIXES.USES.toUpperCase():
              childFormulaNode = new UsesFormulaNode(content,this.translator,row);
              break;
            case SPECIAL_PREFIXES.MISSED.toUpperCase():
              childFormulaNode = new MissedFormulaNode(content,this.translator,row);
              break;
            case SPECIAL_PREFIXES.CHOICE.toUpperCase():
              childFormulaNode = new ChoiceFormulaNode(content,this.translator,row);
              break;
          }
        } else {
          childFormulaNode = new BooleanFormulaNode(line,this.translator,row);
        }
        children.push(childFormulaNode);
      }
      this.rootNode = new RootNode(children,this.translator,row);
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
      const itemValues = this.translator.getColumnValues(COLUMN.ITEM).byRow;
      return [...this.getAllPossiblePreReqRows()].map(row => itemValues[row].value);
    }

    getAllDirectlyMissablePreReqs() {
      const allMissableRows = [...this.getAllPossiblePreReqRows()].filter(row => CellFormulaParser.getParserForChecklistRow(this.translator,row).isDirectlyMissable());
      const itemValues = this.translator.getColumnValues(COLUMN.ITEM).byRow;
      return [...allMissableRows].map(row => itemValues[row].value);
    }

    hasChoices() {
      return !!choiceRows[this.row];
    }

    getChoiceInfo() {
      if (this.hasChoices()) {
        const itemValues = this.translator.getColumnValues(COLUMN.ITEM).byRow;
        const choiceInfo = {
          choiceCheckedFormula: OR(choiceRows[this.row].map(row => this.translator.cellA1(row,COLUMN.CHECK))),
          options: choiceRows[this.row].map(optionRow => itemValues[optionRow]),
        };
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

    private _lockCircular: boolean;   
    private _circularDependencies: ReadonlySet<number>;
    private _isCircular: boolean;
    getCircularDependencies(previous = []): ReadonlySet<number> {
      if (this._circularDependencies) return this._circularDependencies;
      const circularDependencies: Set<number> = new Set();
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

  abstract class FormulaNode<T> {
    protected readonly errors: Set<string> = new Set();
    protected readonly children: FormulaNode<unknown>[] = [];
    protected readonly text: string;
    protected readonly row: number;
    protected value: T;     
    protected formulaType: Formula.formula;

    readonly translator: StatusFormulaTranslator
    constructor(text: string, translator: StatusFormulaTranslator,row: number) {
      this.translator = translator;
      this.text = text.toString().trim();
      this.row = row;

      if (parentheticalMapping[this.text]) {
        this.text = parentheticalMapping[this.text];
      }
      if (quoteMapping[text]) {
        this.text = quoteMapping[text];
      }
    }

    protected get child(): FormulaNode<unknown> {
      return this.children.length == 1 ? this.children[0] : undefined;
    }

    protected set child(child: FormulaNode<unknown>) {
      if (this.children.length > 1) throw new Error("Cannot set child for multi-child node");
      this.children[0] = child;
    }

    addError(message: string): void {
      this.errors.add(message);
    }

    addErrors(errors: Iterable<string>): void {
      for (const message of errors) {
        this.addError(message);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    checkErrors(): void {

    }

    getErrors(): Set<string> {
      this.checkErrors();
      this.children.forEach(child => this.addErrors(child.getErrors()));
      return this.errors;
    }

    hasErrors(): boolean {
      return this.getErrors().size > 0;
    }

    hasValue(): boolean {
      return typeof this.value !== "undefined";
    }


    toErrorFormula(): string {
      return VALUE(this.hasErrors());
    }

    toCheckedFormula(): string {
      return this.translator.cellA1(this.row, COLUMN.CHECK);
    }


    toAvailableFormula(): string {
      let formula: string;
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

    abstract toPRUsedFormula(): string;

    abstract toRawMissedFormula(): string;

    abstract toMissedFormula(): string;

    abstract toUnknownFormula(): string;

    isDirectlyMissable(): boolean {
      return this.children.reduce((directlyMissable,child) => directlyMissable || child.isDirectlyMissable(), false);
    }

    protected _allPossiblePreReqRows: ReadonlySet<number>;
    getAllPossiblePreReqRows():ReadonlySet<number> {
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
        this._allPossiblePreReqRows = allPossiblePreReqs;
      }
      return this._allPossiblePreReqRows;
    }

    isInCircularDependency(): boolean {
      return this.getCircularDependencies().has(this.row);
    }

    protected _circularDependencies: ReadonlySet<number>;
    protected _lockCircular: boolean;
    protected _isCircular: boolean;
    getCircularDependencies(previous: ReadonlyArray<number> = []): ReadonlySet<number> {
      if (this._circularDependencies) return this._circularDependencies;
      const circularDependencies: Set<number> = new Set();
      if (this._lockCircular) {
        previous.slice(previous.indexOf(this.row)).forEach(circularDependencies.add,circularDependencies);
      } else {
        const newChain = [...previous,this.row];
        this._lockCircular = true;
        this.children.forEach(child => {
          child.getCircularDependencies(newChain).forEach(circularDependencies.add, circularDependencies);
        });
        this._lockCircular = false;
      }
      if (circularDependencies.has(this.row)) this._isCircular = true;
      this._circularDependencies = circularDependencies;
      return this._circularDependencies;
    }
  }

  class BooleanFormulaNode extends FormulaNode<boolean> {
    constructor(text:string, translator:StatusFormulaTranslator,row:number) {
      super(text,translator,row);
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
            this.children.push(...operands.map(operand => new BooleanFormulaNode(operand,this.translator,this.row)));
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
            this.child = new ComparisonFormulaNode(this.text,this.translator,this.row,comparisonFormulaTranslationHelper);
            return;
          }
        } 
        this.child = new BooleanFormulaValueNode(this.text,this.translator,this.row);
      } else {
        this.value = true;
      }
    }

    toPRUsedFormula(): string {
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

    toRawMissedFormula(): string {
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

    toMissedFormula(): string {
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

    toUnknownFormula(): string {
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

    isDirectlyMissable(): boolean {
      if (this.formulaType == NOT) return true;
      else return super.isDirectlyMissable();
    }
  }

  class RootNode extends BooleanFormulaNode {
    constructor(children:FormulaNode<unknown>[], translator:StatusFormulaTranslator,row:number) {
      super("",translator,row);
      if (children.length > 0) {
        this.children.push(...children);
        this.value = undefined;
        this.formulaType = AND;
      } else {
        this.value = true;
      }
    }
    toStatusFormula(): string {
      const ifsArgs = [];
      const order: Array<[string,(()=>string)]> = [
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

  class ComparisonFormulaNode extends FormulaNode<boolean> {
    protected children: NumberNode[];
    constructor(text: string, translator:StatusFormulaTranslator,row: number,formulaType: Formula.formula) {
      super(text,translator,row);

      this.formulaType = formulaType;
      const operands = formulaType.parseOperands(this.text);
      this.children.push(...operands.map(operand => new NumberFormulaNode(operand,this.translator,this.row)));
    }

    checkErrors(): void {
      let isError: boolean;
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
    toPRUsedFormula(): string {
      return this._toFormulaByNotStatus(this.toUnknownFormula.name, STATUS.PR_USED);
    }
    toRawMissedFormula(): string {
      return this._toFormulaByNotStatus(this.toUnknownFormula.name, STATUS.MISSED);
    }
    toMissedFormula(): string {
      return this._toFormulaByNotStatus(this.toUnknownFormula.name, [STATUS.MISSED,STATUS.PR_USED]);
    }
    toUnknownFormula(): string {
      if (this.isInCircularDependency()) return VALUE.TRUE;
      return this._toFormulaByNotStatus(this.toUnknownFormula.name, STATUS.UNKNOWN);
    }
    private _toFormulaByNotStatus(formulaTypeName: string,notStatusesForMax: string|string[],statusesForMin: string|string[] = STATUS.CHECKED): string {
      if (this.hasErrors()) return VALUE.FALSE;
      if (this.isInCircularDependency()) return VALUE.FALSE;
      if (this.hasValue()) return VALUE(this.value);
      if (!this.formulaType) return this.child[formulaTypeName]();

      if (notStatusesForMax && !Array.isArray(notStatusesForMax)) notStatusesForMax = [notStatusesForMax];
      const minStatuses: string[] = (statusesForMin && !Array.isArray(statusesForMin)) ? [statusesForMin] : statusesForMin as string[];
      const maxNotStatuses: string[] = (notStatusesForMax && !Array.isArray(notStatusesForMax))  ? [notStatusesForMax] : notStatusesForMax as string[];
      switch (this.formulaType) {
        case LT: {
          return GTE(this.children[0].toFormulaByStatus(...minStatuses),this.children[1].toFormulaByNotStatus(...maxNotStatuses));
        }
        case LTE: {
          return GT(this.children[0].toFormulaByStatus(...minStatuses),this.children[1].toFormulaByNotStatus(...maxNotStatuses));
        }
        case GT: {
          return LTE(this.children[0].toFormulaByNotStatus(...maxNotStatuses),this.children[1].toFormulaByStatus(...minStatuses));
        }
        case GTE: {
          return LT(this.children[0].toFormulaByNotStatus(...maxNotStatuses),this.children[1].toFormulaByStatus(...minStatuses));
        }
        case EQ: {
          return OR([
            LT(this.children[0].toFormulaByNotStatus(...maxNotStatuses),this.children[1].toFormulaByStatus(...minStatuses)),
            GT(this.children[0].toFormulaByStatus(...minStatuses),this.children[1].toFormulaByNotStatus(...maxNotStatuses))
          ]);
        }
        case NE: {
          return AND([
            EQ(this.children[0].toFormulaByNotStatus(...maxNotStatuses),this.children[0].toFormulaByStatus(...minStatuses)),
            EQ(this.children[0].toFormulaByNotStatus(...maxNotStatuses),this.children[1].toFormulaByStatus(...minStatuses)),
            EQ(this.children[0].toFormulaByStatus(...minStatuses),this.children[1].toFormulaByNotStatus(...maxNotStatuses))
          ]);
        }
      }

    }
  }

  interface NumberNode extends FormulaNode<number> {
    getMinValue: () => number;
    getMaxValue: () => number;
    toFormulaByStatus: (...status: string[]) => string;
    toFormulaByNotStatus: (...status: string[]) => string;
  }

  class NumberFormulaNode extends FormulaNode<number> implements NumberNode {
    protected children: NumberNode[]
    constructor(text: string, translator:StatusFormulaTranslator,row: number) {
      super(text,translator,row);

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
          this.children.push(...operands.map(operand => new NumberFormulaNode(operand,this.translator,this.row)));
          return;
        }
      }
      this.child = new NumberFormulaValueNode(text,this.translator,this.row);
    }

    protected get child(): NumberFormulaValueNode {
      return super.child as NumberFormulaValueNode;
    }

    protected set child(child: NumberFormulaValueNode) {
      super.child = child;
    }

    getMinValue() {
      if (this.hasValue()) return this.value;
      if (!this.formulaType) {
        return this.child.getMinValue();
      } else switch(this.formulaType) {
        case ADD: return this.children.map(child => child.getMinValue()).reduce((min, childMin) => min + childMin);
        case MINUS: return this.children[0].getMinValue() - this.children.slice(1).map(child => child.getMaxValue()).reduce((max, childMax) => max + childMax);
        case MULT: return this.children.map(child => child.getMinValue()).reduce((min, childMin) => min * childMin);
        case DIV: return this.children[0].getMinValue() / (this.children[1].getMaxValue() || 1);
      }
    }

    getMaxValue(): number {
      if (this.hasValue()) return this.value;
      if (!this.formulaType) {
        return this.child.getMaxValue();
      } else switch(this.formulaType) {
        case ADD: return this.children.map(child => child.getMaxValue()).reduce((max, childMax) => max + childMax);
        case MINUS: return this.children[0].getMaxValue() - this.children.map(child => child.getMinValue()).slice(1).reduce((min, childMin) => min + childMin);
        case MULT: return this.children.map(child => child.getMaxValue()).reduce((max, childMax) => max * childMax);
        case DIV: return this.children[0].getMaxValue() / (this.children[1].getMinValue() || 1);
      }
    }

    toPRUsedFormula(): string {
      return this.toFormulaByStatus(STATUS.PR_USED);
    }
    toMissedFormula(): string {
      return this.toFormulaByStatus(STATUS.PR_USED,STATUS.MISSED);
    }
    toFormulaByStatus(...statuses: string[]): string {
      if (this.hasValue()) return VALUE(this.value);
      if (!this.formulaType) return this.child.toFormulaByStatus(statuses);
      return this.formulaType.generateFormula(this.children.map(child => child.toFormulaByStatus(...statuses)));
    }
    toFormulaByNotStatus(...statuses: string[]): string {
      if (this.hasValue()) return VALUE(this.value);
      if (!this.formulaType) return this.child.toFormulaByNotStatus(statuses);
      return this.formulaType.generateFormula(this.children.map(child => child.toFormulaByNotStatus(...statuses)));
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
  }

  type valueInfo = {
    numNeeded: number;
    isMulti: boolean;
    key: string,
    altColumnName: string,
    id: string,
    original: string;
    rowInfos: rowInfo[],
    numPossible: number;
    isChoiceOnly?: boolean;
    wasSelfReferential?: boolean;
  }
// Abstract intermediate class
  const valueInfoCache = {}; // TODO fix to work with multi CLs
  abstract class FormulaValueNode<T> extends FormulaNode<T> {
    constructor(text:string, translator:StatusFormulaTranslator,row:number) {
      super(text,translator,row);
    }

    get valueInfo(): valueInfo {
      const text = this.text;
      let valueInfo = valueInfoCache[text];
      if (!valueInfo) {
        const rawParsed: RegExpExecArray = PARSE_REGEX.exec(text);
        if (rawParsed) {
          valueInfo = {
            numNeeded: rawParsed[1] || rawParsed[2] || 1,
            isMulti: !!(Number(rawParsed[1]) > 0 || Number(rawParsed[2]) > 0 || rawParsed[5].indexOf("*") >= 0),
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
          const columnInfo = this.translator.getColumnValues(valueInfo.altColumnName || COLUMN.ITEM);
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
              const columnValues = this.translator.getColumnValues(COLUMN.ITEM).byRow;
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

    protected _allPossiblePreReqRows;
    getAllPossiblePreReqRows() {
      if (!this._allPossiblePreReqRows) {
        let allPossiblePreReqs;
        if (this.isInCircularDependency()) {
          allPossiblePreReqs = this.getCircularDependencies();
        } else {
          allPossiblePreReqs = new Set(this.valueInfo.rowInfos.map(rowInfo => rowInfo.row));
          this.valueInfo.rowInfos.forEach(rowInfo => 
            CellFormulaParser.getParserForChecklistRow(this.translator,rowInfo.row).getAllPossiblePreReqRows().forEach(allPossiblePreReqs.add,allPossiblePreReqs)
          );
        }
        this._allPossiblePreReqRows = allPossiblePreReqs;
      }
      return this._allPossiblePreReqRows;
    }

    getCircularDependencies(previous = []) {
      if (this._circularDependencies) return this._circularDependencies;
      const circularDependencies: Set<number> = new Set();
      if (this._lockCircular) {
        previous.slice(previous.indexOf(this.row)).forEach(circularDependencies.add,circularDependencies);
      } else {
        previous.push(this.row);
        this._lockCircular = true;
        this.valueInfo.rowInfos.forEach(rowInfo => {
          CellFormulaParser.getParserForChecklistRow(this.translator,rowInfo.row).getCircularDependencies([...previous]).forEach(circularDependencies.add, circularDependencies);
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

  class BooleanFormulaValueNode extends FormulaValueNode<boolean> {
    protected readonly formulaType: Formula.formula = GTE;
    constructor(text:string, translator:StatusFormulaTranslator,row:number) {
      super(text,translator,row);
      if (typeof this.text == "boolean" || this.text.toString().toUpperCase() == "TRUE" || this.text.toString().toUpperCase() == "FALSE") {
        this.value = typeof this.text == "boolean" ? this.text as boolean : this.text.toString().toUpperCase() == "TRUE";
      } else {
        // CHECKED > NEEDED
        this.availableChild = new NumberFormulaValueNode(this.text,this.translator,this.row);
        this.neededChild = new NumberFormulaValueNode(this.valueInfo.numNeeded,this.translator,this.row); 
      }
    }
    get availableChild(): NumberFormulaValueNode {
      return this.children[0] as NumberFormulaValueNode;
    }
    set availableChild(child: NumberFormulaValueNode) {
      this.children[0] = child;
    }
    get neededChild() {
      return this.children[1];
    }
    set neededChild(child) {
      this.children[1] = child;
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

  class NumberFormulaValueNode extends FormulaValueNode<number> implements NumberNode {
    constructor(text: string|number, translator:StatusFormulaTranslator,row: number) {
      super(text.toString(),translator,row);
      if (Number(this.text) || this.text === "0") {
        this.value = Number(this.text);
      }
    }

    /**
* Total number of rows matching dependency
*/
    toTotalFormula(): string {
      if (this.hasValue()) return VALUE(this.value);
      return this.valueInfo.numPossible.toString();
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
      return this._generateFormula(VALUE.TRUE,COLUMN.CHECK);
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
    getMaxValue():number {
      if (this.hasValue()) return this.value;
      return this.valueInfo.numPossible;
    }

    _generateFormula(statuses: string|string[] = [], column:column = COLUMN.STATUS): string {
      if (this.hasValue()) {
        return VALUE(this.value);
      } else if (!statuses || statuses.length == 0) {
        return VALUE.ZERO;
      } else {
        const stats: string[] = Array.isArray(statuses) ? statuses : [statuses as string];
        const counts = Object.entries(this.translator.rowInfosToA1Counts(this.valueInfo.rowInfos, column)).reduce((counts,[range,count]) => {
          stats.forEach(status => {
            const countIf = COUNTIF(range, VALUE(status));
            counts.push(count == 1 ? countIf : MULT(countIf,count));
          });
          return counts;
        },[]);
        return ADD(counts);
      }
    }
  }

  const usesInfo: {[x:string]:{[x:number]: number}} = {}; // Treating as static value in containing class since it is reset each populateAvailable call
  class UsesFormulaNode extends BooleanFormulaValueNode {
    constructor(text:string, translator:StatusFormulaTranslator,row:number) {
      super(text,translator,row);
      this.useInfo[this.row] = this.valueInfo.numNeeded;
    }

    get useInfo(): {[x:number]:number} {
      if (!usesInfo[this.valueInfo.key]) {
        usesInfo[this.valueInfo.key] = {};
      }
      return usesInfo[this.valueInfo.key];
    }

    toPRUsedFormula() {
      return OR(
        LT(
          MINUS(
            this.availableChild.toTotalFormula(),
            this._getPRUsedAmountFormula()
          ),
          this.valueInfo.numNeeded
        ),
        super.toPRUsedFormula()
      );
    }

    private _getPRUsedAmountFormula() {
      const usedAmoutArguments = Object.entries(this.useInfo).map(([row,numUsed]) => IF(this.translator.cellA1(Number(row),COLUMN.CHECK),numUsed));
      return ADD(usedAmoutArguments);
    }

    toAvailableFormula() {
    // Parent => CHECKED >= NEEDED
    // This   => (CHECKED - USED) >= NEEDED
      const usedAmountFormula = this._getPRUsedAmountFormula();
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
  class ChoiceFormulaNode extends FormulaValueNode<boolean> {
    constructor(text:string, translator:StatusFormulaTranslator,row:number) {
      super(text,translator,row);

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
        OR(this.choiceInfo.options.map(row => this.translator.cellA1(row, COLUMN.CHECK))),
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
      return OR(statuses.map(status => EQ(this.translator.cellA1(this.choiceRow,COLUMN.STATUS),VALUE(status))));
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

    getCircularDependencies(previous: number[]): ReadonlySet<number> {
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

  class MissedFormulaNode extends FormulaNode<boolean> {
    constructor(text:string, translator:StatusFormulaTranslator,row:number) {
      super(text,translator,row);
      this.formulaType = NOT;
      this.child = new BooleanFormulaNode(this.text,this.translator,this.row);
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
}