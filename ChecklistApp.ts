/* exported ChecklistApp */
// eslint-disable-next-line no-redeclare
const ChecklistApp = (function(){

  enum COLUMN {
    CHECK= "CHECK",
    TYPE= "TYPE",
    ITEM= "ITEM",
    NOTES= "NOTES",
    PRE_REQS= "PRE_REQS",
    STATUS= "STATUS",
  }
  type column = number|COLUMN

  enum ROW {
    TITLE= "TITLE",
    SETTINGS= "SETTINGS",
    QUICK_FILTER= "QUICK_FILTER",
    HEADERS= "HEADERS",
  }
  enum STATUS {
    CHECKED= "CHECKED",
    AVAILABLE= "TRUE",
    MISSED= "MISSED",
    PR_USED= "PR_USED",
    PR_NOT_MET= "FALSE",
    UNKNOWN= "UNKNOWN",
    ERROR= "ERROR",
  }
  
  const COLUMN_HEADERS = Object.freeze({
    [COLUMN.CHECK]: "✓",
    [COLUMN.TYPE]: "Type",
    [COLUMN.ITEM]: "Item",
    [COLUMN.PRE_REQS]: "Pre-Reqs",
    [COLUMN.STATUS]: "Available",
    [COLUMN.NOTES]: "Notes",
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

  const ROW_HEADERS = Object.freeze({
    [ROW.QUICK_FILTER]: "Filter",
    [ROW.SETTINGS]: "⚙",
    [ROW.HEADERS]: "✓",
  });

  const MAX_EMPTY_ROWS = 100;

  class ChecklistAppError extends Error {}

  const checklists = {};
  class ChecklistApp {
    constructor() {
      throw new ChecklistAppError("App should not be created with new, use the class directly");
    }
    // APP SECTION
    static getChecklistBySheet(sheet: Sheet = ChecklistApp.getActiveSheet()) {
      const sheetId = sheet.getSheetId();
      if (!checklists[sheetId]) {
        checklists[sheetId] = new (getChecklist())(sheet);
      }
      return checklists[sheetId];
    }

    static getChecklistByMetaSheet(metaSheet: Sheet) {
      const metaDevMeta = metaSheet.createDeveloperMetadataFinder().withKey("metaForSheet").withVisibility(SpreadsheetApp.DeveloperMetadataVisibility.PROJECT).find();
      if (metaDevMeta && metaDevMeta[0]) {
        const sheet = metaSheet.getParent().getSheetByName(metaDevMeta[0].getValue());
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

    static get activeSheet(): Sheet {
      return ChecklistApp.getActiveSheet();
    }

    static set activeSheet(sheet: Sheet) {
      ChecklistApp.setActiveSheet(sheet);
    }

    static getActiveSheet():Sheet {
      return SpreadsheetApp.getActiveSheet();
    }

    static setActiveSheet(sheet: Sheet) {
      if (ChecklistApp.getActiveSheet().getSheetId() !== sheet.getSheetId()) {
        sheet.activate();
        SpreadsheetApp.setActiveSheet(sheet);
        sheet.getParent().setActiveSheet(sheet);
      }
    }
    // END APP SECTION

    static readonly ROW = ROW;

    static readonly COLUMN = COLUMN;

    static readonly STATUS = STATUS;
  }

  

  let _Checklist;
  function getChecklist() {
    // loaded at runtime so SheetBase ordering not important
    if (!_Checklist) {
      class ChecklistError extends SheetBase.ChecklistSheetError {}
      class Checklist extends SheetBase {
        constructor(sheet: Sheet) {
          super(sheet,COLUMN_HEADERS,ROW_HEADERS);
          // Object.defineProperty(this,"sheet",{value: sheet});
        }
    
        // PROPERTIES SECTION

        private _title: string
        private _titleColumn: number
        get title(): string {
          if (typeof this._title == "undefined") {
            const titleValues = this.getRowValues(ROW.TITLE, 2);
            const titleIndex = titleValues.findIndex(value => value);
            this._title = titleIndex >= 0 ? titleValues[titleIndex] as string : null;
            this._titleColumn = titleIndex >= 0 ? titleIndex + 2 : 3;
          }
          return this._title;
        }

        set title(newTitle: string) {
          if (newTitle != this.title) {
            this._title = newTitle;
            this.setValue(ROW.TITLE,this._titleColumn,newTitle);
          }
        }
    
        get isChecklist(): boolean {
          return !!this.rows[ROW.HEADERS];
        }

        get headerRow(): number {
          return this.rows[ROW.HEADERS] || super.headerRow;
        }

        get rows(): {[x:string]: number} {
          const rows = super.rows;
          if (!rows[ROW.TITLE] && !Object.values(rows).includes(1)) rows[ROW.TITLE] = 1;
          return rows;
        }

        private _metaSheet: Sheet;
        get metaSheet(): Sheet {
          if (typeof this._metaSheet == "undefined") {
            time("get metaSheet");
            let metaSheet;
            const devMeta = this.sheet.createDeveloperMetadataFinder().withKey("metaSheet").withVisibility(SpreadsheetApp.DeveloperMetadataVisibility.PROJECT).find();
            if (devMeta && devMeta[0]) {
              metaSheet = this.sheet.getParent().getSheetByName(devMeta[0].getValue());
              if (!metaSheet) {
                const metaDevMeta = this.sheet.getParent().createDeveloperMetadataFinder().withKey("metaForSheet").withValue(this.sheet.getName()).withVisibility(SpreadsheetApp.DeveloperMetadataVisibility.PROJECT).find();
                if (metaDevMeta && metaDevMeta[0]) {
                  metaSheet = metaDevMeta[0].getLocation().getSheet();
                  this.metaSheet = metaSheet; // run setter to set metadata
                }
              }
            }
            if (!metaSheet) {
              metaSheet = this.sheet.getParent().getSheetByName(this.sheet.getName() + " Meta");
              if (metaSheet) {
                this.metaSheet = metaSheet; // run setter to set metadata
              }
            }
            if (!metaSheet) metaSheet = null;
            this._metaSheet = metaSheet;
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
        createMetaSheet(name = this.name + " Meta") {
          this.metaSheet = this.spreadsheet.insertSheet(name, this.sheet.getIndex());
          this.activate(); // creating the new sheet activates it
        }
        get meta() {
          return this.metaSheet && ChecklistMeta.getFromChecklist(this);
        }
        get editable () {
          return super.editable;
        }
        set editable(isEditable) {
          super.editable = isEditable;
          if (!isEditable) {
            const editableRanges = [];
            if (this.hasRow(ROW.QUICK_FILTER)) {
              editableRanges.push(this.getUnboundedRowRange(ChecklistApp.ROW.QUICK_FILTER));
            }
            if (this.hasRow(ROW.SETTINGS)) {
              editableRanges.push(this.getUnboundedRowRange(ChecklistApp.ROW.SETTINGS));
            }
            if (this.hasColumn(ChecklistApp.COLUMN.CHECK)) {
              editableRanges.push(this.getUnboundedColumnDataRange(ChecklistApp.COLUMN.CHECK));
            }
            const protection = this.sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0];
            protection.setUnprotectedRanges(editableRanges);
          }
          this.meta && this.meta.setEditable(isEditable);
        }

        private _settings
        get settings() {
          if (!this._settings) {
            this._settings = ChecklistSettings.getSettingsForChecklist(this);
          }
          return this._settings;
        }
        // END PROPERTY SECTIONS

        // Handlers
        handleEdit(event: GoogleAppsScript.Events.SheetsOnEdit): void {
          time("checklist handleEdit");
          const range = event.range;
          
          time("quickFilterChange");
          if (this.isRowInRange(ROW.QUICK_FILTER,range)) {
            this.quickFilterChange(event);
            if (range.getNumRows() == 1) {
              timeEnd("quickFilterChange","checklist handleEdit");
              return;
            }
          }
          timeEnd("quickFilterChange");
          
          
          time("updateSettings");
          if (this.isRowInRange(ROW.SETTINGS, range)) {
            ChecklistSettings.handleChange(event);
            if (range.getNumRows() == 1) {
              timeEnd("updateSettings","checklist handleEdit");
              return;
            }
          }
          timeEnd("updateSettings");
          
          time("populateAvailable");
          if (this.isColumnInRange([COLUMN.PRE_REQS, COLUMN.ITEM, COLUMN.STATUS], range)) {
            StatusTranspiler.validateAndGenerateStatusFormulasForChecklist(this);
          }
          timeEnd("populateAvailable");
          
          time("reapplyFilter");
          if (this.isColumnInRange([COLUMN.CHECK, COLUMN.PRE_REQS],range) || 
          this.isRowInRange(ROW.QUICK_FILTER,range)) {
            this.refreshFilter();
          }
          timeEnd("reapplyFilter");
          
          time("moveNotes");
          if (this.isColumnInRange(COLUMN.NOTES,range)) {
            this.syncNotes(range);
          }
          timeEnd("moveNotes");
          
          time("checkFilterSize");
          if (!event.value && !event.oldValue) {
            // was more than a cell change, 
            this.ensureFilterSize();
          }
          timeEnd("checkFilterSize");
          
          time("updateTotals");
          if (this.isColumnInRange([COLUMN.CHECK,COLUMN.ITEM],range)) {
            this.ensureTotalFormula();
          }
          timeEnd("updateTotals");
          
          timeEnd("checklist handleEdit");
        }
        // /Handlers

        // Settings section
        getSetting(setting: string): string {
          return this.settings.getSetting(setting);
        }

        setSetting(setting: string, value: string): void {
          this.settings.setSetting(setting, value);
        }

        resetSetting(_oldMode: string): void {
          this.setSetting(ChecklistSettings.SETTING.MODE,_oldMode);
          this.settings.setDataValidation();
        }

        // END Settings Section

        // NOTES SECTION
        syncNotes(range: Range = undefined): void {
          time("syncNotes");
          const itemRange = this.getColumnDataRangeFromRange(COLUMN.ITEM,range);
          const notesRange = this.getColumnDataRangeFromRange(COLUMN.NOTES,range);
          if (itemRange && notesRange) {
            itemRange.setNotes(notesRange.getValues());
          }
          timeEnd("syncNotes");
        }
        // NOTES SECTION

        // META SECTION
        syncMeta(): void {
          this.meta && this.meta.syncWithChecklist();
        }
        // END META SECTION

        // RESET/INIT/STRUCTURE SECTION

        reset(_resetData: boolean = false): void {
          time("checklist reset");
          const type = !this.isChecklist ? "Initializing" : _resetData ? "Resetting" : "Refreshing";
          
          const toastTitle = `${type} Checklist`;
          const toastMessage = `${type}...`;
          const previousMode = this.getSetting(ChecklistSettings.SETTING.MODE); // Preserve mode
          
          this.toast(toastMessage, toastTitle, -1);
          Logger.log(`${type} checklist "${this.sheet.getName()}"`);
          
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

          time("removeNotes");
          this.removeNotes();
          timeEnd("removeNotes");
          
          
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
          
          if (this.meta) {
            this.meta.syncWithChecklist(toastTitle);
            this.toast(toastMessage, toastTitle, -1);
          }
          
          // Create new filter
          time("filterCreate");
          this.createFilter();
          timeEnd("filterCreate");
          
          time("totals");
          this.ensureTotalFormula();
          timeEnd("totals");
          
          time("settings");
          this.resetSetting(previousMode);
          
          timeEnd("settings");
          
          this.toast("Done!", toastTitle,5);
          timeEnd("checklist reset");
          
        }

        // STRUCTURE UTILITIES

        insertColumn(columnIndex: number): void {
          super.insertColumn(columnIndex);
          if (columnIndex < this.lastColumn) {
            [ROW.TITLE, ROW.SETTINGS].forEach(rowType =>{
              if (this.hasRow(rowType)) {
                const shiftedRange = this.getRowRange(rowType, columnIndex+1);
                shiftedRange.moveTo(shiftedRange.offset(0,-1));
              }
            });
          }
        }

        ensureCheckColumn(): void {
          this.ensureColumn(COLUMN.CHECK,1);
        }

        ensureTypeColumn(): void {
          this.ensureColumn(COLUMN.TYPE,this._determineLastNamedColumn(COLUMN.CHECK) + 1);
        }

        ensureItemColumn(): void {
          this.ensureColumn(COLUMN.ITEM, this._determineLastNamedColumn(COLUMN.TYPE,COLUMN.CHECK) + 1);
        }

        ensurePreReqsColumn(): void {
          this.ensureColumn(COLUMN.PRE_REQS, this._determineLastNamedColumn(COLUMN.ITEM,COLUMN.TYPE,COLUMN.CHECK) + 1);
        }

        ensureNotesColumn(): void {
          this.ensureColumn(COLUMN.NOTES, this._determineLastNamedColumn(COLUMN.PRE_REQS,COLUMN.ITEM,COLUMN.TYPE,COLUMN.CHECK) + 1);
        }

        ensureStatusColumn(): void {
          this.ensureColumn(COLUMN.STATUS);
        }

        isColumnHidden(column: column): boolean {
          return this.sheet.isColumnHiddenByUser(this.toColumnIndex(column));
        }

        ensureTitleRow(): void {
          this.ensureHeaderRow();
          this.ensureRow(ROW.TITLE,1);
        }

        ensureSettingsRow(): void {
          this.ensureHeaderRow();
          this.ensureRow(ROW.SETTINGS);
        }

        ensureHeaderRow(): void {
          this.ensureRow(ROW.HEADERS, this._determineLastNamedRow(ROW.TITLE,ROW.SETTINGS,ROW.QUICK_FILTER) + 1);
        }

        toggleQuickFilterRow(show:boolean = !this.hasRow(ROW.QUICK_FILTER)): void {
          const hasQuickFilter = this.hasRow(ROW.QUICK_FILTER);
          if (hasQuickFilter && !show) {
            this._removeRow(ROW.QUICK_FILTER);
            for (let column = 2; column <= this.lastColumn; column++) {
              const criteria = this.filter && this.filter.getColumnFilterCriteria(column);
              if (criteria && criteria.getCriteriaType() == SpreadsheetApp.BooleanCriteria.CUSTOM_FORMULA) {
                this.filter.removeColumnFilterCriteria(column);
              }
            }
          } else if (!hasQuickFilter && show) {
            this.ensureRow(ROW.QUICK_FILTER);
            const filterValueRange: Range & {getBackgroundObject?: () => GoogleAppsScript.Spreadsheet.Color} = this.getRowRange(ChecklistApp.ROW.QUICK_FILTER, 2);
            const color = filterValueRange.getBackgroundObject().asRgbColor().asHexString(); // Type not updated?
            // HACK lighten the color
            const r = parseInt(color.slice(1,3),16);
            const g = parseInt(color.slice(3,5),16);
            const b = parseInt(color.slice(5,7),16);
            const newR = Math.floor((r+255)/2);
            const newG = Math.floor((g+255)/2);
            const newB = Math.floor((b+255)/2);
            const newColor = "#" + newR.toString(16) + newG.toString(16) + newB.toString(16);
            filterValueRange.setBackground(newColor);
          }
          if (!this.editable) {
            this.editable = false;
          }
        }


        trim(): void {
          time("trim checklist");
          const itemValues = this.getColumnDataValues(COLUMN.ITEM);
          const firstRow = this.firstDataRow;
          let lastItemRow;
          for (lastItemRow = itemValues.length - 1 + firstRow; lastItemRow >= firstRow; lastItemRow--) {
            if (itemValues[lastItemRow-firstRow]) break;
          }
          if (this.maxRows - lastItemRow > MAX_EMPTY_ROWS) {
            this.sheet.deleteRows(lastItemRow + MAX_EMPTY_ROWS + 1, this.maxRows - lastItemRow - MAX_EMPTY_ROWS);
          }
          if (this.lastColumn != this.maxColumns) {
            this.sheet.deleteColumns(this.lastColumn+1,this.maxColumns-this.lastColumn);
          }
          if (this.maxRows == this.headerRow) {
            this.sheet.insertRowAfter(this.headerRow);
          }
          timeEnd("trim checklist");
        }

        // END STRUCTURE UTILITIES

        resetCheckmarks(): void {
          this.setColumnDataValues(COLUMN.CHECK, this.getColumnDataValues(COLUMN.CHECK).map(() => false));
        }
        
        removeNotes(): void {
          this.getRange(1,1,this.maxRows,this.maxColumns).clearNote();
        }

        // DATA VALIDATION UTILITIES
        removeValidations(): void {
          this.getRange(1,1,this.maxRows,this.maxColumns).setDataValidation(null);
        }

        resetDataValidation(_skipMeta: boolean = false): void {
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
          const itemDataValidation = SpreadsheetApp.newDataValidation();
          itemDataValidation.setAllowInvalid(true);
          itemDataValidation.requireFormulaSatisfied(itemDataValidationFormula);
          itemDataRange.setDataValidation(itemDataValidation);

          this.getUnboundedColumnDataRange(COLUMN.PRE_REQS).setDataValidation(SpreadsheetApp.newDataValidation()
            .setAllowInvalid(true)
            .requireValueInRange(itemDataRange,true)
          );
          
      
          if (!_skipMeta && this.meta) {
            this.meta.updateChecklistDataValidation();
          }
          timeEnd("checklist resetDataValidation");
        }
        // END DATA VALIDATION UTILITIES

        // CONDITIONAL FORMATTING UTILITIES
        resetConditionalFormatting(_skipMeta: boolean = false): void {
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
          if (!_skipMeta && this.metaSheet) {
            this.meta.updateChecklistConditionalFormatting();
          }
          timeEnd("checklist resetConditionalFormatting");
        }
        // END CONDITIONAL FORMATTING UTILITIES
        // RESET/INIT/STRUCTURE SECTION

        // FILTER SECTION
        removeFilter(): void {
          if (this.filter) this.filter.remove();
        }
        refreshFilter(): void {
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
        createFilter(_oldFilter: Filter = undefined): void {
          this.removeFilter();
          const filterRange = this.getUnboundedRange(this.headerRow, 1, null, this.lastColumn);//,1,this.maxRows-this.headerRow+1,this.lastColumn);
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
        ensureFilterSize(): void {
          const filterRange = this.filter.getRange();
          if (filterRange.getRow()        != this.headerRow 
          ||  filterRange.getColumn()     != 1 
          ||  filterRange.getLastRow()    != this.maxRows 
          ||  filterRange.getLastColumn() != this.lastColumn) {
            this.toast("Please wait...","Expanding Filter",-1);
            this.createFilter(this.filter);
            this.toast("Done!", "ExpandingFilter");
          }
        }
        // END FILTER SECTION

        // QUICK FILTER SECTION
        clearQuickFilterValues(): void {
          time("QUICK_FILTER clear");
          if (this.hasRow(ROW.QUICK_FILTER)) {
            const quickFilterCells = this.getRowRange(ROW.QUICK_FILTER, 2);
            quickFilterCells.clearContent();
          }
          timeEnd("QUICK_FILTER clear");
        }
        quickFilterChange(event: EditEvent): void {
          time("quickFilterChange");
          const {REGEXMATCH,A1,VALUE} = FORMULA;
          const range = event.range;
  
          const firstChangedColumn = range.getColumn();
          const lastChangedColumn = range.getLastColumn();
          const changedValues = this.getRowValues(ROW.QUICK_FILTER,range.getColumn(), range.getNumColumns());
          for (let column = firstChangedColumn; column <= lastChangedColumn; column++) {
            if (column == 1) continue; // First column is header
            const changedValue = changedValues[column-firstChangedColumn];
            const existingCriteria = this.filter.getColumnFilterCriteria(column);
            if (changedValue) {
              let criteria: GoogleAppsScript.Spreadsheet.FilterCriteriaBuilder;
              if (criteria) {
                criteria = existingCriteria.copy();
              } else {
                criteria = SpreadsheetApp.newFilterCriteria();
              }
              // const filterRange = checklist.getColumnDataRange(column);
              const prettyPrint = FORMULA.togglePrettyPrint(false);
              criteria.whenFormulaSatisfied(FORMULA(REGEXMATCH(A1(this.firstDataRow,column,null,column),VALUE("(?mis:"+ changedValue +")"))));
              FORMULA.togglePrettyPrint(prettyPrint);
              this.filter.setColumnFilterCriteria(column, criteria);
            } else {
              if (existingCriteria && existingCriteria.getCriteriaType() == SpreadsheetApp.BooleanCriteria.CUSTOM_FORMULA) {
                // Remove it, but don't remove the hiddenValues criteria
                if (existingCriteria.getHiddenValues()) {
                  this.filter.setColumnFilterCriteria(column, SpreadsheetApp.newFilterCriteria().setHiddenValues(existingCriteria.getHiddenValues()));
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
        ensureTotalFormula(): void {
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
      Object.defineProperty(Checklist,"ChecklistError", {value: ChecklistError});
      _Checklist = Checklist;
    }
    return _Checklist;
  }
                    
  return ChecklistApp;
                    
})();
                  