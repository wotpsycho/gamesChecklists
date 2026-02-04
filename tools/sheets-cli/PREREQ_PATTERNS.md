# Prerequisite Patterns Reference

This document provides a comprehensive reference for all prerequisite patterns supported by the Games Checklists system, with real examples from the Ni No Kuni checklists.

## Table of Contents

1. [Basic Prerequisites](#basic-prerequisites)
2. [LINKED Pattern](#linked-pattern)
3. [USES Pattern](#uses-pattern)
4. [OPTION Pattern](#option-pattern)
5. [MISSED Pattern](#missed-pattern)
6. [BLOCKS Pattern](#blocks-pattern)
7. [BLOCKED Pattern](#blocked-pattern)
8. [PERSIST Pattern](#persist-pattern)
9. [CHECKED/INITIAL Pattern](#checkedinitial-pattern)
10. [OPTIONAL Pattern](#optional-pattern)
11. [Boolean Operators](#boolean-operators)
12. [Comparison Operators](#comparison-operators)
13. [Pattern Combinations](#pattern-combinations)

---

## Basic Prerequisites

### Simple Item Reference

Items can reference other items by their exact name. The prerequisite must be checked before the current item becomes available.

**Examples from Ni No Kuni:**
```
Pre-Reqs: "Meet Drippy"
Pre-Reqs: "Get Wizard's Companion"
Pre-Reqs: "Enter A New World"
```

### Multiple Prerequisites (AND logic)

List multiple items separated by newlines. ALL must be checked for the item to become available.

**Example from Ni No Kuni:**
```
Pre-Reqs: "Complete Test of Wits
Complete Test of Friendship"
```

### Wildcard Matching

Use `*` as a wildcard to match multiple items.

**Example from Ni No Kuni:**
```
Pre-Reqs: "Enthusiasm*"
```
This matches "Enthusiasm 1", "Enthusiasm 2", "Enthusiasm 3", etc.

### Row References

Reference items by their row number using `$[row]` syntax.

**Example:**
```
Pre-Reqs: "$45"
```

---

## LINKED Pattern

The `LINKED` keyword creates a parent-child relationship where a header item tracks the status of multiple sub-tasks.

### How It Works

- **Header Item**: Uses `LINKED [pattern]` in Pre-Reqs
- **Checkbox Behavior**: Header checkbox is auto-calculated (disabled)
- **Status**:
  - AVAILABLE when ANY linked item is available
  - CHECKED when ALL linked items are checked

### Basic Syntax

```
LINKED [item pattern]
```

### Examples from Ni No Kuni

**Story Quest with Sub-Tasks:**
```
Item: "S.1-1: New Horizons"
Pre-Reqs: "LINKED
Roland and Evan Meet
Confront Guards"
```

**Chapter Header:**
```
Item: "Chapter 1: The Fall of the House of Tildrum"
Pre-Reqs: "LINKED S.1-*"
```
Matches all items starting with "S.1-" (S.1-1, S.1-2, etc.)

**Boss Battle Tracker:**
```
Item: "Complete Test of Strength
Complete Trials"
Pre-Reqs: "LINKED Bashura"
```
Automatically checks when the boss is defeated.

### Usage Patterns

1. **Sequential Sub-Tasks**: Track multi-step processes
   ```
   Header: LINKED Step*
   Step 1: [prerequisite]
   Step 2: Step 1
   Step 3: Step 2
   ```

2. **Wildcard Matching**: Track related items
   ```
   LINKED H.1:*    (all items starting with "H.1:")
   LINKED S.2-*    (all items starting with "S.2-")
   ```

3. **Boss Victory Tracking**: Auto-check when boss is defeated
   ```
   Story: LINKED [Boss Name]
   ```

---

## USES Pattern

The `USES` keyword tracks consumable resources that can be used multiple times across different items. It ensures you don't consume more of a resource than you have available.

### How It Works

- Tracks total available quantity of an item
- Counts how many times the item is consumed across all checklist items
- Marks items as PR_USED (prerequisites used) if insufficient quantity remains
- Shows item as missable if total uses exceed total available

### Syntax

```
USES [number]x [item name]
USES [item name] [number]
USES [item name]    (defaults to 1)
```

### Examples from Ni No Kuni

**Single Use:**
```
Pre-Reqs: "USES *Enthusiasm 1"
Pre-Reqs: "USES *Kindness 1"
Pre-Reqs: "USES *Courage 1"
```

**Multiple Uses:**
```
Pre-Reqs: "USES 2x *Enthusiasm"
Pre-Reqs: "USES *Enthusiasm 2"
```

**Complex Use Case:**
```
Pre-Reqs: "USES Holy Wood"
Pre-Reqs: "USES Carved Holy Wood"
Pre-Reqs: "USES Flower of Youth
USES Flower of Faith
USES Flower of Hope"
```

### Real-World Example: Enthusiasm System

In Ni No Kuni, you collect "Piece of Heart" items (Enthusiasm, Kindness, etc.) and use them to restore emotions to characters.

**Collecting Enthusiasm:**
```
Item: "(Story) Enthusiasm 1"
Pre-Reqs: "LINKED Get Enthusiasm from Guard"

Item: "(Story) Enthusiasm 2"
Pre-Reqs: "LINKED Get Enthusiasm from Tommy"

Item: "Enthusiasm 3"
Pre-Reqs: "Enthusiasm* == Pre-Reqs!USES 1x Enthusiasm
Hickory Dock"
```

**Using Enthusiasm:**
```
Item: "Restore Guard's Enthusiasm"
Pre-Reqs: "USES *Enthusiasm 1"

Item: "Restore King Tom's Enthusiasm"
Pre-Reqs: "USES *Enthusiasm 2"
```

### How Tracking Works

1. System identifies all items with "Enthusiasm" in the name
2. Counts total available (e.g., 7 Enthusiasm items collected)
3. Counts total uses across all USES statements (e.g., 2 used)
4. Calculates available = collected - used
5. Marks items as PR_USED if available < needed

### Notes on USES

- The `*` wildcard is often used to match multiple sources: `USES *Enthusiasm 1`
- You can collect multiple instances of the same resource
- Items become missable if you don't collect enough before using them all
- USES works with numeric quantities: `USES 3x Potion` requires 3 potions

---

## OPTION Pattern

The `OPTION` keyword creates mutually exclusive choices where only one option from a group can be selected.

### How It Works

- Multiple items share the same OPTION identifier
- Checking one option marks the others as PR_USED (not chosen)
- All options must have at least 2 alternatives
- Options can reference an actual item or use a virtual identifier

### Syntax

```
OPTION [Choice ID]
```

### Examples from Ni No Kuni

**Familiar Selection (Virtual Choice):**
```
Item: "Serenade a Familiar"
Pre-Reqs: "Complete Trials"

Item: "Shonky-Honker"
Type: "Option:"
Pre-Reqs: "OPTION Serenade a Familiar"

Item: "Boggly-Boo"
Type: "Option:"
Pre-Reqs: "OPTION Serenade a Familiar"

Item: "Lagoon Naiad"
Type: "Option:"
Pre-Reqs: "OPTION Serenade a Familiar"
```

In this example:
- "Serenade a Familiar" is the choice identifier
- Three mutually exclusive options are available
- Selecting one marks the others as PR_USED

### Virtual vs Item-Based Choices

**Virtual Choice** (identifier doesn't match an item):
```
OPTION "Yes or No?"
```

**Item-Based Choice** (identifier matches an existing item):
```
OPTION "Serenade a Familiar"
```
When using an item-based choice, checking an option also checks the parent item.

### Usage Notes

- At least 2 options required per choice
- Options inherit prerequisites from their choice item
- Can add additional prerequisites to specific options
- Useful for:
  - Character recruitment choices
  - Story branch decisions
  - Reward selections
  - Mutually exclusive paths

### Deprecated Alias

`CHOICE` is a deprecated alias for `OPTION` and works identically.

---

## MISSED Pattern

The `MISSED` keyword creates mutual exclusivity between items. If an item with a MISSED prerequisite is checked, the referenced item becomes permanently unavailable.

### How It Works

- Marks the referenced item as MISSED status when the current item is checked
- Creates "either/or" scenarios
- The missed item cannot be completed in this playthrough

### Syntax

```
MISSED [item name]
```

### Use Cases

- Branching story paths
- Mutually exclusive quests
- Items that lock out others
- Alternative solutions

### Example Usage

```
Item: "Kill the Boss"
Pre-Reqs: "MISSED Spare the Boss"

Item: "Spare the Boss"
Pre-Reqs: "MISSED Kill the Boss"
```

Only one can be completed; checking one marks the other as MISSED.

### Notes

- Items with MISSED prerequisites are highlighted as "missable"
- Shows warning in Pre-Reqs cell: "Possible to miss Pre-Reqs"
- Different from OPTION: MISSED doesn't require all alternatives to exist
- Can be combined with other prerequisites

---

## BLOCKS Pattern

The `BLOCKS` keyword temporarily blocks other items from becoming available until a condition is met.

### How It Works

- Blocks matching items from being available
- Automatically adds BLOCKED clause to affected items
- Items remain blocked until the UNTIL condition is satisfied
- Useful for gating content by story progress

### Syntax

```
BLOCKS [item pattern] UNTIL [condition]
```

### Components

- **Pattern**: Which items to block (can use wildcards, column filters)
- **UNTIL**: Condition that must be true to unblock items

### Examples from Ni No Kuni

**Block by Area:**
```
Pre-Reqs: "Board Sea Cow
BLOCKS UNLESS Region=Teeheeti|\"\" UNLESS Location=*Evolve* UNTIL Board Repaired Sea Cow"
```
Blocks all items except those in Teeheeti or with Location containing "Evolve" until ship is repaired.

**Block by Type:**
```
Pre-Reqs: "Porco Grosso
BLOCKS
... UNLESS (Area=Hamelin|Pig Iron Plain|Ghostly Gorge|Tombstone Trail EXCEPT Type=Errand*|Bounty*|Piece of Heart)
... UNLESS Region=\"\"
... UNLESS Location=*Evolve*
... UNTIL Restore Marcassin's Belief"
```
Complex blocking with multiple exceptions.

**Block Specific Items:**
```
Pre-Reqs: "Black Knight
BLOCKS Area!Ding Dong Well UNTIL Chapter 8:*"
```
Blocks items in "Ding Dong Well" area until Chapter 8.

**Block with Boss:**
```
Pre-Reqs: "Shadar 2
BLOCKS Type=*Chest|Familiar* WITH Area=Nevermore|Miasma* UNLESS Location=*Evolve* UNTIL Zodiarch"
```
Blocks chests and familiars in certain areas until final boss.

### Column Filters

**Syntax:**
- `Column=Value` - Exact match
- `Column=Value1|Value2` - OR match
- `Column=Value*` - Wildcard match
- `Column!Value` - NOT match (exclude this column)
- `EXCEPT Column=Value` - Except items matching
- `WITH Column=Value` - Additional filter

**Examples:**
```
BLOCKS Type=Quest           # Block all quests
BLOCKS Area=City*           # Block all areas starting with "City"
BLOCKS Region=Summer|Winter # Block Summer or Winter regions
BLOCKS * EXCEPT Type=Story  # Block all except Story type
```

### Multi-line BLOCKS Syntax

Use `...` to continue on the next line:

```
Pre-Reqs: "Porco Grosso
BLOCKS
... UNLESS (Area=Hamelin|Pig Iron Plain)
... UNLESS Region=\"\"
... UNTIL Restore Marcassin's Belief"
```

### Notes

- BLOCKS must depend on the current item (directly or indirectly)
- UNTIL condition cannot be missable
- System automatically generates BLOCKED prerequisites on affected items
- Use `*` to block all items: `BLOCKS * UNTIL [condition]`

---

## BLOCKED Pattern

The `BLOCKED` keyword explicitly marks an item as blocked until a condition is met. Usually generated automatically by BLOCKS, but can be used manually.

### Syntax

```
BLOCKED [condition] UNTIL [unblock condition]
```

### Example

```
Pre-Reqs: "BLOCKED Area=Dungeon UNTIL Get Key"
```

### Notes

- Typically auto-generated by BLOCKS statements
- Can be used manually for specific item blocking
- Less common than BLOCKS in practice

---

## PERSIST Pattern

The `PERSIST` keyword keeps an item checked even when the checklist is reset.

### How It Works

- Item remains checked through checklist resets
- Useful for permanent unlocks or one-time achievements
- Must be on its own line

### Syntax

```
PERSIST
```

### Example

```
Pre-Reqs: "PERSIST
Unlock Fast Travel"
```

### Use Cases

- Permanent ability unlocks
- One-time collectibles
- Story milestones that don't reset
- Tutorial completions

---

## CHECKED/INITIAL Pattern

The `CHECKED` or `INITIAL` keyword marks an item as initially checked when the checklist is created or reset.

### How It Works

- Item starts in checked state
- Useful for default states or tutorial completions
- Must be on its own line

### Syntax

```
CHECKED
```
or
```
INITIAL
```

### Example

```
Pre-Reqs: "CHECKED"
```

### Use Cases

- Items that start completed
- Default character abilities
- Tutorial steps
- Initial equipment

---

## OPTIONAL Pattern

The `OPTIONAL` keyword marks prerequisites that are not required but enhance the item.

### Syntax

```
OPTIONAL [prerequisites]
```

### Use Cases

- Bonus objectives
- Optional requirements
- Enhanced rewards

---

## Boolean Operators

### AND

Multiple prerequisites on separate lines are implicitly AND'd together.

**Example:**
```
Pre-Reqs: "Complete Test of Wits
Complete Test of Friendship"
```
Both must be checked.

**Explicit AND:**
```
Pre-Reqs: "Item A AND Item B"
```

### OR

Use `OR` keyword for alternative prerequisites.

**Example:**
```
Pre-Reqs: "Path A OR Path B"
```
Either one can be checked.

### NOT

Use `NOT` or `!` to negate a condition.

**Example:**
```
Pre-Reqs: "NOT Boss Defeated"
Pre-Reqs: "!Boss Defeated"
```

### Parentheses

Group operations with parentheses.

**Example:**
```
Pre-Reqs: "(Item A OR Item B) AND Item C"
```

---

## Comparison Operators

### Numeric Comparisons

**Greater Than (GT):**
```
Pre-Reqs: "Level GT 10"
```

**Greater Than or Equal (GTE):**
```
Pre-Reqs: "Level GTE 10"
```

**Less Than (LT):**
```
Pre-Reqs: "Level LT 20"
```

**Less Than or Equal (LTE):**
```
Pre-Reqs: "Level LTE 20"
```

**Equal (EQ):**
```
Pre-Reqs: "Chapter EQ 5"
```

**Not Equal (NE):**
```
Pre-Reqs: "Chapter NE 1"
```

### Count Comparisons

Check if a certain number of items are checked:

```
Pre-Reqs: "3x Quest*"
```
Requires 3 quests (matching "Quest*") to be checked.

---

## Pattern Combinations

### Complex Real-World Examples

**1. Multi-Step Quest with LINKED and Sequential Prerequisites:**
```
Item: "S.3-4: A Nationwide Scandal"
Pre-Reqs: "LINKED
Check Lady Luck Statue
Talk with Niall
Search for Evidence
Mossy Monument
Confront Master Pugnacius"

Item: "Check Lady Luck Statue"
Pre-Reqs: "S.3-3: Meeting Master Pugnacius"

Item: "Talk with Niall"
Pre-Reqs: "Check Lady Luck Statue"

Item: "Search for Evidence"
Pre-Reqs: "Quicken Growth"

Item: "Mossy Monument" (Boss)
Pre-Reqs: "Search for Evidence"

Item: "Confront Master Pugnacius"
Pre-Reqs: "LINKED Longfang"

Item: "Longfang" (Boss)
Pre-Reqs: "Mossy Monument"
```

**2. USES with Resource Management:**
```
Item: "Return Rose to Boddly"
Pre-Reqs: "USES Red Red Rose"

Item: "Return Horn to Boddly"
Pre-Reqs: "USES Incineraptor's Horn"

Item: "Return Starlight Stone to Boddly"
Pre-Reqs: "USES Starlight Stone"
```

**3. BLOCKS with Complex Filtering:**
```
Item: "Porco Grosso"
Pre-Reqs: "Get Disguises in Black Market
BLOCKS
... UNLESS (Area=Hamelin|Pig Iron Plain|Ghostly Gorge|Tombstone Trail EXCEPT Type=Errand*|Bounty*|Piece of Heart)
... UNLESS Region=\"\"
... UNLESS Location=*Evolve*
... UNTIL Restore Marcassin's Belief"
```

**4. OPTION with Multiple Choices:**
```
Item: "Serenade a Familiar"
Pre-Reqs: "Complete Trials"

Item: "Shonky-Honker"
Pre-Reqs: "OPTION Serenade a Familiar"

Item: "Boggly-Boo"
Pre-Reqs: "OPTION Serenade a Familiar"

Item: "Lagoon Naiad"
Pre-Reqs: "OPTION Serenade a Familiar"

Item: "Evolve Mite
Unlock Familiar Recruitment & Evolution"
Pre-Reqs: "Serenade a Familiar"
```

**5. USES with Wildcard and Conditions:**
```
Item: "Enthusiasm 3"
Pre-Reqs: "Enthusiasm* == Pre-Reqs!USES 1x Enthusiasm
Hickory Dock"

Item: "Kindness 2"
Pre-Reqs: "Kindness* == Pre-Reqs!USES 1x Kindness
Restore Esther's Courage"
```

---

## Pattern Priority and Processing Order

When multiple patterns are used together, they are processed in this order:

1. **PERSIST** - Marks item as persistent
2. **CHECKED/INITIAL** - Sets initial state
3. **LINKED** - Creates parent-child relationship
4. **Special Prefixes** (USES, OPTION, MISSED, BLOCKS, BLOCKED, OPTIONAL)
5. **Boolean Operators** (AND, OR, NOT)
6. **Comparisons** (GT, LT, EQ, etc.)
7. **Basic Prerequisites** (item references)

---

## Tips and Best Practices

1. **Use LINKED for Multi-Step Processes**: Great for quests with multiple stages
2. **Use USES for Limited Resources**: Track items that can be consumed multiple times
3. **Use OPTION for Mutually Exclusive Choices**: Character recruitment, story branches
4. **Use BLOCKS for Story Gating**: Prevent items from being available too early
5. **Combine Patterns**: LINKED + Sequential prerequisites = clean quest tracking
6. **Use Wildcards Wisely**: `Quest*` matches all quests, `H.1:*` matches all H.1 sub-tasks
7. **Test BLOCKS Carefully**: Ensure UNTIL conditions are achievable
8. **Document Complex Patterns**: Add notes explaining intricate prerequisite chains

---

## Error Messages and Debugging

Common errors and their meanings:

- **"This is the only OPTION for Choice"**: Need at least 2 options per choice
- **"UNTIL clause must depend on this Item"**: BLOCKS must have the blocker as a prerequisite
- **"UNTIL clause cannot be missable"**: BLOCKS condition must always be achievable
- **"LINKED Cannot be in Pre-Req circular dependency"**: Circular dependency detected
- **"Missing UNTIL clause of BLOCKS"**: BLOCKS requires an UNTIL condition

---

## Status Colors

Items display different colors based on their prerequisite status:

- **Green**: CHECKED (completed)
- **Orange**: PR_NOT_MET (prerequisites not yet completed)
- **Purple**: PR_USED (alternative chosen, or resources exhausted)
- **Red**: MISSED (permanently unavailable)
- **Blue**: AVAILABLE (ready to complete)
- **Yellow**: UNKNOWN (circular dependency detected)

---

## Additional Resources

- See `TASK_SUBTASK_PATTERN.md` for detailed LINKED pattern documentation
- See `CLAUDE.md` for system architecture and design patterns
- See source code in `src/availability/` for implementation details
