namespace ChecklistMeta {
  type ConditionalFormatRuleBuilder = GoogleAppsScript.Spreadsheet.ConditionalFormatRuleBuilder;
  type Sheet = GoogleAppsScript.Spreadsheet.Sheet;
  type Range = GoogleAppsScript.Spreadsheet.Range;

  const PARENT_REGEX = /^PARENT\((.*)\)$/;
  
  
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
  
  export function promptMetaSheetCreate(checklist: ChecklistApp.Checklist, title: string = "Meta Sheet Create"): void {
    const ui = SpreadsheetApp.getUi();
    const defaultMetaSheetName = checklist.name + " Meta";
    const response = ui.prompt(title, `Enter the name for the new Meta Sheet (will contain formatting options). Leave blank for "${defaultMetaSheetName}"`, ui.ButtonSet.OK_CANCEL);
    if (response.getSelectedButton() != ui.Button.OK) return;
    const metaSheetName = response.getResponseText() || defaultMetaSheetName;
    const existingSheet = checklist.spreadsheet.getSheetByName(metaSheetName);
    if (existingSheet) {
      const response = ui.alert(title, `Sheet already exists, set as meta sheet?`, ui.ButtonSet.YES_NO);
      if (response == ui.Button.YES) {
        checklist.metaSheet = existingSheet;
      }
    } else {
      checklist.createMetaSheet(metaSheetName);
    }
  }
  
  
  type columnMetadata = {
    column: number;
    range: Range;
    metaColumn: number;
    formatHeaders: string[];
    metaValues:string[];
    metaValueCells: {
      [x:string]: Range,
    };
    metaValueLinks: {[x:string]: {[x:string]: string}};
    metaValueNotes: {[x:string]: string};
    lastMetaRow: number;
    missingValues: {[x:string]:true};
    parents: {[x:string]:string};
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
          const rawMetaHeader = metaHeaderValues[column - 1];
          const parentMatch = PARENT_REGEX.exec(rawMetaHeader?.toString()?.trim());
          if (parentMatch) {
            const baseHeader = parentMatch[1];
            const baseMetadata = columnMetadata[baseHeader];
            if (baseMetadata) {
              const metaValues = this.getColumnDataValues(column)
              metaValues.forEach((metaValue,i) =>{
                baseMetadata.parents[baseMetadata.metaValues[i]] = metaValue.toString();
              });
            }
          } else if (rawMetaHeader && rawMetaHeader.toString().trim()) {
            const [, checklistColumnName, additionalChecklistColumns] = /^(.+?)(?:\[(.+)\])?$/.exec(rawMetaHeader.toString());
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
            const metaValueCells:{[x:string]:Range} = {};
            const metaValueLinks = {};
            const metaValueNotes = {};
            const metaValueRange = this.getColumnDataRange(column);
            
            const metaValues = this.getColumnDataValues(column);
            const metaRichTexts = this.getColumnDataRichTextValues(column);
            const metaNotes = this.getColumnDataNotes(column);
            let lastRow = this.firstDataRow;
            for (let i = 0; i < metaValues.length; i++) {
              const metaValue = metaValues[i];
              if (metaValue) {
                const metaValueString = metaValue.toString();
                metaValueCells[metaValueString] = metaValueRange.getCell(i + 1, 1);
                lastRow = i + this.firstDataRow;
                metaRichTexts[i].getRuns().forEach(richTextRun => {
                  if (richTextRun.getLinkUrl()) {
                    if (!metaValueLinks[metaValueString])
                      metaValueLinks[metaValueString] = {};
                    metaValueLinks[metaValue.toString()][richTextRun.getText()] = richTextRun.getLinkUrl();
                  }
                });
                if (metaNotes[i]) {
                  metaValueNotes[metaValueString] = metaNotes[i];
                }
              } else {
                break; // Don't allow empty spaces
              }
            }
            const columnMeta:columnMetadata = {
              metaColumn: column,
              formatHeaders: formatColumns,
              metaValues:metaValues.map(sheetValue => sheetValue.toString()),
              metaValueCells,
              metaValueLinks,
              metaValueNotes,
              lastMetaRow: lastRow,
              missingValues: {},
              parents: {},
              metaRange: this.getColumnDataRange(column, this.firstDataRow, lastRow - this.firstDataRow + 1),
              ...(this.checklist.columnsByHeader[checklistColumnName] && {
                column: this.checklist.columnsByHeader[checklistColumnName],
                range: this.checklist.getColumnDataRange(this.checklist.columnsByHeader[checklistColumnName]),
              })
            };

            columnMetadata[checklistColumnName] = columnMeta;
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
      // this.toast("Editing meta...",-1);
      const parentMatch = PARENT_REGEX.exec(event.value);
      if (event.range.getRow() == 1 && parentMatch) {
        this.setParentDataValidations();
      }
      // TODO possibly do things here to reduce need for syncing
      // this.toast("Done!");
      timeEnd("meta handleEdit");
    }
    
    syncWithChecklist(_toastTitle: string = "Syncing Metadata"): void {
      this.checklist.toast("Syncing Metadata...",_toastTitle,-1);
      if (this.checklist.sheetId == this.sheetId) {
        this.checklist.toast("Error: Metasheet set to itself");
        console.error("checklist has meta set to itself");
        return;
      }
      const filter = this.checklist.removeFilter();
      try {
        this.updateChecklistDataValidation();
        this.updateWithMissingValues();
        this.updateChecklistConditionalFormatting();
        this.updateChecklistLinksAndNotes();
        this.setParentDataValidations();
        this.checklist.toast("Done!", _toastTitle);
      } finally {
        this.checklist.createFilter(filter);
      }
    }

    getColumnDataValidations(): {[x:string]: GoogleAppsScript.Spreadsheet.DataValidation} {
      const validations = {};
      Object.entries(this.columnMetadata).forEach( ([columnName,metadata]) => {
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
          validations[columnName] = rangeValidation;
        }
      });
      return validations;
    }
    
    updateChecklistDataValidation(): void {
      time("meta setChecklistDataValidation");
      const columnValidations = this.getColumnDataValidations();

      const filter = this.checklist.filter;
      if (filter) this.checklist.removeFilter();
      
      const quickFilterRange = this.checklist.hasRow(ChecklistApp.ROW.QUICK_FILTER) && this.checklist.getRowRange(ChecklistApp.ROW.QUICK_FILTER);
      Object.entries(this.columnMetadata).forEach(([columnName,metadata]) => {
        if (columnValidations[columnName]){
          const rangeValidation = columnValidations[columnName];
          if (this.checklist.editable) {
            metadata.range.setDataValidation(rangeValidation);
          } else {
            metadata.range.clearDataValidations();
          }
          if (quickFilterRange) {
            quickFilterRange.getCell(1,metadata.column).setDataValidation(rangeValidation);
          }
        }
      });
      if (filter) this.checklist.createFilter(filter);
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
      const {FORMULA,REGEXMATCH,VALUE,COMMENT,TEXT} = Formula;
      const formulaToRuleMap = {};
      const newConditionalFormatRulesByColumn:GoogleAppsScript.Spreadsheet.ConditionalFormatRule[][] = []; // Hack, using as a map with int keys for sorting
      const primaryConditionalFormatRulesByColumn:GoogleAppsScript.Spreadsheet.ConditionalFormatRule[][] = []; // Always apply to primary column, even if is a secondary column for another column
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
            Object.entries(metadata.metaValueCells)
                .sort(([cellValue1],[cellValue2]) => cellValue2.length - cellValue1.length)
                .forEach(([cellValue, cell]) => {
                  const getRuleBuilder = (currentCell:Range):ConditionalFormatRuleBuilder => {
                    const [background, color] = [currentCell.getBackground(), currentCell.getFontColor()];
                    const isBold = currentCell.getFontWeight() == "bold";
                    const isItalic = currentCell.getFontStyle() == "italic";
                    const isStrikethrough = currentCell.getFontLine() == "line-through";
                    const isBackgroundWhite = background === "#ffffff";
                    const isTextBlack = color === "#000000";
                    const ruleBuilder = SpreadsheetApp.newConditionalFormatRule();
                    const prettyPrint = Formula.togglePrettyPrint(false);
                    const formula = FORMULA(COMMENT.BOOLEAN("META_RULE", REGEXMATCH(TEXT(relativeCell, VALUE("#")), VALUE(`^(\\Q${cellValue}\\E)`))));
                    Formula.togglePrettyPrint(prettyPrint);
                    ruleBuilder.whenFormulaSatisfied(formula);
                    ruleBuilder.setRanges(formatRanges);
                    if (!isBackgroundWhite) {
                      ruleBuilder.setBackground(background);
                    }
                    if (!isTextBlack) {
                      ruleBuilder.setFontColor(color);
                    }
                    if (isBold) {
                      ruleBuilder.setBold(true);
                    }
                    if (isItalic) {
                      ruleBuilder.setItalic(true);
                    }
                    if (isStrikethrough) {
                      ruleBuilder.setStrikethrough(true);
                    }
                    formulaToRuleMap[formula] = ruleBuilder.build();

                    if (!isTextBlack || !isBackgroundWhite || isBold || isItalic || isStrikethrough) {
                      return ruleBuilder;
                    }
                  };
                  let ruleBuilder:ConditionalFormatRuleBuilder,
                      currentCellValue = cellValue,
                      currentCell = cell;
                  do {
                    ruleBuilder = getRuleBuilder(currentCell);
                    currentCellValue = metadata.parents[currentCellValue];
                    currentCell = metadata.metaValueCells[currentCellValue]
                  } while (!ruleBuilder && currentCellValue && currentCell);

                  if (ruleBuilder) {
                    // Don't add the rule if there is no change. Keep in formula to remove old settings.
                    if (!newConditionalFormatRulesByColumn[metadata.metaColumn]) {
                      newConditionalFormatRulesByColumn[metadata.metaColumn] = [];
                      primaryConditionalFormatRulesByColumn[metadata.metaColumn] = [];
                    }
                    newConditionalFormatRulesByColumn[metadata.metaColumn].push(ruleBuilder.build());
                    primaryConditionalFormatRulesByColumn[metadata.metaColumn].push(ruleBuilder.setRanges([metadata.range]).build());
                  }
                });
            if (metadata.column == this.checklist.toColumnIndex(ChecklistApp.COLUMN.TYPE) && !metadata.metaValueCells[ChecklistApp.FINAL_ITEM_TYPE]) {
              // Default for FINAL_ITEM_TYPE
              // TODO extract to a "Default styles"
              newConditionalFormatRulesByColumn[metadata.metaColumn].push(SpreadsheetApp.newConditionalFormatRule()
                .whenFormulaSatisfied(FORMULA(REGEXMATCH(relativeCell,VALUE(`(^|\\n)${ChecklistApp.FINAL_ITEM_TYPE}`))))
                .setBackground("#0000FF")
                .setFontColor("#FFFFFF")
                .setBold(true)
                .setRanges(formatRanges)
                .build()
              );
            }
          }
        }
      });

      // update conditional formatting
      const oldRules = this.checklist.sheet.getConditionalFormatRules();
      const rulesToKeep = oldRules.filter(rule => {
        return !rule.getBooleanCondition()
            || rule.getBooleanCondition().getCriteriaType() !== SpreadsheetApp.BooleanCriteria.CUSTOM_FORMULA
            || rule.getBooleanCondition().getCriteriaValues().every(criteria => {
              return !criteria.toString().includes("META_RULE")
            });
      })

      const newConditionalFormatRules = [primaryConditionalFormatRulesByColumn,newConditionalFormatRulesByColumn].map(columnRules => columnRules.filter(rules => rules && rules.length).reverse().flat()).flat();
      this.checklist.sheet.setConditionalFormatRules(rulesToKeep.concat(newConditionalFormatRules));
      timeEnd("meta setConditionalFormatRules");
    }

    updateChecklistLinksAndNotes(): void {
      time("meta updateChecklistLinks");
      const postProcess:(()=>void)[] = [];
      Object.values(this.columnMetadata).forEach((metadata) => {
        metadata.range.setTextStyle(SpreadsheetApp.newTextStyle().setUnderline(false).build());
        if (metadata.range && metadata.column != this.checklist.toColumnIndex(ChecklistApp.COLUMN.ITEM)) {
          const values = metadata.range.getValues().map(rowValues => rowValues[0]);
          const richTexts = new Array(values.length);
          const rangeNotes = new Array(values.length);
          values.forEach((value,i) => {
            const richText = SpreadsheetApp.newRichTextValue().setText(value);
            const cellNotes:string[] = [];
            
            let lineIndex:number = -1;
            value.toString().split(/([\r\n])+/).forEach((line: string) => {
              lineIndex = value.toString().indexOf(line,lineIndex+1);
              const lineNotes = [];
              if (metadata?.metaValueLinks?.[line]) {
                Object.entries(metadata.metaValueLinks[line]).forEach(([subText,link]) => {
                  const subTextStart = value.indexOf(subText,lineIndex);
                  richText.setLinkUrl(subTextStart, subTextStart + subText.length, link);
                });
              }
              if (metadata?.parents?.[line]) {
                const parentChain = [];
                for (let currentLine = line; currentLine; currentLine = metadata.parents[currentLine]) {
                  parentChain.push(currentLine);
                  if (parentChain.indexOf(currentLine) != parentChain.lastIndexOf(currentLine)) break; // circular loop
                }
                const parentString = parentChain.reverse().map((current,i,list)=> {
                  // remove prefixes, e.g. "Dungeon A > Dungeon A - B1" to "Dungeon A > B1"
                  return RegExp(`^(?:(?:${list.slice(0,i).join("|")}) *[\-–—:,;>]{1,3} *)?(.*?)$`).exec(current)[1];
                }).join(" > ");
                lineNotes.push(parentString);
              }
              if (metadata?.metaValueNotes?.[line]) {
                lineNotes.push(metadata.metaValueNotes[line]);
              }
              if (lineNotes.length > 0) {
                cellNotes.push(lineNotes.join("\n"));
              }
            });
            richTexts[i] = richText.build();
            rangeNotes[i] = cellNotes.join("\n----------\n");
          });
          postProcess.push(() => {
            if (metadata.metaValueLinks && Object.keys(metadata.metaValueLinks).length) {
              metadata.range.setRichTextValues(richTexts.map(richText => [richText]));
            }
            metadata.range.setNotes(rangeNotes.map(note => [note]));
            metadata.range.setTextStyle(SpreadsheetApp.newTextStyle().setForegroundColor("black").build());
          });
        }
      });
      if (postProcess.length > 0) {
        const filter = this.checklist.removeFilter();
        postProcess.forEach((process) => process())
        if (filter) {
          this.checklist.createFilter(filter);
        }
      }
      timeEnd("meta updateChecklistLinks");
    }
    
    setEditable(isEditable: boolean = true): void {
      if (isEditable === false) {
        this.sheet.protect().setWarningOnly(true);
        this.sheet.hideSheet();
      } else {
        const protections = this.sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
        protections && protections[0] && protections[0].remove();
        this.sheet.showSheet();
      }
    }

    private setParentDataValidations() {
      const {FORMULA,LT,COUNTIF,A1,CONCAT,VALUE} = Formula;
      for (let column = 1; column <= this.lastColumn; column++) {
        const match = PARENT_REGEX.exec(this.getValue(1, column)?.toString());
        if (match) {
          const baseColumn = this.columnMetadata[match[1]];
          if (baseColumn) {
            const parentDataRange = this.getColumnDataRange(column);
            const baseDataRange = this.getColumnDataRange(baseColumn.metaColumn);
            const parentRule = SpreadsheetApp.newDataValidation()
                .setAllowInvalid(true)
                .requireValueInRange(baseDataRange)
                .build();
            const baseFormula = FORMULA(
                LT(
                    COUNTIF(
                        A1(baseDataRange),
                        CONCAT(
                            VALUE("="),
                            A1(this.firstDataRow,baseColumn.metaColumn,true)
                        )
                    ),
                    VALUE(2)
                )
            );
            const baseRule = SpreadsheetApp.newDataValidation()
                .setAllowInvalid(true)
                .requireFormulaSatisfied(baseFormula)
            parentDataRange.setDataValidation(parentRule)
            baseDataRange.setDataValidation(baseRule)
          }
        }
      }
    }

    getChildValues(baseSheetColumn:number, value:string):string[] {
      const column = Object.values(this.columnMetadata).find((columnMeta) => columnMeta.column == baseSheetColumn)
      const children = new Set<string>([value])
      if (column && Object.keys(column.parents).length > 0) {
        let initialSize:number
        do {
          initialSize = children.size
          children.forEach(value => {
            Object.entries(column.parents)
              .forEach(([child, parent]) => {
                if (parent === value)
                  children.add(child);
              })
          })
        } while (initialSize != children.size)
      }
      return [...children]
    }
  }
}

/* exported ProcessMeta */
function ProcessMeta(): void {
  const meta = ChecklistMeta.getFromActiveChecklist(true);
  meta && meta.syncWithChecklist();
}

/* exported CreateMetaSheet */
function CreateMetaSheet(): void {
  ChecklistMeta.promptMetaSheetCreate(ChecklistApp.getActiveChecklist());
}