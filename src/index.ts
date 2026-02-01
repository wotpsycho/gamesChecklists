// Entry point for bundling - exports everything for Rollup IIFE

import * as Status from "./availability/StatusFormulaTranslator";

import { CreateMetaSheet, ProcessMeta } from "./checklist-helpers";
import * as ChecklistApp from "./ChecklistApp";
import * as ChecklistMeta from "./ChecklistMeta";
import { SETTING } from "./ChecklistSettings";
// Import all modules
import * as Formula from "./Formulas";
import { ResetChecklist } from "./Reset";

import { SheetBase } from "./SheetBase";
// Import global functions (GAS event handlers)
import { AttachTriggers, CalculatePreReqs, handleChange, handleEdit, LinkPreReqs, onEdit, onOpen } from "./Triggers";
// Import utilities
import { time, timeEnd } from "./util";

// Export Settings as an object with both ChecklistSettings and SETTING
export const Settings = { SETTING };

// Export everything as a bundle object (Rollup outro will create top-level declarations)
export {
  AttachTriggers,
  CalculatePreReqs,
  // Namespaces
  ChecklistApp,
  ChecklistMeta,
  CreateMetaSheet,

  Formula,

  handleChange,
  handleEdit,

  LinkPreReqs,
  onEdit,
  // Event handlers and menu functions
  onOpen,
  ProcessMeta,
  ResetChecklist,
  // Settings components
  SETTING,
  SheetBase,
  Status,
  // Utilities
  time,
  timeEnd,
};
