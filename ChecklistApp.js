/* exported ChecklistApp */
// eslint-disable-next-line no-redeclare
const ChecklistApp = (function(){

  const COLUMN = Object.freeze({
    CHECK: "CHECK",
    TYPE: "TYPE",
    ITEM: "ITEM",
    NOTES: "NOTES",
    PRE_REQS: "PRE_REQS",
    STATUS: "STATUS",
  });
  const ROW = Object.freeze({
    TITLE: "TITLE",
    SETTINGS: "SETTINGS",
    QUICK_FILTER: "QUICK_FILTER",
    HEADERS: "HEADERS",
  });
  const STATUS = Object.freeze({
    CHECKED: "CHECKED",
    AVAILABLE: "TRUE",
    MISSED: "MISSED",
    PR_USED: "PR_USED",
    PR_NOT_MET: "FALSE",
    UNKNOWN: "UNKNOWN",
    ERROR: "ERROR",
  });
  
  const COLUMN_HEADER = Object.freeze({
    CHECK: "✓",
    TYPE: "Type",
    ITEM: "Item",
    PRE_REQS: "Pre-Reqs",
    STATUS: "Available",
    NOTES: "Notes",
  });

  const COLOR = Object.freeze({
    ERROR: "#ff0000",
    UNAVAILABLE: "#fce5cd",
    MISSED: "#f4cccc",
    USED: "#d5a6bd",
    DISABLED: "#d9d9d9",
    CHECKED_BG: "#f3f3f3",
    CHECKED_TEXT: "#666666",
    MISSABLE: "#990000",
    WHITE: "white",
  });

  const ROW_HEADER = Object.freeze({
    QUICK_FILTER: "Filter",
    SETTINGS: "⚙",
    HEADERS: "✓",
  });

  const MAX_EMPTY_ROWS = 100;

  const checklists = {};
  class ChecklistApp {
    constructor() {
      throw new ChecklistError("App should not be created with new, use the class directly");
    }
    // APP SECTION
    static getChecklistBySheet(sheet = ChecklistApp.getActiveSheet()) {
      const sheetId = sheet.getSheetId();
      if (!checklists[sheetId]) {
        checklists[sheetId] = new Checklist(sheet);
      }
      return checklists[sheetId];
    }

    static getChecklistByMetaSheet(metaSheet) {
      const metaDevMeta = metaSheet.createDeveloperMetadataFinder().withKey("metaForSheet").withVisibility(SpreadsheetApp.DeveloperMetadataVisibility.PROJECT).find();
      if (metaDevMeta && metaDevMeta[0]) {
        const sheet = metaSheet.getParent().getSheetByName(metaDevMeta.getValue());
        if (sheet) {
          const checklist = ChecklistApp.getChecklistBySheet(sheet);
          checklist.metaSheet = metaSheet;
          return checklist;
        }
      }
    }

    get activeChecklist() {
      return ChecklistApp.getActiveChecklist();
    }

    static getActiveChecklist() {
      return ChecklistApp.getChecklistBySheet(ChecklistApp.getActiveSheet());
    }

    static get activeSheet() {
      return ChecklistApp.getActiveSheet();
    }

    static set activeSheet(sheet) {
      ChecklistApp.setActiveSheet(sheet);
    }

    static getActiveSheet() {
      return SpreadsheetApp.getActiveSheet();
    }

    static setActiveSheet(sheet) {
      if (ChecklistApp.getActiveSheet().getSheetId() !== sheet.getSheetId()) {
        sheet.activate();
        SpreadsheetApp.setActiveSheet(sheet);
        sheet.getParent().setActiveSheet(sheet);
      }
    }
    // END APP SECTION

    static get ROW() {
      return ROW;
    }

    static get COLUMN() {
      return COLUMN;
    }

    static get STATUS() {
      return STATUS;
    }
  }

  class ChecklistError extends Error {

  }

  class Checklist {
    constructor(sheet) {
      this._sheet = sheet;
    }
    
    // PROPERTIES SECTION
    get sheet() {
      return this._sheet;
    }

    get spreadsheet() {
      return this.sheet.getParent();
    }

    get filter() {
      return this.sheet.getFilter();
    }

    get rows() {
      if (!this._rows) {
        time("get rows");
        const numRowTypes = Object.keys(ROW).length;
      
        const rowHeaders = this.getColumnValues(1,1,numRowTypes);
        this._rows = {};
        for (let i = 0; i < rowHeaders.length; i++) {
          let rowType;
          Object.values(ROW).forEach(type => {
          // console.log("type,value",rowType,rowHeaders[i]);
          
            if (rowHeaders[i] && rowHeaders[i] == ROW_HEADER[type]) {
              rowType = type;
            }
          });
          if (!rowType && i == 0) rowType = ROW.TITLE;
          if (rowType) this._rows[rowType] = i+1;
        }
        timeEnd("get rows");
      }
      return {...this._rows};
    }

    get columns() {
      if (!this.isChecklist) return {};
      if (!this._columns) {
        time("get columns");
        this._columns = {};
        this._columnsByHeader = {};
        const columnHeaders = this.getRowValues(this.headerRow);
        columnHeaders.forEach((header, i) => {
          if (!header) return;
          const column = i + 1;
          this._columnsByHeader[header] = column;
        });
        Object.values(COLUMN).forEach(columnType => {
          const column = this._columnsByHeader[COLUMN_HEADER[columnType]];
          if (column) {
            this._columns[columnType] = column;
          }
        });
        timeEnd("get columns");
      }
      return {...this._columns};
    }
    get columnsByHeader() {
      return (this.columns && this._columnsByHeader && {...this._columnsByHeader}) || {};
    }
    
    get isChecklist() {
      return !!this.headerRow;
    }

    get headerRow() {
      return this.rows[ROW.HEADERS];
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

    get metaSheet() {
      if (!this.isChecklist) return undefined;
      if (typeof this._metaSheet == "undefined") {
        time("get metaSheet");
        const devMeta = this.sheet.createDeveloperMetadataFinder().withKey("metaSheet").withVisibility(SpreadsheetApp.DeveloperMetadataVisibility.PROJECT).find();
        if (devMeta && devMeta[0]) {
          this._metaSheet = this.sheet.getParent().getSheetByName(devMeta[0].getValue());
          if (!this._metaSheet) {
            const metaDevMeta = this.sheet.getParent().createDeveloperMetadataFinder().withKey("metaForSheet").withValue(this.sheet.getName()).withVisibility(SpreadsheetApp.DeveloperMetadataVisibility.PROJECT).find();
            if (metaDevMeta && metaDevMeta[0]) {
              this._metaSheet = metaDevMeta[0].getLocation().getSheet();
              this.metaSheet = this._metaSheet;
            }
          }
        }
        if (!this._metaSheet) {
          this._metaSheet = this.sheet.getParent().getSheetByName(this.sheet.getName() + " Meta");
          if (this._metaSheet) {
            this.metaSheet = this._metaSheet;
          }
        }
        if (!this._metaSheet) this._metaSheet = null;
        timeEnd("get metaSheet");
      }
      return this._metaSheet;
    }
    set metaSheet(metaSheet) {
      time("set metaSheet");
      this._metaSheet = metaSheet;
      const devMeta = this.sheet.createDeveloperMetadataFinder().withKey("metaSheet").withVisibility(SpreadsheetApp.DeveloperMetadataVisibility.PROJECT).find();
      if (devMeta && devMeta[0]) {
        devMeta[0].setValue(this._metaSheet.getName());
      } else {
        this.sheet.addDeveloperMetadata("metaSheet",this._metaSheet.getName(), SpreadsheetApp.DeveloperMetadataVisibility.PROJECT);
      }
      const metaDevMeta = metaSheet.createDeveloperMetadataFinder().withKey("metaForSheet").withVisibility(SpreadsheetApp.DeveloperMetadataVisibility.PROJECT).find();
      if (metaDevMeta && metaDevMeta[0]) {
        devMeta[0].setValue(this.sheet.getName());
      } else {
        metaSheet.addDeveloperMetadata("metaForSheet", this.sheet.getName(), SpreadsheetApp.DeveloperMetadataVisibility.PROJECT);
      }
      timeEnd("set metaSheet");
    }
    // END PROPERTY SECTIONS

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

    // RANGE/DATA SECTION
    _checkRow(row,_allowMissingRow = false) {
      if (!Number(row)) {
        if (!this.rows[row]) {
          if (_allowMissingRow && Object.values(ROW).includes(row)) {
            return undefined;
          } else {
            throw new ChecklistError("Invalid row: " + row);
          } 
        }
        row = this.rows[row];
      }
      return row;
    }

    _checkColumn(column, _allowMissingColumn = false) {
      if (!Number(column)) {
        if (!this.columns[column] && !this.columnsByHeader[column]) {
          if (_allowMissingColumn && Object.values(COLUMN).includes(column)) {
            return undefined;
          } else {
            throw new ChecklistError("Invalid column: " + column);
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
      if (rows.length == 0) throw new ChecklistError("Missing row");
      for (const row of rows) {
        if (this._checkRow(row,true) == undefined) {
          return false;
        }
      }
      return true;
    }

    hasColumn(...columns) {
      if (columns.length == 0) throw new ChecklistError("Missing column");
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
        throw new ChecklistError("Cannot set values without a two dimensional values array");
      }
      this.getRange(row, column, values.length, values[0].length).setValues(values);
    }

    setValue(row,column,value) {
      return this.setValues(row,column,[[value]]);
    }

    getColumnRange(column, _startRow = 1, _numRows = this.lastRow - _startRow + 1) {
      return this.getRange(_startRow, column, _numRows, 1);
    }

    getColumnValues(column, _startRow = 1, _numRows = this.lastRow - _startRow + 1) {
      return this.getValues(_startRow, column, _numRows, 1).map(row => row[0]);
    }

    setColumnValues(column, values, _startRow = 1) {
      this.setValues(_startRow, column, values.map(row => [row]));
    }

    getColumnDataRange(column, _startRow = this.firstDataRow, _numRows = this.lastRow - _startRow + 1) {
      if (_numRows <= 0) return;
      return this.getColumnRange(column, _startRow, _numRows);
    }

    getColumnDataValues(column, _startRow = this.firstDataRow, _numRows = this.lastRow - _startRow + 1) {
      if (_numRows == 0) return [];
      return this.getColumnValues(column, _startRow, _numRows);
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
      return this.getRange(row, _startColumn, 1, _numColumns);
    }

    getUnboundedRowRange(row, _startColumn = 1) {
      const rowIndex = this.toRowIndex(row);
      return this.getUnboundedRange(rowIndex,_startColumn,rowIndex,null);
    }

    getRowValues(row, _startColumn = 1, _numColumns = this.lastColumn - _startColumn + 1) {
      return this.getValues(row, _startColumn, 1, _numColumns)[0];
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

    // END RANGE/DATA SECTION

    // NOTES SECTION

    syncNotes(range) {
      time("syncNotes");
      const itemRange = this.getColumnDataRangeFromRange(COLUMN.ITEM,range);
      const notesRange = this.getColumnDataRangeFromRange(COLUMN.NOTES,range);
      if (itemRange && notesRange) {
        itemRange.setNotes(notesRange.getValues());
      }
      timeEnd("syncNotes");
    }

    // NOTES SECTION

    // RESET/INIT/STRUCTURE SECTION

    reset(_resetData = false) {
      time();

      const toastTitle = `${_resetData ? "Reset " : "Refresh "}Checklist`;
      const toastMessage = `${_resetData ? "Resetting" : "Refreshing"}...`;
      const previousMode = SETTINGS.getSetting(this,"Mode"); // Preserve mode

      this.toast(toastMessage, toastTitle, -1);
      Logger.log("Reseting checklist ", this.sheet.getName());
  
      time("filter removal");
      // Remove filter first to ensure data is available to write
      this.removeFilter();
      timeEnd("filter removal");
  
      time("row/column show");
      // Show all rows/columns
      this.expandAll();
      timeEnd("row/column show");
    
      time("removeValidation");
      this.removeValidations();
      timeEnd("removeValidation");
    
  
      time("row/column existence");
      this.ensureHeaderRow();

      this.ensureCheckColumn();
      this.ensureTypeColumn();
      this.ensureItemColumn();
      this.ensurePreReqsColumn();
      this.ensureNotesColumn();
      this.ensureStatusColumn();
      this.hideColumn(COLUMN.STATUS);
    
      this.ensureTitleRow();
      this.ensureSettingsRow();
      timeEnd("row/column existence");

      time("trim");
      this.trim();
      timeEnd("trim");
  
      // Reset checkboxes
      if (_resetData) {
        this.resetCheckmarks();
      }
  
      // Update all notes
      time("notes");
      this.syncNotes();
      timeEnd("notes");
    
      StatusTranspiler.validateAndGenerateStatusFormulasForChecklist(this);
  
      time("quickFilter");
      this.clearQuickFilterValues();
      timeEnd("quickFilter");
  
      time("dataValidation");
      this.resetDataValidation(true);
      timeEnd("dataValidation");

      time("available rules");
      //Add conditional formatting rules
      this.resetConditionalFormatting(true);
      timeEnd("available rules");
  
      if (this.metaSheet) {
        META.ProcessMeta(this);
      }
  
      // Create new filter
      time("filterCreate");
      this.createFilter();
      timeEnd("filterCreate");
  
      time("totals");
      this.ensureTotalFormula();
      timeEnd("totals");

      time("settings");
      SETTINGS.resetSettings(this, previousMode || "Edit");
      timeEnd("settings");

      this.toast("Done!", toastTitle,5);
      timeEnd();

    }

    // STRUCTURE UTILITIES

    ensureColumn(columnType, columnIndex = this.lastColumn+1) {
      // console.log("ensureColumn [columnType,columnIndex,columns[columnType],_columns]",columnType,columnIndex,this.columns[columnType],this._columns);
      
      if (!this.hasColumn(columnType)) {
        columnIndex = this._checkColumn(columnIndex,true) || this.lastColumn;
        if (columnIndex <= this.sheet.getMaxColumns()) {
          this.sheet.insertColumnBefore(columnIndex);
        } else {
          columnIndex = this.lastColumn+1;
          this.sheet.insertColumnAfter(this.lastColumn);
        }
        if (COLUMN_HEADER[columnType]) {
          this.setValue(this.headerRow,columnIndex,COLUMN_HEADER[columnType]);
        }
        Object.keys(this._columns).forEach(_columnType => {
          if (this._columns[_columnType] >= columnIndex) {
            this._columns[_columnType]++;
          }
        });
        this._columns[columnType] = columnIndex;
      }
      // console.log("ensureColumnEnd [columnType,columnIndex,columns[columnType],_columns]",columnType,columnIndex,this.columns[columnType],this._columns);
    }

    ensureCheckColumn() {
      this.ensureColumn(COLUMN.CHECK,1);
    }

    ensureTypeColumn() {
      this.ensureColumn(COLUMN.TYPE,this._determineLastColumn(COLUMN.CHECK) + 1);
    }

    ensureItemColumn() {
      this.ensureColumn(COLUMN.ITEM, this._determineLastColumn(COLUMN.TYPE,COLUMN.CHECK) + 1);
    }

    ensurePreReqsColumn() {
      this.ensureColumn(COLUMN.PRE_REQS, this._determineLastColumn(COLUMN.ITEM,COLUMN.TYPE,COLUMN.CHECK) + 1);
    }

    ensureNotesColumn() {
      this.ensureColumn(COLUMN.NOTES, this._determineLastColumn(COLUMN.PRE_REQS,COLUMN.ITEM,COLUMN.TYPE,COLUMN.CHECK) + 1);
    }

    ensureStatusColumn() {
      this.ensureColumn(COLUMN.STATUS);
    }

    _determineLastColumn(...columnTypes) {
      if (columnTypes.length == 0) columnTypes = Object.values(COLUMN);
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

    ensureRow(rowType, rowIndex = this.headerRow) {
      // console.log("ensureRow [rowType,rowIndex,rows[rowType],_rows]",rowType,rowIndex,this.rows[rowType],this._rows);
      if (!this.hasRow(rowType)) {
        rowIndex = this._checkRow(rowIndex,true) || this.lastRow;
        if (rowIndex <= this.sheet.getMaxRows()) {
          this.sheet.insertRowBefore(rowIndex);
        } else {
          this.rowIndex = this.lastRow+1;
          this.sheet.insertRowAfter(this.lastRow);
        }
        if (ROW_HEADER[rowType]) {
          this.setValue(rowIndex,1,ROW_HEADER[rowType]);
        }
        Object.keys(this._rows).forEach(_rowType => {
          if (this._rows[_rowType] >= rowIndex) {
            this._rows[_rowType]++;
          }
        });
        this._rows[rowType] = rowIndex;
      }
      // console.log("ensureRowEnd [rowType,rowIndex,rows[rowType],_rows]",rowType,rowIndex,this.rows[rowType],this._rows);

    }

    ensureTitleRow() {
      this.ensureHeaderRow();
      this.ensureRow(ROW.TITLE,1);
    }

    ensureSettingsRow() {
      const hadSettingsRow = this.hasRow(ROW.SETTINGS);
      this.ensureHeaderRow();
      this.ensureRow(ROW.SETTINGS);
      // TODO redo config
      if (!hadSettingsRow) {
        const modeCell = this.getRange(ROW.SETTINGS,2);
        if (!modeCell.getValue().match(/^Mode:/)) {
          modeCell.setValue("Mode: Edit");
        }
      }
    }

    ensureHeaderRow() {
      this.ensureRow(ROW.HEADERS, this._determineLastRow(ROW.TITLE,ROW.SETTINGS,ROW.QUICK_FILTER) + 1);
    }

    toggleQuickFilterRow(show = !this.hasRow(ROW.QUICK_FILTER)) {
      const hasQuickFilter = this.hasRow(ROW.QUICK_FILTER);
      if (hasQuickFilter && !show) {
        const row = this.toRowIndex(ROW.QUICK_FILTER);
        this.sheet.deleteRow(row);
        delete this._rows[ROW.QUICK_FILTER];
        Object.keys(this._rows).forEach(_rowType => {
          if (this._rows[_rowType] > row) {
            this._rows[_rowType]--;
          }
        });
      } else if (!hasQuickFilter && show) {
        this.ensureRow(ROW.QUICK_FILTER);
      }
    }

    _determineLastRow(...rowTypes) {
      if (rowTypes.length == 0) rowTypes = Object.values(ROW);
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


    trim() {
      time("trim checklist");
      const itemValues = this.getColumnDataValues(COLUMN.ITEM);
      const firstRow = this.firstDataRow;
      let lastItemRow;
      for (lastItemRow = itemValues.length - 1 + firstRow; lastItemRow >= firstRow; lastItemRow--) {
        if (itemValues[lastItemRow-firstRow]) break;
      }
      if (this.sheet.getMaxRows() - lastItemRow > MAX_EMPTY_ROWS) {
        this.sheet.deleteRows(lastItemRow + MAX_EMPTY_ROWS + 1, this.sheet.getMaxRows() - lastItemRow - MAX_EMPTY_ROWS);
      }
      if (this.lastColumn != this.sheet.getMaxColumns()) {
        this.sheet.deleteColumns(this.lastColumn+1,this.sheet.getMaxColumns()-this.lastColumn);
      }
      if (this.sheet.getMaxRows() == this.headerRow) {
        this.sheet.insertRowAfter(this.headerRow);
      }
      timeEnd("trim checklist");
    }

    // END STRUCTURE UTILITIES

    resetCheckmarks() {
      this.setColumnDataValues(COLUMN.CHECK, this.getColumnDataValues(COLUMN.CHECK).map(() => false));
    }

    // DATA VALIDATION UTILITIES
    removeValidations() {
      this.getRange(1,1,this.sheet.getMaxRows(),this.sheet.getMaxColumns()).setDataValidation(null);
    }

    resetDataValidation(_skipMeta = false) {
      time("checklist resetDataValidation");
      const {COUNTIF,A1,CONCAT,VALUE,LT} = FORMULA;
      const checks = this.getUnboundedColumnDataRange(COLUMN.CHECK);
      checks.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
      // Set Item validation
      const itemDataRange = this.getUnboundedColumnDataRange(COLUMN.ITEM);
      const prettyPrint = FORMULA.togglePrettyPrint(false);
      const itemDataValidationFormula = FORMULA(
        LT(
          COUNTIF(
            A1(itemDataRange),
            CONCAT(
              VALUE("="),
              A1(this.firstDataRow,this.toColumnIndex(COLUMN.ITEM),true)
            )
          ),
          VALUE(2)
        )
      );
      FORMULA.togglePrettyPrint(prettyPrint);
      // console.log(itemDataValidationFormula);
      const itemDataValidation = SpreadsheetApp.newDataValidation();
      itemDataValidation.setAllowInvalid(true);
      itemDataValidation.requireFormulaSatisfied(itemDataValidationFormula);
      itemDataRange.setDataValidation(itemDataValidation);
      
      if (this.metaSheet && !_skipMeta) {
        META.setDataValidation(this);
      }
      // return itemDataValidationFormula;
      timeEnd("checklist resetDataValidation");
    }
    // END DATA VALIDATION UTILITIES

    // CONDITIONAL FORMATTING UTILITIES
    resetConditionalFormatting(_skipMeta = false) {
      time("checklist resetConditionalFormatting");
      const {NOT,IF,ISERROR,ISBLANK,OR,REGEXMATCH,A1,VALUE,EQ,CONCAT,NE} = FORMULA;
      const prettyPrint = FORMULA.togglePrettyPrint(false);

      const checkboxDataRange = this.getUnboundedColumnDataRange(COLUMN.CHECK);
      const itemDataRange = this.getUnboundedColumnDataRange(COLUMN.ITEM);
      const statusDataRange = this.getUnboundedColumnDataRange(COLUMN.STATUS);
      const preReqDataRange = this.getUnboundedColumnDataRange(COLUMN.PRE_REQS);
      const allDataRange = this.getUnboundedRange(this.firstDataRow,1,null,this.lastColumn);
      
      
      const relativeCheckboxCell = A1(this.firstDataRow,this.toColumnIndex(COLUMN.CHECK),true);
      const relativeItemCell = A1(this.firstDataRow,this.toColumnIndex(COLUMN.ITEM),true);
      const relativePreReqCell = A1(this.firstDataRow,this.toColumnIndex(COLUMN.PRE_REQS),true);
      const relativeStatusCell = A1(this.firstDataRow,this.toColumnIndex(COLUMN.STATUS),true);
      
      const notAvailableFormula = FORMULA(
        NOT(
          OR(
            ISBLANK(relativeStatusCell),
            EQ(relativeStatusCell,VALUE(STATUS.AVAILABLE))
          )
        )
      );
      const missedFormula = FORMULA(EQ(relativeStatusCell,VALUE(STATUS.MISSED)));
      const usedFormula = FORMULA(EQ(relativeStatusCell,VALUE(STATUS.PR_USED)));
      const statusErrorFormula = FORMULA(
        IF(
          ISERROR(relativeStatusCell),
          VALUE.TRUE,
          REGEXMATCH(CONCAT(VALUE.EMPTYSTRING,relativeStatusCell),VALUE(STATUS.ERROR))
        )
      );
      const checkboxDisableFormula = FORMULA(
        OR(
          ISBLANK(relativeItemCell),
          NE(relativeStatusCell,VALUE(STATUS.AVAILABLE))
        )
      );
      const crossthroughCheckedFormula = FORMULA(EQ(relativeCheckboxCell,VALUE.TRUE));
      const missableFormula = FORMULA(REGEXMATCH(relativePreReqCell,VALUE("(^|\\n)MISSED ")));
      
      FORMULA.togglePrettyPrint(prettyPrint);
      
      const availableErrorRule = SpreadsheetApp.newConditionalFormatRule();
      availableErrorRule.setBackground(COLOR.ERROR);
      availableErrorRule.whenFormulaSatisfied(statusErrorFormula);
      availableErrorRule.setRanges([preReqDataRange,statusDataRange]);
      
      const missedRule = SpreadsheetApp.newConditionalFormatRule();
      missedRule.setBackground(COLOR.MISSED);
      missedRule.whenFormulaSatisfied(missedFormula);
      missedRule.setRanges([preReqDataRange,statusDataRange]);
      
      const usedRule = SpreadsheetApp.newConditionalFormatRule();
      usedRule.setBackground(COLOR.USED);
      usedRule.whenFormulaSatisfied(usedFormula);
      usedRule.setRanges([preReqDataRange,statusDataRange]);
      
      const notAvailableRule = SpreadsheetApp.newConditionalFormatRule();
      notAvailableRule.setBackground(COLOR.UNAVAILABLE);
      notAvailableRule.whenFormulaSatisfied(notAvailableFormula);
      notAvailableRule.setRanges([preReqDataRange,statusDataRange]);
      
      const crossthroughCheckedRule = SpreadsheetApp.newConditionalFormatRule();
      crossthroughCheckedRule.setStrikethrough(true);
      crossthroughCheckedRule.setBackground(COLOR.CHECKED_BG);
      crossthroughCheckedRule.setFontColor(COLOR.CHECKED_TEXT);
      crossthroughCheckedRule.whenFormulaSatisfied(crossthroughCheckedFormula);
      crossthroughCheckedRule.setRanges([allDataRange]);
      
      
      const checkboxDisableRule = SpreadsheetApp.newConditionalFormatRule();
      checkboxDisableRule.setBackground(COLOR.DISABLED);
      checkboxDisableRule.setFontColor(COLOR.DISABLED);
      checkboxDisableRule.whenFormulaSatisfied(checkboxDisableFormula);
      checkboxDisableRule.setRanges([checkboxDataRange]);
      
      const missableRule = SpreadsheetApp.newConditionalFormatRule();
      missableRule.setBackground(COLOR.MISSABLE);
      missableRule.setFontColor(COLOR.WHITE);
      missableRule.whenFormulaSatisfied(missableFormula);
      missableRule.setRanges([itemDataRange]);
      
      this.sheet.setConditionalFormatRules([availableErrorRule,crossthroughCheckedRule,checkboxDisableRule,missableRule,missedRule,usedRule,notAvailableRule]);//.concat(existingRules,[notAvailableRule]));
      if (this.metaSheet && !_skipMeta) {
        META.setConditionalFormatRules(this);
      }
      timeEnd("checklist resetConditionalFormatting");
    }
    // END CONDITIONAL FORMATTING UTILITIES
    // RESET/INIT/STRUCTURE SECTION

    // FILTER SECTION
    removeFilter() {
      if (this.filter) this.filter.remove();
    }
    refreshFilter() {
      time("refreshFilter");
      try {
        if (this.filter) {
          const filterRange = this.filter.getRange();
          for (let i = filterRange.getColumn(); i <= filterRange.getLastColumn(); i++) {
            const criteria = this.filter.getColumnFilterCriteria(i);
            if (criteria) {
              this.filter.setColumnFilterCriteria(i,criteria);
              return;
            }
          }
        }
      } finally {
        timeEnd("refreshFilter");
      }
    }
    createFilter(_oldFilter) {
      this.removeFilter();
      const filterRange = this.getUnboundedRange(this.headerRow, 1, null, this.lastColumn);//,1,this.sheet.getMaxRows()-this.headerRow+1,this.lastColumn);
      filterRange.createFilter();
      if (_oldFilter) {
        const oldFilterRange = _oldFilter.getRange();
        for (let column = oldFilterRange.getColumn(); column <= oldFilterRange.getLastColumn(); column++) {
          const criteria = _oldFilter.getColumnFilterCriteria(column);
          if (criteria) {
            this.filter.setColumnFilterCriteria(column,criteria);
          }
        }
      }
    }
    ensureFilterSize() {
      const filterRange = this.filter.getRange();
      if (filterRange.getRow()        != this.headerRow 
      ||  filterRange.getColumn()     != 1 
      ||  filterRange.getLastRow()    != this.sheet.getMaxRows() 
      ||  filterRange.getLastColumn() != this.lastColumn) {
        this.toast("Please wait...","Expanding Filter",-1);
        this.createFilter(this.filter);
        this.toast("Done!", "ExpandingFilter");
      }
    }
    // END FILTER SECTION

    // QUICK FILTER SECTION
    clearQuickFilterValues() {
      time("QUICK_FILTER clear");
      if (this.hasRow(ROW.QUICK_FILTER)) {
        const quickFilterCells = this.getRowRange(ROW.QUICK_FILTER, 2);
        quickFilterCells.clearContent();
      }
      timeEnd("QUICK_FILTER clear");
    }
    quickFilterChange(event) {
      time("quickFilterChange");
      const {REGEXMATCH,A1,VALUE} = FORMULA;
      const range = event.range;
  
      const firstChangedColumn = range.getColumn();
      const lastChangedColumn = range.getLastColumn();
      const changedValues = this.getRowValues(ROW.QUICK_FILTER,range.getColumn(), range.getNumColumns());
      for (let column = firstChangedColumn; column <= lastChangedColumn; column++) {
        if (column == 1) continue; // First column is header
        const changedValue = changedValues[column-firstChangedColumn];
        let criteria = this.filter.getColumnFilterCriteria(column);
        if (changedValue) {
          if (criteria) {
            criteria = criteria.copy();
          } else {
            criteria = SpreadsheetApp.newFilterCriteria();
          }
          // const filterRange = checklist.getColumnDataRange(column);
          const prettyPrint = FORMULA.togglePrettyPrint(false);
          criteria.whenFormulaSatisfied(FORMULA(REGEXMATCH(A1(this.firstDataRow,column,null,column),VALUE("(?mis:"+ changedValue +")"))));
          FORMULA.togglePrettyPrint(prettyPrint);
          this.filter.setColumnFilterCriteria(column, criteria);
        } else {
          if (criteria && criteria.getCriteriaType() == SpreadsheetApp.BooleanCriteria.CUSTOM_FORMULA) {
          // Remove it, but don't remove the hiddenValues criteria
            if (criteria.getHiddenValues()) {
              this.filter.setColumnFilterCriteria(column, SpreadsheetApp.newFilterCriteria().setHiddenValues(criteria.getHiddenValues()));
            } else {
              this.filter.removeColumnFilterCriteria(column);
            }
          }
        }
      }
      timeEnd("quickFilterChange");
    }
    // END QUICK FILTER SECTION
    // REPORTING SECTION
    ensureTotalFormula() {
      time("totalFormula");
      // static imports
      const {CONCAT, A1, IF, GT, OR, ADD, COUNTIFS, VALUE, CHAR,EQ} = FORMULA;
      
      // TODO determine best way for reporting
      if (!this.hasRow(ROW.TITLE)) return;
      const totalCell = this.getRange(ROW.TITLE,1);
      const firstRow = this.firstDataRow;
      const itemColumn = this.toColumnIndex(COLUMN.ITEM);
      const statusColumn = this.toColumnIndex(COLUMN.STATUS);
      
      const total       = [A1(firstRow,itemColumn  ,null,itemColumn  ),VALUE("<>")                      ];
      const checked     = [A1(firstRow,statusColumn,null,statusColumn),VALUE(STATUS.CHECKED)   ,total];
      const missed      = [A1(firstRow,statusColumn,null,statusColumn),VALUE(STATUS.MISSED)    ,total];
      const prUsed      = [A1(firstRow,statusColumn,null,statusColumn),VALUE(STATUS.PR_USED)   ,total];
      const available   = [A1(firstRow,statusColumn,null,statusColumn),VALUE(STATUS.AVAILABLE) ,total];
      const unknown     = [A1(firstRow,statusColumn,null,statusColumn),VALUE(STATUS.UNKNOWN)   ,total];
      const unavailable = [A1(firstRow,statusColumn,null,statusColumn),VALUE(STATUS.PR_NOT_MET),total];
      
      
      
      const formula = FORMULA(
        CONCAT(
          IF(
            OR(
              GT(COUNTIFS(missed),VALUE.ZERO),
              GT(COUNTIFS(prUsed),VALUE.ZERO)
            ),
            CONCAT(
              VALUE("M: "), 
              COUNTIFS(missed), 
              IF(
                GT(COUNTIFS(prUsed),VALUE.ZERO),
                CONCAT(VALUE(" ("),COUNTIFS(prUsed),VALUE(")")),
                VALUE.EMPTYSTRING
              ),
              CHAR.NEWLINE
            ),
            VALUE.EMPTYSTRING
          ),
          VALUE("R: "),
          IF(
            EQ(
              ADD(COUNTIFS(available),COUNTIFS(unavailable)),
              VALUE.ZERO
            ),
            VALUE("★"),
            CONCAT(
              COUNTIFS(available),
              VALUE("|"),
              COUNTIFS(unavailable)
            )
          ), 
          IF(
            GT(COUNTIFS(unknown),VALUE.ZERO),
            CONCAT(VALUE(" ("),COUNTIFS(unknown),VALUE(")")),
            VALUE.EMPTYSTRING
          ),
          CHAR.NEWLINE,
          COUNTIFS(checked),
          VALUE("/"),
          COUNTIFS(total)
        )
      );
                        
      if (totalCell.getFormula() !== formula) {
        totalCell.setFormula(formula);
      }
      timeEnd("totalFormula");
    }
    // END REPORTING SECTION
  }
                    
  return ChecklistApp;
                    
})();
                  
/* eslint-disable */
                  function testChecklist() {
                    time();
                    const sheet = ChecklistApp.getActiveSheet();
                    console.log(sheet.getName());
                    return;
                  }