/* exported onOpen, onSelectionChange, onEdit, handleEdit, handleChange,AttachTriggers */
function onEdit(event: GoogleAppsScript.Events.SheetsOnEdit): void {
  const trigger = ScriptApp.getProjectTriggers().filter(trigger => 
    trigger.getEventType() == ScriptApp.EventType.ON_EDIT
      && trigger.getHandlerFunction() == handleEdit.name 
      && trigger.getTriggerSourceId() == event.source.getId()
  )[0];
  if (!trigger) {
    handleEdit(event);
  }
}
  
function handleEdit(event: GoogleAppsScript.Events.SheetsOnEdit): void {
  time();
  try {
    // static imports
    // const COLUMN = ChecklistApp.COLUMN;
    // const ROW = ChecklistApp.ROW;

    time("event.range");
    const range = event.range;
    timeEnd("event.range");
    
    time("range.getSheet()");
    const sheet = range.getSheet();
    timeEnd("range.getSheet()");
    
    time("ChecklistApp.setActiveSheet(..)");
    ChecklistApp.setActiveSheet(sheet);
    timeEnd("ChecklistApp.setActiveSheet(..)");

    time("logEditedRange");
    Logger.log("edit: ", range.getA1Notation());
    timeEnd("logEditedRange");

    time("getCL");
    const checklist = ChecklistApp.getActiveChecklist();
    timeEnd("getCL");
    
    if (range.getA1Notation() == "A1") {
      // Debug hacks
      switch (event.value){
        case "reset":  checklist.reset(); break;
        case "meta": checklist.syncMeta(); break;
        case "FULL RESET": checklist.reset(true); break;
      }
      checklist.isChecklist && checklist.ensureTotalFormula();
      return;
    }
    
    time("isChecklist");
    if (checklist.isChecklist) {
      timeEnd("isChecklist");
      time("checklistHandleEdit");
      checklist.handleEdit(event);
      timeEnd("checklistHandleEdit");
    } else {
      time("metaHandleEdit");
      // TODO add logic to reduce need for syncing
      // const metaSheet = ChecklistMeta.getFromSheet(sheet);
      // if (metaSheet) metaSheet.handleEdit(event);
      timeEnd("metaHandleEdit");
    }

    
  } catch(e) {
    const message = e && e.getMessage && e.getMessage() || e;
    event.range.getSheet().getParent().toast(message || "", "Error handling edit of " + event.range.getA1Notation(),60);
    throw e;
  } finally {
    timeEnd();
  }
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
  const trigger = getTrigger(ScriptApp.EventType.ON_EDIT, "handleEdit");
  timeEnd("getEditTrigger");
  if (!trigger) {
    ScriptApp.newTrigger("handleEdit").forSpreadsheet(spreadsheet).onEdit().create();
  }  
  timeEnd();
}

/**
 * Menu items and triggers need authorization; to try to prevent need for auth, will put controls in-sheet to trigger instead.
 * Will disable later.
 */
function onOpen() {
  time();
  SpreadsheetApp.getUi().createAddonMenu()
    .addItem("Refresh Sheet...", "ResetChecklist")
    .addItem("Sync With Meta Sheet", "ProcessMeta")
    .addItem("Attach Triggers", "AttackTriggers")
    .addToUi();
  timeEnd();
}
