/* exported onOpen, onSelectionChange, handleEdit, handleChange */
function handleEdit(event) {
  time();
  try {
    time("1");
    const range = event.range;
    timeEnd("1");
    
    time("2");
    const sheet = range.getSheet();
    UTIL.setSheet(sheet);
    timeEnd("2");
    
    
    if (!UTIL.getHeaderRow()) return; // Non checklist
    
    time("3");
    const columns = UTIL.getColumns();
    timeEnd("3");
    time("4");
    const rows = UTIL.getRows();
    timeEnd("4");
    time("5");
    Logger.log("edit: ", range.getA1Notation());
    timeEnd("5");
    
    //QUICK DEBUG:  try { SETTINGS.resetSettings(sheet); } catch (e) { sheet.getRange("F1").setValue(e.message);} finally { return;  }
    
    if (UTIL.isRowInRange(rows.quickFilter,range)) {
      QUICK_FILTER.onChange(sheet, range, event);
    }

    if ((event.value == "reset" || event.value == "meta" || event.value == "FULL RESET") && range.getA1Notation() == "A1") {
      switch (event.value){
        case "reset":  RESET.reset(); break;
        case "meta": META.ProcessMeta(); break;
        case "FULL RESET": RESET.reset(sheet,true); break;
      }
      TOTALS.updateTotals(sheet);
      return;
    }

    time("2.5");
    const filter = sheet.getFilter();
    timeEnd("2.5");
    
    time("6");
    if (UTIL.isRowInRange(rows.quickFilter,range) && range.getNumRows() == 1) {
      FILTER.reapplyFilter(filter);
      
      timeEnd("6");
      return;
    }
    timeEnd("6");
    
    time("6.5");
    Logger.log(rows);
    if (UTIL.isRowInRange(rows.settings, range)) {
      SETTINGS.updateSettings(sheet,range);
      if (range.getNumRows() == 1) {
        timeEnd("6.5");
        return;
      }
    }
    timeEnd("6.5");
    
    time("7");
    if (UTIL.isColumnInRange([columns.preReq, /* TODO  remove deprecated */columns.item, columns.available], range)) {
      AVAILABLE.populateAvailable(sheet, event);
    }
    timeEnd("7");
    
    time("8");
    if (UTIL.isColumnInRange(columns.check, range) || UTIL.isColumnInRange(columns.preReq,range) || 
      UTIL.isRowInRange(rows.quickFilter,range)) {
      FILTER.reapplyFilter(filter);
    }
    timeEnd("8");
    
    time("9");
    if (UTIL.isColumnInRange(columns.notes,range)) {
      NOTES.moveNotes(range);
    }
    timeEnd("9");
    
    time("10");
    if (UTIL.isColumnInRange(columns.check,range) || UTIL.isColumnInRange(columns.item,range)) {
      TOTALS.updateTotals(sheet);
    }
    timeEnd("10");
  } finally {
    UTIL.clearSheet();
    timeEnd();
  }
}

function handleChange(event) {
  console.log("changeEvent",event.changeType,event);
  // TODO validate/update metadata when implemented
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
  UTIL.setSheet(sheet);
  //AVAILABLE.checkErrors(event.range);
  const columns = UTIL.getColumns();
  const rows = UTIL.getRows();
   
  // if (SETTINGS.isEditable(sheet)) {
  //   UTIL.getColumnDataRange(sheet,columns.preReq).clearDataValidations();
  //   const nearbyPreReqs = sheet.getRange(Math.max(rows.header+1, range.getRow()-1), columns.preReq, range.getNumRows()+2);
  //   const validation = SpreadsheetApp
  //     .newDataValidation()
  //     .requireValueInRange(UTIL.getColumnDataRange(sheet, columns.item), true)
  //     .setAllowInvalid(true)
  //     .build();
  //   nearbyPreReqs.setDataValidation(validation);
  // } 
  timeEnd();
}  */