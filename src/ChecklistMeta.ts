namespace ChecklistMeta {
  type Sheet = GoogleAppsScript.Spreadsheet.Sheet;
  type Range = GoogleAppsScript.Spreadsheet.Range;
  
  
  export function getFromActiveChecklist(_interactive: boolean = false): MetaSheet {
    return ChecklistMeta.getFromChecklist(ChecklistApp.getActiveChecklist(),_interactive);
  }
  
  export function getFromChecklist(checklist: ChecklistApp.Checklist = ChecklistApp.getActiveChecklist(), _interactive: boolean = false): MetaSheet {
    if (!checklist.isChecklist || !checklist.metaSheet) {
      const checklistFromMeta = ChecklistApp.getChecklistByMetaSheet(checklist.sheet);
      if (checklistFromMeta) checklist = checklistFromMeta;
    } 
    if (!checklist.metaSheet && _interactive) {
      ChecklistMeta.promptMetaSheetCreate(checklist);
    }
    return MetaSheet.fromChecklist(checklist);
  }
  
  export function getFromSheet(sheet: Sheet): MetaSheet {
    const checklist = ChecklistApp.getChecklistByMetaSheet(sheet);
    return checklist && checklist.meta;
  }
  
  export function promptMetaSheetCreate(checklist: { name: string; createMetaSheet: (arg0: string) => void; }, title: string = "Meta Sheet Create"): void {
    const ui = SpreadsheetApp.getUi();
    const defaultMetaSheetName = checklist.name + " Meta";
    const response = ui.prompt(title, `Enter the name for the new Meta Sheet (will contain formatting options). Leave blank for "${defaultMetaSheetName}"`, ui.ButtonSet.OK_CANCEL);
    if (response.getSelectedButton() != ui.Button.OK) return;
    checklist.createMetaSheet(response.getResponseText() || defaultMetaSheetName);
  }
  
  
  type columnMetadata = {
    column: ChecklistApp.column;
    range: Range;
    metaColumn: number;
    formatHeaders: string[];
    metaValueCells: {
      any: Range,
    };
    lastMetaRow: number;
    missingValues: {[x:string]:true};
    metaRange: Range;
  };
  
  export class MetaSheet extends ChecklistApp.SheetBase {
    readonly checklist: ChecklistApp.Checklist
    private constructor(checklist: ChecklistApp.Checklist) {
      super(checklist.metaSheet);
      this.checklist = checklist;
    }
    private static readonly metaSheets: {[x:string]: MetaSheet} = {}
    static fromChecklist(checklist: ChecklistApp.Checklist): MetaSheet {
      if (checklist && checklist.isChecklist && checklist.metaSheet) {
        const key = `${checklist.id}:${checklist.metaSheet.getSheetId}`;
        if (!this.metaSheets[key]) {
          this.metaSheets[key] = new MetaSheet(checklist);
        }
        return this.metaSheets[key];
      }
    }
    
    private _columnMetadata: {[x:string]: columnMetadata}
    private get columnMetadata(): {[x:string]: columnMetadata} {
      if (!this._columnMetadata) {
        time("get headerMetadata");
        const columnMetadata = {};
        const metaHeaderValues = this.getRowValues(this.headerRow);
        for (let column = 1; column <= metaHeaderValues.length; column++) {
          const rawMetaHeader = metaHeaderValues[column-1];
          if (rawMetaHeader && rawMetaHeader.toString().trim()) {
            const [, checklistColumnName,  additionalChecklistColumns] = /^(.+?)(?:\[(.+)\])?$/.exec(rawMetaHeader.toString());
            const formatColumns = [checklistColumnName];
            if (additionalChecklistColumns) {
              const additionalFormatColumns = additionalChecklistColumns.split(/ *, */);
              formatColumns.push(...additionalFormatColumns);
              additionalFormatColumns.forEach(additionalColumnName => {
                if (additionalColumnName && !columnMetadata[additionalColumnName]) columnMetadata[additionalColumnName] = {
                  ...(this.checklist.columnsByHeader[additionalColumnName] && {
                    column: this.checklist.columnsByHeader[additionalColumnName],
                    range: this.checklist.getColumnDataRange(this.checklist.columnsByHeader[additionalColumnName]),
                  })
                };
              });
            }
            const metaValueCells = {};
            const metaValueRange = this.getColumnDataRange(column);
            
            const metaValues = this.getColumnDataValues(column);
            let lastRow = this.firstDataRow;
            for (let i = 0; i < metaValues.length; i++) {
              const metaValue = metaValues[i];
              if (metaValue) {
                metaValueCells[metaValue.toString()] = metaValueRange.getCell(i+1,1);
                lastRow = i+this.firstDataRow;
              } else {
                break; // Don't allow empty spaces
              }
            }
            const a = {
              metaColumn: column,
              formatHeaders: formatColumns,
              metaValueCells: metaValueCells,
              lastMetaRow: lastRow,
              missingValues: {},
              metaRange: this.getColumnDataRange(column,this.firstDataRow,lastRow-this.firstDataRow+1),
              ...(this.checklist.columnsByHeader[checklistColumnName] && {
                column: this.checklist.columnsByHeader[checklistColumnName],
                range: this.checklist.getColumnDataRange(this.checklist.columnsByHeader[checklistColumnName]),
              })
            };
            
            columnMetadata[checklistColumnName] = a;
          }
        }
        this._columnMetadata = columnMetadata;
        timeEnd("get headerMetadata");
      }
      return this._columnMetadata;
    }
    
    private _missingValues
    private get missingValues() {
      if (!this._missingValues) {
        time("meta missingValues");
        const missingValues = {};
        Object.entries(this.checklist.columnsByHeader).filter(([checklistColumnName,checklistColumn]) => {
          const metadata = this.columnMetadata[checklistColumnName]; 
          return checklistColumn != this.checklist.toColumnIndex(ChecklistApp.COLUMN.ITEM) && metadata && metadata.metaColumn && metadata.metaValueCells;
        }).forEach(([checklistColumnName, checklistColumn]) => {
          const columnMissingValues: {[x:string]:true} = {};
          const metadata = this.columnMetadata[checklistColumnName];
          const checklistValues = this.checklist.getColumnDataValues(checklistColumn);
          checklistValues
            .filter((checklistValue: { toString: () => string; }) => checklistValue && checklistValue.toString().trim())
            .map((checklistValue: string) => checklistValue && checklistValue.toString().split("\n")).flat()// Handle multi-value entries
            .filter((checklistValue: string | number) => checklistValue && checklistValue.toString().trim() && !metadata.metaValueCells[checklistValue])
            .forEach(function(checklistValue: string | number){
              columnMissingValues[checklistValue] = true;
            });
          missingValues[checklistColumnName] = columnMissingValues;
        });
        this._missingValues = missingValues;
        timeEnd("meta missingValues");
      }
      return this._missingValues;
    }
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    handleEdit(event: GoogleAppsScript.Events.SheetsOnEdit): void {
      time("meta handleEdit");
      // TODO possibly do things here to reduce need for syncing
      timeEnd("meta handleEdit");
    }
    
    syncWithChecklist(_toastTitle: string = "Syncing Metadata"): void {
      this.checklist.toast("Syncing Metadata...",_toastTitle);
      this.updateChecklistDataValidation();
      this.updateWithMissingValues();
      this.updateChecklistConditionalFormatting();
      this.checklist.toast("Done!", _toastTitle);
    }
    
    updateChecklistDataValidation(): void {
      time("meta setChecklistDataValidation");
      Object.values(this.columnMetadata).forEach((metadata) => {
        if (metadata.metaValueCells && metadata.range && metadata.column != this.checklist.toColumnIndex(ChecklistApp.COLUMN.ITEM)) {
          const valueChoices = Object.keys(metadata.metaValueCells);
          if (metadata.column == this.checklist.toColumnIndex(ChecklistApp.COLUMN.TYPE) && !valueChoices.includes(ChecklistApp.FINAL_ITEM_TYPE)) {
            valueChoices.push(ChecklistApp.FINAL_ITEM_TYPE);
          }
          const rangeValidation = SpreadsheetApp
            .newDataValidation()
            .requireValueInList(valueChoices, true)
            .setAllowInvalid(true)
            .build();
          metadata.range.setDataValidation(rangeValidation);
        }
      });
      timeEnd("meta setChecklistDataValidation");
    }
    
    
    updateWithMissingValues(): void {
      time("meta setMissingValues");
      Object.entries(this.missingValues).forEach(([columnName,missingValuesData]) => {
        const metadata = this.columnMetadata[columnName];
        
        const missingValues = Object.keys(missingValuesData);
        if (missingValues && missingValues.length > 0) {
          const outputRange = this.sheet.getRange(metadata.lastMetaRow + 2, metadata.metaColumn, missingValues.length);
          const outputValues = missingValues.map((missingValue) => [missingValue]);
          outputRange.setValues(outputValues);
        }
        
      });
      timeEnd("meta setMissingValues");
    }
    
    updateChecklistConditionalFormatting(): void {
      time("meta setConditionalFormatRules");
      const {FORMULA,REGEXMATCH,VALUE} = Formula;
      const formulaToRuleMap = {};
      const newConditionalFormatRulesByColumn = []; // Hack, using as a map with int keys for sorting
      // Get validation
      Object.values(this.columnMetadata).forEach((metadata) => {
        // Conditional formatting rules for given columns
        if (metadata.formatHeaders && metadata.range) {
          const formatRanges = [];
          metadata.formatHeaders.forEach((headerName: string | number) => {
            if (this.columnMetadata[headerName] && this.columnMetadata[headerName].range) {
              formatRanges.push(this.columnMetadata[headerName].range);
            }
          });
          if (formatRanges.length > 0) {
            const relativeCell = Formula.A1(metadata.range.getCell(1,1),true);//.getA1Notation();
            // This can be made into rules based on cells.
            Object.entries(metadata.metaValueCells).forEach(([cellValue, cell]) => {
              const [background, color] = [cell.getBackground(), cell.getFontColor()];
              const isBold = cell.getFontWeight() == "bold";
              const isItalic = cell.getFontStyle() == "italic";
              const isUnderline = cell.getFontLine() == "underline";
              const isStrikethrough = cell.getFontLine() == "line-through";
              const isBackgroundWhite = background === "#ffffff";
              const isTextBlack = color === "#000000";
              const ruleBuilder = SpreadsheetApp.newConditionalFormatRule();
              const prettyPrint = Formula.togglePrettyPrint(false);
              const formula = FORMULA(REGEXMATCH(relativeCell,VALUE(`^(${cellValue}\\n|${cellValue}$)`)));
              Formula.togglePrettyPrint(prettyPrint);
              ruleBuilder.whenFormulaSatisfied(formula);
              ruleBuilder.setRanges(formatRanges);
              if (!isBackgroundWhite) {
                ruleBuilder.setBackground(background);
              }
              if (!isTextBlack) {
                ruleBuilder.setFontColor(color);
              }
              if (isBold){
                ruleBuilder.setBold(true);
              }
              if (isItalic) {
                ruleBuilder.setItalic(true);
              }
              if (isUnderline) {
                ruleBuilder.setUnderline(true);
              } else if (isStrikethrough) {
                ruleBuilder.setStrikethrough(true);
              }
              formulaToRuleMap[formula] = ruleBuilder.build();
              if (!isTextBlack || !isBackgroundWhite || isBold || isItalic || isUnderline || isStrikethrough) {
                // Don't add the rule if there is no change. Keep in formula to remove old settings.
                if (!newConditionalFormatRulesByColumn[metadata.metaColumn]) newConditionalFormatRulesByColumn[metadata.metaColumn] = [];
                newConditionalFormatRulesByColumn[metadata.metaColumn].push(ruleBuilder.build());
              }
            });
            if (metadata.column == this.checklist.toColumnIndex(ChecklistApp.COLUMN.TYPE) && !metadata.metaValueCells[ChecklistApp.FINAL_ITEM_TYPE]) {
              // Default for FINAL_ITEM_TYPE 
              // TODO extract to a "Default styles"
              newConditionalFormatRulesByColumn[metadata.metaColumn].push(SpreadsheetApp.newConditionalFormatRule()
                .whenFormulaSatisfied(FORMULA(REGEXMATCH(relativeCell,VALUE(`^(${ChecklistApp.FINAL_ITEM_TYPE}\\n|${ChecklistApp.FINAL_ITEM_TYPE}$)`))))
                .setBackground("#0000FF")
                .setFontColor("#FFFFFF")
                .setUnderline(true)
                .setRanges(formatRanges)
                .build()
              );
            }
          }
        }
      });
      
      // update conditional formatting
      const oldRules = this.checklist.sheet.getConditionalFormatRules();
      const replacedRules = [];
      for (let i = oldRules.length-1; i >= 0; i--) {
        const oldRule = oldRules[i];
        if (!oldRule.getBooleanCondition() || oldRule.getBooleanCondition().getCriteriaType() !== SpreadsheetApp.BooleanCriteria.CUSTOM_FORMULA) {
          continue;
        }
        const criteriaValues = oldRule.getBooleanCondition().getCriteriaValues();
        if (criteriaValues.length !== 1) {
          continue;
        }
        if (formulaToRuleMap[criteriaValues[0]]) {
          //      Logger.log("found duplicate formula: ", criteriaValues[0]);
          replacedRules.push(oldRules.splice(i,1)[0]);
          oldRule.getBooleanCondition().getCriteriaValues()[0];
        }
      }
      
      
      const newConditionalFormatRules = newConditionalFormatRulesByColumn.filter(rules => rules && rules.length).reverse().flat();
      
      this.checklist.sheet.setConditionalFormatRules(oldRules.concat(newConditionalFormatRules));
      timeEnd("meta setConditionalFormatRules");
    }
    
    setEditable(isEditable: boolean = true): void {
      if (isEditable === false) {
        this.sheet.protect().setWarningOnly(true);
      } else {
        const protections = this.sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
        protections && protections[0] && protections[0].remove();
      }
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ProcessMeta(): void {
  const meta = ChecklistMeta.getFromActiveChecklist(true);
  meta && meta.syncWithChecklist();
}