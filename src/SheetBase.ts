/* exported ChecklistApp */
namespace ChecklistApp {
  
  export type Sheet = GoogleAppsScript.Spreadsheet.Sheet;
  export type Range = GoogleAppsScript.Spreadsheet.Range;
  export type RichTextValue = GoogleAppsScript.Spreadsheet.RichTextValue;
  export type Filter = GoogleAppsScript.Spreadsheet.Filter;
  export type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;

  type column = number|string;
  type row = number|string;
  type stringMap = {[x:string]:string};
  type stringToNumberMap = {[x:string]:number}
  type columnMap = stringToNumberMap;
  type rowMap = stringToNumberMap;
  export type sheetValue = string|number|boolean|undefined|null;
  export class SheetBase {
    readonly sheet:Sheet;
    private readonly namedColumnHeaders:stringMap;
    private readonly namedRowHeaders:stringMap;
    static readonly ChecklistSheetError = class ChecklistSheetError extends Error{}

    constructor(sheet:Sheet,_namedColumnHeaders:stringMap = undefined, _namedRowHeaders:stringMap = undefined) {
      this.sheet = sheet;
      this.namedColumnHeaders = _namedColumnHeaders;
      this.namedRowHeaders = _namedRowHeaders;
    }

    get spreadsheet():Spreadsheet {
      return this.sheet.getParent();
    }

    get filter():Filter {
      time("getFilter");
      const filter = this.sheet.getFilter();
      timeEnd("getFilter");
      return filter;
    }

    get name():string {
      return this.sheet.getName();
    }

    set name(newName:string) {
      this.sheet.setName(newName);
    }

    private _sheetId: number
    get sheetId(): number {
      return this._sheetId || (this._sheetId = this.sheet.getSheetId());
    }

    private _headerRow:number
    get headerRow():number {
      if (!this._headerRow) {
        const header:number = (this.filter && this.filter.getRange().getRow()) || this.sheet.getFrozenRows() || 1;
        this._headerRow = header;
      } 
      return this._headerRow;
    }

    get firstDataRow():number {
      return this.headerRow && (this.headerRow + 1);
    }

    get lastColumn():number {
      time("lc");
      const lastColumn = this.sheet.getLastColumn();
      timeEnd("lc");
      return lastColumn;
    }

    get lastRow():number {
      return this.sheet.getLastRow();
    }

    get maxRows():number {
      return this.sheet.getMaxRows();
    }

    get maxColumns():number {
      return this.sheet.getMaxColumns();
    }

    get namedColumns():string[] {
      return this.namedColumnHeaders && Object.keys(this.namedColumnHeaders) || [];
    }

    get namedRows():string[] {
      return this.namedRowHeaders && Object.keys(this.namedRowHeaders) || [];
    }

    private _rows:rowMap
    protected get rows():rowMap {
      if (!this._rows) {
        time("get rows");
        this._rows = {};
        if (this.namedRows.length) {
          const rowHeaders:sheetValue[] = this.getColumnValues(1,1,Math.max(this.headerRow,this.namedRows.length));
          rowHeaders.forEach((rowHeader,i) => {
            const row:row = i+1;
            let rowId:string;
            Object.entries(this.namedRowHeaders).forEach(([namedRowId,namedRowHeader]) => {
              if (rowHeader == namedRowHeader) {
                rowId = namedRowId;
              }
            });
            if (rowId) this._rows[rowId] = row;
          });
        }
        timeEnd("get rows");
      }
      return {...this._rows};
    }

    private _columns:columnMap
    protected get columns():columnMap {
      return this.namedColumns.length > 0 ? 
        Object.entries(this.namedColumnHeaders).reduce((columns,[columnId,columnHeader]) => 
          ({
            ...columns,
            ...{[columnId]: this.columnsByHeader[columnHeader]},
          })
        ,{}) :
        {};
    }

    private _columnsByHeader:columnMap
    get columnsByHeader():columnMap {
      return Object.assign({}, this._columnsByHeader || (this._columnsByHeader = 
        this.getRowValues(this.headerRow).reduce((columnsByHeader,header,i) =>
          ({
            ...columnsByHeader,
            ...(header ? {[header.toString()]: i+1} : {}),

          })
        ,{})
      ));
    }

    get editable():boolean {
      return !this.sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
    }
    set editable(isEditable:boolean) {
      if (!this.editable && isEditable) {
        const protection = this.sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
        protection.remove();
      } else if (this.editable && !isEditable) {
        const protection = this.sheet.protect();
        protection.setWarningOnly(true);
      }
    }
    // UI Section
    activate():void {
      ChecklistApp.setActiveSheet(this.sheet);
    }

    toast(message:string, _titleOrSeconds:string|number = undefined, _seconds:number = undefined):void {
      let title:string, seconds:number;
      if (Number(_titleOrSeconds)) { // 0 seconds not valid so truthy check OK
        seconds = _titleOrSeconds as number;
      } else {
        [title,seconds] = [_titleOrSeconds as string,_seconds];
      }
      this.spreadsheet.toast(message,title,seconds);
    }
    // END UI SECTION

    private _checkRow(row:row,_allowMissingRow:boolean = false) :number {
      let rowIndex:number;
      if (!Number(row)) {
        if (!this.rows[row]) {
          if (_allowMissingRow && this.namedRows.includes(row as string)) {
            return undefined;
          } else {
            throw new SheetBase.ChecklistSheetError("Invalid row:" + row);
          } 
        }
        rowIndex = this.rows[row];
      } else {
        rowIndex = row as number;
      }
      return rowIndex;
    }

    private _checkColumn(column:column, _allowMissingColumn:boolean = false):number {
      let columnIndex:number;
      if (!Number(column)) {
        if (!this.columns[column] && !this.columnsByHeader[column]) {
          if (_allowMissingColumn) {
            return undefined;
          } else {
            throw new SheetBase.ChecklistSheetError("Invalid column:" + column);
          }
        }
        columnIndex = this.columns[column] || this.columnsByHeader[column];
      } else {
        columnIndex = column as number;
      }
      return columnIndex;
    }

    toRowIndex(row:row):number {
      return this._checkRow(row);
    }

    toColumnIndex (column:column):number {
      return this._checkColumn(column);
    }

    hasRow(...rows:row[]):boolean {
      if (rows.length == 0) throw new SheetBase.ChecklistSheetError("Missing row");
      for (const row of rows) {
        if (this._checkRow(row,true) == undefined) {
          return false;
        }
      }
      return true;
    }

    hasColumn(...columns:column[]):boolean {
      if (columns.length == 0) throw new SheetBase.ChecklistSheetError("Missing column");
      for (const column of columns) {
        if (this._checkColumn(column,true) == undefined) {
          return false;
        }
      }
      return true;
    }

    private readonly rangeCache:{[x:string]: Range} = {}
    getRange = (row:row|string, column:column = undefined, _numRows:number = 1, _numColumns:number = 1):Range => 
      row && !column ? 
        this.sheet.getRange(row as string) :
        this.sheet.getRange(this.toRowIndex(row), this.toColumnIndex(column), _numRows, _numColumns)

    getUnboundedRange = (row:row, column:column, endRow:row, endColumn:column):Range =>
      // R1C1 unbounded column/row range results in Rn:Rm/Cn:Cm which is interpreted as A1. Use existing A1 formula translator instead
      this.getRange(Formula.A1(
        row       && this.toRowIndex(   row), 
        column    && this.toColumnIndex(column), 
        endRow    && this.toRowIndex(   endRow), 
        endColumn && this.toColumnIndex(endColumn)
      ))

    getValues = (row:row, column:column, _numRows:number = 1, _numColumns:number = 1):sheetValue[][] =>
      this.getRange(row, column, _numRows, _numColumns).getValues();
    

    getValue = (row:row, column:column):sheetValue => 
      this.getRange(row,column).getValue()

    setValues= (row:row, column:column, values:sheetValue[][]):Range =>
      this.getRange(row, column, values.length, values[0].length).setValues(values)

    setValue = (row:row, column:column, value:sheetValue):Range =>
      this.setValues(row,column,[[value]])

    getColumnRange = (column:column, _startRow:row = 1, _numRows:number = undefined):Range =>
      _numRows > 0 ? this.getRange(_startRow, column, _numRows, 1) : this.getUnboundedColumnRange(column,_startRow)

    getUnboundedColumnRange = (column:column, _startRow:row = null):Range =>
      this.getUnboundedRange(_startRow,column,undefined,column)

    getColumnValues = (column:column, _startRow:row, _numRows:number):sheetValue[] =>
      this.getColumnRange(_startRow, column, _numRows).getValues().map(row => row[0]);
    

    setColumnValues = (column:column, values:sheetValue[], _startRow:row = 1):Range =>
      this.setValues(_startRow, column, values.map((rowValue:sheetValue) => [rowValue]));
    

    getColumnDataRange = (column:column, _startRow:row = this.firstDataRow, _numRows:number = undefined):Range =>
      _numRows > 0 ? this.getColumnRange(column, _startRow, _numRows) : this.getUnboundedColumnDataRange(column,_startRow);

    getColumnDataValues = (column:column, _startRow:row  = this.firstDataRow, _numRows:number = undefined):sheetValue[] => 
      this.getColumnDataRange(column, _startRow, _numRows).getValues().map(row => row[0]);

    getColumnDataRichTextValues = (column:column, _startRow:row  = this.firstDataRow, _numRows:number = undefined):RichTextValue[] => 
      this.getColumnDataRange(column, _startRow, _numRows).getRichTextValues().map(row => row[0]);

    getColumnDataFormulas = (column:column, _startRow:row  = this.firstDataRow, _numRows:number = undefined):string[] => 
      this.getColumnDataRange(column, _startRow, _numRows).getFormulas().map(row => row[0]);
    

    // getColumnDataRangeFromRange(column:column, range:Range):Range {
    //   const firstRow = Math.max(this.firstDataRow, (range && range.getRow()) || 0);
    //   const lastRow = Math.min(this.lastRow, (range && range.getLastRow()) || this.lastRow);
    //   if (firstRow > lastRow) return;
    //   return this.getColumnDataRange(column,firstRow, lastRow-firstRow+1);
    // }

    getUnboundedColumnDataRange = (column:column, _startRow:row = this.firstDataRow):Range =>
      this.getUnboundedRange(_startRow,column,null,column)

    setColumnDataValues = (column:column, values:sheetValue[], _startRow:row = this.firstDataRow):Range => 
      this.setColumnValues(column, values, _startRow);    

    getRowRange = (row:row, _startColumn:column = 1, _numColumns:number = undefined):Range => 
      _numColumns > 0 ? this.getRange(row, _startColumn, 1, _numColumns) : this.getUnboundedRowRange(row,_startColumn)

    getUnboundedRowRange = (row:row, _startColumn:column = null):Range => 
      this.getUnboundedRange(row,_startColumn,row,null)

    getRowValues = (row:row, _startColumn:column = 1, _numColumns:number = undefined):sheetValue[] => 
      (_numColumns > 0 ? this.getRowRange(row,_startColumn,_numColumns) : this.getUnboundedRowRange(row,_startColumn)).getValues()[0]

    setRowValues = (row:row, values:sheetValue[], _startColumn:column = 1):Range => 
      this.setValues(row, _startColumn, [values])

    isColumnInRange(column:column|column[], range:Range):boolean {
      if (!column || !range) return false;
      const columns:column[] = Array.isArray(column) ? column : [column];
      for (let col of columns) {
        col = this._checkColumn(col,true);
        if (!col) return false;
        if (col >= range.getColumn() && col <= range.getLastColumn()) {
          return true;
        }
      }
      return false;
    }

    isRowInRange(row:row|row[], range:Range):boolean {
      if (!row || !range) return false;
      const rows:row[] = Array.isArray(row) ? row : [row];
      for (let rw of rows) {
        rw = this._checkRow(rw,true);
        if (!rw) return false;
        if (rw >= range.getRow() && rw <= range.getLastRow()) {
          return true;
        }
      }
      return false;
    }

    insertColumn(columnIndex:number):void {
      const wasEditable = this.editable;
      if (!wasEditable) this.editable = true;
      if (columnIndex <= this.maxColumns) {
        if (columnIndex > this.lastColumn) return; // is an empty column already since it is after last and before max
        this.sheet.insertColumnBefore(columnIndex);
      } else {
        columnIndex = this.lastColumn+1;
        this.sheet.insertColumnAfter(this.lastColumn);
      }
      Object.keys(this._columns).forEach(_columnType => {
        if (this._columns[_columnType] >= columnIndex) {
          this._columns[_columnType]++;
        }
      });
      Object.keys(this._columnsByHeader).forEach(_columnType => {
        if (this._columnsByHeader[_columnType] >= columnIndex) {
          this._columnsByHeader[_columnType]++;
        }
      });
      if (!wasEditable) this.editable = false;
    }

    ensureColumn(columnType:column, columnIndex:number = this.lastColumn+1):void {
      if (!this.hasColumn(columnType)) {
        columnIndex = this._checkColumn(columnIndex,true) || this.lastColumn;
        this.insertColumn(columnIndex);
        if (this.namedColumnHeaders[columnType]) {
          this.setValue(this.headerRow,columnIndex,this.namedColumnHeaders[columnType]);
        }
        this._columns[columnType] = columnIndex;
      }
    }

    protected _determineLastNamedColumn = (...columnTypes:column[]):number => 
      (columnTypes.length > 0 ? columnTypes : this.namedColumns).reduce<number>((lastColumn,columnType) => Math.max(lastColumn,this._checkColumn(columnType,true) || 0),0);    

    hideColumn(...columnTypes:column[]):void {
      columnTypes.forEach(columnType => {
        const columnIndex = this.toColumnIndex(columnType);
        if (columnIndex) {
          this.sheet.hideColumns(columnIndex);
        }
      });
    }

    insertRow(rowIndex:number):void {
      const wasEditable = this.editable;
      if (!wasEditable) this.editable = true;
      if (rowIndex <= this.maxRows) {
        if (rowIndex > this.lastRow) return; // is already a blank row
        this.sheet.insertRowBefore(rowIndex);
      } else {
        rowIndex = this.lastRow+1;
        this.sheet.insertRowAfter(this.lastRow);
      }
      Object.keys(this._rows).forEach(_rowType => {
        if (this._rows[_rowType] >= rowIndex) {
          this._rows[_rowType]++;
        }
      });
      if (!wasEditable) this.editable = false;
    }

    ensureRow(rowType:row, rowIndex:number = this.headerRow):void {
      if (!this.hasRow(rowType)) {
        rowIndex = this._checkRow(rowIndex,true) || this.lastRow;
        this.insertRow(rowIndex);
        if (this.namedRowHeaders[rowType]) {
          this.setValue(rowIndex,1,this.namedRowHeaders[rowType]);
        }
        this._rows[rowType] = rowIndex;
      }
    }

    protected _removeRow(row:row):void {
      const wasEditable = this.editable;
      if (!wasEditable) this.editable = true;
      const rowIndex = this.toRowIndex(row);
      this.sheet.deleteRow(rowIndex);
      delete this._rows[row];
      Object.keys(this._rows).forEach(_rowType => {
        if (this._rows[_rowType] > rowIndex) {
          this._rows[_rowType]--;
        }
      });
      if (!wasEditable) this.editable = false;
    }

    protected _determineLastNamedRow = (...rowTypes:row[]):number =>
      (rowTypes.length > 0 ? rowTypes : this.namedRows).reduce<number>((lastRow,rowType) => Math.max(lastRow,this._checkRow(rowType,true)||0),0)

    expandAll():void {
      if (this.lastRow > 1) {
        this.sheet.showRows(1,this.lastRow);
      }
      if (this.lastColumn > 1) {
        this.sheet.showColumns(1,this.lastColumn);
      }
    }

    flush():void {
      SpreadsheetApp.flush();
    }
  }
}