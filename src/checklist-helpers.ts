/**
 * Checklist Helper Functions
 *
 * Factory functions for retrieving Checklist and MetaSheet instances.
 *
 * Note: This module has an intentional bidirectional dependency with ChecklistApp.
 * - This file imports the Checklist class from ChecklistApp
 * - ChecklistApp imports helper functions from this file
 * This is resolved at runtime since neither module calls the other during initialization.
 */
import type { Sheet } from "./SheetBase";
import type { DeveloperMetadata } from "./shared-types";
import { getActiveSheet } from "./SheetHelpers";
import { Checklist } from "./ChecklistApp";
import { MetaSheet } from "./ChecklistMeta";

export function getChecklistFromEvent(event: GoogleAppsScript.Events.SheetsOnOpen | GoogleAppsScript.Events.SheetsOnEdit): Checklist {
    return Checklist.fromEvent(event);
}

export function getChecklistBySheet(sheet: Sheet = getActiveSheet()): Checklist {
    return Checklist.fromSheet(sheet);
}

export function getChecklistByMetaSheet(metaSheet: Sheet): Checklist {
    const metaDevMeta: DeveloperMetadata[] = metaSheet.createDeveloperMetadataFinder().withKey("metaForSheet").withVisibility(SpreadsheetApp.DeveloperMetadataVisibility.PROJECT).find();
    if (metaDevMeta && metaDevMeta[0]) {
        const sheet: Sheet = metaSheet.getParent().getSheetByName(metaDevMeta[0].getValue());
        if (sheet) {
            const checklist: Checklist = getChecklistBySheet(sheet);
            checklist.metaSheet = metaSheet;
            return checklist;
        }
    }
}

export function getActiveChecklist(): Checklist {
    return getChecklistBySheet(getActiveSheet());
}

export function getMetaFromActiveChecklist(_interactive: boolean = false): MetaSheet {
  return getMetaFromChecklist(getActiveChecklist(), _interactive);
}

export function getMetaFromChecklist(checklist: Checklist = getActiveChecklist(), _interactive: boolean = false): MetaSheet {
  if (!checklist.isChecklist || !checklist.metaSheet) {
    const checklistFromMeta = getChecklistByMetaSheet(checklist.sheet);
    if (checklistFromMeta) checklist = checklistFromMeta;
  }
  if (!checklist.metaSheet && _interactive) {
    promptMetaSheetCreate(checklist);
  }
  return MetaSheet.fromChecklist(checklist);
}

export function getMetaFromSheet(sheet: Sheet): MetaSheet {
  const checklist = getChecklistByMetaSheet(sheet);
  return checklist && checklist.meta;
}

export function promptMetaSheetCreate(checklist: Checklist, title: string = "Meta Sheet Create"): void {
  const ui = SpreadsheetApp.getUi();
  const defaultMetaSheetName = checklist.name + " Meta";
  const response = ui.prompt(title, `Enter the name for the new Meta Sheet (will contain formatting options). Leave blank for "${defaultMetaSheetName}"`, ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() != ui.Button.OK) return;
  const metaSheetName = response.getResponseText() || defaultMetaSheetName;
  const existingSheet = checklist.spreadsheet.getSheetByName(metaSheetName);
  if (existingSheet) {
    const response = ui.alert(title, `Sheet already exists, set as meta sheet?`, ui.ButtonSet.YES_NO);
    if (response == ui.Button.YES) {
      checklist.metaSheet = existingSheet;
    }
  } else {
    checklist.createMetaSheet(metaSheetName);
  }
}

export function ProcessMeta(): void {
  const meta = getMetaFromActiveChecklist(true);
  meta && meta.syncWithChecklist();
}

export function CreateMetaSheet(): void {
  promptMetaSheetCreate(getActiveChecklist());
}