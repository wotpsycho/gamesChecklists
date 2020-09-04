/* exported ResetChecklist */

function ResetChecklist(checklist = ChecklistApp.getActiveChecklist()) {
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

  time("nonUI");

  checklist.reset(resetData);
  timeEnd("nonUI");
  timeEnd("full");

  timeEnd();
}