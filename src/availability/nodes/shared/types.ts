import type { row, column } from '../../types';
import type { RowCounts } from '../../interfaces';

/**
 * Information about a virtual item created by special node types
 */
export type virtualValueInfo = {
  column: column;
  item: string;
  count: number;
  num?: number;
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
  text: string;
  item: string;
  row: row;
  isBlocking: boolean;
};

/**
 * Arguments for BLOCKED_UNTIL node creation
 */
export type BlockedArgs = {
  text: string;
  item: string;
  row: row;
  isBlocked: boolean;
};
