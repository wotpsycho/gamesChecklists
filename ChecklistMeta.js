/* exported META, ProcessMeta */
// eslint-disable-next-line no-redeclare
const ChecklistMeta = (function(){

  class ChecklistMetaError extends Error{}

  let createLock = true;
  const checklistMetaSheets = {};
  class ChecklistMeta {
    constructor(checklist) {
      if (createLock) throw new ChecklistMetaError("Cannot create directly, use the static methods instead");
      Object.defineProperties(this, {
        checklist: {value: checklist},
        sheet    : {value: checklist.metaSheet},
      });
    }

    static getFromActiveChecklist(_interactive = false) {
      return ChecklistMeta.getFromChecklist(ChecklistApp.getActiveChecklist(),_interactive);
    }

    static getFromChecklist(checklist = ChecklistApp.getActiveChecklist(), _interactive = false) {
      const key = `${checklist.sheetId}:${checklist.metaSheet.getSheetId()}`;
      if (typeof checklistMetaSheets[key] == "undefined") {
        if (!checklist.isChecklist || !checklist.metaSheet) {
          const checklistFromMeta = ChecklistApp.checklistFromMeta(checklist.sheet);
          if (checklistFromMeta) checklist = checklistFromMeta;
        } 
        if (!checklist.metaSheet && _interactive) {
          ChecklistMeta.promptMetaSheetCreate(checklist);
        }
        if (checklist.isChecklist && checklist.metaSheet) {
          if (!checklistMetaSheets[key]) {
            createLock = false;
            checklistMetaSheets[key] = new ChecklistMeta(checklist);
            createLock = true;
          }
        } else {
          checklistMetaSheets[key] = null;
        }
      }
      return checklistMetaSheets[key];
    }

    static promptMetaSheetCreate(checklist, title = "Meta Sheet Create") {
      const ui = SpreadsheetApp.getUi();
      const defaultMetaSheetName = checklist.name + " Meta";
      const response = ui.prompt(title, `Enter the name for the new Meta Sheet (will contain formatting options). Leave blank for "${defaultMetaSheetName}"`, ui.ButtonSet.OK_CANCEL);
      if (response.getSelectedButton() != ui.Button.OK) return;
      checklist.createMetaSheet(response.getResponseText() || defaultMetaSheetName);
    }

    get lastRow() {
      return this.sheet.getLastRow();
    }

    get headerMetadata() {
      if (!this._headerMetadata) {
        time("get headerMetadata");
        const headerMetadata = {};
        const metaHeaders = this.sheet.getRange("A1:1");
        const metaHeaderValues = metaHeaders.getValues()[0];
        for (let column = 1; column <= metaHeaderValues.length; column++) {
          let metaHeader = metaHeaderValues[column-1];
          if (metaHeader && metaHeader.toString().trim() && metaHeader != "META") {
            //      Logger.log("[metaHeader]", [metaHeader]);
            let additionalHeaders;
            [, metaHeader,  additionalHeaders] = /^(.+?)(?:\[(.+)\])?$/.exec(metaHeader);
            //      Logger.log("[originalHeader, metaHeader,  additionalHeaders]", [originalHeader, metaHeader,  additionalHeaders]);
            const formatHeaders = [metaHeader];
            if (additionalHeaders) {
              additionalHeaders = additionalHeaders.split(/ *, */);
              formatHeaders.push(...additionalHeaders);
              additionalHeaders.forEach(header => {
                if (header && !headerMetadata[header]) headerMetadata[header] = {};
              });
            }
            const metaValueCells = {};
            const metaValueRange = this.sheet.getRange(2, column, this.lastRow-2+1);
            
            const metaValues = metaValueRange.getValues().map(metaValueRow => metaValueRow[0]);
            let lastRow = 2;
            for (let i = 0; i < metaValues.length; i++) {
              const metaValue = metaValues[i];
              if (metaValue) {
                metaValueCells[metaValue] = metaValueRange.getCell(i+1,1);
                lastRow = i+2;
              } else {
                break; // Don't allow empty spaces
              }
            }
            
            headerMetadata[metaHeader] = {
              metaColumn: column,
              formatHeaders: formatHeaders,
              metaValueCells: metaValueCells,
              lastMetaRow: lastRow,
              missingValues: {},
              metaRange: this.sheet.getRange("R2C" + column + ":R2C" + lastRow),
            };
          } else if (metaHeader == "META") {
            // TODO determine what to include as meta
          }
        }
        Object.entries(this.checklist.columnsByHeader).forEach(([checklistColumnName,checklistColumn]) => {
          if (headerMetadata[checklistColumnName]) {
          // Add associated column info
            const checklistRange = this.checklist.getColumnDataRange(checklistColumn);
            const metadata = headerMetadata[checklistColumnName];
            metadata.column = checklistColumn;
            metadata.range = checklistRange;
          }
        });
        Object.defineProperty(this,"_headerMetadata",{value: headerMetadata});
        timeEnd("get headerMetadata");
      }
      return this._headerMetadata;
    }

    get missingValues() {
      if (!this._missingValues) {
        time();
        const missingValues = {};
        Object.entries(this.checklist.columnsByHeader).forEach(([checklistColumnName, checklistColumn]) => {
          const columnMissingValues = {};
          if (checklistColumn == this.checklist.toColumnIndex(ChecklistApp.COLUMN.ITEM)) return; // Skip the Item column
          // const checklistRange = checklist.getColumnDataRange(checklistColumn);
          const metadata = this.headerMetadata[checklistColumnName];
          if (metadata) {
          // Determine missing values
            if (metadata.metaColumn && metadata.metaValueCells) {
              const checklistValues = this.checklist.getColumnDataValues(checklistColumn);
              checklistValues.forEach(function(checklistValue){
                if (!checklistValue || !checklistValue.toString().trim()) return;
                // Handle multi-value entries
                checklistValue.split("\n").forEach(checklistSubvalue => {
                  if (checklistSubvalue && checklistSubvalue.toString().trim() && !metadata.metaValueCells[checklistSubvalue]) {
                    columnMissingValues[checklistSubvalue] = true;
                  }
                });
              });
            }
            missingValues[checklistColumnName] = columnMissingValues;
          //Logger.log("[checklistColumnName, checklistColumn, metadata]",[checklistColumnName, checklistColumn, metadata]);
          }
        });
        Object.defineProperty(this,"_missingValues",{value: missingValues});
        timeEnd();
      }
      return this._missingValues;
    }

    syncWithChecklist(_toastTitle = "Syncing Metadata") {
      this.checklist.toast("Syncing Metadata...",_toastTitle);
      this.updateChecklistDataValidation();
      this.updateWithMissingValues();
      this.updateChecklistConditionalFormatting();
      this.checklist.toast("Done!", _toastTitle);
    }

    updateChecklistDataValidation() {
      time("meta setChecklistDataValidation");
      Object.values(this.headerMetadata).forEach((metadata) => {
        if (metadata.metaValueCells && metadata.range && metadata.column != this.checklist.toColumnIndex(ChecklistApp.COLUMN.ITEM)) {
          metadata.rangeValidation = SpreadsheetApp
            .newDataValidation()
            .requireValueInList(Object.keys(metadata.metaValueCells), true)
            .setAllowInvalid(true)
            .build();
          metadata.range.setDataValidation(metadata.rangeValidation);
        }
      });
      timeEnd("meta setChecklistDataValidation");
    }
  

    updateWithMissingValues() {
      time("meta setMissingValues");
      Object.entries(this.missingValues).forEach(([columnName,missingValuesData]) => {
        const metadata = this.headerMetadata[columnName];
        
        const missingValues = Object.keys(missingValuesData);
        if (missingValues && missingValues.length > 0) {
          const outputRange = this.sheet.getRange(metadata.lastMetaRow + 2, metadata.metaColumn, missingValues.length);
          const outputValues = missingValues.map((missingValue) => [missingValue]);
          outputRange.setValues(outputValues);
        }
        
      });
      timeEnd("meta setMissingValues");
    }

    updateChecklistConditionalFormatting() {
      time("meta setConditionalFormatRules");
      const formulaToRuleMap = {};
      const newConditionalFormatRulesByColumn = []; // Hack, using as a map with int keys for sorting
      // Get validation
      Object.values(this.headerMetadata).forEach((metadata) => {
        // Conditional formatting rules for given columns
        if (metadata.formatHeaders && metadata.range) {
          const formatRanges = [];
          metadata.formatHeaders.forEach((headerName) => {
            if (this.headerMetadata[headerName] && this.headerMetadata[headerName].range) {
              formatRanges.push(this.headerMetadata[headerName].range);
            }
          });
          if (formatRanges.length > 0) {
            const relativeCell = FORMULA.A1(metadata.range.getCell(1,1),true);//.getA1Notation();
            // This can be made into rules based on cells.
            Object.entries(metadata.metaValueCells).forEach(([cellValue, cell]) => {
              const {REGEXMATCH,VALUE} = FORMULA;
              const [background, color] = [cell.getBackground(), cell.getFontColor()];
              const isBold = cell.getFontWeight() == "bold";
              const isItalic = cell.getFontStyle() == "italic";
              const isUnderline = cell.getFontLine() == "underline";
              const isStrikethrough = cell.getFontLine() == "line-through";
              const isBackgroundWhite = background === "#ffffff";
              const isTextBlack = color === "#000000";
              const ruleBuilder = SpreadsheetApp.newConditionalFormatRule();
              const prettyPrint = FORMULA.togglePrettyPrint(false);
              const formula = FORMULA(REGEXMATCH(relativeCell,VALUE(`^(${cellValue}\\n|${cellValue}$)`)));
              FORMULA.togglePrettyPrint(prettyPrint);
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
                ruleBuilder.setUnderline();
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
  
      
      const newConditionalFormatRules = newConditionalFormatRulesByColumn.filter(rules => rules && rules.length).flat();
      
      this.checklist.sheet.setConditionalFormatRules(oldRules.concat(newConditionalFormatRules));
      timeEnd("meta setConditionalFormatRules");
    }

    setEditable(isEditable = true) {
      if (isEditable === false) {
        this.sheet.protect().setWarningOnly(true);
      } else {
        const protections = this.sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
        protections && protections[0] && protections[0].remove();
      }
    }
  }
  return ChecklistMeta;

})();

function ProcessMeta() {
  const meta = ChecklistMeta.getFromActiveChecklist(true);
  meta && meta.syncWithChecklist();
}
