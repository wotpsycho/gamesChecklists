/* exported SETTINGS */
// eslint-disable-next-line no-redeclare
const SETTINGS = (function(){

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
        Hide: _generateUpdateFilterValuesVisibilityFunction("available", ["TRUE"], ["FALSE","MISSED","PR_USED","UNKNOWN"]),
        Show: [
          _generateUpdateFilterValuesVisibilityFunction("available", ["TRUE","FALSE","MISSED","PR_USED","UNKNOWN"]),
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
          // _generateSetColumnVisibilityFunction("missed",false),
          _generateSetSettingHelperFunction("Unavailable","Hide"),
        ],
        "Show": [
          _generateSetColumnVisibilityFunction("preReq",true),
          // _generateSetColumnVisibilityFunction("missed",true),
        ],
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
        const protection = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
        return protection && protection[0] ? "No" : "Yes";
      },
    },
    "Quick Filter": {
      options: {
        On: _generateEnableQuickFilterFunction(true),
        Off: _generateEnableQuickFilterFunction(false),
      },
      determiner: function(sheet) {
        return UTIL.getRows(sheet).quickFilter ? "On" : "Off";
      },
    },
    Mode: {
      options: Object.fromEntries(Object.entries(MODE_CONFIG).map(([modeName, modeSettings]) => [modeName, _generateSetModeFunction(modeSettings)])),
      determiner: function() {
        return "Classic";
      },
    },
  };
  const SETTING_REGEX = /^(.+): (.+?)(\*)?$/;

  function updateSettings(sheet, _range) {
    time();
    const settingsObject = getSettingsObject(sheet);
    
    Object.entries(settingsObject).forEach(function([setting, settingInfo]) {
      if (settingInfo.column && (!_range || UTIL.isColumnInRange(settingInfo.column, _range))) {
        // The setting is present and was just changed, execute the function(s) associated with it
        setSetting(sheet, setting);
        Logger.log("Setting updated: ", setting, settingInfo.value);
      }
    });
    
    _populateEmptyDataValidation(sheet); 
    timeEnd();
  }

  function setSettings(sheet,settings) {
    Object.entries(settings).forEach(function([setting,value]) {
      setSetting(sheet,setting,value);
    });
  }

  function setSetting(sheet, setting, _settingValue) {
    time();
    const rows = UTIL.getRows(sheet);
    const settingsObject = getSettingsObject(sheet);
    
    if (!settingsObject[setting]) throw new Error("Invalid setting: ", + setting);
    
    _settingValue || (_settingValue = settingsObject[setting].value);
    if (!SETTINGS_CONFIG[setting].options[_settingValue]) throw new Error("Invalid value for setting \"" + setting +"\": "+ _settingValue);
        
    settingsObject[setting].value = _settingValue;
    if (settingsObject[setting].column) {
      const cell = sheet.getRange(rows.settings, settingsObject[setting].column);
      cell.setValue(setting + ": " + _settingValue);
      _setDataValidation(cell, setting);
    }
    _executeSetting(sheet, setting);
    _checkCustomMode(sheet);
    
    // cache
    settingsCache = undefined;
    timeEnd();
  }

  function getSetting(sheet, setting) {
    return getSettings(sheet)[setting];
  }

  function getSettings(sheet = UTIL.getSheet()) {
    return Object.fromEntries(Object.entries(getSettingsObject(sheet)).map(([setting, settingInfo]) => [setting, settingInfo.value]));
  }

  let settingsCache;
  function getSettingsObject(sheet = UTIL.getSheet()) {
    if (settingsCache) return Object.assign({},settingsCache);
    time();
    
    const settings = {
      _available: {},
    };
    Object.keys(SETTINGS_CONFIG).forEach(function(setting) {
      settings[setting] = {
      };
      settings._available[setting] = true;
    });
    const rows = UTIL.getRows(sheet);
    
    if (!rows.settings) return settings;
    
    const lastSheetColumn = sheet.getLastColumn();
    const settingsRange = sheet.getRange(rows.settings, 2, 1, lastSheetColumn-1);
    
    const settingsSheetValues = settingsRange.getValues()[0];
    for (let column = 2; column <= lastSheetColumn; column++) {
      const [, cellSetting, cellSettingValue, isCustom] = SETTING_REGEX.exec(settingsSheetValues[column-2]) || [];
      
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
    
    timeEnd();
    return settingsCache = settings;
  }

  function resetSettings(sheet = UTIL.getSheet(), _mode) {
    time();
    _populateEmptyDataValidation(sheet);
    if (_mode) {
      setSetting(sheet,"Mode",_mode);
    }
    timeEnd();
  }

  function _executeSetting(sheet, setting) {
    time(setting, true);
    const settings = getSettings(sheet);
    
    const settingFunction = SETTINGS_CONFIG[setting].options[settings[setting]];
    if (Array.isArray(settingFunction)) {
      settingFunction.forEach(function(func) {
        func(sheet);
      });
    } else {
      settingFunction(sheet);
    }
    timeEnd(setting, true);
  }

  function _populateEmptyDataValidation(sheet) {
    time();
    const rows = UTIL.getRows(sheet);
    const settingsObject = getSettingsObject(sheet);
    
    const lastSheetColumn = sheet.getLastColumn();
    
    const range = sheet.getRange(rows.settings,2,1,lastSheetColumn-1);
    const rangeValues = range.getValues();
    
    let first = true;
    for (let column = 1; column <= rangeValues[0].length; column++) {
      const cellValue = rangeValues[0][column-1];
      if (!cellValue) {
        const cell = range.getCell(1,column);
        const validation = SpreadsheetApp.newDataValidation();
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
    
    timeEnd();
  }

  function _checkCustomMode(sheet) {
    time();
    const rows = UTIL.getRows(sheet);
    const settingsObject = getSettingsObject(sheet);
    
    if (!settingsObject.Mode.column) return;
    
    const modeSettings = MODE_CONFIG[settingsObject.Mode.value];
    let isCustom = false;
    Object.entries(modeSettings).forEach(([setting, modeSetting]) =>{
    // console.log("settingsObject[setting].value, modeSettings[setting], setting",settingsObject[setting].value, modeSettings[setting], setting);
      if (settingsObject[setting].value != modeSetting) {
        isCustom = true;
      }
    });
    //  console.log("[isCustom, settingsObject.Mode.isCustom]",[isCustom, settingsObject.Mode.isCustom]);
    if (settingsObject.Mode.isCustom != isCustom) {
      const cell = sheet.getRange(rows.settings, settingsObject.Mode.column);
      let newCellValue = "Mode: " + settingsObject.Mode.value;
      if (isCustom) {
        newCellValue += "*";
        _setDataValidation(cell, "Mode", newCellValue);
      } else {
        _setDataValidation(cell, "Mode", newCellValue);
      }
      cell.setValue(newCellValue);
    } 
    timeEnd();
  }


  function _generateFilterValueVisibilityDeterminer(columnId, value, ifVisible, ifHidden) {
    return function filterValueVisibilityDeterminer(sheet) {
      const columns = UTIL.getColumns(sheet);
      const filter = sheet.getFilter();
      const criteria = filter && filter.getColumnFilterCriteria(columns[columnId]);
      const hiddenValues = criteria && criteria.getHiddenValues();
      return hiddenValues && hiddenValues.includes(value) ? ifHidden : ifVisible;
    };
  }

  function _generateUpdateFilterValuesVisibilityFunction(columnName, valuesToShow, valuesToHide) {
    return function updateFilterValuesVisibility(sheet) {
      time(columnName, true);
      const columns = UTIL.getColumns(sheet);
      const filter = sheet.getFilter();
      let changed = false;
      const criteria = filter.getColumnFilterCriteria(columns[columnName]);
      let newCriteria, hiddenValues;
      if (criteria) {
        newCriteria = criteria.copy();
        hiddenValues = criteria.getHiddenValues() || [];
      } else {
        newCriteria = SpreadsheetApp.newFilterCriteria();
        hiddenValues = [];
        changed = true;
      }
      
      if (valuesToShow && hiddenValues.length > 0){ 
        valuesToShow.forEach(function(showValue){
          let index;
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
      newCriteria.setHiddenValues(hiddenValues);

      if (changed) {
        filter.setColumnFilterCriteria(columns[columnName], newCriteria);
      }
      timeEnd(columnName,true);
    };
  }

  function _generateColumnVisibilityDeterminer(columnId, ifVisible, ifHidden) {
    return function columnVisibilityDeterminer(sheet) {
      const columns = UTIL.getColumns(sheet);
      return sheet.isColumnHiddenByUser(columns[columnId]) ? ifHidden : ifVisible;
    };
  }

  function _generateSetColumnVisibilityFunction(columnId, isVisible) {
    return function setColumnVisibility(sheet) {
      time(columnId + " " + isVisible, true);
      const columns = UTIL.getColumns(sheet);
      if (!columns[columnId]) throw new Error("Column does not exist", columnId);
      
      if (isVisible) {
        sheet.showColumns(columns[columnId]);
      } else {
        sheet.hideColumns(columns[columnId]);
      }
      timeEnd(columnId + " " + isVisible, true);
    };
  }

  function _generateSetEditableFunction(editable) {
    return function setEditable(sheet) {
      time();
      const rows = UTIL.getRows(sheet);
      const columns = UTIL.getColumns(sheet);
      const preReqColumnRange = UTIL.getColumnDataRange(sheet, columns.preReq);
      //const missedColumnRange = UTIL.getColumnDataRange(sheet, columns.missed);
      
      // Remove old protection either way; was hitting race condition with deleting quickFilter row
      const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
      if (protections && protections[0]) {
        protections[0].remove();
      }
      
      if (!editable) {
        // Protect sheet
        const protection = sheet.protect();
        protection.setWarningOnly(true);
        const unprotected = [];
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
        META.setEditable(sheet, false);
        console.log("Set Editable: [unprotect.length, rows, columns]",[unprotected.length, rows, columns]);
        // Remove validation
        preReqColumnRange.clearDataValidations();
        //missedColumnRange.clearDataValidations();
        META.removeDataValidation(sheet);
      } else {
        // Remove protection
        META.setEditable(sheet, true);
        
        const validation = SpreadsheetApp
          .newDataValidation()
          .requireValueInRange(UTIL.getColumnDataRange(sheet, columns.item), true)
          .setAllowInvalid(true)
          .build();
        // Add Pre-Req validation
        preReqColumnRange.setDataValidation(validation);
        // missedColumnRange.setDataValidation(validation);
        META.setDataValidation(sheet);
      }
      timeEnd();
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
      let rows = UTIL.getRows(sheet);
      const filter = sheet.getFilter();
      if (enabled) {
        if (!rows.quickFilter) {
          sheet.insertRowBefore(rows.header);
          const filterHeadingCell = sheet.getRange(rows.header,1);
          filterHeadingCell.setValue(CONFIG.ROW_HEADERS.quickFilter);
          UTIL.resetCache();
          rows = UTIL.getRows(sheet);
          const filterValueRange = sheet.getRange(rows.quickFilter, 2, 1, sheet.getLastColumn()-1);
          const color = filterHeadingCell.getBackgroundObject().asRgbColor().asHexString();
          // HACK lighten the color
          const r = parseInt(color.slice(1,3),16);
          const g = parseInt(color.slice(3,5),16);
          const b = parseInt(color.slice(5,7),16);
          const newR = parseInt((r+255)/2);
          const newG = parseInt((g+255)/2);
          const newB = parseInt((b+255)/2);
          const newColor = "#" + newR.toString(16) + newG.toString(16) + newB.toString(16);
          filterValueRange.setBackground(newColor);
        }
      } else {
        if (rows.quickFilter) {
          sheet.deleteRow(rows.quickFilter);
          UTIL.resetCache();
        }
        const lastColumn = sheet.getLastColumn();
        for (let column = 2; column <= lastColumn; column++) {
          const criteria = filter.getColumnFilterCriteria(column);
          if (criteria && criteria.getCriteriaType() == SpreadsheetApp.BooleanCriteria.CUSTOM_FORMULA && QUICK_FILTER.isQuickFilterFormula(criteria.getCriteriaValues()[0])) {
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
    time();
    
    const settingOptions = Object.keys(SETTINGS_CONFIG[setting].options).map(function(value){
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
    timeEnd();
  }
  function resetCache() {
    settingsCache = undefined;
  }
  return {
    getSetting: getSetting,
    getSettings: getSettings,
    getSettingsObject: getSettingsObject,
    resetSettings: resetSettings,
    setSetting: setSetting,
    setSettings: setSettings,
    updateSettings: updateSettings,
    isEditable: (_sheet = UTIL.getSheet()) => getSetting(_sheet, "Editable") == "Yes",

    resetCache: resetCache,
  };
})();

// eslint-disable-next-line no-unused-vars
function debug() {
  const sheet = SpreadsheetApp.getActiveSheet();
  SETTINGS.setSetting(sheet, "Editable");
//  getSettingsObject(SpreadsheetApp.getActiveSheet());
}