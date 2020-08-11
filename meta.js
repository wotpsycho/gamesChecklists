/* exported META, ProcessMeta */

// eslint-disable-next-line no-redeclare
const META = (function(){

  function ProcessMeta() {
    time();
    const sheet = SpreadsheetApp.getActiveSheet();
  
    const checkboxHeaderRow = UTIL.getHeaderRow(sheet);
    if (!checkboxHeaderRow) {
      SpreadsheetApp.getUi().alert("This does not appear to be a checklist. Please run on the correct sheet, or run the Reset method.");
      return;
    }
  
    const metaSheet = _getMetaSheet(sheet, true);
  
    // Get info from sheets
    const headerMetadata = _getMetadata(metaSheet, sheet, true);
  
    // Data validation for given column
    _setDataValidationForChecklistToMetaValues(sheet, headerMetadata);
  
    // Add missing values to metadata
    _updateMetaSheetWithMissingValues(metaSheet, headerMetadata);
  
    // Replace conditional format rules
    _updateConditionalFormatToMetaValues(sheet, headerMetadata);
  
    timeEnd();
  }

  function removeDataValidationFromMeta(sheet) {
    time();
    const metaSheet = _getMetaSheet(sheet);
    const headerMetadata = metaSheet && _getMetadata(metaSheet, sheet);
    const columns = UTIL.getColumns(sheet);
  
  
    if (headerMetadata) {
      Object.values(headerMetadata).forEach(function(metadata) {
        if (metadata.metaValueCells && metadata.range && metadata.column != columns.item) {
          UTIL.getColumnDataRange(sheet, metadata.column).clearDataValidations();
        }
      });
    }
  
    timeEnd();
  }

  function setDataValidationFromMeta(sheet) {
    const metaSheet = _getMetaSheet(sheet);
    const headerMetadata = metaSheet && _getMetadata(metaSheet, sheet);
    if (headerMetadata) {
      _setDataValidationForChecklistToMetaValues(sheet, headerMetadata);
    }
  }

  function setMetaEditable(sheet, _isEditable) {
    const metaSheet = _getMetaSheet(sheet);
    if (metaSheet) {
      if (_isEditable === false) {
        metaSheet.protect().setWarningOnly(true);
      } else {
        const protections = metaSheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
        protections && protections[0] && protections[0].remove();
      }
    }
  }

  function _getMetadata(metaSheet, _sheet, _includeMissingValues) {
    const headerMetadata = _readHeaderMetadata(metaSheet);
    if (_sheet) {
      _associateChecklistToMetadata(_sheet, headerMetadata);
      if (_includeMissingValues) {
        _determineMissingValues(_sheet, headerMetadata);
      }
    }
    return headerMetadata;
  }

  function _getMetaSheet(sheet, _interactive) {
    const config = CONFIG.getConfig(sheet);
    let metaSheetName = config.metaSheet || sheet.getName().split(" ")[0] + " Meta";
    let metaSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(metaSheetName);
    if (_interactive) {
      const ui = SpreadsheetApp.getUi();
      if (!metaSheet) {
        const response = ui.prompt("Meta Spreadsheet Name","Could not determine Meta sheet. Please enter the name of the spreadsheet that contains the Metadata.", ui.ButtonSet.OK_CANCEL);
        if (response.getSelectedButton() !== ui.Button.OK) return;
        metaSheetName = response.getResponseText();
        metaSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(metaSheetName);
      }
      if (!metaSheet) {
        ui.alert("Sheet Not Found", "Could not find the sheet named '" + metaSheetName + "', please verify and try again.", ui.ButtonSet.OK);
      }
    }
    if (metaSheet && !config.metaSheet) {
      CONFIG.setConfig(sheet,"metaSheet", metaSheetName);
    }
    return metaSheet;
  }

  function _readHeaderMetadata(metaSheet) {
    time();
    const headerMetadata = {};
    const metaHeaders = metaSheet.getRange("A1:1");
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
        let metaValueRange = UTIL.getColumnRangeFromRow(metaSheet, column, 2);
      
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
          metaRange: metaSheet.getRange("R2C" + column + ":R2C" + lastRow),
        };
      } else if (metaHeader == "META") {
      // TODO determine what to include as meta
      }
    }
    timeEnd();
    return headerMetadata;
  }
  function _associateChecklistToMetadata(sheet, headerMetadata, _includeMissingValues) {
    time();
    // Associate header info with checklist
    const checklistColumns = UTIL.getColumns(sheet, Object.keys(headerMetadata));
    Object.keys(checklistColumns).forEach(function(checklistColumnName) {
      if (headerMetadata[checklistColumnName]) {
      // Add associated column info
        const checklistColumn = checklistColumns[checklistColumnName];
        const checklistRange = UTIL.getColumnDataRange(sheet, checklistColumn);
        const metadata = headerMetadata[checklistColumnName];
        metadata.column = checklistColumn;
        metadata.range = checklistRange;
      }
    });
    if (_includeMissingValues) {
      _determineMissingValues(sheet,headerMetadata);
    }
    timeEnd();
  }

  function _determineMissingValues(sheet, headerMetadata) {
    time();
    const checklistColumns = UTIL.getColumns(sheet, Object.keys(headerMetadata));
    console.log("[checklistcolumns]", checklistColumns);
    Object.entries(checklistColumns).forEach(([checklistColumnName, checklistColumn]) => {
      if (checklistColumnName == "Item") return; // Skip the Item column
      const checklistRange = UTIL.getColumnDataRange(sheet, checklistColumn);
      const metadata = headerMetadata[checklistColumnName];
      if (headerMetadata[checklistColumnName]) {
      // Determine missing values
        if (metadata.metaColumn && metadata.metaValueCells) {
          const checklistValues = checklistRange.getValues().map(function(checklistValueRow) {
            return checklistValueRow[0];
          });
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

  function _setDataValidationForChecklistToMetaValues(sheet, headerMetadata) {
    time();
    const columns = UTIL.getColumns(sheet);
    Object.values(headerMetadata).forEach(function(metadata) {
      if (metadata.metaValueCells && metadata.range && metadata.column != columns.item) {
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

  function _updateMetaSheetWithMissingValues(metaSheet, headerMetadata) {
    time();
    Object.values(headerMetadata).forEach(function(metadata) {
      if (metadata.missingValues) {
        const missingValues = Object.keys(metadata.missingValues);
        if (missingValues && missingValues.length > 0) {
          const outputRange = metaSheet.getRange(metadata.lastMetaRow + 2, metadata.metaColumn, missingValues.length);
          const outputValues = missingValues.map(function(missingValue) { 
            return [missingValue];
          });
          outputRange.setValues(outputValues);
        }
      }
    });
    timeEnd();
  }

  function _updateConditionalFormatToMetaValues(sheet, headerMetadata) {
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
          const firstCellA1 = metadata.range.getCell(1,1).getA1Notation();
          // This can be made into rules based on cells.
          Object.entries(metadata.metaValueCells).forEach(function([cellValue, cell]){
            const [background, color] = [cell.getBackground(), cell.getFontColor()];
            const isBold = cell.getFontWeight() == "bold";
            const isItalic = cell.getFontStyle() == "italic";
            const isUnderline = cell.getFontLine() == "underline";
            const isStrikethrough = cell.getFontLine() == "line-through";
            const isBackgroundWhite = background === "#ffffff";
            const isTextBlack = color === "#000000";
            const ruleBuilder = SpreadsheetApp.newConditionalFormatRule();
            const formula = "=REGEXMATCH($" + firstCellA1 + ",\"^(" + cellValue + "\\n|" + cellValue + "$)\")";
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
    const oldRules = sheet.getConditionalFormatRules();
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
    
    sheet.setConditionalFormatRules(oldRules.concat(newConditionalFormatRules));
    timeEnd();
  }
  return {
    ProcessMeta: ProcessMeta,
    removeDataValidation: removeDataValidationFromMeta,
    setDataValidation: setDataValidationFromMeta,
    setEditable: setMetaEditable,
  };
})();

function ProcessMeta() {
  META.ProcessMeta();
}

// eslint-disable-next-line no-unused-vars
function debug(){
  time();
  META.removeDataValidationFromMeta(SpreadsheetApp.getActiveSheet());
  timeEnd();
}