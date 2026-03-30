# MEMORY.md
# Persistent Coordination Memory for LocalPDF V6 (Codex / LLM)

## 0. Purpose

This file is a **shared memory layer** for agent coordination inside the LocalPDF V6 repository.

It is used to:

- persist task context across agent runs
- avoid re-analysis of the same problem
- store decisions made by the coordinator
- track partial progress
- enable safe multi-step workflows

This is NOT documentation.  
This is NOT architecture.  
This is NOT a dump of logs.

This is **structured working memory**.

---

## 1. Core Principles

### 1.1 Memory Is Selective
Only store:

- decisions that affect future work
- known constraints discovered during work
- partial progress that will be resumed
- coordination context between agents

Do NOT store:

- raw logs
- full file contents
- long outputs
- redundant summaries

---

### 1.2 Memory Is Minimal
Prefer:

- short entries
- structured bullets
- references to files instead of copying content

---

### 1.3 Memory Is Action-Oriented
Every entry should answer:

- what was decided?
- what is done?
- what remains?
- what must be avoided?

---

## 2. Memory Structure

---

## ACTIVE TASKS

### Task: <short task title>

**Status**: `planned | in-progress | blocked | review | done`

**Owner**:
- coordinator / specialist:<role-name>

**Scope**:
- files:
  - path/to/file.ts
  - path/to/other.ts
- layers:
  - UI / Logic / Core / Services

**Goal**:
- short description of the intended outcome

**Constraints**:
- architecture constraints
- failure rules involved
- performance concerns (if any)

**Progress**:
- [x] step completed
- [ ] step remaining
- [ ] step remaining

**Notes**:
- important observations
- discovered edge cases
- unexpected behavior

**Next Step**:
- the immediate next safe action

---

## DECISIONS

### <decision title>

**Context**:
- what problem triggered the decision

**Decision**:
- what was chosen

**Reasoning**:
- why this path was selected

**Alternatives Rejected**:
- brief list of rejected options

**Impact**:
- what this affects in the system

---

## KNOWN CONSTRAINTS

List constraints discovered during work that are not obvious from architecture:

- VFS adapter behaves differently in Tauri vs Web
- Large PDFs (>100MB) require chunked processing
- Worker memory spikes during X operation
- Specific tool requires sequential execution

Keep these concise and actionable.

---

## RISKS

### <risk title>

**Description**:
- what can go wrong

**Area**:
- UI / Logic / Core / Worker / VFS / Runner

**Severity**:
- low / medium / high / critical

**Mitigation**:
- what should be done to avoid or reduce risk

---

## OUT-OF-SCOPE FINDINGS

List issues discovered but intentionally not fixed:

- <issue description>
- <file/path>
- <why not fixed>

This prevents re-discovery loops.

---

## COMPLETED TASKS

### Task: <short title>

**Result**:
- what changed

**Files**:
- list of changed files

**Validation**:
- what was checked

**Follow-ups**:
- optional next tasks

---

## 3. Coordination Rules

### 3.1 Coordinator Responsibilities

The coordinator:

- writes to MEMORY.md when:
  - task spans multiple steps
  - delegation is used
  - context must persist
- keeps entries clean and updated
- removes outdated or irrelevant entries
- ensures no duplication

---

### 3.2 Specialist Responsibilities

The specialist:

- reads relevant MEMORY.md sections before starting
- does NOT rewrite memory structure
- may append:
  - progress updates
  - discovered constraints
  - risks

---

### 3.3 Update Discipline

- update only relevant sections
- do not rewrite entire file
- do not duplicate entries
- keep edits minimal and precise

---

## 4. Usage Patterns

### 4.1 Multi-Step Tasks

Use MEMORY.md when:

- task cannot be completed in one pass
- multiple agents are involved
- validation spans multiple layers

---

### 4.2 Delegation

Before spawning a specialist:

- coordinator writes task entry

After specialist completes:

- coordinator updates progress
- integrates result

---

### 4.3 Resume Work

When returning to a task:

- read ACTIVE TASKS
- resume from "Next Step"
- do not re-analyze entire problem

---

## 5. Forbidden Memory Patterns

❌ dumping full file content  
❌ copying large outputs  
❌ logging every action  
❌ storing transient debug info  
❌ duplicating architecture rules  
❌ replacing documentation  

Memory must stay **lean and useful**.

---

## 6. Memory Lifecycle

- ACTIVE TASK → COMPLETED TASK
- stale tasks must be removed or archived
- outdated constraints must be cleaned
- risks must be updated or resolved

Memory must reflect **current reality**, not history.

---

## 7. Success Criteria

Memory is correct if:

- agents do not repeat the same analysis
- tasks can be resumed without confusion
- coordination is clear and minimal
- context is preserved without noise

---

## FINAL DIRECTIVE

Memory is a tool for coordination, not accumulation.

If MEMORY.md grows without improving clarity —
👉 it is wrong.

Keep it sharp.
Keep it minimal.
Keep it useful.