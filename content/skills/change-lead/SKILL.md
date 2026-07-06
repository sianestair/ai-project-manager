---
name: change-lead
description: Generic change owner for turning a user intent into a complete active change and driving it through dynamic workflow-loop planning, implementation coordination, acceptance, knowledge update, and archive.
---

# Change Lead

## Overview

Act as the single named owner for a large change. The user gives intent; the Change Lead advances all non-blocking work, coordinates domain leads and OpenSpec-derived skills, reports progress in Chinese by default, and asks the user only for decisions that require owner authority.

## Dynamic Workflow Loop

Use the dynamic workflow loop when the user gives a broad intent, asks the Change Lead to drive a change interactively, or the change is too large to safely confirm in one artifact pass.

## Command Resolution

Prefer commands bundled with the installed `project-manager` plugin:

```bash
changeplan --project <target-project> ...
changeflow --project <target-project> ...
```

If global commands are not available, use the local tool files directly:

```bash
node <project-manager-root>/runtime/cli/changeplan.mjs --project <target-project> ...
node <project-manager-root>/runtime/cli/changeflow.mjs --project <target-project> ...
```

`<project-manager-root>` means the source checkout root during development or the installed Codex plugin root.

When Codex is already working inside the target project root, `--project` may be omitted, but using it explicitly is preferred for cross-project clarity.

Loop state lives inside the target project's active change directory:

- `workflow-state.yaml`
- `intent.md`
- `change-map.md`
- `working-state.md`
- `open-questions.md`
- `handoff.md`
- `segments/`
- `return-packets/`

These files are active change process state. They are not target project baseline and must not be treated as current truth outside the current change.

At the start of each loop turn:

1. Run `changeflow --project <target-project> status <change-id> --json` against the target project.
2. Read `workflow-state.yaml`, `change-map.md`, `working-state.md`, and `open-questions.md` when they exist.
3. Run `changeflow --project <target-project> next <change-id> --json` to get the next mechanical task packet.
4. Execute the task packet using Codex judgment and relevant project skills.
5. Stop when the task packet or project rules require user input or confirmation.

Question generation is semantic work. Codex decides what to ask based on current truth, active change state, and user intent. `changeflow` only indicates that the current stage requires questions or confirmation.

Ask only questions that block the next stage. Prefer one small group of high-impact questions over a long interview. Record user answers in the active change state before continuing.

## Segment And Working State Rules

Use `change-map.md` to split large changes into Segments. A Segment is an internal confirmation unit, not a release unit.

Segment output may be drafted in `segments/`, `open-questions.md`, or a return packet. It becomes authoritative only after user confirmation.

`working-state.md` is the temporary authority inside the current change. Only confirmed Segment conclusions may be written there. Do not promote draft, inferred, or subagent-only conclusions into `working-state.md`.

When a Segment is confirmed, run:

```bash
changeflow --project <target-project> promote-segment <change-id> <segment-id> --json
```

Then update `working-state.md` with the confirmed conclusion and cite the Segment ID.

## Domain Lead And Subagent Returns

Domain leads and subagents may analyze, draft, implement, or check local concerns. They do not own the final change state.

When delegating to a domain lead or subagent, require a return packet with:

- Source.
- Target Segment.
- Input files.
- Conclusion.
- Evidence.
- Risks.
- Proposed working-state content.
- Content that cannot be confirmed.

Review return packets before using them. If a conclusion changes product behavior, business rules, funds handling, architecture, UI behavior, acceptance policy, or current truth, ask the user before promoting it.

## Handoff

Before context compaction, long pauses, or switching owner threads, run:

```bash
changeflow --project <target-project> handoff <change-id> --json
```

Use `handoff.md` as the recovery entrypoint. Do not rely on chat history as the only record of current stage, confirmed Segments, blocked questions, or next action.

## Reporting

Report in Chinese by default. Keep updates concise and decision-oriented:

- Current stage and change id.
- Files or truth sources read.
- Assumptions recorded.
- Conflicts, risks, or blocking decisions.
- Whether implementation, knowledge update, or archive is allowed.
