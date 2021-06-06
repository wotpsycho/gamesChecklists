// eslint-disable-next-line @typescript-eslint/no-unused-vars
namespace ChecklistApp {
  // export import Cell = GoogleAppsScript.Spreadsheet.Range;
  export type EditEvent = GoogleAppsScript.Events.SheetsOnEdit;
  export type DeveloperMetadata = GoogleAppsScript.Spreadsheet.DeveloperMetadata;

  export enum COLUMN {
    CHECK= "CHECK",
    TYPE= "TYPE",
    ITEM= "ITEM",
    NOTES= "NOTES",
    PRE_REQS= "PRE_REQS",
    STATUS= "STATUS",
  }
  export type column = number|COLUMN|string; // byHeader column is valid, so strings are valid
  
  export enum ROW {
    TITLE= "TITLE", 
    SETTINGS= "SETTINGS",
    QUICK_FILTER= "QUICK_FILTER",
    HEADERS= "HEADERS",
  }
  export type row = ROW | number;
  export type dataRow = number;
  export enum STATUS {
    CHECKED= "CHECKED",
    AVAILABLE= "TRUE",
    MISSED= "MISSED",
    PR_USED= "PR_USED",
    PR_NOT_MET= "FALSE",
    UNKNOWN= "UNKNOWN",
    ERROR= "ERROR",
  }
  
  const COLUMN_HEADERS:Readonly<{[x in COLUMN]:string}> = {
    [COLUMN.CHECK]: "✓",
    [COLUMN.TYPE]: "Type",
    [COLUMN.ITEM]: "Item",
    [COLUMN.PRE_REQS]: "Pre-Reqs",
    [COLUMN.STATUS]: "Available",
    [COLUMN.NOTES]: "Notes",
  };
  export const FINAL_ITEM_TYPE = "Game Complete";

  
  const COLOR = {
    ERROR: "#ff0000",
    UNAVAILABLE: "#fce5cd",
    MISSED: "#f4cccc",
    USED: "#ead1dc",
    DISABLED: "#d9d9d9",
    CHECKED_BG: "#d9ead3",
    CHECKED_TEXT: "#666666",
    MISSABLE: "#990000",
    INFO_NOTE: "#4a86e8",
    WARN_NOTE: "#dd0000",
    WHITE: "white",
    BLACK: "black",
  } as const;
  
  const ROW_HEADERS:Readonly<{[x in ROW]?: string}> = {
    [ROW.QUICK_FILTER]: "Filter",
    [ROW.SETTINGS]: "⚙",
    [ROW.HEADERS]: "✓",
  };
  
  const MAX_EMPTY_ROWS:number = 100;
  
  // const checklists:{[x:number]:Checklist} = {};
  // APP SECTION
  export function getChecklistBySheet(sheet: Sheet = ChecklistApp.getActiveSheet()): Checklist {
    return Checklist.fromSheet(sheet);
  }
  
  export function getChecklistByMetaSheet(metaSheet: Sheet): Checklist {
    const metaDevMeta:DeveloperMetadata[] = metaSheet.createDeveloperMetadataFinder().withKey("metaForSheet").withVisibility(SpreadsheetApp.DeveloperMetadataVisibility.PROJECT).find();
    if (metaDevMeta && metaDevMeta[0]) {
      const sheet:Sheet = metaSheet.getParent().getSheetByName(metaDevMeta[0].getValue());
      if (sheet) {
        const checklist:Checklist = ChecklistApp.getChecklistBySheet(sheet);
        checklist.metaSheet = metaSheet;
        return checklist;
      }
    }
  }
  
  export function getActiveChecklist(): Checklist {
    return ChecklistApp.getChecklistBySheet(ChecklistApp.getActiveSheet());
  }
  
  export function getActiveSheet():Sheet {
    return SpreadsheetApp.getActiveSheet();
  }
  
  export function setActiveSheet(sheet: Sheet): void {
    if (ChecklistApp.getActiveSheet().getSheetId() !== sheet.getSheetId()) {
      sheet.activate();
      SpreadsheetApp.setActiveSheet(sheet);
      sheet.getParent().setActiveSheet(sheet);
    }
  }
  // END APP SECTION
  
  export class Checklist extends ChecklistApp.SheetBase {
    private requestId:string = Date.now().toString()
    private constructor(sheet: Sheet) {
      super(sheet,COLUMN_HEADERS,ROW_HEADERS);
      time("cacheRequestId");
      CacheService.getScriptCache().put("latestRequestId",this.requestId,60);
      timeEnd("cacheRequestId");
    }
    private static readonly checklists:{[x:number]:Checklist} = {}
    static fromSheet(sheet: Sheet): Checklist {
      const sheetId:number = sheet.getSheetId();
      if (!this.checklists[sheetId]) {
        this.checklists[sheetId] = new Checklist(sheet);
      }
      return this.checklists[sheetId];
    }
    
    // PROPERTIES SECTION
    private _title: string
    private _titleColumn: number
    get title(): string {
      if (typeof this._title == "undefined") {
        const titleValues:sheetValue[] = this.getRowValues(ROW.TITLE, 2);
        const titleIndex:number = titleValues.findIndex(value => value);
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

    protected get columns(): {[x in COLUMN]?: number} {
      return super.columns;
    }
    
    protected get rows(): {[x in ROW]?: number} {
      const rows:{[x in ROW]?: number} = super.rows;
      if (!rows[ROW.TITLE] && !Object.values(rows).includes(1)) rows[ROW.TITLE] = 1;
      return rows;
    }
    
    private _metaSheet: Sheet;
    get metaSheet(): Sheet {
      if (typeof this._metaSheet == "undefined") {
        time("get metaSheet");
        let metaSheet:Sheet;
        const devMeta:DeveloperMetadata[] = this.sheet.createDeveloperMetadataFinder().withKey("metaSheet").withVisibility(SpreadsheetApp.DeveloperMetadataVisibility.PROJECT).find();
        if (devMeta && devMeta[0]) {
          metaSheet = this.sheet.getParent().getSheetByName(devMeta[0].getValue());
          if (!metaSheet) {
            const metaDevMeta:DeveloperMetadata[] = this.sheet.getParent().createDeveloperMetadataFinder().withKey("metaForSheet").withValue(this.sheet.getName()).withVisibility(SpreadsheetApp.DeveloperMetadataVisibility.PROJECT).find();
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
    set metaSheet(metaSheet: Sheet) {
      time("set metaSheet");
      this._metaSheet = metaSheet;
      const devMeta:DeveloperMetadata[] = this.sheet.createDeveloperMetadataFinder().withKey("metaSheet").withVisibility(SpreadsheetApp.DeveloperMetadataVisibility.PROJECT).find();
      if (devMeta && devMeta[0]) {
        devMeta[0].setValue(this._metaSheet.getName());
      } else {
        this.sheet.addDeveloperMetadata("metaSheet",this._metaSheet.getName(), SpreadsheetApp.DeveloperMetadataVisibility.PROJECT);
      }
      const metaDevMeta:DeveloperMetadata[] = metaSheet.createDeveloperMetadataFinder().withKey("metaForSheet").withVisibility(SpreadsheetApp.DeveloperMetadataVisibility.PROJECT).find();
      if (metaDevMeta && metaDevMeta[0]) {
        devMeta[0].setValue(this.sheet.getName());
      } else {
        metaSheet.addDeveloperMetadata("metaForSheet", this.sheet.getName(), SpreadsheetApp.DeveloperMetadataVisibility.PROJECT);
      }
      timeEnd("set metaSheet");
    }
    createMetaSheet(name = this.name + " Meta"): void {
      this.metaSheet = this.spreadsheet.insertSheet(name, this.sheet.getIndex());
      this.activate(); // creating the new sheet activates it
    }
    get id ():number { 
      return this.sheetId;
    }
    get meta(): ChecklistMeta.MetaSheet {
      return this.metaSheet && ChecklistMeta.getFromChecklist(this);
    }
    get editable (): boolean {
      return super.editable;
    }
    set editable(isEditable: boolean) {
      const changed = this.editable != isEditable;
      super.editable = isEditable;
      if (!isEditable) {
        const editableRanges:Range[] = [];
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
      if (changed) this.resetDataValidation();
    }
    
    get settings(): Settings.ChecklistSettings {
      return Settings.ChecklistSettings.getSettingsForChecklist(this);
    }

    get isLatest():boolean {
      time("getCachedRequestId");
      const cachedRequestId = CacheService.getScriptCache().get("latestRequestId");
      timeEnd("getCachedRequestId");
      return cachedRequestId == this.requestId;
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
        this.settings.handleChange(event);
        if (range.getNumRows() == 1) {
          timeEnd("updateSettings","checklist handleEdit");
          return;
        }
      }
      timeEnd("updateSettings");
      
      time("populateAvailable");
      if (this.isColumnInRange([COLUMN.PRE_REQS, COLUMN.ITEM, COLUMN.STATUS], range)) {
        Status.validateAndGenerateStatusFormulasForChecklist(this);
        Status.addLinksToPreReqs(this, range.getRowIndex(), range.getLastRow());
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
        this.syncNotes();
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
    getSetting(setting: Settings.SETTING): string {
      return this.settings.getSetting(setting);
    }
    
    setSetting(setting: Settings.SETTING, value: string): void {
      this.settings.setSetting(setting, value);
    }
    
    resetSetting(_oldMode: string): void {
      this.setSetting(Settings.SETTING.MODE,_oldMode);
      this.settings.setDataValidation();
    }
    
    // END Settings Section
    
    // NOTES SECTION
    syncNotes(): void {
      time("syncNotes");
      this.getColumnDataRange(COLUMN.ITEM).setNotes(this.getColumnDataRange(COLUMN.NOTES).getValues());
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
      const previousMode = this.getSetting(Settings.SETTING.MODE); // Preserve mode
      
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
      
      time("quickFilter");
      this.clearQuickFilterValues();
      timeEnd("quickFilter");
      
      time("dataValidation");
      this.resetDataValidation(true);
      timeEnd("dataValidation");
      
      Status.validateAndGenerateStatusFormulasForChecklist(this);
      Status.addLinksToPreReqs(this);

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
        const filterValueRange: Range = this.getRowRange(ROW.QUICK_FILTER, 2);
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
        Object.entries(this.meta.getColumnDataValidations()).forEach(([columnName, dataValidation]) => {
          filterValueRange.getCell(1,this.toColumnIndex(columnName) - 1).setDataValidation(dataValidation);
        });
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
      const filter = this.filter;
      if (filter) this.removeFilter();
      this.getRange(1,1,this.maxRows,this.maxColumns).setDataValidation(null);
      if (filter) this.createFilter(filter);
    }
    
    resetDataValidation(_skipMeta: boolean = false): void {
      time("checklist resetDataValidation");
      const filter = this.filter;
      if (filter) this.removeFilter();
      const {FORMULA,COUNTIF,A1,CONCAT,VALUE,LT} = Formula;
      const checks = this.getUnboundedColumnDataRange(COLUMN.CHECK);
      checks.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
      // Set Item validation
      const itemDataRange = this.getUnboundedColumnDataRange(COLUMN.ITEM);
      const preReqDataRange = this.getUnboundedColumnDataRange(COLUMN.PRE_REQS);
      if (this.editable) {
        const prettyPrint = Formula.togglePrettyPrint(false);
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
        Formula.togglePrettyPrint(prettyPrint);
        const itemDataValidation = SpreadsheetApp.newDataValidation();
        itemDataValidation.setAllowInvalid(true);
        itemDataValidation.requireFormulaSatisfied(itemDataValidationFormula);
        itemDataRange.setDataValidation(itemDataValidation);
              
        preReqDataRange.setDataValidation(SpreadsheetApp.newDataValidation()
          .setAllowInvalid(true)
          .requireValueInRange(itemDataRange,true)
        );
      } else {
        itemDataRange.clearDataValidations();
        preReqDataRange.clearDataValidations();
      }
              
              
      if (!_skipMeta && this.meta) {
        this.meta.updateChecklistDataValidation();
      }
      if (filter) this.createFilter(filter);
      timeEnd("checklist resetDataValidation");
    }
    // END DATA VALIDATION UTILITIES
            
    // CONDITIONAL FORMATTING UTILITIES
    resetConditionalFormatting(_skipMeta: boolean = false): void {
      time("checklist resetConditionalFormatting");
      const {FORMULA,NOT,IF,ISERROR,ISBLANK,OR,REGEXMATCH,A1,VALUE,EQ,CONCAT,NE} = Formula;
      const prettyPrint = Formula.togglePrettyPrint(false);
              
      const checkboxDataRange = this.getUnboundedColumnDataRange(COLUMN.CHECK);
      const itemDataRange = this.getUnboundedColumnDataRange(COLUMN.ITEM);
      const statusDataRange = this.getUnboundedColumnDataRange(COLUMN.STATUS);
      const preReqDataRange = this.getUnboundedColumnDataRange(COLUMN.PRE_REQS);
      const allDataRange = this.getUnboundedRange(this.firstDataRow,1,null,this.lastColumn);
              
      const relativeItemCell = A1(this.firstDataRow,this.toColumnIndex(COLUMN.ITEM),true);
      const relativePreReqCell = A1(this.firstDataRow,this.toColumnIndex(COLUMN.PRE_REQS),true);
      const relativeStatusCell = A1(this.firstDataRow,this.toColumnIndex(COLUMN.STATUS),true);
      const relativeNotesCell = A1(this.firstDataRow,this.toColumnIndex(COLUMN.NOTES),true);
              
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
      const crossthroughCheckedFormula = FORMULA(EQ(relativeStatusCell,VALUE(STATUS.CHECKED)));
      const missableFormula = FORMULA(REGEXMATCH(relativePreReqCell,VALUE("(^|\\n)MISSED ")));
      const infoNoteFormula = FORMULA(REGEXMATCH(relativeNotesCell, VALUE("^(INFO|NOTE)")));
      const warnNoteFormula = FORMULA(REGEXMATCH(relativeNotesCell, VALUE("^WARN")));
      
      Formula.togglePrettyPrint(prettyPrint);
                            
      const availableErrorRule = SpreadsheetApp.newConditionalFormatRule();
      availableErrorRule.setBackground(COLOR.ERROR);
      availableErrorRule.whenFormulaSatisfied(statusErrorFormula);
      availableErrorRule.setRanges([preReqDataRange,statusDataRange]);
                            
      const missedRule = SpreadsheetApp.newConditionalFormatRule();
      missedRule.setBackground(COLOR.MISSED);
      missedRule.whenFormulaSatisfied(missedFormula);
      missedRule.setRanges([allDataRange]);
      // missedRule.setRanges([preReqDataRange,statusDataRange]);
      
      const usedRule = SpreadsheetApp.newConditionalFormatRule();
      usedRule.setBackground(COLOR.USED);
      usedRule.whenFormulaSatisfied(usedFormula);
      usedRule.setRanges([allDataRange]);
      // usedRule.setRanges([preReqDataRange,statusDataRange]);
                            
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
                            
      const infoNoteRule = SpreadsheetApp.newConditionalFormatRule();
      infoNoteRule.setBackground(COLOR.INFO_NOTE);
      infoNoteRule.setFontColor(COLOR.WHITE);
      infoNoteRule.whenFormulaSatisfied(infoNoteFormula);
      infoNoteRule.setRanges([itemDataRange]);
                            
      const warnNoteRule = SpreadsheetApp.newConditionalFormatRule();
      warnNoteRule.setBackground(COLOR.WARN_NOTE);
      warnNoteRule.setFontColor(COLOR.WHITE);
      warnNoteRule.whenFormulaSatisfied(warnNoteFormula);
      warnNoteRule.setRanges([itemDataRange]);
                            
      this.sheet.setConditionalFormatRules([
        availableErrorRule,
        crossthroughCheckedRule,
        checkboxDisableRule,
        missedRule,
        usedRule,
        warnNoteRule,
        infoNoteRule,
        missableRule,
        notAvailableRule
      ]);//.concat(existingRules,[notAvailableRule]));

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
      const filterRange = this.filter && this.filter.getRange();

      if (filterRange &&  (filterRange.getRow()        != this.headerRow 
                       ||  filterRange.getColumn()     != 1 
                       ||  filterRange.getLastRow()    != this.maxRows 
                       ||  filterRange.getLastColumn() != this.lastColumn)) {
        this.toast("Please wait...","Expanding Filter",-1);
        this.createFilter(this.filter);
        this.toast("Done!", "Expanding Filter");
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
      const {FORMULA,REGEXMATCH,A1,VALUE} = Formula;
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
          if (existingCriteria) {
            criteria = existingCriteria.copy();
          } else {
            criteria = SpreadsheetApp.newFilterCriteria();
          }
          // const filterRange = checklist.getColumnDataRange(column);
          const prettyPrint = Formula.togglePrettyPrint(false);
          criteria.whenFormulaSatisfied(FORMULA(REGEXMATCH(A1(this.firstDataRow,column,null,column),VALUE("(?mis:"+ changedValue +")"))));
          Formula.togglePrettyPrint(prettyPrint);
          this.filter.setColumnFilterCriteria(column, criteria);
        } else {
          if (existingCriteria && existingCriteria.getCriteriaType() == SpreadsheetApp.BooleanCriteria.CUSTOM_FORMULA) {
            // Remove it, but don't remove the hiddenValues criteria
            if (existingCriteria.getHiddenValues().length > 0) {
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
      const {FORMULA,CONCAT, A1, IF, GT, OR, ADD, COUNTIFS, VALUE, CHAR,EQ,ROUND,DIV,MULT,MINUS} = Formula;
                            
      // TODO determine best way for reporting
      if (!this.hasRow(ROW.TITLE)) return;
      const totalCell = this.getRange(ROW.TITLE,1);
      const firstRow = this.firstDataRow;
      const itemColumn = this.toColumnIndex(COLUMN.ITEM);
      const statusColumn = this.toColumnIndex(COLUMN.STATUS);
                            
      const hasValueArgs = [A1(firstRow,itemColumn  ,null,itemColumn  ),VALUE("<>")];

      const total       = COUNTIFS(...hasValueArgs);
      const checked     = COUNTIFS(A1(firstRow,statusColumn,null,statusColumn),VALUE(STATUS.CHECKED)   ,...hasValueArgs);
      const missed      = COUNTIFS(A1(firstRow,statusColumn,null,statusColumn),VALUE(STATUS.MISSED)    ,...hasValueArgs);
      const prUsed      = COUNTIFS(A1(firstRow,statusColumn,null,statusColumn),VALUE(STATUS.PR_USED)   ,...hasValueArgs);
      const available   = COUNTIFS(A1(firstRow,statusColumn,null,statusColumn),VALUE(STATUS.AVAILABLE) ,...hasValueArgs);
      const unknown     = COUNTIFS(A1(firstRow,statusColumn,null,statusColumn),VALUE(STATUS.UNKNOWN)   ,...hasValueArgs);
      const unavailable = COUNTIFS(A1(firstRow,statusColumn,null,statusColumn),VALUE(STATUS.PR_NOT_MET),...hasValueArgs);
                            
                            
                            
      const formula = FORMULA(
        CONCAT(
          IF(
            OR(
              GT(missed,VALUE.ZERO),
              GT(prUsed,VALUE.ZERO)
            ),
            CONCAT(
              VALUE("M: "), 
              missed, 
              IF(
                GT(prUsed,VALUE.ZERO),
                CONCAT(VALUE(" ("),prUsed,VALUE(")")),
                VALUE.EMPTYSTRING
              ),
              CHAR.NEWLINE
            ),
            VALUE.EMPTYSTRING
          ),
          VALUE("R: "),
          IF(
            EQ(
              ADD(available,unavailable),
              VALUE.ZERO
            ),
            VALUE("★"),
            CONCAT(
              available,
              VALUE("|"),
              unavailable
            )
          ), 
          IF(
            GT(unknown,VALUE.ZERO),
            CONCAT(VALUE(" ("),unknown,VALUE(")")),
            VALUE.EMPTYSTRING
          ),
          CHAR.NEWLINE,
          ROUND(MULT(DIV(checked,MINUS(total,prUsed)),VALUE(100)),VALUE.ONE),
          VALUE("%")
        )
      );
                                                
      if (totalCell.getFormula() !== formula) {
        totalCell.setFormula(formula);
      }
      timeEnd("totalFormula");
    }
    // END REPORTING SECTION
  }                                        
}                            