/* exported Checklist, COLUMN, ROW */
// eslint-disable-next-line no-redeclare
const Checklist = (function(){

  const COLUMN_TYPES = Object.freeze({
    CHECK: "check",
    TYPE: "type",
    ITEM: "item",
    NOTES: "notes",
    PRE_REQS: "preReq",
    STATUS: "available",
  });
  const ROW_TYPES = Object.freeze({
    TITLE: "title",
    SETTINGS: "settings",
    QUICK_FILTER: "quickFilter",
    HEADERS: "headers",
  });

  const MAX_EMPTY_ROWS = 100;

  class ChecklistError extends Error {

  }

  const checklists = {};
  let activeSheet;
  class Checklist {
    constructor(sheet) {
      this._sheet = sheet;
    }

    static fromSheet(sheet = Checklist.getActiveSheet()) {
      const sheetId = sheet.getSheetId();
      console.log("fromSheet", sheetId, checklists[sheetId], checklists[sheetId] && checklists[sheetId].sheet == sheet);
      if (!checklists[sheetId]) {
        checklists[sheetId] = new Checklist(sheet);
      }
      return checklists[sheetId];
    }

    static fromMetaSheet(metaSheet) {
      const metaDevMeta = metaSheet.createDeveloperMetadataFinder().withKey("metaForSheet").withVisibility(SpreadsheetApp.DeveloperMetadataVisibility.PROJECT).find();
      if (metaDevMeta && metaDevMeta[0]) {
        const sheet = metaSheet.getParent().getSheetByName(metaDevMeta.getValue());
        if (sheet) {
          const checklist = Checklist.fromSheet(sheet);
          checklist.metaSheet = metaSheet;
          return checklist;
        }
      }
    }

    static getActiveChecklist() {
      return Checklist.fromSheet(Checklist.getActiveSheet());
    }
    
    static getActiveSheet() {
      return activeSheet || SpreadsheetApp.getActiveSheet();
    }

    static setActiveSheet(sheet) {
      activeSheet = sheet;
    }

    static clearActiveSheet() {
      this.activeSheet = undefined;
    }

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
        const numRowTypes = Object.keys(ROW_TYPES).length;
      
        const rowHeaders = this.getColumnValues(1,1,numRowTypes);
        this._rows = {};
        for (let i = 0; i < rowHeaders.length; i++) {
          let rowType;
          Object.values(ROW_TYPES).forEach(type => {
          // console.log("type,value",rowType,rowHeaders[i]);
          
            if (rowHeaders[i] && rowHeaders[i] == CONFIG.ROW_HEADERS[type]) {
              rowType = type;
            }
          });
          if (!rowType && i == 0) rowType = ROW_TYPES.TITLE;
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
          const column = this._columnsByHeader[CONFIG.COLUMN_HEADERS[columnType]];
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

    get headerRow() {
      return this.rows[ROW_TYPES.HEADERS];
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

    getValues(row, column, _numRows = 1, _numColumns = 1) {
      return this.getRange(row, column, _numRows, _numColumns).getValues();
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
      return this.getRange(`R${_startRow}C${this.toColumnIndex(column)}:C${this.toColumnIndex(column)}`);
    }

    setColumnDataValues(column, values, _startRow = this.firstDataRow) {
      this.setColumnValues(column, values, _startRow);
    }

    getRowRange(row, _startColumn = 1, _numColumns = this.lastColumn - _startColumn + 1) {
      return this.getRange(row, _startColumn, 1, _numColumns);
    }

    getUnboundedRowRange(row, _startColumn = 1) {
      const rowIndex = this.toRowIndex(row);
      return this.getRange(`R${rowIndex}C${_startColumn}:R${rowIndex}`);
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

    ensureColumn(columnType, columnIndex = this.lastColumn+1) {
      console.log("ensureColumn [columnType,columnIndex,columns[columnType],_columns]",columnType,columnIndex,this.columns[columnType],this._columns);
      
      if (!this.columns[columnType]) {
        columnIndex = this._checkColumn(columnIndex,true) || this.lastColumn;
        if (columnIndex <= this.sheet.getMaxColumns()) {
          this.sheet.insertColumnBefore(columnIndex);
        } else {
          columnIndex = this.lastColumn+1;
          this.sheet.insertColumnAfter(this.lastColumn);
        }
        if (CONFIG.COLUMN_HEADERS[columnType]) {
          this.setValue(this.headerRow,columnIndex,CONFIG.COLUMN_HEADERS[columnType]);
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
        const columnIndex = this.columns[columnType];
        if (columnIndex) {
          this.sheet.hideColumns(columnIndex);
        }
      });
    }

    ensureRow(rowType, rowIndex = this.headerRow) {
      // console.log("ensureRow [rowType,rowIndex,rows[rowType],_rows]",rowType,rowIndex,this.rows[rowType],this._rows);
      if (!this.rows[rowType]) {
        rowIndex = this._checkRow(rowIndex,true) || this.lastRow;
        if (rowIndex <= this.sheet.getMaxRows()) {
          this.sheet.insertRowBefore(rowIndex);
        } else {
          this.rowIndex = this.lastRow+1;
          this.sheet.insertRowAfter(this.lastRow);
        }
        if (CONFIG.ROW_HEADERS[rowType]) {
          this.setValue(rowIndex,1,CONFIG.ROW_HEADERS[rowType]);
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

    // ensureQuickFilterRow() {
    //   this.ensureHeaderRow();
    //   this.ensureRow(ROW.QUICK_FILTER);
    // }

    ensureHeaderRow() {
      this.ensureRow(ROW.HEADERS, this._determineLastRow(ROW.TITLE,ROW.SETTINGS,ROW.QUICK_FILTER) + 1);
    }

    toggleQuickFilterRow(show = !this.hasRow(ROW.QUICK_FILTER)) {
      const hasQuickFilter = this.hasRow(ROW.QUICK_FILTER);
      if (hasQuickFilter && !show) {
        const row = this.rows[ROW.QUICK_FILTER];
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

    removeValidations() {
      this.getRange(1,1,this.sheet.getMaxRows(),this.sheet.getMaxColumns()).setDataValidation(null);
    }

    resetDataValidation(_skipMeta = false) {
      time("checklist resetDataValidation");
      const checks = this.getUnboundedColumnDataRange(COLUMN.CHECK);
      checks.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
      // Set Item validation
      const itemDataRange = this.getUnboundedColumnDataRange(COLUMN.ITEM);
      const itemDataRangeA1 = itemDataRange.getA1Notation();
      const itemDataCellA1 = itemDataRange.getCell(1,1).getA1Notation();
      const itemDataValidationFormula = "=COUNTIF(" + UTIL.a1ToAbsolute(itemDataRangeA1,true,true,true,false) + ",\"=\"&"+ UTIL.a1ToAbsolute(itemDataCellA1,false,false) +") < 2";
      const itemDataValidation = SpreadsheetApp.newDataValidation();
      itemDataValidation.setAllowInvalid(true);
      itemDataValidation.requireFormulaSatisfied(itemDataValidationFormula);
      itemDataRange.setDataValidation(itemDataValidation);
      
      if (this.metaSheet && !_skipMeta) {
        META.setDataValidation(this.sheet);
      }
      timeEnd("checklist resetDataValidation");
    }

    resetConditionalFormatting(_skipMeta = false) {
      time("checklist resetConditionalFormatting");
      const checks = this.getUnboundedColumnDataRange(COLUMN.CHECK);
      
      const itemDataRange = this.getUnboundedColumnDataRange(COLUMN.ITEM);
      
      const itemDataCellA1 = itemDataRange.getCell(1,1).getA1Notation();
      const preReqData = this.getUnboundedColumnDataRange(COLUMN.PRE_REQS);
      
      const allDataRange = this.getRange(`R${this.firstDataRow}C1:C${this.lastColumn}`);
      const availableData = this.getUnboundedColumnDataRange(COLUMN.STATUS);
      
      const availableDataCellA1 = (availableData.getCell(1,1).getA1Notation());
      const checkboxDataCellA1 = checks.getCell(1,1).getA1Notation();
      const missedDataCellA1 = preReqData.getCell(1,1).getA1Notation();
      const notAvailableFormula = `=NOT(OR(ISBLANK($${availableDataCellA1}),$${availableDataCellA1}))`;
      const missedFormula = `=$${availableDataCellA1}="MISSED"`;
      const usedFormula = `=$${availableDataCellA1}="PR_USED"`;
      const availableErrorFormula = `=IF(ISERROR($${availableDataCellA1}),TRUE,REGEXMATCH(""&$${availableDataCellA1},"ERROR"))`;
      const checkboxDisableFormula = `=OR(ISBLANK($${itemDataCellA1}),NOT($${availableDataCellA1}=TRUE))`;
      const crossthroughCheckedFormula = `=$${checkboxDataCellA1}=TRUE`;
      const missableFormula = `=REGEXMATCH(${missedDataCellA1},"(^|\\n)MISSED ")`;
      
      const existingRules = this.sheet.getConditionalFormatRules();
      const removedRules = []; // not doing anything with these...yet!
      
      for (let i = existingRules.length-1; i >= 0; i--) {
        const condition = existingRules[i].getBooleanCondition();
        if (condition.getCriteriaType() !== SpreadsheetApp.BooleanCriteria.CUSTOM_FORMULA) continue;
        
        const values = condition.getCriteriaValues();
        if (!values || values.length !== 1) continue;
        
        if (values[0].match("#REF!")) {
          // Logger.log("Found conditional format rule with reference error, removing: ", values[0]);
          removedRules.push(existingRules.splice(i,1));
          continue;
        }
        
        const ranges = existingRules[i].getRanges();
        let remove = false;
        for (let j = 0; j < ranges.length && !remove; j++) {
          if (this.isColumnInRange(COLUMN.CHECK, ranges[j])) {
            remove = values[0] == checkboxDisableFormula || values[0] == crossthroughCheckedFormula;
          }
          if (!remove && this.isColumnInRange(COLUMN.PRE_REQS, ranges[j])) {
            remove = values[0] == notAvailableFormula || values[0] == availableErrorFormula;
          }
          if (!remove && this.isColumnInRange(COLUMN.ITEM, ranges[j])) {
            remove = values[0] == missableFormula;
          }
        }
        if (remove) {
          removedRules.push(existingRules.splice(i,1)[0]);
        }
      }
      
      const availableErrorRule = SpreadsheetApp.newConditionalFormatRule();
      availableErrorRule.setBackground(CONFIG.COLORS.error);
      availableErrorRule.whenFormulaSatisfied(availableErrorFormula);
      availableErrorRule.setRanges([preReqData,availableData]);
      
      const notAvailableRule = SpreadsheetApp.newConditionalFormatRule();
      notAvailableRule.setBackground(CONFIG.COLORS.notAvailable);
      notAvailableRule.whenFormulaSatisfied(notAvailableFormula);
      notAvailableRule.setRanges([preReqData,availableData]);
  
      const missedRule = SpreadsheetApp.newConditionalFormatRule();
      missedRule.setBackground(CONFIG.COLORS.missed);
      missedRule.whenFormulaSatisfied(missedFormula);
      missedRule.setRanges([preReqData,availableData]);
      notAvailableRule.setRanges([preReqData,availableData]);
      
      const usedRule = SpreadsheetApp.newConditionalFormatRule();
      usedRule.setBackground(CONFIG.COLORS.used);
      usedRule.whenFormulaSatisfied(usedFormula);
      usedRule.setRanges([preReqData,availableData]);
      
      const crossthroughCheckedRule = SpreadsheetApp.newConditionalFormatRule();
      crossthroughCheckedRule.setStrikethrough(true);
      crossthroughCheckedRule.setBackground(CONFIG.COLORS.checkedBackground);
      crossthroughCheckedRule.setFontColor(CONFIG.COLORS.checkedText);
      crossthroughCheckedRule.whenFormulaSatisfied(crossthroughCheckedFormula);
      crossthroughCheckedRule.setRanges([allDataRange]);
      
      
      const checkboxDisableRule = SpreadsheetApp.newConditionalFormatRule();
      checkboxDisableRule.setBackground(CONFIG.COLORS.disabled);
      checkboxDisableRule.setFontColor(CONFIG.COLORS.disabled);
      checkboxDisableRule.whenFormulaSatisfied(checkboxDisableFormula);
      checkboxDisableRule.setRanges([checks]);
      
      const missableRule = SpreadsheetApp.newConditionalFormatRule();
      missableRule.setBackground(CONFIG.COLORS.missable);
      missableRule.setFontColor("white");
      missableRule.whenFormulaSatisfied(missableFormula);
      missableRule.setRanges([itemDataRange]);
      
      this.sheet.setConditionalFormatRules([availableErrorRule,crossthroughCheckedRule,checkboxDisableRule,missableRule,missedRule,usedRule,notAvailableRule]);//.concat(existingRules,[notAvailableRule]));
      if (this.metaSheet && !_skipMeta) {
        META.setConditionalFormatRules(this.sheet);
      }
      timeEnd("checklist resetConditionalFormatting");
    }
    
    clearQuickFilter() {
      time("quickFilter clear");
      if (this.hasRow(ROW.QUICK_FILTER)) {
        const quickFilterCells = this.getRowRange(ROW.QUICK_FILTER, 2);
        quickFilterCells.clearContent();
      }
      timeEnd("quickFilter clear");
    }

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
    createFilter() {
      this.removeFilter();
      console.log("creating filter for rcrc ", this.headerRow, 2, this.sheet.getMaxRows()-this.headerRow,this.lastColumn-2);
      const filterRange = this.getRange(`R${this.headerRow}C1:C${this.lastColumn}`);//,1,this.sheet.getMaxRows()-this.headerRow+1,this.lastColumn);
      filterRange.createFilter();
    }

    expandAll() {
      if (this.lastRow > 1) {
        this.sheet.showRows(1,this.lastRow);
      }
      if (this.lastColumn > 1) {
        this.sheet.showColumns(1,this.lastColumn);
      }
    }

    resetCheckmarks() {
      this.getColumnDataRange(COLUMN.CHECK).uncheck();
    }

    syncNotes(range) {
      time("syncNotes");
      const itemRange = this.getColumnDataRangeFromRange(COLUMN.ITEM,range);
      const notesRange = this.getColumnDataRangeFromRange(COLUMN.NOTES,range);
      if (itemRange && notesRange) {
        itemRange.setNotes(notesRange.getValues());
      }
      timeEnd("syncNotes");
    }
    
    /* _processMetadata() {
      time("processCLMeta");
      const columnMetaFinder = this.sheet.createDeveloperMetadataFinder().withVisibility(SpreadsheetApp.DeveloperMetadataVisibility.PROJECT).withKey("column");
      const rowMetaFinder = this.sheet.createDeveloperMetadataFinder().withVisibility(SpreadsheetApp.DeveloperMetadataVisibility.PROJECT).withKey("row");
      const rawMetadata = this.sheet.getDeveloperMetadata();
      this._checklistMeta = {};
      rawMetadata.forEach(metadata => {
        // console.log("sheetMetadata [key,value,visibility]",metadata.getKey(),metadata.getValue(),metadata.getVisibility().toString());
        if (metadata.getVisibility() != SpreadsheetApp.DeveloperMetadataVisibility.PROJECT) return;
        const key = metadata.getKey();
        if (this._checklistMeta[key]) {
          console.error(`Found duplicate checklist meta: sheet=${this.sheet.getName} key=${key}`);
          this._checklistMeta[key].remove();
        }
        this._checklistMeta[key] = metadata;
        
      });
      const rawColumnMetadata = columnMetaFinder.find();
      this._columnsMeta = {};
      rawColumnMetadata.forEach(metadata => {
        // console.log("columnMetadata [key,value,visibility,column]",metadata.getKey(),metadata.getValue(),metadata.getVisibility().toString());
        const column = metadata.getValue();
        if (this._columnsMeta[column]) {
          console.error(`Found duplicate column meta: sheet=${this.sheet.getName()} column=${column}`);
          this._columnsMeta[column].remove();
        }
        this._columnsMeta[column] = metadata;
      });
      const rawRowMetadata = rowMetaFinder.find();
      this._rowsMeta = {};
      rawRowMetadata.forEach(metadata => {
        // console.log("rowMetadata [key,value,visibility,row]",metadata.getKey(),metadata.getValue(),metadata.getVisibility().toString());
        const row = metadata.getValue();
        if (this._rowsMeta[row]) {
          console.error(`Found duplicate row meta: sheet=${this.sheet.getName()} row=${row}`);
          this._rowsMeta[row].remove();
        }
        this._rowsMeta[row] = metadata;
      });
      timeEnd("processCLMeta");
      time("metaToRC");
      time("rowMetaToRC");
      Object.entries(this._rowsMeta).forEach(([key,value]) => {
        time(`rowMetaToRC ${key}`);
        this._rows[key] = value.getLocation().getRow();
        timeEnd(`rowMetaToRC ${key}`);
      });
      timeEnd("rowMetaToRC");
      time("columnMetaToRC");
      Object.entries(this._columnsMeta).forEach(([key,value]) => {
        time(`columnMetaToRC ${key}`);
        this._columns[key] = value.getLocation().getColumn();
        timeEnd(`columnMetaToRC ${key}`);
      });
      timeEnd("columnMetaToRC");
      timeEnd("metaToRC");
    }
    
    determineAndGenerateMetadata() {
      try {
        time("determineChecklistMeta");
        const oldRowsMeta = this._rowsMeta;
        const oldColumnsMeta = this._columnsMeta;
        this._rowsMeta = {};
        this._rows = {};
        this._columns = {};
        this._columnsMeta = {};
        this._headerRow = undefined;
        const numRowTypes = Object.keys(ROW_TYPES).length;
        time("determineRowMeta");
        const rowHeaders = this.sheet.getSheetValues(1,1,numRowTypes,1).map(row => row[0]);
        const rowRanges = [];
        for (let rowIndex = 1; rowIndex <= numRowTypes; rowIndex++) {
          rowRanges.push(this.sheet.getRange(`R[${rowIndex-1}]:R[${rowIndex-1}]`));
        }
        for (let i = 0; i < rowRanges.length; i++) {
          time(`determineRowMeta ${i +1}`);
          const rowRange = rowRanges[i];
          // console.log("row [i,range,vals]",[i,rowRange.getA1Notation(),rowHeaders[i-1]]);
          //rowRange.getDeveloperMetadata().forEach(metadata => metadata.getVisibility() == SpreadsheetApp.DeveloperMetadataVisibility.PROJECT && metadata.remove());
          let rowType;
          Object.values(ROW_TYPES).forEach(type => {
            // console.log("type,value",rowType,rowHeaders[i]);
            
            if (rowHeaders[i] && rowHeaders[i] == CONFIG.ROW_HEADERS[type]) {
              rowType = type;
            }
          });
          if (!rowType && i == 0) rowType = ROW_TYPES.TITLE;
          if (rowType) {
            this._rows[rowType] = rowRange;
            if (oldRowsMeta[rowType]) {
              if (oldRowsMeta[rowType].getLocation().getRow().getRow() == i+1) {
                delete oldRowsMeta[rowType]; // Don't remove it
              } else {
                time("replaceRowMeta");
                oldRowsMeta[rowType].remove();
                rowRange.addDeveloperMetadata("row",rowType,SpreadsheetApp.DeveloperMetadataVisibility.PROJECT);                
                timeEnd("replaceRowMeta");
              }
            } else {
              time("addRowMeta");
              rowRange.addDeveloperMetadata("row",rowType,SpreadsheetApp.DeveloperMetadataVisibility.PROJECT);
              timeEnd("addRowMeta");
            }
          }
          timeEnd(`determineRowMeta ${i+1}`);
        }
        timeEnd("determineRowMeta");
        this._isChecklist = !!this._rows[ROW_TYPES.HEADERS];
        if (this._checklistMeta.isChecklist) {
          time("setIsMeta");
          this._checklistMeta.isChecklist.setValue(this._isChecklist.toString());
          timeEnd("setIsMeta");
        } else {
          time("addIsMeta");
          this.sheet.addDeveloperMetadata("isChecklist",this._isChecklist.toString(),SpreadsheetApp.DeveloperMetadataVisibility.PROJECT);
          timeEnd("addIsMeta");
        }
        if (this._isChecklist) {
          time("determineColumnMeta");
          const columnHeaders = this._rows[ROW_TYPES.HEADERS].getValues()[0];
          const columnRanges = [];
          for (let columnIndex = 1; columnIndex <= this.sheet.getLastColumn(); columnIndex++) {
            columnRanges.push(this.sheet.getRange(`C[${columnIndex-1}]:C[${columnIndex-1}]`));
          }
          for (let i = 0; i < columnRanges.length; i++) {
            time(`determineColumnMeta ${i+1}`);
            const columnRange = columnRanges[i];
            //columnRange.getDeveloperMetadata().forEach(metadata => metadata.getVisibility() == SpreadsheetApp.DeveloperMetadataVisibility.PROJECT && metadata.remove());
            if (columnHeaders[i]) {
              if (oldColumnsMeta[columnHeaders[i]]) {
                if (oldColumnsMeta[columnHeaders[i]].getLocation().getColumn().getColumn() == i+1) {
                  delete oldColumnsMeta[columnHeaders[i]];
                } else {
                  time("replaceColumnMeta");
                  columnRange.addDeveloperMetadata("column",columnHeaders[i],SpreadsheetApp.DeveloperMetadataVisibility.PROJECT);
                  timeEnd("replaceColumnMeta");
                }
                
              } else {
                time("addColumnMeta");
                columnRange.addDeveloperMetadata("column",columnHeaders[i],SpreadsheetApp.DeveloperMetadataVisibility.PROJECT);
                timeEnd("addColumnMeta");
              }
              this._columns[columnHeaders[i]] = columnRange;
              Object.entries(CONFIG.COLUMN_HEADERS).forEach(([key,value]) => {
                if (columnHeaders[i] == value) {
                  if (oldColumnsMeta[key]) {
                    if (oldColumnsMeta[key].getLocation().getColumn().getColumn() == i+1) {
                      delete oldColumnsMeta[key];
                    } else {
                      time("replaceColumnIdMeta");
                      columnRange.addDeveloperMetadata("column",key,SpreadsheetApp.DeveloperMetadataVisibility.PROJECT);
                      timeEnd("replaceColumnIdMeta");
                    }
                  } else {
                    time("addColumnIdMeta");
                    columnRange.addDeveloperMetadata("column",key,SpreadsheetApp.DeveloperMetadataVisibility.PROJECT);
                    timeEnd("addColumnIdMeta");
                  }
                  this._columns[key] = columnRange;
                }
              });
            }
            timeEnd(`determineColumnMeta ${i+1}`);
          }
          timeEnd("determineColumnMeta");
        }
        time("removeOldMeta");
        Object.values(oldRowsMeta).forEach(metadata => metadata.remove());
        Object.values(oldColumnsMeta).forEach(metadata => metadata.remove());
        timeEnd("removeOldMeta");
      } finally {
        // Since creating metadata doesn't return references (horrible), run process afterwards
        // this._processMetadata();
        timeEnd("determineChecklistMeta");
      }
    } */

    
  }

  Object.defineProperty(Checklist,"COLUMN",{
    value: COLUMN_TYPES,
    writable: false,
  });
  Object.defineProperty(Checklist,"ROW",{
    value: ROW_TYPES,
    writable: false,
  });
  const COLUMN = Checklist.COLUMN;
  const ROW = Checklist.ROW;
  return Checklist;

})();

/* eslint-disable */
function testChecklist() {
  time();
  const sheet = Checklist.getActiveSheet();
  // time(["createFinder","startMetadata"]);
  // const finder = sheet.createDeveloperMetadataFinder();
  // timeEnd("createFinder");
  // time("findMeta");
  // const meta = finder.withKey("column.check").withVisibility(SpreadsheetApp.DeveloperMetadataVisibility.PROJECT).find();
  // timeEnd(["findMeta","startMetadata"])
  // time("logMeta");
  // console.log(meta);
  // timeEnd("logMeta");
  // time("getMetaLocation");
  // const metaLocation = meta[0].getLocation();
  // timeEnd("getMetaLocation");
  // time("getMetaRange");
  // const r = metaLocation.getColumn();
  // timeEnd("getMetaRange");
  // time("logMetaRange");
  // console.log(r);
  // timeEnd("logMetaRange");
  // time("getAndLogMetaRangeColumn");
  // console.log(r.getColumn());
  // timeEnd("getAndLogMetaRangeColumn");

  // const checkr = sheet.getRange("C1:C[0]");
  // // checkr.addDeveloperMetadata("column.check",SpreadsheetApp.DeveloperMetadataVisibility.PROJECT);
  // console.log(sheet.getDeveloperMetadata());
  console.time("createChecklist");
  const cl = new Checklist(sheet);
  console.timeEnd("createChecklist");
  console.time("determine");
  // cl.determineAndGenerateMetadata();
  console.timeEnd("determine");
  time("retVal");
  const retVal = [cl, cl.columns, cl.rows, cl.columnsByHeader, cl.firstDataRow, cl.headerRow, cl.metaSheet && cl.metaSheet.getName()];
  timeEnd("retVal");
  timeEnd();
  return retVal;
}