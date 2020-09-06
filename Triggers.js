/* exported onOpen, onSelectionChange, onEdit, handleEdit, handleChange,AttachTriggers */
function onEdit(event) {
  const trigger = ScriptApp.getProjectTriggers().filter(trigger => 
    trigger.getEventType() == ScriptApp.EventType.ON_EDIT
      && trigger.getHandlerFunction() == handleEdit.name 
      && trigger.getTriggerSourceId() == event.source.getId()
  )[0];
  if (!trigger) {
    handleEdit(event);
  }
}
  
function handleEdit(event) {
  time();
  try {
    // static imports
    const COLUMN = ChecklistApp.COLUMN;
    const ROW = ChecklistApp.ROW;

    time("event.range");
    const range = event.range;
    timeEnd("event.range");
    
    time("range.getSheet()");
    const sheet = range.getSheet();
    timeEnd("range.getSheet()");
    
    time("ChecklistApp.setActiveSheet(..)");
    ChecklistApp.setActiveSheet(sheet);
    timeEnd("ChecklistApp.setActiveSheet(..)");

    time("getCL");
    const checklist = ChecklistApp.getActiveChecklist();
    timeEnd("getCL");
    
    time("isChecklist");
    if (!checklist.isChecklist) return; // Non checklist
    timeEnd("isChecklist");
    
    time("logEditedRange");
    Logger.log("edit: ", range.getA1Notation());
    timeEnd("logEditedRange");
        
    time("quickFilterChange");
    if (checklist.isRowInRange(ROW.QUICK_FILTER,range)) {
      checklist.quickFilterChange(event);
    }
    timeEnd("quickFilterChange");

    if ((event.value == "reset" || event.value == "meta" || event.value == "FULL RESET") && range.getA1Notation() == "A1") {
      switch (event.value){
        case "reset":  checklist.reset(); break;
        case "meta": checklist.syncMeta(); break;
        case "FULL RESET": checklist.reset(true); break;
      }
      checklist.ensureTotalFormula();
      return;
    }
    
    time("updateSettings");
    if (checklist.isRowInRange(ROW.SETTINGS, range)) {
      ChecklistSettings.handleChange(event);
      if (range.getNumRows() == 1) {
        timeEnd("updateSettings");
        return;
      }
    }
    timeEnd("updateSettings");
    
    time("populateAvailable");
    if (checklist.isColumnInRange([COLUMN.PRE_REQS, COLUMN.ITEM, COLUMN.STATUS], range)) {
      StatusTranspiler.validateAndGenerateStatusFormulasForChecklist(checklist, event);
    }
    timeEnd("populateAvailable");
    
    time("reapplyFilter");
    if (checklist.isColumnInRange([COLUMN.CHECK, COLUMN.PRE_REQS],range) || 
    checklist.isRowInRange(ROW.QUICK_FILTER,range)) {
      checklist.refreshFilter();
    }
    timeEnd("reapplyFilter");
    
    time("moveNotes");
    if (checklist.isColumnInRange(COLUMN.NOTES,range)) {
      checklist.syncNotes(range);
    }
    timeEnd("moveNotes");

    time("checkFilterSize");
    if (!event.value && !event.oldValue) {
      // was more than a cell change, 
      checklist.ensureFilterSize();
    }
    timeEnd("checkFilterSize");
    
    time("updateTotals");
    if (checklist.isColumnInRange([COLUMN.CHECK,COLUMN.ITEM],range)) {
      checklist.ensureTotalFormula();
    }
    timeEnd("updateTotals");
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
  const getTrigger = (type, handlerName) => {
    const myTriggers = triggers.filter(trigger => 
      trigger.getEventType() == type
        && trigger.getHandlerFunction() == handlerName 
        && trigger.getTriggerSourceId() == event.source.getId()
    );
    return myTriggers && myTriggers.length > 0 && myTriggers[0];
  };
  const trigger = getTrigger(ScriptApp.EventType.ON_EDIT, "handleEdit");
  timeEnd("getEditTrigger");
  if (!trigger) {
    ScriptApp.newTrigger("handleEdit").forSpreadsheet(event.source).onEdit().create();
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
