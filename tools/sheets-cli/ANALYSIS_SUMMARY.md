# Ni No Kuni Checklists Analysis Summary

## Overview

This document summarizes the comprehensive analysis of the Ni No Kuni and Ni No Kuni 2 checklists to identify and document prerequisite patterns used in the Games Checklists system.

**Date**: 2026-02-04
**Checklists Analyzed**:
- Ni No Kuni (Remastered) - 100+ items
- Ni No Kuni 2: Revenant Kingdom (Prince's Edition) - 100+ items

## Analysis Methodology

1. **Data Extraction**: Used Google Sheets API to fetch real checklist data (columns B:G)
2. **Source Code Review**: Examined `/src/availability/` directory to understand pattern implementation
3. **Pattern Identification**: Analyzed Pre-Reqs column for all special keywords and patterns
4. **Documentation Creation**: Created comprehensive reference with real examples

## Patterns Discovered

### 1. LINKED Pattern

**Frequency**: Very High (used extensively in Ni No Kuni 2)

**Purpose**: Parent-child task tracking

**Real Examples Found**:
```
"Chapter 1: The Fall of the House of Tildrum" → LINKED S.1-*
"S.1-1: New Horizons" → LINKED Roland and Evan Meet, Confront Guards
"S.2-3: To Tani's Rescue" → LINKED Wyvern Warlord, Rescue Tani
```

**Key Finding**: Ni No Kuni 2 uses systematic naming:
- Chapters: `Chapter X: Name` with `LINKED S.X-*`
- Main Story: `S.X-Y: Name` with `LINKED` sub-tasks
- Sub-tasks follow sequential prerequisites

### 2. USES Pattern

**Frequency**: High (critical game mechanic in Ni No Kuni 1)

**Purpose**: Track consumable heart pieces (Enthusiasm, Kindness, Courage, etc.)

**Real Examples Found**:
```
"Restore Guard's Enthusiasm" → USES *Enthusiasm 1
"Restore King Tom's Enthusiasm" → USES *Enthusiasm 2
"Restore Rusty's Kindness" → USES *Kindness 1
"Restore Esther's Courage" → USES *Courage 1
"Restore Queen Lowlah's Restraint" → USES *Restraint 1
```

**System Design**:
- Players collect "Piece of Heart" items (7 types of emotions)
- Each type has 6-7 collectible instances
- Story requires using 1-2 of each type
- Optional NPCs also need heart pieces
- USES prevents over-consumption

**Resource Types Found**:
- Enthusiasm (7 total: 2 story, 5 optional)
- Kindness (6 total: 1 story, 5 optional)
- Courage (6 total: 1 story, 5 optional)
- Restraint (7 total: 2 story, 5 optional)
- Belief (6 total: 1 story, 5 optional)
- Confidence (3+ found)
- Love (1+ found)
- Ambition (1+ found)

### 3. OPTION Pattern

**Frequency**: Medium

**Purpose**: Mutually exclusive choices

**Real Examples Found**:
```
"Serenade a Familiar" (choice point)
  → "Shonky-Honker" with OPTION Serenade a Familiar
  → "Boggly-Boo" with OPTION Serenade a Familiar
  → "Lagoon Naiad" with OPTION Serenade a Familiar
```

**Finding**: Used for permanent choices (familiar selection) where only one can be chosen.

### 4. BLOCKS Pattern

**Frequency**: Medium-High (critical for story gating)

**Purpose**: Prevent accessing areas/content until story progresses

**Real Examples Found**:
```
"Board Sea Cow" → BLOCKS UNLESS Region=Teeheeti|"" UNLESS Location=*Evolve* UNTIL Board Repaired Sea Cow

"Porco Grosso" → BLOCKS
... UNLESS (Area=Hamelin|Pig Iron Plain|Ghostly Gorge|Tombstone Trail EXCEPT Type=Errand*|Bounty*|Piece of Heart)
... UNLESS Region=""
... UNLESS Location=*Evolve*
... UNTIL Restore Marcassin's Belief

"Black Knight" → BLOCKS Area!Ding Dong Well UNTIL Chapter 8:*

"Shadar 2" → BLOCKS Type=*Chest|Familiar* WITH Area=Nevermore|Miasma* UNLESS Location=*Evolve* UNTIL Zodiarch
```

**Key Finding**: BLOCKS uses sophisticated column filtering:
- Wildcard matching: `Type=*Chest|Familiar*`
- Area/Region filtering: `Area=Hamelin|Pig Iron`
- Exception clauses: `EXCEPT Type=Errand*`
- Additional filters: `WITH Area=Nevermore`
- Column negation: `Area!Ding Dong Well`

### 5. MISSED Pattern

**Frequency**: Not found in analyzed data (but supported by code)

**Purpose**: Mutual exclusivity for story branches

**Note**: While not found in the Ni No Kuni games, the pattern is fully implemented and documented.

### 6. PERSIST Pattern

**Frequency**: Not found in analyzed data

**Purpose**: Keep items checked through resets

### 7. CHECKED/INITIAL Pattern

**Frequency**: Not found in analyzed data

**Purpose**: Items start in checked state

### 8. Boolean and Comparison Operators

**Examples Found**:
```
"Complete Test of Wits
Complete Test of Friendship" (implicit AND)

"Moon Stone && Sun Stone && Star Stone" (explicit AND)

"Enthusiasm* == Pre-Reqs!USES 1x Enthusiasm" (special syntax)
```

## Meta Sheet Analysis

### Ni No Kuni 1 Metadata

**Type Hierarchy**:
- Story (parent)
- Boss
- Game Complete
- Piece of Heart
- Familiar
- Chest types
- Errand types
- Bounty types

**Area Hierarchy**:
- Region → Specific Areas → Locations
- Examples: Summerlands → Ding Dong Dell → specific streets/buildings

### Ni No Kuni 2 Metadata

**Type Hierarchy**:
- Chapter (parent)
- Main Story
- Story Task
- Boss
- Side Quest types
- Citizen types
- Facility types

**Area Hierarchy**:
- Region → Area → Location
- Examples: Rolling Hills → Ding Dong Dell Castle → specific rooms

## Code Implementation Findings

### Node Classes

All patterns are implemented as specialized node classes in `/src/availability/nodes/`:

1. **UsesFormulaNode** (`special/UsesFormulaNode.ts`)
   - Tracks consumable items across the checklist
   - Calculates available = total - used
   - Marks items as PR_USED when insufficient

2. **OptionFormulaNode** (`special/OptionFormulaNode.ts`)
   - Handles mutually exclusive choices
   - Supports virtual choices (no matching item)
   - Validates minimum 2 options per choice

3. **MissedFormulaNode** (`constraint/MissedFormulaNode.ts`)
   - Creates mutual exclusivity
   - Marks referenced items as MISSED

4. **BlocksUntilFormulaNode** (`blocking/BlocksUntilFormulaNode.ts`)
   - Blocks items matching pattern until condition
   - Auto-generates BLOCKED clauses on affected items
   - Supports complex column filtering

5. **LinkedFormulaNode** (`root/LinkedFormulaNode.ts`)
   - Creates parent-child relationships
   - Checkbox is formula-driven (disabled)
   - Available when any child is available

### Parser Architecture

**CellFormulaParser** (`CellFormulaParser.ts`):
- Singleton pattern: one parser per checklist row
- Processes Pre-Reqs text line-by-line
- Identifies special prefixes using regex
- Creates node tree structure
- Generates status formulas

**Parsing Flow**:
1. Split Pre-Reqs by newline/semicolon
2. Handle line continuation (`...`)
3. Identify special flags (LINKED, CHECKED, PERSIST)
4. Parse each line for prefix patterns
5. Create appropriate node type
6. Build node tree
7. Generate formula

### Formula Generation

**StatusFormulaTranslator** (`StatusFormulaTranslator.ts`):
- Singleton pattern per checklist
- Generates all status formulas
- Validates dependencies
- Adds hyperlinks to pre-reqs
- Creates hover notes for missable items

**Formula Types Generated**:
- `toPreReqsMetFormula()` - Are prerequisites met?
- `toPRUsedFormula()` - Are prerequisites used by others?
- `toMissedFormula()` - Is item missed?
- `toUnknownFormula()` - Circular dependency check
- `toStatusFormula()` - Main status formula (IFS)

## Documentation Deliverables

### 1. PREREQ_PATTERNS.md

**Created**: `/Users/Brycen/dev/gamesChecklists/tools/sheets-cli/PREREQ_PATTERNS.md`

**Contents**:
- Comprehensive reference for all prerequisite patterns
- Real examples from Ni No Kuni checklists
- Detailed syntax documentation
- Use cases and best practices
- Complex pattern combinations
- Error messages and debugging tips

**Sections**:
1. Basic Prerequisites
2. LINKED Pattern
3. USES Pattern
4. OPTION Pattern
5. MISSED Pattern
6. BLOCKS Pattern
7. BLOCKED Pattern
8. PERSIST Pattern
9. CHECKED/INITIAL Pattern
10. OPTIONAL Pattern
11. Boolean Operators
12. Comparison Operators
13. Pattern Combinations

### 2. Updated .claude.md

**Updated**: `/Users/Brycen/dev/gamesChecklists/tools/sheets-cli/.claude.md`

**Changes**:
- Added "Prerequisite Patterns" section with quick reference
- Linked to new PREREQ_PATTERNS.md
- Summarized all major patterns
- Added real-world use cases

### 3. Updated CLAUDE.md

**Updated**: `/Users/Brycen/dev/gamesChecklists/CLAUDE.md`

**Changes**:
- Expanded "Prerequisites System" section
- Added all special keywords with documentation
- Added boolean and comparison operators
- Added advanced patterns section
- Included real-world example combinations
- Referenced comprehensive documentation

## Key Insights

### Pattern Usage by Game

**Ni No Kuni 1** (Classic JRPG):
- Heavy use of USES for heart piece mechanics
- Complex BLOCKS for story progression
- Boss battles with LINKED tracking
- Rich prerequisite chains

**Ni No Kuni 2** (Kingdom Building):
- Systematic LINKED structure for chapters/quests
- Story tasks with sequential dependencies
- USES for items (Red Red Rose, Incineraptor's Horn, etc.)
- Citizen/Facility tracking with prerequisites

### Pattern Sophistication

The prerequisite system is remarkably sophisticated:
- **Resource Tracking**: USES handles consumable management elegantly
- **Story Gating**: BLOCKS with complex filtering prevents sequence breaking
- **Task Hierarchy**: LINKED provides clean multi-level tracking
- **Formula Generation**: All patterns compile to Google Sheets formulas
- **Error Detection**: Validates circular dependencies, missing items, missable conflicts

### Design Strengths

1. **Declarative Syntax**: Readable pre-req text generates complex formulas
2. **Automatic Calculation**: Formulas update in real-time as items checked
3. **Visual Feedback**: Color-coded status (Available, Missed, PR_USED, etc.)
4. **Clickable Links**: Pre-req names become hyperlinks to rows
5. **Error Prevention**: Validates patterns before generating formulas

## Recommendations

### For Users

1. **Use LINKED extensively**: Clean way to track multi-step processes
2. **USES for resources**: Perfect for limited consumables
3. **BLOCKS for story gates**: Prevent accessing content too early
4. **OPTION for choices**: Better than MISSED for explicit alternatives
5. **Test complex patterns**: Use small checklists to validate

### For Development

1. **Add more examples**: Include more real-world pattern combinations in docs
2. **Visual guide**: Consider adding flowcharts for complex patterns
3. **Pattern templates**: Provide copy-paste templates for common use cases
4. **Interactive tutorial**: In-app guide for prerequisite patterns
5. **Pattern validator**: Tool to validate Pre-Reqs syntax before saving

## Conclusion

The Ni No Kuni checklists demonstrate the full power and flexibility of the Games Checklists prerequisite system. The patterns are well-designed, well-implemented, and handle complex game mechanics elegantly.

The new documentation (PREREQ_PATTERNS.md) provides a comprehensive reference with real examples, making it much easier for users to understand and use these powerful features.

All deliverables have been created and updated as requested.
