import type { UsesInfoRegistry, virtualValueInfo } from "./types";

/**
 * Global registry of virtual items created by special node types
 */
export const virtualItems: { [x: string]: virtualValueInfo } = {};

/**
 * Global registry tracking consumable prerequisites (USES)
 * TODO: Make checklist-aware?
 */
export const usesInfo: UsesInfoRegistry = {};
