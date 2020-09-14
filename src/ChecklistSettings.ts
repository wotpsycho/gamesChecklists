// eslint-disable-next-line @typescript-eslint/no-unused-vars
namespace Settings {
  type row = ChecklistApp.row;
  type column = ChecklistApp.column;
  export enum SETTING  {
    MODE        = "Mode",
    STATUS      = "Unavailable",
    NOTES       = "Notes",
    PRE_REQS    = "Pre-Reqs",
    BLANKS      = "Blanks",
    EDITABLE    = "Editable",
    QUICK_FILTER= "Quick Filter",
    ACTION      = "Action"
  }
  
  export enum MODE {
    EDIT   = "Edit",
    CREATE = "Create",
    CLASSIC= "Classic",
    DYNAMIC= "Dynamic",
  }

  const SETTING_OPTIONS = {
    [SETTING.MODE]        : MODE,
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

  
  const MODE_SETTINGS: {
    [x in MODE]: {
      [y in SETTING]?: string;
    }
  } = {
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

  // const checklistSettings: {[x:number]:ChecklistSettings} = {};

  export class ChecklistSettings {
    readonly checklist: ChecklistApp.Checklist;
    private constructor(checklist: ChecklistApp.Checklist) {
      this.checklist = checklist;
    }

    private static readonly checklistSettings: {[x:number]:ChecklistSettings} = {}

    static getSettingsForChecklist(checklist = ChecklistApp.getActiveChecklist()): ChecklistSettings {
      if (!this.checklistSettings[checklist.sheetId]) {
        this.checklistSettings[checklist.sheetId] = new ChecklistSettings(checklist);
      }
      return this.checklistSettings[checklist.sheetId];
    }

    static getSettingsForActiveChecklist(): ChecklistSettings {
      return ChecklistSettings.getSettingsForChecklist(ChecklistApp.getActiveChecklist());
    }

    static handleChange(checklist: ChecklistApp.Checklist,event: GoogleAppsScript.Events.SheetsOnEdit): void {
      const settings = this.getSettingsForChecklist(checklist);
      settings.handleChange(event);
    }

    handleChange(event: GoogleAppsScript.Events.SheetsOnEdit): void {
      time("settings handleChange");
      if (event.range.getSheet().getSheetId() != this.checklist.sheetId) throw new ChecklistSettingsError("Cannot handle event for a different sheet");
      if (event.value || event.oldValue) {
        // single setting change, set if has value
        if (event.value) {
          const [,setting,value] = event.value.match(SETTING_REGEX) || [];
          if (setting) {
            this.setSetting(setting as SETTING,value);
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

    setDataValidation(): void {
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

    private _settings: { [x in SETTING]: ChecklistSetting; };
    private get settings(): {[x in SETTING]: Readonly<ChecklistSetting>} {
      if (!this._settings) {
        
        const settings = {
          [SETTING.MODE]        : new ModeSetting(this),
          [SETTING.STATUS]      : new StatusColumnFilterSetting(this),
          [SETTING.NOTES]       : new ColumnVisibilitySetting(this,SETTING.NOTES,ChecklistApp.COLUMN.NOTES,SETTING_OPTIONS[SETTING.NOTES].SHOW,SETTING_OPTIONS[SETTING.NOTES].HIDE),
          [SETTING.PRE_REQS]    : new PreReqsVisibilitySetting(this,),
          [SETTING.BLANKS]      : new ColumnFilterSetting(this,SETTING.BLANKS,ChecklistApp.COLUMN.ITEM,{
            [SETTING_OPTIONS[SETTING.BLANKS].SHOW]: [],
            [SETTING_OPTIONS[SETTING.BLANKS].HIDE]: [""],
          }),
          [SETTING.EDITABLE]    : new EditableSetting(this),
          [SETTING.QUICK_FILTER]: new QuickFilterSetting(this),
          [SETTING.ACTION]      : new ChecklistActions(this),
        };
        this._settings = settings;
      }
      return this._settings;
    }

    private get row(): row {
      return ChecklistApp.ROW.SETTINGS;
    }

    private _getChecklistSetting(setting:SETTING) {
      if (!this.settings[setting]) throw new ChecklistSettingsError(`Invalid setting "${setting}"`);
      return this.settings[setting];
    }

    getSettingOptions(setting:SETTING): string[] {
      return this._getChecklistSetting(setting).options;
    }

    getSetting(setting: SETTING): string {
      return this._getChecklistSetting(setting).get();
    }

    setSetting(setting: SETTING, value: string): void {
      this._getChecklistSetting(setting).set(value);
      if (this._rowSettings[setting]) {
        const newValue = `${setting}: ${this.getSetting(setting)}`;
        this.checklist.setValue(this.row,this._rowSettings[setting].column, newValue);
      }
    }

    setSettings(settings: {[x in SETTING]:string}): void {
      time("setSettings");
      if (settings[SETTING.EDITABLE] && settings[SETTING.EDITABLE] == SETTING_OPTIONS[SETTING.EDITABLE].YES) {
        this.setSetting(SETTING.EDITABLE,settings[SETTING.EDITABLE]);
      }
      Object.entries(settings).forEach(([setting,value]:[SETTING,string]) => {
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

    getInitialValue(setting: SETTING): string {
      return this._rowSettings[setting] && this._rowSettings[setting].value;
    }

    private __rowSettings: { [x: string]: { value: string; column: number; isCustom: boolean; }; };
    private get _rowSettings(): {[x:string]: {value: string, column: number, isCustom: boolean}} {
      if (!this.__rowSettings) {
        let rowSettings;
        if (this.checklist.hasRow(this.row)) {
          rowSettings = this.checklist.getRowValues(this.row,2).reduce((rowSettings,cellValue,i) => {
            if (cellValue) {
              const [, cellSetting, cellSettingValue,isCustom] = cellValue && cellValue.toString().match(SETTING_REGEX) || [];
              if (cellSetting) rowSettings[cellSetting] = {value: cellSettingValue, column: i+2,isCustom:!!isCustom};
              else this.checklist.setValue(this.row,i+2,null);
            }
            return rowSettings;
          },{});
        }
        this.__rowSettings = rowSettings || {};
      }
      return this.__rowSettings;
    }
  }
  const {STATUS,ROW,COLUMN} = ChecklistApp;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
  class ChecklistSetting {
    readonly setting: SETTING;
    protected readonly _options: {[x:string]: SettingOption};
    private readonly _initialValue: string;
    protected readonly settings: ChecklistSettings;
    constructor(settings: ChecklistSettings, setting: SETTING, options: SettingOption[]|{[x:string]: SettingOption},_initialValue: string = undefined) {
      if (Array.isArray(options)) options = options.reduce((options, option) => ({...options, [option.name]: option}), {});
      this.settings = settings;
      this.setting = setting;
      this._options = options;
      this._initialValue = _initialValue;
    }

    get options(): string[] {
      return Object.keys(this._options);
    }

    get descriptions(): {[x:string]: string} {
      return Object.values(this._options).reduce((descriptions, option) => ({
        ...descriptions,
        [option.name]: option.description,
      }),{});
    }

    protected _determineValue(): string {
      return SETTING_DEFAULTS[this.setting];
    }

        private _currentValue: string;
        get(): string {
          if (!this._currentValue) {
            // Passed value (unsure of use case)
            let value = this._initialValue;
            if (!value) {
              // Read from settings row
              value = this.settings.getInitialValue(this.setting);
            }
            if (!value) {
              // Determine from page (child class) or use default
              value = this._determineValue();
            }
            this._currentValue = value;
          }
          return this._currentValue;
        }

        set(newValue: string): void {
          if (!newValue) {
            // Use the default value, not from page/determiner
            newValue = ChecklistSetting.prototype._determineValue.call(this);
          } else if (!this._options[newValue]) throw new ChecklistSettingsError(`Invalid option "${newValue}" for setting "${this.setting}"`);
          this._currentValue = newValue;
          this._options[newValue].activate();
        }
  }

        class ModeSetting extends ChecklistSetting {
          constructor(settings: ChecklistSettings,_initialValue: string = undefined) {
            const modeOptions = Object.values(SETTING_OPTIONS[SETTING.MODE]).map(mode => new SettingOption(mode, new SetModeAction(settings,mode), DESCRIPTIONS[SETTING.MODE] && DESCRIPTIONS[SETTING.MODE][mode]));
            super(settings,SETTING.MODE, modeOptions,_initialValue);
          }
          protected _determineValue(): string {
            time("determineMode");
            const value = this.options.find(mode => 
              Object.entries(MODE_SETTINGS[mode]).reduce((hasSettings, [setting, modeValue]: [SETTING,string]) => 
                hasSettings && this.settings.getSetting(setting) == modeValue
              , true)
            ) || super._determineValue();
            timeEnd("determineMode");          
            return value;
          }
        }

        class ColumnFilterSetting extends ChecklistSetting {
        private readonly column: column;
        private readonly optionsHiddenValues: {[x:string]: ReadonlyArray<string>};
        private readonly allValues: ReadonlySet<string>;
        constructor(settings: ChecklistSettings, setting: SETTING, column:column, optionToHiddenValues: {[x:string]: string[]}, _initialValue: string = undefined) {
          const allValues = new Set(Object.values(optionToHiddenValues).flat());
          const options = Object.entries(optionToHiddenValues).map(([option,hiddenValues]) =>{
            const action = new ChangeColumnFilterAction(settings,column,[...allValues],hiddenValues);
            return new SettingOption(option,action, DESCRIPTIONS[setting] && DESCRIPTIONS[setting][option]);
          });
          super(settings,setting,options,_initialValue);
          this.column = column;
          this.optionsHiddenValues = optionToHiddenValues;
          this.allValues = allValues;
        }
        _determineValue(): string {
          const criteria = this.settings.checklist.filter.getColumnFilterCriteria(this.settings.checklist.toColumnIndex(this.column));
          const hiddenValuesInSet = (criteria && criteria.getHiddenValues() || []).filter(value => this.allValues.has(value));
          for (const option in this.optionsHiddenValues) {
            let optionHiddenValues = this.optionsHiddenValues[option];
            if (typeof optionHiddenValues == "undefined") optionHiddenValues = [];
            if (hiddenValuesInSet.length == optionHiddenValues.length && hiddenValuesInSet.filter(value => !optionHiddenValues.includes(value)).length == 0) {
              // The values we care about that are hidden are the same as this options
              return option; 
            }
          }
          return super._determineValue(); // Edge case with manually edited values we care about, just show default
        }
        }

        class StatusColumnFilterSetting extends ColumnFilterSetting {
          constructor(settings: ChecklistSettings,_initialValue: string = undefined) {
            const {AVAILABLE,ALL} = SETTING_OPTIONS[SETTING.STATUS];
            const optionToHiddenValues = {
              [AVAILABLE]: [STATUS.CHECKED,STATUS.MISSED,STATUS.PR_NOT_MET,STATUS.PR_USED,STATUS.UNKNOWN],
              [ALL]      : []
            };

            super(settings,SETTING.STATUS,COLUMN.STATUS,optionToHiddenValues,_initialValue);
            this._options[ALL].addAction(new SetSettingAction(settings,SETTING.PRE_REQS,SETTING_OPTIONS[SETTING.PRE_REQS].SHOW));
          }
        }

        class ColumnVisibilitySetting extends ChecklistSetting {
          private readonly column: column;
          private readonly visibilityToOption: {[x:string]: string};
          constructor(settings: ChecklistSettings, setting: SETTING, column: column, showOption: string, hideOption: string, _initialValue: string = undefined) {
            const options = {
              [showOption]: new SettingOption(showOption, new ChangeColumnVisibilityAction(settings,column,true) , DESCRIPTIONS[setting] && DESCRIPTIONS[setting][showOption]),
              [hideOption]: new SettingOption(hideOption, new ChangeColumnVisibilityAction(settings,column,false), DESCRIPTIONS[setting] && DESCRIPTIONS[setting][hideOption]),
            };
            super(settings,setting,options,_initialValue);
            this.visibilityToOption = {[true.toString()]: showOption, [false.toString()]: hideOption};
            this.column = column;
          }
          _determineValue(): string{
            return this.visibilityToOption[(!this.settings.checklist.isColumnHidden(this.column)).toString()];
          }
        }

        class PreReqsVisibilitySetting extends ColumnVisibilitySetting {
          constructor(settings:ChecklistSettings,_initialValue: string = undefined) {
            const {SHOW,HIDE} = SETTING_OPTIONS[SETTING.PRE_REQS];
            super(settings,SETTING.PRE_REQS,COLUMN.PRE_REQS, SHOW, HIDE,_initialValue);
            this._options[HIDE].addAction(new SetSettingAction(settings,SETTING.STATUS,SETTING_OPTIONS[SETTING.STATUS].AVAILABLE));
          }
        }

        class EditableSetting extends ChecklistSetting {
          constructor(settings: ChecklistSettings, _initialValue: string = undefined) {
            const {YES,NO} = SETTING_OPTIONS[SETTING.EDITABLE];
            const options = {
              [YES]: new SettingOption(YES, new ToggleChecklistEditableAction(settings,true) , DESCRIPTIONS[SETTING.EDITABLE] && DESCRIPTIONS[SETTING.EDITABLE][YES]),
              [NO] : new SettingOption(NO , new ToggleChecklistEditableAction(settings,false), DESCRIPTIONS[SETTING.EDITABLE] && DESCRIPTIONS[SETTING.EDITABLE][NO]),
            };
            super(settings,SETTING.EDITABLE,options,_initialValue);
          }
          _determineValue(): string {
            const {YES,NO} = SETTING_OPTIONS[SETTING.EDITABLE];
            return this.settings.checklist.editable ? YES : NO;
          }
        }

        class QuickFilterSetting extends ChecklistSetting {
          constructor(settings: ChecklistSettings,_initalValue: string = undefined) {
            const {ON,OFF} = SETTING_OPTIONS[SETTING.QUICK_FILTER];
            const options = {
              [ON]:  new SettingOption(ON , new ToggleQuickFilterAction(settings,true),  DESCRIPTIONS[SETTING.QUICK_FILTER] && DESCRIPTIONS[SETTING.QUICK_FILTER][ON]),
              [OFF]: new SettingOption(OFF, new ToggleQuickFilterAction(settings,false), DESCRIPTIONS[SETTING.QUICK_FILTER] && DESCRIPTIONS[SETTING.QUICK_FILTER][OFF]),
            };
            super(settings, SETTING.QUICK_FILTER,options,_initalValue);
          }
          _determineValue(): string {
            const {ON,OFF} = SETTING_OPTIONS[SETTING.QUICK_FILTER];
            return this.settings.checklist.hasRow(ROW.QUICK_FILTER) ? ON : OFF;
          }
        }

        class ChecklistActions extends ChecklistSetting {
          constructor(settings: ChecklistSettings) {
          // const {NONE,REFRESH,META,RESET} = SETTING_OPTIONS[SETTING.ACTION];
            const {NONE,REFRESH,META,QUICK_FILTER} = SETTING_OPTIONS[SETTING.ACTION];
            const setNoneAction = new SetSettingAction(settings,SETTING.ACTION, NONE);
            const refreshAction = new class extends SettingAction{
              execute() {
                this.settings.checklist.reset();
              }
            }(settings);
            const metaAction = new class extends SettingAction{
              execute() {
                if (!this.settings.checklist.meta) ChecklistMeta.promptMetaSheetCreate(this.settings.checklist);
                if (this.settings.checklist.meta) this.settings.checklist.syncMeta();
              }
            }(settings);
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
              [QUICK_FILTER]: new SettingOption(QUICK_FILTER, [setNoneAction,new ToggleQuickFilterAction(settings)], descriptions[QUICK_FILTER])
            };
            super(settings,SETTING.ACTION,options);
          }
        }

        class SettingOption {
        readonly name: string;
        private actions: SettingAction[]
        readonly description: string
        constructor(name: string, actions: SettingAction|SettingAction[], _description: string) {
          if (!Array.isArray(actions)) actions = [actions];
          this.name = name;
          this.description = _description;
          this.actions = actions;
        }

        addAction(action: SettingAction): void {
          this.actions.push(action);
        }

        activate(): void {
          this.actions.forEach(action => action.execute());
        }
        }

        abstract class SettingAction {
          protected readonly settings: ChecklistSettings
          constructor(settings: ChecklistSettings) {
            this.settings = settings;
          }
          abstract execute(): void;
        }

        class ChangeColumnFilterAction extends SettingAction {
        private readonly column: column
        private readonly expectedValues: ReadonlyArray<string>
        private readonly valuesToHide: ReadonlyArray<string>
        constructor(settings: ChecklistSettings,column: column, expectedValues:string[] = [], valuesToHide:string[] = []) {
          super(settings);
          if (typeof expectedValues != "undefined" && !Array.isArray(expectedValues)) expectedValues = [expectedValues];
          if (typeof valuesToHide != "undefined" && !Array.isArray(valuesToHide)) valuesToHide = [valuesToHide];
          this.column = column;
          this.expectedValues = expectedValues as ReadonlyArray<string>;
          this.valuesToHide = valuesToHide;
        }
        execute(): void {
          time(`updateFilterVisibility ${this.column}`);
          const columnIndex = this.settings.checklist.toColumnIndex(this.column);
          const currentCriteria = this.settings.checklist.filter.getColumnFilterCriteria(columnIndex);
          const hiddenValues = new Set(this.valuesToHide);
          if (currentCriteria) {
            currentCriteria.getHiddenValues().filter(value => !this.expectedValues.includes(value)).forEach(hiddenValues.add,hiddenValues);
          }
          if (currentCriteria || hiddenValues.size) {
            const newCriteria = currentCriteria && currentCriteria.copy() || SpreadsheetApp.newFilterCriteria();
            newCriteria.setHiddenValues([...hiddenValues]);
            this.settings.checklist.filter.setColumnFilterCriteria(columnIndex, newCriteria);
          }
          timeEnd(`updateFilterVisibility ${this.column}`);
        }
        }      

        class ChangeColumnVisibilityAction extends SettingAction {
        readonly column: column
        readonly shouldShow: boolean
        constructor(settings: ChecklistSettings,column: column, shouldShow: boolean) {
          super(settings);
          this.column = column;
          this.shouldShow = shouldShow;
        }
        execute(): void {
          time(`changeColumnVisibility ${this.column}`);
          const columnIndex = this.settings.checklist.toColumnIndex(this.column);
          if (this.shouldShow) {
            this.settings.checklist.sheet.showColumns(columnIndex);
          } else {
            this.settings.checklist.sheet.hideColumns(columnIndex);
          }
          timeEnd(`changeColumnVisibility ${this.column}`);
        }
        }

        class ToggleChecklistEditableAction extends SettingAction {
        readonly editable: boolean;
        constructor(settings: ChecklistSettings,editable:boolean) {
          super(settings);
          this.editable = editable;
        }
        execute(): void {
          time(`setEditable ${this.editable}`);
          this.settings.checklist.editable = this.editable;
          timeEnd(`setEditable ${this.editable}`);
        }
        }

        class SetSettingAction extends SettingAction {
          readonly setting: SETTING;
          readonly newValue: string;
          constructor(settings: ChecklistSettings, setting: SETTING, newValue: string) {
            super(settings);
            this.setting = setting;
            this.newValue = newValue;
          }
          execute(): void {
            this.settings.setSetting(this.setting, this.newValue);
          }
        }

        class SetModeAction extends SetSettingAction {
        readonly newMode: string
        constructor(settings: ChecklistSettings, newMode:string) {
          super(settings,SETTING.MODE, newMode);
          this.newMode = newMode;
        }
        execute(): void {
          time(`setMode ${this.newMode}`);
          this.settings.checklist.toast(`Setting mode to ${this.newMode}...`,-1);
          this.settings.setSettings(MODE_SETTINGS[this.newMode]);
          this.settings.checklist.toast(`Mode set to ${this.newMode}`);
          timeEnd(`setMode ${this.newMode}`);
        }
        }

        class ToggleQuickFilterAction extends SettingAction {
          readonly enabled: boolean;
          constructor(settings: ChecklistSettings,enabled:boolean = undefined) {
            super(settings);
            this.enabled = enabled;
          }

          execute() {
            time("toggleQuickFilter");
            this.settings.checklist.toast("Toggling Quick Filter...",-1);
            this.settings.checklist.toggleQuickFilterRow(this.enabled);
            this.settings.checklist.toast(`Quick Filter ${typeof this.enabled == "undefined" ? "Toggled" : this.enabled ? "Enabled" : "Disabled"}`);
            timeEnd("toggleQuickFilter");
          }
        }
        
  }
