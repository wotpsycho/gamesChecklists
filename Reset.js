/* exported RESET, ResetChecklist */
// eslint-disable-next-line no-redeclare
const RESET = (function(){

  function promptReset(checklist = Checklist.getActiveChecklist()) {
    time();
    const ui = SpreadsheetApp.getUi();
  
    let response;

    let resetData = false;  
    if (!checklist.isChecklist) {
      response = ui.alert("Checklist not found", "This does not appear to be a checklist. Would you like to turn it into one?", ui.ButtonSet.YES_NO);
      if (response !== ui.Button.YES) return;
    } else {
      response = ui.prompt("Reset Checklist",
        "This will reset filters and columns.\n\nIf you want to reset the checklist as well, " +
                           "type \"FULL RESET\" in the box.", ui.ButtonSet.OK_CANCEL);
      if (response.getSelectedButton() != ui.Button.OK) return;
      const responseText = response.getResponseText();
      if (responseText == "FULL RESET" || responseText == "\"FULL RESET\"") {
        response = ui.alert("Verify Reset","Are you sure you want to reset all progress on this list?", ui.ButtonSet.YES_NO);
        if (response != ui.Button.YES) return;
        resetData = true;
        time("full");
      }
    }

    // ui.alert("Resetting", (resetData ? "The checklist" : "The view ") + " will reset when you close this message.\n\nThis may take up to a minute, you will get a confirmation message when it has finished.", ui.ButtonSet.OK);
    time("nonUI");

    reset(checklist, resetData);
    timeEnd("nonUI");
    timeEnd("full");
    // ui.alert("Reset Complete!","You may now use this checklist again.",ui.ButtonSet.OK);
  
    timeEnd();
  }

  function reset(checklist = Checklist.getActiveChecklist(), _resetData = false) {
    time();

    const toastTitle = `${_resetData ? "Reset " : "Refresh "}Checklist`;
    const toastMessage = `${_resetData ? "Resetting" : "Refreshing"}...`;
    const previousMode = SETTINGS.getSetting(checklist.sheet,"Mode"); // Preserve mode

    checklist.spreadsheet.toast(toastMessage, toastTitle, -1);
    Logger.log("Reseting checklist ", checklist.sheet.getName());
  
    time("filter removal");
    // Remove filter first to ensure data is available to write
    checklist.removeFilter();
    timeEnd("filter removal");
  
    time("row/column show");
    // Show all rows/columns
    checklist.expandAll();
    timeEnd("row/column show");
    
    time("removeValidation");
    checklist.removeValidations();
    timeEnd("removeValidation");
    
  
    time("row/column existence");
    checklist.ensureHeaderRow();

    checklist.ensureCheckColumn();
    checklist.ensureTypeColumn();
    checklist.ensureItemColumn();
    checklist.ensurePreReqsColumn();
    checklist.ensureNotesColumn();
    checklist.ensureStatusColumn();
    checklist.hideColumn(Checklist.COLUMN.STATUS);
    
    checklist.ensureTitleRow();
    checklist.ensureSettingsRow();
    
    timeEnd("row/column existence");

    time("trime");
    checklist.trim();
    timeEnd("trim");
  
    // Reset checkboxes
    if (_resetData) {
      checklist.resetCheckmarks();
    }
  
    // Update all notes
    time("notes");
    checklist.syncNotes();
    timeEnd("notes");
    
  
    time("dataValidation");
    checklist.resetDataValidation(true);
    timeEnd("dataValidation");

    AVAILABLE.populateAvailable(checklist);
  
    time("available rules");
    //Add conditional formatting rules
    checklist.resetConditionalFormatting(true);
    timeEnd("available rules");
  
  
    time("quickFilter");
    checklist.clearQuickFilter();
    timeEnd("quickFilter");
  
    if (checklist.metaSheet) {
      META.ProcessMeta(checklist.sheet);
    }
  
    // Create new filter
    time("filterCreate");
    checklist.createFilter();
    timeEnd("filterCreate");
  
    time("totals");
    TOTALS.updateTotals(checklist.sheet);
    timeEnd("totals");

    time("settings");
    SETTINGS.resetSettings(checklist.sheet, previousMode || "Edit");
    timeEnd("settings");

    checklist.spreadsheet.toast("Done!", toastTitle,5);
    timeEnd();

  }

  return {
    promptReset,
    reset,
  };
})();

function ResetChecklist() {
  RESET.promptReset();
}