import { time, timeEnd } from './util';
import * as Formula from './Formulas';
import type { Checklist } from './ChecklistApp';
import { STATUS, COLUMN, getActiveChecklist, FINAL_ITEM_TYPE } from './ChecklistApp';
import {
  type Range,
  type RichTextValue,
  type column,
  type row,
  type FormulaHelper,
  type IStatusFormulaTranslator,
  type RowCounts,
  type sheetValueInfo,
  type columnValues,
  SPECIAL_PREFIXES,
  PHASE,
  USAGES,
  OR,
  AND,
  NOT,
  EQ,
  NE,
  GT,
  GTE,
  X_ITEMS,
  MULT,
  DIV,
  MINUS,
  ADD,
  FORMULA,
  VALUE,
  IFS,
  IF,
  COUNTIF,
  formulaTypeToString,
  getParenPlaceholder,
  getQuotePlaeholder,
  quoteRegExp,
  parenRegExp,
  quoteMapping,
  parentheticalMapping,
  PREFIX_REG_EXP,
  Node,
  FormulaNode,
  type NodeArgs,
  type NumberNode,
  BooleanFormulaNode,
  ComparisonFormulaNode,
  NumberFormulaNode,
  FormulaValueNode,
  BooleanFormulaValueNode,
  NumberFormulaValueNode,
} from './availability';

const numItemsPostfixRegExp = /^ *(.*?) +x(\d+) *$/;
const numItemsPrefixRegExp = /^ *(\d+)x +(.*?) *$/;
const getNumItemInfo = (text: string, _defaultNum: number = undefined): { num?: number; item: string } => {
  let match = text.match(numItemsPrefixRegExp);
  if (match) {
    return { num: Number(match[1]), item: match[2] };
  } else if ((match = text.match(numItemsPostfixRegExp))) {
    return { num: Number(match[2]), item: match[1] };
  } else if (_defaultNum || _defaultNum === 0) {
    return { num: _defaultNum, item: text };
  } else {
    return { item: text };
  }
};

export function getActiveChecklistTranslator(): StatusFormulaTranslator {
  return getTranslatorForChecklist(getActiveChecklist());
}

export function getTranslatorForChecklist(checklist: Checklist = getActiveChecklist()): StatusFormulaTranslator {
  return StatusFormulaTranslator.fromChecklist(checklist);
}

export function validateAndGenerateStatusFormulasForChecklist(checklist:Checklist = getActiveChecklist()): void {
  StatusFormulaTranslator.fromChecklist(checklist).validateAndGenerateStatusFormulas();
}

export function addLinksToPreReqs(checklist:Checklist = getActiveChecklist(), startRow = checklist.firstDataRow, endRow = checklist.lastRow): void{
  StatusFormulaTranslator.fromChecklist(checklist).addLinksToPreReqsInRange(startRow,endRow);
}

export class StatusFormulaTranslator implements IStatusFormulaTranslator {
    readonly checklist: Checklist;
    private requestId:string = Date.now().toString()
    private constructor(checklist: Checklist) {
      this.checklist = checklist;
      CacheService.getScriptCache().put("latestTranslatorRequestId",this.requestId);
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
      const rowRefRegExp = /(?:"\$(\d+)")|(?:\$(\d+))/g;
      let itemValues:columnValues = undefined;
      // Replace any $[row] with the actual row value
      for (let i:number = 0; i < preReqValues.length; i++) {
        if (preReqValues[i][0].toString().match(rowRefRegExp)) {
          itemValues = itemValues ?? this.getColumnValues(COLUMN.ITEM);
          preReqValues[i][0] = preReqValues[i][0].toString().replace(rowRefRegExp,(rowRef,rowA,rowB) =>
            itemValues.byRow[rowA || rowB].map((valueInfo: sheetValueInfo) => 
              valueInfo.value.match(/[*|)(]\n/) ? `"${valueInfo.value}"` : valueInfo.value
            ).join(" WITH ")
          );
          preReqRange.getCell(i+1,1).setValue(preReqValues[i][0]);
        }
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
          debugColumns[debugColumn].range = this.checklist.getColumnDataRange(this.checklist.columnsByHeader[debugColumn]);
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
              if (value?.toString().trim()) {
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

        const changedRows:{[x:number]:{value:string,cell:Range}} = {};
        time("setFormulasIndividual");
        // Reduce client-side recalculations by only setting formula if changed
        statusFormulas.forEach((statusFormula,i) => {
          if (statusFormula.length > 40000) console.warn(`Long Formula Row ${i+firstRow}: ${statusFormula.length}`);
          if (statusFormula !== existingStatusFormulas[i][0]) {
            statusDataRange.getCell(i + 1, 1).setFormula(statusFormula);
            changedRows[i+firstRow] = {value:preReqValues[i][0]?.toString(), cell: preReqRange.getCell(i+1,1)};
          }
        });
        timeEnd("setFormulasIndividual");

        time("determineUnderlineRows");
        const finalItems = this.getColumnValues(COLUMN.TYPE).byValue[FINAL_ITEM_TYPE];
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

        time("addLinks");
        this.addLinksToPreReqsInRows(changedRows);
        timeEnd("addLinks");
        timeEnd("writeValues");
      } else {
        Logger.log("Not updating statuses, other request has come in");
        return;
      }
      this.checklist.unmarkEdited();
      timeEnd("validateAndGenerateStatusFormulas");
    }

    /**
     * To prevent race conditions that are unavoidable when a User is editing directly, must get-modify-update range in a single operation
     */
    addLinksToPreReqsAll():void {
      this.addLinksToPreReqsInRange(this.checklist.firstDataRow,this.checklist.lastRow);
    }
    addLinksToPreReqsInRange(startRow:row,endRow:row):void {
      const label = this.addLinksToPreReqsInRange.name;
      time(`${label}`);
      try {
        if (startRow < this.checklist.firstDataRow) startRow = this.checklist.firstDataRow;
        if (endRow > this.checklist.lastRow) endRow = this.checklist.lastRow;
        if (startRow > endRow) return;
      
        const preReqRange = this.checklist.getColumnDataRange(COLUMN.PRE_REQS, startRow, endRow-startRow+1);
        timeEnd(`${label} getRange`);
        time(`${label} getValues`);
        const preReqValues = preReqRange.getValues();
        timeEnd(`${label} getValues`);
    
        time(`${label} determineRichText`);
        const preReqRichTexts:RichTextValue[] = preReqValues.map((preReqValue,i) => this.getRichTextForRow(i+startRow, preReqValue[0].toString()));
        timeEnd(`${label} determineRichText`);

        time(`${label} preReqTextStyle`);
        preReqRange.setTextStyle(SpreadsheetApp.newTextStyle()
          .setBold(false)
          .setItalic(false)
          .setUnderline(false)
          .setStrikethrough(false)
          .setForegroundColor("black")
          .build());
        timeEnd("preReqTextStyle");

        time(`${label} setRichText`);
        preReqRange.setRichTextValues(preReqRichTexts.map(richText => [richText]));
        timeEnd("setRichText");
        time(`${label} endFlush`);
        // this.checklist.flush();
        timeEnd(`${label} endFlush`);
      } finally {
        timeEnd(`${label}`);
      }
      // this.addLinksToPreReqsInRows(rows,true);
    }
    addLinksToPreReqsInRows(rowInfos:{[x:number]:{value:string,cell:Range}}):void{
      const label = this.addLinksToPreReqsInRows.name;
      time(`${label}`);
      try {
        // if (!rows.length) return;
        // time(`${label} flush`);
        // this.checklist.flush();
        // timeEnd(`${label} flush`);

        time(`${label} preReqTextStyle`);
        const textStyle = SpreadsheetApp.newTextStyle()
          .setBold(false)
          .setItalic(false)
          .setUnderline(false)
          .setStrikethrough(false)
          .setForegroundColor("black")
          .build();
        timeEnd("preReqTextStyle");
      
        time(`${label} determineAndWriteRichText`);
        Object.entries(rowInfos).forEach(([row,rowInfo]) => rowInfo.cell.setTextStyle(textStyle).setRichTextValue(this.getRichTextForRow(Number(row), rowInfo.value)));
        timeEnd(`${label} determineAndWriteRichText`);

        // time(`${label} endFlush`);
        // this.checklist.flush();
        // timeEnd(`${label} endFlush`);
      } finally {
        timeEnd(`${label}`);
      }
    }
    
    private getRichTextForRow(row:row, preReqValue:string = this.checklist.getValue(row,COLUMN.PRE_REQS).toString()):GoogleAppsScript.Spreadsheet.RichTextValue {
      const parser = this.parsers[row];
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
          }
        }
      });
      return richTextValue.build();
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
        value.toString().split(/\r?\n/).forEach(value => {
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
      const [hasStar,hasDot,hasBar] = [id.indexOf("*") >= 0, id.indexOf(".") >= 0, id.indexOf("|") >= 0];
      const rowIdMatch = id.match(/^\$(\d+)$/);
      let looksLikeRegExp = hasStar || hasDot || hasBar;
      if (_implicitPrefix && !hasStar && !hasBar && !rowIdMatch) {
        id += "*";
        looksLikeRegExp = true;
      }
      if (rowIdMatch) {
        addRows(columnInfo.byRow[rowIdMatch[1]]);
      } else if (columnInfo.byValue[id]) {
        addRows(columnInfo.byValue[id]);
      } else if (looksLikeRegExp) {
        const search:RegExp = RegExp("^(" + id.replace(/\*/g,".*") + ")$");
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

  export class CellFormulaParser {
    private static readonly parsers: {[x:number]: CellFormulaParser} = {};
    static getParserForChecklistRow(translator: IStatusFormulaTranslator,row:row,_defaultValue: string = undefined):CellFormulaParser {
      const key:string = `${translator.checklist.id}:${row}`;
      if (!this.parsers[key]) {
        this.parsers[key] = new CellFormulaParser(translator as StatusFormulaTranslator,row,_defaultValue);
      }
      return this.parsers[key];
    }
    private readonly row: row;
    private readonly rootNode: RootNode;
    readonly translator: StatusFormulaTranslator;
    readonly preReqText: string;
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
      let persistFlag: boolean = false;
      for (let j:number = 0; j < lines.length; j++) {
        let line:string = lines[j].trim();
        let isLinked = linkedFlag;
        if (!line) continue;

        if (line.trim().toUpperCase() == SPECIAL_PREFIXES.LINKED.toUpperCase()) {
          linkedFlag = true;
          continue;
        }
        if (line.trim().toUpperCase() == SPECIAL_PREFIXES.CHECKED || line.trim().toUpperCase() == SPECIAL_PREFIXES.INITIAL) {
          checkedFlag = true;
          continue;
        }
        if (line.trim().toUpperCase() == SPECIAL_PREFIXES.PERSIST) {
          persistFlag = true;
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
          const text:string = prefixCheck[2].trim();
          switch (prefixCheck[1].toUpperCase()) {
            case SPECIAL_PREFIXES.USES.toUpperCase():
              childFormulaNode = UsesFormulaNode.create({ text, translator: this.translator, row });
              break;
            case SPECIAL_PREFIXES.MISSED.toUpperCase():
              childFormulaNode = MissedFormulaNode.create({ text, translator: this.translator, row });
              break;
            case SPECIAL_PREFIXES.CHOICE.toUpperCase():
            case SPECIAL_PREFIXES.OPTION.toUpperCase():
              childFormulaNode = OptionFormulaNode.create({ text, translator: this.translator, row });
              break;
            case SPECIAL_PREFIXES.OPTIONAL.toUpperCase():
              childFormulaNode = OptionalFormulaNode.create({ text, translator: this.translator, row });
              break;
            case SPECIAL_PREFIXES.BLOCKS.toUpperCase():
              childFormulaNode = BlocksUntilFormulaNode.create({ text, translator: this.translator, row });
              break;
            case SPECIAL_PREFIXES.BLOCKED.toUpperCase():
              childFormulaNode = BlockedUntilFormulaNode.create({text, translator: this.translator, row});
              break;
            case SPECIAL_PREFIXES.LINKED.toUpperCase():
              isLinked = true;
              childFormulaNode = BooleanFormulaNode.create({ text, translator: this.translator, row });
              break;
          }
        } else {
          childFormulaNode = BooleanFormulaNode.create({ text: line, translator: this.translator, row });
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
      this.rootNode.persist = persistFlag;
    }

    /**
     * Mark as finalized so that no further changes are allowed
     */
    private finalized = false;
    finalize():CellFormulaParser {
      if (this.finalized) return this;
      this.checkPhase(PHASE.FINALIZING);
      this.rootNode.finalize();
      this.finalized = true;
      return this;
    }

    private isPhase(phase:PHASE) {
      return this.translator.phase == phase;
    }
    private checkPhase(...phases:PHASE[]) {
      if (!phases.reduce((isPhase,requiredPhase) => isPhase || this.isPhase(requiredPhase), false)) {
        throw new Error(`Invalid operation: Requires PHASE "${phases.join("\"|\"")}" but is "${this.translator.phase}" (Row ${this.row})`);
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
      this.checkPhase(PHASE.FINALIZING,PHASE.FINALIZED);
      this.finalize();
      const itemValues:{[x:number]:sheetValueInfo[]} = this.translator.getColumnValues(COLUMN.ITEM).byRow;
      return [...this.getAllPossiblePreReqRows()].map(row => itemValues[row].map(info => info.value)).flat();
    }

    getAllDirectlyMissablePreReqs():string[] {
      this.checkPhase(PHASE.FINALIZING,PHASE.FINALIZED);
      this.finalize();
      const allMissableRows:row[] = [...this.getAllPossiblePreReqRows()].filter(row => CellFormulaParser.getParserForChecklistRow(this.translator,row).isDirectlyMissable());
      const itemValues:{[x:number]:sheetValueInfo[]} = this.translator.getColumnValues(COLUMN.ITEM).byRow;
      return [...allMissableRows].map(row => itemValues[row].map(info => info.value)).flat().filter(value => value);
    }

    getDirectPreReqInfos() {
      this.checkPhase(PHASE.FINALIZED);
      return this.rootNode.getDirectPreReqInfos();
    }
    
    getDirectPreReqRows(): ReadonlySet<number> {
      this.checkPhase(PHASE.FINALIZING,PHASE.FINALIZED);
      this.finalize();
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
    
    addChild(child: FormulaNode<boolean>): void {
      this.checkPhase(PHASE.FINALIZING);
      this.rootNode.addChild(child);
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
      this.checkPhase(PHASE.FINALIZING,PHASE.FINALIZED);
      this.finalize();
      return this.rootNode.getAllPossiblePreReqRows();
    }

    isDirectlyMissable():boolean {
      this.checkPhase(PHASE.FINALIZING,PHASE.FINALIZED);
      this.finalize();
      return this.rootNode.isDirectlyMissable();
    }

    isInCircularDependency():boolean {
      this.checkPhase(PHASE.FINALIZING,PHASE.FINALIZED);
      this.finalize();
      return this.getCircularDependencies().has(this.row);
    }

    private _lockCircular: boolean;   
    private _circularDependencies: ReadonlySet<row>;
    private _isCircular: boolean;
    getCircularDependencies(previous = []): ReadonlySet<row> {
      this.checkPhase(PHASE.FINALIZING,PHASE.FINALIZED);
      this.finalize();
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

  // BooleanFormulaNode, ComparisonFormulaNode, NumberFormulaNode now imported from availability

  class RootNode extends BooleanFormulaNode {
    persist: boolean = false;
    constructor(children:FormulaNode<boolean>[], translator:IStatusFormulaTranslator,row:row) {
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
    addChild(child: FormulaNode<boolean>) {
      this.checkPhase(PHASE.FINALIZING);
      this.children.push(child);
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

    toUnknownFormula(): string {
      let unknownFormula = super.toUnknownFormula();
      if (unknownFormula != VALUE.FALSE) {
        // console.log("hasUnknown, row:%s, form:%s",this.row,unknownFormula);
      }
      return unknownFormula;
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



  export type virtualValueInfo = {
    rowCounts: RowCounts,
    numPossible?: number,
    numNeeded?: number;
  }

  // Virtual Items, require rowCounts and can override the numNeeded and numPossible
  // e.g. Virtual Choice has a numNeeded of 1, and rowCounts of {[optionRow]:1} for each OPTION
  export const virtualItems:{[x:string]: virtualValueInfo} = {};
  
  enum ValueNodeTypes {
    WITH="WITH",
    WITHOUT="WITHOUT",
    VALUE="VALUE",
  }
  const ValueNodeTypeRegExps:{[x in ValueNodeTypes]:RegExp} = {
    WITH: /^(?:(?<items>.+) +)?WITH +(?<filteredItems>.+?)$/,
    WITHOUT: /^(?:(?<items>.+) +)?(WITHOUT|UNLESS|EXCEPT) +(?<filteredItems>.+?)$/,
    VALUE: /^(?:(?<column>.*?[^\s])[!=])?(?<id>.*)$/,
  };
  const unescapeValue = (text:string):string => {
    if (typeof quoteMapping[text] == "string") {
      return quoteMapping[text];
    }
    let match:RegExpExecArray;
    while ((match = parenRegExp.exec(text))) {
      text = text.replace(match[0],`(${parentheticalMapping[match[0]]})`);
    }
    while ((match = quoteRegExp.exec(text))) {
      const content = quoteMapping[match[0]];
      text = text.replace(match[0],content === "" ? content : `"${content}"`);
    }
    return text?.trim();
  };

  export class ValueNode extends Node {
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
      this.checkPhase(PHASE.BUILDING,PHASE.FINALIZING);
      this.children[0] = child;
    }
    protected get filterChild(): ValueNode {
      return this.children[1];
    }
    protected set filterChild(child: ValueNode) {
      this.checkPhase(PHASE.BUILDING,PHASE.FINALIZING);
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
    static create({ text, translator, row, _implicitPrefix = false }: NodeArgs & { _implicitPrefix?: boolean; }) {
      return new ValueNode(text,translator,row,_implicitPrefix);
    }
    protected constructor(text:string, translator:IStatusFormulaTranslator,row:row,_implicitPrefix:boolean = false) {
      super(text,translator,row);
      let {items,filteredItems} = ValueNodeTypeRegExps.WITH.exec(this.text)?.groups || {};
      if (items || filteredItems) {
        this.type = ValueNodeTypes.WITH;
        this.itemsChild = new ValueNode(items ?? "*",this.translator,this.row,_implicitPrefix);
        this.filterChild = new ValueNode(filteredItems,this.translator,this.row);
        [this.column, this.id, this._rowCounts] = [this.itemsChild.column,this.itemsChild.id, {...this.itemsChild._rowCounts}];
        this.rows.forEach(row => {
          if (!this.filterChild._rowCounts[row]) {
            delete this._rowCounts[row];
          }
        });
      } else if (({items,filteredItems} = ValueNodeTypeRegExps.WITHOUT.exec(this.text)?.groups || {}),items || filteredItems) {
        this.type = ValueNodeTypes.WITHOUT;
        this.itemsChild = new ValueNode(items ?? "*",this.translator,this.row,_implicitPrefix);
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
      // if (row == 200) console.log("vn.con: text:%s, rowCounts:%s",text,Object.keys(this._rowCounts));
    }
    finalize():ValueNode {
      if (this.finalized) return this;
      super.finalize();
      if (!this.rows.length && virtualItems[this.text]) {
        Object.keys(virtualItems[this.text].rowCounts).forEach(row => this._rowCounts[row] = virtualItems[this.text].rowCounts[row]);
        this._isVirtual = true;
      }
      this.finalized = true;
      return this;
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

  type useInfo = RowCounts
  type usesInfo = {[x:string]: useInfo}
  const usesInfo:usesInfo = {}; // TODO make checklist-aware?
  class UsesFormulaNode extends BooleanFormulaValueNode {
    static create({ text, translator, row }: NodeArgs) {
      return new UsesFormulaNode(text,translator,row);
    }
    protected constructor(text:string, translator:IStatusFormulaTranslator,row:row) {
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
            this.availableChild.valueInfo.isVirtual ? virtualItems[this.availableChild.text].numNeeded.toString() : this.availableChild.toTotalFormula(),
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
    static create({ text, translator, row }: NodeArgs): FormulaValueNode<boolean> {
      return new OptionFormulaNode(text,translator,row);
    }
    protected constructor(text:string, translator:IStatusFormulaTranslator,row:row) {
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
    finalize():OptionFormulaNode {
      if (this.finalized) return this;
      super.finalize();
      this.choiceParser?.addOption(this.row);
      this.finalized = true;
      return this;
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
    checkErrors():boolean {
      let hasError = false;
      if (this.choiceOptions.length < 2) {
        this.addError(`This is the only OPTION for Choice "${this.text}"\n\n${USAGES[SPECIAL_PREFIXES.OPTION]}`);
        hasError = true;
      }
      if (!this.valueInfo.isVirtual) {
        if (this.valueInfo.rows.length != 1) {
          this.addError(`"${this.text}" refers to ${this.valueInfo.rows.length} Items\n\n${USAGES[SPECIAL_PREFIXES.OPTION]}`);
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
    static create({ text, translator, row }:NodeArgs) {
      return new MissedFormulaNode(text,translator,row);
    }
    protected constructor(text:string, translator:IStatusFormulaTranslator,row:row) {
      super(text,translator,row);
      this.formulaType = NOT;
      this.child = BooleanFormulaNode.create({ text: this.text, translator: this.translator, row: this.row });
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
    static create({ text, translator, row }: NodeArgs) {
      return new OptionalFormulaNode(text,translator,row);
    } 
    protected constructor(text:string, translator:IStatusFormulaTranslator,row:row) {
      super(text,translator,row);
      this.formulaType = NOT;
      this.child = BooleanFormulaNode.create({ text: this.text, translator: this.translator, row: this.row });
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
    constructor(unlinkedChildren:FormulaNode<boolean>[], linkedChildren:FormulaNode<boolean>[], translator:IStatusFormulaTranslator,row:row) {
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

  export class SameFormulaNode extends FormulaValueNode<boolean> {
    static create({ text, translator, row }: NodeArgs) {
      return new SameFormulaNode(text,translator,row);
    }
    private sameRow:row
    private get sameRowParser():CellFormulaParser {return this.sameRow && CellFormulaParser.getParserForChecklistRow(this.translator,this.sameRow); }
    protected constructor(text:string, translator:IStatusFormulaTranslator,row:row) {
      super(text,translator,row);
    }

    finalize():SameFormulaNode {
      if (this.finalized) return this;
      super.finalize();
      this.sameRow = this.valueInfo.rows[0];
      this.finalized = true;
      return this;
    }
    
    toPreReqsMetFormula() {
      return OR(this.translator.cellA1(this.sameRow,COLUMN.CHECK), this.sameRowParser?.toPreReqsMetFormula() || "");
    }

    toErrorFormula() {
      return this.sameRowParser?.toErrorFormula() || VALUE.TRUE;
    }

    toMissedFormula() {
      return this.sameRowParser?.toMissedFormula() || "";
    }

    toPRUsedFormula() {
      return this.sameRowParser?.toPRUsedFormula() || "";
    }

    toRawMissedFormula() {
      return this.sameRowParser?.toRawMissedFormula() || "";
    }

    toUnknownFormula() {
      return this.sameRowParser?.toUnknownFormula() || "";
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

  const untilRegExp = /^(?:(.*?) +)?UNTIL +(.*?)$/;
  type BlocksArgs = {
    text?:string,
    blocksText?: string,
    untilText?: string,
    translator: IStatusFormulaTranslator;
    row: row,
  };
  class BlocksUntilFormulaNode extends FormulaValueNode<boolean> {
    static create({ text, blocksText, untilText, translator, row }: BlocksArgs) {
      const match = text?.match(untilRegExp) || [];
      return new BlocksUntilFormulaNode(blocksText || match[1] || "*", untilText || match[2],translator,row);
    }

    protected get parser(): CellFormulaParser {
      return CellFormulaParser.getParserForChecklistRow(this.translator, this.row);
    }

    protected constructor(blocksText:string, untilText:string, translator:IStatusFormulaTranslator, row:row) {
      super(blocksText ?? "*",translator,row);
      if (!untilText) {
        this.addError("Missing UNTIL clause of BLOCKS");
      } else {
        this.child = BooleanFormulaNode.create({ text:untilText, translator: this.translator, row: this.row });
      }
    }
    finalize():BlocksUntilFormulaNode {
      if (this.finalized) return this;
      super.finalize();
      if (!this.hasErrors()) {
        time("blocksFinalize");
        const untilPreReqRows = this.child.getAllPossiblePreReqRows();
        // console.log("finalizeBlock row:%s, text:'%s', child.text: %s, untilPreReqRows:[%s], rows:[%s]", this.row, this.text, this.child.text, [...untilPreReqRows].join(","), [...this.getDirectPreReqRows()].join(","))
        this.valueInfo.rows // All rows matching the BLOCKS clause
          .filter(blockedRow => !untilPreReqRows.has(blockedRow)) // Don't block any preReq of UNTIL
          .forEach(blockedRow => 
            CellFormulaParser.getParserForChecklistRow(this.translator,blockedRow).addChild(
              GeneratedBlockedUntilFormulaNode.create({ blockedText: `$${this.row}`, untilText: this.child.text, translator: this.translator, row: blockedRow, calculated:true }).finalize()
            )
          );
        timeEnd("blocksFinalize");
      }
      this.finalized = true;
      return this;
    }
    getAllPossiblePreReqRows():Set<row>{
      return new Set<row>();
    }
    getDirectPreReqRows():Set<row>{
      return new Set<row>();
    }
    getCircularDependencies():Set<row>{
      return new Set<row>();
    }
    toPreReqsMetFormula(): string {
      return VALUE.TRUE;
    }
    toPRUsedFormula(): string {
      return VALUE.FALSE;
    }
    toRawMissedFormula(): string {
      return VALUE.FALSE;
    }
    toMissedFormula(): string {
      return VALUE.FALSE;
    }
    toUnknownFormula(): string {
      return VALUE.FALSE;
    }
    checkErrors() {
      if (super.checkErrors() || !this.child) {
        return true;
      } else if (!this.child.getAllPossiblePreReqRows().has(this.row)){
        this.addError("UNTIL clause must depend on this Item");
        console.error("UNTIL Clause Depends:: row: %s, childPreReqRows: [%s], child.loop:%s", this.row, [...this.child.getAllPossiblePreReqRows()].join(","),this.child.isInCircularDependency())
        return true;
      } else {
        // console.log("blocksUntil.checkErrors:checking missables")
        const preReqRows = this.parser.getAllPossiblePreReqRows();
        const childPreReqRows = this.child.getAllPossiblePreReqRows();
        const possiblyMissableRows = [...childPreReqRows].filter(row => !preReqRows.has(row) && CellFormulaParser.getParserForChecklistRow(this.translator,row).isDirectlyMissable());
        if (possiblyMissableRows.length) {
          const itemsByRow = this.translator.getColumnValues(COLUMN.ITEM).byRow;
          this.addError("UNTIL clause cannot be missible; remove Pre-Req dependencies on these Items: " + 
            possiblyMissableRows.map<string[]>(row => 
              itemsByRow[row].map<string>(valueInfo => 
                `${valueInfo.value} (Row ${row})`
              )
            ).flat().join("\n")
          );
        }
      }
    }
  }

  type BlockedArgs = {
    text?: string,
    blockedText?: string,
    untilText?: string,
    translator: IStatusFormulaTranslator;
    row: row,
    calculated?:boolean,
  };
  class BlockedUntilFormulaNode extends FormulaNode<boolean> {
    static create({ text, blockedText, untilText, translator, row}: BlockedArgs) {
      const match = text?.match(untilRegExp) || [];
      return new BlockedUntilFormulaNode(blockedText || match[1],untilText || match[2],translator,row);
    }
    constructor(blockedText:string, untilText:string, translator:IStatusFormulaTranslator, row:row) {
      super(`!(${blockedText}) || (${untilText})`,translator,row);
      this.children[0] = BooleanFormulaNode.create({text:blockedText,translator:this.translator,row:this.row});
      this.children[1] = BooleanFormulaNode.create({text:untilText,translator:this.translator,row:this.row});
      this.formulaType = AND;
    }

    protected get blockedChild() {
      return this.children[0];
    }
    protected set blockedChild(child) {
      this.children[0] = child;
    }
    protected get untilChild() {
      return this.children[1];
    }
    protected set untilChild(child) {
      this.children[1] = child;
    }

    toPreReqsMetFormula():string {
      return OR(
        NOT(this.blockedChild.toPreReqsMetFormula()),
        this.untilChild.toPreReqsMetFormula()
      );
    }

    toPRUsedFormula(): string {
      return AND(this.blockedChild.toPreReqsMetFormula(), this.untilChild.toPRUsedFormula());
    }
    toRawMissedFormula(): string {
      return AND(this.blockedChild.toPreReqsMetFormula(), this.untilChild.toRawMissedFormula());
    }
    toMissedFormula(): string {
      return AND(this.blockedChild.toPreReqsMetFormula(), this.untilChild.toMissedFormula());
    }
    toUnknownFormula(): string {
      return AND(this.blockedChild.toPreReqsMetFormula(), this.untilChild.toUnknownFormula());
    }
  }
  class GeneratedBlockedUntilFormulaNode extends BlockedUntilFormulaNode {
    static create({ blockedText, untilText, translator, row}: BlockedArgs):GeneratedBlockedUntilFormulaNode {
      return new GeneratedBlockedUntilFormulaNode(blockedText,untilText,translator,row);
    }

    protected get parser(): CellFormulaParser {
      return CellFormulaParser.getParserForChecklistRow(this.translator, this.row);
    }

    constructor(blockedText:string, untilText:string, translator:IStatusFormulaTranslator, row:row) {
      super(blockedText,untilText,translator,row);
    }
    finalize():GeneratedBlockedUntilFormulaNode {
      super.finalize();
      return this;
    }

    toPreReqsMetFormula():string {
      // Since controlled isn't known until post-FINALIZED, have to do check here
      return this.parser.isControlled() ? VALUE.TRUE : super.toPreReqsMetFormula();
    }

    toPRUsedFormula(): string {
      // Since controlled isn't known until post-FINALIZED, have to do check here
      return this.parser.isControlled() ? VALUE.FALSE : super.toPRUsedFormula();
    }
    toRawMissedFormula(): string {
      // Since controlled isn't known until post-FINALIZED, have to do check here
      return this.parser.isControlled() ? VALUE.FALSE : super.toRawMissedFormula();
    }
    toMissedFormula(): string {
      // Since controlled isn't known until post-FINALIZED, have to do check here
      return this.parser.isControlled() ? VALUE.FALSE : super.toMissedFormula();
    }
    toUnknownFormula(): string {
      // Since controlled isn't known until post-FINALIZED, have to do check here
      return this.parser.isControlled() ? VALUE.FALSE : super.toUnknownFormula();
    }
    getAllPossiblePreReqRows(): ReadonlySet<number> {
        return new Set();
    }
    getDirectPreReqRows():ReadonlySet<number> {
      return new Set();
    }
  }