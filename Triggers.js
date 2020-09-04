/* exported onOpen, onSelectionChange, handleEdit, handleChange */
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
    
    
    if (!checklist.isChecklist) return; // Non checklist
    
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
        case "meta": META.ProcessMeta(checklist); break;
        case "FULL RESET": checklist.reset(true); break;
      }
      checklist.ensureTotalFormula();
      return;
    }
    
    time("updateSettings");
    if (checklist.isRowInRange(ROW.SETTINGS, range)) {
      SETTINGS.updateSettings(checklist,range);
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

function handleChange(event) {
  console.log("changeEvent",event.changeType,event);
  // TODO validate/update metadata if implemented
}

/**
 * Menu items and triggers need authorization; to try to prevent need for auth, will put controls in-sheet to trigger instead.
 * Will disable later.
 */
function onOpen(event) {
  SpreadsheetApp.getUi().createAddonMenu()
    .addItem("Refresh Sheet...", "ResetChecklist")
    .addItem("Sync With Meta Sheet", "ProcessMeta")
    .addToUi();

  const triggers = ScriptApp.getProjectTriggers();
  const getTrigger = (type, handlerName) => {
    const myTriggers = triggers.filter(trigger => 
      trigger.getEventType() == type
        && trigger.getHandlerFunction() == handlerName 
        && trigger.getTriggerSourceId() == event.source.getId()
    );
    return myTriggers && myTriggers.length > 0 && myTriggers[0];
  };

  let trigger = getTrigger(ScriptApp.EventType.ON_CHANGE, "handleChange");
  // Disabled for now until we have content
  if (!trigger) {
    // ScriptApp.newTrigger("handleChange").forSpreadsheet(event.source).onChange().create();
  } else {
    ScriptApp.deleteTrigger(trigger);
  }
  trigger = getTrigger(ScriptApp.EventType.ON_EDIT, "handleEdit");
  if (!trigger) {
    ScriptApp.newTrigger("handleEdit").forSpreadsheet(event.source).onEdit().create();
  }  
    
}

// Currently disabled
/* 
function onSelectionChange(event) {
  time();
  const range = event.range;
  const sheet = range.getSheet();
  console.log("onSelectionChange", range);
  ChecklistApp.setActiveSheet(sheet);
  //AVAILABLE.checkErrors(event.range);
   
  // if (SETTINGS.isEditable(sheet)) {
  //   chekcliskt.getColumnDataRange(sheet,columns.preReq).clearDataValidations();
  //   const nearbyPreReqs = sheet.getRange(Math.max(rows.header+1, range.getRow()-1), columns.preReq, range.getNumRows()+2);
  //   const validation = SpreadsheetApp
  //     .newDataValidation()
  //     .requireValueInRange(chekclist.getColumnDataRange(sheet, columns.item), true)
  //     .setAllowInvalid(true)
  //     .build();
  //   nearbyPreReqs.setDataValidation(validation);
  // } 
  timeEnd();
}  */