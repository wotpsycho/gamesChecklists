// Helper functions for sheet operations
// Separated to avoid circular dependencies between SheetBase and ChecklistApp

export type Sheet = GoogleAppsScript.Spreadsheet.Sheet;

export function getActiveSheet(): Sheet {
  return SpreadsheetApp.getActiveSheet();
}

export function setActiveSheet(sheet: Sheet): void {
  if (getActiveSheet().getSheetId() !== sheet.getSheetId()) {
    sheet.activate();
    SpreadsheetApp.setActiveSheet(sheet);
    sheet.getParent().setActiveSheet(sheet);
  }
}
