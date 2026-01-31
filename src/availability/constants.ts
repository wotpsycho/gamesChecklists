export enum SPECIAL_PREFIXES {
  USES     = "USES",
  MISSED   = "MISSED",
  CHOICE   = "CHOICE", // DEPRECATED, alias for OPTION
  OPTION   = "OPTION",
  LINKED   = "LINKED",
  CHECKED  = "CHECKED",
  INITIAL  = "INITIAL",
  OPTIONAL = "OPTIONAL",
  BLOCKS   = "BLOCKS",
  BLOCKED  = "BLOCKED",
  PERSIST  = "PERSIST",
}

export const USAGES = {
  [SPECIAL_PREFIXES.OPTION]: `OPTION Usage:
OPTION [ChoiceID]

-[ChoiceID] is either an Item in the List, or a Unique Identifier for the Choice.

Each ChoiceID must have at least 2 Items that are OPTIONs associated with it, and only 1 can be Checked.
If ChoiceID refers to an Item in the List, Checking an OPTION will Check that Item.
OPTIONs can have additional Pre-Reqs in addition to what are inherited from the Choice's Item.

Example: Item "Yes" and Item "No" both have Pre-Req "OPTION Yes or No?"

NOTE: CHOICE is a deprecated alias for OPTION`
};

export enum PHASE {
  BUILDING = "BUILDING",
  FINALIZING = "FINALIZING",
  FINALIZED = "FINALIZED",
}
