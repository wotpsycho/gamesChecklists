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
        Hide: _generateUpdateFilterValuesVisibilityFunction(ChecklistApp.COLUMN.CHECK, ["FALSE"],["TRUE"]),
        Show: _generateUpdateFilterValuesVisibilityFunction(ChecklistApp.COLUMN.CHECK, ["TRUE","FALSE"]),
      },
      determiner: _generateFilterValueVisibilityDeterminer(ChecklistApp.COLUMN.STATUS,"TRUE","Show","Hide"),
    },
    "Unavailable": {
      options: {
        Hide: _generateUpdateFilterValuesVisibilityFunction(ChecklistApp.COLUMN.STATUS, ["TRUE"], ["FALSE","MISSED","PR_USED","UNKNOWN"]),
        Show: [
          _generateUpdateFilterValuesVisibilityFunction(ChecklistApp.COLUMN.STATUS, ["TRUE","FALSE","MISSED","PR_USED","UNKNOWN"]),
          _generateSetSettingHelperFunction("Pre-Reqs", "Show")
        ],
      },
      determiner: _generateFilterValueVisibilityDeterminer(ChecklistApp.COLUMN.STATUS,"FALSE","Show","Hide"),
    },
    Notes: {
      options: {
        "Hover Only": _generateSetColumnVisibilityFunction(ChecklistApp.COLUMN.NOTES,false),
        "Column+Hover": _generateSetColumnVisibilityFunction(ChecklistApp.COLUMN.NOTES,true),
      },
      determiner: _generateColumnVisibilityDeterminer(ChecklistApp.COLUMN.NOTES, "Column+Hover", "Hover Only"),
    },
    "Pre-Reqs": {
      options: {
        "Hide": [
          _generateSetColumnVisibilityFunction(ChecklistApp.COLUMN.PRE_REQS,false),
          _generateSetSettingHelperFunction("Unavailable","Hide"),
        ],
        "Show": [
          _generateSetColumnVisibilityFunction(ChecklistApp.COLUMN.PRE_REQS,true),
        ],
      },
      determiner: _generateColumnVisibilityDeterminer(ChecklistApp.COLUMN.PRE_REQS, "Show", "Hide"),
    },
    Blanks: {
      options: {
        Show: _generateUpdateFilterValuesVisibilityFunction(ChecklistApp.COLUMN.ITEM,[""],[]),
        Hide: _generateUpdateFilterValuesVisibilityFunction(ChecklistApp.COLUMN.ITEM,[],[""]),
      },
      determiner: _generateFilterValueVisibilityDeterminer(ChecklistApp.COLUMN.ITEM,"","Show","Hide"),
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
        return ChecklistApp.fromSheet(sheet).hasRow(ChecklistApp.ROW.QUICK_FILTER) ? "On" : "Off";
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
    const checklist = ChecklistApp.fromSheet(sheet);
    const settingsObject = getSettingsObject(sheet);
    
    Object.entries(settingsObject).forEach(function([setting, settingInfo]) {
      if (settingInfo.column && (!_range || checklist.isColumnInRange(settingInfo.column, _range))) {
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
    const checklist = ChecklistApp.fromSheet(sheet);
    const settingsObject = getSettingsObject(sheet);
    
    if (!settingsObject[setting]) throw new Error("Invalid setting: ", + setting);
    
    _settingValue || (_settingValue = settingsObject[setting].value);
    if (!SETTINGS_CONFIG[setting].options[_settingValue]) throw new Error("Invalid value for setting \"" + setting +"\": "+ _settingValue);
        
    settingsObject[setting].value = _settingValue;
    if (settingsObject[setting].column) {
      const cell = checklist.getRange(ChecklistApp.ROW.SETTINGS, settingsObject[setting].column);
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

  function getSettings(sheet = ChecklistApp.getActiveSheet()) {
    return Object.fromEntries(Object.entries(getSettingsObject(sheet)).map(([setting, settingInfo]) => [setting, settingInfo.value]));
  }

  let settingsCache;
  function getSettingsObject(sheet = ChecklistApp.getActiveSheet()) {
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
    const checklist = ChecklistApp.fromSheet(sheet);
    
    if (!checklist.hasRow(ChecklistApp.ROW.SETTINGS)) return settings;
    
    const lastSheetColumn = checklist.lastColumn;
    const settingsSheetValues = checklist.getRowValues(ChecklistApp.ROW.SETTINGS,2);
    console.log(settingsSheetValues);
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
    console.log(settingsSheetValues);
    checklist.setRowValues(ChecklistApp.ROW.SETTINGS, settingsSheetValues, 2);
    
    timeEnd();
    return settingsCache = settings;
  }

  function resetSettings(sheet = ChecklistApp.getActiveSheet(), _mode) {
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
    const checklist = ChecklistApp.fromSheet(sheet);
    const settingsObject = getSettingsObject(sheet);
    
    const range = checklist.getRowRange(ChecklistApp.ROW.SETTINGS,2);
    const settingRowValues = checklist.getRowValues(ChecklistApp.ROW.SETTINGS,2);
    
    let first = true;
    for (let column = 1; column <= settingRowValues.length; column++) {
      const cellValue = settingRowValues[column-1];
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
          validation.requireFormulaSatisfied(FORMULA(FORMULA.VALUE.FALSE));
        }
        cell.setDataValidation(validation);
      }
    }
    
    timeEnd();
  }

  function _checkCustomMode(sheet) {
    time();
    const checklist = ChecklistApp.fromSheet(sheet);
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
      const cell = checklist.getRange(ChecklistApp.ROW.SETTINGS, settingsObject.Mode.column);
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
      const checklist = ChecklistApp.fromSheet(sheet);
      const criteria = checklist.filter && checklist.filter.getColumnFilterCriteria(checklist.toColumnIndex(columnId));
      const hiddenValues = criteria && criteria.getHiddenValues();
      return hiddenValues && hiddenValues.includes(value) ? ifHidden : ifVisible;
    };
  }

  function _generateUpdateFilterValuesVisibilityFunction(columnName, valuesToShow, valuesToHide) {
    return function updateFilterValuesVisibility(sheet) {
      time(columnName, true);
      const checklist = ChecklistApp.fromSheet(sheet);
      let changed = false;
      const criteria = checklist.filter.getColumnFilterCriteria(checklist.toColumnIndex(columnName));
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
        checklist.filter.setColumnFilterCriteria(checklist.toColumnIndex(columnName), newCriteria);
      }
      timeEnd(columnName,true);
    };
  }

  function _generateColumnVisibilityDeterminer(columnId, ifVisible, ifHidden) {
    return function columnVisibilityDeterminer(sheet) {
      const checklist = ChecklistApp.fromSheet(sheet);
      return sheet.isColumnHiddenByUser(checklist.toColumnIndex(columnId)) ? ifHidden : ifVisible;
    };
  }

  function _generateSetColumnVisibilityFunction(columnId, isVisible) {
    return function setColumnVisibility(sheet) {
      time(columnId + " " + isVisible, true);
      const checklist = ChecklistApp.fromSheet(sheet);
      const columnIndex = checklist.toColumnIndex(columnId);
      if (!columnIndex) throw new Error("Column does not exist", columnId);
      
      if (isVisible) {
        sheet.showColumns(columnIndex);
      } else {
        sheet.hideColumns(columnIndex);
      }
      timeEnd(columnId + " " + isVisible, true);
    };
  }

  function _generateSetEditableFunction(editable) {
    return function setEditable(sheet) {
      time();
      const checklist = ChecklistApp.fromSheet(sheet);
      const preReqColumnRange = checklist.getColumnDataRange(ChecklistApp.COLUMN.PRE_REQS);
      
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
        if (checklist.hasRow(ChecklistApp.ROW.QUICK_FILTER)) {
          unprotected.push(checklist.getUnboundedRowRange(ChecklistApp.ROW.QUICK_FILTER));
        }
        if (checklist.hasRow(ChecklistApp.ROW.SETTINGS)) {
          unprotected.push(checklist.getUnboundedRowRange(ChecklistApp.ROW.SETTINGS));
        }
        if (checklist.hasColumn(ChecklistApp.COLUMN.CHECK)) {
          unprotected.push(checklist.getUnboundedColumnDataRange(ChecklistApp.COLUMN.CHECK));
        }
        protection.setUnprotectedRanges(unprotected);
        META.setEditable(checklist, false);
        // console.log("Set Editable: [unprotect.length, rows, columns]",[unprotected.length, rows, columns]);
        // Remove validation
        preReqColumnRange.clearDataValidations();
        //missedColumnRange.clearDataValidations();
        //META.removeDataValidation(sheet);
      } else {
        // Remove protection
        META.setEditable(checklist, true);
        
        const validation = SpreadsheetApp
          .newDataValidation()
          .requireValueInRange(checklist.getUnboundedColumnDataRange(ChecklistApp.COLUMN.ITEM), true)
          .setAllowInvalid(true)
          .build();
        // Add Pre-Req validation
        preReqColumnRange.setDataValidation(validation);
        // missedColumnRange.setDataValidation(validation);
        META.setDataValidation(checklist);
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
      const checklist = ChecklistApp.fromSheet(sheet);
      if (enabled) {
        if (!checklist.hasRow(ChecklistApp.ROW.QUICK_FILTER)) {
          checklist.toggleQuickFilterRow(true);
          resetCache();
          const filterValueRange = checklist.getRowRange(ChecklistApp.ROW.QUICK_FILTER, 2);
          const color = filterValueRange.getBackgroundObject().asRgbColor().asHexString();
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
        checklist.toggleQuickFilterRow(false);
        resetCache();
        const lastColumn = checklist.lastColumn;
        for (let column = 2; column <= lastColumn; column++) {
          const criteria = checklist.filter && checklist.filter.getColumnFilterCriteria(column);
          if (criteria && criteria.getCriteriaType() == SpreadsheetApp.BooleanCriteria.CUSTOM_FORMULA) {
            checklist.filter.removeColumnFilterCriteria(column);
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
    isEditable: (_sheet = ChecklistApp.getActiveSheet()) => getSetting(_sheet, "Editable") == "Yes",

    resetCache: resetCache,
  };
})();

// eslint-disable-next-line no-unused-vars
function debug() {
  const sheet = ChecklistApp.getActiveSheet();
  SETTINGS.setSetting(sheet, "Editable");
//  getSettingsObject(SpreadsheetApp.getActiveSheet());
}