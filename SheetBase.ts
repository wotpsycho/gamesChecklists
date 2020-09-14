/* exported SheetBase */
// eslint-disable-next-line no-redeclare
import Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;
import Sheet = GoogleAppsScript.Spreadsheet.Sheet;
import Range = GoogleAppsScript.Spreadsheet.Range;
import Filter = GoogleAppsScript.Spreadsheet.Filter;
import EditEvent = GoogleAppsScript.Events.SheetsOnEdit;
const SheetBase = (()=>{
  type column = number|string;
  type row = number|string;
  type stringMap = {[x:string]:string};
  type stringToNumberMap = {[x:string]: number}
  type columnMap = stringToNumberMap;
  type rowMap = stringToNumberMap;
  type sheetValue = string|number|boolean|undefined|null;
  class SheetBase {
    readonly sheet: Sheet;
    private readonly namedColumnHeaders: stringMap;
    private readonly namedRowHeaders: stringMap;
    static readonly ChecklistSheetError = class ChecklistSheetError extends Error{}

    constructor(sheet: Sheet,_namedColumnHeaders: stringMap = undefined, _namedRowHeaders: stringMap = undefined) {
      this.sheet = sheet;
      this.namedColumnHeaders = _namedColumnHeaders;
      this.namedRowHeaders = _namedRowHeaders;
    }

    get spreadsheet(): Spreadsheet {
      return this.sheet.getParent();
    }

    get filter(): Filter {
      return this.sheet.getFilter();
    }

    get name(): string {
      return this.sheet.getName();
    }

    set name(newName: string) {
      this.sheet.setName(newName);
    }

    get sheetId(): number {
      return this.sheet.getSheetId();
    }

    private _headerRow: number
    get headerRow() {
      if (!this._headerRow) {
        const header = (this.filter && this.filter.getRange().getRow()) || this.sheet.getFrozenRows() || 1;
        this._headerRow = header;
      } 
      return this._headerRow;
    }

    get firstDataRow(): number {
      return this.headerRow && (this.headerRow + 1);
    }

    get lastColumn(): number {
      return this.sheet.getLastColumn();
    }

    get lastRow(): number {
      return this.sheet.getLastRow();
    }

    get maxRows(): number {
      return this.sheet.getMaxRows();
    }

    get maxColumns(): number {
      return this.sheet.getMaxColumns();
    }

    get namedColumns(): string[] {
      return this.namedColumnHeaders && Object.keys(this.namedColumnHeaders) || [];
    }

    get namedRows(): string[] {
      return this.namedRowHeaders && Object.keys(this.namedRowHeaders) || [];
    }

    private _rows: rowMap
    get rows(): rowMap {
      if (!this._rows) {
        time("get rows");
        Object.defineProperty(this,"_rows", {value: {}});
        if (this.namedRows.length) {
          const rowHeaders = this.getColumnValues(1,1,Math.max(this.headerRow,this.namedRows.length));
          rowHeaders.forEach((rowHeader,i) => {
            const row = i+1;
            let rowId: string;
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

    private _columns: columnMap
    get columns(): columnMap {
      if (!this._columns) {
        time("get columns");
        this._columns = {};
        if (this.namedColumns.length) {
          Object.entries(this.namedColumnHeaders).forEach(([columnId, columnHeader]) => {
            const column = this.columnsByHeader[columnHeader];
            if (column) {
              this._columns[columnId] = column;
            }
          });
        }
        timeEnd("get columns");
      }
      return {...this._columns};
    }

    private _columnsByHeader: columnMap
    get columnsByHeader() {
      if (!this._columnsByHeader) {
        this._columnsByHeader = {};
        const columnHeaders = this.getRowValues(this.headerRow);
        columnHeaders.forEach((header, i) => {
          if (!header) return;
          const column = i + 1;
          this._columnsByHeader[header as string] = column;
        });
      }
      return {...this._columnsByHeader};
    }

    get editable(): boolean {
      return !this.sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
    }
    set editable(isEditable: boolean) {
      if (!this.editable && isEditable) {
        const protection = this.sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
        protection.remove();
      } else if (this.editable && !isEditable) {
        const protection = this.sheet.protect();
        protection.setWarningOnly(true);
      }
    }
    // UI Section
    activate(): void {
      ChecklistApp.setActiveSheet(this.sheet);
    }

    toast(message: string, _titleOrSeconds: string|number, _seconds: number = undefined): void {
      let title: string, seconds: number;
      if (Number(_titleOrSeconds)) { // 0 seconds not valid so truthy check OK
        seconds = _titleOrSeconds as number;
      } else {
        [title,seconds] = [_titleOrSeconds as string,_seconds];
      }
      this.spreadsheet.toast(message,title,seconds);
    }
    // END UI SECTION

    _checkRow(row: row,_allowMissingRow: boolean = false) : number {
      let rowIndex: number;
      if (!Number(row)) {
        if (!this.rows[row]) {
          if (_allowMissingRow && this.namedRows.includes(row as string)) {
            return undefined;
          } else {
            throw new SheetBase.ChecklistSheetError("Invalid row: " + row);
          } 
        }
        rowIndex = this.rows[row];
      } else {
        rowIndex = row as number;
      }
      return rowIndex;
    }

    _checkColumn(column: column, _allowMissingColumn: boolean = false): number {
      let columnIndex: number;
      if (!Number(column)) {
        if (!this.columns[column] && !this.columnsByHeader[column]) {
          if (_allowMissingColumn && this.namedColumns.includes(column as string)) {
            return undefined;
          } else {
            throw new SheetBase.ChecklistSheetError("Invalid column: " + column);
          }
        }
        columnIndex = this.columns[column] || this.columnsByHeader[column];
      } else {
        columnIndex = column as number;
      }
      return columnIndex;
    }

    toRowIndex(row: row): number {
      return this._checkRow(row);
    }

    toColumnIndex (column: column): number {
      return this._checkColumn(column);
    }

    hasRow(...rows: row[]): boolean {
      if (rows.length == 0) throw new SheetBase.ChecklistSheetError("Missing row");
      for (const row of rows) {
        if (this._checkRow(row,true) == undefined) {
          return false;
        }
      }
      return true;
    }

    hasColumn(...columns: column[]): boolean {
      if (columns.length == 0) throw new SheetBase.ChecklistSheetError("Missing column");
      for (const column of columns) {
        if (this._checkColumn(column,true) == undefined) {
          return false;
        }
      }
      return true;
    }

    getRange(row: row|string, column: column = undefined, _numRows: number = 1, _numColumns: number = 1): Range {
      if (row && !column) {
        // This is the case of A1/R1C1 notation
        return this.sheet.getRange(row as string);
      }
      return this.sheet.getRange(this.toRowIndex(row),this.toColumnIndex(column),_numRows,_numColumns);
    }

    getUnboundedRange(row: row, column: column, endRow: row, endColumn: column): Range {
      // R1C1 unbounded column/row range results in Rn:Rm/Cn:Cm which is interpreted as A1. Use existing A1 formula translator instead
      return this.getRange(FORMULA.A1(
        row       && this.toRowIndex(   row), 
        column    && this.toColumnIndex(column), 
        endRow    && this.toRowIndex(   endRow), 
        endColumn && this.toColumnIndex(endColumn)
      ));
    }

    getValues(row: row, column: column, _numRows: number = 1, _numColumns: number = 1): sheetValue[][] {
      return this.getRange(row, column, _numRows, _numColumns).getValues();
    }

    getValue(row: row, column: column): sheetValue {
      return this.getRange(row,column).getValue();
    }

    setValues(row: row, column: column, values: sheetValue[][]): void {
      if (!values || !Array.isArray(values) || values.length == 0 || !Array.isArray(values[0]) || values[0].length == 0) {
        throw new SheetBase.ChecklistSheetError("Cannot set values without a two dimensional values array");
      }
      this.getRange(row, column, values.length, values[0].length).setValues(values);
    }

    setValue(row: row, column: column, value: sheetValue): void {
      return this.setValues(row,column,[[value]]);
    }

    getColumnRange(column: column, _startRow: row = 1, _numRows: number = this.lastRow - this.toRowIndex(_startRow) + 1): Range {
      if (_numRows <= 0 && this.lastRow != this.maxRows) _numRows += this.maxRows - this.lastRow;
      return this.getRange(_startRow, column, _numRows, 1);
    }

    getColumnValues(column: column, _startRow: row = 1, _numRows: number = this.lastRow - this.toRowIndex(_startRow) + 1): sheetValue[] {
      return this.getColumnRange(_startRow, column, _numRows).getValues().map(row => row[0]);
    }

    setColumnValues(column: column, values: sheetValue[], _startRow: row = 1): void {
      this.setValues(_startRow, column, values.map((rowValue: sheetValue) => [rowValue]));
    }

    getColumnDataRange(column: column, _startRow: row = this.firstDataRow, _numRows: number = this.lastRow - this.toRowIndex(_startRow) + 1): Range {
      if (_numRows <= 0 && this.lastRow != this.maxRows) _numRows += this.maxRows - this.lastRow;
      if (_numRows <= 0) return;
      return this.getColumnRange(column, _startRow, _numRows);
    }

    getColumnDataValues(column: column, _startRow = this.firstDataRow, _numRows = this.lastRow - _startRow + 1) {
      const columnDataRange = this.getColumnDataRange(column, _startRow, _numRows);
      return columnDataRange && columnDataRange.getValues().map(row => row[0]) || [];
    }

    getColumnDataRangeFromRange(column: column, range: Range): Range {
      const firstRow = Math.max(this.firstDataRow, (range && range.getRow()) || 0);
      const lastRow = Math.min(this.lastRow, (range && range.getLastRow()) || this.lastRow);
      if (firstRow > lastRow) return;
      return this.getColumnDataRange(column,firstRow, lastRow-firstRow+1);
    }

    getUnboundedColumnDataRange(column: column, _startRow: row = this.firstDataRow): Range {
      return this.getUnboundedRange(_startRow,column,null,column);
    }

    setColumnDataValues(column: column, values: sheetValue[], _startRow: row = this.firstDataRow): void {
      this.setColumnValues(column, values, _startRow);
    }

    getRowRange(row: row, _startColumn: column = 1, _numColumns: number = this.lastColumn - this.toColumnIndex(_startColumn) + 1): Range {
      if (_numColumns <= 0 && this.lastColumn != this.maxColumns) _numColumns += this.maxColumns - this.lastColumn;
      return this.getRange(row, _startColumn, 1, _numColumns);
    }

    getUnboundedRowRange(row: row, _startColumn: column = 1): Range {
      const rowIndex = this.toRowIndex(row);
      return this.getUnboundedRange(rowIndex,_startColumn,rowIndex,null);
    }

    getRowValues(row: row, _startColumn: column = 1, _numColumns: number = this.lastColumn - this.toColumnIndex(_startColumn) + 1): sheetValue[] {
      return this.getRowRange(row, _startColumn, _numColumns).getValues()[0];
    }

    setRowValues(row: row, values: sheetValue[]|column, _startColumn: column|sheetValue[] = 1): void {
      let vals: sheetValue[], sCol: column;
      if (Number(values) && Array.isArray(_startColumn)) {
        // Ordering is slightly ambiguous, allow either
        [sCol, vals] = [values as column, _startColumn as sheetValue[]];
      } else {
        [vals,sCol] = [values as sheetValue[],_startColumn as column];
      }
      this.setValues(row, sCol, [vals]);
    }

    isColumnInRange(column: column|column[], range: Range): boolean {
      if (!column || !range) return false;
      const columns: column[] = Array.isArray(column) ? column : [column];
      for (let col of columns) {
        col = this._checkColumn(col,true);
        if (!col) return false;
        if (col >= range.getColumn() && col <= range.getLastColumn()) {
          return true;
        }
      }
      return false;
    }

    isRowInRange(row: row|row[], range: Range): boolean {
      if (!row || !range) return false;
      const rows: row[] = Array.isArray(row) ? row : [row];
      for (let rw of rows) {
        rw = this._checkRow(rw,true);
        if (!rw) return false;
        if (rw >= range.getRow() && rw <= range.getLastRow()) {
          return true;
        }
      }
      return false;
    }

    

    insertColumn(columnIndex: number): void {
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

    ensureColumn(columnType: column, columnIndex:number = this.lastColumn+1): void {
      if (!this.hasColumn(columnType)) {
        columnIndex = this._checkColumn(columnIndex,true) || this.lastColumn;
        this.insertColumn(columnIndex);
        if (this.namedColumnHeaders[columnType]) {
          this.setValue(this.headerRow,columnIndex,this.namedColumnHeaders[columnType]);
        }
        this._columns[columnType] = columnIndex;
      }
    }

    _determineLastNamedColumn(...columnTypes: column[]): number {
      if (columnTypes.length == 0) columnTypes = this.namedColumns;
      return Math.max(0,...columnTypes.map(columnType => this._checkColumn(columnType,true) || 0));
    }

    hideColumn(...columnTypes: column[]): void {
      columnTypes.forEach(columnType => {
        const columnIndex = this.toColumnIndex(columnType);
        if (columnIndex) {
          this.sheet.hideColumns(columnIndex);
        }
      });
    }

    insertRow(rowIndex: number): void {
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

    ensureRow(rowType: row, rowIndex: number = this.headerRow): void {
      if (!this.hasRow(rowType)) {
        rowIndex = this._checkRow(rowIndex,true) || this.lastRow;
        this.insertRow(rowIndex);
        if (this.namedRowHeaders[rowType]) {
          this.setValue(rowIndex,1,this.namedRowHeaders[rowType]);
        }
        this._rows[rowType] = rowIndex;
      }
    }
    

    _removeRow(row: row): void {
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

    _determineLastNamedRow(...rowTypes: row[]): number {
      if (rowTypes.length == 0) rowTypes = this.namedRows;
      return Math.max(0,...rowTypes.map(rowType => this._checkRow(rowType,true) || 0));
    }


    expandAll(): void {
      if (this.lastRow > 1) {
        this.sheet.showRows(1,this.lastRow);
      }
      if (this.lastColumn > 1) {
        this.sheet.showColumns(1,this.lastColumn);
      }
    }

  }

  return SheetBase;
})();