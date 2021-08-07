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

  const numItemsPostfixRegExp = /^ *(.*?) +x(\d+) *$/;
  const numItemsPrefixRegExp = /^ *(\d+)x +(.*?) *$/;
  const getNumItemInfo = (text:string,_defaultNum:number = undefined):{num?:number,item:string} => {
    let match = text.match(numItemsPrefixRegExp);
    if (match) {
      return {num: Number(match[1]), item: match[2]};
    } else if ((match = text.match(numItemsPostfixRegExp))) {
      return {num: Number(match[2]), item: match[1]};
    } else if (_defaultNum || _defaultNum === 0){
      return {num: _defaultNum, item:text};
    } else {
      return {item:text};
    }
  };

  const FormulaHelper = (formula:Formula.StringFormula, regExp:RegExp, isFlexible:boolean = false):FormulaHelper => {
    const parseOperands = (text:string):string[] => {
      const match = text && text.match(regExp);
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
        identify: (text:string):boolean => !!(text && text.match(regExp)),
        parseOperands,
      });
  };
  const ReversibleFormulaHelper = (formula:Formula.StringFormula, regExp:RegExp, reversibleRegExp:RegExp):FormulaHelper => {
    const parseOperands = (text:string):string[] => {
      if (!text) return;
      let match = text.match(regExp);
      if (match) return match.slice(1);
      match = text.match(reversibleRegExp);
      if (match) return match.slice(1).reverse();
    };
    return Object.assign(
      (...args:string[]) => formula(...args), 
      formula, {
        generateFormula: formula,
        identify: (text:string):boolean => !!(text && (text.match(regExp) || text.match(reversibleRegExp))),
        parseOperands,
      });
  };
  const OR  = FormulaHelper(Formula.OR , /^ *(.+?) *\|\| *(.+?) *$/,true);
  const AND = FormulaHelper(Formula.AND, /^ *(.+?) *&& *(.+?) *$/,true);
  const NOT = FormulaHelper(Formula.NOT, /^ *! *(.+?) *$/);
  const EQ  = FormulaHelper(Formula.EQ , /^ *(.+?) *== *(.+?) *$/);
  const NE  = FormulaHelper(Formula.NE , /^ *(.+?) *!= *(.+?) *$/);
  const GT  = ReversibleFormulaHelper(Formula.GT , /^ *(.+?) *> *(.+?) *$/, /^ *(.+?) *< *(.+?) *$/);
  const GTE = ReversibleFormulaHelper(Formula.GTE, /^ *(.+?) *>= *(.+?) *$/, /^ *(.+?) *<= *(.+?) *$/);
  const X_ITEMS = ReversibleFormulaHelper(Formula.GTE, numItemsPostfixRegExp, numItemsPrefixRegExp);
    
  const MULT  = FormulaHelper(Formula.MULT , /^ *(.+?) +\* +(.+?) *$/,true);
  const DIV   = FormulaHelper(Formula.DIV  , /^ *(.+?) +\/ +(.+?) *$/,true);
  const MINUS = FormulaHelper(Formula.MINUS, /^ *(.+?) +- +(.+?) *$/,true);
  const ADD   = FormulaHelper(Formula.ADD  , /^ *(.+?) +\+ +(.+?) *$/,true);
  
  const {FORMULA,VALUE,IFS,IF,COUNTIF} = Formula;

  const formulaTypeToString = (formulaType:FormulaHelper) => {
    switch(formulaType) {
      case OR: return "||";
      case AND: return "&&";
      case NOT: return "!";
      case EQ: return "==";
      case NE: return "!=";
      case GT: return ">";
      case X_ITEMS:
      case GTE: return ">=";
      case MULT: return "*";
      case DIV: return "/";
      case MINUS: return "-";
      case ADD: return "+";
    }
  };

  enum SPECIAL_PREFIXES  {
    USES     = "USES",
    MISSED   = "MISSED",
    CHOICE   = "CHOICE", // DEPRECATED, alias for OPTION
    OPTION   = "OPTION",
    LINKED   = "LINKED",
    CHECKED  = "CHECKED",
    OPTIONAL = "OPTIONAL",
  }

  export function getActiveChecklistTranslator(): StatusFormulaTranslator {
    return getTranslatorForChecklist(ChecklistApp.getActiveChecklist());
  }

  export function getTranslatorForChecklist(checklist: Checklist = ChecklistApp.getActiveChecklist()): StatusFormulaTranslator {
    return StatusFormulaTranslator.fromChecklist(checklist);
  }

  export function validateAndGenerateStatusFormulasForChecklist(checklist:Checklist = ChecklistApp.getActiveChecklist()): void {
    StatusFormulaTranslator.fromChecklist(checklist).validateAndGenerateStatusFormulas();
  }

  export function addLinksToPreReqs(checklist:Checklist = ChecklistApp.getActiveChecklist(), startRow = checklist.firstDataRow, endRow = checklist.lastRow): void{
    StatusFormulaTranslator.fromChecklist(checklist).addLinksToPreReqs(startRow,endRow);
  }
  
  enum PHASE {
    BUILDING = "BUILDING",
    FINALIZING = "FINALIZING",
    FINALIZED = "FINALIZED",
  }
  export class StatusFormulaTranslator {
    readonly checklist: Checklist;
    private requestId:string = Date.now().toString()
    private constructor(checklist: Checklist) {
      this.checklist = checklist;
      CacheService.getScriptCache().put("latestTranslatorRequestId",this.requestId,60);
    }

    get isLatest():boolean {
      time("getCachedRequestId");
      const cachedRequestId = CacheService.getScriptCache().get("latestTranslatorRequestId");
      timeEnd("getCachedRequestId");
      return cachedRequestId == this.requestId;
    }

    private static readonly translators: {[x:number]: StatusFormulaTranslator} = {}
    static fromChecklist(checklist: Checklist): StatusFormulaTranslator {
      if (!this.translators[checklist.id]) {
        this.translators[checklist.id] = new StatusFormulaTranslator(checklist);
      }
      return this.translators[checklist.id];
    }

    private _parsers:CellFormulaParser[]
    get parsers():CellFormulaParser[] {
      return this._parsers ?? (this._parsers = this.initializeParsers());
    }

    private _phase:PHASE = PHASE.BUILDING
    get phase():PHASE {
      return  this._phase;
    }
    private initializeParsers(): CellFormulaParser[] {
      if (this._parsers) return this._parsers;
      time("parseCells");
      
      const preReqRange:Range = this.checklist.getColumnDataRange(COLUMN.PRE_REQS);
      const preReqValues:unknown[][] = preReqRange.getValues();
      const firstRow:row = preReqRange.getRow();
      const parsers:CellFormulaParser[] = new Array(firstRow + preReqValues.length);
      
      for (let i:number = 0; i < preReqValues.length; i++) {
        parsers[i+firstRow] = CellFormulaParser.getParserForChecklistRow(this,i+firstRow,preReqValues[i][0].toString());
      }
      this._phase = PHASE.FINALIZING;
      parsers.forEach(parser => parser?.finalize());
      this._phase = PHASE.FINALIZED;
      this._parsers = parsers;
      timeEnd("parseCells");
      return parsers;
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
      time("getStatusValues statusFormulas");
      const existingStatusFormulas:string[][] = statusDataRange.getFormulas();
      timeEnd("getStatusValues statusFormulas");
      time("getStatusValues checkFormulas");
      const checkboxFormulas:string[][] = checkRange.getFormulas();
      timeEnd("getStatusValues checkFormulas", "getStatusValues");

      const numRows = preReqValues.length;
      // TODO add interactive validation?
      //const preReqValidations = preReqRange.getDataValidations(); 

      // Only set if has a formula to write
      const statusFormulas:string[] = new Array(numRows);
      const controlledFormulas:string[] = new Array(numRows);
      // Fill with null to reset if not set
      const notes:string[] = new Array(numRows).fill(null);
      const checkNotes:string[] = new Array(numRows).fill(null);
      const itemStyles:GoogleAppsScript.Spreadsheet.FontStyle[] = new Array(numRows).fill(null);
      const itemWeights:GoogleAppsScript.Spreadsheet.FontWeight[] = new Array(numRows).fill(null);
      const itemLines:GoogleAppsScript.Spreadsheet.FontLine[] = new Array(numRows).fill(null);

      time("fontSize");
      const checkSizes:number[] = new Array(numRows).fill(itemDataRange.getFontSize());
      timeEnd("fontSize");

      time("getDebugColumns");
      const debugColumns: {[x:string]: {formulaFunc: ()=>string,range?: Range, formulas?: string[][]}} = {
        "isAvailable": {
          formulaFunc: CellFormulaParser.prototype.toPreReqsMetFormula,
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

      time("calculateValues");
      // Generate our formulas
      this.parsers;
      time("generateFormulas");
      for (let i:number = 0; i < numRows; i++) {
        hasDebugColumns && time("debug generateFormula row"+(i+firstRow));
        const parser:CellFormulaParser = this.parsers[i+firstRow];
        let note:string = null;
        if (parser) {
          statusFormulas[i] = FORMULA(parser.toFormula());
          if (statusFormulas[i].length > 50_000 && Formula.togglePrettyPrint(false)) {
            // Formula too long, but was pretty printing, try non-pretty
            statusFormulas[i] = FORMULA(parser.toFormula());
            Formula.togglePrettyPrint(true); // turn back on
          }
          if (statusFormulas[i].length > 50_000) {
            console.warn(`Too Long Formula Row ${i+firstRow}: ${statusFormulas[i].length}`);
            statusFormulas[i] = FORMULA(VALUE(STATUS.ERROR));
            note = "ERROR: ERROR: Resulting formula too large for Sheets to handle, please attempt to simplify Pre-Reqs dependencies";
          } else if (parser.hasErrors()) {
            note = [...parser.getErrors()].map(error => `ERROR: ${error}`).join("\n");
          } else {
            const allMissablePreReqs:string[] = parser.getAllDirectlyMissablePreReqs();
            if (allMissablePreReqs.length) {
              note = "Possible to miss Pre-Reqs\n------------------------------\n" + allMissablePreReqs.join("\n");
            } 
          }
          if (parser.isControlled()) {
            const checkboxControlledByInfos:sheetValueInfo[] = parser.getControlledByInfos();
            const controlNotes = [checkboxControlledByInfos.length > 1 ? "Linked to these Items:" : "Linked to this Item:"];
            checkboxControlledByInfos.forEach(({row,value}) => {
              if (value && value.toString().trim()) {
                controlNotes.push(`•${value} (Row ${row})`);
              }
            });
            checkNotes[i] = controlNotes.join("\n");
            controlledFormulas[i] = FORMULA(parser.toControlledFormula());
            checkSizes[i] = 0;
          }
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
      timeEnd("calculateValues");

      if (this.isLatest) {
        time("writeValues");

        time("setFormulasIndividual");
        // Reduce client-side recalculations by only setting formula if changed
        statusFormulas.forEach((statusFormula,i) => {
          if (statusFormula.length > 40000) console.warn(`Long Formula Row ${i+firstRow}: ${statusFormula.length}`);
          if (statusFormula !== existingStatusFormulas[i][0]) {
            statusDataRange.getCell(i+1,1).setFormula(statusFormula);
          }
        });
        timeEnd("setFormulasIndividual");

        time("determineUnderlineRows");
        const finalItems = this.getColumnValues(COLUMN.TYPE).byValue[ChecklistApp.FINAL_ITEM_TYPE];
        if (finalItems) {
          const dependendentRows = new Set<number>();
          finalItems.forEach(finalItem => {
            CellFormulaParser.getParserForChecklistRow(this,finalItem.row).getAllPossiblePreReqRows().forEach(dependendentRows.add,dependendentRows);
          });
          dependendentRows.forEach(row => itemWeights[row-firstRow] = "bold");
        }
        timeEnd("determineUnderlineRows");

        time("controlledRows");
        checkboxFormulas.forEach((existingFormulaRow,i) => {
          const existingFormula = existingFormulaRow[0];
          const controlledFormula = controlledFormulas[i];
          if (controlledFormula) {
            itemStyles[i] = "italic";
            if (existingFormula !== controlledFormula) {
              checkRange.getCell(i+1,1).setFormula(controlledFormula);
            }
          } else if (existingFormula) {
            // Had a formula but currently dosen't, set to FALSE
            checkRange.getCell(i+1, 1).setValue(VALUE.FALSE);
          }
        });
        timeEnd("controlledRows");

        time("setNotes");
        preReqRange.setNotes(notes.map(note => [note]));
        checkRange.setNotes(checkNotes.map(note => [note]));
        timeEnd("setNotes");
        
        time("setItemUnderlineStyleWeight");
        itemDataRange
          .setFontStyles(itemStyles.map(style => [style]))
          .setFontLines(itemLines.map(lines => [lines]))
          .setFontWeights(itemWeights.map(weight => [weight]));
        timeEnd("setItemUnderlineStyleWeight");

        time("setCheckSize");
        checkRange.setFontSizes(checkSizes.map(size => [size]));
        timeEnd("setCheckSize");

        time("debugColumnValues");
        Object.values(debugColumns).forEach(value => value.range.setFormulas(value.formulas.map(formulaArray => [FORMULA(formulaArray[0])])));
        timeEnd("debugColumnValues");
        timeEnd("writeValues");
      } else {
        Logger.log("Not updating statuses, other request has come in");
        return;
      }
      timeEnd("validateAndGenerateStatusFormulas");
    }

    /**
     * To prevent race conditions that are unavoidable when a User is editing directly, must get-modify-update range in a single operation
     */
    addLinksToPreReqs(startRow:row = this.checklist.firstDataRow,endRow = this.checklist.lastRow):void {
      time("addLinksToPreReqs");
      try {
        if (startRow < this.checklist.firstDataRow) startRow = this.checklist.firstDataRow;
        if (endRow > this.checklist.lastRow) endRow = this.checklist.lastRow;
        if (startRow > endRow) return;
        const preReqRichTexts = [];
        time("addLinks flush");
        // this.checklist.flush();
        timeEnd("addLinks flush");
        time("addLinks getRange");
        const preReqRange = this.checklist.getColumnDataRange(COLUMN.PRE_REQS, startRow, endRow-startRow+1);
        timeEnd("addLinks getRange");
        time("addLinks getValues");
        const preReqValues = preReqRange.getValues();
        timeEnd("addLinks getValues");
      
        time("addLinks determineRichText");
        let linkAdded = false;
        for (let i = 0; i < preReqValues.length; i++) {
          const parser = this.parsers[i+startRow];
          const preReqValue = preReqValues[i][0].toString();
          const richTextValue = SpreadsheetApp.newRichTextValue()
            .setText(preReqValue);
        
          const directPreReqInfos = parser.getDirectPreReqInfos();
          Object.entries(directPreReqInfos).forEach(([text, rows]) => {
            const startIndex = preReqValue.indexOf(text);
            if (text && startIndex >= 0) {
              const rowRanges = this.rowsToRanges(rows,COLUMN.ITEM);
              if (rowRanges.length == 1 && parser.preReqText === preReqValue) {
              // For now, only link if it refers to single cell/range AND the value in the translator is the same as just read from flushed sheet
              // TODO determine best way of linking multi
                richTextValue.setLinkUrl(startIndex, startIndex+text.length,Formula.urlToSheet(this.checklist.sheetId,...rowRanges[0]));
                linkAdded = true;
              }
            }
          });
          preReqRichTexts[i] = richTextValue.build();
        }
        timeEnd("addLinks determineRichText");

        if (!linkAdded) {
          Logger.log("No links added");
          return;
        }
        time("preReqTextStyle");
        preReqRange.setTextStyle(SpreadsheetApp.newTextStyle()
          .setBold(false)
          .setItalic(false)
          .setUnderline(false)
          .setStrikethrough(false)
          .setForegroundColor("black")
          .build());
        timeEnd("preReqTextStyle");
        time("setRichText");
        preReqRange.setRichTextValues(preReqRichTexts.map(richText => [richText]));
        timeEnd("setRichText");
        time("endFlush");
        // this.checklist.flush();
        timeEnd("endFlush");
      } finally {
        timeEnd("addLinksToPreReqs");
      }
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
          const itemInfo = getNumItemInfo(value.trim(),1);
          if (rowValues[itemInfo.item]) {
            rowValues[itemInfo.item].num += itemInfo.num;
          } else {
            rowValues[itemInfo.item] = {
              num: itemInfo.num,
              value: itemInfo.item,
              row: firstRow+i,
              column: columnIndex,
            };
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

    getRowCounts(column:column,id:string,_implicitPrefix:boolean = false):RowCounts {
      if (!this.checklist.hasColumn(column)) return {};
      const columnInfo:columnValues = this.getColumnValues(column);
      const rows:{[x:number]:number} = {};
      const addRows = (valueInfos: sheetValueInfo[]) => valueInfos.forEach(valueInfo => {
        rows[valueInfo.row] = (rows[valueInfo.row] || 0) + valueInfo.num;
      });
      if (_implicitPrefix && id.indexOf("*") < 0) {
        id += "*";
      }
      if (columnInfo.byValue[id]) {
        addRows(columnInfo.byValue[id]);
      } else if (id.indexOf("*") >= 0 || id.indexOf(".") >= 0) {
        const search:RegExp = RegExp("^" + id.replace(/\*/g,".*") + "$");
        Object.keys(columnInfo.byValue).forEach(value => {
          if (value.match(search)) {
            addRows(columnInfo.byValue[value]);
          }
        });
      }
      return rows;
    }

    cellA1 (row: row, column: column): string {
      column = this.checklist.toColumnIndex(column);
      return Formula.A1(row,column);
    }

    rowsToRanges(rows: row[], column?: column):number[][] {
      const rowRanges = [];
      if (!rows || rows.length == 0) return rowRanges;
      if (column) column = this.checklist.toColumnIndex(column);
      rows = rows.sort((a,b) => a-b).filter((row,i,rows) => rows.indexOf(row) == i);
      let firstRow:row = rows[0];
      let lastRow:row = rows[0];
      for (let i = 1; i < rows.length; i++) {
        if (rows[i] != lastRow + 1) {
          rowRanges.push([firstRow,column,lastRow,column]);
          firstRow = lastRow = rows[i];
        } else {
          lastRow = rows[i];
        }
      }
      rowRanges.push([firstRow,column,lastRow,column]);
      return rowRanges;
    }
    rowsToA1Ranges(rows: row[],column?: column):string[] {
      return this.rowsToRanges(rows,column).map(range => Formula.A1(...range));
    }

    rowCountsToA1Counts(rowCounts: Readonly<RowCounts>, column: column): {[x:string]: number} {
      column = this.checklist.toColumnIndex(column);
      const rangeCounts:{[x:string]:number} = {};
      const rows = Object.keys(rowCounts).map(row => Number(row)).sort((a,b)=>a-b);
      if (rows.length === 0) return rangeCounts;
      let firstRow:row = rows[0];
      let lastRow:row = rows[0];
      let num:number = rowCounts[rows[0]];
      for (let i:number = 1; i < rows.length; i++) {
        if (rows[i] != lastRow+1 || rowCounts[rows[i]] != num) {
          rangeCounts[Formula.A1(firstRow,column,lastRow,column)] = num;
          firstRow = lastRow = rows[i];
          num = rowCounts[rows[i]];
        } else {
          lastRow = rows[i];
        }
      }
      rangeCounts[Formula.A1(firstRow,column,lastRow,column)] = num;
      return rangeCounts;
    }
  }

  type sheetValueInfo = {
    num: number;
    value: string;
    row: row;
    column: column;
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
  let UID_Counter:number = 0;
  const [parenIdentifier,quoteIdentifier] = ["PPH","QPH"];
  const getParenPlaceholder = ():string =>  `${parenIdentifier}_${UID_Counter++}_${parenIdentifier}`;
  const getQuotePlaeholder = ():string => `${quoteIdentifier}_${UID_Counter++}_${quoteIdentifier}`;
  const quoteRegExp:RegExp = RegExp(`${quoteIdentifier}_\\d+_${quoteIdentifier}`);
  const parenRegExp:RegExp = RegExp(`${parenIdentifier}_\\d+_${parenIdentifier}`);
  const quoteMapping:{[x:string]:string} = {};
  const parentheticalMapping:{[x:string]:string} = {};

  const PREFIX_REG_EXP:RegExp = new RegExp(`^(${Object.values(SPECIAL_PREFIXES).join("|")}) (.+)$`, "i");
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
    readonly preReqText: string
    private constructor(translator: StatusFormulaTranslator, row:row, cellValue = translator.checklist.getValue(row, COLUMN.PRE_REQS)) {
      this.translator = translator;
      this.row = row;
      this.preReqText = cellValue.toString();

      const lines:string[] = [];
      this.preReqText.split(/[\n;]/).forEach((line:string,i:number) => {
        if (i > 0 && line.indexOf("...") === 0) {
          lines[lines.length-1] += line.substring(3);
        } else {
          lines.push(line);
        }
      });

      const children: FormulaNode<boolean>[] = [];
      const linkedChildren: FormulaNode<boolean>[] = [];
      let linkedFlag: boolean = false;
      let checkedFlag: boolean = false;
      for (let j:number = 0; j < lines.length; j++) {
        let line:string = lines[j].trim();
        let isLinked = linkedFlag;
        if (!line) continue;

        if (line.trim().toUpperCase() == SPECIAL_PREFIXES.LINKED.toUpperCase()) {
          linkedFlag = true;
          continue;
        }
        if (line.trim().toUpperCase() == SPECIAL_PREFIXES.CHECKED.toUpperCase()) {
          checkedFlag = true;
          continue;
        }
        line = line.replace(/"(([^"]|\\")*)"/g, (_match,text:string) => {
          const placeholder:string = getQuotePlaeholder();
          quoteMapping[placeholder] = text;
          return placeholder;
        });

        let match: RegExpMatchArray;
        const parenMatcher:RegExp = /\((([^()]|\\\(|\\\))*)\)/;
        // eslint-disable-next-line no-cond-assign
        while (match = line.match(parenMatcher)) {
          const placeholder:string = getParenPlaceholder();
          parentheticalMapping[placeholder] = match[1];
          line = line.replace(parenMatcher, placeholder);
        }
        let childFormulaNode: FormulaNode<boolean>;
        const prefixCheck:RegExpMatchArray = line.match(PREFIX_REG_EXP);
        // specific Prefix node, or default to boolean node
        if (prefixCheck) { 
          const content:string = prefixCheck[2].trim();
          switch (prefixCheck[1].toUpperCase()) {
            case SPECIAL_PREFIXES.USES.toUpperCase():
              childFormulaNode = UsesFormulaNode.create(content,this.translator,row);
              break;
            case SPECIAL_PREFIXES.MISSED.toUpperCase():
              childFormulaNode = MissedFormulaNode.create(content,this.translator,row);
              break;
            case SPECIAL_PREFIXES.CHOICE.toUpperCase():
            case SPECIAL_PREFIXES.OPTION.toUpperCase():
              childFormulaNode = OptionFormulaNode.create(content,this.translator,row);
              break;
            case SPECIAL_PREFIXES.OPTIONAL.toUpperCase():
              childFormulaNode = OptionalFormulaNode.create(content,this.translator,row);
              break;
            case SPECIAL_PREFIXES.LINKED.toUpperCase():
              isLinked = true;
              childFormulaNode = BooleanFormulaNode.create(content,this.translator,row);
              break;
          }
        } else {
          childFormulaNode = BooleanFormulaNode.create(line,this.translator,row);
        }
        if (isLinked) linkedChildren.push(childFormulaNode);
        else children.push(childFormulaNode);
      }
      if (checkedFlag) {
        this.rootNode = new CheckedRootNode(children,this.translator,row);
      } else if (linkedChildren.length) {
        this.rootNode = new LinkedFormulaNode(children,linkedChildren,this.translator,row);
      } else {
        this.rootNode = new RootNode(children,this.translator,row);
      }
    }

    /**
     * Mark as finalized so that no further changes are allowed
     */
    finalize():void {
      this.checkPhase(PHASE.FINALIZING);
      this.rootNode.finalize();
    }

    private isPhase(phase:PHASE) {
      return this.translator.phase == phase;
    }
    private checkPhase(...phases:PHASE[]) {
      if (!phases.reduce((isPhase,requiredPhase) => isPhase || this.isPhase(requiredPhase), false)) {
        throw new Error(`Invalid operation: Requires PHASE "${phases.join("\"|\"")}" but is "${this.translator.phase}"`);
      }
    }

    toFormula():string {
      this.checkPhase(PHASE.FINALIZED);
      return this.toStatusFormula();
    }

    hasErrors():boolean {
      return this.getErrors().size > 0;
    }

    getErrors():ReadonlySet<string> {
      return this.rootNode.getErrors();
    }

    getAllPossiblePreReqs():string[] {
      this.checkPhase(PHASE.FINALIZED);
      const itemValues:{[x:number]:sheetValueInfo[]} = this.translator.getColumnValues(COLUMN.ITEM).byRow;
      return [...this.getAllPossiblePreReqRows()].map(row => itemValues[row].map(info => info.value)).flat();
    }

    getAllDirectlyMissablePreReqs():string[] {
      this.checkPhase(PHASE.FINALIZED);
      const allMissableRows:row[] = [...this.getAllPossiblePreReqRows()].filter(row => CellFormulaParser.getParserForChecklistRow(this.translator,row).isDirectlyMissable());
      const itemValues:{[x:number]:sheetValueInfo[]} = this.translator.getColumnValues(COLUMN.ITEM).byRow;
      return [...allMissableRows].map(row => itemValues[row].map(info => info.value)).flat().filter(value => value);
    }

    getDirectPreReqInfos() {
      this.checkPhase(PHASE.FINALIZED);
      return this.rootNode.getDirectPreReqInfos();
    }
    
    getDirectPreReqRows(): ReadonlySet<number> {
      return this.rootNode.getDirectPreReqRows();
    }

    isControlled():boolean {
      this.checkPhase(PHASE.FINALIZED);
      return this.rootNode.isControlled();
    }
    getControlledByInfos():sheetValueInfo[] {
      this.checkPhase(PHASE.FINALIZED);
      return this.rootNode.getControlledByInfos();
    }
    toControlledFormula():string {
      this.checkPhase(PHASE.FINALIZED);
      return this.rootNode.toControlledFormula();
    }

    addOption(row:row) {
      this.checkPhase(PHASE.FINALIZING);
      this.rootNode.addOption(row);
    }

    getOptions():row[] {
      this.checkPhase(PHASE.FINALIZED);
      return this.rootNode.getOptions();
    }

    getAllPossiblePreReqRows():ReadonlySet<row> {
      this.checkPhase(PHASE.FINALIZED);
      return this.rootNode.getAllPossiblePreReqRows();
    }

    isDirectlyMissable():boolean {
      this.checkPhase(PHASE.FINALIZED);
      return this.rootNode.isDirectlyMissable();
    }

    isInCircularDependency():boolean {
      this.checkPhase(PHASE.FINALIZED);
      return this.getCircularDependencies().has(this.row);
    }

    private _lockCircular: boolean;   
    private _circularDependencies: ReadonlySet<row>;
    private _isCircular: boolean;
    getCircularDependencies(previous = []): ReadonlySet<row> {
      this.checkPhase(PHASE.FINALIZED);
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
    toRawPreReqsMetFormula(): string {
      this.checkPhase(PHASE.FINALIZED);
      return this.rootNode.toRawPreReqsMetFormula();
    }
    toPreReqsMetFormula() {
      this.checkPhase(PHASE.FINALIZED);
      return this.rootNode.toPreReqsMetFormula();
    }
    toRawMissedFormula() {
      this.checkPhase(PHASE.FINALIZED);
      return this.rootNode.toRawMissedFormula();
    }
    toMissedFormula() {
      this.checkPhase(PHASE.FINALIZED);
      return this.rootNode.toMissedFormula();
    }
    toPRUsedFormula() {
      this.checkPhase(PHASE.FINALIZED);
      return this.rootNode.toPRUsedFormula();
    }
    toUnknownFormula() {
      this.checkPhase(PHASE.FINALIZED);
      return this.rootNode.toUnknownFormula();
    }
    toErrorFormula() {
      this.checkPhase(PHASE.FINALIZED);
      return this.rootNode.toErrorFormula();
    }
    toStatusFormula() {
      this.checkPhase(PHASE.FINALIZED);
      return this.rootNode.toStatusFormula();
    }
  }

  abstract class Node {
    protected readonly errors: Set<string> = new Set<string>();
    protected readonly children: Node[] = [];
    protected readonly text: string;
    readonly row: row;

    readonly translator: StatusFormulaTranslator
    protected constructor(text: string, translator: StatusFormulaTranslator,row: row) {
      this.translator = translator;
      this.checkPhase(PHASE.BUILDING);
      this.text = text.toString().trim();
      this.row = row;

      if (parentheticalMapping[this.text]) {
        this.text = parentheticalMapping[this.text];
      }
    }
    
    finalize() {
      this.checkPhase(PHASE.FINALIZING);
      this.children.forEach(child => child.finalize());
    }

    protected isPhase(phase:PHASE) {
      return this.translator.phase == phase;
    }
    protected checkPhase(...phases:PHASE[]) {
      if (!phases.reduce((isPhase,requiredPhase) => isPhase || this.isPhase(requiredPhase), false)) {
        throw new Error(`Invalid operation: Requires PHASE "${phases.join("\"|\"")}" but is "${this.translator.phase}"`);
      }
    }

    protected get child():Node {
      return this.children.length == 1 ? this.children[0] : undefined;
    }

    protected set child(child:Node) {
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
    checkErrors(): boolean {
      return false;
    }

    getErrors(): Set<string> {
      this.checkErrors();
      this.children.forEach(child => this.addErrors(child.getErrors()));
      return this.errors;
    }

    hasErrors(): boolean {
      return this.getErrors().size > 0;
    }

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

    getDirectPreReqInfos():{[x:string]:row[]} {
      return this.children.reduce((preReqInfos, child) => Object.assign(child.getDirectPreReqInfos(),preReqInfos), {});
    }

    getDirectPreReqRows():ReadonlySet<row> {
      const preReqRows = new Set<row>();
      this.children.forEach(child => child.getDirectPreReqRows().forEach(preReqRows.add,preReqRows));
      return preReqRows;
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

    toString():string {
      let unescaped = this.text;
      let match:RegExpMatchArray;
      while ((match = unescaped.match(parenRegExp))) {
        unescaped = unescaped.replace(match[0],`(${parentheticalMapping[match[0]]})`);
      }
      while ((match = unescaped.match(quoteRegExp))) {
        unescaped = unescaped.replace(match[0],`"${quoteMapping[match[0]]}"`);
      }
      return unescaped;
    }
  }
  abstract class FormulaNode<T extends number|boolean|unknown> extends Node {
    protected readonly children:FormulaNode<unknown>[];
    protected formulaType: FormulaHelper;
    protected value: T;     

    hasValue(): boolean {
      return typeof this.value !== "undefined";
    }
    
    updateValue(value: T) {
      this.checkPhase(PHASE.BUILDING,PHASE.FINALIZING);
      if (!this.hasValue()) {
        throw new Error("Cannot update value on a non-value node");
      }
      this.value = value;
    }

    protected get child(): FormulaNode<unknown> {
      return super.child as FormulaNode<unknown>;
    }

    protected set child(child: FormulaNode<unknown>) {
      super.child = child;
    }
    toErrorFormula(): string {
      return VALUE(this.hasErrors());
    }

    toPreReqsMetFormula(): string {
      let formula: string;
      if (this.hasValue()) {
        return VALUE(this.value as string);
      } else if (this.formulaType) {
        formula = this.formulaType.generateFormula(...this.children.map(child => child.toPreReqsMetFormula()));
      } else if (this.child) {
        formula = this.child.toPreReqsMetFormula();
      } else {
        this.addError(`Could not determine formula for "${this.text}"`);
      }
      return formula;
    }

    abstract toPRUsedFormula(): string;

    abstract toRawMissedFormula(): string;

    abstract toMissedFormula(): string;

    abstract toUnknownFormula(): string;
  }

  class BooleanFormulaNode extends FormulaNode<boolean> {
    static create(text:string, translator:StatusFormulaTranslator,row:row):BooleanFormulaNode {
      return new BooleanFormulaNode(text,translator,row);
    }
    protected readonly children: FormulaNode<boolean>[]
    protected constructor(text:string, translator:StatusFormulaTranslator,row:row) {
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
            this.children.push(...operands.map(operand => BooleanFormulaNode.create(operand,this.translator,this.row)));
            return;
          }
        }
        for (const comparisonFormulaTranslationHelper of [
          EQ, 
          NE, 
          GTE,
          GT,
          X_ITEMS,
        ]) {
        // Recursively handle comparison operators
          if (comparisonFormulaTranslationHelper.identify(this.text)) {
            this.child = ComparisonFormulaNode.create(this.text,this.translator,this.row,comparisonFormulaTranslationHelper);
            return;
          }
        } 
        this.child = BooleanFormulaValueNode.create(this.text,this.translator,this.row);
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
    
    protected optionsRows:row[] = [];
    getOptions(): row[] {
      return [...this.optionsRows];
    }
    addOption(row: number) {
      this.optionsRows.push(row);
    }

    isControlled():boolean {
      return this.optionsRows.length > 0;
    }
    getControlledByInfos():sheetValueInfo[] {
      if (this.isControlled()) {
        const itemValues:{[x:number]:sheetValueInfo[]} = this.translator.getColumnValues(COLUMN.ITEM).byRow;
        return this.optionsRows.map(optionRow => itemValues[optionRow]).flat();
      }
    }
    toControlledFormula(): string {
      if (this.isControlled()) {
        if (this.isInCircularDependency()) {
          this.addError("Controlled Rows cannot be in Pre-Req circular Dependency");
          return VALUE.FALSE;
        } else {
          return OR(...this.translator.rowsToA1Ranges(this.optionsRows,COLUMN.CHECK));
        }
      }
    }
    toCheckedFormula(): string {
      return this.translator.cellA1(this.row, COLUMN.CHECK);
    }

    /**
     * If this has options, only show this row if an Option is available
     */
    toPreReqsMetFormula():string {
      if (this.optionsRows.length > 0) {
        return OR(...this.optionsRows.map(optionRow => CellFormulaParser.getParserForChecklistRow(this.translator,optionRow).toPreReqsMetFormula()));
      } else {
        return this.toRawPreReqsMetFormula();
      }
    }

    toRawPreReqsMetFormula() {
      return BooleanFormulaNode.prototype.toPreReqsMetFormula.call(this);//super.toPreReqsMetFormula();
    }

    toStatusFormula(): string {
      const ifsArgs:string[] = [];
      const order: Array<[string,(()=>string)]> = [
        [STATUS.ERROR,      this.toErrorFormula],
        [STATUS.CHECKED,    this.toCheckedFormula],
        [STATUS.AVAILABLE,  this.toPreReqsMetFormula],
        [STATUS.UNKNOWN,    this.toUnknownFormula],
        [STATUS.PR_USED,    this.toPRUsedFormula],
        [STATUS.MISSED,     this.toMissedFormula],
        [STATUS.PR_NOT_MET, () => VALUE.TRUE],
      ];
      for (const [status,formulaFunction] of order) {
        const formula:string = formulaFunction.call(this);
        ifsArgs.push(formula,VALUE(status));
      }
      return IFS(...ifsArgs);
    }
  }

  class ComparisonFormulaNode extends FormulaNode<boolean> {
    static create(text: string, translator:StatusFormulaTranslator,row:row,formulaType: FormulaHelper) {
      return new ComparisonFormulaNode(text,translator,row,formulaType);
    }
    protected children: NumberNode[];
    protected constructor(text: string, translator:StatusFormulaTranslator,row:row,formulaType: FormulaHelper) {
      super(text,translator,row);

      this.formulaType = formulaType;
      const operands:string[] = formulaType.parseOperands(this.text);
      this.children.push(...operands.map(operand => NumberFormulaNode.create(operand,this.translator,this.row, formulaType == X_ITEMS)));
    }

    checkErrors(): boolean {
      let isError: boolean;
      const lMin:number = this.children[0].getMinValue();
      const lMax:number = this.children[0].getMaxValue();
      const rMin:number = this.children[1].getMinValue();
      const rMax:number = this.children[1].getMaxValue();
      switch (this.formulaType) {
        case EQ:
          isError = lMax < rMin || lMin > rMax;
          break;
        case NE: {
          isError = lMax == lMin && lMax == rMin && lMax == rMax;
          break;
        }
        case GTE:
        case X_ITEMS:
          isError = lMax < rMin;
          break;
        case GT:
          isError = lMax <= rMin;
          break;
      }
      if (isError) {
        const lRange = lMin == lMax ? lMin : `[${lMin}..${lMax}]`;
        const rRange = rMin == rMax ? rMin : `[${rMin}..${rMax}]`;
        this.addError(`Formula cannot be satisfied: "${this.text} ${this.formulaType.name}" cannot be satisfied: ${lRange} cannot be ${formulaTypeToString(this.formulaType)} ${rRange}`);
        return true;
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
        case GT: {
          return Formula.LTE(this.children[0].toFormulaByNotStatus(...maxNotStatuses),this.children[1].toFormulaByStatus(...minStatuses));
        }
        case GTE:
        case X_ITEMS: {
          return Formula.LT(this.children[0].toFormulaByNotStatus(...maxNotStatuses),this.children[1].toFormulaByStatus(...minStatuses));
        }
        case EQ: {
          return OR(
            Formula.LT(this.children[0].toFormulaByNotStatus(...maxNotStatuses),this.children[1].toFormulaByStatus(...minStatuses)),
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
    static create(text: string, translator:StatusFormulaTranslator,row:row,_implicitPrefix:boolean = false) {
      return new NumberFormulaNode(text,translator,row,_implicitPrefix);
    }
    protected readonly children: NumberNode[]
    protected constructor(text: string, translator:StatusFormulaTranslator,row:row,_implicitPrefix) {
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
          this.children.push(...operands.map(operand => NumberFormulaNode.create(operand,this.translator,this.row,_implicitPrefix)));
          return;
        }
      }
      this.child = NumberFormulaValueNode.create(text,this.translator,this.row,_implicitPrefix);
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

  type virtualValueInfo = {
    rowCounts: RowCounts,
    numPossible?: number,
    numNeeded?: number;
  }

  // Virtual Items, require rowCounts and can override the numNeeded and numPossible
  // e.g. Virtual Choice has a numNeeded of 1, and rowCounts of {[optionRow]:1} for each OPTION
  const virtualItems:{[x:string]: virtualValueInfo} = {};
  
  enum ValueNodeTypes {
    WITH="WITH",
    WITHOUT="WITHOUT",
    VALUE="VALUE",
  }
  const ValueNodeTypeRegExps:{[x in ValueNodeTypes]:RegExp} = {
    WITH: /^(?<items>.+?) +WITH +(?<filteredItems>.+?)$/,
    WITHOUT: /^(?<items>.+?) +WITHOUT +(?<filteredItems>.+?)$/,
    VALUE: /^(?:(?<column>.*?[^\s])[!=])?(?<id>.*)$/,
  };
  const unescapeValue = (text:string):string => {
    if (typeof quoteMapping[text] == "string") {
      return quoteMapping[text];
    }
    let match;
    while ((match = quoteRegExp.exec(text))) {
      text = text.replace(match[0],`"${quoteMapping[match[0]]}"`);
    }
    return text && text.trim();
  };
  type RowCounts = {
    [x:number]: number;
  };
  class ValueNode extends Node {
    protected type:ValueNodeTypes
    protected children:ValueNode[];
    readonly column:string;
    readonly id:string;
    protected readonly _rowCounts:RowCounts = {};
    protected _isVirtual:boolean;
    protected _isSelfReferential:boolean;
    protected get itemsChild(): ValueNode {
      return this.children[0];
    }
    protected set itemsChild(child: ValueNode) {
      this.children[0] = child;
    }
    protected get filterChild(): ValueNode {
      return this.children[1];
    }
    protected set filterChild(child: ValueNode) {
      this.children[1] = child;
    }
    get numPossible():number {
      return (this._isVirtual && virtualItems[this.text].numPossible) || Object.values(this._rowCounts).reduce((total,count) => total + count,0);
    }
    get rows():number[] {
      return Object.keys(this._rowCounts).map(row => Number(row)).sort((a,b)=>a-b);
    }
    get isVirtual() {
      return this._isVirtual;
    }
    get isSelfReferential() {
      return this._isSelfReferential;
    }
    get rowCounts():Readonly<RowCounts> {
      return {...this._rowCounts};
    }
    static create(text:string, translator:StatusFormulaTranslator,row:row,_implicitPrefix:boolean = false) {
      return new ValueNode(text,translator,row,_implicitPrefix);
    }
    constructor(text:string, translator:StatusFormulaTranslator,row:row,_implicitPrefix:boolean = false) {
      super(text,translator,row);
      let {items,filteredItems} = ValueNodeTypeRegExps.WITH.exec(this.text)?.groups || {};
      if (items || filteredItems) {
        this.type = ValueNodeTypes.WITH;
        this.itemsChild = new ValueNode(items,this.translator,this.row,_implicitPrefix);
        this.filterChild = new ValueNode(filteredItems,this.translator,this.row);
        [this.column, this.id, this._rowCounts] = [this.itemsChild.column,this.itemsChild.id, {...this.itemsChild._rowCounts}];
        this.rows.forEach(row => {
          if (!this.filterChild._rowCounts[row]) {
            delete this._rowCounts[row];
          }
        });
      } else if (({items,filteredItems} = ValueNodeTypeRegExps.WITHOUT.exec(this.text)?.groups || {}),items || filteredItems) {
        this.type = ValueNodeTypes.WITHOUT;
        this.itemsChild = new ValueNode(items,this.translator,this.row,_implicitPrefix);
        this.filterChild = new ValueNode(filteredItems,this.translator,this.row);
        [this.column, this.id, this._rowCounts] = [this.itemsChild.column,this.itemsChild.id, {...this.itemsChild._rowCounts}];
        this.rows.forEach(row => {
          if (this.filterChild._rowCounts[row]) {
            delete this._rowCounts[row];
          }
        });
      } else {
        this.type = ValueNodeTypes.VALUE;
        let {column,id} = ValueNodeTypeRegExps.VALUE.exec(this.text).groups;
        column = column  && unescapeValue(column);
        id = unescapeValue(id);
        this._rowCounts = this.translator.getRowCounts(column || COLUMN.ITEM,id,_implicitPrefix && (!column || column == COLUMN.ITEM));
        if (column && this.rows.length == 0) {
          // Assume ! was part Item ID
          this._rowCounts = this.translator.getRowCounts(COLUMN.ITEM,unescapeValue(this.text),_implicitPrefix);
          if (this.rows.length) {
            column = COLUMN.ITEM;
            id = unescapeValue(this.text);
          }
        }
        this.column = column || COLUMN.ITEM;
        this.id = id;
      }
      if (this._rowCounts && this._rowCounts[this.row]) {
        delete this._rowCounts[this.row];
        this._isSelfReferential = true;
      }
    }
    finalize() {
      if (!this.rows.length && virtualItems[this.text]) {
        Object.keys(virtualItems[this.text].rowCounts).forEach(row => this._rowCounts[row] = virtualItems[this.text].rowCounts[row]);
        this._isVirtual = true;
      }
    }
    toString():string{
      // Remove the outer "" if present
      return super.toString().replace(/^"(([^"]|\\")*)"$/,"$1");
    }

    checkErrors() {
      if (this.children.reduce((hasChildError,child) => child.checkErrors() || hasChildError, false)) {
        return true;
      } else if (this.rows.length == 0) {
        switch (this.type) {
          case ValueNodeTypes.WITH:
            this.addError(`Could not find any of "${this.itemsChild.toString()}" WITH "${this.filterChild.toString()}"`);
            break;
          case ValueNodeTypes.WITHOUT:
            this.addError(`Could not find any of "${this.itemsChild.toString()}" WITHOUT "${this.filterChild.toString()}"`);
            break;
          case ValueNodeTypes.VALUE:
            if (this.column != COLUMN.ITEM) {
              if (!this.translator.checklist.hasColumn(this.column)){
                this.addError(`Could not find column "${this.column}"`);
              } else {
                this.addError(`Could not find "${this.id}" in "${this.column}" column`);
              }
            } else {
              this.addError(`Could not find any of "${this.text}" ${this._isSelfReferential ? " (except itself)" : ""}`);
            }
        }
        return true;
      } else if (this.type == ValueNodeTypes.WITHOUT && this.rows.length == this.itemsChild.rows.length) {
        this.addError(`There are not any of "${this.itemsChild.toString()}" WITH "${this.filterChild.toString()}" (WITHOUT is unnecessary)`);
        return true;
      }
    }

    getDirectPreReqInfos() {
      if (this.children.length) {
        return super.getDirectPreReqInfos();
      } else {
        return {
          [this.toString()]: this.rows
        };
      }
    }
  }
  // Abstract intermediate class
  abstract class FormulaValueNode<T> extends FormulaNode<T> {
    readonly valueInfo:ValueNode;

    protected constructor(text:string, translator:StatusFormulaTranslator,row:row,_implicitPrefix:boolean = false) {
      super(text,translator,row);
      this.valueInfo = ValueNode.create(text,translator,row,_implicitPrefix);
    }

    finalize() {
      super.finalize();
      this.valueInfo.finalize();
    }

    protected _allPossiblePreReqRows:ReadonlySet<row>;
    getAllPossiblePreReqRows():ReadonlySet<row> {
      if (!this._allPossiblePreReqRows) {
        if (this.isInCircularDependency()) {
          this._allPossiblePreReqRows = this.getCircularDependencies();
        } else {
          const allPossiblePreReqs:Set<row> = new Set(this.valueInfo.rows);
          this.valueInfo.rows.forEach(row => 
            CellFormulaParser.getParserForChecklistRow(this.translator,Number(row)).getAllPossiblePreReqRows().forEach(allPossiblePreReqs.add,allPossiblePreReqs)
          );
          this._allPossiblePreReqRows = allPossiblePreReqs;
        }
      }
      return this._allPossiblePreReqRows;
    }

    getDirectPreReqRows() {
      return new Set<row>(this.valueInfo.rows);
    }

    getCircularDependencies(previous:row[] = []):ReadonlySet<row> {
      if (this._circularDependencies) return this._circularDependencies;
      const circularDependencies: Set<row> = new Set();
      if (this._lockCircular) {
        previous.slice(previous.indexOf(this.row)).forEach(circularDependencies.add,circularDependencies);
      } else {
        previous.push(this.row);
        this._lockCircular = true;
        this.valueInfo.rows.forEach(row => {
          CellFormulaParser.getParserForChecklistRow(this.translator,Number(row)).getCircularDependencies([...previous]).forEach(circularDependencies.add, circularDependencies);
        });
        this._lockCircular = false;
      }
      if (circularDependencies.has(this.row)) this._isCircular = true;
      this._circularDependencies = circularDependencies;
      return this._circularDependencies;
    }

    isDirectlyMissable():boolean {
      if (virtualItems[this.text]) return false;
      return super.isDirectlyMissable(); 
    }

    checkErrors() {
      return super.checkErrors() || (!this.hasValue() && this.valueInfo.checkErrors());
    }
    getDirectPreReqInfos() {
      return this.valueInfo.getDirectPreReqInfos();
    }
    getErrors() {
      this.checkErrors();
      if (!this.hasValue()) {
        this.addErrors(this.valueInfo.getErrors());
      }
      return super.getErrors();
    }
  }

  class BooleanFormulaValueNode extends FormulaValueNode<boolean> {
    static create(text:string, translator:StatusFormulaTranslator,row:row):FormulaValueNode<boolean> {
      const match = text.match(/^(SAME|COPY) +(.*?)$/);
      if (match) {
        return SameFormulaNode.create(match[2],translator,row);
      } else {
        return new BooleanFormulaValueNode(text, translator, row);
      }
    }
    protected readonly formulaType: FormulaHelper = GTE;
    protected readonly children: NumberFormulaValueNode[];
    protected numNeeded:number;

    protected constructor(text:string, translator:StatusFormulaTranslator,row:row,_implicitPrefix:boolean = false) {
      super(text,translator,row,_implicitPrefix);
      if (typeof this.text == "boolean" || this.text.toString().toUpperCase() == "TRUE" || this.text.toString().toUpperCase() == "FALSE") {
        this.value = typeof this.text == "boolean" ? this.text as boolean : this.text.toString().toUpperCase() == "TRUE";
      } else {
        // CHECKED >= NEEDED
        this.availableChild = NumberFormulaValueNode.create(this.text,this.translator,this.row,_implicitPrefix);
        this.neededChild = NumberFormulaValueNode.create(1,this.translator,this.row,_implicitPrefix); // Default to 1 but override during finalize
      }
    }

    finalize() {
      super.finalize();
      if (!this.hasValue()) {
        if (this.valueInfo.isVirtual && virtualItems[this.text].numNeeded) {
          this.numNeeded = virtualItems[this.text].numNeeded;
        } else if (!this.numNeeded && this.numNeeded !== 0) {
          this.numNeeded = this.valueInfo.numPossible; // Allow children to override numNeeded, but default to All
        }
        this.neededChild.updateValue(this.numNeeded);
      }
    }    
    
    protected get availableChild(): NumberFormulaValueNode {
      this.checkPhase(PHASE.FINALIZING,PHASE.FINALIZED);
      return this.children[0];
    }
    protected set availableChild(child: NumberFormulaValueNode) {
      this.checkPhase(PHASE.BUILDING);
      this.children[0] = child;
    }
    protected get neededChild():NumberFormulaValueNode {
      this.checkPhase(PHASE.FINALIZING,PHASE.FINALIZED);
      return this.children[1];
    }
    protected set neededChild(child:NumberFormulaValueNode) {
      this.checkPhase(PHASE.BUILDING);
      this.children[1] = child;
    }
    toPRUsedFormula():string {
      if (this.hasValue()) return VALUE.FALSE;
      return AND(
        GTE(
          MINUS(this.availableChild.toTotalFormula(),this.availableChild.toRawMissedFormula()),
          VALUE(this.numNeeded)
        ),
        Formula.LT(this.availableChild.toPRNotUsedFormula(),VALUE(this.numNeeded))
      );
    }
    toRawMissedFormula():string {
      if (this.hasValue()) return VALUE.FALSE;
      return Formula.LT(this.availableChild.toRawNotMissedFormula(),VALUE(this.numNeeded));

    }
    toMissedFormula():string {
      if (this.hasValue()) return VALUE.FALSE;
      return Formula.LT(this.availableChild.toNotMissedFormula(),VALUE(this.numNeeded));
    }
    toUnknownFormula():string {
      if (this.hasValue()) return VALUE.FALSE;
      return AND(
        NOT(this.toMissedFormula()),
        Formula.LT(
          MINUS(this.availableChild.toTotalFormula(),this.availableChild.toMissedFormula(),this.availableChild.toUnknownFormula()),
          VALUE(this.numNeeded)
        )
      );
    }
    checkErrors():boolean {
      if (super.checkErrors()) {
        return true;
      } else if (this.valueInfo.numPossible < this.numNeeded) {
        this.addError(`There are only ${this.valueInfo.numPossible}, not ${this.numNeeded}, of ${this.valueInfo.column} "${this.valueInfo.id}"${this.valueInfo.isSelfReferential ? " (when excluding itself)" : ""}`);
        return true;
      }
    }
  }

  class NumberFormulaValueNode extends FormulaValueNode<number> implements NumberNode {
    protected readonly isNumber = true;
    static create(text: string|number, translator:StatusFormulaTranslator,row:row,_implicitPrefix:boolean = false) {
      return new NumberFormulaValueNode(text,translator,row,_implicitPrefix);
    }
    protected readonly children: FormulaValueNode<never>[]
    protected constructor(text: string|number, translator:StatusFormulaTranslator,row:row,_implicitPrefix:boolean = false) {
      super(text.toString(),translator,row,_implicitPrefix);
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
      if (this.hasValue()) return VALUE(this.value);
      return MINUS(this.toTotalFormula(), this.toFormulaByStatus(...statuses));
    }

    /**
    * Number that have been checked
    */
    toPreReqsMetFormula():string { 
      // Available should look directly at "check" column only to prevent circular references
      return this._generateFormula(VALUE.TRUE,COLUMN.CHECK);
    }

    /**
    * 
    */
    toPRNotMetFormula():string {
      return MINUS(this.toTotalFormula(), this.toPreReqsMetFormula());
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
        const counts:string[] = Object.entries(this.translator.rowCountsToA1Counts(this.valueInfo.rowCounts, column)).reduce((counts,[range,count]) => {
          vals.forEach(value => {
            const countIf:string = COUNTIF(range, VALUE(value));
            counts.push(count == 1 ? countIf : MULT(countIf,VALUE(count)));
          });
          return counts;
        },[]);
        return ADD(...counts);
      }
    }

    checkErrors() {
      let hasError = super.checkErrors();
      if (this.text.match(/^SAME|COPY /)) {
        this.addError("Cannot use SAME with Numerical Equations");
        hasError = true;
      }
      return hasError;
    }
  }

  type useInfo = RowCounts
  type usesInfo = {[x:string]: useInfo}
  const usesInfo:usesInfo = {}; // TODO make checklist-aware?
  class UsesFormulaNode extends BooleanFormulaValueNode {
    static create(text:string, translator:StatusFormulaTranslator,row:row) {
      return new UsesFormulaNode(text,translator,row);
    }
    protected constructor(text:string, translator:StatusFormulaTranslator,row:row) {
      const itemInfo = getNumItemInfo(text);
      super(itemInfo.item,translator,row,itemInfo.num >= 0);
      this.numNeeded = itemInfo.num ?? 1;
      this.useInfo[this.row] = this.numNeeded;
    }

    get useInfo():useInfo {
      if (!usesInfo[this.text]) {
        usesInfo[this.text] = {};
      }
      return usesInfo[this.text];
    }

    toPRUsedFormula():string {
      return OR(
        Formula.LT(
          MINUS(
            this.availableChild.toTotalFormula(),
            this._getPRUsedAmountFormula()
          ),
          VALUE(this.numNeeded)
        ),
        super.toPRUsedFormula()
      );
    }

    private _getPRUsedAmountFormula():string {
      const usedAmoutArguments:string[] = Object.entries(this.useInfo).map(([row,numUsed]) => IF(this.translator.cellA1(row as unknown as number,COLUMN.CHECK),VALUE(numUsed),VALUE.ZERO));
      return ADD(...usedAmoutArguments);
    }

    toPreReqsMetFormula():string {
    // Parent => CHECKED >= NEEDED
    // This   => (CHECKED - USED) >= NEEDED
      const usedAmountFormula:string = this._getPRUsedAmountFormula();
      const checkedFormula:string = this.availableChild.toPreReqsMetFormula();
      const availableAmountFormula:string = MINUS(checkedFormula,usedAmountFormula);
      const numNeededFormula:string = this.neededChild.toPreReqsMetFormula();
      return this.formulaType.generateFormula(availableAmountFormula, numNeededFormula);
    }

    isDirectlyMissable():boolean {
      if (Object.values(usesInfo[this.text]).reduce((total,needed) => total+needed,0) > this.availableChild.getMaxValue()) {
      // if TOTAL_NEEDED > TOTAL_AVAILABLE
        return true;
      } else {
        return super.isDirectlyMissable();
      }
    }
  }
  class OptionFormulaNode extends BooleanFormulaValueNode {
    static create(text:string, translator:StatusFormulaTranslator,row:row): FormulaValueNode<boolean> {
      return new OptionFormulaNode(text,translator,row);
    }
    protected constructor(text:string, translator:StatusFormulaTranslator,row:row) {
      super(text,translator,row);
      if (this.valueInfo.rows.length == 0) {
        if (!virtualItems[this.text]) {
          virtualItems[this.text] = {
            rowCounts: {},
            numNeeded: 1,
          };
        }
        virtualItems[this.text].rowCounts[this.row] = 1;
      }
      this.numNeeded = 1;
    }
    finalize() {
      super.finalize();
      this.choiceParser?.addOption(this.row);
    }
    get choiceRow(): row {
      return this.valueInfo.isVirtual ? undefined : this.valueInfo.rows[0];
    }
    get choiceParser(): CellFormulaParser {
      return this.valueInfo.isVirtual ? undefined : CellFormulaParser.getParserForChecklistRow(this.translator,this.choiceRow);
    }
    get choiceOptions(): row[] {
      if (this.valueInfo.isVirtual) {
        return Object.keys(virtualItems[this.text].rowCounts).map(row => Number(row));
      } else {
        return this.choiceParser.getOptions();
      }
    }
    static readonly usage:string = `OPTION Usage:
OPTION [ChoiceID]

-[ChoiceID] is either an Item in the List, or a Unique Identifier for the Choice.

Each ChoiceID must have at least 2 Items that are OPTIONs associated with it, and only 1 can be Checked.
If ChoiceID refers to an Item in the List, Checking an OPTION will Check that Item.
OPTIONs can have additional Pre-Reqs in addition to what are inherited from the Choice's Item.

Example: Item "Yes" and Item "No" both have Pre-Req "OPTION Yes or No?"

NOTE: CHOICE is a deprecated alias for OPTION`;
    checkErrors():boolean {
      let hasError = false;
      if (this.choiceOptions.length < 2) {
        this.addError(`This is the only OPTION for Choice "${this.text}"\n\n${OptionFormulaNode.usage}`);
        hasError = true;
      }
      if (!this.valueInfo.isVirtual) {
        if (this.valueInfo.rows.length != 1) {
          this.addError(`"${this.text}" refers to ${this.valueInfo.rows.length} Items\n\n${OptionFormulaNode.usage}`);
          hasError = true;
        }
        hasError = super.checkErrors() || hasError;
      }
      return hasError;
    }

    toPreReqsMetFormula() {
      return this.valueInfo.isVirtual
        ? NOT(this.toPRUsedFormula()) 
        : AND(
          NOT(OR(...this.translator.rowsToA1Ranges(this.choiceOptions,COLUMN.CHECK))),
          CellFormulaParser.getParserForChecklistRow(this.translator,this.choiceRow).toRawPreReqsMetFormula()
        );
    }

    toPRUsedFormula():string {
      return this._determineFormula(
        OR(...this.translator.rowsToA1Ranges(this.choiceOptions,COLUMN.CHECK)),
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

    private _determineFormula(virtualChoiceFormula: string,...statuses: STATUS[]):string  {
      return this.valueInfo.isVirtual ? virtualChoiceFormula : this._getChoiceRowStatusFormula(...statuses);
    }

    private _getChoiceRowStatusFormula(...statuses: STATUS[]) {
      return OR(...statuses.map(status => EQ(this.translator.cellA1(this.choiceRow,COLUMN.STATUS),VALUE(status))));
    }

    getAllPossiblePreReqRows():ReadonlySet<row> {
      if (this.valueInfo.isVirtual) {
        return new Set<row>();
      } else {
        return super.getAllPossiblePreReqRows();
      }
    }

    getCircularDependencies(previous: row[]): ReadonlySet<row> {
      if (this.valueInfo.isVirtual) {
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
    static create(text:string, translator:StatusFormulaTranslator,row:row) {
      return new MissedFormulaNode(text,translator,row);
    }
    protected constructor(text:string, translator:StatusFormulaTranslator,row:row) {
      super(text,translator,row);
      this.formulaType = NOT;
      this.child = BooleanFormulaNode.create(this.text,this.translator,this.row);
    } 

    toMissedFormula():string {
      return this.child.toPreReqsMetFormula();
    }
    toRawMissedFormula():string {
      return this.child.toPreReqsMetFormula();
    }
    toPRUsedFormula():string {
      return VALUE.FALSE;
    }
    toUnknownFormula():string {
      return VALUE.FALSE;
    }
    isDirectlyMissable(): boolean {
      return true;
    }
  }

  class OptionalFormulaNode extends FormulaNode<boolean> {
    static create(text:string, translator:StatusFormulaTranslator,row:row) {
      return new OptionalFormulaNode(text,translator,row);
    } 
    constructor(text:string, translator:StatusFormulaTranslator,row:row) {
      super(text,translator,row);
      this.formulaType = NOT;
      this.child = BooleanFormulaNode.create(this.text,this.translator,this.row);
    }
    toMissedFormula():string {
      return VALUE.FALSE;
    }
    toRawMissedFormula():string {
      return VALUE.FALSE;
    }
    toPRUsedFormula():string {
      return this.child.toPreReqsMetFormula();
    }
    toUnknownFormula():string {
      return VALUE.FALSE;
    }
    isDirectlyMissable(): boolean {
      return true;
    }
  }

  class LinkedFormulaNode extends RootNode {
    private readonly linkedChildren: FormulaNode<boolean>[];
    private readonly unlinkedChildren: FormulaNode<boolean>[];
    constructor(unlinkedChildren:FormulaNode<boolean>[], linkedChildren:FormulaNode<boolean>[], translator:StatusFormulaTranslator,row:row) {
      super([...unlinkedChildren,...linkedChildren],translator,row);
      this.unlinkedChildren = unlinkedChildren;
      this.linkedChildren = linkedChildren;
    }
    isControlled():boolean {
      return true;
    }
    getControlledByInfos():sheetValueInfo[] {
      const itemValues:{[x:number]:sheetValueInfo[]} = this.translator.getColumnValues(COLUMN.ITEM).byRow;
      const preReqInfos:sheetValueInfo[] = [];
      this.getDirectPreReqRows().forEach(row => preReqInfos.push(...itemValues[row]));
      return preReqInfos;
    }
    checkErrors() {
      if (this.isInCircularDependency()) {
        this.addError("LINKED Cannot be in Pre-Req circular dependency");
        return true;
      } else {
        return super.checkErrors();
      }
    }
    toStatusFormula():string {
      const ifsArgs:string[] = [];
      const order: Array<[string,(()=>string)]> = [
        [STATUS.ERROR,      this.toErrorFormula],
        [STATUS.CHECKED,    this.toCheckedFormula],
        [STATUS.PR_USED,    this.toPRUsedFormula],
        [STATUS.MISSED,     this.toMissedFormula],
        [STATUS.AVAILABLE,  this.toPreReqsMetFormula],
        [STATUS.PR_NOT_MET, () => VALUE.TRUE],
      ];
      for (const [status,formulaFunction] of order) {
        const formula:string = formulaFunction.call(this);
        ifsArgs.push(formula,VALUE(status));
      }
      return IFS(...ifsArgs);
      
    }
    toControlledFormula():string {
      if (this.isInCircularDependency()) {
        this.addError("LINKED Cannot be in Pre-Req circular dependency");
        return VALUE.FALSE;
      }
      return AND(...this.children.map(child => (child as OptionFormulaNode).choiceRow ? CellFormulaParser.getParserForChecklistRow(child.translator,(child as OptionFormulaNode).choiceRow).toPreReqsMetFormula() : child.toPreReqsMetFormula()));
    }
    toPreReqsMetFormula(): string {
      if (this.isInCircularDependency()) {
        this.addError("LINKED Cannot be in Pre-Req circular dependency");
        return VALUE.FALSE;
      }
      const linkedAvailableFormulas = [];
      this.linkedChildren
        .map(linkedChild => linkedChild.getDirectPreReqRows())
        .reduce((rows:Set<number>,childRows) => {
          childRows.forEach(rows.add,rows);
          return rows;
        }, new Set<number>())
        .forEach(row => linkedAvailableFormulas.push(
          AND(
            CellFormulaParser.getParserForChecklistRow(this.translator,row).toPreReqsMetFormula(),
            NOT(this.translator.cellA1(row,COLUMN.CHECK))
          ))
        );
      const preReqIsAvailableFormula = OR(...linkedAvailableFormulas);
      if (this.unlinkedChildren.length > 0) {
        return AND(
          ...this.unlinkedChildren.map(child => child.toPreReqsMetFormula()),
          preReqIsAvailableFormula
        );
      } else {
        return preReqIsAvailableFormula;
      }
    }
  }

  class SameFormulaNode extends FormulaValueNode<boolean> {
    static create(text:string, translator:StatusFormulaTranslator,row:row) {
      return new SameFormulaNode(text,translator,row);
    }
    private sameRow:row
    private get sameRowParser():CellFormulaParser {return this.sameRow && CellFormulaParser.getParserForChecklistRow(this.translator,this.sameRow); }
    protected constructor(text:string, translator:StatusFormulaTranslator,row:row) {
      super(text,translator,row);
    }

    finalize() {
      super.finalize();
      this.sameRow = this.valueInfo.rows[0];
    }
    
    toPreReqsMetFormula() {
      return this.sameRowParser && this.sameRowParser.toPreReqsMetFormula();
    }

    toErrorFormula() {
      return this.sameRowParser && this.sameRowParser.toErrorFormula();
    }

    toMissedFormula() {
      return this.sameRowParser && this.sameRowParser.toMissedFormula();
    }

    toPRUsedFormula() {
      return this.sameRowParser && this.sameRowParser.toPRUsedFormula();
    }

    toRawMissedFormula() {
      return this.sameRowParser && this.sameRowParser.toRawMissedFormula();
    }

    toUnknownFormula() {
      return this.sameRowParser && this.sameRowParser.toUnknownFormula();
    }
    checkErrors() {
      if (super.checkErrors()) {
        return true;
      } else if (this.valueInfo.rows.length != 1) {
        this.addError("SAME must link to only 1 Item but an Item can have multiple SAME");
        return true;
      } else if ( this.valueInfo.numPossible > 1) {
        this.addError("Cannot use SAME with Numerical Equations");
        return true;
      }
      return false;
    }
  }
  class CheckedRootNode extends RootNode {
    toControlledFormula() {
      return VALUE.TRUE;
    }
    isControlled() {
      return true;
    }
  }
}