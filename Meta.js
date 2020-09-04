/* exported META, ProcessMeta */

// eslint-disable-next-line no-redeclare
const META = (function(){

  function ProcessMeta(checklist = ChecklistApp.getActiveChecklist()) {
    time();

    checklist = _ensureChecklistHasMetaSheet(checklist, true);

    if (!checklist || !checklist.isChecklist) {
      SpreadsheetApp.getUi().alert("This does not appear to be a checklist. Please run on the correct sheet, or run the Reset method.");
      return;
    }
  
  
    // Get info from sheets
    const headerMetadata = _getMetadata(checklist, true);
  
    // Data validation for given column
    _setDataValidationForChecklistToMetaValues(checklist, headerMetadata);
  
    // Add missing values to metadata
    _updateMetaSheetWithMissingValues(checklist, headerMetadata);
  
    // Replace conditional format rules
    _updateConditionalFormatToMetaValues(checklist, headerMetadata);
  
    timeEnd();
  }

  function setDataValidationFromMeta(checklist) {
    checklist = _ensureChecklistHasMetaSheet(checklist);
    const headerMetadata = checklist && _getMetadata(checklist);
    if (headerMetadata) {
      _setDataValidationForChecklistToMetaValues(checklist, headerMetadata);
    }
  }

  function setMetaEditable(checklist, _isEditable) {
    checklist = _ensureChecklistHasMetaSheet(checklist);
    if (checklist) {
      if (_isEditable === false) {
        checklist.metaSheet.protect().setWarningOnly(true);
      } else {
        const protections = checklist.metaSheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
        protections && protections[0] && protections[0].remove();
      }
    }
  }

  function _getMetadata(checklist, _includeMissingValues) {
    const headerMetadata = _readHeaderMetadata(checklist);
    if (checklist) {
      _associateChecklistToMetadata(checklist, headerMetadata);
      if (_includeMissingValues) {
        _determineMissingValues(checklist, headerMetadata);
      }
    }
    return headerMetadata;
  }

  function _ensureChecklistHasMetaSheet(checklist, _interactive) {
    if (!checklist.isChecklist) checklist = ChecklistApp.checklistFromMeta(checklist.sheet) || checklist;

    let metaSheet = checklist.metaSheet;
    if (_interactive) {
      const ui = SpreadsheetApp.getUi();
      let metaSheetName;
      if (!metaSheet) {
        const response = ui.prompt("Meta Spreadsheet Name","Could not determine Meta sheet. Please enter the name of the spreadsheet that contains the Metadata.", ui.ButtonSet.OK_CANCEL);
        if (response.getSelectedButton() !== ui.Button.OK) return;
        metaSheetName = response.getResponseText();
        metaSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(metaSheetName);
        if (metaSheet) {
          checklist.metaSheet = metaSheet;
        }
      }
      if (!metaSheet) {
        ui.alert("Sheet Not Found", "Could not find the sheet named '" + metaSheetName + "', please verify and try again.", ui.ButtonSet.OK);
      }
    }
    if (checklist && checklist.metaSheet) {
      checklist.activate();
      return checklist;
    }
  }

  function _readHeaderMetadata(checklist) {
    time();
    const headerMetadata = {};
    const metaHeaders = checklist.metaSheet.getRange("A1:1");
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
          additionalHeaders.forEach(function(header) {
            if (header && !headerMetadata[header]) headerMetadata[header] = {};
          });
        }
        const metaValueCells = {};
        const metaValueRange = checklist.metaSheet.getRange(2, column, checklist.metaSheet.getLastRow()-2+1);
      
        const metaValues = metaValueRange.getValues().map(function(metaValueRow){
          return metaValueRow[0];
        });
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
          metaRange: checklist.metaSheet.getRange("R2C" + column + ":R2C" + lastRow),
        };
      } else if (metaHeader == "META") {
      // TODO determine what to include as meta
      }
    }
    timeEnd();
    return headerMetadata;
  }
  function _associateChecklistToMetadata(checklist, headerMetadata, _includeMissingValues) {
    time();
    // Associate header info with checklist
    Object.entries(checklist.columnsByHeader).forEach(([checklistColumnName,checklistColumn]) => {
      if (headerMetadata[checklistColumnName]) {
      // Add associated column info
        const checklistRange = checklist.getColumnDataRange(checklistColumn);
        const metadata = headerMetadata[checklistColumnName];
        metadata.column = checklistColumn;
        metadata.range = checklistRange;
      }
    });
    if (_includeMissingValues) {
      _determineMissingValues(checklist,headerMetadata);
    }
    timeEnd();
  }

  function _determineMissingValues(checklist, headerMetadata) {
    time();
    Object.entries(checklist.columnsByHeader).forEach(([checklistColumnName, checklistColumn]) => {
      if (checklistColumn == checklist.toColumnIndex(ChecklistApp.COLUMN.ITEM)) return; // Skip the Item column
      // const checklistRange = checklist.getColumnDataRange(checklistColumn);
      const metadata = headerMetadata[checklistColumnName];
      if (metadata) {
      // Determine missing values
        if (metadata.metaColumn && metadata.metaValueCells) {
          const checklistValues = checklist.getColumnDataValues(checklistColumn);
          checklistValues.forEach(function(checklistValue){
            if (!checklistValue || !checklistValue.toString().trim()) return;
            // Handle multi-value entries
            checklistValue.split("\n").forEach(function(checklistSubvalue){
              if (checklistSubvalue && checklistSubvalue.toString().trim() && !metadata.metaValueCells[checklistSubvalue]) {
                metadata.missingValues[checklistSubvalue] = true;
              }
            });
          });
        }
      //Logger.log("[checklistColumnName, checklistColumn, metadata]",[checklistColumnName, checklistColumn, metadata]);
      }
    });
    timeEnd();
  }

  function _setDataValidationForChecklistToMetaValues(checklist, headerMetadata) {
    time();
    Object.values(headerMetadata).forEach(function(metadata) {
      if (metadata.metaValueCells && metadata.range && metadata.column != checklist.toColumnIndex(ChecklistApp.COLUMN.ITEM)) {
        metadata.rangeValidation = SpreadsheetApp
          .newDataValidation()
          .requireValueInList(Object.keys(metadata.metaValueCells), true)
          .setAllowInvalid(true)
          .build();
        metadata.range.setDataValidation(metadata.rangeValidation);
      }
    });
    timeEnd();
  }

  function _updateMetaSheetWithMissingValues(checklist, headerMetadata) {
    time();
    Object.values(headerMetadata).forEach(function(metadata) {
      if (metadata.missingValues) {
        const missingValues = Object.keys(metadata.missingValues);
        if (missingValues && missingValues.length > 0) {
          const outputRange = checklist.metaSheet.getRange(metadata.lastMetaRow + 2, metadata.metaColumn, missingValues.length);
          const outputValues = missingValues.map(function(missingValue) { 
            return [missingValue];
          });
          outputRange.setValues(outputValues);
        }
      }
    });
    timeEnd();
  }

  function _updateConditionalFormatToMetaValues(checklist, headerMetadata) {
    time();
    const formulaToRuleMap = {};
    const newConditionalFormatRulesByColumn = []; // Hack, using as a map with int keys for sorting
    // Get validation
    Object.values(headerMetadata).forEach(function(metadata) {
    // Conditional formatting rules for given columns
      if (metadata.formatHeaders && metadata.range) {
        const formatRanges = [];
        metadata.formatHeaders.forEach(function(headerName) {
          if (headerMetadata[headerName] && headerMetadata[headerName].range) {
            formatRanges.push(headerMetadata[headerName].range);
          }
        });
        if (formatRanges.length > 0) {
          const relativeCell = FORMULA.A1(metadata.range.getCell(1,1),true);//.getA1Notation();
          // This can be made into rules based on cells.
          Object.entries(metadata.metaValueCells).forEach(function([cellValue, cell]){
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
    const oldRules = checklist.sheet.getConditionalFormatRules();
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
  
  
    const newConditionalFormatRules = newConditionalFormatRulesByColumn.filter(function(rules) {return rules && rules.length;}).flat();
    
    checklist.sheet.setConditionalFormatRules(oldRules.concat(newConditionalFormatRules));
    timeEnd();
  }

  function setConditionalFormatRules(checklist) {
    checklist = _ensureChecklistHasMetaSheet(checklist,false);
    if (checklist && checklist.isChecklist && checklist.metaSheet) {
      const metadata = _getMetadata(checklist,false);
      _updateConditionalFormatToMetaValues(checklist,metadata);
    }
  }
  return {
    ProcessMeta: ProcessMeta,
    // removeDataValidation: removeDataValidationFromMeta,
    setDataValidation: setDataValidationFromMeta,
    setEditable: setMetaEditable,
    setConditionalFormatRules,
  };
})();

function ProcessMeta() {
  META.ProcessMeta();
}

// eslint-disable-next-line no-unused-vars
function debug(){
  time();
  META.removeDataValidationFromMeta(ChecklistApp.getActiveChecklist());
  timeEnd();
}