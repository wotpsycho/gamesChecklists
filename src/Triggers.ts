import { getActiveChecklist, getChecklistFromEvent } from "./checklist-helpers";
import { Checklist } from "./ChecklistApp";
import { time, timeEnd } from "./util";

export function onEdit(event: GoogleAppsScript.Events.SheetsOnEdit): void {
  // const dataRange = event.source.getDataRange();
  // time("getValues");
  // const values = dataRange.getValues();
  // timeEnd("getValues");
  // time("getFormulas");
  // const formulas = dataRange.getFormulas();
  // timeEnd("getFormulas");
  // time("getRTV");
  // const rtf = dataRange.getRichTextValues();
  // timeEnd("getRTV");

  // return;

  console.log(event.authMode.toString());
  time();
  getChecklistFromEvent(event).onEditSimple(event);
  timeEnd();
}

export function handleEdit(event: GoogleAppsScript.Events.SheetsOnEdit): void {
  console.log(event.authMode.toString());
  time();
  getChecklistFromEvent(event).onEditInstallable(event);
  timeEnd();
}

export function debug() {
  const ssheet = SpreadsheetApp.getActiveSpreadsheet();
  ssheet.getSheetByName("SO4").activate();

  const debugEvent: GoogleAppsScript.Events.SheetsOnEdit = {
    oldValue: "Foo",
    range: ssheet.getRange("A1"),
    source: ssheet,
    value: "",
    authMode: ScriptApp.AuthMode.NONE,
    triggerUid: "",
    user: undefined,
  };
  handleEdit(debugEvent);
}

export function AttachTriggers() {
  time("getTriggers", "getEditTrigger", true);
  const triggers = ScriptApp.getProjectTriggers();
  timeEnd("getTriggers");
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const getTrigger = (type: GoogleAppsScript.Script.EventType, handlerName: string) => {
    const myTriggers = triggers.filter(trigger =>
      trigger.getEventType() === type
      && trigger.getHandlerFunction() === handlerName
      && trigger.getTriggerSourceId() === spreadsheet.getId(),
    );
    return myTriggers && myTriggers.length > 0 && myTriggers[0];
  };
  let trigger = getTrigger(ScriptApp.EventType.ON_EDIT, "handleEdit");
  timeEnd("getEditTrigger");
  if (!trigger) {
    ScriptApp.newTrigger("handleEdit").forSpreadsheet(spreadsheet).onEdit().create();
  }
  trigger = getTrigger(ScriptApp.EventType.ON_CHANGE, "handleChange");
  if (!trigger) {
    ScriptApp.newTrigger("handleChange").forSpreadsheet(spreadsheet).onChange().create();
  }
  Checklist.triggersAttached = true;
  timeEnd();
}
export function onOpen(event: GoogleAppsScript.Events.SheetsOnOpen) {
  time();
  ScriptApp.invalidateAuth();
  SpreadsheetApp.getUi().createAddonMenu().addItem("Refresh Sheet...", "ResetChecklist").addItem("Sync With Meta Sheet", "ProcessMeta").addItem("Attach Triggers", "AttachTriggers").addItem("Create Meta Sheet", "CreateMetaSheet").addItem("Calculate Pre-Reqs", "CalculatePreReqs").addItem("Link Pre-Reqs", "LinkPreReqs").addToUi();
  getChecklistFromEvent(event).onOpenSimple(event);
  timeEnd();
}

export function handleChange(event: GoogleAppsScript.Events.SheetsOnChange) {
  time();
  console.log(event.changeType);
  if (event.changeType.match(/^(INSERT|REMOVE)/)) {
    getActiveChecklist().onChangeSimple(event);
  }
  timeEnd();
}

export function CalculatePreReqs() {
  time();
  getActiveChecklist().calculateStatusFormulas();
  timeEnd();
}

export function LinkPreReqs() {
  time();
  getActiveChecklist().linkPreReqs();
  timeEnd();
}
