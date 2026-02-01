// Entry point for bundling - exports everything for Rollup IIFE

// Import utilities
import { time, timeEnd } from './util';

// Import all modules
import * as Formula from './Formulas';
import { SheetBase } from './SheetBase';
import * as ChecklistApp from './ChecklistApp';
import { SETTING } from './ChecklistSettings';
import * as ChecklistMeta from './ChecklistMeta';
import * as Status from './availability/StatusFormulaTranslator';

// Import global functions (GAS event handlers)
import { onOpen, onEdit, handleEdit, handleChange, AttachTriggers, CalculatePreReqs, LinkPreReqs } from './Triggers';
import { ResetChecklist } from './Reset';
import { CreateMetaSheet, ProcessMeta } from "./checklist-helpers";

// Export Settings as an object with both ChecklistSettings and SETTING
export const Settings = { SETTING };

// Export everything as a bundle object (Rollup outro will create top-level declarations)
export {
  // Namespaces
  ChecklistApp,
  ChecklistMeta,
  Status,
  Formula,
  SheetBase,

  // Settings components
  SETTING,

  // Utilities
  time,
  timeEnd,

  // Event handlers and menu functions
  onOpen,
  onEdit,
  handleEdit,
  handleChange,
  AttachTriggers,
  CalculatePreReqs,
  LinkPreReqs,
  ResetChecklist,
  ProcessMeta,
  CreateMetaSheet,
};
