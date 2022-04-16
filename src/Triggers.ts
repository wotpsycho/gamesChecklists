/* exported onOpen, onSelectionChange, onEdit, handleEdit, handleChange,AttachTriggers */
function onEdit(event: GoogleAppsScript.Events.SheetsOnEdit): void {
  
  console.log(event.authMode.toString());
  time();
  ChecklistApp.getChecklistFromEvent(event).onEditSimple(event);
  timeEnd();
}
 
function handleEdit(event: GoogleAppsScript.Events.SheetsOnEdit): void {
  console.log(event.authMode.toString());
  time();
  ChecklistApp.getChecklistFromEvent(event).onEditInstallable(event);
  timeEnd();
}

function AttachTriggers() {
  time("getTriggers","getEditTrigger",true);
  const triggers = ScriptApp.getProjectTriggers();
  timeEnd("getTriggers");
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const getTrigger = (type: GoogleAppsScript.Script.EventType, handlerName: string) => {
    const myTriggers = triggers.filter(trigger => 
      trigger.getEventType() == type
      && trigger.getHandlerFunction() == handlerName 
      && trigger.getTriggerSourceId() == spreadsheet.getId()
    );
    return myTriggers && myTriggers.length > 0 && myTriggers[0];
  };
  let trigger = getTrigger(ScriptApp.EventType.ON_EDIT, "handleEdit");
  timeEnd("getEditTrigger");
  if (!trigger) {
    ScriptApp.newTrigger("handleEdit").forSpreadsheet(spreadsheet).onEdit().create();
  }
  trigger = getTrigger(ScriptApp.EventType.ON_CHANGE,"handleChange");
  if (!trigger) {
    ScriptApp.newTrigger("handleChange").forSpreadsheet(spreadsheet).onChange().create();
  }
  ChecklistApp.Checklist.triggersAttached = true;
  timeEnd();
}
function onOpen(event:GoogleAppsScript.Events.SheetsOnOpen) {
  time();
  ScriptApp.invalidateAuth();
  SpreadsheetApp.getUi().createAddonMenu()
    .addItem("Refresh Sheet...", "ResetChecklist")
    .addItem("Sync With Meta Sheet", "ProcessMeta")
    .addItem("Attach Triggers", "AttachTriggers")
    .addItem("Create Meta Sheet","CreateMetaSheet")
    .addToUi();
  ChecklistApp.getChecklistBySheet(event.source.getActiveSheet()).onOpenSimple(event);
  timeEnd();
}

function handleChange(event:GoogleAppsScript.Events.SheetsOnChange) {
  ChecklistApp.getActiveChecklist().onChangeSimple(event);
}