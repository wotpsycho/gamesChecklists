# Task/Sub-Task Pattern for Checklists

This pattern allows creating a parent task that tracks multiple sub-tasks using prefix matching and sequential dependencies.

## Pattern Structure

### 1. Header Task (Parent)
The first row acts as a header that links to all sub-tasks:

```json
{
  "Type": "[Category]",
  "Item": "[Task Name]\n[Additional Info]",
  "Area": "",
  "Location": "",
  "Pre-Reqs": "LINKED [Prefix].[Number]:*",
  "Notes": "[Details about the overall task]"
}
```

**Key Features:**
- `Pre-Reqs` uses `LINKED [Prefix].[Number]:*` to match all sub-tasks
- Wildcard `*` matches any sub-task with that prefix
- Shows as active when ANY sub-task is active
- Shows as complete when ALL sub-tasks are complete

### 2. Sub-Tasks (Children)
Subsequent rows are sub-tasks with sequential dependencies:

```json
{
  "Type": "[Sub-Type]",
  "Item": "[Prefix].[Number]: [Step Description]",
  "Area": "[Location if applicable]",
  "Location": "[Details]",
  "Pre-Reqs": "[Previous sub-task Item]",
  "Notes": ""
}
```

**Key Features:**
- Item format: `[Prefix].[Number]: [Description]`
- First sub-task's Pre-Req: Either empty or a real prerequisite
- Subsequent sub-tasks: Pre-Req = previous sub-task's Item name
- Creates a linear chain through all sub-tasks

## Example: Hunt Structure

This was used for FF15:RE Hunts where each hunt has 4 rows:

### Row 1 - Hunt Header
```json
{
  "Type": "Hunt",
  "Item": "Howling Wind of Hunger\nHunt Star x1",
  "Area": "",
  "Location": "",
  "Pre-Reqs": "LINKED H.1:*",
  "Notes": "#1\nLevel: 2\nMarks: 7x Sabertusk\nTime: Any\nGil: 740\nReward: Hi-Elixir"
}
```

### Row 2 - Accept Tip
```json
{
  "Type": "Hunt Tip",
  "Item": "H.1: Accept Tip",
  "Area": "Hammerhead",
  "Location": "Tipster",
  "Pre-Reqs": "",
  "Notes": ""
}
```

### Row 3 - Hunt Mark
```json
{
  "Type": "Hunt Mark",
  "Item": "H.1: 7x Sabertusk",
  "Area": "North of Hammerhead",
  "Location": "Time: Any",
  "Pre-Reqs": "H.1: Accept Tip",
  "Notes": ""
}
```

### Row 4 - Report
```json
{
  "Type": "Hunt Report",
  "Item": "H.1: Report",
  "Area": "",
  "Location": "Tipster",
  "Pre-Reqs": "H.1: 7x Sabertusk",
  "Notes": ""
}
```

## Usage Guidelines

### When to Use This Pattern
- Multi-step processes (quests with multiple stages)
- Collections with tracking steps (find → obtain → turn in)
- Achievement chains (unlock → progress → complete)
- Any task requiring sequential completion tracking

### Naming Conventions

**Prefixes:**
- `H.` - Hunts
- `Q.` - Quests
- `A.` - Achievements
- `C.` - Collections
- Use single letters or short codes for clarity

**Numbers:**
- Sequential numbering: `H.1`, `H.2`, `H.3`
- Maintains order in the list
- Makes it easy to reference specific tasks

### Pre-Req Chain Rules

1. **Header**: `LINKED [Prefix].[Num]:*`
2. **First Sub-task**: Empty or external pre-req
3. **Middle Sub-tasks**: Previous sub-task's Item
4. **Last Sub-task**: Previous sub-task's Item
5. Header auto-tracks based on all sub-tasks

## Benefits

- **Visual Organization**: Header groups related sub-tasks
- **Progress Tracking**: See overall and individual progress
- **Smart Dependencies**: LINKED syntax handles complex tracking
- **Flexible**: Add/remove sub-tasks without breaking the chain
- **Scalable**: Works for 2 sub-tasks or 20+

## Template for New Tasks

```javascript
// Header
{
  Type: "[MainType]",
  Item: "[Name]\n[Extra]",
  Area: "",
  Location: "",
  "Pre-Reqs": "LINKED [P].[N]:*",
  Notes: "[Summary]"
}

// Sub-task 1
{
  Type: "[SubType1]",
  Item: "[P].[N]: [Step1]",
  Area: "[Area1]",
  Location: "[Loc1]",
  "Pre-Reqs": "",
  Notes: ""
}

// Sub-task 2
{
  Type: "[SubType2]",
  Item: "[P].[N]: [Step2]",
  Area: "[Area2]",
  Location: "[Loc2]",
  "Pre-Reqs": "[P].[N]: [Step1]",
  Notes: ""
}

// Add more sub-tasks as needed...
```

## Tips

- Keep Item names consistent for Pre-Req matching
- Use descriptive sub-task names
- Group related tasks with the same prefix
- Document prefix meanings in your checklist
- Test the LINKED syntax with a small example first
