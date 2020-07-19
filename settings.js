const MODE_CONFIG = {
  Edit: {
      Checked    : "Show",
      Unavailable: "Show",
      Notes      : "Column+Hover",
      "Pre-Reqs" : "Show",
      Blanks     : "Show",
      Editable   : "Yes",
  },
  Create: {
      Checked    : "Hide",
      Unavailable: "Hide",
      Notes      : "Column+Hover",
      "Pre-Reqs" : "Show",
      Blanks     : "Show",
      Editable   : "Yes",
  },
  Dynamic: {
      Checked    : "Hide",
      Unavailable: "Hide",
      Notes      : "Hover Only",
      "Pre-Reqs" : "Hide",
      Blanks     : "Hide",
      Editable   : "No",
  },
  Classic: {
      Checked    : "Show",
      Unavailable: "Show",
      Notes      : "Hover Only",
      "Pre-Reqs" : "Show",
      Blanks     : "Show",
      Editable   : "No",
  },
};
const SETTINGS_CONFIG = {
  Checked: {
    options: {
      Hide: _generateUpdateFilterValuesVisibilityFunction("check", ["FALSE"],["TRUE"]),
      Show: _generateUpdateFilterValuesVisibilityFunction("check", ["TRUE","FALSE"]),
    },
    determiner: _generateFilterValueVisibilityDeterminer("available","TRUE","Show","Hide"),
  },
  "Unavailable": {
    options: {
      Hide: _generateUpdateFilterValuesVisibilityFunction("available", ["TRUE"], ["FALSE"]),
      Show: [
        _generateUpdateFilterValuesVisibilityFunction("available", ["TRUE","FALSE"]),
        _generateSetSettingHelperFunction("Pre-Reqs", "Show")
      ],
    },
    determiner: _generateFilterValueVisibilityDeterminer("available","FALSE","Show","Hide"),
  },
  Notes: {
    options: {
      "Hover Only": _generateSetColumnVisibilityFunction("notes",false),
      "Column+Hover": _generateSetColumnVisibilityFunction("notes",true),
    },
    determiner: _generateColumnVisibilityDeterminer("notes", "Column+Hover", "Hover Only"),
  },
  "Pre-Reqs": {
    options: {
      "Hide": [
        _generateSetColumnVisibilityFunction("preReq",false),
        _generateSetSettingHelperFunction("Unavailable","Hide")
      ],
      "Show": _generateSetColumnVisibilityFunction("preReq",true),
    },
    determiner: _generateColumnVisibilityDeterminer("preReq", "Show", "Hide"),
  },
  Blanks: {
    options: {
      Show: _generateUpdateFilterValuesVisibilityFunction("item",[""],[]),
      Hide: _generateUpdateFilterValuesVisibilityFunction("item",[],[""]),
    },
    determiner: _generateFilterValueVisibilityDeterminer("item","","Show","Hide"),
  },
  Editable: {
    options: {
      Yes: _generateSetEditableFunction(true),
      No: _generateSetEditableFunction(false),
    },
    determiner: function(sheet) {
      var protection = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
      return protection && protection[0] ? "No" : "Yes";
    },
  },
  "Quick Filter": {
    options: {
      On: _generateEnableQuickFilterFunction(true),
      Off: _generateEnableQuickFilterFunction(false),
    },
    determiner: function(sheet) {
      return _getRows(sheet).quickFilter ? "On" : "Off";
    },
  },
  Mode: {
    options: Object.fromEntries(Object.entries(MODE_CONFIG).map(([modeName, modeSettings]) => [modeName, _generateSetModeFunction(modeSettings)])),
    determiner: function(sheet) {
      return "Classic";
    },
      /*{
      Dynamic: _generateSetModeFunction(MODE_CONFIG.Dynamic),
      Classic: _generateSetModeFunction(MODE_CONFIG.Classic),
      Edit: _generateSetModeFunction(MODE_CONFIG.Edit),
      Create: _generateSetModeFunction(MODE_CONFIG.Create),
    }*/
  },
};
const SETTING_REGEX = /^(.+): (.+?)(\*)?$/;

function debug() {
  var sheet = SpreadsheetApp.getActiveSheet();
  setSetting(sheet, "Editable");
//  getSettingsObject(SpreadsheetApp.getActiveSheet());
}

function updateSettings(sheet, _range) {
  console.time("updateSettings");
  var rows = _getRows(sheet);
  var settingsObject = getSettingsObject(sheet);
  
  Object.entries(settingsObject).forEach(function([setting, settingInfo]) {
    if (settingInfo.column && (!_range || _isColumnInRange(settingInfo.column, _range))) {
      // The setting is present and was just changed, execute the function(s) associated with it
      setSetting(sheet, setting);
      Logger.log("Setting updated: ", setting, settingInfo.value);
    }
  });
  
  _populateEmptyDataValidation(sheet); 
  console.timeEnd("updateSettings");
}

function setSettings(sheet,settings) {
  Object.entries(settings).forEach(function([setting,value]) {
    setSetting(sheet,setting,value);
  });
}

function setSetting(sheet, setting, _settingValue) {
  console.time("setSetting");
  var rows = _getRows(sheet);
  var settingsObject = getSettingsObject(sheet);
  
  if (!settingsObject[setting]) throw new Error("Invalid setting: ", + setting);
  
  _settingValue || (_settingValue = settingsObject[setting].value);
  if (!SETTINGS_CONFIG[setting].options[_settingValue]) throw new Error("Invalid value for setting \"" + setting +"\": "+ _settingValue);
  
//  console.log(setting, settingsObject, _settingValue, MODE_CONFIG);
  
  settingsObject[setting].value = _settingValue;
  if (settingsObject[setting].column) {
    var cell = sheet.getRange(rows.settings, settingsObject[setting].column);
    cell.setValue(setting + ": " + _settingValue);
    _setDataValidation(cell, setting);
  }
  _executeSetting(sheet, setting);
  _checkCustomMode(sheet);
  
  // cache
  settingsCache = undefined;
  console.timeEnd("setSetting");
}

function getSetting(sheet, setting) {
  return getSettings(sheet)[setting];
}

function getSettings(sheet) {
  return Object.fromEntries(Object.entries(getSettingsObject(sheet)).map(([setting, settingInfo]) => [setting, settingInfo.value]));
}

var settingsCache;
function getSettingsObject(sheet) {
  if (settingsCache) return Object.assign({},settingsCache);
  console.time("getSettingsObject");
  
  var settings = {
    _available: {},
  };
  Object.keys(SETTINGS_CONFIG).forEach(function(setting) {
    settings[setting] = {
    };
    settings._available[setting] = true;
  });
  var rows = _getRows(sheet);
  
  if (!rows.settings) return settings;
  
  var lastSheetColumn = sheet.getLastColumn();
  var settingsRange = sheet.getRange(rows.settings, 2, 1, lastSheetColumn-1);
  
  var settingsSheetValues = settingsRange.getValues()[0];
  for (var column = 2; column <= lastSheetColumn; column++) {
    var [, cellSetting, cellSettingValue, isCustom] = SETTING_REGEX.exec(settingsSheetValues[column-2]) || [];
    
    if (cellSettingValue && SETTINGS_CONFIG[cellSetting] && SETTINGS_CONFIG[cellSetting].options[cellSettingValue] && !settings[cellSetting].column) {
      settings[cellSetting].column = column;
      delete settings._available[cellSetting];
      settings[cellSetting].value = cellSettingValue;
      settings[cellSetting].isCustom = !!isCustom;
    } else {
      settingsSheetValues[column-2] = "";
    }
  }
  
  // Should always be present...
  if (settings.Mode.value) {
    Object.entries(MODE_CONFIG[settings.Mode.value]).forEach(function([setting, value]) {
      if (!settings[setting].value) {
        settings[setting].value = value;
      }
    });
  }
  
  // If it is not set by setting, determine based on sheet
  Object.keys(SETTINGS_CONFIG).forEach(function(setting) {
    if (!settings[setting].value) {
      settings[setting].value = SETTINGS_CONFIG[setting].determiner(sheet);
    }
  });
  
  settingsRange.setValues([settingsSheetValues]);
  
  console.timeEnd("getSettingsObject");
  return settingsCache = settings;
}

function resetSettings(sheet, _mode) {
  console.time("resetSettings");
  _populateEmptyDataValidation(sheet);
  if (_mode) {
    setSetting(sheet,"Mode",_mode);
  }
  console.timeEnd("resetSettings");
}

function _executeSetting(sheet, setting) {
  console.time("_executeSetting");
  console.time("_executeSetting " + setting);
  var settings = getSettings(sheet);
  
  var settingFunction = SETTINGS_CONFIG[setting].options[settings[setting]];
  if (Array.isArray(settingFunction)) {
    settingFunction.forEach(function(func) {
      func(sheet);
    });
  } else {
    settingFunction(sheet);
  }
  console.timeEnd("_executeSetting");
  console.timeEnd("_executeSetting " + setting);
}

function _populateEmptyDataValidation(sheet) {
  console.time("_populateEmptyDataValidation");
  var rows = _getRows(sheet);
  var settingsObject = getSettingsObject(sheet);
  
  var lastSheetColumn = sheet.getLastColumn();
  
  var range = sheet.getRange(rows.settings,2,1,lastSheetColumn-1);
  var rangeValues = range.getValues();
  
  var first = true;
  for (var column = 1; column <= rangeValues[0].length; column++) {
    var cellValue = rangeValues[0][column-1];
    if (!cellValue) {
      var cell = range.getCell(1,column);
      var validation = SpreadsheetApp.newDataValidation();
      validation.setAllowInvalid(false);
      
      if (first) {
        validation.requireValueInList(
          Object.keys(settingsObject._available).map(
            function(setting){
              return setting + ": " + settingsObject[setting].value;
            })
          , true
        );
        
        Logger.log("Added Setting dropdown to column" + (column+1));
        first = false;
      } else {
        // Don't allow anything to be set
        validation.requireFormulaSatisfied("=FALSE");
      }
      cell.setDataValidation(validation);
    }
  }
  
  console.timeEnd("_populateEmptyDataValidation");
}

function _checkCustomMode(sheet) {
  console.time("_checkCustomMode");
  var rows = _getRows(sheet);
  var settingsObject = getSettingsObject(sheet);
  
  if (!settingsObject.Mode.column) return;
  
  var modeSettings = MODE_CONFIG[settingsObject.Mode.value];
  var isCustom = false;
  for (var setting in modeSettings) {
   // console.log("settingsObject[setting].value, modeSettings[setting], setting",settingsObject[setting].value, modeSettings[setting], setting);
    if (settingsObject[setting].value != modeSettings[setting]) {
      isCustom = true;
    }
  } 
//  console.log("[isCustom, settingsObject.Mode.isCustom]",[isCustom, settingsObject.Mode.isCustom]);
  if (settingsObject.Mode.isCustom != isCustom) {
    var cell = sheet.getRange(rows.settings, settingsObject.Mode.column);
    var newCellValue = "Mode: " + settingsObject.Mode.value;
    if (isCustom) {
       newCellValue += "*";
      _setDataValidation(cell, "Mode", newCellValue);
    } else {
      _setDataValidation(cell, "Mode", newCellValue);
    }
    cell.setValue(newCellValue);
  } 
  console.timeEnd("_checkCustomMode");
}


function _generateFilterValueVisibilityDeterminer(columnId, value, ifVisible, ifHidden) {
  return function filterValueVisibilityDeterminer(sheet) {
    var columns = getColumns(sheet);
    var filter = sheet.getFilter();
    var criteria = filter && filter.getColumnFilterCriteria(columns[columnId]);
    var hiddenValues = criteria && criteria.getHiddenValues();
    return hiddenValues && hiddenValues.includes(value) ? ifHidden : ifVisible;
  };
}
//("item","","Show","Hide"),

function _generateUpdateFilterValuesVisibilityFunction(columnName, valuesToShow, valuesToHide) {
  return function updateFilterValuesVisibility(sheet) {
    console.time("updateFilterCriteria");
    console.time("updateFilterCriteria " + columnName);
    var columns = getColumns(sheet);
    var filter = sheet.getFilter();
    var changed = false;
    var criteria = filter.getColumnFilterCriteria(columns[columnName]);
    if (criteria) {
      var newCriteria = criteria.copy();
      var hiddenValues = criteria.getHiddenValues() || [];
    } else {
      var newCriteria = SpreadsheetApp.newFilterCriteria();
      var hiddenValues = [];
      changed = true;
    }
    
    if (valuesToShow && hiddenValues.length > 0){ 
      valuesToShow.forEach(function(showValue){
        var index;
        while ((index = hiddenValues.indexOf(showValue)) >= 0) {
          changed = true;
          hiddenValues.splice(index,1);
        }
      });
    }
    if (valuesToHide) {
      valuesToHide.forEach(function(hideValue){
        if (!hiddenValues.includes(hideValue)) {
          changed = true;
          hiddenValues.push(hideValue);
        }
      });
    }
    //Logger.log("DEBUG: [columnName, valuesToShow, valuesToHide, hiddenValues]", [columnName, valuesToShow, valuesToHide, hiddenValues]);
    newCriteria.setHiddenValues(hiddenValues);

    if (changed) {
      filter.setColumnFilterCriteria(columns[columnName], newCriteria);
    }
    console.timeEnd("updateFilterCriteria");
    console.timeEnd("updateFilterCriteria " + columnName);
  };
}

function _generateColumnVisibilityDeterminer(columnId, ifVisible, ifHidden) {
  return function columnVisibilityDeterminer(sheet) {
    var columns = getColumns(sheet);
    return sheet.isColumnHiddenByUser(columns[columnId]) ? ifHidden : ifVisible;
  };
}
//("preReq", "Show", "Hide"),

function _generateSetColumnVisibilityFunction(columnId, isVisible) {
  return function setColumnVisibility(sheet) {
    console.time("toggleColumnVisibility");
    console.time("toggleColumnVisibility " + columnId + " " + isVisible);
    var columns = getColumns(sheet);
    if (!columns[columnId]) throw new Error("Column does not exist", columnId);
    
    if (isVisible) {
      sheet.showColumns(columns[columnId]);
    } else {
      sheet.hideColumns(columns[columnId]);
    }
  };
    console.timeEnd("toggleColumnVisibility");
    console.timeEnd("toggleColumnVisibility " + columnId + " " + isVisible);
}

function _generateSetEditableFunction(editable) {
  return function setEditable(sheet) {
    console.time("setEditable");
    var rows = _getRows(sheet);
    var columns = getColumns(sheet);
    var preReqColumnRange = _getColumnDataRange(sheet, columns.preReq);
    
    // Remove old protection either way; was hitting race condition with deleting quickFilter row
    var protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    if (protections && protections[0]) {
      protections[0].remove();
    }
    
    if (!editable) {
      // Protect sheet
      var protection = sheet.protect();
      protection.setWarningOnly(true);
      var unprotected = [];
      if (rows.quickFilter) {
        unprotected.push(sheet.getRange("R" + rows.quickFilter + "C2:R" + rows.quickFilter));
      }
      if (rows.settings) {
        unprotected.push(sheet.getRange("R" + rows.settings + "C2:R" + rows.settings));
      }
      if (columns.check) {
        unprotected.push(sheet.getRange("R" + (rows.header + 1) + "C" + columns.check + ":C" + columns.check));
      }
      protection.setUnprotectedRanges(unprotected);
      setMetaEditable(sheet, false);
      console.log("Set Editable: [unprotect.length, rows, columns]",[unprotected.length, rows, columns]);
      // Remove validation
      preReqColumnRange.clearDataValidations();
      removeDataValidationFromMeta(sheet);
    } else {
      // Remove protection
      setMetaEditable(sheet, true);
      
      // Add Pre-Req validation
      preReqColumnRange.setDataValidation(SpreadsheetApp
                                          .newDataValidation()
                                          .requireValueInRange(_getColumnDataRange(sheet,columns.item), true)
                                          .setAllowInvalid(true)
                                          .build()
                                         );
      setDataValidationFromMeta(sheet);
    }
    console.timeEnd("setEditable");
  };
}

function _generateSetSettingHelperFunction(setting, value) {
  return function setSettingHelper(sheet) { 
    setSetting(sheet, setting, value); 
  };
}

function _generateSetModeFunction(settings) {
  return function setMode(sheet) {
    setSettings(sheet, settings);
  };
}

function _generateEnableQuickFilterFunction(enabled) {
  return function enableQuickFilter(sheet) {
    var rows = _getRows(sheet);
    var filter = sheet.getFilter();
    if (enabled) {
      if (!rows.quickFilter) {
        sheet.insertRowBefore(rows.header);
        var filterHeadingCell = sheet.getRange(rows.header,1);
        filterHeadingCell.setValue(ROW_TITLES.quickFilter);
        _resetCache();
        rows = _getRows(sheet);
        var filterValueRange = sheet.getRange(rows.quickFilter, 2, 1, sheet.getLastColumn()-1);
        var color = filterHeadingCell.getBackgroundObject().asRgbColor().asHexString();
        // HACK lighten the color
        var r = parseInt(color.slice(1,3),16);
        var g = parseInt(color.slice(3,5),16);
        var b = parseInt(color.slice(5,7),16);
        var newR = parseInt((r+255)/2);
        var newG = parseInt((g+255)/2);
        var newB = parseInt((b+255)/2);
        var newColor = "#" + newR.toString(16) + newG.toString(16) + newB.toString(16);
        filterValueRange.setBackground(newColor);
      }
      /*
      for (var column = 2; column <= sheet.getLastColumn(); column++) {
        if (column == columns.notes || column == column.
        // Add quick filter logic
        var newCriteria = SpreadsheetApp.newFilterCriteria();
        var quickFilterCell = sheet.getRange(rows.quickFilter,i);
        // HACK convert R1C1 to A1 using intermediate cell to get absolute references
        var quickFilterR1C1 = "R" + quickFilterCell.getRow() + "C[0]";
        var quickFilterRange = _getColumnRangeFromRow(sheet, i, headerRow);
        var quickFilterRangeR1C1 = "R" + quickFilterRange.getRow() + "C[0]" + ":C[0]";
        quickFilterCell.setFormulaR1C1("=OR(ISBLANK(" + quickFilterR1C1 + "),REGEXMATCH(" + quickFilterRangeR1C1 + ',"(?mis:"&' + quickFilterR1C1 + '&")"))');
        newCriteria.whenFormulaSatisfied(quickFilterCell.getFormula());
        quickFilterCell.clearContent();
        //      newCriteria.whenFormulaSatisfied('=OR(ISBLANK(indirect("' + quickFilterCell.getA1Notation() + '")),REGEXMATCH(' + quickFilterRange.getA1Notation() + ',"(?mis:"&indirect("' + quickFilterCell.getA1Notation() + '")&")"))');
        filter.setColumnFilterCriteria(i, newCriteria);
      }*/
    } else {
      if (rows.quickFilter) {
        sheet.deleteRow(rows.quickFilter);
        _resetCache();
      }
      var lastColumn = sheet.getLastColumn();
      for (var column = 2; column <= lastColumn; column++) {
        var criteria = filter.getColumnFilterCriteria(column);
        if (criteria && criteria.getCriteriaType() == SpreadsheetApp.BooleanCriteria.CUSTOM_FORMULA && isQuickFilterFormula(criteria.getCriteriaValues()[0])) {
          filter.removeColumnFilterCriteria(column);
        }
      }
    }
    if (getSetting(sheet, "Editable") == "No") {
      // If it is not editable, need to update to reflect the fact that this ignored range is updated
      setSetting(sheet, "Editable");
    }
  };
}

function _setDataValidation(cell, setting, _additionalOption) {
  console.time("_setDataValidation");
  
  var settingOptions = Object.keys(SETTINGS_CONFIG[setting].options).map(function(value){
    return setting + ": " + value;
  });
  
  if (_additionalOption) {
    settingOptions.push(_additionalOption);
  }
  
  if (setting != "Mode") {
    settingOptions.push("(hide)");
  }
  
  cell.setDataValidation(SpreadsheetApp.newDataValidation()
                         .requireValueInList(settingOptions, true)
                         .setAllowInvalid(false)
                         .build()
                        );
  console.timeEnd("_setDataValidation");
}