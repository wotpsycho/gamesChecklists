/* exported ChecklistSettings */
// eslint-disable-next-line no-redeclare
const ChecklistSettings = (function(){

  const SETTING = {
    MODE        : "Mode",
    STATUS      : "Unavailable",
    NOTES       : "Notes",
    PRE_REQS    : "Pre-Reqs",
    BLANKS      : "Blanks",
    EDITABLE    : "Editable",
    QUICK_FILTER: "Quick Filter",
    ACTION      : "Action"
  };

  const SETTING_OPTIONS = {
    [SETTING.MODE]        : {
      EDIT   : "Edit",
      CREATE : "Create",
      CLASSIC: "Classic",
      DYNAMIC: "Dynamic",
    },
    [SETTING.STATUS]      : {
      AVAILABLE: "Available Only",
      ALL      : "All",
    },
    [SETTING.NOTES]       : {
      HIDE: "Hover Only",
      SHOW: "Column+Hover",
    },
    [SETTING.PRE_REQS]    : {
      HIDE: "Hide",
      SHOW: "Show",
    },
    [SETTING.BLANKS]      : {
      HIDE: "Hide",
      SHOW: "Show",
    },
    [SETTING.EDITABLE]    : {
      YES: "Yes",
      NO:  "No",
    },
    [SETTING.QUICK_FILTER]: {
      ON:  "On",
      OFF: "Off",
    },
    [SETTING.ACTION]      : {
      NONE        : "...",
      REFRESH     : "Refresh Checklist",
      META        : "Sync Meta",
      QUICK_FILTER: "Toggle Quick Filter",
      RESET       : "RESET",
    }
  };

  const SETTING_DEFAULTS = {
    [SETTING.MODE]        : SETTING_OPTIONS[SETTING.MODE].EDIT,
    [SETTING.STATUS]      : SETTING_OPTIONS[SETTING.STATUS].ALL,
    [SETTING.NOTES]       : SETTING_OPTIONS[SETTING.NOTES].SHOW,
    [SETTING.PRE_REQS]    : SETTING_OPTIONS[SETTING.PRE_REQS].SHOW,
    [SETTING.BLANKS]      : SETTING_OPTIONS[SETTING.BLANKS].SHOW,
    [SETTING.EDITABLE]    : SETTING_OPTIONS[SETTING.EDITABLE].YES,
    [SETTING.QUICK_FILTER]: SETTING_OPTIONS[SETTING.QUICK_FILTER].OFF,
    [SETTING.ACTION]      : SETTING_OPTIONS[SETTING.ACTION].NONE,
  };

  const DESCRIPTIONS = {
    [SETTING.MODE]: {
      [SETTING_OPTIONS[SETTING.MODE].DYNAMIC]: "Only available items are shown, updates as you check them off",
      [SETTING_OPTIONS[SETTING.MODE].CLASSIC]: "All items are shown, with Pre-Reqs column showing item availability",
      [SETTING_OPTIONS[SETTING.MODE].EDIT]   : "All items and columns are shown and editable, useful for fixing errors",
      [SETTING_OPTIONS[SETTING.MODE].CREATE] : "Mix of Dynamic and Edit, only available items are shown and can edit/add new items",
    },
    [SETTING.ACTION]: {
      [SETTING_OPTIONS[SETTING.ACTION].REFRESH]     : "Refresh the Checklist, resetting any formatting, filtering, and visibility changes",
      [SETTING_OPTIONS[SETTING.ACTION].META]        : "Formatting and dropdowns from Meta to Checklist, new values added to Meta for formatting",
      [SETTING_OPTIONS[SETTING.ACTION].QUICK_FILTER]: "Turn Quick Filter row On or Off",
      [SETTING_OPTIONS[SETTING.ACTION].RESET]       : "Reset checkmarks for the Checklist after prompt",
    },
  };

  const MODE = SETTING_OPTIONS[SETTING.MODE];
  
  const MODE_SETTINGS = {
    [MODE.EDIT]: {
      [SETTING.STATUS]  : SETTING_OPTIONS[SETTING.STATUS].ALL,
      [SETTING.NOTES]   : SETTING_OPTIONS[SETTING.NOTES].SHOW,
      [SETTING.PRE_REQS]: SETTING_OPTIONS[SETTING.PRE_REQS].SHOW,
      [SETTING.BLANKS]  : SETTING_OPTIONS[SETTING.BLANKS].SHOW,
      [SETTING.EDITABLE]: SETTING_OPTIONS[SETTING.EDITABLE].YES,
    },
    [MODE.CREATE]: {
      [SETTING.STATUS]  : SETTING_OPTIONS[SETTING.STATUS].AVAILABLE,
      [SETTING.NOTES]   : SETTING_OPTIONS[SETTING.NOTES].SHOW,
      [SETTING.PRE_REQS]: SETTING_OPTIONS[SETTING.PRE_REQS].SHOW,
      [SETTING.BLANKS]  : SETTING_OPTIONS[SETTING.BLANKS].SHOW,
      [SETTING.EDITABLE]: SETTING_OPTIONS[SETTING.EDITABLE].YES,
    },
    [MODE.DYNAMIC]: {
      [SETTING.STATUS]  : SETTING_OPTIONS[SETTING.STATUS].AVAILABLE,
      [SETTING.NOTES]   : SETTING_OPTIONS[SETTING.NOTES].HIDE,
      [SETTING.PRE_REQS]: SETTING_OPTIONS[SETTING.PRE_REQS].HIDE,
      [SETTING.BLANKS]  : SETTING_OPTIONS[SETTING.BLANKS].HIDE,
      [SETTING.EDITABLE]: SETTING_OPTIONS[SETTING.EDITABLE].NO,
    },
    [MODE.CLASSIC]: {
      [SETTING.STATUS]  : SETTING_OPTIONS[SETTING.STATUS].ALL,
      [SETTING.NOTES]   : SETTING_OPTIONS[SETTING.NOTES].HIDE,
      [SETTING.PRE_REQS]: SETTING_OPTIONS[SETTING.PRE_REQS].SHOW,
      [SETTING.BLANKS]  : SETTING_OPTIONS[SETTING.BLANKS].SHOW,
      [SETTING.EDITABLE]: SETTING_OPTIONS[SETTING.EDITABLE].NO,
    },
  };

  const SETTING_REGEX = /^ *(.+) *: *(.+?)(\*)? *$/;

  class ChecklistSettingsError extends Error {}

  let creationLock = true;
  const checklistSettings = {};
  class ChecklistSettings {
    constructor(checklist) {
      if (creationLock) throw new Error("Do not create directly, use ChecklistSettings.getSettingsFor... methods instead");
      Object.defineProperty(this,"checklist",{value: checklist});

    }

    static getSettingsForChecklist(checklist = ChecklistApp.getActiveChecklist()) {
      if (!checklistSettings[checklist.sheetId]) {
        creationLock = false;
        checklistSettings[checklist.sheetId] = new ChecklistSettings(checklist);
        creationLock = true;
      }
      return checklistSettings[checklist.sheetId];
    }

    static getSettingsForActiveChecklist() {
      return ChecklistSettings.getSettingsForChecklist(ChecklistApp.getActiveChecklist());
    }

    static handleChange(event) {
      const checklist = ChecklistApp.getChecklistBySheet(event.range.getSheet());
      const settings = this.getSettingsForChecklist(checklist);
      settings.handleChange(event);
    }

    handleChange(event) {
      time("settings handleChange");
      if (event.range.getSheet().getSheetId() != this.checklist.sheetId) throw new ChecklistSettingsError("Cannot handle event for a different sheet");
      if (event.value || event.oldValue) {
        // single setting change, set if has value
        if (event.value) {
          const [,setting,value] = event.value.match(SETTING_REGEX) || [];
          if (setting) {
            this.setSetting(setting,value);
            if (event.oldValue && setting == event.oldValue.match(SETTING_REGEX)[1]) {
              return;
            }
          }
        }
      } else {
        Object.entries(this._rowSettings).forEach(([setting,rowSetting]) => {
          if (rowSetting.column >= event.range.getColumn() && rowSetting.column <= event.range.getLastColumn()) {
            // execute the setting
            this.settings[setting].set(rowSetting.value);
          }
        });
      }
      this.setDataValidation();
      timeEnd("settings handleChange");
    }

    setDataValidation() {
      time("settings dataValidation");
      const rowRange = this.checklist.getRowRange(this.row,2);
      rowRange.clearDataValidations().clearContent();
      [SETTING.MODE,SETTING.ACTION].forEach((setting,i) => {
        const cell = rowRange.getCell(1,i+1);
        cell.setValue(`${setting}: ${this.getSetting(setting)}`);
        cell.setDataValidation(SpreadsheetApp.newDataValidation().setAllowInvalid(false).requireValueInList(Object.values(this.settings[setting].options).map(option => `${setting}: ${option}`),true));
        const notes = Object.entries(this.settings[setting].descriptions).reduce((notes,[option, description]) => {
          if (description) notes.push(`•${option}: ${description}`);
          return notes;
        },[]);
        if (notes.length) cell.setNote(notes.join("\n"));
      });
      timeEnd("settings dataValidation");
    }

    get settings() {
      if (!this._settings) {
        const ChecklistSetting = this.ChecklistSetting;
        const settings = {
          [SETTING.MODE]        : new ChecklistSetting.ModeSetting(),
          [SETTING.STATUS]      : new ChecklistSetting.StatusColumnFilterSetting(),
          [SETTING.NOTES]       : new ChecklistSetting.ColumnVisibilitySetting(SETTING.NOTES,ChecklistApp.COLUMN.NOTES,SETTING_OPTIONS[SETTING.NOTES].SHOW,SETTING_OPTIONS[SETTING.NOTES].HIDE),
          [SETTING.PRE_REQS]    : new ChecklistSetting.PreReqsVisibilitySetting(),
          [SETTING.BLANKS]      : new ChecklistSetting.ColumnFilterSetting(SETTING.BLANKS,ChecklistApp.COLUMN.ITEM,{
            [SETTING_OPTIONS[SETTING.BLANKS].SHOW]: [],
            [SETTING_OPTIONS[SETTING.BLANKS].HIDE]: [""],
          }),
          [SETTING.EDITABLE]    : new ChecklistSetting.EditableSetting(),
          [SETTING.QUICK_FILTER]: new ChecklistSetting.QuickFilterSetting(),
          [SETTING.ACTION]      : new ChecklistSetting.ChecklistActions(),
        };
        Object.defineProperty(this,"_settings",{value: settings});
      }
      return Object.freeze({...this._settings});
    }

    get row() {
      return ChecklistApp.ROW.SETTINGS;
    }

    _getChecklistSetting(setting) {
      if (!this.settings[setting]) throw new ChecklistSettingsError(`Invalid setting "${setting}"`);
      return this.settings[setting];
    }

    getSettingOptions(setting) {
      return this._getChecklistSetting(setting).options;
    }

    getSetting(setting) {
      return this._getChecklistSetting(setting).get();
    }

    setSetting(setting, value) {
      this._getChecklistSetting(setting).set(value);
      if (this._rowSettings[setting]) {
        const newValue = `${setting}: ${this.getSetting(setting)}`;
        this.checklist.setValue(this.row,this._rowSettings[setting].column, newValue);
      }
    }

    setSettings(settings) {
      time("setSettings");
      if (settings[SETTING.EDITABLE] && settings[SETTING.EDITABLE] == SETTING_OPTIONS[SETTING.EDITABLE].YES) {
        this.setSetting(SETTING.EDITABLE,settings[SETTING.EDITABLE]);
      }
      Object.entries(settings).forEach(([setting,value]) => {
        if (setting != SETTING.EDITABLE) {
          this.setSetting(setting,value);
        }
      });
      if (settings[SETTING.EDITABLE] && settings[SETTING.EDITABLE] == SETTING_OPTIONS[SETTING.EDITABLE].NO) {
        this.setSetting(SETTING.EDITABLE,settings[SETTING.EDITABLE]);
      }
      timeEnd("setSettings");
    }
    // TODO menus

    _getInitialValue(setting) {
      return this._rowSettings[setting] && this._rowSettings[setting].value;
    }

    get _rowSettings() {
      if (!this.__rowSettings) {
        let rowSettings;
        if (this.checklist.hasRow(this.row)) {
          rowSettings = this.checklist.getRowValues(this.row,2).reduce((rowSettings,cellValue,i) => {
            if (cellValue) {
              const [, cellSetting, cellSettingValue,isCustom] = cellValue && cellValue.match(SETTING_REGEX) || [];
              if (cellSetting) rowSettings[cellSetting] = {value: cellSettingValue, column: i+2,isCustom:!!isCustom};
              else this.checklist.setValue(this.row,i+2,null);
            }
            return rowSettings;
          },{});
        }
        Object.defineProperty(this,"__rowSettings",{value:rowSettings || {}});
      }
      return this.__rowSettings;
    }

    get ChecklistSetting() {
      const immutableLazyLoadedValueName = "_ChecklistSetting";
      if (this[immutableLazyLoadedValueName]) return this[immutableLazyLoadedValueName];

      const {STATUS,ROW,COLUMN} = ChecklistApp;
      const checklist = this.checklist;
      const checklistSettings = this;
      class ChecklistSetting {
        constructor(setting, options,_initialValue) {
          if (Array.isArray(options)) options = options.reduce((options, option) => ({...options, [option.name]: option}), {});

          Object.defineProperty(this,"setting", {value: setting});
          Object.defineProperty(this, "_options", {value: options});
          Object.defineProperty(this,"_initialValue",{value: _initialValue});
        }

        get options() {
          return Object.keys(this._options);
        }

        get descriptions() {
          return Object.values(this._options).reduce((descriptions, option) => ({
            ...descriptions,
            [option.name]: option.description,
          }),{});
        }

        _determineValue() {
          return SETTING_DEFAULTS[this.setting];
        }

        get() {
          if (!this._currentValue) {
            // Passed value (unsure of use case)
            let value = this._initialValue;
            if (!value) {
              // Read from settings row
              value = checklistSettings._getInitialValue(this.setting);
            }
            if (!value) {
              // Determine from page (child class) or use default
              value = this._determineValue();
            }
            Object.defineProperty(this,"_currentValue",{
              configurable: true, 
              value: value
            });
          }
          return this._currentValue;
        }

        set(newValue) {
          if (!newValue) {
            // Use the default value, not from page/determiner
            newValue = ChecklistSetting.prototype._determineValue.call(this);
          } else if (!this._options[newValue]) throw new ChecklistSettingsError(`Invalid option "${newValue}" for setting "${this.setting}"`);
          Object.defineProperty(this,"_currentValue",{configurable:true,value:newValue});
          this._options[newValue].activate();
        }
      }

      class ModeSetting extends ChecklistSetting {
        constructor(_initialValue) {
          const modeOptions = Object.values(SETTING_OPTIONS[SETTING.MODE]).map(mode => new ChecklistSetting.SettingOption(mode, new ChecklistSetting.SetModeAction(mode), DESCRIPTIONS[SETTING.MODE] && DESCRIPTIONS[SETTING.MODE][mode]));
          super(SETTING.MODE, modeOptions,_initialValue);
        }
        _determineValue() {
          time("determineMode");
          const value = this.options.find(mode => 
            Object.entries(MODE_SETTINGS[mode]).reduce((hasSettings, [setting, modeValue]) => 
              hasSettings && checklistSettings.getSetting(setting) == modeValue
            , true)
          ) || super._determineValue();
          timeEnd("determineMode");          
          return value;
        }
      }

      class ColumnFilterSetting extends ChecklistSetting {
        constructor(setting, column, optionToHiddenValues, _initialValue) {
          const allValues = new Set(Object.values(optionToHiddenValues).flat());
          const options = Object.entries(optionToHiddenValues).map(([option,hiddenValues]) =>{
            const action = new ChangeColumnFilterAction(column,[...allValues],hiddenValues);
            return new SettingOption(option,action, DESCRIPTIONS[setting] && DESCRIPTIONS[setting][option]);
          });
          super(setting,options,_initialValue);
          Object.defineProperty(this,"column",{value: column});
          Object.defineProperty(this,"optionsHiddenValues",{value: optionToHiddenValues});
          Object.defineProperty(this,"allValues",{value: allValues});
        }
        _determineValue() {
          const criteria = checklist.filter.getColumnFilterCriteria(checklist.toColumnIndex(this.column));
          const hiddenValuesInSet = (criteria && criteria.getHiddenValues() || []).filter(value => this.allValues.has(value));
          for (const option in this.optionsHiddenValues) {
            let optionHiddenValues = this.optionsHiddenValues[option];
            if (typeof optionHiddenValues == "undefined") optionHiddenValues = [];
            else if (!Array.isArray(optionHiddenValues)) optionHiddenValues = [optionHiddenValues];
            if (hiddenValuesInSet.length == optionHiddenValues.length && hiddenValuesInSet.filter(value => !optionHiddenValues.includes(value)).length == 0) {
              // The values we care about that are hidden are the same as this options
              return option; 
            }
          }
          return super._determineValue(); // Edge case with manually edited values we care about, just show default
        }
      }

      class StatusColumnFilterSetting extends ColumnFilterSetting {
        constructor(_initialValue) {
          const {AVAILABLE,ALL} = SETTING_OPTIONS[SETTING.STATUS];
          const optionToHiddenValues = {
            [AVAILABLE]: [STATUS.CHECKED,STATUS.MISSED,STATUS.PR_NOT_MET,STATUS.PR_USED,STATUS.UNKNOWN],
            [ALL]      : []
          };

          super(SETTING.STATUS,COLUMN.STATUS,optionToHiddenValues,_initialValue);
          this._options[ALL].addAction(new SetSettingAction(SETTING.PRE_REQS,SETTING_OPTIONS[SETTING.PRE_REQS].SHOW));
        }
      }

      class ColumnVisibilitySetting extends ChecklistSetting {
        constructor(setting, column, showOption, hideOption, _initialValue) {
          const options = {
            [showOption]: new SettingOption(showOption, new ChangeColumnVisibilityAction(column,true) , DESCRIPTIONS[setting] && DESCRIPTIONS[setting][showOption]),
            [hideOption]: new SettingOption(hideOption, new ChangeColumnVisibilityAction(column,false), DESCRIPTIONS[setting] && DESCRIPTIONS[setting][hideOption]),
          };
          super(setting,options,_initialValue);
          Object.defineProperty(this,"visibilityToOption",{value: {[true]: showOption, [false]: hideOption}});
          Object.defineProperty(this,"column",{value: column});
        }
        _determineValue() {
          return this.visibilityToOption[!checklist.isColumnHidden(this.column)];
        }
      }

      class PreReqsVisibilitySetting extends ColumnVisibilitySetting {
        constructor(_initialValue) {
          const {SHOW,HIDE} = SETTING_OPTIONS[SETTING.PRE_REQS];
          super(SETTING.PRE_REQS,COLUMN.PRE_REQS, SHOW, HIDE,_initialValue);
          this._options[HIDE].addAction(new SetSettingAction(SETTING.STATUS,SETTING_OPTIONS[SETTING.STATUS].AVAILABLE));
        }
      }

      class EditableSetting extends ChecklistSetting {
        constructor(_initialValue) {
          const {YES,NO} = SETTING_OPTIONS[SETTING.EDITABLE];
          const options = {
            [YES]: new SettingOption(YES, new ToggleChecklistEditableAction(true) , DESCRIPTIONS[SETTING.EDITABLE] && DESCRIPTIONS[SETTING.EDITABLE][YES]),
            [NO] : new SettingOption(NO , new ToggleChecklistEditableAction(false), DESCRIPTIONS[SETTING.EDITABLE] && DESCRIPTIONS[SETTING.EDITABLE][NO]),
          };
          super(SETTING.EDITABLE,options,_initialValue);
        }
        _determineValue() {
          const {YES,NO} = SETTING_OPTIONS[SETTING.EDITABLE];
          return checklist.editable ? YES : NO;
        }
      }

      class QuickFilterSetting extends ChecklistSetting {
        constructor(_initalValue) {
          const {ON,OFF} = SETTING_OPTIONS[SETTING.QUICK_FILTER];
          const options = {
            [ON]:  new SettingOption(ON , new ToggleQuickFilterAction(true),  DESCRIPTIONS[SETTING.QUICK_FILTER] && DESCRIPTIONS[SETTING.QUICK_FILTER][ON]),
            [OFF]: new SettingOption(OFF, new ToggleQuickFilterAction(false), DESCRIPTIONS[SETTING.QUICK_FILTER] && DESCRIPTIONS[SETTING.QUICK_FILTER][OFF]),
          };
          super(SETTING.QUICK_FILTER,options,_initalValue);
        }
        _determineValue() {
          const {ON,OFF} = SETTING_OPTIONS[SETTING.QUICK_FILTER];
          return checklist.hasRow(ROW.QUICK_FILTER) ? ON : OFF;
        }
      }

      class ChecklistActions extends ChecklistSetting {
        constructor() {
          // const {NONE,REFRESH,META,RESET} = SETTING_OPTIONS[SETTING.ACTION];
          const {NONE,REFRESH,META,QUICK_FILTER} = SETTING_OPTIONS[SETTING.ACTION];
          const setNoneAction = new SetSettingAction(SETTING.ACTION, NONE);
          const refreshAction = new class extends SettingAction{
            execute() {
              checklist.reset();
            }
          }();
          const metaAction = new class extends SettingAction{
            execute() {
              if (!checklist.meta) ChecklistMeta.promptMetaSheetCreate(checklist);
              if (checklist.meta) checklist.syncMeta();
            }
          }();
          // const resetAction = new class extends SettingAction {
          //   execute() {
              
          //     // const response = Che
          //   }
          // };
          const descriptions = DESCRIPTIONS[SETTING.ACTION] || {};
          const options = {
            [NONE]   : new SettingOption(NONE   , []                           , descriptions[NONE]),
            [REFRESH]: new SettingOption(REFRESH, [setNoneAction,refreshAction], descriptions[REFRESH]),
            [META]   : new SettingOption(META   , [setNoneAction,metaAction], descriptions[META]),
            [QUICK_FILTER]: new SettingOption(QUICK_FILTER, [setNoneAction,new ToggleQuickFilterAction()], descriptions[QUICK_FILTER])
          };
          super(SETTING.ACTION,options);
        }
      }

      class SettingOption {
        constructor(name, actions, _description) {
          if (!Array.isArray(actions)) actions = [actions];
          Object.defineProperty(this,"name",        {value: name});
          Object.defineProperty(this,"description", {value: _description});
          Object.defineProperty(this,"actions",     {value: actions || []});
        }

        addAction(action) {
          this.actions.push(action);
        }

        activate() {
          this.actions.forEach(action => action.execute());
        }
      }

      class SettingAction {
        constructor() {
          // Nothing yet
        }
        execute() {
          // abstract
          throw new ChecklistSettingsError("SettingActions must implement execute");
        }
      }

      class ChangeColumnFilterAction extends SettingAction {
        constructor(column, expectedValues = [], valuesToHide = []) {
          super();
          // if (!checklist.hasColumn(column)) throw new ChecklistSettingsError(`Invalid Column: ${column}`);
          if (typeof expectedValues != "undefined" && !Array.isArray(expectedValues)) expectedValues = [expectedValues];
          if (typeof valuesToHide != "undefined" && !Array.isArray(valuesToHide)) valuesToHide = [valuesToHide];
          Object.defineProperty(this,"column"        ,{value: column});
          Object.defineProperty(this,"expectedValues",{value: Object.freeze(expectedValues || [])});
          Object.defineProperty(this,"valuesToHide"  ,{value: Object.freeze(valuesToHide || [])});
        }
        execute() {
          time(`updateFilterVisibility ${this.column}`);
          const columnIndex = checklist.toColumnIndex(this.column);
          const currentCriteria = checklist.filter.getColumnFilterCriteria(columnIndex);
          const hiddenValues = new Set(this.valuesToHide);
          if (currentCriteria) {
            currentCriteria.getHiddenValues().filter(value => !this.expectedValues.includes(value)).forEach(hiddenValues.add,hiddenValues);
          }
          if (currentCriteria || hiddenValues.size) {
            const newCriteria = currentCriteria && currentCriteria.copy() || SpreadsheetApp.newFilterCriteria();
            newCriteria.setHiddenValues([...hiddenValues]);
            checklist.filter.setColumnFilterCriteria(columnIndex, newCriteria);
          }
          timeEnd(`updateFilterVisibility ${this.column}`);
        }
      }      

      class ChangeColumnVisibilityAction extends SettingAction {
        constructor(column, shouldShow) {
          super();
          // if (!checklist.hasColumn(column)) throw new ChecklistSettingsError(`Invalid Column: ${column}`);
          Object.defineProperty(this,"column",    {value: column});
          Object.defineProperty(this,"shouldShow",{value: shouldShow});
        }
        execute() {
          time(`changeColumnVisibility ${this.column}`);
          const columnIndex = checklist.toColumnIndex(this.column);
          if (this.shouldShow) {
            checklist.sheet.showColumns(columnIndex);
          } else {
            checklist.sheet.hideColumns(columnIndex);
          }
          timeEnd(`changeColumnVisibility ${this.column}`);
        }
      }

      class ToggleChecklistEditableAction extends SettingAction {
        constructor(editable) {
          super();
          Object.defineProperty(this,"editable",{value: editable});
        }
        execute() {
          time(`setEditable ${this.editable}`);
          checklist.editable = this.editable;
          timeEnd(`setEditable ${this.editable}`);
        }
      }

      class SetSettingAction extends SettingAction {
        constructor(setting, newValue) {
          super();
          Object.defineProperty(this,"setting", {value: setting});
          Object.defineProperty(this,"newValue",{value: newValue});
        }
        execute() {
          checklistSettings.setSetting(this.setting, this.newValue);
        }
      }

      class SetModeAction extends SetSettingAction {
        constructor(newMode) {
          super(SETTING.MODE, newMode);
          Object.defineProperty(this,"newMode",{value: newMode});
        }
        execute() {
          time(`setMode ${this.newMode}`);
          checklist.toast(`Setting mode to ${this.newMode}...`,-1);
          checklistSettings.setSettings(MODE_SETTINGS[this.newMode]);
          checklist.toast(`Mode set to ${this.newMode}`);
          timeEnd(`setMode ${this.newMode}`);
        }
      }

      class ToggleQuickFilterAction extends SettingAction {
        constructor(enabled) {
          super();
          Object.defineProperty(this,"enabled",{value: enabled});
        }

        execute() {
          time("toggleQuickFilter");
          checklist.toast("Toggling Quick Filter...",-1);
          checklist.toggleQuickFilterRow(this.enabled);
          checklist.toast(`Quick Filter ${typeof this.enabled == "undefined" ? "Toggled" : this.enabled ? "Enabled" : "Disabled"}`);
          timeEnd("toggleQuickFilter");
        }
      }
      Object.assign(ChecklistSetting,{
        ModeSetting,
        ColumnFilterSetting,
        StatusColumnFilterSetting,
        ColumnVisibilitySetting,
        PreReqsVisibilitySetting,
        EditableSetting,
        QuickFilterSetting,
        ChecklistActions,
        SettingOption,
        ChangeColumnFilterAction,
        ChangeColumnVisibilityAction,
        ToggleChecklistEditableAction,
        SetSettingAction,
        SetModeAction,
        ToggleQuickFilterAction
      });

      
      Object.defineProperty(this,immutableLazyLoadedValueName, {value: ChecklistSetting});
      return this[immutableLazyLoadedValueName];
    }
  }
  Object.defineProperty(ChecklistSettings,"SETTING",{value:SETTING});
  
  return ChecklistSettings;
})();