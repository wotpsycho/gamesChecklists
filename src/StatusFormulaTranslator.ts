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
  ValueNode,
  OptionFormulaNode,
  SameFormulaNode,
  virtualItems,
  CellFormulaParser,
  RootNode,
  CheckedRootNode,
  LinkedFormulaNode,
  UsesFormulaNode,
  MissedFormulaNode,
  OptionalFormulaNode,
  BlocksUntilFormulaNode,
  BlockedUntilFormulaNode,
  GeneratedBlockedUntilFormulaNode,
  type BlocksArgs,
  type BlockedArgs,
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
          const rowRanges = this.rowsToRanges(rows, COLUMN.ITEM);
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

