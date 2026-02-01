import type { Checklist } from "./ChecklistApp";
import { getActiveChecklist } from "./checklist-helpers";
import { ChecklistSettings } from "./ChecklistSettings";

const checklistSettings: { [x: number]: ChecklistSettings } = {};

export function getSettingsForChecklist(checklist = getActiveChecklist()): ChecklistSettings {
    if (!checklistSettings[checklist.id]) {
        checklistSettings[checklist.id] = new ChecklistSettings(checklist);
    }
    return checklistSettings[checklist.id];
}

export function getSettingsForActiveChecklist(): ChecklistSettings {
    return getSettingsForChecklist(getActiveChecklist());
}