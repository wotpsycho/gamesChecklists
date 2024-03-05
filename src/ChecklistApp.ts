/* exported ChecklistApp */
namespace ChecklistApp {
  export type EditEvent = GoogleAppsScript.Events.SheetsOnEdit;
  export type DeveloperMetadata = GoogleAppsScript.Spreadsheet.DeveloperMetadata;

  export enum COLUMN {
    CHECK= "✓",
    TYPE= "Type",
    ITEM= "Item",
    NOTES= "Notes",
    PRE_REQS= "Pre-Reqs",
    STATUS= "Available",
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
  export const FINAL_ITEM_TYPE = "Game Complete";

  
  const COLOR = {
    ERROR: "#ff0000",
    UNAVAILABLE: "#fce5cd",
    MISSED: "#f4cccc",
    USED: "#ead1dc",
    CONTROLLED: "#cfe2f3",
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
  export function getChecklistFromEvent(event:GoogleAppsScript.Events.SheetsOnOpen|GoogleAppsScript.Events.SheetsOnEdit): Checklist {
    return Checklist.fromEvent(event);
  }
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
      super(sheet,COLUMN,ROW_HEADERS);
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
    static fromEvent(event:GoogleAppsScript.Events.SheetsOnOpen|GoogleAppsScript.Events.SheetsOnEdit): Checklist {
      return this.fromSheet(event.source.getActiveSheet());
    }

    static get triggersAttached():boolean {
      return SpreadsheetApp.getActiveSpreadsheet().createDeveloperMetadataFinder().withKey("triggersAttached").find().length > 0;
    }

    static set triggersAttached(triggersAttached:boolean) {
      if (triggersAttached) {
        if (!this.triggersAttached)
          SpreadsheetApp.getActiveSpreadsheet().addDeveloperMetadata("triggersAttached");
      } else {
        SpreadsheetApp.getActiveSpreadsheet().createDeveloperMetadataFinder().withKey("triggersAttached").find().forEach(metadata => metadata.remove());
      }
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
        if (devMeta && devMeta[0] && devMeta[0].getValue() != this.sheet.getName()) {
          metaSheet = this.sheet.getParent().getSheetByName(devMeta[0].getValue());
          if (!metaSheet) {
            const metaDevMeta:DeveloperMetadata[] = this.sheet.getParent().createDeveloperMetadataFinder().withKey("metaForSheet").withValue(this.sheet.getName()).withVisibility(SpreadsheetApp.DeveloperMetadataVisibility.PROJECT).find();
            if (metaDevMeta && metaDevMeta[0] && metaDevMeta[0].getLocation().getSheet().getName() != this.sheet.getName()) {
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
      if (metaSheet.getSheetId() == this.sheet.getSheetId()) {
        console.warn("trying to set itself as meta sheet");
        return;
      }
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
      if (changed) this.resetEditingDataValidations();
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onOpenSimple(event: GoogleAppsScript.Events.SheetsOnOpen):void {
      this.settings.populateSettingsDropdowns();
      this.ensureTotalFormulas();
      const cell = this.getRange(ROW.TITLE,COLUMN.PRE_REQS);
      // this.sheet.insertImage("",cell.getColumn(),cell.getRow(),cell.getWidth()/2,0);
      return;
    }
    onEditSimple(event: GoogleAppsScript.Events.SheetsOnEdit):void {
      time("onEditSimple");
      try {
        const VALUE = Formula.VALUE;
        time("itemWasCheckedShortcut");
        const range = event.range;
        
        time("logEditedRange");
        Logger.log("edit: %s", range.getA1Notation());
        timeEnd("logEditedRange");

        if (
          event.value && 
          event.oldValue && 
          (VALUE(event.value) === VALUE.TRUE && VALUE(event.oldValue) === VALUE.FALSE
            || VALUE(event.value) === VALUE.FALSE && VALUE(event.oldValue) === VALUE.TRUE) &&
          event.range.getColumn() == 1
        ) {
          // Optimization for ultra-quick Item Checkbox Check; assumes a swap between True/False in column 1 is a Check and just refreshes filter
          // Bypasses actual isChecklist check since that is primarily used for editing purposes, not Checkbox Check purposes
          this.refreshFilter();
          timeEnd("itemWasCheckedShortcut");
          return;
        }
        timeEnd("itemWasCheckedShortcut");
      
      
        time("quickFilterChange");
        if (this.isRowInRange(ROW.QUICK_FILTER,range) && this.isChecklist) {
          this.quickFilterChange(event);
          if (range.getNumRows() == 1) {
            timeEnd("quickFilterChange");
            return;
          }
        }
        timeEnd("quickFilterChange");

        time("updateSettings");
        if (this.isRowInRange(ROW.SETTINGS, range) && range.getColumn() <= this.toColumnIndex(COLUMN.ITEM) && this.isChecklist) {
          this.settings.handleChange(event);
          if (range.getNumRows() == 1) {
            timeEnd("updateSettings");
            return;
          }
        }
        timeEnd("updateSettings");

        time("markEdited");
        if (range.getColumn() > this.toColumnIndex(COLUMN.CHECK) && range.getRow() >= this.firstDataRow) {
          this.markEdited();
        }
        timeEnd("markEdited");
      } catch (e) {
        const message = e && e.getMessage && e.getMessage() || e;
        event.range.getSheet().getParent().toast(message || "", "Error handling edit of " + event.range.getA1Notation(),60);
        throw e;
      } finally {
        timeEnd("onEditSimple");
      }
    }
    onEditInstallable(event: GoogleAppsScript.Events.SheetsOnEdit): void {
      time("onEditInstallable");
      try {
        const range = event.range;
  
        time("logEditedRange");
        Logger.log("edit: %s", range.getA1Notation());
        timeEnd("logEditedRange");

        if (range.getA1Notation() == "A1" && this.isChecklist) {
        // Debug hacks
          switch (event.value){
            case "reset": 
            case "refresh": this.reset(); break;
            case "meta": this.syncMeta(); break;
            case "FULL RESET": this.reset(true); break;
            case "link": this.linkPreReqs(); break;
            case "status":
            default: { 
              const filter = this.removeFilter();
              this.calculateStatusFormulas();
              filter && this.createFilter(filter);
            }
          }
          this.isChecklist && this.ensureTotalFormulas();
          return;
        }
      
        time("updateSettings");
        if (this.isRowInRange(ROW.SETTINGS, range) && range.getColumn() > this.toColumnIndex(COLUMN.ITEM)) {
          this.settings.handleChange(event);
          if (range.getNumRows() == 1) {
            timeEnd("updateSettings");
            return;
          }
        }
        timeEnd("updateSettings");
      
        time("populateAvailable");
        if (this.isColumnInRange([COLUMN.PRE_REQS, COLUMN.ITEM, COLUMN.STATUS], range) && range.getLastRow() >= this.firstDataRow) {
          // this.calculateStatusFormulas();
          // this.refreshFilter();
        }
        timeEnd("populateAvailable");
      
        // time("reapplyFilter");
        // if (this.isColumnInRange([COLUMN.CHECK, COLUMN.PRE_REQS],range) || 
        // this.isRowInRange(ROW.QUICK_FILTER,range)) {
        //   this.refreshFilter();
        // }
        // timeEnd("reapplyFilter");
      
        time("moveNotes");
        if (this.isColumnInRange(COLUMN.NOTES,range)) {
          this.syncNotes();
        }
        timeEnd("moveNotes");
      
        // time("checkFilterSize");
        // if (!event.value && !event.oldValue) {
        //   this.ensureFilterSize();
        // }
        // timeEnd("checkFilterSize");
      } catch(e) {
        const message = e && e.getMessage && e.getMessage() || e;
        event.range.getSheet().getParent().toast(message || "", "Error handling edit of " + event.range.getA1Notation(),60);
        throw e;
      } finally {
        timeEnd("onEditInstallable");
      }
    }
    onChangeSimple(event:GoogleAppsScript.Events.SheetsOnChange):void {
      const label = this.onChangeSimple.name;
      time(`${label}`);
      time(`${label} checkFilterSize`);
      if (event.changeType.match(/^INSERT/) && this.isChecklist) {
        this.ensureFilterSize();
      }
      timeEnd(`${label} checkFilterSize`);
      timeEnd(`${label}`);
    }
    // /Handlers

    markEdited():void {
      return; // todo
    }

    unmarkEdited(): void {
      return; // todo
    }
    
    // Settings section
    getSetting(setting: Settings.SETTING): string {
      return this.settings.getSetting(setting);
    }

    getSettings(): {[x in Settings.SETTING]: string} {
      return this.settings.getSettings();
    }
    
    setSetting(setting: Settings.SETTING, value: string): void {
      this.settings.setSetting(setting, value);
    }

    setSettings(settings: {[x in Settings.SETTING]: string}):void {
      this.settings.setSettings(settings);
    }
    
    resetSettings(oldSettings:{[x in Settings.SETTING]: string}): void {
      this.setSettings(oldSettings);
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
      const previousSettings = this.getSettings(); // Preserve settings
      
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
        this.resetCheckmarks(true);
      }

      // Add settings dropdowns early in case of timeout (for retries)
      time("settingsDropdowns");
      this.settings.populateSettingsDropdowns();
      timeEnd("settingsDropdowns");
      
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
      this.ensureTotalFormulas(true);
      timeEnd("totals");

      time("settings");
      this.resetSettings(previousSettings);
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
        const bgColor = filterValueRange.getBackgroundObject().asRgbColor().asHexString(); // Type not updated?
        // HACK lighten the color
        const bgR = parseInt(bgColor.slice(1,3),16);
        const bgG = parseInt(bgColor.slice(3,5),16);
        const bgB = parseInt(bgColor.slice(5,7),16);
        const bgNewR = Math.floor((bgR+255)/2);
        const bgNewG = Math.floor((bgG+255)/2);
        const bgNewB = Math.floor((bgB+255)/2);
        const bgNewColor = "#" + bgNewR.toString(16) + bgNewG.toString(16) + bgNewB.toString(16);
        filterValueRange.setBackground(bgNewColor);
        const fontColor = filterValueRange.getFontColorObject().asRgbColor().asHexString();
        const fontR = parseInt(fontColor.slice(1,3),16);
        const fontG = parseInt(fontColor.slice(3,5),16);
        const fontB = parseInt(fontColor.slice(5,7),16);
        const fontNewR = Math.floor(fontR/2);
        const fontNewG = Math.floor(fontG/2);
        const fontNewB = Math.floor(fontB/2);
        const fontNewColor = "#" + fontNewR.toString(16) + fontNewG.toString(16) + fontNewB.toString(16);
        filterValueRange.setFontColor(fontNewColor);
        this.sheet.setRowHeight(filterValueRange.getRow(), this.sheet.getRowHeight(this.toRowIndex(ROW.SETTINGS)));
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
    
    resetCheckmarks(resetPersistant = false): void {
      const shouldPersist:boolean[] = resetPersistant ? [] : this.getColumnDataValues(COLUMN.PRE_REQS).map(value => /(^|\n)PERSIST($|\n)/i.test(value?.toString()));
      const checkValues = this.getColumnDataValues(COLUMN.CHECK);
      const checkFormulas = this.getColumnDataFormulas(COLUMN.CHECK);
      
      checkValues.forEach((value:sheetValue,i) => {
        if (value === true) {
          if (!checkFormulas[i] && !shouldPersist[i]) {
            this.setValue(i+this.firstDataRow,COLUMN.CHECK,false);
          } else if (checkFormulas[i] && shouldPersist[i]) {
            this.setFormula(i+this.firstDataRow,COLUMN.CHECK,Formula.FORMULA(Formula.VALUE.TRUE));
          }
        }
      });
    }
    
    removeNotes(): void {
      this.getRange(1,1,this.maxRows,this.maxColumns).clearNote();
    }
    
    // DATA VALIDATION UTILITIES
    removeValidations(): void {
      const filter = this.removeFilter();
      this.getRange(1,1,this.maxRows,this.maxColumns).setDataValidation(null);
      if (filter) this.createFilter(filter);
    }
    
    resetDataValidation(_skipMeta: boolean = false): void {
      time("checklist resetDataValidation");
      const filter = this.removeFilter();
      const checks = this.getUnboundedColumnDataRange(COLUMN.CHECK);
      checks.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
      this.resetEditingDataValidations(_skipMeta);
      if (filter) this.createFilter(filter);
      timeEnd("checklist resetDataValidation");
    }

    resetEditingDataValidations(_skipMeta = false): void {
      const filter = this.removeFilter();
      const {FORMULA,COUNTIF,A1,CONCAT,VALUE,LT} = Formula;
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
    }
    // END DATA VALIDATION UTILITIES
            
    // CONDITIONAL FORMATTING UTILITIES
    resetConditionalFormatting(_skipMeta: boolean = false): void {
      time("checklist resetConditionalFormatting");
      const {FORMULA,NOT,IF,ISERROR,ISBLANK,OR,REGEXMATCH,A1,VALUE,EQ,CONCAT,NE,ISFORMULA} = Formula;
      const prettyPrint = Formula.togglePrettyPrint(false);
              
      const checkboxDataRange = this.getUnboundedColumnDataRange(COLUMN.CHECK);
      const itemDataRange = this.getUnboundedColumnDataRange(COLUMN.ITEM);
      const statusDataRange = this.getUnboundedColumnDataRange(COLUMN.STATUS);
      const preReqDataRange = this.getUnboundedColumnDataRange(COLUMN.PRE_REQS);
      const allDataRange = this.getUnboundedRange(this.firstDataRow,1,null,this.lastColumn);
              
      const relativeCheckCell = A1(this.firstDataRow,this.toColumnIndex(COLUMN.CHECK),true);
      const relativeItemCell = A1(this.firstDataRow,this.toColumnIndex(COLUMN.ITEM),true);
      const relativePreReqCell = A1(this.firstDataRow,this.toColumnIndex(COLUMN.PRE_REQS),true);
      const relativeStatusCell = A1(this.firstDataRow,this.toColumnIndex(COLUMN.STATUS),true);
      const relativeNotesCell = A1(this.firstDataRow,this.toColumnIndex(COLUMN.NOTES),true);
              
      const notAvailableFormula = (
        NOT(
          OR(
            ISBLANK(relativeStatusCell),
            EQ(relativeStatusCell,VALUE(STATUS.AVAILABLE))
          )
        )
      );
      const missedFormula = (EQ(relativeStatusCell,VALUE(STATUS.MISSED)));
      const usedFormula = (EQ(relativeStatusCell,VALUE(STATUS.PR_USED)));
      const statusErrorFormula = (
        IF(
          ISERROR(relativeStatusCell),
          VALUE.TRUE,
          REGEXMATCH(CONCAT(VALUE.EMPTYSTRING,relativeStatusCell),VALUE(STATUS.ERROR))
        )
      );
      const checkboxDisableFormula = (
        OR(
          ISBLANK(relativeItemCell),
          NE(relativeStatusCell,VALUE(STATUS.AVAILABLE))
        )
      );
      const checkedFormula = (EQ(relativeStatusCell,VALUE(STATUS.CHECKED)));
      const controlledFormula = (ISFORMULA(relativeCheckCell));
      const missableFormula = (REGEXMATCH(relativePreReqCell,VALUE("(^|\\n)MISSED ")));
      const infoNoteFormula = (REGEXMATCH(relativeNotesCell, VALUE("(^|\\n)(INFO|NOTE)")));
      const warnNoteFormula = (REGEXMATCH(relativeNotesCell, VALUE("(^|\\n)WARN")));
      
      Formula.togglePrettyPrint(prettyPrint);
                            
      const availableErrorRule = SpreadsheetApp.newConditionalFormatRule();
      availableErrorRule.setBackground(COLOR.ERROR);
      availableErrorRule.whenFormulaSatisfied(FORMULA(statusErrorFormula));
      availableErrorRule.setRanges([preReqDataRange,statusDataRange]);
                            
      const missedRule = SpreadsheetApp.newConditionalFormatRule();
      missedRule.setBackground(COLOR.MISSED);
      missedRule.whenFormulaSatisfied(FORMULA(missedFormula));
      missedRule.setRanges([allDataRange]);
      // missedRule.setRanges([preReqDataRange,statusDataRange]);
      
      const usedRule = SpreadsheetApp.newConditionalFormatRule();
      usedRule.setBackground(COLOR.USED);
      usedRule.whenFormulaSatisfied(FORMULA(usedFormula));
      usedRule.setRanges([allDataRange]);
      // usedRule.setRanges([preReqDataRange,statusDataRange]);
                            
      const notAvailableRule = SpreadsheetApp.newConditionalFormatRule();
      notAvailableRule.setBackground(COLOR.UNAVAILABLE);
      notAvailableRule.whenFormulaSatisfied(FORMULA(notAvailableFormula));
      notAvailableRule.setRanges([preReqDataRange,statusDataRange]);

      const controlledRule = SpreadsheetApp.newConditionalFormatRule();
      controlledRule.setBackground(COLOR.CONTROLLED);
      controlledRule.whenFormulaSatisfied(FORMULA(controlledFormula));
      controlledRule.setRanges([preReqDataRange,statusDataRange]);
                            
      const checkedCrossthroughRule = SpreadsheetApp.newConditionalFormatRule();
      checkedCrossthroughRule.setStrikethrough(true);
      checkedCrossthroughRule.setBackground(COLOR.CHECKED_BG);
      checkedCrossthroughRule.setFontColor(COLOR.CHECKED_TEXT);
      checkedCrossthroughRule.whenFormulaSatisfied(FORMULA(checkedFormula));
      checkedCrossthroughRule.setRanges([itemDataRange]);
                            
      const checkedBGRule = SpreadsheetApp.newConditionalFormatRule();
      checkedBGRule.setBackground(COLOR.CHECKED_BG);
      checkedBGRule.setFontColor(COLOR.CHECKED_TEXT);
      checkedBGRule.whenFormulaSatisfied(FORMULA(checkedFormula));
      checkedBGRule.setRanges([allDataRange]);
                            
      const checkboxDisableRule = SpreadsheetApp.newConditionalFormatRule();
      checkboxDisableRule.setBackground(COLOR.DISABLED);
      checkboxDisableRule.setFontColor(COLOR.DISABLED);
      checkboxDisableRule.whenFormulaSatisfied(FORMULA(checkboxDisableFormula));
      checkboxDisableRule.setRanges([checkboxDataRange]);
                     
      const missableRule = SpreadsheetApp.newConditionalFormatRule();
      missableRule.setBackground(COLOR.MISSABLE);
      missableRule.setFontColor(COLOR.WHITE);
      missableRule.whenFormulaSatisfied(FORMULA(missableFormula));
      missableRule.setRanges([itemDataRange]);
                            
      const infoNoteRule = SpreadsheetApp.newConditionalFormatRule();
      infoNoteRule.setBackground(COLOR.INFO_NOTE);
      infoNoteRule.setFontColor(COLOR.WHITE);
      infoNoteRule.whenFormulaSatisfied(FORMULA(infoNoteFormula));
      infoNoteRule.setRanges([itemDataRange]);
                            
      const warnNoteRule = SpreadsheetApp.newConditionalFormatRule();
      warnNoteRule.setBackground(COLOR.WARN_NOTE);
      warnNoteRule.setFontColor(COLOR.WHITE);
      warnNoteRule.whenFormulaSatisfied(FORMULA(warnNoteFormula));
      warnNoteRule.setRanges([itemDataRange]);
                            
      this.sheet.setConditionalFormatRules([
        availableErrorRule,
        checkedCrossthroughRule,
        checkedBGRule,
        checkboxDisableRule,
        missedRule,
        usedRule,
        warnNoteRule,
        infoNoteRule,
        missableRule,
        notAvailableRule,
        controlledRule
      ]);//.concat(existingRules,[notAvailableRule]));

      if (!_skipMeta && this.metaSheet) {
        this.meta.updateChecklistConditionalFormatting();
      }
      timeEnd("checklist resetConditionalFormatting");
    }
    // END CONDITIONAL FORMATTING UTILITIES
    // RESET/INIT/STRUCTURE SECTION
                          
    // FILTER SECTION
    ensureFilterSize(): void {
      const filterRange = this.filter?.getRange();

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
      const {FORMULA,REGEXMATCH,A1,VALUE,TEXT} = Formula;
      const range = event.range;
                            
      const firstChangedColumn = range.getColumn();
      const lastChangedColumn = range.getLastColumn();
      const changedValues = this.getRowValues(ROW.QUICK_FILTER,range.getColumn(), range.getNumColumns());
      for (let column = firstChangedColumn; column <= lastChangedColumn; column++) {
        if (column == 1) continue; // First column is header
        const changedValue = changedValues[column-firstChangedColumn]?.toString().replace(/""/g,"^$");
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
          criteria.whenFormulaSatisfied(FORMULA(REGEXMATCH(TEXT(A1(this.firstDataRow,column,null,column),VALUE("#")),VALUE(`(?mis:${changedValue})`))));
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
    ensureTotalFormulas(forceWrite = false): void {
      time("totalFormula");
      // static imports
      const {FORMULA,CONCAT, A1, IF, GT, ADD, COUNTIFS, VALUE, CHAR,EQ,ROUND,DIV,MULT,MINUS} = Formula;
                            
      // TODO determine best way for reporting
      if (!this.hasRow(ROW.TITLE)) return;
      const totalCell = this.getRange(ROW.TITLE,COLUMN.CHECK);
      const missedCell = this.getRange(ROW.TITLE,COLUMN.PRE_REQS);
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
      
      const totalFormula = FORMULA(
        CONCAT(
          IF(
            EQ(ADD(unavailable,available), VALUE.ZERO),
            VALUE("★"),
            CONCAT(
              VALUE("R: "),
              available,
              VALUE("/"),
              ADD(available,unavailable,unknown)
            )
          ),
          CHAR.NEWLINE,
          VALUE("C: "),
          ADD(checked,prUsed),
          VALUE("/"),
          total,
          CHAR.NEWLINE,
          ROUND(MULT(DIV(checked,MINUS(total,prUsed)),VALUE(100)),VALUE.ONE),
          VALUE("%")
        )
      );
      const missedFormula = FORMULA(
        CONCAT(
          IF(
            GT(missed,VALUE.ZERO),
            CONCAT(
              VALUE("Missed: "),
              missed
            ),
            VALUE.EMPTYSTRING
          ),
          CHAR.NEWLINE,
          IF(
            GT(prUsed,VALUE.ZERO),
            CONCAT(
              VALUE("Not Chosen: "),
              prUsed
            ),
            VALUE.EMPTYSTRING
          ),
          CHAR.NEWLINE,
          IF(
            GT(unknown,VALUE.ZERO),
            CONCAT(
              VALUE("Unknown: "),
              unknown
            ),
            VALUE.EMPTYSTRING
          )
        )
      );
      if (totalCell && (forceWrite || totalCell.getFormula() !== totalFormula)) {
        totalCell.setFormula(totalFormula);
        totalCell.setNote([
          "R: [Available]/[Remaining]",
          "C: [Completed]/[Total]",
          "[Percent Completed]%"
        ].join("\n"));
      }
      if (missedCell && (forceWrite || missedCell.getFormula() !== missedFormula)) {
        missedCell.setFormula(missedFormula);
        missedCell.setNote([
          "• Missed: Missed Items (and their dependents)",
          "• Not Chosen: Options and Optional Items that were not Chosen or had Pre-Reqs Used for other Items (and their dependents)",
          "• Unknown: Items with Circular Pre-Req Dependencies that may or may not become Available (and their dependents)",
          "(Use \"View: Missed\" to view these Items)"
        ].join("\n"));
      }
      timeEnd("totalFormula");
    }
    // END REPORTING SECTION
    // STATUS SECTION
    public calculateStatusFormulas():void {
      Status.validateAndGenerateStatusFormulasForChecklist(this);
    }
    linkPreReqs(range:Range = this.getColumnDataRange(COLUMN.PRE_REQS)):void {
      Status.addLinksToPreReqs(this, range.getRow(), range.getLastRow());
    }
    // END STATUS SECTION
  }                                        
}                            