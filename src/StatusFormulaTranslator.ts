// eslint-disable-next-line @typescript-eslint/no-unused-vars
namespace Status {
  type Range = GoogleAppsScript.Spreadsheet.Range;
  type Checklist = ChecklistApp.Checklist;
  type column = ChecklistApp.column;
  type row = ChecklistApp.dataRow;
  type FormulaHelper = Formula.StringFormula & {
    identify: (text:string) => boolean;
    parseOperands: (text:string) => string[];
    generateFormula: (...value: string[]) => string;
  };
  type STATUS = ChecklistApp.STATUS;

  const STATUS = ChecklistApp.STATUS;
  const COLUMN = ChecklistApp.COLUMN;

  const FormulaHelper = (formula:Formula.StringFormula, regEx:RegExp, isFlexible:boolean = false):FormulaHelper => {
    const parseOperands = (text:string):string[] => {
      const match = text && text.match(regEx);
      if (!match) return;
      if (!isFlexible) return match.slice(1);

      const results = [];
      const lMatch = match[1];
      const lResult = parseOperands(lMatch);
      if (lResult) results.push(...lResult);
      else results.push(lMatch);
      
      const rMatch = match[2];
      const rResult = parseOperands(rMatch);
      if (rResult) results.push(...rResult);
      else results.push(rMatch);
      
      return results;
    };
    return Object.assign(
      (...args:string[]) => formula(...args), 
      formula, {
        generateFormula: formula,
        identify: (text:string):boolean => !!(text && text.match(regEx)),
        parseOperands,
      });
  };
  const OR  = FormulaHelper(Formula.OR , /^ *(.+?) *\|\|? *(.+?) *$/,true);
  const AND = FormulaHelper(Formula.AND, /^ *(.+?) *&& *(.+?) *$/,true);
  const NOT = FormulaHelper(Formula.NOT, /^ *! *(.+?) *$/);
  const EQ  = FormulaHelper(Formula.EQ , /^ *(.+?) *== *(.+?) *$/);
  const NE  = FormulaHelper(Formula.NE , /^ *(.+?) *!= *(.+?) *$/);
  const GT  = FormulaHelper(Formula.GT , /^ *(.+?) *> *(.+?) *$/);
  const GTE = FormulaHelper(Formula.GTE, /^ *(.+?) *>= *(.+?) *$/);
  const LT  = FormulaHelper(Formula.LT , /^ *(.+?) *< *(.+?) *$/);
  const LTE = FormulaHelper(Formula.LTE, /^ *(.+?) *<= *(.+?) *$/);
    
  const MULT  = FormulaHelper(Formula.MULT , /^ *(.+?) *\* *(.+?) *$/,true);
  const DIV   = FormulaHelper(Formula.DIV  , /^ *(.+?) *\/ *(.+?) *$/,true);
  const MINUS = FormulaHelper(Formula.MINUS, /^ *(.+?) *- *(.+?) *$/,true);
  const ADD   = FormulaHelper(Formula.ADD  , /^ *(.+?) *\+ *(.+?) *$/,true);
  
  const {FORMULA,A1,VALUE,IFS,IF,COUNTIF} = Formula;


  const SPECIAL_PREFIXES:{[x:string]:string} = {
    USES  : "USES",
    MISSED: "MISSED",
    CHOICE: "CHOICE",
  };

  export function getActiveChecklistTranslator(): StatusFormulaTranslator {
    return getTranslatorForChecklist(ChecklistApp.getActiveChecklist());
  }

  export function getTranslatorForChecklist(checklist: Checklist = ChecklistApp.getActiveChecklist()): StatusFormulaTranslator {
    return StatusFormulaTranslator.fromChecklist(checklist);
  }

  export function validateAndGenerateStatusFormulasForChecklist(checklist:Checklist = ChecklistApp.getActiveChecklist()): void {
    StatusFormulaTranslator.fromChecklist(checklist).validateAndGenerateStatusFormulas();
  }

  export class StatusFormulaTranslator {
    readonly checklist: Checklist;
    private constructor(checklist: Checklist) {
      this.checklist = checklist;
    }

    private static readonly translators: {[x:number]: StatusFormulaTranslator} = {}
    static fromChecklist(checklist: Checklist): StatusFormulaTranslator {
      if (!this.translators[checklist.id]) {
        this.translators[checklist.id] = new StatusFormulaTranslator(checklist);
      }
      return this.translators[checklist.id];
    }

    // PUBLIC FUNCTIONS
    validateAndGenerateStatusFormulas(): void {
      time("validateAndGenerateStatusFormulas");

      // Must have required columns
      if (!this.checklist.hasColumn(COLUMN.STATUS, COLUMN.CHECK, COLUMN.ITEM, COLUMN.PRE_REQS)) return;

      time("getStatusRanges", "getStatusRanges preReqRange");
      const preReqRange:Range = this.checklist.getColumnDataRange(COLUMN.PRE_REQS);
      timeEnd("getStatusRanges preReqRange");
      time("getStatusRanges statusRange");
      const statusDataRange:Range = this.checklist.getColumnDataRange(COLUMN.STATUS);
      timeEnd("getStatusRanges statusRange");
      time("getStatusRanges itemRange");
      const itemDataRange:Range = this.checklist.getColumnDataRange(COLUMN.ITEM);
      timeEnd("getStatusRanges itemRange");
      time("getStatusRanges checkRange");
      const checkRange:Range = this.checklist.getColumnDataRange(COLUMN.CHECK);
      timeEnd("getStatusRanges checkRange", "getStatusRanges");

      time("getStatusValues", "getStatusValues preReqFirstRow");
      const firstRow:row = preReqRange.getRow();
      timeEnd("getStatusValues preReqFirstRow");
      time("getStatusValues preReqValues");
      const preReqValues:unknown[][] = preReqRange.getValues();
      timeEnd("getStatusValues preReqValues");
      // TODO Remove direct formula logic, disabled now
      // time("getStatusValues preReqFormulas"); 
      // const preReqFormulas:string[][] = preReqRange.getFormulas();
      // timeEnd("getStatusValues preReqFormulas");
      time("getStatusValues statusFormulas");
      const existingStatusFormulas:string[][] = statusDataRange.getFormulas();
      timeEnd("getStatusValues statusFormulas");
      time("getStatusValues checkFormulas");
      const checkFormulas:string[][] = checkRange.getFormulas();
      timeEnd("getStatusValues checkFormulas", "getStatusValues");

      // TODO add interactive validation?
      //const preReqValidations = preReqRange.getDataValidations(); 

      // will be overwriting these
      const parsers:CellFormulaParser[] = [];
      const statusFormulas:string[] = [];
      const notes:string[] = [];

      time("parseCells");
      for (let i:number = 0; i < preReqValues.length; i++) {
        // if (preReqFormulas[i][0]) {
        // Allow direct formulas, just use reference
        // statusFormulas[i] = A1(i+firstRow, this.checklist.toColumnIndex(COLUMN.PRE_REQS));//"R" + (i+firstRow) + "C" + checklist.toColumnIndex(COLUMN.PRE_REQS);
        // } else {
        parsers[i] = CellFormulaParser.getParserForChecklistRow(this,i+firstRow,preReqValues[i][0].toString());
        // }
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
          const range:Range = this.checklist.getColumnDataRange(this.checklist.columnsByHeader[debugColumn]);
          debugColumns[debugColumn].range = range;
          debugColumns[debugColumn].formulas = [];
        } else {
          delete debugColumns[debugColumn];
        }
      });
      const hasDebugColumns:boolean = Object.keys(debugColumns).length > 0;
      timeEnd("getDebugColumns");
      itemDataRange.setFontStyle("normal");
      time("generateFormulas");
      for (let i:number = 0; i < preReqValues.length; i++) {
        hasDebugColumns && time("debug generateFormula row"+(i+firstRow));
        const parser:CellFormulaParser = parsers[i];
        let note:string = null;
        let checkChoiceInfos: rowChoiceInfo;
        if (parser) {
          statusFormulas[i] = FORMULA(parser.toFormula());
          if (parser.hasErrors()) {
            note = [...parser.getErrors()].map(error => `ERROR: ${error}`).join("\n");
          } else {
            const allMissablePreReqs:string[] = parser.getAllDirectlyMissablePreReqs();
            if (allMissablePreReqs.length) {
              note = "Possible to miss Pre-Reqs\n------------------------------\n" + allMissablePreReqs.join("\n");
            } 
          }
          if (parser.hasChoices()) {
            checkChoiceInfos = parser.getChoiceInfo();
          }
        }
        if (checkChoiceInfos) {
          const checkNotes:string[] = ["Choose one of the following Items:"];
          checkChoiceInfos.options.forEach(({row,value}) => {
            checkNotes.push(`•${value} (Row ${row})`);
          });
          const checkCell:Range = checkRange.getCell(i+1,1);
          itemDataRange.getCell(i+1,1).setFontStyle("italic");
          checkCell.setFormula(FORMULA(checkChoiceInfos.choiceCheckedFormula));
          checkCell.setNote(checkNotes.join("\n"));
        } else if (checkFormulas[i][0]) {
          const checkCell:Range = checkRange.getCell(i+1,1);
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
      time("setFormulasIndividual");
      // Reduce client-side recalculations by only setting formula if changed
      statusFormulas.forEach((statusFormula,i) => 
        statusFormula !== existingStatusFormulas[i][0] && statusDataRange.getCell(i+1,1).setFormula(statusFormula)
      );
      timeEnd("setFormulasIndividual");
      time("finalItemRow");
      const finalItems = this.getColumnValues(COLUMN.TYPE).byValue[ChecklistApp.FINAL_ITEM_TYPE];
      if (finalItems) {
        itemDataRange.setFontLine("none");
        const dependendentRows = new Set<number>();
        finalItems.forEach(finalItem => {
          CellFormulaParser.getParserForChecklistRow(this,finalItem.row).getAllPossiblePreReqRows().forEach(dependendentRows.add,dependendentRows);
        });
        dependendentRows.forEach(row => (itemDataRange.getCell(row-firstRow+1,1).setFontLine("underline")));
      }
      timeEnd("finalItemRow");
      time("setNotes");
      preReqRange.setNotes(notes.map(note => [note]));
      timeEnd("setNotes");


      time("debugColumnValues");
      Object.values(debugColumns).forEach(value => value.range.setFormulas(value.formulas.map(formulaArray => [FORMULA(formulaArray[0])])));
      timeEnd("debugColumnValues");

      timeEnd("validateAndGenerateStatusFormulas");
      return;
    }

    private readonly columnInfo: {[x:number]: columnValues} = {};
    getColumnValues (column: column): columnValues {
      if (!this.checklist.hasColumn(column)) return;
      const columnIndex: number = this.checklist.toColumnIndex(column);
      if (this.columnInfo[columnIndex]) return this.columnInfo[columnIndex];
      time(`getColumnValues ${column}`);
      const byRow:{[x:number]:sheetValueInfo[]} = {};
      const byValue:{[x:string]:sheetValueInfo[]} = {};

      const firstRow:number = this.checklist.firstDataRow;
      const values:unknown[] = this.checklist.getColumnDataValues(columnIndex);
      values.forEach((value,i) => {
        const rowValues:{[x:string]: sheetValueInfo} = {};
        value.toString().split(/(\r|\n)+/).forEach(value => {
          const rawParsed:RegExpMatchArray = value.toString().match(PARSE_REGEX) || [];
          const numReceived:number = Number(rawParsed[1] || rawParsed[2] || 1);
          const rowSubValue = rawParsed[3];
          const valueInfo: sheetValueInfo = {
            num: numReceived,
            value: rowSubValue,
            row: firstRow+i,
            column: columnIndex,
          };
          if (rowValues[rowSubValue]) {
            rowValues[rowSubValue].num += numReceived;
          } else {
            rowValues[rowSubValue] = valueInfo;
          }
        });
        byRow[firstRow+i] = Object.values(rowValues);
        byRow[firstRow+i].forEach(valueInfo => {
          if (byValue[valueInfo.value]) {
            byValue[valueInfo.value].push(valueInfo);
          } else {
            byValue[valueInfo.value] = [valueInfo];
          }
          return valueInfo;
        });
      });
      this.columnInfo[columnIndex] = {byRow,byValue};
      timeEnd(`getColumnValues ${column}`);
      return this.columnInfo[columnIndex];
    }

    cellA1 (row: row, column: column): string {
      column = this.checklist.toColumnIndex(column);
      return A1(row,column);
    }

    rowInfosToA1Counts(rowInfos: ReadonlyArray<rowInfo>, column: column): {[x:string]: number} {
      column = this.checklist.toColumnIndex(column);
      const rangeCounts:{[x:string]:number} = {};
      if (rowInfos.length === 0) return rangeCounts;
      let firstRow:row = rowInfos[0].row;
      let lastRow:row = rowInfos[0].row;
      let num:number = rowInfos[0].num;
      for (let i:number = 1; i < rowInfos.length; i++) {
        const rowInfo:rowInfo = rowInfos[i];
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

  type sheetValueInfo = {
    num: number;
    value: string;
    row: row;
    column: column;
  };
  type rowInfo = {
    num: number;
    row: row;
  };
  type columnValues = {
    byRow: {
      [x:number]: sheetValueInfo[];
    };
    byValue: {
      [x:string]: sheetValueInfo[];
    };
  };

  // static imports


  // Essentially static defs
  const PARSE_REGEX:RegExp = /^ *(?:(\d+)x|x(\d+) +)? *((?:(.*)!)?([^ ].*?)) *$/;
  let UID_Counter:number = 0;
  const [parenIdentifier,quoteIdentifier] = ["PPH","QPH"];
  const getParenPlaceholder = ():string =>  `${parenIdentifier}_${UID_Counter++}_${parenIdentifier}`;
  const getQuotePlaeholder = ():string => `${quoteIdentifier}_${UID_Counter++}_${quoteIdentifier}`;
  const quoteRegex:RegExp = RegExp(`${quoteIdentifier}_\\d+_${quoteIdentifier}`);
  const quoteMapping:{[x:string]:string} = {};
  const parentheticalMapping:{[x:string]:string} = {};

  const PREFIX_REGEX:RegExp = new RegExp(`^(${Object.values(SPECIAL_PREFIXES).join("|")}) `, "i");
  class CellFormulaParser {
    private static readonly parsers: {[x:number]: CellFormulaParser} = {};
    static getParserForChecklistRow(translator: StatusFormulaTranslator,row:row,_defaultValue: string = undefined):CellFormulaParser {
      const key:string = `${translator.checklist.id}:${row}`;
      if (!this.parsers[key]) {
        this.parsers[key] = new CellFormulaParser(translator,row,_defaultValue);
      }
      return this.parsers[key];
    }
    private readonly row: row;
    private readonly rootNode: RootNode;
    readonly translator: StatusFormulaTranslator;
    private constructor(translator: StatusFormulaTranslator, row:row, cellValue = translator.checklist.getValue(row, COLUMN.PRE_REQS)) {
      this.translator = translator;
      this.row = row;

      const lines:string[] = [];
      cellValue.toString().split(/ *[\n;] */).forEach((line:string,i:number) => {
        if (i > 0 && line.indexOf("...") === 0) {
          lines[lines.length-1] += line.substring(3);
        } else {
          lines.push(line);
        }
      });

      const children: FormulaNode<boolean>[] = [];
      for (let j:number = 0; j < lines.length; j++) {
        let line:string = lines[j].trim();
        if (!line) continue;


        line = line.replace(/"([^"]+)"/g, (_match,text:string) => {
          const placeholder:string = getQuotePlaeholder();
          quoteMapping[placeholder] = text;
          return placeholder;
        });

        let match: RegExpMatchArray;
        const parenMatcher:RegExp = /\(([^()]*)\)/;
        // eslint-disable-next-line no-cond-assign
        while (match = line.match(parenMatcher)) {
          const placeholder:string = getParenPlaceholder();
          parentheticalMapping[placeholder] = match[1];
          line = line.replace(parenMatcher, placeholder);
        }

        let childFormulaNode: FormulaNode<boolean>;
        const prefixCheck:RegExpMatchArray = line.match(PREFIX_REGEX);
        if (prefixCheck) { 
          const content:string = line.substring(line.indexOf(" ")).trim();
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

    toFormula():string {
      return this.toStatusFormula();
    }

    hasErrors():boolean {
      return this.getErrors().size > 0;
    }

    getErrors():ReadonlySet<string> {
      return this.rootNode.getErrors();
    }

    getAllPossiblePreReqs():string[] {
      const itemValues:{[x:number]:sheetValueInfo[]} = this.translator.getColumnValues(COLUMN.ITEM).byRow;
      return [...this.getAllPossiblePreReqRows()].map(row => itemValues[row].map(info => info.value)).flat();
    }

    getAllDirectlyMissablePreReqs():string[] {
      const allMissableRows:row[] = [...this.getAllPossiblePreReqRows()].filter(row => CellFormulaParser.getParserForChecklistRow(this.translator,row).isDirectlyMissable());
      const itemValues:{[x:number]:sheetValueInfo[]} = this.translator.getColumnValues(COLUMN.ITEM).byRow;
      return [...allMissableRows].map(row => itemValues[row].map(info => info.value)).flat().filter(value => value);
    }

    hasChoices():boolean {
      return !!choiceRows[this.row];
    }
    getChoiceInfo():rowChoiceInfo {
      if (this.hasChoices()) {
        const itemValues:{[x:number]:sheetValueInfo[]} = this.translator.getColumnValues(COLUMN.ITEM).byRow;
        const choiceInfo:rowChoiceInfo = {
          choiceCheckedFormula: OR(...choiceRows[this.row].map(row => this.translator.cellA1(row,COLUMN.CHECK))),
          options: choiceRows[this.row].map(optionRow => itemValues[optionRow]).flat(),
        };
        return choiceInfo;
      }
    }

    getAllPossiblePreReqRows():ReadonlySet<row> {
      return this.rootNode.getAllPossiblePreReqRows();
    }

    isDirectlyMissable():boolean {
      return this.rootNode.isDirectlyMissable();
    }

    isInCircularDependency():boolean {
      return this.getCircularDependencies().has(this.row);
    }

    private _lockCircular: boolean;   
    private _circularDependencies: ReadonlySet<row>;
    private _isCircular: boolean;
    getCircularDependencies(previous = []): ReadonlySet<row> {
      if (this._circularDependencies) return this._circularDependencies;
      const circularDependencies: Set<row> = new Set<row>();
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

  abstract class FormulaNode<T extends number|boolean|unknown> {
    protected readonly errors: Set<string> = new Set<string>();
    protected readonly children: FormulaNode<unknown>[] = [];
    protected readonly text: string;
    protected readonly row: row;
    protected value: T;     
    protected formulaType: FormulaHelper;

    readonly translator: StatusFormulaTranslator
    constructor(text: string, translator: StatusFormulaTranslator,row: row) {
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
        return VALUE(this.value as string);
      } else if (this.formulaType) {
        formula = this.formulaType.generateFormula(...this.children.map(child => child.toAvailableFormula()));
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

    protected _allPossiblePreReqRows: ReadonlySet<row>;
    getAllPossiblePreReqRows():ReadonlySet<row> {
      if (!this._allPossiblePreReqRows) {
        if (this.isInCircularDependency()) {
          this._allPossiblePreReqRows = this.getCircularDependencies();
        } else {
          const allPossiblePreReqs:Set<row> = new Set<row>();
          this.children.forEach(child => 
            child.getAllPossiblePreReqRows().forEach(allPossiblePreReqs.add,allPossiblePreReqs)
          );
          this._allPossiblePreReqRows = allPossiblePreReqs;
        }
      }
      return this._allPossiblePreReqRows;
    }

    isInCircularDependency(): boolean {
      return this.getCircularDependencies().has(this.row);
    }

    protected _circularDependencies: ReadonlySet<row>;
    protected _lockCircular: boolean;
    protected _isCircular: boolean;
    getCircularDependencies(previous: ReadonlyArray<row> = []): ReadonlySet<row> {
      if (this._circularDependencies) return this._circularDependencies;
      const circularDependencies: Set<row> = new Set();
      if (this._lockCircular) {
        previous.slice(previous.indexOf(this.row)).forEach(circularDependencies.add,circularDependencies);
      } else {
        const newChain:row[] = [...previous,this.row];
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
    protected readonly children: FormulaNode<boolean>[]
    constructor(text:string, translator:StatusFormulaTranslator,row:row) {
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
            const operands:string[] = booleanFormulaTranslationHelper.parseOperands(this.text);
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
            ...this.children.map(child => AND(
              NOT(child.toRawMissedFormula()),
              child.toPRUsedFormula()
            )));  
        }
        case OR: {
          return AND(
            ...this.children.map(child => AND(
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
          return OR(...this.children.map(child => child.toRawMissedFormula()));
        }
        case OR: {
          return AND(...this.children.map(child => child.toRawMissedFormula()));
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
          return OR(...this.children.map(child => child.toMissedFormula()));
        }
        case OR: {
          return AND(...this.children.map(child => child.toMissedFormula()));
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
            ...this.children.map(child => NOT(child.toRawMissedFormula())),
            OR(...this.children.map(child => child.toUnknownFormula()))
          );
        }
        case OR: {
          return AND(
            OR(...this.children.map(child => child.toUnknownFormula())),
            ...this.children.map(child => OR(child.toUnknownFormula(),child.toMissedFormula()))
          );
        }
        case NOT: {
          return this.child.toUnknownFormula(); // TODO ???
        }
      }
    }

    isDirectlyMissable(): boolean {
      if (this.formulaType == NOT) return true;
      if (this.formulaType == OR) return this.children.length && this.children.reduce((result:boolean, child) => child.isDirectlyMissable() && result,true);
      else return super.isDirectlyMissable();
    }
  }

  class RootNode extends BooleanFormulaNode {
    constructor(children:FormulaNode<boolean>[], translator:StatusFormulaTranslator,row:row) {
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
      const ifsArgs:string[] = [];
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
        const formula:string = formulaFunction.call(this);
        if (formula != VALUE.FALSE) {
          ifsArgs.push(formula,VALUE(status));
        }
        if (formula == VALUE.TRUE) {
          break;
        }
      }
      return IFS(...ifsArgs);
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
    constructor(text: string, translator:StatusFormulaTranslator,row:row,formulaType: FormulaHelper) {
      super(text,translator,row);

      this.formulaType = formulaType;
      const operands:string[] = formulaType.parseOperands(this.text);
      this.children.push(...operands.map(operand => new NumberFormulaNode(operand,this.translator,this.row)));
    }

    checkErrors(): void {
      let isError: boolean;
      switch (this.formulaType) {
        case EQ:
          isError = this.children[0].getMaxValue() < this.children[1].getMinValue() || this.children[0].getMinValue() > this.children[1].getMaxValue();
          break;
        case NE: {
          const lMax:number = this.children[0].getMaxValue();
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
    private _toFormulaByNotStatus(formulaTypeName: string,notStatusesForMax: STATUS|STATUS[],statusesForMin: STATUS|STATUS[] = STATUS.CHECKED): string {
      if (this.hasErrors()) return VALUE.FALSE;
      if (this.isInCircularDependency()) return VALUE.FALSE;
      if (this.hasValue()) return VALUE(this.value);
      if (!this.formulaType) return this.child[formulaTypeName]();

      if (notStatusesForMax && !Array.isArray(notStatusesForMax)) notStatusesForMax = [notStatusesForMax];
      const minStatuses: string[] = (statusesForMin && !Array.isArray(statusesForMin)) ? [statusesForMin] : (statusesForMin as string[] || []);
      const maxNotStatuses: string[] = (notStatusesForMax && !Array.isArray(notStatusesForMax))  ? [notStatusesForMax] : (notStatusesForMax as string[] || []);
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
          return OR(
            LT(this.children[0].toFormulaByNotStatus(...maxNotStatuses),this.children[1].toFormulaByStatus(...minStatuses)),
            GT(this.children[0].toFormulaByStatus(...minStatuses),this.children[1].toFormulaByNotStatus(...maxNotStatuses))
          );
        }
        case NE: {
          return AND(
            EQ(this.children[0].toFormulaByNotStatus(...maxNotStatuses),this.children[0].toFormulaByStatus(...minStatuses)),
            EQ(this.children[0].toFormulaByNotStatus(...maxNotStatuses),this.children[1].toFormulaByStatus(...minStatuses)),
            EQ(this.children[0].toFormulaByStatus(...minStatuses),this.children[1].toFormulaByNotStatus(...maxNotStatuses))
          );
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
    protected readonly children: NumberNode[]
    constructor(text: string, translator:StatusFormulaTranslator,row:row) {
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
          const operands:string[] = arithmeticFormulaTranslationHelper.parseOperands(this.text);
          this.children.push(...operands.map(operand => new NumberFormulaNode(operand,this.translator,this.row)));
          return;
        }
      }
      this.child = new NumberFormulaValueNode(text,this.translator,this.row);
    }

    protected get child(): NumberNode {
      return super.child as NumberNode;
    }

    protected set child(child: NumberNode) {
      super.child = child;
    }

    getMinValue():number {
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
    toFormulaByStatus(...statuses: STATUS[]): string {
      if (this.hasValue()) return VALUE(this.value);
      if (!this.formulaType) return this.child.toFormulaByStatus(...statuses);
      return this.formulaType.generateFormula(...this.children.map(child => child.toFormulaByStatus(...statuses)));
    }
    toFormulaByNotStatus(...statuses: STATUS[]): string {
      if (this.hasValue()) return VALUE(this.value);
      if (!this.formulaType) return this.child.toFormulaByNotStatus(...statuses);
      return this.formulaType.generateFormula(...this.children.map(child => child.toFormulaByNotStatus(...statuses)));
    }
    toRawMissedFormula():string {
      if (this.hasValue()) return VALUE(this.value);
      if (!this.formulaType) return this.child.toRawMissedFormula();
      return this.formulaType.generateFormula(...this.children.map(child => child.toRawMissedFormula()));
    }
    toUnknownFormula():string {
      if (this.hasValue()) return VALUE(this.value);
      if (!this.formulaType) return this.child.toUnknownFormula();
      return this.formulaType.generateFormula(...this.children.map(child => child.toUnknownFormula()));
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
    isChoice?: boolean;
    isChoiceOnly?: boolean;
    wasSelfReferential?: boolean;
  }
// Abstract intermediate class
  const valueInfoCache:{[x:number]: valueInfo} = {}; // TODO fix to work with multi CLs
  abstract class FormulaValueNode<T> extends FormulaNode<T> {
    constructor(text:string, translator:StatusFormulaTranslator,row:row) {
      super(text,translator,row);
    }

    get valueInfo(): valueInfo {
      const text:string = this.text;
      let valueInfo:valueInfo = valueInfoCache[text];
      if (!valueInfo) {
        const rawParsed: RegExpExecArray = PARSE_REGEX.exec(text);
        if (rawParsed) {
          valueInfo = {
            numNeeded: Number(rawParsed[1] || rawParsed[2] || 1),
            isMulti: !!(Number(rawParsed[1]) > 0 || Number(rawParsed[2]) > 0 || rawParsed[5].indexOf("*") >= 0),
            key: rawParsed[3],
            altColumnName: rawParsed[4],
            id: rawParsed[5],
            original: text,
            rowInfos: [],
            numPossible: undefined,
          };
          let match:RegExpMatchArray;
          if (quoteMapping[valueInfo.key]) {
            const rawParsedQuote:RegExpExecArray = PARSE_REGEX.exec(quoteMapping[valueInfo.key]);
            valueInfo.key = rawParsedQuote[3];
            valueInfo.altColumnName = rawParsedQuote[4];
            valueInfo.id = rawParsedQuote[5];
          } else if ((match = valueInfo.key.match(quoteRegex))){
            let unescaped = valueInfo.key;
            do {
              unescaped = unescaped.replace(match[0],`"${quoteMapping[match[0]]}"`);
            } while ((match = unescaped.match(quoteRegex)));
            const rawParsedQuote:RegExpExecArray = PARSE_REGEX.exec(unescaped);
            valueInfo.key = rawParsedQuote[3];
            valueInfo.altColumnName = rawParsedQuote[4];
            valueInfo.id = rawParsedQuote[5];
          }
          if (valueInfo.isMulti && !valueInfo.altColumnName && valueInfo.id.indexOf("*") < 0) {
          // Implicity prefix match on item for "[N]x [item]"
            valueInfo.id += "*";
          }
          const columnInfo:columnValues = this.translator.getColumnValues(valueInfo.altColumnName || COLUMN.ITEM);
          if (columnInfo) {
            if (valueInfo.id.indexOf("*") < 0) {
              if (columnInfo.byValue[valueInfo.id]) {
                valueInfo.rowInfos.push(...(columnInfo.byValue[valueInfo.id]));
              }
            } else {
              const search:RegExp = RegExp("^" + valueInfo.id.replace(/\*/g,".*") + "$");
              Object.entries(columnInfo.byValue).forEach(([value,columnValueInfos]) => {
                if (value.match(search)) {
                  valueInfo.rowInfos.push(...columnValueInfos);
                }
              });
            }

          } else {
            this.addError(`Could not find column "${valueInfo.altColumnName}"`);
          }
          valueInfo.numPossible = valueInfo.rowInfos.reduce((total, rowInfo) => total + rowInfo.num, 0);

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
              const columnValues:{[x:number]:sheetValueInfo[]} = this.translator.getColumnValues(COLUMN.ITEM).byRow;
              valueInfo.rowInfos = choiceInfos[valueInfo.key].options.map(optionRow => columnValues[optionRow]).flat();
              valueInfo.numPossible = valueInfo.rowInfos.length;
              valueInfo.isChoiceOnly = true;
            }
          }
          valueInfo.rowInfos = [...valueInfo.rowInfos.map(rowInfo => Object.assign({},rowInfo))];
          // Remove self reference (simplest dependency resolution, v0)
          const rowIndex:number = valueInfo.rowInfos.findIndex(rowInfo => rowInfo.row == this.row);
          if (rowIndex >= 0) {
            const removed:rowInfo[] = valueInfo.rowInfos.splice(rowIndex,1);
            valueInfo.wasSelfReferential = true;
            if (!valueInfo.isChoiceOnly) valueInfo.numPossible -= removed[0].num;
          }
        }
      }

      return valueInfo;
    }

    checkErrors():void {
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

    protected _allPossiblePreReqRows:ReadonlySet<row>;
    getAllPossiblePreReqRows():ReadonlySet<row> {
      if (!this._allPossiblePreReqRows) {
        if (this.isInCircularDependency()) {
          this._allPossiblePreReqRows = this.getCircularDependencies();
        } else {
          const allPossiblePreReqs:Set<row> = new Set(this.valueInfo.rowInfos.map(rowInfo => rowInfo.row));
          this.valueInfo.rowInfos.forEach(rowInfo => 
            CellFormulaParser.getParserForChecklistRow(this.translator,rowInfo.row).getAllPossiblePreReqRows().forEach(allPossiblePreReqs.add,allPossiblePreReqs)
          );
          this._allPossiblePreReqRows = allPossiblePreReqs;
        }
      }
      return this._allPossiblePreReqRows;
    }

    getCircularDependencies(previous:row[] = []):ReadonlySet<row> {
      if (this._circularDependencies) return this._circularDependencies;
      const circularDependencies: Set<row> = new Set();
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

    isDirectlyMissable():boolean {
      if (this.valueInfo.isChoiceOnly) return false;
      return super.isDirectlyMissable(); 
    }

  }

  class BooleanFormulaValueNode extends FormulaValueNode<boolean> {
    protected readonly formulaType: FormulaHelper = GTE;
    protected readonly children: NumberFormulaValueNode[];
    constructor(text:string, translator:StatusFormulaTranslator,row:row) {
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
      return this.children[0];
    }
    set availableChild(child: NumberFormulaValueNode) {
      this.children[0] = child;
    }
    get neededChild():NumberFormulaValueNode {
      return this.children[1];
    }
    set neededChild(child:NumberFormulaValueNode) {
      this.children[1] = child;
    }
    toPRUsedFormula():string {
      if (this.hasValue()) return VALUE.FALSE;
      return AND(
        GTE(
          MINUS(this.availableChild.toTotalFormula(),this.availableChild.toRawMissedFormula()),
          VALUE(this.valueInfo.numNeeded)
        ),
        LT(this.availableChild.toPRNotUsedFormula(),VALUE(this.valueInfo.numNeeded))
      );
    }
    toRawMissedFormula():string {
      if (this.hasValue()) return VALUE.FALSE;
      return LT(this.availableChild.toRawNotMissedFormula(),VALUE(this.valueInfo.numNeeded));

    }
    toMissedFormula():string {
      if (this.hasValue()) return VALUE.FALSE;
      return LT(this.availableChild.toNotMissedFormula(),VALUE(this.valueInfo.numNeeded));
    }
    toUnknownFormula():string {
      if (this.hasValue()) return VALUE.FALSE;
      return AND(
        NOT(this.toMissedFormula()),
        LT(
          MINUS(this.availableChild.toTotalFormula(),this.availableChild.toMissedFormula(),this.availableChild.toUnknownFormula()),
          VALUE(this.valueInfo.numNeeded)
        )
      );
    }
  }

  class NumberFormulaValueNode extends FormulaValueNode<number> implements NumberNode {
    protected readonly children: FormulaValueNode<never>[]
    constructor(text: string|number, translator:StatusFormulaTranslator,row:row) {
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

    toFormulaByStatus(...statuses: STATUS[]) {
      return this._generateFormula(statuses.flat());
    }

    toFormulaByNotStatus(...statuses:STATUS[]) {
      return MINUS(this.toTotalFormula(), this.toFormulaByStatus(...statuses));
    }

    /**
* Number that have been checked
*/
    toAvailableFormula():string { 
    // Available should look directly at "check" column only to prevent circular references
      return this._generateFormula(VALUE.TRUE,COLUMN.CHECK);
    }

    /**
* 
*/
    toPRNotMetFormula():string {
      return MINUS(this.toTotalFormula(), this.toAvailableFormula());
    }


    /**
* Number of dependencies that have been missed OR used
*/
    toMissedFormula():string {
      return this.toFormulaByStatus(STATUS.MISSED,STATUS.PR_USED);
    }
    toRawMissedFormula():string {
      return this.toFormulaByStatus(STATUS.MISSED);
    }
    toRawNotMissedFormula():string {
      return this.toFormulaByNotStatus(STATUS.MISSED);
    }

    toUnknownFormula():string {
      return this.toFormulaByStatus(STATUS.UNKNOWN);
    }
    toNotUnknownFormula():string {
      return this.toFormulaByNotStatus(STATUS.UNKNOWN);
    }
    /**
* Number that have NOT been MISSED or PR_USED
*/
    toNotMissedFormula():string {
      return this.toFormulaByNotStatus(STATUS.MISSED,STATUS.PR_USED);
    }
    /**
* Number of dependencies that have had their Pre-Reqs used
*/
    toPRUsedFormula():string {
      if (this.hasValue()) return VALUE(this.value);
      return this._generateFormula(STATUS.PR_USED);
    }
    /**
* Number of dependencies that have NOT had their Pre-Reqs used
*/
    toPRNotUsedFormula():string {
      if (this.hasValue()) {
        return VALUE(this.value);
      }
      return MINUS(this.toTotalFormula(), this.toPRUsedFormula());
    }
    toMinCheckedFormula():string {
      return this.toFormulaByStatus(STATUS.CHECKED);
    }
    toMaxCheckedFormula():string {
      return this.toFormulaByNotStatus(STATUS.MISSED,STATUS.PR_USED);
    }

    /**
* Minimum value, regardless of status
*/
    getMinValue():number {
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

    private _generateFormula(values: (string|number|boolean)|(string|number|boolean)[] = [], column:column = COLUMN.STATUS): string {
      if (this.hasValue()) {
        return VALUE(this.value);
      } else if (!values || (Array.isArray(values) && values.length == 0)) {
        return VALUE.ZERO;
      } else {
        const vals: (string|number|boolean)[] = Array.isArray(values) ? values : [values];
        const counts:string[] = Object.entries(this.translator.rowInfosToA1Counts(this.valueInfo.rowInfos, column)).reduce((counts,[range,count]) => {
          vals.forEach(value => {
            const countIf:string = COUNTIF(range, VALUE(value));
            counts.push(count == 1 ? countIf : MULT(countIf,VALUE(count)));
          });
          return counts;
        },[]);
        return ADD(...counts);
      }
    }
  }

  const usesInfo: {[x:string]:{[x:number]: number}} = {}; // TODO make checklist-aware
  class UsesFormulaNode extends BooleanFormulaValueNode {
    constructor(text:string, translator:StatusFormulaTranslator,row:row) {
      super(text,translator,row);
      this.useInfo[this.row] = this.valueInfo.numNeeded;
    }

    get useInfo(): {[x:number]:number} {
      if (!usesInfo[this.valueInfo.key]) {
        usesInfo[this.valueInfo.key] = {};
      }
      return usesInfo[this.valueInfo.key];
    }

    toPRUsedFormula():string {
      return OR(
        LT(
          MINUS(
            this.availableChild.toTotalFormula(),
            this._getPRUsedAmountFormula()
          ),
          VALUE(this.valueInfo.numNeeded)
        ),
        super.toPRUsedFormula()
      );
    }

    private _getPRUsedAmountFormula():string {
      const usedAmoutArguments:string[] = Object.entries(this.useInfo).map(([row,numUsed]) => IF(this.translator.cellA1(Number(row),COLUMN.CHECK),VALUE(numUsed)));
      return ADD(...usedAmoutArguments);
    }

    toAvailableFormula():string {
    // Parent => CHECKED >= NEEDED
    // This   => (CHECKED - USED) >= NEEDED
      const usedAmountFormula:string = this._getPRUsedAmountFormula();
      const checkedFormula:string = this.availableChild.toAvailableFormula();
      const availableAmountFormula:string = MINUS(checkedFormula,usedAmountFormula);
      const numNeededFormula:string = this.neededChild.toAvailableFormula();
      return this.formulaType.generateFormula(availableAmountFormula, numNeededFormula);
    }

    isDirectlyMissable():boolean {
      if (Object.values(usesInfo[this.valueInfo.key]).reduce((total,needed) => total+needed,0) > this.availableChild.getMaxValue()) {
      // if TOTAL_NEEDED > TOTAL_AVAILABLE
        return true;
      } else {
        return super.isDirectlyMissable();
      }
    }
  }

  interface choiceInfo {
    isChoiceOnly: boolean;
    choiceRow?: row;
    readonly options: row[]; // options is referenced in choiceRows, so don't allow overwrites
  }
  type rowChoiceInfo = {
    choiceCheckedFormula:string;
    options:sheetValueInfo[];
  }
  const choiceInfos:{[x:string]: choiceInfo} = {};
  const choiceRows:{[x:number]: row[]} = {};
  class ChoiceFormulaNode extends FormulaValueNode<boolean> {
    constructor(text:string, translator:StatusFormulaTranslator,row:row) {
      super(text,translator,row);

      this.choiceInfo.options.push(this.row);
    }

    get isChoiceOnly(): boolean {
      return this.valueInfo.isChoiceOnly || !this.valueInfo.rowInfos.length;
    }
    get choiceRow(): row {
      return this.isChoiceOnly ? undefined : this.valueInfo.rowInfos[0].row;
    }
    get choiceInfo(): choiceInfo {
      if (!choiceInfos[this.valueInfo.key]) {
      // Handles cache
        const choiceInfo:choiceInfo = {
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
    checkErrors():void {
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

    toPRUsedFormula():string {
      return this._determineFormula(
        OR(...this.choiceInfo.options.map(row => this.translator.cellA1(row, COLUMN.CHECK))),
        STATUS.PR_USED,STATUS.CHECKED
      );
    }

    toRawMissedFormula():string {
      return VALUE.FALSE;
    }

    toMissedFormula():string {
      return this._determineFormula(VALUE.FALSE,STATUS.MISSED);
    }

    toUnknownFormula(): string {
      return this._determineFormula(VALUE.FALSE,STATUS.UNKNOWN);
    }

    private _determineFormula(choiceOnlyFormula: string,...statuses: STATUS[]):string  {
      return this.isChoiceOnly ? choiceOnlyFormula : this._getChoiceRowStatusFormula(...statuses);
    }

    private _getChoiceRowStatusFormula(...statuses: STATUS[]) {
      return OR(...statuses.map(status => EQ(this.translator.cellA1(this.choiceRow,COLUMN.STATUS),VALUE(status))));
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

    getAllPossiblePreReqRows():ReadonlySet<row> {
      if (this.isChoiceOnly) {
        return new Set<row>();
      } else {
        return super.getAllPossiblePreReqRows();
      }
    }

    getCircularDependencies(previous: row[]): ReadonlySet<row> {
      if (this.isChoiceOnly) {
        return new Set<row>();
      } else {
        return super.getCircularDependencies(previous);
      }
    }

    isDirectlyMissable():boolean {
      return true;
    }
  }

  class MissedFormulaNode extends FormulaNode<boolean> {
    constructor(text:string, translator:StatusFormulaTranslator,row:row) {
      super(text,translator,row);
      this.formulaType = NOT;
      this.child = new BooleanFormulaNode(this.text,this.translator,this.row);
    } 

    toMissedFormula():string {
      return this.child.toAvailableFormula();
    }
    toRawMissedFormula():string {
      return this.child.toAvailableFormula();
    }
    toPRUsedFormula():string {
      return this.child.toPRUsedFormula();
    }
    toUnknownFormula():string {
      return this.child.toUnknownFormula();
    }
    isDirectlyMissable(): boolean {
      return true;
    }
  }
}