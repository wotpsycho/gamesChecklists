export enum COLUMN {
    CHECK = "✓",
    TYPE = "Type",
    ITEM = "Item",
    NOTES = "Notes",
    PRE_REQS = "Pre-Reqs",
    STATUS = "Available",
}

export type column = number | COLUMN | string; // byHeader column is valid, so strings are valid
export enum ROW {
    TITLE = "TITLE",
    SETTINGS = "SETTINGS",
    QUICK_FILTER = "QUICK_FILTER",
    HEADERS = "HEADERS",
}

export type row = ROW | number;
export type dataRow = number;

export enum STATUS {
    CHECKED = "CHECKED",
    AVAILABLE = "TRUE",
    MISSED = "MISSED",
    PR_USED = "PR_USED",
    PR_NOT_MET = "FALSE",
    UNKNOWN = "UNKNOWN",
    ERROR = "ERROR",
}

export type EditEvent = GoogleAppsScript.Events.SheetsOnEdit;
export type DeveloperMetadata = GoogleAppsScript.Spreadsheet.DeveloperMetadata;
export const FINAL_ITEM_TYPE = "Game Complete";