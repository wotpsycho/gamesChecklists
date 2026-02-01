/**
 * Availability Module - Status formula generation and prerequisite tracking
 *
 * This module handles the parsing, validation, and generation of status formulas
 * that determine item availability based on prerequisites in checklists.
 *
 * Organization:
 * - types.ts, interfaces.ts - Type definitions and contracts
 * - constants.ts - Enums and static values (PHASE, SPECIAL_PREFIXES)
 * - utilities/ - Helper functions for formulas, parsing, and translation
 * - CellFormulaParser.ts - Parses individual cell prerequisites
 * - StatusFormulaTranslator.ts - Main translator class, orchestrates formula generation
 * - nodes/ - Formula AST nodes organized by purpose (see nodes/.claude.md)
 */

// Re-export cell formula parser
export * from "./CellFormulaParser";

// Re-export constants
export * from "./constants";

// Re-export interfaces
export * from "./interfaces";

// Re-export nodes
export * from "./nodes";

// Re-export status formula translator
export * from "./StatusFormulaTranslator";

// Re-export types
export * from "./types";

// Re-export utilities (formula helpers, parser utilities, translator helpers)
export * from "./utilities";
