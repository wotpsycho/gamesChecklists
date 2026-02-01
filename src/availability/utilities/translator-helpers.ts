import type { Checklist } from '../../ChecklistApp';
import { StatusFormulaTranslator } from '../StatusFormulaTranslator';
import { getActiveChecklist } from "../../checklist-helpers";

/**
 * Get the StatusFormulaTranslator for the active checklist
 */
export function getActiveChecklistTranslator(): StatusFormulaTranslator {
  return getTranslatorForChecklist(getActiveChecklist());
}

/**
 * Get the StatusFormulaTranslator for a specific checklist
 */
export function getTranslatorForChecklist(checklist: Checklist = getActiveChecklist()): StatusFormulaTranslator {
  return StatusFormulaTranslator.fromChecklist(checklist);
}

/**
 * Validate and generate status formulas for a checklist
 */
export function validateAndGenerateStatusFormulasForChecklist(checklist: Checklist = getActiveChecklist()): void {
  StatusFormulaTranslator.fromChecklist(checklist).validateAndGenerateStatusFormulas();
}

/**
 * Add hyperlinks to prerequisites in a checklist
 */
export function addLinksToPreReqs(
  checklist: Checklist = getActiveChecklist(),
  startRow = checklist.firstDataRow,
  endRow = checklist.lastRow
): void {
  StatusFormulaTranslator.fromChecklist(checklist).addLinksToPreReqsInRange(startRow, endRow);
}
