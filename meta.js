/* exported META, ProcessMeta */

// eslint-disable-next-line no-redeclare
const META = (function(){

  function ProcessMeta() {
    console.time("ProcessMeta");
    var sheet = SpreadsheetApp.getActiveSheet();
  
    var checkboxHeaderRow = UTIL.getHeaderRow(sheet);
    if (!checkboxHeaderRow) {
      SpreadsheetApp.getUi().alert("This does not appear to be a checklist. Please run on the correct sheet, or run the Reset method.");
      return;
    }
  
    var metaSheet = _getMetaSheet(sheet, true);
  
    // Get info from sheets
    var headerMetadata = _getMetadata(metaSheet, sheet, true);
  
    // Data validation for given column
    _setDataValidationForChecklistToMetaValues(sheet, headerMetadata);
  
    // Add missing values to metadata
    _updateMetaSheetWithMissingValues(metaSheet, headerMetadata);
  
    // Replace conditional format rules
    _updateConditionalFormatToMetaValues(sheet, headerMetadata);
  
    console.timeEnd("ProcessMeta");
  }

  function removeDataValidationFromMeta(sheet) {
    console.time("getMetadataValidationColumns");
    var metaSheet = _getMetaSheet(sheet);
    var headerMetadata = metaSheet && _getMetadata(metaSheet, sheet);
    var columns = UTIL.getColumns(sheet);
  
  
    if (headerMetadata) {
      Object.values(headerMetadata).forEach(function(metadata) {
        if (metadata.metaValueCells && metadata.range && metadata.column != columns.item) {
          UTIL.getColumnDataRange(sheet, metadata.column).clearDataValidations();
        }
      });
    }
  
    console.timeEnd("getMetadataValidationColumns");
  }

  function setDataValidationFromMeta(sheet) {
    var metaSheet = _getMetaSheet(sheet);
    var headerMetadata = metaSheet && _getMetadata(metaSheet, sheet);
    if (headerMetadata) {
      _setDataValidationForChecklistToMetaValues(sheet, headerMetadata);
    }
  }

  function setMetaEditable(sheet, _isEditable) {
    var metaSheet = _getMetaSheet(sheet);
    if (metaSheet) {
      if (_isEditable === false) {
        metaSheet.protect().setWarningOnly(true);
      } else {
        var protections = metaSheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
        protections && protections[0] && protections[0].remove();
      }
    }
  }

  function _getMetadata(metaSheet, _sheet, _includeMissingValues) {
    var headerMetadata = _readHeaderMetadata(metaSheet);
    if (_sheet) {
      _associateChecklistToMetadata(_sheet, headerMetadata);
      if (_includeMissingValues) {
        _determineMissingValues(_sheet, headerMetadata);
      }
    }
    return headerMetadata;
  }

  function _getMetaSheet(sheet, _interactive) {
    var config = CONFIG.getConfig(sheet);
    var metaSheetName = config.metaSheet || sheet.getName().split(" ")[0] + " Meta";
    var metaSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(metaSheetName);
    if (_interactive) {
      if (!metaSheet) {
        var ui = SpreadsheetApp.getUi();
        var response = ui.prompt("Meta Spreadsheet Name","Could not determine Meta sheet. Please enter the name of the spreadsheet that contains the Metadata.", ui.ButtonSet.OK_CANCEL);
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
    console.time("_readHeaderMetadata");
    var headerMetadata = {};
    var metaHeaders = metaSheet.getRange("A1:1");
    var metaHeaderValues = metaHeaders.getValues()[0];
    for (var column = 1; column <= metaHeaderValues.length; column++) {
      let metaHeader = metaHeaderValues[column-1];
      if (metaHeader && metaHeader.toString().trim() && metaHeader != "META") {
        //      Logger.log("[metaHeader]", [metaHeader]);
        let additionalHeaders;
        [, metaHeader,  additionalHeaders] = /^(.+?)(?:\[(.+)\])?$/.exec(metaHeader);
        //      Logger.log("[originalHeader, metaHeader,  additionalHeaders]", [originalHeader, metaHeader,  additionalHeaders]);
        var formatHeaders = [metaHeader];
        if (additionalHeaders) {
          additionalHeaders = additionalHeaders.split(/ *, */);
          formatHeaders = formatHeaders.concat(additionalHeaders);
          additionalHeaders.forEach(function(header) {
            if (header && !headerMetadata[header]) headerMetadata[header] = {};
          });
        }
        var metaValueCells = {};
        let metaValueRange = UTIL.getColumnRangeFromRow(metaSheet, column, 2);
      
        var metaValues = metaValueRange.getValues().map(function(metaValueRow){
          return metaValueRow[0];
        });
        var lastRow = 2;
        for (var i = 0; i < metaValues.length; i++) {
          var metaValue = metaValues[i];
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
    console.timeEnd("_readHeaderMetadata");
    return headerMetadata;
  }
  function _associateChecklistToMetadata(sheet, headerMetadata, _includeMissingValues) {
    console.time("_associateChecklistMetadata");
    // Associate header info with checklist
    var checklistColumns = UTIL.getColumns(sheet, Object.keys(headerMetadata));
    Object.keys(checklistColumns).forEach(function(checklistColumnName) {
      if (headerMetadata[checklistColumnName]) {
      // Add associated column info
        var checklistColumn = checklistColumns[checklistColumnName];
        var checklistRange = UTIL.getColumnDataRange(sheet, checklistColumn);
        var metadata = headerMetadata[checklistColumnName];
        metadata.column = checklistColumn;
        metadata.range = checklistRange;
      }
    });
    if (_includeMissingValues) {
      _determineMissingValues(sheet,headerMetadata);
    }
    console.timeEnd("_associateChecklistMetadata");
  }

  function _determineMissingValues(sheet, headerMetadata) {
    console.time("_determineMissingValues");
    var checklistColumns = UTIL.getColumns(sheet, Object.keys(headerMetadata));
    console.log("[checklistcolumns]", checklistColumns);
    Object.entries(checklistColumns).forEach(([checklistColumnName, checklistColumn]) => {
      if (checklistColumnName == "Item") return; // Skip the Item column
      var checklistRange = UTIL.getColumnDataRange(sheet, checklistColumn);
      var metadata = headerMetadata[checklistColumnName];
      if (headerMetadata[checklistColumnName]) {
      // Determine missing values
        if (metadata.metaColumn && metadata.metaValueCells) {
          var checklistValues = checklistRange.getValues().map(function(checklistValueRow) {
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
    console.timeEnd("_determineMissingValues");
  }

  function _setDataValidationForChecklistToMetaValues(sheet, headerMetadata) {
    console.time("_setDataValidationForChecklistToMetaValuas");
    var columns = UTIL.getColumns(sheet);
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
    console.timeEnd("_setDataValidationForChecklistToMetaValuas");
  }

  function _updateMetaSheetWithMissingValues(metaSheet, headerMetadata) {
    console.time("_updateMetaSheetWithMissingValues");
    Object.values(headerMetadata).forEach(function(metadata) {
      if (metadata.missingValues) {
        var missingValues = Object.keys(metadata.missingValues);
        if (missingValues && missingValues.length > 0) {
          var outputRange = metaSheet.getRange(metadata.lastMetaRow + 2, metadata.metaColumn, missingValues.length);
          var outputValues = missingValues.map(function(missingValue) { 
            return [missingValue];
          });
          outputRange.setValues(outputValues);
        }
      }
    });
    console.timeEnd("_updateMetaSheetWithMissingValues");
  }

  function _updateConditionalFormatToMetaValues(sheet, headerMetadata) {
    console.time("_updateConditionalFormatToMetaValues");
    var formulaMap = {};
    var newConditionalFormatRulesByColumn = []; // Hack, using as a map with int keys for sorting
    // Get validation
    Object.values(headerMetadata).forEach(function(metadata) {
    // Conditional formatting rules for given columns
      if (metadata.formatHeaders && metadata.range) {
        var formatRanges = [];
        metadata.formatHeaders.forEach(function(headerName) {
          if (headerMetadata[headerName] && headerMetadata[headerName].range) {
            formatRanges.push(headerMetadata[headerName].range);
          }
        });
        if (formatRanges.length > 0) {
          var firstCellA1 = metadata.range.getCell(1,1).getA1Notation();
          // This can be made into rules based on cells.
          Object.entries(metadata.metaValueCells).forEach(function([cellValue, cell]){
            var background, color;
            [background, color] = [cell.getBackground(), cell.getFontColor()];
            var isBold = cell.getFontWeight() == "bold";
            var isItalic = cell.getFontStyle() == "italic";
            var isUnderline = cell.getFontLine() == "underline";
            var isStrikethrough = cell.getFontLine() == "line-through";
            var isBackgroundWhite = background === "#ffffff";
            var isTextBlack = color === "#000000";
            //console.log("[cellValue, background, color]",[cellValue, background, color, cell.getFontWeight()]);
            //console.log("[cellValue, backgroundType, colorType]",[cellValue, cell.getBackgroundObject().getColorType().toString(), cell.getFontColorObject().getColorType().toString()]);
            var rule = SpreadsheetApp.newConditionalFormatRule();
            var formula = "=REGEXMATCH($" + firstCellA1 + ",\"^(" + cellValue + "\\n|" + cellValue + "$)\")";
            rule.whenFormulaSatisfied(formula);
            rule.setRanges(formatRanges);
            if (!isBackgroundWhite) {
              rule.setBackground(background);
            }
            if (!isTextBlack) {
              rule.setFontColor(color);
            }
            if (isBold){
              rule.setBold(true);
            }
            if (isItalic) {
              rule.setItalic(true);
            }
            if (isUnderline) {
              rule.setUnderline();
            } else if (isStrikethrough) {
              rule.setStrikethrough(true);
            }
            rule = rule.build();
            formulaMap[formula] = rule;
            if (!isTextBlack || !isBackgroundWhite || isBold || isItalic || isUnderline || isStrikethrough) {
            // Don't add the rule if there is no change. Keep in formula to remove old settings.
              if (!newConditionalFormatRulesByColumn[metadata.metaColumn]) newConditionalFormatRulesByColumn[metadata.metaColumn] = [];
              newConditionalFormatRulesByColumn[metadata.metaColumn].push(rule);
            }
          });
        }
      }
    });
  
    // update conditional formatting
    var oldRules = sheet.getConditionalFormatRules();
    var replacedRules = [];
    for (var i = oldRules.length-1; i >= 0; i--) {
      var oldRule = oldRules[i];
      if (!oldRule.getBooleanCondition() || oldRule.getBooleanCondition().getCriteriaType() !== SpreadsheetApp.BooleanCriteria.CUSTOM_FORMULA) {
        continue;
      }
      var criteriaValues = oldRule.getBooleanCondition().getCriteriaValues();
      if (criteriaValues.length !== 1) {
        continue;
      }
      if (formulaMap[criteriaValues[0]]) {
        //      Logger.log("found duplicate formula: ", criteriaValues[0]);
        replacedRules.push(oldRules.splice(i,1)[0]);
        oldRule.getBooleanCondition().getCriteriaValues()[0];
      }
    }
  
  
    var newConditionalFormatRules = newConditionalFormatRulesByColumn.filter(function(rules) {return rules && rules.length;}).flat();
    /*
  var _debugFunc = function(rules) { return rules.map(function(rule){
    try {       return rule.getBooleanCondition().getCriteriaValues()[0]; } catch (e) { return rule; }
  }); };
  Logger.log("[oldRules,replacedRules,newConditionalFormatRules]",[_debugFunc(oldRules),_debugFunc(replacedRules),_debugFunc(newConditionalFormatRules)])
  */
    sheet.setConditionalFormatRules(oldRules.concat(newConditionalFormatRules));
    console.timeEnd("_updateConditionalFormatToMetaValues");
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
  console.time("debug");
  META.removeDataValidationFromMeta(SpreadsheetApp.getActiveSheet());
  console.timeEnd("debug");
}