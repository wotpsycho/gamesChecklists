/* exported SheetBase */
// eslint-disable-next-line no-redeclare
const SheetBase = (()=>{
  class ChecklistSheetError extends Error {}

  class SheetBase {
    constructor(sheet,_namedColumnHeaders, _namedRowHeaders) {
      Object.defineProperties(this,{
        sheet             : {value: sheet},
        namedColumnHeaders: {value: _namedColumnHeaders},
        namedRowHeaders   : {value: _namedRowHeaders},

      });
    }
    get spreadsheet() {
      return this.sheet.getParent();
    }

    get filter() {
      return this.sheet.getFilter();
    }

    get name() {
      return this.sheet.getName();
    }

    set name(newName) {
      this.sheet.setName(newName);
    }

    get sheetId() {
      return this.sheet.getSheetId();
    }

    get headerRow() {
      if (!this._headerRow) {
        const header = (this.filter && this.filter.getRange().getRow()) || this.sheet.getFrozenRows() || 1;
        Object.defineProperty(this,"_headerRow",{value: header});
      } 
      return this._headerRow;
    }

    get firstDataRow() {
      return this.headerRow && (this.headerRow + 1);
    }

    get lastColumn() {
      return this.sheet.getLastColumn();
    }

    get lastRow() {
      return this.sheet.getLastRow();
    }

    get maxRows() {
      return this.sheet.getMaxRows();
    }

    get maxColumns() {
      return this.sheet.getMaxColumns();
    }

    get namedColumns() {
      return this.namedColumnHeaders && Object.keys(this.namedColumnHeaders) || [];
    }

    get namedRows() {
      return this.namedRowHeaders && Object.keys(this.namedRowHeaders) || [];
    }

    get rows() {
      if (!this._rows) {
        time("get rows");
        Object.defineProperty(this,"_rows", {value: {}});
        if (this.namedRows.length) {
          const rowHeaders = this.getColumnValues(1,1,Math.max(this.headerRow,this.namedRows.length));
          rowHeaders.forEach((rowHeader,i) => {
            const row = i+1;
            let rowId;
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

    get columns() {
      if (!this._columns) {
        time("get columns");
        Object.defineProperty(this,"_columns", {value: {}});
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

    get columnsByHeader() {
      if (!this._columnsByHeader) {
        Object.defineProperty(this,"_columnsByHeader", {value: {}});
        const columnHeaders = this.getRowValues(this.headerRow);
        columnHeaders.forEach((header, i) => {
          if (!header) return;
          const column = i + 1;
          this._columnsByHeader[header] = column;
        });
      }
      return {...this._columnsByHeader};
    }

    get editable() {
      return !this.sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
    }
    set editable(isEditable) {
      if (!this.editable && isEditable) {
        const protection = this.sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
        protection.remove();
      } else if (this.editable && !isEditable) {
        const protection = this.sheet.protect();
        protection.setWarningOnly(true);
      }
    }
    // UI Section
    activate() {
      ChecklistApp.setActiveSheet(this.sheet);
    }

    toast(message, _titleOrSeconds, _seconds) {
      let title, seconds;
      if (Number(_titleOrSeconds)) { // 0 seconds not valid so truthy check OK
        seconds = _titleOrSeconds;
      } else {
        [title,seconds] = [_titleOrSeconds,_seconds];
      }
      this.spreadsheet.toast(message,title,seconds);
    }
    // END UI SECTION

    _checkRow(row,_allowMissingRow = false) {
      if (!Number(row)) {
        if (!this.rows[row]) {
          if (_allowMissingRow && this.namedRows.includes(row)) {
            return undefined;
          } else {
            throw new ChecklistSheetError("Invalid row: " + row);
          } 
        }
        row = this.rows[row];
      }
      return row;
    }

    _checkColumn(column, _allowMissingColumn = false) {
      if (!Number(column)) {
        if (!this.columns[column] && !this.columnsByHeader[column]) {
          if (_allowMissingColumn && this.namedColumns.includes(column)) {
            return undefined;
          } else {
            throw new ChecklistSheetError("Invalid column: " + column);
          }
        }
        column = this.columns[column] || this.columnsByHeader[column];
      }
      return column;
    }

    toRowIndex(row) {
      return this._checkRow(row);
    }

    toColumnIndex (column) {
      return this._checkColumn(column);
    }

    hasRow(...rows) {
      if (rows.length == 0) throw new ChecklistSheetError("Missing row");
      for (const row of rows) {
        if (this._checkRow(row,true) == undefined) {
          return false;
        }
      }
      return true;
    }

    hasColumn(...columns) {
      if (columns.length == 0) throw new ChecklistSheetError("Missing column");
      for (const column of columns) {
        if (this._checkColumn(column,true) == undefined) {
          return false;
        }
      }
      return true;
    }

    getRange(row, column, _numRows = 1, _numColumns = 1) {
      if (row && !column) {
        // This is the case of A1/R1C1 notation
        return this.sheet.getRange(row);
      }
      return this.sheet.getRange(this.toRowIndex(row),this.toColumnIndex(column),_numRows,_numColumns);
    }

    getUnboundedRange(row, column, endRow, endColumn) {
      // R1C1 unbounded column/row range results in Rn:Rm/Cn:Cm which is interpreted as A1. Use existing A1 formula translator instead
      return this.getRange(FORMULA.A1(
        row       && this.toRowIndex(   row), 
        column    && this.toColumnIndex(column), 
        endRow    && this.toRowIndex(   endRow), 
        endColumn && this.toColumnIndex(endColumn)
      ));
    }

    getValues(row, column, _numRows = 1, _numColumns = 1) {
      return this.getRange(row, column, _numRows, _numColumns).getValues();
    }

    getValue(row, column) {
      return this.getRange(row,column).getValue();
    }

    setValues(row, column, values) {
      if (!values || !Array.isArray(values) || values.length == 0 || !Array.isArray(values[0]) || values[0].length == 0) {
        throw new ChecklistSheetError("Cannot set values without a two dimensional values array");
      }
      this.getRange(row, column, values.length, values[0].length).setValues(values);
    }

    setValue(row,column,value) {
      return this.setValues(row,column,[[value]]);
    }

    getColumnRange(column, _startRow = 1, _numRows = this.lastRow - _startRow + 1) {
      if (_numRows <= 0 && this.lastRow != this.maxRows) _numRows += this.maxRows - this.lastRow;
      return this.getRange(_startRow, column, _numRows, 1);
    }

    getColumnValues(column, _startRow = 1, _numRows = this.lastRow - _startRow + 1) {
      return this.getColumnRange(_startRow, column, _numRows, 1).getValues().map(row => row[0]);
    }

    setColumnValues(column, values, _startRow = 1) {
      this.setValues(_startRow, column, values.map(row => [row]));
    }

    getColumnDataRange(column, _startRow = this.firstDataRow, _numRows = this.lastRow - _startRow + 1) {
      if (_numRows <= 0 && this.lastRow != this.maxRows) _numRows += this.maxRows - this.lastRow;
      if (_numRows <= 0) return;
      return this.getColumnRange(column, _startRow, _numRows);
    }

    getColumnDataValues(column, _startRow = this.firstDataRow, _numRows = this.lastRow - _startRow + 1) {
      const columnDataRange = this.getColumnDataRange(column, _startRow, _numRows);
      return columnDataRange && columnDataRange.getValues().map(row => row[0]) || [];
    }

    getColumnDataRangeFromRange(column, range) {
      const firstRow = Math.max(this.firstDataRow, (range && range.getRow()) || 0);
      const lastRow = Math.min(this.lastRow, (range && range.getLastRow()) || this.lastRow);
      if (firstRow > lastRow) return;
      return this.getColumnDataRange(column,firstRow, lastRow-firstRow+1);
    }

    getUnboundedColumnDataRange(column, _startRow = this.firstDataRow) {
      return this.getUnboundedRange(_startRow,column,null,column);
    }

    setColumnDataValues(column, values, _startRow = this.firstDataRow) {
      this.setColumnValues(column, values, _startRow);
    }

    getRowRange(row, _startColumn = 1, _numColumns = this.lastColumn - _startColumn + 1) {
      if (_numColumns <= 0 && this.lastColumn != this.maxColumns) _numColumns += this.maxColumns - this.lastColumn;
      return this.getRange(row, _startColumn, 1, _numColumns);
    }

    getUnboundedRowRange(row, _startColumn = 1) {
      const rowIndex = this.toRowIndex(row);
      return this.getUnboundedRange(rowIndex,_startColumn,rowIndex,null);
    }

    getRowValues(row, _startColumn = 1, _numColumns = this.lastColumn - _startColumn + 1) {
      return this.getRowRange(row, _startColumn, _numColumns).getValues()[0];
    }

    setRowValues(row, values, _startColumn = 1) {
      if (Number(values) && Array.isArray(_startColumn)) {
        // Ordering is slightly ambiguous, allow either
        [_startColumn, values] = [values, _startColumn];
      }
      this.setValues(row, _startColumn, [values]);
    }

    isColumnInRange(column, range) {
      if (!column || !range) return false;
      const columns = Array.isArray(column) ? column : [column];
      for (let col of columns) {
        col = this._checkColumn(col,true);
        if (!col) return false;
        if (col >= range.getColumn() && col <= range.getLastColumn()) {
          return true;
        }
      }
      return false;
    }

    isRowInRange(row, range) {
      if (!row || !range) return false;
      const rows = Array.isArray(row) ? row : [row];
      for (let rw of rows) {
        rw = this._checkRow(rw,true);
        if (!rw) return false;
        if (rw >= range.getRow() && rw <= range.getLastRow()) {
          return true;
        }
      }
      return false;
    }

    

    insertColumn(columnIndex) {
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

    ensureColumn(columnType, columnIndex = this.lastColumn+1) {
      if (!this.hasColumn(columnType)) {
        columnIndex = this._checkColumn(columnIndex,true) || this.lastColumn;
        this.insertColumn(columnIndex);
        if (this.namedColumnHeaders[columnType]) {
          this.setValue(this.headerRow,columnIndex,this.namedColumnHeaders[columnType]);
        }
        this._columns[columnType] = columnIndex;
      }
    }

    _determineLastNamedColumn(...columnTypes) {
      if (columnTypes.length == 0) columnTypes = this.namedColumns;
      return Math.max(0,...columnTypes.map(columnType => this._checkColumn(columnType,true) || 0));
    }

    hideColumn(...columnTypes) {
      columnTypes.forEach(columnType => {
        const columnIndex = this.toColumnIndex(columnType);
        if (columnIndex) {
          this.sheet.hideColumns(columnIndex);
        }
      });
    }

    insertRow(rowIndex) {
      const wasEditable = this.editable;
      if (!wasEditable) this.editable = true;
      if (rowIndex <= this.maxRows) {
        if (rowIndex > this.lastRow) return; // is already a blank row
        this.sheet.insertRowBefore(rowIndex);
      } else {
        this.rowIndex = this.lastRow+1;
        this.sheet.insertRowAfter(this.lastRow);
      }
      Object.keys(this._rows).forEach(_rowType => {
        if (this._rows[_rowType] >= rowIndex) {
          this._rows[_rowType]++;
        }
      });
      if (!wasEditable) this.editable = false;
    }

    ensureRow(rowType, rowIndex = this.headerRow) {
      if (!this.hasRow(rowType)) {
        rowIndex = this._checkRow(rowIndex,true) || this.lastRow;
        this.insertRow(rowIndex);
        if (this.namedRowHeaders[rowType]) {
          this.setValue(rowIndex,1,this.namedRowHeaders[rowType]);
        }
        this._rows[rowType] = rowIndex;
      }
    }
    

    _removeRow(row) {
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

    _determineLastNamedRow(...rowTypes) {
      if (rowTypes.length == 0) rowTypes = this.namedRows;
      return Math.max(0,...rowTypes.map(rowType => this._checkRow(rowType,true) || 0));
    }


    expandAll() {
      if (this.lastRow > 1) {
        this.sheet.showRows(1,this.lastRow);
      }
      if (this.lastColumn > 1) {
        this.sheet.showColumns(1,this.lastColumn);
      }
    }

  }

  Object.defineProperty(SheetBase,"ChecklistSheetError",{value: ChecklistSheetError});

  return SheetBase;
})();