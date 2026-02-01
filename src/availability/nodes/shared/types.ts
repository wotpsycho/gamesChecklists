import type { row, column } from '../../types';
import type { RowCounts, IStatusFormulaTranslator } from '../../interfaces';

/**
 * Information about a virtual item created by special node types
 * Virtual items require rowCounts and can override numNeeded and numPossible
 * e.g., Virtual Choice has a numNeeded of 1, and rowCounts of {[optionRow]:1} for each OPTION
 */
export type virtualValueInfo = {
  rowCounts: RowCounts;
  numPossible?: number;
  numNeeded?: number;
};

/**
 * Tracking information for consumable prerequisites (USES)
 */
export type useInfo = RowCounts;

/**
 * Type for the global registry tracking all USES consumable items
 */
export type UsesInfoRegistry = { [x: string]: useInfo };

/**
 * Arguments for BLOCKS_UNTIL node creation
 */
export type BlocksArgs = {
  text?: string;
  blocksText?: string;
  untilText?: string;
  translator: IStatusFormulaTranslator;
  row: row;
};

/**
 * Arguments for BLOCKED_UNTIL node creation
 */
export type BlockedArgs = {
  text?: string;
  blockedText?: string;
  untilText?: string;
  translator: IStatusFormulaTranslator;
  row: row;
  calculated?: boolean;
};
