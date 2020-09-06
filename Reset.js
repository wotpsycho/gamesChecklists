/* exported ResetChecklist */

function ResetChecklist(checklist = ChecklistApp.getActiveChecklist()) {
  let title = "Refreshing Checklist";
  try{
    time();
    const ui = SpreadsheetApp.getUi();


    let resetData = false;
    let isInit = false;
    if (!checklist.isChecklist) {
      const response = ui.alert(
        "Checklist not found", 
        "This does not appear to be a checklist. Would you like to turn it into one?\n\nWARNING: Data validation and conditional formatting will be replaced.", 
        ui.ButtonSet.YES_NO
      );
      if (response !== ui.Button.YES) return;
      isInit = true;
      title = "Initializing Checklist";
    }  else {
      const response = ui.prompt(title,
        "This will refresh filters, columns, rows, and sync metadata.\n\nIf you want to reset the checklist as well, type \"FULL RESET\" in the box.", 
        ui.ButtonSet.OK_CANCEL);
      if (response.getSelectedButton() != ui.Button.OK) return;
      const responseText = response.getResponseText();
      if (responseText == "FULL RESET" || responseText == "\"FULL RESET\"") {
        const response = ui.alert("Verify Reset","Are you sure you want to reset all progress on this list?", ui.ButtonSet.YES_NO);
        if (response != ui.Button.YES) return;
        resetData = true;
        title = "Resetting Checklist";
        time("full");
      }
    }

    if (isInit || !checklist.title) {
      const defaultTitle = checklist.name.indexOf("Sheet") == 0 ? "[New Game]" : checklist.name;
      const response = ui.prompt(title, `Enter the Title of the checklist (shown at the top of the list). Leave blank for "${defaultTitle}"`, ui.ButtonSet.OK_CANCEL);
      if (response.getSelectedButton() != ui.Button.OK) return;
      checklist.title = response.getResponseText() || defaultTitle;
    }
    if (isInit || checklist.name.indexOf("Sheet") == 0) {
      const defaultName = checklist.name.indexOf("Sheet") == 0 && checklist.title ? checklist.title : checklist.name;
      const response = ui.prompt(title, `Enter the name of the Sheet (tab at bottom). Leave blank for "${defaultName}"`,ui.ButtonSet.OK_CANCEL);
      if (response.getSelectedButton() != ui.Button.OK) return;
      checklist.name = response.getResponseText() || defaultName;
    }
    if (!checklist.metaSheet) {
      const defaultMetaSheetName = checklist.name + " Meta";
      const response = ui.prompt(title, `Enter the name for the new Meta Sheet (will contain formatting options). Leave blank for "${defaultMetaSheetName}"`, ui.ButtonSet.OK_CANCEL);
      if (response.getSelectedButton() != ui.Button.OK) return;
      checklist.createMetaSheet(response.getResponseText() || defaultMetaSheetName);
    }

    time("nonUI");
    checklist.reset(resetData);
  } catch (error) {
    checklist.toast(error && error.getMessage && error.getMessage() || error, `Error while ${title}`);
    throw(error);
  } finally {
    timeEnd("nonUI","full",true);
  }
}